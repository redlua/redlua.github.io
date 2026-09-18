/**
 * RedGet — event binding.
 *
 * One delegated listener per event type, installed once at boot, dispatches
 * to handlers keyed by a selector. Because the listener lives on `document`
 * rather than on re-rendered nodes, it keeps working across renders and also
 * catches clicks inside dialogs and the drawer.
 *
 * Adding a behaviour means adding one entry to CLICKS (or CHANGES/INPUTS):
 *
 *   '.starBtn': function (e, el, ctx) { … }
 *
 * `ctx` gives the handler `{ route, forge, user, project, gist, codespace }`
 * resolved from the current hash, so handlers never have to re-parse it.
 */

import { DB, ME, saveDB, setSession, clearSession, resetAllData, revokeSession } from '../state.js';
import { ic } from '../icons.js';
import { $, $$ } from './dom.js';
import { esc, uid, formatDate } from './util.js';
import { genKey } from './keys.js';
import { renderHeader, signOut } from './header.js';
import { openPalette } from './palette.js';
import { openModal, closeModal } from './modal.js';
import { render } from './render.js';
import { navigate, parseRoute } from './router.js';
import { toast, copyText, downloadText } from './toast.js';
import { showAuth, showKeyReveal } from './auth.js';
import { getUserByUsername, toggleFollow, toggleStar, toggleWatch, forkForge, forgeById } from './social.js';
import { findForge, createForge, logActivity, ensureForgeShape } from './forges.js';
import { validateUsername, deleteAccount } from './account.js';
import { saveFile, deleteFile, renameFile, createBranch, deleteBranch, setDefaultBranch,
  createIssue, setIssueState, updateIssue, deleteIssue, addComment, deleteComment,
  toggleReaction, createPull, mergePull, closePull, setDraft, addReview, issueByNumber,
  deleteRelease, deleteTag, saveLabel, saveMilestone, fileByName } from './model.js';
import { triggerRuns, rerun, deleteRun, setWorkflowState, workflowById, runById,
  saveSecret, deleteSecret, saveVariable, deleteVariable,
  saveEnvironment, deleteEnvironment, syncWorkflows } from './actions.js';
import { projectById, createProject, updateProject, deleteProject, addColumn,
  deleteColumn, moveColumn, addItem, moveItem, deleteItem, addIteration,
  deleteIteration, PROJECT_LAYOUTS, DEFAULT_COLUMNS } from './projects.js';
import { createWikiPage, updateWikiPage, deleteWikiPage, restoreWikiPage, setWikiChrome } from './wiki.js';
import { dismissAlert, reopenAlert, createAdvisory, publishAdvisory, closeAdvisory,
  deleteAdvisory, saveSecuritySettings, advisoriesFor } from './security.js';
import { discussionsFor, createDiscussion, commentOnDiscussion, toggleUpvote, markAnswer,
  installApp, uninstallApp } from './marketplace.js';
import { gistById, createGist, updateGist, deleteGist, forkGist, toggleGistStar,
  commentOnGist, restoreRevision } from './gists.js';
import { codespaceById, createCodespace, startCodespace, stopCodespace,
  deleteCodespace, updateCodespace, runCommand } from './codespaces.js';
import { orgBySlug, createOrg, deleteOrg, updateOrg, addMember, removeMember, setMemberRole,
  createTeam, deleteTeam, addToTeam, validateOrgName, slugAvailable } from './orgs.js';
import { markRead, markAllRead, deleteNotification, clearNotifications } from './notify.js';
import { deleteKey, openSshKeyModal } from '../views/settings.js';
import { seedDemoWorkspace } from './demo.js';
import { parseSshKey } from './sshKeys.js';
import { openReleaseModal } from '../views/forgeExtras.js';

var installed = false;

