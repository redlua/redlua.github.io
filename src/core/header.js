/**
 * RedGet — global header.
 *
 * Markup (rebuilt on every render, then wired by bindHeader()):
 *
 *   <header class="gh-header">
 *     <div class="gh-header-inner" id="header">
 *       <div class="gh-left">   hamburger (mobile) · logo · breadcrumb
 *       <div class="gh-center"> search "Search or jump to…" · nav (Pull requests / Issues / Explore)
 *       <div class="gh-right">  Copilot · PR badge · issue badge · bell · + menu · avatar menu
 *     </div>
 *   </header>
 *
 * The badges are computed: the pull-request and issue counters are the number
 * of open items assigned to you across every forge, and the bell dot only
 * appears when you have unread notifications. When the database is empty the
 * counters are hidden rather than showing invented numbers.
 */

import { ME, clearSession, searchQuery, setSearchQuery } from '../state.js';
import { ic, logoMark } from '../icons.js';
import { $, $$ } from './dom.js';
import { esc } from './util.js';
import { navigate, parseRoute } from './router.js';
import { getUserByUsername } from './social.js';
import { notificationsFor, notificationIcon, notificationAge, markAllRead, unreadCount } from './notify.js';
import { openIssuesFor, openPullsFor } from './model.js';
import { avatarInner } from './avatars.js';
import { getTheme } from './theme.js';
import { openMenu } from './menu.js';
import { openPalette } from './palette.js';
import { render } from './render.js';
import { toast } from './toast.js';

export function renderHeader() {
  var el = $('#header');
  if (!el) return;
  var route = parseRoute();
  var context = '';

  if (route.parts.length >= 1) {
    var ownerU = getUserByUsername(route.parts[0]);
    if (ownerU) {
      context = route.parts.length >= 2
        ? '<div class="gh-breadcrumb"><a onclick="navigate(\'/' + esc(ownerU.username) + '\')">' + esc(ownerU.username) + '</a><span class="sep">/</span><a class="forge" onclick="navigate(\'/' + esc(ownerU.username) + '/' + esc(route.parts[1]) + '\')">' + esc(route.parts[1]) + '</a></div>'
        : '<div class="gh-breadcrumb"><a onclick="navigate(\'/' + esc(ownerU.username) + '\')">' + esc(ownerU.username) + '</a></div>';
    }
  }

  if (!ME) {
    el.innerHTML =
      '<div class="gh-left"><a class="gh-logo" onclick="navigate(\'/\')" aria-label="Home">' + logoMark(32) + '</a></div>' +
      '<div class="gh-center"></div>' +
      '<div class="gh-right">' +
        '<button class="btn ghost" onclick="showAuth(\'signin\')">Sign in</button>' +
        '<button class="btn primary" onclick="showAuth(\'create\')">Create account</button>' +
      '</div>';
    return;
  }

  var pulls = openPullsFor(ME.username).length;
  var issues = openIssuesFor(ME.username).length;
  var unread = unreadCount(ME.username);

  el.innerHTML =
    '<div class="gh-left">' +
      '<button class="gh-menu-btn" id="menuBtn" aria-label="Open navigation menu" aria-haspopup="dialog" aria-expanded="false">' + ic('threeBars', 16) + '</button>' +
      '<a class="gh-logo" onclick="navigate(\'/\')" aria-label="Home">' + logoMark(32) + '</a>' +
    '</div>' +
    '<div class="gh-center">' +
      context +
      '<div class="gh-search"><span class="gh-search-icon">' + ic('search', 14) + '</span>' +
        '<input type="search" id="globalSearch" placeholder="Search or jump to…" autocomplete="off" aria-label="Search or jump to" value="' + esc(searchQuery) + '">' +
        '<span class="gh-search-kbd">/</span></div>' +
      '<nav class="gh-nav" aria-label="Global">' +
        '<a onclick="navigate(\'/pulls\')">Pull requests</a>' +
        '<a onclick="navigate(\'/issues\')">Issues</a>' +
        '<a onclick="navigate(\'/explore\')">Explore</a>' +
      '</nav>' +
    '</div>' +
    '<div class="gh-right">' +
      '<button class="btn sm" id="copilotBtn">' + ic('cloud', 14) + ' Copilot</button>' +
      '<div class="gh-divider"></div>' +
      '<a class="gh-action" onclick="navigate(\'/pulls\')" title="' + pulls + ' open pull requests assigned to you" aria-label="Pull requests">' + ic('redPR', 16) + (pulls ? '<span class="badge">' + pulls + '</span>' : '') + '</a>' +
      '<a class="gh-action" onclick="navigate(\'/issues\')" title="' + issues + ' open issues assigned to you" aria-label="Issues">' + ic('issue', 16) + (issues ? '<span class="badge">' + issues + '</span>' : '') + '</a>' +
      '<div class="dd-wrap">' +
        '<button class="gh-action" id="notifBtn" title="Notifications" aria-haspopup="menu" aria-expanded="false">' + ic('bell', 16) + (unread ? '<span class="dot"></span>' : '') + '</button>' +
        '<div class="gh-dropdown wide" id="notifMenu" role="menu" aria-label="Notifications"></div>' +
      '</div>' +
      '<div class="dd-wrap">' +
        '<button class="gh-action" id="plusBtn" title="Create new…" aria-haspopup="menu" aria-expanded="false">' + ic('plus', 16) + '<span style="position:absolute;top:50%;right:1px;transform:translateY(-50%)">' + ic('triangleDown', 8) + '</span></button>' +
        '<div class="gh-dropdown" id="plusMenu" role="menu" aria-label="Create new"></div>' +
      '</div>' +
      '<div class="dd-wrap">' +
        '<button class="gh-avatar-btn" id="avatarBtn" title="@' + esc(ME.username) + '" aria-haspopup="menu" aria-expanded="false">' + avatarInnerMarkup() + '</button>' +
        '<div class="gh-dropdown" id="avatarMenu" role="menu" aria-label="Account"></div>' +
      '</div>' +
    '</div>';

  bindHeader();
}

