/**
 * RedGet — repository pull request list and "new pull request" flow.
 *
 * List markup mirrors the issue list (see /src/pages/repoIssues.js) with two
 * extra columns: the review state and the check summary.
 *
 *   <nav class="subnav">Pull requests · Compare</nav>
 *   <form class="filter-bar" role="search">Author / Label / Assignee / Reviewer / Sort</form>
 *   <div class="state-tabs" role="group">9 Open · 28 Closed</div>
 *   <div class="item-list" role="list">
 *     <div class="item-row">
 *       <span class="item-row-status"><svg class="icon-git-pull-request"></span>
 *       <div class="item-row-main">
 *         <span class="item-row-title"><a>Pair deletions…</a> <span class="badge">Draft</span></span>
 *         <span class="item-row-labels">…</span>
 *         <div class="item-row-meta">#43 opened 2 months ago by nova · ✓ 3/3 checks · 2 approvals</div>
 *       </div>
 *       <span class="item-row-side">reviewer avatars</span>
 *       <span class="item-row-comments">💬 9</span>
 *
 * New pull request (/:login/:repo/pull/new[/:range])
 *   <div class="compare-controls"> base ⇄ compare branch selectors </div>
 *   <ul class="commit-list"> commits that would be merged </ul>
 *   <div class="diff"> combined diff </div>
 *   <form class="issue-form"> title · body · Create pull request </form>
 */

import { h, icon } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { LIMITS } from '../config.js';
import { getSession } from '../core/store.js';
import * as api from '../core/api.js';
import { avatar } from '../components/avatars.js';
import { computeDiff, renderDiff } from '../components/diff.js';
import { markdown as markdownNode } from '../components/markdown.js';
import { openDialog, toast } from '../components/overlay.js';
import {
  relativeTimeEl, emptyState, pagination, paginate, queryPage, counter, badge,
  labelPill, filterBar, stateTabs, itemRow, itemList,
} from '../components/kit.js';
import { repoShell, repoNotFound, branchSelector } from '../components/repoChrome.js';
import {
  repoContext, repoPulls, repoLabels, repoBranches, repoCommits, commitDiffFiles, parseIssueQuery,
  sortIssues, checksForPull, reviewsForPull,
} from './_shared.js';
import { commitRow } from './repoBlob.js';

/* ==================================================================== list */

