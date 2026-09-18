/**
 * RedGet — global views: issues, pull requests, notifications,
 * organizations, a single organization, enterprises, Copilot and 404.
 *
 * These pages aggregate across everything that exists in this browser. With
 * no data they render an honest empty state.
 */

import { DB, ME } from '../state.js';
import { ic } from '../icons.js';
import { avatarHTML, avatarInner } from '../core/avatars.js';
import { getUserByUsername } from '../core/social.js';
import { visibleForges } from '../core/forges.js';
import { notificationsFor, notificationLabel } from '../core/notify.js';
import { allOrgs, orgBySlug, orgsFor, orgRole, enterprises } from '../core/orgs.js';
import { installsFor } from '../core/marketplace.js';
import { esc, timeAgo, formatDate } from '../core/util.js';
import { forgeCard } from './dashboard.js';

/* ===================================================================== *
   Issues / Pull requests
\* ===================================================================== */

export function viewGlobalIssues(rest) {
  var filter = (rest && rest[0]) || 'open';
  var query = hashQuery();
  var rows = [];

  visibleForges().forEach(function (entry) {
    (entry.forge.issues || []).forEach(function (issue) {
      rows.push({ user: entry.user, forge: entry.forge, item: issue, kind: 'issue' });
    });
  });

  var mine = rows.filter(function (r) { return ME && r.item.author === ME.username; });
  var assigned = rows.filter(function (r) { return ME && (r.item.assignees || []).indexOf(ME.username) !== -1; });
  var mentioned = rows.filter(function (r) {
    return ME && String(r.item.body || '').indexOf('@' + ME.username) !== -1;
  });
  var involved = rows.filter(function (r) {
    if (!ME) return false;
    return r.item.author === ME.username ||
      (r.item.assignees || []).indexOf(ME.username) !== -1 ||
      (r.item.comments || []).some(function (c) { return c.author === ME.username; });
  });

  var selected = filter === 'mine' ? mine
    : filter === 'assigned' ? assigned
    : filter === 'mentioned' ? mentioned
    : filter === 'involved' ? involved
    : rows;

  var text = (query.q || '').toLowerCase();
  if (text) {
    selected = selected.filter(function (r) {
      return (r.item.title + ' ' + (r.item.body || '') + ' ' + r.forge.name).toLowerCase().indexOf(text) !== -1;
    });
  }
  selected = selected.filter(function (r) { return filter === 'closed' ? r.item.state !== 'open' : r.item.state === 'open'; });
  selected = selected.slice().sort(function (a, b) {
    var x = a.item.updated || a.item.created;
    var y = b.item.updated || b.item.created;
    return y - x;
  });

  var filters = [['open', 'Open'], ['closed', 'Closed'], ['mine', 'Yours'], ['assigned', 'Assigned'], ['mentioned', 'Mentioned'], ['involved', 'Involved']];

  return '<div class="container page">' +
    '<div class="page-head">' +
      '<div><h1 class="page-title">' + ic('issue', 22) + ' Issues</h1>' +
        '<p class="muted fs-13">' + selected.length + ' issue' + (selected.length === 1 ? '' : 's') + ' across every forge you can see</p></div>' +
      '<div class="page-head-actions"><input type="search" class="input" id="globalIssueSearch" placeholder="Search issues" value="' + esc(query.q || '') + '" aria-label="Search issues"></div>' +
    '</div>' +
    '<div class="filter-bar">' + filters.map(function (f) {
      return '<a class="filter-chip' + (filter === f[0] ? ' on' : '') + '" href="#/issues/' + f[0] + '">' + esc(f[1]) + '</a>';
    }).join('') + '</div>' +
    (selected.length
      ? '<div class="card-tight">' + selected.map(function (r) { return globalItemRow(r); }).join('') + '</div>'
      : emptyState('issue', 'No issues here', ME
          ? 'Nothing matches this filter. Issues you open, or that mention you, appear on this page.'
          : 'Sign in to see the issues that involve you.')) +
  '</div>';
}

