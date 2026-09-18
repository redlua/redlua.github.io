/**
 * RedGet — application boot.
 *
 * Order matters:
 *   1. restore the session and the theme,
 *   2. expose the globals that inline `onclick` attributes rely on,
 *   3. install the delegated event bindings, the shortcut map and the palette,
 *   4. render once, then re-render on every hash change.
 *
 * Nothing in the app talks to a network: every byte of data comes from
 * `localStorage` on this machine.
 */

import { ME, SESSION_KEY, restoreSession } from './state.js';
import { loadTheme } from './core/theme.js';
import { initMenu } from './core/menu.js';
import { render, parseRoute, navigate } from './core/render.js';
import { installBindings } from './core/bind.js';
import { installGlobals } from './core/globals.js';
import { installShortcuts } from './core/shortcuts.js';
import { installPalette } from './core/palette.js';

/* Set once boot() completes — the smoke test in tools/ waits on this. */
export var BOOTED = false;

function boot() {
  // state.js cannot read localStorage at import time in every environment, so
  // the session is restored here — before the first render decides whether to
  // show the landing page or the dashboard.
  restoreSession();
  loadTheme();
  if (SESSION_KEY) { try { localStorage.setItem('redget:last-session', SESSION_KEY); } catch (e) {} }

  installGlobals();
  initMenu();
  installBindings();
  installPalette();
  installShortcuts();

  window.addEventListener('hashchange', render);

  if (!location.hash || location.hash === '#') navigate('#/');
  else render();

  BOOTED = true;
  window.redgetBooted = true;
  console.info('%cRedGet%c ready' + (ME ? ' — signed in as ' + ME.username : ' — signed out'),
    'background:#e5534b;color:#fff;padding:2px 6px;border-radius:3px;font-weight:600', 'color:#8b949e');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
