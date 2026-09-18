/**
 * RedGet — application API (the "backend": there is no network in RedGet).
 *
 * Every user-visible action (star, comment, merge, create repository, toggle a
 * setting…) goes through this module as a thin wrapper around `store.mutate()`.
 *
 * IMPORTANT INVARIANT — self-contained mutators
 * ---------------------------------------------
 * `store.mutate()` records the mutator's source in a patch log and replays it
 * against a freshly generated seed on the next boot. A recorded mutator can
 * therefore only reference its own `db` parameter and literal values baked into
 * its source. Never capture outer variables (arguments, `getSession()` results,
 * imported helpers) inside a mutator: resolve them first, then pass them through
 * `mutator(literals, body)`, which JSON-serialises them into the function body.
 */

import { mutate, mutateLocal, getDb, getSession, getCurrentUser, setPref, setSession } from './store.js';
import { shortId, slugify } from './util.js';

const nowIso = () => new Date().toISOString();
const myLogin = () => getSession().login || null;

/**
 * Build a self-contained mutator: `literals` are JSON-serialised into the body
 * so the recorded patch replays without the closure it was created in.
 */
function mutator(literals, body) {
  const keys = Object.keys(literals);
  const preamble = keys.map((key) => `  const ${key} = ${JSON.stringify(literals[key])};`).join('\n');
  const source = `(db) => {\n${preamble ? `${preamble}\n` : ''}${body}\n}`;
  // eslint-disable-next-line no-new-func
  return new Function(`return (${source});`)();
}

/* ------------------------------------------------------------------ lookups */

export function repoByFullName(fullName) {
  const db = getDb();
  return db ? db.repos.find((r) => r.fullName.toLowerCase() === String(fullName || '').toLowerCase()) : null;
}

export function issuesFor(fullName) {
  const db = getDb();
  if (!db) return [];
  return db.issues.filter((i) => i.repoFullName === fullName);
}

export function pullsFor(fullName) {
  const db = getDb();
  if (!db) return [];
  return db.pullRequests.filter((p) => p.repoFullName === fullName);
}

export function issueByNumber(fullName, number) {
  return issuesFor(fullName).find((i) => i.number === Number(number)) || null;
}

export function pullByNumber(fullName, number) {
  return pullsFor(fullName).find((p) => p.number === Number(number)) || null;
}

export function commitsFor(fullName, branch) {
  const db = getDb();
  if (!db) return [];
  const list = db.commits.filter((c) => c.repoFullName === fullName);
  return branch ? list.filter((c) => c.branch === branch) : list;
}

export function commitBySha(fullName, sha) {
  const db = getDb();
  if (!db) return null;
  return db.commits.find((c) => c.repoFullName === fullName && (c.sha === sha || c.sha.startsWith(String(sha)))) || null;
}

export function commentsFor(targetType, targetId) {
  const db = getDb();
  if (!db) return [];
  return db.comments.filter((c) => c.targetType === targetType && c.targetId === targetId);
}

export function notifications() {
  const db = getDb();
  const login = myLogin();
  if (!db || !login) return [];
  return db.notifications.filter((n) => n.userLogin === login);
}

export function unreadCount() {
  return notifications().filter((n) => n.unread).length;
}

export function reposForOwner(login) {
  const db = getDb();
  if (!db) return [];
  const me = myLogin();
  const target = String(login || '').toLowerCase();
  return db.repos.filter((r) => r.ownerLogin.toLowerCase() === target)
    .filter((r) => r.visibility === 'public' || (me && r.ownerLogin.toLowerCase() === me.toLowerCase()));
}

/* --------------------------------------------------------------- repository */

export function toggleStar(fullName) {
  const login = myLogin();
  mutate(mutator({ fullName, login, at: nowIso() }, `
    const repo = db.repos.find((r) => r.fullName === fullName);
    if (!repo) return;
    const index = db.stars.findIndex((s) => s.repoFullName === fullName && s.userLogin === login);
    if (index >= 0) {
      db.stars.splice(index, 1);
      repo.stars = Math.max(0, (repo.stars || 0) - 1);
    } else {
      db.stars.unshift({ repoFullName: fullName, userLogin: login, starredAt: at });
      repo.stars = (repo.stars || 0) + 1;
    }
  `), 'star');
  return hasStarred(fullName);
}

export function hasStarred(fullName) {
  const db = getDb();
  const login = myLogin();
  if (!db || !login) return false;
  return db.stars.some((s) => s.repoFullName === fullName && s.userLogin === login);
}

export function starCount(fullName) {
  const repo = repoByFullName(fullName);
  return repo ? repo.stars : 0;
}

export function setWatch(fullName, level) {
  const login = myLogin();
  mutate(mutator({ fullName, login, level }, `
    const index = db.watches.findIndex((w) => w.repoFullName === fullName && w.userLogin === login);
    if (level === null) {
      if (index >= 0) db.watches.splice(index, 1);
      return;
    }
    if (index >= 0) {
      db.watches[index].level = level;
      db.watches[index].ignored = level === 'ignore';
    } else {
      db.watches.push({ repoFullName: fullName, userLogin: login, level, ignored: level === 'ignore' });
    }
  `), 'watch');
}

export function watchLevel(fullName) {
  const db = getDb();
  const login = myLogin();
  if (!db || !login) return null;
  const found = db.watches.find((w) => w.repoFullName === fullName && w.userLogin === login);
  return found ? found.level : null;
}

export function toggleFollow(login) {
  const me = myLogin();
  mutate(mutator({ login, me, at: nowIso() }, `
    const index = db.follows.findIndex((f) => f.userLogin === me && f.followsLogin === login);
    if (index >= 0) db.follows.splice(index, 1);
    else db.follows.push({ userLogin: me, followsLogin: login, createdAt: at });
  `), 'follow');
}

export function isFollowing(login) {
  const db = getDb();
  const me = myLogin();
  if (!db || !me) return false;
  return db.follows.some((f) => f.userLogin === me && f.followsLogin === login);
}

