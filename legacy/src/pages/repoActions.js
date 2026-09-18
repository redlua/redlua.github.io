/**
 * RedGet — Actions: workflows, runs, jobs, logs, artifacts, caches, secrets,
 * variables, runners, environments and the merge queue.
 *
 * Layout (/:login/:repo/actions):
 *   <div class="actions-layout">
 *     <aside aria-label="Workflows">
 *       <ul class="workflow-list">
 *         <li><a href="…/actions" aria-current="page">All workflows</a></li>
 *         <li><a href="…/actions/workflows/ci.yml">RedGet CI <span class="counter">18</span></a></li>
 *       </ul>
 *     </aside>
 *     <main class="main-col">
 *       <div class="summary-cards"> 4 × <div class="summary-card"><span class="value">…</span></div>
 *       <div class="filter-bar"> … </div>
 *       <div class="card card-flush">
 *         <div class="run-row"> <span class="status-dot success"> <div class="run-title">…</div> <div class="run-side">…</div>
 *
 * Job logs (/:login/:repo/actions/runs/:runId/job/:jobId):
 *   <div class="job-log-layout">
 *     <nav class="job-steps"><ol class="steps"><li class="step">…</li></ol></nav>
 *     <div class="log-viewer" role="log" aria-live="polite">
 *       <div class="log-line" data-level="cmd"><span class="log-ts">12:00:03</span><span class="log-step">2 Run tests</span><span class="log-msg">…</span></div>
 */

import { h, icon } from '../core/dom.js';
import { LIMITS, BRAND } from '../config.js';
import { getSession } from '../core/store.js';
import * as api from '../core/api.js';
import { STEP_LOGS } from '../data/mockData.js';
import { formatBytes, formatDuration, compactNumber } from '../core/util.js';
import { avatar } from '../components/avatars.js';
import { openDialog, confirmDialog, attachMenu, toast, copyButton } from '../components/overlay.js';
import {
  relativeTimeEl, emptyState, filterBar, pagination, paginate, queryPage, counter, badge,
  checkStateIcon, statusDot, dataTable, keyValueList, pageHeader,
} from '../components/kit.js';
import { repoShell, repoNotFound, isMaintainer } from '../components/repoChrome.js';
import {
  repoContext, db as getDatabase, rerender, notFoundBody, linkedAuthor,
} from './_shared.js';

/* ==================================================================== data */

function runsFor(repo, workflowId = null) {
  const db = getDatabase();
  const all = (db.runs || []).filter((r) => r.repoFullName === repo.fullName);
  return workflowId ? all.filter((r) => r.workflowId === workflowId) : all;
}

function workflowsFor(repo) {
  const db = getDatabase();
  const list = (db.workflows || []).filter((w) => w.repoFullName === repo.fullName);
  const runs = runsFor(repo);
  return list.map((workflow) => ({
    ...workflow,
    runCount: runs.filter((r) => r.workflowId === workflow.id).length,
  }));
}

function jobsFor(run) {
  const db = getDatabase();
  const ids = run.jobs || [];
  return (db.jobs || []).filter((j) => ids.includes(j.id));
}

function findRun(repo, runId) {
  return runsFor(repo).find((r) => r.id === String(runId));
}

function findJob(repo, jobId) {
  const db = getDatabase();
  return (db.jobs || []).find((j) => j.repoFullName === repo.fullName && j.id === String(jobId));
}

/* ============================================================= shell parts */

function actionsShell(repo, activeTab, main, options = {}) {
  return repoShell(repo, 'actions', {
    fullWidth: options.fullWidth === true,
    main: h('div', { class: 'actions-layout' },
      h('aside', { 'aria-label': 'Actions navigation' }, actionsNav(repo, activeTab)),
      main),
  });
}

function actionsNav(repo, activeTab) {
  const workflows = workflowsFor(repo);
  const runs = runsFor(repo);
  const base = `/${repo.fullName}/actions`;

  const workflowList = h('ul', { class: 'workflow-list', role: 'list' });
  const allLink = h('a', { href: base }, icon('play', { size: 16 }), h('span', {}, 'All workflows'), counter(runs.length));
  if (activeTab === 'all') allLink.setAttribute('aria-current', 'page');
  workflowList.appendChild(h('li', {}, allLink));

  workflows.forEach((workflow) => {
    const link = h('a', { href: `${base}/workflows/${workflow.id}` },
      icon('play', { size: 16 }), h('span', {}, workflow.name), counter(workflow.runCount));
    if (activeTab === workflow.id) link.setAttribute('aria-current', 'page');
    workflowList.appendChild(h('li', {}, link));
  });

  const settings = [
    { id: 'caches', label: 'Caches', iconName: 'database', href: `${base}/caches` },
    { id: 'artifacts', label: 'Artifacts', iconName: 'package', href: `${base}/artifacts` },
    { id: 'secrets', label: 'Secrets', iconName: 'key', href: `${base}/secrets` },
    { id: 'variables', label: 'Variables', iconName: 'code', href: `${base}/variables` },
    { id: 'runners', label: 'Runners', iconName: 'server', href: `${base}/runners` },
    { id: 'environments', label: 'Environments', iconName: 'rocket', href: `${base}/environments` },
    { id: 'queue', label: 'Merge queue', iconName: 'git-merge', href: `${base}/queue` },
  ];

  const settingsList = h('ul', { class: 'workflow-list', role: 'list', 'aria-label': 'Actions settings' });
  settings.forEach((item) => {
    const link = h('a', { href: item.href }, icon(item.iconName, { size: 16 }), h('span', {}, item.label));
    if (activeTab === item.id) link.setAttribute('aria-current', 'page');
    settingsList.appendChild(h('li', {}, link));
  });

  return h('div', { class: 'actions-nav' },
    h('h2', { class: 'section-title' }, 'Workflows'),
    workflowList,
    h('h2', { class: 'section-title mt-4' }, 'Actions resources'),
    settingsList,
    h('div', { class: 'mt-4' },
      h('a', { class: 'btn btn-sm btn-block', href: `/${repo.fullName}/settings/actions` },
        icon('gear', { size: 16 }), 'Actions settings')));
}

