import assert from 'node:assert/strict';

const productionUrl = process.env.HWC_PRODUCTION_URL || 'https://hortawithcesar.com/';
const legacyEndDateKey = ['date', 'to'].join('_');

async function fetchWithTimeout(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'user-agent': 'horta-with-cesar-production-smoke/1.0'
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url);
      if (response.ok) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await new Promise(resolve => setTimeout(resolve, attempt * 1000));
  }

  throw lastError;
}

const response = await fetchWithRetry(productionUrl);
const contentType = response.headers.get('content-type') || '';
const html = await response.text();

assert.equal(response.status, 200, 'production page should respond with HTTP 200');
assert.match(contentType, /text\/html/i, 'production response should be HTML');
assert.match(html, /Horta with C(?:é|&eacute;|Ã©)sar/i, 'production page should contain Horta with Cesar branding');
assert.match(html, /id=["']booking-form["']/i, 'production page should contain the booking form');
assert.match(html, /whatsapp_click/, 'production page should contain WhatsApp click tracking');
assert.equal(html.includes(legacyEndDateKey), false, 'production page should not contain the legacy end-date key');
assert.match(html, /<link\s+rel=["']canonical["']\s+href=["']https:\/\/hortawithcesar\.com\/["']/i, 'production page should contain the canonical URL');

console.log(`production smoke P4 tests passed (${productionUrl})`);