export function render(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;

  const query = String(ctx.query.q || (ctx.query.state === 'closed' ? 'is:closed' : 'is:open'));
  const page = queryPage(ctx.query.page, 1);
  const parsed = parseIssueQuery(query);
  const session = getSession();

  const all = repoPulls(repo).map((pull) => ({ ...pull, isPull: true }));
  const matching = sortIssues(all.filter((pull) => matchesPullQuery(pull, parsed, session)), parsed.sort);
  const openCount = all.filter((p) => p.state === 'open').length;
  const closedCount = all.filter((p) => p.state !== 'open').length;
  const { items, pages, total } = paginate(matching, page, LIMITS.pageSize);

  const baseHref = `/${repo.fullName}/pulls`;
  const withQuery = (next) => `${baseHref}?q=${encodeURIComponent(next)}`;
  const setToken = (key, value) => {
    const tokens = String(query).split(/\s+/).filter(Boolean).filter((token) => !token.toLowerCase().startsWith(`${key}:`));
    if (value) tokens.push(`${key}:${value}`);
    navigate(withQuery(tokens.join(' ')));
  };

  const labels = repoLabels(repo);
  const reviewers = api.collaboratorsFor(repo.fullName);

  const bar = filterBar({
    query,
    placeholder: 'Filter pull requests (is:open is:draft review:required label:crimson)',
    label: 'Pull request filters',
    filters: [
      {
        id: 'author', label: 'Author', iconName: 'pencil',
        items: [
          { label: 'Your pull requests', onClick: () => setToken('author', '@me') },
          { divider: true },
          ...reviewers.map((user) => ({ label: user.login, onClick: () => setToken('author', user.login) })),
        ],
      },
      {
        id: 'label', label: 'Label', iconName: 'tag',
        items: labels.map((label) => ({ label: label.name, onClick: () => setToken('label', label.name) })),
      },
      {
        id: 'review', label: 'Reviews', iconName: 'eye',
        items: [
          { label: 'No reviews', onClick: () => setToken('review', 'none') },
          { label: 'Changes requested', onClick: () => setToken('review', 'changes_requested') },
          { label: 'Approved', onClick: () => setToken('review', 'approved') },
          { label: 'Review requested from you', onClick: () => setToken('review', 'required') },
        ],
      },
      {
        id: 'status', label: 'Checks', iconName: 'check',
        items: [
          { label: 'Failing', onClick: () => setToken('status', 'failure') },
          { label: 'Passing', onClick: () => setToken('status', 'success') },
          { label: 'Pending', onClick: () => setToken('status', 'pending') },
        ],
      },
      {
        id: 'sort', label: 'Sort', iconName: 'sort',
        items: [
          { label: 'Newest', checked: parsed.sort === 'created-desc', onClick: () => setToken('sort', 'created-desc') },
          { label: 'Oldest', checked: parsed.sort === 'created-asc', onClick: () => setToken('sort', 'created-asc') },
          { label: 'Most commented', checked: parsed.sort === 'comment-count', onClick: () => setToken('sort', 'comment-count') },
          { label: 'Recently updated', checked: parsed.sort === 'updated-desc', onClick: () => setToken('sort', 'updated-desc') },
          { label: 'Best match', checked: parsed.sort === 'best-match', onClick: () => setToken('sort', 'best-match') },
        ],
      },
    ],
    onQuery: (value) => {
      const url = withQuery(value);
      window.history.replaceState({}, '', url);
      clearTimeout(bar._debounce);
      bar._debounce = setTimeout(() => navigate(url, { replace: true }), LIMITS.searchDebounceMs);
    },
    right: [
      h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/pull/new` }, icon('git-compare', { size: 16 }), 'Compare'),
      h('a', { class: 'btn btn-sm btn-primary', href: `/${repo.fullName}/pull/new` }, icon('plus', { size: 16 }), 'New pull request'),
    ],
  });

  const tabs = stateTabs([
    { label: `${openCount} Open`, icon: 'git-pull-request', active: !parsed.is.includes('closed'), href: withQuery('is:open') },
    { label: `${closedCount} Closed`, icon: 'git-merge', active: parsed.is.includes('closed') || parsed.is.includes('merged'), href: withQuery('is:closed') },
  ], { ariaLabel: 'Filter pull requests by state' });

  const main = h('div', {},
    bar,
    h('div', { class: 'list-header' }, tabs, h('span', { class: 'list-header-count text-small text-muted' }, `${total} results`)),
    total
      ? itemList(items.map((pull) => pullRow(repo, pull)), { ariaLabel: 'Pull requests' })
      : emptyState({
        icon: 'git-pull-request',
        title: 'No pull requests matched your filters',
        description: query ? `Nothing matches “${query}”.` : 'Open a pull request to propose changes.',
        action: h('a', { class: 'btn btn-primary', href: `/${repo.fullName}/pull/new` }, 'New pull request'),
      }),
    pagination({
      page, pages, total,
      hrefFor: (n) => `${baseHref}?q=${encodeURIComponent(query)}&page=${n}`,
      onPage: (n) => navigate(`${baseHref}?q=${encodeURIComponent(query)}&page=${n}`),
    }));

  return repoShell(repo, 'pulls', { main, fullWidth: true });
}

export function pullRow(repo, pull) {
  const labels = (pull.labels || []).map((label) => labelPill(label));
  const checks = checksForPull(pull);
  const reviews = reviewsForPull(pull);
  const failing = checks.filter((c) => c.conclusion === 'failure' || c.conclusion === 'cancelled' || c.conclusion === 'timed_out').length;
  const approvals = reviews.filter((r) => r.state === 'APPROVED').length;
  const changes = reviews.filter((r) => r.state === 'CHANGES_REQUESTED').length;

  const state = pull.merged ? 'merged' : pull.state;
  const meta = h('span', {},
    '#', String(pull.number), ' ',
    pull.merged ? 'merged' : pull.state === 'closed' ? 'closed' : 'opened', ' ',
    relativeTimeEl(pull.mergedAt || pull.closedAt || pull.createdAt),
    ' by ', h('a', { class: 'author-link', href: `/${pull.authorLogin}` }, pull.authorLogin),
    h('span', { class: 'pull-meta-extra' },
      checks.length
        ? h('span', { class: failing ? 'text-danger' : 'text-success' },
          ` · ${failing ? icon('x-circle', { size: 16 }) : icon('check-circle', { size: 16 })} ${checks.length - failing}/${checks.length} checks`)
        : null,
      approvals ? h('span', { class: 'text-success' }, ` · ${icon('check', { size: 16 })} ${approvals} approved`) : null,
      changes ? h('span', { class: 'text-danger' }, ` · ${icon('x', { size: 16 })} ${changes} change${changes === 1 ? '' : 's'} requested`) : null));

  return itemRow({
    status: pull.merged
      ? icon('git-merge', { size: 16, label: 'Merged' })
      : icon(pull.draft ? 'git-pull-request-draft' : state === 'closed' ? 'git-pull-request-closed' : 'git-pull-request', { size: 16, label: pull.draft ? 'Draft' : state }),
    title: pull.title,
    titleHref: `/${repo.fullName}/pull/${pull.number}`,
    meta,
    labels,
    comments: pull.commentsCount || 0,
    side: h('span', { class: 'item-row-people' },
      ...(pull.reviewers || []).slice(0, 4).map((login) => h('a', {
        href: `/${login}`, title: `Reviewer ${login}`, 'aria-label': `Reviewer ${login}`,
      }, avatar({ login }, { size: 20 })))),
    extra: h('span', { class: 'pull-flags' },
      pull.draft ? badge('Draft', 'attention') : null,
      pull.autoMerge ? badge('Auto-merge', 'accent') : null,
      pull.mergeableState === 'dirty' ? badge('Merge conflict', 'danger') : null),
  });
}

function matchesPullQuery(pull, parsed, session) {
  if (parsed.is.includes('open') && pull.state !== 'open') return false;
  if (parsed.is.includes('closed') && pull.state !== 'closed') return false;
  if (parsed.is.includes('merged') && !pull.merged) return false;
  if (parsed.is.includes('unmerged') && pull.merged) return false;
  if (parsed.is.includes('draft') && !pull.draft) return false;
  if (parsed.is.includes('issue') || parsed.is.includes('pr') === false) return false;
  if (parsed.labels.length) {
    const names = (pull.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    if (!parsed.labels.some((label) => names.includes(label))) return false;
  }
  if (parsed.assignees.length) {
    const assignees = pull.assignees || [];
    if (!parsed.assignees.some((a) => assignees.includes(a === '@me' ? session.login : a))) return false;
  }
  if (parsed.authors.length && !parsed.authors.some((a) => pull.authorLogin === (a === '@me' ? session.login : a))) return false;
  if (parsed.review.length) {
    const reviews = reviewsForPull(pull);
    const states = new Set(reviews.map((r) => r.state));
    const wanted = parsed.review[0];
    if (wanted === 'none' && reviews.length) return false;
    if (wanted === 'approved' && !states.has('APPROVED')) return false;
    if (wanted === 'changes_requested' && !states.has('CHANGES_REQUESTED')) return false;
    if (wanted === 'required' && !(pull.reviewers || []).includes(session.login)) return false;
  }
  if (parsed.statuses.length) {
    const checks = checksForPull(pull);
    const wanted = parsed.statuses[0];
    if (wanted === 'failure' && !checks.some((c) => c.conclusion === 'failure')) return false;
    if (wanted === 'success' && !(checks.length && checks.every((c) => c.conclusion === 'success'))) return false;
    if (wanted === 'pending' && !checks.some((c) => c.status !== 'completed')) return false;
  }
  if (parsed.text) {
    const q = parsed.text.toLowerCase();
    if (!`${pull.title} ${pull.body || ''} #${pull.number} ${pull.headBranch} ${pull.baseBranch}`.toLowerCase().includes(q)) return false;
  }
  return true;
}

/* ========================================================= new pull request */

export function renderNew(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;

  const branches = repoBranches(repo);
  const parsed = parseRange(ctx.params.range, repo, branches);
  const all = repoCommits(repo);
  const baseSet = new Set(all.filter((c) => c.branch === parsed.base).map((c) => c.sha));
  const ahead = all.filter((c) => c.branch === parsed.head && !baseSet.has(c.sha)).slice(0, 30);

  const files = new Map();
  ahead.forEach((commit) => commitDiffFiles(commit).forEach((file) => {
    if (!files.has(file.path)) files.set(file.path, { ...file, additions: 0, deletions: 0 });
    const entry = files.get(file.path);
    entry.additions += file.additions || 0;
    entry.deletions += file.deletions || 0;
    if (!file.tooLarge) { entry.oldContent = file.oldContent; entry.newContent = file.newContent; entry.tooLarge = false; }
  }));
  const diff = computeDiff([...files.values()]);

  const title = h('input', {
    class: 'input input-lg', type: 'text', 'aria-label': 'Pull request title',
    value: ahead.length ? firstLine(ahead[0].message) : '',
    placeholder: 'Summarise the change',
  });
  const bodyEditor = h('textarea', { class: 'input code-editor composer-textarea', rows: '14', 'aria-label': 'Pull request body' });
  bodyEditor.value = prTemplate(repo, ahead);

  const preview = h('div', { class: 'composer-preview', hidden: true });
  const writeTab = h('button', { class: 'tab is-active', type: 'button', role: 'tab', id: 'pr-write', 'aria-selected': 'true', 'aria-controls': 'pr-write-panel' }, 'Write');
  const previewTab = h('button', { class: 'tab', type: 'button', role: 'tab', id: 'pr-preview', 'aria-selected': 'false', 'aria-controls': 'pr-preview-panel' }, 'Preview');
  const writePanel = h('div', { class: 'composer-body', role: 'tabpanel', id: 'pr-write-panel', 'aria-labelledby': 'pr-write' }, bodyEditor);
  const previewPanel = h('div', { class: 'composer-preview-wrap', role: 'tabpanel', id: 'pr-preview-panel', 'aria-labelledby': 'pr-preview', hidden: true }, preview);
  const showTab = (which) => {
    const writing = which === 'write';
    writeTab.classList.toggle('is-active', writing);
    previewTab.classList.toggle('is-active', !writing);
    writeTab.setAttribute('aria-selected', String(writing));
    previewTab.setAttribute('aria-selected', String(!writing));
    writePanel.hidden = !writing;
    previewPanel.hidden = writing;
    if (!writing) {
      preview.replaceChildren(bodyEditor.value.trim() ? markdownNode(bodyEditor.value, { repo }) : h('p', { class: 'text-muted' }, 'Nothing to preview'));
    }
  };
  writeTab.addEventListener('click', () => showTab('write'));
  previewTab.addEventListener('click', () => showTab('preview'));

  const draftRow = h('label', { class: 'checkbox-row' },
    h('input', { type: 'checkbox', id: 'pr-draft' }),
    h('span', {}, 'Create as a draft — reviewers cannot approve until you mark it ready.'));

  const allowEdits = h('label', { class: 'checkbox-row' },
    h('input', { type: 'checkbox', id: 'pr-allow-edits', checked: 'checked' }),
    h('span', {}, 'Allow edits by maintainers'));

  const controls = h('div', { class: 'compare-controls' },
    h('div', { class: 'compare-side' },
      h('span', { class: 'compare-label' }, 'base'),
      branchSelector(repo, { branch: parsed.base, onChange: (name) => navigate(`/${repo.fullName}/pull/new/${name}...${parsed.head}`) })),
    h('span', { class: 'compare-arrow', 'aria-hidden': 'true' }, icon('arrow-left', { size: 16 })),
    h('div', { class: 'compare-side' },
      h('span', { class: 'compare-label' }, 'compare'),
      branchSelector(repo, { branch: parsed.head, onChange: (name) => navigate(`/${repo.fullName}/pull/new/${parsed.base}...${name}`) })),
    h('span', { class: 'grow' }),
    h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/compare/${parsed.base}...${parsed.head}` }, icon('git-compare', { size: 16 }), 'Full compare'));

  const summary = ahead.length
    ? h('p', { class: 'compare-summary' },
      h('strong', {}, `${ahead.length} commit${ahead.length === 1 ? '' : 's'}`),
      ' and ', h('strong', {}, `${files.size} file${files.size === 1 ? '' : 's'}`),
      ' would be merged into ', h('code', { class: 'code-inline' }, parsed.base),
      h('span', { class: 'text-success' }, ` (+${diff.additions})`),
      h('span', { class: 'text-danger' }, ` (−${diff.deletions})`))
    : h('div', { class: 'flash flash-attention', role: 'status' },
      icon('info', { size: 16 }),
      ` There is nothing to compare: ${parsed.base} and ${parsed.head} have the same history. Pick a different branch.`);

  const form = h('form', {
    class: 'issue-form',
    onSubmit: (event) => {
      event.preventDefault();
      if (!ahead.length) { toast({ message: 'Nothing to merge between these branches', variant: 'attention' }); return; }
      const value = title.value.trim();
      if (!value) { title.setAttribute('aria-invalid', 'true'); toast({ message: 'A title is required', variant: 'attention' }); title.focus(); return; }
      const created = api.createPullRequest(repo.fullName, {
        title: value,
        body: bodyEditor.value,
        baseBranch: parsed.base,
        headBranch: parsed.head,
        draft: document.getElementById('pr-draft')?.checked || false,
      });
      toast({ message: `Pull request #${created.number} opened`, variant: 'success' });
      navigate(`/${repo.fullName}/pull/${created.number}`);
    },
  },
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Title'), title),
    h('div', { class: 'composer' },
      h('div', { class: 'composer-tabs', role: 'tablist', 'aria-label': 'Pull request body' }, writeTab, previewTab),
      writePanel, previewPanel),
    h('div', { class: 'pr-form-options' }, draftRow, allowEdits),
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, icon('git-pull-request', { size: 16 }), ahead.length ? 'Create pull request' : 'Nothing to compare'),
      h('button', { class: 'btn btn-lg', type: 'button', onClick: () => openDraftFromDialog(repo) }, icon('git-pull-request-draft', { size: 16 }), 'Create draft'),
      h('a', { class: 'btn btn-lg', href: `/${repo.fullName}/pulls` }, 'Cancel')));

  const main = h('div', {},
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Open a pull request'),
        h('p', { class: 'page-subtitle' }, `Compare changes and propose them to ${repo.fullName}.`))),
    controls,
    summary,
    form,
    ahead.length
      ? h('section', { class: 'compare-commits' },
        h('h2', { class: 'section-title' }, 'Commits', counter(ahead.length)),
        h('ul', { class: 'commit-list', role: 'list' }, ...ahead.map((commit) => commitRow(repo, commit))))
      : null,
    files.size
      ? h('section', { class: 'compare-files' },
        h('h2', { class: 'section-title' }, 'Files changed', counter(files.size)),
        renderDiff(diff, { repo, sha: `${parsed.base}...${parsed.head}` }))
      : null);

  return repoShell(repo, 'pulls', { main, fullWidth: true });
}

