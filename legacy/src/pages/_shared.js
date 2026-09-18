/**
 * RedGet — shared helpers for page modules.
 *
 * Pages stay thin: they resolve data through the store, describe intent through
 * api.js, and lay out markup with the components in /src/components. This file
 * holds the glue that every page needs.
 */

import { h, icon, qs } from '../core/dom.js';
import { navigate, currentPath, toHref } from '../core/router.js';
import { getDb, getSession, getCurrentUser, getPrefs, setPref } from '../core/store.js';
import { BRAND, LIMITS, FEATURES } from '../config.js';
import { makeRandom, nextId } from '../core/util.js';
import { t } from '../core/i18n.js';
import { emit, EVENTS } from '../core/bus.js';
import * as api from '../core/api.js';
import {
  repoShell, repoSidebar, findRepoFromParams, canAccess, isMaintainer, repoNotFound,
  repoTitleString, settingsLayout, labelRow, userLink, archivedNotice,
} from '../components/repoChrome.js';
import {
  badge, stateBadge, visibilityBadge, counter, relativeTimeEl, absoluteTimeEl,
  emptyState, pageHeader, subnav, filterBar, itemRow, pagination, paginate, queryPage,
  skeletonList, card, panel, sidebarSection, checkStateIcon, statusDot, labelPill, progressBar,
  languageBar, dataTable, keyValueList, copyRow, linkList, chip, chipRow, stateTabs,
} from '../components/kit.js';
import { CONTENT, WIKI, CONTRIBUTIONS, PR_DIFFS, STEP_LOGS } from '../data/mockData.js';
import { avatar, avatarInline, avatarStack } from '../components/avatars.js';
import { markdown as markdownNode, renderMarkdown, markdownToText } from '../components/markdown.js';
import { openDialog, confirmDialog, alertDialog, toast, attachMenu, dropdown, tablist } from '../components/overlay.js';

export * from '../components/kit.js';

/**
 * Resolve `/:login/:repo` into a context object, or null when the repository
 * does not exist / is not visible to the current session.
 */
export function repoContext(params) {
  const repo = findRepoFromParams(params);
  if (!repo) return null;
  if (!canAccess(repo)) return null;
  const db = getDb();
  const owner = db.users.find((u) => u.login === repo.ownerLogin)
    || db.orgs.find((o) => o.login === repo.ownerLogin)
    || null;
  return {
    repo,
    owner,
    session: getSession(),
    user: getCurrentUser(),
    maintainer: isMaintainer(repo),
    visibility: repo.visibility || 'public',
  };
}

/** Render the standard repo page: chrome + main (+ sidebar). */
export function repoView(ctx, tab, options = {}) {
  const { main, sidebar, show, fullWidth, ...rest } = options;
  return repoShell(ctx.repo, tab, {
    main,
    sidebar: sidebar || (show ? repoSidebar(ctx.repo, { show }) : null),
    fullWidth: Boolean(fullWidth) || !sidebar,
    ...rest,
  });
}

/** Standard 404 body used by pages whose subject does not exist. */
export function notFoundBody(options = {}) {
  const { title = 'Page not found', description = '', href = '/dashboard', label = 'Back to your dashboard', code = '404' } = options;
  return h('div', { class: 'container error-container' },
    h('div', { class: 'error-card' },
      h('p', { class: 'error-code' }, code),
      h('h1', { class: 'error-title' }, title),
      description ? h('p', { class: 'error-description' }, description) : null,
      h('div', { class: 'error-actions' },
        h('a', { class: 'btn btn-primary', href }, label),
        h('a', { class: 'btn', href: '/docs' }, 'Read the docs')),
      h('p', { class: 'text-small text-muted', style: { 'margin-top': 'var(--sp-5)' } },
        `If you followed a link inside ${BRAND.name}, please report it so we can fix it.`)));
}

/** Title helper that keeps <title> in sync with the route. */
export function setTitle(value) {
  if (typeof document !== 'undefined' && value) document.title = value;
  return value;
}

/* --------------------------------------------------------------------- data */

export function db() { return getDb(); }

/** All records of a collection belonging to one repository (keyed by fullName). */
export function byRepo(collection, repo, predicate = null) {
  const d = db();
  const list = d[collection] || [];
  return list.filter((record) => record.repoFullName === repo.fullName && (!predicate || predicate(record)));
}

export function repoIssues(repo, options = {}) {
  const { state = null } = options;
  return byRepo('issues', repo, (i) => !i.isPull && (!state || i.state === state));
}

export function repoPulls(repo, options = {}) {
  const { state = null } = options;
  return byRepo('pullRequests', repo, (p) => !state || p.state === state);
}

/** Issues and pull requests share one number sequence. */
export function issueOrPull(repo, number) {
  const n = Number(number);
  const issue = byRepo('issues', repo).find((i) => i.number === n);
  if (issue) return { kind: 'issue', record: issue };
  const pull = byRepo('pullRequests', repo).find((p) => p.number === n);
  if (pull) return { kind: 'pull', record: pull };
  return null;
}

