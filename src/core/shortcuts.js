/**
 * RedGet — keyboard shortcuts.
 *
 * `installShortcuts()` is called once at boot. Shortcuts are ignored while the
 * user is typing in a field, while a modal is open (except Escape, which the
 * modal layer owns), and while the command palette is open.
 */

import { ME } from '../state.js';
import { $ } from './dom.js';
import { navigate, currentPath } from './router.js';
import { modalOpen } from './modal.js';
import { closeMenu } from './menu.js';
import { closePalette, paletteOpen, openPalette } from './palette.js';

/** The canonical list, rendered on /docs/shortcuts and in the `?` dialog. */
export var SHORTCUTS = [
  { keys: '?', label: 'Show this help', description: 'Opens the shortcut reference from anywhere' },
  { keys: 'g then d', label: 'Go to dashboard', description: 'Your activity, forges and notifications' },
  { keys: 'g then p', label: 'Go to your profile', description: 'Signed-in account only' },
  { keys: 'g then e', label: 'Go to explore', description: 'Search forges, people and topics' },
  { keys: 'g then t', label: 'Go to trending', description: 'Ranked by real recent activity' },
  { keys: 'g then i', label: 'Go to issues', description: 'Every issue you can see' },
  { keys: 'g then r', label: 'Go to pull requests', description: 'Every pull request you can see' },
  { keys: 'g then n', label: 'Go to notifications', description: 'Your inbox' },
  { keys: 'g then s', label: 'Go to settings', description: 'Account settings' },
  { keys: 'g then o', label: 'Go to organizations', description: 'Organizations you belong to' },
  { keys: 'g then j', label: 'Go to projects', description: 'Boards, tables and roadmaps' },
  { keys: 'g then g', label: 'Go to gists', description: 'Your snippets' },
  { keys: 'g then c', label: 'Go to codespaces', description: 'Your environments' },
  { keys: 'g then b', label: 'Go back', description: 'Previous entry in the history' },
  { keys: 'g then f', label: 'Go forward', description: 'Next entry in the history' },
  { keys: 'n', label: 'New forge', description: 'Opens the create form' },
  { keys: '/', label: 'Focus search', description: 'Jump to the header search field' },
  { keys: 'Ctrl/Cmd + k', label: 'Command palette', description: 'Fuzzy jump to any page or forge' },
  { keys: 't', label: 'Go to file', description: 'On a forge page, opens the file finder' },
  { keys: 'Escape', label: 'Close overlay', description: 'Closes a dialog, the drawer or the palette' },
];

var pendingG = false;
var pendingTimer = null;

/** Attach the global listener. Safe to call more than once. */
export function installShortcuts() {
  if (installShortcuts._done) return;
  installShortcuts._done = true;

  document.addEventListener('keydown', function (e) {
    if (isTyping(e.target)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) {
      if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
        e.preventDefault();
        openPalette();
      }
      return;
    }
    if (e.key === 'Escape') { closeOverlays(); return; }
    if (modalOpen() || paletteOpen()) return;
    if (e.key === '?') { e.preventDefault(); showShortcutHelp(); return; }

    if (pendingG) {
      pendingG = false;
      clearTimeout(pendingTimer);
      var target = G_TARGETS[String(e.key).toLowerCase()];
      if (target) { e.preventDefault(); go(target()); return; }
      return;
    }

    var key = String(e.key).toLowerCase();
    if (key === 'g') {
      pendingG = true;
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(function () { pendingG = false; }, 1200);
      return;
    }

    if (key === 'n') { e.preventDefault(); go('/new'); return; }
    if (key === '/') { e.preventDefault(); focusSearch(); return; }
    if (key === 't') {
      var parts = currentPath().split('/').filter(Boolean);
      if (parts.length >= 2) {
        e.preventDefault();
        var btn = $('#goToFileBtn');
        if (btn) btn.click();
        else focusSearch();
      }
    }
  });
}

var G_TARGETS = {
  d: function () { return '/'; },
  p: function () { return ME ? '/' + ME.username : '/'; },
  e: function () { return '/explore'; },
  t: function () { return '/trending'; },
  i: function () { return '/issues'; },
  r: function () { return '/pulls'; },
  n: function () { return '/notifications'; },
  s: function () { return '/settings'; },
  o: function () { return '/organizations'; },
  j: function () { return '/projects'; },
  g: function () { return '/gists'; },
  c: function () { return '/codespaces'; },
  b: function () { return null; },
  f: function () { return null; },
};

function go(path) {
  if (path === null) return;
  navigate(path);
}

function isTyping(target) {
  if (!target) return false;
  var tag = String(target.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable === true;
}

/** Escape closes one layer at a time: palette, then drawer, then modal. */
function closeOverlays() {
  if (paletteOpen()) { closePalette(); return; }
  var drawer = $('#drawerOverlay');
  if (drawer && drawer.classList.contains('open')) { closeMenu(); return; }
}

function focusSearch() {
  var field = $('#headerSearch') || $('#searchInput') || $('input[type="search"]');
  if (field) { field.focus(); field.select(); }
  else navigate('/explore');
}

/** The `?` dialog: a real, navigable list rather than a screenshot of one. */
export function showShortcutHelp() {
  if (typeof window.openShortcutHelpModal === 'function') window.openShortcutHelpModal();
  else navigate('/docs/shortcuts');
}
