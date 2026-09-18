/**
 * RedGet — forges: lookup, creation, activity log.
 *
 * A forge record:
 *
 *   {
 *     id, name, desc, visibility: 'public'|'private',
 *     language, ownerUsername,
 *     created, updated,                       // epoch ms
 *     files: [{ name, content, commitMsg, commitTime, sha, author, size }],
 *     branches: ['main'], defaultBranch: 'main',
 *     issues: [issue], pulls: [pull], releases: [release], tags: ['v1.0.0'],
 *     commits: [commit],                      // derived history, newest first
 *     wiki: [{ title, slug, body, updated, author, history: [] }],
 *     discussions: [discussion],
 *     packages: [package],
 *     actions: { workflows: [], runs: [] },
 *     security: { advisories: [], dependabot: [], scanning: [], secrets: [] },
 *     forkedFrom: { owner, forge, id } | null,
 *     topics: [], pinned: false, archived: false,
 *   }
 *
 * Stars, forks and watchers are NOT stored on the record — they are derived
 * from DB.stars / DB.forks / DB.watches (see core/social.js) so that a count
 * can never disagree with the list behind it.
 */

import { DB, ME, saveDB } from '../state.js';
import { getUserByUsername } from './social.js';
import { esc, uid, shortSha, fullSha } from './util.js';

/* ----------------------------------------------------------------- lookup */

/**
 * Resolve `owner/name`, searching personal accounts first and then
 * organizations. Returns { user, forge, org } or null.
 */
export function findForge(ownerUsername, forgeName) {
  var owner = String(ownerUsername || '');
  var name = String(forgeName || '');
  var user = getUserByUsername(owner);
  if (user) {
    for (var i = 0; i < (user.forges || []).length; i++) {
      if (user.forges[i].name === name) return { user: user, forge: user.forges[i], org: false };
    }
  }
  var slug = owner.toLowerCase();
  var org = DB.orgs && DB.orgs[slug];
  if (org) {
    for (var j = 0; j < (org.forges || []).length; j++) {
      if (org.forges[j].name === name) return { user: org, forge: org.forges[j], org: true };
    }
  }
  return null;
}

/** Every forge visible to the signed-in account: [{ user, forge, org }]. */
export function visibleForges() {
  var out = [];
  Object.keys(DB.users).forEach(function (k) {
    var u = DB.users[k];
    (u.forges || []).forEach(function (r) {
      if (r.visibility === 'private' && (!ME || u.username !== ME.username)) return;
      out.push({ user: u, forge: r, org: false });
    });
  });
  Object.keys(DB.orgs || {}).forEach(function (slug) {
    var org = DB.orgs[slug];
    (org.forges || []).forEach(function (r) {
      if (r.visibility === 'private' && !isOrgMember(slug, ME && ME.username)) return;
      out.push({ user: org, forge: r, org: true });
    });
  });
  return out;
}

/** Forges the signed-in account can see, newest activity first. */
export function myForges() {
  if (!ME) return [];
  return (ME.forges || []).slice().sort(function (a, b) { return b.updated - a.updated; });
}

export function isOrgMember(slug, username) {
  var org = DB.orgs && DB.orgs[slug];
  if (!org || !username) return false;
  return (org.members || []).some(function (m) { return m.username === username; });
}

/* -------------------------------------------------------------- creation */

/**
 * Create a forge record owned by `ownerUsername`.
 * With `withReadme` the forge starts with README.md + .redignore and one
 * real commit; without it the forge is empty.
 */
export function createForge(name, desc, visibility, language, withReadme, ownerUsername) {
  var files = [];
  var now = Date.now();
  var sha = fullSha();
  var author = ownerUsername || (ME ? ME.username : 'you');

  if (withReadme) {
    files.push({
      name: 'README.md',
      content: '# ' + name + '\n\n' + (desc || 'A new forge on RedGet.') +
        '\n\n## Getting started\n\n```bash\nred copy /' + author + '/' + name + '\ncd ' + name + '\n```\n\n> Created on RedGet.',
      commitMsg: 'Initial commit',
      commitTime: now,
      sha: sha,
      author: author,
    });
    files.push({
      name: '.redignore',
      content: 'node_modules/\n.env\n.DS_Store\n*.log\ndist/\nbuild/',
      commitMsg: 'Initial commit',
      commitTime: now,
      sha: sha,
      author: author,
    });
  }

  var forge = {
    id: uid('forge'),
    name: name,
    desc: desc || '',
    visibility: visibility || 'public',
    language: language || 'Other',
    ownerUsername: author,
    created: now,
    updated: now,
    files: files,
    branches: ['main'],
    defaultBranch: 'main',
    issues: [],
    pulls: [],
    releases: [],
    tags: withReadme ? ['v0.1.0'] : [],
    commits: withReadme ? [{
      sha: sha,
      short: sha.slice(0, 7),
      msg: 'Initial commit',
      body: '',
      author: author,
      time: now,
      files: files.map(function (f) { return f.name; }),
      additions: files.reduce(function (n, f) { return n + f.content.split('\n').length; }, 0),
      deletions: 0,
      parents: [],
    }] : [],
    wiki: [],
    discussions: [],
    packages: [],
    actions: { workflows: [], runs: [] },
    security: { advisories: [], dependabot: [], scanning: [], secrets: [] },
    forkedFrom: null,
    topics: [],
    pinned: false,
    archived: false,
  };
  return forge;
}

