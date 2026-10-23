// Dynamic selector engine.
//
// A "selector" here is a *candidate* — one member of an ordered fallback
// chain stored per (site, field). For every scrape the engine walks the
// chain, times each candidate, and records which one actually matched
// (a rich selector-trace). When every candidate for a field misses, the
// engine runs its *healing* heuristics: ordered probes that look for the
// value through attribute patterns, class-name fragments, microdata and
// raw-text regexes. The first probe that finds the value is persisted as a
// new "learned" candidate, so the selector chain literally evolves with the
// site's markup.

const cheerio = require('cheerio');

const FIELDS = ['title', 'price', 'availability', 'rating', 'image', 'sku'];
const CRITICAL_FIELDS = ['title', 'price', 'availability'];

// ---------------------------------------------------------------------------
// Value extraction & normalisation
// ---------------------------------------------------------------------------

function cleanText(s) {
    return String(s || '').replace(/\s+/g, ' ').trim();
}

function parsePrice(raw) {
    if (raw == null) return null;
    const cleaned = String(raw).replace(/[^0-9.,]/g, '');
    const num = parseFloat(cleaned.replace(/,/g, ''));
    return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
}

function parseRating(raw) {
    if (raw == null) return null;
    const m = String(raw).match(/\d+(\.\d+)?/);
    if (!m) return null;
    const num = parseFloat(m[0]);
    if (!Number.isFinite(num) || num > 5.5) return null;
    return Math.round(num * 10) / 10;
}

function classifyAvailability(raw, count) {
    const text = cleanText(raw);
    // Split camelCase schema.org tokens ("InStock" → "in stock") before matching.
    const low = text.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    let status = 'unknown';
    if (/out\s*of\s*stock|currently\s*unavailable|unavailable|sold\s*out|not\s*available/.test(low)) status = 'out_of_stock';
    else if (/limited|remaining|left/.test(low)) status = 'low_stock';
    else if (/in\s*stock|available|ships|delivery/.test(low)) status = 'in_stock';

    let stockCount = count != null ? Number(count) : null;
    if (stockCount == null || !Number.isFinite(stockCount)) {
        const m = low.match(/only\s+(\d+)\s+left/) || low.match(/(\d+)\s+left/);
        if (m) stockCount = Number(m[1]);
    }
    if (status === 'in_stock' && stockCount != null && stockCount <= 10) status = 'low_stock';
    return { raw: text, status, count: stockCount };
}

function normalizeValue(field, raw, extra = {}) {
    if (raw == null || raw === '') return null;
    switch (field) {
        case 'title': return { raw: cleanText(raw) };
        case 'price': {
            const value = parsePrice(raw);
            if (value == null) return null;
            return { raw: cleanText(raw), value, currency: extra.currency || 'INR' };
        }
        case 'availability': {
            const info = classifyAvailability(raw, extra.count);
            if (info.status === 'unknown' && !info.raw) return null;
            return info;
        }
        case 'rating': {
            const value = parseRating(raw);
            return value == null ? null : { raw: cleanText(raw), value };
        }
        case 'image': {
            const url = cleanText(raw);
            return /^https?:\/\//.test(url) ? { raw: url } : null;
        }
        case 'sku': {
            const v = cleanText(raw).split(/\s{2,}|[|·]/)[0];
            return v ? { raw: v } : null;
        }
        default: return { raw: cleanText(raw) };
    }
}

// ---------------------------------------------------------------------------
// Candidate execution
// ---------------------------------------------------------------------------

function applyCandidate($, html, cand) {
    try {
        if (cand.kind === 'regex') {
            const m = String(html).match(new RegExp(cand.pattern, 'i'));
            if (m) return m[1] != null ? m[1] : m[0];
            return null;
        }
        const $el = $(cand.pattern).first();
        if (!$el.length) return null;
        if (cand.kind === 'attr') {
            const v = $el.attr(cand.attr_name);
            return v != null && v !== '' ? v : null;
        }
        const t = $el.text();
        return t && t.trim() ? t : null;
    } catch (e) {
        return null; // malformed candidate must never crash a run
    }
}

// Run the ordered candidate chain for one field.
// Returns { value, matched, tried, healed:false }.
function runCandidates($, html, field, candidates, currency) {
    const tried = [];
    const ordered = [...candidates].sort((a, b) => a.priority - b.priority);
    for (const cand of ordered) {
        const t0 = process.hrtime.bigint();
        const raw = applyCandidate($, html, cand);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        const ok = raw != null;
        tried.push({
            candidateId: cand.id,
            pattern: cand.pattern,
            kind: cand.kind,
            source: cand.source,
            priority: cand.priority,
            matched: ok,
            ms: Math.round(ms * 100) / 100,
            candidateKey: cand.__key || `${cand.kind}:${cand.pattern}`,
        });
        if (ok) {
            const value = normalizeValue(field, raw, { currency });
            if (value) return { value, matched: cand, tried, healed: false };
            tried[tried.length - 1].matched = false;
            tried[tried.length - 1].note = 'value could not be normalised';
        }
    }
    return { value: null, matched: null, tried, healed: false };
}

// ---------------------------------------------------------------------------
// Healing probes — ordered heuristics used when the whole chain misses.
// Each probe returns the candidate spec it would persist if it wins.
// ---------------------------------------------------------------------------

