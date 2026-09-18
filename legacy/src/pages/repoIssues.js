/**
 * RedGet — repository issues: list, new issue, templates, labels, milestones.
 *
 * List markup contract:
 *
 *   <nav class="subnav">                        Issues · Labels · Milestones  + New issue
 *   <form class="filter-bar" role="search">     Author / Label / Assignee / Milestone / Sort + text input
 *   <div class="state-tabs" role="group">       28 Open · 14 Closed
 *   <div class="item-list" role="list">
 *     <div class="item-row">
 *       <span class="item-row-status"><svg class="icon-issue-opened"></span>
 *       <div class="item-row-main">
 *         <span class="item-row-title"><a>title</a></span>
 *         <span class="item-row-labels">…</span>
 *         <div class="item-row-meta">#12 opened 3 days ago by nova</div>
 *       </div>
 *       <span class="item-row-side">assignee avatars</span>
 *       <span class="item-row-comments">💬 4</span>
 *   <nav aria-label="Pagination">
 *
 * The filter text box accepts the search grammar documented in
 * parseIssueQuery() (is:open label:bug assignee:@me author:nova sort:created-desc).
 */

import { h, icon } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { LIMITS, FEATURES } from '../config.js';
import { getSession, getPrefs } from '../core/store.js';
import * as api from '../core/api.js';
import { avatar } from '../components/avatars.js';
import { markdown as markdownNode } from '../components/markdown.js';
import { copyButton, toast, openDialog, confirmDialog, attachMenu } from '../components/overlay.js';
import {
  relativeTimeEl, emptyState, pagination, paginate, queryPage, counter, badge,
  stateBadge, labelPill, progressBar, filterBar, stateTabs, itemRow, itemList,
  dataTable, card, assigneeList, participantAvatars,
} from '../components/kit.js';
import { slugify, formatNumber } from '../core/util.js';
import {
  repoShell, repoNotFound, labelRow, isMaintainer,
} from '../components/repoChrome.js';
import {
  repoContext, repoIssues, repoLabels, repoMilestones, parseIssueQuery, resolveMilestone,
  matchesIssueQuery, sortIssues, rerender, db as getDatabase, milestoneProgress,
} from './_shared.js';

/* ================================================================ list */

