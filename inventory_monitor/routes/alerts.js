const express = require('express');
const pool = require('../db');

const router = express.Router();

// GET /api/alerts?state=open|resolved|all&type=&limit=
router.get('/', async (req, res) => {
    const { state = 'open', type, limit = 100 } = req.query;
    const params = [req.userId];
    const where = ['a.user_id = $1'];

    if (state === 'open') where.push('a.resolved = false');
    else if (state === 'resolved') where.push('a.resolved = true');

    if (type) {
        params.push(type);
        where.push(`a.type = $${params.length}`);
    }

    const result = await pool.query(
        `SELECT a.*, p.title AS product_title, p.emoji AS product_emoji, p.availability,
                s.name AS site_name, s.currency AS site_currency
         FROM alerts a
         JOIN products p ON p.id = a.product_id
         JOIN sites s ON s.id = p.site_id
         WHERE ${where.join(' AND ')}
         ORDER BY a.created_at DESC
         LIMIT ${Math.min(300, Number(limit) || 100)}`,
        params
    );
    const counts = await pool.query(
        `SELECT
            count(*) FILTER (WHERE resolved = false)::int AS open,
            count(*) FILTER (WHERE resolved = true)::int AS resolved,
            count(*)::int AS total
         FROM alerts WHERE user_id = $1`,
        [req.userId]
    );
    res.json({ alerts: result.rows, counts: counts.rows[0] });
});

// POST /api/alerts/:id/resolve
router.post('/:id/resolve', async (req, res) => {
    const result = await pool.query(
        'UPDATE alerts SET resolved = true WHERE id = $1 AND user_id = $2 RETURNING *',
        [req.params.id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ message: 'Alert not found' });
    res.json(result.rows[0]);
});

// POST /api/alerts/resolve-all  (optional body: { type })
router.post('/resolve-all', async (req, res) => {
    const { type } = req.body || {};
    const params = [req.userId];
    let sql = 'UPDATE alerts SET resolved = true WHERE user_id = $1 AND resolved = false';
    if (type) {
        params.push(type);
        sql += ` AND type = $${params.length}`;
    }
    const result = await pool.query(`${sql} RETURNING id`, params);
    res.json({ resolved: result.rowCount });
});

module.exports = router;
