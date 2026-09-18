/**
 * RedGet — command palette / search overlay.
 *
 * Markup contract (styled by .command-palette and .cp-* in /assets/css/header.css):
 *
 *   <dialog class="command-palette" role="dialog" aria-modal="true" aria-labelledby="cp-title">
 *     <div class="cp-header">
 *       <svg class="icon">                                     ← search / hash / issue icon per mode
 *       <input class="cp-input" role="combobox" aria-expanded aria-controls="cp-list"
 *              aria-autocomplete="list" placeholder="Search or jump to…">
 *       <span class="cp-mode" data-mode="search">
 *     </div>
 *     <div class="cp-body">
 *       <ul class="cp-list" id="cp-list" role="listbox" aria-label="Results">
 *         <li class="cp-group-label" role="presentation">Repositories</li>
 *         <li role="option" id="cp-opt-1" class="cp-item" aria-selected="true" tabindex="-1">
 *           <svg class="icon"> <span class="cp-item-main">
 *             <span class="cp-item-title"> <span class="cp-item-sub">
 *           <span class="cp-item-trailing"> <kbd>Enter</kbd>
 *       <div class="cp-empty" hidden>No results</div>
 *     </div>
 *     <div class="cp-footer"> <span class="hint"><kbd>↑</kbd><kbd>↓</kbd> to navigate …
 *
 * Modes: default (everything), `>` commands, `#` issues, `@` users, `!` pull
 * requests, `/` files in the current repository, `repo:` scoped search.
 */

import { h, icon, qs, clear } from '../core/dom.js';
import { getDb, getSession, getPrefs, setPref } from '../core/store.js';
import { navigate, currentPath } from '../core/router.js';
import { scoreMatch, highlightRanges, debounce, compactNumber } from '../core/util.js';
import { avatarDataUri } from './avatars.js';
import { toast } from './overlay.js';
import { applyTheme, cycleTheme } from '../core/theme.js';
import { BRAND, THEMES, LIMITS } from '../config.js';
import { CONTENT } from '../data/mockData.js';
import { EVENTS, emit } from '../core/bus.js';
import * as api from '../core/api.js';

const MAX_RESULTS = 30;
let openHandle = null;

const MODES = {
  search: { prefix: '', placeholder: 'Search or jump to…', icon: 'search', label: 'Everything' },
  command: { prefix: '>', placeholder: 'Run a command…', icon: 'zap', label: 'Commands' },
  issue: { prefix: '#', placeholder: 'Search issues…', icon: 'issue-opened', label: 'Issues' },
  user: { prefix: '@', placeholder: 'Search people and organizations…', icon: 'person', label: 'People' },
  pull: { prefix: '!', placeholder: 'Search pull requests…', icon: 'git-pull-request', label: 'Pull requests' },
  file: { prefix: '/', placeholder: 'Go to a file…', icon: 'file', label: 'Files' },
};

/* ==========================================================================
   Public entry point
   ========================================================================== */

