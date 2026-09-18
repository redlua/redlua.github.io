/**
 * RedGet — commit history, commit detail and branch comparison.
 *
 * Commits (/:login/:repo/commits/:branch[/:path])
 *   <div class="commits-toolbar">   branch selector · path · count
 *   <ol class="commit-group-list">
 *     <li class="commit-group">
 *       <h2 class="commit-group-title">Commits on 15 September 2026</h2>
 *       <ul class="commit-list"><li class="commit-row">…</li></ul>
 *
 * Commit detail (/:login/:repo/commit/:sha)
 *   <div class="commit-detail-header">  avatar · title · body · sha badges · Browse files
 *   <div class="diff">                  from /src/components/diff.js (unified/split)
 *   <div class="comment-form">          composer for commit comments
 *
 * Compare (/:login/:repo/compare[/:range])
 *   <div class="compare-controls">      base ⇄ head branch selectors
 *   <div class="compare-commits">       commits ahead
 *   <div class="compare-diffstat">      file table with +/− blocks
 *   <div class="diff">                  combined diff
 *   <a class="btn btn-primary">Create pull request</a>
 */

import { h, icon } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { LIMITS } from '../config.js';
import * as api from '../core/api.js';
import { avatar } from '../components/avatars.js';
import { computeDiff, renderDiff, diffStat } from '../components/diff.js';
import { copyButton, toast, openDialog, confirmDialog } from '../components/overlay.js';
import {
  relativeTimeEl, emptyState, pagination, paginate, queryPage, counter,
} from '../components/kit.js';
import { shortDate } from '../core/util.js';
import { repoShell, branchSelector, repoNotFound } from '../components/repoChrome.js';
import {
  repoContext, repoCommits, commitsForFile, commitBySha, repoBranches, repoTags,
  commitDiffFiles, treeHref, rerender, db as getDatabase, notFoundBody,
  commentComposer, commentCard, linkedAuthor,
} from './_shared.js';
import { commitRow } from './repoBlob.js';

/* ============================================================ commits list */

