/**
 * RedGet — global keyboard shortcuts.
 *
 * Bindings follow the table published in /src/config.js (SHORTCUTS) and shown by
 * the "?" dialog in /src/components/header.js.
 *
 * Rules:
 *   - Never hijack keys while a text field, a <dialog> or a contenteditable owns
 *     focus (except Escape and Ctrl/Cmd+Enter).
 *   - Two-key chords ("g d") expire after 1.2s.
 *   - Everything announces itself through the toast live region so the shortcut
 *     is discoverable and screen-reader friendly.
 */

import { navigate, currentPath } from './core/router.js';
import { getDb, getSession, getPrefs, setPref } from './core/store.js';
import { openCommandPalette, closeCommandPalette, isCommandPaletteOpen } from './components/commandPalette.js';
import { openShortcutsDialog } from './components/header.js';
import { closeTopDialog, isDialogOpen, toast } from './components/overlay.js';
import { cycleTheme } from './core/theme.js';
import { EVENTS, emit } from './core/bus.js';
import * as api from './core/api.js';

const CHORD_TIMEOUT = 1200;
let chord = null;
let chordTimer = null;
let installed = false;

function isTypingTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest('[contenteditable="true"], .composer-body, .md-editor'));
}

function currentRepo() {
  const match = /^\/([^/]+)\/([^/]+)/.exec(currentPath());
  if (!match) return null;
  const db = getDb();
  if (!db) return null;
  return db.repos.find((r) => r.ownerLogin.toLowerCase() === match[1].toLowerCase() && r.name.toLowerCase() === match[2].toLowerCase()) || null;
}

/** Handle a single (already normalised) key press. Returns true when consumed. */
function handleKey(event) {
  const key = event.key;
  const meta = event.metaKey || event.ctrlKey;

  // Escape: close the top-most overlay first, then blur.
  if (key === 'Escape') {
    if (isCommandPaletteOpen()) { closeCommandPalette(); return true; }
    if (isDialogOpen()) { closeTopDialog(); return true; }
    if (document.activeElement instanceof Element && document.activeElement !== document.body) {
      document.activeElement.blur();
      return true;
    }
    return false;
  }

  if (meta) {
    if ((key === 'k' || key === 'K') && !event.shiftKey) { event.preventDefault(); openCommandPalette(); return true; }
    if (key === 'Enter' && isTypingTarget(event.target)) {
      const form = event.target.closest('form,[data-composer]');
      if (form) {
        event.preventDefault();
        const submit = form.querySelector('[data-submit], button[type="submit"], .btn-primary');
        if (submit) submit.click();
        return true;
      }
    }
    return false;
  }

  if (isTypingTarget(event.target)) return false;
  if (event.altKey) return false;

  // Chord second key.
  if (chord === 'g') {
    chord = null;
    if (chordTimer) clearTimeout(chordTimer);
    return handleChord(key, event);
  }

  switch (key) {
    case 'g':
      chord = 'g';
      chordTimer = setTimeout(() => { chord = null; }, CHORD_TIMEOUT);
      return true;
    case 's':
    case '/': {
      event.preventDefault();
      openCommandPalette({ mode: 'search' });
      return true;
    }
    case '?':
      event.preventDefault();
      openShortcutsDialog();
      return true;
    case 't': {
      const repo = currentRepo();
      if (!repo) return false;
      event.preventDefault();
      import('./components/repoChrome.js').then((m) => m.openGoToFile(repo, repo.defaultBranch));
      return true;
    }
    case 'c': {
      const repo = currentRepo();
      if (!repo) return false;
      event.preventDefault();
      navigate(`/${repo.fullName}/issues/new/choose`);
      return true;
    }
    case 'Shift': return false;
    default: break;
  }

  if (key === 'y' || key === 'Y') {
    if (!/\/(files|commit|compare)/.test(currentPath())) return false;
    event.preventDefault();
    if (key === 'Y') {
      const next = getPrefs().diffView === 'split' ? 'unified' : 'split';
      setPref('diffView', next);
      toast(`${next === 'split' ? 'Split' : 'Unified'} diff view`);
    } else {
      const focused = document.activeElement && document.activeElement.closest
        ? document.activeElement.closest('.diff-file')
        : null;
      const target = focused || document.querySelector('.diff-file');
      if (!target) return false;
      target.classList.toggle('is-collapsed');
      const heading = target.querySelector('.diff-file-header .file-path');
      toast(`${target.classList.contains('is-collapsed') ? 'Collapsed' : 'Expanded'} ${heading ? heading.textContent : 'file'}`);
    }
    emit(EVENTS.routeChange, { path: currentPath(), force: true });
    return true;
  }

  if (key === 'w') {
    if (!/\/(files|commit|compare)/.test(currentPath())) return false;
    event.preventDefault();
    setPref('showWhitespace', !getPrefs().showWhitespace);
    toast(getPrefs().showWhitespace ? 'Showing whitespace changes' : 'Ignoring whitespace changes');
    emit(EVENTS.routeChange, { path: currentPath(), force: true });
    return true;
  }

  if (key === 'b') {
    const repo = currentRepo();
    if (!repo) return false;
    const match = /\/blob\/([^/]+)\/(.+)$/.exec(currentPath());
    if (match) {
      event.preventDefault();
      navigate(`/${repo.fullName}/blame/${match[1]}/${match[2]}`);
      return true;
    }
    return false;
  }

  if (key === 'e') {
    const composer = document.querySelector('.composer-body textarea, .comment-form textarea');
    if (composer) { event.preventDefault(); composer.focus(); return true; }
    return false;
  }

  if (key === 'r') {
    const selection = window.getSelection ? String(window.getSelection() || '') : '';
    if (!selection.trim()) return false;
    const composer = document.querySelector('.composer-body textarea, .comment-form textarea');
    if (!composer) return false;
    event.preventDefault();
    import('./components/markdown.js').then(({ quoteSelection }) => {
      composer.value = `${composer.value ? `${composer.value}\n\n` : ''}${quoteSelection(selection)}`;
      composer.focus();
      composer.setSelectionRange(composer.value.length, composer.value.length);
    });
    return true;
  }

  if (key === 'l' || key === 'a' || key === 'm') {
    const sidebar = document.querySelector('[data-sidebar-control]');
    if (!sidebar) return false;
    const target = sidebar.querySelector(`[data-sidebar-control="${key}"]`);
    if (!target) return false;
    event.preventDefault();
    target.click();
    return true;
  }

  if (key === 'p') {
    const composer = document.querySelector('.composer-tabs');
    if (!composer) return false;
    event.preventDefault();
    const preview = Array.from(composer.querySelectorAll('.tab')).find((tab) => /preview/i.test(tab.textContent || ''));
    if (preview) preview.click();
    return true;
  }

  return false;
}

