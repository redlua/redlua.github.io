/**
 * RedGet — blob, blame, history, raw and file editing.
 *
 * Blob view markup contract:
 *
 *   <div class="code-toolbar">                        branch selector · Go to file · Add file · Code
 *   <nav class="path-breadcrumb" aria-label="Path">   repo / dir / file
 *   <div class="blob-header">
 *     <span class="path">src/components/diff.js</span>
 *     <div class="blob-actions"> <button>Copy</button> <a>Raw</a> <a>Blame</a> <a>History</a> <a>Edit</a> </div>
 *   </div>
 *   <div class="blob-meta">810 lines · 36.0 KB · JavaScript</div>
 *   <div class="blob-wrap" data-wrap="false">
 *     <div class="blob-scroll">
 *       <table class="blob-table"><tbody><tr>
 *         <td class="blob-line-numbers" aria-hidden="true"><a class="blob-line-number" id="L1" href="#L1">1</a>…</td>
 *         <td class="blob-code"><span class="blob-code-line">…highlighted tokens…</span>…</td>
 *       </tr></tbody></table>
 *     </div>
 *   </div>
 *
 * Blame view: <table class="blame-table"> with a <td class="blame-commit"> column
 * that repeats only when the commit changes (consecutive lines share one cell).
 *
 * Edit view: <form class="file-editor-form"> with a <textarea class="input code-editor">,
 * a commit-message field, a branch radio pair and a .form-actions footer.
 */

import { h, icon } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { LIMITS } from '../config.js';
import { getPrefs, setPref, getSession } from '../core/store.js';
import * as api from '../core/api.js';
import { codeTable, languageForPath, highlight } from '../components/highlight.js';
import { markdown as markdownNode } from '../components/markdown.js';
import { copyButton, toast, openDialog, attachMenu } from '../components/overlay.js';
import { badge, relativeTimeEl, emptyState, pagination, paginate, queryPage } from '../components/kit.js';
import { formatBytes } from '../core/util.js';
import {
  repoShell, codeToolbar, openGoToFile, repoNotFound, archivedNotice, isMaintainer,
} from '../components/repoChrome.js';
import {
  repoContext, repoFile, commitsForFile, blobHref, treeHref, db as getDatabase, notFoundBody,
} from './_shared.js';

const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'ico', 'bmp'];
const RENDERED_EXT = ['md', 'markdown', 'rst', 'adoc', 'txt'];
const MAX_RENDER_BYTES = 512 * 1024;

/* ================================================================ blob view */

export function render(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;

  const branch = ctx.params.branch || repo.defaultBranch;
  const path = String(ctx.params.path || '');
  const record = repoFile(repo, path);
  const local = api.localFile(repo.fullName, path);
  const content = local && !api.isDeletedFile(repo.fullName, path) ? local.content : (record ? record.content : null);

  if (content == null) {
    return repoShell(repo, 'code', {
      fullWidth: true,
      main: notFoundBody({
        title: `No file at ${path}`,
        description: `The path ${path} does not exist on ${branch} in ${repo.fullName}. It may have been renamed, deleted, or it lives on another branch.`,
        href: treeHref(repo, branch),
        label: `Back to the ${branch} tree`,
        code: '404',
      }),
    });
  }

  const ext = extension(path);
  const language = record?.language || languageForPath(path);
  const lines = String(content).split('\n');
  const bytes = estimateBytes(content);
  const commits = commitsForFile(repo, path, branch);
  const lastCommit = commits[0] || null;

  const main = h('div', { class: 'blob-page' },
    repo.archived ? archivedNotice(repo) : null,
    codeToolbar(repo, { branch, path, onGoToFile: () => openGoToFile(repo, branch) }),
    pathBreadcrumb(repo, branch, path),
    blobHeader(repo, branch, path, { record, local, language, lines, bytes, ext }),
    blobMeta(repo, branch, path, { lines, bytes, language, lastCommit }),
    blobContent(repo, branch, path, content, { ext, language, lines, bytes, ctx }));

  return repoShell(repo, 'code', { main, fullWidth: true });
}

function extension(path) {
  const dot = path.lastIndexOf('.');
  return dot < 0 ? '' : path.slice(dot + 1).toLowerCase();
}

function estimateBytes(text) {
  // Avoid pulling in node:buffer in the browser; count UTF-16 code units as an
  // approximation and add a byte for every non-ASCII character.
  const str = String(text);
  let extra = 0;
  for (let i = 0; i < str.length; i += 1) if (str.charCodeAt(i) > 127) extra += 1;
  return str.length + extra;
}

