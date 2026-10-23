// Database bootstrap + demo seed.
//   npm run db:setup
// Creates the `inventory` database if missing, applies schema.sql, then
// loads a demo user, three storefronts, authored selector chains, monitored
// products, a week of synthetic scan history and a starter set of alerts.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Client, Pool } = require('pg');

const { renderFixture } = require('./engine/fixtures');
const { extractProduct } = require('./engine/selectorEngine');
const { runScrape, loadCandidates } = require('./engine/scraper');

const DB_NAME = process.env.DB_NAME || 'inventory';
const DB_USER = process.env.DB_USER || 'postgres';
const DB_PASSWORD = process.env.DB_PASSWORD || 'postgres';
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_PORT = Number(process.env.DB_PORT) || 5432;

async function ensureDatabase() {
    const admin = new Client({ user: DB_USER, password: DB_PASSWORD, host: DB_HOST, port: DB_PORT, database: 'postgres' });
    await admin.connect();
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
    if (!exists.rows.length) {
        await admin.query(`CREATE DATABASE "${DB_NAME}"`);
        console.log(`created database "${DB_NAME}"`);
    }
    await admin.end();
}

const SITES = [
    {
        name: 'MarketBay', theme: 'marketbay', currency: 'INR',
        base_url: 'https://marketbay.example',
        description: 'Amazon-style storefront · classic ids (#productTitle, #priceblock_ourprice)',
    },
    {
        name: 'BuyBazaar', theme: 'buybazaar', currency: 'INR',
        base_url: 'https://buybazaar.example',
        description: 'Flipkart-style storefront · obfuscated utility classes (B_NuCI, _30jeq3)',
    },
    {
        name: 'QuickCart', theme: 'quickcart', currency: 'USD',
        base_url: 'https://quickcart.example',
        description: 'Modern D2C storefront · data-testid hooks with an annual template refresh',
    },
];

// Authored fallback chains — priority asc. These are what a human writes
// on day one; the engine learns more as sites evolve.
const SELECTORS = {
    // site index 0: MarketBay
    1: [
        { field: 'title', pattern: '#productTitle', kind: 'css', priority: 10 },
        { field: 'title', pattern: 'meta[property="og:title"]', kind: 'attr', attr_name: 'content', priority: 20 },
        { field: 'price', pattern: '#priceblock_ourprice', kind: 'css', priority: 10 },
        { field: 'price', pattern: '"price"\\s*:\\s*"?([0-9.,]+)', kind: 'regex', priority: 20 },
        { field: 'price', pattern: '[itemprop="price"]', kind: 'attr', attr_name: 'content', priority: 30 },
        { field: 'availability', pattern: '#availability span', kind: 'css', priority: 10 },
        { field: 'availability', pattern: '"availability"\\s*:\\s*"https://schema.org/(\\w+)"', kind: 'regex', priority: 20 },
        { field: 'availability', pattern: '[itemprop="availability"]', kind: 'attr', attr_name: 'href', priority: 30 },
        { field: 'rating', pattern: '#acrPopover .a-icon-alt', kind: 'css', priority: 10 },
        { field: 'image', pattern: '#landingImage', kind: 'attr', attr_name: 'src', priority: 10 },
        { field: 'image', pattern: 'meta[property="og:image"]', kind: 'attr', attr_name: 'content', priority: 20 },
        { field: 'sku', pattern: 'ASIN:\\s*(?:<[^>]+>\\s*)*([A-Z0-9]{8,14})', kind: 'regex', priority: 10 },
    ],
    // site index 1: BuyBazaar
    2: [
        { field: 'title', pattern: 'span.B_NuCI', kind: 'css', priority: 10 },
        { field: 'title', pattern: 'meta[property="og:title"]', kind: 'attr', attr_name: 'content', priority: 20 },
        { field: 'price', pattern: '._30jeq3', kind: 'css', priority: 10 },
        { field: 'price', pattern: '"price"\\s*:\\s*"?([0-9.,]+)', kind: 'regex', priority: 20 },
        { field: 'availability', pattern: '._16FRp0', kind: 'css', priority: 10 },
        { field: 'availability', pattern: '"availability"\\s*:\\s*"https://schema.org/(\\w+)"', kind: 'regex', priority: 20 },
        { field: 'rating', pattern: '._3LWZlK', kind: 'css', priority: 10 },
        { field: 'image', pattern: 'img._396cs4', kind: 'attr', attr_name: 'src', priority: 10 },
        { field: 'image', pattern: 'meta[property="og:image"]', kind: 'attr', attr_name: 'content', priority: 20 },
        { field: 'sku', pattern: 'Product ID:\\s*([A-Z0-9-]{4,})', kind: 'regex', priority: 10 },
    ],
    // site index 2: QuickCart
    3: [
        { field: 'title', pattern: '[data-testid="product-title"]', kind: 'css', priority: 10 },
        { field: 'price', pattern: '[data-testid="price"]', kind: 'css', priority: 10 },
        { field: 'price', pattern: '"price"\\s*:\\s*"?([0-9.,]+)', kind: 'regex', priority: 20 },
        { field: 'availability', pattern: '[data-testid="stock-status"]', kind: 'css', priority: 10 },
        { field: 'availability', pattern: '"availability"\\s*:\\s*"https://schema.org/(\\w+)"', kind: 'regex', priority: 20 },
        { field: 'rating', pattern: '[data-testid="rating"]', kind: 'css', priority: 10 },
        { field: 'image', pattern: '[data-testid="product-image"]', kind: 'attr', attr_name: 'src', priority: 10 },
        { field: 'image', pattern: 'meta[property="og:image"]', kind: 'attr', attr_name: 'content', priority: 20 },
        { field: 'sku', pattern: 'SKU:\\s*([A-Z0-9-]{4,})', kind: 'regex', priority: 10 },
    ],
};

