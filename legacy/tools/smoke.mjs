#!/usr/bin/env node
/**
 * RedGet — route smoke test.
 *
 * Runs the real application inside jsdom and visits every registered route with
 * sample parameters, asserting that each one renders actual content. This is the
 * only test that needs a DOM, so jsdom is a *dev-only* dependency resolved from
 * the parent directory (or REDGET_JSDOM); the shipped app stays zero-dependency.
 *
 *   node tools/smoke.mjs                 # all routes
 *   node tools/smoke.mjs --filter=pull   # only matching routes
 *   node tools/smoke.mjs --verbose       # print every route result
 *
 * Exit code is the number of failing routes.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const filterArg = args.find((a) => a.startsWith('--filter='));
const FILTER = filterArg ? filterArg.slice('--filter='.length).toLowerCase() : null;
const onlyArg = args.find((a) => a.startsWith('--only='));

function loadJsdom() {
  const candidates = [
    process.env.REDGET_JSDOM,
    resolve(ROOT, '..', 'node_modules', 'jsdom'),
    resolve(ROOT, 'node_modules', 'jsdom'),
    '/usr/lib/node_modules/jsdom',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'package.json'))) {
      const require = createRequire(pathToFileURL(join(candidate, 'noop.js')).href);
      return require(candidate).JSDOM;
    }
  }
  throw new Error('jsdom not found. Install it next to the project (npm i jsdom) or set REDGET_JSDOM.');
}

const JSDOM = loadJsdom();

/* --------------------------------------------------------------- environment */