function pathBreadcrumb(repo, branch, path) {
  const parts = path.split('/').filter(Boolean);
  const crumbs = [];
  parts.forEach((part, index) => {
    const partial = parts.slice(0, index + 1).join('/');
    const isLast = index === parts.length - 1;
    crumbs.push(isLast
      ? h('li', {}, h('span', { 'aria-current': 'location', class: 'path-current' }, part))
      : h('li', {}, h('a', { href: treeHref(repo, branch, partial) }, part)));
  });

  return h('nav', { class: 'path-breadcrumb', 'aria-label': 'File path' },
    h('ol', {},
      h('li', {}, h('a', { href: treeHref(repo, branch) }, repo.name)),
      ...crumbs.map((crumb) => h('li', {}, crumb))));
}

function blobHeader(repo, branch, path, info) {
  const { language, lines } = info;
  const maintain = isMaintainer(repo);
  const rawHref = `/${repo.fullName}/raw/${branch}/${path}`;

  const moreMenu = h('ul', { class: 'dropdown-menu', role: 'menu', 'aria-label': 'More file actions', hidden: true },
    h('li', { role: 'none' }, h('a', { class: 'dropdown-item', role: 'menuitem', href: `/${repo.fullName}/blame/${branch}/${path}`, tabindex: '-1' },
      icon('quote', { size: 16 }), h('span', {}, 'View blame'))),
    h('li', { role: 'none' }, h('a', { class: 'dropdown-item', role: 'menuitem', href: `/${repo.fullName}/history/${branch}/${path}`, tabindex: '-1' },
      icon('history', { size: 16 }), h('span', {}, 'View file history'))),
    h('li', { role: 'none' }, h('a', { class: 'dropdown-item', role: 'menuitem', href: `/${repo.fullName}/commits/${branch}/${path}`, tabindex: '-1' },
      icon('git-commit', { size: 16 }), h('span', {}, 'Commits for this path'))),
    maintain
      ? h('li', { role: 'none' }, h('button', {
        class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
        onClick: () => confirmDelete(repo, branch, path),
      }, icon('trash', { size: 16 }), h('span', {}, 'Delete file')))
      : null,
    h('li', { role: 'none' }, h('button', {
      class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
      onClick: () => openCopyPathDialog(repo, branch, path),
    }, icon('link', { size: 16 }), h('span', {}, 'Copy permalink'))));

  const moreTrigger = h('button', {
    class: 'btn btn-sm', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'More file actions',
  }, icon('kebab', { size: 16 }));
  attachMenu(moreTrigger, moreMenu, { align: 'right' });

  return h('div', { class: 'blob-header' },
    icon(IMAGE_EXT.includes(info.ext) ? 'image' : 'file', { size: 16 }),
    h('span', { class: 'path' }, path),
    h('span', { class: 'blob-language text-muted' }, language, ' · ', `${lines.length} lines`),
    h('div', { class: 'blob-actions' },
      copyButton(() => info.local?.content ?? repoFile(repo, path)?.content ?? '', { label: 'Copy raw file content' }),
      maintain ? h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/edit/${branch}/${path}` }, icon('pencil', { size: 16 }), 'Edit') : null,
      h('a', { class: 'btn btn-sm', href: rawHref }, icon('code', { size: 16 }), 'Raw'),
      h('button', {
        class: 'btn btn-sm', type: 'button', 'aria-pressed': String(getPrefs().wrapLines === true),
        title: 'Toggle line wrapping',
        onClick: (event) => {
          const next = !(getPrefs().wrapLines === true);
          setPref('wrapLines', next);
          event.currentTarget.setAttribute('aria-pressed', String(next));
          const wrap = document.querySelector('.blob-wrap');
          if (wrap) wrap.dataset.wrap = String(next);
        },
      }, icon('unified', { size: 16 }), 'Wrap'),
      h('div', { class: 'dropdown' }, moreTrigger, moreMenu)));
}

function blobMeta(repo, branch, path, info) {
  const { lines, bytes, language, lastCommit } = info;
  return h('div', { class: 'blob-meta' },
    h('span', {}, `${lines.length} lines`),
    h('span', {}, formatBytes(bytes)),
    h('span', {}, language),
    lastCommit
      ? h('span', {},
        h('a', { href: `/${repo.fullName}/commit/${lastCommit.sha}` }, lastCommit.shortSha || lastCommit.sha.slice(0, 7)),
        ' · ', firstLine(lastCommit.message), ' · ', relativeTimeEl(lastCommit.date))
      : null);
}

function firstLine(message) {
  return String(message || '').split('\n')[0];
}

function blobContent(repo, branch, path, content, info) {
  const { ext, language, lines } = info;

  // Images: render an inline SVG/data preview when the mock content is SVG.
  if (IMAGE_EXT.includes(ext)) {
    if (ext === 'svg') {
      const holder = h('div', { class: 'blob-rendered blob-image' });
      const inner = h('div', { class: 'blob-svg-preview' });
      inner.innerHTML = String(content);
      holder.appendChild(inner);
      return h('div', { class: 'blob-wrap' }, holder);
    }
    return h('div', { class: 'blob-wrap' },
      h('div', { class: 'blob-binary' },
        icon('image', { size: 32 }),
        h('p', {}, 'This is a binary image in the demo dataset.'),
        h('p', { class: 'text-small text-muted' }, 'RedGet never requests external objects, so the pixel data is not available. The metadata below is what a real blob view would show.')));
  }

  // Rendered documents: Preview / Code tabs.
  if (RENDERED_EXT.includes(ext) && (ext === 'md' || ext === 'markdown')) {
    return renderedDocument(repo, branch, path, content);
  }

  if (isTooLarge(content)) {
    return h('div', { class: 'blob-wrap' },
      h('div', { class: 'blob-too-large' },
        icon('alert', { size: 32 }),
        h('p', {}, 'This file is too large to render inline.'),
        h('p', { class: 'text-small text-muted' }, `Limit in this demo: ${formatBytes(MAX_RENDER_BYTES)}. Use Raw to see the text anyway.`)));
  }

  const wrap = getPrefs().wrapLines === true;
  const table = codeTable(content, language, {
    wrap,
    onLineClick: (lineNumber, event) => {
      event.preventDefault();
      const hash = event.shiftKey && window.location.hash.startsWith('#L')
        ? `${window.location.hash}-L${lineNumber}`
        : `#L${lineNumber}`;
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}${hash}`);
      highlightLineRange(hash);
    },
  });

  const container = h('div', { class: 'blob-wrap', dataset: { wrap: String(wrap) } }, table);
  requestAnimationFrame(() => highlightLineRange(window.location.hash));
  return container;
}

function isTooLarge(content) {
  return String(content).length > MAX_RENDER_BYTES;
}

function highlightLineRange(hash) {
  const wrap = document.querySelector('.blob-wrap');
  if (!wrap) return;
  wrap.querySelectorAll('.blob-line-number.is-highlighted, .blob-code-line.is-target')
    .forEach((node) => node.classList.remove('is-highlighted', 'is-target'));
  const match = /^#L(\d+)(?:-L(\d+))?$/.exec(hash || '');
  if (!match) return;
  const from = Number(match[1]);
  const to = match[2] ? Number(match[2]) : from;
  for (let line = Math.min(from, to); line <= Math.max(from, to); line += 1) {
    const anchor = wrap.querySelector(`#L${line}`);
    if (anchor) {
      anchor.classList.add('is-highlighted');
      const codeLine = wrap.querySelectorAll('.blob-code-line')[line - 1];
      if (codeLine) codeLine.classList.add('is-target');
    }
  }
  const first = wrap.querySelector(`#L${Math.min(from, to)}`);
  if (first && typeof first.scrollIntoView === 'function') first.scrollIntoView({ block: 'center' });
}

