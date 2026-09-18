/**
 * RedGet — client-side router.
 *
 * Modes:
 *   'history' — real paths like /octored/redget-core/issues/12 (needs a static server
 *               that falls back to index.html; /server.mjs does this).
 *   'hash'    — #/octored/redget-core/issues/12 (works from file:// too).
 *
 * Route patterns come from ROUTE_PATTERNS in /src/config.js. `:name` matches one
 * segment, `:name*` matches the remainder of the path (slash-separated), which is how
 * /blob/<branch>/<path> and /tree/<branch> work.
 */

import { emit, EVENTS } from './bus.js';
import { debounce } from './util.js';

const routes = [];
const notFoundHandlers = [];
const guards = [];
let mode = 'history';
let current = null;
let rootEl = null;
let renderInProgress = null;
let scrollRestoration = true;
const scrollMemory = new Map();

/* ------------------------------------------------------------------- patterns */

function compilePattern(pattern) {
  const segments = String(pattern).split('/').filter((s) => s !== '');
  const parts = segments.map((segment) => {
    if (segment.startsWith(':')) {
      const splat = segment.endsWith('*');
      const name = splat ? segment.slice(1, -1) : segment.slice(1);
      return { name, splat, literal: null };
    }
    return { name: null, splat: false, literal: segment.toLowerCase() };
  });
  return { pattern, parts, splatIndex: parts.findIndex((p) => p.splat) };
}

function matchParts(parts, splatIndex, segments) {
  const params = {};
  if (splatIndex === -1) {
    if (parts.length !== segments.length) return null;
    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const value = segments[i];
      if (part.literal !== null) {
        if (part.literal !== value.toLowerCase()) return null;
      } else {
        params[part.name] = decodeURIComponent(value);
      }
    }
    return params;
  }
  if (segments.length < parts.length - 1) return null;
  for (let i = 0; i < splatIndex; i += 1) {
    const part = parts[i];
    const value = segments[i] || '';
    if (part.literal !== null) {
      if (part.literal !== value.toLowerCase()) return null;
    } else {
      params[part.name] = decodeURIComponent(value);
    }
  }
  const rest = segments.slice(splatIndex, segments.length - (parts.length - splatIndex - 1)).join('/');
  params[parts[splatIndex].name] = decodeURIComponent(rest);
  for (let i = splatIndex + 1; i < parts.length; i += 1) {
    const part = parts[i];
    const value = segments[segments.length - (parts.length - i)] || '';
    if (part.literal !== null) {
      if (part.literal !== value.toLowerCase()) return null;
    } else {
      params[part.name] = decodeURIComponent(value);
    }
  }
  return params;
}

/** Find the best matching route for a pathname. More literal segments wins. */
export function resolve(pathname) {
  const clean = `/${String(pathname || '/').replace(/^\/+|\/+$/g, '')}`.replace(/\/{2,}/g, '/');
  const segments = clean.split('/').filter((s) => s !== '');
  let best = null;
  let bestScore = -1;
  for (const route of routes) {
    const params = matchParts(route.compiled.parts, route.compiled.splatIndex, segments);
    if (!params) continue;
    const literalCount = route.compiled.parts.filter((p) => p.literal !== null).length;
    const splatPenalty = route.compiled.splatIndex === -1 ? 0 : -1;
    const score = literalCount * 10 + (route.compiled.parts.length) + splatPenalty + (route.priority || 0);
    if (score > bestScore) { bestScore = score; best = { route, params, pathname: clean }; }
  }
  if (best) {
    const query = parseQuery(typeof window !== 'undefined' ? window.location.search : '');
    return { ...best, query, hash: typeof window !== 'undefined' ? window.location.hash : '', url: clean };
  }
  return null;
}