export function repoCommits(repo, ref = null) {
  return byRepo('commits', repo, (c) => !ref || c.branch === ref)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function commitsForFile(repo, path, ref = null) {
  return repoCommits(repo, ref).filter((c) => (c.files || []).some((f) => f.path === path));
}

export function commitBySha(repo, sha) {
  return byRepo('commits', repo).find((c) => c.sha === sha || c.shortSha === sha || String(c.sha).startsWith(String(sha))) || null;
}

export function repoBranches(repo) {
  return byRepo('branches', repo).sort((a, b) => (b.name === repo.defaultBranch) - (a.name === repo.defaultBranch) || new Date(b.updatedAt) - new Date(a.updatedAt));
}

export function repoTags(repo) {
  return byRepo('tags', repo).sort((a, b) => new Date(b.date) - new Date(a.date));
}

/** Milestones are referenced by id (`m-0`) or embedded as { id, title }. */
export function resolveMilestone(value) {
  if (!value) return null;
  if (typeof value === 'object') return value.title ? value : findMilestone(value.id);
  return findMilestone(value);
}

export function findMilestone(id) {
  return (db().milestones || []).find((m) => m.id === id) || null;
}

/** Projects are referenced by id (`p1`). */
export function resolveProjects(ids) {
  const all = db().projects || [];
  return (ids || []).map((id) => all.find((p) => p.id === id || p.number === Number(id))).filter(Boolean);
}

export function repoLabels(repo) { return byRepo('labels', repo); }

export function repoMilestones(repo) { return byRepo('milestones', repo); }

export function repoRuns(repo) {
  return byRepo('runs', repo).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function repoWorkflows(repo) { return byRepo('workflows', repo); }

export function repoJobsForRun(runId) {
  return (db().jobs || []).filter((j) => j.runId === String(runId));
}

export function repoReleases(repo) {
  return byRepo('releases', repo).sort((a, b) => new Date(b.publishedAt || b.createdAt) - new Date(a.publishedAt || a.createdAt));
}

export function releaseForTag(repo, tag) {
  return repoReleases(repo).find((r) => r.tagName === tag) || null;
}

export function repoAdvisories(repo) { return byRepo('advisories', repo); }
export function dependabotAlerts(repo) { return byRepo('dependabotAlerts', repo); }
export function codeScanningAlerts(repo) { return byRepo('codeScanningAlerts', repo); }
export function secretScanningAlerts(repo) { return byRepo('secretScanningAlerts', repo); }

export function repoProjects() { return (db().projects || []).filter((p) => !p.closed); }
export function closedProjects() { return (db().projects || []).filter((p) => p.closed); }
export function projectItemsFor(projectId) { return (db().projectItems || []).filter((i) => i.projectId === projectId); }

export function repoPackages() { return (db().packages || []); }
export function repoDiscussions(repo) { return byRepo('discussions', repo); }
export function repoEnvironments(repo) { return byRepo('environments', repo); }
export function repoRunners(repo) { return byRepo('runners', repo); }
export function repoSecrets(repo) { return byRepo('secrets', repo); }
export function repoVariables(repo) { return byRepo('variables', repo); }
export function repoCaches(repo) { return byRepo('caches', repo); }
export function repoArtifacts(repo) { return byRepo('artifacts', repo); }
export function repoWebhooks(repo) { return byRepo('webhooks', repo); }
export function repoDeployments(repo) { return byRepo('deployments', repo); }
export function repoDeployKeys(repo) { return byRepo('deployKeys', repo); }
export function repoBranchProtection(repo) { return byRepo('branchProtection', repo)[0] || { rules: [], rulesets: [] }; }
export function repoIssueForms(repo) { return byRepo('issueForms', repo); }
export function repoTraffic(repo) { return (db().traffic || {})[repo.fullName] || { days: [], referrers: [], popular: [] }; }

export function wikiPages(repo) {
  const set = WIKI.get(repo.fullName);
  if (set) return Array.from(set.values ? set.values() : Object.values(set));
  return (db().wikiHistory || []).filter((w) => w.repoFullName === repo.fullName);
}

export function wikiPage(repo, slug) {
  return wikiPages(repo).find((page) => page.slug === slug || page.title.toLowerCase() === String(slug).toLowerCase()) || null;
}

export function repoFiles(repo) {
  const entry = CONTENT.get(repo.fullName);
  if (!entry) return { files: [], dirs: [], readme: null };
  return entry;
}

export function repoFile(repo, path) {
  const { files } = repoFiles(repo);
  return files.find((f) => f.path === path) || null;
}

export function fileContent(repo, path) {
  const local = api.localFile(repo.fullName, path);
  if (local && !api.isDeletedFile(repo.fullName, path)) return local;
  const record = repoFile(repo, path);
  return record ? record.content : null;
}

export function prDiff(pull) {
  return PR_DIFFS.get(pull.id) || [];
}

export function stepLogs(job) {
  return STEP_LOGS.get(job.id) || [];
}

export function contributionsFor(login) {
  const list = CONTRIBUTIONS.get(login);
  return list ? Array.from(list.values ? list.values() : Object.values(list)) : [];
}

export function repoNotifications(repo = null) {
  const session = getSession();
  return (db().notifications || []).filter((n) => n.userLogin === session.login && (!repo || n.repoFullName === repo.fullName));
}

export function allNotifications() {
  const session = getSession();
  return (db().notifications || []).filter((n) => n.userLogin === session.login);
}

export function userRepos(login) {
  return (db().repos || []).filter((r) => r.ownerLogin.toLowerCase() === String(login).toLowerCase());
}

export function visibleReposFor(login) {
  return userRepos(login).filter((r) => canAccess(r));
}

export function findUserByLogin(login) {
  const target = String(login || '').toLowerCase();
  const d = db();
  return (d.users || []).find((u) => u.login.toLowerCase() === target) || null;
}

export function findOrgByLogin(login) {
  const target = String(login || '').toLowerCase();
  const d = db();
  return (d.orgs || []).find((o) => o.login.toLowerCase() === target) || null;
}

export function findOwner(login) { return findUserByLogin(login) || findOrgByLogin(login); }

export function ownerRecord(repo) { return findOwner(repo.ownerLogin); }

export function orgTeams(org) {
  return (db().teams || []).filter((tm) => tm.orgLogin === org.login);
}

export function orgMembers(org) {
  return (org.members || []).map((login) => findUserByLogin(login)).filter(Boolean);
}

export function orgRepos(org) {
  return (db().repos || []).filter((r) => r.ownerLogin === org.login && canAccess(r));
}

export function orgAuditLog(org) {
  return (db().auditLog || []).filter((entry) => entry.orgLogin === org.login);
}

export function repoEvents(repo = null, limit = 40) {
  return (db().events || []).filter((e) => !repo || e.repoFullName === repo.fullName).slice(0, limit);
}

export function dashboardFeed(login) {
  const d = db();
  const following = (d.follows || []).filter((f) => f.userLogin === login).map((f) => f.followsLogin);
  const watched = (d.watches || []).filter((w) => w.userLogin === login).map((w) => w.repoFullName);
  const mine = (d.repos || []).filter((r) => r.ownerLogin === login || (r.contributors || []).includes(login)).map((r) => r.fullName);
  const interesting = new Set([...watched, ...mine]);
  return (d.events || []).filter((event) => interesting.has(event.repoFullName) || following.includes(event.actorLogin) || event.actorLogin === login);
}

export function commentsForTarget(targetType, targetId) {
  return (db().comments || []).filter((c) => c.targetType === targetType && c.targetId === targetId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function timelineForTarget(targetType, targetId) {
  return (db().timeline || []).filter((entry) => entry.targetType === targetType && entry.targetId === targetId)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export function reviewsForPull(pull) {
  return (db().reviews || []).filter((r) => r.pullRequestId === pull.id && !r.dismissed)
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
}

export function threadsForPull(pull) {
  return (db().reviewThreads || []).filter((th) => th.pullRequestId === pull.id);
}

export function checksForPull(pull) {
  return (db().checks || []).filter((c) => c.pullRequestId === pull.id);
}

export function starredBy(login) {
  return (db().stars || []).filter((s) => s.userLogin === login).map((s) => s.repoFullName);
}

export function forkedBy(login) {
  return (db().forks || []).filter((f) => f.userLogin === login).map((f) => f.repoFullName);
}

export function followersOf(login) {
  return (db().follows || []).filter((f) => f.followsLogin === login).map((f) => f.userLogin);
}

export function followingOf(login) {
  return (db().follows || []).filter((f) => f.userLogin === login).map((f) => f.followsLogin);
}

export function pinnedReposOf(login) {
  return (db().pinned || []).filter((p) => p.userLogin === login).map((p) => p.repoFullName);
}

export function sponsorsOf(login) {
  return (db().sponsors || []).filter((s) => s.target === login);
}

export function achievementsFor(login) {
  const user = findUserByLogin(login);
  const owned = new Set(user ? user.achievements || [] : []);
  return (db().achievements || []).map((achievement) => ({ ...achievement, earned: owned.has(achievement.name) }));
}

/**
 * Parse the issue/PR search grammar used across the app:
 *   is:open is:issue label:bug,crimson assignee:@me author:nova sort:created-desc
 */
export function parseIssueQuery(raw) {
  const state = {
    text: '', is: [], labels: [], assignees: [], authors: [], mentions: [],
    milestones: [], sort: 'best-match', linked: null, in: [], review: [], statuses: [],
  };
  const tokens = String(raw || '').trim().split(/\s+/).filter(Boolean);
  tokens.forEach((token) => {
    const match = /^([a-z-]+):(.+)$/i.exec(token);
    if (!match) { state.text += `${state.text ? ' ' : ''}${token}`; return; }
    const [, key, rawValue] = match;
    const value = rawValue.replace(/^"|"$/g, '');
    const values = value.split(',').filter(Boolean);
    switch (key.toLowerCase()) {
      case 'is': state.is.push(...values); break;
      case 'label': case 'labels': state.labels.push(...values); break;
      case 'assignee': state.assignees.push(...values); break;
      case 'author': state.authors.push(...values); break;
      case 'mentions': state.mentions.push(...values); break;
      case 'milestone': state.milestones.push(...values); break;
      case 'sort': state.sort = value; break;
      case 'in': state.in.push(...values); break;
      case 'review': state.review.push(...values); break;
      case 'status': state.statuses.push(...values); break;
      case 'linked': state.linked = value; break;
      default: state.text += `${state.text ? ' ' : ''}${token}`; break;
    }
  });
  return state;
}

export function matchesIssueQuery(record, parsed, session = getSession()) {
  const wants = (list, key) => list.some((value) => value === '@me' ? record[key]?.includes?.(session.login) : record[key]?.includes?.(value));
  if (parsed.is.includes('open') && record.state !== 'open') return false;
  if (parsed.is.includes('closed') && record.state !== 'closed') return false;
  if (parsed.is.includes('merged') && !record.merged) return false;
  if (parsed.is.includes('draft') && !record.draft) return false;
  if (parsed.is.includes('issue') && record.isPull) return false;
  if (parsed.is.includes('pr') && !record.isPull) return false;
  if (parsed.labels.length) {
    const names = (record.labels || []).map((l) => (typeof l === 'string' ? l : l.name));
    if (!parsed.labels.some((label) => names.includes(label))) return false;
  }
  if (parsed.assignees.length) {
    const assignees = record.assignees || [];
    if (!parsed.assignees.some((a) => assignees.includes(a === '@me' ? session.login : a))) return false;
  }
  if (parsed.authors.length && !parsed.authors.some((a) => record.authorLogin === (a === '@me' ? session.login : a))) return false;
  if (parsed.mentions.length && !(record.body || '').includes(parsed.mentions[0])) return false;
  if (parsed.milestones.length) {
    const milestone = resolveMilestone(record.milestone);
    const label = parsed.milestones.includes('none') ? !milestone : Boolean(milestone && parsed.milestones.includes(milestone.title));
    if (!label) return false;
  }
  if (parsed.is.includes('unassigned') && (record.assignees || []).length) return false;
  if (parsed.text) {
    const q = parsed.text.toLowerCase();
    if (!`${record.title} ${record.body || ''} #${record.number}`.toLowerCase().includes(q)) return false;
  }
  return true;
}

export function sortIssues(list, sort) {
  const by = {
    'best-match': (a, b) => (b.commentsCount || 0) - (a.commentsCount || 0),
    'created-asc': (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    'created-desc': (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    'updated-asc': (a, b) => new Date(a.updatedAt) - new Date(b.updatedAt),
    'updated-desc': (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt),
    'comment-count': (a, b) => (b.commentsCount || 0) - (a.commentsCount || 0),
    'reactions': (a, b) => totalReactions(b) - totalReactions(a),
  };
  const compare = by[sort] || by['best-match'];
  return [...list].sort(compare);
}

function totalReactions(record) {
  return Object.values(record.reactions || {}).reduce((sum, n) => sum + n, 0);
}

/* --------------------------------------------------------------- diff data */

const CODE_SHAPES = {
  js: [
    'export function {name}({arg}) {',
    '  const {local} = {arg} ?? defaults;',
    '  if (!{local}) return null;',
    '  return {local}.map((item) => item.id);',
    '}',
  ],
  ts: [
    'export interface {Name}Options {',
    '  {arg}: string;',
    '  {local}?: number;',
    '}',
  ],
  css: [
    '.{name} {',
    '  display: flex;',
    '  gap: var(--sp-{n});',
    '  border: 1px solid var(--border-muted);',
    '}',
  ],
  py: [
    'def {name}({arg}):',
    '    """Return the resolved {arg}."""',
    '    return {arg} or DEFAULT_{NAME}',
  ],
  yml: [
    '{name}:',
    '  runs-on: ubuntu-latest',
    '  steps:',
    '    - uses: actions/checkout@v{n}',
  ],
  md: [
    '## {Name}',
    '',
    'The {name} module owns {arg} handling.',
    '',
    '- deterministic',
    '- accessible',
  ],
  sh: [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    '{name} --{arg} "$@"',
  ],
  json: [
    '{',
    '  "{arg}": "{name}",',
    '  "version": "{n}.0.0"',
    '}',
  ],
  sql: [
    'CREATE TABLE {name} (',
    '  id INTEGER PRIMARY KEY,',
    '  {arg} TEXT NOT NULL',
    ');',
  ],
  text: [
    '{Name}',
    '{arg} — placeholder line {n}',
  ],
};

function shapeFor(path) {
  const ext = String(path).slice(String(path).lastIndexOf('.') + 1).toLowerCase();
  const map = {
    js: 'js', mjs: 'js', cjs: 'js', jsx: 'js',
    ts: 'ts', tsx: 'ts',
    css: 'css', scss: 'css',
    py: 'py',
    yml: 'yml', yaml: 'yml',
    md: 'md', markdown: 'md', rst: 'md', adoc: 'md',
    sh: 'sh', bash: 'sh',
    json: 'json',
    sql: 'sql',
  };
  return CODE_SHAPES[map[ext] || 'text'];
}

function fillShape(line, rng, path) {
  const base = path.split('/').pop().replace(/\.[^.]+$/, '');
  const name = base.replace(/[^A-Za-z0-9]+/g, '_').toLowerCase() || 'module';
  const Name = name.charAt(0).toUpperCase() + name.slice(1);
  const NAME = name.toUpperCase();
  const args = ['value', 'options', 'event', 'node', 'payload', 'config', 'entry'];
  const locals = ['resolved', 'current', 'next', 'target', 'result'];
  return line
    .replace(/\{Name\}/g, Name)
    .replace(/\{NAME\}/g, NAME)
    .replace(/\{name\}/g, name)
    .replace(/\{arg\}/g, args[Math.floor(rng() * args.length)])
    .replace(/\{local\}/g, locals[Math.floor(rng() * locals.length)])
    .replace(/\{n\}/g, String(1 + Math.floor(rng() * 8)));
}

function makeLines(rng, path, count, salt = 0) {
  const shape = shapeFor(path);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const template = shape[i % shape.length];
    out.push(fillShape(template, rng, path).replace(/\{n\}/g, String(salt + i)));
  }
  return out;
}

/**
 * Build a realistic diff model for a seeded commit.
 *
 * Seeded commits only record the paths they touched plus addition/deletion
 * totals, so the two sides are generated deterministically from the commit SHA
 * and path. The result is stable across reloads and feeds straight into
 * computeDiff() in /src/components/diff.js.
 */
/** Files above this many changed lines are summarised instead of rendered. */
export const DIFF_LINE_CAP = 120;

export function commitDiffFiles(commit) {
  const rng = makeRandom(`diff:${commit.sha}`);
  const paths = (commit.files && commit.files.length ? commit.files : ['README.md']);
  const totalAdd = Math.max(1, commit.additions || paths.length);
  const totalDel = Math.max(0, commit.deletions || 0);

  return paths.map((path, index) => {
    const share = index === paths.length - 1 ? 1 : 0.35 + rng() * 0.3;
    const additions = index === paths.length - 1
      ? Math.max(0, totalAdd - Math.floor(totalAdd * (1 - share)))
      : Math.max(1, Math.round(totalAdd * share / paths.length));
    const deletions = index === paths.length - 1
      ? Math.max(0, totalDel - Math.floor(totalDel * (1 - share)))
      : Math.max(0, Math.round(totalDel * share / paths.length));

    const contextCount = 8 + Math.floor(rng() * 12);
    const head = makeLines(rng, path, contextCount, 0);
    const oldBody = makeLines(rng, path, Math.max(deletions, 1), 100);
    const newBody = makeLines(rng, path, Math.max(additions, 1), 200);
    const tail = makeLines(rng, path, 4 + Math.floor(rng() * 6), 300);

    const status = deletions === 0 && additions > 0 && rng() > 0.85
      ? 'added'
      : additions === 0 && deletions > 0
        ? 'removed'
        : 'modified';

    // Very large changes are summarised (matching how a real forge refuses to
    // render a 4,000-line diff inline) so the page stays responsive.
    if (additions + deletions > DIFF_LINE_CAP) {
      return { path, status, additions, deletions, binary: false, tooLarge: true, oldContent: '', newContent: '' };
    }

    return {
      path,
      status,
      additions,
      deletions,
      oldContent: status === 'added' ? '' : [...head, ...oldBody, ...tail].join('\n'),
      newContent: status === 'removed' ? '' : [...head, ...newBody, ...tail].join('\n'),
    };
  });
}

/* --------------------------------------------------------------- navigation */

export function repoHref(repo, suffix = '') {
  return `/${repo.fullName}${suffix}`;
}

export function treeHref(repo, ref, path = '') {
  const base = `/${repo.fullName}/tree/${encodeURIComponent(ref)}`;
  return path ? `${base}/${path}` : base;
}

export function blobHref(repo, ref, path) {
  return `/${repo.fullName}/blob/${encodeURIComponent(ref)}/${path}`;
}

export function issueHref(repo, number) {
  return `/${repo.fullName}/issues/${number}`;
}

export function pullHref(repo, number) {
  return `/${repo.fullName}/pull/${number}`;
}

export function commitHref(repo, sha) {
  return `/${repo.fullName}/commit/${sha}`;
}

/** Update the URL query string without triggering a re-render. */
export function replaceQuery(nextQuery, options = {}) {
  const path = options.path || currentPath();
  const search = toHref(path, nextQuery);
  window.history.replaceState(window.history.state || {}, '', search);
}

/* ------------------------------------------------------------------- markup */

/** Rendered Markdown as a DOM node (`<div class="markdown-body">…`). */
export function markdownBlock(source, options = {}) {
  return markdownNode(source || '', options);
}

/** Comment body: rendered Markdown wrapped in the comment container. */
/** Comment body: rendered Markdown wrapped in the comment container. */
export function commentBody(source, options = {}) {
  return h('div', { class: 'comment-body' }, markdownNode(source || '', options));
}

export function avatarLink(userOrLogin, options = {}) {
  const login = typeof userOrLogin === 'string' ? userOrLogin : userOrLogin?.login;
  const record = typeof userOrLogin === 'object' && userOrLogin ? userOrLogin : findUserByLogin(login);
  const size = options.size || 20;
  return h('a', {
    class: 'avatar-link', href: options.href || `/${login}`,
    'aria-label': `${login}'s profile`, title: login,
  }, avatar(record || { login }, { size, cls: options.cls }));
}

export function linkedAuthor(login, options = {}) {
  const record = findUserByLogin(login);
  const link = h('a', { class: 'comment-author', href: `/${login}` }, record && record.name ? record.name : login);
  return options.suffix ? h('span', {}, link, ` ${options.suffix}`) : link;
}

export function stateChip(state, extra = {}) {
  return stateBadge(state, extra);
}

export function issueMeta(issue) {
  const bits = [];
  bits.push(h('span', {}, '#', String(issue.number)));
  bits.push(h('span', {}, ' opened '));
  bits.push(relativeTimeEl(issue.createdAt));
  bits.push(h('span', {}, ' by '));
  bits.push(linkedAuthor(issue.authorLogin));
  return h('span', { class: 'item-meta' }, ...bits);
}

/* ==========================================================================
   Conversation: comments + timeline events in one chronological list
   ========================================================================== */

const REACTION_KINDS = [
  { id: '+1', emoji: '👍', label: 'thumbs up' },
  { id: '-1', emoji: '👎', label: 'thumbs down' },
  { id: 'laugh', emoji: '😄', label: 'laugh' },
  { id: 'hooray', emoji: '🎉', label: 'hooray' },
  { id: 'confused', emoji: '😕', label: 'confused' },
  { id: 'heart', emoji: '❤️', label: 'heart' },
  { id: 'rocket', emoji: '🚀', label: 'rocket' },
  { id: 'eyes', emoji: '👀', label: 'eyes' },
];

function reactionEmoji(kind) {
  const found = REACTION_KINDS.find((entry) => entry.id === kind);
  return found ? found.emoji : '👍';
}

function reactionLabel(kind) {
  const found = REACTION_KINDS.find((entry) => entry.id === kind);
  return found ? found.label : kind;
}

/**
 * One comment in the conversation.
 *
 *   <div class="comment" id="comment-<id>">
 *     <div class="comment-header">
 *       <a class="comment-author">…</a>
 *       <span class="comment-meta">commented <time>…</time></span>
 *       <div class="comment-actions">…kebab…</div>
 *     </div>
 *     <div class="comment-body"><div class="markdown-body">…</div></div>
 *     <div class="comment-footer"><div class="reaction-row">…</div></div>
 *   </div>
 */
export function commentCard(comment, options = {}) {
  const {
    repo = null, editable = false, onEdit = null, onDelete = null, onReact = null,
    variant = 'issue', permalink = null, showReactions = true, footerExtra = null,
  } = options;
  const session = getSession();
  const author = findUserByLogin(comment.authorLogin) || { login: comment.authorLogin };
  const isOwn = session.login === comment.authorLogin;
  const mine = (db().reactions || []).filter((r) => r.targetId === comment.id && r.userLogin === session.login).map((r) => r.content);

  const classes = ['comment'];
  if (comment.authorLogin === options.issueAuthor) classes.push('is-author');
  if (comment.minimized) classes.push('is-minimized');

  const header = h('div', { class: 'comment-header' },
    avatar(author, { size: 20 }),
    linkedAuthor(comment.authorLogin),
    comment.authorAssociation && comment.authorAssociation !== 'NONE'
      ? h('span', { class: 'badge badge-neutral', title: comment.authorAssociation }, associationLabel(comment.authorAssociation))
      : null,
    h('span', { class: 'comment-meta' },
      comment.isAnswer ? h('strong', {}, 'answered ') : h('span', {}, 'commented '),
      h('a', { class: 'comment-permalink', href: permalink || currentPath() }, relativeTimeEl(comment.createdAt)),
      comment.updatedAt && comment.updatedAt !== comment.createdAt ? h('span', { class: 'text-muted' }, ' · edited') : null),
    commentActions(comment, { repo, variant, editable, isOwn, onEdit, onDelete }));

  const body = comment.minimized
    ? h('p', { class: 'comment-minimized-note' }, `This comment was marked as ${comment.minimizedReason || 'off-topic'}.`)
    : commentBody(comment.body, { repo });

  const footer = showReactions || footerExtra
    ? h('div', { class: 'comment-footer' },
      showReactions ? reactionRow(comment, { repo, onReact, mine }) : null,
      footerExtra)
    : null;

  const card = h('div', { class: classes.join(' '), id: comment.id ? `comment-${comment.id}` : null }, header, body, footer);
  return card;
}

function commentActions(comment, options) {
  const { repo, variant, editable, isOwn, onEdit, onDelete } = options;
  const actions = h('div', { class: 'comment-actions' });
  if (!editable || !isOwn) return actions;

  const menu = h('ul', { class: 'dropdown-menu', role: 'menu', 'aria-label': 'Comment actions', hidden: true },
    h('li', { role: 'none' }, h('button', {
      class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
      onClick: () => (onEdit ? onEdit(comment) : openEditCommentDialog(comment, repo, variant)),
    }, icon('pencil', { size: 16 }), h('span', {}, 'Edit'))),
    h('li', { role: 'none' }, h('button', {
      class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
      onClick: () => {
        api.minimizeComment(comment.id, !comment.minimized);
        rerender();
      },
    }, icon('eye', { size: 16 }), h('span', {}, comment.minimized ? 'Unminimize' : 'Minimize'))),
    h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })),
    h('li', { role: 'none' }, h('button', {
      class: 'dropdown-item dropdown-item-danger', role: 'menuitem', type: 'button', tabindex: '-1',
      onClick: () => confirmDialog({
        title: 'Delete this comment?',
        body: 'This cannot be undone. The comment is removed for everyone.',
        confirmLabel: 'Delete comment',
        danger: true,
      }).then((ok) => {
        if (!ok) return;
        if (onDelete) onDelete(comment);
        else api.deleteComment(comment.id);
        rerender();
        toast({ message: 'Comment deleted', variant: 'info' });
      }),
    }, icon('trash', { size: 16 }), h('span', {}, 'Delete'))));

  const trigger = h('button', {
    class: 'btn btn-sm btn-icon', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    'aria-label': 'Comment actions',
  }, icon('kebab', { size: 16 }));
  attachMenu(trigger, menu, { align: 'right' });
  actions.append(h('div', { class: 'dropdown' }, trigger, menu));
  return actions;
}

function associationLabel(association) {
  const map = {
    OWNER: 'Owner', MEMBER: 'Member', COLLABORATOR: 'Collaborator', CONTRIBUTOR: 'Contributor',
    FIRST_TIME_CONTRIBUTOR: 'First-time contributor', MANNEQUIN: 'Bot', NONE: '',
  };
  return map[association] || association;
}

/**
 * Reaction chips:
 *   <div class="reaction-row">
 *     <button class="reaction" aria-pressed="false"><span class="emoji">👍</span> 4</button>
 *     <button class="reaction-add" aria-haspopup="menu">+</button>
 *   </div>
 */
export function reactionRow(comment, options = {}) {
  const { onReact = null, mine = [] } = options;
  const reactions = comment.reactions || {};
  const row = h('div', { class: 'reaction-row' });

  REACTION_KINDS
    .filter((entry) => (reactions[entry.id] || 0) > 0 || mine.includes(entry.id))
    .forEach((entry) => {
      const count = reactions[entry.id] || 0;
      const button = h('button', {
        class: 'reaction', type: 'button',
        'aria-pressed': String(mine.includes(entry.id)),
        'aria-label': `${count} ${entry.label} reaction${count === 1 ? '' : 's'} — press to toggle yours`,
        title: `${entry.label} (${count})`,
        onClick: () => {
          if (onReact) { onReact(entry.id); return; }
          api.react('comment', comment.id, entry.id);
          rerender();
        },
      }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, entry.emoji), h('span', {}, String(count)));
      row.appendChild(button);
    });

  const picker = h('button', {
    class: 'reaction-add', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    'aria-label': 'Add a reaction',
  }, icon('emoji-smile', { size: 16 }));

  const menu = h('ul', { class: 'dropdown-menu reaction-menu', role: 'menu', 'aria-label': 'Pick a reaction', hidden: true },
    ...REACTION_KINDS.map((entry) => h('li', { role: 'none' },
      h('button', {
        class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
        onClick: () => {
          if (onReact) { onReact(entry.id); return; }
          api.react('comment', comment.id, entry.id);
          rerender();
          toast({ message: `Reacted with ${entry.label}`, variant: 'success' });
        },
      }, h('span', { class: 'emoji', 'aria-hidden': 'true' }, entry.emoji), h('span', {}, entry.label)))));

  attachMenu(picker, menu, { align: 'left' });
  row.appendChild(h('div', { class: 'dropdown' }, picker, menu));
  return row;
}

/** Reactions on the issue/PR body itself (targetType 'issue' or 'pull'). */
export function targetReactionRow(targetType, record, options = {}) {
  const session = getSession();
  const mine = (db().reactions || []).filter((r) => r.targetType === targetType && r.targetId === record.id && r.userLogin === session.login).map((r) => r.content);
  return reactionRow({ id: record.id, reactions: record.reactions || {} }, { mine, ...options });
}

/**
 * One timeline event:
 *   <li class="timeline-item" data-kind="labeled">
 *     <div class="timeline-event"><svg class="icon">…</svg> <strong>nova</strong> added the bug label <time>…</time></div>
 *   </li>
 */
export function timelineEvent(event) {
  const name = event.type || event.kind || 'commented';
  const iconName = TIMELINE_ICONS[name] || 'dot';
  const body = h('div', { class: 'timeline-event' },
    icon(iconName, { size: 16 }),
    event.actorLogin ? linkedAuthor(event.actorLogin) : null,
    h('span', {}, event.text || defaultTimelineText(name, event)),
    event.createdAt ? relativeTimeEl(event.createdAt) : null);
  return h('li', { class: 'timeline-item', dataset: { kind: name } }, body);
}

const TIMELINE_ICONS = {
  opened: 'issue-opened', closed: 'issue-closed', 'closed-not-planned': 'x-circle', reopened: 'issue-reopened',
  labeled: 'tag', unlabeled: 'tag', assigned: 'person', unassigned: 'person',
  referenced: 'bookmark', renamed: 'pencil', locked: 'lock', unlocked: 'key',
  pinned: 'pin', unpinned: 'pin', transferred: 'repo-push', milestoned: 'milestone',
  demilestoned: 'milestone', 'head-ref-force-pushed': 'git-commit', merged: 'git-merge',
  'review-requested': 'eye', connected: 'link', subscribed: 'bell', commented: 'comment',
  'cross-referenced': 'link', 'branch-protection-rule': 'shield', deployed: 'rocket',
  'commit-comment': 'git-commit', resolved: 'check', 'base-ref-changed': 'git-branch',
  'review-dismissed': 'shield-x', reviewed: 'check', 'auto-merge-enabled': 'queue',
  'auto-merge-disabled': 'stop', 'added-to-merge-queue': 'queue', 'converted-to-draft': 'git-pull-request-draft',
  'ready-for-review': 'git-pull-request',
};

function timelineLabel(event) {
  const raw = event.label;
  if (!raw) return 'label';
  if (typeof raw === 'string') return raw;
  return raw.name || 'label';
}

function timelineMilestone(event) {
  const resolved = resolveMilestone(event.milestone || event.milestoneId);
  return resolved ? resolved.title : 'the milestone';
}

function defaultTimelineText(name, event) {
  switch (name) {
    case 'opened': return 'opened this issue';
    case 'labeled': return ` added the ${timelineLabel(event)} label`;
    case 'unlabeled': return ` removed the ${timelineLabel(event)} label`;
    case 'assigned': return ` assigned ${event.assigneeLogin || 'someone'}`;
    case 'unassigned': return ` removed the assignment for ${event.assigneeLogin || 'someone'}`;
    case 'referenced': return ' referenced this in a commit';
    case 'closed': return ` closed this as ${event.stateReason || 'completed'}`;
    case 'closed-not-planned': return ' closed this as not planned';
    case 'reopened': return ' reopened this';
    case 'renamed': return ' renamed this issue';
    case 'locked': return ` locked this as ${event.lockReason || 'off-topic'} and limited conversation to collaborators`;
    case 'unlocked': return ' unlocked this conversation';
    case 'pinned': return ' pinned this issue';
    case 'unpinned': return ' unpinned this issue';
    case 'transferred': return ` transferred this to ${event.to || event.targetRepo || 'another repository'}`;
    case 'milestoned': return ` added this to the ${timelineMilestone(event)} milestone`;
    case 'demilestoned': return ' removed this from the milestone';
    case 'merged': return ` merged commit ${event.sha ? String(event.sha).slice(0, 7) : ''} into ${event.base || 'the base branch'}`;
    case 'review-requested': return ` requested a review from ${event.reviewerLogin || 'someone'}`;
    case 'commented': return ' commented';
    case 'head-ref-force-pushed': return ' force-pushed the head branch';
    case 'base-ref-changed': return ` changed the base branch to ${event.base || 'another branch'}`;
    case 'converted-to-draft': return ' marked this pull request as draft';
    case 'ready-for-review': return ' marked this pull request as ready for review';
    case 'auto-merge-enabled': return ' enabled auto-merge';
    case 'auto-merge-disabled': return ' disabled auto-merge';
    case 'added-to-merge-queue': return ' added this pull request to the merge queue';
    case 'review-dismissed': return ' dismissed a review';
    default: return ` ${name.replace(/-/g, ' ')}`;
  }
}

/**
 * Merge comments and timeline events into one chronological
 * `<ol class="timeline">`. Comment entries render as <li> wrappers so the list
 * stays valid while the comment card keeps its own semantics.
 */
export function conversationList(entries, options = {}) {
  const list = h('ol', { class: 'timeline', 'aria-label': options.label || 'Conversation' });
  const sorted = [...entries].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));

  sorted.forEach((entry) => {
    if (entry.kind === 'comment') {
      list.appendChild(h('li', { class: 'timeline-item timeline-comment', dataset: { kind: 'comment' } },
        commentCard(entry.record, options)));
    } else {
      list.appendChild(timelineEvent(entry.record));
    }
  });

  return list;
}

