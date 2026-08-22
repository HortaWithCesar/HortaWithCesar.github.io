import {
  ACTIVE_TOURS,
  ALLOWED_PERIODS,
  getMinimumAdvanceStatus,
  isActiveTour,
  normalizePeriod,
  normalizeText,
  parseDateOnlyStrict
} from './booking-rules.mjs';
import { hasHeaderInjection, sanitizeText } from './security.mjs';

export const FIELD_NAMES = Object.freeze({
  tour: 'Trilho',
  name: 'name',
  country: 'País',
  email: 'Email',
  date: 'Data prevista',
  period: 'period',
  people: 'Nº de pessoas',
  notes: 'notes',
  honey: '_honey',
  hp: 'hp_field',
  startedAt: 'booking_started_at',
  nonce: 'booking_nonce',
  signature: 'booking_signature'
});

export const ALLOWED_BOOKING_FIELDS = Object.freeze(new Set(Object.values(FIELD_NAMES)));

const COUNTRY_NAMES = Object.freeze([
  'Portugal', 'Espanha', 'França', 'Alemanha', 'Itália', 'Países Baixos',
  'Bélgica', 'Luxemburgo', 'Suíça', 'Áustria', 'Reino Unido', 'Irlanda',
  'Dinamarca', 'Noruega', 'Suécia', 'Finlândia', 'Islândia', 'Grécia',
  'Chipre', 'Malta', 'Polónia', 'República Checa', 'Eslováquia',
  'Eslovénia', 'Croácia', 'Hungria', 'Roménia', 'Bulgária', 'Sérvia',
  'Bósnia e Herzegovina', 'Montenegro', 'Albânia', 'Macedónia do Norte',
  'Kosovo', 'Ucrânia', 'Moldávia', 'Bielorrússia', 'Rússia', 'Turquia',
  'Israel', 'Arábia Saudita', 'Emirados Árabes Unidos', 'Índia', 'China',
  'Japão', 'Coreia do Sul', 'Tailândia', 'Indonésia', 'Malásia',
  'Vietname', 'Filipinas', 'Singapura', 'Nepal', 'Sri Lanka', 'Austrália',
  'Nova Zelândia', 'Fiji', 'África do Sul', 'Angola', 'Moçambique',
  'Cabo Verde', 'Guiné-Bissau', 'São Tomé e Príncipe', 'Marrocos',
  'Tunísia', 'Argélia', 'Egito', 'Quénia', 'Tanzânia', 'Nigéria', 'Gana',
  'Senegal', 'Namíbia', 'Botsuana', 'Etiópia', 'Zâmbia', 'Zimbabué',
  'Brasil', 'Estados Unidos', 'Canadá', 'México', 'Argentina', 'Chile',
  'Uruguai'
]);

const COUNTRY_SET = new Set(COUNTRY_NAMES.map(normalizeText));

function error(field, code, message) {
  return { field, code, message };
}

function isFileLike(value) {
  return typeof value === 'object' && value !== null && typeof value.name === 'string';
}

function getStringValues(formData, name) {
  return formData.getAll(name).filter(value => typeof value === 'string').map(value => String(value));
}

function singleValue(formData, name, errors, { required = true } = {}) {
  const rawValues = formData.getAll(name);
  if (rawValues.some(isFileLike)) {
    errors.push(error(name, 'file_not_allowed', 'Ficheiros não são permitidos neste formulário.'));
    return '';
  }

  const values = rawValues.filter(value => typeof value === 'string').map(value => String(value));
  if (required && values.length === 0) {
    errors.push(error(name, 'required', 'Campo obrigatório em falta.'));
    return '';
  }
  if (values.length > 1) {
    errors.push(error(name, 'duplicate_field', 'Campo duplicado no pedido.'));
    return '';
  }
  return values[0] || '';
}

function tourValue(formData, errors) {
  const values = getStringValues(formData, FIELD_NAMES.tour)
    .map(value => sanitizeText(value, { maxLength: 120 }))
    .filter(Boolean);
  const unique = [...new Set(values.map(normalizeText))];

  if (values.length === 0) {
    errors.push(error(FIELD_NAMES.tour, 'required', 'Escolhe um trilho válido.'));
    return '';
  }
  if (unique.length > 1) {
    errors.push(error(FIELD_NAMES.tour, 'duplicate_conflict', 'O trilho enviado tem valores contraditórios.'));
    return '';
  }
  return values[0];
}

