/**
 * RedGet — marketplace, packages and discussions.
 *
 * Marketplace: a fixed catalogue of RedGet Apps. Installing one writes a real
 * record (`DB.marketInstalls`) tying the app to an owner, and grants the app
 * the permissions you accepted — which is what the app's page forgerts.
 *
 * Packages: a package is created from a forge (a release with assets, or
 * manually) and keeps real versions.
 *
 * Discussions: forge-scoped threads with categories, answers and
 * upvotes, stored on the forge record.
 */

import { DB, ME, saveDB } from '../state.js';
import { uid } from './util.js';
import { logActivity } from './forges.js';
import { notify } from './notify.js';

/* =========================================================== marketplace */

export var MARKETPLACE_APPS = [
  {
    id: 'redget-ci', name: 'RedGet CI', vendor: 'RedGet', category: 'Continuous integration',
    tagline: 'Run tests on every push with the workflow files already in your forge.',
    permissions: ['Read forge files', 'Write checks and statuses'],
    pricing: 'Free', icon: 'play', installs: 0,
  },
  {
    id: 'dependa-guard', name: 'DependaGuard', vendor: 'RedGet Security', category: 'Security',
    tagline: 'Scans manifests for vulnerable dependencies and opens issues for you.',
    permissions: ['Read forge files', 'Open issues'],
    pricing: 'Free', icon: 'shield', installs: 0,
  },
  {
    id: 'release-bot', name: 'Release Bot', vendor: 'Community', category: 'Release management',
    tagline: 'Drafts release notes from merged pull requests when you push a tag.',
    permissions: ['Read pull requests', 'Create releases'],
    pricing: 'Free · Pro tier', icon: 'tag', installs: 0,
  },
  {
    id: 'lint-hawk', name: 'LintHawk', vendor: 'Community', category: 'Code review',
    tagline: 'Posts inline review comments for style violations on changed lines.',
    permissions: ['Read and write pull request reviews'],
    pricing: 'Free', icon: 'scan', installs: 0,
  },
  {
    id: 'wiki-sync', name: 'Wiki Sync', vendor: 'Community', category: 'Documentation',
    tagline: 'Publishes markdown files from /docs into the forge wiki.',
    permissions: ['Read forge files', 'Write wiki'],
    pricing: 'Free', icon: 'book', installs: 0,
  },
  {
    id: 'metric-stream', name: 'MetricStream', vendor: 'RedGet', category: 'Monitoring',
    tagline: 'Collects workflow durations and surfaces slow jobs in Insights.',
    permissions: ['Read Actions runs'],
    pricing: 'Paid', icon: 'graph', installs: 0,
  },
];

export function marketplaceApps() {
  var installs = installCounts();
  return MARKETPLACE_APPS.map(function (app) {
    return Object.assign({}, app, { installs: installs[app.id] || 0 });
  });
}

export function appById(id) {
  var installs = installCounts();
  var app = MARKETPLACE_APPS.filter(function (a) { return a.id === id; })[0];
  return app ? Object.assign({}, app, { installs: installs[app.id] || 0 }) : null;
}

export function installCounts() {
  var counts = {};
  (DB.marketInstalls || []).forEach(function (install) {
    counts[install.app] = (counts[install.app] || 0) + 1;
  });
  return counts;
}

export function installsFor(username) {
  var name = username || (ME && ME.username);
  return (DB.marketInstalls || []).filter(function (i) { return i.owner === name; });
}

export function isInstalled(appId, ownerName) {
  var name = ownerName || (ME && ME.username);
  return installsFor(name).some(function (i) { return i.app === appId; });
}

export function installApp(appId, ownerName, permissions) {
  var app = appById(appId);
  if (!app) return null;
  var name = ownerName || (ME && ME.username);
  if (!name || isInstalled(appId, name)) return null;
  if (!DB.marketInstalls) DB.marketInstalls = [];
  var install = {
    id: uid('install'),
    app: appId,
    owner: name,
    permissions: permissions && permissions.length ? permissions : app.permissions,
    installedAt: Date.now(),
  };
  DB.marketInstalls.push(install);
  saveDB();
  return install;
}

export function uninstallApp(appId, ownerName) {
  var name = ownerName || (ME && ME.username);
  DB.marketInstalls = (DB.marketInstalls || []).filter(function (i) {
    return !(i.app === appId && i.owner === name);
  });
  saveDB();
  return true;
}

/* ============================================================== packages */

export function packagesFor(forge) {
  if (!forge.packages) forge.packages = [];
  return forge.packages.slice().sort(function (a, b) { return b.updated - a.updated; });
}

export function createPackage(forge, payload) {
  if (!forge.packages) forge.packages = [];
  var now = Date.now();
  var pkg = {
    id: uid('pkg'),
    name: String(payload.name || 'package').slice(0, 80),
    type: payload.type || 'generic',
    description: payload.description || '',
    visibility: payload.visibility || 'public',
    created: now,
    updated: now,
    downloads: 0,
    versions: [{
      id: uid('ver'),
      version: payload.version || '0.1.0',
      notes: payload.notes || '',
      size: payload.size || 0,
      published: now,
      author: ME ? ME.username : forge.ownerUsername,
    }],
  };
  forge.packages.unshift(pkg);
  saveDB();
  return pkg;
}

