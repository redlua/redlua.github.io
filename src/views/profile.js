/**
 * RedGet — public profile.
 *
 * The contribution grid is built from real timestamps: the account's activity
 * log, commits it authored, issues and pull requests it opened or commented
 * on, gists it created, and wiki pages it wrote. Accounts with no history get
 * an empty grid — never randomised cells.
 */

import { ME } from '../state.js';
import { ic } from '../icons.js';
import { avatarHTML, avatarInner } from '../core/avatars.js';
import { langColor } from '../core/languages.js';
import { visibleForges } from '../core/forges.js';
import { getFollowers, getFollowing, followerList, followingList, isFollowing, starredForges, starCount, getUserByUsername } from '../core/social.js';
import { allPackages } from '../core/marketplace.js';
import { allGists } from '../core/gists.js';
import { visibleProjects } from '../core/projects.js';
import { orgsFor, orgRole } from '../core/orgs.js';
import { esc, timeAgo, formatDate } from '../core/util.js';
import { forgeCard } from './dashboard.js';

var TABS = [
  ['overview', 'book', 'Overview'],
  ['forges', 'forge', 'Forges'],
  ['projects', 'project', 'Projects'],
  ['packages', 'package', 'Packages'],
  ['gists', 'codeSquare', 'Gists'],
  ['stars', 'star', 'Stars'],
  ['followers', 'people', 'Followers'],
  ['following', 'people', 'Following'],
];

export function viewProfile(user, tab) {
  tab = tab || hashTab() || 'overview';
  var isMe = Boolean(ME) && user.username === ME.username;
  var followers = getFollowers(user.username);
  var following = getFollowing(user.username);
  var followingUser = isFollowing(user.username);
  var forges = (user.forges || []).filter(function (r) {
    return r.visibility === 'public' || isMe;
  });

  var content = '';
  if (tab === 'forges') content = forgesTab(user, forges, isMe);
  else if (tab === 'projects') content = projectsTab(user, isMe);
  else if (tab === 'packages') content = packagesTab(user, isMe);
  else if (tab === 'gists') content = gistsTab(user, isMe);
  else if (tab === 'stars') content = starsTab(user, isMe);
  else if (tab === 'followers') content = peopleTab(followerList(user.username), 'followers', user.username);
  else if (tab === 'following') content = peopleTab(followingList(user.username), 'following', user.username);
  else content = overviewTab(user, forges, isMe);

  return '<div class="container page">' +
    '<div class="profile-header">' +
      '<div class="profile-avatar" style="' + (user.avatar && user.avatar.type === 'image' ? '' : 'background:' + esc((user.avatar && user.avatar.bg) || '#30363d')) + '">' +
        avatarInner(user, 96) + '</div>' +
      '<div class="profile-main">' +
        '<div class="profile-name">' + esc(user.displayName || user.username) + '</div>' +
        '<div class="profile-handle">@' + esc(user.username) + '</div>' +
        (user.bio ? '<div class="profile-bio">' + esc(user.bio) + '</div>' : '') +
        (user.status && user.status.message ? '<div class="status-line">' + esc(user.status.emoji || '') + ' ' + esc(user.status.message) +
          (user.status.busy ? ' <span class="label">Busy</span>' : '') + '</div>' : '') +
        '<div class="profile-meta">' +
          (user.company ? '<span class="profile-meta-item">' + ic('organization', 16) + ' ' + esc(user.company) + '</span>' : '') +
          (user.location ? '<span class="profile-meta-item">' + ic('location', 16) + ' ' + esc(user.location) + '</span>' : '') +
          (user.website ? '<span class="profile-meta-item">' + ic('link', 16) + ' <a href="' + esc(user.website) + '" rel="noopener">' + esc(user.website) + '</a></span>' : '') +
          '<span class="profile-meta-item">' + ic('calendar', 16) + ' Joined ' + formatDate(user.joined) + '</span>' +
        '</div>' +
        '<div class="profile-stats">' +
          '<a href="#/' + esc(user.username) + '?tab=followers"><b>' + followers + '</b> followers</a>' +
          '<a href="#/' + esc(user.username) + '?tab=following"><b>' + following + '</b> following</a>' +
          '<a href="#/' + esc(user.username) + '?tab=stars"><b>' + (user.starredCount || starredForges(user.username).length) + '</b> stars given</a>' +
        '</div>' +
      '</div>' +
      '<div class="profile-actions">' +
        (isMe
          ? '<a class="btn" href="#/settings/profile">' + ic('pencil', 14) + ' Edit profile</a>'
          : '<button class="btn ' + (followingUser ? '' : 'primary') + ' followBtn" type="button" data-username="' + esc(user.username) + '">' +
              ic(followingUser ? 'person' : 'plus', 14) + ' ' + (followingUser ? 'Unfollow' : 'Follow') + '</button>') +
      '</div>' +
    '</div>' +

    '<div class="profile-tabs">' + TABS.map(function (t) {
      var count = t[0] === 'forges' ? forges.length
        : t[0] === 'stars' ? starredForges(user.username).length
        : t[0] === 'followers' ? followers
        : t[0] === 'following' ? following
        : t[0] === 'gists' ? allGists().filter(function (g) { return g.owner === user.username && (g.isPublic || isMe); }).length
        : null;
      return '<a class="profile-tab' + (tab === t[0] ? ' active' : '') + '" href="#/' + esc(user.username) + (t[0] === 'overview' ? '' : '?tab=' + t[0]) + '">' +
        ic(t[1], 16) + ' ' + esc(t[2]) + (count ? ' <span class="counter">' + count + '</span>' : '') + '</a>';
    }).join('') + '</div>' +

    content +
  '</div>';
}

