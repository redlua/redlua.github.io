/**
 * RedGet — forge wikis.
 *
 *   page = {
 *     id, title, slug, body, format: 'markdown'|'asciidoc'|'rst'|'text',
 *     author, created, updated,
 *     history: [{ id, author, at, message, body }],
 *   }
 *
 * Pages are stored on the forge (`forge.wiki`), so a wiki belongs to the
 * forge it documents and disappears with it. Every save pushes the
 * previous body onto `history`, which is what the "History" tab renders.
 */

import { ME, saveDB } from '../state.js';
import { uid, slugify } from './util.js';
import { logActivity } from './forges.js';

export var WIKI_FORMATS = [
  { id: 'markdown', label: 'Markdown', extension: '.md', hint: '# Heading, **bold**, `code`, - lists' },
  { id: 'asciidoc', label: 'AsciiDoc', extension: '.adoc', hint: '= Heading, *bold*, `code`, * lists' },
  { id: 'rst', label: 'reStructuredText', extension: '.rst', hint: 'Heading\n=======, **bold**, ``code``' },
  { id: 'text', label: 'Plain text', extension: '.txt', hint: 'Rendered as-is inside <pre>' },
];

export function wikiPages(forge) {
  if (!forge.wiki) forge.wiki = [];
  return forge.wiki.slice().sort(function (a, b) { return a.title.localeCompare(b.title); });
}

export function wikiPageBySlug(forge, slug) {
  return wikiPages(forge).filter(function (p) { return p.slug === slug; })[0] || null;
}

export function wikiHome(forge) {
  var pages = wikiPages(forge);
  return pages.filter(function (p) { return p.slug === 'Home'; })[0] || pages[0] || null;
}

export function createWikiPage(forge, payload) {
  if (!forge.wiki) forge.wiki = [];
  var title = String(payload.title || 'Untitled page').trim().slice(0, 120);
  var slug = uniqueSlug(forge, slugify(title) || 'page');
  var now = Date.now();
  var page = {
    id: uid('wiki'),
    title: title,
    slug: slug,
    body: payload.body || '',
    format: payload.format || 'markdown',
    author: ME ? ME.username : forge.ownerUsername,
    created: now,
    updated: now,
    history: [],
  };
  forge.wiki.push(page);
  forge.updated = now;
  saveDB();
  logActivity('forge.wiki', forge.ownerUsername + '/' + forge.name);
  return page;
}

export function updateWikiPage(forge, page, payload) {
  var now = Date.now();
  page.history.unshift({
    id: uid('wikirev'),
    author: page.author,
    at: page.updated,
    message: page.lastMessage || 'Updated ' + page.title,
    body: page.body,
  });
  if (page.history.length > 50) page.history.length = 50;

  if (payload.title !== undefined && payload.title !== page.title) {
    var title = String(payload.title).trim().slice(0, 120);
    if (title) {
      page.title = title;
      page.slug = uniqueSlug(forge, slugify(title) || page.slug, page.id);
    }
  }
  if (payload.body !== undefined) page.body = payload.body;
  if (payload.format) page.format = payload.format;
  page.lastMessage = payload.message || ('Updated ' + page.title);
  page.author = ME ? ME.username : page.author;
  page.updated = now;
  forge.updated = now;
  saveDB();
  return page;
}

export function deleteWikiPage(forge, page) {
  forge.wiki = (forge.wiki || []).filter(function (p) { return p.id !== page.id; });
  saveDB();
  return true;
}

export function restoreWikiPage(forge, page, revisionId) {
  var revision = (page.history || []).filter(function (h) { return h.id === revisionId; })[0];
  if (!revision) return null;
  updateWikiPage(forge, page, { body: revision.body, message: 'Reverted to revision from ' + new Date(revision.at).toLocaleString() });
  return page;
}

/** Sidebar/footer pages are wiki pages flagged for chrome rendering. */
export function wikiChrome(forge, slot) {
  return wikiPages(forge).filter(function (p) { return p.slot === slot; })[0] || null;
}

export function setWikiChrome(forge, slot, body) {
  var page = wikiChrome(forge, slot);
  if (page) return updateWikiPage(forge, page, { body: body, message: 'Updated _' + slot });
  var created = createWikiPage(forge, { title: '_' + slot, body: body, format: 'markdown' });
  created.slot = slot;
  saveDB();
  return created;
}

function uniqueSlug(forge, slug, ignoreId) {
  var taken = (forge.wiki || []).filter(function (p) { return p.id !== ignoreId; }).map(function (p) { return p.slug; });
  if (taken.indexOf(slug) === -1) return slug;
  var i = 2;
  while (taken.indexOf(slug + '-' + i) !== -1) i++;
  return slug + '-' + i;
}
