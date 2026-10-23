// Simulated e-commerce product-page generator.
//
// Every monitored product lives on one of three fictional storefronts.
// renderFixture() produces the HTML of that product's page, and the DOM
// structure changes whenever the site performs a "redesign" (dom_version++).
// The selector engine must survive those reshuffles — that is the whole
// point of "dynamic selectors".

const rnd = (min, max) => Math.random() * (max - min) + min;
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const CURRENCY_SYMBOL = { INR: '₹', USD: '$', EUR: '€' };

function formatPrice(value, currency) {
    const sym = CURRENCY_SYMBOL[currency] || '';
    if (currency === 'INR') {
        return sym + Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return sym + Number(value).toFixed(2);
}

function availabilityInfo(product) {
    const stock = Number(product.fixture_stock ?? 25);
    if (stock <= 0) {
        return { status: 'out_of_stock', count: 0, text: pick(['Currently unavailable', 'Out of stock', 'This item is currently unavailable.']) };
    }
    if (stock <= 10) {
        return { status: 'low_stock', count: stock, text: pick([`Only ${stock} left in stock`, `${stock} left — order soon`, `Only ${stock} left`]) };
    }
    return { status: 'in_stock', count: stock, text: pick(['In stock', 'In stock — ships within 24 hours', 'Available']) };
}

// Mutate the storefront's internal state (price / stock drift) before rendering.
function driftFixture(product) {
    let price = Number(product.fixture_price ?? product.base_price ?? 1000);
    if (chance(0.55)) {
        const pct = rnd(-0.04, 0.04);
        price = price * (1 + pct);
        const floor = Number(product.base_price || price) * 0.55;
        price = Math.max(floor, price);
        price = Math.round(price * 100) / 100;
    }
    let stock = Number(product.fixture_stock ?? 25);
    if (chance(0.05)) {
        stock = 0;
    } else if (chance(0.06)) {
        stock = Math.floor(rnd(1, 8));
    } else if (chance(0.30)) {
        stock = Math.max(0, stock + Math.floor(rnd(-4, 6)));
    }
    product.fixture_price = price;
    product.fixture_stock = stock;

    const state = product.fixture_state && typeof product.fixture_state === 'object' ? { ...product.fixture_state } : {};
    if (typeof state.rating !== 'number') state.rating = Number(product.rating || 4.3);
    if (chance(0.35)) state.rating = Math.min(4.9, Math.max(3.1, state.rating + rnd(-0.1, 0.1)));
    state.rating = Math.round(state.rating * 10) / 10;
    product.fixture_state = state;
    return product;
}

function jsonLd(product, site, avail, variant, includeRating, includeAvailability) {
    const data = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.title,
        sku: product.sku,
        image: `https://cdn.${site.theme}.shop/img/${product.sku}.jpg`,
        brand: { '@type': 'Brand', name: site.name },
        offers: {
            '@type': 'Offer',
            price: String(Number(product.fixture_price).toFixed(2)),
            priceCurrency: site.currency,
            ...(includeAvailability
                ? { availability: avail.status === 'in_stock' ? 'https://schema.org/InStock' : avail.status === 'low_stock' ? 'https://schema.org/LimitedAvailability' : 'https://schema.org/OutOfStock' }
                : {}),
        },
    };
    if (includeRating) {
        data.aggregateRating = { '@type': 'AggregateRating', ratingValue: String(product.fixture_state.rating), reviewCount: String(Math.floor(rnd(40, 900))) };
    }
    return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

function pageChrome(site, product, body) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${product.title} | ${site.name}</title>
<meta property="og:title" content="${product.title} — ${site.name}">
<meta property="og:image" content="https://cdn.${site.theme}.shop/img/${product.sku}-og.jpg">
<meta property="og:type" content="product">
</head>
<body>
<header class="store-header"><a href="/" class="logo">${site.name}</a><nav><a href="/deals">Deals</a><a href="/orders">Orders</a><a href="/cart">Cart</a></nav></header>
<nav class="crumbs">Home › ${product.category || 'Products'} › ${product.title}</nav>
<main class="pdp">${body}</main>
<section class="description"><h2>Product description</h2><p>Crafted for everyday use, this ${String(product.category || 'product').toLowerCase()} combines durable materials with a thoughtful design. Backed by the ${site.name} quality promise, easy returns and doorstep delivery.</p></section>
<section class="reviews"><h2>Customer reviews</h2><div class="review"><b>Priya S.</b><span>Great value for money, exactly as described.</span></div><div class="review"><b>Arun M.</b><span>Delivered early and well packaged.</span></div></section>
<footer class="store-footer">© 2026 ${site.name} · Help · Returns · Privacy</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Variant 1 — the "classic" markup every authored selector was written for.
// Variant 2 — a redesign: classes/ids reshuffled, microdata or data-attrs
//             introduced, structured-data blocks partially stripped.
// ---------------------------------------------------------------------------

function renderMarketBay(site, product, avail, variant) {
    const price = Number(product.fixture_price);
    const priceText = formatPrice(price, site.currency);
    const rating = product.fixture_state.rating;

    if (variant === 1) {
        return pageChrome(site, product, `
${jsonLd(product, site, avail, variant, true, true)}
<div id="dp">
  <div id="imgCol"><img id="landingImage" src="https://cdn.marketbay.shop/img/${product.sku}.jpg" data-old-hi="https://cdn.marketbay.shop/img/${product.sku}-hi.jpg" alt="${product.title}"></div>
  <div id="rightCol">
    <h1 id="productTitle" data-cy="Title-Asin-Heading">${product.title}</h1>
    <span id="acrPopover" class="a-link-popover" title="${rating} out of 5 stars"><span class="a-icon-alt">${rating} out of 5 stars</span></span> <a href="#reviews">${Math.floor(rnd(40, 900))} ratings</a>
    <div id="corePriceDisplay"><span id="priceblock_ourprice" class="a-price" data-a-size="xl">${priceText}</span></div>
    <div id="availability"><span class="a-size-medium a-color-success">${avail.text}</span></div>
    <ul id="feature-bullets"><li>Fast delivery on ${site.name}</li><li>7-day replacement policy</li></ul>
    <div id="detailBullets_feature_div">
      <ul><li><span class="a-text-bold">ASIN:</span> <span class="a-size-base prodDetDescEntry">${product.sku}</span></li></ul>
    </div>
  </div>
</div>`);
    }

    // Redesign: no #productTitle / #priceblock_ourprice, microdata + test ids.
    return pageChrome(site, product, `
${jsonLd(product, site, avail, variant, false, true)}
<div class="dp-shell">
  <div class="gallery"><picture><source srcset="https://cdn.marketbay.shop/img/${product.sku}.webp"><img class="hero-img" src="https://cdn.marketbay.shop/img/${product.sku}.jpg" alt="${product.title}"></picture></div>
  <div class="info-col">
    <div data-testid="dp-title" class="sz-title-2026">${product.title}</div>
    <div class="sz-rating"><span class="pdp-rating-9x" itemprop="ratingValue">${rating}</span> <span class="pdp-rating-label">/ 5 from shoppers</span></div>
    <div class="sz-price-row"><span class="sz-price-2026" data-a-color="price">${priceText}</span></div>
    <div class="sz-ship" data-stock-status>${avail.text}</div>
    <div class="sku-row">Part number <span class="sku-cell" itemprop="sku">${product.sku}</span></div>
  </div>
</div>`);
}

function renderBuyBazaar(site, product, avail, variant) {
    const price = Number(product.fixture_price);
    const priceText = formatPrice(price, site.currency);
    const rating = product.fixture_state.rating;

    if (variant === 1) {
        return pageChrome(site, product, `
${jsonLd(product, site, avail, variant, true, true)}
<div class="_1HbYo">
  <div class="_1MS5s"><img class="_396cs4" src="https://cdn.buybazaar.in/img/${product.sku}.jpg" alt="${product.title}"></div>
  <div class="_29OxX">
    <span class="B_NuCI">${product.title}</span>
    <div class="_3LWZlK">${rating} ★</div>
    <div class="_30jeq3 _16Jk6d">${priceText}</div>
    <div class="_16FRp0">${avail.text}</div>
    <div class="_1AsJl">Product ID: ${product.sku}</div>
  </div>
</div>`);
    }

    // Redesign: ld+json keeps name+price only; availability lives behind data-stock.
    const ld = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: product.title,
        sku: product.sku,
        offers: { '@type': 'Offer', price: price.toFixed(2), priceCurrency: site.currency },
    });
    return pageChrome(site, product, `
<script type="application/ld+json">${ld}</script>
<div class="pdp-v2">
  <div class="gallery-v2"><img class="zoom-881" src="https://cdn.buybazaar.in/img/${product.sku}.jpg" alt="${product.title}"></div>
  <div class="meta-v2">
    <h1 class="pdp-title" itemprop="name">${product.title}</h1>
    <div class="rv-rating"><span itemprop="ratingValue">${rating}</span> ★ verified ratings</div>
    <div class="pdp-price" data-testid="price-block">${priceText}</div>
    <div class="stk-771" data-stock="${avail.count}">${avail.text}</div>
    <div class="_1AsJl">Product ID: ${product.sku}</div>
  </div>
</div>`);
}