const PRODUCTS = [
    // MarketBay (INR)
    { site: 1, title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones', category: 'Electronics', emoji: '🎧', base: 29990, low: 8, target: 26990 },
    { site: 1, title: 'Prestige Iris 750W Mixer Grinder (3 Jars)', category: 'Kitchen', emoji: '🌀', base: 4299, low: 12, target: 3799 },
    { site: 1, title: 'Wildcraft 45L Rucksack Backpack', category: 'Bags', emoji: '🎒', base: 2199, low: 15, target: 1899 },
    { site: 1, title: 'Crompton 1200mm Ceiling Fan (Bronze)', category: 'Home', emoji: '🌀', base: 3499, low: 10, target: 3100 },
    // BuyBazaar (INR)
    { site: 2, title: 'boAt Airdopes 141 TWS Earbuds', category: 'Electronics', emoji: '🎧', base: 1299, low: 20, target: 999 },
    { site: 2, title: 'Milton Thermosteel Flask 1L', category: 'Kitchen', emoji: '🍶', base: 899, low: 12, target: 749 },
    { site: 2, title: 'Nivia Storm Football Size 5', category: 'Sports', emoji: '⚽', base: 649, low: 10, target: 549 },
    { site: 2, title: 'Cello Prime Plastic Storage Container (Set of 5)', category: 'Home', emoji: '🧰', base: 549, low: 15, target: 449 },
    // QuickCart (USD)
    { site: 3, title: 'AeroPress Original Coffee Maker', category: 'Kitchen', emoji: '☕', base: 39.95, low: 6, target: 34.95 },
    { site: 3, title: 'Logitech MX Master 3S Wireless Mouse', category: 'Electronics', emoji: '🖱️', base: 99.99, low: 5, target: 84.99 },
    { site: 3, title: 'Hydro Flask 32oz Water Bottle', category: 'Outdoors', emoji: '🥤', base: 44.95, low: 8, target: 37.95 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

async function seed() {
    await ensureDatabase();

    const pool = new Pool({ user: DB_USER, password: DB_PASSWORD, host: DB_HOST, port: DB_PORT, database: DB_NAME });
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('schema applied');

    // ---- demo user ------------------------------------------------------
    const hash = await bcrypt.hash('demo1234', 10);
    const user = (await pool.query(
        "INSERT INTO users (username, email, password) VALUES ('demo', 'demo@stocklens.dev', $1) RETURNING *",
        [hash]
    )).rows[0];
    console.log(`user: demo@stocklens.dev / demo1234`);

    // ---- sites + selector chains ---------------------------------------
    const siteIds = [];
    for (const s of SITES) {
        const row = (await pool.query(
            `INSERT INTO sites (name, base_url, theme, currency, description)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [s.name, s.base_url, s.theme, s.currency, s.description]
        )).rows[0];
        siteIds.push(row.id);
    }
    for (let i = 0; i < SITES.length; i += 1) {
        const key = i + 1;
        for (const sel of SELECTORS[key] || []) {
            await pool.query(
                `INSERT INTO selectors (site_id, field, pattern, kind, attr_name, priority, hits, misses)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                [
                    siteIds[i], sel.field, sel.pattern, sel.kind, sel.attr_name || null,
                    sel.priority,
                    Math.floor(12 + Math.random() * 90),
                    Math.floor(Math.random() * 9),
                ]
            );
        }
    }
    console.log(`sites + ${Object.values(SELECTORS).flat().length} authored selectors`);

    // ---- products -------------------------------------------------------
    const products = [];
    for (const p of PRODUCTS) {
        const sku = `${SITES[p.site - 1].theme.slice(0, 2).toUpperCase()}${Math.floor(100000 + Math.random() * 899999)}`;
        const stock = Math.floor(8 + Math.random() * 55);
        const rating = Math.round((3.7 + Math.random() * 1.1) * 10) / 10;
        const row = (await pool.query(
            `INSERT INTO products
              (user_id, site_id, title, url, sku, category, emoji, base_price, currency,
               fixture_price, fixture_stock, fixture_state, rating, low_stock_threshold,
               target_price, monitor_interval_sec)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
            [
                user.id, siteIds[p.site - 1], p.title,
                `${SITES[p.site - 1].base_url}/p/${sku.toLowerCase()}`,
                sku, p.category, p.emoji, p.base, SITES[p.site - 1].currency,
                p.base, stock, JSON.stringify({ rating }), rating,
                p.low, p.target, 60,
            ]
        )).rows[0];
        products.push(row);
    }
    console.log(`products: ${products.length}`);

    // ---- 7 days of scan history (backdated, stats not double-counted) ---
    let runsInserted = 0;
    let historyInserted = 0;
    const siteCache = {};
    const candCache = {};
    for (let d = 7; d >= 1; d -= 1) {
        const when = new Date(Date.now() - d * DAY_MS);
        when.setHours(9 + (d % 8), (d * 7) % 60, 0, 0);
        for (const prod of products) {
            if (!siteCache[prod.site_id]) {
                siteCache[prod.site_id] = (await pool.query('SELECT * FROM sites WHERE id = $1', [prod.site_id])).rows[0];
            }
            const site = siteCache[prod.site_id];
            if (!candCache[site.id]) candCache[site.id] = await loadCandidates(site.id);
            const { html } = renderFixture(site, prod, { applyDrift: true });
            const res = extractProduct(html, { site, candidatesByField: candCache[site.id] });
            const ex = res.extracted;
            const price = ex.price ? ex.price.value : null;
            const avail = ex.availability ? ex.availability.status : 'unknown';
            const stock = ex.availability && ex.availability.count != null ? ex.availability.count : null;

            const hist = await pool.query(
                `INSERT INTO price_history (product_id, price, availability, stock_count, observed_at)
                 VALUES ($1,$2,$3,$4,$5) RETURNING id`,
                [prod.id, price, avail, stock, when]
            );
            historyInserted += 1;

            const run = await pool.query(
                `INSERT INTO scrape_runs (product_id, status, duration_ms, extracted, selector_trace, healed, created_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
                [
                    prod.id, res.status, Math.floor(20 + Math.random() * 90),
                    JSON.stringify(ex), JSON.stringify(res.trace), res.healed, when,
                ]
            );
            runsInserted += 1;

            await pool.query(
                `UPDATE products SET fixture_price = $1, fixture_stock = $2, fixture_state = $3,
                    current_price = COALESCE($4, current_price),
                    availability = COALESCE($5, availability),
                    stock_count = COALESCE($6, stock_count),
                    rating = COALESCE($7, rating),
                    last_checked_at = $8
                 WHERE id = $9`,
                [
                    prod.fixture_price, prod.fixture_stock,
                    JSON.stringify(prod.fixture_state || {}),
                    price, avail, stock,
                    ex.rating ? ex.rating.value : null,
                    when, prod.id,
                ]
            );
            void hist;
            void run;
        }
    }
    console.log(`backfill: ${historyInserted} history rows, ${runsInserted} runs`);

    // ---- one live scan per product (today) ------------------------------
    for (const prod of products) {
        const fresh = (await pool.query('SELECT * FROM products WHERE id = $1', [prod.id])).rows[0];
        await runScrape(fresh, { updateStats: false });
    }
    console.log('current scans done');

    // ---- starter alerts -------------------------------------------------
    const p = (title) => products.find((x) => x.title === title);
    const starterAlerts = [
        { prod: p('Sony WH-1000XM5 Wireless Noise Cancelling Headphones'), type: 'price_drop', severity: 'warning', message: 'Price dropped 6.4% on MarketBay: ₹29,990.00 → ₹28,070.60 — "Sony WH-1000XM5 Wireless Noise Cancelling Headphones"', mins: 52 },
        { prod: p('boAt Airdopes 141 TWS Earbuds'), type: 'low_stock', severity: 'warning', message: 'Low stock on BuyBazaar: only 4 left — "boAt Airdopes 141 TWS Earbuds"', mins: 140 },
        { prod: p('Logitech MX Master 3S Wireless Mouse'), type: 'target_price', severity: 'info', message: 'Target price hit on QuickCart: now $84.20 (target $84.99) — "Logitech MX Master 3S Wireless Mouse"', mins: 200 },
        { prod: p('Crompton 1200mm Ceiling Fan (Bronze)'), type: 'out_of_stock', severity: 'critical', message: 'OUT OF STOCK on MarketBay — "Crompton 1200mm Ceiling Fan (Bronze)"', mins: 330 },
        { prod: p('AeroPress Original Coffee Maker'), type: 'back_in_stock', severity: 'info', message: 'Back in stock on QuickCart — "AeroPress Original Coffee Maker"', mins: 600, resolved: true },
        { prod: p('Nivia Storm Football Size 5'), type: 'price_increase', severity: 'info', message: 'Price rose 8.1% on BuyBazaar: ₹649.00 → ₹701.60 — "Nivia Storm Football Size 5"', mins: 900, resolved: true },
    ];
    for (const a of starterAlerts) {
        if (!a.prod) continue;
        await pool.query(
            `INSERT INTO alerts (user_id, product_id, type, severity, message, resolved, created_at)
             VALUES ($1,$2,$3,$4,$5,$6, now() - ($7 || ' minutes')::interval)`,
            [user.id, a.prod.id, a.type, a.severity, a.message, !!a.resolved, String(a.mins)]
        );
    }
    console.log(`alerts: ${starterAlerts.length}`);

    const counts = await pool.query(
        `SELECT (SELECT count(*) FROM products) products,
                (SELECT count(*) FROM selectors) selectors,
                (SELECT count(*) FROM scrape_runs) runs,
                (SELECT count(*) FROM price_history) history,
                (SELECT count(*) FROM alerts) alerts`
    );
    console.log('seed complete:', counts.rows[0]);
    await pool.end();
}

seed().catch((err) => {
    console.error('seed failed:', err);
    process.exit(1);
});