export function createRepository(payload) {
  const ownerLogin = payload.ownerLogin;
  const name = slugify(payload.name || 'new-repository').slice(0, 60) || 'new-repository';
  const fullName = `${ownerLogin}/${name}`;
  const id = `r-local-${Date.now().toString(36)}`;
  const description = payload.description || '';
  const visibility = payload.visibility || 'public';
  const license = payload.license || null;
  const initReadme = payload.initReadme !== false;
  const hasWiki = Boolean(payload.hasWiki);
  const hasDiscussions = Boolean(payload.hasDiscussions);
  const hasIssues = payload.hasIssues !== false;
  const at = nowIso();

  mutate(mutator({ ownerLogin, name, fullName, id, description, visibility, license, initReadme, hasWiki, hasDiscussions, hasIssues, at }, `
    if (db.repos.some((r) => r.fullName === fullName)) return;
    const readme = '# ' + name + '\\n\\n' + (description || 'A brand new RedGet repository.') + '\\n';
    const sha = '${shortId(40, `${fullName}:main`)}';
    db.repos.push({
      id, ownerLogin,
      ownerType: db.orgs.some((o) => o.login === ownerLogin) ? 'org' : 'user',
      name, fullName, description, visibility, defaultBranch: 'main',
      language: 'Markdown',
      languages: [{ name: 'Markdown', percent: 100, color: '#a29a9c' }],
      topics: [], homepage: null, license,
      stars: 0, forks: 0, watchers: 1, subscribers: 1,
      openIssues: 0, closedIssues: 0, openPulls: 0, closedPulls: 0, mergedPulls: 0,
      fork: false, forkParent: null, archived: false, mirror: false, template: false,
      createdAt: at, updatedAt: at, pushedAt: at, size: 12,
      hasIssues, hasWiki, hasPages: false, hasDiscussions, hasProjects: true, hasDownloads: true,
      allowForking: true, allowSquashMerge: true, allowMergeCommit: true, allowRebaseMerge: true,
      allowAutoMerge: true, allowUpdateBranch: true, deleteBranchOnMerge: true,
      useMergeQueue: false, mergeQueueConcurrency: 1, webCommitSignoffRequired: false,
      requireSignedCommits: false,
      securityAndAnalysis: { secretScanning: true, secretScanningPushProtection: true, dependabotAlerts: true, dependabotSecurityUpdates: false, codeScanning: false },
      primary: false,
      fileCount: initReadme ? 1 : 0, commitCount: initReadme ? 1 : 0,
      branchCount: 1, tagCount: 0, releaseCount: 0, discussionCount: 0,
      contributors: [ownerLogin], defaultBranchSha: sha,
      community: { healthPercentage: initReadme ? 44 : 12, files: {}, updatedAt: at },
      scorecard: { score: 2, checks: [] },
      sbom: { format: 'spdx-2.3', components: [], generatedAt: at },
    });
    db.branches.push({ name: 'main', repoFullName: fullName, sha, protected: false, aheadBy: 0, behindBy: 0, updatedAt: at, authorLogin: ownerLogin });
    if (initReadme) {
      db.commits.push({
        sha: '${shortId(40, `${fullName}:init`)}',
        shortSha: '${shortId(7, `${fullName}:init`)}',
        repoFullName: fullName, branch: 'main', message: 'Initial commit', body: '',
        authorLogin: ownerLogin, authorName: ownerLogin, authorEmail: ownerLogin + '@redget.local',
        committerLogin: ownerLogin, verified: true,
        additions: readme.split('\\n').length, deletions: 0, files: ['README.md'],
        date: at, parents: [], tree: [{ path: 'README.md', type: 'blob' }],
      });
      if (!db.localFiles) db.localFiles = [];
      db.localFiles.push({
        id: 'f-init-' + name, repoFullName: fullName, path: 'README.md', name: 'README.md',
        dir: '', branch: 'main', content: readme, binary: false, size: readme.length,
        lines: readme.split('\\n').length, message: 'Initial commit', authorLogin: ownerLogin,
        sha: '${shortId(40, `${fullName}:init`)}', committedAt: at, language: 'Markdown',
      });
    }
    db.watches.push({ repoFullName: fullName, userLogin: ownerLogin, level: 'all', ignored: false });
  `), 'repo:create');
  return fullName;
}

export function updateRepository(fullName, changes) {
  mutate(mutator({ fullName, changes, at: nowIso() }, `
    const repo = db.repos.find((r) => r.fullName === fullName);
    if (!repo) return;
    Object.assign(repo, changes, { updatedAt: at });
  `), 'repo:update');
}

export function deleteRepository(fullName) {
  mutate(mutator({ fullName }, `
    const index = db.repos.findIndex((r) => r.fullName === fullName);
    if (index >= 0) db.repos.splice(index, 1);
    db.issues = db.issues.filter((i) => i.repoFullName !== fullName);
    db.pullRequests = db.pullRequests.filter((p) => p.repoFullName !== fullName);
    db.comments = db.comments.filter((c) => c.repoFullName !== fullName);
    db.commits = db.commits.filter((c) => c.repoFullName !== fullName);
    db.branches = db.branches.filter((b) => b.repoFullName !== fullName);
    db.tags = db.tags.filter((t) => t.repoFullName !== fullName);
    db.labels = db.labels.filter((l) => l.repoFullName !== fullName);
    db.notifications = db.notifications.filter((n) => n.repoFullName !== fullName);
    db.stars = db.stars.filter((s) => s.repoFullName !== fullName);
    db.watches = db.watches.filter((w) => w.repoFullName !== fullName);
    db.forks = db.forks.filter((f) => f.repoFullName !== fullName);
    db.releases = db.releases.filter((r) => r.repoFullName !== fullName);
    db.runs = db.runs.filter((r) => r.repoFullName !== fullName);
    db.jobs = db.jobs.filter((j) => j.repoFullName !== fullName);
    db.workflows = db.workflows.filter((w) => w.repoFullName !== fullName);
  `), 'repo:delete');
}

export function transferRepository(fullName, newOwner) {
  const name = String(fullName).split('/')[1] || '';
  const next = `${newOwner}/${name}`;
  mutate(mutator({ fullName, next, newOwner }, `
    const repo = db.repos.find((r) => r.fullName === fullName);
    if (!repo) return;
    repo.ownerLogin = newOwner;
    repo.fullName = next;
    repo.ownerType = db.orgs.some((o) => o.login === newOwner) ? 'org' : 'user';
    const rename = (list) => list.forEach((item) => { if (item.repoFullName === fullName) item.repoFullName = next; });
    [db.issues, db.pullRequests, db.comments, db.commits, db.branches, db.tags, db.labels,
     db.notifications, db.stars, db.watches, db.forks, db.releases, db.runs, db.jobs,
     db.workflows, db.milestones, db.reviewThreads, db.checks].forEach(rename);
  `), 'repo:transfer');
  return next;
}

export function archiveRepository(fullName, archived) {
  updateRepository(fullName, { archived: Boolean(archived) });
}

/* ------------------------------------------------------------------- issues */

export function createIssue(fullName, payload) {
  const login = myLogin();
  const db = getDb();
  const siblings = db ? db.issues.filter((i) => i.repoFullName === fullName) : [];
  const pulls = db ? db.pullRequests.filter((p) => p.repoFullName === fullName) : [];
  const number = Math.max(0, ...siblings.map((i) => i.number), ...pulls.map((p) => p.number)) + 1;
  const id = `i-local-${Date.now().toString(36)}`;
  const title = String(payload.title || 'Untitled issue').slice(0, 200);
  const body = payload.body || '';
  const assignees = payload.assignees || [];
  const labelNames = payload.labels || [];
  const milestone = payload.milestone || null;
  const projects = payload.projects || [];
  const at = nowIso();
  const visibility = (repoByFullName(fullName) || {}).visibility || 'public';

  mutate(mutator({ fullName, login, number, id, title, body, assignees, labelNames, milestone, projects, at, visibility }, `
    const record = {
      id, repoFullName: fullName, number, title, body, state: 'open', stateReason: null,
      authorLogin: login, assignees,
      labels: labelNames.map((name) => {
        const found = db.labels.find((l) => l.repoFullName === fullName && l.name === name);
        return { name, color: found ? found.color : 'd61a2f', description: found ? found.description : '' };
      }),
      milestone, projects, reactions: {}, commentsCount: 0, locked: false, lockReason: null,
      pinned: false, createdAt: at, updatedAt: at, closedAt: null, closedByLogin: null,
      isPull: false, linkedPullRequests: [], subscribed: true, participants: [login],
      timeline: [{ id: 'tl-' + id + '-0', type: 'opened', actorLogin: login, createdAt: at }],
    };
    db.issues.unshift(record);
    const repo = db.repos.find((r) => r.fullName === fullName);
    if (repo) repo.openIssues = (repo.openIssues || 0) + 1;
    db.notifications.unshift({
      id: 'n-' + id, userLogin: login, repoFullName: fullName, type: 'Issue', title, number,
      reason: 'author', unread: false, updatedAt: at, lastReadAt: at,
      url: '/' + fullName + '/issues/' + number, pinned: false,
      repository: { fullName, visibility },
    });
    db.events.unshift({
      id: 'e-' + id, kind: 'IssuesEvent', actorLogin: login, repoFullName: fullName, createdAt: at,
      title: 'opened ' + fullName.split('/')[1] + '#' + number + ' ' + title,
      url: '/' + fullName + '/issues', public: visibility === 'public',
    });
  `), 'issue:create');
  return { id, number };
}