/* ===================================================================== *
   Overview
\* ===================================================================== */

function overviewTab(user, forges, isMe) {
  var pinned = forges.filter(function (r) { return r.pinned; });
  var shown = (pinned.length ? pinned : forges.slice().sort(function (a, b) { return b.updated - a.updated; })).slice(0, 6);
  var grid = contributionGrid(user);
  var orgs = orgsFor(user.username);
  var activity = (user.activity || []).slice(0, 10);

  return '<div class="pinned-grid">' +
      (shown.length
        ? shown.map(function (r) { return pinnedCard(r, user); }).join('')
        : '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">' + ic('forge', 32) + '</div>' +
          '<h3>' + (pinned.length ? 'Pinned forges' : 'No forges') + '</h3>' +
          '<p>' + (isMe ? 'Pin a forge from Settings → Forges, or create your first one.' : 'This account has no public forges.') + '</p>' +
          (isMe ? '<a class="btn primary" href="#/new">' + ic('plus', 14) + ' Create forge</a>' : '') + '</div>') +
    '</div>' +

    '<div class="card mt-6">' +
      '<h3 class="card-title">' + grid.total + ' contribution' + (grid.total === 1 ? '' : 's') + ' in the last year</h3>' +
      '<div class="contrib-wrap">' +
        '<div class="contrib-months">' + grid.months.map(function (m) {
          return '<span style="grid-column:' + m.col + '">' + esc(m.label) + '</span>';
        }).join('') + '</div>' +
        '<div class="contrib-grid">' + grid.cells.map(function (cell) {
          return '<div class="contrib-cell" data-level="' + cell.level + '" title="' + esc(cell.title) + '"></div>';
        }).join('') + '</div>' +
      '</div>' +
      '<div class="contrib-legend muted fs-12">Less ' +
        [0, 1, 2, 3, 4].map(function (l) { return '<span class="contrib-cell" data-level="' + l + '"></span>'; }).join('') + ' More</div>' +
    '</div>' +

    '<div class="grid-2col mt-6">' +
      '<div>' +
        '<h2 class="section-title">Contribution activity</h2>' +
        (activity.length
          ? '<div class="card-tight feed">' + activity.map(function (a) {
              return '<div class="feed-item"><div class="feed-avatar">' + avatarHTML(user, 28) + '</div>' +
                '<div class="feed-body"><b>' + esc(user.username) + '</b> ' + esc(a.label || a.kind) +
                (a.target ? ' <span class="mono fs-12">' + esc(a.target) + '</span>' : '') +
                '<div class="feed-meta">' + timeAgo(a.t) + '</div></div></div>';
            }).join('') + '</div>'
          : '<div class="empty"><h3>No activity recorded</h3><p>Actions taken in this browser are logged here.</p></div>') +
      '</div>' +
      '<div class="sticky-side">' +
        '<div class="card"><h3 class="side-title">' + ic('organization', 14) + ' Organizations</h3>' +
          (orgs.length ? '<div class="side-rows">' + orgs.map(function (org) {
            return '<div class="side-row"><a href="#/orgs/' + esc(org.slug) + '">' +
              avatarHTML({ username: org.slug, avatar: org.avatar }, 20) + ' ' + esc(org.name || org.slug) + '</a>' +
              '<div class="muted fs-12">' + esc(orgRole(org, user.username) || 'member') + '</div></div>';
          }).join('') + '</div>' : '<p class="muted fs-13">Not a member of any organization.</p>') +
        '</div>' +
        '<div class="card mt-4"><h3 class="side-title">Highlights</h3>' +
          '<div class="stat-grid">' +
            '<div class="stat"><div class="stat-value">' + forges.length + '</div><div class="stat-label">forges</div></div>' +
            '<div class="stat"><div class="stat-value">' + grid.total + '</div><div class="stat-label">contributions</div></div>' +
            '<div class="stat"><div class="stat-value">' + getFollowers(user.username) + '</div><div class="stat-label">followers</div></div>' +
            '<div class="stat"><div class="stat-value">' + grid.best + '</div><div class="stat-label">best day</div></div>' +
          '</div></div>' +
      '</div>' +
    '</div>';
}