export function openCommandPalette(options = {}) {
  if (openHandle) {
    openHandle.close('reopen');
    openHandle = null;
  }
  const startMode = options.mode || 'search';
  const initialQuery = options.query || '';

  const dialog = h('dialog', {
    class: 'command-palette',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'cp-title',
  });

  const listId = 'cp-list';
  const modeBadge = h('span', { class: 'cp-mode', dataset: { mode: startMode } }, MODES[startMode].label);
  const input = h('input', {
    class: 'cp-input',
    type: 'text',
    role: 'combobox',
    id: 'cp-input',
    'aria-expanded': 'true',
    'aria-controls': listId,
    'aria-autocomplete': 'list',
    'aria-label': 'Search RedGet',
    autocomplete: 'off',
    autocapitalize: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    placeholder: MODES[startMode].placeholder,
    value: initialQuery,
  });

  const header = h('div', { class: 'cp-header' },
    icon(MODES[startMode].icon, { size: 16 }),
    h('h2', { class: 'sr-only', id: 'cp-title' }, 'Command palette'),
    input,
    modeBadge);

  const list = h('ul', { class: 'cp-list', id: listId, role: 'listbox', 'aria-label': 'Results' });
  const empty = h('div', { class: 'cp-empty', hidden: true },
    icon('search', { size: 24 }),
    h('p', {}, 'No results'),
    h('p', { class: 'text-small text-muted' }, 'Try a repository name, an issue number, @user, #issue, /file or > command.'));
  const body = h('div', { class: 'cp-body' }, list, empty);

  const footer = h('div', { class: 'cp-footer' },
    h('span', { class: 'hint' }, h('kbd', {}, '↑'), h('kbd', {}, '↓'), 'to navigate'),
    h('span', { class: 'hint' }, h('kbd', {}, 'Enter'), 'to select'),
    h('span', { class: 'hint' }, h('kbd', {}, 'Esc'), 'to dismiss'),
    h('span', { class: 'hint cp-footer-right' },
      h('kbd', {}, '>'), 'commands ',
      h('kbd', {}, '#'), 'issues ',
      h('kbd', {}, '@'), 'people ',
      h('kbd', {}, '/'), 'files'));

  dialog.append(header, body, footer);

  const state = { mode: startMode, query: initialQuery, results: [], selected: 0 };

  document.body.appendChild(dialog);
  try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
  input.focus();
  input.select();

  function close(value) {
    try { if (dialog.open) dialog.close(value || 'closed'); } catch { dialog.remove(); }
    if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    openHandle = null;
  }

  dialog.addEventListener('close', () => { openHandle = null; });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close('backdrop'); });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close('cancelled'); });

  function detectMode(value) {
    const first = value.slice(0, 1);
    for (const [key, config] of Object.entries(MODES)) {
      if (config.prefix && first === config.prefix) return { mode: key, query: value.slice(1).trim() };
    }
    if (/^repo:[^\s]+\s*/.test(value)) {
      return { mode: 'search', query: value.replace(/^repo:[^\s]+\s*/, ''), scope: value.match(/^repo:([^\s]+)/)[1] };
    }
    return { mode: 'search', query: value.trim() };
  }

  function render() {
    const detected = detectMode(input.value);
    state.mode = detected.mode;
    state.query = detected.query;
    state.scope = detected.scope || null;

    const config = MODES[state.mode];
    modeBadge.textContent = config.label;
    modeBadge.dataset.mode = state.mode;
    input.placeholder = config.placeholder;
    qs('.icon', header).replaceWith(icon(config.icon, { size: 16 }));

    state.results = search(state.mode, state.query, state.scope).slice(0, MAX_RESULTS);
    state.selected = 0;
    paint();
  }

  function paint() {
    clear(list);
    if (!state.results.length) {
      empty.hidden = false;
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    empty.hidden = true;
    input.setAttribute('aria-expanded', 'true');

    let group = null;
    state.results.forEach((result, index) => {
      if (result.group && result.group !== group) {
        group = result.group;
        list.appendChild(h('li', { class: 'cp-group-label', role: 'presentation' }, group));
      }
      list.appendChild(h('li', {
        class: 'cp-item',
        role: 'option',
        id: `cp-opt-${index}`,
        'aria-selected': String(index === state.selected),
        tabindex: '-1',
        dataset: { index: String(index) },
        onMouseenter: () => { state.selected = index; paintSelection(); },
        onClick: () => { state.selected = index; activate(); },
      },
      result.image
        ? h('img', { class: 'avatar avatar-20', src: result.image, alt: '', width: '20', height: '20' })
        : icon(result.icon || 'chevron-right', { size: 16 }),
      h('span', { class: 'cp-item-main' },
        h('span', { class: 'cp-item-title' }, result.richTitle || result.title),
        result.subtitle ? h('span', { class: 'cp-item-sub' }, result.subtitle) : null),
      h('span', { class: 'cp-item-trailing' },
        result.trailing ? h('span', { class: 'counter' }, result.trailing) : null,
        result.shortcut ? h('kbd', {}, result.shortcut) : null)));
    });
    input.setAttribute('aria-activedescendant', `cp-opt-${state.selected}`);
  }

  function paintSelection() {
    const items = list.querySelectorAll('[role="option"]');
    items.forEach((item, index) => {
      item.setAttribute('aria-selected', String(index === state.selected));
    });
    const active = items[state.selected];
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    if (active) input.setAttribute('aria-activedescendant', active.id);
  }

  function move(delta) {
    if (!state.results.length) return;
    state.selected = (state.selected + delta + state.results.length) % state.results.length;
    paintSelection();
  }

  function activate() {
    const result = state.results[state.selected];
    if (!result) return;
    close('selected');
    if (typeof result.run === 'function') result.run();
    else if (result.href) navigate(result.href);
  }

  input.addEventListener('input', debounce(() => render(), LIMITS.searchDebounceMs));
  input.addEventListener('keydown', (event) => {
    switch (event.key) {
      case 'ArrowDown': event.preventDefault(); move(1); break;
      case 'ArrowUp': event.preventDefault(); move(-1); break;
      case 'Home': if (event.metaKey || event.ctrlKey) { event.preventDefault(); state.selected = 0; paintSelection(); } break;
      case 'End': if (event.metaKey || event.ctrlKey) { event.preventDefault(); state.selected = state.results.length - 1; paintSelection(); } break;
      case 'Enter': event.preventDefault(); activate(); break;
      case 'Escape': event.preventDefault(); close('escape'); break;
      case 'Tab': event.preventDefault(); break;
      case 'Backspace':
        if (!input.value && state.mode !== 'search') { input.value = ''; render(); }
        break;
      default: break;
    }
  });

  openHandle = { dialog, close, input };
  render();
  emit(EVENTS.commandPalette, { open: true });
  return openHandle;
}

