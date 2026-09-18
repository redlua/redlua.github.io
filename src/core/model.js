/**
 * RedGet — forge content model: files, commits, branches, issues, pull
 * requests, labels, milestones, releases and tags.
 *
 * Everything here reads and writes the localStorage database, so a number in
 * the UI always matches the record behind it. Nothing is generated on the fly:
 * a forge you never touched has no issues, no runs and no history.
 *
 * Issue / pull request record
 *   { id, number, title, body, state: 'open'|'closed', author, created, updated,
 *     labels: [{name,color}], assignees: [username], milestone: title|null,
 *     reactions: {'+1': [username], …}, comments: [comment], locked, pinned,
 *     closedBy, closedAt, stateReason }
 *
 * Pull requests add
 *   { draft, base, head, commits: [sha], files: [path], additions, deletions,
 *     merged, mergedBy, mergedAt, method, reviews: [review] }
 *
 * Comment   { id, author, body, created, reactions }
 * Review    { id, author, state: 'approved'|'changes'|'comment', body, created }
 */

import { DB, ME, saveDB } from '../state.js';
import { uid, shortSha, fullSha } from './util.js';
import { notify } from './notify.js';
import { addCommit, logActivity } from './forges.js';
import { getUserByUsername } from './social.js';

/* ====================================================================== *\
   Files + commits
\* ====================================================================== */

export function fileByName(forge, name) {
  return (forge.files || []).filter(function (f) { return f.name === name; })[0] || null;
}

/** Top-level entries for the file browser: directories first, then files. */
export function listTree(forge, dir) {
  var prefix = dir ? dir.replace(/\/$/, '') + '/' : '';
  var dirs = {};
  var files = [];
  (forge.files || []).forEach(function (f) {
    if (prefix && f.name.indexOf(prefix) !== 0) return;
    var rest = f.name.slice(prefix.length);
    if (!rest) return;
    var slash = rest.indexOf('/');
    if (slash === -1) files.push(f);
    else dirs[rest.slice(0, slash)] = true;
  });
  return {
    dirs: Object.keys(dirs).sort().map(function (name) {
      var children = (forge.files || []).filter(function (f) {
        return f.name.indexOf(prefix + name + '/') === 0;
      });
      var last = children.reduce(function (max, f) { return Math.max(max, f.commitTime || 0); }, 0);
      return { name: name, path: prefix + name, count: children.length, commitTime: last, type: 'dir' };
    }),
    files: files.sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (f) {
      return { name: f.name.slice(prefix.length), path: f.name, commitMsg: f.commitMsg, commitTime: f.commitTime, type: 'file', file: f };
    }),
  };
}

/** Create or overwrite a file and record a real commit. */
export function saveFile(forge, path, content, message) {
  var existing = fileByName(forge, path);
  var now = Date.now();
  var additions = String(content).split('\n').length;
  var deletions = 0;
  if (existing) {
    deletions = String(existing.content || '').split('\n').length;
    existing.content = content;
    existing.commitMsg = message || ('Update ' + path);
    existing.commitTime = now;
    existing.sha = shortSha();
    existing.author = ME ? ME.username : existing.author;
  } else {
    forge.files.push({
      name: path,
      content: content,
      commitMsg: message || ('Add ' + path),
      commitTime: now,
      sha: shortSha(),
      author: ME ? ME.username : forge.ownerUsername,
    });
  }
  var commit = addCommit(forge, message || (existing ? 'Update ' + path : 'Add ' + path), [path], additions, deletions);
  forge.language = detectLanguage(forge);
  saveDB();
  return { file: fileByName(forge, path), commit: commit };
}

export function deleteFile(forge, path, message) {
  var before = (forge.files || []).length;
  forge.files = (forge.files || []).filter(function (f) { return f.name !== path; });
  if (forge.files.length === before) return null;
  var commit = addCommit(forge, message || ('Remove ' + path), [path], 0, 1);
  saveDB();
  return commit;
}