/**
 * Build 53 weeks × 7 days of cells from real timestamps.
 * Returns { cells: [{ level, title }], months: [{ col, label }], total, best }.
 */
export function contributionGrid(user) {
  var dayCounts = {};
  function bump(ts, label) {
    if (!ts) return;
    var d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    var key = d.getTime();
    if (!dayCounts[key]) dayCounts[key] = { n: 0, kinds: {} };
    dayCounts[key].n++;
    dayCounts[key].kinds[label] = (dayCounts[key].kinds[label] || 0) + 1;
  }

  (user.activity || []).forEach(function (a) { bump(a.t, a.kind); });

  visibleForges().forEach(function (entry) {
    var forge = entry.forge;
    (forge.commits || []).forEach(function (c) { if (c.author === user.username) bump(c.time, 'commit'); });
    (forge.issues || []).forEach(function (i) {
      if (i.author === user.username) bump(i.created, 'issue');
      (i.comments || []).forEach(function (c) { if (c.author === user.username) bump(c.created, 'comment'); });
    });
    (forge.pulls || []).forEach(function (p) {
      if (p.author === user.username) bump(p.created, 'pull');
      (p.comments || []).forEach(function (c) { if (c.author === user.username) bump(c.created, 'comment'); });
      (p.reviews || []).forEach(function (r) { if (r.author === user.username) bump(r.created, 'review'); });
    });
    (forge.wiki || []).forEach(function (page) { if (page.author === user.username) bump(page.updated, 'wiki'); });
    (forge.discussions || []).forEach(function (d) { if (d.author === user.username) bump(d.created, 'discussion'); });
  });

  allGists().forEach(function (g) { if (g.owner === user.username) bump(g.updated, 'gist'); });

  // Grid geometry: end on today, start 52 weeks back at the week's Sunday.
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var end = today.getTime();
  var startDay = new Date(end - 52 * 7 * 86400000);
  startDay.setDate(startDay.getDate() - startDay.getDay());
  var start = startDay.getTime();

  var cells = [];
  var months = [];
  var total = 0;
  var best = 0;
  var lastMonth = -1;

  for (var day = start; day <= end + 6 * 86400000; day += 86400000) {
    var date = new Date(day);
    var record = dayCounts[day];
    var n = record ? record.n : 0;
    if (day >= start) total += n;
    if (n > best) best = n;
    var level = n === 0 ? 0 : n === 1 ? 1 : n <= 3 ? 2 : n <= 6 ? 3 : 4;
    var title = n ? n + ' contribution' + (n === 1 ? '' : 's') + ' on ' + date.toDateString()
      : 'No contributions on ' + date.toDateString();
    cells.push({ level: level, title: title });

    var month = date.getMonth();
    var col = Math.floor((day - start) / 86400000 / 7) + 1;
    if (month !== lastMonth && col <= 53) {
      months.push({ col: col, label: date.toLocaleDateString(undefined, { month: 'short' }) });
      lastMonth = month;
    }
  }

  return { cells: cells, months: months, total: total, best: best };
}

/* ===================================================================== *
   Tabs
\* ===================================================================== */

