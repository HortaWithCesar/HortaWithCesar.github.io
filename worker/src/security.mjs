const encoder = new TextEncoder();

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function timingSafeEqual(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

async function hmacSha256(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return bytesToBase64Url(new Uint8Array(signature));
}

function nowMs(now = new Date()) {
  return now instanceof Date ? now.getTime() : Number(now);
}

function randomNonce() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function sanitizeText(value, { maxLength = 500, multiline = false } = {}) {
  let clean = String(value ?? '')
    .normalize('NFC')
    .replace(/\u0000/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();

  if (!multiline) clean = clean.replace(/[\r\n\t]+/g, ' ');
  else clean = clean.replace(/\r\n?/g, '\n').replace(/\n{4,}/g, '\n\n\n');

  if (clean.length > maxLength) clean = clean.slice(0, maxLength).trim();
  return clean;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function hasHeaderInjection(value) {
  return /[\r\n]/.test(String(value ?? ''));
}

export function stripHeaderUnsafe(value) {
  return sanitizeText(value, { maxLength: 180 }).replace(/[:<>]/g, '');
}

export function redactEmail(value) {
  const email = String(value || '');
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}`;
}

export function redactIp(value) {
  const ip = String(value || '');
  if (!ip) return '';
  if (ip.includes(':')) return `${ip.split(':').slice(0, 2).join(':')}:...`;
  return ip.replace(/\.\d+$/, '.0');
}

export async function createSubmitToken(secret, now = new Date()) {
  if (!secret) throw new Error('TOKEN_SECRET is required');
  const startedAt = String(nowMs(now));
  const nonce = randomNonce();
  const signature = await hmacSha256(`${startedAt}.${nonce}`, secret);
  return {
    booking_started_at: startedAt,
    booking_nonce: nonce,
    booking_signature: signature
  };
}

export async function verifySubmitToken(fields, secret, {
  now = new Date(),
  minSeconds = 4,
  maxSeconds = 7200
} = {}) {
  if (!secret) return { ok: false, status: 500, code: 'token_secret_missing' };

  const startedAt = String(fields.booking_started_at || '').trim();
  const nonce = String(fields.booking_nonce || '').trim();
  const signature = String(fields.booking_signature || '').trim();

  if (!/^\d{10,}$/.test(startedAt) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !signature) {
    return { ok: false, status: 403, code: 'token_missing' };
  }

  const startedMs = Number(startedAt);
  const ageMs = nowMs(now) - startedMs;
  if (!Number.isFinite(startedMs) || ageMs < 0 - 30_000) {
    return { ok: false, status: 403, code: 'token_invalid_time' };
  }

  const expected = await hmacSha256(`${startedAt}.${nonce}`, secret);
  if (!timingSafeEqual(expected, signature)) {
    return { ok: false, status: 403, code: 'token_invalid' };
  }

  if (ageMs < Number(minSeconds) * 1000) {
    return { ok: false, status: 403, code: 'too_fast' };
  }

  if (ageMs > Number(maxSeconds) * 1000) {
    return { ok: false, status: 403, code: 'token_expired' };
  }

  return { ok: true };
}
