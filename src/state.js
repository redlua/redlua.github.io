import { toast } from './core/toast.js';

/**
 * RedGet — application state and persistence.
 *
 * Everything lives in localStorage; there is no server and no network.
 *
 *   localStorage["redget.db.v4"]      → DB      { users: {key: user}, follows: {} }
 *   localStorage["redget.session.v4"] → session account key (the only credential)
 *   localStorage["redget.theme.v4"]   → theme   'dark' | 'light' | 'hc'
 *
 * DB is a live object: modules import it and mutate it, then call saveDB().
 * ME is the signed-in user record (or null) — read it through the binding, and
 * change it only with setSession()/clearSession() so the stored key stays in
 * sync with the in-memory pointer.
 *
 * The database starts EMPTY. Nothing is seeded: no demo people, no demo
 * forges, no fake followers and no fake notification counts. Every row
 * in it was created by a real account in this browser.
 */

export var DB_KEY = 'redget.db.v5';
export var SESSION_KEY = 'redget.session.v4';
export var THEME_KEY = 'redget.theme.v4';

/** Storage keys this build can still read, newest first. */
export var LEGACY_DB_KEYS = ['redget.db.v4'];

/** Read the database, tolerating missing/corrupt storage. */
export function loadDB() {
  try {
    var raw = localStorage.getItem(DB_KEY);
    if (!raw) {
      // A database written by an earlier build lives under its own key; read
      // it, migrate it, and move it to the current key so nothing is lost.
      for (var i = 0; i < LEGACY_DB_KEYS.length; i++) {
        var legacyRaw = localStorage.getItem(LEGACY_DB_KEYS[i]);
        if (!legacyRaw) continue;
        var legacy = JSON.parse(legacyRaw);
        if (!legacy || typeof legacy !== 'object') continue;
        var migrated = normalizeDB(legacy);
        try {
          localStorage.setItem(DB_KEY, JSON.stringify(migrated));
          localStorage.removeItem(LEGACY_DB_KEYS[i]);
        } catch (e) { /* quota or private mode: keep the migrated copy in memory */ }
        return migrated;
      }
    }
    var parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return emptyDB();
    return normalizeDB(parsed);
  } catch (e) {
    return emptyDB();
  }
}

/**
 * Shape of a fresh database:
 *
 *   users          { [accountKey]: user }   accounts created in this browser
 *   orgs           { [slug]: org }          organizations
 *   stars          [{ user, forgeId, at }]   real stars (one per user per forge)
 *   watches        [{ user, forgeId, at }]   real watch subscriptions
 *   forks          [{ user, forgeId, from, at }]  forks created here
 *   notifications  [{ id, to, from, kind, text, href, at, read }]
 *   projects       [project]                boards that can span forges
 *   gists          [gist]
 *   codespaces     [codespace]
 *   sshKeys        { [username]: [{ id, title, key, fingerprint, added }] }
 *   marketInstalls [{ app, owner, at }]     marketplace apps installed locally
 *   sessions       [{ id, user, at, lastSeen, agent }]  real sign-in records
 */
function emptyDB() {
  return {
    users: {},
    orgs: {},
    stars: [],
    watches: [],
    forks: [],
    notifications: [],
    projects: [],
    gists: [],
    codespaces: [],
    sshKeys: {},
    marketInstalls: [],
    sessions: [],
    version: 5,
  };
}

/**
 * Guarantee every collection exists so views never have to guard for
 * databases written by an older build.
 */
function normalizeDB(db) {
  var base = emptyDB();
  Object.keys(base).forEach(function (key) {
    if (db[key] === undefined || db[key] === null) db[key] = base[key];
  });
  if (typeof db.users !== 'object') db.users = {};
  migrate(db);
  return db;
}

/**
 * Move a database written by an earlier build onto the current shape.
 *
 * v4 → v5 renamed the record type: a project is a *forge*, so `user.repos`
 * became `user.forges` and the `repoId` on stars, watches and forks became
 * `forgeId`. Data written by the older build is still readable — it is renamed
 * on load, then persisted in the new shape the next time anything is saved.
 */
