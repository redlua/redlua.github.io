/**
 * RedGet — forge views: Actions, Projects, Wiki, Security, Insights,
 * Settings, Releases, Tags, Branches, Discussions, Packages, Stargazers, Forks.
 *
 * Everything here is rendered from real records: workflows parsed from
 * `.redget/workflows/*.yml`, runs created by real events, wiki pages and
 * project boards the account actually made, security findings computed from
 * the files that exist, and contributor lists derived from commit authors and
 * real star/fork records.
 */

import { ME, saveDB } from '../state.js';
import { esc, uid, timeAgo, formatDate, formatBytes, formatDuration } from '../core/util.js';
import { ic } from '../icons.js';
import { avatarHTML } from '../core/avatars.js';
import { getUserByUsername, stargazers, forksOf } from '../core/social.js';
import { md } from '../core/markdown.js';
import { langColor } from '../core/languages.js';
import { toast } from '../core/toast.js';
import { openModal, closeModal } from '../core/modal.js';
import { render } from '../core/render.js';
import { commitsFor, languageBreakdown, createBranch, deleteBranch, setDefaultBranch, createRelease, deleteRelease, deleteTag } from '../core/model.js';
import { canEditForge } from '../core/forges.js';
import { workflowsFor, runsFor, runById, rerun, setWorkflowState, artifactsFor, cachesFor,
  secretsFor, saveSecret, deleteSecret, variablesFor, saveVariable, deleteVariable,
  environmentsFor, saveEnvironment, deleteEnvironment, runSummary, triggerRuns } from '../core/actions.js';
import { projectsFor, projectById, itemsInColumn, projectProgress, PROJECT_LAYOUTS } from '../core/projects.js';
import { wikiPages, wikiPageBySlug, createWikiPage, updateWikiPage, deleteWikiPage, restoreWikiPage } from '../core/wiki.js';
import {
  secretFindings, codeFindings, dependencyFindings, advisoriesFor, createAdvisory, publishAdvisory,
  closeAdvisory, deleteAdvisory, securitySummary, securitySettings, saveSecuritySettings, dismissAlert, reopenAlert,
} from '../core/security.js';
import { discussionsFor, toggleUpvote, markAnswer, DISCUSSION_CATEGORIES } from '../core/marketplace.js';
import { packagesFor, createPackage, addPackageVersion, deletePackage, packageFromRelease } from '../core/marketplace.js';

/* ============================================================ ACTIONS === */

export function viewForgeActions(user, forge, rest) {
  var workflows = workflowsFor(forge);
  var runs = runsFor(forge);

  if (!workflows.length) {
    return '<div class="empty">' +
      '<div class="empty-icon">' + ic('play', 32) + '</div>' +
      '<h3>No workflows yet</h3>' +
      '<p>Actions run the workflow files stored in <span class="mono">.redget/workflows/</span>. ' +
      'Add one to this forge and every push will trigger a real run.</p>' +
      (canEditForge(user, forge)
        ? '<button class="btn primary" id="newWorkflowBtn">' + ic('plus', 14) + ' Set up a workflow</button>'
        : '') +
    '</div>';
  }

  var activeWorkflow = rest && rest[0] === 'workflows' ? rest[1] : null;
  var runTab = rest && rest[0] === 'runs' ? rest[1] : null;

  if (runTab === 'new') return viewNewRun(user, forge, workflows);
  if (activeWorkflow && rest[2]) return viewRunDetail(user, forge, activeWorkflow, rest[2]);
  if (activeWorkflow) return viewWorkflowDetail(user, forge, activeWorkflow);
  if (rest && rest[0] === 'artifacts') return viewArtifacts(user, forge);
  if (rest && rest[0] === 'caches') return viewCaches(user, forge);

  var counts = { success: 0, failure: 0, cancelled: 0 };
  runs.forEach(function (r) { if (counts[r.conclusion] !== undefined) counts[r.conclusion]++; });

  return '<div class="actions-head">' +
    '<div class="actions-head-left">' +
      '<span class="actions-head-title">Actions</span>' +
      '<span class="actions-head-meta">' + runs.length + ' run' + (runs.length === 1 ? '' : 's') +
      ' · ' + counts.success + ' succeeded · ' + counts.failure + ' failed</span>' +
    '</div>' +
    '<div class="actions-head-right">' +
      '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/actions/artifacts">' + ic('package', 14) + ' Artifacts</a>' +
      '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/actions/caches">' + ic('database', 14) + ' Caches</a>' +
      '<a class="btn sm primary" href="#/' + user.username + '/' + forge.name + '/actions/runs/new">' + ic('play', 14) + ' New run</a>' +
    '</div>' +
  '</div>' +
  '<div class="actions-layout">' +
    '<aside class="actions-side">' +
      '<div class="actions-side-head">Workflows</div>' +
      '<a class="actions-side-item" href="#/' + user.username + '/' + forge.name + '/actions">' +
        '<span class="actions-side-name">All</span><span class="actions-side-count">' + runs.length + '</span></a>' +
      workflows.map(function (w) {
        var wRuns = runsFor(forge, w.id);
        var last = wRuns[0] || null;
        var wIcon = last && last.conclusion === 'failure' ? ic('x', 12) : ic('checkCircle', 12);
        return '<a class="actions-side-item" href="#/' + user.username + '/' + forge.name + '/actions/workflows/' + w.id + '">' +
          '<span class="actions-side-name">' + wIcon + esc(w.name) + '</span>' +
          '<span class="actions-side-count">' + wRuns.length + '</span></a>';
      }).join('') +
      '<div class="actions-side-head" style="margin-top:16px">Management</div>' +
      '<a class="actions-side-item" href="#/' + user.username + '/' + forge.name + '/settings/actions"><span class="actions-side-name">Settings</span></a>' +
    '</aside>' +
    '<div class="actions-main">' +
      (runs.length ? '<div class="card-tight actions-runs">' + runs.map(function (run) {
        return runRow(user, forge, run);
      }).join('') + '</div>'
      : '<div class="empty"><div class="empty-icon">' + ic('play', 32) + '</div><h3>No runs yet</h3>' +
        '<p>Push a commit, open a pull request, or start a run manually.</p>' +
        '<a class="btn primary" href="#/' + user.username + '/' + forge.name + '/actions/runs/new">New run</a></div>') +
    '</div>' +
  '</div>';
}

function runRow(user, forge, run) {
  var summary = runSummary(forge, run);
  var icon = run.conclusion === 'success' ? 'checkCircle' : run.conclusion === 'failure' ? 'x' : 'slash';
  var colour = run.conclusion === 'success' ? 'var(--green)' : run.conclusion === 'failure' ? 'var(--red)' : 'var(--text-muted)';
  return '<div class="run-row">' +
    '<span class="run-icon" style="color:' + colour + '">' + ic(icon, 16) + '</span>' +
    '<div class="run-body">' +
      '<a class="run-title" href="#/' + user.username + '/' + forge.name + '/actions/workflows/' + run.workflowId + '/' + run.id + '">' +
        esc(run.workflowName) + ' #' + run.number + ' · ' + esc(run.displayTitle) + '</a>' +
      '<div class="run-meta">' +
        esc(run.event) + ' on <span class="mono">' + esc(run.branch) + '</span> · ' +
        '<span class="mono">' + String(run.sha).slice(0, 7) + '</span> · ' +
        esc(run.actor) + ' · ' + timeAgo(run.created) + ' · ' + formatDuration(run.durationMs) + ' · ' +
        summary.jobs + ' job' + (summary.jobs === 1 ? '' : 's') +
      '</div>' +
    '</div>' +
    '<div class="run-side">' +
      '<span class="label ' + (run.conclusion === 'success' ? 'green' : run.conclusion === 'failure' ? 'red' : '') + '">' + esc(run.status) + '</span>' +
      '<button class="btn sm rerunBtn" data-run="' + esc(run.id) + '" title="Re-run">' + ic('sync', 12) + '</button>' +
    '</div>' +
  '</div>';
}

function viewWorkflowDetail(user, forge, workflowId) {
  var workflow = workflowsFor(forge).filter(function (w) { return w.id === workflowId; })[0];
  if (!workflow) return notFound('Workflow', 'That workflow file is no longer in the forge.');
  var runs = runsFor(forge, workflow.id);
  return '<div class="actions-head">' +
    '<div class="actions-head-left">' +
      '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/actions">' + ic('chevronLeft', 14) + ' Actions</a>' +
      '<span class="actions-head-title">' + esc(workflow.name) + '</span>' +
      '<span class="actions-head-meta"><span class="mono">' + esc(workflow.path) + '</span> · on ' +
        workflow.on.map(esc).join(', ') + ' · ' + workflow.jobs.length + ' job' + (workflow.jobs.length === 1 ? '' : 's') + '</span>' +
    '</div>' +
    '<div class="actions-head-right">' +
      '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/blob/' + esc(workflow.path) + '">' + ic('code', 14) + ' View file</a>' +
      '<button class="btn sm ' + (workflow.state === 'disabled' ? 'primary' : '') + ' toggleWorkflowBtn" data-id="' + esc(workflow.id) + '" data-state="' +
        (workflow.state === 'disabled' ? 'active' : 'disabled') + '">' + ic('skip', 14) + (workflow.state === 'disabled' ? ' Enable' : ' Disable') + '</button>' +
      '<button class="btn sm primary runWorkflowBtn" data-id="' + esc(workflow.id) + '">' + ic('play', 14) + ' Run workflow</button>' +
    '</div>' +
  '</div>' +
  '<div class="card mb-4"><h3 class="card-title">Jobs</h3>' +
    workflow.jobs.map(function (job) {
      return '<div class="list-item"><div class="list-icon">' + ic('gear', 16) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(job.name) + '</div>' +
        '<div class="list-meta">runs-on ' + esc(job.runsOn) + ' · ' + job.steps.length + ' step' + (job.steps.length === 1 ? '' : 's') + ': ' +
        job.steps.map(esc).join(' → ') + '</div></div></div>';
    }).join('') +
  '</div>' +
  '<div class="card-tight actions-runs">' +
    (runs.length ? runs.map(function (run) { return runRow(user, forge, run); }).join('')
      : '<div class="empty"><h3>No runs</h3><p>Trigger one with a commit or the Run workflow button.</p></div>') +
  '</div>';
}

