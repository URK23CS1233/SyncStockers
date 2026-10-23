const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { SECRET, verifyToken } = require('../middleware/auth');

const router = express.Router();

const sign = (user) => jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '12h' });
const publicUser = (u) => ({ id: u.id, username: u.username, email: u.email, created_at: u.created_at });

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
        return res.status(400).json({ message: 'username, email and password are required' });
    }
    if (String(password).length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }
    const hashed = await bcrypt.hash(String(password), 10);
    try {
        const result = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING *',
            [username, email, hashed]
        );
        const user = result.rows[0];
        res.status(201).json({ token: sign(user), user: publicUser(user) });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({ message: 'Username or email already exists' });
        }
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ message: 'email and password are required' });
    }
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];
        if (user && (await bcrypt.compare(String(password), user.password))) {
            res.json({ token: sign(user), user: publicUser(user) });
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/me
router.get('/me', verifyToken, async (req, res) => {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [req.userId]);
    if (!result.rows[0]) return res.status(404).json({ message: 'User not found' });
    res.json({ user: publicUser(result.rows[0]) });
});

module.exports = router;