/** Build the merged entries for an issue or pull request. */
export function conversationFor(targetType, record) {
  const comments = commentsForTarget(targetType, record.id).map((item) => ({ kind: 'comment', record: item, createdAt: item.createdAt }));
  const events = (record.timeline || []).map((item) => ({ kind: 'event', record: item, createdAt: item.createdAt }));
  return [...comments, ...events];
}

/** Ask the router to re-render the current path (used after a mutation). */
export function rerender() {
  emit(EVENTS.dataChange, { source: 'page' });
  return emit(EVENTS.routeChange, { path: currentPath(), force: true });
}

export function rerenderSoft() {
  return emit(EVENTS.routeChange, { path: currentPath(), force: true, keepScroll: true });
}

/* ==========================================================================
   Composer (Write / Preview)
   ========================================================================== */

/**
 *   <div class="composer">
 *     <div class="composer-tabs" role="tablist"> <button class="tab" role="tab">Write</button> … </div>
 *     <div class="composer-toolbar" role="toolbar"> …formatting buttons… </div>
 *     <div class="composer-body"><textarea class="input"></textarea></div>
 *     <div class="composer-preview"><div class="markdown-body">…</div></div>
 *     <div class="composer-footer"> …hint… <div>Cancel · Submit</div> </div>
 *   </div>
 */