function viewRunDetail(user, forge, workflowId, runId) {
  var run = runById(forge, runId);
  if (!run) return notFound('Run', 'That run is not in this forge.');
  var summary = runSummary(forge, run);
  return '<div class="actions-head">' +
    '<div class="actions-head-left">' +
      '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/actions/workflows/' + esc(workflowId) + '">' + ic('chevronLeft', 14) + ' ' + esc(run.workflowName) + '</a>' +
      '<span class="actions-head-title">#' + run.number + ' ' + esc(run.displayTitle) + '</span>' +
      '<span class="actions-head-meta">' + esc(run.event) + ' · <span class="mono">' + esc(run.branch) + '</span> · attempt ' + run.attempt +
      ' · ' + timeAgo(run.created) + ' · ' + formatDuration(run.durationMs) + '</span>' +
    '</div>' +
    '<div class="actions-head-right">' +
      '<button class="btn sm rerunBtn" data-run="' + esc(run.id) + '">' + ic('sync', 14) + ' Re-run all jobs</button>' +
      '<button class="btn sm rerunFailedBtn" data-run="' + esc(run.id) + '">' + ic('sync', 14) + ' Re-run failed</button>' +
      '<button class="btn sm danger deleteRunBtn" data-run="' + esc(run.id) + '">' + ic('trash', 14) + ' Delete</button>' +
    '</div>' +
  '</div>' +
  '<div class="run-summary">' +
    '<span class="label ' + (run.conclusion === 'success' ? 'green' : run.conclusion === 'failure' ? 'red' : '') + '">' + esc(run.conclusion || run.status) + '</span>' +
    '<span class="run-summary-item">' + ic('gear', 12) + ' ' + summary.jobs + ' jobs</span>' +
    '<span class="run-summary-item">' + ic('check', 12) + ' ' + summary.steps + ' steps</span>' +
    '<span class="run-summary-item">' + ic('redCommit', 12) + ' <span class="mono">' + String(run.sha).slice(0, 7) + '</span></span>' +
    '<span class="run-summary-item">' + ic('person', 12) + ' ' + esc(run.actor) + '</span>' +
  '</div>' +
  run.jobs.map(function (job) { return jobBlock(user, forge, run, job); }).join('');
}

function jobBlock(user, forge, run, job) {
  var colour = job.conclusion === 'success' ? 'var(--green)' : job.conclusion === 'failure' ? 'var(--red)' : 'var(--text-muted)';
  return '<div class="card job-card mb-4">' +
    '<div class="job-head">' +
      '<span class="job-icon" style="color:' + colour + '">' + ic(job.conclusion === 'success' ? 'checkCircle' : job.conclusion === 'failure' ? 'x' : 'clock', 16) + '</span>' +
      '<div class="job-head-body">' +
        '<div class="job-title">' + esc(job.name) + ' <span class="label">' + esc(job.runner) + '</span></div>' +
        '<div class="job-meta">' + esc(job.conclusion || job.status) + ' · ' + formatDuration(job.durationMs) + ' · started ' + timeAgo(job.startedAt || run.started) + '</div>' +
      '</div>' +
    '</div>' +
    '<ol class="step-list">' +
      job.steps.map(function (step) {
        var sc = step.conclusion === 'success' ? 'var(--green)' : step.conclusion === 'failure' ? 'var(--red)' : 'var(--text-muted)';
        return '<li class="step">' +
          '<button class="step-head stepToggle" data-job="' + esc(job.id) + '" data-step="' + step.number + '" aria-expanded="false">' +
            '<span class="step-caret">' + ic('chevronRight', 12) + '</span>' +
            '<span class="step-icon" style="color:' + sc + '">' + ic(step.conclusion === 'success' ? 'check' : step.conclusion === 'failure' ? 'x' : 'clock', 12) + '</span>' +
            '<span class="step-name">' + esc(step.name) + '</span>' +
            '<span class="step-dur">' + formatDuration(step.durationMs) + '</span>' +
          '</button>' +
          '<pre class="step-log" hidden>' + step.log.map(function (l) {
            return '<span class="log-line log-' + esc(l.level) + '">' + esc(l.ts) + '  ' + esc(l.text) + '</span>';
          }).join('\n') + '</pre>' +
        '</li>';
      }).join('') +
    '</ol>' +
  '</div>';
}

function viewNewRun(user, forge, workflows) {
  var branches = forge.branches || [forge.defaultBranch];
  return '<div class="card">' +
    '<h3 class="card-title">Run a workflow</h3>' +
    '<p class="muted fs-13 mb-4">Choose a workflow and a branch. The run reads the files in this forge.</p>' +
    '<div class="form-group"><label class="form-label" for="runWorkflow">Workflow</label>' +
      '<select class="input" id="runWorkflow">' + workflows.map(function (w) {
        return '<option value="' + esc(w.id) + '">' + esc(w.name) + ' (' + esc(w.path) + ')</option>';
      }).join('') + '</select></div>' +
    '<div class="form-group"><label class="form-label" for="runBranch">Branch</label>' +
      '<select class="input" id="runBranch">' + branches.map(function (b) {
        return '<option value="' + esc(b) + '"' + (b === forge.defaultBranch ? ' selected' : '') + '>' + esc(b) + '</option>';
      }).join('') + '</select></div>' +
    '<div class="form-group"><label class="form-label" for="runTitle">Run title <span class="muted fs-12">(optional)</span></label>' +
      '<input type="text" class="input" id="runTitle" placeholder="Manual run"></div>' +
    '<div style="display:flex;gap:8px"><button class="btn primary" id="startRunBtn">' + ic('play', 14) + ' Run workflow</button>' +
      '<a class="btn" href="#/' + user.username + '/' + forge.name + '/actions">Cancel</a></div>' +
  '</div>';
}

function viewArtifacts(user, forge) {
  var artifacts = artifactsFor(forge);
  return '<div class="actions-head"><div class="actions-head-left">' +
    '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/actions">' + ic('chevronLeft', 14) + ' Actions</a>' +
    '<span class="actions-head-title">Artifacts</span></div></div>' +
    (artifacts.length ? '<div class="card-tight">' + artifacts.map(function (a) {
      return '<div class="list-item"><div class="list-icon">' + ic('package', 16) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(a.name) + '</div>' +
        '<div class="list-meta">' + formatBytes(a.size) + ' · produced ' + timeAgo(a.created) + ' · expires ' + formatDate(a.expiresAt) + '</div></div>' +
        '<div class="list-side"><a class="btn sm" href="#/' + user.username + '/' + forge.name + '/actions/workflows/' + esc(runById(forge, a.runId).workflowId) + '/' + esc(a.runId) + '">View run</a></div></div>';
    }).join('') + '</div>'
    : '<div class="empty"><div class="empty-icon">' + ic('package', 32) + '</div><h3>No artifacts</h3>' +
      '<p>Artifacts appear after a successful run whose workflow declares a build or upload step.</p></div>');
}

function viewCaches(user, forge) {
  var caches = cachesFor(forge);
  return '<div class="actions-head"><div class="actions-head-left">' +
    '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/actions">' + ic('chevronLeft', 14) + ' Actions</a>' +
    '<span class="actions-head-title">Caches</span></div></div>' +
    (caches.length ? '<div class="card-tight">' + caches.map(function (c) {
      return '<div class="list-item"><div class="list-icon">' + ic('database', 16) + '</div>' +
        '<div class="list-body"><div class="list-title mono">' + esc(c.key) + '</div>' +
        '<div class="list-meta">' + formatBytes(c.size) + ' · branch ' + esc(c.branch) + ' · created ' + timeAgo(c.createdAt) + '</div></div></div>';
    }).join('') + '</div>'
    : '<div class="empty"><div class="empty-icon">' + ic('database', 32) + '</div><h3>No caches</h3>' +
      '<p>A cache is created when a run executes an install step against a package manifest.</p></div>');
}

/* =========================================================== PROJECTS === */

export function viewForgeProjects(user, forge, rest) {
  var list = projectsFor('forge', forgeKey(user, forge));
  if (rest && rest[0]) {
    var project = projectById(rest[0]);
    if (project) return viewProjectBoard(user, forge, project);
  }
  return '<div class="actions-head">' +
    '<div class="actions-head-left"><span class="actions-head-title">Projects</span>' +
      '<span class="actions-head-meta">' + list.length + ' project' + (list.length === 1 ? '' : 's') + '</span></div>' +
    '<div class="actions-head-right">' + (canEditForge(user, forge)
      ? '<button class="btn sm primary newProjectBtn" data-owner="forge" data-key="' + esc(forgeKey(user, forge)) + '">' + ic('plus', 14) + ' New project</button>'
      : '') + '</div>' +
  '</div>' +
  (list.length
    ? '<div class="project-grid">' + list.map(function (p) { return projectCard(user, forge, p); }).join('') + '</div>'
    : '<div class="empty"><div class="empty-icon">' + ic('project', 32) + '</div>' +
      '<h3>No projects</h3><p>Projects are boards, tables and roadmaps that track issues and pull requests from this forge.</p>' +
      (canEditForge(user, forge) ? '<button class="btn primary newProjectBtn" data-owner="forge" data-key="' + esc(forgeKey(user, forge)) + '">Create a project</button>' : '') + '</div>');
}

export function forgeKey(user, forge) {
  return user.username + '/' + forge.name;
}

function projectCard(user, forge, project) {
  var items = (project.items || []).length;
  var progress = projectProgress(project);
  return '<a class="project-card card" href="#/' + user.username + '/' + forge.name + '/projects/' + project.id + '">' +
    '<div class="project-card-head"><b>' + esc(project.title) + '</b>' +
      '<span class="label">' + esc(project.layout) + '</span></div>' +
    '<p class="muted fs-13">' + esc(project.description || 'No description') + '</p>' +
    '<div class="progress" title="' + progress.done + ' of ' + progress.total + ' done"><span style="width:' + progress.percent + '%"></span></div>' +
    '<div class="project-card-meta">' + ic('project', 12) + ' ' + (project.columns || []).length + ' columns · ' + items + ' items · ' +
      progress.percent + '% done · updated ' + timeAgo(project.updated || project.created) + '</div>' +
  '</a>';
}

function viewProjectBoard(user, forge, project) {
  var columns = project.columns || [];
  var isOwner = canEditForge(user, forge);
  var layout = project.layout || 'board';
  if (layout === 'table') return projectTable(user, forge, project, isOwner);
  if (layout === 'roadmap') return projectRoadmap(user, forge, project, isOwner);
  return '<div class="actions-head">' +
    '<div class="actions-head-left">' +
      '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/projects">' + ic('chevronLeft', 14) + ' Projects</a>' +
      '<span class="actions-head-title">' + esc(project.title) + '</span>' +
      '<span class="actions-head-meta">' + esc(project.layout) + ' · ' + columns.length + ' columns · ' +
        (project.items || []).length + ' items</span>' +
    '</div>' +
    '<div class="actions-head-right">' +
      layoutTabs(user, forge, project) +
      (isOwner ? '<button class="btn sm addColumnBtn" data-project="' + esc(project.id) + '">' + ic('plus', 14) + ' Add column</button>' : '') +
    '</div>' +
  '</div>' +
  '<div class="board">' +
    columns.map(function (col) {
      return '<section class="board-col">' +
        '<header class="board-col-head">' +
          '<b>' + esc(col.name) + '</b><span class="board-col-count">' + itemsInColumn(project, col.id).length + '</span>' +
          (isOwner ? '<button class="btn xs addItemBtn" data-column="' + esc(col.id) + '" data-project="' + esc(project.id) + '">' + ic('plus', 12) + '</button>' : '') +
        '</header>' +
        '<div class="board-col-body">' +
          (itemsInColumn(project, col.id).length
            ? itemsInColumn(project, col.id).map(function (item) { return boardItem(user, forge, project, col, item); }).join('')
            : '<div class="board-col-empty muted fs-12">No items</div>') +
        '</div>' +
      '</section>';
    }).join('') +
  '</div>';
}