export function updateIssue(fullName, number, changes) {
  const actor = myLogin();
  const num = Number(number);
  const patch = { ...changes };
  mutate(mutator({ fullName, num, patch, actor, at: nowIso() }, `
    const issue = db.issues.find((i) => i.repoFullName === fullName && i.number === num);
    if (!issue) return;
    const prevState = issue.state;
    Object.assign(issue, patch, { updatedAt: at });
    if (patch.state && patch.state !== prevState) {
      const kind = patch.state === 'closed'
        ? (patch.stateReason === 'not_planned' ? 'closed-not-planned' : 'closed')
        : 'reopened';
      issue.timeline.push({ id: 'tl-' + issue.id + '-' + issue.timeline.length, type: kind, actorLogin: actor, createdAt: at });
      if (patch.state === 'closed') { issue.closedAt = at; issue.closedByLogin = actor; }
      else { issue.closedAt = null; issue.closedByLogin = null; }
      const repo = db.repos.find((r) => r.fullName === fullName);
      if (repo) {
        repo.openIssues = Math.max(0, (repo.openIssues || 0) + (patch.state === 'closed' ? -1 : 1));
        repo.closedIssues = Math.max(0, (repo.closedIssues || 0) + (patch.state === 'closed' ? 1 : -1));
      }
    }
  `), 'issue:update');
}

export function lockConversation(fullName, number, reason, locked = true) {
  const num = Number(number);
  mutate(mutator({ fullName, num, reason: reason || 'resolved', locked }, `
    const target = db.issues.find((i) => i.repoFullName === fullName && i.number === num)
      || db.pullRequests.find((p) => p.repoFullName === fullName && p.number === num);
    if (!target) return;
    target.locked = locked;
    target.lockReason = locked ? reason : null;
  `), 'issue:lock');
}

export function pinIssue(fullName, number, pinned = true) {
  const num = Number(number);
  mutate(mutator({ fullName, num, pinned }, `
    const issue = db.issues.find((i) => i.repoFullName === fullName && i.number === num);
    if (!issue) return;
    if (pinned) db.issues.forEach((i) => { if (i.repoFullName === fullName) i.pinned = i.number === num; });
    else issue.pinned = false;
  `), 'issue:pin');
}

export function transferIssue(fullName, number, targetRepo) {
  const actor = myLogin();
  const num = Number(number);
  const db = getDb();
  const siblings = db ? db.issues.filter((i) => i.repoFullName === targetRepo) : [];
  const nextNumber = Math.max(0, ...siblings.map((i) => i.number)) + 1;
  mutate(mutator({ fullName, num, targetRepo, nextNumber, actor, at: nowIso() }, `
    const issue = db.issues.find((i) => i.repoFullName === fullName && i.number === num);
    if (!issue) return;
    const oldId = issue.id;
    issue.repoFullName = targetRepo;
    issue.number = nextNumber;
    issue.updatedAt = at;
    issue.timeline.push({ id: 'tl-' + oldId + '-transfer', type: 'transferred', actorLogin: actor, from: fullName, to: targetRepo, createdAt: at });
    db.comments.forEach((c) => { if (c.targetId === oldId) c.repoFullName = targetRepo; });
  `), 'issue:transfer');
}

export function react(targetType, targetId, content) {
  const login = myLogin();
  mutate(mutator({ targetType, targetId, content, login }, `
    const target = targetType === 'comment'
      ? db.comments.find((c) => c.id === targetId)
      : db.issues.find((i) => i.id === targetId) || db.pullRequests.find((p) => p.id === targetId)
        || db.discussions.find((d) => d.id === targetId) || db.releases.find((r) => r.id === targetId);
    if (!target) return;
    if (!target.reactions) target.reactions = {};
    const index = db.reactions.findIndex((r) => r.targetType === targetType && r.targetId === targetId && r.userLogin === login && r.content === content);
    if (index >= 0) {
      db.reactions.splice(index, 1);
      target.reactions[content] = Math.max(0, (target.reactions[content] || 0) - 1);
      if (!target.reactions[content]) delete target.reactions[content];
    } else {
      db.reactions.push({ id: 'r-' + Date.now().toString(36) + '-' + content, targetType, targetId, userLogin: login, content });
      target.reactions[content] = (target.reactions[content] || 0) + 1;
    }
  `), 'reaction');
}

export function addComment(targetType, targetId, body, extra = {}) {
  const login = myLogin();
  const id = `c-local-${Date.now().toString(36)}`;
  const repoFullName = extra.repoFullName || null;
  mutate(mutator({ targetType, targetId, body, login, id, repoFullName, at: nowIso() }, `
    const record = {
      id, targetType, targetId, repoFullName, authorLogin: login, body,
      createdAt: at, updatedAt: at, reactions: {}, minimized: false, isAnswer: false,
    };
    db.comments.push(record);
    db.timeline.push({ id: 'tl-' + id, type: 'commented', actorLogin: login, targetType, targetId, createdAt: at });
    if (targetType === 'issue') {
      const issue = db.issues.find((i) => i.id === targetId);
      if (issue) {
        issue.commentsCount = (issue.commentsCount || 0) + 1;
        issue.updatedAt = at;
        if (issue.participants.indexOf(login) < 0) issue.participants.push(login);
        issue.timeline.push({ id: 'tl-' + issue.id + '-' + issue.timeline.length, type: 'commented', actorLogin: login, createdAt: at });
      }
    } else if (targetType === 'pull') {
      const pr = db.pullRequests.find((p) => p.id === targetId);
      if (pr) { pr.commentsCount = (pr.commentsCount || 0) + 1; pr.updatedAt = at; }
    } else if (targetType === 'discussion') {
      const discussion = db.discussions.find((d) => d.id === targetId);
      if (discussion) { discussion.comments = (discussion.comments || 0) + 1; discussion.updatedAt = at; }
    } else if (targetType === 'commit') {
      const commit = db.commits.find((c) => c.sha === targetId);
      if (commit) commit.commentsCount = (commit.commentsCount || 0) + 1;
    }
  `), 'comment:add');
  return id;
}

export function updateComment(commentId, body) {
  mutate(mutator({ commentId, body, at: nowIso() }, `
    const comment = db.comments.find((c) => c.id === commentId);
    if (!comment) return;
    comment.body = body;
    comment.updatedAt = at;
  `), 'comment:update');
}

export function deleteComment(commentId) {
  mutate(mutator({ commentId }, `
    const index = db.comments.findIndex((c) => c.id === commentId);
    if (index >= 0) db.comments.splice(index, 1);
  `), 'comment:delete');
}

export function minimizeComment(commentId, minimized = true) {
  mutate(mutator({ commentId, minimized }, `
    const comment = db.comments.find((c) => c.id === commentId);
    if (comment) comment.minimized = minimized;
  `), 'comment:minimize');
}

export function saveReply(title, body) {
  const id = `sr-local-${Date.now().toString(36)}`;
  mutate(mutator({ id, title, body }, `
    db.savedReplies.push({ id, title, body });
  `), 'saved-reply');
  return id;
}

