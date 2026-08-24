export const BUSINESS_TIME_ZONE = 'Atlantic/Azores';
export const MIN_ADVANCE_HOURS = 48;
export const SLOT_STARTS = Object.freeze({ morning: 8, afternoon: 14 });
export const SLOT_ENDS = Object.freeze({ morning: 12, afternoon: 18 });

export const ACTIVE_TOURS = Object.freeze([
  'City Walk • Horta a pé',
  'Entre Montes (Horta)',
  'Miradouro do Neptuno',
  'Caldeira — perímetro',
  'Caminhada Vulcão dos Capelinhos'
]);

export const INACTIVE_TOURS = Object.freeze([
  'Caldeira Descida • Santuário da fauna local',
  'Caldeira Descida',
  'Rocha da Fajã',
  'Farol da Ribeirinha',
  'Levadas ao Cabeço dos Trinta',
  'Miradouro da Braça'
]);

export const PRIVATE_TRANSPORT_PRICE = 100;
export const PRIVATE_TRANSPORT_MAX_PEOPLE = 8;
export const RESERVATION_FEE_PER_PERSON = 15;
export const DIRECT_BOOKING_MAX_PEOPLE = 7;

export const PRIVATE_TRANSPORT_TOURS = Object.freeze([
  'Caldeira — perímetro',
  'Caminhada Vulcão dos Capelinhos'
]);

export const PRICE_TABLE = Object.freeze({
  'City Walk • Horta a pé': Object.freeze({ type: 'perPerson', tiers: Object.freeze([{ max: 4, price: 30 }]) }),
  'Entre Montes (Horta)': Object.freeze({ type: 'perPerson', tiers: Object.freeze([{ max: 4, price: 40 }, { max: 99, price: 45 }]) }),
  'Miradouro do Neptuno': Object.freeze({ type: 'perPerson', tiers: Object.freeze([{ max: 99, price: 35 }]) }),
  'Caldeira — perímetro': Object.freeze({ type: 'perPerson', tiers: Object.freeze([{ max: 99, price: 75 }]) }),
  'Caminhada Vulcão dos Capelinhos': Object.freeze({ type: 'perPerson', tiers: Object.freeze([{ max: 99, price: 90 }]) })
});

export const ALLOWED_PERIODS = Object.freeze({
  morning: 'Manhã',
  afternoon: 'Tarde'
});

const MS_PER_HOUR = 60 * 60 * 1000;

export function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[•—–-]/g, ' ')
    .replace(/\s+/g, ' ');
}

export function normalizePeriod(periodVal) {
  const p = normalizeText(periodVal);
  if (/manh|morn/.test(p)) return 'morning';
  if (/tard|after/.test(p)) return 'afternoon';
  return '';
}

export function isActiveTour(tour) {
  const normalized = normalizeText(tour);
  if (!normalized) return false;

  const inactive = INACTIVE_TOURS.some(name => {
    const candidate = normalizeText(name);
    return normalized === candidate ||
      normalized.includes(candidate) ||
      candidate.includes(normalized);
  });

  if (inactive) return false;
  return ACTIVE_TOURS.some(name => normalizeText(name) === normalized);
}

export function isPrivateTransportTour(tour) {
  const normalized = normalizeText(tour);
  if (!normalized) return false;
  return PRIVATE_TRANSPORT_TOURS.some(name => normalizeText(name) === normalized);
}

export function getTourPrice(tour, people) {
  const canonicalTour = ACTIVE_TOURS.find(active => normalizeText(active) === normalizeText(tour));
  const data = canonicalTour ? PRICE_TABLE[canonicalTour] : null;
  if (!data) return { onRequest: true };

  const tier = data.tiers.find(item => people <= item.max) || data.tiers.at(-1);
  const total = data.type === 'perGroup'
    ? tier.price
    : tier.price * people;

  return {
    onRequest: false,
    unit: tier.price,
    total
  };
}

export function calculateBookingTotals(tour, people, { privateTransport = false } = {}) {
  const base = getTourPrice(tour, people);
  if (base.onRequest) return { onRequest: true };

  const privateTransportPrice = privateTransport ? PRIVATE_TRANSPORT_PRICE : 0;
  const estimatedTotal = base.total + privateTransportPrice;
  const reservationFee = people >= 1 && people <= DIRECT_BOOKING_MAX_PEOPLE
    ? people * RESERVATION_FEE_PER_PERSON
    : 0;

  return {
    onRequest: false,
    base_total: base.total,
    unit: base.unit,
    private_transport_price: privateTransportPrice,
    estimated_total: estimatedTotal,
    reservation_fee: reservationFee,
    remaining_balance: Math.max(0, estimatedTotal - reservationFee)
  };
}

export function parseDateOnlyStrict(value) {
  const date = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, reason: 'date_format' };
  }

  const [year, month, day] = date.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, reason: 'date_invalid' };
  }

  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return { ok: false, reason: 'date_invalid' };
  }

  return { ok: true, value: date, year, month, day };
}

export function getTimeZoneOffsetMs(date, timeZone = BUSINESS_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour);
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    hour,
    Number(parts.minute),
    Number(parts.second)
  );
  return asUTC - date.getTime();
}

export function zonedDateTimeToDate(yyyyMmDd, h = 0, m = 0, s = 0, timeZone = BUSINESS_TIME_ZONE) {
  const parsed = parseDateOnlyStrict(yyyyMmDd);
  if (!parsed.ok) return null;

  const utcGuess = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, h, m, s));
  let offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  let result = new Date(utcGuess.getTime() - offset);
  const correctedOffset = getTimeZoneOffsetMs(result, timeZone);
  if (correctedOffset !== offset) {
    result = new Date(utcGuess.getTime() - correctedOffset);
  }
  return result;
}

