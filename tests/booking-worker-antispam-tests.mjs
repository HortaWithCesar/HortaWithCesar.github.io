import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { handleRequest } from '../worker/src/index.mjs';
import { ACTIVE_TOURS, normalizeText } from '../worker/src/booking-rules.mjs';
import { createSubmitToken } from '../worker/src/security.mjs';
import { validateBookingForm } from '../worker/src/validation.mjs';

globalThis.crypto ||= webcrypto;
console.warn = () => {};

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const INDEX_FILE = resolve(ROOT, 'index.html');
const WORKER_INDEX = resolve(ROOT, 'worker/src/index.mjs');
const TEST_SECRET = 'test-secret-with-enough-entropy-for-hmac';
const TEST_ORIGIN = 'https://hortawithcesar.com';
const VALID_DATE = '2099-08-22';

function makeEnv(overrides = {}) {
  return {
    TOKEN_SECRET: TEST_SECRET,
    RESEND_API_KEY: 'test-resend-secret',
    GCAL_API_KEY: 'test-calendar-secret',
    GCAL_ID: 'hortawithcesar@gmail.com',
    BOOKING_TO_EMAIL: 'hortawithcesar@gmail.com',
    BOOKING_FROM_EMAIL: 'Horta with César <reservas@hortawithcesar.com>',
    ALLOWED_ORIGIN: `${TEST_ORIGIN},https://www.hortawithcesar.com`,
    REQUIRE_CALENDAR_RECHECK: 'true',
    MIN_SUBMIT_SECONDS: '4',
    MAX_SUBMIT_SECONDS: '7200',
    MOCK_EMAIL: 'true',
    BOOKING_RATE_LIMITER: {
      async limit() {
        return { success: true };
      }
    },
    ...overrides
  };
}

async function validTokenFields(ageMs = 5000) {
  return createSubmitToken(TEST_SECRET, new Date(Date.now() - ageMs));
}

async function makeBookingForm(overrides = {}, { tokenAgeMs = 5000 } = {}) {
  const token = await validTokenFields(tokenAgeMs);
  const fields = {
    Trilho: 'City Walk • Horta a pé',
    name: 'Cliente Teste',
    País: '🇵🇹 Portugal',
    Email: 'cliente@example.com',
    'Data prevista': VALID_DATE,
    period: 'Tarde',
    'Nº de pessoas': '2',
    notes: 'Pedido normal',
    _honey: '',
    hp_field: '',
    ...token,
    ...overrides
  };

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      for (const item of value) form.append(key, item);
    } else if (value !== undefined) {
      form.append(key, value);
    }
  }
  return form;
}

function request(path, { method = 'POST', form, origin = TEST_ORIGIN } = {}) {
  return new Request(`https://worker.test${path}`, {
    method,
    headers: origin ? { Origin: origin } : {},
    body: form
  });
}

