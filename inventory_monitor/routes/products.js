const express = require('express');
const pool = require('../db');
const { runScrape, runScrapeById, sleep } = require('../engine/scraper');

const router = express.Router();

// GET /api/products?search=&status=&availability=&siteId=
router.get('/', async (req, res) => {
    const { search, status, availability, siteId } = req.query;
    const params = [req.userId];
    const where = ['p.user_id = $1'];

    if (search) {
        params.push(`%${search}%`);
        where.push(`(p.title ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR p.category ILIKE $${params.length})`);
    }
    if (status) {
        params.push(status);
        where.push(`p.status = $${params.length}`);
    }
    if (availability) {
        params.push(availability);
        where.push(`p.availability = $${params.length}`);
    }
    if (siteId) {
        params.push(Number(siteId));
        where.push(`p.site_id = $${params.length}`);
    }

    const result = await pool.query(
        `SELECT p.*, s.name AS site_name, s.theme AS site_theme, s.currency AS site_currency, s.dom_version,
                (SELECT r.status FROM scrape_runs r WHERE r.product_id = p.id ORDER BY r.created_at DESC LIMIT 1) AS last_run_status,
                (SELECT r.healed FROM scrape_runs r WHERE r.product_id = p.id ORDER BY r.created_at DESC LIMIT 1) AS last_run_healed,
                (SELECT count(*)::int FROM alerts a WHERE a.product_id = p.id AND a.resolved = false) AS open_alerts
         FROM products p
         JOIN sites s ON s.id = p.site_id
         WHERE ${where.join(' AND ')}
         ORDER BY p.last_checked_at DESC NULLS FIRST, p.id ASC`,
        params
    );
    res.json(result.rows);
});

// POST /api/products
router.post('/', async (req, res) => {
    const {
        title, site_id, category = 'General', emoji = '📦', sku,
        base_price, url, low_stock_threshold = 10, target_price = null,
        monitor_interval_sec = 60,
    } = req.body || {};

    if (!title || !site_id) {
        return res.status(400).json({ message: 'title and site_id are required' });
    }

    const siteRes = await pool.query('SELECT * FROM sites WHERE id = $1', [site_id]);
    const site = siteRes.rows[0];
    if (!site) return res.status(400).json({ message: 'Unknown site' });

    const finalSku = sku && sku.trim()
        ? sku.trim().toUpperCase()
        : `${site.theme.slice(0, 2).toUpperCase()}${Math.floor(100000 + Math.random() * 899999)}`;
    const price = Number(base_price) > 0 ? Number(base_price) : Math.round((499 + Math.random() * 15000) * 100) / 100;
    const stock = Math.floor(6 + Math.random() * 55);
    const rating = Math.round((3.6 + Math.random() * 1.2) * 10) / 10;
    const finalUrl = url && url.trim() ? url.trim() : `${site.base_url}/p/${finalSku.toLowerCase()}`;

    const result = await pool.query(
        `INSERT INTO products
            (user_id, site_id, title, url, sku, category, emoji, base_price, currency,
             fixture_price, fixture_stock, fixture_state, rating,
             low_stock_threshold, target_price, monitor_interval_sec)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING *`,
        [
            req.userId, site_id, title.trim(), finalUrl, finalSku, category, emoji,
            price, site.currency, price, stock, JSON.stringify({ rating }),
            rating, Number(low_stock_threshold) || 10,
            target_price != null && target_price !== '' ? Number(target_price) : null,
            Number(monitor_interval_sec) || 60,
        ]
    );
    const product = result.rows[0];

    // First scan right away so the row is never empty.
    let initial = null;
    try {
        initial = await runScrape(product);
    } catch (err) {
        console.error('initial scrape failed:', err.message);
    }

    const fresh = await pool.query(
        `SELECT p.*, s.name AS site_name, s.theme AS site_theme, s.currency AS site_currency
         FROM products p JOIN sites s ON s.id = p.site_id WHERE p.id = $1`,
        [product.id]
    );
    res.status(201).json({ product: fresh.rows[0], initialRun: initial ? initial.run : null });
});