function layoutTabs(user, forge, project) {
  var base = '#/' + user.username + '/' + forge.name + '/projects/' + project.id;
  return Object.keys(PROJECT_LAYOUTS).map(function (layout) {
    return '<a class="btn sm' + (project.layout === layout ? ' primary' : '') + '" href="' + base + '?layout=' + layout + '">' +
      ic(PROJECT_LAYOUTS[layout].icon, 12) + ' ' + esc(PROJECT_LAYOUTS[layout].label) + '</a>';
  }).join('');
}

function boardItem(user, forge, project, col, item) {
  var linked = linkedItem(user, forge, item);
  var next = (project.columns || []).filter(function (c) { return c.id !== col.id; });
  return '<article class="board-item" data-item="' + esc(item.id) + '" data-column="' + esc(col.id) + '">' +
    '<div class="board-item-title">' + esc(item.title) + '</div>' +
    (item.body ? '<div class="board-item-body muted fs-12">' + esc(item.body) + '</div>' : '') +
    '<div class="board-item-meta">' +
      '<span class="label">' + esc(item.kind) + '</span>' +
      (linked ? '<a class="muted fs-12" href="' + linked.href + '">' + linked.label + '</a>' : '') +
      '<span class="muted fs-12">' + timeAgo(item.created) + '</span>' +
    '</div>' +
    (isOwnerFor(user, forge) && next.length ? '<div class="board-item-actions">' +
      '<select class="input xs moveItemSelect" data-item="' + esc(item.id) + '" data-project="' + esc(project.id) + '" aria-label="Move item">' +
        next.map(function (c) { return '<option value="' + esc(c.id) + '">Move to ' + esc(c.name) + '</option>'; }).join('') +
      '</select>' +
      '<button class="btn xs danger deleteItemBtn" data-item="' + esc(item.id) + '" data-project="' + esc(project.id) + '">' + ic('trash', 11) + '</button>' +
    '</div>' : '') +
  '</article>';
}

function isOwnerFor(user, forge) { return canEditForge(user, forge); }

function projectTable(user, forge, project, isOwner) {
  var rows = [];
  (project.columns || []).forEach(function (col) {
    itemsInColumn(project, col.id).forEach(function (item) { rows.push({ col: col, item: item }); });
  });
  if (!rows.length) return '<div class="empty"><h3>No items</h3><p>Switch to the board layout to add the first item.</p></div>';
  return '<div class="card-tight table-wrap"><table class="table">' +
    '<thead><tr><th>Title</th><th>Status</th><th>Kind</th><th>Assignees</th><th>Updated</th>' + (isOwner ? '<th></th>' : '') + '</tr></thead>' +
    '<tbody>' + rows.map(function (r) {
      var linked = linkedItem(user, forge, r.item);
      return '<tr><td>' + esc(r.item.title) + (linked ? ' <a class="muted fs-12" href="' + linked.href + '">' + linked.label + '</a>' : '') + '</td>' +
        '<td><span class="label">' + esc(r.col.name) + '</span></td>' +
        '<td>' + esc(r.item.kind) + '</td>' +
        '<td>' + ((r.item.assignees || []).map(esc).join(', ') || '<span class="muted fs-12">—</span>') + '</td>' +
        '<td class="muted fs-12">' + timeAgo(r.item.created) + '</td>' +
        (isOwner ? '<td><button class="btn xs danger deleteItemBtn" data-item="' + esc(r.item.id) + '" data-project="' + esc(project.id) + '">' + ic('trash', 11) + '</button></td>' : '') + '</tr>';
    }).join('') + '</tbody></table></div>';
}

function projectRoadmap(user, forge, project) {
  var items = [];
  (project.columns || []).forEach(function (col) {
    itemsInColumn(project, col.id).forEach(function (i) { items.push({ col: col, item: i }); });
  });
  var dated = items.filter(function (r) { return r.item.due; }).sort(function (a, b) { return a.item.due - b.item.due; });
  if (!dated.length) return '<div class="empty"><h3>Nothing scheduled</h3><p>Give an item a due date to see it on the roadmap.</p></div>';
  var first = dated[0].item.due;
  var last = dated[dated.length - 1].item.due;
  var span = Math.max(1, last - first);
  return '<div class="card"><h3 class="card-title">Roadmap</h3><div class="roadmap">' + dated.map(function (r) {
    var overdue = r.item.due < Date.now();
    var width = Math.max(6, Math.round((r.item.due - first) / span * 100));
    return '<div class="roadmap-row"><span class="roadmap-date' + (overdue ? ' overdue' : '') + '">' + formatDate(r.item.due) + '</span>' +
      '<span class="roadmap-track"><span class="roadmap-bar" style="width:' + width + '%"></span></span>' +
      '<span class="roadmap-title">' + esc(r.item.title) + '</span>' +
      '<span class="label">' + esc(r.col.name) + '</span></div>';
  }).join('') + '</div></div>';
}

function linkedItem(user, forge, item) {
  if (!item.ref) return null;
  var hash = String(item.ref).lastIndexOf('#');
  if (hash < 0) return null;
  var ownerPart = item.ref.slice(0, hash);
  var number = item.ref.slice(hash + 1);
  var route = item.kind === 'pull' ? 'pull' : 'issues';
  return { href: '#/' + ownerPart + '/' + route + '/' + number, label: ownerPart + '#' + number };
}

/* =============================================================== WIKI === */

export function viewForgeWiki(user, forge, rest) {
  var pages = wikiPages(forge);
  var slug = rest && rest[0] ? decodeURIComponent(rest[0]) : 'Home';
  var editing = rest && rest[1] === '_edit';

  if (!pages.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('book', 32) + '</div>' +
      '<h3>Welcome to the ' + esc(forge.name) + ' wiki</h3>' +
      '<p>Wikis hold long-form documentation with full revision history.</p>' +
      (canEditForge(user, forge) ? '<button class="btn primary newWikiPageBtn">Create the first page</button>' : '') +
      '</div>';
  }

  var page = wikiPageBySlug(forge, slug);
  if (editing && page) return wikiEditor(user, forge, page);
  if (!page) return notFound('Page', 'No wiki page named “' + slug + '”.');

  var history = page.history || [];
  return '<div class="wiki-layout">' +
    '<aside class="wiki-side">' +
      '<div class="wiki-side-head">' + esc(pages.length) + ' page' + (pages.length === 1 ? '' : 's') + '</div>' +
      pages.map(function (p) {
        return '<a class="wiki-side-item' + (p.slug === page.slug ? ' active' : '') + '" href="#/' + user.username + '/' + forge.name + '/wiki/' + encodeURIComponent(p.slug) + '">' + esc(p.title) + '</a>';
      }).join('') +
      (canEditForge(user, forge) ? '<button class="btn sm primary newWikiPageBtn" style="margin-top:12px;width:100%">' + ic('plus', 14) + ' New page</button>' : '') +
    '</aside>' +
    '<div class="wiki-main">' +
      '<div class="wiki-head">' +
        '<div><h2 class="wiki-title">' + esc(page.title) + '</h2>' +
          '<div class="muted fs-12">' + esc(page.author) + ' edited ' + timeAgo(page.updated) + ' · ' + history.length + ' revision' + (history.length === 1 ? '' : 's') + '</div></div>' +
        (canEditForge(user, forge) ? '<div class="wiki-head-actions">' +
          '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/wiki/' + encodeURIComponent(page.slug) + '/_edit">' + ic('pencil', 14) + ' Edit</a>' +
          '<button class="btn sm danger deleteWikiPageBtn" data-id="' + esc(page.id) + '">' + ic('trash', 14) + '</button>' +
        '</div>' : '') +
      '</div>' +
      '<article class="readme-body wiki-body">' + md(page.body || '_Empty page._') + '</article>' +
      (history.length ? '<details class="wiki-history"><summary>Page history (' + history.length + ')</summary>' +
        history.map(function (rev) {
          return '<div class="list-item"><div class="list-icon">' + ic('history', 14) + '</div>' +
            '<div class="list-body"><div class="list-title">' + esc(rev.message) + '</div>' +
            '<div class="list-meta">' + esc(rev.author) + ' · ' + formatDate(rev.at) + '</div></div>' +
            '<div class="list-side"><button class="btn sm restoreWikiBtn" data-page="' + esc(page.id) + '" data-rev="' + esc(rev.id) + '">Restore</button></div></div>';
        }).join('') + '</details>' : '') +
    '</div>' +
  '</div>';
}

function wikiEditor(user, forge, page) {
  return '<div class="card">' +
    '<h3 class="card-title">Editing “' + esc(page.title) + '”</h3>' +
    '<div class="form-group"><label class="form-label" for="wikiTitle">Title</label>' +
      '<input type="text" class="input" id="wikiTitle" value="' + esc(page.title) + '"></div>' +
    '<div class="form-group"><label class="form-label" for="wikiMessage">Edit message</label>' +
      '<input type="text" class="input" id="wikiMessage" placeholder="Describe this change"></div>' +
    '<div class="form-group"><label class="form-label" for="wikiBody">Content (markdown)</label>' +
      '<textarea class="input mono" id="wikiBody" rows="18">' + esc(page.body || '') + '</textarea></div>' +
    '<div style="display:flex;gap:8px">' +
      '<button class="btn primary saveWikiPageBtn" data-id="' + esc(page.id) + '">' + ic('check', 14) + ' Save page</button>' +
      '<a class="btn" href="#/' + user.username + '/' + forge.name + '/wiki/' + encodeURIComponent(page.slug) + '">Cancel</a>' +
    '</div>' +
  '</div>';
}

/* ============================================================ SECURITY === */

export function viewForgeSecurity(user, forge, rest) {
  var tab = rest && rest[0] ? rest[0] : 'overview';
  var summary = securitySummary(forge);
  var tabs = [
    ['overview', 'Overview'],
    ['secrets', 'Secrets (' + summary.secrets + ')'],
    ['code', 'Code scanning (' + summary.code + ')'],
    ['dependencies', 'Dependencies (' + summary.dependencies + ')'],
    ['advisories', 'Advisories (' + summary.advisories + ')'],
    ['policy', 'Policy'],
  ];
  var content = '';
  if (tab === 'secrets') content = findingList(forge, 'secret', secretFindings(forge), 'No secrets detected in any file.');
  else if (tab === 'code') content = findingList(forge, 'code', codeFindings(forge), 'No risky patterns found in the source files.');
  else if (tab === 'dependencies') content = dependencyList(forge, dependencyFindings(forge));
  else if (tab === 'advisories') content = advisoryList(user, forge);
  else if (tab === 'policy') content = policyPanel(user, forge);
  else content = securityOverview(user, forge, summary);

  return '<div class="insight-tabs">' + tabs.map(function (t) {
    return '<a class="insight-tab' + (tab === t[0] ? ' active' : '') + '" href="#/' + user.username + '/' + forge.name + '/security/' + t[0] + '">' + esc(t[1]) + '</a>';
  }).join('') + '</div>' + content;
}

