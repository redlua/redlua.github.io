/**
 * RedGet — window bindings.
 *
 * The markup inherited from the original single-file app calls a handful of
 * helpers from inline `onclick` attributes, which can only resolve against the
 * global scope. This module publishes exactly those functions — nothing else
 * is global, and every view that can avoids inline handlers in favour of the
 * delegated listeners in core/bind.js.
 *
 * It also owns the shared dialogs that several views trigger by name:
 * the shortcut reference, the branch switcher and the file finder.
 */

import { ME, DB, saveDB } from '../state.js';
import { ic } from '../icons.js';
import { $, $$ } from './dom.js';
import { render } from './render.js';
import { navigate, parseRoute } from './router.js';
import { setTheme, getTheme } from './theme.js';
import { openMenu, closeMenu } from './menu.js';
import { openPalette, closePalette } from './palette.js';
import { openModal, closeModal, modalOpen } from './modal.js';
import { toast, copyText, downloadText } from './toast.js';
import { showAuth } from './auth.js';
import { signOut, closeAllDropdowns } from './header.js';
import { openSshKeyModal } from '../views/settings.js';
import { SHORTCUTS } from './shortcuts.js';
import { findForge, visibleForges } from './forges.js';
import { commitsFor } from './model.js';
import { esc } from './util.js';

export function installGlobals() {
  window.render = render;
  window.navigate = navigate;
  window.setTheme = setTheme;
  window.getTheme = getTheme;
  window.showAuth = showAuth;
  window.howAuth = function () { navigate('/docs/accounts-and-keys'); };
  window.signOut = signOut;
  window.closeModal = closeModal;
  window.openModal = openModal;
  window.closeAllDropdowns = closeAllDropdowns;
  window.toast = toast;
  window.copyText = copyText;
  window.downloadText = downloadText;
  window.openMenu = openMenu;
  window.closeMenu = closeMenu;
  window.openPalette = openPalette;
  window.closePalette = closePalette;
  window.openSshKeyModal = openSshKeyModal;
  window.openShortcutHelpModal = openShortcutHelpModal;
  window.openBranchModal = openBranchModal;
  window.openGoToFileModal = openGoToFileModal;
  window.openCodeModal = openCodeModal;
}

/* ------------------------------------------------------- shortcut dialog */

export function openShortcutHelpModal() {
  openModal({
    title: 'Keyboard shortcuts',
    icon: 'keyboard',
    wide: true,
    body: '<p class="muted fs-13 mb-4">Shortcuts are inactive while you are typing in a field. Full reference: <a href="#/docs/shortcuts">/docs/shortcuts</a>.</p>' +
      '<div class="shortcut-grid">' + SHORTCUTS.map(function (s) {
        return '<div class="shortcut-row"><kbd>' + esc(s.keys) + '</kbd><span>' + esc(s.label) + '</span></div>';
      }).join('') + '</div>',
    actions: [{ label: 'Close', primary: true }],
  });
}

/* --------------------------------------------------------- branch dialog */

/**
 * Branch and tag switcher for a forge page. Called from the branch
 * button; falls back to a toast when there is no forge in the route.
 */
export function openBranchModal() {
  var forgeContext = currentForge();
  if (!forgeContext) { toast('Open a forge first', 'info'); return; }
  var user = forgeContext.user;
  var forge = forgeContext.forge;
  var base = '/' + user.username + '/' + forge.name;
  var branches = forge.branches || [forge.defaultBranch];
  var tags = forge.tags || [];

  openModal({
    title: 'Switch branches or tags',
    icon: 'redBranch',
    body: '<div class="form-group"><input type="search" class="input" id="branchFilter" data-autofocus placeholder="Find a branch or tag…" aria-label="Find a branch or tag"></div>' +
      '<div class="branch-list" id="branchList">' +
        '<div class="branch-group">Branches</div>' +
        branches.map(function (b) {
          return '<a class="branch-row" href="#' + base + '/tree/' + encodeURIComponent(b) + '">' +
            ic('redBranch', 14) + ' <span class="mono">' + esc(b) + '</span>' +
            (b === forge.defaultBranch ? '<span class="label blue">default</span>' : '') + '</a>';
        }).join('') +
        (tags.length ? '<div class="branch-group">Tags</div>' + tags.map(function (t) {
          return '<a class="branch-row" href="#' + base + '/tags">' + ic('tag', 14) + ' <span class="mono">' + esc(t) + '</span></a>';
        }).join('') : '') +
      '</div>',
    actions: [{ label: 'Close' }],
    onMount: function (root) {
      var filter = root.querySelector('#branchFilter');
      if (!filter) return;
      filter.addEventListener('input', function () {
        var q = filter.value.toLowerCase();
        $$('#branchList .branch-row', root).forEach(function (row) {
          row.hidden = q && row.textContent.toLowerCase().indexOf(q) === -1;
        });
      });
    },
  });
}

