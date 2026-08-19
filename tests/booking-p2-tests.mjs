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

function makeClassList() {
  const values = new Set();
  return {
    toggle(name, force) {
      if (force) values.add(name);
      else values.delete(name);
    },
    contains(name) {
      return values.has(name);
    }
  };
}

function makeElement({ value = '', textContent = '', dataset = {}, hidden = false, disabled = false, max = '' } = {}) {
  const attrs = new Map();
  if (hidden) attrs.set('hidden', '');
  if (disabled) attrs.set('disabled', '');

  return {
    value,
    textContent,
    dataset: { ...dataset },
    hidden,
    disabled,
    max,
    min: '',
    options: [],
    selectedIndex: -1,
    style: {},
    classList: makeClassList(),
    addEventListener() {},
    checkValidity: () => true,
    reportValidity() {},
    setAttribute(name, val) {
      attrs.set(name, String(val));
      if (name === 'min') this.min = String(val);
      if (name === 'aria-disabled') this.ariaDisabled = String(val);
    },
    getAttribute(name) {
      return attrs.has(name) ? attrs.get(name) : null;
    },
    hasAttribute(name) {
      return attrs.has(name);
    },
    removeAttribute(name) {
      attrs.delete(name);
    }
  };
}

function makeOption(value, { hidden = false, disabled = false } = {}) {
  return makeElement({ value, textContent: value, hidden, disabled });
}

function makeCard(trail, { hidden = false, disabled = false, ariaHidden = false } = {}) {
  return {
    dataset: { trail, disabled: disabled ? 'true' : undefined },
    hidden,
    hasAttribute(name) {
      return name === 'hidden' && hidden;
    },
    getAttribute(name) {
      if (name === 'aria-hidden' && ariaHidden) return 'true';
      return null;
    }
  };
}

function createHarness() {
  const trail = makeElement();
  const options = [
    makeOption('', { disabled: true }),
    makeOption('City Walk'),
    makeOption('Caldeira Descida - Santuario'),
    makeOption('Farol da Ribeirinha', { hidden: true }),
    makeOption('Miradouro da Braca', { hidden: true, disabled: true })
  ];
  trail.options = options;

  const elements = new Map([
    ['trail', trail],
    ['people', makeElement({ value: '1', max: '20' })],
    ['date_from', makeElement({ value: '2099-08-21' })],
    ['period', makeElement({ value: 'Tarde' })],
    ['rv-availability', makeElement({ textContent: 'Disponivel', dataset: { state: 'both' } })],
    ['name', makeElement({ value: 'Teste' })],
    ['email', makeElement({ value: 'teste@example.com' })],
    ['country', makeElement({ value: 'Portugal' })],
    ['btn-open-reserve', makeElement()],
    ['booking-form', makeElement()],
    ['btn-send', makeElement()],
    ['rv-modal', makeElement()],
    ['rv-close', makeElement()],
    ['rv-close-2', makeElement()],
    ['rv-pay-20', makeElement()]
  ]);

  const cards = [
    makeCard('City Walk'),
    makeCard('Caldeira Descida', { disabled: true }),
    makeCard('Farol da Ribeirinha', { hidden: true }),
    makeCard('Miradouro da Braca', { hidden: true, ariaHidden: true })
  ];

  function selectTrail(value) {
    const index = options.findIndex((option) => option.value === value);
    trail.value = value;
    trail.selectedIndex = index;
  }

  selectTrail('City Walk');

  const context = {
    window: {
      I18N: { pt: {} },
      HWC_BOOKING_RULES: null
    },
    document: {
      getElementById: (id) => elements.get(id) || null,
      querySelector: (sel) => {
        if (sel?.startsWith('#')) return elements.get(sel.slice(1)) || null;
        return null;
      },
      querySelectorAll: (sel) => {
        if (sel === '.trail-card') return cards;
        if (sel === '#trail option') return options;
        return [];
      }
    },
    localStorage: { getItem: () => 'pt' },
    MutationObserver: class {
      observe() {}
    },
    PRICE_TABLE: {
      'City Walk': { type: 'perPerson', tiers: [{ max: 99, price: 30 }] }
    },
    MIN_PAX: 1,
    MAX_PAX: 7,
    getPrice: () => ({ total: 30, unit: 30, onRequest: false }),
    eur: (value) => String(value),
    console: { ...console, warn() {} },
    HTMLFormElement: { prototype: { submit() {} } }
  };
  context.window.window = context.window;
  vm.createContext(context);

  const configScript = extractScriptContaining('window.HWC_BOOKING_RULES =');
  const bookingScript = extractScriptContaining('const SUMUP_LINKS =');
  vm.runInContext(`${configScript}\n${bookingScript}`, context, { filename: 'booking-scripts.js' });

  return { context, window: context.window, elements, selectTrail };
}