function parseRange(range, repo, branches) {
  const raw = String(range || '');
  const three = /^(.+?)\.\.\.(.+)$/.exec(raw);
  const two = /^(.+?)\.\.(.+)$/.exec(raw);
  if (three) return { base: three[1], head: three[2] };
  if (two) return { base: two[1], head: two[2] };
  const names = branches.map((b) => b.name);
  const fallback = names.find((n) => n !== repo.defaultBranch) || repo.defaultBranch;
  return { base: repo.defaultBranch, head: raw && names.includes(raw) ? raw : fallback };
}

function firstLine(message) {
  return String(message || '').split('\n')[0];
}

function prTemplate(repo, ahead) {
  const subject = ahead.length ? firstLine(ahead[0].message) : '';
  return `## What does this change?

${subject}

## Why is it needed?

Fixes #

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change
- [ ] Documentation only

## How was it tested?

- [ ] \`node tools/validate.mjs\` passes
- [ ] Manual check at 375px and 1280px
- [ ] All five themes reviewed
- [ ] Keyboard-only navigation verified

## Notes for reviewers

`;
}

function openDraftFromDialog(repo) {
  const branches = repoBranches(repo).filter((b) => b.name !== repo.defaultBranch);
  const list = h('ul', { class: 'choice-list', role: 'list' },
    ...branches.slice(0, 12).map((branch) => h('li', {},
      h('button', {
        class: 'btn choice-button btn-block', type: 'button',
        onClick: () => {
          const open = document.querySelector('dialog[open]');
          if (open && typeof open.close === 'function') open.close();
          navigate(`/${repo.fullName}/pull/new/${repo.defaultBranch}...${branch.name}`);
        },
      }, icon('git-branch', { size: 16 }), ` ${branch.name}`,
      branch.aheadBy != null ? counter(branch.aheadBy) : null))));

  openDialog({
    title: 'Choose a branch to draft from',
    hideFooter: true,
    body: h('div', { class: 'dialog-form' },
      h('p', { class: 'text-small text-muted' }, `The draft compares ${branchDefault(repo)} against the branch you pick.`),
      list),
  });
}

function branchDefault(repo) {
  return repo.defaultBranch;
}

export default { render, renderNew, pullRow };
