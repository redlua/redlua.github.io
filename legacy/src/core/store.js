/**
 * RedGet — reactive store.
 *
 * Holds the database (deterministically seeded mock entities), the session
 * (current user) and ephemeral UI preferences.
 *
 * Persistence model: the seed is regenerated from a fixed reference instant, so
 * localStorage never stores the 1 MB dataset. Every `mutate()` call records the
 * mutator source into an ordered patch log (`redget:db:v4`) which is replayed on
 * top of a fresh seed at boot. Your stars, comments, merges and settings survive
 * a reload; the "Reset demo data" action simply drops the patch.
 */

import { STORAGE } from '../config.js';
import { deepClone, mergeDeep } from './util.js';
import { emit, EVENTS } from './bus.js';

const state = {
  db: null,
  session: { login: null, lastSeenAt: null },
  prefs: {
    theme: 'dark',
    locale: 'en',
    timeZone: null,
    density: 'comfortable',
    diffView: 'unified',
    showWhitespace: false,
    reducedMotion: false,
    fileTreeOpen: true,
    lineWrap: false,
    sidebarCollapsed: {},
  },
  ui: {
    route: null,
    loading: false,
    paletteOpen: false,
    mobileNavOpen: false,
    notificationsOpen: false,
  },
};

let hydrated = false;
const subscribers = new Set();
const selectors = new Map();

