#!/usr/bin/env node
/**
 * RedGet — icon name validator.
 *
 * `ic(name)` returns an empty string when the name is missing from ICONS, so a
 * typo silently drops an icon from a button instead of throwing. This script
 * collects every icon name used in the source and forgerts the ones that do not
 * exist.
 *
 * Usage:  node tools/check-icons.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const iconsSrc = fs.readFileSync(path.join(root, 'src/icons.js'), 'utf8');
const available = new Set();
const body = iconsSrc.slice(iconsSrc.indexOf('ICONS'));
const entry = /(?:^|[{,\n])\s*([A-Za-z_$][\w$]*)\s*:\s*(?:'|\[)/g;
let m;
while ((m = entry.exec(body))) available.add(m[1]);

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.js')) out.push(full);
  }
  return out;
}

const used = new Map(); // name → [file:line]
for (const file of walk(path.join(root, 'src'), [])) {
  if (file.endsWith('icons.js')) continue;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    const re = /\bic\(\s*'([^']+)'/g;
    let hit;
    while ((hit = re.exec(line))) {
      const name = hit[1];
      if (!used.has(name)) used.set(name, []);
      used.get(name).push(path.relative(root, file) + ':' + (i + 1));
    }
    // ic(name) where name comes from a variable is not checkable statically,
    // but `icon: 'name'` table entries are.
    const tableRe = /\bicon:\s*'([^']+)'/g;
    while ((hit = tableRe.exec(line))) {
      const name = hit[1];
      if (!used.has(name)) used.set(name, []);
      used.get(name).push(path.relative(root, file) + ':' + (i + 1) + ' (table)');
    }
  });
}

const missing = [...used.entries()].filter(([name]) => !available.has(name));
missing.sort((a, b) => a[0].localeCompare(b[0]));

console.log('icons available : ' + available.size);
console.log('icon names used : ' + used.size);
if (missing.length) {
  console.log('');
  missing.forEach(([name, where]) => console.log(`   ✗ ${name.padEnd(20)} ${where.slice(0, 3).join(', ')}`));
  console.log('');
  console.log(`✗ ${missing.length} unknown icon name(s)`);
  process.exit(1);
}
console.log('✓ every icon name used in src/ exists in ICONS');