export function deleteSavedReply(id) {
  mutate(mutator({ id }, `
    const index = db.savedReplies.findIndex((r) => r.id === id);
    if (index >= 0) db.savedReplies.splice(index, 1);
  `), 'saved-reply');
}

/* ------------------------------------------------------------------ labels */

export function createLabel(fullName, payload) {
  const id = `l-local-${Date.now().toString(36)}`;
  const name = String(payload.name || 'label').slice(0, 50);
  const color = String(payload.color || 'd61a2f').replace(/^#/, '').slice(0, 6);
  const description = payload.description || '';
  mutate(mutator({ id, fullName, name, color, description }, `
    db.labels.push({ id, repoFullName: fullName, name, color, description, default: false });
  `), 'label');
  return id;
}

export function updateLabel(id, changes) {
  const patch = { ...changes };
  if (patch.color) patch.color = String(patch.color).replace(/^#/, '').slice(0, 6);
  mutate(mutator({ id, patch }, `
    const label = db.labels.find((l) => l.id === id);
    if (label) Object.assign(label, patch);
  `), 'label');
}

export function deleteLabel(id) {
  mutate(mutator({ id }, `
    const index = db.labels.findIndex((l) => l.id === id);
    if (index >= 0) db.labels.splice(index, 1);
  `), 'label');
}

export function createMilestone(fullName, payload) {
  const id = `m-local-${Date.now().toString(36)}`;
  const title = String(payload.title || 'Milestone').slice(0, 120);
  const description = payload.description || '';
  const dueOn = payload.dueOn || null;
  const creatorLogin = myLogin();
  mutate(mutator({ id, fullName, title, description, dueOn, creatorLogin, at: nowIso() }, `
    db.milestones.push({
      id, repoFullName: fullName, title, description, state: 'open', dueOn,
      createdAt: at, creatorLogin, openIssues: 0, closedIssues: 0,
    });
  `), 'milestone');
  return id;
}

export function updateMilestone(id, changes) {
  const patch = { ...changes };
  mutate(mutator({ id, patch }, `
    const milestone = db.milestones.find((m) => m.id === id);
    if (milestone) Object.assign(milestone, patch);
  `), 'milestone');
}

/* ------------------------------------------------------------- pull requests */

export function createPullRequest(fullName, payload) {
  const login = myLogin();
  const db = getDb();
  const siblings = db ? db.pullRequests.filter((p) => p.repoFullName === fullName) : [];
  const issues = db ? db.issues.filter((i) => i.repoFullName === fullName) : [];
  const number = Math.max(0, ...siblings.map((p) => p.number), ...issues.map((i) => i.number)) + 1;
  const id = `pr-local-${Date.now().toString(36)}`;
  const title = String(payload.title || 'Untitled pull request').slice(0, 200);
  const body = payload.body || '';
  const headBranch = payload.headBranch || 'new-branch';
  const baseBranch = payload.baseBranch || 'main';
  const draft = Boolean(payload.draft);
  const at = nowIso();

  mutate(mutator({ fullName, login, number, id, title, body, headBranch, baseBranch, draft, at }, `
    db.pullRequests.unshift({
      id, repoFullName: fullName, number, title, body, state: 'open', merged: false, draft,
      authorLogin: login, headBranch, baseBranch,
      headSha: '${shortId(40, `${id}:head`)}',
      baseSha: '${shortId(40, `${id}:base`)}',
      mergeableState: 'clean',
      additions: 0, deletions: 0, changedFiles: 0, labels: [], assignees: [login],
      reviewers: [], milestone: null, projects: [], commentsCount: 0, reactions: {},
      createdAt: at, updatedAt: at, mergedAt: null, mergedByLogin: null, mergeMethod: null,
      closedAt: null, autoMerge: null, linkedIssues: [], commits: 1, viewedFiles: [],
      timeline: [{ id: 'tl-' + id + '-0', type: draft ? 'created-draft' : 'opened', actorLogin: login, createdAt: at }],
    });
    const repo = db.repos.find((r) => r.fullName === fullName);
    if (repo) repo.openPulls = (repo.openPulls || 0) + 1;
  `), 'pull:create');
  return { id, number };
}

export function setDraft(fullName, number, draft) {
  const actor = myLogin();
  const num = Number(number);
  mutate(mutator({ fullName, num, draft, actor, at: nowIso() }, `
    const pr = db.pullRequests.find((p) => p.repoFullName === fullName && p.number === num);
    if (!pr) return;
    pr.draft = draft;
    pr.updatedAt = at;
    pr.timeline.push({ id: 'tl-' + pr.id + '-' + pr.timeline.length, type: draft ? 'convert-to-draft' : 'ready-for-review', actorLogin: actor, createdAt: at });
  `), 'pull:draft');
}

export function mergePullRequest(fullName, number, method = 'merge') {
  const actor = myLogin();
  const num = Number(number);
  mutate(mutator({ fullName, num, method, actor, at: nowIso() }, `
    const pr = db.pullRequests.find((p) => p.repoFullName === fullName && p.number === num);
    if (!pr) return;
    pr.merged = true;
    pr.state = 'closed';
    pr.mergedAt = at;
    pr.mergedByLogin = actor;
    pr.mergeMethod = method;
    pr.autoMerge = null;
    pr.updatedAt = at;
    pr.timeline.push({ id: 'tl-' + pr.id + '-merged', type: 'merged', actorLogin: actor, method, createdAt: at });
    const repo = db.repos.find((r) => r.fullName === fullName);
    if (repo) {
      repo.openPulls = Math.max(0, (repo.openPulls || 0) - 1);
      repo.mergedPulls = (repo.mergedPulls || 0) + 1;
    }
    db.notifications.forEach((n) => {
      if (n.repoFullName === fullName && n.number === num) { n.unread = false; n.lastReadAt = at; }
    });
  `), 'pull:merge');
}

export function closePullRequest(fullName, number, reopen = false) {
  const actor = myLogin();
  const num = Number(number);
  mutate(mutator({ fullName, num, reopen, actor, at: nowIso() }, `
    const pr = db.pullRequests.find((p) => p.repoFullName === fullName && p.number === num);
    if (!pr) return;
    pr.state = reopen ? 'open' : 'closed';
    pr.closedAt = reopen ? null : at;
    pr.updatedAt = at;
    pr.timeline.push({ id: 'tl-' + pr.id + '-' + pr.timeline.length, type: reopen ? 'reopened' : 'closed', actorLogin: actor, createdAt: at });
    const repo = db.repos.find((r) => r.fullName === fullName);
    if (repo) {
      repo.openPulls = Math.max(0, (repo.openPulls || 0) + (reopen ? 1 : -1));
      repo.closedPulls = Math.max(0, (repo.closedPulls || 0) + (reopen ? -1 : 1));
    }
  `), 'pull:close');
}

export function setAutoMerge(fullName, number, method) {
  const num = Number(number);
  mutate(mutator({ fullName, num, method, at: nowIso() }, `
    const pr = db.pullRequests.find((p) => p.repoFullName === fullName && p.number === num);
    if (!pr) return;
    pr.autoMerge = method ? { method, enabledAt: at } : null;
  `), 'pull:auto-merge');
}

export function submitReview(fullName, number, review) {
  const actor = myLogin();
  const num = Number(number);
  const id = `rev-local-${Date.now().toString(36)}`;
  const state = review.state || 'comment';
  const body = review.body || '';
  const at = nowIso();
  mutate(mutator({ fullName, num, id, state, body, actor, at }, `
    const pr = db.pullRequests.find((p) => p.repoFullName === fullName && p.number === num);
    if (!pr) return;
    db.reviews.push({
      id, pullRequestId: pr.id, repoFullName: fullName, authorLogin: actor,
      state: state === 'approve' ? 'APPROVED' : state === 'changes' ? 'CHANGES_REQUESTED' : 'COMMENTED',
      body, submittedAt: at, commitSha: pr.headSha, dismissed: false,
    });
    pr.timeline.push({
      id: 'tl-' + pr.id + '-review-' + id,
      type: state === 'approve' ? 'approved' : state === 'changes' ? 'changes-requested' : 'reviewed',
      actorLogin: actor, createdAt: at,
    });
    if (state === 'changes') pr.mergeableState = 'blocked';
    else if (state === 'approve' && pr.mergeableState === 'blocked') pr.mergeableState = 'clean';
    pr.updatedAt = at;
  `), 'pull:review');
  return id;
}

export function dismissReview(reviewId) {
  mutate(mutator({ reviewId }, `
    const review = db.reviews.find((r) => r.id === reviewId);
    if (review) review.dismissed = true;
  `), 'pull:review');
}

export function addReviewThread(fullName, number, payload) {
  const actor = myLogin();
  const num = Number(number);
  const id = `th-local-${Date.now().toString(36)}`;
  const path = payload.path;
  const side = payload.side || 'RIGHT';
  const oldNo = payload.oldNo != null ? payload.oldNo : null;
  const newNo = payload.newNo != null ? payload.newNo : null;
  const body = payload.body || '';
  const suggestion = payload.suggestion || null;
  const at = nowIso();
  mutate(mutator({ fullName, num, id, path, side, oldNo, newNo, body, suggestion, actor, at }, `
    const pr = db.pullRequests.find((p) => p.repoFullName === fullName && p.number === num);
    if (!pr) return;
    db.reviewThreads.push({
      id, pullRequestId: pr.id, repoFullName: fullName, path, side, oldNo, newNo,
      resolved: false, authorLogin: actor, body, suggestion, suggestionApplied: false,
      createdAt: at, replies: [],
    });
  `), 'pull:thread');
  return id;
}

export function replyToThread(threadId, body) {
  const actor = myLogin();
  mutate(mutator({ threadId, body, actor, at: nowIso() }, `
    const thread = db.reviewThreads.find((t) => t.id === threadId);
    if (!thread) return;
    thread.replies.push({ authorLogin: actor, body, createdAt: at });
  `), 'pull:thread');
}

export function resolveThread(threadId, resolved = true) {
  mutate(mutator({ threadId, resolved }, `
    const thread = db.reviewThreads.find((t) => t.id === threadId);
    if (thread) thread.resolved = resolved;
  `), 'pull:thread');
}

export function applySuggestionToThread(threadId) {
  mutate(mutator({ threadId }, `
    const thread = db.reviewThreads.find((t) => t.id === threadId);
    if (thread) { thread.suggestionApplied = true; thread.resolved = true; }
  `), 'pull:thread');
}

export function markFileViewed(fullName, number, path, viewed) {
  const num = Number(number);
  mutate(mutator({ fullName, num, path, viewed }, `
    const pr = db.pullRequests.find((p) => p.repoFullName === fullName && p.number === num);
    if (!pr) return;
    if (!pr.viewedFiles) pr.viewedFiles = [];
    const index = pr.viewedFiles.indexOf(path);
    if (viewed && index < 0) pr.viewedFiles.push(path);
    if (!viewed && index >= 0) pr.viewedFiles.splice(index, 1);
  `), 'pull:viewed');
}

/* -------------------------------------------------------------- notifications */

export function markNotificationRead(id, read = true) {
  mutate(mutator({ id, read, at: nowIso() }, `
    const item = db.notifications.find((n) => n.id === id);
    if (!item) return;
    item.unread = !read;
    item.lastReadAt = read ? at : null;
  `), 'notification');
}

export function markRepoNotificationsRead(fullName) {
  mutate(mutator({ fullName, at: nowIso() }, `
    db.notifications.forEach((n) => {
      if (n.repoFullName === fullName && n.unread) { n.unread = false; n.lastReadAt = at; }
    });
  `), 'notification');
}

export function markAllNotificationsRead() {
  mutate(mutator({ at: nowIso() }, `
    db.notifications.forEach((n) => { n.unread = false; n.lastReadAt = at; });
  `), 'notification');
}

export function deleteNotification(id) {
  mutate(mutator({ id }, `
    const index = db.notifications.findIndex((n) => n.id === id);
    if (index >= 0) db.notifications.splice(index, 1);
  `), 'notification');
}

export function togglePinNotification(id) {
  mutate(mutator({ id }, `
    const item = db.notifications.find((n) => n.id === id);
    if (item) item.pinned = !item.pinned;
  `), 'notification');
}

/* ------------------------------------------------------------------- actions */

export function rerunWorkflow(runId, failedOnly = false) {
  const id = String(runId);
  mutate(mutator({ id, failedOnly, at: nowIso() }, `
    const run = db.runs.find((r) => r.id === id);
    if (!run) return;
    run.status = 'queued';
    run.conclusion = null;
    run.attempt = (run.attempt || 1) + 1;
    run.updatedAt = at;
    db.jobs.forEach((job) => {
      if (job.runId !== id) return;
      if (failedOnly && job.conclusion === 'success') return;
      job.status = 'queued';
      job.conclusion = null;
    });
  `), 'actions:rerun');
}

export function cancelWorkflow(runId) {
  const id = String(runId);
  mutate(mutator({ id, at: nowIso() }, `
    const run = db.runs.find((r) => r.id === id);
    if (!run) return;
    run.status = 'completed';
    run.conclusion = 'cancelled';
    run.updatedAt = at;
    db.jobs.forEach((job) => {
      if (job.runId !== id) return;
      if (job.status !== 'completed') { job.status = 'completed'; job.conclusion = 'cancelled'; }
    });
  `), 'actions:cancel');
}

export function deleteWorkflowRun(runId) {
  const id = String(runId);
  mutate(mutator({ id }, `
    db.runs = db.runs.filter((r) => r.id !== id);
    db.jobs = db.jobs.filter((j) => j.runId !== id);
  `), 'actions:delete-run');
}

export function setWorkflowState(workflowId, fullName, workflowState) {
  mutate(mutator({ workflowId, fullName, workflowState }, `
    const workflow = db.workflows.find((w) => w.id === workflowId && w.repoFullName === fullName);
    if (workflow) workflow.state = workflowState;
  `), 'actions:workflow');
}

export function saveSecret(scope, fullName, payload) {
  const id = `sec-local-${Date.now().toString(36)}`;
  const name = String(payload.name || '').toUpperCase().slice(0, 60);
  const environments = payload.environments || [];
  mutate(mutator({ id, scope, fullName, name, environments, at: nowIso() }, `
    const existing = db.secrets.find((s) => s.name === name && s.repoFullName === fullName && s.scope === scope);
    if (existing) { existing.updatedAt = at; return; }
    db.secrets.push({ id, name, scope, repoFullName: fullName, updatedAt: at, environments });
  `), 'actions:secret');
  return id;
}

export function deleteSecret(id) {
  mutate(mutator({ id }, `
    const index = db.secrets.findIndex((s) => s.id === id);
    if (index >= 0) db.secrets.splice(index, 1);
  `), 'actions:secret');
}

export function saveVariable(fullName, payload) {
  const id = `var-local-${Date.now().toString(36)}`;
  const name = String(payload.name || '').slice(0, 60);
  const value = String(payload.value == null ? '' : payload.value);
  mutate(mutator({ id, fullName, name, value, at: nowIso() }, `
    const existing = db.variables.find((v) => v.name === name && v.repoFullName === fullName);
    if (existing) { existing.value = value; existing.updatedAt = at; return; }
    db.variables.push({ id, name, value, scope: 'repository', repoFullName: fullName, updatedAt: at });
  `), 'actions:variable');
  return id;
}

export function deleteVariable(id) {
  mutate(mutator({ id }, `
    const index = db.variables.findIndex((v) => v.id === id);
    if (index >= 0) db.variables.splice(index, 1);
  `), 'actions:variable');
}

export function deleteCache(id) {
  mutate(mutator({ id }, `
    const index = db.caches.findIndex((c) => c.id === id);
    if (index >= 0) db.caches.splice(index, 1);
  `), 'actions:cache');
}

export function deleteArtifact(id) {
  mutate(mutator({ id }, `
    const index = db.artifacts.findIndex((a) => a.id === id);
    if (index >= 0) db.artifacts.splice(index, 1);
    db.runs.forEach((run) => { run.artifacts = (run.artifacts || []).filter((a) => a.id !== id); });
  `), 'actions:artifact');
}

export function removeRunner(id) {
  mutate(mutator({ id }, `
    const index = db.runners.findIndex((r) => r.id === id);
    if (index >= 0) db.runners.splice(index, 1);
  `), 'actions:runner');
}

/* ------------------------------------------------------------------ projects */

export function createProject(fullName, payload) {
  const db = getDb();
  const number = db ? db.projects.length + 1 : 1;
  const id = `p-local-${Date.now().toString(36)}`;
  const title = String(payload.title || 'New project').slice(0, 120);
  const description = payload.description || '';
  const visibility = payload.visibility || 'public';
  mutate(mutator({ id, number, title, description, visibility, fullName }, `
    db.projects.push({
      id, number, title, description, visibility, closed: false, repoFullName: fullName,
      fields: [
        { id: 'f-title', name: 'Title', type: 'title' },
        { id: 'f-status', name: 'Status', type: 'single_select', options: [
          { id: 's-backlog', name: 'Backlog', color: 'gray' },
          { id: 's-todo', name: 'Todo', color: 'accent' },
          { id: 's-done', name: 'Done', color: 'success' },
        ] },
      ],
      views: [{ id: 'v-board', name: 'Board', layout: 'board', groupBy: 'f-status', sortBy: 'priority', filter: '' }],
    });
  `), 'project:create');
  return id;
}

export function addProjectItem(projectId, payload) {
  const id = `pi-local-${Date.now().toString(36)}`;
  const title = String(payload.title || 'New item').slice(0, 200);
  const type = payload.type || 'draft';
  const ref = payload.ref || null;
  const repoFullName = payload.repoFullName || null;
  const number = payload.number != null ? Number(payload.number) : null;
  mutate(mutator({ id, projectId, title, type, ref, repoFullName, number, at: nowIso() }, `
    const project = db.projects.find((p) => p.id === projectId);
    const fields = {};
    if (project) {
      project.fields.forEach((field) => {
        if (field.type === 'single_select' && field.options.length) fields[field.id] = field.options[0].id;
      });
    }
    db.projectItems.push({ id, projectId, type, ref, title, repoFullName, number, fields, archived: false, updatedAt: at });
  `), 'project:item');
  return id;
}

export function moveProjectItem(itemId, fields) {
  const patch = { ...fields };
  mutate(mutator({ itemId, patch, at: nowIso() }, `
    const item = db.projectItems.find((i) => i.id === itemId);
    if (!item) return;
    Object.assign(item.fields, patch);
    item.updatedAt = at;
  `), 'project:item');
}

export function removeProjectItem(itemId) {
  mutate(mutator({ itemId }, `
    const index = db.projectItems.findIndex((i) => i.id === itemId);
    if (index >= 0) db.projectItems.splice(index, 1);
  `), 'project:item');
}

/* -------------------------------------------------------------------- wiki */

export function saveWikiPage(fullName, payload) {
  const slug = slugify(payload.title || 'Untitled page');
  const id = `w-local-${Date.now().toString(36)}`;
  const title = String(payload.title || 'Untitled page').slice(0, 120);
  const format = payload.format || 'markdown';
  const body = payload.body || '';
  const message = payload.message || 'Created the page';
  const author = myLogin();
  const at = nowIso();
  mutate(mutator({ id, fullName, slug, title, format, body, message, author, at }, `
    if (!db.localWikiPages) db.localWikiPages = [];
    const record = { id, repoFullName: fullName, title, slug, format, body, authorLogin: author, createdAt: at, updatedAt: at, local: true };
    const index = db.localWikiPages.findIndex((p) => p.repoFullName === fullName && p.slug === slug);
    if (index >= 0) db.localWikiPages[index] = Object.assign({}, db.localWikiPages[index], record, { createdAt: db.localWikiPages[index].createdAt });
    else db.localWikiPages.push(record);
    db.wikiHistory.unshift({ id: 'wh-' + id, pageId: id, repoFullName: fullName, title, authorLogin: author, message, createdAt: at });
  `), 'wiki:save');
  return { id, slug };
}

export function deleteWikiPage(fullName, slug) {
  mutate(mutator({ fullName, slug }, `
    if (!db.localWikiPages) return;
    db.localWikiPages = db.localWikiPages.filter((p) => !(p.repoFullName === fullName && p.slug === slug));
  `), 'wiki:delete');
}

/* ------------------------------------------------------------------ security */

export function setDependabotAlertState(alertId, alertState, reason = null) {
  mutate(mutator({ alertId, alertState, reason: reason || 'tolerable_risk', at: nowIso() }, `
    const alert = db.dependabotAlerts.find((a) => a.id === alertId);
    if (!alert) return;
    alert.state = alertState;
    alert.dismissedAt = alertState === 'dismissed' ? at : null;
    alert.dismissedReason = alertState === 'dismissed' ? reason : null;
    if (alertState === 'fixed') alert.fixStartedAt = at;
  `), 'security:dependabot');
}

export function setCodeScanningState(alertId, alertState, reason = null) {
  mutate(mutator({ alertId, alertState, reason: reason || 'used in tests', at: nowIso() }, `
    const alert = db.codeScanningAlerts.find((a) => a.id === alertId);
    if (!alert) return;
    alert.state = alertState;
    alert.dismissedReason = alertState === 'dismissed' ? reason : null;
    alert.dismissedAt = alertState === 'dismissed' ? at : null;
    alert.fixedAt = alertState === 'fixed' ? at : null;
  `), 'security:code-scanning');
}

export function setSecretScanningState(alertId, alertState, resolution = null) {
  mutate(mutator({ alertId, alertState, resolution: resolution || 'revoked', at: nowIso() }, `
    const alert = db.secretScanningAlerts.find((a) => a.id === alertId);
    if (!alert) return;
    alert.state = alertState;
    alert.resolution = alertState === 'resolved' ? resolution : null;
    alert.resolvedAt = alertState === 'resolved' ? at : null;
    alert.dismissedReason = alertState === 'dismissed' ? 'used_in_tests' : null;
  `), 'security:secret-scanning');
}

export function publishAdvisory(advisoryId) {
  mutate(mutator({ advisoryId, at: nowIso() }, `
    const advisory = db.advisories.find((a) => a.id === advisoryId);
    if (!advisory) return;
    advisory.state = 'published';
    advisory.publishedAt = at;
  `), 'security:advisory');
}

/* ------------------------------------------------------------------- releases */

export function publishRelease(fullName, payload) {
  const id = `rel-local-${Date.now().toString(36)}`;
  const tagName = String(payload.tagName || 'v0.0.1').slice(0, 60);
  const name = payload.name || tagName;
  const body = payload.body || '';
  const draft = Boolean(payload.draft);
  const prerelease = Boolean(payload.prerelease);
  const targetCommitish = payload.targetCommitish || 'main';
  const author = myLogin();
  const at = nowIso();
  const tagSha = shortId(40, `${id}:tag`);
  mutate(mutator({ id, fullName, tagName, name, body, draft, prerelease, targetCommitish, author, at, tagSha }, `
    db.releases.forEach((r) => { if (r.repoFullName === fullName) r.latest = false; });
    db.releases.unshift({
      id, repoFullName: fullName, tagName, targetCommitish, name, draft, prerelease,
      authorLogin: author, createdAt: at, publishedAt: draft ? null : at, body,
      reactions: {}, latest: !draft, assets: [],
    });
    if (!draft) {
      db.tags.unshift({ name: tagName, repoFullName: fullName, sha: tagSha, date: at, authorLogin: author, verified: true });
      const repo = db.repos.find((r) => r.fullName === fullName);
      if (repo) { repo.releaseCount = (repo.releaseCount || 0) + 1; repo.tagCount = (repo.tagCount || 0) + 1; }
    }
  `), 'release');
  return id;
}

export function updateRelease(releaseId, changes) {
  const patch = { ...changes };
  mutate(mutator({ releaseId, patch }, `
    const release = db.releases.find((r) => r.id === releaseId);
    if (release) Object.assign(release, patch);
  `), 'release');
}

export function deleteRelease(releaseId) {
  mutate(mutator({ releaseId }, `
    const index = db.releases.findIndex((r) => r.id === releaseId);
    if (index >= 0) db.releases.splice(index, 1);
  `), 'release');
}

/* ---------------------------------------------------------------- discussions */

export function createDiscussion(fullName, payload) {
  const db = getDb();
  const siblings = db ? db.discussions.filter((d) => d.repoFullName === fullName) : [];
  const number = Math.max(0, ...siblings.map((d) => d.number)) + 1;
  const id = `d-local-${Date.now().toString(36)}`;
  const title = String(payload.title || 'New discussion').slice(0, 200);
  const category = payload.category || 'Ideas';
  const body = payload.body || '';
  const author = myLogin();
  const at = nowIso();
  mutate(mutator({ id, fullName, number, title, category, body, author, at }, `
    db.discussions.unshift({
      id, repoFullName: fullName, number, title, category, body, authorLogin: author,
      comments: 0, upvotes: 0, answered: false, locked: false, createdAt: at, updatedAt: at, poll: null,
    });
    const repo = db.repos.find((r) => r.fullName === fullName);
    if (repo) repo.discussionCount = (repo.discussionCount || 0) + 1;
  `), 'discussion:create');
  return id;
}

export function voteDiscussion(discussionId, up = true) {
  mutate(mutator({ discussionId, up }, `
    const discussion = db.discussions.find((d) => d.id === discussionId);
    if (!discussion) return;
    discussion.upvotes = Math.max(0, (discussion.upvotes || 0) + (up ? 1 : -1));
  `), 'discussion:vote');
}

/* ------------------------------------------------------------------- settings */

export function updateSettings(section, changes) {
  const patch = { ...changes };
  mutate(mutator({ section, patch }, `
    if (!db.localSettings) db.localSettings = {};
    db.localSettings[section] = Object.assign({}, db.localSettings[section], patch);
  `), 'settings');
}

export function localSettings(section) {
  const db = getDb();
  return (db && db.localSettings && db.localSettings[section]) || {};
}

export function updateBranchProtection(fullName, ruleId, changes) {
  const patch = { ...changes };
  mutate(mutator({ fullName, ruleId, patch }, `
    const entry = db.branchProtection.find((b) => b.repoFullName === fullName);
    if (!entry) return;
    const rule = entry.rules.find((r) => r.id === ruleId);
    if (rule) Object.assign(rule, patch);
  `), 'settings:branch-protection');
}

export function addBranchProtectionRule(fullName, pattern) {
  const id = `bp-local-${Date.now().toString(36)}`;
  mutate(mutator({ id, fullName, pattern }, `
    let entry = db.branchProtection.find((b) => b.repoFullName === fullName);
    if (!entry) {
      entry = { repoFullName: fullName, rules: [], rulesets: [] };
      db.branchProtection.push(entry);
    }
    entry.rules.push({
      id, pattern, requiredReviews: 1, dismissStaleReviews: true, requireCodeOwnerReviews: false,
      requireLastPushApproval: false, requiredStatusChecks: [], strictStatusChecks: true,
      requireSignedCommits: false, requireLinearHistory: false, allowForcePushes: false,
      allowDeletions: false, requiredDeployments: [], enforceAdmins: false,
      restrictions: { users: [], teams: [] },
      pushRules: { maxFileSize: 100, blockForcePush: true, requireWorktree: false },
    });
  `), 'settings:branch-protection');
  return id;
}

export function deleteBranchProtectionRule(fullName, ruleId) {
  mutate(mutator({ fullName, ruleId }, `
    const entry = db.branchProtection.find((b) => b.repoFullName === fullName);
    if (!entry) return;
    entry.rules = entry.rules.filter((r) => r.id !== ruleId);
  `), 'settings:branch-protection');
}

export function saveWebhook(fullName, payload) {
  const id = `wh-local-${Date.now().toString(36)}`;
  const url = String(payload.url || '/hooks/new').slice(0, 200);
  const contentType = payload.contentType || 'json';
  const events = payload.events || ['push'];
  const ssl = payload.ssl !== false;
  const hasSecret = Boolean(payload.secret);
  mutate(mutator({ id, fullName, url, contentType, events, ssl, hasSecret, at: nowIso() }, `
    if (!db.webhooks) db.webhooks = [];
    db.webhooks.push({
      id, repoFullName: fullName, url, contentType, events, active: true, ssl,
      secret: hasSecret ? '••••••••' : null, lastDelivery: null, code: null, createdAt: at,
    });
  `), 'settings:webhook');
  return id;
}

export function deleteWebhook(id) {
  mutate(mutator({ id }, `
    if (!db.webhooks) return;
    db.webhooks = db.webhooks.filter((w) => w.id !== id);
  `), 'settings:webhook');
}

export function addCollaborator(fullName, login, permission = 'write') {
  const id = `co-local-${Date.now().toString(36)}`;
  mutate(mutator({ id, fullName, login, permission, at: nowIso() }, `
    if (!db.collaborators) db.collaborators = [];
    if (db.collaborators.some((c) => c.repoFullName === fullName && c.login === login)) return;
    db.collaborators.push({ id, repoFullName: fullName, login, permission, invitedAt: at, accepted: false });
  `), 'settings:collaborator');
  return id;
}

export function removeCollaborator(id) {
  mutate(mutator({ id }, `
    if (!db.collaborators) return;
    db.collaborators = db.collaborators.filter((c) => c.id !== id);
  `), 'settings:collaborator');
}

export function collaboratorsFor(fullName) {
  const db = getDb();
  return (db && db.collaborators ? db.collaborators : []).filter((c) => c.repoFullName === fullName);
}

export function webhooksFor(fullName) {
  const db = getDb();
  return (db && db.webhooks ? db.webhooks : []).filter((w) => w.repoFullName === fullName);
}

/* --------------------------------------------------------------- profile/org */

export function updateProfile(changes) {
  const login = myLogin();
  const patch = { ...changes };
  mutate(mutator({ login, patch }, `
    const user = db.users.find((u) => u.login === login);
    if (!user) return;
    Object.assign(user, patch);
  `), 'profile');
}

export function setStatus(emoji, message, busy = false, expires = null) {
  const login = myLogin();
  const status = emoji || message
    ? { emoji: emoji || '', message: message || '', busy: Boolean(busy), until: expires || null }
    : null;
  mutate(mutator({ login, status }, `
    const user = db.users.find((u) => u.login === login);
    if (user) user.status = status;
  `), 'profile:status');
}

export function togglePinnedRepo(fullName) {
  const login = myLogin();
  mutate(mutator({ login, fullName }, `
    const index = db.pinned.findIndex((p) => p.userLogin === login && p.repoFullName === fullName);
    if (index >= 0) db.pinned.splice(index, 1);
    else db.pinned.push({ userLogin: login, repoFullName: fullName });
  `), 'profile:pinned');
}

export function pinnedRepos(login) {
  const db = getDb();
  if (!db) return [];
  return db.pinned.filter((p) => p.userLogin === login)
    .map((p) => db.repos.find((r) => r.fullName === p.repoFullName))
    .filter(Boolean);
}

export function updateOrganization(login, changes) {
  const patch = { ...changes };
  mutate(mutator({ login, patch }, `
    const org = db.orgs.find((o) => o.login === login);
    if (org) Object.assign(org, patch);
  `), 'org');
}

/* --------------------------------------------------------------- files/blob */

export function saveFile(fullName, payload) {
  const actor = myLogin();
  const path = String(payload.path || 'untitled.txt');
  const content = String(payload.content == null ? '' : payload.content);
  const message = payload.message || `Update ${path}`;
  const body = payload.body || '';
  const branch = payload.branch || 'main';
  const at = nowIso();
  const sha = shortId(40, `${fullName}:${path}:${Date.now()}`);
  const localId = `f-local-${Date.now().toString(36)}`;
  mutate(mutator({ fullName, path, content, message, body, branch, at, sha, localId, actor }, `
    if (!db.localFiles) db.localFiles = [];
    const index = db.localFiles.findIndex((f) => f.repoFullName === fullName && f.path === path);
    const record = {
      id: index >= 0 ? db.localFiles[index].id : localId,
      repoFullName: fullName, path, name: path.split('/').pop(),
      dir: path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '',
      branch, content, binary: false, size: content.length,
      lines: content.split('\\n').length, message, authorLogin: actor, sha,
      committedAt: at, language: 'Text',
    };
    if (index >= 0) db.localFiles[index] = record;
    else db.localFiles.push(record);
    db.commits.unshift({
      sha, shortSha: sha.slice(0, 7), repoFullName: fullName, branch, message, body,
      authorLogin: actor, authorName: actor, authorEmail: actor + '@redget.local',
      committerLogin: actor, verified: true, additions: record.lines,
      deletions: index >= 0 ? record.lines : 0, files: [path], date: at, parents: [],
      tree: [{ path, type: 'blob' }],
    });
    const repo = db.repos.find((r) => r.fullName === fullName);
    if (repo) {
      repo.commitCount = (repo.commitCount || 0) + 1;
      repo.pushedAt = at;
      if (index < 0) repo.fileCount = (repo.fileCount || 0) + 1;
    }
  `), 'file:save');
  return sha;
}

export function deleteFile(fullName, path, message) {
  const actor = myLogin();
  const at = nowIso();
  const sha = shortId(40, `${fullName}:delete:${path}`);
  mutate(mutator({ fullName, path, message: message || `Delete ${path}`, actor, at, sha }, `
    if (!db.localFiles) db.localFiles = [];
    db.localFiles = db.localFiles.filter((f) => !(f.repoFullName === fullName && f.path === path));
    if (!db.deletedFiles) db.deletedFiles = [];
    db.deletedFiles.push({ repoFullName: fullName, path, at, by: actor });
    db.commits.unshift({
      sha, shortSha: sha.slice(0, 7), repoFullName: fullName, branch: 'main', message, body: '',
      authorLogin: actor, authorName: actor, authorEmail: actor + '@redget.local',
      committerLogin: actor, verified: true, additions: 0, deletions: 1, files: [path],
      date: at, parents: [], tree: [],
    });
    const repo = db.repos.find((r) => r.fullName === fullName);
    if (repo) { repo.commitCount = (repo.commitCount || 0) + 1; repo.fileCount = Math.max(0, (repo.fileCount || 1) - 1); }
  `), 'file:delete');
}

export function localFile(fullName, path) {
  const db = getDb();
  if (!db || !db.localFiles) return null;
  return db.localFiles.find((f) => f.repoFullName === fullName && f.path === path) || null;
}

export function isDeletedFile(fullName, path) {
  const db = getDb();
  return Boolean(db && db.deletedFiles && db.deletedFiles.some((f) => f.repoFullName === fullName && f.path === path));
}

/* ------------------------------------------------------------------- session */

export function signIn(login) {
  setSession({ login, signedInAt: nowIso() });
  return login;
}

export function signOut() {
  setSession({ login: null, signedOutAt: nowIso() });
}

export function switchTheme(themeId) {
  setPref('theme', themeId);
}

export function me() {
  return getCurrentUser();
}

/** Drop ephemeral scratch state that never needs to survive a reload. */
export function pruneLocalState() {
  mutateLocal((db) => { delete db.uiScratch; }, 'prune');
}

export default {
  repoByFullName, issuesFor, pullsFor, issueByNumber, pullByNumber, commitsFor, commitBySha,
  commentsFor, notifications, unreadCount, reposForOwner, toggleStar, hasStarred, starCount,
  setWatch, watchLevel, toggleFollow, isFollowing, createRepository, updateRepository,
  deleteRepository, transferRepository, archiveRepository, createIssue, updateIssue,
  lockConversation, pinIssue, transferIssue, react, addComment, updateComment, deleteComment,
  minimizeComment, saveReply, deleteSavedReply, createLabel, updateLabel, deleteLabel,
  createMilestone, updateMilestone, createPullRequest, setDraft, mergePullRequest,
  closePullRequest, setAutoMerge, submitReview, dismissReview, addReviewThread, replyToThread,
  resolveThread, applySuggestionToThread, markFileViewed, markNotificationRead,
  markRepoNotificationsRead, markAllNotificationsRead, deleteNotification, togglePinNotification,
  rerunWorkflow, cancelWorkflow, deleteWorkflowRun, setWorkflowState, saveSecret, deleteSecret,
  saveVariable, deleteVariable, deleteCache, deleteArtifact, removeRunner, createProject,
  addProjectItem, moveProjectItem, removeProjectItem, saveWikiPage, deleteWikiPage,
  setDependabotAlertState, setCodeScanningState, setSecretScanningState, publishAdvisory,
  publishRelease, updateRelease, deleteRelease, createDiscussion, voteDiscussion, updateSettings,
  localSettings, updateBranchProtection, addBranchProtectionRule, deleteBranchProtectionRule,
  saveWebhook, deleteWebhook, addCollaborator, removeCollaborator, collaboratorsFor, webhooksFor,
  updateProfile, setStatus, togglePinnedRepo, pinnedRepos, updateOrganization, saveFile,
  deleteFile, localFile, isDeletedFile, signIn, signOut, switchTheme, me, pruneLocalState,
};