function securityOverview(user, forge, summary) {
  return '<div class="security-grid">' +
    secCard('key', 'Secret scanning', summary.secrets, 'open credential-shaped strings', 'secrets') +
    secCard('scan', 'Code scanning', summary.code, 'risky code patterns', 'code') +
    secCard('package', 'Dependency review', summary.dependencies, 'dependency alerts', 'dependencies') +
    secCard('megaphone', 'Advisories', summary.advisories, 'published advisories', 'advisories') +
  '</div>' +
  '<div class="card mt-4"><h3 class="card-title">Scanning settings</h3>' +
    Object.keys(securitySettings(forge)).filter(function (k) { return typeof securitySettings(forge)[k] === 'boolean'; }).map(function (key) {
      var on = securitySettings(forge)[key];
      return '<div class="pref-row"><div><b class="fs-13">' + esc(key.replace(/([A-Z])/g, ' $1')) + '</b>' +
        '<div class="muted fs-12">Applies to every file in ' + esc(forge.name) + '</div></div>' +
        '<label class="switch"><input type="checkbox" class="securityToggle" data-key="' + esc(key) + '"' + (on ? ' checked' : '') + '><span class="switch-slider"></span></label></div>';
    }).join('') +
  '</div>' +
  (summary.critical
    ? '<div class="callout red mt-4">' + ic('alert', 14) + ' ' + summary.critical + ' high-severity finding(s) need attention.</div>'
    : '<div class="callout green mt-4">' + ic('checkCircle', 14) + ' No high-severity findings.</div>');
}

function secCard(icon, title, count, label, href) {
  var colour = count ? 'var(--red)' : 'var(--green)';
  return '<div class="sec-card">' +
    '<div class="sec-card-head">' + ic(icon, 18) + '<b>' + esc(title) + '</b></div>' +
    '<div class="sec-card-count" style="color:' + colour + '">' + count + '</div>' +
    '<div class="muted fs-12">' + esc(label) + '</div>' +
  '</div>';
}

