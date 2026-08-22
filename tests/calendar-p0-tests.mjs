import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_FILE = process.argv[2] || resolve(__dirname, '..', 'index.html');
const html = readFileSync(INDEX_FILE, 'utf8');
const marker = '/* ===== HWC P0 calendar safety override ===== */';

function extractSafeScript() {
  const markerAt = html.indexOf(marker);
  assert.notEqual(markerAt, -1, 'safe calendar script marker exists');

  const scriptOpen = html.lastIndexOf('<script', markerAt);
  const scriptStart = html.indexOf('>', scriptOpen) + 1;
  const scriptEnd = html.indexOf('</script>', markerAt);
  assert.ok(scriptOpen >= 0 && scriptStart > scriptOpen && scriptEnd > scriptStart, 'safe script bounds are valid');

  return html.slice(scriptStart, scriptEnd);
}

function makeElement(value = '') {
  return {
    value,
    dataset: {},
    textContent: '',
    disabled: false,
    attributes: {},
    setAttribute(name, val) {
      this.attributes[name] = String(val);
    }
  };
}

function createHarness(fetchImpl = async () => ({ ok: true, json: async () => ({ items: [] }) })) {
  const elements = new Map([
    ['date_from', makeElement('')],
    ['rv-availability', makeElement('')],
    ['bk-pay', makeElement('')],
    ['period', makeElement('')]
  ]);
  const listeners = [];
  const windowObj = {
    I18N: {
      pt: {
        'booking.availability.unknown': 'Select date',
        'booking.avail.loading': 'Loading',
        'booking.avail.unavailable': 'Busy',
        'booking.avail.both': 'Both',
        'booking.avail.morning': 'Morning',
        'booking.avail.afternoon': 'Afternoon',
        'booking.avail.error': 'Error'
      }
    },
    validateBooking() {}
  };

  const context = {
    window: windowObj,
    document: {
      getElementById: (id) => elements.get(id) || null,
      querySelector: () => null,
      addEventListener: (type, fn) => listeners.push({ type, fn })
    },
    localStorage: { getItem: () => 'pt' },
    fetch: fetchImpl,
    GCAL_ID: 'calendar@example.test',
    GCAL_KEY: 'test-key',
    fetchDayEvents: null,
    checkDaySlots: null,
    checkAvailability: null,
    console,
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout: () => {}
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(extractSafeScript(), context, { filename: 'calendar-safe-script.js' });
  return { context, window: windowObj, elements, listeners };
}

function timedEvent(start, end, extra = {}) {
  return {
    status: 'confirmed',
    start: { dateTime: start, timeZone: 'Atlantic/Azores' },
    end: { dateTime: end, timeZone: 'Atlantic/Azores' },
    ...extra
  };
}

function allDayEvent(start, end) {
  return { status: 'confirmed', start: { date: start }, end: { date: end } };
}

async function testSlots() {
  const { window } = createHarness();
  const { computeDaySlots } = window.HWC_CALENDAR_TEST_HOOKS;

  const emptyDay = computeDaySlots('2026-08-20', []);
  assert.equal(emptyDay.morningFree, true);
  assert.equal(emptyDay.afternoonFree, true);
  assert.equal(emptyDay.allDayBusy, false);

  const morning = computeDaySlots('2026-08-20', [
    timedEvent('2026-08-20T08:30:00+00:00', '2026-08-20T10:30:00+00:00')
  ]);
  assert.equal(morning.morningFree, false);
  assert.equal(morning.afternoonFree, true);

  const afternoon = computeDaySlots('2026-08-20', [
    timedEvent('2026-08-20T14:30:00+00:00', '2026-08-20T16:30:00+00:00')
  ]);
  assert.equal(afternoon.morningFree, true);
  assert.equal(afternoon.afternoonFree, false);

  const fullDay = computeDaySlots('2026-08-20', [allDayEvent('2026-08-20', '2026-08-21')]);
  assert.equal(fullDay.allDayBusy, true);
  assert.equal(fullDay.morningFree, false);
  assert.equal(fullDay.afternoonFree, false);

  const adjacentDay = computeDaySlots('2026-08-20', [allDayEvent('2026-08-21', '2026-08-22')]);
  assert.equal(adjacentDay.allDayBusy, false);
  assert.equal(adjacentDay.morningFree, true);
  assert.equal(adjacentDay.afternoonFree, true);

  const ignored = computeDaySlots('2026-08-20', [
    timedEvent('2026-08-20T09:00:00+00:00', '2026-08-20T10:00:00+00:00', { status: 'cancelled' }),
    timedEvent('2026-08-20T15:00:00+00:00', '2026-08-20T16:00:00+00:00', { transparency: 'transparent' })
  ]);
  assert.equal(ignored.morningFree, true);
  assert.equal(ignored.afternoonFree, true);

  const floatingWinter = computeDaySlots('2026-01-15', [
    timedEvent('2026-01-15T08:30:00', '2026-01-15T09:30:00')
  ]);
  assert.equal(floatingWinter.morningFree, false);
}

async function testApiErrorsFailClosed() {
  const failed = createHarness(async () => ({
    ok: false,
    status: 503,
    text: async () => 'service unavailable'
  }));
  await assert.rejects(
    () => failed.window.fetchDayEvents('2026-08-20'),
    /Calendar API 503/
  );

  const malformed = createHarness(async () => ({
    ok: true,
    json: async () => ({})
  }));
  await assert.rejects(
    () => malformed.window.fetchDayEvents('2026-08-20'),
    /response invalid/
  );
}

async function testStaleAvailabilityDoesNotOverwriteCurrentDate() {
  const harness = createHarness();
  const date = harness.elements.get('date_from');
  const availability = harness.elements.get('rv-availability');
  const pending = new Map();

  harness.window.checkDaySlots = (selectedDate) => new Promise((resolve) => {
    pending.set(selectedDate, resolve);
  });

  date.value = '2026-08-20';
  const first = harness.window.checkAvailability();

  date.value = '2026-08-21';
  const second = harness.window.checkAvailability();

  pending.get('2026-08-21')({ morningFree: false, afternoonFree: false, allDayBusy: true });
  await second;
  assert.equal(availability.dataset.state, 'busy');

  pending.get('2026-08-20')({ morningFree: true, afternoonFree: true, allDayBusy: false });
  await first;
  assert.equal(availability.dataset.state, 'busy');
}

function testStaticGuards() {
  assert.doesNotMatch(html, /res\.ok[\s\S]{0,160}return\s+\[\]/, 'calendar HTTP errors must not return []');
  assert.match(html, /function isBookingRequestAvailabilityOK\(\)/, 'booking send guard exists');
  assert.ok(
    /const valid =[\s\S]{0,180}bookingForm\.checkValidity\(\) &&[\s\S]{0,80}isBookingRequestAvailabilityOK\(\)/.test(html),
    'send button requires confirmed availability'
  );
  assert.ok(
    html.includes('if (!isBookingRequestAvailabilityOK()) {'),
    'submit handler blocks unconfirmed availability'
  );
  assert.doesNotMatch(
    html,
    /if\s*\(e\.target(?:\?\.)?\.id\s*===\s*['"]date_from['"]\)\s*checkAvailability\(\)/,
    'old direct availability listeners are not present'
  );
}

await testSlots();
await testApiErrorsFailClosed();
await testStaleAvailabilityDoesNotOverwriteCurrentDate();
testStaticGuards();

console.log('calendar P0 tests passed');