export function render(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;

  const query = String(ctx.query.q || (ctx.query.state === 'closed' ? 'is:closed' : 'is:open'));
  const page = queryPage(ctx.query.page, 1);
  const parsed = parseIssueQuery(query);
  const session = getSession();

  const all = repoIssues(repo);
  const matching = sortIssues(all.filter((issue) => matchesIssueQuery(issue, parsed, session)), parsed.sort);
  const openCount = all.filter((i) => i.state === 'open').length;
  const closedCount = all.filter((i) => i.state === 'closed').length;
  const { items, pages, total } = paginate(matching, page, LIMITS.pageSize);

  const baseHref = `/${repo.fullName}/issues`;
  const withQuery = (next) => `${baseHref}?q=${encodeURIComponent(next)}`;

  const setToken = (key, value, { exclusive = false } = {}) => {
    const tokens = String(query).split(/\s+/).filter(Boolean);
    const filtered = tokens.filter((token) => !token.toLowerCase().startsWith(`${key}:`));
    if (value) filtered.push(`${key}:${value}`);
    navigate(withQuery(filtered.join(' ')));
  };

  const labels = repoLabels(repo);
  const milestones = repoMilestones(repo);
  const collaborators = api.collaboratorsFor(repo.fullName);

  const filters = [
    {
      id: 'author', label: 'Author', iconName: 'pencil',
      items: [
        { label: 'Your issues', token: '@me', onClick: () => setToken('author', '@me') },
        { divider: true },
        ...collaborators.map((user) => ({ label: user.login, onClick: () => setToken('author', user.login) })),
      ],
    },
    {
      id: 'label', label: 'Label', iconName: 'tag',
      items: [
        { label: 'Unlabeled', onClick: () => setToken('label', 'none') },
        { divider: true },
        ...labels.map((label) => ({ label: label.name, onClick: () => setToken('label', label.name) })),
      ],
    },
    {
      id: 'assignee', label: 'Assignee', iconName: 'person',
      items: [
        { label: 'Assigned to you', onClick: () => setToken('assignee', '@me') },
        { label: 'Unassigned', onClick: () => setToken('assignee', 'none') },
        { divider: true },
        ...collaborators.map((user) => ({ label: user.login, onClick: () => setToken('assignee', user.login) })),
      ],
    },
    {
      id: 'milestone', label: 'Milestone', iconName: 'milestone',
      items: [
        { label: 'No milestone', onClick: () => setToken('milestone', 'none') },
        { divider: true },
        ...milestones.map((milestone) => ({ label: milestone.title, onClick: () => setToken('milestone', milestone.title) })),
      ],
    },
    {
      id: 'sort', label: 'Sort', iconName: 'sort',
      items: [
        { label: 'Newest', checked: parsed.sort === 'created-desc', onClick: () => setToken('sort', 'created-desc') },
        { label: 'Oldest', checked: parsed.sort === 'created-asc', onClick: () => setToken('sort', 'created-asc') },
        { label: 'Most commented', checked: parsed.sort === 'comment-count', onClick: () => setToken('sort', 'comment-count') },
        { label: 'Least commented', checked: parsed.sort === 'updated-asc', onClick: () => setToken('sort', 'updated-asc') },
        { label: 'Recently updated', checked: parsed.sort === 'updated-desc', onClick: () => setToken('sort', 'updated-desc') },
        { label: 'Best match', checked: parsed.sort === 'best-match', onClick: () => setToken('sort', 'best-match') },
      ],
    },
  ];

  const bar = filterBar({
    query,
    placeholder: 'Filter issues (is:open label:bug assignee:@me)',
    label: 'Issue filters',
    filters,
    onQuery: (value) => {
      const url = withQuery(value);
      window.history.replaceState({}, '', url);
      clearTimeout(bar._debounce);
      bar._debounce = setTimeout(() => navigate(url, { replace: true }), LIMITS.searchDebounceMs);
    },
    right: [
      h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/labels` }, icon('tag', { size: 16 }), 'Labels'),
      h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/milestones` }, icon('milestone', { size: 16 }), 'Milestones'),
      h('a', { class: 'btn btn-sm btn-primary', href: `/${repo.fullName}/issues/new/choose` }, icon('plus', { size: 16 }), 'New issue'),
    ],
  });

  const tabs = stateTabs([
    { label: `${openCount} Open`, icon: 'issue-opened', active: !parsed.is.includes('closed'), href: withQuery('is:open') },
    { label: `${closedCount} Closed`, icon: 'issue-closed', active: parsed.is.includes('closed'), href: withQuery('is:closed') },
  ], { ariaLabel: 'Filter issues by state' });

  const rows = items.map((issue) => issueRow(repo, issue));

  const main = h('div', {},
    repoSubnav(repo, 'issues'),
    bar,
    h('div', { class: 'list-header' }, tabs,
      h('span', { class: 'list-header-count text-small text-muted' }, `${total} results`)),
    total
      ? itemList(rows, { ariaLabel: 'Issues' })
      : emptyState({
        icon: 'issue-opened',
        title: 'No issues matched your filters',
        description: query ? `Nothing matches “${query}”.` : 'This repository has no issues yet.',
        action: h('div', { class: 'empty-state-actions' },
          h('a', { class: 'btn btn-primary', href: `/${repo.fullName}/issues/new/choose` }, 'Create the first issue'),
          h('a', { class: 'btn', href: baseHref }, 'Clear filters')),
      }),
    pagination({
      page, pages, total,
      hrefFor: (n) => `${baseHref}?q=${encodeURIComponent(query)}&page=${n}`,
      onPage: (n) => navigate(`${baseHref}?q=${encodeURIComponent(query)}&page=${n}`),
    }));

  return repoShell(repo, 'issues', { main, fullWidth: true });
}

