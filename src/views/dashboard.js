/**
 * RedGet — the signed-in dashboard.
 *
 * Every figure here is derived from the database: your forges, the
 * activity log written by real actions, your unread notifications, the issues
 * and pull requests you opened or are assigned to, the forges you
 * starred, and the organizations you belong to. An account with no data gets
 * an empty state, never invented content.
 */

import { DB, ME } from '../state.js';
import { ic } from '../icons.js';
import { avatarHTML } from '../core/avatars.js';
import { langColor } from '../core/languages.js';
import { activityLabel } from '../core/forges.js';
import { starCount, forkCount, starredForges, getFollowers, getFollowing } from '../core/social.js';
import { unreadCount, notificationsFor } from '../core/notify.js';
import { orgsFor, orgRole } from '../core/orgs.js';
import { codespacesFor } from '../core/codespaces.js';
import { gistsFor } from '../core/gists.js';
import { visibleProjects } from '../core/projects.js';
import { esc, timeAgo, formatDate } from '../core/util.js';

export function viewDashboard() {
  var forges = (ME.forges || []).slice().sort(function (a, b) { return b.updated - a.updated; });
  var recent = forges.slice(0, 5);
  var activity = (ME.activity || []).slice(0, 12);
  var followers = getFollowers(ME.username);
  var following = getFollowing(ME.username);
  var unread = unreadCount(ME.username);
  var notifications = notificationsFor(ME.username).filter(function (n) { return !n.read; }).slice(0, 5);
  var openIssues = [];
  var openPulls = [];
  var starred = starredForges(ME.username).slice(0, 4);
  var orgs = orgsFor(ME.username);
  var codespaces = codespacesFor(ME.username).filter(function (c) { return c.status !== 'deleted'; }).slice(0, 3);
  var gists = gistsFor(ME.username).slice(0, 3);
  var projects = visibleProjects().filter(function (p) { return p.owner === 'user' && p.ownerKey === ME.username; }).slice(0, 3);

  forges.forEach(function (forge) {
    (forge.issues || []).forEach(function (issue) {
      if (issue.state !== 'open') return;
      if (issue.author === ME.username || (issue.assignees || []).indexOf(ME.username) !== -1) {
        openIssues.push({ forge: forge, item: issue });
      }
    });
    (forge.pulls || []).forEach(function (pr) {
      if (pr.state !== 'open') return;
      if (pr.author === ME.username || (pr.reviewers || []).indexOf(ME.username) !== -1) {
        openPulls.push({ forge: forge, item: pr });
      }
    });
  });

  return '<div class="container page">' +
    '<div class="dashboard-grid">' +
      '<div>' +
        '<div class="dash-section">' +
          '<div class="dash-head"><h2>Recent activity</h2>' +
            (activity.length ? '<a href="#/' + esc(ME.username) + '">View all</a>' : '') + '</div>' +
          (activity.length
            ? '<div class="card-tight feed">' + activity.map(function (a) {
                return '<div class="feed-item">' +
                  '<div class="feed-avatar">' + avatarHTML(ME, 32) + '</div>' +
                  '<div class="feed-body"><b>' + esc(ME.username) + '</b> ' + activityLabel(a) +
                    '<div class="feed-meta">' + timeAgo(a.t) + '</div></div>' +
                '</div>';
              }).join('') + '</div>'
            : '<div class="empty"><div class="empty-icon">' + ic('pulse', 32) + '</div>' +
              '<h3>No activity yet</h3>' +
              '<p>Everything you do — creating a forge, committing a file, opening an issue — is recorded here.</p>' +
              '<a class="btn primary" href="#/new">' + ic('plus', 14) + ' Create your first forge</a></div>') +
        '</div>' +

        '<div class="dash-section">' +
          '<div class="dash-head"><h2>Your forges</h2>' +
            (forges.length > 5 ? '<a href="#/' + esc(ME.username) + '?tab=forges">View all ' + forges.length + '</a>' : '') +
            '<a class="btn xs primary" href="#/new">' + ic('plus', 12) + ' New</a>' +
          '</div>' +
          (recent.length
            ? recent.map(function (r) { return forgeCard(r, ME); }).join('')
            : '<div class="empty"><div class="empty-icon">' + ic('forge', 32) + '</div><h3>No forges yet</h3>' +
              '<p>Forges hold your files, history, issues and pull requests.</p>' +
              '<a class="btn primary" href="#/new">' + ic('plus', 14) + ' Create forge</a>' +
              '<a class="btn" href="#/new/import">' + ic('upload', 14) + ' Import files</a></div>') +
        '</div>' +

        (starred.length ? '<div class="dash-section">' +
          '<div class="dash-head"><h2>Recently starred</h2><a href="#/' + esc(ME.username) + '?tab=stars">View all</a></div>' +
          '<div class="card-tight">' + starred.map(function (entry) {
            return '<div class="list-item"><div class="list-icon">' + ic('starFill', 14) + '</div>' +
              '<div class="list-body"><div class="list-title"><a href="#/' + esc(entry.user.username) + '/' + esc(entry.forge.name) + '">' +
                esc(entry.user.username) + '/' + esc(entry.forge.name) + '</a></div>' +
              '<div class="list-meta">' + esc(entry.forge.desc || 'No description') + '</div></div></div>';
          }).join('') + '</div></div>' : '') +
      '</div>' +

      '<div class="sticky-side">' +
        '<div class="card mb-4">' +
          '<h3 class="side-title">Your profile</h3>' +
          '<div class="dash-profile">' + avatarHTML(ME, 48) +
            '<div class="dash-profile-body">' +
              '<div class="bright fw-600 truncate">' + esc(ME.displayName || ME.username) + '</div>' +
              '<div class="muted fs-13 truncate">@' + esc(ME.username) + '</div>' +
            '</div></div>' +
          (ME.status && ME.status.message ? '<div class="status-line">' + esc(ME.status.emoji || '') + ' ' + esc(ME.status.message) +
            (ME.status.busy ? ' <span class="label">Busy</span>' : '') + '</div>' : '') +
          '<div class="dash-stats">' +
            '<span><b>' + forges.length + '</b> forges</span>' +
            '<span><b>' + followers + '</b> followers</span>' +
            '<span><b>' + following + '</b> following</span>' +
          '</div>' +
          '<a class="btn sm block mt-2" href="#/settings/profile">' + ic('pencil', 12) + ' Edit profile</a>' +
        '</div>' +

        '<div class="card mb-4">' +
          '<h3 class="side-title">' + ic('bell', 14) + ' Notifications' +
            (unread ? ' <span class="counter">' + unread + '</span>' : '') + '</h3>' +
          (notifications.length
            ? '<div class="side-rows">' + notifications.map(function (n) {
                return '<div class="side-row"><a href="#' + esc(n.href || '/notifications') + '">' + esc(n.text) + '</a>' +
                  '<div class="muted fs-12">' + (n.from ? esc(n.from) + ' · ' : '') + timeAgo(n.at) + '</div></div>';
              }).join('') + '</div><a class="side-more" href="#/notifications">All notifications</a>'
            : '<p class="muted fs-13">Nothing unread.</p>') +
        '</div>' +

        ((openIssues.length || openPulls.length) ? '<div class="card mb-4">' +
          '<h3 class="side-title">Needs your attention</h3>' +
          '<div class="side-rows">' +
            openIssues.slice(0, 4).map(function (r) {
              return '<div class="side-row"><a href="#/' + esc(ME.username) + '/' + esc(r.forge.name) + '/issues/' + r.item.number + '">' +
                ic('issueOpened', 12) + ' ' + esc(r.item.title) + '</a>' +
                '<div class="muted fs-12">' + esc(r.forge.name) + ' #' + r.item.number + '</div></div>';
            }).join('') +
            openPulls.slice(0, 4).map(function (r) {
              return '<div class="side-row"><a href="#/' + esc(ME.username) + '/' + esc(r.forge.name) + '/pull/' + r.item.number + '">' +
                ic('redMergeRequest', 12) + ' ' + esc(r.item.title) + '</a>' +
                '<div class="muted fs-12">' + esc(r.forge.name) + ' #' + r.item.number + '</div></div>';
            }).join('') +
          '</div></div>' : '') +

        (orgs.length ? '<div class="card mb-4">' +
          '<h3 class="side-title">' + ic('organization', 14) + ' Organizations</h3>' +
          '<div class="side-rows">' + orgs.map(function (org) {
            return '<div class="side-row"><a href="#/orgs/' + esc(org.slug) + '">' + avatarHTML({ username: org.slug, avatar: org.avatar }, 18) +
              ' ' + esc(org.name || org.slug) + '</a><div class="muted fs-12">' + esc(orgRole(org, ME.username) || 'member') +
              ' · ' + (org.forges || []).length + ' forges</div></div>';
          }).join('') + '</div>' +
          '<a class="side-more" href="#/organizations/new">' + ic('plus', 12) + ' New organization</a></div>' : '') +

        (projects.length ? '<div class="card mb-4"><h3 class="side-title">' + ic('project', 14) + ' Projects</h3>' +
          '<div class="side-rows">' + projects.map(function (p) {
            return '<div class="side-row"><a href="#/projects/' + esc(p.id) + '">' + esc(p.title) + '</a>' +
              '<div class="muted fs-12">' + (p.columns || []).length + ' columns</div></div>';
          }).join('') + '</div></div>' : '') +

        (codespaces.length ? '<div class="card mb-4"><h3 class="side-title">' + ic('codespaces', 14) + ' Codespaces</h3>' +
          '<div class="side-rows">' + codespaces.map(function (c) {
            return '<div class="side-row"><a href="#/codespaces/' + esc(c.id) + '">' + esc(c.name) + '</a>' +
              '<div class="muted fs-12">' + esc(c.forgeOwner) + '/' + esc(c.forgeName) + ' · ' + esc(c.status) + '</div></div>';
          }).join('') + '</div><a class="side-more" href="#/codespaces">All codespaces</a></div>' : '') +

        (gists.length ? '<div class="card mb-4"><h3 class="side-title">' + ic('codeSquare', 14) + ' Gists</h3>' +
          '<div class="side-rows">' + gists.map(function (g) {
            return '<div class="side-row"><a href="#/gists/' + esc(g.id) + '">' + esc(g.description || g.files[0].name) + '</a>' +
              '<div class="muted fs-12">' + g.files.length + ' file' + (g.files.length === 1 ? '' : 's') + ' · ' + timeAgo(g.updated) + '</div></div>';
          }).join('') + '</div><a class="side-more" href="#/gists">All gists</a></div>' : '') +

        '<div class="card">' +
          '<h3 class="side-title">Explore RedGet</h3>' +
          '<div class="side-links">' +
            sideLink('/explore', 'search', 'Explore forges', 'Everything created in this browser') +
            sideLink('/trending', 'flame', 'Trending', 'Ranked by real recent activity') +
            sideLink('/codespaces', 'codespaces', 'Codespaces', 'Open a terminal against your files') +
            sideLink('/marketplace', 'package', 'Marketplace', 'Install apps onto your account') +
            sideLink('/docs', 'book', 'Documentation', 'How every feature works') +
            sideLink('/settings', 'gear', 'Account settings', 'Key, sessions, appearance and data') +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function sideLink(href, icon, label, hint) {
  return '<a class="side-link" href="#' + href + '"><span class="side-link-icon">' + ic(icon, 16) + '</span>' +
    '<span><b class="fs-13">' + esc(label) + '</b><span class="muted fs-12">' + esc(hint) + '</span></span></a>';
}

/** Forge card. Star and fork counts are read from the real records. */
export function forgeCard(r, owner) {
  owner = owner || ME || { username: (r && r.ownerUsername) || '' };
  var stars = starCount(r.id);
  var forks = forkCount(r.id);
  return '<div class="forge-card">' +
    '<div class="forge-card-head">' +
      '<a class="forge-card-name" href="#/' + esc(owner.username) + '/' + esc(r.name) + '">' + esc(r.name) + '</a>' +
      '<span class="forge-card-owner muted fs-12">' + esc(owner.username) + '</span>' +
      '<span class="label outline">' + esc(r.visibility) + '</span>' +
      (r.archived ? '<span class="label">' + ic('archive', 10) + ' Archived</span>' : '') +
      (r.pinned ? '<span class="label">' + ic('pin', 10) + ' Pinned</span>' : '') +
    '</div>' +
    (r.desc ? '<div class="forge-card-desc">' + esc(r.desc) + '</div>' : '') +
    ((r.topics || []).length ? '<div class="forge-topics">' + r.topics.slice(0, 4).map(function (t) {
      return '<a class="topic" href="#/explore?topic=' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
    }).join('') + '</div>' : '') +
    '<div class="forge-card-meta">' +
      '<span class="lang"><i class="dot" style="background:' + esc(langColor(r.language)) + '"></i>' + esc(r.language || 'Other') + '</span>' +
      '<a class="stat" href="#/' + esc(owner.username) + '/' + esc(r.name) + '/stargazers">' + ic('star', 13) + ' ' + stars + '</a>' +
      '<a class="stat" href="#/' + esc(owner.username) + '/' + esc(r.name) + '/forks">' + ic('fork', 13) + ' ' + forks + '</a>' +
      '<span class="stat">' + ic('issue', 13) + ' ' + (r.issues || []).filter(function (i) { return i.state === 'open'; }).length + '</span>' +
      '<span>Updated ' + timeAgo(r.updated) + '</span>' +
    '</div>' +
  '</div>';
}
