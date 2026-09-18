/**
 * RedGet — repository Code tab.
 *
 * Overview (/:login/:repo) and directory listing (/:login/:repo/tree/:branch/path)
 * share one layout:
 *
 *   repoShell(repo, 'code', { main, sidebar })
 *     main:
 *       <div class="code-toolbar">            branch selector · Go to file · Add file · Code
 *       <div class="file-summary">            avatar + last commit message + sha + count + time
 *       <div class="file-list-wrap">
 *         <table class="file-list">
 *           <caption class="sr-only">…</caption>
 *           <thead><tr><th>Name</th><th class="col-message">Last commit message</th><th>Last commit time</th></tr></thead>
 *           <tbody><tr><td><a class="file-name">…</a></td>…</tr></tbody>
 *         </table>
 *         <div class="file-list-footer">…</div>
 *       </div>
 *       <section class="readme"> … rendered Markdown … </section>
 *     sidebar: repoSidebar(repo)   (About · Releases · Packages · Contributors · Languages)
 *
 * Also here: the file finder (/find/:branch), in-repository search (/search) and
 * the archive route (/archive/refs/heads/<branch>.zip), which explains that no
 * file is downloaded because RedGet never talks to a network.
 */

import { h, icon } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { getDb } from '../core/store.js';
import * as api from '../core/api.js';
import { avatar } from '../components/avatars.js';
import { markdown as markdownNode } from '../components/markdown.js';
import { copyButton, toast, openDialog } from '../components/overlay.js';
import {
  relativeTimeEl, emptyState, queryPage, counter, stateBadge, itemRow, card,
} from '../components/kit.js';
import {
  codeToolbar, repoSidebar, repoShell, listRepoPaths, openGoToFile, openUploadDialog,
  archivedNotice, repoNotFound, isMaintainer,
} from '../components/repoChrome.js';
import {
  repoContext, repoFiles, repoCommits, repoBranches, repoTags,
  blobHref, treeHref, db as getDatabase,
} from './_shared.js';

/* =========================================================== entry points */

export function render(ctx = {}) {
  return renderTree({ ...ctx, params: { ...ctx.params, branch: null, path: '' } });
}