export function renameFile(forge, from, to) {
  var file = fileByName(forge, from);
  if (!file || fileByName(forge, to)) return null;
  file.name = to;
  file.commitMsg = 'Rename ' + from + ' to ' + to;
  file.commitTime = Date.now();
  addCommit(forge, file.commitMsg, [from, to], 0, 0);
  saveDB();
  return file;
}

/** Predominant language by file extension, for the language bar. */
export function detectLanguage(forge) {
  var counts = {};
  (forge.files || []).forEach(function (f) {
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    var lang = EXT_LANG[ext];
    if (lang) counts[lang] = (counts[lang] || 0) + (f.content || '').length;
  });
  var best = null;
  Object.keys(counts).forEach(function (lang) {
    if (!best || counts[lang] > counts[best]) best = lang;
  });
  return best || forge.language || 'Other';
}

export var EXT_LANG = {
  js: 'JavaScript', mjs: 'JavaScript', jsx: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript',
  json: 'JSON', html: 'HTML', htm: 'HTML', css: 'CSS', scss: 'CSS', md: 'Markdown',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust', c: 'C', h: 'C', cpp: 'C++', cc: 'C++',
  java: 'Java', kt: 'Kotlin', swift: 'Swift', php: 'PHP', sh: 'Shell', bash: 'Shell',
  sql: 'SQL', vue: 'Vue', yml: 'YAML', yaml: 'YAML', toml: 'TOML', txt: 'Text',
};

/** { JavaScript: 62.4, CSS: 37.6 } — percentages of tracked source bytes. */
export function languageBreakdown(forge) {
  var counts = {};
  var total = 0;
  (forge.files || []).forEach(function (f) {
    var ext = (f.name.split('.').pop() || '').toLowerCase();
    var lang = EXT_LANG[ext];
    if (!lang) return;
    var size = (f.content || '').length;
    counts[lang] = (counts[lang] || 0) + size;
    total += size;
  });
  if (!total) return [];
  return Object.keys(counts)
    .map(function (lang) { return { language: lang, bytes: counts[lang], percent: (counts[lang] / total) * 100 }; })
    .sort(function (a, b) { return b.bytes - a.bytes; });
}

export function commitsFor(forge, branch) {
  return (forge.commits || []).slice().sort(function (a, b) { return b.time - a.time; });
}

export function commitBySha(forge, sha) {
  var needle = String(sha || '').toLowerCase();
  return (forge.commits || []).filter(function (c) {
    return c.sha.toLowerCase().indexOf(needle) === 0;
  })[0] || null;
}

/* ====================================================================== *\
   Branches
\* ====================================================================== */

export function createBranch(forge, name, from) {
  if (!name || (forge.branches || []).indexOf(name) !== -1) return null;
  forge.branches.push(name);
  var source = commitBySha(forge, from) || (forge.commits || [])[0];
  if (source) {
    forge.commits.unshift({
      sha: fullSha(), short: '', msg: 'Branch ' + name + ' created from ' + (source.short || source.sha.slice(0, 7)),
      body: '', author: ME ? ME.username : forge.ownerUsername, time: Date.now(),
      files: [], additions: 0, deletions: 0, parents: [source.sha], branch: name,
    });
    forge.commits[0].short = forge.commits[0].sha.slice(0, 7);
  }
  forge.updated = Date.now();
  saveDB();
  logActivity('forge.branch', forge.name + ':' + name);
  return name;
}

export function deleteBranch(forge, name) {
  if (name === forge.defaultBranch) return false;
  forge.branches = (forge.branches || []).filter(function (b) { return b !== name; });
  saveDB();
  return true;
}

export function setDefaultBranch(forge, name) {
  if ((forge.branches || []).indexOf(name) === -1) return false;
  forge.defaultBranch = name;
  saveDB();
  return true;
}

