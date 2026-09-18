/**
 * RedGet — navigation drawer opened by the header hamburger.
 *
 *   <div class="drawer-overlay open" id="drawerOverlay">
 *     <div class="drawer" role="dialog" aria-modal="true" aria-label="Navigation">
 *       <div class="drawer-head">avatar · @username · close</div>
 *       <nav class="drawer-nav"><a href="#/…">…</a></nav>
 *       <div class="drawer-section">Forges / Organizations / …</div>
 *       <div class="drawer-foot">Theme switcher · Sign out</div>
 *     </div>
 *   </div>
 *
 * It is appended to <body> on first use, so index.html stays exactly as
 * designed. Escape or a backdrop click closes it; focus returns to the button
 * that opened it.
 */

import { ME } from '../state.js';
import { ic } from '../icons.js';
import { $ } from './dom.js';
import { esc } from './util.js';
import { navigate } from './router.js';
import { getFollowers, getFollowing } from './social.js';
import { avatarHTML } from './avatars.js';
import { getTheme, setTheme } from './theme.js';
import { render } from './render.js';
import { showAuth } from './auth.js';
import { signOut } from './header.js';

var lastTrigger = null;

function ensureDrawer() {
  if ($('#drawerOverlay')) return $('#drawerOverlay');
  var overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.id = 'drawerOverlay';
  overlay.innerHTML = '<div class="drawer" id="drawer" role="dialog" aria-modal="true" aria-label="Site navigation"></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('mousedown', function (e) {
    if (e.target === overlay) closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeMenu();
  });
  return overlay;
}

export function openMenu() {
  var overlay = ensureDrawer();
  var drawer = $('#drawer');
  lastTrigger = document.activeElement;
  drawer.innerHTML = menuMarkup();
  overlay.classList.add('open');
  var btn = $('#menuBtn');
  if (btn) btn.setAttribute('aria-expanded', 'true');
  var close = $('#drawerClose');
  if (close) {
    close.addEventListener('click', closeMenu);
    close.focus();
  }
  var signInBtn = $('#drawerSignIn');
  if (signInBtn) signInBtn.addEventListener('click', function () { closeMenu(); showAuth('signin'); });
  drawer.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () { closeMenu(); });
  });
  var themeButtons = drawer.querySelectorAll('[data-theme]');
  themeButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      setTheme(b.getAttribute('data-theme'));
      themeButtons.forEach(function (other) { other.classList.toggle('active', other === b); });
      render();
    });
  });
  var out = $('#drawerSignOut');
  if (out) out.addEventListener('click', function () { closeMenu(); signOut(); });
}

/**
 * Called once at boot. The drawer markup is generated lazily by openMenu(),
 * so all this does is make sure the Escape key can always reach it and that
 * the overlay exists for the first paint of a deep-linked route.
 */
export function initMenu() {
  ensureDrawer();
}

export function closeMenu() {
  var overlay = $('#drawerOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  var btn = $('#menuBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');
  if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
}

function menuMarkup() {
  if (!ME) {
    return '<div class="drawer-head"><div class="drawer-brand">' + ic('logo', 20) + '<b>RedGet</b></div>' +
      '<button class="modal-close" id="drawerClose" aria-label="Close navigation">' + ic('x', 16) + '</button></div>' +
      '<div class="drawer-body"><p class="muted fs-13">Sign in to see your navigation.</p>' +
      '<button class="btn primary" id="drawerSignIn">Sign in</button></div>';
  }

  var forges = (ME.forges || []).slice(0, 8);

  return '' +
    '<div class="drawer-head">' +
      '<div class="drawer-user">' + avatarHTML(ME, 32) +
        '<div class="drawer-user-text">' +
          '<div class="bright fw-600 truncate">' + esc(ME.displayName || ME.username) + '</div>' +
          '<div class="muted fs-12 truncate">@' + esc(ME.username) + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="modal-close" id="drawerClose" aria-label="Close navigation">' + ic('x', 16) + '</button>' +
    '</div>' +
    '<div class="drawer-body">' +
      '<div class="drawer-stats">' +
        '<span><b>' + (ME.forges || []).length + '</b> forges</span>' +
        '<span><b>' + getFollowers(ME.username) + '</b> followers</span>' +
        '<span><b>' + getFollowing(ME.username) + '</b> following</span>' +
      '</div>' +

      '<nav class="drawer-nav" aria-label="Main">' +
        drawerLink('home', 'Dashboard', '/') +
        drawerLink('person', 'Your profile', '/' + ME.username) +
        drawerLink('forge', 'Your forges', '/' + ME.username + '?tab=forges') +
        drawerLink('issue', 'Issues', '/issues') +
        drawerLink('redPR', 'Pull requests', '/pulls') +
        drawerLink('project', 'Projects', '/projects') +
        drawerLink('bell', 'Notifications', '/notifications') +
        drawerLink('telescope', 'Explore', '/explore') +
        drawerLink('marketplace', 'Marketplace', '/marketplace') +
        drawerLink('codespaces', 'Codespaces', '/codespaces') +
        drawerLink('fileCode', 'Gists', '/gists') +
        drawerLink('organization', 'Organizations', '/organizations') +
        drawerLink('enterprise', 'Enterprises', '/enterprises') +
        drawerLink('gear', 'Settings', '/settings') +
      '</nav>' +

      '<div class="drawer-section">' +
        '<div class="drawer-section-head"><span>Top forges</span><a href="#/new">New</a></div>' +
        (forges.length
          ? '<ul class="drawer-forges">' + forges.map(function (r) {
              return '<li><a href="#/' + esc(ME.username) + '/' + esc(r.name) + '">' +
                ic('forge', 14) + '<span class="truncate">' + esc(r.name) + '</span>' +
                (r.visibility === 'private' ? '<span class="label outline">' + esc(r.visibility) + '</span>' : '') +
                '</a></li>';
            }).join('') + '</ul>'
          : '<p class="muted fs-13">No forges yet.</p>') +
      '</div>' +

      '<div class="drawer-section">' +
        '<div class="drawer-section-head">Theme</div>' +
        '<div class="drawer-themes">' +
          ['dark', 'light', 'hc'].map(function (t) {
            return '<button class="drawer-theme' + (getTheme() === t ? ' active' : '') + '" data-theme="' + t + '">' +
              ic(t === 'dark' ? 'moon' : t === 'light' ? 'sun' : 'contrast', 14) +
              ' ' + (t === 'hc' ? 'High contrast' : t.charAt(0).toUpperCase() + t.slice(1)) + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="drawer-foot">' +
      '<button class="btn danger" id="drawerSignOut">' + ic('signOut', 14) + ' Sign out</button>' +
    '</div>';
}

/**
 * A drawer navigation row. Rendered as a real `href="#/…"` link (not an
 * `onclick`-only anchor) so it is keyboard-focusable, middle-clickable and
 * announced as a link. The hash router turns the click into a render, and
 * openMenu() wires every drawer `a` to close the drawer.
 */
function drawerLink(iconName, label, path) {
  var href = '#' + (path.charAt(0) === '/' ? path : '/' + path);
  var active = isCurrentPath(path) ? ' class="active"' : '';
  return '<a href="' + href + '"' + active + '>' + ic(iconName, 16) + '<span>' + esc(label) + '</span></a>';
}

/** True when `path` (optionally with a query) is the route currently shown. */
function isCurrentPath(path) {
  var cur = String(location.hash || '').replace(/^#/, '') || '/';
  var target = path.charAt(0) === '/' ? path : '/' + path;
  if (target.indexOf('?') !== -1) return cur === target;
  return cur.split('?')[0] === target;
}