async function withMockFetch(handler, { calendarStatus = 200, calendarItems = [] } = {}) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('googleapis.com/calendar')) {
      return new Response(JSON.stringify({ items: calendarItems }), {
        status: calendarStatus,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
  try {
    return await handler();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function postBooking(overrides = {}, options = {}) {
  const form = await makeBookingForm(overrides, options);
  return withMockFetch(
    () => handleRequest(request('/api/booking', { form, origin: options.origin ?? TEST_ORIGIN }), makeEnv(options.env || {})),
    options.fetch || {}
  );
}

async function jsonBody(response) {
  return response.json();
}

async function testValidBookingAndManualGroupRequests() {
  let res = await postBooking();
  assert.equal(res.status, 200);
  let body = await jsonBody(res);
  assert.equal(body.ok, true);
  assert.equal(body.availability_checked, true);

  res = await postBooking({ 'Nº de pessoas': '8' });
  assert.equal(res.status, 200);
  body = await jsonBody(res);
  assert.equal(body.ok, true);
  assert.match(body.message, /grupos de 8/i);
}

async function testInvalidDatesAndMinimumAdvance() {
  let form = await makeBookingForm({ 'Data prevista': '1986-08-00' });
  let result = validateBookingForm(form, { now: new Date('2026-08-22T12:00:00Z') });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(item => item.code === 'date_invalid'));

  form = await makeBookingForm({ 'Data prevista': '2026-08-23', period: 'Manhã' });
  result = validateBookingForm(form, { now: new Date('2026-08-22T12:00:00Z') });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(item => item.code === 'minimum_advance'));
}

async function testStrictFieldAndValueValidation() {
  let res = await postBooking({ _subject: 'Nova reserva - Horta with César' });
  assert.equal(res.status, 400);
  let body = await jsonBody(res);
  assert.equal(body.code, 'validation_failed');
  assert.ok(body.errors.some(item => item.code === 'control_field_rejected'));

  res = await postBooking({ País: '??Mocambique' });
  assert.equal(res.status, 400);
  body = await jsonBody(res);
  assert.ok(body.errors.some(item => item.code === 'country_invalid'));

  res = await postBooking({ Email: 'evil@example.com\r\nBcc: bad@example.com' });
  assert.equal(res.status, 400);
  body = await jsonBody(res);
  assert.ok(body.errors.some(item => item.code === 'email_invalid'));

  res = await postBooking({ 'Nº de pessoas': '21' });
  assert.equal(res.status, 400);
  body = await jsonBody(res);
  assert.ok(body.errors.some(item => item.code === 'people_range'));
}

async function testInactiveAndDuplicateTours() {
  let res = await postBooking({ Trilho: 'Miradouro da Braça' });
  assert.equal(res.status, 400);
  let body = await jsonBody(res);
  assert.ok(body.errors.some(item => item.code === 'tour_inactive'));

  res = await postBooking({ Trilho: ['City Walk • Horta a pé', 'Caldeira — perímetro'] });
  assert.equal(res.status, 400);
  body = await jsonBody(res);
  assert.ok(body.errors.some(item => item.code === 'duplicate_conflict'));

  res = await postBooking({ Trilho: ['City Walk • Horta a pé', ''] });
  assert.equal(res.status, 200);
}

async function testHoneypotTokenOriginAndRateLimits() {
  let res = await postBooking({ hp_field: 'filled-by-bot' });
  assert.equal(res.status, 403);

  res = await postBooking({}, { tokenAgeMs: 250 });
  assert.equal(res.status, 403);
  let body = await jsonBody(res);
  assert.equal(body.code, 'too_fast');

  res = await postBooking({}, { origin: 'https://attacker.example' });
  assert.equal(res.status, 403);

  const limitedEnv = makeEnv({
    BOOKING_RATE_LIMITER: { async limit() { return { success: false }; } }
  });
  res = await handleRequest(new Request('https://worker.test/api/booking-token', {
    method: 'GET',
    headers: { Origin: TEST_ORIGIN }
  }), limitedEnv);
  assert.equal(res.status, 429);

  const form = await makeBookingForm();
  res = await handleRequest(request('/api/booking', { form }), limitedEnv);
  assert.equal(res.status, 429);
}

async function testCalendarRecheckFailClosed() {
  let res = await postBooking({}, {
    fetch: {
      calendarItems: [{
        status: 'confirmed',
        start: { date: VALID_DATE },
        end: { date: '2099-08-23' }
      }]
    }
  });
  assert.equal(res.status, 400);
  let body = await jsonBody(res);
  assert.equal(body.code, 'availability_unavailable');

  res = await postBooking({}, {
    fetch: { calendarStatus: 503 }
  });
  assert.equal(res.status, 500);
  body = await jsonBody(res);
  assert.equal(body.code, 'calendar_api_failed');
}

function attrValue(attrs, name) {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : null;
}

function extractFrontendActiveTours() {
  const html = readFileSync(INDEX_FILE, 'utf8');
  const unavailable = new Set();

  for (const match of html.matchAll(/<article\b(?=[^>]*\btrail-card\b)([^>]*)>/gis)) {
    const attrs = match[1] || '';
    const trail = attrValue(attrs, 'data-trail');
    const inactive = /\bhidden\b/i.test(attrs) ||
      /data-disabled\s*=\s*["']true["']/i.test(attrs) ||
      /aria-hidden\s*=\s*["']true["']/i.test(attrs);
    if (trail && inactive) unavailable.add(normalizeText(trail));
  }

  const select = html.match(/<select\b[^>]*id=["']trail["'][\s\S]*?<\/select>/i)?.[0] || '';
  const active = [];
  for (const match of select.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const attrs = match[1] || '';
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    const valueAttr = attrValue(attrs, 'value');
    const value = valueAttr === null ? text : valueAttr;
    const normalized = normalizeText(value);
    const optionInactive = !normalized ||
      /\bhidden\b/i.test(attrs) ||
      /\bdisabled\b/i.test(attrs) ||
      [...unavailable].some(item => normalized === item || normalized.includes(item) || item.includes(normalized));
    if (!optionInactive) active.push(value.trim());
  }

  return active;
}

function testActiveTourWhitelistMatchesFrontend() {
  const frontend = extractFrontendActiveTours().map(normalizeText).sort();
  const workerTours = ACTIVE_TOURS.map(normalizeText).sort();
  assert.deepEqual(workerTours, frontend, 'Worker ACTIVE_TOURS must match active frontend booking tours');
}

function testNoPersonalDataLoggingAndNoSecrets() {
  const workerSource = readFileSync(WORKER_INDEX, 'utf8');
  assert.doesNotMatch(workerSource, /console\.(log|info|debug|error)\(/, 'Worker avoids noisy/PII logs');
  assert.doesNotMatch(workerSource, /booking\.(email|name|notes)/, 'Worker does not log full PII fields');
}

async function testTokenEndpointWorks() {
  const res = await worker.fetch(new Request('https://worker.test/api/booking-token', {
    method: 'GET',
    headers: { Origin: TEST_ORIGIN }
  }), makeEnv());
  assert.equal(res.status, 200);
  const body = await jsonBody(res);
  assert.equal(body.ok, true);
  assert.ok(body.booking_started_at);
  assert.ok(body.booking_nonce);
  assert.ok(body.booking_signature);
}

await testTokenEndpointWorks();
await testValidBookingAndManualGroupRequests();
await testInvalidDatesAndMinimumAdvance();
await testStrictFieldAndValueValidation();
await testInactiveAndDuplicateTours();
await testHoneypotTokenOriginAndRateLimits();
await testCalendarRecheckFailClosed();
testActiveTourWhitelistMatchesFrontend();
testNoPersonalDataLoggingAndNoSecrets();

console.log('booking Worker anti-spam tests passed');