function avatarInnerMarkup() {
  return avatarInner(ME, 32);
}

export function bindHeader() {
  /* ---- search: live-filters explore, Enter jumps there ------------------ */
  var s = $('#globalSearch');
  if (s) {
    s.addEventListener('input', function (e) {
      setSearchQuery(e.target.value.trim().toLowerCase());
      var hash = location.hash;
      if (hash.indexOf('/explore') === -1) navigate('/explore');
      else render();
    });
    s.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var q = s.value.trim();
        setSearchQuery(q.toLowerCase());
        navigate('/explore');
      }
      if (e.key === 'Escape') { s.value = ''; setSearchQuery(''); render(); }
    });
    s.addEventListener('focus', function () {
      if (s.value) return;
      // Focus alone opens the palette on "/" (see core/shortcuts.js).
    });
  }

  /* ---- notifications: real entries, real unread count ------------------- */
  var nb = $('#notifBtn');
  if (nb) {
    var nm = $('#notifMenu');
    var list = notificationsFor(ME.username).slice(0, 8);
    nm.innerHTML =
      '<div class="gh-dropdown-header">Notifications' +
        (list.length ? '<button class="dd-link" id="markAllRead">Mark all read</button>' : '') +
      '</div>' +
      (list.length
        ? list.map(function (n) {
            return notifItem(notificationIcon(n), n.text, n.from, notificationAge(n), n.href, !n.read);
          }).join('')
        : '<div class="dd-empty">' + ic('bell', 20) + '<span>No notifications yet. Stars, follows, comments and reviews on your work land here.</span></div>') +
      '<div class="gh-dropdown-footer"><a onclick="closeAllDropdowns();navigate(\'/notifications\')">View all notifications</a></div>';
    nb.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !nm.classList.contains('open');
      closeAllDropdowns();
      nm.classList.toggle('open', willOpen);
      nb.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
    var mar = $('#markAllRead');
    if (mar) mar.addEventListener('click', function (e) {
      e.stopPropagation();
      markAllRead(ME.username);
      closeAllDropdowns();
      render();
    });
  }

  /* ---- create-new menu -------------------------------------------------- */
  var pb = $('#plusBtn');
  if (pb) {
    var pm = $('#plusMenu');
    pm.innerHTML =
      '<div class="gh-dropdown-header">Create new…</div>' +
      ddItem('forge', 'New forge', '/new') +
      ddItem('forgePush', 'Import forge', '/new/import') +
      ddItem('code', 'New codespace', '/codespaces/new') +
      ddItem('file', 'New gist', '/gists/new') +
      ddItem('organization', 'New organization', '/organizations/new') +
      ddItem('graph', 'New project', '/projects/new');
    pb.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !pm.classList.contains('open');
      closeAllDropdowns();
      pm.classList.toggle('open', willOpen);
      pb.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
  }

  /* ---- avatar menu ------------------------------------------------------ */
  var ab = $('#avatarBtn');
  if (ab) {
    var am = $('#avatarMenu');
    am.innerHTML =
      '<div class="gh-dropdown-header">Signed in as <b style="color:var(--text-bright)">@' + esc(ME.username) + '</b></div>' +
      '<a class="gh-dropdown-item" onclick="closeAllDropdowns();navigate(\'/' + esc(ME.username) + '\')">' + ic('person', 16) + '<span class="dd-text">Your profile</span></a>' +
      '<a class="gh-dropdown-item" onclick="closeAllDropdowns();navigate(\'/' + esc(ME.username) + '?tab=forges\')">' + ic('forge', 16) + '<span class="dd-text">Your forges</span></a>' +
      '<a class="gh-dropdown-item" onclick="closeAllDropdowns();navigate(\'/' + esc(ME.username) + '?tab=projects\')">' + ic('graph', 16) + '<span class="dd-text">Your projects</span></a>' +
      '<a class="gh-dropdown-item" onclick="closeAllDropdowns();navigate(\'/' + esc(ME.username) + '?tab=stars\')">' + ic('star', 16) + '<span class="dd-text">Your stars</span></a>' +
      '<a class="gh-dropdown-item" onclick="closeAllDropdowns();navigate(\'/organizations\')">' + ic('organization', 16) + '<span class="dd-text">Your organizations</span></a>' +
      '<a class="gh-dropdown-item" onclick="closeAllDropdowns();navigate(\'/enterprises\')">' + ic('enterprise', 16) + '<span class="dd-text">Your enterprises</span></a>' +
      '<a class="gh-dropdown-item" onclick="closeAllDropdowns();navigate(\'/settings\')">' + ic('gear', 16) + '<span class="dd-text">Settings</span></a>' +
      '<div class="gh-dropdown-sep"></div>' +
      '<div class="gh-dropdown-header">Theme</div>' +
      themeOption('dark', 'Dark') +
      themeOption('light', 'Light') +
      themeOption('hc', 'High contrast') +
      '<div class="gh-dropdown-sep"></div>' +
      '<a class="gh-dropdown-item" onclick="closeAllDropdowns();openPalette()">' + ic('search', 16) + '<span class="dd-text">Command palette</span><span class="dd-kbd">Ctrl K</span></a>' +
      '<a class="gh-dropdown-item danger" onclick="closeAllDropdowns();signOut()">' + ic('signOut', 16) + '<span class="dd-text">Sign out</span></a>';
    ab.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !am.classList.contains('open');
      closeAllDropdowns();
      am.classList.toggle('open', willOpen);
      ab.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
  }

  /* ---- mobile navigation drawer ---------------------------------------- */
  var mb = $('#menuBtn');
  if (mb) mb.addEventListener('click', function (e) {
    e.stopPropagation();
    closeAllDropdowns();
    mb.setAttribute('aria-expanded', 'true');
    openMenu();
  });

  /* ---- Copilot ---------------------------------------------------------- */
  var cb = $('#copilotBtn');
  if (cb) cb.addEventListener('click', function () {
    navigate('/copilot');
  });
}