/** Install the delegated listeners. Called once from app.js. */
export function installBindings() {
  if (installed) return;
  installed = true;
  document.addEventListener('click', onClick, true);
  document.addEventListener('change', onChange, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('submit', onSubmit, true);
  installAnchorA11yKeys();
}

/**
 * Accessibility net for the markup inherited from the single-file app: an
 * anchor that acts as a button through an inline `onclick` and has no `href`
 * is not focusable and ignores the keyboard, so it reads as dead link text.
 *
 * `enhanceAnchorA11y()` makes every one of them a real, tab-reachable control
 * (tabindex + role) and is called once per paint from bindAfterRender() below.
 * It is a bounded synchronous scan rather than a MutationObserver on purpose:
 * an observer's records are delivered as microtasks, which never drain during
 * the synchronous 400-page crawl in tools/check-links.mjs, so jsdom would
 * retain every rendered page and run out of memory.
 *
 * `installAnchorA11yKeys()` adds the Enter/Space activation, installed once.
 */
var A11Y_SEL = 'a[onclick]:not([href]):not([data-a11y])';

function enhanceAnchorA11y() {
  if (typeof document.querySelectorAll !== 'function') return;
  var found = document.querySelectorAll(A11Y_SEL);
  for (var i = 0; i < found.length; i++) {
    var a = found[i];
    a.setAttribute('data-a11y', '1');
    if (!a.hasAttribute('tabindex')) a.setAttribute('tabindex', '0');
    if (!a.hasAttribute('role')) a.setAttribute('role', 'link');
  }
}

function installAnchorA11yKeys() {
  document.addEventListener('keydown', function (e) {
    var key = e.key;
    if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar') return;
    var t = e.target;
    var a = t && typeof t.closest === 'function' ? t.closest('a[onclick]:not([href])') : null;
    if (!a) return;
    e.preventDefault();
    a.click();
  }, true);
}

/**
 * Kept for compatibility with the original single-file app: the render pass
 * used to call this after every paint. Delegation means there is nothing to
 * re-attach, so it only refreshes route-scoped state.
 */
export function bindAfterRender(route) {
  bindAfterRender.route = route;
  enhanceAnchorA11y();
  var terminal = $('#terminalInput');
  if (terminal && !terminal._wired) wireTerminal(terminal);
}

/* ===================================================================== *
   Dispatch
\* ===================================================================== */

/**
 * Find the most specific registered selector that matches `node` (or one of
 * its ancestors). Selectors are tried longest-first so that
 * `.deleteItemBtn[data-project]` wins over `.deleteItemBtn`.
 */
function matchHandler(node, table, order) {
  if (!node || node.nodeType !== 1 || typeof node.closest !== 'function') return null;
  for (var i = 0; i < order.length; i++) {
    var selector = order[i];
    var found = null;
    try { found = node.closest(selector); } catch (e) { found = null; }
    if (found) return { selector: selector, el: found, handler: table[selector] };
  }
  return null;
}

function onClick(e) {
  var match = matchHandler(e.target, CLICKS, CLICKS_ORDER);
  if (!match) return;
  if (match.el.disabled) return;
  var prevent = match.handler(e, match.el, context());
  if (prevent !== false) e.preventDefault();
}

function onChange(e) {
  var match = matchHandler(e.target, CHANGES, CHANGES_ORDER);
  if (!match) return;
  match.handler(e, match.el, context());
}

function onInput(e) {
  var match = matchHandler(e.target, INPUTS, INPUTS_ORDER);
  if (!match) return;
  match.handler(e, match.el, context());
}

function onSubmit(e) {
  var match = matchHandler(e.target, SUBMITS, SUBMITS_ORDER);
  if (!match) return;
  e.preventDefault();
  match.handler(e, match.el, context());
}

/** Resolve everything a handler usually needs from the current hash. */
function context() {
  var route = parseRoute();
  var parts = route.parts;
  var ctx = { route: route, parts: parts, user: null, forge: null, org: null };
  if (parts.length >= 2) {
    var found = findForge(parts[0], parts[1]);
    if (found) { ctx.user = found.user; ctx.forge = found.forge; ctx.org = found.org || null; }
  }
  if (!ctx.forge && parts.length === 1) ctx.user = getUserByUsername(parts[0]);
  if (parts[0] === 'orgs' && parts[1]) ctx.org = orgBySlug(parts[1]);
  if (parts[0] === 'projects' && parts[1] && parts[1] !== 'new') ctx.project = projectById(parts[1]);
  if ((parts[0] === 'gists' || parts[0] === 'gist') && parts[1] && parts[1] !== 'new') ctx.gist = gistById(parts[1]);
  if (parts[0] === 'codespaces' && parts[1] && parts[1] !== 'new') ctx.codespace = codespaceById(parts[1]);
  ctx.branch = ctx.forge ? branchFromRoute(ctx.forge) : null;
  return ctx;
}

function branchFromRoute(forge) {
  var parts = parseRoute().parts;
  var named = parts[3];
  if (named && (forge.branches || []).indexOf(decodeURIComponent(named)) !== -1) return decodeURIComponent(named);
  return forge.defaultBranch;
}

/* ===================================================================== *
   Click handlers
\* ===================================================================== */

var CLICKS = {
  /* ---------------------------------------------------------- forge social */
  '#starBtn': function (e, el, ctx) {
    var forge = forgeById(el.getAttribute('data-forge-id'));
    if (!forge || !ME) return signIn();
    var on = toggleStar(forge.user, forge.forge);
    toast(on ? 'Starred ' + forge.forge.name : 'Removed star from ' + forge.forge.name, on ? 'success' : 'info');
    render();
  },
  '#watchBtn': function (e, el, ctx) {
    var forge = forgeById(el.getAttribute('data-forge-id'));
    if (!forge || !ME) return signIn();
    var on = toggleWatch(forge.forge.id);
    toast(on ? 'Watching ' + forge.forge.name : 'Unwatched ' + forge.forge.name, 'info');
    render();
  },
  '#forkBtn': function (e, el, ctx) {
    var found = forgeById(el.getAttribute('data-forge-id'));
    if (!found || !ME) return signIn();
    openForkModal(found.user, found.forge);
  },
  '.followBtn': function (e, el) {
    if (!ME) return signIn();
    var name = el.getAttribute('data-username');
    var on = toggleFollow(name);
    toast(on ? 'Following ' + name : 'Unfollowed ' + name, 'info');
    render();
  },

  /* ------------------------------------------------------------- forge bar */
  '#branchSelect': function (e) { window.openBranchModal(); },
  '#goToFileBtn': function (e) { window.openGoToFileModal(); },
  '#codeBtn': function (e) { window.openCodeModal(); },
  '#addFileBtn': function (e, el, ctx) {
    if (!ctx.forge) return;
    navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/new/' + encodeURIComponent(ctx.branch));
  },
  '#addFileBtn2': function (e, el, ctx) {
    if (!ctx.forge) return;
    navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/new/' + encodeURIComponent(ctx.branch));
  },
  '#saveFileBtn': function (e, el, ctx) { saveFileFromEditor(ctx); },
  '.copyFileBtn': function (e, el, ctx) {
    if (!ctx.forge) return;
    var file = fileByName(ctx.forge, el.getAttribute('data-path'));
    if (!file) return toast('File not found', 'error');
    copyText(file.content, 'Copied ' + file.name);
  },
  '.copyAddressBtn': function (e, el) { copyText(el.getAttribute('data-text'), 'Copied'); },
  '.copyShaBtn': function (e, el) { copyText(el.getAttribute('data-sha'), 'Commit SHA copied'); },
  '.deleteFileBtn': function (e, el, ctx) {
    if (!ctx.forge) return;
    var path = el.getAttribute('data-path');
    confirmDialog('Delete ' + path + '?', 'The file is removed and the deletion is recorded as a commit.', function () {
      deleteFile(ctx.forge, path, 'Delete ' + path);
      triggerRuns(ctx.forge, 'push', { branch: ctx.branch, title: 'Delete ' + path });
      toast('Deleted ' + path, 'success');
      navigate('/' + ctx.user.username + '/' + ctx.forge.name);
    });
  },
  '.compareBtn': function (e, el, ctx) {
    var base = $('#compareBase').value;
    var head = $('#compareHead').value;
    navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/compare/' + base + '...' + head);
  },

  /* ------------------------------------------------- issues / pull requests */
  '#niGo': function (e, el, ctx) { createIssueFromForm(ctx); },
  '#prGo': function (e, el, ctx) { createPullFromForm(ctx); },
  '.commentBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var field = $('#commentBody');
    var body = field ? field.value : '';
    if (!String(body).trim()) return toast('Write a comment first', 'error');
    var target = el.getAttribute('data-kind') === 'pull'
      ? findPullById(ctx.forge, el.getAttribute('data-id'))
      : findIssueById(ctx.forge, el.getAttribute('data-id'));
    if (!target) return;
    addComment(ctx.user, ctx.forge, target, body);
    toast('Comment added', 'success');
    render();
  },
  '.stateBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var issue = findIssueById(ctx.forge, el.getAttribute('data-id'));
    if (!issue) return;
    setIssueState(ctx.user, ctx.forge, issue, el.getAttribute('data-state'));
    toast('Issue ' + el.getAttribute('data-state'), 'success');
    render();
  },
  '.reactBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var target = findTargetById(ctx.forge, el.getAttribute('data-id'));
    if (!target) return;
    toggleReaction(target, el.getAttribute('data-reaction'), ME.username);
    render();
  },
  '.reactMenuBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var target = findTargetById(ctx.forge, el.getAttribute('data-id'));
    if (!target) return;
    openReactionMenu(target, ctx);
  },
  '.deleteCommentBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var id = el.getAttribute('data-id');
    var holder = findCommentHolder(ctx.forge, id);
    if (!holder) return;
    confirmDialog('Delete this comment?', 'This cannot be undone.', function () {
      deleteComment(holder.target, holder.comment);
      toast('Comment deleted', 'success');
      render();
    });
  },
  '.editItemBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var issue = findIssueById(ctx.forge, el.getAttribute('data-id'));
    if (issue) openEditItemModal(ctx, issue);
  },
  '.deleteItemBtn[data-kind="issue"]': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var issue = findIssueById(ctx.forge, el.getAttribute('data-id'));
    if (!issue) return;
    confirmDialog('Delete issue #' + issue.number + '?', 'The issue and its comments are removed.', function () {
      deleteIssue(ctx.forge, issue);
      toast('Issue deleted', 'success');
      navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/issues');
    });
  },
  '.lockBtn': function (e, el, ctx) {
    var issue = findIssueById(ctx.forge, el.getAttribute('data-id'));
    if (!issue) return;
    issue.locked = !issue.locked;
    saveDB();
    toast(issue.locked ? 'Conversation locked' : 'Conversation unlocked', 'info');
    render();
  },
  '.pinBtn': function (e, el, ctx) {
    var issue = findIssueById(ctx.forge, el.getAttribute('data-id'));
    if (!issue) return;
    issue.pinned = !issue.pinned;
    saveDB();
    render();
  },
  '.mergeBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var pr = findPullById(ctx.forge, el.getAttribute('data-id'));
    if (!pr) return;
    var method = el.getAttribute('data-method');
    var merged = mergePull(ctx.user, ctx.forge, pr, method);
    if (!merged) { toast('That pull request is not mergeable', 'error'); return; }
    // A merge pushes to the base branch, so the workflows listening for `push`
    // really do run.
    triggerRuns(ctx.forge, 'push', {
      branch: pr.base, title: 'Merge pull request #' + pr.number + ' (' + method + ')', actor: ME.username,
    });
    toast('Pull request ' + (method === 'squash' ? 'squashed and merged' : method === 'rebase' ? 'rebased and merged' : 'merged'), 'success');
    render();
  },
  '.closePullBtn': function (e, el, ctx) {
    var pr = findPullById(ctx.forge, el.getAttribute('data-id'));
    if (!pr) return;
    closePull(ctx.user, ctx.forge, pr, false);
    toast('Pull request closed', 'info');
    render();
  },
  '.reopenPullBtn': function (e, el, ctx) {
    var pr = findPullById(ctx.forge, el.getAttribute('data-id'));
    if (!pr) return;
    closePull(ctx.user, ctx.forge, pr, true);
    toast('Pull request reopened', 'success');
    render();
  },
  '.draftBtn': function (e, el, ctx) {
    var pr = findPullById(ctx.forge, el.getAttribute('data-id'));
    if (!pr) return;
    setDraft(pr, el.getAttribute('data-draft') === '1');
    render();
  },
  '.reviewBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var pr = findPullById(ctx.forge, el.getAttribute('data-id'));
    if (!pr) return;
    openReviewModal(ctx, pr, el.getAttribute('data-state'));
  },
  '.newLabelBtn': function (e, el, ctx) { openLabelModal(ctx); },
  '.deleteLabelBtn': function (e, el, ctx) {
    deleteLabel(ctx.forge, el.getAttribute('data-name'));
    toast('Label deleted', 'success');
    render();
  },
  '.newMilestoneBtn': function (e, el, ctx) { openMilestoneModal(ctx); },

  /* ---------------------------------------------------------------- actions */
  '.rerunBtn': function (e, el, ctx) {
    var run = runById(ctx.forge, el.getAttribute('data-run'));
    if (!run) return;
    rerun(ctx.forge, run, false);
    toast('Run #' + run.number + ' re-run: ' + run.conclusion, run.conclusion === 'success' ? 'success' : 'error');
    render();
  },
  '.rerunFailedBtn': function (e, el, ctx) {
    var run = runById(ctx.forge, el.getAttribute('data-run'));
    if (!run) return;
    rerun(ctx.forge, run, true);
    toast('Failed jobs re-run: ' + run.conclusion, run.conclusion === 'success' ? 'success' : 'error');
    render();
  },
  '.deleteRunBtn': function (e, el, ctx) {
    var run = runById(ctx.forge, el.getAttribute('data-run'));
    if (!run) return;
    confirmDialog('Delete run #' + run.number + '?', 'The run and its logs are removed.', function () {
      deleteRun(ctx.forge, run);
      toast('Run deleted', 'success');
      navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/actions');
    });
  },
  '.toggleWorkflowBtn': function (e, el, ctx) {
    var workflow = workflowById(ctx.forge, el.getAttribute('data-id'));
    if (!workflow) return;
    setWorkflowState(ctx.forge, workflow.id, el.getAttribute('data-state'));
    toast('Workflow ' + el.getAttribute('data-state'), 'info');
    render();
  },
  '.runWorkflowBtn': function (e, el, ctx) {
    if (!ctx.forge || !ME) return signIn();
    var workflow = workflowById(ctx.forge, el.getAttribute('data-id'));
    if (!workflow) return;
    if (workflow.state === 'disabled') return toast('That workflow is disabled', 'error');
    var runs = triggerRuns(ctx.forge, 'workflow_dispatch', {
      branch: ctx.branch, title: 'Manual run of ' + workflow.name, actor: ME.username,
    });
    if (!runs.length) return toast('That workflow is not triggered by manual dispatch', 'info');
    toast('Run #' + runs[0].number + ' finished: ' + runs[0].conclusion, runs[0].conclusion === 'success' ? 'success' : 'error');
    render();
  },
  '#startRunBtn': function (e, el, ctx) {
    var workflowId = $('#runWorkflow').value;
    var workflow = workflowById(ctx.forge, workflowId);
    if (!workflow) return toast('Pick a workflow', 'error');
    var branch = $('#runBranch').value;
    var title = ($('#runTitle').value || '').trim() || 'Manual run of ' + workflow.name;
    triggerRuns(ctx.forge, 'workflow_dispatch', { branch: branch, title: title, actor: ME.username });
    toast('Run created for ' + workflow.name, 'success');
    navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/actions/workflows/' + workflow.id);
  },
  '.stepToggle': function (e, el) {
    var log = el.parentNode.querySelector('.step-log');
    if (!log) return;
    var open = log.hasAttribute('hidden');
    if (open) log.removeAttribute('hidden'); else log.setAttribute('hidden', '');
    el.setAttribute('aria-expanded', open ? 'true' : 'false');
    el.classList.toggle('open', open);
  },
  '#newWorkflowBtn': function (e, el, ctx) { openWorkflowModal(ctx); },
  '.addSecretBtn': function (e, el, ctx) {
    var name = ($('#secretName').value || '').trim().toUpperCase();
    if (!name) return toast('A secret needs a name', 'error');
    saveSecret(ctx.forge, { name: name });
    toast('Secret ' + name + ' saved', 'success');
    render();
  },
  '.deleteSecretBtn': function (e, el, ctx) {
    deleteSecret(ctx.forge, el.getAttribute('data-name'));
    toast('Secret deleted', 'success');
    render();
  },
  '.addVariableBtn': function (e, el, ctx) {
    var name = ($('#varName').value || '').trim();
    var value = ($('#varValue').value || '').trim();
    if (!name) return toast('A variable needs a name', 'error');
    saveVariable(ctx.forge, { name: name, value: value });
    toast('Variable ' + name + ' saved', 'success');
    render();
  },
  '.deleteVariableBtn': function (e, el, ctx) {
    deleteVariable(ctx.forge, el.getAttribute('data-name'));
    render();
  },
  '.addEnvBtn': function (e, el, ctx) {
    var name = ($('#envName').value || '').trim();
    if (!name) return toast('An environment needs a name', 'error');
    saveEnvironment(ctx.forge, { name: name, url: ($('#envUrl').value || '').trim() });
    toast('Environment ' + name + ' created', 'success');
    render();
  },
  '.deleteEnvBtn': function (e, el, ctx) {
    deleteEnvironment(ctx.forge, el.getAttribute('data-name'));
    render();
  },
  '.addWebhookBtn': function (e, el, ctx) {
    var url = ($('#webhookUrl').value || '').trim();
    if (!url) return toast('A webhook needs a payload URL', 'error');
    if (!ctx.forge.webhooks) ctx.forge.webhooks = [];
    ctx.forge.webhooks.push({
      id: uid('hook'), url: url,
      events: ($('#webhookEvents').value || 'push').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      active: true, deliveries: [], created: Date.now(),
    });
    saveDB();
    toast('Webhook added', 'success');
    render();
  },
  '.deleteWebhookBtn': function (e, el, ctx) {
    var id = el.getAttribute('data-id');
    ctx.forge.webhooks = (ctx.forge.webhooks || []).filter(function (w) { return w.id !== id; });
    saveDB();
    render();
  },
  '.addDeployKeyBtn': function (e, el, ctx) {
    var title = ($('#deployKeyTitle').value || '').trim();
    var raw = ($('#deployKeyValue').value || '').trim();
    var parsed = parseSshKey(raw, 'authentication');
    if (!title) return toast('Give the key a title', 'error');
    if (!parsed) return toast('That does not look like a public key', 'error');
    if (!ctx.forge.deployKeys) ctx.forge.deployKeys = [];
    ctx.forge.deployKeys.push({ id: uid('dk'), title: title, key: parsed.key, fingerprint: parsed.fingerprint, added: Date.now() });
    saveDB();
    toast('Deploy key added', 'success');
    render();
  },
  '.deleteDeployKeyBtn': function (e, el, ctx) {
    var id = el.getAttribute('data-id');
    ctx.forge.deployKeys = (ctx.forge.deployKeys || []).filter(function (k) { return k.id !== id; });
    saveDB();
    render();
  },

  /* ------------------------------------------------------------- projects */
  '.newProjectBtn': function (e, el) {
    if (!ME) return signIn();
    var owner = el.getAttribute('data-owner') || 'user';
    var key = el.getAttribute('data-key') || ME.username;
    if (owner === 'forge') {
      navigate('/projects/new?owner=' + encodeURIComponent(key));
      return;
    }
    openProjectModal(owner, key);
  },
  '#createProjectBtn': function (e, el) { createProjectFromForm(); },
  '.addColumnBtn': function (e, el) { openColumnModal(el.getAttribute('data-project')); },
  '.deleteColumnBtn': function (e, el) {
    var project = projectById(el.getAttribute('data-project'));
    if (!project) return;
    confirmDialog('Delete this column?', 'Items inside it are deleted too.', function () {
      deleteColumn(project, el.getAttribute('data-column'));
      toast('Column deleted', 'success');
      render();
    });
  },
  '.moveColBtn': function (e, el) {
    var project = projectById(el.getAttribute('data-project'));
    if (!project) return;
    moveColumn(project, el.getAttribute('data-column'), Number(el.getAttribute('data-dir')));
    render();
  },
  '.addItemBtn': function (e, el) { openItemModal(el.getAttribute('data-project'), el.getAttribute('data-column')); },
  '.deleteItemBtn[data-project]': function (e, el) {
    var project = projectById(el.getAttribute('data-project'));
    if (!project) return;
    deleteItem(project, el.getAttribute('data-item'));
    toast('Item removed', 'info');
    render();
  },
  '.saveProjectBtn': function (e, el) {
    var project = projectById(el.getAttribute('data-project'));
    if (!project) return;
    updateProject(project, {
      title: ($('#projectTitleInput').value || '').trim() || project.title,
      description: ($('#projectDescInput').value || '').trim(),
    });
    toast('Project saved', 'success');
    render();
  },
  '.deleteProjectBtn': function (e, el) {
    var project = projectById(el.getAttribute('data-project'));
    if (!project) return;
    confirmDialog('Delete “' + project.title + '”?', 'All columns and items are removed.', function () {
      deleteProject(project);
      toast('Project deleted', 'success');
      navigate('/projects');
    });
  },
  '.addIterationBtn': function (e, el) {
    var project = projectById(el.getAttribute('data-project'));
    if (!project) return;
    var title = ($('#iterTitle').value || '').trim();
    if (!title) return toast('Give the iteration a title', 'error');
    var start = $('#iterStart').value ? new Date($('#iterStart').value).getTime() : Date.now();
    var end = $('#iterEnd').value ? new Date($('#iterEnd').value).getTime() : start + 14 * 86400000;
    addIteration(project, { title: title, start: start, end: end });
    toast('Iteration added', 'success');
    render();
  },
  '.deleteIterationBtn': function (e, el) {
    var project = projectById(el.getAttribute('data-project'));
    if (!project) return;
    deleteIteration(project, el.getAttribute('data-iteration'));
    render();
  },

  /* ------------------------------------------------------------------ wiki */
  '.newWikiPageBtn': function (e, el, ctx) {
    if (!ctx.forge) return;
    navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/wiki/_new');
  },
  '.saveWikiPageBtn': function (e, el, ctx) { saveWikiPage(ctx, el.getAttribute('data-id')); },
  '.createWikiPageBtn': function (e, el, ctx) { createWikiPageFromForm(ctx); },
  '.deleteWikiPageBtn': function (e, el, ctx) {
    var page = (ctx.forge.wiki || []).filter(function (p) { return p.id === el.getAttribute('data-id'); })[0];
    if (!page) return;
    confirmDialog('Delete “' + page.title + '”?', 'The page and its history are removed.', function () {
      deleteWikiPage(ctx.forge, page);
      toast('Page deleted', 'success');
      navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/wiki');
    });
  },
  '.restoreWikiBtn': function (e, el, ctx) {
    var page = (ctx.forge.wiki || []).filter(function (p) { return p.id === el.getAttribute('data-page'); })[0];
    if (!page) return;
    restoreWikiPage(ctx.forge, page, el.getAttribute('data-rev'));
    toast('Revision restored', 'success');
    render();
  },
  '.saveWikiChromeBtn': function (e, el, ctx) {
    setWikiChrome(ctx.forge, el.getAttribute('data-slot'), el.value);
    toast('Saved', 'success');
    render();
  },

  /* -------------------------------------------------------------- security */
  '.dismissAlertBtn': function (e, el, ctx) {
    dismissAlert(ctx.forge, el.getAttribute('data-kind'), el.getAttribute('data-id'), 'dismissed');
    toast('Alert dismissed', 'info');
    render();
  },
  '.reopenAlertBtn': function (e, el, ctx) {
    reopenAlert(ctx.forge, el.getAttribute('data-kind'), el.getAttribute('data-id'));
    render();
  },
  '.newAdvisoryBtn': function (e, el, ctx) { openAdvisoryModal(ctx); },
  '.publishAdvisoryBtn': function (e, el, ctx) {
    var advisory = advisoriesFor(ctx.forge).filter(function (a) { return a.id === el.getAttribute('data-id'); })[0];
    if (!advisory) return;
    publishAdvisory(ctx.forge, advisory);
    toast('Advisory published', 'success');
    render();
  },
  '.closeAdvisoryBtn': function (e, el, ctx) {
    var advisory = advisoriesFor(ctx.forge).filter(function (a) { return a.id === el.getAttribute('data-id'); })[0];
    if (!advisory) return;
    closeAdvisory(ctx.forge, advisory);
    render();
  },
  '.deleteAdvisoryBtn': function (e, el, ctx) {
    var advisory = advisoriesFor(ctx.forge).filter(function (a) { return a.id === el.getAttribute('data-id'); })[0];
    if (!advisory) return;
    confirmDialog('Delete this advisory?', 'It is removed from the forge.', function () {
      deleteAdvisory(ctx.forge, advisory);
      render();
    });
  },
  '.savePolicyBtn': function (e, el, ctx) {
    var body = $('#securityPolicy').value || '';
    saveSecuritySettings(ctx.forge, { securityPolicy: body });
    saveFile(ctx.forge, 'SECURITY.md', body, 'Update security policy');
    toast('Security policy saved', 'success');
    render();
  },

  /* ------------------------------------------------------------ discussions */
  '.createDiscussionBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var title = ($('#discTitle').value || '').trim();
    if (!title) return toast('A discussion needs a title', 'error');
    var discussion = createDiscussion(ctx.user, ctx.forge, {
      title: title,
      body: $('#discBody').value || '',
      category: $('#discCategory').value,
    });
    toast('Discussion #' + discussion.number + ' started', 'success');
    navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/discussions/' + discussion.number);
  },
  '.commentDiscussionBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var discussion = discussionsFor(ctx.forge).filter(function (d) { return d.id === el.getAttribute('data-id'); })[0];
    var field = $('#discComment');
    if (!discussion || !field || !field.value.trim()) return toast('Write a comment first', 'error');
    commentOnDiscussion(ctx.user, ctx.forge, discussion, field.value);
    toast('Comment added', 'success');
    render();
  },
  '.upvoteDiscussionBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var discussion = discussionsFor(ctx.forge).filter(function (d) { return d.id === el.getAttribute('data-id'); })[0];
    if (!discussion) return;
    toggleUpvote(discussion);
    render();
  },
  '.upvoteCommentBtn': function (e, el, ctx) {
    if (!ME || !ctx.forge) return signIn();
    var id = el.getAttribute('data-id');
    var comment = null;
    discussionsFor(ctx.forge).forEach(function (d) {
      (d.comments || []).forEach(function (c) { if (c.id === id) comment = c; });
    });
    if (!comment) return;
    toggleUpvote(comment);
    render();
  },
  '.markAnswerBtn': function (e, el, ctx) {
    var id = el.getAttribute('data-id');
    var discussion = null;
    discussionsFor(ctx.forge).forEach(function (d) {
      if ((d.comments || []).some(function (c) { return c.id === id; })) discussion = d;
    });
    if (!discussion) return;
    markAnswer(ctx.forge, discussion, id);
    toast('Marked as answer', 'success');
    render();
  },

  /* -------------------------------------------------------------- releases */
  '.newReleaseBtn': function (e, el, ctx) { openReleaseModal(ctx.user, ctx.forge, null); },
  '.editReleaseBtn': function (e, el, ctx) { openReleaseModal(ctx.user, ctx.forge, el.getAttribute('data-tag')); },
  '.deleteReleaseBtn': function (e, el, ctx) {
    var tag = el.getAttribute('data-tag');
    var release = (ctx.forge.releases || []).filter(function (r) { return r.tag === tag; })[0];
    if (!release) return;
    confirmDialog('Delete release ' + tag + '?', 'The tag itself is kept.', function () {
      deleteRelease(ctx.forge, release);
      toast('Release deleted', 'success');
      render();
    });
  },
  '.downloadAssetBtn': function (e, el, ctx) {
    toast('Assets are references to files in this forge — open the file to read it', 'info');
  },

  /* -------------------------------------------------------------- branches */
  '.openBranchBtn': function (e, el, ctx) { openBranchCreateModal(ctx); },
  '.addBranchBtn': function (e, el, ctx) {
    var name = ($('#newBranchInput').value || '').trim();
    if (!name) return toast('Enter a branch name', 'error');
    if (!createBranch(ctx.forge, name, ctx.forge.defaultBranch)) return toast('That branch already exists', 'error');
    toast('Branch ' + name + ' created', 'success');
    render();
  },
  '.deleteBranchBtn': function (e, el, ctx) {
    var name = el.getAttribute('data-branch');
    confirmDialog('Delete branch ' + name + '?', 'Commits on it stay in history but the branch ref is removed.', function () {
      if (!deleteBranch(ctx.forge, name)) return toast('Cannot delete that branch', 'error');
      toast('Branch deleted', 'success');
      render();
    });
  },
  '.setDefaultBranchBtn': function (e, el, ctx) {
    var name = $('#defaultBranchSelect').value;
    setDefaultBranch(ctx.forge, name);
    toast('Default branch is now ' + name, 'success');
    render();
  },
  '.deleteTagBtn': function (e, el, ctx) {
    deleteTag(ctx.forge, el.getAttribute('data-tag'));
    toast('Tag deleted', 'success');
    render();
  },

  /* ---------------------------------------------------- forge settings */
  '.saveForgeSettingsBtn': function (e, el, ctx) { saveForgeSettings(ctx); },
  '.renameForgeBtn': function (e, el, ctx) {
    var name = ($('#forgeNameInput').value || '').trim();
    if (!name || name === ctx.forge.name) return toast('Enter a new name', 'error');
    var old = ctx.forge.name;
    ctx.forge.name = name;
    ctx.forge.updated = Date.now();
    saveDB();
    logActivity('forge.rename', ctx.user.username + '/' + name);
    toast('Renamed ' + old + ' to ' + name, 'success');
    navigate('/' + ctx.user.username + '/' + name);
  },
  '#deleteForgeBtn': function (e, el, ctx) {
    if (!ctx.forge) return;
    confirmDialog('Delete ' + ctx.forge.name + '?',
      'Everything in it — files, history, issues, pull requests, wiki, projects and runs — is removed from this browser. Type the forge name to confirm.',
      function (root) {
        var typed = root.querySelector('#confirmText');
        if (!typed || typed.value.trim() !== ctx.forge.name) { toast('Name does not match', 'error'); return false; }
        var owner = ctx.user;
        owner.forges = (owner.forges || []).filter(function (r) { return r.id !== ctx.forge.id; });
        DB.stars = (DB.stars || []).filter(function (s) { return s.forgeId !== ctx.forge.id; });
        DB.watches = (DB.watches || []).filter(function (w) { return w.forgeId !== ctx.forge.id; });
        DB.forks = (DB.forks || []).filter(function (f) { return f.from !== ctx.forge.id && f.forgeId !== ctx.forge.id; });
        saveDB();
        logActivity('forge.delete', owner.username + '/' + ctx.forge.name);
        toast('Forge deleted', 'success');
        navigate('/' + owner.username);
        return true;
      }, { confirmText: ctx.forge.name });
  },
  '.archiveForgeBtn': function (e, el, ctx) {
    ctx.forge.archived = !ctx.forge.archived;
    saveDB();
    toast(ctx.forge.archived ? 'Forge archived' : 'Forge unarchived', 'info');
    render();
  },
  '.transferForgeBtn': function (e, el, ctx) {
    var to = ($('#transferTo').value || '').trim();
    var account = getUserByUsername(to);
    if (!account) return toast('No account named ' + to, 'error');
    var owner = ctx.user;
    owner.forges = owner.forges.filter(function (r) { return r.id !== ctx.forge.id; });
    ctx.forge.ownerUsername = account.username;
    account.forges.unshift(ctx.forge);
    saveDB();
    toast('Transferred to ' + account.username, 'success');
    navigate('/' + account.username + '/' + ctx.forge.name);
  },
  '.addCollabBtn': function (e, el, ctx) {
    var name = ($('#collabInput').value || '').trim();
    var account = getUserByUsername(name);
    if (!account) return toast('No account named ' + name, 'error');
    if (!ctx.forge.collaborators) ctx.forge.collaborators = [];
    if (ctx.forge.collaborators.indexOf(name) !== -1) return toast('Already a collaborator', 'info');
    ctx.forge.collaborators.push(name);
    saveDB();
    toast(name + ' can now push to ' + ctx.forge.name, 'success');
    render();
  },
  '.removeCollabBtn': function (e, el, ctx) {
    var name = el.getAttribute('data-user');
    ctx.forge.collaborators = (ctx.forge.collaborators || []).filter(function (c) { return c !== name; });
    saveDB();
    render();
  },
  '.savePagesBtn': function (e, el, ctx) {
    ctx.forge.pagesBranch = ($('#pagesBranch').value || '').trim() || ctx.forge.defaultBranch;
    saveDB();
    toast('Pages branch saved', 'success');
  },
  '.saveActionsSettingsBtn': function (e, el, ctx) {
    var perms = {};
    $$('.actionsPerm').forEach(function (input) { perms[input.getAttribute('data-key')] = input.checked; });
    Object.keys(perms).forEach(function (k) { ctx.forge[k] = perms[k]; });
    saveDB();
    toast('Actions settings saved', 'success');
  },

  /* ------------------------------------------------------------ new forge */
  '#nrGo': function (e) { createForgeFromForm(); },
  '#importGo': function (e) { importFilesFromForm(); },
  '#importPick': function (e) { var f = $('#importFiles'); if (f) f.click(); },

  /* -------------------------------------------------------------- gists */
  '#createGistBtn': function (e) { createGistFromForm(); },
  '#addGistFileBtn': function (e) { addGistFileField(); },
  '.removeGistFileBtn': function (e, el) {
    var wrapper = el.closest('.gist-file');
    if (wrapper) wrapper.remove();
  },
  '.saveGistBtn': function (e, el) {
    var gist = gistById(el.getAttribute('data-id'));
    if (!gist) return;
    updateGist(gist, {
      description: ($('#editGistDescription').value || '').trim(),
      message: ($('#editGistMessage').value || '').trim() || 'Edited',
      isPublic: gistVisibility(),
      files: gistFilesFromForm(),
    });
    toast('Revision saved', 'success');
    navigate('/gists/' + gist.id);
  },
  '.gistStarBtn': function (e, el) {
    var gist = gistById(el.getAttribute('data-id'));
    if (!gist || !ME) return signIn();
    var on = toggleGistStar(gist);
    toast(on ? 'Gist starred' : 'Star removed', 'info');
    render();
  },
  '.gistForkBtn': function (e, el) {
    var gist = gistById(el.getAttribute('data-id'));
    if (!gist || !ME) return signIn();
    var copy = forkGist(gist);
    if (!copy) return toast('Could not fork that gist', 'error');
    toast('Forked into your gists', 'success');
    navigate('/gists/' + copy.id);
  },
  '.deleteGistBtn': function (e, el) {
    var gist = gistById(el.getAttribute('data-id'));
    if (!gist) return;
    confirmDialog('Delete this gist?', 'Its files, revisions and comments are removed.', function () {
      deleteGist(gist);
      toast('Gist deleted', 'success');
      navigate('/gists');
    });
  },
  '.gistCommentBtn': function (e, el) {
    var gist = gistById(el.getAttribute('data-id'));
    var field = $('#gistComment');
    if (!gist || !field || !field.value.trim()) return toast('Write a comment first', 'error');
    commentOnGist(gist, field.value);
    toast('Comment added', 'success');
    render();
  },
  '.restoreRevisionBtn': function (e, el) {
    var gist = gistById(el.getAttribute('data-id'));
    if (!gist) return;
    restoreRevision(gist, el.getAttribute('data-rev'));
    toast('Revision restored', 'success');
    render();
  },
  '.revisionDiffBtn': function (e, el) {
    var gist = gistById(el.getAttribute('data-id'));
    if (!gist) return;
    var revision = gist.revisions.filter(function (r) { return r.id === el.getAttribute('data-rev'); })[0];
    if (!revision) return;
    openModal({
      title: 'Revision from ' + formatDate(revision.at),
      icon: 'history',
      wide: true,
      body: revision.files.map(function (f) {
        return '<div class="form-group"><label class="form-label mono">' + esc(f.name) + '</label>' +
          '<pre class="raw-view mono">' + esc(f.content) + '</pre></div>';
      }).join(''),
      actions: [{ label: 'Close' }],
    });
  },
  '.copyGistFileBtn': function (e, el) {
    var gist = gistById(el.getAttribute('data-id'));
    if (!gist) return;
    var file = gist.files.filter(function (f) { return f.name === el.getAttribute('data-name'); })[0];
    if (file) copyText(file.content, 'Copied ' + file.name);
  },

  /* ---------------------------------------------------------- codespaces */
  '#createCodespaceBtn': function (e) { createCodespaceFromForm(); },
  '.startCodespaceBtn': function (e, el) {
    var cs = codespaceById(el.getAttribute('data-id'));
    if (!cs) return;
    startCodespace(cs);
    toast('Codespace started', 'success');
    render();
  },
  '.stopCodespaceBtn': function (e, el) {
    var cs = codespaceById(el.getAttribute('data-id'));
    if (!cs) return;
    stopCodespace(cs);
    toast('Codespace stopped', 'info');
    render();
  },
  '.deleteCodespaceBtn': function (e, el) {
    var cs = codespaceById(el.getAttribute('data-id'));
    if (!cs) return;
    confirmDialog('Delete this codespace?', 'Its history is removed. The forge is untouched.', function () {
      deleteCodespace(cs);
      toast('Codespace deleted', 'success');
      navigate('/codespaces');
    });
  },
  '.saveCodespaceBtn': function (e, el) {
    var cs = codespaceById(el.getAttribute('data-id'));
    if (!cs) return;
    updateCodespace(cs, {
      name: ($('#csEditName').value || '').trim() || cs.name,
      idleMinutes: Number($('#csEditIdle').value) || cs.idleMinutes,
    });
    toast('Codespace updated', 'success');
    render();
  },
  '.terminalClearBtn': function (e) {
    var body = $('#terminalBody');
    if (body) body.innerHTML = '<div class="terminal-line system">Cleared.</div>';
  },

  /* ---------------------------------------------------------- marketplace */
  '.installAppBtn': function (e, el) {
    if (!ME) return signIn();
    var app = el.getAttribute('data-app');
    var install = installApp(app);
    toast(install ? 'Installed' : 'Already installed', install ? 'success' : 'info');
    render();
  },
  '.uninstallAppBtn': function (e, el) {
    var app = el.getAttribute('data-app');
    uninstallApp(app);
    toast('Uninstalled', 'info');
    render();
  },

  /* -------------------------------------------------------- organizations */
  '#createOrgBtn': function (e) { createOrgFromForm(); },
  '.saveOrgBtn': function (e, el) {
    var slug = el.getAttribute('data-slug');
    updateOrg(slug, {
      name: ($('#orgEditName').value || '').trim(),
      description: ($('#orgEditDescription').value || '').trim(),
      location: ($('#orgEditLocation').value || '').trim(),
      website: ($('#orgEditWebsite').value || '').trim(),
      settings: Object.assign({}, (orgBySlug(slug) || {}).settings, {
        defaultPermission: $('#orgEditPermission').value,
        enterprise: ($('#orgEditEnterprise').value || '').trim(),
      }),
    });
    toast('Organization saved', 'success');
    render();
  },
  '.deleteOrgBtn': function (e, el) {
    var slug = el.getAttribute('data-slug');
    confirmDialog('Delete the ' + slug + ' organization?',
      'Its teams, memberships and forges are removed from this browser.',
      function () { deleteOrg(slug); toast('Organization deleted', 'success'); navigate('/organizations'); });
  },
  '.addOrgMemberBtn': function (e, el) { openOrgMemberModal(el.getAttribute('data-slug')); },
  '.removeOrgMemberBtn': function (e, el) {
    removeMember(el.getAttribute('data-slug'), el.getAttribute('data-user'));
    toast('Member removed', 'info');
    render();
  },
  '.joinOrgBtn': function (e, el) {
    if (!ME) return signIn();
    var slug = el.getAttribute('data-slug');
    addMember(slug, ME.username, 'read');
    toast('You joined ' + slug + ' as a reader', 'success');
    render();
  },
  '.newTeamBtn': function (e, el) { openTeamModal(el.getAttribute('data-slug')); },
  '.deleteTeamBtn': function (e, el) {
    deleteTeam(el.getAttribute('data-slug'), el.getAttribute('data-team'));
    toast('Team deleted', 'info');
    render();
  },
  '.addTeamMemberBtn': function (e, el) { openTeamMemberModal(el.getAttribute('data-slug'), el.getAttribute('data-team')); },

  /* -------------------------------------------------------- notifications */
  '.readNotificationBtn': function (e, el) { markRead(el.getAttribute('data-id')); render(); },
  '.deleteNotificationBtn': function (e, el) { deleteNotification(el.getAttribute('data-id')); render(); },
  '#markAllReadBtn': function (e) { if (ME) markAllRead(ME.username); render(); },
  '#clearNotificationsBtn': function (e) {
    if (!ME) return;
    confirmDialog('Clear all notifications?', 'They are removed from your inbox.', function () {
      clearNotifications(ME.username);
      toast('Inbox cleared', 'info');
      render();
    });
  },

  /* --------------------------------------------------------------- copilot */
  '#copilotAskBtn': function (e) { copilotAnswer($('#copilotQuestion').value); },
  '.suggestion': function (e, el) { copilotAnswer(el.getAttribute('data-suggestion')); },

  /* -------------------------------------------------------------- settings */
  '#pfSave': function (e) { saveProfileForm(); },
  '[data-bg]': function (e, el) {
    if (!ME) return;
    ME.avatar = { type: 'initials', value: '', bg: el.getAttribute('data-bg') };
    saveDB(); render();
  },
  '#clearAvatarImg': function (e) {
    if (!ME) return;
    ME.avatar = { type: 'initials', value: '', bg: '#da3633' };
    saveDB(); render();
  },
  '#showKeyBtn': function (e) { if (ME) showKeyReveal(ME.key, false); },
  '#rotateKeyBtn': function (e) { openRotateKeyModal(); },
  '#signOutBtn': function (e) { signOut(); },
  '#switchAccountBtn': function (e) {
    clearSession(); navigate('/'); render(); showAuth('signin');
  },
  '#deleteAccountBtn': function (e) { openDeleteAccountModal(); },
  '#exportDataBtn': function (e) {
    downloadText('redget-export-' + new Date().toISOString().slice(0, 10) + '.json',
      JSON.stringify(DB, null, 2), 'application/json');
  },
  /* Settings → Data → "Load a demo workspace". demo.js only imports leaf
     modules (account, forges, orgs, model, projects, wiki, actions, …) and
     never bind.js, so there is no cycle in loading it eagerly. */
  '#loadDemoBtn': function (e) {
    if (!ME) return signIn();
    var button = e.currentTarget || $('#loadDemoBtn');
    if (button) { button.disabled = true; button.textContent = 'Building…'; }
    try {
      var summary = seedDemoWorkspace();
      if (!summary) { toast('Sign in first', 'error'); return; }
      render();
      toast('Demo workspace ready — ' + summary.forges + ' forges, ' + summary.issues +
        ' issues, ' + summary.runs + ' workflow run' + (summary.runs === 1 ? '' : 's'), 'success');
      navigate('/');
    } catch (err) {
      toast('Could not build the demo workspace', 'error');
      if (window.console) console.error(err);
    }
  },
  '#resetDataBtn': function (e) {
    confirmDialog('Reset all RedGet data?',
      'Every account, forge, gist, project and notification in this browser is erased. This cannot be undone.',
      function () { resetAllData(); clearSession(); navigate('/'); render(); toast('All data cleared', 'success'); });
  },
  '.revokeSessionBtn': function (e, el) {
    revokeSession(el.getAttribute('data-id'));
    toast('Session revoked', 'success');
    render();
  },
  '.pinForgeBtn': function (e, el) {
    if (!ME) return signIn();
    var forge = forgeById(el.getAttribute('data-forge-id'));
    if (!forge) return;
    forge.forge.pinned = !forge.forge.pinned;
    saveDB();
    toast(forge.forge.pinned ? 'Pinned to your profile' : 'Unpinned', 'info');
    render();
  },
  '.openSshKeyBtn': function (e, el) { openSshKeyModal(el.getAttribute('data-kind') || 'authentication'); },
  '.deleteSshKeyBtn': function (e, el) {
    if (!ME) return;
    deleteKey('ssh', el.getAttribute('data-id'));
    toast('Key deleted', 'success');
    render();
  },
  '.deleteGpgKeyBtn': function (e, el) {
    if (!ME) return;
    deleteKey('gpg', el.getAttribute('data-id'));
    toast('Key deleted', 'success');
    render();
  },
  '.themePick': function (e, el) {
    var theme = el.getAttribute('data-theme-value');
    if (ME) { ME.prefs = ME.prefs || {}; ME.prefs.theme = theme; saveDB(); }
    window.setTheme(theme);
    render();
  },

  /* ------------------------------------------------------------ header/misc */
  '#openAuthBtn': function (e) { showAuth('signin'); },
  '#menuBtn': function (e) { window.openMenu(); },
  '.paletteOpenBtn': function (e) { openPalette(); },
};