/** Guarantee the collections added after the first release exist. */
export function ensureForgeShape(forge, ownerUsername) {
  if (!forge.wiki) forge.wiki = [];
  if (!forge.discussions) forge.discussions = [];
  if (!forge.packages) forge.packages = [];
  if (!forge.releases) forge.releases = [];
  if (!forge.tags) forge.tags = [];
  if (!forge.branches) forge.branches = [forge.defaultBranch || 'main'];
  if (!forge.commits) forge.commits = [];
  if (!forge.actions) forge.actions = { workflows: [], runs: [] };
  if (!forge.security) forge.security = { advisories: [], dependabot: [], scanning: [], secrets: [] };
  if (!forge.topics) forge.topics = [];
  if (forge.ownerUsername === undefined) forge.ownerUsername = ownerUsername || '';
  forge.files.forEach(function (f) {
    if (!f.sha) f.sha = shortSha();
    if (!f.author) f.author = forge.ownerUsername || (ME ? ME.username : 'you');
    if (!f.commitTime) f.commitTime = forge.updated;
    if (!f.commitMsg) f.commitMsg = 'Initial commit';
  });
  return forge;
}

/** Add a commit record to a forge (used by file edits and merges). */
export function addCommit(forge, msg, changedFiles, additions, deletions, author) {
  var sha = fullSha();
  var now = Date.now();
  var commit = {
    sha: sha,
    short: sha.slice(0, 7),
    msg: msg || 'Update files',
    body: '',
    author: author || (ME ? ME.username : forge.ownerUsername),
    time: now,
    files: changedFiles || [],
    additions: additions || 0,
    deletions: deletions || 0,
    parents: forge.commits && forge.commits.length ? [forge.commits[0].sha] : [],
  };
  if (!forge.commits) forge.commits = [];
  forge.commits.unshift(commit);
  if (forge.commits.length > 500) forge.commits.length = 500;
  forge.updated = now;
  return commit;
}

/* -------------------------------------------------------------- activity */

/**
 * Append an entry to the signed-in account's activity feed.
 * The feed is capped at 50 entries and drives the dashboard and the
 * contribution graph on the profile.
 */
export function logActivity(kind, target) {
  if (!ME) return null;
  if (!ME.activity) ME.activity = [];
  var entry = { t: Date.now(), kind: kind, target: target || '' };
  ME.activity.unshift(entry);
  if (ME.activity.length > 200) ME.activity.length = 200;
  saveDB();
  return entry;
}

export var ACTIVITY_LABELS = {
  'account.create': function () { return 'Account created'; },
  'profile.update': function () { return 'Updated profile details'; },
  'avatar.update': function () { return 'Changed profile picture'; },
  'key.rotate': function () { return 'Rotated account key'; },
  'forge.create': function (t) { return 'Created forge <b>' + t + '</b>'; },
  'forge.delete': function (t) { return 'Deleted forge <b>' + t + '</b>'; },
  'forge.fork': function (t) { return 'Forked <b>' + t + '</b>'; },
  'forge.star': function (t) { return 'Starred <b>' + t + '</b>'; },
  'forge.file.add': function (t) { return 'Added a file to <b>' + t + '</b>'; },
  'forge.file.edit': function (t) { return 'Edited a file in <b>' + t + '</b>'; },
  'forge.release': function (t) { return 'Published release <b>' + t + '</b>'; },
  'forge.branch': function (t) { return 'Created branch <b>' + t + '</b>'; },
  'forge.wiki': function (t) { return 'Edited the wiki of <b>' + t + '</b>'; },
  'follow': function (t) { return 'Started following <b>' + t + '</b>'; },
  'issue.open': function (t) { return 'Opened issue <b>' + t + '</b>'; },
  'issue.close': function (t) { return 'Closed issue <b>' + t + '</b>'; },
  'issue.comment': function (t) { return 'Commented on issue <b>' + t + '</b>'; },
  'pr.open': function (t) { return 'Opened pull request <b>' + t + '</b>'; },
  'pr.merge': function (t) { return 'Merged pull request <b>' + t + '</b>'; },
  'pr.comment': function (t) { return 'Commented on pull request <b>' + t + '</b>'; },
  'discussion.open': function (t) { return 'Started discussion <b>' + t + '</b>'; },
  'project.create': function (t) { return 'Created project <b>' + t + '</b>'; },
  'gist.create': function (t) { return 'Created gist <b>' + t + '</b>'; },
  'org.create': function (t) { return 'Created organization <b>' + t + '</b>'; },
  'codespace.create': function (t) { return 'Created codespace <b>' + t + '</b>'; },
  'release.create': function (t) { return 'Published <b>' + t + '</b>'; },
};

/** Human-readable (HTML) label for one activity entry. */
export function activityLabel(e) {
  var t = esc(e.target);
  var fn = ACTIVITY_LABELS[e.kind];
  return fn ? fn(t) : 'Activity recorded';
}

/** Activity entries for a user, newest first. */
export function activityFor(user, limit) {
  return ((user && user.activity) || []).slice(0, limit || 50);
}

/**
 * Who may push to a forge: the owning account, an organisation
 * owner/admin/writer, or an account listed as a collaborator.
 */
export function canEditForge(user, forge) {
  if (!ME) return false;
  if (ME.username === user.username) return true;
  if (forge && ME.username === forge.ownerUsername) return true;
  var org = (DB.orgs || {})[user.username];
  if (org) {
    var role = (org.members || []).filter(function (m) { return m.username === ME.username; })[0];
    if (role && ['owner', 'admin', 'write'].indexOf(role.role) !== -1) return true;
  }
  return (forge && forge.collaborators ? forge.collaborators : []).indexOf(ME.username) !== -1;
}