export function branchAheadBehind(forge, branch) {
  var base = (forge.commits || []).filter(function (c) { return !c.branch || c.branch === forge.defaultBranch; });
  var head = (forge.commits || []).filter(function (c) { return c.branch === branch; });
  return { ahead: head.length, behind: 0, base: base.length };
}

/* ====================================================================== *\
   Issues
\* ====================================================================== */

function nextNumber(list) {
  return list.reduce(function (max, item) { return Math.max(max, item.number || 0); }, 0) + 1;
}

export function issuesFor(forge) {
  return (forge.issues || []).slice().sort(function (a, b) { return b.created - a.created; });
}

export function issueByNumber(forge, number) {
  var n = Number(number);
  return (forge.issues || []).filter(function (i) { return i.number === n; })[0] || null;
}

export function createIssue(user, forge, payload) {
  if (!forge.issues) forge.issues = [];
  var now = Date.now();
  var issue = {
    id: uid('issue'),
    number: nextNumber(forge.issues),
    title: String(payload.title || '').slice(0, 200),
    body: payload.body || '',
    state: 'open',
    author: ME ? ME.username : user.username,
    created: now,
    updated: now,
    labels: (payload.labels || []).map(function (l) { return typeof l === 'string' ? { name: l, color: 'blue' } : l; }),
    assignees: payload.assignees || [],
    milestone: payload.milestone || null,
    reactions: {},
    comments: [],
    locked: false,
    pinned: false,
    stateReason: null,
    closedAt: null,
    closedBy: null,
  };
  forge.issues.unshift(issue);
  forge.updated = now;
  saveDB();
  logActivity('issue.open', user.username + '/' + forge.name + '#' + issue.number);
  notifyWatchers(user, forge, {
    kind: 'issue',
    text: 'opened issue #' + issue.number + ' in ' + user.username + '/' + forge.name,
    href: '/' + user.username + '/' + forge.name + '/issues/' + issue.number,
    except: issue.author,
  });
  return issue;
}

export function setIssueState(user, forge, issue, state, reason) {
  issue.state = state;
  issue.stateReason = reason || null;
  issue.closedAt = state === 'closed' ? Date.now() : null;
  issue.closedBy = state === 'closed' && ME ? ME.username : null;
  issue.updated = Date.now();
  saveDB();
  logActivity(state === 'closed' ? 'issue.close' : 'issue.open', user.username + '/' + forge.name + '#' + issue.number);
  return issue;
}

export function updateIssue(issue, changes) {
  Object.keys(changes || {}).forEach(function (key) { issue[key] = changes[key]; });
  issue.updated = Date.now();
  saveDB();
  return issue;
}

export function deleteIssue(forge, issue) {
  forge.issues = (forge.issues || []).filter(function (i) { return i.id !== issue.id; });
  saveDB();
  return true;
}

export function addComment(user, forge, target, body) {
  if (!target.comments) target.comments = [];
  var comment = {
    id: uid('comment'),
    author: ME ? ME.username : user.username,
    body: String(body || ''),
    created: Date.now(),
    reactions: {},
  };
  if (!comment.body.trim()) return null;
  target.comments.push(comment);
  target.updated = Date.now();
  saveDB();
  logActivity(target.number && forge.pulls && forge.pulls.indexOf(target) !== -1 ? 'pr.comment' : 'issue.comment',
    user.username + '/' + forge.name + '#' + target.number);
  if (target.author && target.author !== comment.author) {
    notify({
      to: target.author,
      from: comment.author,
      kind: 'comment',
      text: 'commented on #' + target.number + ' in ' + user.username + '/' + forge.name,
      href: '/' + user.username + '/' + forge.name + '/issues/' + target.number,
    });
  }
  mentionsIn(comment.body).forEach(function (name) {
    notify({
      to: name, from: comment.author, kind: 'mention',
      text: 'mentioned you in #' + target.number + ' in ' + user.username + '/' + forge.name,
      href: '/' + user.username + '/' + forge.name + '/issues/' + target.number,
    });
  });
  return comment;
}