export function viewGlobalPulls(rest) {
  var filter = (rest && rest[0]) || 'open';
  var rows = [];
  visibleForges().forEach(function (entry) {
    (entry.forge.pulls || []).forEach(function (pr) {
      rows.push({ user: entry.user, forge: entry.forge, item: pr, kind: 'pull' });
    });
  });
  var selected = rows.filter(function (r) {
    if (filter === 'mine') return ME && r.item.author === ME.username;
    if (filter === 'review') return ME && (r.item.reviewers || []).indexOf(ME.username) !== -1;
    if (filter === 'closed') return r.item.state !== 'open';
    return r.item.state === 'open';
  }).sort(function (a, b) { return b.item.created - a.item.created; });

  var filters = [['open', 'Open'], ['closed', 'Closed'], ['mine', 'Yours'], ['review', 'Review requested']];

  return '<div class="container page">' +
    '<div class="page-head"><div><h1 class="page-title">' + ic('redPR', 22) + ' Pull requests</h1>' +
      '<p class="muted fs-13">' + selected.length + ' pull request' + (selected.length === 1 ? '' : 's') + '</p></div></div>' +
    '<div class="filter-bar">' + filters.map(function (f) {
      return '<a class="filter-chip' + (filter === f[0] ? ' on' : '') + '" href="#/pulls/' + f[0] + '">' + esc(f[1]) + '</a>';
    }).join('') + '</div>' +
    (selected.length
      ? '<div class="card-tight">' + selected.map(function (r) { return globalItemRow(r); }).join('') + '</div>'
      : emptyState('redPR', 'No pull requests here', 'Open one from a forge to see it listed across your account.')) +
  '</div>';
}

function globalItemRow(row) {
  var item = row.item;
  var base = '/' + row.user.username + '/' + row.forge.name;
  var isPull = row.kind === 'pull';
  var icon = isPull ? (item.merged ? 'redMerge' : 'redMergeRequest') : (item.state === 'open' ? 'issueOpened' : 'issueClosed');
  var colour = item.merged ? 'var(--purple)' : item.state === 'open' ? 'var(--green)' : 'var(--red)';
  var comments = (item.comments || []).length;
  return '<div class="list-item">' +
    '<div class="list-icon" style="color:' + colour + '">' + ic(icon, 16) + '</div>' +
    '<div class="list-body">' +
      '<div class="list-title"><a href="#' + base + '/' + (isPull ? 'pull' : 'issues') + '/' + item.number + '">' + esc(item.title) + '</a>' +
        (item.draft ? ' <span class="label">Draft</span>' : '') + '</div>' +
      '<div class="list-meta"><a href="#' + base + '">' + esc(row.user.username) + '/' + esc(row.forge.name) + '</a> #' + item.number +
        ' · opened ' + timeAgo(item.created) + ' by ' + esc(item.author) + '</div>' +
    '</div>' +
    '<div class="list-side">' + (comments ? '<span class="side-count">' + ic('comment', 14) + ' ' + comments + '</span>' : '') + '</div>' +
  '</div>';
}

/* ===================================================================== *
   Notifications
\* ===================================================================== */

