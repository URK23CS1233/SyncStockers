const express = require('express');
const pool = require('../db');

const router = express.Router();

const dayKey = (d) => d.toISOString().slice(0, 10); // UTC — matches to_char() in Postgres

// GET /api/dashboard — everything the overview screen needs in one round-trip
router.get('/', async (req, res) => {
    const uid = req.userId;

    const [products, alertsOpen, lowStock, runs, priceRows, stockDist, runDays, alertsByType, recentRuns, recentAlerts, engine] =
        await Promise.all([
            pool.query(
                `SELECT count(*)::int AS total,
                        count(*) FILTER (WHERE status = 'active')::int AS active
                 FROM products WHERE user_id = $1`,
                [uid]
            ),
            pool.query(
                "SELECT count(*)::int AS open FROM alerts WHERE user_id = $1 AND resolved = false",
                [uid]
            ),
            pool.query(
                `SELECT count(*)::int AS low FROM products
                 WHERE user_id = $1 AND availability IN ('low_stock', 'out_of_stock')`,
                [uid]
            ),
            pool.query(
                `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'success') AS ok
                 FROM (
                   SELECT r.status FROM scrape_runs r
                   JOIN products p ON p.id = r.product_id
                   WHERE p.user_id = $1 ORDER BY r.created_at DESC LIMIT 60
                 ) x`,
                [uid]
            ),
            pool.query(
                `SELECT p.id AS product_id, p.title, p.emoji, p.currency,
                        to_char(h.observed_at, 'YYYY-MM-DD') AS day,
                        AVG(h.price)::float AS avg_price, count(*)::int AS points
                 FROM price_history h
                 JOIN products p ON p.id = h.product_id
                 WHERE p.user_id = $1 AND h.observed_at >= now() - interval '7 days'
                   AND h.price IS NOT NULL
                 GROUP BY p.id, p.title, p.emoji, p.currency, day
                 ORDER BY points DESC, p.id`,
                [uid]
            ),
            pool.query(
                `SELECT availability AS status, count(*)::int AS count
                 FROM products WHERE user_id = $1 GROUP BY availability`,
                [uid]
            ),
            pool.query(
                `SELECT to_char(r.created_at, 'YYYY-MM-DD') AS day, r.status, count(*)::int AS count
                 FROM scrape_runs r
                 JOIN products p ON p.id = r.product_id
                 WHERE p.user_id = $1 AND r.created_at >= now() - interval '7 days'
                 GROUP BY day, r.status ORDER BY day`,
                [uid]
            ),
            pool.query(
                `SELECT type, count(*)::int AS count
                 FROM alerts WHERE user_id = $1 AND resolved = false
                 GROUP BY type ORDER BY count DESC`,
                [uid]
            ),
            pool.query(
                `SELECT r.id, r.product_id, r.status, r.healed, r.duration_ms, r.created_at,
                        p.title, p.emoji, s.name AS site_name
                 FROM scrape_runs r
                 JOIN products p ON p.id = r.product_id
                 JOIN sites s ON s.id = p.site_id
                 WHERE p.user_id = $1
                 ORDER BY r.created_at DESC LIMIT 7`,
                [uid]
            ),
            pool.query(
                `SELECT a.id, a.type, a.severity, a.message, a.created_at,
                        p.id AS product_id, p.title, p.emoji, s.name AS site_name
                 FROM alerts a
                 JOIN products p ON p.id = a.product_id
                 JOIN sites s ON s.id = p.site_id
                 WHERE a.user_id = $1 AND a.resolved = false
                 ORDER BY a.created_at DESC LIMIT 6`,
                [uid]
            ),
            pool.query(
                `SELECT count(*)::int AS total,
                        count(*) FILTER (WHERE source = 'learned')::int AS learned,
                        COALESCE(sum(hits), 0)::int AS hits,
                        COALESCE(sum(misses), 0)::int AS misses,
                        COALESCE(sum(CASE WHEN source = 'learned' THEN hits ELSE 0 END), 0)::int AS learned_hits
                 FROM selectors`
            ),
        ]);

    // ---- price trend: pivot to labels + datasets (prefer INR, else all) ----
    const inrRows = priceRows.rows.filter((r) => r.currency === 'INR');
    const rows = inrRows.length ? inrRows : priceRows.rows;
    const labelsSet = new Set();
    const byProduct = new Map();
    for (const r of rows) {
        labelsSet.add(r.day);
        if (!byProduct.has(r.product_id)) {
            byProduct.set(r.product_id, { product_id: r.product_id, title: r.title, emoji: r.emoji, currency: r.currency, points: {} });
        }
        byProduct.get(r.product_id).points[r.day] = Math.round(r.avg_price * 100) / 100;
    }
    const labels = [...labelsSet].sort();
    const datasets = [...byProduct.values()].slice(0, 4).map((p) => {
        const title = p.title.length > 26 ? `${p.title.slice(0, 24)}…` : p.title;
        const suffix = inrRows.length ? '' : ` (${p.currency})`;
        return {
            product_id: p.product_id,
            label: `${p.emoji} ${title}${suffix}`,
            data: labels.map((d) => (p.points[d] != null ? p.points[d] : null)),
            currency: p.currency,
        };
    });

    const t7 = [];
    for (let i = 6; i >= 0; i -= 1) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        t7.push(dayKey(d));
    }
    const runPivot = { success: [], partial: [], failed: [] };
    const runMap = {};
    for (const r of runDays.rows) {
        (runMap[r.day] = runMap[r.day] || {})[r.status] = r.count;
    }
    for (const day of t7) {
        runPivot.success.push((runMap[day] && runMap[day].success) || 0);
        runPivot.partial.push((runMap[day] && runMap[day].partial) || 0);
        runPivot.failed.push((runMap[day] && runMap[day].failed) || 0);
    }

    const totalRuns = Number(runs.rows[0].total) || 0;
    const okRuns = Number(runs.rows[0].ok) || 0;

    res.json({
        kpis: {
            products: products.rows[0].total,
            activeMonitors: products.rows[0].active,
            openAlerts: alertsOpen.rows[0].open,
            lowStock: lowStock.rows[0].low,
            successRate: totalRuns ? Math.round((okRuns / totalRuns) * 1000) / 10 : null,
            runsSampled: totalRuns,
        },
        priceTrend: { labels, datasets },
        stockDist: stockDist.rows,
        runOutcomes: { labels: t7, ...runPivot },
        alertsByType: alertsByType.rows,
        recentRuns: recentRuns.rows,
        recentAlerts: recentAlerts.rows,
        engine: {
            candidates: engine.rows[0].total,
            learned: engine.rows[0].learned,
            hitRate:
                engine.rows[0].hits + engine.rows[0].misses > 0
                    ? Math.round((engine.rows[0].hits / (engine.rows[0].hits + engine.rows[0].misses)) * 1000) / 10
                    : null,
            evaluations: engine.rows[0].hits + engine.rows[0].misses,
        },
    });
});

module.exports = router;