export function renderTree(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo, maintainer } = found;

  const rawRef = ctx.params.branch || repo.defaultBranch;
  const path = String(ctx.params.path || '').replace(/^\/+|\/+$/g, '');
  const branch = resolveRef(repo, rawRef);

  // A path that points at a file renders the blob view instead.
  if (path) {
    const file = resolveFile(repo, path);
    if (file) {
      return import('./repoBlob.js').then((m) => m.render({
        params: { ...ctx.params, branch, path },
        query: ctx.query || {},
      }));
    }
  }

  const content = repoFiles(repo);
  const rows = listDirectory(repo, content, path);
  const commits = repoCommits(repo, branch);
  const lastCommit = commits[0] || null;

  const main = h('div', { class: 'repo-main-col' },
    repo.archived ? archivedNotice(repo) : null,
    codeToolbar(repo, {
      branch,
      path,
      onGoToFile: () => openGoToFile(repo, branch),
      onAddFile: () => openUploadDialog(repo, branch, path),
      extra: h('div', { class: 'code-toolbar-extra' },
        h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/commits/${branch}${path ? `/${path}` : ''}` },
          icon('history', { size: 16 }), h('span', { class: 'hide-sm' }, 'History'), ' ', counter(commits.length)),
        maintainer ? h('button', {
          class: 'btn btn-sm', type: 'button',
          onClick: () => openBranchDialog(repo, branch),
        }, icon('git-branch', { size: 16 }), h('span', { class: 'hide-sm' }, 'Branches')) : null),
    }),
    fileSummary(repo, branch, path, lastCommit, commits.length),
    fileList(repo, branch, path, rows),
    path ? pathBreadcrumbNav(repo, branch, path) : null,
    path || !content.readme ? null : readmeSection(repo, content.readme),
    path ? null : repoExtras(repo));

  return repoShell(repo, 'code', { main, sidebar: repoSidebar(repo), fullWidth: false });
}

/* ---------------------------------------------------------------- helpers */

function resolveRef(repo, rawRef) {
  if (!rawRef) return repo.defaultBranch;
  const branches = repoBranches(repo);
  const tags = repoTags(repo);
  const found = branches.find((b) => b.name === rawRef) || tags.find((t) => t.name === rawRef);
  return found ? found.name : rawRef;
}

function resolveFile(repo, path) {
  const content = repoFiles(repo);
  return content.files.find((f) => f.path === path) || null;
}

/** Rows for one directory level: directories first, then files, both A→Z. */
function listDirectory(repo, content, dirPath) {
  const files = (content.files || []).filter((f) => (f.dir || '') === dirPath);
  const dirs = (content.dirs || []).filter((d) => (d.dir || '') === dirPath);
  const local = (getDatabase().localFiles || []).filter((f) => f.repoFullName === repo.fullName && (f.dir || '') === dirPath);
  const deleted = new Set((getDatabase().deletedFiles || []).filter((f) => f.repoFullName === repo.fullName).map((f) => f.path));

  const merged = [...files, ...local].filter((f) => !deleted.has(f.path));
  const byPath = new Map(merged.map((f) => [f.path, f]));

  const dirRows = dirs.map((dir) => ({ kind: 'dir', name: dir.name, path: dir.path, commit: lastCommitFor(repo, dir.path) }));
  const fileRows = [...byPath.values()]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((file) => ({ kind: 'file', name: file.name || file.path.split('/').pop(), path: file.path, commit: lastCommitFor(repo, file.path) }));

  return [...dirRows.sort((a, b) => a.name.localeCompare(b.name)), ...fileRows];
}

const commitCache = new Map();
function lastCommitFor(repo, path) {
  const key = `${repo.fullName}:${path}`;
  if (commitCache.has(key)) return commitCache.get(key);
  const commits = (getDatabase().commits || []).filter((c) => c.repoFullName === repo.fullName);
  // A directory row inherits the newest commit touching anything beneath it.
  const match = commits.find((commit) => (commit.files || []).some((file) => file === path || file.startsWith(`${path}/`)));
  commitCache.set(key, match || null);
  return match || null;
}

/* --------------------------------------------------------------- file list */

function fileSummary(repo, branch, path, commit, commitCount) {
  if (!commit) {
    return h('div', { class: 'file-summary' },
      h('span', { class: 'text-muted' }, 'No commits recorded for this path yet.'));
  }
  const author = (getDatabase().users || []).find((u) => u.login === commit.authorLogin);
  return h('div', { class: 'file-summary' },
    h('span', { class: 'commit-author' },
      avatar(author || { login: commit.authorLogin }, { size: 20 }),
      h('a', { href: `/${commit.authorLogin}` }, commit.authorLogin),
      commit.verified ? h('span', { class: 'verified-badge', title: 'Signed and verified' }, icon('shield-check', { size: 16 })) : null),
    h('span', { class: 'commit-message' },
      h('a', { href: `/${repo.fullName}/commit/${commit.sha}`, title: commit.message }, firstLine(commit.message))),
    h('span', { class: 'commit-meta' },
      h('a', { class: 'commit-sha', href: `/${repo.fullName}/commit/${commit.sha}` }, commit.shortSha || commit.sha.slice(0, 7)),
      h('span', { class: 'text-muted' }, '·'),
      relativeTimeEl(commit.date),
      h('a', { class: 'commit-count', href: `/${repo.fullName}/commits/${branch}${path ? `/${path}` : ''}` },
        icon('history', { size: 16 }), ` ${commitCount} Commits`)));
}

function firstLine(message) {
  return String(message || '').split('\n')[0];
}

function fileList(repo, branch, dirPath, rows) {
  const wrap = h('div', { class: `file-list-wrap ${dirPath ? '' : 'standalone'}`.trim() });

  const table = h('table', { class: 'file-list' },
    h('caption', {}, `Files in ${dirPath ? `/${dirPath}` : 'the repository root'} at ${branch}`),
    h('thead', {}, h('tr', {},
      h('th', { scope: 'col' }, 'Name'),
      h('th', { scope: 'col', class: 'col-message' }, 'Last commit message'),
      h('th', { scope: 'col' }, 'Last commit time'))),
    h('tbody', {}, ...rows.map((row) => h('tr', {},
      h('td', { class: 'col-name' },
        h('a', {
          class: 'file-name',
          href: row.kind === 'dir' ? treeHref(repo, branch, row.path) : blobHref(repo, branch, row.path),
        },
          icon(row.kind === 'dir' ? 'file-directory' : iconForFile(row.path), { size: 16, cls: `icon-${row.kind === 'dir' ? 'file-directory' : 'file'}` }),
          h('span', {}, row.name))),
      h('td', { class: 'col-message' },
        row.commit
          ? h('span', { class: 'file-commit-message' },
            h('a', { href: `/${repo.fullName}/commit/${row.commit.sha}`, title: row.commit.message }, firstLine(row.commit.message)))
          : h('span', { class: 'file-commit-message text-muted' }, '—')),
      h('td', { class: 'col-time' },
        h('span', { class: 'file-time' }, row.commit ? relativeTimeEl(row.commit.date) : '—'))))));

  wrap.appendChild(table);

  const db = getDatabase();
  const fileCount = db.repos.find((r) => r.fullName === repo.fullName)?.fileCount ?? rows.length;
  wrap.appendChild(h('div', { class: 'file-list-footer' },
    `${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} at this level · ${fileCount} files tracked · branch ${branch}`,
    h('a', { class: 'btn-link footer-link', href: `/${repo.fullName}/find/${branch}` }, 'Find a file')));

  return wrap;
}

function iconForFile(path) {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'].includes(ext)) return 'image';
  if (['md', 'markdown', 'rst', 'adoc', 'txt'].includes(ext)) return 'book';
  if (['zip', 'tar', 'gz', 'tgz'].includes(ext)) return 'package';
  if (['sh', 'bash', 'zsh'].includes(ext)) return 'terminal';
  if (['sql'].includes(ext)) return 'database';
  if (['yml', 'yaml', 'toml', 'json'].includes(ext)) return 'gear';
  return 'file';
}

function pathBreadcrumbNav(repo, branch, path) {
  const parts = path.split('/');
  const crumbs = parts.map((part, index) => ({
    label: part,
    href: treeHref(repo, branch, parts.slice(0, index + 1).join('/')),
  }));
  return h('nav', { class: 'path-breadcrumb', 'aria-label': 'Path' },
    h('ol', {},
      h('li', {}, h('a', { href: treeHref(repo, branch) }, repo.name)),
      ...crumbs.map((crumb, index) => h('li', {},
        h('span', { class: 'sep', 'aria-hidden': 'true' }, '/'),
        index === crumbs.length - 1
          ? h('span', { 'aria-current': 'location' }, crumb.label)
          : h('a', { href: crumb.href }, crumb.label)))));
}

/* ------------------------------------------------------------------ readme */

function readmeSection(repo, readme) {
  const body = markdownNode(readme, { repo });
  body.classList.add('readme-body');
  const section = h('section', { class: 'readme panel', 'aria-labelledby': 'readme-title' },
    h('div', { class: 'panel-header' },
      h('h2', { class: 'panel-title', id: 'readme-title' }, icon('book', { size: 16 }), ' README.md'),
      h('div', { class: 'panel-actions' },
        copyButton(() => readme, { label: 'Copy README' }),
        isMaintainer(repo) ? h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/edit/${repo.defaultBranch}/README.md` }, icon('pencil', { size: 16 }), 'Edit') : null)),
    body);

  // Long READMEs collapse on narrow screens.
  const toggle = h('button', {
    class: 'btn btn-sm readme-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'readme-collapse',
    onClick: () => {
      const collapsed = body.dataset.collapsed === 'true';
      body.dataset.collapsed = collapsed ? 'false' : 'true';
      toggle.setAttribute('aria-expanded', String(collapsed));
      toggle.textContent = collapsed ? 'Collapse README' : 'Expand README';
    },
  }, 'Collapse README');
  body.id = 'readme-collapse';
  section.querySelector('.panel-actions').appendChild(toggle);
  return section;
}

