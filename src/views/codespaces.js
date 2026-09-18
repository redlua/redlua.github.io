/**
 * RedGet — codespaces: list, create, and a detail page with a terminal that
 * runs against the forge's real files.
 *
 * The terminal is a shell simulator: `ls`, `cat`, `wc`, `find`, `grep`,
 * `rgt status|log|branch`|`rgt status|log|branch`|`rgt status|log|branch`, `node --version` and a few others read the data you
 * actually stored. Commands that cannot be answered honestly say so.
 */

import { DB, ME, saveDB } from '../state.js';
import { ic } from '../icons.js';
import { avatarHTML } from '../core/avatars.js';
import { getUserByUsername, forgeById } from '../core/social.js';
import { visibleForges, findForge } from '../core/forges.js';
import { orgsFor } from '../core/orgs.js';
import {
  CODESPACE_TEMPLATES, CODESPACE_REGIONS, codespacesFor, codespaceById, createCodespace,
  startCodespace, stopCodespace, deleteCodespace, updateCodespace, runCommand,
} from '../core/codespaces.js';
import { render } from '../core/render.js';
import { toast } from '../core/toast.js';
import { esc, timeAgo, formatDate, formatDuration } from '../core/util.js';

/* ===================================================================== *
   List
\* ===================================================================== */

export function viewCodespaces() {
  if (!ME) return signedOut();
  var list = codespacesFor(ME.username);
  var forges = visibleForges().filter(function (e) { return e.user.username === ME.username || e.org; });

  return '<div class="container page">' +
    '<div class="page-head">' +
      '<div><h1 class="page-title">' + ic('codespaces', 22) + ' Codespaces</h1>' +
        '<p class="muted fs-13">' + list.length + ' environment' + (list.length === 1 ? '' : 's') +
        ' · each one is a terminal pointed at a forge you own</p></div>' +
      '<div class="page-head-actions"><a class="btn primary" href="#/codespaces/new">' + ic('plus', 14) + ' New codespace</a></div>' +
    '</div>' +

    (list.length
      ? '<div class="codespace-grid">' + list.map(codespaceCard).join('') + '</div>'
      : '<div class="empty"><div class="empty-icon">' + ic('codespaces', 32) + '</div>' +
        '<h3>No codespaces</h3>' +
        '<p>' + (forges.length
          ? 'Create one to open a terminal against any of your ' + forges.length + ' forges.'
          : 'Create a forge first — a codespace needs one to point at.') + '</p>' +
        (forges.length
          ? '<a class="btn primary" href="#/codespaces/new">' + ic('plus', 14) + ' Create a codespace</a>'
          : '<a class="btn primary" href="#/new">' + ic('plus', 14) + ' Create a forge</a>') + '</div>') +

    '<div class="card mt-6">' +
      '<h3 class="card-title">How a codespace works here</h3>' +
      '<ul class="doc-list">' +
        '<li>A codespace is a record of an environment for one forge and branch.</li>' +
        '<li>The terminal reads the files you stored — <span class="mono">ls</span>, <span class="mono">cat</span>, <span class="mono">grep</span> and <span class="mono">rgt status|log|branch</span> all answer from that data.</li>' +
        '<li>Nothing is uploaded or executed on a server: there is no server.</li>' +
        '<li>Stopped codespaces keep their history and can be started again.</li>' +
      '</ul>' +
    '</div>' +
  '</div>';
}