function runFilters(repo, query, workflows) {
  const branches = [...new Set(runsFor(repo).map((r) => r.headBranch))].sort();
  const events = [...new Set(runsFor(repo).map((r) => r.event))].sort();
  const actors = [...new Set(runsFor(repo).map((r) => r.actorLogin))].sort();

  const filters = [
    {
      id: 'workflow', label: 'Workflow', iconName: 'play',
      items: workflows.map((w) => ({
        label: w.name, checked: query.workflow === w.id,
        onClick: () => setQuery(repo, { workflow: query.workflow === w.id ? null : w.id }),
      })),
    },
    {
      id: 'branch', label: 'Branch', iconName: 'git-branch',
      items: branches.map((branch) => ({
        label: branch, checked: query.branch === branch,
        onClick: () => setQuery(repo, { branch: query.branch === branch ? null : branch }),
      })),
    },
    {
      id: 'event', label: 'Event', iconName: 'zap',
      items: events.map((event) => ({
        label: event, checked: query.event === event,
        onClick: () => setQuery(repo, { event: query.event === event ? null : event }),
      })),
    },
    {
      id: 'actor', label: 'Actor', iconName: 'person',
      items: actors.map((actor) => ({
        label: actor, checked: query.actor === actor,
        onClick: () => setQuery(repo, { actor: query.actor === actor ? null : actor }),
      })),
    },
    {
      id: 'status', label: 'Status', iconName: 'check',
      items: [
        { label: 'Successful', checked: query.status === 'success', onClick: () => setQuery(repo, { status: query.status === 'success' ? null : 'success' }) },
        { label: 'Failed', checked: query.status === 'failure', onClick: () => setQuery(repo, { status: query.status === 'failure' ? null : 'failure' }) },
        { label: 'In progress', checked: query.status === 'in_progress', onClick: () => setQuery(repo, { status: query.status === 'in_progress' ? null : 'in_progress' }) },
        { label: 'Queued', checked: query.status === 'queued', onClick: () => setQuery(repo, { status: query.status === 'queued' ? null : 'queued' }) },
        { label: 'Cancelled', checked: query.status === 'cancelled', onClick: () => setQuery(repo, { status: query.status === 'cancelled' ? null : 'cancelled' }) },
      ],
    },
  ];

  return filterBar({
    query: query.q || '',
    placeholder: 'Filter workflow runs',
    label: 'Filter runs',
    filters,
    onQuery: (value) => setQuery(repo, { q: value || null }),
  });
}

function setQuery(repo, patch) {
  const url = new URL(window.location.href);
  Object.entries(patch).forEach(([key, value]) => {
    if (value == null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  });
  if (url.pathname.includes('/actions/workflows/')) {
    window.history.pushState({}, '', url.pathname + url.search);
    rerender();
    return;
  }
  window.history.pushState({}, '', url.pathname + url.search);
  rerender();
}

function matchesRun(run, query) {
  if (query.workflow && run.workflowId !== query.workflow) return false;
  if (query.branch && run.headBranch !== query.branch) return false;
  if (query.event && run.event !== query.event) return false;
  if (query.actor && run.actorLogin !== query.actor) return false;
  if (query.status) {
    if (query.status === 'success' && run.conclusion !== 'success') return false;
    if (query.status === 'failure' && run.conclusion !== 'failure') return false;
    if (query.status === 'cancelled' && run.conclusion !== 'cancelled') return false;
    if (query.status === 'in_progress' && run.status !== 'in_progress') return false;
    if (query.status === 'queued' && run.status !== 'queued') return false;
  }
  if (query.q) {
    const needle = query.q.toLowerCase();
    const haystack = `${run.displayTitle || ''} ${run.name || ''} ${run.headBranch || ''} ${run.headSha || ''} ${run.event || ''}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function summaryCards(repo, runs) {
  const succeeded = runs.filter((r) => r.conclusion === 'success').length;
  const failed = runs.filter((r) => r.conclusion === 'failure').length;
  const durations = runs.filter((r) => r.durationMs).map((r) => r.durationMs);
  const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
  const cards = [
    { value: compactNumber(runs.length), label: 'Workflow runs', cls: 'accent' },
    { value: compactNumber(succeeded), label: 'Succeeded' },
    { value: compactNumber(failed), label: 'Failed' },
    { value: formatDuration(avg), label: 'Average duration' },
  ];
  return h('div', { class: 'summary-cards' },
    ...cards.map((card) => h('div', { class: `summary-card ${card.cls || ''}`.trim() },
      h('span', { class: 'value' }, card.value),
      h('span', { class: 'label' }, card.label))));
}

/* ================================================================== pages */

export function render(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  return runsView(found.repo, ctx.query || {}, { heading: 'All workflows' });
}

export function renderRuns(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  return runsView(found.repo, ctx.query || {}, { heading: 'Workflow runs' });
}

export function renderWorkflow(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const workflows = workflowsFor(repo);
  const workflow = workflows.find((w) => w.id === ctx.params.workflowId);

  if (!workflow) {
    return actionsShell(repo, 'all', notFoundBody({
      title: 'Workflow not found',
      description: `No workflow named "${ctx.params.workflowId}" exists in ${repo.fullName}.`,
      href: `/${repo.fullName}/actions`,
      label: 'Back to Actions',
    }));
  }

  const query = { ...(ctx.query || {}), workflow: workflow.id };
  const main = runsView(repo, query, {
    heading: workflow.name,
    subheading: `${workflow.path} · triggered by ${workflow.events.join(', ')}`,
    hideWorkflowFilter: true,
    workflow,
  });
  return main;
}

function runsView(repo, query, options = {}) {
  const { heading = 'All workflows', subheading = null, hideWorkflowFilter = false, workflow = null } = options;
  const workflows = workflowsFor(repo);
  const allRuns = runsFor(repo);
  const filtered = allRuns.filter((run) => matchesRun(run, query));
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const page = paginate(sorted, queryPage(query, 1), LIMITS.pageSize);

  const bar = hideWorkflowFilter ? null : runFilters(repo, query, workflows);

  const right = h('div', { class: 'row gap-2' },
    workflow
      ? h('button', {
        class: 'btn btn-sm', type: 'button',
        onClick: () => openDispatchDialog(repo, workflow),
        disabled: workflow.events.includes('workflow_dispatch') ? undefined : 'disabled',
        title: workflow.events.includes('workflow_dispatch') ? 'Run workflow' : 'This workflow has no workflow_dispatch trigger',
      }, icon('play', { size: 16 }), 'Run workflow')
      : null,
    workflow ? workflowMenu(repo, workflow) : null);


  const list = h('div', { class: 'card card-flush run-list' });
  if (!page.items.length) {
    list.appendChild(emptyState({
      title: 'No workflow runs match these filters',
      description: 'Adjust the filters above, or trigger a run by pushing a commit.',
      iconName: 'play',
      actions: h('a', { class: 'btn btn-primary', href: `/${repo.fullName}/actions` }, 'Clear filters'),
    }));
  } else {
    page.items.forEach((run) => list.appendChild(runRow(repo, run)));
  }

  const main = h('main', { class: 'main-col' },
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, heading),
        subheading ? h('p', { class: 'page-subtitle' }, subheading) : null),
      h('div', { class: 'page-header-actions' }, right)),
    summaryCards(repo, hideWorkflowFilter ? runsFor(repo, workflow ? workflow.id : null) : allRuns),
    bar,
    list,
    pagination({ page: page.page, pages: page.pages, total: page.total, onPage: (nextPage) => setQuery(repo, { page: nextPage }) }));

  return actionsShell(repo, hideWorkflowFilter && workflow ? workflow.id : 'all', main);
}

function runRow(repo, run) {
  const dot = statusDot(run.status, run.conclusion);
  const title = h('div', { class: 'run-title' },
    h('a', { href: `/${repo.fullName}/actions/runs/${run.id}` }, `${run.workflowName} #${run.runNumber}`),
    run.attempt && run.attempt > 1 ? badge(`Attempt ${run.attempt}`, 'neutral') : null,
    run.conclusion === 'success' ? badge('Success', 'success') : null,
    run.conclusion === 'failure' ? badge('Failure', 'danger') : null,
    run.conclusion === 'cancelled' ? badge('Cancelled', 'neutral') : null,
    run.status === 'in_progress' ? badge('In progress', 'attention') : null,
    run.status === 'queued' ? badge('Queued', 'neutral') : null);

  const meta = h('div', { class: 'run-meta' },
    h('span', {}, run.displayTitle || run.name),
    h('span', {}, '·'),
    h('a', { class: 'sha', href: `/${repo.fullName}/tree/${run.headBranch}` }, icon('git-branch', { size: 14 }), run.headBranch),
    h('a', { class: 'sha', href: `/${repo.fullName}/commit/${run.headSha}` }, run.headSha.slice(0, 7)),
    h('span', {}, '·'),
    h('span', {}, `${run.event}`),
    h('span', {}, '·'),
    avatar(run.actorLogin, { size: 16 }),
    h('span', {}, run.actorLogin),
    h('span', {}, '·'),
    relativeTimeEl(run.createdAt),
    run.durationMs ? h('span', {}, `· ${formatDuration(run.durationMs)}`) : null);

  const jobs = jobsFor(run);
  const side = h('div', { class: 'run-side' },
    h('span', { class: 'job-pills', title: `${jobs.length} job${jobs.length === 1 ? '' : 's'}` },
      ...jobs.slice(0, 8).map((job) => statusDot(job.status, job.conclusion))),
    h('div', { class: 'dropdown' }, runMenu(repo, run)));

  return h('div', { class: 'run-row' }, dot, h('div', { class: 'run-body' }, title, meta), side);
}

function runMenu(repo, run) {
  const trigger = h('button', { class: 'btn btn-sm btn-invisible', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Run actions' }, icon('kebab', { size: 16 }));
  const menu = h('ul', { class: 'dropdown-menu', role: 'menu', hidden: true });

  const add = (iconName, label, onClick, options = {}) => {
    menu.appendChild(h('li', { role: 'none' },
      h('button', {
        class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
        disabled: options.disabled ? 'disabled' : undefined,
        onClick,
      }, icon(iconName, { size: 16 }), h('span', {}, label))));
  };

  const running = run.status !== 'completed';
  add('sync', 'Re-run all jobs', () => {
    api.rerunWorkflow(run.id, false);
    rerender();
    toast({ message: `Re-running ${run.workflowName} #${run.runNumber}`, variant: 'success' });
  });
  add('sync', 'Re-run failed jobs', () => {
    api.rerunWorkflow(run.id, true);
    rerender();
    toast({ message: 'Re-running failed jobs only', variant: 'success' });
  });
  add('stop', 'Cancel workflow run', () => confirmDialog({
    title: 'Cancel this workflow run?',
    body: 'Jobs that have already started will be stopped at the next checkpoint.',
    confirmLabel: 'Cancel run',
    danger: true,
  }).then((ok) => {
    if (!ok) return;
    api.cancelWorkflow(run.id);
    rerender();
    toast({ message: 'Workflow run cancelled', variant: 'info' });
  }), { disabled: !running });
  menu.appendChild(h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })));
  add('trash', 'Delete workflow run', () => confirmDialog({
    title: 'Delete this workflow run?',
    body: 'Logs, artifacts and annotations for this run will be permanently removed.',
    confirmLabel: 'Delete run',
    danger: true,
  }).then((ok) => {
    if (!ok) return;
    api.deleteWorkflowRun(run.id);
    rerender();
    toast({ message: 'Workflow run deleted', variant: 'success' });
  }));
  add('download', 'Download log archive', () => toast({ message: `Preparing ${run.id}.zip (demo archive)`, variant: 'info' }));

  attachMenu(trigger, menu, { align: 'right' });
  return h('div', {}, trigger, menu);
}