function findingList(forge, kind, findings, emptyText) {
  if (!findings.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('shield', 32) + '</div><h3>' + esc(emptyText) + '</h3>' +
      '<p>Findings are recomputed from the files in the forge on every visit.</p></div>';
  }
  return '<div class="card-tight">' + findings.map(function (f) {
    return '<div class="list-item' + (f.state !== 'open' ? ' dimmed' : '') + '">' +
      '<div class="list-icon" style="color:' + (f.severity === 'critical' || f.severity === 'error' ? 'var(--red)' : f.severity === 'high' || f.severity === 'warning' ? 'var(--orange)' : 'var(--text-muted)') + '">' + ic('alert', 16) + '</div>' +
      '<div class="list-body">' +
        '<div class="list-title">' + esc(f.rule) + ' <span class="label ' + (f.state === 'open' ? 'red' : '') + '">' + esc(f.severity) + '</span></div>' +
        '<div class="list-meta"><span class="mono">' + esc(f.path) + ':' + f.line + '</span> · ' + (f.state === 'open' ? 'detected ' + timeAgo(f.detected) : esc(f.state)) + '</div>' +
      '</div>' +
      '<div class="list-side">' + (f.state === 'open'
        ? '<button class="btn sm dismissAlertBtn" data-kind="' + kind + '" data-id="' + esc(f.id) + '">Dismiss</button>'
        : '<button class="btn sm reopenAlertBtn" data-kind="' + kind + '" data-id="' + esc(f.id) + '">Reopen</button>') + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function dependencyList(forge, findings) {
  if (!findings.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('package', 32) + '</div><h3>No dependency alerts</h3>' +
      '<p>Add a <span class="mono">package.json</span> or <span class="mono">requirements.txt</span> and RedGet will review the declared ranges.</p></div>';
  }
  return '<div class="card-tight">' + findings.map(function (f) {
    return '<div class="list-item' + (f.state !== 'open' ? ' dimmed' : '') + '">' +
      '<div class="list-icon">' + ic('package', 16) + '</div>' +
      '<div class="list-body">' +
        '<div class="list-title">' + esc(f.package) + ' <span class="label ' + (f.severity === 'high' ? 'red' : '') + '">' + esc(f.severity) + '</span></div>' +
        '<div class="list-meta">' + esc(f.message) + (f.range ? ' · <span class="mono">' + esc(f.range) + '</span>' : '') + ' · ' + esc(f.manifest) + '</div>' +
      '</div>' +
      '<div class="list-side">' + (f.state === 'open'
        ? '<button class="btn sm dismissAlertBtn" data-kind="dep" data-id="' + esc(f.id) + '">Dismiss</button>'
        : '<button class="btn sm reopenAlertBtn" data-kind="dep" data-id="' + esc(f.id) + '">Reopen</button>') + '</div>' +
    '</div>';
  }).join('') + '</div>';
}

function advisoryList(user, forge) {
  var advisories = advisoriesFor(forge);
  return '<div class="actions-head"><div class="actions-head-left"><span class="actions-head-title">Security advisories</span></div>' +
    '<div class="actions-head-right">' + (canEditForge(user, forge) ? '<button class="btn sm primary newAdvisoryBtn">' + ic('plus', 14) + ' New advisory</button>' : '') + '</div></div>' +
    (advisories.length ? '<div class="card-tight">' + advisories.map(function (a) {
      return '<div class="list-item"><div class="list-icon">' + ic('megaphone', 16) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(a.title) +
          ' <span class="label ' + (a.severity === 'critical' || a.severity === 'high' ? 'red' : '') + '">' + esc(a.severity) + '</span>' +
          ' <span class="label">' + esc(a.state) + '</span></div>' +
          '<div class="list-meta mono">' + esc(a.ghsaId) + (a.cve ? ' · ' + esc(a.cve) : '') + ' · by ' + esc(a.author) + ' · ' +
          (a.published ? 'published ' + timeAgo(a.published) : 'draft') + '</div></div>' +
        (canEditForge(user, forge) ? '<div class="list-side">' +
          (a.state === 'draft' ? '<button class="btn sm publishAdvisoryBtn" data-id="' + esc(a.id) + '">Publish</button>' : '') +
          (a.state === 'open' ? '<button class="btn sm closeAdvisoryBtn" data-id="' + esc(a.id) + '">Close</button>' : '') +
          '<button class="btn sm danger deleteAdvisoryBtn" data-id="' + esc(a.id) + '">' + ic('trash', 12) + '</button>' +
        '</div>' : '') + '</div>';
    }).join('') + '</div>'
    : '<div class="empty"><h3>No advisories</h3><p>Advisories you publish about this forge appear here.</p></div>');
}

function policyPanel(user, forge) {
  var settings = securitySettings(forge);
  return '<div class="card">' +
    '<h3 class="card-title">Security policy</h3>' +
    '<p class="muted fs-13 mb-4">Stored as <span class="mono">SECURITY.md</span> at the root of the forge.</p>' +
    '<div class="form-group"><textarea class="input mono" id="securityPolicy" rows="10" placeholder="# Forgerting a vulnerability&#10;&#10;Please open a private forgert…">' + esc(settings.securityPolicy || '') + '</textarea></div>' +
    '<button class="btn primary savePolicyBtn">' + ic('check', 14) + ' Save policy</button>' +
  '</div>';
}

/* ============================================================ INSIGHTS === */

export function viewForgeInsights(user, forge, rest) {
  var active = rest && rest[0] ? rest[0] : 'pulse';
  var tabs = [
    ['pulse', 'Pulse'], ['contributors', 'Contributors'], ['community', 'Community'],
    ['commits', 'Commits'], ['code-frequency', 'Code frequency'], ['dependency-graph', 'Dependency graph'],
    ['network', 'Network'], ['forks', 'Forks'],
  ];
  var content = '';
  if (active === 'contributors') content = contributorsPanel(user, forge);
  else if (active === 'pulse') content = pulsePanel(user, forge);
  else if (active === 'commits') content = commitsPanel(user, forge);
  else if (active === 'code-frequency') content = frequencyPanel(user, forge);
  else if (active === 'dependency-graph') content = dependencyGraphPanel(user, forge);
  else if (active === 'community') content = communityPanel(user, forge);
  else if (active === 'network') content = networkPanel(user, forge);
  else if (active === 'forks') content = viewForgeForks(user, forge);

  return '<div class="insight-tabs">' + tabs.map(function (t) {
    return '<a class="insight-tab' + (active === t[0] ? ' active' : '') + '" href="#/' + user.username + '/' + forge.name + '/insights/' + t[0] + '">' + esc(t[1]) + '</a>';
  }).join('') + '</div>' + content;
}

function contributorsOf(forge) {
  var counts = {};
  (forge.commits || []).forEach(function (c) {
    var author = c.author || 'unknown';
    counts[author] = (counts[author] || 0) + 1;
  });
  (forge.issues || []).forEach(function (i) { if (i.author) counts[i.author] = (counts[i.author] || 0) + 1; });
  (forge.pulls || []).forEach(function (p) { if (p.author) counts[p.author] = (counts[p.author] || 0) + 1; });
  return Object.keys(counts).map(function (name) {
    return { username: name, contributions: counts[name], account: getUserByUsername(name) };
  }).sort(function (a, b) { return b.contributions - a.contributions; });
}

function contributorsPanel(user, forge) {
  var people = contributorsOf(forge);
  if (!people.length) return '<div class="empty"><h3>No contributors yet</h3><p>Commits, issues and pull requests add people here.</p></div>';
  return '<div class="contributors-grid">' + people.map(function (p) {
    var account = p.account || { username: p.username, avatar: null };
    return '<a class="contrib-card" href="#/' + esc(p.username) + '">' + avatarHTML(account, 40) +
      '<div><div class="fw-600 bright">' + esc(p.username) + '</div>' +
      '<div class="muted fs-12">' + p.contributions + ' contribution' + (p.contributions === 1 ? '' : 's') + '</div></div></a>';
  }).join('') + '</div>';
}

function pulsePanel(user, forge) {
  var week = Date.now() - 7 * 86400000;
  var commits = (forge.commits || []).filter(function (c) { return c.time >= week; });
  var issues = (forge.issues || []).filter(function (i) { return i.created >= week; });
  var pulls = (forge.pulls || []).filter(function (p) { return p.created >= week; });
  var merged = (forge.pulls || []).filter(function (p) { return p.mergedAt >= week; });
  var people = contributorsOf(forge);
  return '<div class="card">' +
    '<h3 class="card-title">Pulse · last 7 days</h3>' +
    '<div class="stat-grid">' +
      stat('Active pull requests', pulls.length + ' opened · ' + merged.length + ' merged') +
      stat('Active issues', issues.length + ' opened') +
      stat('Commits', String(commits.length)) +
      stat('Contributors', String(people.length)) +
    '</div>' +
    '<p class="muted fs-13 mt-4">Excluding merges, ' + people.length + ' author' + (people.length === 1 ? ' has' : 's have') +
      ' pushed ' + commits.length + ' commit' + (commits.length === 1 ? '' : 's') + ' to ' + esc(forge.defaultBranch) + ' in the last week.</p>' +
    (commits.length ? '<div class="card-tight mt-4">' + commits.slice(0, 8).map(function (c) {
      return '<div class="list-item"><div class="list-icon">' + ic('redCommit', 14) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(c.msg) + '</div>' +
        '<div class="list-meta mono">' + c.sha.slice(0, 7) + ' · ' + esc(c.author) + ' · ' + timeAgo(c.time) + '</div></div></div>';
    }).join('') + '</div>' : '') +
  '</div>';
}

function stat(label, value) {
  return '<div class="stat"><div class="stat-value">' + esc(value) + '</div><div class="stat-label">' + esc(label) + '</div></div>';
}

function commitsPanel(user, forge) {
  var commits = forge.commits || [];
  var byDay = {};
  commits.forEach(function (c) {
    var day = new Date(c.time);
    var key = day.getFullYear() + '-' + (day.getMonth() + 1) + '-' + day.getDate();
    byDay[key] = (byDay[key] || 0) + 1;
  });
  var keys = Object.keys(byDay);
  var max = keys.reduce(function (m, k) { return Math.max(m, byDay[k]); }, 1);
  return '<div class="card"><h3 class="card-title">Commits over time</h3>' +
    '<div class="bar-chart">' + keys.slice(-30).map(function (k) {
      return '<div class="bar" title="' + esc(k) + ': ' + byDay[k] + '"><span style="height:' + Math.max(8, Math.round(byDay[k] / max * 100)) + '%"></span></div>';
    }).join('') + '</div>' +
    '<p class="muted fs-13 mt-4">' + commits.length + ' total commit' + (commits.length === 1 ? '' : 's') + ' across ' + keys.length + ' active day' + (keys.length === 1 ? '' : 's') + '.</p>' +
  '</div>';
}

function frequencyPanel(user, forge) {
  var stats = languageBreakdown(forge).map(function (s) {
    return { language: s.language, bytes: s.bytes, percent: Math.round(s.percent), color: langColor(s.language) };
  });
  var total = stats.reduce(function (n, s) { return n + s.bytes; }, 0) || 1;
  return '<div class="card"><h3 class="card-title">Code frequency</h3>' +
    '<div class="lang-bars">' + stats.map(function (s) {
      return '<div class="lang-row"><span class="lang-name">' + esc(s.language) + '</span>' +
        '<span class="lang-track"><span style="width:' + Math.round(s.bytes / total * 100) + '%;background:' + esc(s.color) + '"></span></span>' +
        '<span class="lang-pct mono">' + s.percent + '% · ' + formatBytes(s.bytes) + '</span></div>';
    }).join('') + '</div>' +
  '</div>';
}

function dependencyGraphPanel(user, forge) {
  var manifest = (forge.files || []).filter(function (f) { return f.name === 'package.json'; })[0];
  if (!manifest) return '<div class="empty"><h3>No dependency graph</h3><p>Add a <span class="mono">package.json</span> to build one.</p></div>';
  var parsed = null;
  try { parsed = JSON.parse(manifest.content); } catch (e) { parsed = null; }
  if (!parsed) return '<div class="empty"><h3>package.json is not valid JSON</h3><p>Fix the manifest to see the dependency graph.</p></div>';
  var deps = Object.keys(parsed.dependencies || {}).concat(Object.keys(parsed.devDependencies || {}));
  return '<div class="card"><h3 class="card-title">Dependency graph · ' + deps.length + ' packages</h3>' +
    '<div class="dep-graph">' +
      '<div class="dep-node root">' + esc(parsed.name || forge.name) + '</div>' +
      '<div class="dep-children">' + (deps.length ? deps.map(function (d) {
        return '<div class="dep-node">' + esc(d) + '<span class="muted fs-11">' + esc((parsed.dependencies || {})[d] || (parsed.devDependencies || {})[d]) + '</span></div>';
      }).join('') : '<div class="muted fs-13">No dependencies declared.</div>') + '</div>' +
    '</div></div>';
}

function communityPanel(user, forge) {
  var checks = [
    ['Description', Boolean(forge.desc)],
    ['README', (forge.files || []).some(function (f) { return /^README/i.test(f.name); })],
    ['Code of conduct', (forge.files || []).some(function (f) { return /CODE_OF_CONDUCT/i.test(f.name); })],
    ['Contributing guide', (forge.files || []).some(function (f) { return /CONTRIBUTING/i.test(f.name); })],
    ['License', Boolean(forge.license)],
    ['Issue templates', (forge.files || []).some(function (f) { return /ISSUE_TEMPLATE/i.test(f.name); })],
    ['Security policy', (forge.files || []).some(function (f) { return /^SECURITY\.md$/i.test(f.name); })],
    ['Discussions enabled', Boolean(forge.discussions && forge.discussions.length)],
  ];
  var done = checks.filter(function (c) { return c[1]; }).length;
  return '<div class="card"><h3 class="card-title">Community standards · ' + done + '/' + checks.length + '</h3>' +
    '<div class="progress" style="margin-bottom:16px"><span style="width:' + Math.round(done / checks.length * 100) + '%"></span></div>' +
    checks.map(function (c) {
      return '<div class="pref-row"><div><b class="fs-13">' + esc(c[0]) + '</b></div>' +
        '<span class="label ' + (c[1] ? 'green' : '') + '">' + (c[1] ? 'Included' : 'Missing') + '</span></div>';
    }).join('') +
  '</div>';
}

function networkPanel(user, forge) {
  var forks = forksOf(forge.id);
  return '<div class="card"><h3 class="card-title">Network</h3>' +
    '<p class="muted fs-13 mb-4">' + esc(user.username) + '/' + esc(forge.name) + ' and its ' + forks.length + ' fork' + (forks.length === 1 ? '' : 's') + '.</p>' +
    '<div class="network">' +
      '<div class="network-node root">' + avatarHTML(user, 20) + ' ' + esc(user.username) + '/' + esc(forge.name) + '</div>' +
      forks.map(function (f) {
        return '<div class="network-node">' + avatarHTML(f.user, 20) + ' ' + esc(f.user.username) + '/' + esc(f.forge.name) + '</div>';
      }).join('') +
    '</div></div>';
}

/* ============================================================= SETTINGS === */

export function viewForgeSettings(user, forge, rest) {
  var section = rest && rest[0] ? rest[0] : 'general';
  var sections = [
    ['general', 'General', 'gear'],
    ['access', 'Access', 'lock'],
    ['branches', 'Branches and tags', 'redBranch'],
    ['actions', 'Actions', 'play'],
    ['webhooks', 'Webhooks', 'plug'],
    ['deploy-keys', 'Deploy keys', 'key'],
    ['secrets', 'Secrets and variables', 'shield'],
    ['environments', 'Environments', 'globe'],
    ['pages', 'Pages', 'book'],
  ];
  var panel = '';
  if (section === 'access') panel = accessPanel(user, forge);
  else if (section === 'branches') panel = branchPanel(user, forge);
  else if (section === 'actions') panel = actionsSettingsPanel(user, forge);
  else if (section === 'webhooks') panel = webhookPanel(user, forge);
  else if (section === 'deploy-keys') panel = deployKeyPanel(user, forge);
  else if (section === 'secrets') panel = secretsPanel(user, forge);
  else if (section === 'environments') panel = environmentsPanel(user, forge);
  else if (section === 'pages') panel = pagesPanel(user, forge);
  else panel = generalPanel(user, forge);

  return '<div class="settings-grid">' +
    '<nav class="settings-nav">' + sections.map(function (s) {
      return '<a class="settings-nav-link' + (section === s[0] ? ' active' : '') + '" href="#/' + user.username + '/' + forge.name + '/settings/' + s[0] + '">' +
        ic(s[2], 14) + ' ' + esc(s[1]) + '</a>';
    }).join('') +
      '<div class="nav-sep"></div>' +
      '<a class="settings-nav-link danger-link" href="#/' + user.username + '/' + forge.name + '/settings/danger">' + ic('alert', 14) + ' Danger Zone</a>' +
    '</nav>' +
    '<div>' + panel + '</div>' +
  '</div>';
}

function generalPanel(user, forge) {
  return '<div class="settings-block">' +
    '<h3>Forge name</h3><p class="muted fs-13">Renaming updates every link and forks keep working.</p>' +
    '<div class="form-row"><input type="text" class="input" id="forgeNameInput" value="' + esc(forge.name) + '">' +
      '<button class="btn renameForgeBtn">Rename</button></div>' +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Description</h3><p class="muted fs-13">Shown on the forge card and in search.</p>' +
    '<div class="form-group"><input type="text" class="input" id="forgeDescInput" value="' + esc(forge.desc || '') + '"></div>' +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Website</h3><p class="muted fs-13">A local path or any URL you own.</p>' +
    '<div class="form-group"><input type="text" class="input" id="forgeSiteInput" value="' + esc(forge.website || '') + '"></div>' +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Topics</h3><p class="muted fs-13">Comma separated. Topics drive Explore filtering.</p>' +
    '<div class="form-group"><input type="text" class="input" id="forgeTopicsInput" value="' + esc((forge.topics || []).join(', ')) + '"></div>' +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Visibility</h3><p class="muted fs-13">Currently ' + esc(forge.visibility) + '.</p>' +
    '<div class="form-row"><select class="input" id="forgeVisibilityInput">' +
      '<option value="public"' + (forge.visibility === 'public' ? ' selected' : '') + '>Public</option>' +
      '<option value="private"' + (forge.visibility === 'private' ? ' selected' : '') + '>Private</option>' +
    '</select></div>' +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Features</h3>' +
    [['Issues', 'issues'], ['Pull requests', 'pulls'], ['Actions', 'actions'], ['Projects', 'projects'],
     ['Wiki', 'wiki'], ['Security', 'security'], ['Discussions', 'discussions'], ['Packages', 'packages']].map(function (f) {
      return '<div class="pref-row"><div><b class="fs-13">' + esc(f[0]) + '</b></div>' +
        '<label class="switch"><input type="checkbox" class="featureToggle" data-key="' + f[1] + '"' + (forge[f[1] === 'pulls' ? 'pullsEnabled' : f[1] + 'Enabled'] !== false ? ' checked' : '') + '><span class="switch-slider"></span></label></div>';
    }).join('') +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Pull requests</h3>' +
    '<div class="pref-row"><div><b class="fs-13">Allow merge commits</b></div>' +
      '<label class="switch"><input type="checkbox" class="prToggle" data-key="mergeCommit"' + (forge.allowMerge !== false ? ' checked' : '') + '><span class="switch-slider"></span></label></div>' +
    '<div class="pref-row"><div><b class="fs-13">Allow squash merging</b></div>' +
      '<label class="switch"><input type="checkbox" class="prToggle" data-key="squash"' + (forge.allowSquash !== false ? ' checked' : '') + '><span class="switch-slider"></span></label></div>' +
    '<div class="pref-row"><div><b class="fs-13">Allow rebase merging</b></div>' +
      '<label class="switch"><input type="checkbox" class="prToggle" data-key="rebase"' + (forge.allowRebase !== false ? ' checked' : '') + '><span class="switch-slider"></span></label></div>' +
    '<div class="pref-row"><div><b class="fs-13">Delete head branch on merge</b></div>' +
      '<label class="switch"><input type="checkbox" class="prToggle" data-key="deleteBranch"' + (forge.deleteBranchOnMerge !== false ? ' checked' : '') + '><span class="switch-slider"></span></label></div>' +
  '</div>' +
  '<div class="settings-block"><button class="btn primary saveForgeSettingsBtn">' + ic('check', 14) + ' Save changes</button></div>';
}

function accessPanel(user, forge) {
  var people = contributorsOf(forge);
  return '<div class="settings-block">' +
    '<h3>Collaborators</h3>' +
    '<p class="muted fs-13">People who have committed to, opened issues in, or opened pull requests against this forge.</p>' +
    (people.length ? '<div class="card-tight">' + people.map(function (p) {
      var account = p.account || { username: p.username, avatar: null };
      return '<div class="list-item"><div class="list-icon">' + avatarHTML(account, 24) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(p.username) + '</div>' +
        '<div class="list-meta">' + p.contributions + ' contributions · ' + (p.username === user.username ? 'Owner' : 'Collaborator') + '</div></div>' +
        (p.username !== user.username ? '<div class="list-side"><button class="btn sm danger removeCollabBtn" data-user="' + esc(p.username) + '">Remove</button></div>' : '') +
      '</div>';
    }).join('') + '</div>' : '<p class="muted fs-13">Nobody else has contributed yet.</p>') +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Add a collaborator</h3>' +
    '<div class="form-row"><input type="text" class="input" id="collabInput" placeholder="Username">' +
      '<button class="btn primary addCollabBtn">Add</button></div>' +
    '<p class="muted fs-12">Only accounts that exist locally can be added.</p>' +
  '</div>';
}

function branchPanel(user, forge) {
  return '<div class="settings-block">' +
    '<h3>Default branch</h3>' +
    '<div class="form-row"><select class="input" id="defaultBranchSelect">' +
      (forge.branches || []).map(function (b) {
        return '<option value="' + esc(b) + '"' + (b === forge.defaultBranch ? ' selected' : '') + '>' + esc(b) + '</option>';
      }).join('') + '</select>' +
      '<button class="btn setDefaultBranchBtn">Set default</button></div>' +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Branches (' + (forge.branches || []).length + ')</h3>' +
    '<div class="card-tight">' + (forge.branches || []).map(function (b) {
      var commits = commitsFor(forge, b);
      var head = commits[0];
      return '<div class="list-item"><div class="list-icon">' + ic('redBranch', 14) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(b) + (b === forge.defaultBranch ? ' <span class="label blue">Default</span>' : '') + '</div>' +
        '<div class="list-meta">' + commits.length + ' commit' + (commits.length === 1 ? '' : 's') +
        (head ? ' · ' + esc(head.msg) + ' · ' + timeAgo(head.time) : '') + '</div></div>' +
        (b !== forge.defaultBranch ? '<div class="list-side">' +
          '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/new?base=' + encodeURIComponent(b) + '">New PR</a>' +
          '<button class="btn sm danger deleteBranchBtn" data-branch="' + esc(b) + '">' + ic('trash', 12) + '</button></div>' : '') +
      '</div>';
    }).join('') + '</div>' +
    '<div class="form-row mt-4"><input type="text" class="input" id="newBranchInput" placeholder="new-branch">' +
      '<button class="btn primary addBranchBtn">Create branch</button></div>' +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Tags (' + (forge.tags || []).length + ')</h3>' +
    (forge.tags && forge.tags.length ? '<div class="card-tight">' + forge.tags.map(function (t) {
      return '<div class="list-item"><div class="list-icon">' + ic('tag', 14) + '</div>' +
        '<div class="list-body"><div class="list-title mono">' + esc(t) + '</div></div>' +
        '<div class="list-side"><button class="btn sm danger deleteTagBtn" data-tag="' + esc(t) + '">' + ic('trash', 12) + '</button></div></div>';
    }).join('') + '</div>' : '<p class="muted fs-13">Tags are created when you publish a release.</p>') +
  '</div>';
}

function actionsSettingsPanel(user, forge) {
  var workflows = workflowsFor(forge);
  return '<div class="settings-block">' +
    '<h3>Workflows (' + workflows.length + ')</h3>' +
    (workflows.length ? '<div class="card-tight">' + workflows.map(function (w) {
      return '<div class="list-item"><div class="list-icon">' + ic('play', 14) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(w.name) + ' <span class="label ' + (w.state === 'disabled' ? 'red' : 'green') + '">' + esc(w.state) + '</span></div>' +
        '<div class="list-meta mono">' + esc(w.path) + ' · on ' + w.on.map(esc).join(', ') + '</div></div>' +
        '<div class="list-side"><button class="btn sm toggleWorkflowBtn" data-id="' + esc(w.id) + '" data-state="' + (w.state === 'disabled' ? 'active' : 'disabled') + '">' +
        (w.state === 'disabled' ? 'Enable' : 'Disable') + '</button></div></div>';
    }).join('') + '</div>'
    : '<p class="muted fs-13">Add a <span class="mono">.redget/workflows/*.yml</span> file to enable Actions.</p>') +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Workflow permissions</h3>' +
    '<div class="pref-row"><div><b class="fs-13">Read forge contents</b><div class="muted fs-12">Workflows can read files</div></div><span class="label green">Enabled</span></div>' +
    '<div class="pref-row"><div><b class="fs-13">Write issues and pull requests</b><div class="muted fs-12">Lets a workflow comment and close</div></div>' +
      '<label class="switch"><input type="checkbox" class="actionsPerm" data-key="writeIssues"' + (forge.actionsWriteIssues !== false ? ' checked' : '') + '><span class="switch-slider"></span></label></div>' +
  '</div>' +
  '<div class="settings-block"><button class="btn primary saveActionsSettingsBtn">' + ic('check', 14) + ' Save</button></div>';
}

function webhookPanel(user, forge) {
  if (!forge.webhooks) forge.webhooks = [];
  return '<div class="settings-block">' +
    '<h3>Webhooks (' + forge.webhooks.length + ')</h3>' +
    '<p class="muted fs-13">A webhook records the events that fire in this forge. Deliveries are local — nothing is sent over the network.</p>' +
    (forge.webhooks.length ? '<div class="card-tight">' + forge.webhooks.map(function (w) {
      return '<div class="list-item"><div class="list-icon">' + ic('server', 14) + '</div>' +
        '<div class="list-body"><div class="list-title mono">' + esc(w.url) + '</div>' +
        '<div class="list-meta">' + w.events.map(esc).join(', ') + ' · ' + (w.active ? 'active' : 'inactive') + ' · ' + (w.deliveries || []).length + ' deliveries</div></div>' +
        '<div class="list-side"><button class="btn sm danger deleteWebhookBtn" data-id="' + esc(w.id) + '">' + ic('trash', 12) + '</button></div></div>';
    }).join('') + '</div>' : '') +
    '<div class="form-group"><label class="form-label" for="webhookUrl">Payload URL</label>' +
      '<input type="text" class="input" id="webhookUrl" placeholder="/hooks/redget"></div>' +
    '<div class="form-group"><label class="form-label" for="webhookEvents">Events (comma separated)</label>' +
      '<input type="text" class="input" id="webhookEvents" value="push, pull_request, issues"></div>' +
    '<button class="btn primary addWebhookBtn">Add webhook</button>' +
  '</div>';
}

function deployKeyPanel(user, forge) {
  if (!forge.deployKeys) forge.deployKeys = [];
  return '<div class="settings-block">' +
    '<h3>Deploy keys (' + forge.deployKeys.length + ')</h3>' +
    '<p class="muted fs-13">Read-only SSH keys scoped to this forge.</p>' +
    (forge.deployKeys.length ? '<div class="card-tight">' + forge.deployKeys.map(function (k) {
      return '<div class="list-item"><div class="list-icon">' + ic('key', 14) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(k.title) + '</div>' +
        '<div class="list-meta mono">' + esc(k.fingerprint) + ' · added ' + timeAgo(k.added) + '</div></div>' +
        '<div class="list-side"><button class="btn sm danger deleteDeployKeyBtn" data-id="' + esc(k.id) + '">' + ic('trash', 12) + '</button></div></div>';
    }).join('') + '</div>' : '') +
    '<div class="form-group"><label class="form-label" for="deployKeyTitle">Title</label><input type="text" class="input" id="deployKeyTitle" placeholder="Build server"></div>' +
    '<div class="form-group"><label class="form-label" for="deployKeyValue">Key</label><textarea class="input mono" id="deployKeyValue" rows="3" placeholder="ssh-ed25519 AAAA…"></textarea></div>' +
    '<button class="btn primary addDeployKeyBtn">Add deploy key</button>' +
  '</div>';
}

function secretsPanel(user, forge) {
  var secrets = secretsFor(forge);
  var variables = variablesFor(forge);
  return '<div class="settings-block">' +
    '<h3>Secrets (' + secrets.length + ')</h3>' +
    '<p class="muted fs-13">Values are never displayed again after saving — only the name and the update time are kept.</p>' +
    (secrets.length ? '<div class="card-tight">' + secrets.map(function (s) {
      return '<div class="list-item"><div class="list-icon">' + ic('lock', 14) + '</div>' +
        '<div class="list-body"><div class="list-title mono">' + esc(s.name) + '</div>' +
        '<div class="list-meta">Updated ' + timeAgo(s.updated) + '</div></div>' +
        '<div class="list-side"><button class="btn sm danger deleteSecretBtn" data-name="' + esc(s.name) + '">' + ic('trash', 12) + '</button></div></div>';
    }).join('') + '</div>' : '') +
    '<div class="form-row"><input type="text" class="input" id="secretName" placeholder="DEPLOY_TOKEN">' +
      '<input type="password" class="input" id="secretValue" placeholder="value">' +
      '<button class="btn primary addSecretBtn">Save secret</button></div>' +
  '</div>' +
  '<div class="settings-block">' +
    '<h3>Variables (' + variables.length + ')</h3>' +
    (variables.length ? '<div class="card-tight">' + variables.map(function (v) {
      return '<div class="list-item"><div class="list-icon">' + ic('code', 14) + '</div>' +
        '<div class="list-body"><div class="list-title mono">' + esc(v.name) + '</div>' +
        '<div class="list-meta mono">' + esc(v.value) + ' · updated ' + timeAgo(v.updated) + '</div></div>' +
        '<div class="list-side"><button class="btn sm danger deleteVariableBtn" data-name="' + esc(v.name) + '">' + ic('trash', 12) + '</button></div></div>';
    }).join('') + '</div>' : '') +
    '<div class="form-row"><input type="text" class="input" id="varName" placeholder="NODE_VERSION">' +
      '<input type="text" class="input" id="varValue" placeholder="20">' +
      '<button class="btn primary addVariableBtn">Save variable</button></div>' +
  '</div>';
}

function environmentsPanel(user, forge) {
  var envs = environmentsFor(forge);
  return '<div class="settings-block">' +
    '<h3>Environments (' + envs.length + ')</h3>' +
    '<p class="muted fs-13">Deploy runs record which environment they targeted.</p>' +
    (envs.length ? '<div class="card-tight">' + envs.map(function (e) {
      return '<div class="list-item"><div class="list-icon">' + ic('globe', 14) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(e.name) + '</div>' +
        '<div class="list-meta">' + (e.url ? '<span class="mono">' + esc(e.url) + '</span> · ' : '') + 'created ' + timeAgo(e.created) + '</div></div>' +
        '<div class="list-side"><button class="btn sm danger deleteEnvBtn" data-name="' + esc(e.name) + '">' + ic('trash', 12) + '</button></div></div>';
    }).join('') + '</div>' : '') +
    '<div class="form-row"><input type="text" class="input" id="envName" placeholder="production">' +
      '<input type="text" class="input" id="envUrl" placeholder="/deploys/production">' +
      '<button class="btn primary addEnvBtn">Create environment</button></div>' +
  '</div>';
}

function pagesPanel(user, forge) {
  var html = (forge.files || []).filter(function (f) { return /\.html?$/i.test(f.name); });
  return '<div class="settings-block">' +
    '<h3>Pages</h3>' +
    '<p class="muted fs-13">RedGet Pages serves the HTML files stored in this forge. There is no build step and nothing leaves your browser.</p>' +
    (html.length ? '<div class="card-tight">' + html.map(function (f) {
      return '<div class="list-item"><div class="list-icon">' + ic('book', 14) + '</div>' +
        '<div class="list-body"><div class="list-title mono">' + esc(f.name) + '</div>' +
        '<div class="list-meta">' + formatBytes((f.content || '').length) + '</div></div>' +
        '<div class="list-side"><a class="btn sm" href="#/' + user.username + '/' + forge.name + '/blob/' + esc(f.name) + '">View</a></div></div>';
    }).join('') + '</div>'
    : '<p class="muted fs-13">No HTML files in this forge yet.</p>') +
    '<div class="form-row mt-4"><input type="text" class="input" id="pagesBranch" value="' + esc(forge.pagesBranch || forge.defaultBranch) + '">' +
      '<button class="btn savePagesBtn">Save branch</button></div>' +
  '</div>';
}

export function viewForgeDanger(user, forge) {
  return '<div class="danger-zone">' +
    '<h3>Transfer ownership</h3><p class="muted fs-13">Move this forge to another local account.</p>' +
    '<div class="form-row"><input type="text" class="input" id="transferTo" placeholder="username"><button class="btn transferForgeBtn">Transfer</button></div>' +
  '</div>' +
  '<div class="danger-zone">' +
    '<h3>Archive this forge</h3><p class="muted fs-13">Archived forges are read-only.</p>' +
    '<button class="btn ' + (forge.archived ? '' : 'danger') + ' archiveForgeBtn">' + (forge.archived ? 'Unarchive' : 'Archive') + '</button>' +
  '</div>' +
  '<div class="danger-zone">' +
    '<h3>Delete this forge</h3>' +
    '<p class="muted fs-13">This removes the forge, its issues, pull requests, wiki, projects and run history from this browser. It cannot be recovered.</p>' +
    '<button class="btn danger" id="deleteForgeBtn">' + ic('trash', 14) + ' Delete forge</button>' +
  '</div>';
}

/* ============================================================ RELEASES === */

export function viewForgeReleases(user, forge) {
  var releases = forge.releases || [];
  var latest = releases[0];
  return '<div class="actions-head">' +
    '<div class="actions-head-left"><span class="actions-head-title">Releases</span>' +
      '<span class="actions-head-meta">' + releases.length + ' published · ' + (forge.tags || []).length + ' tags</span></div>' +
    '<div class="actions-head-right">' + (canEditForge(user, forge)
      ? '<button class="btn sm primary newReleaseBtn">' + ic('tag', 14) + ' Draft a new release</button>' : '') + '</div>' +
  '</div>' +
  (releases.length ? releases.map(function (r, index) {
    return '<div class="card mb-4 release-card">' +
      '<div class="release-head">' +
        '<div><h3 class="release-title">' + esc(r.title || r.tag) + '</h3>' +
          '<div class="muted fs-12">' + esc(r.author) + ' released this ' + timeAgo(r.published) + ' · ' + formatDate(r.published) + '</div></div>' +
        '<div class="release-tags">' +
          (index === 0 ? '<span class="label green">Latest</span>' : '') +
          '<span class="label mono">' + esc(r.tag) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="readme-body">' + md(r.body || '_No release notes._') + '</div>' +
      ((r.assets || []).length ? '<div class="release-assets">' +
        '<div class="muted fs-12 mb-2">Assets</div>' +
        r.assets.map(function (a) {
          return '<div class="asset-row"><span class="mono">' + esc(a.name) + '</span>' +
            '<span class="muted fs-12">' + formatBytes(a.size) + '</span>' +
            '<button class="btn xs downloadAssetBtn" data-asset="' + esc(a.id || a.name) + '">' + ic('download', 12) + ' Download</button></div>';
        }).join('') + '</div>' : '') +
      (canEditForge(user, forge) ? '<div class="release-actions">' +
        '<button class="btn sm editReleaseBtn" data-tag="' + esc(r.tag) + '">' + ic('pencil', 12) + ' Edit</button>' +
        '<button class="btn sm danger deleteReleaseBtn" data-tag="' + esc(r.tag) + '">' + ic('trash', 12) + ' Delete</button>' +
      '</div>' : '') +
    '</div>';
  }).join('')
  : '<div class="empty"><div class="empty-icon">' + ic('tag', 32) + '</div>' +
    '<h3>No releases published</h3><p>A release packages a tag with notes and optional assets.</p>' +
    (canEditForge(user, forge) ? '<button class="btn primary newReleaseBtn">Create a new release</button>' : '') + '</div>');
}

export function openReleaseModal(user, forge, tag) {
  var existing = tag ? (forge.releases || []).filter(function (r) { return r.tag === tag; })[0] : null;
  var branches = forge.branches || [forge.defaultBranch];
  openModal({
    title: existing ? 'Edit release ' + existing.tag : 'Draft a new release',
    icon: 'tag',
    body: '<div class="form-group"><label class="form-label" for="releaseTag">Tag</label>' +
      '<input type="text" class="input" id="releaseTag" value="' + esc(existing ? existing.tag : '') + '" placeholder="v1.0.0"></div>' +
      '<div class="form-group"><label class="form-label" for="releaseTitle">Release title</label>' +
      '<input type="text" class="input" id="releaseTitle" value="' + esc(existing ? existing.title || '' : '') + '" placeholder="First stable release"></div>' +
      '<div class="form-group"><label class="form-label" for="releaseTarget">Target</label>' +
      '<select class="input" id="releaseTarget">' + branches.map(function (b) {
        return '<option value="' + esc(b) + '"' + (b === forge.defaultBranch ? ' selected' : '') + '>' + esc(b) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-group"><label class="form-label" for="releaseBody">Describe this release</label>' +
      '<textarea class="input" id="releaseBody" rows="8">' + esc(existing ? existing.body || '' : '') + '</textarea>' +
      '<div class="muted fs-12 mt-1">Writing “Fixes #3” will close that issue when the release is published.</div></div>' +
      '<div class="form-group"><label class="form-label" for="releaseAssets">Assets <span class="muted fs-12">(one per line: name)</span></label>' +
      '<textarea class="input mono" id="releaseAssets" rows="3">' + esc((existing && existing.assets ? existing.assets.map(function (a) { return a.name; }).join('\n') : '')) + '</textarea></div>',
    actions: [
      { label: existing ? 'Save release' : 'Publish release', primary: true, icon: 'tag', id: 'confirmReleaseBtn' },
      { label: 'Cancel' },
    ],
    onMount: function (root) {
      var confirm = root.querySelector('#confirmReleaseBtn');
      if (!confirm) return;
      confirm.addEventListener('click', function () {
        var tagValue = (root.querySelector('#releaseTag').value || '').trim();
        if (!tagValue) { toast('A release needs a tag', 'error'); return; }
        var assetNames = (root.querySelector('#releaseAssets').value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        var payload = {
          tag: tagValue,
          title: (root.querySelector('#releaseTitle').value || '').trim() || tagValue,
          body: root.querySelector('#releaseBody').value || '',
          target: root.querySelector('#releaseTarget').value,
          assets: assetNames.map(function (name) {
            var file = (forge.files || []).filter(function (f) { return f.name === name; })[0];
            return { id: uid('asset'), name: name, size: file ? (file.content || '').length : 0 };
          }),
        };
        if (existing) {
          Object.keys(payload).forEach(function (k) { existing[k] = payload[k]; });
          existing.published = Date.now();
          saveDB();
          packageFromRelease(forge, existing);
          toast('Release updated', 'success');
        } else {
          var release = createRelease(forge, payload);
          packageFromRelease(forge, release);
          toast('Release ' + release.tag + ' published', 'success');
        }
        closeModal();
        render();
      });
    },
  });
}

export function viewForgeTags(user, forge) {
  var tags = forge.tags || [];
  return '<div class="actions-head"><div class="actions-head-left">' +
    '<span class="actions-head-title">Tags</span><span class="actions-head-meta">' + tags.length + ' tag' + (tags.length === 1 ? '' : 's') + '</span></div></div>' +
    (tags.length ? '<div class="card-tight">' + tags.map(function (t) {
      var release = (forge.releases || []).filter(function (r) { return r.tag === t; })[0];
      return '<div class="list-item"><div class="list-icon">' + ic('tag', 14) + '</div>' +
        '<div class="list-body"><div class="list-title mono">' + esc(t) + '</div>' +
        '<div class="list-meta">' + (release ? esc(release.title) + ' · ' + timeAgo(release.published) : 'No release notes') + '</div></div>' +
        '<div class="list-side">' + (release ? '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/releases">Release</a>' : '') + '</div></div>';
    }).join('') + '</div>'
    : '<div class="empty"><h3>No tags</h3><p>Tags are created when you publish a release.</p>' +
      (canEditForge(user, forge) ? '<button class="btn primary newReleaseBtn">Create a release</button>' : '') + '</div>');
}

/* ============================================================ BRANCHES === */

export function viewForgeBranches(user, forge) {
  var branches = (forge.branches || []).map(function (name) {
    var commits = commitsFor(forge, name);
    return { name: name, commits: commits, head: commits[0] || null };
  }).sort(function (a, b) { return (b.head ? b.head.time : 0) - (a.head ? a.head.time : 0); });

  return '<div class="actions-head"><div class="actions-head-left">' +
    '<span class="actions-head-title">Branches</span><span class="actions-head-meta">' + branches.length + ' branch' + (branches.length === 1 ? '' : 's') + '</span></div>' +
    '<div class="actions-head-right">' + (canEditForge(user, forge)
      ? '<button class="btn sm primary openBranchBtn">' + ic('plus', 14) + ' New branch</button>' : '') + '</div></div>' +
    '<div class="card-tight">' + branches.map(function (b) {
      var ahead = b.name === forge.defaultBranch ? 0 : b.commits.length;
      return '<div class="list-item">' +
        '<div class="list-icon">' + ic('redBranch', 16) + '</div>' +
        '<div class="list-body">' +
          '<div class="list-title"><a href="#/' + user.username + '/' + forge.name + '/tree/' + encodeURIComponent(b.name) + '">' + esc(b.name) + '</a>' +
            (b.name === forge.defaultBranch ? ' <span class="label blue">Default</span>' : '') + '</div>' +
          '<div class="list-meta">' + (b.head ? esc(b.head.msg) + ' · <span class="mono">' + b.head.sha.slice(0, 7) + '</span> · ' + timeAgo(b.head.time) : 'No commits') +
            (b.name !== forge.defaultBranch ? ' · ' + ahead + ' commit' + (ahead === 1 ? '' : 's') : '') + '</div>' +
        '</div>' +
        '<div class="list-side">' +
          '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/tree/' + encodeURIComponent(b.name) + '">Browse</a>' +
          (b.name !== forge.defaultBranch ? '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/compare/' + forge.defaultBranch + '...' + encodeURIComponent(b.name) + '">Compare</a>' : '') +
        '</div></div>';
    }).join('') + '</div>';
}

/* ========================================================= DISCUSSIONS === */

export function viewForgeDiscussions(user, forge, rest) {
  var list = discussionsFor(forge);
  if (rest && rest[0] === 'new') return discussionComposer(user, forge);
  if (rest && rest[0]) {
    var discussion = list.filter(function (d) { return d.number === Number(rest[0]); })[0];
    if (discussion) return discussionDetail(user, forge, discussion);
    return notFound('Discussion', 'Discussion #' + esc(rest[0]) + ' does not exist.');
  }
  return '<div class="actions-head"><div class="actions-head-left">' +
    '<span class="actions-head-title">Discussions</span><span class="actions-head-meta">' + list.length + ' thread' + (list.length === 1 ? '' : 's') + '</span></div>' +
    '<div class="actions-head-right"><a class="btn sm primary" href="#/' + user.username + '/' + forge.name + '/discussions/new">' + ic('commentDiscussion', 14) + ' New discussion</a></div></div>' +
    (list.length ? '<div class="card-tight">' + list.map(function (d) {
      var category = DISCUSSION_CATEGORIES.filter(function (c) { return c.id === d.category; })[0] || DISCUSSION_CATEGORIES[4];
      return '<div class="list-item">' +
        '<div class="list-icon" style="color:var(--purple)">' + ic(category.icon, 16) + '</div>' +
        '<div class="list-body">' +
          '<div class="list-title"><a href="#/' + user.username + '/' + forge.name + '/discussions/' + d.number + '">' + esc(d.title) + '</a>' +
            (d.answered ? ' <span class="label green">Answered</span>' : '') + '</div>' +
          '<div class="list-meta">#' + d.number + ' opened ' + timeAgo(d.created) + ' by ' + esc(d.author) + ' in ' + esc(category.name) +
            ' · ' + d.comments.length + ' comment' + (d.comments.length === 1 ? '' : 's') + ' · ' + d.upvotes.length + ' upvote' + (d.upvotes.length === 1 ? '' : 's') + '</div>' +
        '</div></div>';
    }).join('') + '</div>'
    : '<div class="empty"><div class="empty-icon">' + ic('commentDiscussion', 32) + '</div><h3>No discussions</h3>' +
      '<p>Discussions are open-ended conversations about this forge.</p>' +
      '<a class="btn primary" href="#/' + user.username + '/' + forge.name + '/discussions/new">Start the first discussion</a></div>');
}

function discussionComposer(user, forge) {
  return '<div class="card">' +
    '<h3 class="card-title">Start a discussion</h3>' +
    '<div class="form-group"><label class="form-label" for="discTitle">Title</label>' +
      '<input type="text" class="input" id="discTitle" placeholder="What do you want to talk about?"></div>' +
    '<div class="form-group"><label class="form-label" for="discCategory">Category</label>' +
      '<select class="input" id="discCategory">' + DISCUSSION_CATEGORIES.map(function (c) {
        return '<option value="' + c.id + '">' + esc(c.name) + ' — ' + esc(c.description) + '</option>';
      }).join('') + '</select></div>' +
    '<div class="form-group"><label class="form-label" for="discBody">Body</label>' +
      '<textarea class="input" id="discBody" rows="8"></textarea></div>' +
    '<div style="display:flex;gap:8px"><button class="btn primary createDiscussionBtn">' + ic('commentDiscussion', 14) + ' Start discussion</button>' +
      '<a class="btn" href="#/' + user.username + '/' + forge.name + '/discussions">Cancel</a></div>' +
  '</div>';
}

function discussionDetail(user, forge, d) {
  var upvoted = ME && d.upvotes.indexOf(ME.username) !== -1;
  var isAuthor = ME && ME.username === d.author;
  return '<div class="actions-head"><div class="actions-head-left">' +
    '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/discussions">' + ic('chevronLeft', 14) + ' Discussions</a>' +
    '<span class="actions-head-title">#' + d.number + ' ' + esc(d.title) + '</span></div></div>' +
  '<div class="card">' +
    '<div class="discussion-head">' +
      '<button class="upvote' + (upvoted ? ' upvoted' : '') + ' upvoteDiscussionBtn" data-id="' + esc(d.id) + '">' +
        ic('chevronUp', 14) + '<span>' + d.upvotes.length + '</span></button>' +
      '<div><div class="fw-600">' + esc(d.author) + ' started this discussion ' + timeAgo(d.created) + '</div>' +
        '<div class="muted fs-12">' + esc(d.category) + (d.answered ? ' · answered' : '') + '</div></div>' +
    '</div>' +
    '<div class="readme-body">' + md(d.body || '_No body._') + '</div>' +
  '</div>' +
  '<div class="card mt-4"><h3 class="card-title">' + d.comments.length + ' comment' + (d.comments.length === 1 ? '' : 's') + '</h3>' +
    d.comments.map(function (c) {
      var account = getUserByUsername(c.author) || { username: c.author, avatar: null };
      return '<div class="comment' + (c.isAnswer ? ' answer' : '') + '">' +
        '<div class="comment-head">' + avatarHTML(account, 20) + ' <b>' + esc(c.author) + '</b> <span class="muted fs-12">' + timeAgo(c.created) + '</span>' +
          (c.isAnswer ? '<span class="label green">Answer</span>' : '') + '</div>' +
        '<div class="readme-body">' + md(c.body) + '</div>' +
        '<div class="comment-actions">' +
          '<button class="btn xs upvoteCommentBtn" data-id="' + esc(c.id) + '">' + ic('chevronUp', 12) + ' ' + (c.upvotes || []).length + '</button>' +
          (isAuthor && !c.isAnswer ? '<button class="btn xs markAnswerBtn" data-id="' + esc(c.id) + '">Mark as answer</button>' : '') +
        '</div></div>';
    }).join('') +
    (ME ? '<div class="comment-composer">' +
      '<textarea class="input" id="discComment" rows="3" placeholder="Add a comment"></textarea>' +
      '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn primary commentDiscussionBtn" data-id="' + esc(d.id) + '">Comment</button></div>' +
    '</div>' : '<p class="muted fs-13">Sign in to comment.</p>') +
  '</div>';
}

/* ============================================================= PACKAGES === */

export function viewForgePackages(user, forge) {
  var list = packagesFor(forge);
  return '<div class="actions-head"><div class="actions-head-left">' +
    '<span class="actions-head-title">Packages</span><span class="actions-head-meta">' + list.length + ' package' + (list.length === 1 ? '' : 's') + '</span></div>' +
    '<div class="actions-head-right">' + (canEditForge(user, forge) ? '<button class="btn sm primary newPackageBtn">' + ic('plus', 14) + ' New package</button>' : '') + '</div></div>' +
    (list.length ? '<div class="card-tight">' + list.map(function (p) {
      return '<div class="list-item"><div class="list-icon">' + ic('package', 16) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(p.name) + ' <span class="label">' + esc(p.type) + '</span></div>' +
        '<div class="list-meta">' + esc(p.description || 'No description') + ' · ' + p.versions.length + ' version' + (p.versions.length === 1 ? '' : 's') +
        ' · latest ' + esc(p.versions[0].version) + ' · updated ' + timeAgo(p.updated) + '</div></div>' +
        '<div class="list-side">' + (canEditForge(user, forge) ? '<button class="btn sm addVersionBtn" data-id="' + esc(p.id) + '">Add version</button>' +
          '<button class="btn sm danger deletePackageBtn" data-id="' + esc(p.id) + '">' + ic('trash', 12) + '</button>' : '') + '</div></div>';
    }).join('') + '</div>'
    : '<div class="empty"><div class="empty-icon">' + ic('package', 32) + '</div><h3>No packages</h3>' +
      '<p>Publishing a release with assets also creates a package automatically.</p>' +
      (canEditForge(user, forge) ? '<button class="btn primary newPackageBtn">Create a package</button>' : '') + '</div>');
}

/* ================================================== STARGAZERS / FORKS === */

export function viewForgeStargazers(user, forge) {
  var people = stargazers(forge.id);
  if (!people.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('star', 32) + '</div><h3>No stars yet</h3>' +
      '<p>' + esc(user.username) + '/' + esc(forge.name) + ' has not been starred.</p></div>';
  }
  return '<div class="actions-head"><div class="actions-head-left"><span class="actions-head-title">Stargazers</span>' +
    '<span class="actions-head-meta">' + people.length + ' account' + (people.length === 1 ? '' : 's') + '</span></div></div>' +
    '<div class="contributors-grid">' + people.map(function (entry) {
      var account = entry.user;
      return '<a class="contrib-card" href="#/' + esc(account.username) + '">' + avatarHTML(account, 40) +
        '<div><div class="fw-600 bright">' + esc(account.username) + '</div>' +
        '<div class="muted fs-12">starred ' + timeAgo(entry.at) + '</div></div></a>';
    }).join('') + '</div>';
}

export function viewForgeForks(user, forge) {
  var people = forksOf(forge.id);
  if (!people.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('fork', 32) + '</div><h3>No forks yet</h3>' +
      '<p>Forks of ' + esc(user.username) + '/' + esc(forge.name) + ' appear here.</p></div>';
  }
  return '<div class="actions-head"><div class="actions-head-left"><span class="actions-head-title">Forks</span>' +
    '<span class="actions-head-meta">' + people.length + ' fork' + (people.length === 1 ? '' : 's') + '</span></div></div>' +
    '<div class="contributors-grid">' + people.map(function (f) {
      return '<a class="contrib-card" href="#/' + esc(f.user.username) + '/' + esc(f.forge.name) + '">' + avatarHTML(f.user, 40) +
        '<div><div class="fw-600 bright">' + esc(f.user.username) + '/' + esc(f.forge.name) + '</div>' +
        '<div class="muted fs-12">forked ' + timeAgo(f.at) + '</div></div></a>';
    }).join('') + '</div>';
}

/* ============================================================== shared === */

function notFound(what, message) {
  return '<div class="empty"><div class="empty-icon">' + ic('alert', 32) + '</div><h3>' + esc(what) + ' not found</h3><p>' + esc(message) + '</p></div>';
}