/** Below-the-fold panels on the repository home page. */
function repoExtras(repo) {
  const db = getDatabase();
  const releases = (db.releases || []).filter((r) => r.repoFullName === repo.fullName && !r.draft).slice(0, 3);
  const packages = (db.packages || []).filter((p) => p.repoFullName === repo.fullName).slice(0, 3);
  const discussions = (db.discussions || []).filter((d) => d.repoFullName === repo.fullName).slice(0, 3);
  const latestRun = (db.runs || []).filter((r) => r.repoFullName === repo.fullName)[0];

  const columns = [];

  if (latestRun) {
    columns.push(card('Latest workflow run',
      h('div', { class: 'kv-list-wrap' },
        h('p', {},
          h('a', { class: 'text-strong', href: `/${repo.fullName}/actions/runs/${latestRun.id}` }, latestRun.name),
          ' · ', stateBadge(latestRun.conclusion || latestRun.status)),
        h('p', { class: 'text-small text-muted' }, latestRun.displayTitle),
        h('p', { class: 'text-small text-muted' }, 'Branch ', h('code', { class: 'code-inline' }, latestRun.headBranch), ' · ', relativeTimeEl(latestRun.createdAt)),
        h('a', { class: 'btn btn-sm btn-block', href: `/${repo.fullName}/actions` }, icon('play', { size: 16 }), 'Open Actions')),
      { flush: true }));
  }

  if (releases.length) {
    columns.push(card('Releases',
      h('ul', { class: 'link-list', role: 'list' },
        ...releases.map((release) => h('li', {},
          h('a', { href: `/${repo.fullName}/releases/tag/${release.tagName}` },
            icon('tag', { size: 16 }), ` ${release.name || release.tagName}`),
          ' ', h('span', { class: 'text-small text-muted' }, relativeTimeEl(release.publishedAt || release.createdAt)))),
        h('li', {}, h('a', { class: 'btn-link', href: `/${repo.fullName}/releases` }, `All ${repo.releaseCount || releases.length} releases`))),
      { flush: true }));
  }

  if (packages.length) {
    columns.push(card('Packages',
      h('ul', { class: 'link-list', role: 'list' },
        ...packages.map((pkg) => h('li', {},
          h('a', { href: `/${repo.fullName}/packages` }, icon('package', { size: 16 }), ` ${pkg.name}`),
          ' ', h('span', { class: 'text-small text-muted' }, `${pkg.type} · ${pkg.latest}`))),
        h('li', {}, h('a', { class: 'btn-link', href: `/${repo.fullName}/packages` }, 'Browse the registry'))),
      { flush: true }));
  }

  if (discussions.length) {
    columns.push(card('Discussions',
      h('ul', { class: 'link-list', role: 'list' },
        ...discussions.map((discussion) => h('li', {},
          h('a', { href: `/${repo.fullName}/discussions/${discussion.number}` },
            icon('comment-discussion', { size: 16 }), ` ${discussion.title}`),
          ' ', h('span', { class: 'text-small text-muted' }, `${discussion.comments} comments`))),
        h('li', {}, h('a', { class: 'btn-link', href: `/${repo.fullName}/discussions` }, 'Join the conversation'))),
      { flush: true }));
  }

  if (!columns.length) return null;
  return h('div', { class: 'repo-extras grid grid-2' }, ...columns);
}