function renderedDocument(repo, branch, path, content) {
  const preview = h('div', { class: 'blob-rendered' }, markdownNode(content, { repo }));
  const code = h('div', { class: 'blob-wrap', hidden: true }, codeTable(content, 'markdown', { wrap: false }));

  const previewTab = h('button', {
    class: 'tab is-active', type: 'button', role: 'tab', id: 'blob-tab-preview',
    'aria-selected': 'true', 'aria-controls': 'blob-panel-preview',
  }, 'Preview');
  const codeTab = h('button', {
    class: 'tab', type: 'button', role: 'tab', id: 'blob-tab-code',
    'aria-selected': 'false', 'aria-controls': 'blob-panel-code',
  }, 'Code');

  const show = (which) => {
    const isPreview = which === 'preview';
    previewTab.classList.toggle('is-active', isPreview);
    codeTab.classList.toggle('is-active', !isPreview);
    previewTab.setAttribute('aria-selected', String(isPreview));
    codeTab.setAttribute('aria-selected', String(!isPreview));
    preview.hidden = !isPreview;
    code.hidden = isPreview;
  };
  preview.id = 'blob-panel-preview';
  preview.setAttribute('role', 'tabpanel');
  preview.setAttribute('aria-labelledby', 'blob-tab-preview');
  code.id = 'blob-panel-code';
  code.setAttribute('role', 'tabpanel');
  code.setAttribute('aria-labelledby', 'blob-tab-code');
  previewTab.addEventListener('click', () => show('preview'));
  codeTab.addEventListener('click', () => show('code'));

  return h('div', { class: 'blob-document' },
    h('div', { class: 'tabs blob-tabs', role: 'tablist', 'aria-label': 'File display mode' }, previewTab, codeTab),
    preview,
    code);
}

/* ============================================================== blame view */