export function issueRow(repo, issue) {
  const labels = (issue.labels || []).map((label) => labelPill(label));
  const milestone = resolveMilestone(issue.milestone);
  const meta = h('span', {},
    '#', String(issue.number),
    ' ', issue.state === 'open' ? 'opened' : 'closed',
    ' ', relativeTimeEl(issue.state === 'closed' ? issue.closedAt || issue.updatedAt : issue.createdAt),
    ' by ',
    h('a', { class: 'author-link', href: `/${issue.authorLogin}` }, issue.authorLogin),
    milestone ? h('span', {}, ' · ', icon('milestone', { size: 16 }), ` ${milestone.title}`) : null,
    issue.pinned ? h('span', { class: 'pinned-flag' }, ' ', icon('pin', { size: 16 }), ' Pinned') : null,
    issue.locked ? h('span', {}, ' ', icon('lock', { size: 16 }), ' Locked') : null);

  return itemRow({
    status: issue.state === 'closed'
      ? icon(issue.stateReason === 'not_planned' ? 'issue-closed' : 'check-circle', { size: 16, label: `Closed: ${issue.stateReason || 'completed'}` })
      : icon('issue-opened', { size: 16, label: 'Open' }),
    title: issue.title,
    titleHref: `/${repo.fullName}/issues/${issue.number}`,
    meta,
    labels,
    comments: issue.commentsCount || 0,
    side: h('span', { class: 'item-row-people' },
      assigneeList(issue.assignees),
      participantAvatars(issue.participants || [], { size: 16, max: 3 })),
    extra: issue.linkedPullRequests && issue.linkedPullRequests.length
      ? h('span', { class: 'linked-pr', title: 'Linked pull request' }, icon('git-pull-request', { size: 16 }))
      : null,
  });
}

export function repoSubnav(repo, active) {
  const items = [
    { id: 'issues', label: 'Issues', href: `/${repo.fullName}/issues`, iconName: 'issue-opened', count: repo.openIssues },
    { id: 'labels', label: 'Labels', href: `/${repo.fullName}/labels`, iconName: 'tag', count: repoLabels(repo).length },
    { id: 'milestones', label: 'Milestones', href: `/${repo.fullName}/milestones`, iconName: 'milestone', count: repoMilestones(repo).length },
  ];
  return h('nav', { class: 'subnav', 'aria-label': 'Issues navigation' },
    h('ul', { class: 'subnav-links', role: 'list' },
      ...items.map((item) => {
        const link = h('a', { class: 'subnav-link', href: item.href });
        link.append(icon(item.iconName, { size: 16 }), h('span', {}, ` ${item.label}`));
        if (item.count != null) link.append(counter(item.count));
        if (item.id === active) link.setAttribute('aria-current', 'page');
        return h('li', {}, link);
      })));
}

/* ================================================================ new issue */

export function renderTemplates(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const db = getDatabase();
  const forms = (db.issueForms || []).filter((f) => f.repoFullName === repo.fullName);

  const blank = {
    id: 'blank', name: 'Open a blank issue', description: 'No template — write the title and body yourself.',
    labels: [], href: `/${repo.fullName}/issues/new`,
  };

  const cards = [...forms.map((form) => ({
    id: form.id,
    name: form.name,
    description: form.description,
    labels: form.labels || [],
    href: `/${repo.fullName}/issues/new?template=${encodeURIComponent(form.file || form.name)}`,
  })), blank];

  const main = h('div', {},
    repoSubnav(repo, 'issues'),
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Choose an issue template'),
        h('p', { class: 'page-subtitle' }, `Templates live in .redget/ISSUE_TEMPLATE in ${repo.fullName}. They prefill the title, body and labels.`))),
    h('ul', { class: 'template-list', role: 'list' },
      ...cards.map((card) => h('li', { class: 'template-card card' },
        h('div', { class: 'template-main' },
          h('h2', { class: 'template-name' }, card.name),
          h('p', { class: 'text-small text-muted' }, card.description),
          card.labels && card.labels.length ? labelRow(card.labels) : null),
        h('div', { class: 'template-actions' },
          h('a', { class: 'btn btn-primary', href: card.href }, 'Get started'))))),
    h('div', { class: 'flash flash-info' },
      icon('info', { size: 16 }),
      ' Need help instead of filing a bug? ',
      repo.hasDiscussions ? h('a', { href: `/${repo.fullName}/discussions` }, 'Start a discussion') : h('span', {}, 'Discussions are disabled for this repository'),
      '.'));

  return repoShell(repo, 'issues', { main, fullWidth: true });
}