/* ------------------------------------------------------------ run detail */

export function renderRun(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const run = findRun(repo, ctx.params.runId);

  if (!run) {
    return actionsShell(repo, 'all', notFoundBody({
      title: 'Workflow run not found',
      description: `Run ${ctx.params.runId} does not exist in ${repo.fullName}.`,
      href: `/${repo.fullName}/actions`,
      label: 'Back to Actions',
    }));
  }

  const jobs = jobsFor(run);
  const artifacts = (getDatabase().artifacts || []).filter((a) => a.runId === run.id);
  const failing = jobs.filter((j) => j.conclusion === 'failure');

  const main = h('main', { class: 'main-col' },
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' },
          statusDot(run.status, run.conclusion),
          ` ${run.workflowName} #${run.runNumber}`,
          run.attempt > 1 ? badge(`Attempt ${run.attempt}`, 'neutral') : null),
        h('p', { class: 'page-subtitle' }, run.displayTitle || run.name)),
      h('div', { class: 'page-header-actions' },
        h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/actions/runs` }, icon('list-unordered', { size: 16 }), 'All runs'),
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => { api.rerunWorkflow(run.id, false); rerender(); toast({ message: 'Re-running all jobs', variant: 'success' }); } },
          icon('sync', { size: 16 }), 'Re-run jobs'),
        run.status !== 'completed'
          ? h('button', { class: 'btn btn-sm', type: 'button', onClick: () => { api.cancelWorkflow(run.id); rerender(); toast({ message: 'Run cancelled', variant: 'info' }); } },
            icon('stop', { size: 16 }), 'Cancel run')
          : null)),

    h('div', { class: 'card' },
      keyValueList([
        ['Status', h('span', { class: 'row gap-2' }, checkStateIcon(run.status, run.conclusion), run.conclusion || run.status)],
        ['Branch', h('a', { href: `/${repo.fullName}/tree/${run.headBranch}` }, icon('git-branch', { size: 14 }), run.headBranch)],
        ['Commit', h('a', { href: `/${repo.fullName}/commit/${run.headSha}` }, h('code', { class: 'code-inline' }, run.headSha.slice(0, 7)), ' ', run.displayTitle || '')],
        ['Event', badge(run.event, 'neutral')],
        ['Actor', h('span', { class: 'row gap-2' }, avatar(run.actorLogin, { size: 20 }), linkedAuthor(run.actorLogin), run.triggeringActorLogin && run.triggeringActorLogin !== run.actorLogin ? h('span', { class: 'text-small text-muted' }, `triggered by ${run.triggeringActorLogin}`) : null)],
        ['Started', relativeTimeEl(run.runStartedAt || run.createdAt)],
        ['Duration', formatDuration(run.durationMs || 0)],
        ['Jobs', `${jobs.length} (${jobs.filter((j) => j.conclusion === 'success').length} succeeded, ${failing.length} failed)`],
      ])),

    failing.length
      ? h('section', { class: 'mt-4' },
        h('h2', { class: 'section-title' }, 'Annotations', counter(failing.length)),
        h('div', { class: 'card card-flush' },
          ...failing.map((job) => h('div', { class: 'log-annotation', dataset: { level: 'error' } },
            icon('alert', { size: 16 }),
            h('div', {},
              h('strong', {}, `${job.name}: `),
              'Process completed with exit code 1.',
              ' ', h('a', { href: `/${repo.fullName}/actions/runs/${run.id}/job/${job.id}` }, 'View job log'))))))
      : null,

    h('section', { class: 'mt-4' },
      h('h2', { class: 'section-title' }, 'Jobs', counter(jobs.length)),
      h('ul', { class: 'job-list', role: 'list' },
        ...jobs.map((job) => jobCard(repo, run, job)))),

    artifacts.length
      ? h('section', { class: 'mt-4' },
        h('h2', { class: 'section-title' }, 'Artifacts', counter(artifacts.length)),
        h('div', { class: 'card card-flush' },
          ...artifacts.map((artifact) => h('div', { class: 'check-row' },
            icon('package', { size: 16 }),
            h('div', { class: 'grow' },
              h('span', { class: 'check-name' }, artifact.name),
              h('span', { class: 'check-desc' }, `${formatBytes(artifact.size)} · ${artifact.workflowName || ''} · expires ${new Date(artifact.expiresAt).toLocaleDateString()}`)),
            h('button', {
              class: 'btn btn-sm', type: 'button',
              onClick: () => toast({ message: `Downloading ${artifact.name}.zip (demo)`, variant: 'info' }),
            }, icon('download', { size: 16 }, ' Download')),
            h('button', {
              class: 'btn btn-sm btn-invisible', type: 'button', 'aria-label': `Delete ${artifact.name}`,
              onClick: () => confirmDialog({ title: 'Delete artifact?', body: `${artifact.name} will be permanently removed.`, confirmLabel: 'Delete', danger: true })
                .then((ok) => { if (ok) { api.deleteArtifact(artifact.id); rerender(); toast({ message: 'Artifact deleted', variant: 'success' }); } }),
            }, icon('trash', { size: 16 }))))))
      : null);

  return actionsShell(repo, run.workflowId, main);
}

function jobCard(repo, run, job) {
  const steps = job.steps || [];
  const list = h('ol', { class: 'steps', role: 'list' },
    ...steps.map((step) => h('li', { class: 'step' },
      h('span', { class: 'step-num' }, String(step.number)),
      checkStateIcon(step.status, step.conclusion),
      h('span', { class: 'step-name' }, step.name),
      h('span', { class: 'step-duration' }, step.durationMs ? formatDuration(step.durationMs) : ''))));

  return h('li', {},
    h('div', { class: 'job-card' },
      h('div', { class: 'job-card-header' },
        statusDot(job.status, job.conclusion),
        h('a', { class: 'job-name', href: `/${repo.fullName}/actions/runs/${run.id}/job/${job.id}` }, job.name),
        job.runnerName ? h('span', { class: 'job-meta' }, icon('server', { size: 14 }), ` ${job.runnerName}`) : null,
        h('span', { class: 'job-meta' }, formatDuration(job.durationMs || 0)),
        h('span', { class: 'job-meta' }, `${steps.length} steps`)),
      list,
      h('div', { class: 'job-card-footer' },
        h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/actions/runs/${run.id}/job/${job.id}` }, icon('file', { size: 16 }), 'View raw logs'),
        copyButton(() => `/${repo.fullName}/actions/runs/${run.id}/job/${job.id}`, { cls: 'btn btn-sm', tooltipText: 'Copy job link' }),
        h('span', { class: 'text-small text-muted' },
          (job.runnerLabels || []).map((label) => badge(label, 'neutral'))))));
}

