import {
  BUSINESS_TIME_ZONE,
  addDaysToDateString,
  applyMinimumAdvanceToSlots,
  computeDaySlots,
  slotsAllowPeriod,
  zonedDateTimeToDate
} from './booking-rules.mjs';
import { sendBookingEmail } from './email.mjs';
import { createSubmitToken, verifySubmitToken } from './security.mjs';
import { FIELD_NAMES, hasHoneypotContent, validateBookingForm } from './validation.mjs';

const JSON_HEADERS = Object.freeze({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
});

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...headers }
  });
}

function allowedOrigins(env) {
  return String(env?.ALLOWED_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = allowedOrigins(env);
  if (origin && allowed.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
  }
  return {};
}

function originAllowed(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = allowedOrigins(env);
  return !origin || allowed.length === 0 || allowed.includes(origin);
}

function clientKey(request, purpose) {
  const ip = request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown';
  return `${purpose}:${ip}`;
}

async function rateLimit(request, env, purpose) {
  if (!env?.BOOKING_RATE_LIMITER?.limit) return { ok: true, skipped: true };
  const { success } = await env.BOOKING_RATE_LIMITER.limit({ key: clientKey(request, purpose) });
  return success ? { ok: true } : { ok: false };
}

function minSubmitSeconds(env) {
  return Number(env?.MIN_SUBMIT_SECONDS || 4);
}

function maxSubmitSeconds(env) {
  return Number(env?.MAX_SUBMIT_SECONDS || 7200);
}

async function handleOptions(request, env) {
  if (!originAllowed(request, env)) {
    return json({ ok: false, code: 'origin_not_allowed' }, 403);
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, env)
  });
}

async function handleToken(request, env) {
  const headers = corsHeaders(request, env);
  if (!originAllowed(request, env)) {
    return json({ ok: false, code: 'origin_not_allowed', message: 'Origem não permitida.' }, 403, headers);
  }

  const limited = await rateLimit(request, env, 'booking-token');
  if (!limited.ok) {
    return json({ ok: false, code: 'rate_limited', message: 'Demasiadas tentativas. Tenta novamente dentro de instantes.' }, 429, headers);
  }

  try {
    const token = await createSubmitToken(env.TOKEN_SECRET);
    return json({ ok: true, ...token }, 200, headers);
  } catch {
    return json({ ok: false, code: 'server_config', message: 'Não foi possível preparar o formulário. Tenta novamente.' }, 500, headers);
  }
}

async function fetchDayEvents(env, dateFrom) {
  const calendarId = String(env?.GCAL_ID || '').trim();
  const apiKey = String(env?.GCAL_API_KEY || '').trim();
  if (!calendarId || !apiKey) {
    return { ok: false, code: 'calendar_config_missing' };
  }

  const timeMin = zonedDateTimeToDate(dateFrom, 0, 0, 0).toISOString();
  const timeMax = zonedDateTimeToDate(addDaysToDateString(dateFrom, 1), 0, 0, 0).toISOString();
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('timeZone', BUSINESS_TIME_ZONE);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('showDeleted', 'false');

  const response = await fetch(url.toString());
  if (!response.ok) return { ok: false, code: 'calendar_api_failed', status: response.status };

  const data = await response.json().catch(() => null);
  if (!data || !Array.isArray(data.items)) {
    return { ok: false, code: 'calendar_invalid_response' };
  }
  return { ok: true, events: data.items };
}

async function recheckAvailability(env, booking) {
  if (String(env?.REQUIRE_CALENDAR_RECHECK || '').toLowerCase() !== 'true') {
    return { ok: true, checked: false };
  }

  const events = await fetchDayEvents(env, booking.date_from);
  if (!events.ok) return { ok: false, status: 500, code: events.code };

  const slots = applyMinimumAdvanceToSlots(
    booking.date_from,
    computeDaySlots(booking.date_from, events.events),
    new Date()
  );

  if (!slotsAllowPeriod(slots, booking.period)) {
    return { ok: false, status: 400, code: 'availability_unavailable' };
  }

  return { ok: true, checked: true };
}

function publicValidationErrors(errors) {
  return errors.map(item => ({
    field: item.field,
    code: item.code,
    message: item.message
  }));
}

async function handleBooking(request, env) {
  const headers = corsHeaders(request, env);
  if (!originAllowed(request, env)) {
    return json({ ok: false, code: 'origin_not_allowed', message: 'Origem não permitida.' }, 403, headers);
  }

  const limited = await rateLimit(request, env, 'booking-post');
  if (!limited.ok) {
    return json({ ok: false, code: 'rate_limited', message: 'Demasiadas tentativas. Tenta novamente dentro de instantes.' }, 429, headers);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return json({ ok: false, code: 'invalid_body', message: 'Não foi possível ler o pedido.' }, 400, headers);
  }

  if (hasHoneypotContent(formData)) {
    console.warn('booking rejected', { code: 'honeypot' });
    return json({ ok: false, code: 'blocked', message: 'Pedido bloqueado.' }, 403, headers);
  }

  const tokenResult = await verifySubmitToken({
    booking_started_at: formData.get(FIELD_NAMES.startedAt),
    booking_nonce: formData.get(FIELD_NAMES.nonce),
    booking_signature: formData.get(FIELD_NAMES.signature)
  }, env.TOKEN_SECRET, {
    minSeconds: minSubmitSeconds(env),
    maxSeconds: maxSubmitSeconds(env)
  });

  if (!tokenResult.ok) {
    console.warn('booking rejected', { code: tokenResult.code });
    return json({
      ok: false,
      code: tokenResult.code,
      message: tokenResult.status === 500
        ? 'Não foi possível validar o pedido agora. Tenta novamente.'
        : 'O formulário expirou ou foi enviado demasiado depressa. Reabre o formulário e tenta novamente.'
    }, tokenResult.status, headers);
  }

  const validation = validateBookingForm(formData);
  if (!validation.ok) {
    return json({
      ok: false,
      code: 'validation_failed',
      message: 'Revê os campos assinalados e tenta novamente.',
      errors: publicValidationErrors(validation.errors)
    }, 400, headers);
  }

  let availability;
  try {
    availability = await recheckAvailability(env, validation.booking);
  } catch {
    availability = { ok: false, status: 500, code: 'calendar_recheck_error' };
  }

  if (!availability.ok) {
    const status = availability.status || 500;
    return json({
      ok: false,
      code: availability.code,
      message: status === 400
        ? 'Esse período já não está disponível. Escolhe outra data ou período.'
        : 'Não foi possível confirmar a disponibilidade agora. Tenta novamente dentro de instantes.'
    }, status, headers);
  }

  const sent = await sendBookingEmail(validation.booking, env);
  if (!sent.ok) {
    return json({
      ok: false,
      code: sent.code,
      message: 'Não foi possível enviar o pedido agora. Tenta novamente dentro de instantes.'
    }, 500, headers);
  }

  return json({
    ok: true,
    code: 'booking_request_sent',
    message: validation.booking.people >= 8
      ? 'Pedido enviado. Para grupos de 8 ou mais pessoas, confirmamos manualmente por e-mail.'
      : 'Pedido enviado. Vou responder por e-mail assim que possível.',
    availability_checked: availability.checked === true
  }, 200, headers);
}

export async function handleRequest(request, env) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') return handleOptions(request, env);
  if (request.method === 'GET' && url.pathname === '/api/booking-token') return handleToken(request, env);
  if (request.method === 'POST' && url.pathname === '/api/booking') return handleBooking(request, env);

  return json({ ok: false, code: 'not_found' }, 404);
}

export default {
  fetch: handleRequest
};