/* -------------------------------------------------------------- file finder */

export function renderFileFinder(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const branch = resolveRef(repo, ctx.params.branch || repo.defaultBranch);
  const paths = listRepoPaths(repo);

  const input = h('input', {
    class: 'input gtf-input', type: 'search', placeholder: `Search ${paths.length} files in ${repo.name}`,
    'aria-label': 'Find a file', 'aria-controls': 'finder-results', 'aria-autocomplete': 'list',
    role: 'combobox', 'aria-expanded': 'true', autocomplete: 'off', autofocus: true,
  });

  const list = h('ul', { class: 'gtf-list', role: 'listbox', id: 'finder-results', 'aria-label': 'Matching files' });
  let matches = paths.slice(0, 60);

  const paint = () => {
    list.replaceChildren(...matches.map((entry) => h('li', { role: 'option', 'aria-selected': 'false' },
      h('a', { class: 'gtf-item', href: entry.dir ? treeHref(repo, branch, entry.path) : blobHref(repo, branch, entry.path) },
        icon(entry.dir ? 'file-directory' : 'file', { size: 16 }),
        h('span', { class: 'gtf-path' }, entry.path)))));
  };

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    matches = q
      ? paths.filter((entry) => entry.path.toLowerCase().includes(q)).slice(0, 60)
      : paths.slice(0, 60);
    paint();
  });
  paint();

  const main = h('div', {},
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Find a file'),
        h('p', { class: 'page-subtitle' }, `Filter ${paths.length} paths in ${repo.fullName} at ${branch}. Press t to reopen this dialog from anywhere in the repository.`))),
    h('div', { class: 'go-to-file-dialog-inline card card-flush' },
      h('div', { class: 'gtf-input-wrap' }, icon('search', { size: 16 }), input),
      list,
      h('p', { class: 'gtf-hint' }, 'Use ↑ ↓ to browse, Enter to open, Esc to go back.')),
    h('div', { class: 'form-actions' },
      h('a', { class: 'btn', href: treeHref(repo, branch) }, icon('arrow-left', { size: 16 }), 'Back to the file list'),
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openGoToFile(repo, branch) }, icon('command', { size: 16 }), 'Open as a dialog')));

  return repoShell(repo, 'code', { main, fullWidth: true });
}