function safeParse(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function storageAvailable() {
  try {
    const key = `${STORAGE.prefix}probe`;
    window.localStorage.setItem(key, '1');
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

const HAS_STORAGE = typeof window !== 'undefined' && storageAvailable();
const memoryStore = new Map();

function readKey(key) {
  if (HAS_STORAGE) return window.localStorage.getItem(key);
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}

function writeKey(key, value) {
  const serialized = JSON.stringify(value);
  if (HAS_STORAGE) {
    try {
      window.localStorage.setItem(key, serialized);
      return true;
    } catch (error) {
      console.warn('[RedGet] localStorage write failed, falling back to memory', error);
    }
  }
  memoryStore.set(key, serialized);
  return true;
}

/* ------------------------------------------------------------------ lifecycle */

/* -------------------------------------------------------------------- patch log */

const patch = { anchor: null, generatedAt: null, mutations: [], savedAt: null };

/** Record a mutator so it can be replayed against a freshly generated seed. */
function recordPatch(mutator, op) {
  if (typeof mutator !== 'function') return;
  let source;
  try { source = mutator.toString(); } catch { return; }
  patch.mutations.push({ id: `m${patch.mutations.length + 1}`, op: op || 'mutate', source, at: new Date().toISOString() });
  if (patch.mutations.length > 4000) {
    patch.mutations.splice(0, patch.mutations.length - 4000);
  }
}

function replayPatch(db) {
  let applied = 0;
  for (const entry of patch.mutations) {
    try {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`return (${entry.source});`)();
      if (typeof fn === 'function') { fn(db); applied += 1; }
    } catch (error) {
      console.warn('[RedGet] skipped a stored mutation', entry.id, error);
    }
  }
  return applied;
}

export function getPatch() {
  return { ...patch, mutations: patch.mutations.slice() };
}

export function loadPatch() {
  const saved = safeParse(readKey(STORAGE.db), null);
  if (!saved || !Array.isArray(saved.mutations)) {
    patch.anchor = null;
    patch.mutations = [];
    return patch;
  }
  patch.anchor = saved.anchor != null ? saved.anchor : null;
  patch.generatedAt = saved.generatedAt || null;
  patch.mutations = saved.mutations.filter((m) => m && typeof m.source === 'string');
  return patch;
}

export function persist() {
  patch.savedAt = new Date().toISOString();
  writeKey(STORAGE.db, patch);
  writeKey(STORAGE.session, state.session);
  writeKey(STORAGE.prefs, state.prefs);
}

/** Flush pending state to storage; also called on `pagehide` / `visibilitychange`. */
export function flush() {
  persist();
}

export function hydrate(db) {
  state.db = db;
  const stored = loadPatch();
  if (stored.mutations.length && (stored.anchor === db.anchor || stored.anchor === null)) {
    const applied = replayPatch(db);
    if (applied) console.info(`[RedGet] replayed ${applied} stored mutation(s)`);
  } else if (stored.mutations.length) {
    console.info('[RedGet] stored patch does not match the current seed anchor; starting clean');
    patch.anchor = db.anchor;
    patch.mutations = [];
  }
  patch.anchor = db.anchor;
  const savedSession = safeParse(readKey(STORAGE.session), null);
  if (savedSession && typeof savedSession === 'object') mergeDeep(state.session, savedSession);
  if (!state.session.login && db && db.currentLogin) state.session.login = db.currentLogin;

  const savedPrefs = safeParse(readKey(STORAGE.prefs), null);
  if (savedPrefs && typeof savedPrefs === 'object') mergeDeep(state.prefs, savedPrefs);

  if (!state.prefs.timeZone) {
    try { state.prefs.timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { state.prefs.timeZone = 'UTC'; }
  }
  emit(EVENTS.sessionChange, state.session);
  if (typeof window !== 'undefined' && !hydrated) {
    hydrated = true;
    window.addEventListener('pagehide', persist);
    window.addEventListener('beforeunload', persist);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') persist(); });
  }
  return state;
}

/* ----------------------------------------------------------------- accessors */

export function getState() {
  return state;
}

export function getDb() {
  return state.db;
}

export function getSession() {
  return state.session;
}

export function getCurrentUser() {
  if (!state.db || !state.session.login) return null;
  return state.db.users.find((u) => u.login === state.session.login) || null;
}

export function getPrefs() {
  return state.prefs;
}

export function getUi() {
  return state.ui;
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function notify(scope, payload) {
  emit(EVENTS.dataChange, { scope, payload });
  for (const fn of Array.from(subscribers)) {
    try { fn(scope, payload, state); } catch (error) { console.error('[RedGet] subscriber error', error); }
  }
}

export function setPref(key, value) {
  state.prefs[key] = value;
  writeKey(STORAGE.prefs, state.prefs);
  notify('prefs', { key, value });
}

export function setUi(key, value) {
  state.ui[key] = value;
  notify('ui', { key, value });
}

export function setSession(patch) {
  mergeDeep(state.session, patch);
  state.session.lastSeenAt = new Date().toISOString();
  writeKey(STORAGE.session, state.session);
  emit(EVENTS.sessionChange, state.session);
  notify('session', patch);
}

/**
 * Mutate the database with a function, then debounce-persist.
 * @param {(db: object) => any} mutator
 * @param {string} scope label used by subscribers
 */
export function mutate(mutator, scope = 'db') {
  if (!state.db) throw new Error('[RedGet] store not hydrated');
  const result = mutator(state.db);
  recordPatch(mutator, scope);
  persist();
  notify(scope, result);
  return result;
}

/** Mutate without recording the change in the patch log (ephemeral UI state). */
export function mutateLocal(mutator, scope = 'db') {
  if (!state.db) throw new Error('[RedGet] store not hydrated');
  const result = mutator(state.db);
  notify(scope, result);
  return result;
}

export function resetDatabase(db) {
  patch.anchor = db ? db.anchor : null;
  patch.generatedAt = db ? db.generatedAt : null;
  patch.mutations = [];
  state.db = db;
  persist();
  clearSelectors();
  notify('db:reset', null);
}

export function clearAllStorage() {
  for (const key of Object.values(STORAGE)) {
    if (typeof key !== 'string') continue;
    if (HAS_STORAGE) window.localStorage.removeItem(key);
    memoryStore.delete(key);
  }
}

/* ------------------------------------------------------------------ selectors */

/** Memoized-by-key selector helper for repeated lookups during a render pass. */
export function select(key, factory) {
  if (!selectors.has(key)) selectors.set(key, factory());
  return selectors.get(key);
}

export function clearSelectors() {
  selectors.clear();
}

export function findRepo(login, repoName) {
  if (!state.db) return null;
  return state.db.repos.find((r) => r.ownerLogin === login && r.name.toLowerCase() === String(repoName || '').toLowerCase()) || null;
}

export function findUser(login) {
  if (!state.db) return null;
  return state.db.users.find((u) => u.login.toLowerCase() === String(login || '').toLowerCase()) || null;
}

export function findOrg(login) {
  if (!state.db) return null;
  return state.db.orgs.find((o) => o.login.toLowerCase() === String(login || '').toLowerCase()) || null;
}

/** Owner may be a user or an org. */
export function findOwner(login) {
  return findUser(login) || findOrg(login);
}

export function reposOf(login) {
  if (!state.db) return [];
  return state.db.repos.filter((r) => r.ownerLogin.toLowerCase() === String(login || '').toLowerCase());
}

export function visibleRepos(login) {
  return reposOf(login).filter((r) => r.visibility === 'public' || (state.session.login && r.ownerLogin === state.session.login));
}

export function notificationsFor(login) {
  if (!state.db) return [];
  return state.db.notifications.filter((n) => n.userLogin === login);
}

export function snapshot() {
  return deepClone(state);
}

export default {
  hydrate, persist, flush, getState, getDb, getSession, getCurrentUser, getPrefs, getUi,
  subscribe, setPref, setUi, setSession, mutate, mutateLocal, resetDatabase,
  clearAllStorage, getPatch, loadPatch, select, clearSelectors, findRepo, findUser,
  findOrg, findOwner, reposOf, visibleRepos, notificationsFor, snapshot,
};