const sprite = readFileSync(resolve(ROOT, 'assets/icons/sprite.svg'), 'utf8');
const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><base href="/"></head>
<body><div id="redget-sprite" hidden aria-hidden="true">${sprite}</div></body></html>`;

const dom = new JSDOM(html, {
  url: 'http://redget.local/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});

const { window } = dom;
globalThis.window = window;
globalThis.document = window.document;
globalThis.navigator = window.navigator;
globalThis.location = window.location;
globalThis.history = window.history;
globalThis.localStorage = window.localStorage;
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.SVGElement = window.SVGElement;
globalThis.Event = window.Event;
globalThis.CustomEvent = window.CustomEvent;
globalThis.KeyboardEvent = window.KeyboardEvent;
globalThis.MouseEvent = window.MouseEvent;
globalThis.getComputedStyle = window.getComputedStyle.bind(window);
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
// Only define globals the browser provides but Node does not.
['DocumentFragment', 'DOMParser', 'XMLSerializer', 'Image', 'Blob', 'File', 'FileReader',
 'AbortController', 'IntersectionObserver', 'ResizeObserver', 'MutationObserver',
 'HTMLDialogElement', 'Range', 'Selection', 'TreeWalker', 'NodeFilter', 'Text',
 'Comment', 'CSSStyleSheet', 'ShadowRoot'].forEach((name) => {
  if (typeof globalThis[name] === 'undefined' && typeof window[name] !== 'undefined') {
    globalThis[name] = window[name];
  }
});
globalThis.matchMedia = window.matchMedia ? window.matchMedia.bind(window) : () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
if (!window.matchMedia) window.matchMedia = globalThis.matchMedia;
window.requestAnimationFrame = globalThis.requestAnimationFrame;
window.cancelAnimationFrame = globalThis.cancelAnimationFrame;

// jsdom has no <dialog>; provide the minimum surface used by overlay.js.
if (!window.HTMLDialogElement) {
  window.HTMLElement.prototype.showModal = function showModal() { this.open = true; this.setAttribute('open', ''); };
  window.HTMLElement.prototype.show = function show() { this.open = true; this.setAttribute('open', ''); };
  window.HTMLElement.prototype.close = function close(value) { this.open = false; this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); if (value !== undefined) this.returnValue = value; };
}

// jsdom lacks scrollIntoView and a few layout APIs used for focus management.
window.Element.prototype.scrollIntoView = function scrollIntoView() {};
window.Element.prototype.setPointerCapture = function setPointerCapture() {};
window.Element.prototype.releasePointerCapture = function releasePointerCapture() {};
if (!window.Element.prototype.replaceChildren) {
  window.Element.prototype.replaceChildren = function replaceChildren(...nodes) {
    while (this.firstChild) this.removeChild(this.firstChild);
    nodes.forEach((n) => this.appendChild(typeof n === 'string' ? window.document.createTextNode(n) : n));
  };
}

const consoleErrors = [];
const originalError = console.error;
console.error = (...parts) => {
  const text = parts.map(String).join(' ');
  if (/MODULE_TYPELESS_PACKAGE_JSON|trace-warnings|ExperimentalWarning/.test(text)) return;
  consoleErrors.push(text);
  originalError(...parts);
};

/* ------------------------------------------------------------------- routes */

const { ROUTE_PATTERNS } = await import(pathToFileURL(resolve(ROOT, 'src/config.js')).href);
const { registerRoutes } = await import(pathToFileURL(resolve(ROOT, 'src/routes.js')).href);
const { buildDatabase, prepareReferenceTime } = await import(pathToFileURL(resolve(ROOT, 'src/data/mockData.js')).href);
const { hydrate } = await import(pathToFileURL(resolve(ROOT, 'src/core/store.js')).href);
const theme = await import(pathToFileURL(resolve(ROOT, 'src/core/theme.js')).href);
const i18n = await import(pathToFileURL(resolve(ROOT, 'src/core/i18n.js')).href);
const router = await import(pathToFileURL(resolve(ROOT, 'src/core/router.js')).href);
const kit = await import(pathToFileURL(resolve(ROOT, 'src/components/kit.js')).href);

prepareReferenceTime();
hydrate(buildDatabase());
theme.initTheme({ theme: 'dark', density: 'comfortable', reducedMotion: true, locale: 'en' });
i18n.setLocale('en');
registerRoutes();
kit.startTimeUpdater();

const root = window.document.createElement('main');
root.id = 'app';
window.document.body.appendChild(root);
router.setRoot(root);
router.setMode('history');

/** Turn a route pattern such as /:login/:repo/blob/:branch* into a concrete sample URL. */
const SAMPLES = {
  ':login': 'octored',
  ':repo': 'redget-core',
  ':branch*': 'main',
  ':branch': 'main',
  ':path*': 'src/components/diff.js',
  ':path': 'src/components/diff.js',
  ':number': '1',
  ':sha': 'HEAD',
  ':runId': '90975',
  ':jobId': '90975-job-0',
  ':workflowId': 'ci.yml',
  ':projectId': '1',
  ':page*': 'Home',
  ':page': 'Home',
  ':advisoryId': 'adv-0',
  ':alertId': '1',
  ':section': 'general',
  ':item': 'ci-readonly',
  ':topic': 'redget',
  ':slug': 'crimson-lint',
  ':org': 'crimson-collective',
  ':tag': 'v4.2.0',
  ':env': 'production',
  ':name': 'redget-core',
  ':range*': 'main...feature/split-diff-alignment',
  ':id': 'g-0',
  ':asset': 'redget-core-4.2.0.zip',
};

function sampleUrl(rawPattern) {
  const pattern = String(rawPattern).split('?')[0];
  let url = pattern;
  let changed = true;
  let guard = 0;
  while (changed && guard < 12) {
    changed = false;
    guard += 1;
    url = url.replace(/:([A-Za-z0-9_]+)(\*|\?)?/g, (full, name, modifier) => {
      const key = `:${name}${modifier === '*' ? '*' : ''}`;
      if (SAMPLES[key] !== undefined) { changed = true; return SAMPLES[key]; }
      if (SAMPLES[`:${name}`] !== undefined) { changed = true; return SAMPLES[`:${name}`]; }
      changed = true;
      return 'sample';
    });
  }
  // The archive patterns end with ".zip" which the router treats as part of :branch*
  if (url.includes('refs/heads')) url = url.replace(/refs\/heads\/(.*)$/, 'refs/heads/main.zip');
  if (url.includes('refs/tags')) url = url.replace(/refs\/tags\/(.*)$/, 'refs/tags/v4.2.0.zip');
  return url.replace(/\/+/g, '/');
}

let targets = ROUTE_PATTERNS
  .filter((pattern) => typeof pattern === 'string')
  .map((pattern) => ({ group: 'ROUTE_PATTERNS', pattern }));

if (onlyArg) {
  const only = onlyArg.slice('--only='.length);
  targets = targets.filter((t) => t.pattern === only);
}
if (FILTER) targets = targets.filter((t) => t.pattern.toLowerCase().includes(FILTER));

const results = [];
for (const target of targets) {
  const url = sampleUrl(target.pattern);
  const entry = { pattern: target.pattern, url, group: target.group, ok: true, notes: [] };
  try {
    window.history.pushState({}, '', url);
    await router.handleLocation();
    const markup = root.innerHTML;
    const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
    entry.length = markup.length;
    if (markup.length < 200) { entry.ok = false; entry.notes.push(`only ${markup.length} chars of markup`); }
    if (text.length < 20) { entry.ok = false; entry.notes.push('almost no text content'); }
    if (/undefined|\[object Object\]|NaN/.test(text)) {
      const found = [...new Set((text.match(/undefined|\[object Object\]|NaN/g) || []))].join(', ');
      entry.notes.push(`suspicious text: ${found}`);
      entry.ok = false;
      // Locate the offending nodes so the report is actionable.
      const offenders = [];
      root.querySelectorAll('*').forEach((node) => {
        const own = [...node.childNodes]
          .filter((child) => child.nodeType === 3)
          .map((child) => child.nodeValue)
          .join('');
        if (/\[object Object\]|undefined|NaN/.test(own)) {
          const chain = [];
          let cursor = node;
          while (cursor && cursor !== root && chain.length < 5) {
            chain.unshift(`${cursor.tagName ? cursor.tagName.toLowerCase() : '?'}${cursor.className && typeof cursor.className === 'string' ? `.${cursor.className.split(' ').filter(Boolean).join('.')}` : ''}`);
            cursor = cursor.parentNode;
          }
          offenders.push(`${chain.join(' > ')} :: ${own.trim().slice(0, 90)}`);
        }
      });
      offenders.slice(0, 6).forEach((o) => entry.notes.push(`at ${o}`));
    }
  } catch (error) {
    entry.ok = false;
    entry.notes.push(`${error && error.name}: ${error && error.message}`);
    if (VERBOSE && error && error.stack) entry.notes.push(error.stack.split('\n').slice(1, 4).join(' | '));
  }
  results.push(entry);
}

/* ------------------------------------------------------------- icon coverage */

const spriteIds = new Set([...sprite.matchAll(/id="icon-([a-z0-9-]+)"/g)].map((m) => m[1]));
const usedIds = new Set();
root.querySelectorAll('use').forEach((use) => {
  const href = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
  const id = href.replace(/^#icon-/, '');
  if (id) usedIds.add(id);
});
const missingIcons = [...usedIds].filter((id) => !spriteIds.has(id));

/* ------------------------------------------------------------------- report */

const failed = results.filter((r) => !r.ok);
results.forEach((r) => {
  if (VERBOSE || !r.ok) {
    console.log(`${r.ok ? '✓' : '✗'} ${r.pattern}  →  ${r.url}  (${r.length || 0} chars)${r.notes.length ? `\n    ${r.notes.join('\n    ')}` : ''}`);
  }
});

console.log(`\nroutes: ${results.length - failed.length}/${results.length} rendered`);
if (missingIcons.length) console.log(`missing icons: ${missingIcons.join(', ')}`);
if (consoleErrors.length) {
  console.log(`console.error calls: ${consoleErrors.length}`);
  consoleErrors.slice(0, 10).forEach((e) => console.log(`  ! ${e.slice(0, 220)}`));
}

process.exit(failed.length + missingIcons.length);
