#!/usr/bin/env node
/**
 * RedGet — ESM → single classic script bundler, used only by tools/smoke.mjs.
 *
 * jsdom never executes `<script type="module">`, so the smoke test cannot boot
 * the app the way a browser does. This tool performs the smallest possible
 * transform that keeps the real module semantics:
 *
 *   import { a } from './x.js'   →  every use of `a` becomes __M('./x.js').a
 *   export function f() {}       →  function f() {}  +  __ns.f = f;
 *   export { a, b as c }         →  __ns.a = a; __ns.c = b;
 *   export { a } from './x.js'   →  __ns.a = __M('./x.js').a;
 *
 * Imported names are rewritten to *member expressions* rather than destructured
 * into parameters, which preserves ESM live bindings: `ME` is reassigned by
 * setSession()/clearSession() long after its module ran, and every consumer
 * must see the new value. Each module body becomes an IIFE so `var` names can
 * never collide across modules, and modules run in dependency-first order.
 *
 * Nothing here ships to the browser — index.html still loads src/app.js
 * directly as a module.
 *
 * Usage:  node tools/bundle.mjs [entry] [--out file]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const KEYWORDS = new Set(('break case catch class const continue debugger default delete do else enum export extends ' +
  'false finally for function if import in instanceof let new null return super switch this throw true try typeof ' +
  'var void while with yield await async of static get set').split(' '));

/* ── module discovery ───────────────────────────────────────────── */
function readModule(file) {
  return fs.readFileSync(file, 'utf8');
}

function resolveSpec(fromFile, spec) {
  return path.resolve(path.dirname(fromFile), spec);
}

/**
 * Registry key for a specifier. Module paths are resolved relative to the
 * project root, because the same file can be reached as './router.js' from
 * src/core/render.js and as './core/router.js' from src/app.js — without this
 * the two would get separate namespaces and re-exports would read an empty one.
 */
function registryKey(fromFile, spec) {
  return path.relative(root, resolveSpec(fromFile, spec)).split(path.sep).join('/');
}

/** Depth-first, dependencies first. Cycles keep discovery order (safe here
 *  because every module only touches another module's exports at call time).
 *  Statements come from the tokenizer: demo.js holds a README sample that says
 *  `import { createClient } from './src/client.js'` inside a string, and a
 *  regex would go looking for that file. */
function order(entry) {
  const seen = new Set();
  const list = [];
  (function visit(file) {
    if (seen.has(file)) return;
    seen.add(file);
    scanCode(stripComments(readModule(file))).forEach((st) => {
      if ((st.kind === 'named' || st.kind === 'default' || st.kind === 'bare' || st.kind === 'star' || st.kind === 'reexport')
          && st.spec && st.spec.startsWith('.')) {
        visit(resolveSpec(file, st.spec));
      }
    });
    list.push(file);
  })(entry);
  return list;
}

/* ── tokenizer ────────────────────────────────────────────────────
   Everything downstream (comment stripping, statement scanning, identifier
   rewriting) is driven by this one scanner, because the source is full of
   traps: `esc()` contains a regex literal whose character class holds both
   quote characters, and the views build HTML strings that contain the words
   "import" and "export". */

const REGEX_KEYWORDS = new Set(('return typeof instanceof in of new delete void throw case do else yield await ' +
  'export import extends').split(' '));

/**
 * Split `src` into segments:
 *   { type: 'code'|'string'|'template'|'regex'|'comment', text, start, end, subs }
 * `subs` (templates only) holds the raw source of each `${ … }` body.
 */