export function commentComposer(options = {}) {
  const {
    value = '', placeholder = 'Leave a comment', submitLabel = 'Comment',
    cancelLabel = null, onSubmit = null, onCancel = null, footer = null,
    minHeight = 120, autoFocus = false, repo = null, extraButtons = null,
  } = options;

  const textarea = h('textarea', {
    class: 'input', rows: '5', placeholder, 'aria-label': placeholder,
    style: { 'min-height': `${minHeight}px` },
    onInput: () => { dirty = true; },
  });
  textarea.value = value;

  const preview = h('div', { class: 'composer-preview', hidden: true });
  let dirty = true;

  const tabId = nextId('composer');
  const writeTab = h('button', {
    class: 'tab is-active', type: 'button', role: 'tab', id: `${tabId}-write`,
    'aria-selected': 'true', 'aria-controls': `${tabId}-write-panel`,
  }, 'Write');
  const previewTab = h('button', {
    class: 'tab', type: 'button', role: 'tab', id: `${tabId}-preview`,
    'aria-selected': 'false', 'aria-controls': `${tabId}-preview-panel`,
  }, 'Preview');
  const writePanel = h('div', {
    class: 'composer-body', role: 'tabpanel', id: `${tabId}-write-panel`, 'aria-labelledby': `${tabId}-write`,
  }, textarea);
  const previewPanel = h('div', {
    class: 'composer-preview-wrap', role: 'tabpanel', id: `${tabId}-preview-panel`,
    'aria-labelledby': `${tabId}-preview`, hidden: true,
  }, preview);

  const show = (which) => {
    const writing = which === 'write';
    writeTab.classList.toggle('is-active', writing);
    previewTab.classList.toggle('is-active', !writing);
    writeTab.setAttribute('aria-selected', String(writing));
    previewTab.setAttribute('aria-selected', String(!writing));
    writePanel.hidden = !writing;
    previewPanel.hidden = writing;
    if (writing) {
      textarea.focus();
      return;
    }
    if (dirty) {
      const text = textarea.value.trim();
      preview.replaceChildren(text
        ? markdownNode(text, { repo })
        : h('p', { class: 'text-muted' }, 'Nothing to preview'));
      dirty = false;
    }
  };
  writePanel.hidden = false;
  previewPanel.hidden = true;
  writeTab.addEventListener('click', () => show('write'));
  previewTab.addEventListener('click', () => show('preview'));

  const toolbar = h('div', { class: 'composer-toolbar', role: 'toolbar', 'aria-label': 'Formatting' },
    ...COMPOSER_TOOLS.map((tool) => h('button', {
      class: 'composer-tool', type: 'button', title: tool.label, 'aria-label': tool.label,
      onClick: () => { applyFormat(textarea, tool); dirty = true; },
    }, icon(tool.icon, { size: 16 }))));

  const submitButton = h('button', {
    class: 'btn btn-primary', type: 'button', 'data-submit': 'true',
    onClick: () => {
      const text = textarea.value.trim();
      if (!text) {
        toast({ message: 'Write something first', variant: 'attention' });
        textarea.focus();
        return;
      }
      const result = onSubmit ? onSubmit(text) : null;
      if (result === false) return;
      textarea.value = '';
      dirty = true;
      show('write');
    },
  }, submitLabel);

  const footerButtons = h('div', { class: 'composer-buttons' });
  if (extraButtons) footerButtons.append(...(Array.isArray(extraButtons) ? extraButtons : [extraButtons]));
  if (cancelLabel) {
    footerButtons.appendChild(h('button', {
      class: 'btn', type: 'button',
      onClick: () => { textarea.value = ''; dirty = true; if (onCancel) onCancel(); },
    }, cancelLabel));
  }
  footerButtons.appendChild(submitButton);

  const composer = h('div', { class: 'composer', 'data-composer': 'true' },
    h('div', { class: 'composer-tabs', role: 'tablist', 'aria-label': 'Comment editor' }, writeTab, previewTab),
    toolbar,
    writePanel,
    previewPanel,
    h('div', { class: 'composer-footer' },
      footer || h('span', { class: 'composer-hint' },
        'Supports ', h('a', { href: '/docs/markdown' }, 'Markdown'), '. ',
        h('kbd', {}, 'Ctrl'), '+', h('kbd', {}, 'Enter'), ' submits.'),
      h('span', { class: 'spacer' }),
      footerButtons));

  if (autoFocus) textarea.focus();
  return composer;
}

