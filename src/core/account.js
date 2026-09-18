/**
 * RedGet — accounts.
 *
 * An account has no email and no password. Creating one generates a
 * 15-character key (see core/keys.js) that is the only credential; it is shown
 * exactly once and cannot be recovered.
 *
 * A new account is genuinely empty: no forges, no followers, no
 * activity. Everything on the profile afterwards was created by a real account
 * in this browser.
 */

import { DB, saveDB, setSession, recordLogin } from '../state.js';
import { genKey } from './keys.js';
import { logActivity } from './forges.js';

/**
 * Create and persist a new account, then sign in as it.
 * @param {string} username  already validated: lowercase, 2–30 chars
 * @param {string} [displayName]
 * @returns {object} the user record
 */
export function createUser(username, displayName) {
  var key = genKey();
  while (DB.users[key]) key = genKey();

  var user = {
    key: key,
    username: username,
    displayName: displayName || username,
    bio: '',
    company: '',
    location: '',
    website: '',
    avatar: { type: 'initials', value: '', bg: '#da3633' },
    joined: Date.now(),
    following: [],
    forges: [],
    activity: [],
    pinned: [],
    status: { emoji: '', message: '', busy: false },
    social: { links: [] },
    prefs: { theme: 'dark', editor: 'basic', diffView: 'unified', emailVisible: false },
    sshKeys: [],
    orgs: [],
  };

  DB.users[key] = user;
  DB.sshKeys[username] = [];
  saveDB();
  setSession(user);
  recordLogin(user);
  logActivity('account.create', '');
  return user;
}

/** Is this username free? */
export function usernameAvailable(username) {
  var needle = String(username || '').toLowerCase();
  return !Object.keys(DB.users).some(function (k) {
    return String(DB.users[k].username).toLowerCase() === needle;
  }) && !(DB.orgs && DB.orgs[needle]);
}

/**
 * Validate a username the same way the signup form does.
 * @returns {string|null} an error message, or null when valid
 */
export function validateUsername(username) {
  var value = String(username || '').trim().toLowerCase();
  if (value.length < 2) return 'Username must be at least 2 characters.';
  if (value.length > 30) return 'Username must be 30 characters or fewer.';
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) return 'Use lowercase letters, numbers and hyphens only.';
  if (/--/.test(value)) return 'Username cannot contain consecutive hyphens.';
  if (!usernameAvailable(value)) return 'That username is already taken.';
  return null;
}

/** Total accounts in this browser (used by explore and the docs page). */
export function accountCount() {
  return Object.keys(DB.users).length;
}

/** Every account, newest first. */
export function allUsers() {
  return Object.keys(DB.users)
    .map(function (k) { return DB.users[k]; })
    .sort(function (a, b) { return b.joined - a.joined; });
}

/** Permanently delete an account and everything it owns. */
export function deleteAccount(username) {
  var user = null;
  Object.keys(DB.users).forEach(function (k) {
    if (DB.users[k].username === username) user = DB.users[k];
  });
  if (!user) return false;
  var forgeIds = (user.forges || []).map(function (r) { return r.id; });
  delete DB.users[user.key];
  DB.stars = (DB.stars || []).filter(function (s) { return s.user !== username && forgeIds.indexOf(s.forgeId) === -1; });
  DB.watches = (DB.watches || []).filter(function (w) { return w.user !== username && forgeIds.indexOf(w.forgeId) === -1; });
  DB.forks = (DB.forks || []).filter(function (f) { return f.user !== username && forgeIds.indexOf(f.from) === -1 && forgeIds.indexOf(f.forgeId) === -1; });
  DB.notifications = (DB.notifications || []).filter(function (n) { return n.to !== username && n.from !== username; });
  Object.keys(DB.users).forEach(function (k) {
    var u = DB.users[k];
    u.following = (u.following || []).filter(function (name) { return name !== username; });
    u.activity = (u.activity || []).filter(function (a) { return a.target !== username; });
  });
  Object.keys(DB.orgs || {}).forEach(function (slug) {
    DB.orgs[slug].members = (DB.orgs[slug].members || []).filter(function (m) { return m.username !== username; });
  });
  if (DB.sshKeys) delete DB.sshKeys[username];
  saveDB();
  return true;
}