export function render(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;

  const branch = ctx.params.branch || repo.defaultBranch;
  const path = String(ctx.params.path || '');
  const page = queryPage(ctx.query.page, 1);
  const author = ctx.query.author || '';

  let commits = path ? commitsForFile(repo, path, branch) : repoCommits(repo, branch);
  if (author) commits = commits.filter((c) => c.authorLogin === author || c.committerLogin === author);

  const { items, pages, total } = paginate(commits, page, LIMITS.pageSize);
  const groups = groupByDay(items);

  const main = h('div', {},
    h('div', { class: 'commits-toolbar' },
      branchSelector(repo, { branch, path }),
      h('span', { class: 'commits-count' },
        icon('git-commit', { size: 16 }),
        ` ${total} commit${total === 1 ? '' : 's'}`,
        path ? h('span', { class: 'text-muted' }, ` for `, h('code', { class: 'code-inline' }, path)) : null),
      h('span', { class: 'grow' }),
      path ? h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/commits/${branch}` }, icon('x', { size: 16 }), 'Clear path filter') : null,
      h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/branches` }, icon('git-branch', { size: 16 }), `${repoBranches(repo).length} branches`),
      h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/tags` }, icon('tag', { size: 16 }), `${repoTags(repo).length} tags`),
      h('button', {
        class: 'btn btn-sm', type: 'button',
        onClick: () => openAuthorFilter(repo, branch, commits),
      }, icon('person', { size: 16 }), author ? `Author: ${author}` : 'Filter by author')),

    total === 0
      ? emptyState({
        icon: 'git-commit',
        title: path ? `No commits for ${path}` : 'No commits on this branch yet',
        body: 'Commits appear here as soon as the repository has history.',
        action: h('a', { class: 'btn btn-primary', href: treeHref(repo, branch) }, 'Browse the files'),
      })
      : h('ol', { class: 'commit-group-list', role: 'list' },
        ...groups.map((group) => h('li', { class: 'commit-group' },
          h('h2', { class: 'commit-group-title' },
            h('span', {}, `Commits on ${group.label}`),
            counter(group.commits.length)),
          h('ul', { class: 'commit-list', role: 'list' },
            ...group.commits.map((commit) => commitRow(repo, commit, { showFiles: false })))))),

    pagination({
      page, pages, total,
      hrefFor: (n) => `/${repo.fullName}/commits/${branch}${path ? `/${path}` : ''}?page=${n}`,
      onPage: (n) => navigate(`/${repo.fullName}/commits/${branch}${path ? `/${path}` : ''}?page=${n}`),
    }));

  return repoShell(repo, 'code', { main, fullWidth: true });
}

function groupByDay(commits) {
  const map = new Map();
  commits.forEach((commit) => {
    const day = shortDate(commit.date);
    if (!map.has(day)) map.set(day, { label: day, date: commit.date, commits: [] });
    map.get(day).commits.push(commit);
  });
  return [...map.values()];
}

function openAuthorFilter(repo, branch, commits) {
  const counts = new Map();
  commits.forEach((commit) => counts.set(commit.authorLogin, (counts.get(commit.authorLogin) || 0) + 1));
  const authors = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const items = [
    h('li', {},
      h('button', {
        class: 'btn choice-button btn-block', type: 'button',
        onClick: () => { closeDialog(); navigate(`/${repo.fullName}/commits/${branch}`); },
      }, 'All authors', counter(commits.length))),
  ];

  authors.forEach(([login, count]) => {
    const button = h('button', {
      class: 'btn choice-button btn-block', type: 'button',
      onClick: () => {
        closeDialog();
        navigate(`/${repo.fullName}/commits/${branch}?author=${encodeURIComponent(login)}`);
      },
    });
    button.append(avatar({ login }, { size: 20 }), ` ${login}`, counter(count));
    items.push(h('li', {}, button));
  });

  openDialog({
    title: 'Filter commits by author',
    hideFooter: true,
    body: h('div', { class: 'dialog-form' },
      h('ul', { class: 'choice-list', role: 'list' }, ...items)),
  });
}

function closeDialog() {
  const open = document.querySelector('dialog[open]');
  if (open && typeof open.close === 'function') open.close();
}

/* =========================================================== commit detail */

export function renderCommit(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;

  const sha = String(ctx.params.sha || '');
  const commit = commitBySha(repo, sha);
  if (!commit) {
    return repoShell(repo, 'code', {
      fullWidth: true,
      main: notFoundBody({
        title: `No commit matching ${sha.slice(0, 12)}`,
        description: 'The commit may have been rewritten by a force push, or the SHA belongs to another repository.',
        href: `/${repo.fullName}/commits/${repo.defaultBranch}`,
        label: 'Back to the commit history',
        code: '404',
      }),
    });
  }

  const db = getDatabase();
  const author = (db.users || []).find((u) => u.login === commit.authorLogin);
  const committer = (db.users || []).find((u) => u.login === commit.committerLogin);
  const files = commitDiffFiles(commit);
  const diff = computeDiff(files);
  const comments = (db.comments || []).filter((c) => c.targetType === 'commit' && c.targetId === commit.sha);

  const messageLines = String(commit.message || '').split('\n');
  const subject = messageLines[0];
  const bodyText = messageLines.slice(1).join('\n').trim();

  const header = h('div', { class: 'commit-detail-header' },
    h('div', { class: 'commit-detail-title' },
      avatar(author || { login: commit.authorLogin }, { size: 40 }),
      h('div', {},
        h('h1', {}, subject),
        h('p', { class: 'text-small text-muted' },
          linkedAuthor(commit.authorLogin),
          ' committed ', relativeTimeEl(commit.date),
          commit.authorLogin !== commit.committerLogin ? h('span', {}, ' · committed by ', linkedAuthor(commit.committerLogin)) : null)),
      bodyText ? h('pre', { class: 'commit-detail-body' }, bodyText) : null),
    h('div', { class: 'commit-detail-side' },
      h('div', { class: 'commit-detail-sha' },
        h('code', { class: 'code-inline' }, commit.sha),
        copyButton(() => commit.sha, { label: 'Copy full SHA' })),
      commit.verified
        ? h('p', { class: 'verified-badge' }, icon('shield-check', { size: 16 }), ' Verified · signed commit')
        : h('p', { class: 'text-small text-muted' }, icon('shield-x', { size: 16 }), ' Unsigned commit'),
      h('p', { class: 'text-small text-muted' }, `${(commit.parents || []).length} ${commit.parents.length === 1 ? 'parent' : 'parents'}`),
      (commit.parents || []).length
        ? h('p', { class: 'text-small' }, ...commit.parents.map((parent, index) => h('span', {},
          index ? ', ' : 'Parent: ',
          h('a', { class: 'code-inline', href: `/${repo.fullName}/commit/${parent}` }, String(parent).slice(0, 7)))))
        : null,
      h('div', { class: 'commit-detail-actions' },
        h('a', { class: 'btn btn-sm', href: treeHref(repo, commit.branch || repo.defaultBranch) }, icon('file-directory', { size: 16 }), 'Browse files'),
        h('button', {
          class: 'btn btn-sm', type: 'button',
          onClick: () => openCherryPickDialog(repo, commit),
        }, icon('repo-push', { size: 16 }), 'Cherry-pick'),
        h('button', {
          class: 'btn btn-sm', type: 'button',
          onClick: () => openRevertDialog(repo, commit),
        }, icon('history', { size: 16 }), 'Revert'))));

  const diffstatTable = h('div', { class: 'diffstat-bar' },
    h('div', { class: 'diffstat-summary' },
      h('strong', {}, `${files.length} changed file${files.length === 1 ? '' : 's'}`),
      h('span', { class: 'text-success' }, ` +${diff.additions}`),
      h('span', { class: 'text-danger' }, ` −${diff.deletions}`)),
    h('ul', { class: 'diffstat-files', role: 'list' },
      ...files.map((file) => h('li', {},
        h('a', { class: 'diffstat-file', href: `#diff-${slugAnchor(file.path)}` },
          icon('file', { size: 16 }),
          h('span', { class: 'diffstat-path' }, file.path)),
        diffStat(file.additions || 0, file.deletions || 0, { showNumbers: false })))));

  const diffNode = renderDiff(diff, {
    repo,
    sha: commit.sha,
    comments: [],
    onAddComment: (payload) => {
      api.addComment('commit', commit.sha, `${payload.body}\n\n_Comment anchored at ${payload.path}:${payload.newNo || payload.oldNo}_`, { repoFullName: repo.fullName });
      rerender();
    },
  });

  const commentSection = h('section', { class: 'commit-comments', 'aria-labelledby': 'commit-comments-title' },
    h('h2', { class: 'section-title', id: 'commit-comments-title' }, 'Commit comments', counter(comments.length)),
    comments.length
      ? h('div', { class: 'comment-list' },
        ...comments.map((comment) => commentCard(comment, { repo, variant: 'commit', editable: true })))
      : h('p', { class: 'text-small text-muted' }, 'No comments on this commit yet.'),
    commentComposer({
      placeholder: 'Comment on this commit',
      submitLabel: 'Comment on this commit',
      repo,
      onSubmit: (body) => {
        api.addComment('commit', commit.sha, body, { repoFullName: repo.fullName });
        rerender();
        toast({ message: 'Comment added', variant: 'success' });
      },
    }));

  const main = h('div', { class: 'commit-detail' }, header, diffstatTable, diffNode, commentSection);
  return repoShell(repo, 'code', { main, fullWidth: true });
}