export function renderNew(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const db = getDatabase();
  const templateName = ctx.query.template || '';
  const forms = (db.issueForms || []).filter((f) => f.repoFullName === repo.fullName);
  const form = forms.find((f) => (f.file || f.name) === templateName || f.name === templateName) || null;

  const title = h('input', {
    class: 'input input-lg', type: 'text', placeholder: 'Summarise the problem in one line',
    'aria-label': 'Issue title', 'aria-describedby': 'title-help', autofocus: true,
    value: form && form.name && !/blank/i.test(form.name) ? `[${form.name}] ` : '',
  });

  const bodySeed = form
    ? formBody(form)
    : '## What happened?\n\n## Steps to reproduce\n\n1. \n2. \n3. \n\n## Expected behaviour\n\n## Environment\n\n- RedGet theme: \n- Viewport: \n';
  const bodyEditor = h('textarea', {
    class: 'input code-editor composer-textarea', rows: '16', 'aria-label': 'Issue body',
    placeholder: 'Describe the problem. Markdown, @mentions and #references all work.',
  });
  bodyEditor.value = bodySeed;

  const preview = h('div', { class: 'composer-preview markdown-body', hidden: true });
  const writeTab = h('button', { class: 'tab is-active', type: 'button', role: 'tab', id: 'new-issue-write', 'aria-selected': 'true', 'aria-controls': 'new-issue-write-panel' }, 'Write');
  const previewTab = h('button', { class: 'tab', type: 'button', role: 'tab', id: 'new-issue-preview', 'aria-selected': 'false', 'aria-controls': 'new-issue-preview-panel' }, 'Preview');
  const writePanel = h('div', { class: 'composer-panel', role: 'tabpanel', id: 'new-issue-write-panel', 'aria-labelledby': 'new-issue-write' }, bodyEditor);
  const previewPanel = h('div', { class: 'composer-panel', role: 'tabpanel', id: 'new-issue-preview-panel', 'aria-labelledby': 'new-issue-preview', hidden: true }, preview);

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

  const labels = repoLabels(repo);
  const preselected = new Set(form && form.labels ? form.labels : []);
  const selected = new Set(preselected);
  const selectedRow = h('div', { class: 'label-row selected-labels' });
  const paintSelected = () => {
    selectedRow.replaceChildren(...[...selected].map((name) => {
      const label = labels.find((l) => l.name === name) || { name, color: 'd61a2f' };
      return labelPill(label, { removable: true, onRemove: () => { selected.delete(name); paintSelected(); } });
    }));
    if (!selected.size) selectedRow.replaceChildren(h('span', { class: 'text-small text-muted' }, 'No labels selected'));
  };
  paintSelected();

  const labelPicker = h('button', {
    class: 'btn btn-sm', type: 'button', 'aria-haspopup': 'dialog',
    onClick: () => openLabelPicker(repo, selected, paintSelected),
  }, icon('tag', { size: 16 }), 'Labels');

  const milestones = repoMilestones(repo);
  let milestone = null;
  const milestoneButton = h('button', { class: 'btn btn-sm', type: 'button', 'aria-haspopup': 'menu' }, icon('milestone', { size: 16 }), 'Milestone');
  const milestoneMenu = h('ul', { class: 'dropdown-menu', role: 'menu', hidden: true, 'aria-label': 'Milestone' });
  const paintMilestones = () => {
    const entries = [{ id: null, title: 'No milestone' }, ...milestones];
    milestoneMenu.replaceChildren(...entries.map((entry) => h('li', { role: 'none' },
      h('button', {
        class: 'dropdown-item', role: 'menuitemradio', type: 'button', tabindex: '-1',
        'aria-checked': String((milestone && milestone.id) === entry.id),
        onClick: () => {
          milestone = entry.id ? entry : null;
          milestoneButton.replaceChildren(icon('milestone', { size: 16 }), ` ${milestone ? milestone.title : 'Milestone'}`);
          paintMilestones();
        },
      }, entry.title))));
  };
  paintMilestones();
  attachMenu(milestoneButton, milestoneMenu, { align: 'left' });

  const collaborators = api.collaboratorsFor(repo.fullName);
  const assignees = new Set();
  const assigneeRow = h('div', { class: 'assignee-row-selected' });
  const paintAssignees = () => {
    assigneeRow.replaceChildren(...[...assignees].map((login) => h('span', { class: 'chip' }, avatar({ login }, { size: 16 }), ` ${login}`)));
    if (!assignees.size) assigneeRow.replaceChildren(h('span', { class: 'text-small text-muted' }, 'No assignees'));
  };
  paintAssignees();
  const assigneeButton = h('button', { class: 'btn btn-sm', type: 'button', 'aria-haspopup': 'menu' }, icon('person', { size: 16 }), 'Assignees');
  const assigneeMenu = h('ul', { class: 'dropdown-menu', role: 'menu', hidden: true, 'aria-label': 'Assignees' });
  assigneeMenu.append(...collaborators.map((user) => h('li', { role: 'none' },
    h('button', {
      class: 'dropdown-item', role: 'menuitemcheckbox', type: 'button', tabindex: '-1',
      'aria-checked': String(assignees.has(user.login)),
      onClick: () => {
        if (assignees.has(user.login)) assignees.delete(user.login); else assignees.add(user.login);
        paintAssignees();
        assigneeMenu.querySelectorAll('[role="menuitemcheckbox"]').forEach((item) => {
          item.setAttribute('aria-checked', String(assignees.has(item.textContent.trim())));
        });
      },
    }, avatar(user, { size: 20 }), ` ${user.login}`))));
  attachMenu(assigneeButton, assigneeMenu, { align: 'left' });

  const projects = h('button', { class: 'btn btn-sm', type: 'button', disabled: FEATURES.projects ? null : 'disabled' }, icon('project', { size: 16 }), 'Projects');

  const submit = (event) => {
    event.preventDefault();
    const value = title.value.trim();
    if (!value) {
      title.setAttribute('aria-invalid', 'true');
      toast({ message: 'A title is required', variant: 'attention' });
      title.focus();
      return;
    }
    const created = api.createIssue(repo.fullName, {
      title: value,
      body: bodyEditor.value,
      labels: [...selected],
      assignees: [...assignees],
      milestone: milestone ? milestone.id : null,
      projects: [],
    });
    toast({ message: `Issue #${created.number} created`, variant: 'success' });
    navigate(`/${repo.fullName}/issues/${created.number}`);
  };

  const form2 = h('form', { class: 'issue-form', onSubmit: submit },
    h('label', { class: 'field' },
      h('span', { class: 'field-label' }, 'Title'),
      title,
      h('span', { class: 'field-help', id: 'title-help' }, 'Be specific: “Split diff misaligns paired deletions on long files”, not “diff broken”.')),
    h('div', { class: 'composer' },
      h('div', { class: 'composer-tabs', role: 'tablist', 'aria-label': 'Issue body' }, writeTab, previewTab),
      writePanel,
      previewPanel),
    h('div', { class: 'issue-form-side' },
      h('div', { class: 'sidebar-block' },
        h('div', { class: 'sidebar-block-header' }, h('span', { class: 'sidebar-block-title' }, 'Labels'), labelPicker),
        selectedRow),
      h('div', { class: 'sidebar-block' },
        h('div', { class: 'sidebar-block-header' }, h('span', { class: 'sidebar-block-title' }, 'Milestone')),
        h('div', { class: 'dropdown' }, milestoneButton, milestoneMenu)),
      h('div', { class: 'sidebar-block' },
        h('div', { class: 'sidebar-block-header' }, h('span', { class: 'sidebar-block-title' }, 'Assignees'), assigneeButton),
        assigneeRow),
      h('div', { class: 'sidebar-block' },
        h('div', { class: 'sidebar-block-header' }, h('span', { class: 'sidebar-block-title' }, 'Projects')),
        h('div', {}, projects)),
      h('div', { class: 'sidebar-block' },
        h('div', { class: 'sidebar-block-header' }, h('span', { class: 'sidebar-block-title' }, 'Help')),
        h('ul', { class: 'link-list', role: 'list' },
          h('li', {}, h('a', { href: '/docs/markdown' }, 'Markdown reference')),
          h('li', {}, h('a', { href: '/docs/issues' }, 'How issues work')),
          h('li', {}, h('a', { href: `/${repo.fullName}/blob/${repo.defaultBranch}/CONTRIBUTING.md` }, 'Contributing guide'))))),
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn btn-primary btn-lg', type: 'submit' }, icon('issue-opened', { size: 16 }), 'Create issue'),
      h('a', { class: 'btn btn-lg', href: `/${repo.fullName}/issues` }, 'Cancel')));

  const main = h('div', {},
    repoSubnav(repo, 'issues'),
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, form ? `New issue · ${form.name}` : 'New issue'),
        h('p', { class: 'page-subtitle' }, `Opening an issue in ${repo.fullName}. ${repo.openIssues} open, ${repo.closedIssues || 0} closed.`))),
    form2);

  return repoShell(repo, 'issues', { main, fullWidth: true });
}

