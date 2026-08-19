import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const INDEX_FILE = process.argv[2] || resolve(ROOT_DIR, 'index.html');
const html = readFileSync(INDEX_FILE, 'utf8');

const EXTERNAL_OR_NON_FILE_SCHEME = /^(?:https?:|mailto:|tel:|javascript:|data:|blob:|whatsapp:)/i;
const DYNAMIC_REF = /(?:\$\{|{{|}}|<%|%>|`|\+|encodeURIComponent\(|\bPHONE\b|\bmessage\b|window\.)/;

function decodeHtmlAttr(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function shouldIgnoreRef(ref) {
  if (!ref) return true;
  if (ref.startsWith('#')) return true;
  if (EXTERNAL_OR_NON_FILE_SCHEME.test(ref)) return true;
  if (DYNAMIC_REF.test(ref)) return true;
  return false;
}

function stripUrlNoise(ref) {
  return ref.split('#')[0].split('?')[0].trim();
}

function toLocalPath(ref) {
  const clean = stripUrlNoise(ref);
  if (!clean) return null;
  const withoutLeadingSlash = clean.replace(/^\/+/, '');
  if (!withoutLeadingSlash || withoutLeadingSlash === '.') return null;
  try {
    return resolve(ROOT_DIR, decodeURIComponent(withoutLeadingSlash));
  } catch {
    return resolve(ROOT_DIR, withoutLeadingSlash);
  }
}

function collectAttributeRefs() {
  const refs = [];
  const attrPattern = /\b(?:src|href|data-src|poster)=["']([^"']+)["']/gi;
  for (const match of html.matchAll(attrPattern)) {
    const ref = decodeHtmlAttr(match[1]);
    if (!shouldIgnoreRef(ref)) refs.push(ref);
  }
  return refs;
}

function collectSrcsetRefs() {
  const refs = [];
  const srcsetPattern = /\bsrcset=["']([^"']+)["']/gi;
  for (const match of html.matchAll(srcsetPattern)) {
    const srcset = decodeHtmlAttr(match[1]);
    for (const candidate of srcset.split(',')) {
      const ref = candidate.trim().split(/\s+/)[0];
      if (!shouldIgnoreRef(ref)) refs.push(ref);
    }
  }
  return refs;
}

function collectCssUrlRefs() {
  const refs = [];
  const cssUrlPattern = /url\((["']?)([^"')]+)\1\)/g;
  for (const match of html.matchAll(cssUrlPattern)) {
    const ref = decodeHtmlAttr(match[2]);
    if (!shouldIgnoreRef(ref)) refs.push(ref);
  }
  return refs;
}

const refs = Array.from(new Set([
  ...collectAttributeRefs(),
  ...collectSrcsetRefs(),
  ...collectCssUrlRefs()
]));

const missing = refs
  .map(ref => ({ ref, localPath: toLocalPath(ref) }))
  .filter(item => item.localPath)
  .filter(item => !existsSync(item.localPath) || !statSync(item.localPath).isFile());

assert.deepEqual(
  missing,
  [],
  `missing local asset references:\n${missing.map(item => `${item.ref} -> ${item.localPath}`).join('\n')}`
);

console.log(`asset P3 tests passed (${refs.length} local refs checked)`);