export function tokenize(src) {
  const segs = [];
  const n = src.length;
  let i = 0;
  let codeStart = 0;
  let prevToken = '';

  const flushCode = (upto) => {
    if (upto > codeStart) segs.push({ type: 'code', text: src.slice(codeStart, upto), start: codeStart, end: upto });
  };

  while (i < n) {
    const ch = src[i];
    const next = src[i + 1];

    if (ch === '/' && next === '*') {
      flushCode(i);
      const close = src.indexOf('*/', i + 2);
      const end = close === -1 ? n : close + 2;
      segs.push({ type: 'comment', text: src.slice(i, end), start: i, end });
      i = end;
      codeStart = i;
      continue;
    }
    if (ch === '/' && next === '/') {
      flushCode(i);
      const nl = src.indexOf('\n', i + 2);
      const end = nl === -1 ? n : nl;
      segs.push({ type: 'comment', text: src.slice(i, end), start: i, end });
      i = end;
      codeStart = i;
      continue;
    }
    if (ch === '"' || ch === "'") {
      flushCode(i);
      const [text, end] = readQuoted(src, i, ch);
      segs.push({ type: 'string', text, start: i, end });
      prevToken = 'str';
      i = end;
      codeStart = i;
      continue;
    }
    if (ch === '`') {
      flushCode(i);
      const [text, end, subs] = readTemplate(src, i);
      segs.push({ type: 'template', text, start: i, end, subs });
      prevToken = 'str';
      i = end;
      codeStart = i;
      continue;
    }
    if (ch === '/' && startsRegex(prevToken)) {
      flushCode(i);
      const [text, end] = readRegex(src, i);
      segs.push({ type: 'regex', text, start: i, end });
      prevToken = 'str';
      i = end;
      codeStart = i;
      continue;
    }

    if (/[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < n && /[\w$]/.test(src[j])) j++;
      prevToken = src.slice(i, j);
      i = j;
      continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[\w.]/.test(src[j])) j++;
      prevToken = 'num';
      i = j;
      continue;
    }
    if (!/\s/.test(ch)) prevToken = ch;
    i++;
  }
  flushCode(n);
  return segs;
}

/** A `/` begins a regex literal unless the previous token can end an expression. */
function startsRegex(prev) {
  if (!prev) return true;
  if (prev === 'str' || prev === 'num') return false;
  if (prev === ')' || prev === ']' || prev === '}') return false;
  if (REGEX_KEYWORDS.has(prev)) return true;
  return !/^[A-Za-z_$][\w$]*$/.test(prev);
}

function stripComments(src) {
  return tokenize(src).filter((seg) => seg.type !== 'comment').map((seg) => seg.text).join('');
}

/* ── literal readers ────────────────────────────────────────────── */

function readQuoted(src, i, quote) {
  let out = src[i];
  i++;
  while (i < src.length) {
    if (src[i] === '\\') { out += src[i] + (src[i + 1] || ''); i += 2; continue; }
    out += src[i];
    if (src[i] === quote) { i++; break; }
    i++;
  }
  return [out, i];
}

/** Template literal. `${ … }` bodies are returned separately (with a \0 index
 *  marker left in the text) so callers can rewrite identifiers inside them. */
function readTemplate(src, i) {
  let out = src[i]; // opening backtick
  const subs = [];
  i++;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') { out += ch + (src[i + 1] || ''); i += 2; continue; }
    if (ch === '$' && src[i + 1] === '{') {
      let depth = 1;
      let body = '';
      i += 2;
      while (i < src.length && depth > 0) {
        const c = src[i];
        if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
        else if (c === '"' || c === "'") { const [text, next] = readQuoted(src, i, c); body += text; i = next; continue; }
        else if (c === '`') { const [text, next] = readTemplate(src, i); body += text; i = next; continue; }
        body += c;
        i++;
      }
      subs.push(body);
      out += '\u0000' + (subs.length - 1) + '\u0000';
      continue;
    }
    if (ch === '`') { out += ch; i++; break; }
    out += ch;
    i++;
  }
  return [out, i, subs];
}

function readRegex(src, i) {
  let out = src[i];
  i++;
  let inClass = false;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { out += c + (src[i + 1] || ''); i += 2; continue; }
    out += c;
    i++;
    if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) break;
    else if (c === '\n') break;
  }
  while (i < src.length && /[a-z]/.test(src[i])) { out += src[i]; i++; }
  return [out, i];
}

/* ── code scanner ─────────────────────────────────────────────────
   Regexes over raw source are unsafe: the views build HTML strings that
   contain the words "import" and "export" (docs.js literally documents the
   import route), so statements have to be found in *code* positions only.
   scanCode() walks the file and forgerts every top-level import/export
   statement together with the string literals it contains. */

function scanCode(src) {
  const statements = [];
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
        const stmt = readImport(src, base + k);
        if (stmt) { statements.push(stmt); k = stmt.end - base; continue; }
      }
      if (atWord('export', k)) {
        const stmt = readExport(src, base + k);
        if (stmt) { statements.push(stmt); k = stmt.end - base; continue; }
      }
      k++;
    }
  });

  return statements.sort((a, b) => a.start - b.start);
}