function slugAnchor(path) {
  return path.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}

function openCherryPickDialog(repo, commit) {
  const target = h('select', { class: 'input', 'aria-label': 'Target branch' },
    ...repoBranches(repo).filter((b) => b.name !== commit.branch).map((b) => h('option', { value: b.name }, b.name)));
  openDialog({
    title: `Cherry-pick ${commit.shortSha || commit.sha.slice(0, 7)}`,
    body: h('div', { class: 'dialog-form' },
      h('p', {}, 'Apply this commit onto another branch. In the demo this records the intent and shows the command RedGet CLI would run.'),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Target branch'), target),
      h('div', { class: 'copy-row' },
        h('span', { class: 'copy-row-label' }, 'Command'),
        h('code', { class: 'copy-row-value code-inline' }, `rgt cherry-pick ${commit.sha} --onto <branch>`),
        copyButton(() => `rgt cherry-pick ${commit.sha} --onto ${target.value}`, { label: 'Copy command' }))),
    confirmLabel: 'Cherry-pick',
    onConfirm: () => {
      toast({ message: `Cherry-picked onto ${target.value} (simulated)`, variant: 'success' });
      return true;
    },
  });
}

function openRevertDialog(repo, commit) {
  confirmDialog({
    title: `Revert ${commit.shortSha || commit.sha.slice(0, 7)}?`,
    body: `A new commit undoing “${String(commit.message).split('\n')[0]}” will be added to ${commit.branch || repo.defaultBranch}.`,
    confirmLabel: 'Revert this commit',
    danger: true,
  }).then((ok) => {
    if (!ok) return;
    api.saveFile(repo.fullName, {
      path: (commit.files && commit.files[0]) || 'REVERT.md',
      content: `Reverted ${commit.sha}\n\n${String(commit.message).split('\n')[0]}\n`,
      message: `Revert "${String(commit.message).split('\n')[0]}"`,
      body: `This reverts commit ${commit.sha}.`,
      branch: commit.branch || repo.defaultBranch,
    });
    rerender();
    toast({ message: 'Revert committed', variant: 'success' });
  });
}

/* ================================================================= compare */