function renderQuickCart(site, product, avail, variant) {
    const price = Number(product.fixture_price);
    const priceText = formatPrice(price, site.currency);
    const rating = product.fixture_state.rating;

    if (variant === 1) {
        return pageChrome(site, product, `
${jsonLd(product, site, avail, variant, true, true)}
<div class="product-grid">
  <figure class="gallery"><img data-testid="product-image" src="https://cdn.quickcart.io/img/${product.sku}.jpg" alt="${product.title}"></figure>
  <section class="buy-box">
    <h1 data-testid="product-title">${product.title}</h1>
    <div data-testid="rating">${rating}</div>
    <div data-testid="price">${priceText}</div>
    <div data-testid="stock-status">${avail.text}</div>
    <div class="sku">SKU: ${product.sku}</div>
  </section>
</div>`);
    }

    // Redesign: structured data removed entirely; hooks renamed to opaque classes.
    return pageChrome(site, product, `
<div class="pdp-wrap">
  <figure class="gal-x41"><img src="https://cdn.quickcart.io/img/${product.sku}.jpg" alt="${product.title}"></figure>
  <section class="buy-x77">
    <h1 class="prod-hd">${product.title}</h1>
    <div class="score-q1">${rating} / 5</div>
    <div class="price-bx"><span class="amt-n4" data-amount="${price.toFixed(2)}">${priceText}</span></div>
    <div class="stk-771">${avail.text}</div>
    <div class="sku">SKU: ${product.sku}</div>
  </section>
</div>`);
}

const RENDERERS = {
    marketbay: renderMarketBay,
    buybazaar: renderBuyBazaar,
    quickcart: renderQuickCart,
};

// Pick the structural variant from dom_version so repeated redesigns alternate.
function variantFor(site) {
    const v = Number(site.dom_version || 1);
    return ((v - 1) % 2) + 1;
}

// Render the current state of a product's storefront page.
// If { applyDrift } is true, price/stock/rating drift first (normal monitoring).
function renderFixture(site, product, { applyDrift = true } = {}) {
    if (applyDrift) driftFixture(product);
    const avail = availabilityInfo(product);
    const renderer = RENDERERS[site.theme] || renderMarketBay;
    const html = renderer(site, product, avail, variantFor(site));
    return { html, availability: avail };
}

module.exports = { renderFixture, driftFixture, availabilityInfo, formatPrice };