/** `import … ;` → { kind: 'named'|'default'|'bare'|'star', spec, pairs, start, end } */
function readImport(src, i) {
  const n = src.length;
  let j = i + 6;
  while (j < n && /\s/.test(src[j])) j++;

  let kind = 'bare';
  let local = null;
  const pairs = [];

  if (src[j] === '{') {
    const close = src.indexOf('}', j);
    if (close === -1) return null;
    kind = 'named';
    src.slice(j + 1, close).split(',').forEach((part) => {
      const bits = part.trim().split(/\s+as\s+/);
      if (!bits[0]) return;
      pairs.push({ imported: bits[0].trim(), local: (bits[1] || bits[0]).trim() });
    });
    j = close + 1;
  } else if (src[j] === '*') {
    const asAt = src.indexOf('as', j);
    if (asAt === -1) return null;
    let k = asAt + 2;
    while (k < n && /\s/.test(src[k])) k++;
    let end = k;
    while (end < n && /[\w$]/.test(src[end])) end++;
    kind = 'star';
    local = src.slice(k, end);
    j = end;
  } else if (/[A-Za-z_$]/.test(src[j] || '')) {
    let end = j;
    while (end < n && /[\w$]/.test(src[end])) end++;
    kind = 'default';
    local = src.slice(j, end);
    j = end;
    // `import Def, { a } from …`
    while (j < n && /\s/.test(src[j])) j++;
    if (src[j] === ',') {
      j++;
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '{') {
        const close = src.indexOf('}', j);
        if (close === -1) return null;
        src.slice(j + 1, close).split(',').forEach((part) => {
          const bits = part.trim().split(/\s+as\s+/);
          if (!bits[0]) return;
          pairs.push({ imported: bits[0].trim(), local: (bits[1] || bits[0]).trim() });
        });
        kind = 'named';
        j = close + 1;
      }
    }
  }

  while (j < n && /\s/.test(src[j])) j++;
  if (!src.startsWith('from', j)) return null;
  j += 4;
  while (j < n && /\s/.test(src[j])) j++;
  if (src[j] !== '"' && src[j] !== "'") return null;
  const [quoted, afterQuote] = readQuoted(src, j, src[j]);
  const spec = quoted.slice(1, -1);

  let end = afterQuote;
  while (end < n && /\s/.test(src[end])) end++;
  if (src[end] === ';') end++;

  return { kind, spec, pairs, local, start: i, end };
}

/** `export …` → { kind: 'decl'|'list'|'reexport'|'default'|'star', … } */
function readExport(src, i) {
  let j = i + 6;
  while (j < src.length && /\s/.test(src[j])) j++;

  if (src.startsWith('*', j)) {
    const fromAt = src.indexOf('from', j);
    const q = src.indexOf("'", fromAt) >= 0 && (src.indexOf('"', fromAt) < 0 || src.indexOf("'", fromAt) < src.indexOf('"', fromAt))
      ? src.indexOf("'", fromAt) : src.indexOf('"', fromAt);
    const spec = readQuoted(src, q, src[q])[0].slice(1, -1);
    let end = q + spec.length + 2;
    while (end < src.length && /\s/.test(src[end])) end++;
    if (src[end] === ';') end++;
    return { kind: 'star', spec, start: i, end };
  }

  if (src.startsWith('default', j)) {
    let end = j + 7;
    while (end < src.length && /\s/.test(src[end])) end++;
    if (src[end] === ';') end++;
    return { kind: 'default', start: i, end: j + 7 };
  }

  if (src[j] === '{') {
    const close = src.indexOf('}', j);
    const clause = src.slice(j + 1, close);
    let end = close + 1;
    while (end < src.length && /\s/.test(src[end])) end++;
    let spec = null;
    if (src.startsWith('from', end)) {
      const q = end + 4;
      let k = q;
      while (k < src.length && /\s/.test(src[k])) k++;
      spec = readQuoted(src, k, src[k])[0].slice(1, -1);
      end = k + spec.length + 2;
      while (end < src.length && /\s/.test(src[end])) end++;
    }
    if (src[end] === ';') end++;
    const pairs = [];
    clause.split(',').forEach((part) => {
      const bits = part.trim().split(/\s+as\s+/);
      if (!bits[0]) return;
      pairs.push({ local: bits[0].trim(), exported: (bits[1] || bits[0]).trim() });
    });
    return { kind: spec ? 'reexport' : 'list', spec, pairs, start: i, end };
  }

  // export function|async function|function*|class|var|let|const NAME
  const m = /^(async\s+function\s*\*?|function\s*\*?|class|var|let|const)\s+([A-Za-z_$][\w$]*)/.exec(src.slice(j));
  if (!m) return null;
  return { kind: 'decl', declKind: m[1], name: m[2], start: i, declStart: j, end: j + m[0].length };
}