/* ------------------------------------------------------------ repo search */

export function renderRepoSearch(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const query = String(ctx.query.q || '');
  const page = queryPage(ctx.query.page, 1);
  const paths = listRepoPaths(repo);
  const commits = repoCommits(repo);
  const issues = (getDatabase().issues || []).filter((i) => i.repoFullName === repo.fullName && !i.isPull);
  const pulls = (getDatabase().pullRequests || []).filter((p) => p.repoFullName === repo.fullName);

  const q = query.toLowerCase();
  const results = q
    ? {
      code: paths.filter((entry) => entry.path.toLowerCase().includes(q)).slice(0, 40),
      commits: commits.filter((c) => `${c.message} ${c.body}`.toLowerCase().includes(q)).slice(0, 20),
      issues: issues.filter((i) => `${i.title} ${i.body}`.toLowerCase().includes(q)).slice(0, 20),
      pulls: pulls.filter((p) => `${p.title} ${p.body}`.toLowerCase().includes(q)).slice(0, 20),
    }
    : { code: [], commits: [], issues: [], pulls: [] };

  const total = results.code.length + results.commits.length + results.issues.length + results.pulls.length;
  const searchInput = h('input', {
    class: 'input input-lg', type: 'search', value: query, placeholder: `Search ${repo.fullName}`,
    'aria-label': 'Search this repository',
    onKeydown: (event) => { if (event.key === 'Enter') navigate(`/${repo.fullName}/search?q=${encodeURIComponent(event.target.value)}`); },
  });

  const main = h('div', {},
    h('div', { class: 'search-head' },
      h('form', {
        class: 'search-form', role: 'search',
        onSubmit: (event) => { event.preventDefault(); navigate(`/${repo.fullName}/search?q=${encodeURIComponent(searchInput.value)}`); },
      }, searchInput, h('button', { class: 'btn btn-primary', type: 'submit' }, icon('search', { size: 16 }), 'Search'))),
    q
      ? h('div', { class: 'search-results' },
        h('p', { class: 'search-count' }, `${total} ${total === 1 ? 'result' : 'results'} for “${query}” in ${repo.fullName}`),
        searchGroup('Code', results.code.map((entry) => itemRow({
          title: entry.path,
          titleHref: entry.dir ? treeHref(repo, repo.defaultBranch, entry.path) : blobHref(repo, repo.defaultBranch, entry.path),
          meta: entry.dir ? 'Directory' : 'File',
        }))),
        searchGroup('Commits', results.commits.map((commit) => itemRow({
          title: firstLine(commit.message),
          titleHref: `/${repo.fullName}/commit/${commit.sha}`,
          meta: `${commit.shortSha || commit.sha.slice(0, 7)} · ${commit.authorLogin} · ${new Date(commit.date).toLocaleDateString()}`,
        }))),
        searchGroup('Issues', results.issues.map((issue) => itemRow({
          status: issue.state,
          title: `${issue.title} #${issue.number}`,
          titleHref: `/${repo.fullName}/issues/${issue.number}`,
          labels: issue.labels,
          meta: `opened ${new Date(issue.createdAt).toLocaleDateString()} by ${issue.authorLogin}`,
          comments: issue.commentsCount,
        }))),
        searchGroup('Pull requests', results.pulls.map((pull) => itemRow({
          status: pull.merged ? 'merged' : pull.state,
          title: `${pull.title} #${pull.number}`,
          titleHref: `/${repo.fullName}/pull/${pull.number}`,
          labels: pull.labels,
          meta: `${pull.headBranch} → ${pull.baseBranch} · ${pull.authorLogin}`,
          comments: pull.commentsCount,
        }))),
        total === 0 ? emptyState({
          icon: 'search', title: `No matches for “${query}”`,
          body: 'Try a shorter query, or search paths from the file finder (t).',
          action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openGoToFile(repo, repo.defaultBranch) }, 'Find a file'),
        }) : null)
      : emptyState({
        icon: 'search', title: 'Search this repository',
        body: 'Search file paths, commit messages, issues and pull requests. Results are computed locally — nothing is sent anywhere.',
        action: h('a', { class: 'btn btn-primary', href: '/search' }, 'Search all of RedGet'),
      }));

  return repoShell(repo, 'code', { main, fullWidth: true });
}

