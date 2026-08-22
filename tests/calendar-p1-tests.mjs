import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_FILE = process.argv[2] || resolve(__dirname, '..', 'index.html');
const html = readFileSync(INDEX_FILE, 'utf8');

function extractScriptContaining(needle) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type\s*=\s*['"]application\/(ld\+json|json)['"]/i.test(match[1] || ''))
    .map((match) => match[2] || '');
  const script = scripts.find((code) => code.includes(needle));
  assert.ok(script, `script containing "${needle}" exists`);
  return script;
}

function makeElement(value = '') {
  return {
    value,
    dataset: {},
    textContent: '',
    disabled: false,
    attributes: {},
    href: '',
    setAttribute(name, val) {
      this.attributes[name] = String(val);
      if (name === 'href') this.href = String(val);
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'href') this.href = '';
    }
  };
}

function createHarness(fetchImpl = async () => ({ ok: true, json: async () => ({ items: [] }) })) {
  const elements = new Map([
    ['date_from', makeElement('')],
    ['period', makeElement('')],
    ['rv-availability', makeElement('')],
    ['bk-pay', makeElement('')]
  ]);
  const listeners = [];
  const windowObj = {
    I18N: {
      pt: {
        'booking.availability.unknown': 'Selecione uma data',
        'booking.avail.loading': 'A verificar...',
        'booking.avail.unavailable': 'Indisponivel',
        'booking.avail.both': 'Disponivel: manha e tarde',
        'booking.avail.morning': 'Disponivel: manha',
        'booking.avail.afternoon': 'Disponivel: tarde',
        'booking.avail.error': 'Nao foi possivel verificar',
        'booking.avail.minAdvance': 'Reservas disponiveis apenas com 48h de antecedencia.',
        'booking.recheck.error': 'Nao foi possivel confirmar a disponibilidade agora.',
        'booking.recheck.busy': 'Esse periodo ja nao esta disponivel.',
        'booking.recheck.pending': 'A disponibilidade ainda esta a ser confirmada.'
      }
    },
    validateBooking() {}
  };

  const context = {
    window: windowObj,
    document: {
      getElementById: (id) => elements.get(id) || null,
      querySelector: (sel) => {
        if (sel?.startsWith('#')) return elements.get(sel.slice(1)) || null;
        return null;
      },
      addEventListener: (type, fn) => listeners.push({ type, fn })
    },
    localStorage: { getItem: () => 'pt' },
    fetch: fetchImpl,
    console: { ...console, error() {} },
    setTimeout: (fn) => {
      if (typeof fn === 'function') fn();
      return 1;
    },
    clearTimeout: () => {}
  };
  context.window.window = context.window;
  vm.createContext(context);
  const configScript = extractScriptContaining('window.HWC_BOOKING_RULES =');
  const safeScript = extractScriptContaining('/* ===== HWC P0 calendar safety override ===== */');
  vm.runInContext(`${configScript}\n${safeScript}`, context, { filename: 'calendar-scripts.js' });
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

async function testMinimumAdvanceByPeriod() {
  const { window } = createHarness();
  const rules = window.HWC_BOOKING_RULES;

  const midday = new Date('2026-08-19T12:30:00Z');
  assert.equal(rules.getEarliestBookableDateString(midday), '2026-08-21');
  assert.equal(rules.getMinimumAdvanceStatus('2026-08-21', 'Manha', midday).ok, false);
  assert.equal(rules.getMinimumAdvanceStatus('2026-08-21', 'Tarde', midday).ok, true);

  const afterAfternoonSlot = new Date('2026-08-19T15:30:00Z');
  assert.equal(rules.getEarliestBookableDateString(afterAfternoonSlot), '2026-08-22');
}

async function testFinalRecheckApiFailureFailsClosed() {
  const harness = createHarness(async () => ({
    ok: false,
    status: 503,
    text: async () => 'service unavailable'
  }));
  harness.elements.get('date_from').value = '2026-08-21';
  harness.elements.get('period').value = 'Tarde';

  const result = await harness.window.HWC_BOOKING_RECHECK.confirmSelectedBookingAvailability({
    now: new Date('2026-08-19T12:00:00Z')
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'api-error');
  assert.equal(harness.elements.get('rv-availability').dataset.state, 'error');
}

async function testSimultaneousAttemptsUseOneFinalRecheck() {
  let resolveFetch;
  let fetchCalls = 0;
  const pendingFetch = new Promise((resolve) => {
    resolveFetch = resolve;
  });
  const harness = createHarness(() => {
    fetchCalls += 1;
    return pendingFetch;
  });
  harness.elements.get('date_from').value = '2026-08-21';
  harness.elements.get('period').value = 'Tarde';

  const now = new Date('2026-08-19T12:00:00Z');
  const first = harness.window.HWC_BOOKING_RECHECK.confirmSelectedBookingAvailability({ now });
  const second = await harness.window.HWC_BOOKING_RECHECK.confirmSelectedBookingAvailability({ now });

  assert.equal(second.ok, false);
  assert.equal(second.reason, 'recheck-pending');
  assert.equal(fetchCalls, 1);

  resolveFetch({ ok: true, json: async () => ({ items: [] }) });
  const firstResult = await first;
  assert.equal(firstResult.ok, true);
}

async function testAllDayAndPartialEvents() {
  const { window } = createHarness();
  const { computeDaySlots } = window.HWC_CALENDAR_TEST_HOOKS;

  const allDay = computeDaySlots('2026-08-21', [allDayEvent('2026-08-21', '2026-08-22')]);
  assert.equal(allDay.allDayBusy, true);
  assert.equal(allDay.morningFree, false);
  assert.equal(allDay.afternoonFree, false);

  const adjacentAllDay = computeDaySlots('2026-08-21', [allDayEvent('2026-08-22', '2026-08-23')]);
  assert.equal(adjacentAllDay.allDayBusy, false);
  assert.equal(adjacentAllDay.morningFree, true);
  assert.equal(adjacentAllDay.afternoonFree, true);

  const partialAfternoon = computeDaySlots('2026-08-21', [
    timedEvent('2026-08-21T14:30:00+00:00', '2026-08-21T16:00:00+00:00')
  ]);
  assert.equal(partialAfternoon.morningFree, true);
  assert.equal(partialAfternoon.afternoonFree, false);
}

async function testFinalRecheckBlocksOccupiedSlot() {
  const harness = createHarness(async () => ({
    ok: true,
    json: async () => ({
      items: [
        timedEvent('2026-08-21T14:30:00+00:00', '2026-08-21T16:00:00+00:00')
      ]
    })
  }));
  harness.elements.get('date_from').value = '2026-08-21';
  harness.elements.get('period').value = 'Tarde';

  const result = await harness.window.HWC_BOOKING_RECHECK.confirmSelectedBookingAvailability({
    now: new Date('2026-08-19T12:00:00Z')
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'busy');
  assert.equal(harness.elements.get('rv-availability').dataset.state, 'busy');
}

function testStaticGuards() {
  assert.match(html, /MIN_ADVANCE_HOURS\s*=\s*48/, '48h minimum advance is configured');
  assert.match(html, /bookingSubmitInFlight/, 'form submit has a guarded async submit flow');
  assert.match(html, /confirmSelectedBookingAvailability/, 'shared final recheck function exists');
  const recheckIndex = html.indexOf('finalRecheck().catch');
  const workerSubmitIndex = html.indexOf('fetch(BOOKING_SUBMIT_URL');
  assert.ok(
    recheckIndex > -1 && workerSubmitIndex > -1 && recheckIndex < workerSubmitIndex,
    'form submit runs final availability recheck before Worker submit'
  );
  assert.match(html, /rvPayBtn\?\.addEventListener\('click', async/, 'payment click waits for async recheck');

  for (const name of ['fetchDayEvents', 'checkDaySlots', 'checkAvailability']) {
    const defs = [...html.matchAll(new RegExp(`(?:async\\s+function\\s+${name}|function\\s+${name}|window\\.${name}\\s*=)`, 'g'))];
    assert.equal(defs.length, 1, `${name} has exactly one implementation`);
  }
}

await testMinimumAdvanceByPeriod();
await testFinalRecheckApiFailureFailsClosed();
await testSimultaneousAttemptsUseOneFinalRecheck();
await testAllDayAndPartialEvents();
await testFinalRecheckBlocksOccupiedSlot();
testStaticGuards();

console.log('calendar P1 tests passed');
