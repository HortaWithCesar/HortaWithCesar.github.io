# Horta with Cesar - Audit Status

Last updated: 2026-08-19

## P0

Status: resolved and covered by `tests/calendar-p0-tests.mjs`.

- Calendar API failures fail closed.
- Google Calendar windows use the business timezone.
- Stale availability responses do not overwrite newer selections.
- Booking submit requires confirmed availability.

## P1

Status: resolved or mitigated.

- Duplicate calendar implementations removed.
- Availability listeners consolidated.
- Final recheck runs before form confirmation and before payment.
- 48h minimum advance is enforced by the date input, JavaScript validation, and final recheck.
- All-day event handling uses exclusive end-date semantics.
- Google Calendar API key risk is mitigated in Google Cloud by API and HTTP referrer restrictions.
- Multichannel bookings remain an operational rule: every external booking must enter Google Calendar.

Covered by: `tests/calendar-p1-tests.mjs`.

## P2

Status: resolved and covered by `tests/booking-p2-tests.mjs`.

- Booking validation now uses a shared reusable function.
- Direct booking/payment is limited to 1-7 people.
- Manual request allows 8+ people when the other rules pass.
- Hidden or disabled trails fail closed.
- Unknown availability states fail closed.
- Legacy end-date code was removed.
- Availability badge CSS covers `pending`, `both`, `morning`, `afternoon`, `busy`, and `error`.

## P3

Status: resolved.

- P0 tests are now inside the deployable repository.
- Asset integrity is checked by `tests/assets-p3-tests.mjs`.
- Inline JavaScript syntax is checked without executing scripts by `tests/inline-js-syntax-p3-tests.mjs`.
- `npm test` runs P0, P1, P2, and P3 using Node native tooling only.
- GitHub Actions runs `npm test` before GitHub Pages deployment, so deploy fails if any audit test fails.

## P4

Status: partially resolved.

- Technical SEO updates applied: robots directive, encoded social image URLs, social image alt, Twitter Card metadata, `robots.txt`, and `sitemap.xml`.
- New meta description is pending approval and has not been changed.
- Accessibility updates applied: corrected the notes label association, added accessible names to thumbnail controls, improved the photo modal dialog semantics and keyboard close support, and added safe `rel` attributes to the footer external link.
- Operational README added.
- Production smoke test added as `tests/production-smoke-p4-tests.mjs` and exposed through `npm run smoke:production`.
- GitHub Actions production smoke workflow added separately from the deploy workflow, so production network failures do not block deploys.
- Performance/assets remain report-only in `docs/p4-assets-audit.md`; no image or video files were removed, compressed, substituted, or renamed.
- Repository hygiene remains report-only; no cleanup was applied.

## Scope Guard

These audit updates do not intentionally change UI, prices, WhatsApp links, tracking, calendar business rules, hidden tours, or commercial copy.
