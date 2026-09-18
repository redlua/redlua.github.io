/**
 * RedGet — Explore and Trending.
 *
 * Both pages are built from the real database: forges that exist here,
 * accounts that exist here, and stars/forks that were actually given. With an
 * empty database they show an empty state rather than invented content.
 */

import { DB, ME, searchQuery } from '../state.js';
import { ic } from '../icons.js';
import { avatarHTML } from '../core/avatars.js';
import { getUserByUsername, starCount, forkCount, isFollowing, toggleFollow } from '../core/social.js';
import { visibleForges } from '../core/forges.js';
import { allOrgs, orgsFor } from '../core/orgs.js';
import { langColor, LANG_COLORS } from '../core/languages.js';
import { render } from '../core/render.js';
import { toast } from '../core/toast.js';
import { esc, timeAgo, formatDate } from '../core/util.js';
import { forgeCard } from './dashboard.js';

/* ===================================================================== *
   Explore
\* ===================================================================== */

export function viewExplore(rest) {
  var query = hashQuery();
  var topic = query.topic || '';
  var language = query.language || '';
  var q = (query.q || searchQuery || '').toLowerCase();
  var sort = query.sort || 'updated';

  var entries = visibleForges();
  var filtered = entries.filter(function (entry) {
    var forge = entry.forge;
    var user = entry.user;
    if (topic && (forge.topics || []).indexOf(topic) === -1) return false;
    if (language && forge.language !== language) return false;
    if (!q) return true;
    return forge.name.toLowerCase().indexOf(q) !== -1 ||
      String(forge.desc || '').toLowerCase().indexOf(q) !== -1 ||
      user.username.toLowerCase().indexOf(q) !== -1 ||
      (forge.topics || []).some(function (t) { return t.toLowerCase().indexOf(q) !== -1; });
  });

  filtered = filtered.slice().sort(function (a, b) {
    if (sort === 'stars') return starCount(b.forge.id) - starCount(a.forge.id);
    if (sort === 'forks') return forkCount(b.forge.id) - forkCount(a.forge.id);
    if (sort === 'name') return a.forge.name.localeCompare(b.forge.name);
    return b.forge.updated - a.forge.updated;
  });

  var accounts = allAccounts().filter(function (u) {
    return !ME || u.username !== ME.username;
  }).filter(function (u) {
    if (!q) return true;
    return u.username.toLowerCase().indexOf(q) !== -1 || String(u.bio || '').toLowerCase().indexOf(q) !== -1;
  });

  var orgs = allOrgs().filter(function (o) {
    return !q || o.slug.toLowerCase().indexOf(q) !== -1 || String(o.name || '').toLowerCase().indexOf(q) !== -1;
  });

  var topics = topicIndex();

  return '<div class="container page">' +
    '<div class="page-head">' +
      '<div><h1 class="page-title">Explore</h1>' +
        '<p class="muted fs-13">' + filtered.length + ' forgesitor' + (filtered.length === 1 ? 'y' : 'ies') +
        ' · ' + accounts.length + ' account' + (accounts.length === 1 ? '' : 's') +
        ' · ' + orgs.length + ' organization' + (orgs.length === 1 ? '' : 's') + ' in this browser</p></div>' +
      '<div class="page-head-actions">' +
        '<a class="btn sm' + (sort === 'updated' ? ' primary' : '') + '" href="#/explore' + queryString({ sort: 'updated', q: q, topic: topic, language: language }) + '">Recently updated</a>' +
        '<a class="btn sm' + (sort === 'stars' ? ' primary' : '') + '" href="#/explore' + queryString({ sort: 'stars', q: q, topic: topic, language: language }) + '">Most stars</a>' +
        '<a class="btn sm" href="#/trending">' + ic('flame', 14) + ' Trending</a>' +
      '</div>' +
    '</div>' +

    '<div class="explore-search mb-4">' +
      '<span class="explore-search-icon">' + ic('search', 16) + '</span>' +
      '<input type="search" class="input" id="exploreSearch" placeholder="Search forges, people and topics" value="' + esc(q) + '" aria-label="Search">' +
      (q ? '<a class="btn sm" href="#/explore">Clear</a>' : '') +
    '</div>' +

    (topics.length ? '<div class="topic-bar mb-4">' +
      '<span class="muted fs-12">Topics:</span>' +
      topics.slice(0, 14).map(function (t) {
        return '<a class="topic' + (topic === t.name ? ' on' : '') + '" href="#/explore' + queryString({ topic: topic === t.name ? '' : t.name, q: q }) + '">' +
          esc(t.name) + ' <span class="muted fs-11">' + t.count + '</span></a>';
      }).join('') +
    '</div>' : '') +

    (language || topic ? '<div class="callout mb-4">' + ic('filter', 14) + ' Filtered by ' +
      [topic ? 'topic <b>' + esc(topic) + '</b>' : '', language ? 'language <b>' + esc(language) + '</b>' : ''].filter(Boolean).join(' and ') +
      ' · <a href="#/explore">clear filters</a></div>' : '') +

    '<div class="explore-grid">' +
      '<div>' +
        '<h2 class="section-title">Forges</h2>' +
        (filtered.length
          ? filtered.slice(0, 30).map(function (entry) { return forgeCard(entry.forge, entry.user); }).join('')
          : '<div class="empty"><div class="empty-icon">' + ic('forge', 32) + '</div>' +
            '<h3>' + (entries.length ? 'No forges match' : 'No forges yet') + '</h3>' +
            '<p>' + (entries.length
              ? 'Try a different search term or clear the filters.'
              : 'Everything you create in this browser shows up here — nothing is seeded.') + '</p>' +
            (entries.length ? '<a class="btn" href="#/explore">Clear filters</a>' : '<a class="btn primary" href="#/new">' + ic('plus', 14) + ' Create a forge</a>') +
          '</div>') +

        (orgs.length ? '<h2 class="section-title mt-6">Organizations</h2>' +
          '<div class="org-grid">' + orgs.map(function (org) {
            return '<a class="org-card card" href="#/orgs/' + esc(org.slug) + '">' +
              '<div class="org-card-head">' + avatarHTML({ username: org.slug, avatar: org.avatar }, 36) +
                '<div><div class="fw-600 bright">' + esc(org.name || org.slug) + '</div>' +
                '<div class="muted fs-12">@' + esc(org.slug) + '</div></div></div>' +
              '<p class="muted fs-13">' + esc(org.description || 'No description') + '</p>' +
              '<div class="forge-card-meta"><span class="stat">' + ic('forge', 13) + ' ' + (org.forges || []).length + '</span>' +
                '<span class="stat">' + ic('people', 13) + ' ' + (org.members || []).length + '</span></div>' +
            '</a>';
          }).join('') + '</div>' : '') +
      '</div>' +

      '<div class="sticky-side">' +
        '<div class="card">' +
          '<h3 class="side-title">Languages</h3>' +
          '<div class="lang-picker">' + Object.keys(LANG_COLORS).map(function (lang) {
            var count = entries.filter(function (e) { return e.forge.language === lang; }).length;
            if (!count) return '';
            return '<a class="lang-pick' + (language === lang ? ' on' : '') + '" href="#/explore' + queryString({ language: language === lang ? '' : lang, q: q }) + '">' +
              '<span class="lang-dot" style="background:' + esc(langColor(lang)) + '"></span>' + esc(lang) +
              '<span class="muted fs-12">' + count + '</span></a>';
          }).join('') + '</div>' +
        '</div>' +
        '<div class="card mt-4">' +
          '<h3 class="side-title">People</h3>' +
          (accounts.length
            ? '<div class="people-list">' + accounts.slice(0, 8).map(function (u) {
                return '<div class="person-row">' + avatarHTML(u, 28) +
                  '<div class="person-body"><a href="#/' + esc(u.username) + '">' + esc(u.username) + '</a>' +
                  '<div class="muted fs-12 truncate">' + esc(u.bio || 'No bio') + '</div></div>' +
                  (ME ? '<button class="btn xs followBtn' + (isFollowing(u.username) ? '' : ' primary') + '" type="button" data-username="' + esc(u.username) + '">' +
                    (isFollowing(u.username) ? 'Following' : 'Follow') + '</button>' : '') +
                '</div>';
              }).join('') + '</div>'
            : '<p class="muted fs-13">No other accounts in this browser yet.</p>') +
        '</div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/* ===================================================================== *
   Trending
\* ===================================================================== */

export function viewTrending(rest) {
  var query = hashQuery();
  var window = ['daily', 'weekly', 'monthly'].indexOf(query.since) !== -1 ? query.since : 'weekly';
  var language = query.language || '';
  var sinceMs = window === 'daily' ? 86400000 : window === 'weekly' ? 7 * 86400000 : 30 * 86400000;
  var cutoff = Date.now() - sinceMs;

  var entries = visibleForges().filter(function (entry) {
    if (language && entry.forge.language !== language) return false;
    return true;
  }).map(function (entry) {
    var forge = entry.forge;
    var recentCommits = (forge.commits || []).filter(function (c) { return c.time >= cutoff; }).length;
    var recentIssues = (forge.issues || []).filter(function (i) { return i.created >= cutoff; }).length;
    var recentPulls = (forge.pulls || []).filter(function (p) { return p.created >= cutoff; }).length;
    var recentStars = starRecordsFor(forge.id).filter(function (s) { return s.at >= cutoff; }).length;
    return {
      user: entry.user,
      forge: forge,
      score: recentStars * 3 + recentCommits + recentIssues + recentPulls,
      starsInWindow: recentStars,
      activity: recentCommits + recentIssues + recentPulls,
    };
  }).filter(function (row) { return row.score > 0; })
    .sort(function (a, b) { return b.score - a.score || b.forge.updated - a.forge.updated; });

  var builders = trendingBuilders(cutoff);

  return '<div class="container page">' +
    '<div class="page-head">' +
      '<div><h1 class="page-title">' + ic('flame', 22) + ' Trending</h1>' +
        '<p class="muted fs-13">Ranked by stars, commits, issues and pull requests created in the selected window — computed from the forges in this browser.</p></div>' +
      '<div class="page-head-actions">' +
        ['daily', 'weekly', 'monthly'].map(function (w) {
          return '<a class="btn sm' + (window === w ? ' primary' : '') + '" href="#/trending' + queryString({ since: w, language: language }) + '">' + esc(w) + '</a>';
        }).join('') +
      '</div>' +
    '</div>' +

    '<div class="topic-bar mb-4">' +
      '<span class="muted fs-12">Language:</span>' +
      '<a class="topic' + (!language ? ' on' : '') + '" href="#/trending' + queryString({ since: window }) + '">All</a>' +
      Object.keys(LANG_COLORS).map(function (lang) {
        return '<a class="topic' + (language === lang ? ' on' : '') + '" href="#/trending' + queryString({ since: window, language: lang }) + '">' +
          '<span class="lang-dot" style="background:' + esc(langColor(lang)) + '"></span>' + esc(lang) + '</a>';
      }).join('') +
    '</div>' +

    (entries.length
      ? '<div class="card-tight trending-list">' + entries.slice(0, 25).map(function (row, index) {
          return '<div class="trending-row">' +
            '<span class="trending-rank">' + (index + 1) + '</span>' +
            '<div class="trending-body">' +
              '<a class="trending-name" href="#/' + esc(row.user.username) + '/' + esc(row.forge.name) + '">' +
                esc(row.user.username) + ' / <b>' + esc(row.forge.name) + '</b></a>' +
              '<div class="muted fs-13">' + esc(row.forge.desc || 'No description') + '</div>' +
              '<div class="forge-card-meta">' +
                '<span class="lang"><i class="dot" style="background:' + esc(langColor(row.forge.language)) + '"></i>' + esc(row.forge.language) + '</span>' +
                '<span class="stat">' + ic('star', 13) + ' ' + starCount(row.forge.id) + '</span>' +
                '<span class="stat">' + ic('fork', 13) + ' ' + forkCount(row.forge.id) + '</span>' +
                '<span class="stat trending-window">' + ic('flame', 13) + ' ' + row.starsInWindow + ' star' + (row.starsInWindow === 1 ? '' : 's') +
                  ' · ' + row.activity + ' event' + (row.activity === 1 ? '' : 's') + ' this ' + window.slice(0, -2) + '</span>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('') + '</div>'
      : '<div class="empty"><div class="empty-icon">' + ic('flame', 32) + '</div>' +
        '<h3>Nothing trending in this window</h3>' +
        '<p>Trending ranks real activity. Create a forge, commit to it, or star one and it will show up here.</p>' +
        '<a class="btn primary" href="#/new">' + ic('plus', 14) + ' Create a forge</a>' +
        '<a class="btn" href="#/trending' + queryString({ since: 'monthly', language: language }) + '">Widen to a month</a></div>') +

    '<h2 class="section-title mt-6">Trending developers</h2>' +
    (builders.length
      ? '<div class="contributors-grid">' + builders.map(function (b) {
          return '<div class="contrib-card">' + avatarHTML(b.user, 40) +
            '<div><div class="fw-600 bright"><a href="#/' + esc(b.user.username) + '">' + esc(b.user.username) + '</a></div>' +
            '<div class="muted fs-12">' + b.count + ' contribution' + (b.count === 1 ? '' : 's') + ' in this window</div></div></div>';
        }).join('') + '</div>'
      : '<div class="empty"><h3>No contributors yet</h3><p>Commit, comment or open an issue and you will appear here.</p></div>') +
  '</div>';
}

function starRecordsFor(forgeId) {
  return (DB.stars || []).filter(function (s) { return s.forgeId === forgeId; });
}

function trendingBuilders(cutoff) {
  var counts = {};
  visibleForges().forEach(function (entry) {
    var forge = entry.forge;
    (forge.commits || []).forEach(function (c) {
      if (c.time < cutoff || !c.author) return;
      counts[c.author] = (counts[c.author] || 0) + 1;
    });
    (forge.issues || []).forEach(function (i) {
      if (i.created < cutoff) return;
      counts[i.author] = (counts[i.author] || 0) + 1;
      (i.comments || []).forEach(function (c) {
        if (c.created >= cutoff) counts[c.author] = (counts[c.author] || 0) + 1;
      });
    });
    (forge.pulls || []).forEach(function (p) {
      if (p.created < cutoff) return;
      counts[p.author] = (counts[p.author] || 0) + 1;
      (p.comments || []).forEach(function (c) {
        if (c.created >= cutoff) counts[c.author] = (counts[c.author] || 0) + 1;
      });
    });
  });
  return Object.keys(counts).map(function (name) {
    return { user: getUserByUsername(name) || { username: name, avatar: null }, count: counts[name] };
  }).sort(function (a, b) { return b.count - a.count; }).slice(0, 10);
}

/* ===================================================================== *
   shared helpers
\* ===================================================================== */

function allAccounts() {
  return Object.keys(DB.users).map(function (k) { return DB.users[k]; })
    .sort(function (a, b) { return b.joined - a.joined; });
}

function topicIndex() {
  var counts = {};
  visibleForges().forEach(function (entry) {
    (entry.forge.topics || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; });
  });
  return Object.keys(counts).map(function (name) { return { name: name, count: counts[name] }; })
    .sort(function (a, b) { return b.count - a.count; });
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

function queryString(params) {
  var parts = Object.keys(params || {}).filter(function (k) { return params[k]; })
    .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); });
  return parts.length ? '?' + parts.join('&') : '';
}