function normalizeCountry(value) {
  return sanitizeText(value, { maxLength: 80 })
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateFieldNames(formData, errors) {
  for (const key of formData.keys()) {
    if (!ALLOWED_BOOKING_FIELDS.has(key)) {
      const code = key.startsWith('_') || key === 'form_type' ? 'control_field_rejected' : 'unexpected_field';
      errors.push(error(key, code, 'O pedido contém campos não esperados.'));
    }
  }
}

function validateEmail(value, errors) {
  const email = sanitizeText(value, { maxLength: 254 }).toLowerCase();
  const emailPattern = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;
  if (!email || hasHeaderInjection(value) || !emailPattern.test(email)) {
    errors.push(error(FIELD_NAMES.email, 'email_invalid', 'Indica um e-mail válido.'));
    return '';
  }
  return email;
}

function validatePeople(value, errors) {
  const trimmed = sanitizeText(value, { maxLength: 4 });
  if (!/^\d+$/.test(trimmed)) {
    errors.push(error(FIELD_NAMES.people, 'people_invalid', 'Indica um número de pessoas entre 1 e 20.'));
    return 0;
  }
  const people = Number(trimmed);
  if (!Number.isInteger(people) || people < 1 || people > 20) {
    errors.push(error(FIELD_NAMES.people, 'people_range', 'Indica um número de pessoas entre 1 e 20.'));
    return 0;
  }
  return people;
}

export function hasHoneypotContent(formData) {
  return getStringValues(formData, FIELD_NAMES.honey).some(value => value.trim()) ||
    getStringValues(formData, FIELD_NAMES.hp).some(value => value.trim());
}

export function validateBookingForm(formData, { now = new Date() } = {}) {
  const errors = [];
  validateFieldNames(formData, errors);

  const tour = tourValue(formData, errors);
  const name = sanitizeText(singleValue(formData, FIELD_NAMES.name, errors), { maxLength: 80 });
  const country = normalizeCountry(singleValue(formData, FIELD_NAMES.country, errors));
  const email = validateEmail(singleValue(formData, FIELD_NAMES.email, errors), errors);
  const dateFrom = sanitizeText(singleValue(formData, FIELD_NAMES.date, errors), { maxLength: 10 });
  const periodRaw = sanitizeText(singleValue(formData, FIELD_NAMES.period, errors), { maxLength: 30 });
  const people = validatePeople(singleValue(formData, FIELD_NAMES.people, errors), errors);
  const notes = sanitizeText(singleValue(formData, FIELD_NAMES.notes, errors, { required: false }), {
    maxLength: 1000,
    multiline: true
  });

  if (!name || name.length < 2 || hasHeaderInjection(name)) {
    errors.push(error(FIELD_NAMES.name, 'name_invalid', 'Indica um nome válido.'));
  }

  if (!country || !/^[\p{L}\p{M} .'’-]+$/u.test(country) || !COUNTRY_SET.has(normalizeText(country))) {
    errors.push(error(FIELD_NAMES.country, 'country_invalid', 'Seleciona um país válido da lista.'));
  }

  const parsedDate = parseDateOnlyStrict(dateFrom);
  if (!parsedDate.ok) {
    errors.push(error(FIELD_NAMES.date, parsedDate.reason, 'Indica uma data real no formato correto.'));
  }

  const period = normalizePeriod(periodRaw);
  if (!period || !ALLOWED_PERIODS[period]) {
    errors.push(error(FIELD_NAMES.period, 'period_invalid', 'Seleciona manhã ou tarde.'));
  }

  if (parsedDate.ok && period) {
    const advance = getMinimumAdvanceStatus(dateFrom, periodRaw, now);
    if (!advance.ok) {
      errors.push(error(
        FIELD_NAMES.date,
        advance.reason,
        'As reservas precisam de pelo menos 48h de antecedência.'
      ));
    }
  }

  if (!isActiveTour(tour)) {
    errors.push(error(FIELD_NAMES.tour, 'tour_inactive', 'Este trilho não está disponível para pedido online.'));
  }

  if (notes && /https?:\/\/|www\./i.test(notes) && (notes.match(/https?:\/\/|www\./gi) || []).length > 2) {
    errors.push(error(FIELD_NAMES.notes, 'notes_suspicious', 'A mensagem contém demasiados links.'));
  }

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    booking: {
      tour,
      tour_key: ACTIVE_TOURS.find(active => normalizeText(active) === normalizeText(tour)) || tour,
      name,
      country,
      email,
      date_from: dateFrom,
      period: ALLOWED_PERIODS[period],
      period_key: period,
      people,
      notes,
      group_type: people >= 8 ? 'manual_request' : 'standard_request'
    }
  };
}