export function renderCompare(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;

  const branches = repoBranches(repo);
  const parsed = parseRange(ctx.params.range, repo, branches);
  const all = repoCommits(repo);
  const baseCommits = all.filter((c) => c.branch === parsed.base);
  const headCommits = all.filter((c) => c.branch === parsed.head);
  const baseShas = new Set(baseCommits.map((c) => c.sha));
  const ahead = headCommits.filter((c) => !baseShas.has(c.sha)).slice(0, 40);

  const pathSet = new Map();
  ahead.forEach((commit) => commitDiffFiles(commit).forEach((file) => {
    if (!pathSet.has(file.path)) pathSet.set(file.path, { additions: 0, deletions: 0, status: file.status, path: file.path, tooLarge: false, oldContent: '', newContent: '' });
    const entry = pathSet.get(file.path);
    entry.additions += file.additions || 0;
    entry.deletions += file.deletions || 0;
    if (!file.tooLarge && !entry.oldContent) { entry.oldContent = file.oldContent; entry.newContent = file.newContent; entry.tooLarge = false; }
    else entry.tooLarge = entry.tooLarge || Boolean(file.tooLarge);
  }));
  const files = [...pathSet.values()];
  const diff = computeDiff(files);

  const controls = h('div', { class: 'compare-controls' },
    h('div', { class: 'compare-side' },
      h('span', { class: 'compare-label' }, 'base'),
      branchSelector(repo, {
        branch: parsed.base,
        onChange: (name) => navigate(`/${repo.fullName}/compare/${name}...${parsed.head}`),
      })),
    h('span', { class: 'compare-arrow', 'aria-hidden': 'true' }, icon('arrow-right', { size: 16 })),
    h('div', { class: 'compare-side' },
      h('span', { class: 'compare-label' }, parsed.direction === 'two-dot' ? 'head (two-dot)' : 'compare'),
      branchSelector(repo, {
        branch: parsed.head,
        onChange: (name) => navigate(`/${repo.fullName}/compare/${parsed.base}...${name}`),
      })),
    h('span', { class: 'grow' }),
    h('a', {
      class: 'btn btn-primary', href: `/${repo.fullName}/pull/new/${parsed.base}...${parsed.head}`,
    }, icon('git-pull-request', { size: 16 }), 'Create pull request'));

  const summary = h('div', { class: 'compare-summary' },
    h('p', {},
      h('strong', {}, `${ahead.length} commit${ahead.length === 1 ? '' : 's'}`),
      ' and ', h('strong', {}, `${files.length} file${files.length === 1 ? '' : 's'}`),
      ' changed between ', h('code', { class: 'code-inline' }, parsed.base),
      ' and ', h('code', { class: 'code-inline' }, parsed.head),
      h('span', { class: 'text-success' }, ` with ${diff.additions} additions`),
      h('span', { class: 'text-danger' }, ` and ${diff.deletions} deletions`), '.'));

  const commitList = ahead.length
    ? h('section', { class: 'compare-commits' },
      h('h2', { class: 'section-title' }, 'Commits', counter(ahead.length)),
      h('ul', { class: 'commit-list', role: 'list' }, ...ahead.map((commit) => commitRow(repo, commit))))
    : emptyState({
      icon: 'git-compare',
      title: 'There is nothing to compare',
      body: `${parsed.base} and ${parsed.head} point at the same history. Pick a different branch above.`,
    });

  const filesSection = files.length
    ? h('section', { class: 'compare-files' },
      h('h2', { class: 'section-title' }, 'Files changed', counter(files.length)),
      renderDiff(diff, { repo, sha: `${parsed.base}...${parsed.head}` }))
    : null;

  const main = h('div', { class: 'compare-page' },
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, icon('git-compare', { size: 20 }), ' Comparing changes'),
        h('p', { class: 'page-subtitle' }, 'Choose two branches to see a summary of the changes and the resulting diff.'))),
    controls,
    summary,
    commitList,
    filesSection);

  return repoShell(repo, 'code', { main, fullWidth: true });
}

function parseRange(range, repo, branches) {
  const raw = String(range || '');
  const threeDot = /^(.+?)\.\.\.(.+)$/.exec(raw);
  const twoDot = /^(.+?)\.\.(.+)$/.exec(raw);
  if (threeDot) return { base: threeDot[1], head: threeDot[2], direction: 'three-dot' };
  if (twoDot) return { base: twoDot[1], head: twoDot[2], direction: 'two-dot' };

  const names = branches.map((b) => b.name);
  const fallbackHead = names.find((n) => n !== repo.defaultBranch) || repo.defaultBranch;
  return { base: repo.defaultBranch, head: raw && names.includes(raw) ? raw : fallbackHead, direction: 'three-dot' };
}

export default { render, renderCommit, renderCompare };
