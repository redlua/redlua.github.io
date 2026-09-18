#!/usr/bin/env node
/**
 * RedGet — static import/export audit.
 *
 * Resolves every relative ES module import in /src, /data and /tools, then
 * checks that each named import really exists in the target module's export
 * list (including `export * from` re-exports). Catches the class of bug that
 * `node --check` cannot see: a valid file importing a name nobody exports.
 *
 * Usage: node tools/import-audit.mjs [--verbose]
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const VERBOSE = process.argv.includes('--verbose');

function walk(dir, out = []) {
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try { entries = require0(current); } catch { continue; }
    for (const entry of entries) {
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
        stack.push(full);
      } else if (/\.(js|mjs)$/.test(entry.name)) out.push(full);
    }
  }
  return out;
}

import { readdirSync, statSync } from 'node:fs';
function require0(dir) {
  return readdirSync(dir, { withFileTypes: true });
}

const modules = new Map();

function resolveSpecifier(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // bare specifiers are not used
  let target = resolve(dirname(fromFile), spec);
  if (!existsSync(target)) {
    if (existsSync(`${target}.js`)) target = `${target}.js`;
    else if (existsSync(resolve(target, 'index.js'))) target = resolve(target, 'index.js');
    else return { missing: target };
  }
  return statSync(target).isDirectory() ? { missing: target } : target;
}

function exportsOf(file, seen = new Set()) {
  if (modules.has(file)) return modules.get(file);
  if (seen.has(file)) return new Set();
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  const names = new Set();

  for (const match of source.matchAll(/^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^export\s+class\s+([A-Za-z0-9_$]+)/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^export\s*\{([^}]*)\}/gm)) {
    match[1].split(',').map((part) => part.trim()).filter(Boolean).forEach((part) => {
      const as = /\bas\s+([A-Za-z0-9_$]+)$/.exec(part);
      names.add(as ? as[1] : part.replace(/^\*/, ''));
    });
  }
  for (const match of source.matchAll(/^export\s*\*\s*from\s*['"]([^'"]+)['"]/gm)) {
    const target = resolveSpecifier(file, match[1]);
    if (typeof target === 'string') exportsOf(target, seen).forEach((n) => names.add(n));
  }
  if (/^export\s+default/m.test(source)) names.add('default');

  modules.set(file, names);
  return names;
}

let problems = 0;
let checked = 0;
// /data/files.js holds *demo repository content* — template strings that look
// like source files (e.g. ROUTER_JS, STORE_JS). Those `import './store.js'`
// lines are sample text, not real bindings, so the file is skipped here; it is
// still syntax-checked by tools/syntax-check.sh.
const SKIPPED = new Set([resolve(ROOT, 'data/files.js')]);
const files = walk(ROOT).filter((f) => !SKIPPED.has(f));

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const importRe = /import\s+(?:([A-Za-z0-9_$]+)\s*,\s*)?(\{[^}]*\}|[A-Za-z0-9_$]+|\*\s+as\s+[A-Za-z0-9_$]+)?\s*from\s*['"]([^'"]+)['"]/gs;
  for (const match of source.matchAll(importRe)) {
    const clause = [match[1], match[2]].filter(Boolean).join(',').trim();
    const spec = match[3];
    const target = resolveSpecifier(file, spec);
    if (target && typeof target === 'object' && target.missing) {
      console.log(`✗ ${relative(ROOT, file)} → cannot resolve '${spec}'`);
      problems += 1;
      continue;
    }
    if (!target) continue;
    const available = exportsOf(target);
    const named = /\{([^}]*)\}/.exec(clause);
    const defaults = clause.replace(/\{[^}]*\}/g, '').replace(/,/g, ' ').trim().split(/\s+/).filter((part) => part && part !== '*');
    if (defaults.length && !available.has('default')) {
      console.log(`✗ ${relative(ROOT, file)} → no default export in '${spec}'`);
      problems += 1;
    }
    if (named) {
      named[1].split(',').map((p) => p.trim()).filter(Boolean).forEach((part) => {
        const name = part.split(/\s+as\s+/)[0].trim();
        checked += 1;
        if (!name) return;
        if (!available.has(name)) {
          console.log(`✗ ${relative(ROOT, file)} → '${spec}' does not export '${name}'`);
          problems += 1;
        } else if (VERBOSE) console.log(`  ✓ ${name} from ${spec}`);
      });
    }
  }
}

console.log(problems === 0
  ? `imports: ${files.length} modules, ${checked} named bindings, 0 problems`
  : `imports: ${problems} problem(s)`);
process.exit(problems === 0 ? 0 : 1);
