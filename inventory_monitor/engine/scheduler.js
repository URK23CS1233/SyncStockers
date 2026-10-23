// Background monitor: periodically scans every active product whose
// monitor_interval has elapsed. One tick at a time — never overlapping.

const pool = require('../db');
const { runScrape, sleep } = require('./scraper');

const TICK_MS = Number(process.env.MONITOR_TICK_MS) || 15000;
const BATCH = 8;

function startScheduler({ tickMs = TICK_MS, runImmediately = true } = {}) {
    let busy = false;

    const tick = async () => {
        if (busy) return;
        busy = true;
        try {
            const { rows } = await pool.query(
                `SELECT * FROM products
                 WHERE status = 'active'
                   AND (last_checked_at IS NULL
                        OR last_checked_at < now() - make_interval(secs => monitor_interval_sec))
                 ORDER BY last_checked_at ASC NULLS FIRST
                 LIMIT $1`,
                [BATCH]
            );
            for (const p of rows) {
                try {
                    await runScrape(p);
                } catch (err) {
                    console.error(`[scheduler] run failed for product ${p.id}:`, err.message);
                }
                await sleep(250);
            }
        } catch (err) {
            console.error('[scheduler] tick error:', err.message);
        } finally {
            busy = false;
        }
    };

    const interval = setInterval(tick, tickMs);
    if (runImmediately) setTimeout(tick, 1500);

    console.log(`[scheduler] monitoring every ${tickMs / 1000}s (batch ${BATCH})`);
    return () => clearInterval(interval);
}

module.exports = { startScheduler };