/* ── identifier rewriting ───────────────────────────────────────── */

/**
 * Replace every occurrence of a name in `map` with its replacement, skipping
 * string literals, regex literals and comments. Template `${ … }` bodies are
 * rewritten recursively. Object shorthand (`{ ME }`) is expanded so the result
 * stays valid JavaScript.
 */
function rewriteIdentifiers(src, map) {
  const names = Object.keys(map);
  if (!names.length) return src;

  const segs = tokenize(src);
  let out = '';
  let prevTok = '';
  let prevWord = '';

  const nextSigChar = (from) => {
    let j = from;
    while (j < src.length && /\s/.test(src[j])) j++;
    return src[j] || '';
  };

  segs.forEach((seg) => {
    if (seg.type === 'comment') { return; }              // comments are dropped later
    if (seg.type === 'string' || seg.type === 'regex') { out += seg.text; prevTok = 'str'; prevWord = ''; return; }
    if (seg.type === 'template') {
      out += seg.text.replace(/\u0000(\d+)\u0000/g, (m, idx) => rewriteIdentifiers(seg.subs[Number(idx)], map));
      prevTok = 'str';
      prevWord = '';
      return;
    }

    const text = seg.text;
    const base = seg.start;
    let i = 0;
    let piece = '';

    while (i < text.length) {
      const ch = text[i];

      if (/[A-Za-z_$]/.test(ch)) {
        let j = i;
        while (j < text.length && /[\w$]/.test(text[j])) j++;
        const word = text.slice(i, j);
        const absolute = base + j;
        const after = nextSigChar(absolute);

        if (Object.prototype.hasOwnProperty.call(map, word) &&
            prevTok !== '.' && after !== ':' && !KEYWORDS.has(word)) {
          const shorthand = (prevTok === '{' || prevTok === ',') && (after === ',' || after === '}');
          piece += shorthand ? word + ': ' + map[word] : map[word];
        } else {
          piece += word;
        }
        prevTok = word;
        prevWord = word;
        i = j;
        continue;
      }

      if (/[0-9]/.test(ch)) {
        let j = i;
        while (j < text.length && /[\w.]/.test(text[j])) j++;
        piece += text.slice(i, j);
        prevTok = 'num';
        prevWord = '';
        i = j;
        continue;
      }

      piece += ch;
      if (!/\s/.test(ch)) { prevTok = ch; prevWord = ''; }
      i++;
    }

    out += piece;
  });

  return out;
}

/* ── per-module transform ───────────────────────────────────────── */
function transform(file) {
  const raw = stripComments(readModule(file));
  const selfKey = path.relative(root, file).split(path.sep).join('/');
  const statements = scanCode(raw);
  const importMap = {};
  const importSource = {};  // local name → { key, imported } so re-exports can be resolved
  const exportsList = [];   // [exportedName, expression] installed as live getters
  const problems = [];

  // Names this module declares itself (functions, classes, variables).
  const localNames = new Set();
  const declRe = /(?:^|[;{}\n])\s*(?:export\s+)?(?:async\s+)?(?:function\s*\*?|class|(?:var|let|const)\s+)\s*([A-Za-z_$][\w$]*)/g;
  let dm;
  while ((dm = declRe.exec(raw))) localNames.add(dm[1]);

  // Collect the edits first, then splice from the end so earlier offsets stay valid.
  const edits = [];

  statements.forEach((st) => {
    if (st.kind === 'named' || st.kind === 'default') {
      if (!st.spec.startsWith('.')) { problems.push('bare import specifier: ' + st.spec); return; }
      const key = registryKey(file, st.spec);
      if (st.kind === 'named') {
        st.pairs.forEach((pair) => {
          importMap[pair.local] = `__M(${JSON.stringify(key)}).${pair.imported}`;
          importSource[pair.local] = { key, imported: pair.imported };
        });
      } else {
        importMap[st.local] = `__M(${JSON.stringify(key)}).default`;
        importSource[st.local] = { key, imported: 'default' };
      }
      edits.push([st.start, st.end, '']);
      return;
    }
    if (st.kind === 'star') {
      problems.push(raw.slice(st.start, st.start + 6) === 'import'
        ? 'import * as … is not supported by the bundler'
        : 'export * is not supported by the bundler');
      return;
    }
    if (st.kind === 'bare') {
      if (!st.spec.startsWith('.')) problems.push('bare import specifier: ' + st.spec);
      edits.push([st.start, st.end, '']);
      return;
    }
    if (st.kind === 'default') { problems.push('export default is not supported by the bundler'); return; }

    if (st.kind === 'reexport') {
      if (!st.spec.startsWith('.')) { problems.push('bare export specifier: ' + st.spec); return; }
      const key = registryKey(file, st.spec);
      st.pairs.forEach((pair) => {
        exportsList.push([pair.exported, `__M(${JSON.stringify(key)}).${pair.local}`]);
      });
      edits.push([st.start, st.end, '']);
      return;
    }
    if (st.kind === 'list') {
      st.pairs.forEach((pair) => {
        // render.js does `import { parseRoute } from './router.js'` and later
        // `export { parseRoute }` — a re-export of an imported binding. The
        // name is not declared locally, so forwarding it as-is would emit a
        // ReferenceError; forward the original module's namespace instead.
        const fromImport = importSource[pair.local];
        if (!localNames.has(pair.local) && fromImport) {
          exportsList.push([pair.exported, `__M(${JSON.stringify(fromImport.key)}).${fromImport.imported}`]);
        } else {
          exportsList.push([pair.exported, pair.local]);
        }
      });
      edits.push([st.start, st.end, '']);
      return;
    }
    if (st.kind === 'decl') {
      exportsList.push([st.name, st.name]);
      // drop just the `export ` keyword, keep the declaration itself
      edits.push([st.start, st.declStart, '']);
    }
  });

  edits.sort((a, b) => b[0] - a[0]);
  let src = raw;
  edits.forEach(([from, to, text]) => { src = src.slice(0, from) + text + src.slice(to); });

  const body = rewriteIdentifiers(src, importMap);

  return {
    file,
    problems,
    code: `(function () {\n${body}\n${emitExports(selfKey, exportsList)}\n})`,
  };
}