function searchGroup(title, rows) {
  if (!rows || !rows.length) return null;
  return h('section', { class: 'search-group' },
    h('h2', { class: 'search-group-title' }, title, ' ', counter(rows.length)),
    h('div', { class: 'item-list' }, ...rows));
}

/* ---------------------------------------------------------------- archives */

export function renderArchive(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const ref = ctx.params.branch || ctx.params.tag || repo.defaultBranch;
  const isTag = Boolean(ctx.params.tag);

  const main = h('div', {},
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, icon('download', { size: 20 }), ' Source archive'),
        h('p', { class: 'page-subtitle' }, `${repo.fullName} · ${isTag ? 'tag' : 'branch'} ${ref} · zip`))),
    card('No bytes leave this browser',
      h('div', {},
        h('p', {}, 'RedGet is a self-contained demo: there is no object store to download from, and the application never contacts an external domain. The archive route exists so that links inside generated content stay valid and explain themselves.'),
        h('p', {}, 'What you can do instead:'),
        h('ul', { class: 'link-list', role: 'list' },
          h('li', {}, h('a', { href: treeHref(repo, ref) }, icon('file-directory', { size: 16 }), ` Browse the tree at ${ref}`)),
          h('li', {}, h('a', { href: `/${repo.fullName}/releases` }, icon('tag', { size: 16 }), ' Download-free release notes')),
          h('li', {}, h('a', { href: `/docs/cli` }, icon('terminal', { size: 16 }), ' RedGet CLI reference (rgt clone)'))),
        h('div', { class: 'clone-rows' },
          h('div', { class: 'copy-row' },
            h('span', { class: 'copy-row-label' }, 'Archive URL'),
            h('code', { class: 'copy-row-value code-inline' }, `/${repo.fullName}/archive/refs/${isTag ? 'tags' : 'heads'}/${ref}.zip`),
            copyButton(() => `/${repo.fullName}/archive/refs/${isTag ? 'tags' : 'heads'}/${ref}.zip`, { label: 'Copy archive URL' }))))));

  return repoShell(repo, 'code', { main, fullWidth: true });
}

/* ------------------------------------------------------------ branch dialog */

function openBranchDialog(repo, currentBranch) {
  const name = h('input', { class: 'input', type: 'text', placeholder: 'feature/new-thing', 'aria-label': 'New branch name' });
  const source = h('select', { class: 'input', 'aria-label': 'Source' },
    ...repoBranches(repo).map((b) => h('option', { value: b.name, selected: b.name === currentBranch ? 'selected' : null }, b.name)));

  openDialog({
    title: 'Create a branch',
    body: h('div', { class: 'dialog-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Branch name'), name,
        h('span', { class: 'field-help' }, 'Use slashes to group branches, for example feature/split-diff.')),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Source'), source,
        h('span', { class: 'field-help' }, 'The new branch starts from this ref.')),
      h('label', { class: 'checkbox-row' },
        h('input', { type: 'checkbox', id: 'branch-switch' }),
        h('span', {}, 'Switch to the new branch after creating it'))),
    footer: (close) => [
      h('button', { class: 'btn', type: 'button', 'data-close': 'true' }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const value = name.value.trim();
          if (!value) { toast({ message: 'A branch name is required', variant: 'attention' }); name.focus(); return; }
          if (!/^[\w./-]+$/.test(value)) { toast({ message: 'Only letters, numbers, dots, slashes and dashes are allowed', variant: 'danger' }); return; }
          const switchTo = document.getElementById('branch-switch')?.checked;
          close();
          toast({ message: `Branch ${value} created from ${source.value} (demo)`, variant: 'success' });
          if (switchTo) navigate(treeHref(repo, value));
        },
      }, 'Create branch'),
    ],
  });
}

export default { render, renderTree, renderFileFinder, renderRepoSearch, renderArchive };
