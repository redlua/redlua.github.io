#!/usr/bin/env node
/**
 * RedGet — link checker: nothing may dead-end.
 *
 * Boots the app in jsdom (tools/smoke.mjs provides the harness), visits a seed
 * list of pages, collects every internal navigation target it can find — both
 * `href="#/…"` attributes and inline `onclick="navigate('…')"` handlers — then
 * visits each target and fails if the router answers with the not-found view.
 *
 * Targets that are *meant* to 404 (a deleted entity, an out-of-range number)
 * can be listed in ALLOWED_DEAD with the reason.
 *
 * Usage:  node tools/check-links.mjs
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, KEY, USER, FORGE } from './smoke.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

const NOT_FOUND = 'Page not found';
const NOT_ROUTED = 'Nothing is routed at';

/** Paths that are expected to render the not-found view. Keep the reason. */
const ALLOWED_DEAD = new Map([
  // add entries like: ['#/someone/nothing', 'documents the 404 view on /docs']
]);

const SEED_ROUTES = [
  '#/',
  '#/new',
  '#/new/import',
  '#/explore',
  '#/trending',
  '#/issues',
  '#/pulls',
  '#/notifications',
  '#/projects',
  '#/projects/new',
  '#/gists',
  '#/gists/new',
  '#/codespaces',
  '#/codespaces/new',
  '#/marketplace',
  '#/copilot',
  '#/docs',
  '#/organizations',
  '#/organizations/new',
  '#/enterprises',
  '#/settings',
  '#/settings/account',
  '#/settings/appearance',
  '#/settings/security',
  '#/settings/keys',
  '#/settings/sessions',
  '#/settings/data',
  '#/' + USER,
  '#/' + USER + '?tab=forges',
  '#/' + USER + '/' + FORGE,
  '#/' + USER + '/' + FORGE + '/issues',
  '#/' + USER + '/' + FORGE + '/issues/new',
  '#/' + USER + '/' + FORGE + '/pulls',
  '#/' + USER + '/' + FORGE + '/pulls/new',
  '#/' + USER + '/' + FORGE + '/actions',
  '#/' + USER + '/' + FORGE + '/projects',
  '#/' + USER + '/' + FORGE + '/wiki',
  '#/' + USER + '/' + FORGE + '/security',
  '#/' + USER + '/' + FORGE + '/insights',
  '#/' + USER + '/' + FORGE + '/releases',
  '#/' + USER + '/' + FORGE + '/discussions',
  '#/' + USER + '/' + FORGE + '/packages',
  '#/' + USER + '/' + FORGE + '/branches',
  '#/' + USER + '/' + FORGE + '/tags',
  '#/' + USER + '/' + FORGE + '/commits/main',
  '#/' + USER + '/' + FORGE + '/blob/main/README.md',
  '#/' + USER + '/' + FORGE + '/settings',
];

/** Extract navigation targets from a rendered page. */
function collectTargets(ctx) {
  const targets = new Set();
  const document = ctx.document;

  document.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#/')) targets.add(href.slice(1));
    else if (href === '#' || href === '') targets.add('__EMPTY_HREF__');
    else if (/^(https?:)?\/\//.test(href)) targets.add('__EXTERNAL__ ' + href);
  });

  // inline onclick="navigate('/path')" and onclick="navigate('/a/'+x)"
  document.querySelectorAll('[onclick]').forEach((el) => {
    const code = el.getAttribute('onclick') || '';
    const re = /navigate\(\s*'([^']*)'/g;
    let m;
    while ((m = re.exec(code))) {
      const raw = m[1];
      // dynamic segments arrive as '/x/' + value — keep the static prefix and
      // mark it so a 404 there is forgerted as "dynamic target", not a dead link
      if (raw.endsWith('/')) targets.add(raw.slice(0, -1) + '__DYNAMIC__');
      else targets.add(raw);
    }
    if (/(showAuth|openModal|openMenu|openPalette|closeModal|toast|setTheme|howAuth)\(/.test(code)) {
      // handled by globals.js — verified separately by the smoke test
    }
  });

  return targets;
}

function isDynamic(target) {
  return target.includes('__DYNAMIC__');
}

async function main() {
  const ctx = await createApp(true);
  const seen = new Set();
  const queue = [...SEED_ROUTES];
  const dead = [];
  const empty = [];
  const external = [];
  const checked = [];

  // breadth-first: pages discovered on a page get checked too (bounded)
  while (queue.length && seen.size < 400) {
    const route = queue.shift();
    if (seen.has(route)) continue;
    seen.add(route);

    ctx.go(route.startsWith('#') ? route : '#' + route);
    const html = ctx.html();
    if (html.includes(NOT_FOUND) || html.includes(NOT_ROUTED)) {
      if (!ALLOWED_DEAD.has(route)) dead.push({ route, reason: 'seed route renders the not-found view' });
      continue;
    }

    const targets = collectTargets(ctx);
    targets.forEach((t) => {
      if (t === '__EMPTY_HREF__') { empty.push(route); return; }
      if (t.startsWith('__EXTERNAL__ ')) { external.push(route + ' → ' + t.slice(13)); return; }
      const hash = '#' + t.replace(/__DYNAMIC__$/, '');
      if (!seen.has(hash) && !queue.includes(hash)) queue.push(hash);
    });
  }

  // second pass: visit everything discovered and record 404s
  for (const route of [...seen]) {
    if (route === '__EMPTY_HREF__') continue;
    ctx.go(route.startsWith('#') ? route : '#' + route);
    const html = ctx.html();
    checked.push(route);
    if (html.includes(NOT_FOUND) || html.includes(NOT_ROUTED)) {
      if (ALLOWED_DEAD.has(route)) continue;
      if (isDynamic(route)) continue;
      dead.push({ route, reason: 'linked from the app but the router has no view for it' });
    }
  }

  ctx.dom.window.close();

  console.log('');
  console.log('pages visited   : ' + seen.size);
  console.log('dead links      : ' + dead.length);
  dead.slice(0, 40).forEach((d) => console.log('   ✗ ' + d.route + '  — ' + d.reason));
  if (empty.length) {
    console.log('');
    console.log('empty href="#"  : ' + empty.length);
    [...new Set(empty)].slice(0, 20).forEach((e) => console.log('   ✗ on ' + e));
  }
  if (external.length) {
    console.log('');
    console.log('external links  : ' + external.length);
    [...new Set(external)].slice(0, 20).forEach((e) => console.log('   ✗ ' + e));
  }
  if (ctx.errors.length) {
    console.log('');
    console.log('runtime errors  : ' + ctx.errors.length);
    ctx.errors.slice(0, 20).forEach((e) => console.log('   ✗ ' + String(e).split('\n')[0]));
  }

  const total = dead.length + empty.length + external.length + ctx.errors.length;
  console.log('');
  console.log(total === 0 ? '✓ every internal link resolves' : `✗ ${total} link problem(s)`);
  process.exit(total === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('✗ link check crashed: ' + (e.stack || e.message));
  process.exit(1);
});
