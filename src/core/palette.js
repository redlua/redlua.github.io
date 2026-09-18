/**
 * RedGet — command palette (Ctrl/Cmd+K).
 *
 * The index is built from what actually exists: the fixed page routes, every
 * account, every forge you can see, your organizations, your projects and
 * your gists. Arrow keys move the selection, Enter opens it, Escape closes.
 */

import { DB, ME } from '../state.js';
import { ic } from '../icons.js';
import { $, $$ } from './dom.js';
import { navigate } from './router.js';
import { visibleForges } from './forges.js';
import { orgsFor } from './orgs.js';
import { visibleProjects } from './projects.js';
import { gistsFor } from './gists.js';
import { codespacesFor } from './codespaces.js';
import { esc } from './util.js';

var PAGES = [
  { icon: 'home', label: 'Dashboard', sub: '/', path: '/' },
  { icon: 'plus', label: 'New forge', sub: 'create', path: '/new' },
  { icon: 'upload', label: 'Import files', sub: 'create', path: '/new/import' },
  { icon: 'search', label: 'Explore', sub: 'search', path: '/explore' },
  { icon: 'flame', label: 'Trending', sub: 'discover', path: '/trending' },
  { icon: 'issue', label: 'Issues', sub: 'inbox', path: '/issues' },
  { icon: 'redPR', label: 'Pull requests', sub: 'inbox', path: '/pulls' },
  { icon: 'bell', label: 'Notifications', sub: 'inbox', path: '/notifications' },
  { icon: 'project', label: 'Projects', sub: 'plan', path: '/projects' },
  { icon: 'codeSquare', label: 'Gists', sub: 'snippets', path: '/gists' },
  { icon: 'codespaces', label: 'Codespaces', sub: 'environments', path: '/codespaces' },
  { icon: 'organization', label: 'Organizations', sub: 'teams', path: '/organizations' },
  { icon: 'enterprise', label: 'Enterprises', sub: 'groups', path: '/enterprises' },
  { icon: 'package', label: 'Marketplace', sub: 'apps', path: '/marketplace' },
  { icon: 'copilot', label: 'RedGet Copilot', sub: 'assistant', path: '/copilot' },
  { icon: 'book', label: 'Documentation', sub: 'help', path: '/docs' },
  { icon: 'gear', label: 'Settings', sub: 'account', path: '/settings' },
  { icon: 'key', label: 'Settings — SSH and GPG keys', sub: 'account', path: '/settings/keys' },
  { icon: 'deviceDesktop', label: 'Settings — Sessions', sub: 'account', path: '/settings/sessions' },
  { icon: 'paintbrush', label: 'Settings — Appearance', sub: 'account', path: '/settings/appearance' },
];

var selected = 0;
var current = [];

export function openPalette() {
  var overlay = $('#paletteOverlay');
  if (!overlay) return;
  overlay.classList.add('open');
  var input = $('#paletteInput');
  if (input) {
    input.value = '';
    setTimeout(function () { input.focus(); }, 20);
  }
  renderPaletteItems('');
}

export function closePalette() {
  var overlay = $('#paletteOverlay');
  if (overlay) overlay.classList.remove('open');
}

export function paletteOpen() {
  var overlay = $('#paletteOverlay');
  return Boolean(overlay && overlay.classList.contains('open'));
}

/** Attach the palette listeners once, at boot. */
export function installPalette() {
  var overlay = $('#paletteOverlay');
  var input = $('#paletteInput');
  if (!overlay || !input || installPalette._done) return;
  installPalette._done = true;

  overlay.addEventListener('click', function (e) { if (e.target === overlay) closePalette(); });
  input.addEventListener('input', function () { renderPaletteItems(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); closePalette(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      var item = current[selected] || current[0];
      if (item) { closePalette(); navigate(item.path); }
    }
  });
}

function move(delta) {
  if (!current.length) return;
  selected = (selected + delta + current.length) % current.length;
  paint();
  var active = $('#paletteResults .palette-item.selected');
  if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
}

