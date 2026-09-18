/**
 * RedGet — forge creation and file import.
 *
 * Two routes share this module: `#/new` (create) and `#/new/import` (pick
 * files from this computer and commit them into a new forge). The owner
 * selector lists your own account plus every organization you administer, so a
 * forge can be created under an organization directly.
 */

import { ME } from '../state.js';
import { ic } from '../icons.js';
import { LANG_COLORS } from '../core/languages.js';
import { orgsFor, orgRole } from '../core/orgs.js';
import { esc } from '../core/util.js';

var LICENSES = ['MIT', 'Apache-2.0', 'GPL-3.0', 'BSD-3-Clause', 'MPL-2.0', 'Unlicense', 'Proprietary'];

export function viewNewForge(mode) {
  if (!ME) return signedOut();
  if (mode === 'import') return viewImportForge();
  return viewCreateForge();
}

function ownerOptions() {
  var orgs = orgsFor(ME.username).filter(function (o) {
    return ['owner', 'admin'].indexOf(orgRole(o, ME.username)) !== -1;
  });
  return '<option value="user:' + esc(ME.username) + '">' + esc(ME.username) + ' (you)</option>' +
    orgs.map(function (o) {
      return '<option value="org:' + esc(o.slug) + '">' + esc(o.name || o.slug) + ' (organization)</option>';
    }).join('');
}

function viewCreateForge() {
  var langs = Object.keys(LANG_COLORS);
  var query = hashQuery();
  var preselectOwner = query.owner || '';

  return '<div class="container page narrow">' +
    '<div class="page-head"><div><h1 class="page-title">Create a new forge</h1>' +
      '<p class="muted fs-13">A forge holds your files, their history, issues, pull requests, wiki pages and workflow runs.</p></div></div>' +

    '<div class="card">' +
      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="nrOwner">Owner</label>' +
          '<select class="input" id="nrOwner">' + ownerOptions() + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="nrName">Forge name <span class="required">*</span></label>' +
          '<input type="text" class="input" id="nrName" data-autofocus placeholder="my-project" maxlength="60" autocomplete="off" spellcheck="false">' +
          '<div class="hint">Letters, numbers, hyphens, underscores and dots.</div></div>' +
      '</div>' +

      '<div class="form-group"><label class="form-label" for="nrDesc">Description</label>' +
        '<input type="text" class="input" id="nrDesc" placeholder="A short description" maxlength="160" autocomplete="off"></div>' +

      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="nrVis">Visibility</label>' +
          '<select class="input" id="nrVis">' +
            '<option value="public">Public — visible to every account in this browser</option>' +
            '<option value="private">Private — visible only to you</option>' +
          '</select></div>' +
        '<div class="form-group"><label class="form-label" for="nrLang">Primary language</label>' +
          '<select class="input" id="nrLang">' + langs.map(function (l) {
            return '<option value="' + esc(l) + '"' + (l === 'JavaScript' ? ' selected' : '') + '>' + esc(l) + '</option>';
          }).join('') + '</select></div>' +
      '</div>' +

      '<div class="form-row">' +
        '<div class="form-group"><label class="form-label" for="nrTopics">Topics <span class="muted fs-12">(comma separated)</span></label>' +
          '<input type="text" class="input" id="nrTopics" placeholder="cli, typescript"></div>' +
        '<div class="form-group"><label class="form-label" for="nrLicense">Licence</label>' +
          '<select class="input" id="nrLicense"><option value="">No licence</option>' + LICENSES.map(function (l) {
            return '<option value="' + esc(l) + '">' + esc(l) + '</option>';
          }).join('') + '</select></div>' +
      '</div>' +

      '<div class="form-group"><label class="form-label">Initialise with</label>' +
        '<label class="checkbox"><input type="checkbox" id="nrReadme" checked> Add a README file</label>' +
        '<label class="checkbox"><input type="checkbox" id="nrRedignore"> Add a .redignore</label>' +
        '<label class="checkbox"><input type="checkbox" id="nrWorkflow"> Add a starter Actions workflow</label></div>' +

      '<div class="form-error" id="nrErr"></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px">' +
        '<button class="btn primary" id="nrGo" type="button">' + ic('forge', 14) + ' Create forge</button>' +
        '<a class="btn" href="#/">Cancel</a>' +
        '<a class="btn" href="#/new/import">' + ic('upload', 14) + ' Import files instead</a>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function viewImportForge() {
  return '<div class="container page narrow">' +
    '<div class="page-head"><div><h1 class="page-title">Import files into a new forge</h1>' +
      '<p class="muted fs-13">Files are read in this browser and stored locally — nothing is uploaded anywhere.</p></div></div>' +

    '<div class="card">' +
      '<div class="form-group"><label class="form-label" for="nrName">Forge name <span class="required">*</span></label>' +
        '<input type="text" class="input" id="nrName" data-autofocus placeholder="imported-project" maxlength="60" autocomplete="off" spellcheck="false"></div>' +
      '<div class="form-group"><label class="form-label" for="nrDesc">Description</label>' +
        '<input type="text" class="input" id="nrDesc" maxlength="160"></div>' +
      '<div class="form-group"><label class="form-label" for="nrVis">Visibility</label>' +
        '<select class="input" id="nrVis"><option value="public">Public</option><option value="private">Private</option></select></div>' +

      '<div class="form-group"><label class="form-label" for="importFiles">Files</label>' +
        '<div class="import-picker">' +
          '<input type="file" id="importFiles" multiple class="sr-only">' +
          '<button class="btn" id="importPick" type="button">' + ic('upload', 14) + ' Choose files</button>' +
          '<span class="muted fs-13" id="importCount">No files selected</span>' +
        '</div>' +
        '<div class="hint">Files larger than 2 MB are stored as a placeholder note. Binary files are read as text, so prefer source files.</div>' +
      '</div>' +

      '<div id="importList"></div>' +
      '<div class="form-error" id="importErr"></div>' +
      '<div style="display:flex;gap:8px;margin-top:16px">' +
        '<button class="btn primary" id="importGo" type="button">' + ic('forge', 14) + ' Create forge from files</button>' +
        '<a class="btn" href="#/new">Back to create</a>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function signedOut() {
  return '<div class="container page"><div class="empty"><div class="empty-icon">' + ic('lock', 32) + '</div>' +
    '<h3>Sign in required</h3><p>Forges belong to an account.</p>' +
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
