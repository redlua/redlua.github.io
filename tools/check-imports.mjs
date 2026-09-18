#!/usr/bin/env node
/**
 * RedGet — import/export graph validator (no browser, no build step).
 *
 * `node --check` parses a file as CommonJS, so it happily accepts broken ESM.
 * This script does the checks that actually matter for ES modules:
 *
 *   1. every relative import resolves to a file that exists;
 *   2. every named import is really exported by that file;
 *   3. every `export { name }` refers to something the module declares,
 *      imports, or forwards from another module;
 *   4. no external GitHub domain appears anywhere in the shipped source.
 *
 * It shares the tokenizer with tools/bundle.mjs, so strings and comments are
 * never mistaken for code — demo.js keeps a sample `import … from './src/…'`
 * inside a README string, and the views build HTML that contains the word
 * "export".
 *
 * Usage:  node tools/check-imports.mjs [rootDir]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from './bundle.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(process.argv[2] || path.join(here, '..'));

/* ── collect files ─────────────────────────────────────────────── */
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}
const files = walk(path.join(root, 'src'), []);

/* ── statement scanning ─────────────────────────────────────────── */
/** Strip comments using the shared tokenizer (strings stay intact). */
function stripComments(src) {
  return tokenize(src).filter((seg) => seg.type !== 'comment').map((seg) => seg.text).join('');
}

/**
 * Every import/export statement in a file, found in code positions only.
 * Delegates to the scanner in bundle.mjs by re-implementing the same walk with
 * a lightweight reader — bundle.mjs keeps the authoritative version.
 */
function statementsOf(file) {
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const out = [];
  const segs = tokenize(src);

  segs.forEach((seg) => {
    if (seg.type !== 'code') return;
    const text = seg.text;
    const base = seg.start;
    const atWord = (kw, at) => text.startsWith(kw, at) &&
      !/[\w$]/.test(text[at + kw.length] || '') &&
      (at === 0 || !/[\w$]/.test(text[at - 1]));

    let k = 0;
    while (k < text.length) {
      if (atWord('import', k)) {
        const st = readImport(src, base + k);
        if (st) { out.push(st); k = st.end - base; continue; }
      }
      if (atWord('export', k)) {
        const st = readExport(src, base + k);
        if (st) { out.push(st); k = st.end - base; continue; }
      }
      k++;
    }
  });
  return out;
}

function readQuoted(src, i) {
  const quote = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === quote) return [src.slice(i + 1, j), j + 1];
    j++;
  }
  return [src.slice(i + 1), j];
}

function readImport(src, i) {
  const n = src.length;
  let j = i + 6;
  while (j < n && /\s/.test(src[j])) j++;
  const pairs = [];
  let kind = 'bare';
  let local = null;

  if (src[j] === '{') {
    const close = src.indexOf('}', j);
    if (close === -1) return null;
    kind = 'named';
    src.slice(j + 1, close).split(',').forEach((part) => {
      const bits = part.trim().split(/\s+as\s+/);
      if (bits[0]) pairs.push({ imported: bits[0].trim(), local: (bits[1] || bits[0]).trim() });
    });
    j = close + 1;
  } else if (src[j] === '*') {
    kind = 'star';
  } else if (/[A-Za-z_$]/.test(src[j] || '')) {
    kind = 'default';
    let e = j;
    while (e < n && /[\w$]/.test(src[e])) e++;
    local = src.slice(j, e);
    j = e;
  }

  while (j < n && /\s/.test(src[j])) j++;
  if (!src.startsWith('from', j)) return null;
  j += 4;
  while (j < n && /\s/.test(src[j])) j++;
  if (src[j] !== '"' && src[j] !== "'") return null;
  const [spec, after] = readQuoted(src, j);
  return { kind, spec, pairs, local, start: i, end: after };
}

function readExport(src, i) {
  const n = src.length;
  let j = i + 6;
  while (j < n && /\s/.test(src[j])) j++;

  if (src[j] === '*') return { kind: 'star', start: i, end: j + 1 };

  if (src.startsWith('default', j)) return { kind: 'default', start: i, end: j + 7 };

  if (src[j] === '{') {
    const close = src.indexOf('}', j);
    if (close === -1) return null;
    const pairs = [];
    src.slice(j + 1, close).split(',').forEach((part) => {
      const bits = part.trim().split(/\s+as\s+/);
      if (bits[0]) pairs.push({ local: bits[0].trim(), exported: (bits[1] || bits[0]).trim() });
    });
    let end = close + 1;
    while (end < n && /\s/.test(src[end])) end++;
    let spec = null;
    if (src.startsWith('from', end)) {
      let q = end + 4;
      while (q < n && /\s/.test(src[q])) q++;
      if (src[q] === '"' || src[q] === "'") { const [s2, after] = readQuoted(src, q); spec = s2; end = after; }
    }
    return { kind: spec ? 'reexport' : 'list', spec, pairs, start: i, end };
  }

  const m = /^(async\s+function\s*\*?|function\s*\*?|class|var|let|const)\s+([A-Za-z_$][\w$]*)/.exec(src.slice(j));
  if (!m) return null;
  return { kind: 'decl', name: m[2], start: i, end: j + m[0].length };
}