const COMPOSER_TOOLS = [
  { icon: 'bold', label: 'Add bold text', wrap: '**' },
  { icon: 'italic', label: 'Add italic text', wrap: '_' },
  { icon: 'code', label: 'Add inline code', wrap: '`' },
  { icon: 'link', label: 'Add a link', wrap: '[]()' },
  { icon: 'quote', label: 'Add a quote', prefix: '> ' },
  { icon: 'list-unordered', label: 'Add a bulleted list', prefix: '- ' },
  { icon: 'list-ordered', label: 'Add a numbered list', prefix: '1. ' },
  { icon: 'tasklist', label: 'Add a task list', prefix: '- [ ] ' },
];

function applyFormat(textarea, tool) {
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const value = textarea.value;
  const selected = value.slice(start, end);
  let next;
  let caret;

  if (tool.prefix) {
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    next = `${value.slice(0, lineStart)}${tool.prefix}${value.slice(lineStart)}`;
    caret = start + tool.prefix.length;
  } else if (tool.wrap === '[]()') {
    const label = selected || 'text';
    next = `${value.slice(0, start)}[${label}](/)${value.slice(end)}`;
    caret = start + label.length + 3;
  } else {
    const wrapped = `${tool.wrap}${selected || 'text'}${tool.wrap}`;
    next = `${value.slice(0, start)}${wrapped}${value.slice(end)}`;
    caret = start + wrapped.length;
  }

  textarea.value = next;
  textarea.focus();
  textarea.setSelectionRange(caret, caret);
}