function paint() {
  $$('#paletteResults .palette-item').forEach(function (el, i) {
    el.classList.toggle('selected', i === selected);
  });
}

export function buildPaletteIndex() {
  var items = PAGES.slice();
  if (ME) {
    items.push({ icon: 'person', label: ME.username, sub: 'your profile', path: '/' + ME.username });
    items.push({ icon: 'star', label: 'Your stars', sub: 'profile tab', path: '/' + ME.username + '?tab=stars' });
    orgsFor(ME.username).forEach(function (org) {
      items.push({ icon: 'organization', label: org.name || org.slug, sub: 'organization', path: '/orgs/' + org.slug });
    });
    visibleProjects().forEach(function (project) {
      items.push({ icon: 'project', label: project.title, sub: 'project', path: '/projects/' + project.id });
    });
    gistsFor(ME.username).forEach(function (gist) {
      items.push({ icon: 'codeSquare', label: gist.description || gist.files[0].name, sub: 'gist', path: '/gists/' + gist.id });
    });
    codespacesFor(ME.username).forEach(function (cs) {
      items.push({ icon: 'codespaces', label: cs.name, sub: 'codespace', path: '/codespaces/' + cs.id });
    });
  }
  visibleForges().forEach(function (entry) {
    var owner = entry.user.username;
    var forge = entry.forge;
    items.push({ icon: 'forge', label: owner + '/' + forge.name, sub: forge.visibility, path: '/' + owner + '/' + forge.name });
    items.push({ icon: 'issue', label: owner + '/' + forge.name + ' issues', sub: 'forge', path: '/' + owner + '/' + forge.name + '/issues' });
    items.push({ icon: 'redPR', label: owner + '/' + forge.name + ' pull requests', sub: 'forge', path: '/' + owner + '/' + forge.name + '/pulls' });
    items.push({ icon: 'play', label: owner + '/' + forge.name + ' actions', sub: 'forge', path: '/' + owner + '/' + forge.name + '/actions' });
    items.push({ icon: 'book', label: owner + '/' + forge.name + ' wiki', sub: 'forge', path: '/' + owner + '/' + forge.name + '/wiki' });
  });
  Object.keys(DB.users).forEach(function (k) {
    var u = DB.users[k];
    if (ME && u.username === ME.username) return;
    items.push({ icon: 'person', label: u.username, sub: 'account', path: '/' + u.username });
  });
  return items;
}

export function renderPaletteItems(q) {
  var results = $('#paletteResults');
  if (!results) return;
  var needle = (q || '').toLowerCase().trim();
  var terms = needle.split(/\s+/).filter(Boolean);
  current = buildPaletteIndex().filter(function (item) {
    if (!terms.length) return true;
    var hay = (item.label + ' ' + (item.sub || '') + ' ' + item.path).toLowerCase();
    return terms.every(function (t) { return hay.indexOf(t) !== -1; });
  }).slice(0, 25);
  selected = 0;

  results.innerHTML = current.length
    ? current.map(function (item, i) {
        return '<div class="palette-item' + (i === 0 ? ' selected' : '') + '" data-path="' + esc(item.path) + '" role="option">' +
          ic(item.icon, 16) + '<span class="palette-label">' + esc(item.label) + '</span>' +
          (item.sub ? '<span class="label">' + esc(item.sub) + '</span>' : '') + '</div>';
      }).join('')
    : '<div class="palette-empty">' + ic('search', 18) + '<p>No results for “' + esc(q) + '”</p></div>';

  $$('#paletteResults .palette-item').forEach(function (el) {
    el.addEventListener('mouseenter', function () {
      selected = Number(Array.prototype.indexOf.call(el.parentNode.children, el));
      paint();
    });
    el.addEventListener('click', function () {
      closePalette();
      navigate(el.getAttribute('data-path'));
    });
  });
}
