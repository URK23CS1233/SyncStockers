// Scrape runner — one monitoring pass for one product.
// Renders the storefront's current HTML, extracts through the dynamic
// selector chain, persists run/history, and raises alerts on change.

const pool = require('../db');
const { renderFixture } = require('./fixtures');
const { extractProduct, CRITICAL_FIELDS } = require('./selectorEngine');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadCandidates(siteId) {
    const { rows } = await pool.query(
        'SELECT * FROM selectors WHERE site_id = $1 AND active = true',
        [siteId]
    );
    const byField = {};
    for (const r of rows) {
        (byField[r.field] = byField[r.field] || []).push(r);
    }
    return byField;
}

async function updateSelectorStats(trace) {
    for (const entry of trace) {
        for (const c of entry.candidates || []) {
            if (!c.candidateId) continue;
            if (c.matched) {
                await pool.query('UPDATE selectors SET hits = hits + 1 WHERE id = $1', [c.candidateId]);
            } else {
                await pool.query('UPDATE selectors SET misses = misses + 1 WHERE id = $1', [c.candidateId]);
            }
        }
    }
}

async function persistLearned(siteId, learned) {
    const persisted = [];
    for (const l of learned) {
        const dup = await pool.query(
            'SELECT id FROM selectors WHERE site_id = $1 AND field = $2 AND pattern = $3',
            [siteId, l.field, l.pattern]
        );
        if (dup.rows.length) continue;
        const { rows } = await pool.query(
            `INSERT INTO selectors (site_id, field, pattern, kind, attr_name, priority, source, hits)
             VALUES ($1, $2, $3, $4, $5, 50, 'learned', 1) RETURNING *`,
            [siteId, l.field, l.pattern, l.kind, l.attr_name]
        );
        persisted.push(rows[0]);
    }
    return persisted;
}

