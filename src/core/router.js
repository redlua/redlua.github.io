/**
 * RedGet — hash router helpers.
 *
 * The router is deliberately tiny: `parseRoute()` reads `location.hash` and
 * `navigate()` writes it. The `hashchange` listener that calls `render()` is
 * installed once by app.js, and views may call `render()` directly when they
 * need to repaint without changing the route.
 *
 * Query parameters (`#/explore?q=foo`) are not split into `parts`; views read
 * them from `location.hash` themselves so that `parts` stays a clean path.
 */

import { render } from './render.js';

/** Split the current hash into `{ path, query, parts }`. */
export function parseRoute() {
  var raw = String(location.hash || '').replace(/^#/, '') || '/';
  var q = raw.indexOf('?');
  var path = q === -1 ? raw : raw.slice(0, q);
  var query = {};
  if (q !== -1) {
    raw.slice(q + 1).split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      query[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
  }
  var parts = path.split('/').filter(function (p) { return p !== ''; });
  return { path: path, query: query, parts: parts, raw: raw };
}

/**
 * Move to `path` (a leading slash is added for you). When the hash would not
 * change — for example a filter that only differs by query string on the same
 * element — the view is re-rendered anyway so the click is never a no-op.
 */
export function navigate(path) {
  var target = '#' + (String(path || '/').charAt(0) === '/' ? path : '/' + path);
  if (location.hash === target) render();
  else location.hash = target;
}

/** The path portion of the current hash, without the query string. */
export function currentPath() {
  return parseRoute().path;
}