function formBody(form) {
  const labels = (form.labels || []).join(', ');
  return [
    `<!-- Template: ${form.name} -->`,
    '',
    '## Summary',
    '',
    '## Steps to reproduce',
    '',
    '1. ',
    '2. ',
    '3. ',
    '',
    '## Expected behaviour',
    '',
    '## Actual behaviour',
    '',
    '## Screenshots or logs',
    '',
    '```text',
    '',
    '```',
    '',
    '## Environment',
    '',
    `- RedGet version: 4.3.0`,
    `- Theme: crimson`,
    `- Browser and viewport: `,
    labels ? `<!-- labels: ${labels} -->` : '',
  ].join('\n');
}

function openLabelPicker(repo, selected, onDone) {
  const labels = repoLabels(repo);
  const search = h('input', { class: 'input', type: 'search', placeholder: 'Filter labels', 'aria-label': 'Filter labels' });
  const list = h('div', { class: 'label-picker', role: 'group', 'aria-label': 'Available labels' });

  const paint = (filter = '') => {
    const rows = labels
      .filter((label) => label.name.toLowerCase().includes(filter.toLowerCase()))
      .map((label) => h('label', { class: 'checkbox-row label-picker-row' },
        h('input', {
          type: 'checkbox', checked: selected.has(label.name) || null,
          onChange: (event) => {
            if (event.target.checked) selected.add(label.name); else selected.delete(label.name);
            onDone();
          },
        }),
        labelPill(label),
        label.description ? h('span', { class: 'text-small text-muted label-picker-desc' }, label.description) : null));
    list.replaceChildren(...rows.length ? rows : [h('p', { class: 'text-small text-muted' }, 'No labels match.')]);
  };
  search.addEventListener('input', () => paint(search.value));
  paint();

  openDialog({
    title: 'Apply labels',
    size: 'md',
    body: h('div', { class: 'dialog-form' }, search, list),
    confirmLabel: 'Done',
    onConfirm: () => true,
  });
}

