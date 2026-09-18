/**
 * RedGet — gists: list, detail (with revisions and comments) and the editor.
 */

import { ME, saveDB } from '../state.js';
import { ic } from '../icons.js';
import { avatarHTML } from '../core/avatars.js';
import { getUserByUsername } from '../core/social.js';
import { md } from '../core/markdown.js';
import { highlight } from '../core/highlight.js';
import {
  allGists, gistsFor, publicGists, gistById, createGist, updateGist, deleteGist,
  forkGist, toggleGistStar, commentOnGist, restoreRevision, languageFor,
} from '../core/gists.js';
import { render } from '../core/render.js';
import { toast } from '../core/toast.js';
import { esc, timeAgo, formatDate, formatBytes } from '../core/util.js';

/* ===================================================================== *
   List
\* ===================================================================== */

export function viewGists() {
  if (!ME) return signedOut();
  var query = hashQuery();
  var scope = query.scope || 'mine';
  var list = scope === 'all' ? publicGists() : gistsFor(ME.username);
  var q = (query.q || '').toLowerCase();
  if (q) {
    list = list.filter(function (g) {
      return (g.description + ' ' + g.files.map(function (f) { return f.name; }).join(' ')).toLowerCase().indexOf(q) !== -1;
    });
  }

  return '<div class="container page">' +
    '<div class="page-head">' +
      '<div><h1 class="page-title">' + ic('codeSquare', 22) + ' Gists</h1>' +
        '<p class="muted fs-13">' + list.length + ' gist' + (list.length === 1 ? '' : 's') + ' · snippets with real revision history</p></div>' +
      '<div class="page-head-actions">' +
        '<input type="search" class="input" id="gistSearch" placeholder="Search gists" value="' + esc(query.q || '') + '" aria-label="Search gists">' +
        '<a class="btn primary" href="#/gists/new">' + ic('plus', 14) + ' New gist</a></div>' +
    '</div>' +
    '<div class="filter-bar">' +
      [['mine', 'Yours'], ['all', 'All public']].map(function (f) {
        return '<a class="filter-chip' + (scope === f[0] ? ' on' : '') + '" href="#/gists' + (f[0] === 'mine' ? '' : '?scope=' + f[0]) + '">' + esc(f[1]) + '</a>';
      }).join('') +
    '</div>' +
    (list.length
      ? '<div class="card-tight">' + list.map(gistRow).join('') + '</div>'
      : '<div class="empty"><div class="empty-icon">' + ic('codeSquare', 32) + '</div>' +
        '<h3>' + (scope === 'mine' ? 'You have no gists' : 'No public gists') + '</h3>' +
        '<p>A gist is a single file (or a few) that you can revise, star, fork and comment on.</p>' +
        '<a class="btn primary" href="#/gists/new">' + ic('plus', 14) + ' Create a gist</a></div>') +
  '</div>';
}

function gistRow(gist) {
  var owner = getUserByUsername(gist.owner) || { username: gist.owner, avatar: null };
  var starred = ME && gist.stars.indexOf(ME.username) !== -1;
  return '<div class="list-item">' +
    '<div class="list-icon">' + avatarHTML(owner, 28) + '</div>' +
    '<div class="list-body">' +
      '<div class="list-title"><a href="#/gists/' + esc(gist.id) + '">' + esc(gist.description || gist.files[0].name) + '</a>' +
        (gist.isPublic ? '' : ' <span class="label">' + ic('lock', 10) + ' Secret</span>') +
        (gist.forkedFrom ? ' <span class="label">' + ic('fork', 10) + ' forked</span>' : '') + '</div>' +
      '<div class="list-meta">' + esc(gist.owner) + ' · ' + timeAgo(gist.updated) + ' · ' +
        gist.files.map(function (f) { return '<span class="mono">' + esc(f.name) + '</span>'; }).join(', ') + ' · ' +
        gist.revisions.length + ' revision' + (gist.revisions.length === 1 ? '' : 's') + '</div>' +
    '</div>' +
    '<div class="list-side">' +
      '<button class="btn xs' + (starred ? ' primary' : '') + ' gistStarBtn" type="button" data-id="' + esc(gist.id) + '">' +
        ic(starred ? 'starFill' : 'star', 12) + ' ' + gist.stars.length + '</button>' +
      '<span class="side-count">' + ic('comment', 13) + ' ' + gist.comments.length + '</span>' +
    '</div>' +
  '</div>';
}

/* ===================================================================== *
   New / edit
\* ===================================================================== */