function migrate(db) {
  if (!db.version || db.version < 5) {
    ['stars', 'watches', 'forks'].forEach(function (key) {
      (db[key] || []).forEach(function (record) {
        if (record && record.repoId !== undefined && record.forgeId === undefined) {
          record.forgeId = record.repoId;
          delete record.repoId;
        }
      });
    });
  }

  var owners = []
    .concat(Object.keys(db.users || {}).map(function (k) { return db.users[k]; }))
    .concat(Object.keys(db.orgs || {}).map(function (slug) { return db.orgs[slug]; }));

  owners.forEach(function (owner) {
    if (!owner) return;
    if (owner.repos && !owner.forges) {
      owner.forges = owner.repos;
      delete owner.repos;
    }
    if (!owner.forges) owner.forges = [];
  });

  (db.marketInstalls || []).forEach(function (install) {
    if (install && install.repoName && !install.forgeName) {
      install.forgeName = install.repoName;
      delete install.repoName;
    }
  });

  (db.codespaces || []).forEach(function (codespace) {
    if (!codespace) return;
    if (codespace.repoOwner && !codespace.forgeOwner) {
      codespace.forgeOwner = codespace.repoOwner;
      delete codespace.repoOwner;
    }
    if (codespace.repoName && !codespace.forgeName) {
      codespace.forgeName = codespace.repoName;
      delete codespace.repoName;
    }
  });

  db.version = 5;
  return db;
}

/** Persist. Surfaces a toast when the browser refuses (quota exceeded). */
export function saveDB() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
    return true;
  } catch (e) {
    if (typeof window !== 'undefined' && window.RedGet && window.RedGet.toast) {
      window.RedGet.toast('Storage full — changes were not saved');
    }
    return false;
  }
}

export var DB = loadDB();

/** Signed-in user record, or null when browsing anonymously. */
export var ME = null;

/** Current header/explore search text. */
export var searchQuery = '';

export function setSearchQuery(value) {
  searchQuery = String(value == null ? '' : value);
}

/** Look a user up by their account key. */
export function userByKey(key) {
  return (DB.users && DB.users[key]) || null;
}

/**
 * Record a sign-in so Settings → Sessions shows real entries.
 * Returns the session record.
 */
export function recordLogin(user) {
  if (!user) return null;
  var agent = '';
  try { agent = navigator.userAgent || ''; } catch (e) { agent = ''; }
  var record = {
    id: 'ses_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    user: user.username,
    at: Date.now(),
    lastSeen: Date.now(),
    agent: agent,
  };
  DB.sessions = (DB.sessions || []).filter(function (s) { return s.user !== user.username; });
  DB.sessions.unshift(record);
  if (DB.sessions.length > 20) DB.sessions.length = 20;
  saveDB();
  return record;
}

/** Update the "last seen" stamp for the current session. */
export function touchSession() {
  if (!ME) return;
  var found = (DB.sessions || []).filter(function (s) { return s.user === ME.username; })[0];
  if (found) { found.lastSeen = Date.now(); saveDB(); }
}

export function sessionsFor(username) {
  return (DB.sessions || []).filter(function (s) { return s.user === username; });
}

export function revokeSession(id) {
  DB.sessions = (DB.sessions || []).filter(function (s) { return s.id !== id; });
  saveDB();
}

/** Restore a session from the stored key. Returns the user or null. */
export function restoreSession() {
  var saved = null;
  try { saved = localStorage.getItem(SESSION_KEY); } catch (e) { saved = null; }
  if (saved && DB.users[saved]) {
    ME = DB.users[saved];
    return ME;
  }
  ME = null;
  return null;
}

/** Sign in as a user record and remember the key. */
export function setSession(user) {
  ME = user || null;
  try {
    if (ME) localStorage.setItem(SESSION_KEY, ME.key);
    else localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* private mode: keep the in-memory session only */ }
  return ME;
}

/** Sign out: drop the stored key, keep the database. */
export function clearSession() {
  ME = null;
  searchQuery = '';
  try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
}

/** Forget everything: accounts, forges, session, preferences. */
export function resetAllData() {
  DB = emptyDB();
  clearSession();
  try {
    localStorage.removeItem(DB_KEY);
    localStorage.removeItem(SESSION_KEY);
  } catch (e) { /* ignore */ }
  saveDB();
}
