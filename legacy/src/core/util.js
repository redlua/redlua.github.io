/**
 * RedGet — generic utilities.
 * Pure functions only: formatting, ids, hashing, dates, strings, numbers.
 * No DOM access here so this module is safe to import from anywhere (and from tools/).
 */

/** Deterministic 32-bit string hash (FNV-1a). Used for seeded mock data + avatar colors. */
export function hashString(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Tiny deterministic PRNG so mock data is stable across reloads. */
export function makeRandom(seed) {
  let state = hashString(seed) || 1;
  return function next() {
    state ^= state << 13; state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

export function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

export function pick(rng, list) {
  if (!list || list.length === 0) return undefined;
  return list[Math.floor(rng() * list.length) % list.length];
}

export function pickMany(rng, list, count) {
  const copy = list.slice();
  const out = [];
  const n = Math.min(count, copy.length);
  for (let i = 0; i < n; i += 1) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

/** Hex-ish short id, e.g. commit shas. */
export function shortId(len = 7, seed = null) {
  const alphabet = '0123456789abcdef';
  if (seed != null) {
    const rng = makeRandom(seed);
    let out = '';
    for (let i = 0; i < len; i += 1) out += alphabet[Math.floor(rng() * 16)];
    return out;
  }
  let out = '';
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  for (let i = 0; i < len; i += 1) out += alphabet[(bytes[i] || Math.floor(Math.random() * 256)) % 16];
  return out;
}

export function uuid(seed = null) {
  if (seed != null) {
    const hex = shortId(32, seed);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const hex = shortId(32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Monotonic id generator for entities created during a session. */
let idCounter = 0;
export function nextId(prefix = 'id') {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

/* ------------------------------------------------------------------ strings */

export function slugify(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function titleCase(text) {
  return String(text)
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function truncate(text, max = 80, ellipsis = '…') {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)).replace(/\s+\S*$/, '') + ellipsis;
}

export function initials(name) {
  const parts = String(name ?? '?').trim().split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

/** Escape for safe embedding inside a JS string literal. */
export function escapeJsString(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, '\\\'')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/<\/script/gi, '<\\/script');
}

export function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------- numbers */

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** GitHub-style compact counts: 1.2k, 3.4M. */
export function compactNumber(n) {
  const value = Number(n) || 0;
  const abs = Math.abs(value);
  if (abs < 1000) return String(value);
  if (abs < 10000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  if (abs < 1000000) return `${Math.round(value / 1000)}k`;
  if (abs < 10000000) return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs < 1000000000) return `${Math.round(value / 1000000)}M`;
  return `${(value / 1000000000).toFixed(1).replace(/\.0$/, '')}B`;
}

export function formatNumber(n) {
  return new Intl.NumberFormat('en-US').format(Number(n) || 0);
}

export function formatBytes(bytes, decimals = 1) {
  const value = Number(bytes) || 0;
  if (value === 0) return '0 Bytes';
  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = clamp(Math.floor(Math.log(value) / Math.log(1024)), 0, units.length - 1);
  return `${(value / 1024 ** i).toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

export function formatPercent(part, total, decimals = 1) {
  if (!total) return '0%';
  return `${((part / total) * 100).toFixed(decimals).replace(/\.0+$/, '')}%`;
}

export function ordinal(n) {
  const value = Number(n) || 0;
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = value % 100;
  return value + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

/* --------------------------------------------------------------------- dates */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Parse flexible date input into a Date. */
export function toDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** "3 minutes ago", "yesterday", "on Mar 4" — GitHub-style relative time. */
export function relativeTime(value, now = Date.now()) {
  const date = toDate(value);
  const diff = now - date.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const unit = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  let text;
  if (abs < 45 * SECOND) text = 'just now';
  else if (abs < 90 * SECOND) text = 'a minute';
  else if (abs < 45 * MINUTE) text = unit(Math.round(abs / MINUTE), 'minute', 'minutes');
  else if (abs < 90 * MINUTE) text = 'an hour';
  else if (abs < 22 * HOUR) text = unit(Math.round(abs / HOUR), 'hour', 'hours');
  else if (abs < 36 * HOUR) text = 'a day';
  else if (abs < 26 * DAY) text = unit(Math.round(abs / DAY), 'day', 'days');
  else if (abs < 60 * DAY) text = 'a month';
  else if (abs < 330 * DAY) text = unit(Math.round(abs / (30 * DAY)), 'month', 'months');
  else if (abs < 550 * DAY) text = 'a year';
  else text = unit(Math.round(abs / (365 * DAY)), 'year', 'years');

  if (text === 'just now') return text;
  if (future) return `in ${text}`;
  if (abs < 26 * DAY) return `${text} ago`;
  return `on ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== new Date(now).getFullYear() ? 'numeric' : undefined })}`;
}

export function absoluteTime(value, timeZone) {
  const date = toDate(value);
  try {
    return date.toLocaleString('en-US', {
      timeZone,
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  } catch {
    return date.toLocaleString('en-US');
  }
}

export function shortDate(value) {
  return toDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function isoDate(value) {
  return toDate(value).toISOString().slice(0, 10);
}

export function isoDateTime(value) {
  return toDate(value).toISOString().slice(0, 16).replace('T', ' ');
}

/** Duration for logs/runs: "1m 42s". */
export function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  if (total < 1000) return `${total}ms`;
  const seconds = Math.floor(total / 1000) % 60;
  const minutes = Math.floor(total / 60000) % 60;
  const hours = Math.floor(total / 3600000);
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** Start of the week (Sunday) containing the given date. */
export function startOfWeek(value) {
  const d = toDate(value);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function addDays(value, days) {
  const d = toDate(value);
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(a, b) {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}

/* --------------------------------------------------------------- collections */

export function groupBy(list, keyFn) {
  const out = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!out.has(key)) out.set(key, []);
    out.get(key).push(item);
  }
  return out;
}

export function sortBy(list, keyFn, dir = 'asc') {
  const factor = dir === 'desc' ? -1 : 1;
  return list.slice().sort((a, b) => {
    const ka = keyFn(a);
    const kb = keyFn(b);
    if (ka === kb) return 0;
    if (ka == null) return 1;
    if (kb == null) return -1;
    return (ka > kb ? 1 : -1) * factor;
  });
}

export function unique(list) {
  return Array.from(new Set(list));
}

export function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function range(start, end, step = 1) {
  const out = [];
  if (step === 0) return out;
  if (step > 0) for (let i = start; i < end; i += step) out.push(i);
  else for (let i = start; i > end; i += step) out.push(i);
  return out;
}

export function sum(list, keyFn = (x) => x) {
  return list.reduce((acc, item) => acc + (Number(keyFn(item)) || 0), 0);
}

export function debounce(fn, ms = 150) {
  let timer = null;
  function wrapped(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  }
  wrapped.cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  return wrapped;
}

export function throttle(fn, ms = 150) {
  let last = 0;
  let timer = null;
  return function wrapped(...args) {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => { timer = null; last = Date.now(); fn(...args); }, remaining);
    }
  };
}

/* -------------------------------------------------------------------- objects */

export function deepClone(value) {
  if (typeof structuredClone === 'function') {
    try { return structuredClone(value); } catch { /* fall through */ }
  }
  return JSON.parse(JSON.stringify(value));
}

export function mergeDeep(target, ...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const [key, value] of Object.entries(source)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        target[key] = mergeDeep(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
      } else {
        target[key] = Array.isArray(value) ? value.slice() : value;
      }
    }
  }
  return target;
}

export function get(obj, path, fallback) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj) ?? fallback;
}

export function omit(obj, keys) {
  const set = new Set(keys);
  const out = {};
  for (const [key, value] of Object.entries(obj)) if (!set.has(key)) out[key] = value;
  return out;
}

export function isEmpty(value) {
  if (value == null) return true;
  if (Array.isArray(value) || typeof value === 'string') return value.length === 0;
  if (value instanceof Map || value instanceof Set) return value.size === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

/* --------------------------------------------------------------------- colors */

/** Deterministic hue from a string, used for avatars, labels and graphs. */
export function hueFromString(str) {
  return hashString(str) % 360;
}

export function hsl(h, s, l) {
  return `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;
}

/** Label colors are hex in RedGet data; return readable foreground for a background. */
export function readableOn(hexOrHsl) {
  const str = String(hexOrHsl || '#000000');
  let r = 0; let g = 0; let b = 0;
  if (str.startsWith('#')) {
    const hex = str.slice(1);
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    r = parseInt(full.slice(0, 2), 16) || 0;
    g = parseInt(full.slice(2, 4), 16) || 0;
    b = parseInt(full.slice(4, 6), 16) || 0;
  } else {
    const match = str.match(/-?\d+/g);
    if (match) {
      const [h, s, l] = match.map(Number);
      const c = (1 - Math.abs(2 * l / 100 - 1)) * (s / 100);
      const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
      const m = l / 100 - c / 2;
      const rgb = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
      [r, g, b] = rgb.map((v) => Math.round((v + m) * 255));
    }
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? '#0b0b0d' : '#ffffff';
}

/* ------------------------------------------------------------------- searching */

/** Simple relevance scoring for the local search implementation. */
export function scoreMatch(haystack, needle) {
  const hay = String(haystack ?? '').toLowerCase();
  const ndl = String(needle ?? '').trim().toLowerCase();
  if (!ndl) return 0;
  if (hay === ndl) return 100;
  if (hay.startsWith(ndl)) return 80;
  const idx = hay.indexOf(ndl);
  if (idx === -1) return 0;
  return Math.max(10, 70 - idx);
}

export function highlightRanges(text, needle) {
  const out = [];
  const hay = String(text ?? '');
  const ndl = String(needle ?? '').trim();
  if (!ndl) return [{ text: hay, hit: false }];
  const lower = hay.toLowerCase();
  const lowerNeedle = ndl.toLowerCase();
  let cursor = 0;
  let idx = lower.indexOf(lowerNeedle, cursor);
  while (idx !== -1) {
    if (idx > cursor) out.push({ text: hay.slice(cursor, idx), hit: false });
    out.push({ text: hay.slice(idx, idx + ndl.length), hit: true });
    cursor = idx + ndl.length;
    idx = lower.indexOf(lowerNeedle, cursor);
  }
  if (cursor < hay.length) out.push({ text: hay.slice(cursor), hit: false });
  return out.length ? out : [{ text: hay, hit: false }];
}

export default {
  hashString, makeRandom, randomInt, pick, pickMany, shortId, uuid, nextId,
  slugify, titleCase, truncate, initials, escapeHtml, escapeAttr, escapeJsString, escapeRegExp,
  clamp, compactNumber, formatNumber, formatBytes, formatPercent, ordinal,
  toDate, relativeTime, absoluteTime, shortDate, isoDate, isoDateTime, formatDuration,
  startOfWeek, addDays, daysBetween,
  groupBy, sortBy, unique, chunk, range, sum, debounce, throttle,
  deepClone, mergeDeep, get, omit, isEmpty,
  hueFromString, hsl, readableOn, scoreMatch, highlightRanges,
};