export function viewNotifications(rest) {
  if (!ME) return signedOutState();
  var all = notificationsFor(ME.username);
  var filter = (rest && rest[0]) || 'all';
  var unread = all.filter(function (n) { return !n.read; });

  var rows = filter === 'unread' ? unread
    : filter === 'star' ? all.filter(function (n) { return n.kind === 'star'; })
    : filter === 'issue' ? all.filter(function (n) { return n.kind === 'issue' || n.kind === 'pull' || n.kind === 'comment' || n.kind === 'review' || n.kind === 'mention'; })
    : filter === 'system' ? all.filter(function (n) { return n.kind === 'system' || n.kind === 'follow' || n.kind === 'release' || n.kind === 'discussion'; })
    : all;

  var filters = [['all', 'All (' + all.length + ')'], ['unread', 'Unread (' + unread.length + ')'],
    ['issue', 'Issues & PRs'], ['star', 'Stars & forks'], ['system', 'Account']];

  return '<div class="container page">' +
    '<div class="page-head">' +
      '<div><h1 class="page-title">' + ic('bell', 22) + ' Notifications</h1>' +
        '<p class="muted fs-13">' + unread.length + ' unread of ' + all.length + '</p></div>' +
      '<div class="page-head-actions">' +
        (unread.length ? '<button class="btn sm" id="markAllReadBtn" type="button">' + ic('check', 14) + ' Mark all read</button>' : '') +
        (all.length ? '<button class="btn sm danger" id="clearNotificationsBtn" type="button">' + ic('trash', 14) + ' Clear all</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="filter-bar">' + filters.map(function (f) {
      return '<a class="filter-chip' + (filter === f[0] ? ' on' : '') + '" href="#/notifications/' + f[0] + '">' + esc(f[1]) + '</a>';
    }).join('') + '</div>' +
    (rows.length
      ? '<div class="card-tight">' + rows.map(function (n) {
          return '<div class="list-item' + (n.read ? '' : ' unread') + '">' +
            '<div class="list-icon">' + ic(n.kind === 'star' ? 'star' : n.kind === 'fork' ? 'fork' : n.kind === 'follow' ? 'person' :
              n.kind === 'pull' || n.kind === 'review' ? 'redPR' : n.kind === 'release' ? 'tag' : n.kind === 'discussion' ? 'commentDiscussion' :
              n.kind === 'system' ? 'gear' : 'issue', 16) + '</div>' +
            '<div class="list-body">' +
              '<div class="list-title">' + (n.href ? '<a href="#' + esc(n.href) + '" class="notificationOpen" data-id="' + esc(n.id) + '">' + esc(n.text) + '</a>' : esc(n.text)) + '</div>' +
              '<div class="list-meta">' + (n.from ? esc(n.from) + ' · ' : '') + notificationLabel(n) + ' · ' + timeAgo(n.at) + '</div>' +
            '</div>' +
            '<div class="list-side">' +
              (n.read ? '' : '<button class="btn xs readNotificationBtn" type="button" data-id="' + esc(n.id) + '">Mark read</button>') +
              '<button class="btn xs danger deleteNotificationBtn" type="button" data-id="' + esc(n.id) + '" aria-label="Delete">' + ic('trash', 11) + '</button>' +
            '</div></div>';
        }).join('') + '</div>'
      : emptyState('bell', filter === 'unread' ? 'Nothing unread' : 'No notifications', 'Stars, follows, comments, reviews and releases you are involved in show up here.')) +
  '</div>';
}

/* ===================================================================== *
   Organizations
\* ===================================================================== */

export function viewOrganizations() {
  if (!ME) return signedOutState();
  var mine = orgsFor(ME.username);
  var all = allOrgs();
  var other = all.filter(function (o) { return orgsFor(ME.username).indexOf(o) === -1; });

  return '<div class="container page">' +
    '<div class="page-head">' +
      '<div><h1 class="page-title">' + ic('organization', 22) + ' Organizations</h1>' +
        '<p class="muted fs-13">' + mine.length + ' membership' + (mine.length === 1 ? '' : 's') + ' · ' + all.length + ' total in this browser</p></div>' +
      '<div class="page-head-actions"><a class="btn sm primary" href="#/organizations/new">' + ic('plus', 14) + ' New organization</a></div>' +
    '</div>' +
    (mine.length
      ? '<h2 class="section-title">Your organizations</h2><div class="org-grid">' + mine.map(orgCard).join('') + '</div>'
      : emptyState('organization', 'You do not belong to any organizations',
          'An organization owns forges, teams and projects shared by several accounts.',
          '<a class="btn primary" href="#/organizations/new">' + ic('plus', 14) + ' Create an organization</a>')) +
    (other.length ? '<h2 class="section-title mt-6">Other organizations</h2><div class="org-grid">' + other.map(orgCard).join('') + '</div>' : '') +
  '</div>';
}

function orgCard(org) {
  var role = ME ? orgRole(org, ME.username) : null;
  return '<a class="org-card card" href="#/orgs/' + esc(org.slug) + '">' +
    '<div class="org-card-head">' + avatarHTML({ username: org.slug, avatar: org.avatar }, 40) +
      '<div><div class="fw-600 bright">' + esc(org.name || org.slug) + '</div>' +
      '<div class="muted fs-12">@' + esc(org.slug) + (role ? ' · ' + esc(role) : '') + '</div></div>' +
      (org.settings && org.settings.verified ? '<span class="label green">' + ic('checkCircle', 10) + ' Verified</span>' : '') +
    '</div>' +
    '<p class="muted fs-13">' + esc(org.description || 'No description') + '</p>' +
    '<div class="forge-card-meta">' +
      '<span class="stat">' + ic('forge', 13) + ' ' + (org.forges || []).length + ' forges</span>' +
      '<span class="stat">' + ic('people', 13) + ' ' + (org.members || []).length + ' members</span>' +
      '<span class="stat">' + ic('project', 13) + ' ' + (org.projects || []).length + ' projects</span>' +
    '</div>' +
  '</a>';
}

export function viewNewOrganization() {
  if (!ME) return signedOutState();
  return '<div class="container page narrow">' +
    '<div class="page-head"><div><h1 class="page-title">Create an organization</h1>' +
      '<p class="muted fs-13">The organization is created locally and you become its owner.</p></div></div>' +
    '<div class="card">' +
      '<div class="form-group"><label class="form-label" for="orgName">Organization name <span class="required">*</span></label>' +
        '<input type="text" class="input" id="orgName" data-autofocus placeholder="RedGet Labs" maxlength="60"></div>' +
      '<div class="form-group"><label class="form-label" for="orgSlug">Slug <span class="required">*</span></label>' +
        '<input type="text" class="input mono" id="orgSlug" placeholder="redget-labs" maxlength="40">' +
        '<div class="hint">Used in URLs: <span class="mono">/orgs/&lt;slug&gt;</span>. Letters, numbers and hyphens.</div></div>' +
      '<div class="form-group"><label class="form-label" for="orgDescription">Description</label>' +
        '<textarea class="input" id="orgDescription" rows="3" placeholder="What does this organization do?"></textarea></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="orgLocation">Location</label><input type="text" class="input" id="orgLocation"></div>' +
        '<div class="form-group"><label class="form-label" for="orgWebsite">Website</label><input type="text" class="input" id="orgWebsite" placeholder="/orgs/redget-labs"></div>' +
      '</div>' +
      '<div class="form-group"><label class="form-label" for="orgEnterprise">Enterprise <span class="muted fs-12">(optional)</span></label>' +
        '<input type="text" class="input" id="orgEnterprise" placeholder="Acme Holdings">' +
        '<div class="hint">Organizations that name the same enterprise are grouped on the Enterprises page.</div></div>' +
      '<div class="form-group"><label class="form-label" for="orgPermission">Default forge permission</label>' +
        '<select class="input" id="orgPermission">' +
          '<option value="read">Read — members can view and copy</option>' +
          '<option value="write" selected>Write — members can push</option>' +
          '<option value="admin">Admin — members can manage settings</option>' +
        '</select></div>' +
      '<div class="form-error" id="orgErr"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button class="btn primary" id="createOrgBtn" type="button">' + ic('organization', 14) + ' Create organization</button>' +
        '<a class="btn" href="#/organizations">Cancel</a></div>' +
    '</div>' +
  '</div>';
}

export function viewOrgDetail(slug, tab) {
  var org = orgBySlug(slug);
  if (!org) return notFoundState('organization', 'No organization with the slug “' + slug + '” exists in this browser.');
  tab = tab || 'overview';
  var role = ME ? orgRole(org, ME.username) : null;
  var canAdmin = role === 'owner' || role === 'admin';

  var tabs = [['overview', 'Overview', 'home'], ['forges', 'Forges', 'forge'], ['people', 'People', 'people'],
    ['teams', 'Teams', 'organization'], ['projects', 'Projects', 'project']];
  if (canAdmin) tabs.push(['settings', 'Settings', 'gear']);

  var content = '';
  if (tab === 'forges') content = orgForges(org);
  else if (tab === 'people') content = orgPeople(org, canAdmin);
  else if (tab === 'teams') content = orgTeams(org, canAdmin);
  else if (tab === 'projects') content = orgProjects(org);
  else if (tab === 'settings' && canAdmin) content = orgSettings(org, role);
  else content = orgOverview(org);

  return '<div class="container page">' +
    '<div class="profile-header">' +
      '<div class="profile-avatar org-avatar">' + avatarInner({ username: org.slug, avatar: org.avatar }, 96) + '</div>' +
      '<div class="profile-main">' +
        '<div class="profile-name">' + esc(org.name || org.slug) +
          (org.settings && org.settings.verified ? ' <span class="label green">' + ic('checkCircle', 12) + ' Verified</span>' : '') + '</div>' +
        '<div class="profile-handle">@' + esc(org.slug) + '</div>' +
        (org.description ? '<div class="profile-bio">' + esc(org.description) + '</div>' : '') +
        '<div class="profile-meta">' +
          (org.location ? '<span class="profile-meta-item">' + ic('location', 16) + ' ' + esc(org.location) + '</span>' : '') +
          (org.website ? '<span class="profile-meta-item">' + ic('link', 16) + ' <a href="' + esc(org.website) + '" rel="noopener">' + esc(org.website) + '</a></span>' : '') +
          '<span class="profile-meta-item">' + ic('calendar', 16) + ' Created ' + formatDate(org.created) + '</span>' +
        '</div>' +
        '<div class="profile-stats">' +
          '<span><b>' + (org.forges || []).length + '</b> forges</span>' +
          '<span><b>' + (org.members || []).length + '</b> members</span>' +
          '<span><b>' + (org.teams || []).length + '</b> teams</span>' +
        '</div>' +
      '</div>' +
      '<div class="profile-actions">' +
        (role ? '<span class="label">' + ic('person', 12) + ' ' + esc(role) + '</span>'
          : '<button class="btn primary joinOrgBtn" type="button" data-slug="' + esc(org.slug) + '">Request to join</button>') +
      '</div>' +
    '</div>' +
    '<div class="profile-tabs">' + tabs.map(function (t) {
      return '<a class="profile-tab' + (tab === t[0] ? ' active' : '') + '" href="#/orgs/' + esc(org.slug) + (t[0] === 'overview' ? '' : '/' + t[0]) + '">' +
        ic(t[2], 16) + ' ' + esc(t[1]) + '</a>';
    }).join('') + '</div>' + content +
  '</div>';
}

function orgOverview(org) {
  var forges = (org.forges || []).slice().sort(function (a, b) { return b.updated - a.updated; });
  return '<div class="grid-2col">' +
    '<div>' +
      '<h2 class="section-title">Pinned forges</h2>' +
      (forges.length ? '<div class="pinned-grid">' + forges.slice(0, 6).map(function (r) {
        return forgeCard(r, { username: org.slug, avatar: org.avatar });
      }).join('') + '</div>'
      : '<div class="empty"><div class="empty-icon">' + ic('forge', 32) + '</div><h3>No forges yet</h3>' +
        '<p>Forges created under this organization appear here.</p>' +
        '<a class="btn primary" href="#/new?owner=' + esc(org.slug) + '">' + ic('plus', 14) + ' New forge</a></div>') +
    '</div>' +
    '<div class="sticky-side">' +
      '<div class="card"><h3 class="side-title">Members</h3>' +
        '<div class="people-list">' + (org.members || []).slice(0, 8).map(function (m) {
          var account = getUserByUsername(m.username) || { username: m.username, avatar: null };
          return '<div class="person-row">' + avatarHTML(account, 28) +
            '<div class="person-body"><a href="#/' + esc(m.username) + '">' + esc(m.username) + '</a>' +
            '<div class="muted fs-12">' + esc(m.role) + ' · joined ' + timeAgo(m.added) + '</div></div></div>';
        }).join('') + '</div></div>' +
      ((org.teams || []).length ? '<div class="card mt-4"><h3 class="side-title">Teams</h3>' +
        '<div class="people-list">' + org.teams.map(function (t) {
          return '<div class="person-row">' + ic('organization', 20) +
            '<div class="person-body"><b>' + esc(t.name) + '</b><div class="muted fs-12">' + (t.members || []).length + ' members</div></div></div>';
        }).join('') + '</div></div>' : '') +
    '</div>' +
  '</div>';
}

function orgForges(org) {
  var forges = org.forges || [];
  return '<div class="actions-head"><div class="actions-head-left"><span class="actions-head-title">Forges</span>' +
    '<span class="actions-head-meta">' + forges.length + ' total</span></div>' +
    '<div class="actions-head-right"><a class="btn sm primary" href="#/new?owner=' + esc(org.slug) + '">' + ic('plus', 14) + ' New</a></div></div>' +
    (forges.length ? forges.slice().sort(function (a, b) { return b.updated - a.updated; })
        .map(function (r) { return forgeCard(r, { username: org.slug, avatar: org.avatar }); }).join('')
      : emptyState('forge', 'No forges', 'Create one to get started.', '<a class="btn primary" href="#/new?owner=' + esc(org.slug) + '">New forge</a>'));
}

function orgPeople(org, canAdmin) {
  var members = org.members || [];
  return '<div class="actions-head"><div class="actions-head-left"><span class="actions-head-title">People</span>' +
    '<span class="actions-head-meta">' + members.length + ' member' + (members.length === 1 ? '' : 's') + '</span></div>' +
    (canAdmin ? '<div class="actions-head-right"><button class="btn sm primary addOrgMemberBtn" type="button" data-slug="' + esc(org.slug) + '">' + ic('plus', 14) + ' Invite member</button></div>' : '') + '</div>' +
    (members.length ? '<div class="card-tight">' + members.map(function (m) {
      var account = getUserByUsername(m.username) || { username: m.username, avatar: null };
      return '<div class="list-item"><div class="list-icon">' + avatarHTML(account, 28) + '</div>' +
        '<div class="list-body"><div class="list-title"><a href="#/' + esc(m.username) + '">' + esc(m.username) + '</a>' +
          ' <span class="label' + (m.role === 'owner' ? ' green' : '') + '">' + esc(m.role) + '</span></div>' +
          '<div class="list-meta">joined ' + timeAgo(m.added) + '</div></div>' +
        (canAdmin ? '<div class="list-side">' +
          '<select class="input xs orgRoleSelect" data-slug="' + esc(org.slug) + '" data-user="' + esc(m.username) + '" aria-label="Role">' +
            ['owner', 'admin', 'write', 'read'].map(function (r) {
              return '<option value="' + r + '"' + (r === m.role ? ' selected' : '') + '>' + r + '</option>';
            }).join('') + '</select>' +
          (m.role !== 'owner' ? '<button class="btn xs danger removeOrgMemberBtn" type="button" data-slug="' + esc(org.slug) + '" data-user="' + esc(m.username) + '">Remove</button>' : '') +
        '</div>' : '') + '</div>';
    }).join('') + '</div>' : emptyState('people', 'No members', 'Invite accounts that exist in this browser.'));
}

function orgTeams(org, canAdmin) {
  var teams = org.teams || [];
  return '<div class="actions-head"><div class="actions-head-left"><span class="actions-head-title">Teams</span>' +
    '<span class="actions-head-meta">' + teams.length + ' team' + (teams.length === 1 ? '' : 's') + '</span></div>' +
    (canAdmin ? '<div class="actions-head-right"><button class="btn sm primary newTeamBtn" type="button" data-slug="' + esc(org.slug) + '">' + ic('plus', 14) + ' New team</button></div>' : '') + '</div>' +
    (teams.length ? '<div class="card-tight">' + teams.map(function (t) {
      return '<div class="list-item"><div class="list-icon">' + ic('organization', 16) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(t.name) + ' <span class="label">' + esc(t.permission || 'read') + '</span></div>' +
        '<div class="list-meta">' + esc(t.description || 'No description') + ' · ' + (t.members || []).map(esc).join(', ') + '</div></div>' +
        (canAdmin ? '<div class="list-side"><button class="btn xs addTeamMemberBtn" type="button" data-slug="' + esc(org.slug) + '" data-team="' + esc(t.id) + '">Add member</button>' +
          '<button class="btn xs danger deleteTeamBtn" type="button" data-slug="' + esc(org.slug) + '" data-team="' + esc(t.id) + '">' + ic('trash', 11) + '</button></div>' : '') +
      '</div>';
    }).join('') + '</div>' : emptyState('organization', 'No teams', 'Teams group members and grant forge permissions.'));
}

function orgProjects(org) {
  var projects = org.projects || [];
  return '<div class="actions-head"><div class="actions-head-left"><span class="actions-head-title">Projects</span>' +
    '<span class="actions-head-meta">' + projects.length + ' project' + (projects.length === 1 ? '' : 's') + '</span></div>' +
    '<div class="actions-head-right"><button class="btn sm primary newProjectBtn" type="button" data-owner="org" data-key="' + esc(org.slug) + '">' + ic('plus', 14) + ' New project</button></div></div>' +
    (projects.length ? '<div class="project-grid">' + projects.map(function (p) {
      return '<a class="project-card card" href="#/projects/' + esc(p.id) + '"><div class="project-card-head"><b>' + esc(p.title) + '</b>' +
        '<span class="label">' + esc(p.layout) + '</span></div>' +
        '<p class="muted fs-13">' + esc(p.description || 'No description') + '</p></a>';
    }).join('') + '</div>' : emptyState('project', 'No projects', 'Projects track work across this organization.'));
}

function orgSettings(org, role) {
  return '<div class="settings-grid">' +
    '<div>' +
      '<div class="settings-block"><h3>Organization name</h3>' +
        '<div class="form-group"><input type="text" class="input" id="orgEditName" value="' + esc(org.name || '') + '"></div></div>' +
      '<div class="settings-block"><h3>Description</h3>' +
        '<div class="form-group"><textarea class="input" id="orgEditDescription" rows="3">' + esc(org.description || '') + '</textarea></div></div>' +
      '<div class="settings-block"><h3>Location and website</h3>' +
        '<div class="form-row"><input type="text" class="input" id="orgEditLocation" value="' + esc(org.location || '') + '" placeholder="Location">' +
        '<input type="text" class="input" id="orgEditWebsite" value="' + esc(org.website || '') + '" placeholder="Website"></div></div>' +
      '<div class="settings-block"><h3>Default permission</h3>' +
        '<select class="input" id="orgEditPermission">' + ['read', 'write', 'admin'].map(function (p) {
          return '<option value="' + p + '"' + ((org.settings || {}).defaultPermission === p ? ' selected' : '') + '>' + p + '</option>';
        }).join('') + '</select></div>' +
      '<div class="settings-block"><h3>Enterprise</h3>' +
        '<input type="text" class="input" id="orgEditEnterprise" value="' + esc((org.settings || {}).enterprise || '') + '" placeholder="Enterprise name"></div>' +
      '<div class="settings-block"><button class="btn primary saveOrgBtn" type="button" data-slug="' + esc(org.slug) + '">' + ic('check', 14) + ' Save organization</button></div>' +
      (role === 'owner' ? '<div class="danger-zone"><h3>Delete this organization</h3>' +
        '<p class="muted fs-13">Removes the organization, its teams and its membership records. Forges owned by it are deleted too.</p>' +
        '<button class="btn danger deleteOrgBtn" type="button" data-slug="' + esc(org.slug) + '">' + ic('trash', 14) + ' Delete organization</button></div>' : '') +
    '</div>' +
  '</div>';
}

/* ===================================================================== *
   Enterprises
\* ===================================================================== */

export function viewEnterprises() {
  if (!ME) return signedOutState();
  var list = enterprises();
  return '<div class="container page">' +
    '<div class="page-head"><div><h1 class="page-title">' + ic('enterprise', 22) + ' Enterprises</h1>' +
      '<p class="muted fs-13">' + list.length + ' enterprise' + (list.length === 1 ? '' : 's') + ' · grouped by the enterprise name set on each organization</p></div></div>' +
    (list.length ? list.map(function (e) {
      return '<div class="card mb-4">' +
        '<div class="org-card-head">' + ic('enterprise', 28) +
          '<div><div class="fw-600 bright" style="font-size:16px">' + esc(e.name) + '</div>' +
          '<div class="muted fs-12">' + e.orgs.length + ' organization' + (e.orgs.length === 1 ? '' : 's') + ' · ' +
            e.forges + ' forgesitor' + (e.forges === 1 ? 'y' : 'ies') + ' · ' + e.members + ' member' + (e.members === 1 ? '' : 's') + '</div></div></div>' +
        '<div class="org-grid mt-4">' + e.orgs.map(orgCard).join('') + '</div>' +
      '</div>';
    }).join('')
    : emptyState('enterprise', 'No enterprises', 'Name an enterprise in an organization’s settings and it is grouped here.',
      '<a class="btn primary" href="#/organizations">' + ic('organization', 14) + ' Manage organizations</a>')) +
  '</div>';
}

/* ===================================================================== *
   Copilot
\* ===================================================================== */

export function viewCopilot() {
  if (!ME) return signedOutState();
  var forges = visibleForges();
  var totalFiles = forges.reduce(function (n, e) { return n + (e.forge.files || []).length; }, 0);
  var totalLines = forges.reduce(function (n, e) {
    return n + (e.forge.files || []).reduce(function (m, f) { return m + String(f.content || '').split('\n').length; }, 0);
  }, 0);
  var installs = installsFor(ME.username);

  return '<div class="container page">' +
    '<div class="page-head"><div><h1 class="page-title">' + ic('copilot', 22) + ' RedGet Copilot</h1>' +
      '<p class="muted fs-13">A local assistant that reads the code you already stored — nothing is sent anywhere.</p></div></div>' +
    '<div class="grid-2col">' +
      '<div>' +
        '<div class="card">' +
          '<h3 class="card-title">Ask about your code</h3>' +
          '<div class="form-row"><select class="input" id="copilotForge" aria-label="Forge">' +
            (forges.length ? forges.map(function (e) {
              return '<option value="' + esc(e.user.username + '/' + e.forge.name) + '">' + esc(e.user.username) + '/' + esc(e.forge.name) + '</option>';
            }).join('') : '<option value="">No forges yet</option>') + '</select>' +
            '<input type="text" class="input" id="copilotQuestion" placeholder="What does this forge do?" disabled="' + (!forges.length) + '"></div>' +
          '<div style="display:flex;gap:8px;margin-top:10px"><button class="btn primary" id="copilotAskBtn" type="button"' + (forges.length ? '' : ' disabled') + '>' +
            ic('sparkle', 14) + ' Ask</button></div>' +
          '<div id="copilotAnswer" class="copilot-answer mt-4" hidden></div>' +
        '</div>' +
        '<div class="card mt-4"><h3 class="card-title">Suggestions</h3>' +
          '<div class="suggestion-list">' +
            suggestion('Summarise this forge', 'copilot-summary') +
            suggestion('Which file is largest?', 'copilot-largest') +
            suggestion('List the functions defined here', 'copilot-functions') +
            suggestion('What is missing for a good README?', 'copilot-readme') +
          '</div></div>' +
      '</div>' +
      '<div class="sticky-side">' +
        '<div class="card"><h3 class="side-title">What Copilot can see</h3>' +
          '<div class="stat-grid">' +
            '<div class="stat"><div class="stat-value">' + forges.length + '</div><div class="stat-label">forges</div></div>' +
            '<div class="stat"><div class="stat-value">' + totalFiles + '</div><div class="stat-label">files</div></div>' +
            '<div class="stat"><div class="stat-value">' + totalLines + '</div><div class="stat-label">lines</div></div>' +
            '<div class="stat"><div class="stat-value">' + installs.length + '</div><div class="stat-label">apps installed</div></div>' +
          '</div>' +
          '<p class="muted fs-12 mt-4">Answers are generated locally from file names, sizes and the text of your files.</p>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function suggestion(label, id) {
  return '<button class="suggestion" type="button" data-suggestion="' + id + '">' + ic('sparkle', 12) + ' ' + esc(label) + '</button>';
}

/* ===================================================================== *
   Shared states
\* ===================================================================== */

export function viewNotFound(path) {
  return '<div class="container page">' +
    '<div class="empty"><div class="empty-icon">' + ic('search', 32) + '</div>' +
      '<h3>Page not found</h3>' +
      '<p>' + (path ? 'Nothing is routed at <span class="mono">' + esc(path) + '</span>.' : 'The page you requested could not be found.') + '</p>' +
      '<a class="btn primary" href="#/">Go to your dashboard</a>' +
      '<a class="btn" href="#/explore">Explore forges</a>' +
    '</div>' +
  '</div>';
}

export function notFoundState(what, message) {
  return '<div class="container page">' +
    '<div class="empty"><div class="empty-icon">' + ic('alert', 32) + '</div><h3>' + esc(what) + ' not found</h3><p>' + esc(message) + '</p>' +
    '<a class="btn" href="#/">Go home</a></div></div>';
}

function emptyState(icon, title, body, action) {
  return '<div class="empty"><div class="empty-icon">' + ic(icon, 32) + '</div><h3>' + esc(title) + '</h3>' +
    '<p>' + esc(body) + '</p>' + (action || '') + '</div>';
}

function signedOutState() {
  return '<div class="container page">' +
    '<div class="empty"><div class="empty-icon">' + ic('lock', 32) + '</div><h3>Sign in required</h3>' +
    '<p>This page shows data belonging to your account.</p>' +
    '<button class="btn primary" id="openAuthBtn" type="button">' + ic('signIn', 14) + ' Sign in with your key</button></div>' +
  '</div>';
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