export function viewNewGist() {
  if (!ME) return signedOut();
  return '<div class="container page">' +
    '<div class="page-head"><div><h1 class="page-title">Create a new gist</h1>' +
      '<p class="muted fs-13">Gists live in this browser and keep every revision you save.</p></div></div>' +
    '<div class="card">' +
      '<div class="form-group"><label class="form-label" for="gistDescription">Description</label>' +
        '<input type="text" class="input" id="gistDescription" data-autofocus placeholder="What is this snippet for?" maxlength="160"></div>' +
      '<div id="gistFiles">' + gistFileFields(1, '', '') + '</div>' +
      '<button class="btn sm" id="addGistFileBtn" type="button">' + ic('plus', 14) + ' Add file</button>' +
      '<div class="form-row mt-4">' +
        '<label class="radio"><input type="radio" name="gistVisibility" value="public" checked> Public — listed on your profile</label>' +
        '<label class="radio"><input type="radio" name="gistVisibility" value="secret"> Secret — only people with the link</label>' +
      '</div>' +
      '<div class="form-error" id="gistErr"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button class="btn primary" id="createGistBtn" type="button">' + ic('codeSquare', 14) + ' Create gist</button>' +
        '<a class="btn" href="#/gists">Cancel</a></div>' +
    '</div>' +
  '</div>';
}

function gistFileFields(index, name, content) {
  return '<div class="gist-file" data-index="' + index + '">' +
    '<div class="form-row">' +
      '<input type="text" class="input mono gistFileName" placeholder="snippet.js" value="' + esc(name) + '" aria-label="File name ' + (index + 1) + '">' +
      '<span class="muted fs-12 gistFileLang">' + esc(name ? languageFor(name) : 'Text') + '</span>' +
      (index > 0 ? '<button class="btn xs danger removeGistFileBtn" type="button" aria-label="Remove file">' + ic('trash', 11) + '</button>' : '') +
    '</div>' +
    '<textarea class="input mono editor-area gistFileContent" rows="12" spellcheck="false" placeholder="Paste or write your code" aria-label="File contents ' + (index + 1) + '">' + esc(content) + '</textarea>' +
  '</div>';
}

export function viewEditGist(gist) {
  return '<div class="card">' +
    '<h3 class="card-title">Edit gist</h3>' +
    '<div class="form-group"><label class="form-label" for="editGistDescription">Description</label>' +
      '<input type="text" class="input" id="editGistDescription" value="' + esc(gist.description) + '"></div>' +
    '<div class="form-group"><label class="form-label" for="editGistMessage">Revision message</label>' +
      '<input type="text" class="input" id="editGistMessage" placeholder="What changed?"></div>' +
    '<div id="gistFiles">' + gist.files.map(function (f, i) {
      return gistFileFields(i, f.name, f.content);
    }).join('') + '</div>' +
    '<button class="btn sm" id="addGistFileBtn" type="button">' + ic('plus', 14) + ' Add file</button>' +
    '<div class="form-row mt-4">' +
      '<label class="radio"><input type="radio" name="gistVisibility" value="public"' + (gist.isPublic ? ' checked' : '') + '> Public</label>' +
      '<label class="radio"><input type="radio" name="gistVisibility" value="secret"' + (!gist.isPublic ? ' checked' : '') + '> Secret</label>' +
    '</div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="btn primary saveGistBtn" type="button" data-id="' + esc(gist.id) + '">' + ic('check', 14) + ' Save revision</button>' +
      '<a class="btn" href="#/gists/' + esc(gist.id) + '">Cancel</a></div>' +
  '</div>';
}

/* ===================================================================== *
   Detail
\* ===================================================================== */