export function updateComment(comment, body) {
  comment.body = String(body || '');
  comment.edited = Date.now();
  saveDB();
  return comment;
}

export function deleteComment(target, comment) {
  target.comments = (target.comments || []).filter(function (c) { return c.id !== comment.id; });
  saveDB();
  return true;
}

export var REACTION_KINDS = ['+1', '-1', 'laugh', 'hooray', 'confused', 'heart', 'rocket', 'eyes'];

export function toggleReaction(target, kind, username) {
  var who = username || (ME && ME.username);
  if (!who) return false;
  if (!target.reactions) target.reactions = {};
  if (!target.reactions[kind]) target.reactions[kind] = [];
  var idx = target.reactions[kind].indexOf(who);
  if (idx === -1) target.reactions[kind].push(who);
  else target.reactions[kind].splice(idx, 1);
  if (!target.reactions[kind].length) delete target.reactions[kind];
  saveDB();
  return idx === -1;
}

export function reactionCount(target, kind) {
  return ((target.reactions || {})[kind] || []).length;
}

export function hasReacted(target, kind, username) {
  var who = username || (ME && ME.username);
  return ((target.reactions || {})[kind] || []).indexOf(who) !== -1;
}

/** `@mentions` in a body, resolved to accounts that actually exist here. */
export function mentionsIn(body) {
  var names = String(body || '').match(/@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)/gi) || [];
  return names
    .map(function (n) { return n.slice(1).toLowerCase(); })
    .filter(function (n, i, list) { return list.indexOf(n) === i; })
    .map(function (n) { return getUserByUsername(n); })
    .filter(Boolean)
    .map(function (u) { return u.username; });
}