function openEditCommentDialog(comment, repo, variant) {
  const textarea = h('textarea', { class: 'input', rows: '8', 'aria-label': 'Comment body' });
  textarea.value = comment.body || '';
  openDialog({
    title: 'Edit comment',
    size: 'lg',
    body: h('div', { class: 'dialog-form' }, textarea),
    confirmLabel: 'Save comment',
    onConfirm: () => {
      const body = textarea.value.trim();
      if (!body) { toast({ message: 'The comment cannot be empty', variant: 'attention' }); return false; }
      api.updateComment(comment.id, body);
      rerender();
      toast({ message: 'Comment updated', variant: 'success' });
      return true;
    },
  });
}


/**
 * Sidebar section for issues/PRs:
 *   <section class="meta-section" data-sidebar-control="labels" role="group" aria-label="Labels">
 *     <h2 class="meta-section-title">Labels <span class="spacer"></span> <button>gear</button></h2>
 *     …content…
 *   </section>
 */
export function sidebarControl(kind, content, options = {}) {
  const section = h('section', {
    class: 'meta-section', dataset: { sidebarControl: kind },
    role: 'group', 'aria-label': options.label || kind,
  });
  const title = h('h2', { class: 'meta-section-title' }, options.title || kind);
  title.appendChild(h('span', { class: 'spacer' }));
  if (options.action) title.appendChild(options.action);
  section.append(title, content);
  return section;
}