/* ------------------------------------------------------------- job detail */

export function renderJob(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const job = findJob(repo, ctx.params.jobId);
  const run = job ? findRun(repo, job.runId) : null;

  if (!job || !run) {
    return actionsShell(repo, 'all', notFoundBody({
      title: 'Job not found',
      description: `Job ${ctx.params.jobId} does not exist in ${repo.fullName}.`,
      href: `/${repo.fullName}/actions`,
      label: 'Back to Actions',
    }));
  }

  const steps = job.steps || [];
  const logs = STEP_LOGS.get(job.id) || steps.map((step) => ({ number: step.number, name: step.name, conclusion: step.conclusion, lines: [] }));

  const stepNav = h('nav', { class: 'job-steps', 'aria-label': 'Job steps' });
  const stepList = h('ol', { class: 'steps', role: 'list' },
    h('li', { class: 'step is-selected' },
      h('span', { class: 'step-num' }, ''),
      icon('file', { size: 16 }),
      h('span', { class: 'step-name' }, 'Summary'),
      h('span', { class: 'step-duration' }, formatDuration(job.durationMs || 0))),
    ...steps.map((step) => h('li', { class: 'step', dataset: { step: String(step.number) } },
      h('span', { class: 'step-num' }, String(step.number)),
      checkStateIcon(step.status, step.conclusion),
      h('span', { class: 'step-name' }, step.name),
      h('span', { class: 'step-duration' }, step.durationMs ? formatDuration(step.durationMs) : ''))));
  stepNav.appendChild(stepList);

  const viewer = logViewer(job, logs, steps);

  const main = h('main', { class: 'main-col' },
    h('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' },
      h('ol', { role: 'list' },
        h('li', {}, h('a', { href: `/${repo.fullName}/actions` }, 'Actions'), h('span', { 'aria-hidden': 'true' }, ' / ')),
        h('li', {}, h('a', { href: `/${repo.fullName}/actions/runs/${run.id}` }, `${run.workflowName} #${run.runNumber}`), h('span', { 'aria-hidden': 'true' }, ' / ')),
        h('li', {}, h('span', { 'aria-current': 'page' }, job.name)))),
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, statusDot(job.status, job.conclusion), ` ${job.name}`),
        h('p', { class: 'page-subtitle' },
          `${run.headBranch} · ${run.headSha.slice(0, 7)} · runner ${job.runnerName || 'unassigned'} · ${formatDuration(job.durationMs || 0)}`)),
      h('div', { class: 'page-header-actions' },
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => toast({ message: 'Downloading raw logs (demo)', variant: 'info' }) }, icon('download', { size: 16 }), 'Download logs'),
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => toggleWrap(viewer) }, icon('wrap-text', { size: 16 }), 'Wrap'),
        h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/actions/runs/${run.id}` }, 'Run summary'))),

    h('div', { class: 'job-log-layout' }, stepNav, viewer),

    h('section', { class: 'mt-4' },
      h('h2', { class: 'section-title' }, 'Job details'),
      h('div', { class: 'card' },
        keyValueList([
          { label: 'Status', value: h('span', { class: 'row gap-2' }, checkStateIcon(job.status, job.conclusion), job.conclusion || job.status) },
          { label: 'Runner', value: job.runnerName || '—' },
          { label: 'Labels', value: h('span', { class: 'row gap-1' }, ...(job.runnerLabels || []).map((label) => badge(label, 'neutral'))) },
          { label: 'Started', value: relativeTimeEl(job.startedAt || run.createdAt) },
          { label: 'Completed', value: job.completedAt ? relativeTimeEl(job.completedAt) : 'still running' },
          { label: 'Steps', value: `${steps.length} (${steps.filter((s) => s.conclusion === 'success').length} succeeded)` },
        ]))));

  return actionsShell(repo, run.workflowId, main);
}

function toggleWrap(viewer) {
  const current = viewer.dataset.wrap === 'true';
  viewer.dataset.wrap = current ? 'false' : 'true';
  viewer.classList.toggle('is-unwrapped', current);
}

function logViewer(job, logs, steps) {
  const viewer = h('div', {
    class: 'log-viewer', role: 'log', 'aria-live': 'polite', 'aria-label': `Logs for ${job.name}`,
    dataset: { wrap: 'true' }, tabindex: '0',
  });

  const stepNames = new Map(steps.map((step) => [step.number, step.name]));
  let lineNo = 0;

  logs.forEach((entry) => {
    (entry.lines || []).forEach((line) => {
      lineNo += 1;
      const level = line.level || 'info';
      const row = h('div', { class: 'log-line', dataset: { level } },
        h('span', { class: 'log-ts' }, line.ts || ''),
        h('span', { class: 'log-step' }, `${entry.number} ${stepNames.get(entry.number) || entry.name}`),
        h('span', { class: 'log-msg' }, line.text || ''));
      viewer.appendChild(row);
    });
  });

  if (!lineNo) {
    viewer.appendChild(h('div', { class: 'log-line', dataset: { level: 'info' } },
      h('span', { class: 'log-ts' }, ''),
      h('span', { class: 'log-step' }, 'job'),
      h('span', { class: 'log-msg' }, 'No logs have been produced yet for this job.')));
  }

  return viewer;
}

/* --------------------------------------------------------- caches / etc. */

export function renderCaches(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const caches = (getDatabase().caches || []).filter((c) => c.repoFullName === repo.fullName);
  const total = caches.reduce((sum, c) => sum + (c.size || 0), 0);
  const maintainer = isMaintainer(repo);

  const table = dataTable([
    { key: 'key', label: 'Key', render: (row) => h('span', {}, h('code', { class: 'code-inline' }, row.key), ' ', badge(row.cacheVersion || 'v1', 'neutral')) },
    { key: 'branch', label: 'Branch', render: (row) => h('a', { href: `/${repo.fullName}/tree/${row.branch}` }, row.branch) },
    { key: 'size', label: 'Size', render: (row) => formatBytes(row.size) },
    { key: 'lastAccessedAt', label: 'Last accessed', render: (row) => relativeTimeEl(row.lastAccessedAt) },
    { key: 'actions', label: '', render: (row) => maintainer
      ? h('button', {
        class: 'btn btn-sm btn-invisible', type: 'button', 'aria-label': `Delete cache ${row.key}`,
        onClick: () => confirmDialog({ title: 'Delete this cache?', body: `Cache ${row.key} will be removed. The next run rebuilds it.`, confirmLabel: 'Delete', danger: true })
          .then((ok) => { if (ok) { api.deleteCache(row.id); rerender(); toast({ message: 'Cache deleted', variant: 'success' }); } }),
      }, icon('trash', { size: 16 }))
      : null },
  ], caches, {
    caption: 'Actions caches',
    emptyText: 'No caches have been created yet.',
  });

  return actionsShell(repo, 'caches', h('main', { class: 'main-col' },
    pageHeader('Caches', {
      description: `${caches.length} caches · ${formatBytes(total)} total`,
      actions: maintainer ? h('button', {
        class: 'btn btn-sm btn-danger', type: 'button',
        onClick: () => confirmDialog({ title: 'Delete all caches?', body: 'Every cache for this repository will be removed.', confirmLabel: 'Delete all', danger: true })
          .then((ok) => { if (ok) { caches.forEach((c) => api.deleteCache(c.id)); rerender(); toast({ message: 'All caches deleted', variant: 'success' }); } }),
      }, 'Delete all caches') : null,
    }),
    h('div', { class: 'card card-flush' }, table)));
}

export function renderArtifacts(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const artifacts = (getDatabase().artifacts || []).filter((a) => a.repoFullName === repo.fullName);
  const maintainer = isMaintainer(repo);

  const table = dataTable([
    { key: 'name', label: 'Artifact', render: (row) => h('span', {}, icon('package', { size: 16 }), ` ${row.name}`) },
    { key: 'size', label: 'Size', render: (row) => formatBytes(row.size) },
    { key: 'runId', label: 'Run', render: (row) => h('a', { href: `/${repo.fullName}/actions/runs/${row.runId}` }, `#${row.runId}`) },
    { key: 'createdAt', label: 'Created', render: (row) => relativeTimeEl(row.createdAt) },
    { key: 'expiresAt', label: 'Expires', render: (row) => relativeTimeEl(row.expiresAt) },
    { key: 'downloadCount', label: 'Downloads', render: (row) => String(row.downloadCount || 0) },
    {
      key: 'actions', label: '', render: (row) => h('span', { class: 'row gap-1' },
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => toast({ message: `Downloading ${row.name}.zip (demo)`, variant: 'info' }) }, icon('download', { size: 16 })),
        maintainer ? h('button', {
          class: 'btn btn-sm btn-invisible', type: 'button', 'aria-label': `Delete ${row.name}`,
          onClick: () => confirmDialog({ title: 'Delete artifact?', body: `${row.name} will be permanently removed.`, confirmLabel: 'Delete', danger: true })
            .then((ok) => { if (ok) { api.deleteArtifact(row.id); rerender(); toast({ message: 'Artifact deleted', variant: 'success' }); } }),
        }, icon('trash', { size: 16 })) : null),
    },
  ], artifacts, { caption: 'Workflow artifacts', emptyText: 'No artifacts have been uploaded.' });

  return actionsShell(repo, 'artifacts', h('main', { class: 'main-col' },
    pageHeader('Artifacts', { description: `${artifacts.length} artifacts produced by workflow runs` }),
    h('div', { class: 'card card-flush' }, table)));
}