function codespaceCard(codespace) {
  var running = codespace.status === 'available';
  var forge = findForge(codespace.forgeOwner, codespace.forgeName);
  return '<div class="codespace-card card">' +
    '<div class="codespace-card-head">' +
      '<span class="codespace-icon">' + ic('codespaces', 20) + '</span>' +
      '<div><a class="fw-600 bright" href="#/codespaces/' + esc(codespace.id) + '">' + esc(codespace.name) + '</a>' +
        '<div class="muted fs-12">' + esc(codespace.forgeOwner) + '/' + esc(codespace.forgeName) + ' · <span class="mono">' + esc(codespace.branch) + '</span></div></div>' +
      '<span class="status-dot ' + esc(codespace.status) + '" title="' + esc(codespace.status) + '"></span>' +
    '</div>' +
    '<div class="codespace-card-meta">' +
      '<span>' + ic('deviceDesktop', 12) + ' ' + esc(codespace.cpu) + ' CPU · ' + esc(codespace.memory) + '</span>' +
      '<span>' + ic('globe', 12) + ' ' + esc(codespace.region) + '</span>' +
      '<span>' + ic('clock', 12) + ' used ' + timeAgo(codespace.lastUsed) + '</span>' +
    '</div>' +
    '<div class="codespace-card-actions">' +
      (running
        ? '<a class="btn sm primary" href="#/codespaces/' + esc(codespace.id) + '">' + ic('terminal', 14) + ' Open terminal</a>' +
          '<button class="btn sm stopCodespaceBtn" type="button" data-id="' + esc(codespace.id) + '">' + ic('stop', 14) + ' Stop</button>'
        : '<button class="btn sm primary startCodespaceBtn" type="button" data-id="' + esc(codespace.id) + '">' + ic('play', 14) + ' Start</button>' +
          '<a class="btn sm" href="#/codespaces/' + esc(codespace.id) + '">' + ic('gear', 14) + ' Details</a>') +
      '<button class="btn sm danger deleteCodespaceBtn" type="button" data-id="' + esc(codespace.id) + '">' + ic('trash', 14) + '</button>' +
    '</div>' +
  '</div>';
}

/* ===================================================================== *
   New
\* ===================================================================== */

export function viewNewCodespace() {
  if (!ME) return signedOut();
  var query = hashQuery();
  var entries = visibleForges().filter(function (e) {
    return e.user.username === ME.username || e.org || (ME.forges || []).indexOf(e.forge) !== -1;
  });

  if (!entries.length) {
    return '<div class="container page"><div class="empty"><div class="empty-icon">' + ic('forge', 32) + '</div>' +
      '<h3>No forges to open</h3><p>A codespace points at a forge, so create one first.</p>' +
      '<a class="btn primary" href="#/new">' + ic('plus', 14) + ' Create a forge</a></div></div>';
  }

  return '<div class="container page narrow">' +
    '<div class="page-head"><div><h1 class="page-title">Create a codespace</h1>' +
      '<p class="muted fs-13">Pick a forge, a branch and a template. The environment starts immediately.</p></div></div>' +
    '<div class="card">' +
      '<div class="form-group"><label class="form-label" for="csForge">Forge</label>' +
        '<select class="input" id="csForge">' + entries.map(function (e) {
          var key = e.user.username + '/' + e.forge.name;
          return '<option value="' + esc(key) + '"' + (query.forge === key ? ' selected' : '') + '>' + esc(key) + '</option>';
        }).join('') + '</select></div>' +
      '<div class="form-group"><label class="form-label" for="csBranch">Branch</label>' +
        '<select class="input" id="csBranch"><option>Loading…</option></select></div>' +
      '<div class="form-group"><label class="form-label" for="csName">Display name <span class="muted fs-12">(optional)</span></label>' +
        '<input type="text" class="input" id="csName" placeholder="my-project-node"></div>' +
      '<div class="form-group"><label class="form-label">Dev container template</label>' +
        '<div class="template-picker">' + CODESPACE_TEMPLATES.map(function (t, i) {
          return '<label class="template-card' + (i === 0 ? ' on' : '') + '">' +
            '<input type="radio" name="csTemplate" value="' + esc(t.id) + '"' + (i === 0 ? ' checked' : '') + '>' +
            '<span><b>' + esc(t.label) + '</b><span class="muted fs-12">' + esc(t.detail) + '</span>' +
            '<span class="muted fs-11">' + t.cpu + ' CPU · ' + esc(t.memory) + '</span></span></label>';
        }).join('') + '</div></div>' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="csIdle">Idle timeout</label>' +
          '<select class="input" id="csIdle">' + [15, 30, 60, 120].map(function (m) {
            return '<option value="' + m + '"' + (m === 30 ? ' selected' : '') + '>' + m + ' minutes</option>';
          }).join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="csRegion">Region</label>' +
          '<select class="input" id="csRegion">' + CODESPACE_REGIONS.map(function (r) {
            return '<option value="' + esc(r) + '">' + esc(r) + '</option>';
          }).join('') + '</select></div>' +
      '</div>' +
      '<div class="callout">' + ic('info', 14) + ' A codespace costs nothing here and never leaves this browser.</div>' +
      '<div class="form-error" id="csErr"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button class="btn primary" id="createCodespaceBtn" type="button">' + ic('codespaces', 14) + ' Create codespace</button>' +
        '<a class="btn" href="#/codespaces">Cancel</a></div>' +
    '</div>' +
  '</div>';
}