export function renderBlame(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const branch = ctx.params.branch || repo.defaultBranch;
  const path = String(ctx.params.path || '');
  const record = repoFile(repo, path);
  const local = api.localFile(repo.fullName, path);
  const content = local && !api.isDeletedFile(repo.fullName, path) ? local.content : (record ? record.content : null);

  if (content == null) {
    return repoShell(repo, 'code', { fullWidth: true, main: notFoundBody({ title: `No file at ${path}`, href: treeHref(repo, branch), label: 'Back to the tree', code: '404' }) });
  }

  const lines = String(content).split('\n');
  const history = commitsForFile(repo, path, branch);
  const groups = blameGroups(lines, history, repo);
  const language = record?.language || languageForPath(path);

  const rows = [];
  let groupIndex = 0;
  groups.forEach((group) => {
    const commit = group.commit;
    const cell = h('td', { class: 'blame-commit', rowSpan: String(group.count) },
      commit
        ? h('div', { class: 'blame-commit-inner' },
          h('a', { class: 'msg', href: `/${repo.fullName}/commit/${commit.sha}`, title: commit.message }, firstLine(commit.message)),
          h('span', { class: 'meta' },
            h('a', { href: `/${commit.authorLogin}` }, commit.authorLogin),
            ' · ', relativeTimeEl(commit.date),
            ' · ', commit.shortSha || commit.sha.slice(0, 7)),
          commit.verified ? h('span', { class: 'verified-badge', title: 'Signed and verified' }, icon('shield-check', { size: 16 })) : null)
        : h('div', { class: 'blame-commit-inner' }, h('span', { class: 'msg text-muted' }, 'Not committed yet')));

    group.lines.forEach((line, offset) => {
      const number = group.start + offset;
      const codeCell = h('td', { class: 'blame-code' });
      const span = h('span', {});
      span.innerHTML = highlight(line, language) || '&nbsp;';
      codeCell.appendChild(span);

      const row = h('tr', { class: groupIndex % 2 ? 'blame-group-alt' : null },
        offset === 0 ? cell : null,
        h('td', { class: 'blame-line-no', 'aria-hidden': 'true' },
          h('a', { class: 'blob-line-number', href: `#L${number}`, id: `blame-L${number}` }, String(number))),
        codeCell);
      rows.push(row);
    });
    groupIndex += 1;
  });

  const table = h('table', { class: 'blame-table' },
    h('caption', {}, `Blame for ${path} at ${branch}: every line with the commit that last changed it`),
    h('tbody', {}, ...rows));

  const main = h('div', { class: 'blob-page blame-page' },
    codeToolbar(repo, { branch, path, onGoToFile: () => openGoToFile(repo, branch) }),
    pathBreadcrumb(repo, branch, path),
    h('div', { class: 'blob-header' },
      icon('quote', { size: 16 }),
      h('span', { class: 'path' }, path),
      h('span', { class: 'text-muted' }, `${lines.length} lines · ${groups.length} commit ${groups.length === 1 ? 'group' : 'groups'}`),
      h('div', { class: 'blob-actions' },
        h('a', { class: 'btn btn-sm', href: blobHref(repo, branch, path) }, icon('file', { size: 16 }), 'View file'),
        h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/history/${branch}/${path}` }, icon('history', { size: 16 }), 'History'),
        copyButton(() => String(content), { label: 'Copy file content' }))),
    h('div', { class: 'blob-wrap blame-wrap' }, h('div', { class: 'blob-scroll' }, table)));

  return repoShell(repo, 'code', { main, fullWidth: true });
}

/**
 * Group consecutive lines by the commit that last touched them. The mock dataset
 * stores changed paths per commit (not per line), so lines are attributed by
 * walking history newest → oldest and assigning each commit a contiguous band.
 * Locally edited files attribute every line to the local commit.
 */
function blameGroups(lines, history, repo) {
  const total = lines.length;
  if (!total) return [];
  if (!history.length) return [{ start: 1, count: total, lines, commit: null }];

  const bands = Math.min(history.length, Math.max(1, Math.ceil(total / 12)));
  const size = Math.ceil(total / bands);
  const groups = [];
  for (let index = 0; index < bands; index += 1) {
    const start = index * size;
    if (start >= total) break;
    const end = Math.min(total, start + size);
    groups.push({ start: start + 1, count: end - start, lines: lines.slice(start, end), commit: history[index] || history[history.length - 1] });
  }
  return groups;
}

/* ============================================================ history view */

export function renderHistory(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const branch = ctx.params.branch || repo.defaultBranch;
  const path = String(ctx.params.path || '');
  const page = queryPage(ctx.query.page, 1);
  const commits = commitsForFile(repo, path, branch);
  const { items, pages, total } = paginate(commits, page, LIMITS.pageSize);

  const main = h('div', {},
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, icon('history', { size: 20 }), ' Commits for ', h('code', { class: 'code-inline' }, path || '/')),
        h('p', { class: 'page-subtitle' }, `${total} commits on ${branch} in ${repo.fullName}.`)),
      h('div', { class: 'page-header-actions' },
        h('a', { class: 'btn btn-sm', href: blobHref(repo, branch, path || '') }, icon('file', { size: 16 }), 'View file'),
        h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/commits/${branch}` }, icon('git-commit', { size: 16 }), 'All commits'))),
    items.length
      ? h('ul', { class: 'commit-list', role: 'list' }, ...items.map((commit) => commitRow(repo, commit)))
      : emptyState({ icon: 'history', title: 'No commits for this path', body: 'Create the file or switch to another branch.' }),
    pagination({ page, pages, total, hrefFor: (n) => `/${repo.fullName}/history/${branch}/${path}?page=${n}`, onPage: (n) => navigate(`/${repo.fullName}/history/${branch}/${path}?page=${n}`) }));

  return repoShell(repo, 'code', { main, fullWidth: true });
}