const PROBES = {
    title: [
        { kind: 'css', pattern: '[itemprop="name"]' },
        { kind: 'css', pattern: 'h1' },
        { kind: 'attr', pattern: 'meta[property="og:title"]', attr_name: 'content' },
        { kind: 'css', pattern: '[class*="title"]' },
        { kind: 'css', pattern: '[data-testid*="title"]' },
    ],
    price: [
        { kind: 'attr', pattern: '[itemprop="price"]', attr_name: 'content' },
        { kind: 'attr', pattern: '[data-price]', attr_name: 'data-price' },
        { kind: 'attr', pattern: '[data-amount]', attr_name: 'data-amount' },
        { kind: 'css', pattern: '[class*="price"]' },
        { kind: 'regex', pattern: '[₹$€£]\\s*([0-9][0-9.,]*)' },
    ],
    availability: [
        { kind: 'attr', pattern: '[itemprop="availability"]', attr_name: 'href' },
        { kind: 'attr', pattern: '[data-stock]', attr_name: 'data-stock' },
        { kind: 'attr', pattern: '[data-stock-status]', attr_name: 'data-stock-status' },
        { kind: 'css', pattern: '[class*="stock"]' },
        { kind: 'css', pattern: '[class*="avail"]' },
        { kind: 'regex', pattern: '\\b(only\\s+\\d+\\s+left[^<]*|\\d+\\s+left[^<]*|out of stock|in stock|currently unavailable|available)\\b' },
    ],
    rating: [
        { kind: 'css', pattern: '[itemprop="ratingValue"]' },
        { kind: 'attr', pattern: '[data-rating]', attr_name: 'data-rating' },
        { kind: 'css', pattern: '[class*="rating"]' },
        { kind: 'css', pattern: '[class*="score"]' },
        { kind: 'regex', pattern: '([0-5]\\.[0-9])\\s*(?:\\/\\s*5|out of 5|★)' },
    ],
    image: [
        { kind: 'attr', pattern: 'meta[property="og:image"]', attr_name: 'content' },
        { kind: 'css', pattern: '[itemprop="image"]' },
        { kind: 'css', pattern: 'main img, .pdp img, #dp img' },
    ],
    sku: [
        { kind: 'css', pattern: '[itemprop="sku"]' },
        { kind: 'attr', pattern: '[data-sku]', attr_name: 'data-sku' },
        { kind: 'regex', pattern: 'SKU[:\\s]+([A-Z0-9-]{4,})' },
        { kind: 'regex', pattern: 'Product ID:\\s*([A-Z0-9-]{4,})' },
        { kind: 'regex', pattern: 'ASIN:\\s*(?:<[^>]+>\\s*)*([A-Z0-9]{8,14})' },
    ],
};

function healField($, html, field, currency, tried = []) {
    const probes = PROBES[field] || [];
    for (const probe of probes) {
        const t0 = process.hrtime.bigint();
        const raw = applyCandidate($, html, probe);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        if (raw == null) continue;
        const value = normalizeValue(field, raw, { currency });
        if (!value) continue;
        tried.push({
            candidateId: null,
            pattern: probe.pattern,
            kind: probe.kind,
            source: 'probe',
            matched: true,
            healed: true,
            ms: Math.round(ms * 100) / 100,
        });
        return {
            value,
            learned: {
                field,
                pattern: probe.pattern,
                kind: probe.kind,
                attr_name: probe.attr_name || null,
            },
            tried,
        };
    }
    return { value: null, learned: null, tried };
}

// ---------------------------------------------------------------------------
// Full-page extraction
// ---------------------------------------------------------------------------

// candidatesByField: { field: [candidate rows ordered/unordered] }
function extractProduct(html, { site, candidatesByField = {} } = {}) {
    const $ = cheerio.load(html);
    const currency = site ? site.currency : 'INR';
    const extracted = {};
    const trace = [];
    const learned = [];
    const missing = [];

    for (const field of FIELDS) {
        const candidates = candidatesByField[field] || [];
        const t0 = process.hrtime.bigint();
        const res = candidates.length
            ? runCandidates($, html, field, candidates, currency)
            : { value: null, matched: null, tried: [], healed: false };

        if (!res.value) {
            const healed = healField($, html, field, currency, res.tried);
            if (healed.value) {
                res.value = healed.value;
                res.tried = healed.tried;
                res.healed = true;
                learned.push({ field, ...healed.learned });
            }
        }

        const ms = Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100;
        if (res.value) extracted[field] = res.value;
        else missing.push(field);

        trace.push({
            field,
            matched: !!res.value,
            healed: res.healed,
            usedCandidateId: res.matched ? (res.matched.id ?? null) : null,
            attempts: res.tried.length,
            ms,
            value: res.value ? (res.value.raw ?? JSON.stringify(res.value)) : null,
            candidates: res.tried,
        });
    }

    const criticalMissing = CRITICAL_FIELDS.filter((f) => missing.includes(f));
    const softMissing = missing.filter((f) => !CRITICAL_FIELDS.includes(f));
    let status = 'success';
    if (criticalMissing.length) status = 'failed';
    else if (softMissing.length) status = 'partial';

    return {
        extracted,
        trace,
        learned,
        missing,
        status,
        healed: trace.some((t) => t.healed),
    };
}

module.exports = {
    FIELDS,
    CRITICAL_FIELDS,
    extractProduct,
    parsePrice,
    parseRating,
    classifyAvailability,
    normalizeValue,
    healField,
    applyCandidate,
};
