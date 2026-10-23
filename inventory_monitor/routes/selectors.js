const express = require('express');
const cheerio = require('cheerio');
const pool = require('../db');
const { renderFixture } = require('../engine/fixtures');
const { normalizeValue, FIELDS } = require('../engine/selectorEngine');

const router = express.Router();

// GET /api/selectors?siteId=
router.get('/', async (req, res) => {
    const siteId = req.query.siteId;
    const siteRes = siteId
        ? await pool.query('SELECT * FROM sites WHERE id = $1', [siteId])
        : await pool.query('SELECT * FROM sites ORDER BY id LIMIT 1');
    const site = siteRes.rows[0];
    if (!site) return res.status(404).json({ message: 'No sites configured' });

    const sel = await pool.query(
        'SELECT * FROM selectors WHERE site_id = $1 ORDER BY field, priority ASC',
        [site.id]
    );
    const groups = {};
    for (const f of FIELDS) groups[f] = [];
    for (const row of sel.rows) {
        (groups[row.field] = groups[row.field] || []).push(row);
    }
    res.json({ site, groups });
});

// POST /api/selectors — add a candidate to a chain
router.post('/', async (req, res) => {
    const { site_id, field, pattern, kind = 'css', attr_name = null, priority = 100 } = req.body || {};
    if (!site_id || !field || !pattern) {
        return res.status(400).json({ message: 'site_id, field and pattern are required' });
    }
    if (!FIELDS.includes(field)) {
        return res.status(400).json({ message: `field must be one of: ${FIELDS.join(', ')}` });
    }
    if (!['css', 'attr', 'regex'].includes(kind)) {
        return res.status(400).json({ message: 'kind must be css, attr or regex' });
    }
    if (kind === 'regex') {
        try { new RegExp(pattern); } catch (e) {
            return res.status(400).json({ message: `Invalid regex: ${e.message}` });
        }
    }
    const result = await pool.query(
        `INSERT INTO selectors (site_id, field, pattern, kind, attr_name, priority, source)
         VALUES ($1,$2,$3,$4,$5,$6,'authored') RETURNING *`,
        [site_id, field, pattern, kind, attr_name, Number(priority) || 100]
    );
    res.status(201).json(result.rows[0]);
});

// PUT /api/selectors/:id — reorder / toggle
router.put('/:id', async (req, res) => {
    const { priority, active } = req.body || {};
    const existing = await pool.query('SELECT * FROM selectors WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ message: 'Selector not found' });
    const s = existing.rows[0];
    const result = await pool.query(
        'UPDATE selectors SET priority = $1, active = $2 WHERE id = $3 RETURNING *',
        [
            priority != null ? Number(priority) : s.priority,
            active != null ? Boolean(active) : s.active,
            req.params.id,
        ]
    );
    res.json(result.rows[0]);
});

// DELETE /api/selectors/:id
router.delete('/:id', async (req, res) => {
    const result = await pool.query('DELETE FROM selectors WHERE id = $1 RETURNING id', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ message: 'Selector not found' });
    res.json({ message: 'Selector deleted' });
});

// POST /api/selectors/test — run ONE candidate against a freshly rendered page.
// Body: { site_id, field, kind, pattern, attr_name }
router.post('/test', async (req, res) => {
    const { site_id, field, kind = 'css', pattern, attr_name = null } = req.body || {};
    if (!site_id || !field || !pattern) {
        return res.status(400).json({ message: 'site_id, field and pattern are required' });
    }
    if (kind === 'regex') {
        try { new RegExp(pattern); } catch (e) {
            return res.status(400).json({ message: `Invalid regex: ${e.message}` });
        }
    }

    const siteRes = await pool.query('SELECT * FROM sites WHERE id = $1', [site_id]);
    const site = siteRes.rows[0];
    if (!site) return res.status(404).json({ message: 'Site not found' });

    const prodRes = await pool.query('SELECT * FROM products WHERE site_id = $1 ORDER BY id LIMIT 1', [site.id]);
    const template = prodRes.rows[0] || {
        id: 0, title: `Sample product on ${site.name}`, sku: 'SAMPLE-001',
        category: 'Demo', base_price: 999, fixture_price: 999,
        fixture_stock: 24, fixture_state: { rating: 4.3 },
    };
    const { html } = renderFixture(site, template, { applyDrift: false });

    const t0 = process.hrtime.bigint();
    let matched = false;
    let rawValue = null;
    let matchHtml = null;
    let error = null;

    try {
        if (kind === 'regex') {
            const m = html.match(new RegExp(pattern, 'i'));
            if (m) {
                matched = true;
                rawValue = m[1] != null ? m[1] : m[0];
                const idx = m.index != null ? m.index : html.indexOf(m[0]);
                matchHtml = html.slice(Math.max(0, idx - 140), idx + Math.min(400, m[0].length + 220));
            }
        } else {
            const $ = cheerio.load(html);
            const $el = $(pattern).first();
            if ($el.length) {
                matched = true;
                rawValue = kind === 'attr' ? ($el.attr(attr_name) ?? null) : ($el.text() || null);
                matchHtml = $.html($el).slice(0, 800);
            }
        }
    } catch (e) {
        error = e.message;
    }

    const ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
    const normalized = matched && rawValue != null ? normalizeValue(field, rawValue, { currency: site.currency }) : null;

    res.json({
        matched: matched && normalized != null,
        raw: rawValue,
        value: normalized,
        ms,
        error,
        html,
        matchHtml,
        domVersion: site.dom_version,
    });
});

module.exports = router;
