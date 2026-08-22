# Horta with César Booking Worker

Endpoint server-side para receber pedidos de reserva/contacto sem depender do FormSubmit.

## Rotas

- `GET /api/booking-token`: emite o token auxiliar anti-fast-submit.
- `POST /api/booking`: valida, faz honeypot/rate limit/recheck Calendar e envia email.

O token anti-fast-submit é apenas uma camada auxiliar. As defesas principais são validação server-side estrita, honeypot, rate limit, rejeição de campos inesperados, sanitização, headers gerados no servidor e recheck final do Calendar quando `REQUIRE_CALENDAR_RECHECK=true`.

## Secrets

Definir exclusivamente no Cloudflare Worker:

- `TOKEN_SECRET`
- `RESEND_API_KEY`
- `GCAL_API_KEY`

Estes valores não devem aparecer no repositório, frontend ou logs.

## Variáveis

Configuradas em `wrangler.toml`:

- `ALLOWED_ORIGIN`: origens permitidas por CORS. É proteção adicional, não autenticação.
- `BOOKING_TO_EMAIL`: destino dos pedidos.
- `BOOKING_FROM_EMAIL`: remetente verificado no Resend.
- `GCAL_ID`: calendário consultado.
- `REQUIRE_CALENDAR_RECHECK`: quando `true`, falha em modo seguro se o Calendar/API não confirmar disponibilidade.
- `MIN_SUBMIT_SECONDS` / `MAX_SUBMIT_SECONDS`: janela do token auxiliar.

## Deploy staging

```sh
wrangler deploy --config worker/wrangler.toml --name horta-booking-worker-staging
wrangler secret put TOKEN_SECRET --config worker/wrangler.toml --name horta-booking-worker-staging
wrangler secret put RESEND_API_KEY --config worker/wrangler.toml --name horta-booking-worker-staging
wrangler secret put GCAL_API_KEY --config worker/wrangler.toml --name horta-booking-worker-staging
```

Só depois de validar staging se deve alterar o formulário de produção para apontar para `/api/booking`.

## Rollback

O rollback imediato é manter ou repor o `action` do formulário para o endpoint anterior enquanto o Worker é corrigido. O backup antes desta fase está na branch `backup/pre-worker-antispam-7ed3b12`.
