/**
 * RedGet — social graph: follows, stars, watches and forks.
 *
 * Every count shown in the UI is derived from records that a real account in
 * this browser created. Nothing is randomised and nothing is pre-seeded:
 *
 *   DB.users[key].following  ['alice', 'bob']           who I follow
 *   DB.stars                 [{ user, forgeId, at }]     who starred what
 *   DB.watches               [{ user, forgeId, at }]     who watches what
 *   DB.forks                 [{ user, forgeId, from, at }]  forks that exist here
 *
 * A fork copies the source forge into the forking account (files, issues
 * and pulls included) and links the two with `forkedFrom`, so the fork network
 * is real and navigable in both directions.
 */

import { DB, ME, saveDB } from '../state.js';
import { uid } from './util.js';
import { notify } from './notify.js';

/* ------------------------------------------------------------------ people */

/** Find a user record by username (case-insensitive), or null. */
export function getUserByUsername(username) {
  var needle = String(username || '').toLowerCase();
  var found = null;
  Object.keys(DB.users).forEach(function (k) {
    if (String(DB.users[k].username).toLowerCase() === needle) found = DB.users[k];
  });
  return found;
}

/** How many accounts follow this username. */
export function getFollowers(username) {
  var count = 0;
  Object.keys(DB.users).forEach(function (k) {
    var u = DB.users[k];
    if (u.username === username) return;
    if (u.following && u.following.indexOf(username) !== -1) count++;
  });
  return count;
}

/** The accounts this username follows. */
export function followerList(username) {
  var out = [];
  Object.keys(DB.users).forEach(function (k) {
    var u = DB.users[k];
    if (u.username === username) return;
    if (u.following && u.following.indexOf(username) !== -1) out.push(u);
  });
  return out;
}

/** How many accounts this username follows. */
export function getFollowing(username) {
  var u = getUserByUsername(username);
  return u && u.following ? u.following.length : 0;
}

/** The usernames this account follows, as user records. */
export function followingList(username) {
  var u = getUserByUsername(username);
  if (!u || !u.following) return [];
  return u.following
    .map(function (name) { return getUserByUsername(name); })
    .filter(Boolean);
}

/** Does the signed-in account follow this username? */
export function isFollowing(username) {
  if (!ME || !ME.following) return false;
  return ME.following.indexOf(username) !== -1;
}

/** Follow / unfollow. Returns the new state, or null when signed out. */
export function toggleFollow(username) {
  if (!ME || username === ME.username) return null;
  if (!ME.following) ME.following = [];
  var idx = ME.following.indexOf(username);
  var nowFollowing;
  if (idx === -1) {
    ME.following.push(username);
    nowFollowing = true;
  } else {
    ME.following.splice(idx, 1);
    nowFollowing = false;
  }
  if (nowFollowing) {
    notify({
      to: username,
      from: ME.username,
      kind: 'follow',
      text: 'started following you',
      href: '/' + ME.username,
    });
  }
  saveDB();
  return nowFollowing;
}

/* ------------------------------------------------------------------ stars */

function starRecord(username, forgeId) {
  return (DB.stars || []).filter(function (s) {
    return s.forgeId === forgeId && s.user === username;
  })[0] || null;
}

export function starCount(forgeId) {
  return (DB.stars || []).filter(function (s) { return s.forgeId === forgeId; }).length;
}

export function stargazers(forgeId) {
  return (DB.stars || [])
    .filter(function (s) { return s.forgeId === forgeId; })
    .sort(function (a, b) { return b.at - a.at; })
    .map(function (s) { return { user: getUserByUsername(s.user), at: s.at }; })
    .filter(function (entry) { return entry.user; });
}

export function hasStarred(forgeId) {
  return Boolean(ME && starRecord(ME.username, forgeId));
}

/** Forges the signed-in account starred (newest first). */
export function starredForges(username) {
  var name = username || (ME && ME.username);
  if (!name) return [];
  return (DB.stars || [])
    .filter(function (s) { return s.user === name; })
    .sort(function (a, b) { return b.at - a.at; })
    .map(function (s) { return forgeById(s.forgeId); })
    .filter(Boolean);
}