function setValidBase(harness) {
  harness.selectTrail('City Walk');
  harness.elements.get('people').value = '1';
  harness.elements.get('date_from').value = '2099-08-21';
  harness.elements.get('period').value = 'Tarde';
  harness.elements.get('rv-availability').dataset.state = 'both';
  harness.elements.get('name').value = 'Teste';
  harness.elements.get('email').value = 'teste@example.com';
  harness.elements.get('country').value = 'Portugal';
}

function testRequestAllowsEightPlusButDirectDoesNot() {
  const harness = createHarness();
  setValidBase(harness);
  harness.elements.get('people').value = '8';

  const request = harness.window.HWC_BOOKING_VALIDATION.getBookingValidation('request');
  const direct = harness.window.HWC_BOOKING_VALIDATION.getBookingValidation('direct');

  assert.equal(request.ok, true);
  assert.equal(request.hasRequestPeople, true);
  assert.equal(direct.ok, false);
  assert.equal(direct.hasDirectPeople, false);
}

function testHiddenAndDisabledTrailsFailClosed() {
  const harness = createHarness();
  setValidBase(harness);

  for (const trailName of ['Farol da Ribeirinha', 'Miradouro da Braca', 'Caldeira Descida - Santuario']) {
    harness.selectTrail(trailName);
    const request = harness.window.HWC_BOOKING_VALIDATION.getBookingValidation('request');
    const direct = harness.window.HWC_BOOKING_VALIDATION.getBookingValidation('direct');
    assert.equal(request.ok, false, `${trailName} request is blocked`);
    assert.equal(direct.ok, false, `${trailName} direct booking is blocked`);
    assert.equal(request.trailUnavailable, true, `${trailName} is marked unavailable`);
  }
}

function testUnknownAvailabilityStatesFailClosed() {
  const harness = createHarness();
  setValidBase(harness);

  for (const state of ['ok', 'available', 'error', 'pending', 'busy', '']) {
    harness.elements.get('rv-availability').dataset.state = state;
    assert.equal(harness.window.HWC_BOOKING_VALIDATION.isAvailabilityOK('Tarde'), false, `${state} is not accepted`);
    assert.equal(harness.window.HWC_BOOKING_VALIDATION.getBookingValidation('request').ok, false);
  }

  harness.elements.get('rv-availability').dataset.state = 'afternoon';
  assert.equal(harness.window.HWC_BOOKING_VALIDATION.isAvailabilityOK('Tarde'), true);
  assert.equal(harness.window.HWC_BOOKING_VALIDATION.isAvailabilityOK('Manha'), false);
}

function testStaticP2Guards() {
  assert.equal(html.includes('date' + '_to'), false, 'legacy end-date references are removed');
  assert.match(html, /function getBookingValidation\(mode = 'direct'\)/, 'shared booking validation exists');
  assert.match(html, /getBookingValidation\('request'\)/, 'request flow uses shared validation');
  assert.match(html, /getBookingValidation\('direct'\)/, 'direct flow uses shared validation');
  assert.doesNotMatch(html, /state === ['"]ok['"]|data-state=['"]ok['"]/, 'legacy ok availability state is not accepted');

  for (const state of ['pending', 'both', 'morning', 'afternoon', 'busy', 'error']) {
    assert.ok(
      html.includes(`.availability-badge[data-state="${state}"]`),
      `${state} badge state has explicit CSS`
    );
  }
}

testRequestAllowsEightPlusButDirectDoesNot();
testHiddenAndDisabledTrailsFailClosed();
testUnknownAvailabilityStatesFailClosed();
testStaticP2Guards();

console.log('booking P2 tests passed');