/** Every name a module binds: declarations plus function parameters. */
function declaredNames(src) {
  const names = new Set();
  const re = /(?:\bfunction\s*\*?\s*[\w$]*\s*\(|\bclass\s+|\bvar\s+|\blet\s+|\bconst\s+|\bfunction\s+\*\s*[\w$]+\s*\(|\bfunction\s+)([\w$]*)/g;
  let m;
  while ((m = re.exec(src))) if (m[1]) names.add(m[1]);

  // var/let/const lists: `var a = 1, b = 2;`
  const listRe = /\b(?:var|let|const)\s+([^;=\n]+(?:=[^;,\n]+)?(?:,[^;=\n]+(?:=[^;,\n]+)?)*)/g;
  while ((m = listRe.exec(src))) {
    m[1].split(',').forEach((part) => {
      const name = part.trim().split(/[\s=]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    });
  }

  // destructuring: `const { a, b } = …` and `function f({ a, b })`
  const destructureRe = /\{\s*([\w$,\s:]+?)\s*\}\s*=/g;
  while ((m = destructureRe.exec(src))) {
    m[1].split(',').forEach((part) => {
      const bits = part.trim().split(':');
      const name = (bits[1] || bits[0]).trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    });
  }

  // function parameters
  const paramRe = /\bfunction\s*[\w$]*\s*\(([^)]*)\)/g;
  while ((m = paramRe.exec(src))) {
    m[1].split(',').forEach((part) => {
      const name = part.trim().split(/[=\s]/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
    });
  }
  return names;
}

/* ── build the graph ────────────────────────────────────────────── */
const info = new Map();

function infoFor(file) {
  if (info.has(file)) return info.get(file);
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const record = { file, exports: new Set(), imports: [], exportLists: [], declared: declaredNames(src), star: false };
  info.set(file, record);

  statementsOf(file).forEach((st) => {
    if (st.kind === 'decl') record.exports.add(st.name);
    else if (st.kind === 'default') record.exports.add('default');
    else if (st.kind === 'star') record.star = true;
    else if (st.kind === 'list') {
      st.pairs.forEach((p) => record.exports.add(p.exported));
      record.exportLists.push(st.pairs);
    } else if (st.kind === 'reexport') {
      st.pairs.forEach((p) => record.exports.add(p.exported));
      const target = path.resolve(path.dirname(file), st.spec);
      record.imports.push({ spec: st.spec, target, pairs: st.pairs.map((p) => ({ imported: p.local, local: p.exported })), reexport: true });
    } else if (st.kind === 'named' || st.kind === 'default') {
      const target = path.resolve(path.dirname(file), st.spec);
      const pairs = st.kind === 'named' ? st.pairs : [{ imported: 'default', local: st.local }];
      record.imports.push({ spec: st.spec, target, pairs, reexport: false });
      pairs.forEach((p) => record.declared.add(p.local));
    }
  });

  // export * from './x.js' — merge the target's exports lazily
  const starRe = /export\s*\*\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = starRe.exec(src))) {
    const target = path.resolve(path.dirname(file), m[1]);
    if (fs.existsSync(target)) infoFor(target).exports.forEach((n) => record.exports.add(n));
  }
  return record;
}

/* ── validate ───────────────────────────────────────────────────── */
let errors = 0;
let checkedImports = 0;
let checkedExports = 0;

for (const file of files) {
  const rel = path.relative(root, file);
  const record = infoFor(file);

  for (const imp of record.imports) {
    if (!imp.spec.startsWith('.')) {
      console.error(`✗ ${rel}: bare import specifier "${imp.spec}" — the app has no dependencies`);
      errors++;
      continue;
    }
    if (!fs.existsSync(imp.target)) {
      console.error(`✗ ${rel}: cannot resolve "${imp.spec}"`);
      errors++;
      continue;
    }
    const target = infoFor(imp.target);
    for (const pair of imp.pairs) {
      checkedImports++;
      if (target.star) continue;
      if (!target.exports.has(pair.imported)) {
        console.error(`✗ ${rel}: "${pair.imported}" is not exported by ${path.relative(root, imp.target)}`);
        errors++;
      }
    }
  }

  for (const list of record.exportLists) {
    for (const pair of list) {
      checkedExports++;
      if (!record.declared.has(pair.local)) {
        console.error(`✗ ${rel}: exports "${pair.local}" but never declares or imports it`);
        errors++;
      }
    }
  }
}

/* no external GitHub domain anywhere in the shipped source */
const banned = ['raw.githubusercontent.com', 'api.github.com', 'codeload.github.com',
  'objects.githubusercontent.com', 'github.com', 'githubusercontent.com'];
const shipped = [...files, path.join(root, 'index.html')];
for (const css of walk(path.join(root, 'assets'), [])) shipped.push(css);

for (const file of shipped) {
  if (!fs.existsSync(file)) continue;
  const rel = path.relative(root, file);
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    banned.forEach((domain) => {
      if (!line.includes(domain)) return;
      // the ban list itself (inside these tools) is allowed
      if (rel.startsWith('tools' + path.sep) && /banned|forbidden/.test(line)) return;
      console.error(`✗ ${rel}:${i + 1}: forbidden external domain "${domain}"`);
      errors++;
    });
  });
}

console.log(errors === 0
  ? `✓ ${files.length} modules · ${checkedImports} named imports · ${checkedExports} re-exported names · no external domains`
  : `✗ ${errors} problem(s) found`);
process.exit(errors === 0 ? 0 : 1);