/** `#12` references inside a body, resolved to issues in the same forge. */
export function crossReferences(forge, body) {
  var refs = String(body || '').match(/#(\d+)/g) || [];
  return refs
    .map(function (r) { return Number(r.slice(1)); })
    .filter(function (n, i, list) { return list.indexOf(n) === i; })
    .map(function (n) { return issueByNumber(forge, n) || pullByNumber(forge, n); })
    .filter(Boolean);
}

/** Open issues assigned to a username across every forge. */
export function openIssuesFor(username) {
  var out = [];
  eachForge(function (user, forge) {
    (forge.issues || []).forEach(function (issue) {
      if (issue.state !== 'open') return;
      if ((issue.assignees || []).indexOf(username) === -1 && issue.author !== username) return;
      out.push({ user: user, forge: forge, issue: issue });
    });
  });
  return out.sort(function (a, b) { return b.issue.updated - a.issue.updated; });
}

/** Open issues that mention or were opened by a username. */
export function issuesInvolving(username) {
  var out = [];
  eachForge(function (user, forge) {
    (forge.issues || []).forEach(function (issue) {
      if (issue.author === username || mentionsIn(issue.body).indexOf(username) !== -1) {
        out.push({ user: user, forge: forge, issue: issue });
      }
    });
  });
  return out;
}

/* ====================================================================== *\
   Pull requests
\* ====================================================================== */

export function pullsFor(forge) {
  return (forge.pulls || []).slice().sort(function (a, b) { return b.created - a.created; });
}

export function pullByNumber(forge, number) {
  var n = Number(number);
  return (forge.pulls || []).filter(function (p) { return p.number === n; })[0] || null;
}

export function createPull(user, forge, payload) {
  if (!forge.pulls) forge.pulls = [];
  var now = Date.now();
  var base = payload.base || forge.defaultBranch;
  var head = payload.head || (forge.branches || []).filter(function (b) { return b !== base; })[0] || base;
  var diff = diffBranches(forge, base, head);
  var pr = {
    id: uid('pull'),
    number: nextNumber(forge.pulls.concat(forge.issues || [])),
    title: String(payload.title || '').slice(0, 200),
    body: payload.body || '',
    state: 'open',
    draft: Boolean(payload.draft),
    author: ME ? ME.username : user.username,
    created: now,
    updated: now,
    base: base,
    head: head,
    labels: payload.labels || [],
    assignees: payload.assignees || [],
    reviewers: payload.reviewers || [],
    milestone: payload.milestone || null,
    reactions: {},
    comments: [],
    reviews: [],
    commits: diff.commits,
    files: diff.files,
    additions: diff.additions,
    deletions: diff.deletions,
    merged: false,
    mergedBy: null,
    mergedAt: null,
    method: null,
    mergeable: head !== base,
  };
  forge.pulls.unshift(pr);
  forge.updated = now;
  saveDB();
  logActivity('pr.open', user.username + '/' + forge.name + '#' + pr.number);
  notifyWatchers(user, forge, {
    kind: 'pull',
    text: 'opened pull request #' + pr.number + ' in ' + user.username + '/' + forge.name,
    href: '/' + user.username + '/' + forge.name + '/pull/' + pr.number,
    except: pr.author,
  });
  return pr;
}

/**
 * Compare two branches by commit ancestry.
 * Returns { commits, files, additions, deletions }.
 */
export function diffBranches(forge, base, head) {
  var commits = (forge.commits || []).filter(function (c) { return c.branch === head; });
  var files = {};
  var additions = 0;
  var deletions = 0;
  commits.forEach(function (c) {
    (c.files || []).forEach(function (path) { files[path] = true; });
    additions += c.additions || 0;
    deletions += c.deletions || 0;
  });
  if (!commits.length) {
    (forge.files || []).slice(0, 0).forEach(function () {});
  }
  return { commits: commits.map(function (c) { return c.sha; }), files: Object.keys(files), additions: additions, deletions: deletions };
}

export function setDraft(pr, draft) {
  pr.draft = Boolean(draft);
  pr.updated = Date.now();
  saveDB();
  return pr;
}

export function addReview(user, forge, pr, state, body) {
  if (!pr.reviews) pr.reviews = [];
  var review = {
    id: uid('review'),
    author: ME ? ME.username : user.username,
    state: state,
    body: body || '',
    created: Date.now(),
  };
  pr.reviews.push(review);
  pr.updated = Date.now();
  saveDB();
  if (pr.author !== review.author) {
    notify({
      to: pr.author, from: review.author, kind: 'review',
      text: (state === 'approved' ? 'approved' : state === 'changes' ? 'requested changes on' : 'reviewed') +
        ' pull request #' + pr.number + ' in ' + user.username + '/' + forge.name,
      href: '/' + user.username + '/' + forge.name + '/pull/' + pr.number,
    });
  }
  return review;
}

/** Latest review state per reviewer: { username: 'approved'|'changes'|'comment' }. */
export function reviewStates(pr) {
  var states = {};
  (pr.reviews || []).forEach(function (r) { states[r.author] = r.state; });
  return states;
}

export function mergePull(user, forge, pr, method) {
  if (pr.merged || pr.state !== 'open') return null;
  var now = Date.now();
  pr.merged = true;
  pr.state = 'closed';
  pr.mergedAt = now;
  pr.mergedBy = ME ? ME.username : user.username;
  pr.method = method || 'merge';
  pr.updated = now;

  // The head branch's commits become part of the base branch.
  (forge.commits || []).forEach(function (c) {
    if (c.branch === pr.head) delete c.branch;
  });
  if (method !== 'rebase' && (forge.branches || []).indexOf(pr.head) !== -1) {
    forge.branches = forge.branches.filter(function (b) { return b !== pr.head; });
  }
  var sha = fullSha();
  forge.commits.unshift({
    sha: sha, short: sha.slice(0, 7),
    msg: method === 'squash'
      ? pr.title + ' (#' + pr.number + ')'
      : 'Merge pull request #' + pr.number + ' from ' + pr.head,
    body: pr.body || '', author: pr.mergedBy, time: now,
    files: pr.files || [], additions: pr.additions || 0, deletions: pr.deletions || 0,
    parents: [], branch: pr.base,
  });
  forge.updated = now;

  // "Fixes #12" closes the referenced issues.
  (String(pr.body || '').match(/(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi) || []).forEach(function (m) {
    var num = Number(m.match(/#(\d+)/)[1]);
    var issue = issueByNumber(forge, num);
    if (issue && issue.state === 'open') setIssueState(user, forge, issue, 'closed');
  });

  saveDB();
  logActivity('pr.merge', user.username + '/' + forge.name + '#' + pr.number);
  if (pr.author !== pr.mergedBy) {
    notify({
      to: pr.author, from: pr.mergedBy, kind: 'pull',
      text: 'merged your pull request #' + pr.number + ' in ' + user.username + '/' + forge.name,
      href: '/' + user.username + '/' + forge.name + '/pull/' + pr.number,
    });
  }
  return pr;
}

export function closePull(user, forge, pr, reopen) {
  pr.state = reopen ? 'open' : 'closed';
  pr.updated = Date.now();
  saveDB();
  return pr;
}

export function openPullsFor(username) {
  var out = [];
  eachForge(function (user, forge) {
    (forge.pulls || []).forEach(function (pr) {
      if (pr.state !== 'open') return;
      var mine = (pr.assignees || []).indexOf(username) !== -1 ||
        (pr.reviewers || []).indexOf(username) !== -1 ||
        pr.author === username;
      if (!mine) return;
      out.push({ user: user, forge: forge, pr: pr });
    });
  });
  return out.sort(function (a, b) { return b.pr.updated - a.pr.updated; });
}

/* ====================================================================== *\
   Labels + milestones
\* ====================================================================== */

export var DEFAULT_LABELS = [
  { name: 'bug', color: 'red', description: 'Something is not working' },
  { name: 'enhancement', color: 'blue', description: 'A new feature or request' },
  { name: 'documentation', color: 'purple', description: 'Improvements or additions to docs' },
  { name: 'good first issue', color: 'green', description: 'Good for newcomers' },
];

export function labelsFor(forge) {
  if (!forge.labels) forge.labels = DEFAULT_LABELS.map(function (l) { return Object.assign({}, l); });
  return forge.labels;
}

export function saveLabel(forge, label) {
  var list = labelsFor(forge);
  var existing = list.filter(function (l) { return l.name === label.name; })[0];
  if (existing) {
    existing.color = label.color || existing.color;
    existing.description = label.description || '';
  } else {
    list.push({ name: label.name, color: label.color || 'blue', description: label.description || '' });
  }
  saveDB();
  return list;
}

export function deleteLabel(forge, name) {
  forge.labels = (forge.labels || []).filter(function (l) { return l.name !== name; });
  (forge.issues || []).concat(forge.pulls || []).forEach(function (item) {
    item.labels = (item.labels || []).filter(function (l) { return l.name !== name; });
  });
  saveDB();
}

export function milestonesFor(forge) {
  if (!forge.milestones) forge.milestones = [];
  return forge.milestones;
}

export function saveMilestone(forge, milestone) {
  var list = milestonesFor(forge);
  var existing = list.filter(function (m) { return m.title === milestone.title; })[0];
  if (existing) {
    existing.description = milestone.description || '';
    existing.due = milestone.due || null;
    existing.state = milestone.state || existing.state;
  } else {
    list.push({
      id: uid('milestone'),
      title: milestone.title,
      description: milestone.description || '',
      due: milestone.due || null,
      state: 'open',
      created: Date.now(),
    });
  }
  saveDB();
  return list;
}

export function milestoneProgress(forge, title) {
  var items = (forge.issues || []).filter(function (i) { return i.milestone === title; });
  var closed = items.filter(function (i) { return i.state === 'closed'; }).length;
  return { total: items.length, closed: closed, percent: items.length ? Math.round((closed / items.length) * 100) : 0 };
}

/* ====================================================================== *\
   Releases + tags
\* ====================================================================== */

export function releasesFor(forge) {
  return (forge.releases || []).slice().sort(function (a, b) { return b.published - a.published; });
}

export function createRelease(forge, payload) {
  if (!forge.releases) forge.releases = [];
  var tag = payload.tag;
  if ((forge.tags || []).indexOf(tag) === -1) forge.tags.unshift(tag);
  var release = {
    id: uid('release'),
    tag: tag,
    title: payload.title || tag,
    body: payload.body || '',
    draft: Boolean(payload.draft),
    prerelease: Boolean(payload.prerelease),
    author: ME ? ME.username : forge.ownerUsername,
    published: Date.now(),
    assets: payload.assets || [],
    target: payload.target || forge.defaultBranch,
  };
  forge.releases.unshift(release);
  var sha = fullSha();
  forge.commits.unshift({
    sha: sha, short: sha.slice(0, 7), msg: 'Release ' + tag, body: release.body,
    author: release.author, time: release.published, files: [], additions: 0, deletions: 0, parents: [], tag: tag,
  });
  forge.updated = Date.now();
  saveDB();
  logActivity('release.create', forge.ownerUsername + '/' + forge.name + ' ' + tag);
  return release;
}

export function deleteRelease(forge, release) {
  forge.releases = (forge.releases || []).filter(function (r) { return r.id !== release.id; });
  saveDB();
  return true;
}

export function createTag(forge, name, message) {
  if (!forge.tags) forge.tags = [];
  if (forge.tags.indexOf(name) !== -1) return null;
  forge.tags.unshift(name);
  var head = (forge.commits || [])[0];
  forge.commits.unshift({
    sha: fullSha(), short: '', msg: 'Tag ' + name, body: message || '',
    author: ME ? ME.username : forge.ownerUsername, time: Date.now(), files: [],
    additions: 0, deletions: 0, parents: head ? [head.sha] : [], tag: name,
  });
  forge.commits[0].short = forge.commits[0].sha.slice(0, 7);
  saveDB();
  return name;
}

export function deleteTag(forge, name) {
  forge.tags = (forge.tags || []).filter(function (t) { return t !== name; });
  saveDB();
  return true;
}

/* ====================================================================== *\
   helpers
\* ====================================================================== */

/** Visit every forge the signed-in account can see. */
export function eachForge(fn) {
  Object.keys(DB.users).forEach(function (k) {
    var u = DB.users[k];
    (u.forges || []).forEach(function (r) {
      if (r.visibility === 'private' && (!ME || u.username !== ME.username)) return;
      fn(u, r, false);
    });
  });
  Object.keys(DB.orgs || {}).forEach(function (slug) {
    var org = DB.orgs[slug];
    (org.forges || []).forEach(function (r) { fn(org, r, true); });
  });
}

/** Notify everyone watching a forge (plus its owner) about an event. */
export function notifyWatchers(user, forge, event) {
  var recipients = {};
  (DB.watches || []).forEach(function (w) {
    if (w.forgeId === forge.id) recipients[w.user] = true;
  });
  if (user && user.username) recipients[user.username] = true;
  Object.keys(recipients).forEach(function (name) {
    if (event.except && name === event.except) return;
    if (ME && name === ME.username) return;
    notify({ to: name, from: ME ? ME.username : user.username, kind: event.kind, text: event.text, href: event.href });
  });
}

/** Issues + pulls in one list, for the "Discussions" style inbox. */
export function allItems(forge) {
  return (forge.issues || []).concat(forge.pulls || []).sort(function (a, b) { return b.updated - a.updated; });
}
