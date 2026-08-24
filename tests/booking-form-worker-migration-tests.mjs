import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_FILE = process.argv[2] || resolve(__dirname, '..', 'index.html');
const html = readFileSync(INDEX_FILE, 'utf8');

function formById(id) {
  const match = html.match(new RegExp(`<form\\b(?=[^>]*id=["']${id}["'])[\\s\\S]*?</form>`, 'i'));
  assert.ok(match, `${id} form exists`);
  return match[0];
}

function scriptContaining(needle) {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/type\s*=\s*['"]application\/(ld\+json|json)['"]/i.test(match[1] || ''))
    .map((match) => match[2] || '');
  const script = scripts.find((code) => code.includes(needle));
  assert.ok(script, `script containing "${needle}" exists`);
  return script;
}

const bookingForm = formById('booking-form');
const reviewForm = formById('review-form');
const bookingWorkerScript = scriptContaining('const BOOKING_WORKER_BASE');

function testBookingFormUsesWorkerOnly() {
  assert.match(
    bookingForm,
    /action=["']https:\/\/booking\.hortawithcesar\.com\/api\/booking["']/,
    'booking form posts to Worker custom domain'
  );

  for (const field of ['_subject', '_template', '_captcha', '_next', '_honey']) {
    assert.doesNotMatch(bookingForm, new RegExp(`name=["']${field}["']`), `${field} removed from booking form`);
  }

  for (const field of ['booking_started_at', 'booking_nonce', 'booking_signature', 'hp_field', 'private_transport', 'private_transport_price', 'estimated_total', 'reservation_fee', 'remaining_balance']) {
    assert.match(bookingForm, new RegExp(`name=["']${field}["']`), `${field} remains present for Worker flow`);
  }
}

function testReviewFormStillUsesFormSubmit() {
  assert.match(
    reviewForm,
    /action=["']https:\/\/formsubmit\.co\/bbffe6da37eb86996e4af484b8e084f4["']/,
    'review form still posts to FormSubmit'
  );

  for (const field of ['_subject', '_template', '_captcha', '_next', '_honey']) {
    assert.match(reviewForm, new RegExp(`name=["']${field}["']`), `${field} remains on review form`);
  }

  for (const field of ['private_transport', 'private_transport_price', 'estimated_total', 'reservation_fee', 'remaining_balance']) {
    assert.doesNotMatch(reviewForm, new RegExp(`name=["']${field}["']`), `${field} stays out of review form`);
  }
}

function testWorkerSubmitFlowGuards() {
  assert.match(bookingWorkerScript, /BOOKING_TOKEN_URL\s*=\s*`\$\{BOOKING_WORKER_BASE\}\/api\/booking-token`/);
  assert.match(bookingWorkerScript, /BOOKING_SUBMIT_URL\s*=\s*`\$\{BOOKING_WORKER_BASE\}\/api\/booking`/);
  assert.match(bookingWorkerScript, /window\.HWC_BOOKING_WORKER\s*=/, 'token refresh API exposed for modal opening');
  assert.match(html, /window\.HWC_BOOKING_WORKER\?\.refreshToken\?\.\(\)/, 'modal opening refreshes token');
  assert.match(bookingWorkerScript, /bookingSubmitInFlight/, 'double submit guard exists');
  assert.match(bookingWorkerScript, /bookingSubmissionSucceeded/, 'successful submit guard exists');

  const recheckIndex = bookingWorkerScript.indexOf('finalRecheck().catch');
  const fetchIndex = bookingWorkerScript.indexOf('fetch(BOOKING_SUBMIT_URL');
  assert.ok(recheckIndex > -1 && fetchIndex > -1 && recheckIndex < fetchIndex, 'final availability recheck happens before Worker submit');

  assert.doesNotMatch(bookingWorkerScript, /requestSubmit\(/, 'booking flow no longer re-submits natively');
  assert.doesNotMatch(bookingWorkerScript, /HTMLFormElement\.prototype\.submit/, 'booking flow no longer bypasses fetch');
}

testBookingFormUsesWorkerOnly();
testReviewFormStillUsesFormSubmit();
testWorkerSubmitFlowGuards();

console.log('booking form Worker migration tests passed');