/* ================================================================= labels */

export function renderLabels(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo, maintainer } = found;
  const labels = repoLabels(repo);
  const issues = repoIssues(repo);

  const counts = new Map();
  issues.forEach((issue) => (issue.labels || []).forEach((label) => {
    const name = typeof label === 'string' ? label : label.name;
    counts.set(name, (counts.get(name) || 0) + 1);
  }));

  const rows = labels.map((label) => ({
    label: labelPill(label),
    description: label.description || h('span', { class: 'text-muted' }, 'No description'),
    issues: h('a', {
      href: `/${repo.fullName}/issues?q=${encodeURIComponent(`is:open label:${label.name}`)}`,
    }, `${counts.get(label.name) || 0} open`),
    actions: maintainer ? labelActions(repo, label) : h('span', { class: 'text-muted text-small' }, 'Read-only'),
  }));

  const main = h('div', {},
    repoSubnav(repo, 'labels'),
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Labels'),
        h('p', { class: 'page-subtitle' }, `${labels.length} labels in ${repo.fullName}. Labels colour issues, drive filters and gate branch protection rules.`)),
      maintainer
        ? h('div', { class: 'page-header-actions' },
          h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openLabelDialog(repo, null) }, icon('plus', { size: 16 }), 'New label'))
        : null),
    dataTable(
      [
        { key: 'label', label: 'Label', sortable: false },
        { key: 'description', label: 'Description', sortable: false },
        { key: 'issues', label: 'Open issues', sortable: false },
        { key: 'actions', label: '', sortable: false },
      ],
      rows));

  return repoShell(repo, 'issues', { main, fullWidth: true });
}