export function renderSecrets(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const db = getDatabase();
  const secrets = (db.secrets || []).filter((s) => s.repoFullName === repo.fullName || s.scope === 'organization');
  const variables = (db.variables || []).filter((v) => v.repoFullName === repo.fullName);
  const maintainer = isMaintainer(repo);

  const secretRows = secrets.map((secret) => h('div', { class: 'check-row' },
    icon('key', { size: 16 }),
    h('div', { class: 'grow' },
      h('span', { class: 'check-name' }, secret.name, ' ', badge(secret.scope, secret.scope === 'organization' ? 'accent' : 'neutral')),
      h('span', { class: 'check-desc' }, `Updated ${new Date(secret.updatedAt).toLocaleDateString()}${secret.environments && secret.environments.length ? ` · ${secret.environments.join(', ')}` : ''}`)),
    maintainer ? h('button', {
      class: 'btn btn-sm', type: 'button',
      onClick: () => openSecretDialog(repo, secret),
    }, 'Update') : null,
    maintainer ? h('button', {
      class: 'btn btn-sm btn-invisible', type: 'button', 'aria-label': `Delete ${secret.name}`,
      onClick: () => confirmDialog({ title: `Delete ${secret.name}?`, body: 'Workflows referencing this secret will fail.', confirmLabel: 'Delete secret', danger: true })
        .then((ok) => { if (ok) { api.deleteSecret(secret.id); rerender(); toast({ message: 'Secret deleted', variant: 'success' }); } }),
    }, icon('trash', { size: 16 })) : null));

  const variableRows = variables.map((variable) => h('div', { class: 'check-row' },
    icon('code', { size: 16 }),
    h('div', { class: 'grow' },
      h('span', { class: 'check-name' }, variable.name),
      h('span', { class: 'check-desc' }, h('code', { class: 'code-inline' }, variable.value))),
    maintainer ? h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openVariableDialog(repo, variable) }, 'Edit') : null,
    maintainer ? h('button', {
      class: 'btn btn-sm btn-invisible', type: 'button', 'aria-label': `Delete ${variable.name}`,
      onClick: () => confirmDialog({ title: `Delete ${variable.name}?`, body: 'Workflows referencing this variable will read an empty value.', confirmLabel: 'Delete variable', danger: true })
        .then((ok) => { if (ok) { api.deleteVariable(variable.id); rerender(); toast({ message: 'Variable deleted', variant: 'success' }); } }),
    }, icon('trash', { size: 16 })) : null));

  return actionsShell(repo, 'secrets', h('main', { class: 'main-col' },
    pageHeader('Secrets and variables', {
      description: 'Secrets are encrypted and exposed to workflows as environment variables.',
      actions: maintainer ? h('div', { class: 'row gap-2' },
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', onClick: () => openSecretDialog(repo, null) }, icon('plus', { size: 16 }), 'New repository secret'),
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openVariableDialog(repo, null) }, icon('plus', { size: 16 }), 'New variable')) : null,
    }),
    h('section', {},
      h('h2', { class: 'section-title' }, 'Secrets', counter(secrets.length)),
      h('div', { class: 'card card-flush' },
        secretRows.length ? secretRows : [h('p', { class: 'text-small text-muted p-3' }, 'No secrets have been added.')])),
    h('section', { class: 'mt-5' },
      h('h2', { class: 'section-title' }, 'Variables', counter(variables.length)),
      h('div', { class: 'card card-flush' },
        variableRows.length ? variableRows : [h('p', { class: 'text-small text-muted p-3' }, 'No variables have been added.')]))));
}