function handleChord(key, event) {
  const session = getSession();
  const login = session.login || 'octored';
  const repo = currentRepo();
  const map = {
    h: () => navigate('/dashboard'),
    d: () => navigate('/dashboard'),
    n: () => navigate('/notifications'),
    i: () => (repo ? navigate(`/${repo.fullName}/issues`) : navigate('/issues')),
    p: () => (repo ? navigate(`/${repo.fullName}/pulls`) : navigate('/pulls')),
    e: () => navigate('/explore'),
    s: () => navigate('/settings'),
    c: () => (repo ? navigate(`/${repo.fullName}`) : navigate('/codespaces')),
    a: () => (repo ? navigate(`/${repo.fullName}/actions`) : navigate('/dashboard')),
    w: () => (repo ? navigate(`/${repo.fullName}/wiki`) : navigate('/dashboard')),
    o: () => (repo ? navigate(`/${repo.fullName}`) : navigate('/dashboard')),
    b: () => (repo ? navigate(`/${repo.fullName}/branches`) : navigate('/dashboard')),
    g: () => navigate(`/${login}?tab=repositories`),
    t: () => navigate('/trending'),
    m: () => navigate('/marketplace'),
    r: () => navigate('/orgs/crimson-collective'),
    Shift: null,
  };
  const action = map[key] || map[key.toLowerCase()];
  if (!action) return false;
  event.preventDefault();
  action();
  return true;
}

/** Shift+? focuses the branch selector when one is present. */
function handleShiftQuestion(event) {
  if (event.key !== '?') return false;
  const selector = document.querySelector('.branch-selector .branch-btn');
  if (!selector) return false;
  event.preventDefault();
  selector.focus();
  selector.click();
  return true;
}

export function registerShortcuts() {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;

  const onKeydown = (event) => {
    if (event.defaultPrevented) return;
    if (handleShiftQuestion(event)) return;
    if (handleKey(event)) return;
  };
  window.addEventListener('keydown', onKeydown);

  // Theme cycling is intentionally not bound to a bare key (too easy to hit);
  // it lives in the command palette and the avatar menu.
  void cycleTheme;
  void api;

  return () => {
    window.removeEventListener('keydown', onKeydown);
    installed = false;
  };
}

export default { registerShortcuts, handleKey };