/**
 * A notification row.
 *   <a class="notif-item" href="#/owner/forge/issues/3">
 *     <div class="notif-icon">svg</div>
 *     <div class="notif-body">
 *       <div class="notif-title">…</div>
 *       <div class="notif-meta">2 minutes ago</div>
 *     </div>
 *   </a>
 */
export function notifItem(iconName, action, forge, time, href, unread) {
  var title = action ? (forge ? action + ' in <b>' + esc(forge) + '</b>' : esc(action)) : esc(forge || '');
  return '<a class="notif-item' + (unread ? ' unread' : '') + '" onclick="closeAllDropdowns();navigate(\'' + esc(href || '/') + '\')">' +
    '<div class="notif-icon">' + ic(iconName || 'bell', 14) + '</div>' +
    '<div class="notif-body">' +
      '<div class="notif-title">' + title + '</div>' +
      '<div class="notif-meta">' + esc(time || '') + '</div>' +
    '</div>' +
    (unread ? '<span class="notif-dot" aria-label="Unread"></span>' : '') +
  '</a>';
}

/** A create-new menu row. */
export function ddItem(iconName, label, path) {
  return '<a class="gh-dropdown-item" onclick="closeAllDropdowns();navigate(\'' + path + '\')">' + ic(iconName, 16) + '<span class="dd-text">' + esc(label) + '</span></a>';
}

/** A theme row with a check mark on the active theme. */
export function themeOption(value, label) {
  var cur = getTheme();
  return '<a class="gh-dropdown-item" onclick="setTheme(\'' + value + '\');closeAllDropdowns();">' +
    '<span class="dd-icon">' + (cur === value ? ic('check', 16) : '') + '</span>' +
    '<span class="dd-text">' + esc(label) + '</span>' +
    (cur === value ? '<span class="dd-kbd">Active</span>' : '') +
  '</a>';
}

export function closeAllDropdowns() {
  $$('.gh-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
  $$('[aria-expanded="true"].gh-action, [aria-expanded="true"].gh-avatar-btn, [aria-expanded="true"].gh-menu-btn')
    .forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
}

export function signOut() {
  clearSession();
  navigate('/');
  render();
  toast('Signed out');
}