function forgesTab(user, forges, isMe) {
  var query = hashQuery();
  var q = (query.q || '').toLowerCase();
  var type = query.type || 'all';
  var sort = query.sort || 'updated';

  var list = forges.filter(function (r) {
    if (type === 'public' && r.visibility !== 'public') return false;
    if (type === 'private' && (!isMe || r.visibility !== 'private')) return false;
    if (type === 'forks' && !r.forkedFrom) return false;
    if (type === 'sources' && r.forkedFrom) return false;
    if (!q) return true;
    return r.name.toLowerCase().indexOf(q) !== -1 || String(r.desc || '').toLowerCase().indexOf(q) !== -1;
  }).sort(function (a, b) {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'stars') return starCount(b.id) - starCount(a.id);
    if (sort === 'created') return b.created - a.created;
    return b.updated - a.updated;
  });

  return '<div class="list-toolbar">' +
    '<div class="list-toolbar-left">' +
      '<input type="search" class="input xs" id="profileForgeSearch" placeholder="Find a forge…" value="' + esc(query.q || '') + '" aria-label="Find a forge">' +
    '</div>' +
    '<div class="list-toolbar-right">' +
      '<select class="input xs" id="profileForgeType" aria-label="Type">' +
        ['all', 'public', 'private', 'sources', 'forks'].map(function (t) {
          if (t === 'private' && !isMe) return '';
          return '<option value="' + t + '"' + (type === t ? ' selected' : '') + '>' + t + '</option>';
        }).join('') + '</select>' +
      '<select class="input xs" id="profileForgeSort" aria-label="Sort">' +
        [['updated', 'Last updated'], ['created', 'Newest'], ['name', 'Name'], ['stars', 'Stars']].map(function (s) {
          return '<option value="' + s[0] + '"' + (sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
        }).join('') + '</select>' +
      (isMe ? '<a class="btn sm primary" href="#/new">' + ic('plus', 14) + ' New</a>' : '') +
    '</div>' +
  '</div>' +
  (list.length
    ? list.map(function (r) { return forgeCard(r, user); }).join('')
    : '<div class="empty"><div class="empty-icon">' + ic('forge', 32) + '</div>' +
      '<h3>' + (forges.length ? 'No forges match' : 'No forges') + '</h3>' +
      '<p>' + (forges.length ? 'Try a different search or filter.' : (isMe ? 'Create your first forge.' : 'This account has no public forges.')) + '</p>' +
      (isMe && !forges.length ? '<a class="btn primary" href="#/new">' + ic('plus', 14) + ' Create forge</a>' : '') + '</div>');
}

function projectsTab(user, isMe) {
  var projects = visibleProjects().filter(function (p) { return p.owner === 'user' && p.ownerKey === user.username; });
  if (!projects.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('project', 32) + '</div><h3>No projects</h3>' +
      '<p>Projects are boards, tables and roadmaps for tracking work.</p>' +
      (isMe ? '<a class="btn primary" href="#/projects/new">' + ic('plus', 14) + ' New project</a>' : '') + '</div>';
  }
  return '<div class="project-grid">' + projects.map(function (p) {
    var items = (p.columns || []).reduce(function (n, c) { return n + (c.items || []).length; }, 0);
    return '<a class="project-card card" href="#/projects/' + esc(p.id) + '">' +
      '<div class="project-card-head"><b>' + esc(p.title) + '</b><span class="label">' + esc(p.layout) + '</span></div>' +
      '<p class="muted fs-13">' + esc(p.description || 'No description') + '</p>' +
      '<div class="project-card-meta">' + (p.columns || []).length + ' columns · ' + items + ' items</div></a>';
  }).join('') + '</div>';
}

function packagesTab(user, isMe) {
  var list = allPackages().filter(function (entry) { return entry.user.username === user.username; });
  if (!list.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('package', 32) + '</div><h3>No packages</h3>' +
      '<p>Publishing a release with assets creates a package automatically.</p></div>';
  }
  return '<div class="card-tight">' + list.map(function (entry) {
    var pkg = entry.pkg;
    return '<div class="list-item"><div class="list-icon">' + ic('package', 16) + '</div>' +
      '<div class="list-body"><div class="list-title">' + esc(pkg.name) + ' <span class="label">' + esc(pkg.type) + '</span></div>' +
      '<div class="list-meta">' + esc(entry.forge.name) + ' · ' + pkg.versions.length + ' version' + (pkg.versions.length === 1 ? '' : 's') +
      ' · latest ' + esc(pkg.versions[0].version) + ' · ' + timeAgo(pkg.updated) + '</div></div>' +
      '<div class="list-side"><a class="btn sm" href="#/' + esc(user.username) + '/' + esc(entry.forge.name) + '/packages">Open</a></div></div>';
  }).join('') + '</div>';
}

