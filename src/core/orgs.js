/**
 * RedGet — organizations and enterprises.
 *
 * An organization is an owner like a user: it has forges, members with
 * roles, teams, projects and settings. Records live in `DB.orgs`, keyed by
 * slug (the lowercase name used in URLs).
 *
 *   org = {
 *     slug, name, description, location, website, avatar: {bg},
 *     created, owner,                       // username that created it
 *     members: [{ username, role: 'owner'|'admin'|'member', added }],
 *     teams:   [{ id, name, description, members: [username], privacy }],
 *     forges:   [forge],                      // same shape as user forges
 *     projects:[projectId],
 *     settings:{ billing: 'free'|'team'|'enterprise', sso: false,
 *                defaultPermission: 'read'|'write'|'none', verified: false },
 *   }
 *
 * Enterprises group organizations; the record is derived from the orgs that
 * share `settings.enterprise`, so there is nothing fake to display.
 */

import { DB, ME, saveDB } from '../state.js';
import { uid } from './util.js';
import { getUserByUsername } from './social.js';
import { logActivity } from './forges.js';
import { notify } from './notify.js';

/* --------------------------------------------------------------- lookup */

export function allOrgs() {
  return Object.keys(DB.orgs || {})
    .map(function (slug) { return DB.orgs[slug]; })
    .sort(function (a, b) { return b.created - a.created; });
}

export function orgBySlug(slug) {
  return (DB.orgs || {})[String(slug || '').toLowerCase()] || null;
}

export function orgsFor(username) {
  var name = username || (ME && ME.username);
  if (!name) return [];
  return allOrgs().filter(function (org) {
    return (org.members || []).some(function (m) { return m.username === name; });
  });
}

export function orgRole(org, username) {
  var member = (org.members || []).filter(function (m) { return m.username === username; })[0];
  return member ? member.role : null;
}

export function isOrgOwner(org, username) {
  return orgRole(org, username) === 'owner';
}

export function slugAvailable(slug) {
  var needle = String(slug || '').toLowerCase();
  return !DB.orgs[needle] && !getUserByUsername(needle);
}

export function validateOrgName(name) {
  var value = String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (value.length < 2) return 'Organization name must be at least 2 characters.';
  if (value.length > 39) return 'Organization name must be 39 characters or fewer.';
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value)) return 'Use lowercase letters, numbers and hyphens only.';
  if (!slugAvailable(value)) return 'That name is already taken.';
  return null;
}

/* -------------------------------------------------------------- create */

export function createOrg(payload) {
  if (!ME) return null;
  var slug = String(payload.name || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (validateOrgName(slug)) return null;

  var org = {
    slug: slug,
    name: payload.displayName || slug,
    description: payload.description || '',
    location: payload.location || '',
    website: payload.website || '',
    avatar: { type: 'initials', value: '', bg: '#da3633' },
    created: Date.now(),
    owner: ME.username,
    members: [{ username: ME.username, role: 'owner', added: Date.now() }],
    teams: [{
      id: uid('team'),
      name: 'Owners',
      description: 'Full administrative access',
      members: [ME.username],
      privacy: 'closed',
    }],
    forges: [],
    projects: [],
    settings: {
      billing: payload.billing || 'free',
      sso: false,
      defaultPermission: 'read',
      verified: false,
      enterprise: payload.enterprise || null,
    },
  };

  if (!DB.orgs) DB.orgs = {};
  DB.orgs[slug] = org;
  if (!ME.orgs) ME.orgs = [];
  ME.orgs.push(slug);
  saveDB();
  logActivity('org.create', slug);
  return org;
}

export function deleteOrg(slug) {
  var org = orgBySlug(slug);
  if (!org) return false;
  delete DB.orgs[slug];
  Object.keys(DB.users).forEach(function (k) {
    var u = DB.users[k];
    u.orgs = (u.orgs || []).filter(function (s) { return s !== slug; });
  });
  saveDB();
  return true;
}

export function updateOrg(slug, changes) {
  var org = orgBySlug(slug);
  if (!org) return null;
  Object.keys(changes || {}).forEach(function (key) { org[key] = changes[key]; });
  if (!org.settings) org.settings = {};
  if (changes.settings) Object.keys(changes.settings).forEach(function (key) { org.settings[key] = changes.settings[key]; });
  saveDB();
  return org;
}

/* -------------------------------------------------------------- members */

export function addMember(slug, username, role) {
  var org = orgBySlug(slug);
  var user = getUserByUsername(username);
  if (!org || !user) return null;
  if ((org.members || []).some(function (m) { return m.username === user.username; })) return null;
  org.members.push({ username: user.username, role: role || 'member', added: Date.now() });
  if (!user.orgs) user.orgs = [];
  if (user.orgs.indexOf(slug) === -1) user.orgs.push(slug);
  saveDB();
  notify({
    to: user.username,
    from: ME ? ME.username : org.owner,
    kind: 'system',
    text: 'added you to the ' + org.name + ' organization',
    href: '/orgs/' + org.slug,
  });
  return user;
}

export function removeMember(slug, username) {
  var org = orgBySlug(slug);
  if (!org) return false;
  org.members = (org.members || []).filter(function (m) { return m.username !== username; });
  var user = getUserByUsername(username);
  if (user) user.orgs = (user.orgs || []).filter(function (s) { return s !== slug; });
  saveDB();
  return true;
}

export function setMemberRole(slug, username, role) {
  var org = orgBySlug(slug);
  if (!org) return false;
  (org.members || []).forEach(function (m) { if (m.username === username) m.role = role; });
  saveDB();
  return true;
}

/* ---------------------------------------------------------------- teams */

export function createTeam(slug, payload) {
  var org = orgBySlug(slug);
  if (!org) return null;
  var team = {
    id: uid('team'),
    name: payload.name,
    description: payload.description || '',
    members: payload.members || [],
    privacy: payload.privacy || 'closed',
    forges: payload.forges || [],
  };
  org.teams.push(team);
  saveDB();
  return team;
}

export function deleteTeam(slug, teamId) {
  var org = orgBySlug(slug);
  if (!org) return false;
  org.teams = (org.teams || []).filter(function (t) { return t.id !== teamId; });
  saveDB();
  return true;
}

export function addToTeam(slug, teamId, username) {
  var org = orgBySlug(slug);
  if (!org) return false;
  org.teams.forEach(function (t) {
    if (t.id === teamId && t.members.indexOf(username) === -1) t.members.push(username);
  });
  saveDB();
  return true;
}

export function removeFromTeam(slug, teamId, username) {
  var org = orgBySlug(slug);
  if (!org) return false;
  org.teams.forEach(function (t) {
    if (t.id === teamId) t.members = t.members.filter(function (m) { return m !== username; });
  });
  saveDB();
  return true;
}

/* ---------------------------------------------------------------- forges */

export function orgForge(slug, name) {
  var org = orgBySlug(slug);
  if (!org) return null;
  return (org.forges || []).filter(function (r) { return r.name === name; })[0] || null;
}

/* ---------------------------------------------------------- enterprises */

/**
 * Enterprises are derived: every org whose settings.enterprise matches is a
 * member of that enterprise. Nothing is invented.
 */
export function enterprises() {
  var map = {};
  allOrgs().forEach(function (org) {
    var name = org.settings && org.settings.enterprise;
    if (!name) return;
    if (!map[name]) map[name] = { name: name, orgs: [], members: 0, forges: 0 };
    map[name].orgs.push(org);
    map[name].members += (org.members || []).length;
    map[name].forges += (org.forges || []).length;
  });
  return Object.keys(map).map(function (k) { return map[k]; });
}