/** Wrap several sidebar sections in the standard container. */
export function metaSidebar(sections, options = {}) {
  return h('aside', {
    class: ['meta-sidebar', options.cls].filter(Boolean).join(' '),
    'aria-label': options.label || 'Metadata',
  }, ...sections.filter(Boolean));
}

export function sidebarAssignees(logins, options = {}) {
  const { repo, kind = 'issue', number, onChange, title = 'Assignees' } = options;
  const list = logins || [];
  const body = list.length
    ? h('ul', { class: 'assignee-list', role: 'list' },
      ...list.map((login) => h('li', {},
        avatarLink(login, { size: 20 }),
        h('a', { class: 'login', href: `/${login}` }, login))))
    : h('p', { class: 'text-small text-muted' }, 'No one assigned');

  const action = h('button', {
    type: 'button', 'aria-haspopup': 'dialog', 'aria-label': `Edit ${title.toLowerCase()}`,
    title: `Edit ${title.toLowerCase()}`,
    onClick: () => openAssigneeDialog(repo, kind, number, list, onChange),
  }, icon('gear', { size: 16 }));

  return sidebarControl('assignees', body, { title: `${title}${list.length ? ` (${list.length})` : ''}`, action });
}

function openAssigneeDialog(repo, kind, number, current, onChange) {
  const candidates = api.collaboratorsFor(repo.fullName);
  const selected = new Set(current);
  const listBox = h('div', { class: 'assignee-list', role: 'group', 'aria-label': 'Available assignees' },
    candidates.map((user) => {
      const checked = selected.has(user.login);
      const row = h('label', { class: 'checkbox-row assignee-row' },
        h('input', {
          type: 'checkbox', checked: checked || null, value: user.login,
          onChange: (event) => {
            if (event.target.checked) selected.add(user.login); else selected.delete(user.login);
          },
        }),
        avatar(user, { size: 20 }),
        h('span', { class: 'assignee-login' }, user.login),
        user.name ? h('span', { class: 'text-small text-muted' }, user.name) : null);
      return row;
    }));

  openDialog({
    title: `Assign up to ${LIMITS.maxAssignees || 10} people to this ${kind}`,
    body: h('div', { class: 'dialog-form' },
      h('p', { class: 'text-small text-muted' }, `${candidates.length} collaborators can be assigned.`),
      listBox),
    footer: (close) => [
      h('button', { class: 'btn', type: 'button', 'data-close': 'true' }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const next = Array.from(selected);
          if (onChange) onChange(next);
          else api.updateIssue(repo.fullName, Number(number), { assignees: next });
          close();
          rerender();
          toast({ message: `Assigned ${next.length} ${next.length === 1 ? 'person' : 'people'}`, variant: 'success' });
        },
      }, 'Apply'),
    ],
  });
}

export function sidebarLabels(labels, options = {}) {
  const { repo, kind = 'issue', number, onChange } = options;
  const body = labels && labels.length
    ? h('div', { class: 'label-list' }, ...labels.map((label) => labelPill(label)))
    : h('p', { class: 'text-small text-muted' }, 'None yet');
  const action = h('button', {
    type: 'button', 'aria-haspopup': 'dialog', 'aria-label': 'Edit labels', title: 'Edit labels',
    onClick: () => openLabelDialog(repo, kind, number, labels, onChange),
  }, icon('gear', { size: 16 }));
  return sidebarControl('labels', body, { title: `Labels${labels && labels.length ? ` (${labels.length})` : ''}`, action });
}