/**
 * Exports are installed as getters, not copied values: `ME`, `DB` and
 * `searchQuery` are reassigned long after their module body ran, and ESM
 * importers must see the new value. A plain `ns.ME = ME` snapshot would leave
 * every other module signed out forever.
 */
function emitExports(selfKey, entries) {
  return entries.map(([name, expr]) =>
    `Object.defineProperty(__M(${JSON.stringify(selfKey)}), ${JSON.stringify(name)}, ` +
    `{ configurable: true, enumerable: true, get: function () { return ${expr}; } });`).join('\n');
}

/* ── bundle ─────────────────────────────────────────────────────── */
export function bundle(entryFile) {
  const entry = path.resolve(entryFile);
  const files = order(entry);
  const parts = [];
  const problems = [];

  files.forEach((file) => {
    const t = transform(file);
    t.problems.forEach((p) => problems.push(path.relative(root, file) + ': ' + p));
    parts.push(`/* ── ${path.relative(root, file)} ── */\n__run(${JSON.stringify(path.relative(root, file).split(path.sep).join('/'))}, ${t.code});`);
  });

  const banner = `/* Generated by tools/bundle.mjs — ${files.length} modules. Test harness only;
   the browser loads src/app.js as real ES modules. */\n`;

  const script = banner + `(function () {
  var __modules = {};
  var __errors = [];
  function __M(p) { return __modules[p] || (__modules[p] = {}); }
  function __run(p, factory) {
    try { __M(p); factory(); }
    catch (e) { __errors.push(p + ': ' + (e && e.stack || e)); }
  }
${parts.join('\n\n')}
  if (__errors.length) {
    window.__bundleErrors = __errors;
    throw new Error('RedGet bundle: ' + __errors.length + ' module(s) failed to initialise — ' + __errors[0].split('\\n')[0]);
  }
  window.__bundleErrors = [];
})();
`;

  return { script, files: files.map((f) => path.relative(root, f)), problems };
}

/* ── CLI ────────────────────────────────────────────────────────── */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const outFile = outIndex === -1 ? null : args[outIndex + 1];
  const entry = path.resolve(root, args.find((a) => !a.startsWith('--') && a !== outFile) || 'src/app.js');
  const result = bundle(entry);
  if (result.problems.length) {
    result.problems.forEach((p) => console.error('✗ ' + p));
    process.exit(1);
  }
  if (outFile) {
    fs.writeFileSync(path.resolve(root, outFile), result.script);
    console.log(`✓ bundled ${result.files.length} modules → ${outFile} (${(result.script.length / 1024).toFixed(0)} KB)`);
  } else {
    process.stdout.write(result.script);
  }
}
