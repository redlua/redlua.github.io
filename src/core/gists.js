/**
 * RedGet — gists: small shareable snippets with real revisions.
 *
 *   gist = {
 *     id, owner, description, isPublic, created, updated,
 *     files: [{ name, language, content }],
 *     revisions: [{ id, at, author, message, files: [{name, content}] }],
 *     comments: [{ id, author, body, created }],
 *     stars: [username],
 *   }
 */

import { DB, ME, saveDB } from '../state.js';
import { uid } from './util.js';
import { logActivity } from './forges.js';
import { EXT_LANG } from './model.js';

export function allGists() {
  return (DB.gists || []).slice().sort(function (a, b) { return b.updated - a.updated; });
}

export function gistsFor(username) {
  var name = username || (ME && ME.username);
  return allGists().filter(function (g) {
    return g.owner === name || (g.isPublic && g.stars.indexOf(name) !== -1);
  });
}

export function publicGists() {
  return allGists().filter(function (g) { return g.isPublic; });
}

export function gistById(id) {
  return allGists().filter(function (g) { return g.id === id; })[0] || null;
}

export function createGist(payload) {
  if (!ME) return null;
  var files = (payload.files || []).filter(function (f) { return f.name && f.content !== undefined; });
  if (!files.length) files = [{ name: 'snippet.txt', content: '' }];
  var now = Date.now();
  var gist = {
    id: uid('gist'),
    owner: ME.username,
    description: payload.description || '',
    isPublic: payload.isPublic !== false,
    created: now,
    updated: now,
    files: files.map(function (f) {
      return { name: f.name, language: languageFor(f.name), content: String(f.content || '') };
    }),
    revisions: [],
    comments: [],
    stars: [],
  };
  if (!DB.gists) DB.gists = [];
  DB.gists.unshift(gist);
  saveDB();
  logActivity('gist.create', gist.description || gist.files[0].name);
  return gist;
}

export function updateGist(gist, payload) {
  gist.revisions.unshift({
    id: uid('rev'),
    at: gist.updated,
    author: ME ? ME.username : gist.owner,
    message: payload.message || 'Edited',
    files: gist.files.map(function (f) { return { name: f.name, content: f.content }; }),
  });
  if (gist.revisions.length > 30) gist.revisions.length = 30;

  if (payload.description !== undefined) gist.description = payload.description;
  if (payload.isPublic !== undefined) gist.isPublic = Boolean(payload.isPublic);
  if (payload.files) {
    gist.files = payload.files
      .filter(function (f) { return f.name; })
      .map(function (f) { return { name: f.name, language: languageFor(f.name), content: String(f.content || '') }; });
  }
  gist.updated = Date.now();
  saveDB();
  return gist;
}

export function deleteGist(gist) {
  DB.gists = (DB.gists || []).filter(function (g) { return g.id !== gist.id; });
  saveDB();
  return true;
}

export function forkGist(gist) {
  if (!ME) return null;
  var copy = createGist({
    description: gist.description,
    isPublic: gist.isPublic,
    files: gist.files.map(function (f) { return { name: f.name, content: f.content }; }),
  });
  if (copy) copy.forkedFrom = gist.id;
  saveDB();
  return copy;
}

export function toggleGistStar(gist) {
  if (!ME) return false;
  var idx = gist.stars.indexOf(ME.username);
  if (idx === -1) gist.stars.push(ME.username);
  else gist.stars.splice(idx, 1);
  saveDB();
  return idx === -1;
}

export function commentOnGist(gist, body) {
  if (!ME || !String(body || '').trim()) return null;
  var comment = { id: uid('gcomment'), author: ME.username, body: String(body).trim(), created: Date.now() };
  gist.comments.push(comment);
  gist.updated = Date.now();
  saveDB();
  return comment;
}

export function restoreRevision(gist, revisionId) {
  var revision = gist.revisions.filter(function (r) { return r.id === revisionId; })[0];
  if (!revision) return null;
  updateGist(gist, {
    files: revision.files.map(function (f) { return { name: f.name, content: f.content }; }),
    message: 'Reverted to revision from ' + new Date(revision.at).toLocaleString(),
  });
  return gist;
}

export function languageFor(filename) {
  var ext = String(filename || '').split('.').pop().toLowerCase();
  return EXT_LANG[ext] || 'Text';
}