function gistsTab(user, isMe) {
  var list = allGists().filter(function (g) { return g.owner === user.username && (g.isPublic || isMe); });
  if (!list.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('codeSquare', 32) + '</div><h3>No gists</h3>' +
      '<p>Gists are single-file snippets with revision history.</p>' +
      (isMe ? '<a class="btn primary" href="#/gists/new">' + ic('plus', 14) + ' New gist</a>' : '') + '</div>';
  }
  return '<div class="card-tight">' + list.map(function (g) {
    return '<div class="list-item"><div class="list-icon">' + ic('codeSquare', 16) + '</div>' +
      '<div class="list-body"><div class="list-title"><a href="#/gists/' + esc(g.id) + '">' + esc(g.description || g.files[0].name) + '</a>' +
        (g.isPublic ? '' : ' <span class="label">Secret</span>') + '</div>' +
      '<div class="list-meta">' + g.files.map(function (f) { return esc(f.name); }).join(', ') + ' · updated ' + timeAgo(g.updated) + '</div></div>' +
      '<div class="list-side"><span class="side-count">' + ic('star', 13) + ' ' + g.stars.length + '</span></div></div>';
  }).join('') + '</div>';
}

function starsTab(user, isMe) {
  var list = starredForges(user.username);
  if (!list.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('star', 32) + '</div><h3>No stars yet</h3>' +
      '<p>' + (isMe ? 'Star a forge and it will be listed here.' : 'This account has not starred anything.') + '</p>' +
      '<a class="btn" href="#/explore">Explore forges</a></div>';
  }
  return '<div class="card-tight">' + list.map(function (entry) {
    return '<div class="list-item"><div class="list-icon">' + ic('starFill', 14) + '</div>' +
      '<div class="list-body"><div class="list-title"><a href="#/' + esc(entry.user.username) + '/' + esc(entry.forge.name) + '">' +
        esc(entry.user.username) + '/' + esc(entry.forge.name) + '</a></div>' +
      '<div class="list-meta">' + esc(entry.forge.desc || 'No description') + '</div></div>' +
      '<div class="list-side"><span class="side-count">' + ic('star', 13) + ' ' + starCount(entry.forge.id) + '</span></div></div>';
  }).join('') + '</div>';
}

function peopleTab(entries, kind, username) {
  if (!entries.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('people', 32) + '</div>' +
      '<h3>No ' + esc(kind) + '</h3><p>Accounts that ' + (kind === 'followers' ? 'follow ' + esc(username) : esc(username) + ' follows') + ' appear here.</p></div>';
  }
  return '<div class="contributors-grid">' + entries.map(function (name) {
    var account = getUserByUsername(name) || { username: name, avatar: null };
    return '<a class="contrib-card" href="#/' + esc(name) + '">' + avatarHTML(account, 40) +
      '<div><div class="fw-600 bright">' + esc(account.username) + '</div>' +
      '<div class="muted fs-12 truncate">' + esc(account.bio || 'No bio') + '</div></div></a>';
  }).join('') + '</div>';
}

/* ===================================================================== *
   Cards + helpers
\* ===================================================================== */

export function profileTab(key, icon, label, current, username, count) {
  var active = current === key ? ' active' : '';
  var href = '#/' + username + (key === 'overview' ? '' : '?tab=' + key);
  return '<a class="profile-tab' + active + '" href="' + href + '">' + ic(icon, 16) + ' ' + esc(label) +
    (count != null ? ' <span class="counter">' + count + '</span>' : '') + '</a>';
}

export function pinnedCard(r, user) {
  return '<div class="pinned-card">' +
    '<div class="pinned-card-head">' + ic('forge', 16) +
      '<a class="pinned-card-name" href="#/' + esc(user.username) + '/' + esc(r.name) + '">' + esc(r.name) + '</a>' +
      (r.pinned ? '<span class="label" style="margin-left:auto">' + ic('pin', 10) + ' Pinned</span>'
        : '<span class="label outline" style="margin-left:auto">' + esc(r.visibility) + '</span>') +
    '</div>' +
    '<div class="pinned-card-desc">' + esc(r.desc || 'No description.') + '</div>' +
    '<div class="pinned-card-meta">' +
      '<span class="lang"><i class="dot" style="background:' + esc(langColor(r.language)) + '"></i>' + esc(r.language || 'Other') + '</span>' +
      '<span class="stat">' + ic('star', 13) + ' ' + starCount(r.id) + '</span>' +
      '<span class="stat">' + ic('fork', 13) + ' ' + (r.forkedFrom ? 'fork' : 'source') + '</span>' +
      '<span>Updated ' + timeAgo(r.updated) + '</span>' +
    '</div>' +
  '</div>';
}

function hashTab() {
  return hashQuery().tab || '';
}

function hashQuery() {
  var out = {};
  var hash = String(location.hash || '');
  var q = hash.indexOf('?');
  if (q === -1) return out;
  hash.slice(q + 1).split('&').forEach(function (pair) {
    if (!pair) return;
    var kv = pair.split('=');
    out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
  });
  return out;
}
