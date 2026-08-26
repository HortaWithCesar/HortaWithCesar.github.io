import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import worker, { handleRequest } from '../worker/src/index.mjs';
import { ACTIVE_TOURS, calculateBookingTotals, normalizeText } from '../worker/src/booking-rules.mjs';
import { buildBookingEmail } from '../worker/src/email.mjs';
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

  res = await postBooking({ Trilho: 'Rocha da Fajã' });
  assert.equal(res.status, 400);
  body = await jsonBody(res);
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

async function testPrivateTransportValidationTotalsAndEmail() {
  async function assertBookingTotals({ trail, people, privateTransport = false, total, fee, balance }) {
    const transportFields = ['Caldeira — perímetro', 'Caminhada Vulcão dos Capelinhos'].includes(trail)
      ? {
          private_transport: String(privateTransport),
          private_transport_price: privateTransport ? '100' : '0'
        }
      : {};
    const form = await makeBookingForm({
      Trilho: trail,
      'Nº de pessoas': String(people),
      ...transportFields,
      estimated_total: String(total),
      reservation_fee: String(fee),
      remaining_balance: String(balance)
    });
    const result = validateBookingForm(form);
    assert.equal(result.ok, true, `${trail} ${people} pax validates`);
    assert.equal(result.booking.private_transport, privateTransport);
    assert.equal(result.booking.private_transport_price, privateTransport ? 100 : 0);
    assert.equal(result.booking.estimated_total, total);
    assert.equal(result.booking.reservation_fee, fee);
    assert.equal(result.booking.remaining_balance, balance);

    const totals = calculateBookingTotals(trail, people, { privateTransport });
    assert.equal(totals.estimated_total, total, `${trail} ${people} pax calculated total`);
    assert.equal(totals.reservation_fee, fee, `${trail} ${people} pax reservation fee`);
    assert.equal(totals.remaining_balance, balance, `${trail} ${people} pax remaining balance`);

    return result;
  }

  await assertBookingTotals({
    trail: 'City Walk • Horta a pé',
    people: 1,
    total: 40,
    fee: 15,
    balance: 25
  });
  await assertBookingTotals({
    trail: 'City Walk • Horta a pé',
    people: 2,
    total: 60,
    fee: 30,
    balance: 30
  });
  await assertBookingTotals({
    trail: 'Entre Montes (Horta)',
    people: 1,
    total: 50,
    fee: 15,
    balance: 35
  });
  await assertBookingTotals({
    trail: 'Entre Montes (Horta)',
    people: 2,
    total: 80,
    fee: 30,
    balance: 50
  });
  await assertBookingTotals({
    trail: 'Entre Montes (Horta)',
    people: 5,
    total: 200,
    fee: 75,
    balance: 125
  });
  await assertBookingTotals({
    trail: 'Miradouro do Neptuno',
    people: 1,
    total: 45,
    fee: 15,
    balance: 30
  });
  await assertBookingTotals({
    trail: 'Miradouro do Neptuno',
    people: 2,
    total: 70,
    fee: 30,
    balance: 40
  });
  await assertBookingTotals({
    trail: 'Caldeira — perímetro',
    people: 1,
    total: 100,
    fee: 15,
    balance: 85
  });
  let result = await assertBookingTotals({
    trail: 'Caldeira — perímetro',
    people: 1,
    privateTransport: true,
    total: 200,
    fee: 15,
    balance: 185
  });
  await assertBookingTotals({
    trail: 'Caldeira — perímetro',
    people: 2,
    total: 150,
    fee: 30,
    balance: 120
  });
  await assertBookingTotals({
    trail: 'Caldeira — perímetro',
    people: 2,
    privateTransport: true,
    total: 250,
    fee: 30,
    balance: 220
  });
  await assertBookingTotals({
    trail: 'Caminhada Vulcão dos Capelinhos',
    people: 1,
    total: 120,
    fee: 15,
    balance: 105
  });
  await assertBookingTotals({
    trail: 'Caminhada Vulcão dos Capelinhos',
    people: 1,
    privateTransport: true,
    total: 220,
    fee: 15,
    balance: 205
  });
  await assertBookingTotals({
    trail: 'Caminhada Vulcão dos Capelinhos',
    people: 2,
    total: 180,
    fee: 30,
    balance: 150
  });
  await assertBookingTotals({
    trail: 'Caminhada Vulcão dos Capelinhos',
    people: 2,
    privateTransport: true,
    total: 280,
    fee: 30,
    balance: 250
  });

  let email = buildBookingEmail(result.booking, makeEnv());
  assert.equal(email.ok, true);
  assert.match(email.payload.text, /Transporte privado: Sim \(\+100 € por grupo\)/);
  assert.match(email.payload.text, /Total estimado: 200 €/);
  assert.match(email.payload.text, /Taxa de reserva atual: 15 €/);
  assert.match(email.payload.text, /Saldo restante estimado: 185 €/);

  let res = await postBooking({
    Trilho: 'Caldeira — perímetro',
    'Nº de pessoas': '2',
    private_transport: 'true',
    private_transport_price: '100',
    estimated_total: '250',
    reservation_fee: '30',
    remaining_balance: '220'
  });
  assert.equal(res.status, 200);

  res = await postBooking({
    Trilho: 'Caldeira — perímetro',
    'Nº de pessoas': '2',
    private_transport: 'true',
    private_transport_price: '100',
    estimated_total: '999',
    reservation_fee: '30',
    remaining_balance: '220'
  });
  assert.equal(res.status, 400);
  let body = await jsonBody(res);
  assert.ok(body.errors.some(item => item.code === 'amount_mismatch'));

  res = await postBooking({
    Trilho: 'Caldeira — perímetro',
    'Nº de pessoas': '2',
    private_transport: 'true',
    private_transport_price: '100',
    estimated_total: '250',
    reservation_fee: '30',
    remaining_balance: '999'
  });
  assert.equal(res.status, 400);
  body = await jsonBody(res);
  assert.ok(body.errors.some(item => item.code === 'amount_mismatch'));

  res = await postBooking({
    Trilho: 'Caldeira — perímetro',
    'Nº de pessoas': '2',
    private_transport: 'true',
    private_transport_price: '50',
    estimated_total: '200',
    reservation_fee: '30',
    remaining_balance: '170'
  });
  assert.equal(res.status, 400);
  body = await jsonBody(res);
  assert.ok(body.errors.some(item => item.code === 'private_transport_price_invalid'));

  res = await postBooking({
    Trilho: 'City Walk • Horta a pé',
    private_transport: 'true',
    private_transport_price: '100'
  });
  assert.equal(res.status, 400);
  body = await jsonBody(res);
  assert.ok(body.errors.some(item => item.code === 'private_transport_tour_ineligible'));

  res = await postBooking({
    Trilho: 'Caldeira — perímetro',
    'Nº de pessoas': '9',
    private_transport: 'true',
    private_transport_price: '100'
  });
  assert.equal(res.status, 400);
  body = await jsonBody(res);
  assert.ok(body.errors.some(item => item.code === 'private_transport_people_limit'));
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
await testPrivateTransportValidationTotalsAndEmail();
await testCalendarRecheckFailClosed();
testActiveTourWhitelistMatchesFrontend();
testNoPersonalDataLoggingAndNoSecrets();

console.log('booking Worker anti-spam tests passed');