/** Derive a package version from a release, if the release has assets. */
export function packageFromRelease(forge, release) {
  if (!release.assets || !release.assets.length) return null;
  var existing = packagesFor(forge).filter(function (p) { return p.name === release.tag; })[0];
  var size = release.assets.reduce(function (n, a) { return n + (a.size || 0); }, 0);
  if (existing) {
    existing.versions.unshift({
      id: uid('ver'), version: release.tag, notes: release.title, size: size,
      published: release.published, author: release.author,
    });
    existing.updated = Date.now();
    saveDB();
    return existing;
  }
  return createPackage(forge, {
    name: release.tag, type: 'release', version: release.tag,
    description: release.title, size: size, notes: release.title,
  });
}

export function addPackageVersion(forge, pkg, payload) {
  pkg.versions.unshift({
    id: uid('ver'),
    version: payload.version,
    notes: payload.notes || '',
    size: payload.size || 0,
    published: Date.now(),
    author: ME ? ME.username : forge.ownerUsername,
  });
  pkg.updated = Date.now();
  saveDB();
  return pkg;
}

export function deletePackage(forge, pkg) {
  forge.packages = (forge.packages || []).filter(function (p) { return p.id !== pkg.id; });
  saveDB();
  return true;
}

/** Every package across forges the signed-in account can see. */
export function allPackages() {
  var out = [];
  Object.keys(DB.users).forEach(function (k) {
    var u = DB.users[k];
    (u.forges || []).forEach(function (r) {
      if (r.visibility === 'private' && (!ME || u.username !== ME.username)) return;
      packagesFor(r).forEach(function (p) { out.push({ user: u, forge: r, pkg: p }); });
    });
  });
  Object.keys(DB.orgs || {}).forEach(function (slug) {
    var org = DB.orgs[slug];
    (org.forges || []).forEach(function (r) {
      packagesFor(r).forEach(function (p) { out.push({ user: org, forge: r, pkg: p, org: true }); });
    });
  });
  return out.sort(function (a, b) { return b.pkg.updated - a.pkg.updated; });
}

/* =========================================================== discussions */

export var DISCUSSION_CATEGORIES = [
  { id: 'announcements', name: 'Announcements', icon: 'megaphone', description: 'Updates from the maintainers' },
  { id: 'ideas', name: 'Ideas', icon: 'lightBulb', description: 'Share and vote on ideas' },
  { id: 'q-a', name: 'Q&A', icon: 'question', description: 'Ask the community for help' },
  { id: 'show', name: 'Show and tell', icon: 'telescope', description: 'Show off what you built' },
  { id: 'general', name: 'General', icon: 'commentDiscussion', description: 'Anything else' },
];

export function discussionsFor(forge) {
  if (!forge.discussions) forge.discussions = [];
  return forge.discussions.slice().sort(function (a, b) {
    if (a.answered !== b.answered) return a.answered ? 1 : -1;
    return b.created - a.created;
  });
}

export function discussionByNumber(forge, number) {
  var n = Number(number);
  return discussionsFor(forge).filter(function (d) { return d.number === n; })[0] || null;
}

export function createDiscussion(user, forge, payload) {
  if (!forge.discussions) forge.discussions = [];
  var now = Date.now();
  var discussion = {
    id: uid('disc'),
    number: forge.discussions.reduce(function (max, d) { return Math.max(max, d.number || 0); }, 0) + 1,
    title: String(payload.title || '').slice(0, 200),
    body: payload.body || '',
    category: payload.category || 'general',
    author: ME ? ME.username : user.username,
    created: now,
    updated: now,
    upvotes: [],
    comments: [],
    answered: false,
    answerId: null,
    locked: false,
  };
  forge.discussions.unshift(discussion);
  forge.updated = now;
  saveDB();
  logActivity('discussion.open', user.username + '/' + forge.name + '#' + discussion.number);
  return discussion;
}

export function commentOnDiscussion(user, forge, discussion, body, parentId) {
  if (!String(body || '').trim()) return null;
  var comment = {
    id: uid('dcomment'),
    author: ME ? ME.username : user.username,
    body: String(body).trim(),
    created: Date.now(),
    parentId: parentId || null,
    upvotes: [],
    isAnswer: false,
  };
  discussion.comments.push(comment);
  discussion.updated = Date.now();
  saveDB();
  if (discussion.author !== comment.author) {
    notify({
      to: discussion.author, from: comment.author, kind: 'discussion',
      text: 'replied to your discussion #' + discussion.number + ' in ' + user.username + '/' + forge.name,
      href: '/' + user.username + '/' + forge.name + '/discussions/' + discussion.number,
    });
  }
  return comment;
}

export function toggleUpvote(target, username) {
  var who = username || (ME && ME.username);
  if (!who) return false;
  if (!target.upvotes) target.upvotes = [];
  var idx = target.upvotes.indexOf(who);
  if (idx === -1) target.upvotes.push(who);
  else target.upvotes.splice(idx, 1);
  saveDB();
  return idx === -1;
}

export function markAnswer(forge, discussion, commentId) {
  discussion.comments.forEach(function (c) { c.isAnswer = c.id === commentId; });
  discussion.answered = Boolean(commentId);
  discussion.answerId = commentId || null;
  discussion.updated = Date.now();
  saveDB();
  return discussion;
}

export function deleteDiscussion(forge, discussion) {
  forge.discussions = (forge.discussions || []).filter(function (d) { return d.id !== discussion.id; });
  saveDB();
  return true;
}