/* ------------------------------------------------------ go-to-file modal */

export function openGoToFileModal() {
  var forgeContext = currentForge();
  if (!forgeContext) { toast('Open a forge first', 'info'); return; }
  var user = forgeContext.user;
  var forge = forgeContext.forge;
  var branch = currentBranch(forge);
  var base = '/' + user.username + '/' + forge.name;
  var files = (forge.files || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); });

  openModal({
    title: 'Go to file',
    icon: 'search',
    body: '<div class="form-group"><input type="search" class="input" id="fileFilter" data-autofocus placeholder="Search ' + files.length + ' files…" aria-label="Search files"></div>' +
      '<div class="branch-list" id="fileList">' +
      (files.length ? files.map(function (f) {
        return '<a class="branch-row" href="#' + base + '/blob/' + encodeURIComponent(branch) + '/' + esc(f.name) + '">' +
          ic('file', 14) + ' <span class="mono">' + esc(f.name) + '</span></a>';
      }).join('') : '<div class="muted fs-13" style="padding:12px">This forge has no files yet.</div>') +
      '</div>',
    actions: [{ label: 'Close' }],
    onMount: function (root) {
      var filter = root.querySelector('#fileFilter');
      if (!filter) return;
      filter.addEventListener('input', function () {
        var q = filter.value.toLowerCase();
        $$('#fileList .branch-row', root).forEach(function (row) {
          row.hidden = q && row.textContent.toLowerCase().indexOf(q) === -1;
        });
      });
    },
  });
}

/* ------------------------------------------------------------ code modal */

export function openCodeModal() {
  var forgeContext = currentForge();
  if (!forgeContext) { toast('Open a forge first', 'info'); return; }
  var user = forgeContext.user;
  var forge = forgeContext.forge;
  var branch = currentBranch(forge);
  var address = '/forges/' + user.username + '/' + forge.name;
  var command = 'red copy ' + user.username + '/' + forge.name;

  openModal({
    title: 'Copy, download or open',
    icon: 'code',
    body: '<div class="copy-block">' +
        '<div class="muted fs-12 mb-1">Copy with the RedGet CLI</div>' +
        '<div class="copy-row"><code class="mono">' + esc(command) + '</code>' +
          '<button class="btn xs icon-only copyAddressBtn" type="button" data-text="' + esc(command) + '" aria-label="Copy the command">' + ic('copy', 12) + '</button></div>' +
      '</div>' +
      '<div class="copy-block">' +
        '<div class="muted fs-12 mb-1">Forge address</div>' +
        '<div class="copy-row"><code class="mono">' + esc(address) + '</code>' +
          '<button class="btn xs icon-only copyAddressBtn" type="button" data-text="' + esc(address) + '" aria-label="Copy the address">' + ic('copy', 12) + '</button></div>' +
      '</div>' +
      '<div class="copy-block">' +
        '<div class="muted fs-12 mb-1">Current branch</div>' +
        '<div class="copy-row"><code class="mono">' + esc(branch) + '</code>' +
          '<span class="muted fs-12">' + commitsFor(forge, branch).length + ' commits · ' + (forge.files || []).length + ' files</span></div>' +
      '</div>' +
      '<div class="copy-block">' +
        '<div class="muted fs-12 mb-1">Working copies</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<a class="btn sm" href="#/codespaces/new?forge=' + esc(user.username + '/' + forge.name) + '">' + ic('codespaces', 14) + ' Open in a codespace</a>' +
          '<button class="btn sm downloadForgeBtn" type="button">' + ic('download', 14) + ' Download files as JSON</button>' +
        '</div>' +
      '</div>',
    actions: [{ label: 'Close' }],
    onMount: function (root) {
      var dl = root.querySelector('.downloadForgeBtn');
      if (dl) {
        dl.addEventListener('click', function () {
          var payload = {
            forge: user.username + '/' + forge.name,
            branch: branch,
            exportedAt: new Date().toISOString(),
            files: (forge.files || []).map(function (f) {
              return { name: f.name, content: f.content, commitMsg: f.commitMsg, author: f.author, commitTime: f.commitTime };
            }),
          };
          downloadText(forge.name + '-' + branch + '.json', JSON.stringify(payload, null, 2), 'application/json');
        });
      }
    },
  });
}

/* ---------------------------------------------------------------- shared */

/** The forge behind the current hash route, or null. */
export function currentForge() {
  var route = parseRoute();
  if (route.parts.length < 2) return null;
  return findForge(route.parts[0], route.parts[1]);
}

/** The branch named in the current route, or the forge default. */
export function currentBranch(forge) {
  var route = parseRoute();
  var named = route.parts[3];
  if (named && (forge.branches || []).indexOf(decodeURIComponent(named)) !== -1) return decodeURIComponent(named);
  return forge.defaultBranch;
}