function labelActions(repo, label) {
  const actions = h('span', { class: 'row-actions' });
  actions.append(
    h('button', {
      class: 'btn btn-sm', type: 'button',
      onClick: () => openLabelDialog(repo, label),
    }, icon('pencil', { size: 16 }), 'Edit'),
    h('button', {
      class: 'btn btn-sm btn-danger', type: 'button',
      onClick: () => confirmDialog({
        title: `Delete “${label.name}”?`,
        body: 'The label is removed from every issue and pull request that uses it.',
        confirmLabel: 'Delete label',
        danger: true,
      }).then((ok) => {
        if (!ok) return;
        api.deleteLabel(label.id);
        rerender();
        toast({ message: 'Label deleted', variant: 'info' });
      }),
    }, icon('trash', { size: 16 }), 'Delete'));
  return actions;
}

function openLabelDialog(repo, existing) {
  const name = h('input', { class: 'input', type: 'text', value: existing ? existing.name : '', 'aria-label': 'Label name', placeholder: 'crimson-blocker' });
  const color = h('input', { class: 'input input-mono', type: 'text', value: existing ? existing.color : 'd61a2f', 'aria-label': 'Label colour', maxlength: '6' });
  const description = h('input', { class: 'input', type: 'text', value: existing ? existing.description || '' : '', 'aria-label': 'Label description' });
  const swatch = h('span', { class: 'label-swatch-preview', 'aria-hidden': 'true' });
  const paintSwatch = () => { swatch.style.backgroundColor = `#${color.value.replace(/^#/, '')}`; };
  color.addEventListener('input', paintSwatch);
  paintSwatch();

  const randomize = h('button', {
    class: 'btn btn-sm', type: 'button',
    onClick: () => {
      const palette = ['d61a2f', '8b0f1d', 'ff5a5f', 'f2a93b', '2ea043', '1f6feb', '8957e5', '6e7681'];
      color.value = palette[Math.floor(Math.random() * palette.length)];
      paintSwatch();
    },
  }, icon('sync', { size: 16 }), 'Random colour');

  openDialog({
    title: existing ? `Edit “${existing.name}”` : 'New label',
    body: h('div', { class: 'dialog-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Label name'), name),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Colour'),
        h('div', { class: 'color-field' }, color, swatch, randomize),
        h('span', { class: 'field-help' }, 'Six hex characters without the leading #.')),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Description'), description,
        h('span', { class: 'field-help' }, 'Shown as a tooltip on the label pill.'))),
    confirmLabel: existing ? 'Save changes' : 'Create label',
    onConfirm: () => {
      const value = name.value.trim();
      if (!value) { toast({ message: 'A label name is required', variant: 'attention' }); return false; }
      if (!/^[0-9a-fA-F]{6}$/.test(color.value.trim())) { toast({ message: 'Colour must be six hex characters', variant: 'danger' }); return false; }
      const payload = { name: value, color: color.value.trim().toLowerCase(), description: description.value.trim() };
      if (existing) api.updateLabel(existing.id, payload);
      else api.createLabel(repo.fullName, payload);
      rerender();
      toast({ message: existing ? 'Label updated' : 'Label created', variant: 'success' });
      return true;
    },
  });
}

/* ============================================================ milestones */