/* ===================================================================== *
   Detail: terminal + history
\* ===================================================================== */

export function viewCodespaceDetail(id) {
  if (!ME) return signedOut();
  var codespace = codespaceById(id);
  if (!codespace || codespace.owner !== ME.username) {
    return '<div class="container page"><div class="empty"><div class="empty-icon">' + ic('codespaces', 32) + '</div>' +
      '<h3>Codespace not found</h3><p>No codespace with that id belongs to your account.</p>' +
      '<a class="btn" href="#/codespaces">All codespaces</a></div></div>';
  }
  var found = findForge(codespace.forgeOwner, codespace.forgeName);
  var forge = found ? found.forge : null;
  var running = codespace.status === 'available';
  var uptime = running ? Date.now() - codespace.lastUsed : 0;

  return '<div class="container page">' +
    '<div class="actions-head">' +
      '<div class="actions-head-left">' +
        '<a class="btn sm" href="#/codespaces">' + ic('chevronLeft', 14) + ' Codespaces</a>' +
        '<span class="actions-head-title">' + esc(codespace.name) + '</span>' +
        '<span class="actions-head-meta">' +
          '<span class="status-dot ' + esc(codespace.status) + '"></span> ' + esc(codespace.status) + ' · ' +
          (forge ? '<a href="#/' + esc(codespace.forgeOwner) + '/' + esc(codespace.forgeName) + '">' + esc(codespace.forgeOwner) + '/' + esc(codespace.forgeName) + '</a>' : esc(codespace.forgeOwner) + '/' + esc(codespace.forgeName)) +
          ' · <span class="mono">' + esc(codespace.branch) + '</span> · ' + esc(codespace.cpu) + ' CPU · ' + esc(codespace.memory) +
          (running ? ' · up ' + formatDuration(uptime) : '') + '</span>' +
      '</div>' +
      '<div class="actions-head-right">' +
        (running
          ? '<button class="btn sm stopCodespaceBtn" type="button" data-id="' + esc(codespace.id) + '">' + ic('stop', 14) + ' Stop</button>'
          : '<button class="btn sm primary startCodespaceBtn" type="button" data-id="' + esc(codespace.id) + '">' + ic('play', 14) + ' Start</button>') +
        '<button class="btn sm danger deleteCodespaceBtn" type="button" data-id="' + esc(codespace.id) + '">' + ic('trash', 14) + ' Delete</button>' +
      '</div>' +
    '</div>' +

    '<div class="terminal-card' + (running ? '' : ' stopped') + '">' +
      '<div class="terminal-head">' +
        '<span class="terminal-dot red"></span><span class="terminal-dot yellow"></span><span class="terminal-dot green"></span>' +
        '<span class="terminal-title mono">' + esc(codespace.owner) + '@' + esc(codespace.name) + ': /home/codespace/' + esc(codespace.forgeName) + '</span>' +
        '<button class="btn xs terminalClearBtn" type="button">' + ic('trash', 11) + ' Clear</button>' +
      '</div>' +
      '<div class="terminal-body" id="terminalBody">' +
        '<div class="terminal-line system">RedGet codespace · template ' + esc(codespace.template) + ' · region ' + esc(codespace.region) + '</div>' +
        '<div class="terminal-line system">Type <span class="mono">help</span> for the commands this environment understands. Output comes from the files in ' + esc(codespace.forgeOwner) + '/' + esc(codespace.forgeName) + '.</div>' +
        (running ? '' : '<div class="terminal-line system">This codespace is stopped — start it to run commands.</div>') +
      '</div>' +
      '<form class="terminal-input" id="terminalForm" autocomplete="off">' +
        '<span class="terminal-prompt mono">' + esc(codespace.owner) + '@' + esc(codespace.name) + ':~$</span>' +
        '<input type="text" id="terminalInput" class="terminal-field mono" placeholder="' + (running ? 'ls' : 'codespace stopped') + '" aria-label="Terminal command"' + (running ? '' : ' disabled') + '>' +
      '</form>' +
    '</div>' +

    '<div class="grid-2col mt-4">' +
      '<div>' +
        (forge ? '<div class="card"><h3 class="card-title">Working tree · ' + (forge.files || []).length + ' files</h3>' +
          '<div class="card-tight">' + (forge.files || []).slice(0, 12).map(function (f) {
            return '<div class="list-item"><div class="list-icon">' + ic('file', 14) + '</div>' +
              '<div class="list-body"><div class="list-title mono">' + esc(f.name) + '</div>' +
              '<div class="list-meta">' + esc(f.commitMsg || '') + ' · ' + timeAgo(f.commitTime || forge.updated) + '</div></div>' +
              '<div class="list-side"><a class="btn xs" href="#/' + esc(codespace.forgeOwner) + '/' + esc(codespace.forgeName) + '/blob/' + esc(codespace.branch) + '/' + esc(f.name) + '">Open</a></div></div>';
          }).join('') + '</div></div>'
          : '<div class="card"><p class="muted fs-13">The forge this codespace pointed at no longer exists.</p></div>') +
      '</div>' +
      '<div class="sticky-side">' +
        '<div class="card"><h3 class="side-title">Settings</h3>' +
          '<div class="form-group"><label class="form-label" for="csEditIdle">Idle timeout</label>' +
            '<select class="input" id="csEditIdle">' + [15, 30, 60, 120].map(function (m) {
              return '<option value="' + m + '"' + (m === codespace.idleMinutes ? ' selected' : '') + '>' + m + ' minutes</option>';
            }).join('') + '</select></div>' +
          '<div class="form-group"><label class="form-label" for="csEditName">Display name</label>' +
            '<input type="text" class="input" id="csEditName" value="' + esc(codespace.name) + '"></div>' +
          '<button class="btn primary block saveCodespaceBtn" type="button" data-id="' + esc(codespace.id) + '">' + ic('check', 14) + ' Save</button>' +
        '</div>' +
        '<div class="card mt-4"><h3 class="side-title">History</h3>' +
          '<div class="side-rows">' + (codespace.history || []).slice().reverse().map(function (entry) {
            return '<div class="side-row"><b class="fs-13">' + esc(entry.event) + '</b>' +
              '<div class="muted fs-12">' + formatDate(entry.at) + ' · ' + timeAgo(entry.at) + '</div></div>';
          }).join('') + '</div></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function signedOut() {
  return '<div class="container page"><div class="empty"><div class="empty-icon">' + ic('lock', 32) + '</div>' +
    '<h3>Sign in required</h3><p>Codespaces belong to an account.</p>' +
    '<button class="btn primary" id="openAuthBtn" type="button">' + ic('signIn', 14) + ' Sign in with your key</button></div></div>';
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