/* Ordered so more specific selectors win (e.g. .deleteItemBtn[data-project]). */
var CLICKS_ORDER = Object.keys(CLICKS).sort(bySpecificity);
function bySpecificity(a, b) { return b.length - a.length; }

/* ===================================================================== *
   Change / input / submit
\* ===================================================================== */

var CHANGES = {
  '.moveItemSelect': function (e, el) {
    var project = projectById(el.getAttribute('data-project'));
    if (!project || !el.value) return;
    moveItem(project, el.getAttribute('data-item'), el.value);
    render();
  },
  '.featureToggle': function (e, el, ctx) {
    if (!ctx.forge) return;
    var key = el.getAttribute('data-key');
    ctx.forge[key + 'Enabled'] = el.checked;
    saveDB();
    toast(key + (el.checked ? ' enabled' : ' disabled'), 'info');
    render();
  },
  '.securityToggle': function (e, el, ctx) {
    var changes = {};
    changes[el.getAttribute('data-key')] = el.checked;
    saveSecuritySettings(ctx.forge, changes);
    toast('Setting saved', 'success');
  },
  '.actionsPerm': function (e, el, ctx) {
    ctx.forge[el.getAttribute('data-key')] = el.checked;
    saveDB();
  },
  '.prToggle': function (e, el, ctx) {
    var map = { mergeCommit: 'allowMerge', squash: 'allowSquash', rebase: 'allowRebase', deleteBranch: 'deleteBranchOnMerge' };
    ctx.forge[map[el.getAttribute('data-key')]] = el.checked;
    saveDB();
    toast('Saved', 'success');
  },
  '.orgRoleSelect': function (e, el) {
    setMemberRole(el.getAttribute('data-slug'), el.getAttribute('data-user'), el.value);
    toast('Role updated', 'success');
    render();
  },
  '#assigneeSelect': function (e, el, ctx) {
    if (!el.value || !ctx.forge) return;
    var issue = currentIssue(ctx);
    if (!issue) return;
    var list = issue.assignees || [];
    if (list.indexOf(el.value) === -1) list.push(el.value);
    issue.assignees = list;
    saveDB();
    render();
  },
  '#labelSelect': function (e, el, ctx) {
    if (!el.value || !ctx.forge) return;
    var issue = currentIssue(ctx);
    if (!issue) return;
    issue.labels = issue.labels || [];
    if (!issue.labels.some(function (l) { return l.name === el.value; })) {
      issue.labels.push({ name: el.value, color: 'blue' });
    }
    saveDB();
    render();
  },
  '#milestoneSelect': function (e, el, ctx) {
    var issue = currentIssue(ctx);
    if (!issue) return;
    issue.milestone = el.value || null;
    saveDB();
    render();
  },
  '#profileForgeType': function () { render(); },
  '#profileForgeSort': function () { render(); },
  '#pfpFile': function (e, el) { readAvatarFile(el); },
  '.gistFileName': function (e, el) {
    var lang = el.parentNode.querySelector('.gistFileLang');
    if (lang) lang.textContent = guessLanguage(el.value);
  },
  'input[name="commitTarget"]': function (e, el) {
    if (el.value !== 'branch' || el._asked) return;
    el._asked = true;
    var field = $('#newBranchName');
    if (!field) {
      var row = el.closest('.form-row');
      if (row) {
        var wrap = document.createElement('div');
        wrap.className = 'form-group mt-2';
        wrap.innerHTML = '<label class="form-label" for="newBranchName">New branch name</label>' +
          '<input type="text" class="input mono" id="newBranchName" placeholder="my-change">';
        row.parentNode.insertBefore(wrap, row.nextSibling);
      }
    }
  },
};
var CHANGES_ORDER = Object.keys(CHANGES).sort(bySpecificity);