export function renderMilestones(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo, maintainer } = found;
  const state = ctx.query.state === 'closed' ? 'closed' : 'open';
  const milestones = repoMilestones(repo).filter((m) => (state === 'closed' ? m.state === 'closed' : m.state !== 'closed'));
  const all = repoIssues(repo);

  const cards = milestones.map((milestone) => {
    const issues = all.filter((i) => resolveMilestone(i.milestone) && resolveMilestone(i.milestone).id === milestone.id);
    const open = issues.filter((i) => i.state === 'open').length;
    const closed = issues.length - open;
    const percent = milestoneProgress(repo, milestone);

    return h('div', { class: 'milestone-card card' },
      h('div', { class: 'milestone-card-header' },
        h('h2', { class: 'milestone-card-title' },
          h('a', { href: `/${repo.fullName}/issues?q=${encodeURIComponent(`is:open milestone:${milestone.title}`)}` }, milestone.title)),
        maintainer ? h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openMilestoneDialog(repo, milestone) }, icon('pencil', { size: 16 }), 'Edit') : null),
      milestone.description ? h('p', { class: 'text-small text-muted' }, milestone.description) : null,
      progressBar(percent, { label: `${percent}% complete` }),
      h('div', { class: 'milestone-card-meta text-small text-muted' },
        h('span', {}, icon('issue-opened', { size: 16 }), ` ${open} open`),
        h('span', {}, icon('check', { size: 16 }), ` ${closed} closed`),
        h('span', {}, icon('calendar', { size: 16 }), milestone.dueOn ? ` Due ${new Date(milestone.dueOn).toLocaleDateString()}` : 'No due date'),
        milestone.creatorLogin ? h('span', {}, 'Created by ', h('a', { href: `/${milestone.creatorLogin}` }, milestone.creatorLogin)) : null));
  });

  const main = h('div', {},
    repoSubnav(repo, 'milestones'),
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Milestones'),
        h('p', { class: 'page-subtitle' }, 'Group issues and pull requests into a release-sized unit of work.')),
      maintainer ? h('div', { class: 'page-header-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openMilestoneDialog(repo, null) }, icon('plus', { size: 16 }), 'New milestone')) : null),
    stateTabs([
      { label: `${repoMilestones(repo).filter((m) => m.state !== 'closed').length} Open`, icon: 'milestone', active: state === 'open', href: `/${repo.fullName}/milestones` },
      { label: `${repoMilestones(repo).filter((m) => m.state === 'closed').length} Closed`, icon: 'check', active: state === 'closed', href: `/${repo.fullName}/milestones?state=closed` },
    ]),
    cards.length
      ? h('div', { class: 'milestone-grid' }, ...cards)
      : emptyState({
        icon: 'milestone',
        title: state === 'closed' ? 'No closed milestones' : 'No open milestones',
        description: 'Milestones collect issues that must ship together.',
        action: maintainer ? h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openMilestoneDialog(repo, null) }, 'Create a milestone') : null,
      }));

  return repoShell(repo, 'issues', { main, fullWidth: true });
}

function openMilestoneDialog(repo, existing) {
  const title = h('input', { class: 'input', type: 'text', value: existing ? existing.title : '', 'aria-label': 'Milestone title', placeholder: '4.3 release' });
  const description = h('textarea', { class: 'input', rows: '3', 'aria-label': 'Description' });
  description.value = existing ? existing.description || '' : '';
  const due = h('input', { class: 'input', type: 'date', value: existing && existing.dueOn ? String(existing.dueOn).slice(0, 10) : '', 'aria-label': 'Due date' });
  const state2 = h('select', { class: 'input', 'aria-label': 'State' },
    h('option', { value: 'open', selected: !existing || existing.state !== 'closed' ? 'selected' : null }, 'Open'),
    h('option', { value: 'closed', selected: existing && existing.state === 'closed' ? 'selected' : null }, 'Closed'));

  openDialog({
    title: existing ? `Edit “${existing.title}”` : 'New milestone',
    body: h('div', { class: 'dialog-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Title'), title),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Description'), description),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Due date'), due),
      existing ? h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'State'), state2) : null),
    confirmLabel: existing ? 'Save milestone' : 'Create milestone',
    onConfirm: () => {
      const value = title.value.trim();
      if (!value) { toast({ message: 'A title is required', variant: 'attention' }); return false; }
      const payload = {
        title: value,
        description: description.value.trim(),
        dueOn: due.value ? new Date(due.value).toISOString() : null,
        state: existing ? state2.value : 'open',
      };
      if (existing) api.updateMilestone(existing.id, payload);
      else api.createMilestone(repo.fullName, payload);
      rerender();
      toast({ message: existing ? 'Milestone updated' : 'Milestone created', variant: 'success' });
      return true;
    },
  });
}

export default { render, renderNew, renderTemplates, renderLabels, renderMilestones, issueRow, repoSubnav };