// PUT /api/products/:id
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const {
        title, category, emoji, sku, low_stock_threshold,
        target_price, monitor_interval_sec, status,
    } = req.body || {};

    const existing = await pool.query(
        'SELECT * FROM products WHERE id = $1 AND user_id = $2',
        [id, req.userId]
    );
    if (!existing.rows[0]) return res.status(404).json({ message: 'Product not found' });

    const p = existing.rows[0];
    const updated = await pool.query(
        `UPDATE products SET
            title = $1, category = $2, emoji = $3, sku = $4,
            low_stock_threshold = $5, target_price = $6,
            monitor_interval_sec = $7, status = $8
         WHERE id = $9 RETURNING *`,
        [
            title != null ? title : p.title,
            category != null ? category : p.category,
            emoji != null ? emoji : p.emoji,
            sku != null && String(sku).trim() ? String(sku).trim().toUpperCase() : p.sku,
            low_stock_threshold != null ? Number(low_stock_threshold) : p.low_stock_threshold,
            target_price !== undefined
                ? (target_price != null && target_price !== '' ? Number(target_price) : null)
                : p.target_price,
            monitor_interval_sec != null ? Math.max(15, Number(monitor_interval_sec)) : p.monitor_interval_sec,
            status != null ? status : p.status,
            id,
        ]
    );
    res.json(updated.rows[0]);
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
    const result = await pool.query(
        'DELETE FROM products WHERE id = $1 AND user_id = $2 RETURNING id',
        [req.params.id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted', id: result.rows[0].id });
});

// POST /api/products/:id/run — scan now
router.post('/:id/run', async (req, res) => {
    try {
        const out = await runScrapeById(Number(req.params.id));
        const fresh = await pool.query(
            'SELECT * FROM products WHERE id = $1 AND user_id = $2',
            [req.params.id, req.userId]
        );
        if (!fresh.rows[0]) return res.status(404).json({ message: 'Product not found' });
        res.json({ product: fresh.rows[0], run: out.run, change: out.change, learned: out.learned });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/products/run-all — scan every active product of this user
router.post('/run-all', async (req, res) => {
    const { rows } = await pool.query(
        "SELECT * FROM products WHERE user_id = $1 AND status = 'active' ORDER BY id LIMIT 40",
        [req.userId]
    );
    let ok = 0;
    let failed = 0;
    let healed = 0;
    for (const p of rows) {
        try {
            const out = await runScrape(p);
            if (out.result.status === 'failed') failed += 1;
            else ok += 1;
            if (out.result.healed) healed += 1;
        } catch (err) {
            failed += 1;
        }
        await sleep(60);
    }
    res.json({ total: rows.length, ok, failed, healed });
});

// GET /api/products/:id/history — price series + recent runs with selector traces
router.get('/:id/history', async (req, res) => {
    const prod = await pool.query(
        `SELECT p.*, s.name AS site_name, s.currency AS site_currency, s.theme AS site_theme, s.dom_version
         FROM products p JOIN sites s ON s.id = p.site_id
         WHERE p.id = $1 AND p.user_id = $2`,
        [req.params.id, req.userId]
    );
    if (!prod.rows[0]) return res.status(404).json({ message: 'Product not found' });

    const history = await pool.query(
        `SELECT observed_at, price, availability, stock_count
         FROM price_history WHERE product_id = $1
         ORDER BY observed_at ASC LIMIT 400`,
        [req.params.id]
    );
    const runs = await pool.query(
        `SELECT id, status, duration_ms, extracted, selector_trace, healed, change, error, created_at
         FROM scrape_runs WHERE product_id = $1
         ORDER BY created_at DESC LIMIT 25`,
        [req.params.id]
    );
    res.json({ product: prod.rows[0], history: history.rows, runs: runs.rows });
});

module.exports = router;