var INPUTS = {
  '#globalSearch': function (e, el) { debounce(function () {
    var q = el.value.trim();
    navigate('/explore' + (q ? '?q=' + encodeURIComponent(q) : ''));
  }, 400); },
  '#exploreSearch': function (e, el) { debounce(function () {
    var q = el.value.trim();
    navigate('/explore' + (q ? '?q=' + encodeURIComponent(q) : ''));
  }, 400); },
  '#gistSearch': function (e, el) { debounce(function () {
    var q = el.value.trim();
    navigate('/gists' + (q ? '?q=' + encodeURIComponent(q) : '&q=' + encodeURIComponent(q)));
  }, 400); },
  '#marketSearch': function (e, el) { debounce(function () {
    navigate('/marketplace?q=' + encodeURIComponent(el.value.trim()));
  }, 400); },
  '#globalIssueSearch': function (e, el) { debounce(function () {
    navigate('/issues?q=' + encodeURIComponent(el.value.trim()));
  }, 400); },
  '#profileForgeSearch': function (e, el) { debounce(function () {
    var hash = String(location.hash || '');
    var base = hash.split('?')[0];
    navigate(base.replace('#', '') + '?q=' + encodeURIComponent(el.value.trim()));
  }, 400); },
  '#listSearch': function (e, el, ctx) { debounce(function () {
    if (!ctx.forge) return;
    var route = parseRoute();
    var kind = route.parts[2] === 'pulls' ? 'pulls' : 'issues';
    var state = route.parts[3] === 'closed' ? '/closed' : '';
    navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/' + kind + state +
      (el.value.trim() ? '?q=' + encodeURIComponent(el.value.trim()) : ''));
  }, 400); },
  '#labelFilter': function (e, el, ctx) {
    if (!ctx.forge) return;
    var route = parseRoute();
    var kind = route.parts[2] === 'pulls' ? 'pulls' : 'issues';
    navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/' + kind +
      (el.value ? '?label=' + encodeURIComponent(el.value) : ''));
  },
};
var INPUTS_ORDER = Object.keys(INPUTS).sort(bySpecificity);

