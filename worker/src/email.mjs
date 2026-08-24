import { escapeHtml, stripHeaderUnsafe } from './security.mjs';

function envValue(env, name) {
  return String(env?.[name] || '').trim();
}

function formatEuro(value) {
  return Number.isFinite(value)
    ? `${value.toLocaleString('pt-PT')} €`
    : '';
}

function privateTransportLabel(booking) {
  if (!booking.private_transport_applicable && !booking.private_transport) return '';
  return booking.private_transport
    ? `Sim (+${formatEuro(booking.private_transport_price)} por grupo)`
    : 'Não';
}

function buildEmailText(booking) {
  const lines = [
    'Novo pedido de reserva - Horta with César',
    '',
    `Trilho: ${booking.tour}`,
    `Nome: ${booking.name}`,
    `País: ${booking.country}`,
    `Email: ${booking.email}`,
    `Data prevista: ${booking.date_from}`,
    `Período: ${booking.period}`,
    `Nº de pessoas: ${booking.people}`,
    `Tipo de pedido: ${booking.group_type}`,
  ];

  const transport = privateTransportLabel(booking);
  if (transport) {
    lines.push(`Transporte privado: ${transport}`);
  }

  if (Number.isFinite(booking.estimated_total)) {
    lines.push(`Total estimado: ${formatEuro(booking.estimated_total)}`);
  }

  if (Number.isFinite(booking.reservation_fee)) {
    lines.push(`Taxa de reserva atual: ${formatEuro(booking.reservation_fee)}`);
  }

  if (Number.isFinite(booking.remaining_balance)) {
    lines.push(`Saldo restante estimado: ${formatEuro(booking.remaining_balance)}`);
  }

  lines.push('', 'Mensagem:', booking.notes || '(sem mensagem)');
  return lines.join('\n');
}

function buildEmailHtml(booking) {
  const rows = [
    ['Trilho', booking.tour],
    ['Nome', booking.name],
    ['País', booking.country],
    ['Email', booking.email],
    ['Data prevista', booking.date_from],
    ['Período', booking.period],
    ['Nº de pessoas', String(booking.people)],
    ['Tipo de pedido', booking.group_type]
  ];
  const transport = privateTransportLabel(booking);
  if (transport) rows.push(['Transporte privado', transport]);
  if (Number.isFinite(booking.estimated_total)) rows.push(['Total estimado', formatEuro(booking.estimated_total)]);
  if (Number.isFinite(booking.reservation_fee)) rows.push(['Taxa de reserva atual', formatEuro(booking.reservation_fee)]);
  if (Number.isFinite(booking.remaining_balance)) rows.push(['Saldo restante estimado', formatEuro(booking.remaining_balance)]);

  const rowHtml = rows.map(([label, value]) =>
    `<tr><th align="left" style="padding:8px;background:#f1f1f1">${escapeHtml(label)}</th><td style="padding:8px">${escapeHtml(value)}</td></tr>`
  ).join('');

  return `<!doctype html>
<html lang="pt">
<body>
  <h2>Novo pedido de reserva - Horta with César</h2>
  <table cellpadding="0" cellspacing="0" border="1" style="border-collapse:collapse;width:100%;max-width:720px">
    ${rowHtml}
  </table>
  <h3>Mensagem</h3>
  <p style="white-space:pre-wrap">${escapeHtml(booking.notes || '(sem mensagem)')}</p>
</body>
</html>`;
}

export function buildBookingEmail(booking, env) {
  const to = envValue(env, 'BOOKING_TO_EMAIL');
  const from = envValue(env, 'BOOKING_FROM_EMAIL');
  if (!to || !from) {
    return { ok: false, code: 'email_config_missing' };
  }

  const subject = stripHeaderUnsafe(`Nova reserva - Horta with César - ${booking.tour_key} - ${booking.date_from}`);
  return {
    ok: true,
    payload: {
      from,
      to: [to],
      reply_to: booking.email,
      subject,
      text: buildEmailText(booking),
      html: buildEmailHtml(booking)
    }
  };
}

export async function sendBookingEmail(booking, env) {
  const built = buildBookingEmail(booking, env);
  if (!built.ok) return built;

  if (String(env?.MOCK_EMAIL || '').toLowerCase() === 'true') {
    return { ok: true, provider: 'mock', payload: built.payload };
  }

  const apiKey = envValue(env, 'RESEND_API_KEY');
  if (!apiKey) return { ok: false, code: 'resend_secret_missing' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(built.payload)
  });

  if (!response.ok) {
    return { ok: false, code: 'resend_failed', status: response.status };
  }

  return { ok: true, provider: 'resend' };
}
