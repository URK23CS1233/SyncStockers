const express = require('express');
const cors = require('cors');
const { verifyToken } = require('./middleware/auth');
const { startScheduler } = require('./engine/scheduler');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const siteRoutes = require('./routes/sites');
const selectorRoutes = require('./routes/selectors');
const alertRoutes = require('./routes/alerts');
const dashboardRoutes = require('./routes/dashboard');

const app = express();
const port = Number(process.env.PORT) || 5000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'inventory-monitor', time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/products', verifyToken, productRoutes);
app.use('/api/sites', verifyToken, siteRoutes);
app.use('/api/selectors', verifyToken, selectorRoutes);
app.use('/api/alerts', verifyToken, alertRoutes);
app.use('/api/dashboard', verifyToken, dashboardRoutes);

app.use((req, res) => res.status(404).json({ message: `Not found: ${req.method} ${req.path}` }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    console.error('[server] error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(port, () => {
    console.log(`[server] API running on http://localhost:${port}`);
    if (process.env.DISABLE_SCHEDULER !== '1') {
        startScheduler();
    }
});