var SUBMITS = {
  '#terminalForm': function (e, el, ctx) { runTerminalCommand(ctx); },
};
var SUBMITS_ORDER = Object.keys(SUBMITS).sort(bySpecificity);

/* ===================================================================== *
   Implementations
\* ===================================================================== */

var debounceTimer = null;
function debounce(fn, ms) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, ms || 300);
}

function signIn() {
  showAuth('signin');
}

function currentIssue(ctx) {
  var parts = ctx.route.parts;
  if (!ctx.forge) return null;
  var n = Number(parts[3]);
  return issueByNumber(ctx.forge, n);
}

function findIssueById(forge, id) {
  return (forge.issues || []).filter(function (i) { return i.id === id; })[0] || null;
}

function findPullById(forge, id) {
  return (forge.pulls || []).filter(function (p) { return p.id === id; })[0] || null;
}

function findTargetById(forge, id) {
  return findIssueById(forge, id) || findPullById(forge, id) ||
    (function () {
      var found = null;
      (forge.issues || []).concat(forge.pulls || []).forEach(function (t) {
        (t.comments || []).forEach(function (c) { if (c.id === id) found = c; });
      });
      return found;
    })();
}

function findCommentHolder(forge, id) {
  var holder = null;
  (forge.issues || []).concat(forge.pulls || []).forEach(function (t) {
    (t.comments || []).forEach(function (c) { if (c.id === id) holder = { target: t, comment: c }; });
  });
  return holder;
}

/* ------------------------------------------------------- confirm dialog */

export function confirmDialog(title, body, onConfirm, options) {
  var opts = options || {};
  openModal({
    title: title,
    icon: opts.icon || 'alert',
    body: '<p class="fs-13">' + esc(body) + '</p>' +
      (opts.confirmText
        ? '<div class="form-group mt-4"><label class="form-label" for="confirmText">Type <span class="mono">' + esc(opts.confirmText) + '</span> to confirm</label>' +
          '<input type="text" class="input mono" id="confirmText" data-autofocus></div>'
        : ''),
    actions: [
      { label: opts.confirmLabel || 'Confirm', danger: true, id: 'confirmGo' },
      { label: 'Cancel' },
    ],
    onMount: function (root) {
      var go = root.querySelector('#confirmGo');
      if (!go) return;
      go.addEventListener('click', function () {
        var result = onConfirm(root);
        if (result === false) return;
        closeModal();
      });
    },
  });
}

/* ------------------------------------------------------------- forge forms */

function createForgeFromForm() {
  if (!ME) return signIn();
  var err = $('#nrErr');
  var name = ($('#nrName').value || '').trim();
  if (!name) { if (err) err.textContent = 'A forge needs a name.'; return; }
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) { if (err) err.textContent = 'Use letters, numbers, hyphens, underscores and dots.'; return; }
  var taken = (ME.forges || []).some(function (r) { return r.name.toLowerCase() === name.toLowerCase(); });
  if (taken) { if (err) err.textContent = 'You already have a forge named ' + name + '.'; return; }

  var ownerName = ME.username;
  var ownerSelect = $('#nrOwner');
  var org = null;
  if (ownerSelect && ownerSelect.value.indexOf('org:') === 0) {
    var slug = ownerSelect.value.slice(4);
    org = orgBySlug(slug);
    if (!org) { if (err) err.textContent = 'That organization does not exist.'; return; }
    ownerName = slug;
  }

  var forge = createForge(
    name,
    ($('#nrDesc').value || '').trim(),
    $('#nrVis') ? $('#nrVis').value : 'public',
    $('#nrLang') ? $('#nrLang').value : 'JavaScript',
    $('#nrReadme') ? $('#nrReadme').checked : true,
    ownerName
  );

  if ($('#nrRedignore') && $('#nrRedignore').checked && !forge.files.some(function (f) { return f.name === '.redignore'; })) {
    forge.files.push({ name: '.redignore', content: 'node_modules/\n.env\n.DS_Store\n*.log\ndist/\nbuild/', commitMsg: 'Initial commit', commitTime: Date.now(), sha: forge.commits[0] ? forge.commits[0].sha : '', author: ownerName });
  }
  if ($('#nrTopics')) {
    forge.topics = ($('#nrTopics').value || '').split(',').map(function (t) { return t.trim().toLowerCase(); }).filter(Boolean);
  }
  if ($('#nrLicense')) {
    forge.license = $('#nrLicense').value || '';
  }

  if (org) org.forges.push(forge);
  else ME.forges.unshift(forge);

  ensureForgeShape(forge, ownerName);
  saveDB();
  logActivity('forge.create', ownerName + '/' + forge.name);
  triggerRuns(forge, 'push', { branch: forge.defaultBranch, title: 'Initial commit' });
  toast('Forge ' + forge.name + ' created', 'success');
  navigate('/' + ownerName + '/' + forge.name);
}

function importFilesFromForm() {
  if (!ME) return signIn();
  var err = $('#importErr');
  var name = ($('#nrName').value || '').trim();
  if (!name) { if (err) err.textContent = 'A forge needs a name.'; return; }
  if (!window._importFiles || !window._importFiles.length) {
    if (err) err.textContent = 'Choose at least one file to import.';
    return;
  }
  var forge = createForge(name, ($('#nrDesc').value || '').trim(),
    $('#nrVis') ? $('#nrVis').value : 'public', 'Other', false, ME.username);
  var sha = forge.commits.length ? forge.commits[0].sha : '';
  window._importFiles.forEach(function (entry) {
    forge.files.push({
      name: entry.name, content: entry.content,
      commitMsg: 'Import ' + entry.name, commitTime: Date.now(),
      sha: sha, author: ME.username,
    });
  });
  ensureForgeShape(forge, ME.username);
  ME.forges.unshift(forge);
  saveDB();
  logActivity('forge.create', ME.username + '/' + forge.name + ' (imported ' + forge.files.length + ' files)');
  triggerRuns(forge, 'push', { branch: forge.defaultBranch, title: 'Import ' + forge.files.length + ' files' });
  toast('Imported ' + forge.files.length + ' files into ' + forge.name, 'success');
  window._importFiles = [];
  navigate('/' + ME.username + '/' + forge.name);
}

