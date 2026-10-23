const express = require('express');
const pool = require('../db');
const { renderFixture } = require('../engine/fixtures');

const router = express.Router();

// GET /api/sites — storefronts with selector & product stats
router.get('/', async (req, res) => {
    const result = await pool.query(
        `SELECT s.*,
                (SELECT count(*)::int FROM products p WHERE p.site_id = s.id) AS product_count,
                (SELECT count(*)::int FROM selectors se WHERE se.site_id = s.id AND se.active = true) AS selector_count,
                (SELECT count(*)::int FROM selectors se WHERE se.site_id = s.id AND se.source = 'learned') AS learned_count,
                (SELECT COALESCE(sum(se.hits + se.misses), 0)::int FROM selectors se WHERE se.site_id = s.id) AS evaluations,
                (SELECT COALESCE(sum(se.misses), 0)::int FROM selectors se WHERE se.site_id = s.id) AS misses
         FROM sites s ORDER BY s.id`
    );
    res.json(result.rows);
});

// POST /api/sites/:id/redesign — simulate the storefront reshuffling its DOM
router.post('/:id/redesign', async (req, res) => {
    const result = await pool.query(
        `UPDATE sites SET dom_version = dom_version + 1, last_redesign = now()
         WHERE id = $1 RETURNING *`,
        [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Site not found' });
    res.json({
        site: result.rows[0],
        message: `${result.rows[0].name} shipped a redesign — DOM generation v${result.rows[0].dom_version}`,
    });
});

// GET /api/sites/:id/fixture — raw HTML of a rendered product page (current DOM generation)
router.get('/:id/fixture', async (req, res) => {
    const siteRes = await pool.query('SELECT * FROM sites WHERE id = $1', [req.params.id]);
    const site = siteRes.rows[0];
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const prodRes = await pool.query(
        'SELECT * FROM products WHERE site_id = $1 ORDER BY id LIMIT 1',
        [site.id]
    );
    const template = prodRes.rows[0] || {
        id: 0,
        title: `Sample product on ${site.name}`,
        sku: 'SAMPLE-001',
        category: 'Demo',
        base_price: 999,
        fixture_price: 999,
        fixture_stock: 24,
        fixture_state: { rating: 4.3 },
    };
    const { html } = renderFixture(site, template, { applyDrift: false });
    res.type('text/html').send(html);
});

module.exports = router;