export function closeCommandPalette() {
  if (!openHandle) return false;
  openHandle.close('api');
  return true;
}

export function isCommandPaletteOpen() {
  return Boolean(openHandle);
}

export function toggleCommandPalette() {
  if (openHandle) closeCommandPalette();
  else openCommandPalette();
}

/* ==========================================================================
   Search sources
   ========================================================================== */

function repoContext() {
  const path = currentPath();
  const match = /^\/([^/]+)\/([^/]+)/.exec(path);
  if (!match) return null;
  const db = getDb();
  if (!db) return null;
  return db.repos.find((r) => r.ownerLogin === match[1] && r.name === match[2]) || null;
}

function rank(items, query, titleKey = 'title') {
  const q = query.trim().toLowerCase();
  if (!q) return items.map((item) => ({ item, score: 0 }));
  return items
    .map((item) => ({ item, score: scoreMatch(String(item[titleKey] || '').toLowerCase(), q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

function titleWithHighlight(text, query) {
  if (!query) return text;
  const ranges = highlightRanges(text, query);
  if (!ranges.length) return text;
  const out = [];
  let cursor = 0;
  ranges.forEach(([start, end]) => {
    if (start > cursor) out.push(text.slice(cursor, start));
    out.push(h('mark', {}, text.slice(start, end)));
    cursor = end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

function search(mode, query, scope) {
  const db = getDb();
  if (!db) return [];
  switch (mode) {
    case 'command': return commandResults(query);
    case 'issue': return issueResults(db, query, scope);
    case 'pull': return pullResults(db, query, scope);
    case 'user': return peopleResults(db, query);
    case 'file': return fileResults(db, query);
    default: return everythingResults(db, query, scope);
  }
}

function everythingResults(db, query, scope) {
  const q = query.trim();
  const results = [];
  const repo = repoContext();

  // Numeric shorthand: "#12" or "12" inside a repository jumps to that item.
  if (repo && /^#?\d+$/.test(q)) {
    const number = Number(q.replace('#', ''));
    const issue = db.issues.find((i) => i.repoFullName === repo.fullName && i.number === number);
    const pull = db.pullRequests.find((p) => p.repoFullName === repo.fullName && p.number === number);
    if (pull) results.push({ group: 'In this repository', title: `#${number} ${pull.title}`, icon: pull.merged ? 'git-merge' : 'git-pull-request', href: `/${repo.fullName}/pull/${number}`, subtitle: pull.headBranch });
    if (issue) results.push({ group: 'In this repository', title: `#${number} ${issue.title}`, icon: issue.state === 'open' ? 'issue-opened' : 'issue-closed', href: `/${repo.fullName}/issues/${number}` });
  }

  // Direct path jump when the query looks like a route.
  if (q.startsWith('/')) {
    results.push({ group: 'Jump to', title: q, icon: 'link', href: q, subtitle: 'Open this path directly' });
  }

  if (scope) {
    const scoped = db.repos.find((r) => r.fullName.toLowerCase().includes(scope.toLowerCase()));
    if (scoped) {
      db.issues.filter((i) => i.repoFullName === scoped.fullName).forEach((issue) => {
        results.push({ group: `Issues in ${scoped.fullName}`, title: `#${issue.number} ${issue.title}`, richTitle: titleWithHighlight(`#${issue.number} ${issue.title}`, q), icon: issue.state === 'open' ? 'issue-opened' : 'issue-closed', href: `/${scoped.fullName}/issues/${issue.number}` });
      });
      db.pullRequests.filter((p) => p.repoFullName === scoped.fullName).forEach((pr) => {
        results.push({ group: `Pull requests in ${scoped.fullName}`, title: `#${pr.number} ${pr.title}`, icon: pr.merged ? 'git-merge' : 'git-pull-request', href: `/${scoped.fullName}/pull/${pr.number}` });
      });
      return results.filter((entry) => !q || entry.title.toLowerCase().includes(q.toLowerCase()) || entry.group.toLowerCase().includes(q.toLowerCase()));
    }
  }

  const session = getSession();
  const visibleRepos = db.repos.filter((r) => r.visibility === 'public' || (session.login && r.ownerLogin === session.login));

  if (q) {
    rank(visibleRepos.map((r) => ({ title: r.fullName, repo: r })), q).slice(0, 8).forEach(({ item }) => {
      results.push({
        group: 'Repositories',
        title: item.repo.fullName,
        richTitle: titleWithHighlight(item.repo.fullName, q),
        icon: item.repo.visibility === 'private' ? 'lock' : 'repo',
        href: `/${item.repo.fullName}`,
        subtitle: item.repo.description || item.repo.language,
        trailing: compactNumber(item.repo.stars),
      });
    });
    rank(db.users.map((u) => ({ title: u.login, user: u })), q).slice(0, 4).forEach(({ item }) => {
      results.push({ group: 'People', title: `@${item.user.login}`, richTitle: titleWithHighlight(item.user.login, q), image: avatarDataUri(item.user.login), href: `/${item.user.login}`, subtitle: item.user.name });
    });
    rank(db.orgs.map((o) => ({ title: o.login, org: o })), q).slice(0, 3).forEach(({ item }) => {
      results.push({ group: 'Organizations', title: item.org.name, richTitle: titleWithHighlight(item.org.name, q), image: avatarDataUri(item.org.login), href: `/orgs/${item.org.login}`, subtitle: `@${item.org.login}` });
    });
    const issueHits = rank(db.issues.map((i) => ({ title: `${i.title} ${i.repoFullName}`, issue: i })), q).slice(0, 5);
    issueHits.forEach(({ item }) => {
      results.push({
        group: 'Issues',
        title: `#${item.issue.number} ${item.issue.title}`,
        richTitle: titleWithHighlight(item.issue.title, q),
        icon: item.issue.state === 'open' ? 'issue-opened' : 'issue-closed',
        href: `/${item.issue.repoFullName}/issues/${item.issue.number}`,
        subtitle: item.issue.repoFullName,
        trailing: String(item.issue.commentsCount || 0),
      });
    });
    rank(db.pullRequests.map((p) => ({ title: `${p.title} ${p.repoFullName}`, pr: p })), q).slice(0, 5).forEach(({ item }) => {
      results.push({
        group: 'Pull requests',
        title: `#${item.pr.number} ${item.pr.title}`,
        richTitle: titleWithHighlight(item.pr.title, q),
        icon: item.pr.merged ? 'git-merge' : item.pr.state === 'open' ? 'git-pull-request' : 'git-pull-request-closed',
        href: `/${item.pr.repoFullName}/pull/${item.pr.number}`,
        subtitle: item.pr.repoFullName,
      });
    });
  } else {
    // Default state: recent and pinned destinations.
    results.push({ group: 'Jump to', title: 'Dashboard', icon: 'home', href: '/dashboard', shortcut: 'g d' });
    results.push({ group: 'Jump to', title: 'Notifications', icon: 'bell', href: '/notifications', shortcut: 'g n', trailing: String(api.unreadCount() || '') });
    results.push({ group: 'Jump to', title: 'Issues assigned to you', icon: 'issue-opened', href: '/issues', shortcut: 'g i' });
    results.push({ group: 'Jump to', title: 'Pull requests for you', icon: 'git-pull-request', href: '/pulls', shortcut: 'g p' });
    results.push({ group: 'Jump to', title: 'Explore', icon: 'telescope', href: '/explore', shortcut: 'g e' });
    results.push({ group: 'Jump to', title: 'Your settings', icon: 'gear', href: '/settings', shortcut: 'g s' });
    if (repo) {
      results.push({ group: 'This repository', title: `${repo.fullName} · Code`, icon: 'code', href: `/${repo.fullName}` });
      results.push({ group: 'This repository', title: `${repo.fullName} · Issues`, icon: 'issue-opened', href: `/${repo.fullName}/issues` });
      results.push({ group: 'This repository', title: `${repo.fullName} · Actions`, icon: 'play', href: `/${repo.fullName}/actions` });
      results.push({ group: 'This repository', title: `${repo.fullName} · Settings`, icon: 'gear', href: `/${repo.fullName}/settings` });
    }
    visibleRepos.slice(0, 6).forEach((r) => {
      results.push({ group: 'Repositories', title: r.fullName, icon: r.visibility === 'private' ? 'lock' : 'repo', href: `/${r.fullName}`, subtitle: r.description || r.language });
    });
  }
  return results;
}

function issueResults(db, query, scope) {
  const session = getSession();
  let pool = db.issues;
  if (scope) pool = pool.filter((i) => i.repoFullName.toLowerCase().includes(scope.toLowerCase()));
  else if (repoContext()) pool = pool.filter((i) => i.repoFullName === repoContext().fullName);
  if (/^#?\d+$/.test(query.trim())) {
    const number = Number(query.replace('#', ''));
    pool = pool.filter((i) => i.number === number);
  } else {
    pool = rank(pool.map((i) => ({ title: `${i.title} #${i.number} ${i.repoFullName}`, issue: i })), query).map((entry) => entry.item);
  }
  if (query.includes('is:open')) pool = pool.filter((i) => i.state === 'open');
  if (query.includes('is:closed')) pool = pool.filter((i) => i.state === 'closed');
  if (session.login && query.includes('assignee:@me')) pool = pool.filter((i) => i.assignees.includes(session.login));
  return pool.slice(0, MAX_RESULTS).map((issue) => ({
    group: issue.repoFullName,
    title: `#${issue.number} ${issue.title}`,
    richTitle: titleWithHighlight(issue.title, query.replace(/is:\w+|assignee:@me|#?\d+/g, '').trim()),
    icon: issue.state === 'open' ? 'issue-opened' : 'issue-closed',
    href: `/${issue.repoFullName}/issues/${issue.number}`,
    subtitle: `${issue.state} · ${issue.authorLogin} · ${issue.commentsCount || 0} comments`,
    trailing: issue.labels.length ? issue.labels[0].name : null,
  }));
}

function pullResults(db, query, scope) {
  let pool = db.pullRequests;
  const repo = repoContext();
  if (scope) pool = pool.filter((p) => p.repoFullName.toLowerCase().includes(scope.toLowerCase()));
  else if (repo) pool = pool.filter((p) => p.repoFullName === repo.fullName);
  pool = rank(pool.map((p) => ({ title: `${p.title} #${p.number} ${p.repoFullName}`, pr: p })), query).map((entry) => entry.item);
  return pool.slice(0, MAX_RESULTS).map((pr) => ({
    group: pr.repoFullName,
    title: `#${pr.number} ${pr.title}`,
    richTitle: titleWithHighlight(pr.title, query),
    icon: pr.merged ? 'git-merge' : pr.state === 'open' ? 'git-pull-request' : 'git-pull-request-closed',
    href: `/${pr.repoFullName}/pull/${pr.number}`,
    subtitle: `${pr.merged ? 'merged' : pr.state}${pr.draft ? ' · draft' : ''} · ${pr.headBranch} → ${pr.baseBranch}`,
  }));
}

function peopleResults(db, query) {
  const people = [
    ...db.users.map((u) => ({ title: `${u.login} ${u.name || ''}`, login: u.login, name: u.name, href: `/${u.login}`, subtitle: u.bio, group: u.type === 'bot' ? 'Apps and bots' : 'People' })),
    ...db.orgs.map((o) => ({ title: `${o.login} ${o.name}`, login: o.login, name: o.name, href: `/orgs/${o.login}`, subtitle: o.description, group: 'Organizations' })),
  ];
  const ranked = query ? rank(people, query).map((entry) => entry.item) : people;
  return ranked.slice(0, MAX_RESULTS).map((person) => ({
    group: person.group,
    title: `@${person.login}`,
    richTitle: titleWithHighlight(person.login, query),
    image: avatarDataUri(person.login),
    href: person.href,
    subtitle: person.subtitle || person.name,
  }));
}

/** Every path in a repository: seeded tree + locally created files, de-duplicated. */
export function repoFilePaths(repo) {
  const db = getDb();
  const content = CONTENT.get(repo.fullName);
  const paths = new Map();
  if (content) {
    content.files.forEach((file) => paths.set(file.path, { path: file.path, message: file.message, language: file.language }));
    content.dirs.forEach((dir) => paths.set(dir.path, { path: dir.path, dir: true }));
  }
  if (db) {
    (db.localFiles || []).filter((f) => f.repoFullName === repo.fullName)
      .forEach((file) => paths.set(file.path, { path: file.path, message: file.message, language: file.language }));
    db.commits.filter((c) => c.repoFullName === repo.fullName).forEach((commit) => {
      (commit.files || []).forEach((path) => {
        if (!paths.has(path)) paths.set(path, { path, message: commit.message, language: '' });
      });
    });
  }
  return Array.from(paths.values()).sort((a, b) => a.path.localeCompare(b.path));
}

function fileResults(db, query) {
  const repo = repoContext();
  if (!repo) {
    return [{ group: 'Files', title: 'Open a repository first', icon: 'repo', href: '/dashboard', subtitle: 'File search works inside /:owner/:repo — press Enter for your dashboard' }];
  }
  const source = repoFilePaths(repo);
  const ranked = query ? rank(source.map((f) => ({ title: f.path, file: f })), query).map((entry) => entry.item) : source;
  return ranked.slice(0, MAX_RESULTS).map((file) => ({
    group: repo.fullName,
    title: file.path,
    richTitle: titleWithHighlight(file.path, query),
    icon: file.dir ? 'file-directory' : 'file',
    href: file.dir
      ? `/${repo.fullName}/tree/${repo.defaultBranch}/${file.path}`
      : `/${repo.fullName}/blob/${repo.defaultBranch}/${file.path}`,
    subtitle: file.message || file.language || '',
  }));
}

function commandResults(query) {
  const repo = repoContext();
  const session = getSession();
  const prefs = getPrefs();
  const commands = [
    { group: 'Navigation', title: 'Go to dashboard', icon: 'home', href: '/dashboard', shortcut: 'g d' },
    { group: 'Navigation', title: 'Go to notifications', icon: 'bell', href: '/notifications', shortcut: 'g n' },
    { group: 'Navigation', title: 'Go to your issues', icon: 'issue-opened', href: '/issues', shortcut: 'g i' },
    { group: 'Navigation', title: 'Go to your pull requests', icon: 'git-pull-request', href: '/pulls', shortcut: 'g p' },
    { group: 'Navigation', title: 'Go to explore', icon: 'telescope', href: '/explore', shortcut: 'g e' },
    { group: 'Navigation', title: 'Go to codespaces', icon: 'codespaces', href: '/codespaces' },
    { group: 'Navigation', title: 'Go to your gists', icon: 'code', href: '/gists' },
    { group: 'Navigation', title: 'Go to settings', icon: 'gear', href: '/settings', shortcut: 'g s' },
    { group: 'Navigation', title: 'Go to documentation', icon: 'book', href: '/docs' },
    { group: 'Navigation', title: 'Go to pricing', icon: 'credit-card', href: '/pricing' },
    { group: 'Navigation', title: 'Go to RedGet status', icon: 'pulse', href: '/status' },
    { group: 'Appearance', title: 'Cycle theme', icon: 'paintbrush', run: () => { const next = cycleTheme(); toast(`${next} theme applied`); } },
    ...THEMES.map((theme) => ({
      group: 'Appearance', title: `Use the ${theme.label} theme`, icon: theme.group === 'light' ? 'sun' : 'moon',
      run: () => { setPref('theme', theme.id); setPref('followSystem', false); applyTheme(theme.id); toast(`${theme.label} theme applied`); },
    })),
    { group: 'Appearance', title: prefs.density === 'compact' ? 'Use comfortable density' : 'Use compact density', icon: 'rows', run: () => { const next = prefs.density === 'compact' ? 'comfortable' : 'compact'; setPref('density', next); document.documentElement.dataset.density = next; toast(`${next} density applied`); } },
    { group: 'Appearance', title: 'Toggle reduced motion', icon: 'meter', run: () => { setPref('reducedMotion', !prefs.reducedMotion); document.documentElement.dataset.reducedMotion = String(Boolean(prefs.reducedMotion) ? 'false' : 'true'); toast('Motion preference updated'); } },
    { group: 'Diffs', title: prefs.diffView === 'split' ? 'Use the unified diff view' : 'Use the split diff view', icon: 'diff', run: () => { const next = prefs.diffView === 'split' ? 'unified' : 'split'; setPref('diffView', next); toast(`${next} diff view`); reloadIfDiffOpen(); } },
    { group: 'Diffs', title: prefs.showWhitespace ? 'Ignore whitespace changes' : 'Show whitespace changes', icon: 'diff', run: () => { setPref('showWhitespace', !prefs.showWhitespace); toast('Whitespace preference updated'); reloadIfDiffOpen(); } },
    { group: 'Account', title: 'Set a status', icon: 'emoji-smile', run: () => import('./header.js').then((m) => m.openStatusDialog()) },
    { group: 'Account', title: 'Keyboard shortcuts', icon: 'keyboard', href: '/shortcuts', shortcut: '?' },
    { group: 'Account', title: 'Mark all notifications read', icon: 'check', run: () => { api.markAllNotificationsRead(); emit(EVENTS.notifications); toast('All notifications marked as read'); } },
    { group: 'Account', title: 'Sign out', icon: 'sign-out', href: '/login' },
    { group: 'Create', title: 'New repository', icon: 'repo-push', href: '/new' },
    { group: 'Create', title: 'New organization', icon: 'organization', href: '/organizations/new' },
    { group: 'Create', title: 'New gist', icon: 'code', href: '/gists' },
    { group: 'Data', title: 'Reset the demo data', icon: 'history', run: () => import('./resetData.js').then((m) => m.confirmResetData()) },
  ];

  if (repo) {
    commands.unshift(
      { group: `In ${repo.fullName}`, title: 'Go to code', icon: 'code', href: `/${repo.fullName}`, shortcut: 'g c' },
      { group: `In ${repo.fullName}`, title: 'Go to issues', icon: 'issue-opened', href: `/${repo.fullName}/issues`, shortcut: 'g i' },
      { group: `In ${repo.fullName}`, title: 'Go to pull requests', icon: 'git-pull-request', href: `/${repo.fullName}/pulls`, shortcut: 'g p' },
      { group: `In ${repo.fullName}`, title: 'Go to actions', icon: 'play', href: `/${repo.fullName}/actions`, shortcut: 'g a' },
      { group: `In ${repo.fullName}`, title: 'Go to the wiki', icon: 'book', href: `/${repo.fullName}/wiki`, shortcut: 'g w' },
      { group: `In ${repo.fullName}`, title: 'Go to projects', icon: 'project', href: `/${repo.fullName}/projects` },
      { group: `In ${repo.fullName}`, title: 'Go to security', icon: 'shield', href: `/${repo.fullName}/security` },
      { group: `In ${repo.fullName}`, title: 'Go to insights', icon: 'graph', href: `/${repo.fullName}/pulse` },
      { group: `In ${repo.fullName}`, title: 'Go to releases', icon: 'tag', href: `/${repo.fullName}/releases` },
      { group: `In ${repo.fullName}`, title: 'Go to settings', icon: 'gear', href: `/${repo.fullName}/settings` },
      { group: `In ${repo.fullName}`, title: 'Find a file', icon: 'file', href: `/${repo.fullName}/find/${repo.defaultBranch}`, shortcut: 't' },
      { group: `In ${repo.fullName}`, title: 'New issue', icon: 'issue-opened', href: `/${repo.fullName}/issues/new`, shortcut: 'c' },
      { group: `In ${repo.fullName}`, title: 'New pull request', icon: 'git-pull-request', href: `/${repo.fullName}/pull/new` },
      { group: `In ${repo.fullName}`, title: 'Compare branches', icon: 'diff', href: `/${repo.fullName}/compare` },
      { group: `In ${repo.fullName}`, title: 'View commit history', icon: 'history', href: `/${repo.fullName}/commits/${repo.defaultBranch}` },
      { group: `In ${repo.fullName}`, title: 'Clone with HTTPS', icon: 'copy', run: () => copyClone(repo, 'https') },
      { group: `In ${repo.fullName}`, title: 'Clone with SSH', icon: 'copy', run: () => copyClone(repo, 'ssh') },
      { group: `In ${repo.fullName}`, title: 'Download ZIP archive', icon: 'download', href: `/${repo.fullName}/archive/refs/heads/${repo.defaultBranch}.zip` },
    );
  }

  const ranked = query ? rank(commands, query).map((entry) => entry.item) : commands;
  return ranked;
}

function copyClone(repo, kind) {
  const url = kind === 'ssh' ? `git@${BRAND.hostPlaceholder}:${repo.fullName}.git` : `https://${BRAND.hostPlaceholder}/${repo.fullName}.git`;
  navigator.clipboard?.writeText(url).then(
    () => toast(`Copied ${url}`),
    () => toast(`Clone URL: ${url}`),
  );
}

/** Diff settings only take effect after the diff is re-rendered, so re-dispatch the route. */
function reloadIfDiffOpen() {
  if (/\/(pull\/\d+\/files|commit\/|compare)/.test(currentPath())) {
    emit(EVENTS.routeChange, { path: currentPath(), force: true });
  }
}

export default { openCommandPalette, closeCommandPalette, isCommandPaletteOpen, toggleCommandPalette, MODES };