function openLabelDialog(repo, kind, number, current, onChange) {
  const all = repoLabels(repo);
  const selected = new Set((current || []).map((l) => l.name));
  const search = h('input', {
    class: 'input', type: 'search', placeholder: 'Filter labels', 'aria-label': 'Filter labels',
    onInput: (event) => {
      const q = event.target.value.toLowerCase();
      Array.from(list.children).forEach((row) => {
        row.hidden = !row.textContent.toLowerCase().includes(q);
      });
    },
  });
  const list = h('div', { class: 'label-picker', role: 'group', 'aria-label': 'Available labels' },
    all.map((label) => h('label', { class: 'checkbox-row label-picker-row' },
      h('input', {
        type: 'checkbox', checked: selected.has(label.name) || null,
        onChange: (event) => {
          if (event.target.checked) selected.add(label.name); else selected.delete(label.name);
        },
      }),
      labelPill(label),
      label.description ? h('span', { class: 'text-small text-muted label-picker-desc' }, label.description) : null)));

  openDialog({
    title: 'Apply labels to this item',
    body: h('div', { class: 'dialog-form' }, search, list),
    footer: (close) => [
      h('button', { class: 'btn', type: 'button', 'data-close': 'true' }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          const next = all.filter((l) => selected.has(l.name));
          if (onChange) onChange(next);
          else api.updateIssue(repo.fullName, Number(number), { labels: next.map((l) => ({ name: l.name, color: l.color, description: l.description || '' })) });
          close();
          rerender();
          toast({ message: `Applied ${next.length} label${next.length === 1 ? '' : 's'}`, variant: 'success' });
        },
      }, 'Apply labels'),
    ],
  });
}

export function sidebarMilestone(milestone, options = {}) {
  const { repo, kind = 'issue', number, onChange } = options;
  const resolved = resolveMilestone(milestone);
  const body = resolved
    ? h('div', { class: 'milestone-block' },
      h('a', { class: 'milestone-title', href: `/${repo.fullName}/milestones` }, resolved.title),
      progressBar(milestoneProgress(repo, resolved), { label: `${milestoneProgress(repo, resolved)}% complete` }),
      resolved.dueOn ? h('p', { class: 'text-small text-muted' }, 'Due ', relativeTimeEl(resolved.dueOn)) : null)
    : h('p', { class: 'text-small text-muted' }, 'No milestone');
  const action = h('button', {
    type: 'button', 'aria-haspopup': 'dialog', 'aria-label': 'Edit milestone', title: 'Edit milestone',
    onClick: () => {
      const milestones = repoMilestones(repo);
      const items = [{ id: '', label: 'No milestone' }, ...milestones.map((m) => ({ id: String(m.id), label: m.title }))];
      openDialog({
        title: 'Set milestone',
        body: h('div', { class: 'dialog-form' },
          h('ul', { class: 'choice-list', role: 'list' },
            items.map((item) => h('li', {},
              h('button', {
                class: 'btn choice-button', type: 'button',
                onClick: (event) => {
                  const dialog = event.currentTarget.closest('dialog');
                  const chosen = milestones.find((m) => String(m.id) === item.id) || null;
                  if (onChange) onChange(chosen);
                  else api.updateIssue(repo.fullName, Number(number), { milestone: chosen ? { id: chosen.id, title: chosen.title } : null });
                  if (dialog) dialog.close();
                  rerender();
                  toast({ message: chosen ? `Milestone set to ${chosen.title}` : 'Milestone cleared', variant: 'success' });
                },
              }, item.label))))),
      });
    },
  }, icon('gear', { size: 16 }));
  return sidebarControl('milestone', body, { title: 'Milestone', action });
}

/** Closed / total issues in a milestone, as a percentage. */
export function milestoneProgress(repo, milestone) {
  if (!milestone) return 0;
  const issues = (db().issues || []).filter((i) => i.repoFullName === repo.fullName
    && i.milestone && (i.milestone === milestone.id || i.milestone.id === milestone.id || i.milestone.title === milestone.title));
  if (!issues.length) return milestone.closedIssues && milestone.openIssues === 0 ? 100 : 0;
  const closed = issues.filter((i) => i.state === 'closed').length;
  return Math.round((closed / issues.length) * 100);
}

export function sidebarProjects(items, repo) {
  const projects = resolveProjects(items);
  const body = projects.length
    ? h('ul', { class: 'link-list', role: 'list' }, ...projects.map((project) => h('li', {},
      h('a', { href: `/${repo.fullName}/projects/${project.number || project.id}` }, project.title))))
    : h('p', { class: 'text-small text-muted' }, 'Not yet in a project');
  return sidebarControl('projects', body, { title: `Projects${projects.length ? ` (${projects.length})` : ''}` });
}

/** Reviewer section: avatar + name + review state (approved / changes requested). */
export function sidebarReviewers(reviewers, reviews, options = {}) {
  const { onAdd = null } = options;
  const latest = new Map();
  (reviews || []).forEach((review) => latest.set(review.authorLogin, review));

  const rows = (reviewers || []).map((login) => {
    const review = latest.get(login);
    const stateClass = review
      ? (review.state === 'APPROVED' ? 'approved' : review.state === 'CHANGES_REQUESTED' ? 'changes-requested' : 'commented')
      : '';
    const stateLabel = review
      ? (review.state === 'APPROVED' ? 'Approved' : review.state === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Commented')
      : 'Review required';
    const row = h('div', { class: 'reviewer-row' },
      avatarLink(login, { size: 20 }),
      h('a', { class: 'login', href: `/${login}` }, login),
      h('span', { class: ['reviewer-state', stateClass].filter(Boolean).join(' ') },
        review ? icon(review.state === 'APPROVED' ? 'check' : review.state === 'CHANGES_REQUESTED' ? 'x' : 'comment', { size: 16 }) : icon('eye', { size: 16 }),
        h('span', {}, stateLabel)));
    return row;
  });

  const action = onAdd
    ? h('button', { type: 'button', 'aria-haspopup': 'dialog', 'aria-label': 'Add reviewers', title: 'Add reviewers', onClick: onAdd }, icon('gear', { size: 16 }))
    : null;

  return sidebarControl('reviewers',
    rows.length ? h('div', { class: 'reviewer-list' }, ...rows) : h('p', { class: 'text-small text-muted' }, 'No reviewers yet'),
    { title: `Reviewers${rows.length ? ` (${rows.length})` : ''}`, action });
}

/* ------------------------------------------------------------------ re-export */

export {
  h, icon, qs, navigate, currentPath, toHref, getDb, getSession, getCurrentUser, getPrefs, setPref,
  BRAND, LIMITS, FEATURES, t, emit, EVENTS, api,
  repoShell, repoSidebar, findRepoFromParams, canAccess, isMaintainer, repoNotFound, repoTitleString,
  settingsLayout, labelRow, userLink, archivedNotice,
  badge, stateBadge, visibilityBadge, counter, relativeTimeEl, absoluteTimeEl,
  emptyState, pageHeader, subnav, filterBar, itemRow, pagination, paginate, queryPage,
  skeletonList, card, panel, sidebarSection, checkStateIcon, statusDot, labelPill, progressBar,
  languageBar, dataTable, keyValueList, copyRow, linkList, chip, chipRow, stateTabs,
  avatar, avatarInline, avatarStack, markdownNode, renderMarkdown, markdownToText,
  openDialog, confirmDialog, alertDialog, toast, attachMenu, dropdown, tablist,
};