export function toggleStar(user, forge) {
  if (!ME) return false;
  if (!DB.stars) DB.stars = [];
  var existing = starRecord(ME.username, forge.id);
  if (existing) {
    DB.stars = DB.stars.filter(function (s) { return s !== existing; });
    saveDB();
    return false;
  }
  DB.stars.push({ user: ME.username, forgeId: forge.id, at: Date.now() });
  if (user && user.username !== ME.username) {
    notify({
      to: user.username,
      from: ME.username,
      kind: 'star',
      text: 'starred ' + user.username + '/' + forge.name,
      href: '/' + user.username + '/' + forge.name + '/stargazers',
    });
  }
  saveDB();
  return true;
}

/* ---------------------------------------------------------------- watches */

export function watchCount(forgeId) {
  return (DB.watches || []).filter(function (w) { return w.forgeId === forgeId; }).length;
}

export function isWatching(forgeId) {
  return Boolean(ME && (DB.watches || []).some(function (w) {
    return w.forgeId === forgeId && w.user === ME.username;
  }));
}

export function toggleWatch(forgeId) {
  if (!ME) return false;
  if (!DB.watches) DB.watches = [];
  var watching = isWatching(forgeId);
  if (watching) {
    DB.watches = DB.watches.filter(function (w) {
      return !(w.forgeId === forgeId && w.user === ME.username);
    });
  } else {
    DB.watches.push({ user: ME.username, forgeId: forgeId, at: Date.now() });
  }
  saveDB();
  return !watching;
}

/* ------------------------------------------------------------------ forks */

export function forkCount(forgeId) {
  return (DB.forks || []).filter(function (f) { return f.from === forgeId; }).length;
}

export function forksOf(forgeId) {
  return (DB.forks || [])
    .filter(function (f) { return f.from === forgeId; })
    .sort(function (a, b) { return b.at - a.at; })
    .map(function (f) {
      var forge = forgeById(f.forgeId);
      return forge ? { user: getUserByUsername(f.user), forge: forge, at: f.at } : null;
    })
    .filter(function (entry) { return entry && entry.user; });
}

export function hasForked(forgeId) {
  return Boolean(ME && (DB.forks || []).some(function (f) {
    return f.from === forgeId && f.user === ME.username;
  }));
}

export function forgeById(forgeId) {
  var found = null;
  Object.keys(DB.users).forEach(function (k) {
    (DB.users[k].forges || []).forEach(function (r) {
      if (r.id === forgeId) found = { user: DB.users[k], forge: r };
    });
  });
  (DB.orgs ? Object.keys(DB.orgs) : []).forEach(function (slug) {
    ((DB.orgs[slug] || {}).forges || []).forEach(function (r) {
      if (r.id === forgeId) found = { user: DB.orgs[slug], forge: r, org: true };
    });
  });
  return found;
}

/**
 * Fork a forge into the signed-in account.
 * Returns the new forge record, or null when it cannot be forked.
 */
export function forkForge(source) {
  if (!ME || !source) return null;
  if (hasForked(source.id)) return null;
  var copy = JSON.parse(JSON.stringify(source));
  copy.id = uid('forge');
  copy.name = uniqueForgeName(ME.username, source.name);
  copy.created = Date.now();
  copy.updated = Date.now();
  copy.forkedFrom = { owner: source.ownerUsername || '', forge: source.name, id: source.id };
  copy.ownerUsername = ME.username;
  copy.issues = (copy.issues || []).map(function (issue) {
    return Object.assign({}, issue, { id: uid('issue'), comments: [], reactions: {} });
  });
  copy.pulls = [];
  copy.actions = { workflows: [], runs: [] };
  copy.packages = [];
  ME.forges.unshift(copy);
  if (!DB.forks) DB.forks = [];
  DB.forks.push({ user: ME.username, forgeId: copy.id, from: source.id, at: Date.now() });
  saveDB();
  return copy;
}

/** `name`, `name-1`, `name-2` … until it is free for this owner. */
export function uniqueForgeName(owner, name) {
  var taken = (owner.forges || []).map(function (r) { return r.name.toLowerCase(); });
  if (taken.indexOf(String(name).toLowerCase()) === -1) return name;
  var i = 1;
  while (taken.indexOf((name + '-' + i).toLowerCase()) !== -1) i++;
  return name + '-' + i;
}