export function viewGistDetail(id) {
  if (!ME) return signedOut();
  var gist = gistById(id);
  if (!gist) {
    return '<div class="container page"><div class="empty"><div class="empty-icon">' + ic('codeSquare', 32) + '</div>' +
      '<h3>Gist not found</h3><p>No gist with that id exists in this browser.</p>' +
      '<a class="btn" href="#/gists">All gists</a></div></div>';
  }
  var owner = getUserByUsername(gist.owner) || { username: gist.owner, avatar: null };
  var isOwner = ME.username === gist.owner;
  var starred = gist.stars.indexOf(ME.username) !== -1;

  return '<div class="container page">' +
    '<div class="actions-head">' +
      '<div class="actions-head-left">' +
        '<a class="btn sm" href="#/gists">' + ic('chevronLeft', 14) + ' Gists</a>' +
        '<span class="actions-head-title">' + esc(gist.description || gist.files[0].name) + '</span>' +
        '<span class="actions-head-meta">' + avatarHTML(owner, 18) + ' <a href="#/' + esc(gist.owner) + '">' + esc(gist.owner) + '</a> · ' +
          'created ' + formatDate(gist.created) + ' · updated ' + timeAgo(gist.updated) + ' · ' +
          gist.revisions.length + ' revision' + (gist.revisions.length === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<div class="actions-head-right">' +
        '<button class="btn sm' + (starred ? ' primary' : '') + ' gistStarBtn" type="button" data-id="' + esc(gist.id) + '">' +
          ic(starred ? 'starFill' : 'star', 14) + ' ' + (starred ? 'Starred' : 'Star') + ' <span class="counter">' + gist.stars.length + '</span></button>' +
        '<button class="btn sm gistForkBtn" type="button" data-id="' + esc(gist.id) + '">' + ic('fork', 14) + ' Fork</button>' +
        (isOwner ? '<a class="btn sm' + (hashQuery().edit === '1' ? ' primary' : '') + '" href="#/gists/' + esc(gist.id) + '?edit=1">' + ic('pencil', 14) + ' Edit</a>' +
          '<button class="btn sm danger deleteGistBtn" type="button" data-id="' + esc(gist.id) + '">' + ic('trash', 14) + ' Delete</button>' : '') +
      '</div>' +
    '</div>' +

    (isOwner && hashQuery().edit === '1' ? viewEditGist(gist) : '') +

    gist.files.map(function (file) {
      var lines = String(file.content || '').split('\n');
      return '<div class="card mt-4 gist-card">' +
        '<div class="blob-head"><div class="path">' + fileIconFor(file.name) + ' ' + esc(file.name) +
          '<span class="blob-meta">' + esc(file.language) + ' · ' + lines.length + ' line' + (lines.length === 1 ? '' : 's') + ' · ' + formatBytes((file.content || '').length) + '</span></div>' +
          '<div class="actions"><button class="btn sm copyGistFileBtn" type="button" data-id="' + esc(gist.id) + '" data-name="' + esc(file.name) + '">' +
            ic('copy', 14) + ' Copy</button></div></div>' +
        '<div class="blob-body"><div class="blob-code">' + lines.map(function (l, i) {
          return '<div class="blob-line-num">' + (i + 1) + '</div><div class="blob-line">' + highlight(l, file.name) + '</div>';
        }).join('') + '</div></div>' +
        (/\.md$/i.test(file.name) ? '<details class="gist-render"><summary>Rendered</summary><div class="readme-body">' + md(file.content || '') + '</div></details>' : '') +
      '</div>';
    }).join('') +

    (gist.revisions.length ? '<div class="card mt-4">' +
      '<h3 class="card-title">Revisions (' + gist.revisions.length + ')</h3>' +
      '<div class="card-tight">' + gist.revisions.map(function (rev) {
        return '<div class="list-item"><div class="list-icon">' + ic('history', 14) + '</div>' +
          '<div class="list-body"><div class="list-title">' + esc(rev.message) + '</div>' +
          '<div class="list-meta">' + esc(rev.author) + ' · ' + formatDate(rev.at) + ' · ' + rev.files.length + ' file' + (rev.files.length === 1 ? '' : 's') + '</div></div>' +
          (isOwner ? '<div class="list-side"><button class="btn sm restoreRevisionBtn" type="button" data-id="' + esc(gist.id) + '" data-rev="' + esc(rev.id) + '">Restore</button>' +
            '<button class="btn sm revisionDiffBtn" type="button" data-id="' + esc(gist.id) + '" data-rev="' + esc(rev.id) + '">View files</button></div>' : '') +
        '</div>';
      }).join('') + '</div></div>' : '') +

    '<div class="card mt-4">' +
      '<h3 class="card-title">' + gist.comments.length + ' comment' + (gist.comments.length === 1 ? '' : 's') + '</h3>' +
      gist.comments.map(function (c) {
        var account = getUserByUsername(c.author) || { username: c.author, avatar: null };
        return '<div class="comment-card">' +
          '<div class="comment-head">' + avatarHTML(account, 28) + '<div><b>' + esc(c.author) + '</b>' +
          '<div class="muted fs-12">' + timeAgo(c.created) + '</div></div></div>' +
          '<div class="readme-body">' + md(c.body) + '</div></div>';
      }).join('') +
      '<div class="comment-composer mt-4">' +
        '<textarea class="input" id="gistComment" rows="3" placeholder="Leave a comment"></textarea>' +
        '<div style="margin-top:8px"><button class="btn primary gistCommentBtn" type="button" data-id="' + esc(gist.id) + '">' + ic('comment', 14) + ' Comment</button></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function fileIconFor(name) {
  if (/\.md$/i.test(name)) return ic('book', 16);
  if (/\.(js|mjs|ts|json|html|css|py|sh|rs|go)$/i.test(name)) return ic('code', 16);
  return ic('file', 16);
}

function signedOut() {
  return '<div class="container page"><div class="empty"><div class="empty-icon">' + ic('lock', 32) + '</div>' +
    '<h3>Sign in required</h3><p>Gists belong to an account.</p>' +
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