function openSecretDialog(repo, secret) {
  const name = h('input', { class: 'input', type: 'text', value: secret ? secret.name : '', placeholder: 'MY_SECRET', 'aria-label': 'Secret name' });
  if (secret) name.readOnly = true;
  const value = h('input', { class: 'input', type: 'password', placeholder: secret ? '••••••••' : 'Secret value', 'aria-label': 'Secret value', autocomplete: 'new-password' });

  openDialog({
    title: secret ? `Update ${secret.name}` : 'New secret',
    body: h('div', { class: 'dialog-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name,
        h('span', { class: 'field-help' }, 'Upper case letters, digits and underscores. Referenced as ${{ secrets.NAME }}.')),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Value'), value,
        h('span', { class: 'field-help' }, 'Values are write-only; they cannot be read back after saving.'))),
    confirmLabel: secret ? 'Update secret' : 'Add secret',
    onConfirm: () => {
      const payload = { name: name.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'), value: value.value };
      if (!payload.name) { toast({ message: 'A secret name is required', variant: 'attention' }); return false; }
      api.saveSecret('repository', repo.fullName, payload);
      rerender();
      toast({ message: secret ? 'Secret updated' : 'Secret added', variant: 'success' });
      return true;
    },
  });
}

function openVariableDialog(repo, variable) {
  const name = h('input', { class: 'input', type: 'text', value: variable ? variable.name : '', placeholder: 'NODE_VERSION', 'aria-label': 'Variable name' });
  const value = h('input', { class: 'input', type: 'text', value: variable ? variable.value : '', placeholder: '20', 'aria-label': 'Variable value' });

  openDialog({
    title: variable ? `Edit ${variable.name}` : 'New variable',
    body: h('div', { class: 'dialog-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Value'), value),
      h('p', { class: 'field-help' }, 'Variables are visible in workflow logs. Use secrets for sensitive values.')),
    confirmLabel: variable ? 'Save variable' : 'Add variable',
    onConfirm: () => {
      const payload = { name: name.value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_'), value: value.value };
      if (!payload.name) { toast({ message: 'A variable name is required', variant: 'attention' }); return false; }
      api.saveVariable(repo.fullName, payload);
      rerender();
      toast({ message: variable ? 'Variable updated' : 'Variable added', variant: 'success' });
      return true;
    },
  });
}

export function renderVariables(ctx = {}) {
  return renderSecrets(ctx);
}

/* --------------------------------------------------------------- runners */

export function renderRunners(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const runners = (getDatabase().runners || []).filter((r) => r.repoFullName === repo.fullName);
  const maintainer = isMaintainer(repo);

  const cards = runners.map((runner) => h('div', { class: 'job-card runner-card' },
    h('div', { class: 'job-card-header' },
      statusDot(runner.busy ? 'in_progress' : 'idle', null),
      h('span', { class: 'job-name' }, runner.name),
      h('span', { class: 'job-meta' }, runner.os),
      h('span', { class: 'job-meta' }, `v${runner.version}`),
      badge(runner.busy ? 'Busy' : runner.status === 'offline' ? 'Offline' : 'Idle', runner.busy ? 'attention' : runner.status === 'offline' ? 'danger' : 'success')),
    h('div', { class: 'job-card-body' },
      h('div', { class: 'row gap-1' }, ...(runner.labels || []).map((label) => badge(label, 'neutral'))),
      h('p', { class: 'text-small text-muted mt-2' }, `Group: ${runner.group || 'default'}`)),
    h('div', { class: 'job-card-footer' },
      h('button', { class: 'btn btn-sm', type: 'button', onClick: () => toast({ message: 'Runner logs opened (demo)', variant: 'info' }) }, icon('file', { size: 16 }), 'Logs'),
      maintainer ? h('button', {
        class: 'btn btn-sm btn-danger', type: 'button',
        onClick: () => confirmDialog({ title: `Remove ${runner.name}?`, body: 'Jobs queued for this runner will wait for another runner.', confirmLabel: 'Remove runner', danger: true })
          .then((ok) => { if (ok) { api.removeRunner(runner.id); rerender(); toast({ message: 'Runner removed', variant: 'success' }); } }),
      }, 'Remove') : null)));

  return actionsShell(repo, 'runners', h('main', { class: 'main-col' },
    pageHeader('Runners', { description: `${runners.length} self-hosted runners · ${runners.filter((r) => r.busy).length} busy`, actions: maintainer ? h('button', { class: 'btn btn-sm btn-primary', type: 'button', onClick: () => openNewRunnerDialog(repo) }, icon('plus', { size: 16 }), 'New self-hosted runner') : null,}),
    cards.length ? h('div', { class: 'job-list runner-grid' }, ...cards) : emptyState({
      title: 'No self-hosted runners',
      description: 'Runs execute on RedGet-hosted runners. Add a self-hosted runner for private infrastructure.',
      iconName: 'server',
      actions: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openNewRunnerDialog(repo) }, 'New self-hosted runner'),
    })));
}