export function commitRow(repo, commit, options = {}) {
  const db = getDatabase();
  const author = (db.users || []).find((u) => u.login === commit.authorLogin);
  const files = commit.files || [];
  return h('li', { class: 'commit-row box-row' },
    h('div', { class: 'commit-row-main' },
      h('div', { class: 'commit-row-title' },
        h('a', { class: 'commit-message-link', href: `/${repo.fullName}/commit/${commit.sha}` }, firstLine(commit.message)),
        commit.verified ? h('span', { class: 'verified-badge', title: 'Signed and verified' }, icon('shield-check', { size: 16 }), ' Verified') : null),
      h('div', { class: 'commit-row-meta text-small text-muted' },
        h('a', { class: 'commit-author', href: `/${commit.authorLogin}` }, commit.authorLogin),
        ' committed ', relativeTimeEl(commit.date),
        files.length ? h('span', {}, ` · ${files.length} ${files.length === 1 ? 'file' : 'files'}`) : null),
      options.showFiles && files.length
        ? h('ul', { class: 'commit-file-list', role: 'list' }, ...files.slice(0, 6).map((file) => h('li', {},
          h('a', { class: 'code-inline', href: blobHref(repo, commit.branch || repo.defaultBranch, file) }, file))))
        : null),
    h('div', { class: 'commit-row-side' },
      h('span', { class: 'commit-sha-badge' },
        h('code', { class: 'code-inline' }, commit.shortSha || commit.sha.slice(0, 7)),
        copyButton(() => commit.sha, { label: `Copy full SHA ${commit.sha}` })),
      h('span', { class: 'commit-diffstat' },
        h('span', { class: 'text-success' }, `+${commit.additions || 0}`),
        ' ', h('span', { class: 'text-danger' }, `-${commit.deletions || 0}`))));
}

/* ================================================================ raw view */

export function renderRaw(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const branch = ctx.params.branch || repo.defaultBranch;
  const path = String(ctx.params.path || '');
  const record = repoFile(repo, path);
  const local = api.localFile(repo.fullName, path);
  const content = local && !api.isDeletedFile(repo.fullName, path) ? local.content : (record ? record.content : null);

  const main = h('div', {},
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, icon('code', { size: 20 }), ' Raw file'),
        h('p', { class: 'page-subtitle' }, `${repo.fullName} · ${branch} · ${path}`)),
      h('div', { class: 'page-header-actions' },
        copyButton(() => String(content ?? ''), { label: 'Copy raw content' }),
        h('a', { class: 'btn btn-sm', href: blobHref(repo, branch, path) }, icon('file', { size: 16 }), 'Back to blob view'))),
    content == null
      ? emptyState({ icon: 'file', title: 'Nothing to show', body: `No file at ${path} on ${branch}.` })
      : h('div', { class: 'raw-view card card-flush' },
        h('pre', { class: 'raw-pre' }, h('code', {}, String(content)))));

  return repoShell(repo, 'code', { main, fullWidth: true });
}

/* =============================================================== edit view */

