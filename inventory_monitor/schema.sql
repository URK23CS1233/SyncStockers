-- Automated E-Commerce Inventory Monitoring Using Dynamic Selectors
-- PostgreSQL schema

DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS scrape_runs CASCADE;
DROP TABLE IF EXISTS price_history CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS selectors CASCADE;
DROP TABLE IF EXISTS sites CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(30) UNIQUE NOT NULL,
    email VARCHAR(120) UNIQUE NOT NULL,
    password VARCHAR(80) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Monitored e-commerce storefronts (fixture profiles)
CREATE TABLE sites (
    id SERIAL PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    base_url VARCHAR(200) NOT NULL,
    theme VARCHAR(20) NOT NULL DEFAULT 'marketbay',
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    dom_version INT NOT NULL DEFAULT 1,
    last_redesign TIMESTAMPTZ NOT NULL DEFAULT now(),
    description TEXT
);

-- Dynamic selector candidates: ordered fallback chain per (site, field)
CREATE TABLE selectors (
    id SERIAL PRIMARY KEY,
    site_id INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    field VARCHAR(30) NOT NULL,          -- title | price | availability | rating | image | sku
    pattern VARCHAR(400) NOT NULL,
    kind VARCHAR(10) NOT NULL DEFAULT 'css',  -- css | attr | regex
    attr_name VARCHAR(60),               -- used when kind = 'attr'
    priority INT NOT NULL DEFAULT 100,   -- lower runs first
    hits INT NOT NULL DEFAULT 0,
    misses INT NOT NULL DEFAULT 0,
    source VARCHAR(10) NOT NULL DEFAULT 'authored', -- authored | learned
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_selectors_site_field ON selectors (site_id, field, priority);

-- Products under monitoring
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    site_id INT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    url VARCHAR(300) NOT NULL,
    sku VARCHAR(60),
    category VARCHAR(60),
    emoji VARCHAR(10) DEFAULT '📦',
    base_price NUMERIC(10,2),
    currency VARCHAR(10) DEFAULT 'INR',
    current_price NUMERIC(10,2),
    price_change_pct NUMERIC(6,2) DEFAULT 0,
    availability VARCHAR(30) DEFAULT 'unknown', -- in_stock | low_stock | out_of_stock | unknown
    availability_text VARCHAR(120),
    stock_count INT,
    rating NUMERIC(3,2),
    low_stock_threshold INT NOT NULL DEFAULT 10,
    target_price NUMERIC(10,2),
    monitor_interval_sec INT NOT NULL DEFAULT 60,
    status VARCHAR(10) NOT NULL DEFAULT 'active', -- active | paused
    last_checked_at TIMESTAMPTZ,
    last_error TEXT,
    -- internal state of the simulated storefront page (drifts between scans)
    fixture_price NUMERIC(10,2),
    fixture_stock INT,
    fixture_state JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_user ON products (user_id);

-- One row per scrape execution (full selector trace preserved)
CREATE TABLE scrape_runs (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    status VARCHAR(12) NOT NULL DEFAULT 'success', -- success | partial | failed
    duration_ms INT NOT NULL DEFAULT 0,
    extracted JSONB,
    selector_trace JSONB,   -- [{field, pattern, kind, source, matched, ms, healed, value}]
    healed BOOLEAN NOT NULL DEFAULT false,
    change JSONB,           -- {price:{from,to}, availability:{from,to}, ...}
    error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_runs_product ON scrape_runs (product_id, created_at DESC);

-- Observed price / availability snapshots
CREATE TABLE price_history (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    run_id INT REFERENCES scrape_runs(id) ON DELETE SET NULL,
    price NUMERIC(10,2),
    availability VARCHAR(30),
    stock_count INT,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_history_product ON price_history (product_id, observed_at);

-- Alerts raised by the monitor
CREATE TABLE alerts (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    type VARCHAR(30) NOT NULL,    -- price_drop | price_increase | low_stock | out_of_stock | back_in_stock | target_price | selector_failure
    severity VARCHAR(10) NOT NULL DEFAULT 'info', -- info | warning | critical
    message TEXT NOT NULL,
    details JSONB,
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_user ON alerts (user_id, resolved, created_at DESC);