async function raiseAlert({ userId, productId, type, severity, message, details }) {
    const open = await pool.query(
        'SELECT id FROM alerts WHERE product_id = $1 AND type = $2 AND resolved = false',
        [productId, type]
    );
    if (open.rows.length) return null;
    const { rows } = await pool.query(
        `INSERT INTO alerts (user_id, product_id, type, severity, message, details)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [userId, productId, type, severity, message, JSON.stringify(details || {})]
    );
    return rows[0];
}

const fmtMoney = (v, currency) => {
    const n = Number(v);
    if (currency === 'USD') return `$${n.toFixed(2)}`;
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

// Detect changes between previous state and freshly extracted data,
// persist everything, raise alerts. Returns the stored run row.
async function runScrape(product, opts = {}) {
    const {
        updateStats = true,
        createAlerts = true,
        observedAt = new Date(),
        applyDrift = true,
    } = opts;

    const siteRes = await pool.query('SELECT * FROM sites WHERE id = $1', [product.site_id]);
    const site = siteRes.rows[0];
    if (!site) throw new Error(`Site ${product.site_id} not found`);

    const candidatesByField = await loadCandidates(site.id);
    const { html } = renderFixture(site, product, { applyDrift });

    const t0 = Date.now();
    const result = extractProduct(html, { site, candidatesByField });
    const durationMs = Date.now() - t0;
    const ex = result.extracted;

    if (updateStats) await updateSelectorStats(result.trace);
    const learnedRows = await persistLearned(site.id, result.learned);

    // ---- diff against previous observed state -----------------------------
    const prevPrice = product.current_price != null ? Number(product.current_price) : null;
    const prevAvail = product.availability || 'unknown';
    const newPrice = ex.price ? ex.price.value : null;
    const newAvail = ex.availability ? ex.availability.status : prevAvail;
    const newStock = ex.availability && ex.availability.count != null ? ex.availability.count : null;

    const change = {};
    if (newPrice != null && prevPrice != null && Math.abs(newPrice - prevPrice) > 0.009) {
        change.price = { from: prevPrice, to: newPrice };
    }
    if (newAvail && newAvail !== prevAvail) {
        change.availability = { from: prevAvail, to: newAvail };
    }

    const changePct = newPrice != null && prevPrice
        ? Math.round(((newPrice - prevPrice) / prevPrice) * 10000) / 100
        : 0;

    // ---- persist product state -------------------------------------------
    const errorText = result.status === 'failed'
        ? `All selectors failed for: ${result.missing.join(', ')}`
        : null;

    await pool.query(
        `UPDATE products SET
            current_price = COALESCE($1, current_price),
            price_change_pct = CASE WHEN $1::numeric IS NOT NULL THEN $2::numeric ELSE price_change_pct END,
            availability = COALESCE($3, availability),
            availability_text = COALESCE($4, availability_text),
            stock_count = CASE WHEN $5::int IS NOT NULL THEN $5::int ELSE stock_count END,
            rating = COALESCE($6, rating),
            sku = COALESCE($7, sku),
            last_checked_at = $8,
            last_error = $9,
            fixture_price = $10,
            fixture_stock = $11,
            fixture_state = $12
         WHERE id = $13`,
        [
            newPrice, changePct, newAvail,
            ex.availability ? ex.availability.raw : null,
            newStock,
            ex.rating ? ex.rating.value : null,
            ex.sku ? ex.sku.raw : null,
            observedAt, errorText,
            product.fixture_price, product.fixture_stock,
            JSON.stringify(product.fixture_state || {}),
            product.id,
        ]
    );

    // ---- history + run ----------------------------------------------------
    const hist = await pool.query(
        `INSERT INTO price_history (product_id, price, availability, stock_count, observed_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [product.id, newPrice, newAvail, newStock, observedAt]
    );

    const runRes = await pool.query(
        `INSERT INTO scrape_runs (product_id, status, duration_ms, extracted, selector_trace, healed, change, error, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
            product.id, result.status, durationMs,
            JSON.stringify(ex), JSON.stringify(result.trace),
            result.healed, JSON.stringify(change), errorText, observedAt,
        ]
    );
    const run = runRes.rows[0];

    // ---- alerts -----------------------------------------------------------
    if (createAlerts) {
        const cur = product; // pre-run snapshot
        const userId = product.user_id;
        const money = (v) => fmtMoney(v, site.currency);

        if (result.status === 'failed') {
            await raiseAlert({
                userId, productId: product.id, type: 'selector_failure', severity: 'warning',
                message: `Selector chain broken on ${site.name} — no match for ${result.missing.join(', ')} on "${product.title}"`,
                details: { missing: result.missing, runId: run.id },
            });
        }
        if (change.price) {
            const pct = ((change.price.to - change.price.from) / change.price.from) * 100;
            if (pct <= -5) {
                await raiseAlert({
                    userId, productId: product.id, type: 'price_drop', severity: 'warning',
                    message: `Price dropped ${pct.toFixed(1)}% on ${site.name}: ${money(change.price.from)} → ${money(change.price.to)} — "${product.title}"`,
                    details: change.price,
                });
            } else if (pct >= 7) {
                await raiseAlert({
                    userId, productId: product.id, type: 'price_increase', severity: 'info',
                    message: `Price rose ${pct.toFixed(1)}% on ${site.name}: ${money(change.price.from)} → ${money(change.price.to)} — "${product.title}"`,
                    details: change.price,
                });
            }
        }
        const target = product.target_price != null ? Number(product.target_price) : null;
        if (newPrice != null && target != null && newPrice <= target) {
            await raiseAlert({
                userId, productId: product.id, type: 'target_price', severity: 'info',
                message: `Target price hit on ${site.name}: now ${money(newPrice)} (target ${money(target)}) — "${product.title}"`,
                details: { price: newPrice, target },
            });
        }
        if (change.availability) {
            const thr = Number(product.low_stock_threshold || 10);
            const to = change.availability.to;
            if (to === 'out_of_stock') {
                await raiseAlert({
                    userId, productId: product.id, type: 'out_of_stock', severity: 'critical',
                    message: `OUT OF STOCK on ${site.name} — "${product.title}"`,
                    details: change.availability,
                });
            } else if (to === 'low_stock') {
                const count = newStock;
                await raiseAlert({
                    userId, productId: product.id, type: 'low_stock', severity: count != null && count <= thr ? 'warning' : 'info',
                    message: count != null
                        ? `Low stock on ${site.name}: only ${count} left — "${product.title}"`
                        : `Stock running low on ${site.name} — "${product.title}"`,
                    details: { ...change.availability, count },
                });
            } else if (to === 'in_stock') {
                await raiseAlert({
                    userId, productId: product.id, type: 'back_in_stock', severity: 'info',
                    message: `Back in stock on ${site.name} — "${product.title}"`,
                    details: change.availability,
                });
            }
        }
        // silence unused var lint-ish readability
        void cur;
    }

    return { run, result, change, learned: learnedRows };
}

async function runScrapeById(productId, opts) {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [productId]);
    if (!rows[0]) throw new Error('Product not found');
    return runScrape(rows[0], opts);
}

module.exports = { runScrape, runScrapeById, loadCandidates, sleep };