export function renderEdit(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo, maintainer } = found;
  const branch = ctx.params.branch || repo.defaultBranch;
  const path = String(ctx.params.path || '');
  const record = repoFile(repo, path);
  const local = api.localFile(repo.fullName, path);
  const initial = local && !api.isDeletedFile(repo.fullName, path) ? local.content : (record ? record.content : '');

  if (!maintainer) {
    return repoShell(repo, 'code', {
      fullWidth: true,
      main: notFoundBody({
        title: 'You need write access to edit files',
        description: `Signed in as ${getSession().login}, you have read access to ${repo.fullName} only. Fork the repository and open a pull request instead.`,
        href: `/${repo.fullName}`, label: 'Back to the repository', code: '403',
      }),
    });
  }

  const editor = h('textarea', {
    class: 'input code-editor', rows: '28', spellcheck: 'false',
    'aria-label': `File content for ${path}`, 'aria-describedby': 'editor-help',
  });
  editor.value = String(initial ?? '');

  const message = h('input', {
    class: 'input', type: 'text', placeholder: `Update ${path.split('/').pop()}`,
    'aria-label': 'Commit message', value: `Update ${path.split('/').pop()}`,
  });
  const body = h('textarea', { class: 'input', rows: '4', placeholder: 'Add an optional extended description…', 'aria-label': 'Extended commit description' });

  const branchName = `${getSession().login || 'octored'}-patch-${Math.floor(Math.random() * 90 + 10)}`;
  const commitRadio = h('input', { type: 'radio', name: 'commit-choice', id: 'commit-direct', value: 'direct', checked: 'checked' });
  const prRadio = h('input', { type: 'radio', name: 'commit-choice', id: 'commit-branch', value: 'branch' });

  const status = h('p', { class: 'editor-status text-small text-muted', role: 'status', 'aria-live': 'polite' },
    `${String(initial ?? '').split('\n').length} lines · ${formatBytes(estimateBytes(initial ?? ''))}`);

  editor.addEventListener('input', () => {
    const value = editor.value;
    status.textContent = `${value.split('\n').length} lines · ${formatBytes(estimateBytes(value))} · unsaved changes`;
    editor.setAttribute('aria-invalid', 'false');
  });

  // Tab inserts two spaces instead of moving focus out of the editor.
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Tab' && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = `${editor.value.slice(0, start)}  ${editor.value.slice(end)}`;
      editor.setSelectionRange(start + 2, start + 2);
      editor.dispatchEvent(new Event('input'));
    }
  });

  const submit = () => {
    const content = editor.value;
    if (!content.trim()) {
      editor.setAttribute('aria-invalid', 'true');
      toast({ message: 'The file is empty — commit a deletion instead', variant: 'danger' });
      editor.focus();
      return;
    }
    const useBranch = prRadio.checked;
    api.saveFile(repo.fullName, {
      path,
      content,
      message: message.value.trim() || `Update ${path}`,
      body: body.value,
      branch: useBranch ? branchName : branch,
    });
    toast({
      message: useBranch
        ? `Committed to ${branchName}. Open a pull request to merge it into ${branch}.`
        : `Committed to ${branch}`,
      variant: 'success',
    });
    if (useBranch) navigate(`/${repo.fullName}/pull/new/${branch}...${branchName}`);
    else navigate(blobHref(repo, branch, path));
  };

  const form = h('form', {
    class: 'file-editor-form',
    onSubmit: (event) => { event.preventDefault(); submit(); },
  },
    h('div', { class: 'editor-header' },
      h('div', { class: 'editor-path' },
        icon('pencil', { size: 16 }),
        h('span', { class: 'path' }, path),
        badge(branch, 'neutral')),
      status),
    h('label', { class: 'sr-only', for: 'code-editor' }, `Editing ${path}`),
    editor,
    h('p', { class: 'field-help', id: 'editor-help' },
      'Tab inserts two spaces. ', h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Enter'), ' commits. Changes are stored in localStorage as a patch.'),
    h('div', { class: 'commit-box card' },
      h('h2', { class: 'card-title' }, 'Commit changes'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Commit message'), message),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Extended description'), body,
        h('span', { class: 'field-help' }, 'Markdown is supported and shows up in the commit detail page.')),
      h('fieldset', { class: 'commit-target' },
        h('legend', {}, 'Where should this commit go?'),
        h('label', { class: 'radio-row' }, commitRadio,
          h('span', {}, h('strong', {}, `Commit directly to ${branch}`),
            h('span', { class: 'text-small text-muted d-block' }, repo.defaultBranch === branch ? 'This is the default branch.' : 'This branch is not the default branch.'))),
        h('label', { class: 'radio-row' }, prRadio,
          h('span', {}, h('strong', {}, `Create a new branch and start a pull request`),
            h('span', { class: 'text-small text-muted d-block' }, `Suggested name: ${branchName}`)))),
      h('div', { class: 'form-actions' },
        h('button', { class: 'btn btn-primary', type: 'submit' }, icon('git-commit', { size: 16 }), 'Commit changes'),
        h('a', { class: 'btn', href: blobHref(repo, branch, path) }, 'Cancel'),
        h('button', {
          class: 'btn btn-danger', type: 'button',
          onClick: () => confirmDelete(repo, branch, path),
        }, icon('trash', { size: 16 }), 'Delete file'))));

  const main = h('div', {},
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Editing ', h('code', { class: 'code-inline' }, path)),
        h('p', { class: 'page-subtitle' }, `${repo.fullName} at ${branch}. The editor writes to the local patch log — nothing is uploaded.`))),
    form);

  return repoShell(repo, 'code', { main, fullWidth: true });
}

