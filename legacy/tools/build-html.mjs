#!/usr/bin/env node
/**
 * RedGet — build index.html from index.template.html.
 *
 * There is no bundler and no build pipeline for the application itself (every
 * module is served as authored). This single script exists for one reason: the
 * icon sprite must be inline so that <use href="#icon-*"> works with zero extra
 * requests and stays available when the page is opened from the filesystem.
 *
 *   node tools/build-html.mjs           # writes index.html
 *   node tools/build-html.mjs --check    # exits 1 when index.html is stale
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const TEMPLATE = resolve(ROOT, 'index.template.html');
const SPRITE = resolve(ROOT, 'assets/icons/sprite.svg');
const OUTPUT = resolve(ROOT, 'index.html');
const CHECK = process.argv.includes('--check');

function build() {
  const template = readFileSync(TEMPLATE, 'utf8');
  const spriteSource = readFileSync(SPRITE, 'utf8');

  // Keep the <symbol> definitions, drop the XML declaration and wrapper <svg>
  // attributes that would conflict with the host document.
  const symbols = spriteSource
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[\s\S]*?>/g, '')
    .match(/<symbol[\s\S]*?<\/symbol>/g) || [];

  const injected = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">\n<defs>\n${symbols.join('\n')}\n</defs>\n</svg>`;

  if (!template.includes('<!--SPRITE-->')) {
    throw new Error('index.template.html is missing the <!--SPRITE--> placeholder');
  }
  if (symbols.length === 0) {
    throw new Error('assets/icons/sprite.svg contains no <symbol> elements');
  }

  return { html: template.replace('<!--SPRITE-->', injected), symbols: symbols.length };
}

const { html, symbols } = build();

if (CHECK) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : null;
  if (current === html) {
    console.log(`index.html: up to date (${symbols} symbols)`);
    process.exit(0);
  }
  console.error('index.html is stale — run: node tools/build-html.mjs');
  process.exit(1);
}

writeFileSync(OUTPUT, html, 'utf8');
const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
console.log(`index.html: ${symbols} symbols inlined, ${kb} KB`);
