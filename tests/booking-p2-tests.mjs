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

function attrValue(attrs, name) {
  const match = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : null;
}

function trailCardAttrs(trail) {
  for (const match of html.matchAll(/<article\b(?=[^>]*\btrail-card\b)([^>]*)>/gis)) {
    const attrs = match[1] || '';
    if (attrValue(attrs, 'data-trail') === trail) return attrs;
  }
  return '';
}

function trailOptionAttrs(value) {
  const select = html.match(/<select\b[^>]*id=["']trail["'][\s\S]*?<\/select>/i)?.[0] || '';
  for (const match of select.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)) {
    const attrs = match[1] || '';
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    const optionValue = attrValue(attrs, 'value') ?? text;
    if (optionValue === value) return attrs;
  }
  return '';
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
    getBookingTotal: (_trail, people) => ({
      total: 30 * Number(people || 0),
      unit: 30,
      onRequest: false,
      privateTransport: false,
      privateTransportPrice: 0
    }),
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
  assert.match(html, /const CAPELINHOS_TRAIL = ['"]Caminhada Vulcão dos Capelinhos['"]/, 'Capelinhos canonical trail constant exists');
  assert.match(html, /\[CAPELINHOS_TRAIL\]:\s*{\s*prefix:\s*['"]cond\.capelinhos['"]/, 'Capelinhos conditions use shared TRAIL_CONDITIONS renderer');
  assert.match(html, /renderTourConditions\(tourConditions, dict, trail\)/, 'professional conditions use shared renderer');

  for (const state of ['pending', 'both', 'morning', 'afternoon', 'busy', 'error']) {
    assert.ok(
      html.includes(`.availability-badge[data-state="${state}"]`),
      `${state} badge state has explicit CSS`
    );
  }
}

function testCommercialHiddenTrails() {
  const hiddenTrails = [
    {
      card: 'Caldeira Descida',
      option: 'Caldeira Descida • Santuário da fauna local'
    },
    {
      card: 'Rocha da Fajã',
      option: 'Rocha da Fajã'
    }
  ];

  for (const trail of hiddenTrails) {
    const cardAttrs = trailCardAttrs(trail.card);
    assert.ok(cardAttrs, `${trail.card} card exists for future reactivation`);
    assert.match(cardAttrs, /\bhidden\b/i, `${trail.card} card is hidden`);
    assert.match(cardAttrs, /aria-hidden\s*=\s*["']true["']/i, `${trail.card} card is aria hidden`);
    assert.match(cardAttrs, /data-disabled\s*=\s*["']true["']/i, `${trail.card} card is disabled`);

    const optionAttrs = trailOptionAttrs(trail.option);
    assert.ok(optionAttrs, `${trail.option} option exists for future reactivation`);
    assert.match(optionAttrs, /\bhidden\b/i, `${trail.option} option is hidden`);
    assert.match(optionAttrs, /\bdisabled\b/i, `${trail.option} option is disabled`);
  }
}

function testPrivateTransportPricingAndLimits() {
  const priceScript = extractScriptContaining('const PRICE_TABLE =');
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(`${priceScript}
globalThis.__pricing = {
  getBookingTotal,
  getPrivateTransportAvailability,
  getPrivateTransportSupplement
};`, context, { filename: 'pricing-script.js' });

  const pricing = context.__pricing;
  const frontendPriceCases = [
    ['City Walk • Horta a pé', 1, false, 40],
    ['City Walk • Horta a pé', 2, false, 60],
    ['Entre Montes (Horta)', 1, false, 50],
    ['Entre Montes (Horta)', 2, false, 80],
    ['Entre Montes (Horta)', 5, false, 200],
    ['Miradouro do Neptuno', 1, false, 45],
    ['Miradouro do Neptuno', 2, false, 70],
    ['Caldeira — perímetro', 1, false, 100],
    ['Caldeira — perímetro', 1, true, 200],
    ['Caldeira — perímetro', 2, false, 150],
    ['Caldeira — perímetro', 2, true, 250],
    ['Caminhada Vulcão dos Capelinhos', 1, false, 120],
    ['Caminhada Vulcão dos Capelinhos', 1, true, 220],
    ['Caminhada Vulcão dos Capelinhos', 2, false, 180],
    ['Caminhada Vulcão dos Capelinhos', 2, true, 280]
  ];

  for (const [trail, people, privateTransport, expectedTotal] of frontendPriceCases) {
    assert.equal(
      pricing.getBookingTotal(trail, people, { privateTransport }).total,
      expectedTotal,
      `${trail} ${people} pax${privateTransport ? ' with transport' : ''} total`
    );
  }

  assert.equal(pricing.getPrivateTransportAvailability('Caldeira — perímetro', 8).available, true);
  assert.equal(pricing.getPrivateTransportAvailability('Caldeira — perímetro', 9).available, false);
  assert.equal(pricing.getPrivateTransportAvailability('Caldeira — perímetro', 8).available, true);
  assert.equal(pricing.getPrivateTransportAvailability('Caminhada Vulcão dos Capelinhos', 8).available, true);
  assert.equal(pricing.getPrivateTransportAvailability('City Walk • Horta a pé', 2).eligible, false);
  assert.equal(pricing.getPrivateTransportSupplement('City Walk • Horta a pé', 2, true), 0);

  assert.match(html, /id=["']private-transport-field["']/, 'private transport checkbox field exists');
  assert.match(html, /name=["']private_transport["']/, 'private transport structured field exists');
  assert.match(html, /name=["']private_transport_price["']/, 'private transport price structured field exists');
  assert.match(html, /name=["']estimated_total["']/, 'estimated total structured field exists');
  assert.match(html, /name=["']reservation_fee["']/, 'reservation fee structured field exists');
  assert.match(html, /name=["']remaining_balance["']/, 'remaining balance structured field exists');
  assert.match(html, /id=["']rv-private-transport-row["']/, 'reservation summary shows private transport state');
  assert.match(html, /id=["']rv-remaining-row["']/, 'reservation summary includes remaining balance');
  assert.match(html, /getBookingTotal\(trail, peopleNum/, 'booking total uses transport aware pricing');
  assert.match(html, /syncBookingFinancialPayload\(\)/, 'booking payload syncs financial fields');
}

testRequestAllowsEightPlusButDirectDoesNot();
testHiddenAndDisabledTrailsFailClosed();
testUnknownAvailabilityStatesFailClosed();
testStaticP2Guards();
testCommercialHiddenTrails();
testPrivateTransportPricingAndLimits();

console.log('booking P2 tests passed');