function confirmDelete(repo, branch, path) {
  const message = h('input', { class: 'input', type: 'text', value: `Delete ${path}`, 'aria-label': 'Commit message' });
  openDialog({
    title: `Delete ${path}?`,
    body: h('div', { class: 'dialog-form' },
      h('p', {}, 'A commit recording the deletion is added to ', h('code', { class: 'code-inline' }, branch), '. The file disappears from the tree until you reset the demo data.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Commit message'), message)),
    footer: (close) => [
      h('button', { class: 'btn', type: 'button', 'data-close': 'true' }, 'Cancel'),
      h('button', {
        class: 'btn btn-danger', type: 'button',
        onClick: () => {
          api.deleteFile(repo.fullName, path, message.value.trim());
          close();
          toast({ message: `${path} deleted`, variant: 'success' });
          navigate(treeHref(repo, branch, path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''));
        },
      }, 'Delete file'),
    ],
  });
}

/* ============================================================== new + upload */

export function renderNewFile(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo, maintainer } = found;
  const branch = ctx.params.branch || repo.defaultBranch;
  const prefix = String(ctx.params.path || '');

  if (!maintainer) {
    return repoShell(repo, 'code', { fullWidth: true, main: notFoundBody({ title: 'Write access required', description: `Fork ${repo.fullName} to add files.`, href: `/${repo.fullName}`, label: 'Back to the repository', code: '403' }) });
  }

  const nameInput = h('input', {
    class: 'input input-mono', type: 'text', placeholder: prefix ? 'new-file.md' : 'docs/new-file.md',
    'aria-label': 'New file path', value: prefix ? `${prefix}/` : '',
  });
  const editor = h('textarea', { class: 'input code-editor', rows: '20', 'aria-label': 'File content', spellcheck: 'false', placeholder: 'Write the file contents…' });
  const message = h('input', { class: 'input', type: 'text', value: 'Create new file', 'aria-label': 'Commit message' });

  const previewPane = h('div', { class: 'blob-rendered', hidden: true });
  const previewButton = h('button', {
    class: 'btn btn-sm', type: 'button',
    onClick: () => {
      const hidden = previewPane.hidden;
      previewPane.hidden = !hidden;
      previewButton.setAttribute('aria-expanded', String(hidden));
      if (hidden) {
        previewPane.replaceChildren(/\.md$/.test(nameInput.value)
          ? markdownNode(editor.value, { repo })
          : h('pre', {}, h('code', {}, editor.value)));
      }
    },
  }, icon('eye', { size: 16 }), 'Preview');
  previewButton.setAttribute('aria-expanded', 'false');

  const submit = () => {
    const path = nameInput.value.trim().replace(/^\/+/, '');
    if (!path) { toast({ message: 'Give the file a path', variant: 'attention' }); nameInput.focus(); return; }
    if (path.endsWith('/')) { toast({ message: 'That is a directory path, not a file', variant: 'danger' }); return; }
    api.saveFile(repo.fullName, { path, content: editor.value, message: message.value.trim() || `Create ${path}`, branch });
    toast({ message: `Created ${path} on ${branch}`, variant: 'success' });
    navigate(blobHref(repo, branch, path));
  };

  const main = h('div', {},
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Create a new file'),
        h('p', { class: 'page-subtitle' }, `${repo.fullName} · committing to ${branch}`))),
    h('form', { class: 'file-editor-form', onSubmit: (event) => { event.preventDefault(); submit(); } },
      h('div', { class: 'editor-header' },
        h('label', { class: 'editor-path grow' },
          h('span', { class: 'sr-only' }, 'File path'),
          nameInput),
        previewButton),
      editor,
      previewPane,
      h('div', { class: 'commit-box card' },
        h('h2', { class: 'card-title' }, 'Commit new file'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Commit message'), message),
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-primary', type: 'submit' }, icon('git-commit', { size: 16 }), 'Commit new file'),
          h('a', { class: 'btn', href: treeHref(repo, branch, prefix) }, 'Cancel')))));

  return repoShell(repo, 'code', { main, fullWidth: true });
}