export function parseQuery(search) {
  const out = {};
  const params = new URLSearchParams(search || '');
  for (const [key, value] of params.entries()) {
    if (key.endsWith('[]')) {
      const name = key.slice(0, -2);
      if (!Array.isArray(out[name])) out[name] = [];
      out[name].push(value);
    } else if (Object.prototype.hasOwnProperty.call(out, key)) {
      out[key] = Array.isArray(out[key]) ? out[key].concat(value) : [out[key], value];
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function stringifyQuery(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (value == null || value === '' || value === false) continue;
    if (Array.isArray(value)) value.forEach((v) => v != null && v !== '' && params.append(`${key}[]`, String(v)));
    else params.set(key, String(value));
  }
  const str = params.toString();
  return str ? `?${str}` : '';
}

/* --------------------------------------------------------------- registration */

export function addRoute(pattern, handler, options = {}) {
  const route = {
    pattern,
    compiled: compilePattern(pattern),
    handler,
    name: options.name || pattern,
    title: options.title || null,
    priority: options.priority || 0,
    layout: options.layout !== false,
    skeleton: options.skeleton !== false,
    scroll: options.scroll !== 'top',
    guard: options.guard || null,
  };
  routes.push(route);
  return route;
}

export function addRoutes(list) {
  list.forEach(([pattern, handler, options]) => addRoute(pattern, handler, options));
}

export function removeRoute(pattern) {
  const idx = routes.findIndex((r) => r.pattern === pattern);
  if (idx >= 0) routes.splice(idx, 1);
}

export function getRoutes() {
  return routes.map((r) => r.pattern);
}

export function notFound(handler) {
  notFoundHandlers.push(handler);
}

export function beforeEach(guard) {
  guards.push(guard);
}

/* ------------------------------------------------------------------ navigation */

export function currentPath() {
  if (typeof window === 'undefined') return '/';
  if (mode === 'hash') {
    const hash = window.location.hash.replace(/^#/, '');
    const [path] = hash.split('?');
    return path || '/';
  }
  return window.location.pathname || '/';
}

export function currentSearch() {
  if (typeof window === 'undefined') return '';
  if (mode === 'hash') {
    const hash = window.location.hash.replace(/^#/, '');
    const idx = hash.indexOf('?');
    return idx >= 0 ? hash.slice(idx) : '';
  }
  return window.location.search || '';
}

export function toHref(path, query) {
  const qs = stringifyQuery(query);
  if (mode === 'hash') return `#${path}${qs}`;
  return `${path}${qs}`;
}

/** Programmatic navigation. `replace` avoids a history entry. */
export function navigate(path, options = {}) {
  const { replace = false, query = null, hash = null, state = null, silent = false } = options;
  let target = String(path || '/');
  if (!target.startsWith('/')) target = `/${target}`;
  if (query) target += stringifyQuery(query);
  if (hash) target += hash.startsWith('#') ? hash : `#${hash}`;

  if (typeof window === 'undefined') return;
  if (mode === 'hash') {
    const next = `#${target}`;
    if (window.location.hash === next) { if (!silent) handleLocation(); return; }
    if (replace) window.location.replace(next);
    else window.location.hash = target;
    if (replace) handleLocation();
    return;
  }
  const same = window.location.pathname + window.location.search + window.location.hash === target;
  if (same && !silent) { handleLocation(); return; }
  try {
    if (replace) window.history.replaceState(state || {}, '', target);
    else window.history.pushState(state || {}, '', target);
  } catch {
    window.location.assign(target);
    return;
  }
  handleLocation();
}

export function redirect(path, options = {}) {
  navigate(path, { ...options, replace: true });
}

export function back(fallback = '/') {
  if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
  else navigate(fallback);
}

/* ------------------------------------------------------------------- rendering */

export function setMode(next) {
  mode = next === 'hash' ? 'hash' : 'history';
}

export function getMode() {
  return mode;
}

export function setRoot(el) {
  rootEl = el;
}

export function getCurrent() {
  return current;
}

export function setScrollRestoration(enabled) {
  scrollRestoration = Boolean(enabled);
}

function rememberScroll() {
  if (!current || !scrollRestoration) return;
  scrollMemory.set(current.url + (current.search || ''), window.scrollY);
}

function restoreScroll(match) {
  if (!scrollRestoration) return;
  const key = match.url + (match.search || '');
  const y = scrollMemory.get(key);
  window.scrollTo({ top: y || 0, behavior: 'auto' });
}

async function renderMatch(match) {
  if (renderInProgress) renderInProgress.cancelled = true;
  const token = { cancelled: false };
  renderInProgress = token;

  for (const guard of guards) {
    const result = await guard(match, current);
    if (result === false) return;
    if (typeof result === 'string') { navigate(result, { replace: true }); return; }
  }

  const previous = current;
  current = match;
  emit(EVENTS.routeStart, match);
  document.documentElement.dataset.route = match.route.name.replace(/[^\w-]/g, '_');

  if (match.route.skeleton && rootEl) {
    rootEl.dataset.loading = 'true';
  }

  let content;
  try {
    content = await match.route.handler(match, { rootEl, previous });
  } catch (error) {
    console.error('[RedGet] route handler failed', match, error);
    token.cancelled = true;
    const failover = notFoundHandlers[0];
    content = failover ? failover({ ...match, error }) : null;
  }
  if (token.cancelled) return;

  if (rootEl && content) {
    rootEl.replaceChildren(content.nodeType ? content : document.createTextNode(String(content)));
    rootEl.removeAttribute('data-loading');
  }

  const title = typeof match.route.title === 'function' ? match.route.title(match) : match.route.title;
  if (title) document.title = title;

  if (match.route.scroll === 'top') window.scrollTo({ top: 0, behavior: 'auto' });
  else if (match.route.scroll === 'restore') restoreScroll(match);

  emit(EVENTS.routeChange, match);
}

export async function handleLocation() {
  const pathname = currentPath();
  const search = currentSearch();
  rememberScroll();
  const match = resolve(pathname);
  if (match) {
    match.search = search;
    match.query = parseQuery(search);
    await renderMatch(match);
    return;
  }
  // No route matched: ask the notFound handlers (pages/notFound.js registers a 404 view).
  const fallback = notFoundHandlers[0];
  current = { url: pathname, search, query: parseQuery(search), params: {}, route: { name: '404', pattern: pathname, layout: true }, notFound: true };
  emit(EVENTS.routeStart, current);
  if (rootEl && fallback) {
    rootEl.replaceChildren(fallback(current));
    rootEl.removeAttribute('data-loading');
  }
  emit(EVENTS.routeChange, current);
}

const onPopState = debounce(() => { handleLocation(); }, 10);

export function start(options = {}) {
  const { root, initialMode = 'history', listen = true } = options;
  if (root) setRoot(root);
  setMode(initialMode);
  if (listen && typeof window !== 'undefined') {
    window.addEventListener('popstate', onPopState);
    window.addEventListener('hashchange', () => { if (mode === 'hash') onPopState(); });
  }
  // Intercept internal link clicks so we never do a full page load.
  if (typeof document !== 'undefined') {
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      if (anchor.target && anchor.target !== '_self') return;
      if (anchor.dataset.noIntercept === 'true') return;
      if (/^(https?:|mailto:|tel:|data:|blob:)/i.test(href)) return;
      if (href.startsWith('#') && !href.startsWith('#/')) return;
      if (anchor.download != null) return;
      event.preventDefault();
      if (mode === 'hash') {
        navigate(href.replace(/^#/, '') || '/');
      } else {
        navigate(href);
      }
    });
  }
  return handleLocation();
}

export function stop() {
  if (typeof window !== 'undefined') window.removeEventListener('popstate', onPopState);
}

export default {
  addRoute, addRoutes, removeRoute, getRoutes, resolve, notFound, beforeEach,
  navigate, redirect, back, start, stop, handleLocation, setMode, getMode, setRoot,
  getCurrent, currentPath, currentSearch, toHref, parseQuery, stringifyQuery,
};
