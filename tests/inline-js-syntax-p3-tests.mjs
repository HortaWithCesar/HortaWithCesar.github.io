import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const INDEX_FILE = process.argv[2] || resolve(ROOT_DIR, 'index.html');
const html = readFileSync(INDEX_FILE, 'utf8');

const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .map((match, index) => ({
    index: index + 1,
    attrs: match[1] || '',
    code: match[2] || '',
    line: html.slice(0, match.index).split(/\r?\n/).length
  }))
  .filter(script => !/type\s*=\s*['"]application\/(?:ld\+json|json)['"]/i.test(script.attrs))
  .filter(script => script.code.trim());

const failures = [];

for (const script of scripts) {
  try {
    // Syntax-only check: compiling with Function does not run the inline script.
    new Function(script.code);
  } catch (err) {
    failures.push({
      script: script.index,
      line: script.line,
      message: err.message
    });
  }
}

assert.deepEqual(
  failures,
  [],
  `inline script syntax failures:\n${failures.map(f => `script ${f.script}, line ${f.line}: ${f.message}`).join('\n')}`
);

console.log(`inline JS syntax P3 tests passed (${scripts.length} scripts checked)`);