function openNewRunnerDialog(repo) {
  const name = h('input', { class: 'input', type: 'text', value: `${BRAND.slug}-runner`, 'aria-label': 'Runner name' });
  const labels = h('input', { class: 'input', type: 'text', value: 'self-hosted, linux, x64', 'aria-label': 'Runner labels' });

  openDialog({
    title: 'New self-hosted runner',
    size: 'md',
    body: h('div', { class: 'dialog-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Name'), name),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Labels'), labels,
        h('span', { class: 'field-help' }, 'Comma separated. Jobs select runners by label.')),
      h('div', { class: 'code-block-wrap' },
        h('div', { class: 'code-block-header' }, 'Install on the runner machine'),
        h('pre', { class: 'code-block' }, h('code', {},
          `mkdir actions-runner && cd actions-runner\n`
          + `curl -O -L /${repo.fullName}/settings/actions/runners/runner.tar.gz\n`
          + `tar xzf runner.tar.gz\n`
          + `./config.sh --url /${repo.fullName} --token ${'A'.repeat(12)}…`)))),
    confirmLabel: 'Register runner',
    onConfirm: () => {
      const db = getDatabase();
      const id = `run-local-${Date.now().toString(36)}`;
      db.runners.push({
        id,
        repoFullName: repo.fullName,
        name: name.value.trim() || `${BRAND.slug}-runner`,
        labels: labels.value.split(',').map((l) => l.trim()).filter(Boolean),
        status: 'idle', version: '2.318.0', os: 'Ubuntu 24.04', busy: false, group: 'default', orgLogin: null,
      });
      rerender();
      toast({ message: 'Runner registered (demo)', variant: 'success' });
      return true;
    },
  });
}

/* ---------------------------------------------------------- environments */

export function renderEnvironments(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const db = getDatabase();
  const environments = (db.environments || []).filter((e) => e.repoFullName === repo.fullName);
  const deployments = (db.deployments || []).filter((d) => d.repoFullName === repo.fullName);
  const maintainer = isMaintainer(repo);

  const cards = environments.map((environment) => {
    const envDeployments = deployments.filter((d) => d.environment === environment.name);
    const body = h('div', { class: 'environment-card' },
      h('div', { class: 'job-card-header' },
        icon('rocket', { size: 16 }),
        h('span', { class: 'job-name' }, environment.name),
        h('a', { class: 'job-meta', href: environment.url }, environment.url),
        badge(`${environment.secrets || 0} secrets`, 'neutral'),
        badge(`${environment.variables || 0} variables`, 'neutral')),
      h('div', { class: 'job-card-body' },
        h('h3', { class: 'meta-section-title' }, 'Protection rules'),
        environment.protectionRules && environment.protectionRules.length
          ? h('ul', { class: 'link-list', role: 'list' }, ...environment.protectionRules.map((rule) => h('li', {}, icon('shield', { size: 16 }), ` ${rule}`)))
          : h('p', { class: 'text-small text-muted' }, 'No protection rules configured.'),
        h('h3', { class: 'meta-section-title mt-4' }, 'Deployment history', counter(envDeployments.length)),
        envDeployments.length
          ? h('ul', { class: 'deployment-list', role: 'list' },
            ...envDeployments.slice(0, 5).map((deployment) => h('li', { class: 'check-row' },
              checkStateIcon(deployment.state === 'success' ? 'completed' : deployment.state === 'in_progress' ? 'in_progress' : 'completed', deployment.state === 'success' ? 'success' : deployment.state === 'failure' ? 'failure' : null),
              h('div', { class: 'grow' },
                h('span', { class: 'check-name' }, deployment.description),
                h('span', { class: 'check-desc' }, `${deployment.creator} · ${String(deployment.sha || '').slice(0, 7)}`)),
              relativeTimeEl(deployment.createdAt))))
          : h('p', { class: 'text-small text-muted' }, 'No deployments yet.')),
      h('div', { class: 'job-card-footer' },
        maintainer ? h('button', { class: 'btn btn-sm', type: 'button', onClick: () => toast({ message: `Opening environment settings for ${environment.name} (demo)`, variant: 'info' }) }, icon('gear', { size: 16 }), 'Configure') : null,
        h('a', { class: 'btn btn-sm', href: environment.url }, 'View deployments')));
    return body;
  });

  return actionsShell(repo, 'environments', h('main', { class: 'main-col' },
    pageHeader('Environments', { description: 'Environments gate deployments with required reviewers, wait timers and branch rules.', actions: maintainer ? h('button', { class: 'btn btn-sm btn-primary', type: 'button', onClick: () => toast({ message: 'Environment creation happens in repository settings (demo)', variant: 'info' }) }, icon('plus', { size: 16 }), 'New environment') : null,}),
    cards.length ? h('div', { class: 'job-list' }, ...cards) : emptyState({ title: 'No environments', description: 'Create an environment to require approvals before deploying.', iconName: 'rocket' })));
}

/* ---------------------------------------------------------- merge queue */

export function renderQueue(ctx = {}) {
  const found = repoContext(ctx.params);
  if (!found) return repoNotFound(`${ctx.params.login}/${ctx.params.repo}`);
  const { repo } = found;
  const db = getDatabase();
  const queue = (db.pullRequests || []).filter((p) => p.repoFullName === repo.fullName && p.state === 'open' && !p.draft && p.autoMerge);

  const rows = queue.map((pull) => h('div', { class: 'run-row' },
    icon('git-pull-request', { size: 16 }),
    h('div', { class: 'run-body' },
      h('div', { class: 'run-title' },
        h('a', { href: `/${repo.fullName}/pull/${pull.number}` }, `${pull.title} #${pull.number}`),
        badge(pull.autoMerge.method, 'accent')),
      h('div', { class: 'run-meta' },
        h('a', { class: 'sha', href: `/${repo.fullName}/tree/${pull.headBranch}` }, pull.headBranch),
        h('span', {}, `into ${pull.baseBranch}`),
        h('span', {}, '·'),
        avatar(pull.authorLogin, { size: 16 }),
        relativeTimeEl(pull.autoMerge.enabledAt || pull.updatedAt))),
    h('div', { class: 'run-side' },
      h('a', { class: 'btn btn-sm', href: `/${repo.fullName}/pull/${pull.number}` }, 'View'))));

  const main = h('main', { class: 'main-col' },
    pageHeader('Merge queue', { description: `Pull requests waiting to merge into protected branches · ${queue.length} queued` }),
    h('div', { class: 'card card-flush' },
      rows.length ? rows : [emptyState({
        title: 'The merge queue is empty',
        description: 'Enable auto-merge on a pull request targeting a protected branch to add it here.',
        iconName: 'git-merge',
        action: h('a', { class: 'btn btn-primary', href: `/${repo.fullName}/pulls` }, 'Browse pull requests'),
      })]),
    h('section', { class: 'mt-5' },
      h('h2', { class: 'section-title' }, 'How the queue works'),
      h('div', { class: 'card' },
        h('ol', { class: 'numbered-list' },
          h('li', {}, 'A pull request with auto-merge enabled joins the queue for its base branch.'),
          h('li', {}, 'RedGet creates a temporary merge group commit and runs the required checks.'),
          h('li', {}, 'When checks pass and the branch is still mergeable, the queue merges in order.'),
          h('li', {}, 'A failure removes the pull request from the queue and notifies the author.'))),
      h('p', { class: 'text-small text-muted mt-2' },
        'Configure the queue in ', h('a', { href: `/${repo.fullName}/settings/branches` }, 'Branch protection rules'), '.')));

  return actionsShell(repo, 'queue', main);
}