export function addDaysToDateString(yyyyMmDd, days) {
  const parsed = parseDateOnlyStrict(yyyyMmDd);
  if (!parsed.ok) return '';
  return new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day + days))
    .toISOString()
    .slice(0, 10);
}

export function dateStringInTimeZone(date, timeZone = BUSINESS_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function getMinimumBookingDateTime(now = new Date()) {
  return new Date(now.getTime() + MIN_ADVANCE_HOURS * MS_PER_HOUR);
}

export function getSlotStartDate(yyyyMmDd, periodVal) {
  const period = normalizePeriod(periodVal);
  if (!period || !SLOT_STARTS[period]) return null;
  return zonedDateTimeToDate(yyyyMmDd, SLOT_STARTS[period], 0, 0);
}

export function isSlotBookableWithMinimumAdvance(yyyyMmDd, periodVal, now = new Date()) {
  const slotStart = getSlotStartDate(yyyyMmDd, periodVal);
  if (!slotStart) return false;
  return slotStart.getTime() >= getMinimumBookingDateTime(now).getTime();
}

export function getEarliestBookableDateString(now = new Date()) {
  const cutoff = getMinimumBookingDateTime(now);
  let date = dateStringInTimeZone(cutoff);
  if (!isSlotBookableWithMinimumAdvance(date, 'afternoon', now)) {
    date = addDaysToDateString(date, 1);
  }
  return date;
}

export function getMinimumAdvanceStatus(yyyyMmDd, periodVal, now = new Date()) {
  const earliestDate = getEarliestBookableDateString(now);
  const parsed = parseDateOnlyStrict(yyyyMmDd);
  if (!parsed.ok) return { ok: false, reason: parsed.reason, earliestDate };
  if (parsed.value < dateStringInTimeZone(now)) {
    return { ok: false, reason: 'date_past', earliestDate };
  }
  if (parsed.value < earliestDate) {
    return { ok: false, reason: 'minimum_advance', earliestDate };
  }
  const period = normalizePeriod(periodVal);
  if (!period) {
    return { ok: false, reason: 'period_invalid', earliestDate };
  }
  const ok = isSlotBookableWithMinimumAdvance(parsed.value, period, now);
  return { ok, reason: ok ? 'ok' : 'minimum_advance', earliestDate };
}

export function parseCalendarDateTime(point) {
  const raw = point?.dateTime;
  if (!raw) return null;
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw)) {
    return new Date(raw);
  }
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return new Date(raw);
  return zonedDateTimeToDate(
    match[1],
    Number(match[2]),
    Number(match[3]),
    Number(match[4] || 0),
    point.timeZone || BUSINESS_TIME_ZONE
  );
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function computeDaySlots(yyyyMmDd, events) {
  const morningStart = zonedDateTimeToDate(yyyyMmDd, SLOT_STARTS.morning, 0, 0);
  const morningEnd = zonedDateTimeToDate(yyyyMmDd, SLOT_ENDS.morning, 0, 0);
  const afternoonStart = zonedDateTimeToDate(yyyyMmDd, SLOT_STARTS.afternoon, 0, 0);
  const afternoonEnd = zonedDateTimeToDate(yyyyMmDd, SLOT_ENDS.afternoon, 0, 0);

  if (!morningStart || !morningEnd || !afternoonStart || !afternoonEnd) {
    throw new Error('Invalid date for slot computation');
  }

  let morningBusy = false;
  let afternoonBusy = false;
  let allDayBusy = false;

  for (const ev of events || []) {
    if (ev.status === 'cancelled' || ev.transparency === 'transparent') continue;

    const isAllDay = ev.start?.date && ev.end?.date;
    if (isAllDay) {
      if (ev.start.date <= yyyyMmDd && yyyyMmDd < ev.end.date) {
        allDayBusy = true;
        break;
      }
      continue;
    }

    const s = parseCalendarDateTime(ev.start);
    const e = parseCalendarDateTime(ev.end);
    if (!s || !e || Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) {
      throw new Error('Calendar event date invalid');
    }

    if (overlaps(s, e, morningStart, morningEnd)) morningBusy = true;
    if (overlaps(s, e, afternoonStart, afternoonEnd)) afternoonBusy = true;
    if (morningBusy && afternoonBusy) break;
  }

  return {
    morningFree: !morningBusy && !allDayBusy,
    afternoonFree: !afternoonBusy && !allDayBusy,
    allDayBusy
  };
}

export function applyMinimumAdvanceToSlots(yyyyMmDd, slots, now = new Date()) {
  const morningMinAdvanceOK = isSlotBookableWithMinimumAdvance(yyyyMmDd, 'morning', now);
  const afternoonMinAdvanceOK = isSlotBookableWithMinimumAdvance(yyyyMmDd, 'afternoon', now);

  return {
    ...slots,
    morningFree: slots.morningFree && morningMinAdvanceOK,
    afternoonFree: slots.afternoonFree && afternoonMinAdvanceOK,
    morningMinAdvanceOK,
    afternoonMinAdvanceOK,
    minAdvanceBlocked: !morningMinAdvanceOK || !afternoonMinAdvanceOK
  };
}

export function slotsAllowPeriod(slots, periodVal) {
  const period = normalizePeriod(periodVal);
  if (!slots || slots.allDayBusy || !period) return false;
  if (period === 'morning') return !!slots.morningFree;
  if (period === 'afternoon') return !!slots.afternoonFree;
  return false;
}