export function renderUpload(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo, maintainer } = found;
  const branch = ctx.params.branch || repo.defaultBranch;
  const prefix = String(ctx.params.path || '');
  const queued = [];

  const list = h('ul', { class: 'upload-list', role: 'list', 'aria-live': 'polite' });
  const paint = () => {
    list.replaceChildren(...queued.map((entry, index) => h('li', { class: 'upload-item box-row' },
      icon('file', { size: 16 }),
      h('span', { class: 'upload-name' }, entry.name),
      h('span', { class: 'upload-size text-small text-muted' }, formatBytes(entry.size)),
      h('span', { class: 'upload-status text-success' }, icon('check', { size: 16 }), ' Ready'),
      h('button', {
        class: 'btn btn-sm', type: 'button', 'aria-label': `Remove ${entry.name}`,
        onClick: () => { queued.splice(index, 1); paint(); },
      }, icon('x', { size: 16 })))));
    if (!queued.length) {
      list.replaceChildren(h('li', { class: 'upload-empty text-small text-muted' }, 'No files selected yet.'));
    }
  };
  paint();

  const dropzone = h('div', {
    class: 'upload-dropzone', tabindex: '0', role: 'button',
    'aria-label': 'Add files to upload. Drag and drop is simulated in this demo; use the button to pick files.',
  },
    icon('upload', { size: 32 }),
    h('p', {}, h('strong', {}, 'Drag files here'), ' or ',
      h('button', { class: 'btn-link', type: 'button', id: 'upload-choose' }, 'choose your files')),
    h('p', { class: 'text-small text-muted' }, `Files are committed to ${branch}${prefix ? ` under ${prefix}/` : ''}. Nothing is uploaded anywhere: RedGet stores content in localStorage.`));

  const fileInput = h('input', {
    class: 'sr-only', type: 'file', multiple: true, id: 'upload-input',
    onChange: (event) => {
      Array.from(event.target.files || []).forEach((file) => queued.push({ name: file.name, size: file.size }));
      paint();
    },
  });
  dropzone.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    fileInput.click();
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); }
  });
  const choose = dropzone.querySelector('#upload-choose');
  if (choose) choose.addEventListener('click', (event) => { event.stopPropagation(); fileInput.click(); });

  const message = h('input', { class: 'input', type: 'text', value: prefix ? `Add files to ${prefix}` : 'Add files', 'aria-label': 'Commit message' });

  const main = h('div', {},
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Upload files'),
        h('p', { class: 'page-subtitle' }, `${repo.fullName} · ${branch}${prefix ? ` · ${prefix}/` : ''}`))),
    maintainer ? null : h('div', { class: 'flash flash-attention', role: 'status' },
      icon('alert', { size: 16 }), ' You can browse this repository, but only collaborators can commit. '),
    h('form', {
      class: 'upload-form',
      onSubmit: (event) => {
        event.preventDefault();
        if (!queued.length) { toast({ message: 'Choose at least one file', variant: 'attention' }); return; }
        queued.forEach((entry) => {
          api.saveFile(repo.fullName, {
            path: prefix ? `${prefix}/${entry.name}` : entry.name,
            content: `Uploaded ${entry.name} (${entry.size} bytes)\n\nThis is placeholder content: RedGet runs offline, so real file bytes are never read from disk.`,
            message: message.value.trim() || `Add ${entry.name}`,
            branch,
          });
        });
        toast({ message: `Committed ${queued.length} ${queued.length === 1 ? 'file' : 'files'} to ${branch}`, variant: 'success' });
        navigate(treeHref(repo, branch, prefix));
      },
    },
      dropzone,
      fileInput,
      h('div', { class: 'upload-queue card card-flush' },
        h('h2', { class: 'card-title' }, 'Selected files'),
        list),
      h('div', { class: 'commit-box card' },
        h('h2', { class: 'card-title' }, 'Commit changes'),
        h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Commit message'), message),
        h('div', { class: 'form-actions' },
          h('button', { class: 'btn btn-primary', type: 'submit' }, icon('git-commit', { size: 16 }), 'Commit changes'),
          h('a', { class: 'btn', href: treeHref(repo, branch, prefix) }, 'Cancel')))));

  return repoShell(repo, 'code', { main, fullWidth: true });
}

/* ------------------------------------------------------------ copy permalink */

function openCopyPathDialog(repo, branch, path) {
  const commit = commitsForFile(repo, path, branch)[0];
  const sha = commit ? commit.sha : branch;
  const rows = [
    { label: 'Permalink', value: `/${repo.fullName}/blob/${sha}/${path}` },
    { label: 'Branch link', value: blobHref(repo, branch, path) },
    { label: 'Raw', value: `/${repo.fullName}/raw/${branch}/${path}` },
    { label: 'Blame', value: `/${repo.fullName}/blame/${branch}/${path}` },
    { label: 'History', value: `/${repo.fullName}/history/${branch}/${path}` },
    { label: 'CLI', value: `rgt file cat ${repo.fullName} ${path} --ref ${branch}` },
  ];

  openDialog({
    title: 'Copy a link to this file',
    body: h('div', { class: 'dialog-form' },
      ...rows.map((row) => h('div', { class: 'copy-row' },
        h('span', { class: 'copy-row-label' }, row.label),
        h('code', { class: 'copy-row-value code-inline' }, row.value),
        copyButton(() => row.value, { label: `Copy ${row.label}` })))),
    size: 'md',
  });
}

export default { render, renderBlame, renderHistory, renderRaw, renderEdit, renderNewFile, renderUpload, commitRow };