/* ------------------------------------------------------------- badge svg */

export function renderBadge(ctx = {}) {
  const found = repoContext(ctx.params);
  const repo = found ? found.repo : null;
  const workflows = repo ? workflowsFor(repo) : [];
  const workflow = workflows.find((w) => w.id === ctx.params.workflowId) || workflows[0];
  const runs = workflow ? runsFor(repo, workflow.id) : [];
  const last = [...runs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const state = !last ? 'no runs'
    : last.conclusion === 'success' ? 'passing'
      : last.conclusion === 'failure' ? 'failing'
        : last.status === 'in_progress' ? 'running' : 'queued';
  const fill = state === 'passing' ? '#1f883d' : state === 'failing' ? '#d61a2f' : state === 'running' ? '#bf8700' : '#6e7681';

  const label = workflow ? workflow.name : 'RedGet Actions';
  const labelWidth = Math.max(52, label.length * 7 + 18);
  const width = labelWidth + 74;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${label}: ${state}">
  <title>${label}: ${state}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r"><rect width="${width}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="20" fill="#0d0d11"/>
    <rect x="${labelWidth}" width="74" height="20" fill="${fill}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#000" fill-opacity=".3">${label}</text>
    <text x="${labelWidth / 2}" y="14">${label}</text>
    <text x="${labelWidth + 37}" y="15" fill="#000" fill-opacity=".3">${state}</text>
    <text x="${labelWidth + 37}" y="14">${state}</text>
  </g>
</svg>`;

  const node = h('div', { class: 'badge-preview' },
    h('div', { class: 'card' },
      svgWrap(svg),
      h('div', { class: 'field mt-3' },
        h('span', { class: 'field-label' }, 'Embed'),
        h('pre', { class: 'code-block' }, h('code', {}, `[![${label}](${workflow ? `/${repo.fullName}/actions/workflows/${workflow.id}/badge.svg` : ''})](${repo ? `/${repo.fullName}/actions/workflows/${workflow ? workflow.id : ''}` : ''})`)))),
    h('p', { class: 'text-small text-muted mt-2' }, 'Badge SVG rendered from the latest run of this workflow.'));

  if (!repo) {
    return h('div', { class: 'container' }, node);
  }
  return actionsShell(repo, workflow ? workflow.id : 'all', h('main', { class: 'main-col' },
    pageHeader('Workflow badge', { description: `${label} · ${state}` }),
    node));
}

function workflowMenu(repo, workflow) {
  const trigger = h('button', { class: 'btn btn-sm', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': 'Workflow settings' }, icon('kebab', { size: 16 }));
  const menu = h('ul', { class: 'dropdown-menu', role: 'menu', hidden: true },
    h('li', { role: 'none' }, h('button', {
      class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
      onClick: () => {
        api.setWorkflowState(workflow.id, repo.fullName, workflow.state === 'active' ? 'disabled_manually' : 'active');
        rerender();
        toast({ message: `Workflow ${workflow.state === 'active' ? 'disabled' : 'enabled'}`, variant: 'success' });
      },
    }, icon('stop', { size: 16 }), h('span', {}, workflow.state === 'active' ? 'Disable workflow' : 'Enable workflow'))),
    h('li', { role: 'none' }, h('a', {
      class: 'dropdown-item', role: 'menuitem', tabindex: '-1',
      href: `/${repo.fullName}/blob/${repo.defaultBranch}/${workflow.path}`,
    }, icon('file-code', { size: 16 }), h('span', {}, 'View workflow file'))),
    h('li', { role: 'none' }, h('a', {
      class: 'dropdown-item', role: 'menuitem', tabindex: '-1',
      href: `/${repo.fullName}/actions/workflows/${workflow.id}/badge.svg`,
    }, icon('image', { size: 16 }), h('span', {}, 'Get badge'))));
  attachMenu(trigger, menu, { align: 'right' });
  return h('div', { class: 'dropdown' }, trigger, menu);
}

function svgWrap(svg) {
  const wrap = h('div', { class: 'badge-preview-render' });
  wrap.innerHTML = svg;
  return wrap;
}

/* ----------------------------------------------------------- dispatch ui */

function openDispatchDialog(repo, workflow) {
  const ref = h('input', { class: 'input', type: 'text', value: repo.defaultBranch, 'aria-label': 'Branch or tag' });
  const inputs = (workflow.inputs || []).map((input) => h('label', { class: 'field' },
    h('span', { class: 'field-label' }, input.name),
    h('input', { class: 'input', type: 'text', value: input.default || '', 'aria-label': input.name }),
    input.description ? h('span', { class: 'field-help' }, input.description) : null));

  openDialog({
    title: `Run workflow: ${workflow.name}`,
    body: h('div', { class: 'dialog-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Use workflow from'), ref),
      inputs.length ? inputs : h('p', { class: 'text-small text-muted' }, 'This workflow defines no inputs.')),
    confirmLabel: 'Run workflow',
    onConfirm: () => {
      const db = getDatabase();
      const id = `${Math.floor(90000 + Math.random() * 9000)}`;
      const at = new Date().toISOString();
      db.runs.unshift({
        id, runNumber: (runsFor(repo).length || 0) + 1, repoFullName: repo.fullName,
        workflowId: workflow.id, workflowName: workflow.name,
        name: `${workflow.name} #${(runsFor(repo).length || 0) + 1}`,
        displayTitle: 'Manually dispatched run',
        headBranch: ref.value.trim() || repo.defaultBranch,
        headSha: 'manual0000000000000000000000000000000000',
        event: 'workflow_dispatch', status: 'queued', conclusion: null,
        actorLogin: getSession().login, triggeringActorLogin: getSession().login,
        createdAt: at, updatedAt: at, runStartedAt: at, durationMs: 0, attempt: 1,
        artifacts: [], url: `/${repo.fullName}/actions/runs/${id}`, jobs: [],
      });
      rerender();
      toast({ message: `Dispatched ${workflow.name} on ${ref.value || repo.defaultBranch}`, variant: 'success' });
      return true;
    },
  });
}

export default {
  render, renderRuns, renderRun, renderJob, renderWorkflow, renderCaches,
  renderSecrets, renderVariables, renderRunners, renderEnvironments,
  renderArtifacts, renderQueue, renderBadge,
};