function saveFileFromEditor(ctx) {
  if (!ctx.forge || !ME) return signIn();
  var err = $('#fileErr');
  var path = ($('#filePathInput').value || '').trim();
  var content = $('#fileContentInput').value || '';
  var message = ($('#fileCommitMessage').value || '').trim();
  var original = $('#saveFileBtn').getAttribute('data-original');

  if (!path) { if (err) err.textContent = 'A file needs a path.'; return; }
  if (/[<>:"|?*]/.test(path)) { if (err) err.textContent = 'Paths cannot contain < > : " | ? *'; return; }
  if (original && original !== path) renameFile(ctx.forge, original, path);
  saveFile(ctx.forge, path, content, message || (original ? 'Update ' + path : 'Create ' + path));

  var target = $('input[name="commitTarget"]:checked');
  if (target && target.value === 'branch') {
    var branchName = ($('#newBranchName').value || '').trim() || (path.split('/').pop() + '-branch');
    createBranch(ctx.forge, branchName, ctx.branch);
    toast('Committed to new branch ' + branchName, 'success');
  } else {
    toast('Committed to ' + ctx.branch, 'success');
  }
  triggerRuns(ctx.forge, 'push', { branch: ctx.branch, title: message || path });
  navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/blob/' + encodeURIComponent(ctx.branch) + '/' + path);
}

function createIssueFromForm(ctx) {
  if (!ME || !ctx.forge) return signIn();
  var err = $('#niErr');
  var title = ($('#niTitle').value || '').trim();
  if (!title) { if (err) err.textContent = 'A title is required.'; return; }
  var labels = $$('#niLabels option').filter(function (o) { return o.selected; }).map(function (o) { return o.value; });
  var assignees = $$('#niAssignees option').filter(function (o) { return o.selected; }).map(function (o) { return o.value; });
  var issue = createIssue(ctx.user, ctx.forge, {
    title: title,
    body: $('#niBody').value || '',
    labels: labels,
    assignees: assignees,
    milestone: $('#niMilestone') ? ($('#niMilestone').value || null) : null,
  });
  toast('Issue #' + issue.number + ' opened', 'success');
  navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/issues/' + issue.number);
}

function createPullFromForm(ctx) {
  if (!ME || !ctx.forge) return signIn();
  var err = $('#prErr');
  var base = $('#prBase').value;
  var head = $('#prHead').value;
  if (base === head) { if (err) err.textContent = 'Base and head must be different branches.'; return; }
  var pr = createPull(ctx.user, ctx.forge, {
    title: ($('#prTitle').value || '').trim() || head + ' → ' + base,
    body: $('#prBody').value || '',
    base: base, head: head,
    draft: $('#prDraft') ? $('#prDraft').checked : false,
  });
  triggerRuns(ctx.forge, 'pull_request', { branch: head, title: pr.title, actor: ME.username });
  toast('Pull request #' + pr.number + ' opened', 'success');
  navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/pull/' + pr.number);
}

function saveForgeSettings(ctx) {
  var forge = ctx.forge;
  forge.desc = ($('#forgeDescInput').value || '').trim();
  forge.website = ($('#forgeSiteInput').value || '').trim();
  forge.topics = ($('#forgeTopicsInput').value || '').split(',').map(function (t) { return t.trim().toLowerCase().replace(/\s+/g, '-'); }).filter(Boolean);
  forge.visibility = $('#forgeVisibilityInput') ? $('#forgeVisibilityInput').value : forge.visibility;
  $$('.featureToggle').forEach(function (input) {
    forge[input.getAttribute('data-key') + 'Enabled'] = input.checked;
  });
  var prMap = { mergeCommit: 'allowMerge', squash: 'allowSquash', rebase: 'allowRebase', deleteBranch: 'deleteBranchOnMerge' };
  $$('.prToggle').forEach(function (input) { forge[prMap[input.getAttribute('data-key')]] = input.checked; });
  forge.updated = Date.now();
  saveDB();
  logActivity('forge.update', ctx.user.username + '/' + forge.name);
  toast('Forge settings saved', 'success');
  render();
}

/* ------------------------------------------------------------- issue misc */

function openEditItemModal(ctx, issue) {
  openModal({
    title: 'Edit issue #' + issue.number,
    icon: 'issue',
    wide: true,
    body: '<div class="form-group"><label class="form-label" for="editTitle">Title</label>' +
      '<input type="text" class="input" id="editTitle" value="' + esc(issue.title) + '"></div>' +
      '<div class="form-group"><label class="form-label" for="editBody">Body</label>' +
      '<textarea class="input" id="editBody" rows="10">' + esc(issue.body || '') + '</textarea></div>',
    actions: [{ label: 'Save', primary: true, id: 'editSave' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#editSave').addEventListener('click', function () {
        updateIssue(issue, {
          title: (root.querySelector('#editTitle').value || '').trim() || issue.title,
          body: root.querySelector('#editBody').value || '',
        });
        closeModal();
        toast('Issue updated', 'success');
        render();
      });
    },
  });
}

function openReactionMenu(target, ctx) {
  var kinds = ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'];
  openModal({
    title: 'Add a reaction',
    icon: 'emojiSmile',
    body: '<div class="reaction-picker">' + kinds.map(function (k) {
      return '<button class="reaction pick" type="button" data-reaction="' + esc(k) + '">' + esc(k) + '</button>';
    }).join('') + '</div>',
    actions: [{ label: 'Close' }],
    onMount: function (root) {
      $$('.reaction.pick', root).forEach(function (btn) {
        btn.addEventListener('click', function () {
          toggleReaction(target, btn.getAttribute('data-reaction'), ME.username);
          closeModal();
          render();
        });
      });
    },
  });
}

function openReviewModal(ctx, pr, state) {
  openModal({
    title: state === 'approved' ? 'Approve this pull request' : state === 'changes' ? 'Request changes' : 'Leave a review comment',
    icon: 'redPR',
    body: '<div class="form-group"><label class="form-label" for="reviewBody">Review summary</label>' +
      '<textarea class="input" id="reviewBody" rows="5" placeholder="What should the author know?"></textarea></div>',
    actions: [{ label: 'Submit review', primary: true, id: 'reviewGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#reviewGo').addEventListener('click', function () {
        addReview(ctx.user, ctx.forge, pr, state, root.querySelector('#reviewBody').value || '');
        closeModal();
        toast('Review submitted', 'success');
        render();
      });
    },
  });
}

function openLabelModal(ctx) {
  openModal({
    title: 'New label',
    icon: 'tag',
    body: '<div class="form-group"><label class="form-label" for="labelName">Name</label>' +
      '<input type="text" class="input" id="labelName" data-autofocus placeholder="performance"></div>' +
      '<div class="form-group"><label class="form-label" for="labelColor">Colour</label>' +
      '<select class="input" id="labelColor">' + ['red', 'green', 'blue', 'purple', 'orange', 'yellow', 'grey'].map(function (c) {
        return '<option value="' + c + '">' + c + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-group"><label class="form-label" for="labelDesc">Description</label>' +
      '<input type="text" class="input" id="labelDesc"></div>',
    actions: [{ label: 'Create label', primary: true, id: 'labelGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#labelGo').addEventListener('click', function () {
        var name = (root.querySelector('#labelName').value || '').trim();
        if (!name) return toast('A label needs a name', 'error');
        saveLabel(ctx.forge, {
          name: name,
          color: root.querySelector('#labelColor').value,
          description: (root.querySelector('#labelDesc').value || '').trim(),
        });
        closeModal();
        toast('Label created', 'success');
        render();
      });
    },
  });
}

function openMilestoneModal(ctx) {
  openModal({
    title: 'New milestone',
    icon: 'milestone',
    body: '<div class="form-group"><label class="form-label" for="msTitle">Title</label>' +
      '<input type="text" class="input" id="msTitle" data-autofocus placeholder="1.0"></div>' +
      '<div class="form-group"><label class="form-label" for="msDesc">Description</label>' +
      '<textarea class="input" id="msDesc" rows="3"></textarea></div>' +
      '<div class="form-group"><label class="form-label" for="msDue">Due date</label>' +
      '<input type="date" class="input" id="msDue"></div>',
    actions: [{ label: 'Create milestone', primary: true, id: 'msGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#msGo').addEventListener('click', function () {
        var title = (root.querySelector('#msTitle').value || '').trim();
        if (!title) return toast('A milestone needs a title', 'error');
        saveMilestone(ctx.forge, {
          title: title,
          description: (root.querySelector('#msDesc').value || '').trim(),
          due: root.querySelector('#msDue').value ? new Date(root.querySelector('#msDue').value).getTime() : null,
        });
        closeModal();
        toast('Milestone created', 'success');
        render();
      });
    },
  });
}

function openForkModal(user, forge) {
  var branches = forge.branches || [forge.defaultBranch];
  openModal({
    title: 'Fork ' + user.username + '/' + forge.name,
    icon: 'fork',
    body: '<p class="muted fs-13 mb-4">The files, history, branches and open issues are copied into your account. Stars and forks are counted from real records, so the copy starts at zero.</p>' +
      '<div class="form-group"><label class="form-label" for="forkBranch">Copy branch</label>' +
      '<select class="input" id="forkBranch"><option value="all">All ' + branches.length + ' branches</option>' +
      branches.map(function (b) { return '<option value="' + esc(b) + '">Only ' + esc(b) + '</option>'; }).join('') + '</select></div>',
    actions: [{ label: 'Create fork', primary: true, id: 'forkGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#forkGo').addEventListener('click', function () {
        var copy = forkForge(forge);
        if (!copy) { toast('You already forked this forge', 'info'); closeModal(); return; }
        var choice = root.querySelector('#forkBranch').value;
        if (choice !== 'all') {
          copy.branches = [choice];
          copy.defaultBranch = choice;
        }
        copy.forkedFrom = { owner: user.username, forge: forge.name, id: forge.id };
        saveDB();
        logActivity('forge.fork', user.username + '/' + forge.name);
        closeModal();
        toast('Forked to ' + ME.username + '/' + copy.name, 'success');
        navigate('/' + ME.username + '/' + copy.name);
      });
    },
  });
}

function openBranchCreateModal(ctx) {
  var branches = ctx.forge.branches || [ctx.forge.defaultBranch];
  openModal({
    title: 'Create a branch',
    icon: 'redBranch',
    body: '<div class="form-group"><label class="form-label" for="branchName">Branch name</label>' +
      '<input type="text" class="input mono" id="branchName" data-autofocus placeholder="feature/my-change"></div>' +
      '<div class="form-group"><label class="form-label" for="branchFrom">From</label>' +
      '<select class="input" id="branchFrom">' + branches.map(function (b) {
        return '<option value="' + esc(b) + '"' + (b === ctx.forge.defaultBranch ? ' selected' : '') + '>' + esc(b) + '</option>';
      }).join('') + '</select></div>',
    actions: [{ label: 'Create branch', primary: true, id: 'branchGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#branchGo').addEventListener('click', function () {
        var name = (root.querySelector('#branchName').value || '').trim();
        if (!name) return toast('Enter a branch name', 'error');
        if (!createBranch(ctx.forge, name, root.querySelector('#branchFrom').value)) {
          return toast('That branch already exists', 'error');
        }
        closeModal();
        toast('Branch ' + name + ' created', 'success');
        render();
      });
    },
  });
}

function openWorkflowModal(ctx) {
  var template = 'name: RedGet CI\non: [push, pull_request, workflow_dispatch]\njobs:\n  build:\n    runs-on: redget-runner\n    steps:\n      - name: Check out forge\n      - name: Install dependencies\n        run: npm ci\n      - name: Lint\n        run: npm run lint\n      - name: Test\n        run: npm test\n';
  openModal({
    title: 'Set up a workflow',
    icon: 'play',
    wide: true,
    body: '<p class="muted fs-13 mb-4">The file is stored in the forge and a run is triggered immediately.</p>' +
      '<div class="form-group"><label class="form-label" for="wfName">Workflow file name</label>' +
      '<input type="text" class="input mono" id="wfName" value="ci.yml"></div>' +
      '<div class="form-group"><label class="form-label" for="wfBody">Workflow</label>' +
      '<textarea class="input mono editor-area" id="wfBody" rows="14">' + esc(template) + '</textarea></div>',
    actions: [{ label: 'Save and run', primary: true, id: 'wfGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#wfGo').addEventListener('click', function () {
        var name = (root.querySelector('#wfName').value || '').trim();
        if (!name) return toast('Enter a file name', 'error');
        if (!/\.ya?ml$/i.test(name)) name += '.yml';
        var path = '.redget/workflows/' + name.replace(/^.*\//, '');
        saveFile(ctx.forge, path, root.querySelector('#wfBody').value || '', 'Add ' + path);
        var workflows = syncWorkflows(ctx.forge);
        var created = workflows.filter(function (w) { return w.id === name.replace(/\.ya?ml$/i, ''); })[0];
        if (created) triggerRuns(ctx.forge, 'push', { branch: ctx.branch, title: 'Add ' + path });
        closeModal();
        toast(created ? 'Workflow saved and run' : 'Workflow saved but could not be parsed', created ? 'success' : 'error');
        navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/actions');
      });
    },
  });
}

function openAdvisoryModal(ctx) {
  openModal({
    title: 'Draft a security advisory',
    icon: 'megaphone',
    wide: true,
    body: '<div class="form-group"><label class="form-label" for="advTitle">Title</label>' +
      '<input type="text" class="input" id="advTitle" data-autofocus placeholder="Path traversal in the file reader"></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label" for="advSeverity">Severity</label>' +
      '<select class="input" id="advSeverity">' + ['critical', 'high', 'medium', 'low', 'note'].map(function (s) {
        return '<option value="' + s + '"' + (s === 'medium' ? ' selected' : '') + '>' + s + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-group"><label class="form-label" for="advCve">CVE id (optional)</label>' +
      '<input type="text" class="input" id="advCve" placeholder="CVE-2026-0000"></div></div>' +
      '<div class="form-group"><label class="form-label" for="advSummary">Summary</label>' +
      '<input type="text" class="input" id="advSummary"></div>' +
      '<div class="form-group"><label class="form-label" for="advDescription">Description</label>' +
      '<textarea class="input" id="advDescription" rows="6"></textarea></div>' +
      '<label class="checkbox"><input type="checkbox" id="advDraft" checked> Save as draft</label>',
    actions: [{ label: 'Save advisory', primary: true, id: 'advGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#advGo').addEventListener('click', function () {
        var title = (root.querySelector('#advTitle').value || '').trim();
        if (!title) return toast('A title is required', 'error');
        createAdvisory(ctx.forge, {
          title: title,
          severity: root.querySelector('#advSeverity').value,
          cve: (root.querySelector('#advCve').value || '').trim() || null,
          summary: (root.querySelector('#advSummary').value || '').trim(),
          description: root.querySelector('#advDescription').value || '',
          draft: root.querySelector('#advDraft').checked,
        });
        closeModal();
        toast('Advisory saved', 'success');
        render();
      });
    },
  });
}

/* ---------------------------------------------------------------- projects */

function openProjectModal(owner, ownerKey) {
  openModal({
    title: 'New project',
    icon: 'project',
    body: '<div class="form-group"><label class="form-label" for="mpTitle">Title</label>' +
      '<input type="text" class="input" id="mpTitle" data-autofocus placeholder="Release plan"></div>' +
      '<div class="form-group"><label class="form-label" for="mpDescription">Description</label>' +
      '<textarea class="input" id="mpDescription" rows="3"></textarea></div>' +
      '<div class="form-group"><label class="form-label">Layout</label>' +
      Object.keys(PROJECT_LAYOUTS).map(function (key) {
        return '<label class="radio"><input type="radio" name="mpLayout" value="' + key + '"' + (key === 'board' ? ' checked' : '') + '> ' +
          esc(PROJECT_LAYOUTS[key].label) + ' — ' + esc(PROJECT_LAYOUTS[key].description) + '</label>';
      }).join('') + '</div>' +
      '<div class="form-group"><label class="form-label" for="mpColumns">Columns</label>' +
      '<input type="text" class="input" id="mpColumns" value="' + esc(DEFAULT_COLUMNS.join(', ')) + '"></div>',
    actions: [{ label: 'Create project', primary: true, id: 'mpGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#mpGo').addEventListener('click', function () {
        var title = (root.querySelector('#mpTitle').value || '').trim();
        if (!title) return toast('A project needs a title', 'error');
        var layout = root.querySelector('input[name="mpLayout"]:checked');
        var project = createProject({
          title: title,
          description: (root.querySelector('#mpDescription').value || '').trim(),
          layout: layout ? layout.value : 'board',
          owner: owner,
          ownerKey: ownerKey,
          columns: (root.querySelector('#mpColumns').value || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean),
        });
        closeModal();
        toast('Project created', 'success');
        navigate('/projects/' + project.id);
      });
    },
  });
}

function createProjectFromForm() {
  if (!ME) return signIn();
  var err = $('#npErr');
  var title = ($('#npTitle').value || '').trim();
  if (!title) { if (err) err.textContent = 'A project needs a title.'; return; }
  var ownerValue = $('#npOwner').value;
  var parts = ownerValue.split(':');
  var layout = document.querySelector('input[name="npLayout"]:checked');
  var project = createProject({
    title: title,
    description: ($('#npDescription').value || '').trim(),
    layout: layout ? layout.value : 'board',
    owner: parts[0],
    ownerKey: parts.slice(1).join(':'),
    columns: ($('#npColumns').value || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean),
  });
  toast('Project created', 'success');
  if (project.owner === 'forge') navigate('/' + project.ownerKey + '/projects/' + project.id);
  else navigate('/projects/' + project.id);
}

function openColumnModal(projectId) {
  var project = projectById(projectId);
  if (!project) return;
  openModal({
    title: 'Add a column',
    icon: 'rows',
    body: '<div class="form-group"><label class="form-label" for="colName">Column name</label>' +
      '<input type="text" class="input" id="colName" data-autofocus placeholder="Blocked"></div>',
    actions: [{ label: 'Add column', primary: true, id: 'colGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#colGo').addEventListener('click', function () {
        var name = (root.querySelector('#colName').value || '').trim();
        if (!name) return toast('Enter a column name', 'error');
        addColumn(project, name);
        closeModal();
        render();
      });
    },
  });
}

function openItemModal(projectId, columnId) {
  var project = projectById(projectId);
  if (!project) return;
  var refs = projectItemRefs(project);
  openModal({
    title: 'Add an item',
    icon: 'tasklist',
    wide: true,
    body: '<div class="form-group"><label class="form-label" for="itemTitle">Title</label>' +
      '<input type="text" class="input" id="itemTitle" data-autofocus placeholder="Ship the release page"></div>' +
      '<div class="form-group"><label class="form-label" for="itemBody">Notes</label>' +
      '<textarea class="input" id="itemBody" rows="3"></textarea></div>' +
      '<div class="form-row">' +
      '<div class="form-group"><label class="form-label" for="itemRef">Link an issue or pull request</label>' +
      '<select class="input" id="itemRef"><option value="">None</option>' + refs.map(function (r) {
        return '<option value="' + esc(r.ref) + '" data-kind="' + esc(r.kind) + '">' + esc(r.label) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-group"><label class="form-label" for="itemDue">Due date</label>' +
      '<input type="date" class="input" id="itemDue"></div></div>' +
      '<div class="form-group"><label class="form-label" for="itemAssignees">Assignees (comma separated)</label>' +
      '<input type="text" class="input" id="itemAssignees"></div>',
    actions: [{ label: 'Add item', primary: true, id: 'itemGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#itemGo').addEventListener('click', function () {
        var select = root.querySelector('#itemRef');
        var title = (root.querySelector('#itemTitle').value || '').trim();
        if (select.value) {
          var option = select.querySelector('option[value="' + select.value.replace(/"/g, '\\"') + '"]');
          addItem(project, {
            columnId: columnId,
            title: title || select.value,
            kind: option ? option.getAttribute('data-kind') : 'issue',
            ref: select.value,
            due: root.querySelector('#itemDue').value ? new Date(root.querySelector('#itemDue').value).getTime() : null,
            assignees: (root.querySelector('#itemAssignees').value || '').split(',').map(function (a) { return a.trim(); }).filter(Boolean),
          });
        } else {
          if (!title) return toast('Enter a title or pick an issue', 'error');
          addItem(project, {
            columnId: columnId,
            title: title,
            body: root.querySelector('#itemBody').value || '',
            due: root.querySelector('#itemDue').value ? new Date(root.querySelector('#itemDue').value).getTime() : null,
            assignees: (root.querySelector('#itemAssignees').value || '').split(',').map(function (a) { return a.trim(); }).filter(Boolean),
          });
        }
        closeModal();
        toast('Item added', 'success');
        render();
      });
    },
  });
}

/** Issues and pull requests that can be attached to this project. */
function projectItemRefs(project) {
  var refs = [];
  var scope = [];
  if (project.owner === 'forge') {
    var found = findForge(project.ownerKey.split('/')[0], project.ownerKey.split('/')[1]);
    if (found) scope.push({ owner: project.ownerKey, forge: found.forge });
  } else if (project.owner === 'user') {
    var account = getUserByUsername(project.ownerKey);
    if (account) (account.forges || []).forEach(function (r) { scope.push({ owner: project.ownerKey + '/' + r.name, forge: r }); });
  } else {
    var org = orgBySlug(project.ownerKey);
    if (org) (org.forges || []).forEach(function (r) { scope.push({ owner: project.ownerKey + '/' + r.name, forge: r }); });
  }
  scope.forEach(function (entry) {
    (entry.forge.issues || []).forEach(function (i) {
      refs.push({ ref: entry.owner + '#' + i.number, kind: 'issue', label: 'Issue ' + entry.owner + '#' + i.number + ' — ' + i.title });
    });
    (entry.forge.pulls || []).forEach(function (p) {
      refs.push({ ref: entry.owner + '#' + p.number, kind: 'pull', label: 'PR ' + entry.owner + '#' + p.number + ' — ' + p.title });
    });
  });
  return refs.slice(0, 200);
}

/* -------------------------------------------------------------------- wiki */

function createWikiPageFromForm(ctx) {
  var title = ($('#wikiNewTitle').value || '').trim();
  if (!title) return toast('A page needs a title', 'error');
  var page = createWikiPage(ctx.forge, {
    title: title,
    body: $('#wikiNewBody').value || '',
    format: $('#wikiNewFormat') ? $('#wikiNewFormat').value : 'markdown',
    message: ($('#wikiNewMessage').value || '').trim() || 'Created ' + title,
  });
  toast('Page created', 'success');
  navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/wiki/' + encodeURIComponent(page.slug));
}

function saveWikiPage(ctx, pageId) {
  var page = (ctx.forge.wiki || []).filter(function (p) { return p.id === pageId; })[0];
  if (!page) return;
  updateWikiPage(ctx.forge, page, {
    title: ($('#wikiTitle').value || '').trim() || page.title,
    body: $('#wikiBody').value || '',
    message: ($('#wikiMessage').value || '').trim() || 'Edited ' + page.title,
  });
  toast('Page saved', 'success');
  navigate('/' + ctx.user.username + '/' + ctx.forge.name + '/wiki/' + encodeURIComponent(page.slug));
}

/* ------------------------------------------------------------------- gists */

function gistFilesFromForm() {
  var files = [];
  $$('.gist-file').forEach(function (wrapper) {
    var name = (wrapper.querySelector('.gistFileName').value || '').trim();
    var content = wrapper.querySelector('.gistFileContent').value || '';
    if (!name && !content.trim()) return;
    files.push({ name: name || 'untitled.txt', content: content });
  });
  return files;
}

function gistVisibility() {
  var checked = document.querySelector('input[name="gistVisibility"]:checked');
  return checked ? checked.value === 'public' : true;
}

function addGistFileField() {
  var wrap = $('#gistFiles');
  if (!wrap) return;
  var index = wrap.querySelectorAll('.gist-file').length;
  var div = document.createElement('div');
  div.className = 'gist-file';
  div.setAttribute('data-index', String(index));
  div.innerHTML = '<div class="form-row">' +
      '<input type="text" class="input mono gistFileName" placeholder="snippet.js" aria-label="File name ' + (index + 1) + '">' +
      '<span class="muted fs-12 gistFileLang">Text</span>' +
      '<button class="btn xs danger removeGistFileBtn" type="button" aria-label="Remove file">' + ic('trash', 11) + '</button>' +
    '</div>' +
    '<textarea class="input mono editor-area gistFileContent" rows="12" spellcheck="false" aria-label="File contents ' + (index + 1) + '"></textarea>';
  wrap.appendChild(div);
  var nameField = div.querySelector('.gistFileName');
  nameField.addEventListener('input', function () {
    div.querySelector('.gistFileLang').textContent = guessLanguage(nameField.value);
  });
  nameField.focus();
}

function guessLanguage(filename) {
  var ext = String(filename || '').split('.').pop().toLowerCase();
  var map = { js: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', json: 'JSON', md: 'Markdown', py: 'Python',
    rb: 'Ruby', go: 'Go', rs: 'Rust', html: 'HTML', css: 'CSS', sh: 'Shell', yml: 'YAML', yaml: 'YAML', sql: 'SQL' };
  return map[ext] || 'Text';
}

function createGistFromForm() {
  if (!ME) return signIn();
  var err = $('#gistErr');
  var files = gistFilesFromForm();
  if (!files.length) { if (err) err.textContent = 'Add at least one file with a name.'; return; }
  if (files.some(function (f) { return !f.name; })) { if (err) err.textContent = 'Every file needs a name.'; return; }
  var gist = createGist({
    description: ($('#gistDescription').value || '').trim(),
    isPublic: gistVisibility(),
    files: files,
  });
  toast('Gist created', 'success');
  navigate('/gists/' + gist.id);
}

/* -------------------------------------------------------------- codespaces */

function createCodespaceFromForm() {
  if (!ME) return signIn();
  var err = $('#csErr');
  var forgeKey = $('#csForge').value;
  var parts = forgeKey.split('/');
  var found = findForge(parts[0], parts.slice(1).join('/'));
  if (!found) { if (err) err.textContent = 'That forge does not exist.'; return; }
  var template = document.querySelector('input[name="csTemplate"]:checked');
  var codespace = createCodespace({
    forgeOwner: found.user.username,
    forgeName: found.forge.name,
    branch: $('#csBranch').value || found.forge.defaultBranch,
    template: template ? template.value : 'node',
    name: ($('#csName').value || '').trim(),
    idleMinutes: Number($('#csIdle').value) || 30,
    region: $('#csRegion').value,
  });
  toast('Codespace created', 'success');
  navigate('/codespaces/' + codespace.id);
}

function wireTerminal(input) {
  input._wired = true;
  var form = $('#terminalForm');
  if (form && !form._wired) {
    form._wired = true;
    form.addEventListener('submit', function (e) { e.preventDefault(); runTerminalCommand(context()); });
  }
}

function runTerminalCommand(ctx) {
  var input = $('#terminalInput');
  var body = $('#terminalBody');
  if (!input || !body || !ctx.codespace) return;
  var command = input.value;
  var found = findForge(ctx.codespace.forgeOwner, ctx.codespace.forgeName);
  var prompt = ctx.codespace.owner + '@' + ctx.codespace.name + ':~$';

  var cmdLine = document.createElement('div');
  cmdLine.className = 'terminal-line cmd';
  cmdLine.textContent = prompt + ' ' + command;
  body.appendChild(cmdLine);

  if (ctx.codespace.status !== 'available') {
    var stopped = document.createElement('div');
    stopped.className = 'terminal-line error';
    stopped.textContent = 'This codespace is stopped. Start it from the header to run commands.';
    body.appendChild(stopped);
  } else if (!found) {
    var missing = document.createElement('div');
    missing.className = 'terminal-line error';
    missing.textContent = 'The forge this codespace pointed at no longer exists.';
    body.appendChild(missing);
  } else {
    var result = runCommand(ctx.codespace, found.forge, command);
    if (result.clear) body.innerHTML = '';
    (result.output || []).forEach(function (line) {
      var el = document.createElement('div');
      el.className = 'terminal-line' + (result.status === 'error' ? ' error' : '');
      el.textContent = line;
      body.appendChild(el);
    });
  }
  ctx.codespace.lastUsed = Date.now();
  saveDB();
  input.value = '';
  body.scrollTop = body.scrollHeight;
}

/* ------------------------------------------------------------- marketplace */

function copilotAnswer(question) {
  var answerBox = $('#copilotAnswer');
  if (!answerBox) return;
  var select = $('#copilotForge');
  var key = select && select.value ? select.value.split('/') : [];
  var found = key.length >= 2 ? findForge(key[0], key.slice(1).join('/')) : null;
  var text = String(question || '').trim();
  var output = [];

  if (!found) {
    output.push('Create a forge first — Copilot reads the code you stored.');
  } else if (text === 'copilot-summary' || /summar/i.test(text)) {
    var files = found.forge.files || [];
    var langs = {};
    files.forEach(function (f) {
      var ext = String(f.name.split('.').pop() || '').toLowerCase();
      langs[ext] = (langs[ext] || 0) + 1;
    });
    var top = Object.keys(langs).sort(function (a, b) { return langs[b] - langs[a]; }).slice(0, 4);
    output.push(found.user.username + '/' + found.forge.name + ' holds ' + files.length + ' file' + (files.length === 1 ? '' : 's') +
      ' on branch ' + found.forge.defaultBranch + '.');
    output.push('Extensions present: ' + (top.length ? top.map(function (t) { return '.' + t + ' (' + langs[t] + ')'; }).join(', ') : 'none') + '.');
    output.push('It has ' + (found.forge.issues || []).length + ' issue(s), ' + (found.forge.pulls || []).length +
      ' pull request(s), ' + (found.forge.releases || []).length + ' release(s) and ' +
      ((found.forge.actions && found.forge.actions.runs) || []).length + ' workflow run(s).');
  } else if (text === 'copilot-largest' || /largest|biggest/i.test(text)) {
    var biggest = (found.forge.files || []).slice().sort(function (a, b) {
      return String(b.content || '').length - String(a.content || '').length;
    })[0];
    output.push(biggest ? 'Largest file: ' + biggest.name + ' (' + String(biggest.content || '').split('\n').length + ' lines, ' +
      String(biggest.content || '').length + ' bytes).' : 'The forge has no files.');
  } else if (text === 'copilot-functions' || /function/i.test(text)) {
    var names = [];
    (found.forge.files || []).forEach(function (f) {
      var matches = String(f.content || '').match(/function\s+([A-Za-z0-9_$]+)|([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/g) || [];
      matches.slice(0, 12).forEach(function (m) { names.push(f.name + ': ' + m.trim().slice(0, 60)); });
    });
    output.push(names.length ? 'Definitions found:' : 'No function-like definitions found in the stored files.');
    names.slice(0, 15).forEach(function (n) { output.push('  ' + n); });
  } else if (text === 'copilot-readme' || /readme/i.test(text)) {
    var has = (found.forge.files || []).some(function (f) { return /^readme/i.test(f.name); });
    output.push(has ? 'A README already exists at the root of this forge.' : 'There is no README yet.');
    output.push('A useful README for this forge would cover: what it does, how to run it (' +
      (found.forge.files || []).length + ' files, primary language ' + (found.forge.language || 'unknown') + '), and how to contribute.');
  } else if (!text) {
    output.push('Ask a question, or pick one of the suggestions below.');
  } else {
    var hits = [];
    var needle = text.toLowerCase();
    (found.forge.files || []).forEach(function (f) {
      String(f.content || '').split('\n').forEach(function (line, i) {
        if (line.toLowerCase().indexOf(needle) !== -1 && hits.length < 8) {
          hits.push(f.name + ':' + (i + 1) + ': ' + line.trim().slice(0, 120));
        }
      });
    });
    output.push(hits.length ? 'Matches for “' + text + '” in ' + found.user.username + '/' + found.forge.name + ':' :
      'No file in ' + found.user.username + '/' + found.forge.name + ' contains “' + text + '”.');
    hits.forEach(function (h) { output.push('  ' + h); });
  }

  answerBox.hidden = false;
  answerBox.innerHTML = '<div class="copilot-head">' + ic('copilot', 14) + ' RedGet Copilot · answered locally from your files</div>' +
    '<pre class="copilot-text">' + esc(output.join('\n')) + '</pre>';
}

/* ----------------------------------------------------------- organizations */

function createOrgFromForm() {
  if (!ME) return signIn();
  var err = $('#orgErr');
  var name = ($('#orgName').value || '').trim();
  var slug = ($('#orgSlug').value || '').trim().toLowerCase();
  if (!name) { if (err) err.textContent = 'An organization needs a name.'; return; }
  var nameError = validateOrgName(name);
  if (nameError && !slug) { if (err) err.textContent = nameError; return; }
  if (!slug) slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slugAvailable(slug)) { if (err) err.textContent = 'That slug is already taken.'; return; }
  var org = createOrg({
    name: name,
    slug: slug,
    description: ($('#orgDescription').value || '').trim(),
    location: ($('#orgLocation').value || '').trim(),
    website: ($('#orgWebsite').value || '').trim(),
    defaultPermission: $('#orgPermission').value,
    enterprise: ($('#orgEnterprise').value || '').trim(),
  });
  toast('Organization ' + (org.name || org.slug) + ' created', 'success');
  navigate('/orgs/' + org.slug);
}

function openOrgMemberModal(slug) {
  var org = orgBySlug(slug);
  if (!org) return;
  var candidates = Object.keys(DB.users).map(function (k) { return DB.users[k]; })
    .filter(function (u) { return !org.members.some(function (m) { return m.username === u.username; }); });
  openModal({
    title: 'Add a member to ' + (org.name || org.slug),
    icon: 'people',
    body: candidates.length
      ? '<div class="form-group"><label class="form-label" for="memberSelect">Account</label>' +
        '<select class="input" id="memberSelect">' + candidates.map(function (u) {
          return '<option value="' + esc(u.username) + '">' + esc(u.username) + '</option>';
        }).join('') + '</select></div>' +
        '<div class="form-group"><label class="form-label" for="memberRole">Role</label>' +
        '<select class="input" id="memberRole">' + ['read', 'write', 'admin'].map(function (r) {
          return '<option value="' + r + '"' + (r === (org.settings || {}).defaultPermission ? ' selected' : '') + '>' + r + '</option>';
        }).join('') + '</select></div>'
      : '<p class="muted fs-13">Every account in this browser is already a member.</p>',
    actions: candidates.length ? [{ label: 'Add member', primary: true, id: 'memberGo' }, { label: 'Cancel' }] : [{ label: 'Close' }],
    onMount: function (root) {
      var go = root.querySelector('#memberGo');
      if (!go) return;
      go.addEventListener('click', function () {
        addMember(slug, root.querySelector('#memberSelect').value, root.querySelector('#memberRole').value);
        closeModal();
        toast('Member added', 'success');
        render();
      });
    },
  });
}

function openTeamModal(slug) {
  openModal({
    title: 'New team',
    icon: 'organization',
    body: '<div class="form-group"><label class="form-label" for="teamName">Team name</label>' +
      '<input type="text" class="input" id="teamName" data-autofocus placeholder="Frontend"></div>' +
      '<div class="form-group"><label class="form-label" for="teamDesc">Description</label>' +
      '<input type="text" class="input" id="teamDesc"></div>' +
      '<div class="form-group"><label class="form-label" for="teamPermission">Forge permission</label>' +
      '<select class="input" id="teamPermission">' + ['read', 'write', 'admin'].map(function (p) {
        return '<option value="' + p + '">' + p + '</option>';
      }).join('') + '</select></div>',
    actions: [{ label: 'Create team', primary: true, id: 'teamGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#teamGo').addEventListener('click', function () {
        var name = (root.querySelector('#teamName').value || '').trim();
        if (!name) return toast('A team needs a name', 'error');
        createTeam(slug, {
          name: name,
          description: (root.querySelector('#teamDesc').value || '').trim(),
          permission: root.querySelector('#teamPermission').value,
        });
        closeModal();
        toast('Team created', 'success');
        render();
      });
    },
  });
}

function openTeamMemberModal(slug, teamId) {
  var org = orgBySlug(slug);
  if (!org) return;
  var team = (org.teams || []).filter(function (t) { return t.id === teamId; })[0];
  if (!team) return;
  var candidates = org.members.filter(function (m) { return (team.members || []).indexOf(m.username) === -1; });
  openModal({
    title: 'Add a member to ' + team.name,
    icon: 'people',
    body: candidates.length
      ? '<select class="input" id="teamMemberSelect">' + candidates.map(function (m) {
          return '<option value="' + esc(m.username) + '">' + esc(m.username) + '</option>';
        }).join('') + '</select>'
      : '<p class="muted fs-13">Every organization member is already on this team.</p>',
    actions: candidates.length ? [{ label: 'Add', primary: true, id: 'teamMemberGo' }, { label: 'Cancel' }] : [{ label: 'Close' }],
    onMount: function (root) {
      var go = root.querySelector('#teamMemberGo');
      if (!go) return;
      go.addEventListener('click', function () {
        addToTeam(slug, teamId, root.querySelector('#teamMemberSelect').value);
        closeModal();
        render();
      });
    },
  });
}

/* ---------------------------------------------------------------- settings */

function saveProfileForm() {
  if (!ME) return signIn();
  var err = $('#pfErr');
  var display = ($('#pfName').value || '').trim();
  var username = ($('#pfUser').value || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (username !== ME.username) {
    var problem = validateUsername(username);
    if (problem) { if (err) err.textContent = problem; return; }
  }
  var oldName = ME.username;
  ME.displayName = display || username;
  ME.username = username;
  ME.bio = ($('#pfBio').value || '').trim();
  ME.company = ($('#pfCompany').value || '').trim();
  ME.location = ($('#pfLoc').value || '').trim();
  ME.website = ($('#pfSite').value || '').trim();

  if (oldName !== username) {
    // Re-key everything that referenced the old username.
    Object.keys(DB.users).forEach(function (k) {
      var u = DB.users[k];
      u.following = (u.following || []).map(function (n) { return n === oldName ? username : n; });
      (u.activity || []).forEach(function (a) { if (a.target === oldName) a.target = username; });
      (u.forges || []).forEach(function (r) {
        if (r.ownerUsername === oldName) r.ownerUsername = username;
        (r.issues || []).concat(r.pulls || []).forEach(function (t) {
          if (t.author === oldName) t.author = username;
          (t.comments || []).forEach(function (c) { if (c.author === oldName) c.author = username; });
        });
        (r.commits || []).forEach(function (c) { if (c.author === oldName) c.author = username; });
      });
    });
    if (DB.sshKeys) {
      DB.sshKeys[username] = DB.sshKeys[oldName] || [];
      delete DB.sshKeys[oldName];
    }
    (DB.stars || []).forEach(function (s) { if (s.user === oldName) s.user = username; });
    (DB.watches || []).forEach(function (w) { if (w.user === oldName) w.user = username; });
    (DB.forks || []).forEach(function (f) { if (f.user === oldName) f.user = username; });
    (DB.notifications || []).forEach(function (n) {
      if (n.to === oldName) n.to = username;
      if (n.from === oldName) n.from = username;
    });
    (DB.gists || []).forEach(function (g) { if (g.owner === oldName) g.owner = username; });
    (DB.codespaces || []).forEach(function (c) { if (c.owner === oldName) c.owner = username; });
    (DB.sessions || []).forEach(function (s) { if (s.user === oldName) s.user = username; });
    Object.keys(DB.orgs || {}).forEach(function (slug) {
      var org = DB.orgs[slug];
      if (org.owner === oldName) org.owner = username;
      (org.members || []).forEach(function (m) { if (m.username === oldName) m.username = username; });
      (org.teams || []).forEach(function (t) {
        t.members = (t.members || []).map(function (n) { return n === oldName ? username : n; });
      });
    });
    (DB.projects || []).forEach(function (p) { if (p.ownerKey === oldName) p.ownerKey = username; });
  }

  logActivity('profile.update', '');
  saveDB();
  renderHeader();
  toast('Profile saved', 'success');
  render();
}

function readAvatarFile(input) {
  var file = input.files && input.files[0];
  if (!file || !ME) return;
  if (file.size > 2 * 1024 * 1024) { toast('Images must be under 2 MB', 'error'); return; }
  var reader = new FileReader();
  reader.onload = function (event) {
    ME.avatar = { type: 'image', value: event.target.result, bg: '#30363d' };
    logActivity('avatar.update', '');
    saveDB();
    toast('Avatar updated', 'success');
    render();
  };
  reader.readAsDataURL(file);
}

function openRotateKeyModal() {
  if (!ME) return;
  openModal({
    title: 'Generate a new key?',
    icon: 'key',
    body: '<p class="fs-13">Your current key stops working the moment you rotate it. Anyone still holding it loses access, and you will need the new key to sign in again.</p>' +
      '<div class="callout mt-4">' + ic('alert', 14) + ' Save the new key before closing this dialog — it is shown only once.</div>',
    actions: [{ label: 'Generate new key', primary: true, danger: true, id: 'rotGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      root.querySelector('#rotGo').addEventListener('click', function () {
        var account = DB.users[ME.key];
        var oldKey = account.key;
        var newKey = genKey();
        while (DB.users[newKey]) newKey = genKey();
        delete DB.users[oldKey];
        account.key = newKey;
        DB.users[newKey] = account;
        setSession(account);
        logActivity('key.rotate', '');
        saveDB();
        closeModal();
        showKeyReveal(newKey, false);
        toast('New key generated', 'success');
      });
    },
  });
}

function openDeleteAccountModal() {
  if (!ME) return;
  var username = ME.username;
  openModal({
    title: 'Delete your account?',
    icon: 'alert',
    body: '<p class="fs-13">This permanently removes <b>@' + esc(username) + '</b>, every forge it owns, its gists, projects, codespaces, keys and notifications from this browser.</p>' +
      '<div class="form-group mt-4"><label class="form-label" for="delAckText">Type <span class="mono">' + esc(username) + '</span> to confirm</label>' +
      '<input type="text" class="input mono" id="delAckText" data-autofocus></div>',
    actions: [{ label: 'Delete account', danger: true, id: 'delAccGo' }, { label: 'Cancel' }],
    onMount: function (root) {
      var go = root.querySelector('#delAccGo');
      go.disabled = true;
      root.querySelector('#delAckText').addEventListener('input', function (e) {
        go.disabled = e.target.value.trim() !== username;
      });
      go.addEventListener('click', function () {
        deleteAccount(username);
        clearSession();
        closeModal();
        navigate('/');
        render();
        toast('Account deleted', 'success');
      });
    },
  });
}

/* ------------------------------------------------------------------ imports */

/** Wire the file picker on /new/import (called from the view's mount hook). */
export function wireImportPicker() {
  var input = $('#importFiles');
  if (!input || input._wired) return;
  input._wired = true;
  window._importFiles = [];
  input.addEventListener('change', function () {
    var files = Array.prototype.slice.call(input.files || []);
    if (!files.length) return;
    var remaining = files.length;
    window._importFiles = [];
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function (event) {
        window._importFiles.push({
          name: (file.webkitRelativePath || file.name).replace(/^.*?\//, function (m) { return m; }),
          content: String(event.target.result || ''),
        });
        if (--remaining === 0) renderImportList();
      };
      reader.onerror = function () { if (--remaining === 0) renderImportList(); };
      if (file.size > 2 * 1024 * 1024) {
        window._importFiles.push({ name: file.name, content: '// skipped: file is larger than 2 MB' });
        if (--remaining === 0) renderImportList();
        return;
      }
      reader.readAsText(file);
    });
  });
}

function renderImportList() {
  var list = $('#importList');
  var count = $('#importCount');
  var files = window._importFiles || [];
  if (count) count.textContent = files.length ? files.length + ' file' + (files.length === 1 ? '' : 's') + ' ready to import' : 'No files selected';
  if (!list) return;
  list.innerHTML = files.length
    ? '<div class="card-tight">' + files.slice(0, 50).map(function (f) {
        return '<div class="list-item"><div class="list-icon">' + ic('file', 14) + '</div>' +
          '<div class="list-body"><div class="list-title mono">' + esc(f.name) + '</div>' +
          '<div class="list-meta">' + String(f.content || '').split('\n').length + ' lines</div></div></div>';
      }).join('') + (files.length > 50 ? '<div class="muted fs-12" style="padding:12px">…and ' + (files.length - 50) + ' more</div>' : '') + '</div>'
    : '';
}
