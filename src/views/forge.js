/**
 * RedGet — forge views: code, tree, blob, commits, issues and pull
 * requests.
 *
 * Every number on this page is derived: stars, forks and watchers come from
 * the real records in state, commit lists come from `forge.commits`, issue and
 * pull counts are counted from the arrays themselves. Actions, Projects, Wiki,
 * Security, Insights, Settings, Releases, Tags, Branches, Discussions,
 * Packages, Stargazers and Forks live in ./forgeExtras.js and are re-exported
 * at the bottom of this file.
 */

import { ME, saveDB } from '../state.js';
import { ic } from '../icons.js';
import { avatarHTML } from '../core/avatars.js';
import { getUserByUsername, starCount, forkCount, watchCount, hasStarred, isWatching, hasForked } from '../core/social.js';
import { highlight } from '../core/highlight.js';
import { md } from '../core/markdown.js';
import { langColor } from '../core/languages.js';
import { closeModal, openModal } from '../core/modal.js';
import { render } from '../core/render.js';
import { toast, copyText } from '../core/toast.js';
import { esc, timeAgo, formatDate, formatBytes } from '../core/util.js';
import {
  issuesFor, issueByNumber, createIssue, setIssueState, updateIssue, deleteIssue, addComment,
  updateComment, deleteComment, toggleReaction, reactionCount, hasReacted, REACTION_KINDS,
  pullsFor, pullByNumber, createPull, mergePull, closePull, setDraft, addReview, reviewStates,
  commitsFor, commitBySha, languageBreakdown, fileByName, listTree, labelsFor, milestonesFor,
  milestoneProgress, releasesFor, saveFile, deleteFile, renameFile, createTag,
} from '../core/model.js';
import { runsFor } from '../core/actions.js';
import { canEditForge } from '../core/forges.js';

/* ===================================================================== *
   Dispatcher
\* ===================================================================== */

export function viewForge(user, forge, sub, rest) {
  var me = ME ? ME.username : '';
  var isOwner = Boolean(me) && user.username === me;
  var forgeHeader = forgeHead(user, forge, isOwner);
  var forgeTabs = forgeNav(user, forge, sub);
  var subContent = '';
  var restArr = rest || [];

  switch (sub) {
    case 'code': subContent = viewForgeCode(user, forge, restArr); break;
    case 'tree': subContent = viewForgeTree(user, forge, restArr); break;
    case 'blob': subContent = viewForgeBlob(user, forge, restArr); break;
    case 'blame': subContent = viewForgeBlame(user, forge, restArr); break;
    case 'raw': subContent = viewForgeRaw(user, forge, restArr); break;
    case 'commits': subContent = viewForgeCommits(user, forge, restArr); break;
    case 'commit': subContent = viewForgeCommit(user, forge, restArr); break;
    case 'compare': subContent = viewForgeCompare(user, forge, restArr); break;
    case 'issues': subContent = viewForgeIssues(user, forge, restArr); break;
    case 'labels': subContent = viewForgeLabels(user, forge); break;
    case 'milestones': subContent = viewForgeMilestones(user, forge); break;
    case 'pulls': subContent = viewForgePulls(user, forge, restArr); break;
    case 'pull': subContent = viewForgePull(user, forge, restArr); break;
    case 'actions': subContent = viewForgeActions(user, forge, restArr); break;
    case 'projects': subContent = viewForgeProjects(user, forge, restArr); break;
    case 'wiki': subContent = viewForgeWiki(user, forge, restArr); break;
    case 'security': subContent = viewForgeSecurity(user, forge, restArr); break;
    case 'insights': subContent = viewForgeInsights(user, forge, restArr); break;
    case 'settings': subContent = restArr[0] === 'danger' ? viewForgeDanger(user, forge) : viewForgeSettings(user, forge, restArr); break;
    case 'releases': subContent = viewForgeReleases(user, forge); break;
    case 'tags': subContent = viewForgeTags(user, forge); break;
    case 'branches': subContent = viewForgeBranches(user, forge); break;
    case 'discussions': subContent = viewForgeDiscussions(user, forge, restArr); break;
    case 'packages': subContent = viewForgePackages(user, forge); break;
    case 'stargazers': subContent = viewForgeStargazers(user, forge); break;
    case 'forks': subContent = viewForgeForks(user, forge); break;
    case 'new': subContent = viewNewFile(user, forge, restArr); break;
    case 'edit': subContent = viewEditFile(user, forge, restArr); break;
    default: subContent = viewForgeCode(user, forge, restArr);
  }

  return '<div class="container page">' + forgeHeader + forgeTabs + subContent + '</div>';
}

/* ===================================================================== *
   Header + tabs
\* ===================================================================== */

export function forgeHead(user, forge, isOwner) {
  var base = '/' + user.username + '/' + forge.name;
  var stars = starCount(forge.id);
  var forks = forkCount(forge.id);
  var watchers = watchCount(forge.id);
  var starred = hasStarred(forge.id);
  var watching = isWatching(forge.id);
  var forked = hasForked(forge.id);
  var forkTarget = forked && ME ? myForkOf(forge) : null;

  return '<div class="forge-header">' +
    '<div class="forge-title">' +
      '<a class="owner" href="#' + esc(user.username === forge.ownerUsername ? base.split('/').slice(0, 2).join('/') : '/' + user.username) + '">' + esc(user.username) + '</a>' +
      '<span class="sep">/</span>' +
      '<a class="name" href="#' + esc(base) + '">' + esc(forge.name) + '</a>' +
      '<span class="visibility">' + esc(forge.visibility) + '</span>' +
      (forge.archived ? '<span class="label" style="margin-left:8px">' + ic('archive', 12) + ' Archived</span>' : '') +
      (forge.forkedFrom ? '<div class="forge-fork-note">' + ic('fork', 12) + ' forked from <a href="#/' + esc(forge.forkedFrom.owner) + '/' + esc(forge.forkedFrom.forge) + '">' +
        esc(forge.forkedFrom.owner) + '/' + esc(forge.forkedFrom.forge) + '</a></div>' : '') +
    '</div>' +
    (forge.desc ? '<div class="forge-desc">' + esc(forge.desc) + '</div>' : '') +
    '<div class="forge-actions">' +
      '<button class="btn sm' + (watching ? ' primary' : '') + '" id="watchBtn" data-forge-id="' + esc(forge.id) + '">' +
        ic(watching ? 'eyeFill' : 'eye', 14) + ' ' + (watching ? 'Watching' : 'Watch') + ' <span class="counter">' + watchers + '</span></button>' +
      '<div class="btn-group">' +
        (forkTarget
          ? '<a class="btn sm" href="#/' + esc(ME.username) + '/' + esc(forkTarget.name) + '">' + ic('fork', 14) + ' Your fork</a>'
          : '<button class="btn sm" id="forkBtn" data-forge-id="' + esc(forge.id) + '">' + ic('fork', 14) + ' Fork <span class="counter">' + forks + '</span></button>') +
      '</div>' +
      '<button class="btn sm' + (starred ? ' primary' : '') + '" id="starBtn" data-forge-id="' + esc(forge.id) + '">' +
        ic(starred ? 'starFill' : 'star', 14) + ' ' + (starred ? 'Starred' : 'Star') + ' <span class="counter" id="starCount">' + stars + '</span></button>' +
    '</div>' +
  '</div>';
}

function myForkOf(forge) {
  if (!ME) return null;
  return (ME.forges || []).filter(function (r) {
    return r.forkedFrom && r.forkedFrom.id === forge.id;
  })[0] || null;
}

export function forgeNav(user, forge, active) {
  var base = '/' + user.username + '/' + forge.name;
  var openIssues = issuesFor(forge).filter(function (i) { return i.state === 'open'; }).length;
  var openPulls = pullsFor(forge).filter(function (p) { return p.state === 'open'; }).length;
  var discussions = (forge.discussions || []).length;
  var packages = (forge.packages || []).length;
  var projects = (forge.projects || []).length;

  function tab(key, icon, label, count, enabled) {
    if (enabled === false) return '';
    var on = active === key || (key === 'code' && ['tree', 'blob', 'blame', 'raw', 'commits', 'commit', 'compare', 'new', 'edit'].indexOf(active) !== -1);
    var counter = count ? ' <span class="counter">' + count + '</span>' : '';
    return '<a class="forge-tab' + (on ? ' active' : '') + '" href="#' + base + (key === 'code' ? '' : '/' + key) + '">' +
      ic(icon, 16) + ' ' + esc(label) + counter + '</a>';
  }

  return '<div class="forge-tabs">' +
    tab('code', 'code', 'Code') +
    tab('issues', 'issue', 'Issues', openIssues, forge.issuesEnabled !== false) +
    tab('pulls', 'redPR', 'Pull requests', openPulls, forge.pullsEnabled !== false) +
    tab('discussions', 'commentDiscussion', 'Discussions', discussions, forge.discussionsEnabled !== false) +
    tab('actions', 'play', 'Actions', null, forge.actionsEnabled !== false) +
    tab('projects', 'project', 'Projects', projects, forge.projectsEnabled !== false) +
    tab('wiki', 'book', 'Wiki', null, forge.wikiEnabled !== false) +
    tab('security', 'shield', 'Security', null, forge.securityEnabled !== false) +
    tab('packages', 'package', 'Packages', packages, forge.packagesEnabled !== false) +
    tab('insights', 'graph', 'Insights') +
    (canEditForge(user, forge) ? tab('settings', 'gear', 'Settings') : '') +
  '</div>';
}

/* ===================================================================== *
   Code
\* ===================================================================== */

export function viewForgeCode(user, forge, rest) {
  var branch = (rest && rest[0]) || forge.defaultBranch;
  var base = '/' + user.username + '/' + forge.name;
  var files = forge.files || [];
  var readme = files.filter(function (f) { return /^readme(\.md)?$/i.test(f.name); })[0] || null;
  var commits = commitsFor(forge, branch);
  var head = commits[0] || null;
  var stats = languageBreakdown(forge);
  var totalBytes = files.reduce(function (n, f) { return n + (f.content || '').length; }, 0);
  var releases = releasesFor(forge);
  var rows = treeRows(files);

  return '<div class="grid-2col">' +
    '<div>' +
      '<div class="branch-bar">' +
        '<button class="branch-select" id="branchSelect" type="button" aria-haspopup="listbox" aria-expanded="false">' +
          ic('redBranch', 14) + ' <b>' + esc(branch) + '</b> ' + ic('triangleDown', 10) + '</button>' +
        '<span class="branch-meta">' + (forge.branches || []).length + ' branch' + ((forge.branches || []).length === 1 ? '' : 'es') +
          ' · ' + (forge.tags || []).length + ' tag' + ((forge.tags || []).length === 1 ? '' : 's') + '</span>' +
        '<div style="flex:1"></div>' +
        '<button class="btn sm" id="goToFileBtn" type="button">' + ic('search', 14) + ' Go to file</button>' +
        (canEditForge(user, forge) && !forge.archived
          ? '<button class="btn sm" id="addFileBtn" type="button">' + ic('plus', 14) + ' Add file</button>' : '') +
        '<button class="btn sm primary" id="codeBtn" type="button">' + ic('code', 14) + ' Code ' + ic('triangleDown', 10) + '</button>' +
      '</div>' +

      '<div class="file-browser">' +
        (head
          ? '<div class="file-browser-head">' +
              '<div><a class="latest" href="#/' + esc(head.author) + '">' + esc(head.author) + '</a> ' +
              '<span class="latest-msg">' + esc(head.msg) + '</span>' +
              '<span class="latest-meta">' + timeAgo(head.time) + '</span></div>' +
              '<div class="file-browser-head-right">' +
                '<a class="latest-sha mono" href="#' + base + '/commit/' + esc(head.sha) + '">' + head.sha.slice(0, 7) + '</a>' +
                '<a class="latest-meta" href="#' + base + '/commits/' + encodeURIComponent(branch) + '">' +
                  ic('history', 14) + ' ' + commits.length + ' commit' + (commits.length === 1 ? '' : 's') + '</a>' +
              '</div>' +
            '</div>'
          : '<div class="file-browser-head"><span class="muted fs-12">No commits yet on ' + esc(branch) + '</span></div>') +
        (rows.length
          ? rows.map(function (row) {
              if (row.type === 'dir') {
                return '<div class="file-row">' +
                  '<div class="name"><a href="#' + base + '/tree/' + encodeURIComponent(branch) + '/' + esc(row.path) + '">' +
                    '<span class="file-icon">' + ic('folder', 16) + '</span>' + esc(row.label) + '</a></div>' +
                  '<div class="msg">' + esc(row.msg) + '</div>' +
                  '<div class="time">' + (row.time ? timeAgo(row.time) : '') + '</div>' +
                '</div>';
              }
              return '<div class="file-row">' +
                '<div class="name"><a href="#' + base + '/blob/' + encodeURIComponent(branch) + '/' + esc(row.path) + '">' +
                  '<span class="file-icon">' + fileIcon(row.label) + '</span>' + esc(row.label) + '</a></div>' +
                '<div class="msg">' + esc(row.file.commitMsg || '') + '</div>' +
                '<div class="time">' + timeAgo(row.file.commitTime || forge.updated) + '</div>' +
              '</div>';
          }).join('')
          : '<div class="file-browser-empty">' + ic('forge', 28) + '<p>This forge is empty.</p>' +
            (canEditForge(user, forge) ? '<button class="btn primary" id="addFileBtn2" type="button">' + ic('plus', 14) + ' Create the first file</button>' : '') + '</div>') +
      '</div>' +

      (readme
        ? '<div class="readme-box">' +
            '<div class="readme-head">' + ic('book', 16) + ' ' + esc(readme.name) +
              ' <span class="label">' + formatBytes((readme.content || '').length) + '</span>' +
              (canEditForge(user, forge) ? '<a class="readme-edit" href="#' + base + '/edit/' + encodeURIComponent(branch) + '/' + esc(readme.name) + '">' + ic('pencil', 12) + ' Edit</a>' : '') +
            '</div>' +
            '<div class="readme-body">' + md(readme.content || '') + '</div>' +
          '</div>'
        : '') +
    '</div>' +

    '<div class="sticky-side">' +
      '<div class="forge-about">' +
        '<h3>About' + (canEditForge(user, forge) ? ' <a href="#' + base + '/settings"> ' + ic('gear', 14) + ' Edit</a>' : '') + '</h3>' +
        (forge.desc ? '<p>' + esc(forge.desc) + '</p>' : '<p class="muted fs-13">No description.</p>') +
        (forge.website ? '<p class="about-site"><a href="' + esc(forge.website) + '" rel="noopener">' + ic('link', 12) + ' ' + esc(forge.website) + '</a></p>' : '') +
        '<div class="forge-topics">' +
          (stats.length ? '<span class="topic"><span class="topic-dot" style="background:' + esc(langColor(stats[0].language)) + '"></span>' + esc(stats[0].language) + '</span>' : '') +
          (forge.topics || []).map(function (t) { return '<a class="topic" href="#/explore?topic=' + encodeURIComponent(t) + '">' + esc(t) + '</a>'; }).join('') +
          (forge.license ? '<span class="topic">' + ic('shield', 12) + ' ' + esc(forge.license) + '</span>' : '') +
        '</div>' +
        '<div class="forge-about-stats">' +
          (readme ? '<div class="row">' + ic('book', 16) + ' <b>Readme</b></div>' : '') +
          '<div class="row"><a href="#' + base + '/stargazers">' + ic('star', 16) + ' <b>' + starCount(forge.id) + '</b> stars</a></div>' +
          '<div class="row"><a href="#' + base + '/forks">' + ic('fork', 16) + ' <b>' + forkCount(forge.id) + '</b> forks</a></div>' +
          '<div class="row">' + ic('eye', 16) + ' <b>' + watchCount(forge.id) + '</b> watching</div>' +
          '<div class="row">' + ic('file', 16) + ' <b>' + files.length + '</b> files · ' + formatBytes(totalBytes) + '</div>' +
        '</div>' +
      '</div>' +

      (stats.length ? '<div class="card mt-4">' +
        '<h3 class="side-title">Languages</h3>' +
        '<div class="lang-meter">' + stats.map(function (s) {
          return '<span style="width:' + s.percent.toFixed(1) + '%;background:' + esc(langColor(s.language)) + '" title="' + esc(s.language) + ' ' + Math.round(s.percent) + '%"></span>';
        }).join('') + '</div>' +
        '<ul class="lang-list">' + stats.slice(0, 6).map(function (s) {
          return '<li><span class="lang-dot" style="background:' + esc(langColor(s.language)) + '"></span>' +
            '<b>' + esc(s.language) + '</b> <span class="muted fs-12">' + Math.round(s.percent) + '%</span></li>';
        }).join('') + '</ul>' +
      '</div>' : '') +

      '<div class="card mt-4">' +
        '<h3 class="side-title">Releases</h3>' +
        (releases.length
          ? releases.slice(0, 3).map(function (rel, i) {
              return '<div class="side-row"><a href="#' + base + '/releases">' + esc(rel.title || rel.tag) + '</a>' +
                (i === 0 ? ' <span class="label green">Latest</span>' : '') +
                '<div class="muted fs-12 mono">' + esc(rel.tag) + ' · ' + timeAgo(rel.published) + '</div></div>';
            }).join('') + '<a class="side-more" href="#' + base + '/releases">' + releases.length + ' release' + (releases.length === 1 ? '' : 's') + '</a>'
          : '<p class="muted fs-13">No releases published</p>') +
      '</div>' +

      ((forge.tags || []).length ? '<div class="card mt-4">' +
        '<h3 class="side-title">Tags</h3>' +
        '<div class="forge-topics">' + (forge.tags || []).slice(0, 8).map(function (t) {
          return '<a class="topic mono" href="#' + base + '/tags">' + esc(t) + '</a>';
        }).join('') + '</div></div>' : '') +

      '<div class="card mt-4">' +
        '<h3 class="side-title">Copy this forge</h3>' +
        '<div class="copy-row"><code class="mono">' + esc('/forges/' + user.username + '/' + forge.name) + '</code>' +
          '<button class="btn xs icon-only copyAddressBtn" type="button" data-text="' + esc('/forges/' + user.username + '/' + forge.name) + '" aria-label="Copy the forge address">' + ic('copy', 12) + '</button></div>' +
        '<div class="copy-row"><code class="mono">red copy ' + esc(user.username + '/' + forge.name) + '</code>' +
          '<button class="btn xs icon-only copyAddressBtn" type="button" data-text="' + esc('red copy ' + user.username + '/' + forge.name) + '" aria-label="Copy the command">' + ic('copy', 12) + '</button></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

/** Build directory-then-file rows for the root (or a nested) tree. */
function treeRows(files, dir) {
  var prefix = dir ? dir.replace(/\/$/, '') + '/' : '';
  var dirs = {};
  var rows = [];
  (files || []).forEach(function (f) {
    if (prefix && f.name.indexOf(prefix) !== 0) return;
    var rest = f.name.slice(prefix.length);
    var slash = rest.indexOf('/');
    if (slash === -1) { rows.push({ type: 'file', label: rest, path: f.name, file: f }); return; }
    var name = rest.slice(0, slash);
    if (!dirs[name]) {
      dirs[name] = { type: 'dir', label: name, path: prefix + name, msg: '', time: 0, count: 0 };
      rows.push(dirs[name]);
    }
    dirs[name].count++;
    dirs[name].msg = f.commitMsg || dirs[name].msg;
    dirs[name].time = Math.max(dirs[name].time, f.commitTime || 0);
  });
  return rows.sort(function (a, b) {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.label.localeCompare(b.label);
  }).map(function (r) {
    if (r.type === 'dir') r.msg = r.count + ' file' + (r.count === 1 ? '' : 's') + ' · ' + (r.msg || '');
    return r;
  });
}

export function fileIcon(name) {
  if (/^\./.test(name)) return ic('gear', 16);
  if (/\.md$/i.test(name)) return ic('book', 16);
  if (/\.(png|jpe?g|gif|svg|webp|ico)$/i.test(name)) return ic('image', 16);
  if (/\.(ya?ml|toml|ini|conf)$/i.test(name)) return ic('gear', 16);
  if (/\.(js|mjs|jsx|ts|tsx|json|html?|css|scss|py|rb|go|rs|java|c|cpp|h|sh)$/i.test(name)) return ic('code', 16);
  return ic('file', 16);
}

/* ===================================================================== *
   Tree / blob / blame / raw
\* ===================================================================== */

export function viewForgeTree(user, forge, rest) {
  var branch = rest[0] || forge.defaultBranch;
  var path = decodeURIComponent(rest.slice(1).join('/'));
  var base = '/' + user.username + '/' + forge.name;
  var rows = treeRows(forge.files || [], path);
  var commits = commitsFor(forge, branch);
  var head = commits[0] || null;

  return breadcrumb(user, forge, branch, path) +
    '<div class="branch-bar">' +
      '<a class="branch-select" href="#' + base + '">' + ic('redBranch', 14) + ' <b>' + esc(branch) + '</b></a>' +
      '<span class="branch-meta">' + rows.length + ' entr' + (rows.length === 1 ? 'y' : 'ies') + '</span>' +
    '</div>' +
    '<div class="file-browser">' +
      (head ? '<div class="file-browser-head"><div><a class="latest" href="#/' + esc(head.author) + '">' + esc(head.author) + '</a> ' +
        '<span class="latest-msg">' + esc(head.msg) + '</span><span class="latest-meta">' + timeAgo(head.time) + '</span></div></div>' : '') +
      '<div class="file-row"><div class="name"><a href="#' + base + (path.indexOf('/') === -1 ? '' : '/tree/' + encodeURIComponent(branch) + '/' + esc(path.split('/').slice(0, -1).join('/'))) + '">' +
        '<span class="file-icon">' + ic('arrowLeft', 16) + '</span>..</a></div><div class="msg"></div><div class="time"></div></div>' +
      (rows.length ? rows.map(function (row) {
        if (row.type === 'dir') {
          return '<div class="file-row"><div class="name"><a href="#' + base + '/tree/' + encodeURIComponent(branch) + '/' + esc(row.path) + '">' +
            '<span class="file-icon">' + ic('folder', 16) + '</span>' + esc(row.label) + '</a></div>' +
            '<div class="msg">' + esc(row.msg) + '</div><div class="time">' + (row.time ? timeAgo(row.time) : '') + '</div></div>';
        }
        return '<div class="file-row"><div class="name"><a href="#' + base + '/blob/' + encodeURIComponent(branch) + '/' + esc(row.path) + '">' +
          '<span class="file-icon">' + fileIcon(row.label) + '</span>' + esc(row.label) + '</a></div>' +
          '<div class="msg">' + esc(row.file.commitMsg || '') + '</div><div class="time">' + timeAgo(row.file.commitTime || forge.updated) + '</div></div>';
      }).join('') : '<div class="file-browser-empty"><p>Empty directory</p></div>') +
    '</div>';
}

export function viewForgeBlob(user, forge, rest) {
  var branch = rest[0] || forge.defaultBranch;
  var path = decodeURIComponent(rest.slice(1).join('/'));
  var file = fileByName(forge, path);
  var base = '/' + user.username + '/' + forge.name;
  if (!file) {
    return breadcrumb(user, forge, branch, path) +
      '<div class="empty"><div class="empty-icon">' + ic('file', 32) + '</div><h3>File not found</h3>' +
      '<p>Nothing is stored at <span class="mono">' + esc(path) + '</span> in this forge.</p>' +
      '<a class="btn" href="#' + base + '/tree/' + encodeURIComponent(branch) + '">Back to the tree</a></div>';
  }
  var lines = String(file.content || '').split('\n');
  var canEdit = canEditForge(user, forge) && !forge.archived;

  return breadcrumb(user, forge, branch, path) +
    '<div class="blob-head">' +
      '<div class="path">' + fileIcon(file.name) + ' ' + esc(file.name) +
        '<span class="blob-meta">' + lines.length + ' line' + (lines.length === 1 ? '' : 's') + ' · ' + formatBytes((file.content || '').length) + '</span></div>' +
      '<div class="actions">' +
        (canEdit ? '<a class="btn sm" href="#' + base + '/edit/' + encodeURIComponent(branch) + '/' + esc(path) + '">' + ic('pencil', 14) + ' Edit</a>' : '') +
        '<a class="btn sm" href="#' + base + '/raw/' + encodeURIComponent(branch) + '/' + esc(path) + '">' + ic('code', 14) + ' Raw</a>' +
        '<a class="btn sm" href="#' + base + '/blame/' + encodeURIComponent(branch) + '/' + esc(path) + '">' + ic('person', 14) + ' Blame</a>' +
        '<button class="btn sm copyFileBtn" type="button" data-path="' + esc(path) + '">' + ic('copy', 14) + ' Copy</button>' +
        (canEdit ? '<button class="btn sm danger deleteFileBtn" type="button" data-path="' + esc(path) + '">' + ic('trash', 14) + ' Delete</button>' : '') +
      '</div>' +
    '</div>' +
    '<div class="blob-commit-note">' + ic('redCommit', 12) + ' ' + esc(file.commitMsg || 'Initial commit') +
      ' · <a href="#/' + esc(file.author || user.username) + '">' + esc(file.author || user.username) + '</a> · ' +
      timeAgo(file.commitTime || forge.updated) + (file.sha ? ' · <span class="mono">' + String(file.sha).slice(0, 7) + '</span>' : '') + '</div>' +
    '<div class="blob-body"><div class="blob-code">' +
      lines.map(function (l, i) {
        return '<div class="blob-line-num" id="L' + (i + 1) + '">' + (i + 1) + '</div><div class="blob-line">' + highlight(l, file.name) + '</div>';
      }).join('') +
    '</div></div>';
}

export function viewForgeBlame(user, forge, rest) {
  var branch = rest[0] || forge.defaultBranch;
  var path = decodeURIComponent(rest.slice(1).join('/'));
  var file = fileByName(forge, path);
  var base = '/' + user.username + '/' + forge.name;
  if (!file) return viewForgeBlob(user, forge, rest);
  var lines = String(file.content || '').split('\n');
  var groups = [];
  lines.forEach(function (line, i) {
    var last = groups[groups.length - 1];
    if (last && last.author === (file.author || forge.ownerUsername) && last.msg === (file.commitMsg || '')) {
      last.to = i + 1;
      last.lines.push({ n: i + 1, text: line });
    } else {
      groups.push({
        author: file.author || forge.ownerUsername,
        msg: file.commitMsg || 'Initial commit',
        time: file.commitTime || forge.updated,
        from: i + 1, to: i + 1,
        lines: [{ n: i + 1, text: line }],
      });
    }
  });
  return breadcrumb(user, forge, branch, path) +
    '<div class="blob-head"><div class="path">' + ic('person', 16) + ' Blame · ' + esc(file.name) + '</div>' +
      '<div class="actions"><a class="btn sm" href="#' + base + '/blob/' + encodeURIComponent(branch) + '/' + esc(path) + '">Code</a></div></div>' +
    '<div class="blame">' + groups.map(function (g) {
      return '<div class="blame-group">' +
        '<div class="blame-meta"><b>' + esc(g.author) + '</b><span>' + esc(g.msg) + '</span><span class="muted fs-12">lines ' + g.from + '–' + g.to + '</span></div>' +
        '<div class="blame-code">' + g.lines.map(function (l) {
          return '<div class="blob-line-num">' + l.n + '</div><div class="blob-line">' + highlight(l.text, file.name) + '</div>';
        }).join('') + '</div></div>';
    }).join('') + '</div>';
}

export function viewForgeRaw(user, forge, rest) {
  var path = decodeURIComponent(rest.slice(1).join('/'));
  var file = fileByName(forge, path);
  if (!file) return '<div class="empty"><h3>File not found</h3></div>';
  return '<div class="card"><div class="blob-head"><div class="path mono">' + esc(file.name) + '</div>' +
    '<div class="actions"><button class="btn sm copyFileBtn" type="button" data-path="' + esc(path) + '">' + ic('copy', 14) + ' Copy raw</button>' +
    '<a class="btn sm" href="#/' + user.username + '/' + forge.name + '/blob/' + encodeURIComponent(rest[0] || forge.defaultBranch) + '/' + esc(path) + '">Rendered</a></div></div>' +
    '<pre class="raw-view mono">' + esc(file.content || '') + '</pre></div>';
}

function breadcrumb(user, forge, branch, path) {
  var base = '/' + user.username + '/' + forge.name;
  var parts = path ? path.split('/') : [];
  return '<div class="breadcrumb-bar">' +
    '<a href="#' + base + '">' + esc(forge.name) + '</a><span class="sep">/</span>' +
    '<a href="#' + base + '/tree/' + encodeURIComponent(branch) + '">' + esc(branch) + '</a>' +
    (parts.length ? '<span class="sep">/</span>' : '') +
    parts.map(function (p, i) {
      var acc = parts.slice(0, i + 1).join('/');
      if (i === parts.length - 1) return '<span>' + esc(p) + '</span>';
      return '<a href="#' + base + '/tree/' + encodeURIComponent(branch) + '/' + esc(acc) + '">' + esc(p) + '</a><span class="sep">/</span>';
    }).join('') +
  '</div>';
}

/* ===================================================================== *
   File editing
\* ===================================================================== */

export function viewNewFile(user, forge, rest) {
  var branch = rest[0] || forge.defaultBranch;
  var dir = decodeURIComponent(rest.slice(1).join('/'));
  return fileEditor(user, forge, branch, dir ? dir + '/' : '', '', 'Create a new file');
}

export function viewEditFile(user, forge, rest) {
  var branch = rest[0] || forge.defaultBranch;
  var path = decodeURIComponent(rest.slice(1).join('/'));
  var file = fileByName(forge, path);
  return fileEditor(user, forge, branch, path, file ? file.content || '' : '', file ? 'Editing ' + path : 'Editing');
}

function fileEditor(user, forge, branch, path, content, title) {
  var base = '/' + user.username + '/' + forge.name;
  return '<div class="card">' +
    '<h3 class="card-title">' + esc(title) + '</h3>' +
    '<div class="form-group"><label class="form-label" for="filePathInput">File path</label>' +
      '<input type="text" class="input mono" id="filePathInput" value="' + esc(path) + '" placeholder="src/index.js"></div>' +
    '<div class="form-group"><label class="form-label" for="fileContentInput">Contents</label>' +
      '<textarea class="input mono editor-area" id="fileContentInput" rows="20" spellcheck="false">' + esc(content) + '</textarea></div>' +
    '<div class="form-group"><label class="form-label" for="fileCommitMessage">Commit message</label>' +
      '<input type="text" class="input" id="fileCommitMessage" placeholder="' + esc(path ? 'Update ' + path : 'Create file') + '"></div>' +
    '<div class="form-row"><label class="checkbox"><input type="radio" name="commitTarget" value="direct" checked> Commit directly to <b>' + esc(branch) + '</b></label>' +
      '<label class="checkbox"><input type="radio" name="commitTarget" value="branch"> Create a new branch and start a pull request</label></div>' +
    '<div class="form-error" id="fileErr"></div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="btn primary" id="saveFileBtn" type="button" data-original="' + esc(path) + '">' + ic('check', 14) + ' Commit changes</button>' +
      '<a class="btn" href="#' + base + (path ? '/blob/' + encodeURIComponent(branch) + '/' + esc(path) : '') + '">Cancel</a>' +
    '</div>' +
  '</div>';
}

/* ===================================================================== *
   Commits
\* ===================================================================== */

export function viewForgeCommits(user, forge, rest) {
  var branch = rest[0] || forge.defaultBranch;
  var base = '/' + user.username + '/' + forge.name;
  var commits = commitsFor(forge, branch);
  if (!commits.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('redCommit', 32) + '</div><h3>No commits</h3>' +
      '<p>' + esc(branch) + ' has no history yet.</p></div>';
  }
  var groups = [];
  commits.forEach(function (c) {
    var day = new Date(c.time).toDateString();
    if (!groups.length || groups[groups.length - 1].day !== day) groups.push({ day: day, items: [] });
    groups[groups.length - 1].items.push(c);
  });

  return '<div class="card-tight commits-panel">' +
    '<div class="commits-head">' +
      '<div><b>Commits on <span class="mono">' + esc(branch) + '</span></b></div>' +
      '<div class="muted fs-12">' + commits.length + ' commit' + (commits.length === 1 ? '' : 's') + '</div>' +
    '</div>' +
    '<div class="commit-list">' + groups.map(function (g) {
      return '<div class="commit-day">Commits on ' + esc(g.day) + '</div>' +
        g.items.map(function (c) {
          var account = getUserByUsername(c.author) || { username: c.author, avatar: null };
          return '<div class="commit-item">' +
            '<div class="commit-item-main">' +
              '<div class="commit-msg"><a href="#' + base + '/commit/' + esc(c.sha) + '">' + esc(c.msg) + '</a>' +
                (c.tag ? ' <span class="label">' + ic('tag', 10) + ' ' + esc(c.tag) + '</span>' : '') + '</div>' +
              '<div class="commit-sub">' + avatarHTML(account, 20) + ' <b>' + esc(c.author) + '</b> committed ' + timeAgo(c.time) + '</div>' +
            '</div>' +
            '<div class="commit-right">' +
              '<a class="commit-sha mono" href="#' + base + '/commit/' + esc(c.sha) + '">' + c.sha.slice(0, 7) + '</a>' +
              '<button class="btn sm icon-only copyShaBtn" type="button" data-sha="' + esc(c.sha) + '" aria-label="Copy full SHA">' + ic('copy', 14) + '</button>' +
            '</div>' +
          '</div>';
        }).join('');
    }).join('') + '</div>' +
  '</div>';
}

export function viewForgeCommit(user, forge, rest) {
  var base = '/' + user.username + '/' + forge.name;
  var sha = rest[0] || '';
  var commit = commitBySha(forge, sha);
  if (!commit) {
    return '<div class="empty"><div class="empty-icon">' + ic('redCommit', 32) + '</div><h3>Commit not found</h3>' +
      '<p>No commit in this forge starts with <span class="mono">' + esc(sha) + '</span>.</p>' +
      '<a class="btn" href="#' + base + '/commits/' + encodeURIComponent(forge.defaultBranch) + '">Back to history</a></div>';
  }
  var account = getUserByUsername(commit.author) || { username: commit.author, avatar: null };
  var files = (commit.files || []).map(function (name) { return fileByName(forge, name); }).filter(Boolean);

  return '<div class="mb-4"><a class="muted" href="#' + base + '/commits/' + encodeURIComponent(forge.defaultBranch) + '">' + ic('arrowLeft', 12) + ' Back to commits</a></div>' +
    '<div class="card mb-4">' +
      '<div class="commit-detail-head">' +
        '<div class="commit-detail-msg">' + esc(commit.msg) + '</div>' +
        '<div class="commit-detail-actions">' +
          '<a class="commit-sha mono" href="#' + base + '/commit/' + esc(commit.sha) + '">' + commit.sha.slice(0, 7) + '</a>' +
          '<button class="btn sm icon-only copyShaBtn" type="button" data-sha="' + esc(commit.sha) + '" aria-label="Copy full SHA">' + ic('copy', 14) + '</button>' +
        '</div>' +
      '</div>' +
      (commit.body ? '<div class="readme-body mt-2">' + md(commit.body) + '</div>' : '') +
      '<div class="commit-detail-meta mt-2">' + avatarHTML(account, 20) + ' <b>' + esc(commit.author) + '</b> committed ' +
        formatDate(commit.time) + ' · ' + timeAgo(commit.time) + '</div>' +
      '<div class="commit-detail-stats">' +
        '<span class="label">' + files.length + ' file' + (files.length === 1 ? '' : 's') + '</span>' +
        '<span class="stat-add">+' + (commit.additions || 0) + '</span>' +
        '<span class="stat-del">-' + (commit.deletions || 0) + '</span>' +
        '<span class="muted fs-12 mono">' + esc(commit.sha) + '</span>' +
      '</div>' +
    '</div>' +
    (files.length ? '<div class="commit-files">' + files.map(function (f) {
      var lines = String(f.content || '').split('\n');
      return '<div class="commit-file">' +
        '<div class="commit-file-head">' +
          '<span class="filename mono">' + esc(f.name) + '</span>' +
          '<span class="commit-file-actions">' +
            '<a class="btn xs" href="#' + base + '/blob/' + encodeURIComponent(forge.defaultBranch) + '/' + esc(f.name) + '">View</a>' +
            '<span class="stat-add">+' + (commit.additions || 0) + '</span>' +
            '<span class="stat-del">-' + (commit.deletions || 0) + '</span>' +
          '</span>' +
        '</div>' +
        '<table class="diff-table"><tbody>' +
          '<tr class="diff-hunk"><td class="diff-line-num"></td><td class="diff-line-num"></td><td class="diff-code">@@ -1,' + lines.length + ' +1,' + lines.length + ' @@</td></tr>' +
          lines.slice(0, 40).map(function (l, i) {
            return '<tr><td class="diff-line-num">' + (i + 1) + '</td><td class="diff-line-num">' + (i + 1) + '</td><td class="diff-code">' + esc(l) + '</td></tr>';
          }).join('') +
          (lines.length > 40 ? '<tr class="diff-hunk"><td class="diff-line-num"></td><td class="diff-line-num"></td><td class="diff-code">… ' + (lines.length - 40) + ' more lines — open the file to read them</td></tr>' : '') +
        '</tbody></table>' +
      '</div>';
    }).join('') + '</div>'
    : '<div class="card"><p class="muted fs-13">This commit recorded no file changes.</p></div>');
}

export function viewForgeCompare(user, forge, rest) {
  var spec = decodeURIComponent((rest || []).join('/')) || (forge.defaultBranch + '...' + forge.defaultBranch);
  var parts = spec.split('...');
  var baseBranch = parts[0] || forge.defaultBranch;
  var headBranch = parts[1] || baseBranch;
  var base = '/' + user.username + '/' + forge.name;
  var commits = commitsFor(forge, headBranch);
  var same = baseBranch === headBranch;

  return '<div class="card">' +
    '<h3 class="card-title">Comparing <span class="mono">' + esc(baseBranch) + '</span>…<span class="mono">' + esc(headBranch) + '</span></h3>' +
    '<div class="form-row mb-4">' +
      '<select class="input" id="compareBase">' + (forge.branches || []).map(function (b) {
        return '<option value="' + esc(b) + '"' + (b === baseBranch ? ' selected' : '') + '>' + esc(b) + '</option>';
      }).join('') + '</select>' +
      '<span class="muted">…</span>' +
      '<select class="input" id="compareHead">' + (forge.branches || []).map(function (b) {
        return '<option value="' + esc(b) + '"' + (b === headBranch ? ' selected' : '') + '>' + esc(b) + '</option>';
      }).join('') + '</select>' +
      '<button class="btn compareBtn" type="button">Compare</button>' +
    '</div>' +
    (same
      ? '<div class="callout">' + ic('info', 14) + ' There is nothing to compare — both sides are the same branch.</div>'
      : '<div class="stat-grid mb-4">' +
          '<div class="stat"><div class="stat-value">' + commits.length + '</div><div class="stat-label">commits on ' + esc(headBranch) + '</div></div>' +
          '<div class="stat"><div class="stat-value">' + commits.reduce(function (n, c) { return n + (c.additions || 0); }, 0) + '</div><div class="stat-label">additions</div></div>' +
          '<div class="stat"><div class="stat-value">' + commits.reduce(function (n, c) { return n + (c.deletions || 0); }, 0) + '</div><div class="stat-label">deletions</div></div>' +
        '</div>' +
        '<div class="card-tight">' + commits.map(function (c) {
          return '<div class="list-item"><div class="list-icon">' + ic('redCommit', 14) + '</div>' +
            '<div class="list-body"><div class="list-title">' + esc(c.msg) + '</div>' +
            '<div class="list-meta mono">' + c.sha.slice(0, 7) + ' · ' + esc(c.author) + ' · ' + timeAgo(c.time) + '</div></div></div>';
        }).join('') + '</div>' +
        '<div style="margin-top:16px"><a class="btn primary" href="#' + base + '/pulls/new?base=' + encodeURIComponent(baseBranch) + '&head=' + encodeURIComponent(headBranch) + '">' +
          ic('redPR', 14) + ' Create pull request</a></div>') +
  '</div>';
}

/* ===================================================================== *
   Issues
\* ===================================================================== */

export function viewForgeIssues(user, forge, rest) {
  if (rest.length && /^\d+$/.test(rest[0])) return viewForgeIssueDetail(user, forge, parseInt(rest[0], 10));
  if (rest[0] === 'new') return issueComposer(user, forge, 'issue');
  return itemList(user, forge, 'issues', rest);
}

export function viewForgePulls(user, forge, rest) {
  if (rest.length && /^\d+$/.test(rest[0])) return viewForgePullDetail(user, forge, parseInt(rest[0], 10), rest[1]);
  if (rest[0] === 'new') return pullComposer(user, forge, rest);
  return itemList(user, forge, 'pulls', rest);
}

/** `#/owner/forge/pull/7/files` — the singular alias used by notifications. */
export function viewForgePull(user, forge, rest) {
  return viewForgePullDetail(user, forge, parseInt(rest[0] || '1', 10), rest[1]);
}

function itemList(user, forge, type, rest) {
  var base = '/' + user.username + '/' + forge.name;
  var all = type === 'issues' ? issuesFor(forge) : pullsFor(forge);
  var state = (rest && rest[0]) === 'closed' ? 'closed' : 'open';
  var query = parseQuery(rest);
  var labelFilter = query.label || '';
  var authorFilter = query.author || '';
  var text = (query.q || '').toLowerCase();

  var filtered = all.filter(function (item) {
    if (state === 'open' ? item.state !== 'open' : item.state === 'open') return false;
    if (labelFilter && !(item.labels || []).some(function (l) { return l.name === labelFilter; })) return false;
    if (authorFilter && item.author !== authorFilter) return false;
    if (text && (item.title + ' ' + (item.body || '')).toLowerCase().indexOf(text) === -1) return false;
    return true;
  });

  var openCount = all.filter(function (i) { return i.state === 'open'; }).length;
  var closedCount = all.length - openCount;
  var canCreate = ME && !forge.archived && (type === 'issues' ? forge.issuesEnabled !== false : forge.pullsEnabled !== false);
  var route = type === 'issues' ? 'issues' : 'pulls';
  var labels = labelsFor(forge);

  return '<div class="list-toolbar">' +
    '<div class="list-toolbar-left">' +
      '<a class="tool-btn' + (state === 'open' ? ' on' : '') + '" href="#' + base + '/' + route + '">' +
        ic(type === 'issues' ? 'issueOpened' : 'redMergeRequest', 14) + ' ' + openCount + ' Open</a>' +
      '<a class="tool-btn' + (state === 'closed' ? ' on' : '') + '" href="#' + base + '/' + route + '/closed">' +
        ic(type === 'issues' ? 'issueClosed' : 'redMerge', 14) + ' ' + closedCount + ' Closed</a>' +
    '</div>' +
    '<div class="list-toolbar-right">' +
      (labels.length ? '<select class="input xs" id="labelFilter" aria-label="Filter by label">' +
        '<option value="">All labels</option>' + labels.map(function (l) {
          return '<option value="' + esc(l.name) + '"' + (l.name === labelFilter ? ' selected' : '') + '>' + esc(l.name) + '</option>';
        }).join('') + '</select>' : '') +
      '<input type="search" class="input xs" id="listSearch" placeholder="Search…" value="' + esc(query.q || '') + '" aria-label="Search">' +
      (canCreate ? '<a class="btn sm primary" href="#' + base + '/' + route + '/new">' + ic('plus', 14) + ' New ' + (type === 'issues' ? 'issue' : 'pull request') + '</a>' : '') +
    '</div>' +
  '</div>' +
  '<div class="card-tight">' +
    (filtered.length
      ? filtered.map(function (item) { return itemRow(user, forge, type, item); }).join('')
      : '<div class="list-empty">' + ic(type === 'issues' ? 'issue' : 'redPR', 28) +
        '<h3>No ' + (type === 'issues' ? 'issues' : 'pull requests') + ' match</h3>' +
        '<p class="muted fs-13">' + (all.length
          ? 'Nothing is ' + state + (labelFilter || text ? ' with those filters' : '') + '.'
          : (type === 'issues' ? 'Issues track bugs and feature requests for this forge.' : 'Pull requests propose changes from one branch to another.')) + '</p></div>') +
  '</div>';
}

function itemRow(user, forge, type, item) {
  var base = '/' + user.username + '/' + forge.name;
  var route = type === 'issues' ? 'issues' : 'pull';
  var account = getUserByUsername(item.author) || { username: item.author, avatar: null };
  var comments = (item.comments || []).length;
  var stateIcon = type === 'issues'
    ? (item.state === 'open' ? 'issueOpened' : 'issueClosed')
    : (item.merged ? 'redMerge' : item.state === 'open' ? (item.draft ? 'redMergeDraft' : 'redMergeRequest') : 'redPR');
  var colour = item.merged ? 'var(--purple)' : item.state === 'open' ? 'var(--green)' : 'var(--red)';

  return '<div class="list-item">' +
    '<div class="list-icon" style="color:' + colour + '">' + ic(stateIcon, 16) + '</div>' +
    '<div class="list-body">' +
      '<div class="list-title"><a href="#' + base + '/' + route + '/' + item.number + '">' + esc(item.title) + '</a>' +
        (item.draft ? ' <span class="label">Draft</span>' : '') +
        (item.pinned ? ' <span class="label">' + ic('pin', 10) + ' Pinned</span>' : '') + '</div>' +
      '<div class="list-meta">#' + item.number + ' ' + (item.state === 'open' ? 'opened' : (item.merged ? 'merged' : 'closed')) +
        ' ' + timeAgo(item.state === 'open' ? item.created : (item.closedAt || item.updated || item.created)) +
        ' by <a href="#/' + esc(item.author) + '">' + esc(item.author) + '</a>' +
        (type === 'pulls' ? ' · <span class="mono">' + esc(item.head || '') + ' → ' + esc(item.base || '') + '</span>' : '') + '</div>' +
      ((item.labels || []).length ? '<div class="list-labels">' + item.labels.map(function (l) {
        return '<span class="label" style="border-color:' + esc(labelColor(l)) + ';color:' + esc(labelColor(l)) + '">' + esc(l.name) + '</span>';
      }).join('') + '</div>' : '') +
    '</div>' +
    '<div class="list-side">' + avatarHTML(account, 20) +
      (comments ? '<span class="side-count">' + ic('comment', 14) + ' ' + comments + '</span>' : '') +
      ((item.reactions && Object.keys(item.reactions).length) ? '<span class="side-count">' + ic('emojiSmile', 14) + ' ' +
        Object.keys(item.reactions).reduce(function (n, k) { return n + (item.reactions[k] || []).length; }, 0) + '</span>' : '') +
    '</div>' +
  '</div>';
}

function labelColor(label) {
  if (!label) return 'var(--border)';
  if (label.color && label.color.charAt(0) === '#') return label.color;
  var palette = { red: '#f85149', green: '#3fb950', blue: '#58a6ff', purple: '#bc8cff', orange: '#ffa657', yellow: '#e3b341', grey: '#8b949e' };
  return palette[label.color] || '#8b949e';
}

/** Read `?a=b&c=d` from the current hash (the router hands us path parts only). */
function parseQuery(rest) {
  var out = {};
  var hash = String(location.hash || '');
  var q = hash.indexOf('?');
  if (q !== -1) {
    hash.slice(q + 1).split('&').forEach(function (pair) {
      if (!pair) return;
      var kv = pair.split('=');
      out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
    });
  }
  return out;
}

function issueComposer(user, forge, kind) {
  var base = '/' + user.username + '/' + forge.name;
  var labels = labelsFor(forge);
  var milestones = milestonesFor(forge);
  var people = contributorsForSelect(user, forge);
  return '<div class="card">' +
    '<h3 class="card-title">New issue</h3>' +
    '<div class="form-group"><label class="form-label" for="niTitle">Title</label>' +
      '<input type="text" class="input" id="niTitle" data-autofocus placeholder="Something broke when…"></div>' +
    '<div class="form-group"><label class="form-label" for="niBody">Description</label>' +
      '<textarea class="input" id="niBody" rows="10" placeholder="Describe the problem. Mention @someone or reference #12 to link it."></textarea></div>' +
    '<div class="form-row">' +
      '<div class="form-group"><label class="form-label" for="niLabels">Labels</label>' +
        '<select class="input" id="niLabels" multiple size="4">' + labels.map(function (l) {
          return '<option value="' + esc(l.name) + '">' + esc(l.name) + '</option>';
        }).join('') + '</select></div>' +
      '<div class="form-group"><label class="form-label" for="niAssignees">Assignees</label>' +
        '<select class="input" id="niAssignees" multiple size="4">' + people.map(function (p) {
          return '<option value="' + esc(p) + '">' + esc(p) + '</option>';
        }).join('') + '</select></div>' +
      '<div class="form-group"><label class="form-label" for="niMilestone">Milestone</label>' +
        '<select class="input" id="niMilestone"><option value="">None</option>' + milestones.map(function (m) {
          return '<option value="' + esc(m.title) + '">' + esc(m.title) + '</option>';
        }).join('') + '</select></div>' +
    '</div>' +
    '<div class="form-error" id="niErr"></div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="btn primary" id="niGo" type="button">' + ic('issue', 14) + ' Create issue</button>' +
      '<a class="btn" href="#' + base + '/issues">Cancel</a>' +
    '</div>' +
  '</div>';
}

function contributorsForSelect(user, forge) {
  var names = {};
  names[user.username] = true;
  (forge.commits || []).forEach(function (c) { if (c.author) names[c.author] = true; });
  if (ME) names[ME.username] = true;
  return Object.keys(names);
}

export function viewForgeIssueDetail(user, forge, num) {
  var issue = issueByNumber(forge, num);
  var base = '/' + user.username + '/' + forge.name;
  if (!issue) {
    return '<div class="empty"><div class="empty-icon">' + ic('issue', 32) + '</div><h3>Issue not found</h3>' +
      '<p>There is no issue #' + esc(String(num)) + ' in this forge.</p>' +
      '<a class="btn" href="#' + base + '/issues">Back to issues</a></div>';
  }
  var account = getUserByUsername(issue.author) || { username: issue.author, avatar: null };
  var comments = issue.comments || [];
  var canEdit = canEditForge(user, forge);
  var milestones = milestonesFor(forge);

  return '<div class="mb-4"><a class="muted" href="#' + base + '/issues">' + ic('arrowLeft', 12) + ' Back to issues</a></div>' +
    '<div class="grid-2col">' +
      '<div>' +
        '<div class="card mb-4">' +
          '<div class="issue-head">' +
            '<span class="label ' + (issue.state === 'open' ? 'green' : 'red') + '">' +
              ic(issue.state === 'open' ? 'issueOpened' : 'issueClosed', 12) + ' ' + esc(issue.state) + '</span>' +
            '<h2 class="issue-title">' + esc(issue.title) + ' <span class="muted">#' + issue.number + '</span></h2>' +
          '</div>' +
          '<div class="muted fs-13">' + esc(issue.author) + ' opened this issue ' + timeAgo(issue.created) + ' · ' +
            comments.length + ' comment' + (comments.length === 1 ? '' : 's') +
            (issue.closedAt ? ' · closed ' + timeAgo(issue.closedAt) + (issue.closedBy ? ' by ' + esc(issue.closedBy) : '') : '') + '</div>' +
        '</div>' +

        '<div class="card mb-4">' +
          '<div class="comment-head">' + avatarHTML(account, 32) +
            '<div><b>' + esc(issue.author) + '</b><div class="muted fs-12">' + timeAgo(issue.created) + '</div></div>' +
            (canEdit ? '<div class="comment-head-actions">' +
              '<button class="btn xs editItemBtn" type="button" data-kind="issue" data-id="' + esc(issue.id) + '">' + ic('pencil', 11) + ' Edit</button>' +
              '<button class="btn xs danger deleteItemBtn" type="button" data-kind="issue" data-id="' + esc(issue.id) + '">' + ic('trash', 11) + '</button></div>' : '') +
          '</div>' +
          '<div class="readme-body">' + md(issue.body || '_No description provided._') + '</div>' +
          reactionBar(issue, 'issue', issue.id) +
        '</div>' +

        comments.map(function (c) {
          var cAccount = getUserByUsername(c.author) || { username: c.author, avatar: null };
          return '<div class="card mb-4 comment-card">' +
            '<div class="comment-head">' + avatarHTML(cAccount, 32) +
              '<div><b>' + esc(c.author) + '</b><div class="muted fs-12">commented ' + timeAgo(c.created) + '</div></div>' +
              (canEdit || (ME && ME.username === c.author) ? '<div class="comment-head-actions">' +
                '<button class="btn xs danger deleteCommentBtn" type="button" data-id="' + esc(c.id) + '">' + ic('trash', 11) + '</button></div>' : '') +
            '</div>' +
            '<div class="readme-body">' + md(c.body) + '</div>' +
            reactionBar(c, 'comment', c.id) +
          '</div>';
        }).join('') +

        (ME && !forge.archived
          ? '<div class="card">' +
              '<h3 class="card-title">Leave a comment</h3>' +
              '<textarea class="input" id="commentBody" rows="4" placeholder="Write a comment — markdown supported"></textarea>' +
              '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
                '<button class="btn primary commentBtn" type="button" data-kind="issue" data-id="' + esc(issue.id) + '">' + ic('comment', 14) + ' Comment</button>' +
                (issue.state === 'open'
                  ? '<button class="btn danger stateBtn" type="button" data-kind="issue" data-id="' + esc(issue.id) + '" data-state="closed">' + ic('issueClosed', 14) + ' Close issue</button>'
                  : '<button class="btn green stateBtn" type="button" data-kind="issue" data-id="' + esc(issue.id) + '" data-state="open">' + ic('issueReopened', 14) + ' Reopen issue</button>') +
              '</div>' +
            '</div>'
          : '<div class="card"><p class="muted fs-13">Sign in to comment on this issue.</p></div>') +
      '</div>' +

      '<div class="sticky-side">' +
        '<div class="card">' +
          '<h3 class="side-title">Assignees</h3>' +
          ((issue.assignees || []).length
            ? '<div class="assignee-list">' + issue.assignees.map(function (a) {
                var acc = getUserByUsername(a) || { username: a, avatar: null };
                return '<span class="assignee">' + avatarHTML(acc, 20) + ' ' + esc(a) + '</span>';
              }).join('') + '</div>'
            : '<p class="muted fs-13">No one assigned</p>') +
          (canEdit ? '<select class="input xs mt-2" id="assigneeSelect" aria-label="Assign">' +
            '<option value="">Assign someone…</option>' + contributorsForSelect(user, forge).map(function (p) {
              return '<option value="' + esc(p) + '">' + esc(p) + '</option>';
            }).join('') + '</select>' : '') +

          '<h3 class="side-title mt-4">Labels</h3>' +
          ((issue.labels || []).length
            ? '<div class="list-labels">' + issue.labels.map(function (l) {
                return '<span class="label" style="border-color:' + esc(labelColor(l)) + ';color:' + esc(labelColor(l)) + '">' + esc(l.name) + '</span>';
              }).join('') + '</div>'
            : '<p class="muted fs-13">None yet</p>') +
          (canEdit ? '<select class="input xs mt-2" id="labelSelect" aria-label="Add label">' +
            '<option value="">Add a label…</option>' + labelsFor(forge).map(function (l) {
              return '<option value="' + esc(l.name) + '">' + esc(l.name) + '</option>';
            }).join('') + '</select>' : '') +

          '<h3 class="side-title mt-4">Milestone</h3>' +
          (issue.milestone
            ? '<div class="milestone-note"><b>' + esc(issue.milestone) + '</b>' + milestoneBar(forge, issue.milestone) + '</div>'
            : '<p class="muted fs-13">No milestone</p>') +
          (canEdit ? '<select class="input xs mt-2" id="milestoneSelect" aria-label="Set milestone">' +
            '<option value="">No milestone</option>' + milestones.map(function (m) {
              return '<option value="' + esc(m.title) + '"' + (m.title === issue.milestone ? ' selected' : '') + '>' + esc(m.title) + '</option>';
            }).join('') + '</select>' : '') +

          '<h3 class="side-title mt-4">Notifications</h3>' +
          '<p class="muted fs-13">' + (isWatching(forge.id) ? 'You are watching this forge.' : 'You are not watching this forge.') + '</p>' +
          '<button class="btn sm block mt-2" id="watchBtn" data-forge-id="' + esc(forge.id) + '" type="button">' +
            ic('bell', 14) + ' ' + (isWatching(forge.id) ? 'Unwatch' : 'Watch') + '</button>' +
        '</div>' +
        (canEdit ? '<div class="card mt-4"><h3 class="side-title">Admin</h3>' +
          '<button class="btn sm block lockBtn" type="button" data-kind="issue" data-id="' + esc(issue.id) + '">' +
            ic('lock', 14) + ' ' + (issue.locked ? 'Unlock conversation' : 'Lock conversation') + '</button>' +
          '<button class="btn sm block mt-2 pinBtn" type="button" data-kind="issue" data-id="' + esc(issue.id) + '">' +
            ic('pin', 14) + ' ' + (issue.pinned ? 'Unpin issue' : 'Pin issue') + '</button>' +
        '</div>' : '') +
      '</div>' +
    '</div>';
}

function milestoneBar(forge, title) {
  var progress = milestoneProgress(forge, title);
  return '<div class="progress" title="' + progress.closed + ' closed of ' + progress.total + '"><span style="width:' + progress.percent + '%"></span></div>' +
    '<div class="muted fs-12">' + progress.closed + '/' + progress.total + ' complete</div>';
}

function reactionBar(target, kind, id) {
  if (!ME) return '';
  var counts = REACTION_KINDS.map(function (k) {
    return { kind: k, count: reactionCount(target, k), mine: hasReacted(target, k) };
  }).filter(function (r) { return r.count || r.mine; });
  return '<div class="reaction-bar">' +
    counts.map(function (r) {
      return '<button class="reaction' + (r.mine ? ' mine' : '') + ' reactBtn" type="button" data-kind="' + esc(kind) + '" data-id="' + esc(id) + '" data-reaction="' + esc(r.kind) + '">' +
        ic(r.kind === '+1' ? 'thumbsup' : r.kind === '-1' ? 'thumbsdown' : r.kind === 'eyes' ? 'eye' : r.kind, 12) + ' ' + r.count + '</button>';
    }).join('') +
    '<button class="reaction add-reaction reactMenuBtn" type="button" data-kind="' + esc(kind) + '" data-id="' + esc(id) + '" aria-label="Add a reaction">' + ic('emojiSmile', 12) + '</button>' +
  '</div>';
}

/* ===================================================================== *
   Pull requests
\* ===================================================================== */

function pullComposer(user, forge, rest) {
  var base = '/' + user.username + '/' + forge.name;
  var query = parseQuery(rest);
  var branches = forge.branches || [forge.defaultBranch];
  var baseBranch = query.base || forge.defaultBranch;
  var headBranch = query.head || branches.filter(function (b) { return b !== baseBranch; })[0] || baseBranch;
  var commits = commitsFor(forge, headBranch);

  if (branches.length < 2) {
    return '<div class="empty"><div class="empty-icon">' + ic('redPR', 32) + '</div><h3>Nothing to compare</h3>' +
      '<p>A pull request needs two branches. This forge only has <span class="mono">' + esc(branches.join(', ')) + '</span>.</p>' +
      '<a class="btn primary" href="#' + base + '/branches">Manage branches</a></div>';
  }

  return '<div class="card">' +
    '<h3 class="card-title">Open a pull request</h3>' +
    '<div class="form-row mb-4">' +
      '<select class="input" id="prBase" aria-label="Base branch">' + branches.map(function (b) {
        return '<option value="' + esc(b) + '"' + (b === baseBranch ? ' selected' : '') + '>base: ' + esc(b) + '</option>';
      }).join('') + '</select>' +
      '<span class="muted">' + ic('arrowLeft', 14) + '</span>' +
      '<select class="input" id="prHead" aria-label="Head branch">' + branches.map(function (b) {
        return '<option value="' + esc(b) + '"' + (b === headBranch ? ' selected' : '') + '>compare: ' + esc(b) + '</option>';
      }).join('') + '</select>' +
    '</div>' +
    '<div class="callout mb-4">' + ic('info', 14) + ' ' + commits.length + ' commit' + (commits.length === 1 ? '' : 's') +
      ' on <span class="mono">' + esc(headBranch) + '</span>' + (commits.length ? ' — the newest is “' + esc(commits[0].msg) + '”' : '') + '</div>' +
    '<div class="form-group"><label class="form-label" for="prTitle">Title</label>' +
      '<input type="text" class="input" id="prTitle" data-autofocus value="' + esc(commits[0] ? commits[0].msg : '') + '" placeholder="Short summary of the change"></div>' +
    '<div class="form-group"><label class="form-label" for="prBody">Description</label>' +
      '<textarea class="input" id="prBody" rows="8" placeholder="What changed and why. Writing “Fixes #3” closes issue 3 when this merges."></textarea></div>' +
    '<label class="checkbox"><input type="checkbox" id="prDraft"> Create as a draft</label>' +
    '<div class="form-error" id="prErr"></div>' +
    '<div style="display:flex;gap:8px;margin-top:12px">' +
      '<button class="btn primary" id="prGo" type="button">' + ic('redPR', 14) + ' Create pull request</button>' +
      '<a class="btn" href="#' + base + '/pulls">Cancel</a>' +
    '</div>' +
  '</div>';
}

export function viewForgePullDetail(user, forge, num, tab) {
  var pr = pullByNumber(forge, num);
  var base = '/' + user.username + '/' + forge.name;
  if (!pr) {
    return '<div class="empty"><div class="empty-icon">' + ic('redPR', 32) + '</div><h3>Pull request not found</h3>' +
      '<p>There is no pull request #' + esc(String(num)) + ' in this forge.</p>' +
      '<a class="btn" href="#' + base + '/pulls">Back to pull requests</a></div>';
  }
  var account = getUserByUsername(pr.author) || { username: pr.author, avatar: null };
  var activeTab = ['conversation', 'commits', 'checks', 'files'].indexOf(tab) !== -1 ? tab : 'conversation';
  var comments = pr.comments || [];
  var reviews = pr.reviews || [];
  var commits = (pr.commits || []).map(function (sha) { return commitBySha(forge, sha); }).filter(Boolean);
  var files = (pr.files || []).map(function (name) { return fileByName(forge, name); }).filter(Boolean);
  var checks = runsFor(forge).slice(0, 5);
  var canEdit = canEditForge(user, forge);
  var stateIcon = pr.merged ? 'redMerge' : pr.state === 'open' ? (pr.draft ? 'redMergeDraft' : 'redMergeRequest') : 'redPR';
  var stateColour = pr.merged ? 'var(--purple)' : pr.state === 'open' ? 'var(--green)' : 'var(--red)';

  function pullTab(key, icon, label, count) {
    return '<a class="forge-tab' + (activeTab === key ? ' active' : '') + '" href="#' + base + '/pull/' + pr.number + '/' + key + '">' +
      ic(icon, 16) + ' ' + esc(label) + (count ? ' <span class="counter">' + count + '</span>' : '') + '</a>';
  }

  var content = '';
  if (activeTab === 'commits') {
    content = commits.length ? '<div class="card-tight">' + commits.map(function (c) {
      return '<div class="list-item"><div class="list-icon">' + ic('redCommit', 14) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(c.msg) + '</div>' +
        '<div class="list-meta mono">' + c.sha.slice(0, 7) + ' · ' + esc(c.author) + ' · ' + timeAgo(c.time) + '</div></div></div>';
    }).join('') + '</div>' : '<div class="empty"><h3>No commits recorded</h3></div>';
  } else if (activeTab === 'checks') {
    content = checks.length ? '<div class="card-tight">' + checks.map(function (run) {
      return '<div class="list-item"><div class="list-icon" style="color:' + (run.conclusion === 'success' ? 'var(--green)' : run.conclusion === 'failure' ? 'var(--red)' : 'var(--text-muted)') + '">' +
        ic(run.conclusion === 'success' ? 'checkCircle' : run.conclusion === 'failure' ? 'x' : 'clock', 16) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(run.workflowName) + ' #' + run.number + '</div>' +
        '<div class="list-meta">' + esc(run.event) + ' · ' + esc(run.branch) + ' · ' + timeAgo(run.created) + '</div></div>' +
        '<div class="list-side"><a class="btn sm" href="#' + base + '/actions/workflows/' + esc(run.workflowId) + '/' + esc(run.id) + '">Logs</a></div></div>';
    }).join('') + '</div>' : '<div class="empty"><div class="empty-icon">' + ic('checkCircle', 32) + '</div><h3>No checks</h3>' +
      '<p>Add a workflow file under <span class="mono">.redget/workflows/</span> to run checks on this pull request.</p></div>';
  } else if (activeTab === 'files') {
    content = files.length ? '<div class="commit-files">' + files.map(function (f) {
      var lines = String(f.content || '').split('\n');
      return '<div class="commit-file"><div class="commit-file-head"><span class="filename mono">' + esc(f.name) + '</span>' +
        '<span class="commit-file-actions"><span class="stat-add">+' + lines.length + '</span></span></div>' +
        '<table class="diff-table"><tbody>' + lines.slice(0, 60).map(function (l, i) {
          return '<tr class="diff-add"><td class="diff-line-num">' + (i + 1) + '</td><td class="diff-line-num"></td><td class="diff-code">' + esc(l) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }).join('') + '</div>' : '<div class="empty"><h3>No file changes recorded</h3></div>';
  } else {
    content = '<div class="card mb-4">' +
        '<div class="comment-head">' + avatarHTML(account, 32) +
          '<div><b>' + esc(pr.author) + '</b><div class="muted fs-12">opened ' + timeAgo(pr.created) + '</div></div></div>' +
        '<div class="readme-body">' + md(pr.body || '_No description provided._') + '</div>' +
        reactionBar(pr, 'pull', pr.id) +
      '</div>' +
      reviews.map(function (r) {
        var rAccount = getUserByUsername(r.author) || { username: r.author, avatar: null };
        return '<div class="card mb-4 review-card ' + esc(r.state) + '">' +
          '<div class="comment-head">' + avatarHTML(rAccount, 24) + '<div><b>' + esc(r.author) + '</b> ' +
          '<span class="label ' + (r.state === 'approved' ? 'green' : r.state === 'changes' ? 'red' : '') + '">' + esc(r.state) + '</span>' +
          '<div class="muted fs-12">' + timeAgo(r.created) + '</div></div></div>' +
          (r.body ? '<div class="readme-body">' + md(r.body) + '</div>' : '') + '</div>';
      }).join('') +
      comments.map(function (c) {
        var cAccount = getUserByUsername(c.author) || { username: c.author, avatar: null };
        return '<div class="card mb-4 comment-card">' +
          '<div class="comment-head">' + avatarHTML(cAccount, 32) +
            '<div><b>' + esc(c.author) + '</b><div class="muted fs-12">commented ' + timeAgo(c.created) + '</div></div></div>' +
          '<div class="readme-body">' + md(c.body) + '</div>' + reactionBar(c, 'comment', c.id) + '</div>';
      }).join('') +
      (ME && !forge.archived ? '<div class="card">' +
        '<h3 class="card-title">Add a comment</h3>' +
        '<textarea class="input" id="commentBody" rows="4" placeholder="Write a comment"></textarea>' +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
          '<button class="btn primary commentBtn" type="button" data-kind="pull" data-id="' + esc(pr.id) + '">' + ic('comment', 14) + ' Comment</button>' +
          '<button class="btn reviewBtn" type="button" data-id="' + esc(pr.id) + '" data-state="commented">' + ic('eye', 14) + ' Review</button>' +
          '<button class="btn green reviewBtn" type="button" data-id="' + esc(pr.id) + '" data-state="approved">' + ic('check', 14) + ' Approve</button>' +
          '<button class="btn danger reviewBtn" type="button" data-id="' + esc(pr.id) + '" data-state="changes">' + ic('x', 14) + ' Request changes</button>' +
        '</div></div>' : '<div class="card"><p class="muted fs-13">Sign in to comment.</p></div>');
  }

  return '<div class="mb-4"><a class="muted" href="#' + base + '/pulls">' + ic('arrowLeft', 12) + ' Back to pull requests</a></div>' +
    '<div class="grid-2col">' +
      '<div>' +
        '<div class="card mb-4">' +
          '<div class="issue-head">' +
            '<span class="label" style="color:' + stateColour + '">' + ic(stateIcon, 12) + ' ' + (pr.merged ? 'merged' : esc(pr.state)) + '</span>' +
            '<h2 class="issue-title">' + esc(pr.title) + ' <span class="muted">#' + pr.number + '</span></h2>' +
          '</div>' +
          '<div class="muted fs-13"><b>' + esc(pr.author) + '</b> wants to merge ' + (pr.commits || []).length + ' commit' +
            ((pr.commits || []).length === 1 ? '' : 's') + ' into <code class="mono">' + esc(pr.base) + '</code> from <code class="mono">' + esc(pr.head) + '</code>' +
            (pr.merged ? ' · merged ' + timeAgo(pr.mergedAt) + ' by ' + esc(pr.mergedBy || '') : '') + '</div>' +
        '</div>' +
        '<div class="forge-tabs">' +
          pullTab('conversation', 'comment', 'Conversation', comments.length + reviews.length) +
          pullTab('commits', 'redCommit', 'Commits', (pr.commits || []).length) +
          pullTab('checks', 'checkCircle', 'Checks', checks.length) +
          pullTab('files', 'diff', 'Files changed', (pr.files || []).length) +
        '</div>' + content +
      '</div>' +
      '<div class="sticky-side">' +
        '<div class="card merge-card">' + mergePanel(user, forge, pr, canEdit) + '</div>' +
        '<div class="card mt-4">' +
          '<h3 class="side-title">Reviewers</h3>' +
          (reviews.length ? reviews.map(function (r) {
            return '<div class="side-row"><b>' + esc(r.author) + '</b> <span class="label ' + (r.state === 'approved' ? 'green' : r.state === 'changes' ? 'red' : '') + '">' + esc(r.state) + '</span>' +
              '<div class="muted fs-12">' + timeAgo(r.created) + '</div></div>';
          }).join('') : '<p class="muted fs-13">No reviews yet</p>') +
          '<h3 class="side-title mt-4">Assignees</h3>' +
          ((pr.assignees || []).length ? '<div class="assignee-list">' + pr.assignees.map(function (a) {
            return '<span class="assignee">' + esc(a) + '</span>';
          }).join('') + '</div>' : '<p class="muted fs-13">No one assigned</p>') +
          '<h3 class="side-title mt-4">Labels</h3>' +
          ((pr.labels || []).length ? '<div class="list-labels">' + pr.labels.map(function (l) {
            return '<span class="label" style="border-color:' + esc(labelColor(l)) + ';color:' + esc(labelColor(l)) + '">' + esc(l.name) + '</span>';
          }).join('') + '</div>' : '<p class="muted fs-13">None yet</p>') +
        '</div>' +
      '</div>' +
    '</div>';
}

function mergePanel(user, forge, pr, canEdit) {
  if (pr.merged) {
    return '<div class="merge-state merged">' + ic('redMerge', 16) +
      '<div><b>Merged</b><div class="muted fs-12">' + esc(pr.mergedBy || pr.author) + ' merged ' + (pr.commits || []).length +
      ' commit' + ((pr.commits || []).length === 1 ? '' : 's') + ' into <span class="mono">' + esc(pr.base) + '</span> ' + timeAgo(pr.mergedAt) + '</div></div></div>';
  }
  if (pr.state === 'closed') {
    return '<div class="merge-state closed">' + ic('redPR', 16) +
      '<div><b>Closed without merging</b>' + (canEdit ? '<div style="margin-top:8px"><button class="btn sm green reopenPullBtn" type="button" data-id="' + esc(pr.id) + '">Reopen</button></div>' : '') + '</div></div>';
  }
  if (!canEdit) {
    return '<div class="merge-state">' + ic('info', 16) + '<div><b>Only collaborators can merge</b>' +
      '<div class="muted fs-12">You can still review and comment.</div></div></div>';
  }
  var blocked = pr.base === pr.head;
  var methods = [];
  if (forge.allowMerge !== false) methods.push(['merge', 'Create a merge commit']);
  if (forge.allowSquash !== false) methods.push(['squash', 'Squash and merge']);
  if (forge.allowRebase !== false) methods.push(['rebase', 'Rebase and merge']);

  return '<div class="merge-state ' + (blocked ? 'blocked' : 'ready') + '">' +
      ic(blocked ? 'alert' : 'checkCircle', 16) +
      '<div><b>' + (blocked ? 'Nothing to merge' : 'This branch can be merged') + '</b>' +
      '<div class="muted fs-12">' + (blocked
        ? 'Base and head are the same branch.'
        : (pr.additions || 0) + ' additions · ' + (pr.deletions || 0) + ' deletions · ' + (pr.files || []).length + ' files') + '</div></div>' +
    '</div>' +
    (pr.draft ? '<div class="callout mt-2">' + ic('info', 12) + ' This pull request is a draft. Mark it ready to merge.</div>' : '') +
    '<div class="merge-methods mt-2">' + methods.map(function (m, i) {
      return '<button class="btn ' + (i === 0 ? 'green block' : 'block') + ' mergeBtn" type="button" data-id="' + esc(pr.id) + '" data-method="' + m[0] + '"' +
        (blocked || pr.draft ? ' disabled' : '') + '>' + ic('redMerge', 14) + ' ' + esc(m[1]) + '</button>';
    }).join('') + '</div>' +
    '<div style="display:flex;gap:8px;margin-top:8px">' +
      '<button class="btn sm danger block closePullBtn" type="button" data-id="' + esc(pr.id) + '">Close pull request</button>' +
      (pr.draft ? '<button class="btn sm block draftBtn" type="button" data-id="' + esc(pr.id) + '" data-draft="0">Mark ready</button>'
        : '<button class="btn sm block draftBtn" type="button" data-id="' + esc(pr.id) + '" data-draft="1">Convert to draft</button>') +
    '</div>';
}

/* ===================================================================== *
   Labels + milestones
\* ===================================================================== */

export function viewForgeLabels(user, forge) {
  var labels = labelsFor(forge);
  var base = '/' + user.username + '/' + forge.name;
  return '<div class="actions-head"><div class="actions-head-left"><span class="actions-head-title">Labels</span>' +
    '<span class="actions-head-meta">' + labels.length + ' label' + (labels.length === 1 ? '' : 's') + '</span></div>' +
    '<div class="actions-head-right">' + (canEditForge(user, forge) ? '<button class="btn sm primary newLabelBtn" type="button">' + ic('plus', 14) + ' New label</button>' : '') + '</div></div>' +
    (labels.length ? '<div class="card-tight">' + labels.map(function (l) {
      var used = issuesFor(forge).concat(pullsFor(forge)).filter(function (i) {
        return (i.labels || []).some(function (x) { return x.name === l.name; });
      }).length;
      return '<div class="list-item"><div class="list-icon"><span class="label" style="border-color:' + esc(labelColor(l)) + ';color:' + esc(labelColor(l)) + '">' + esc(l.name) + '</span></div>' +
        '<div class="list-body"><div class="list-title">' + esc(l.description || 'No description') + '</div>' +
        '<div class="list-meta">used on ' + used + ' item' + (used === 1 ? '' : 's') + '</div></div>' +
        '<div class="list-side"><a class="btn sm" href="#' + base + '/issues?label=' + encodeURIComponent(l.name) + '">Issues</a>' +
        (canEditForge(user, forge) ? '<button class="btn sm danger deleteLabelBtn" type="button" data-name="' + esc(l.name) + '">' + ic('trash', 12) + '</button>' : '') + '</div></div>';
    }).join('') + '</div>' : '<div class="empty"><h3>No labels</h3><p>Labels group issues and pull requests.</p></div>');
}

export function viewForgeMilestones(user, forge) {
  var milestones = milestonesFor(forge);
  return '<div class="actions-head"><div class="actions-head-left"><span class="actions-head-title">Milestones</span>' +
    '<span class="actions-head-meta">' + milestones.length + ' milestone' + (milestones.length === 1 ? '' : 's') + '</span></div>' +
    '<div class="actions-head-right">' + (canEditForge(user, forge) ? '<button class="btn sm primary newMilestoneBtn" type="button">' + ic('plus', 14) + ' New milestone</button>' : '') + '</div></div>' +
    (milestones.length ? milestones.map(function (m) {
      var progress = milestoneProgress(forge, m.title);
      return '<div class="card mb-4"><div class="milestone-head"><b>' + esc(m.title) + '</b>' +
        '<span class="label ' + (m.state === 'closed' ? '' : 'green') + '">' + esc(m.state) + '</span></div>' +
        '<p class="muted fs-13">' + esc(m.description || 'No description') + '</p>' +
        milestoneBar(forge, m.title) +
        '<div class="muted fs-12 mt-2">' + (m.due ? 'Due ' + formatDate(m.due) : 'No due date') + ' · created by ' + esc(m.author || user.username) + '</div></div>';
    }).join('') : '<div class="empty"><div class="empty-icon">' + ic('milestone', 32) + '</div><h3>No milestones</h3>' +
      '<p>Milestones bundle issues and pull requests toward a target.</p></div>');
}

/* ===================================================================== *
   Legacy entry points kept for the modal helpers used by bind.js
\* ===================================================================== */

export function openIssueModal(ownerUsername, forgeName, type) {
  if (type === 'pulls') return openPullModal(ownerUsername, forgeName);
  var found = findForgeLocal(ownerUsername, forgeName);
  if (!found) return;
  openModal({
    title: 'New issue',
    icon: 'issue',
    body: '<div class="form-group"><label class="form-label" for="niTitle">Title</label>' +
      '<input type="text" class="input" id="niTitle" data-autofocus placeholder="Something broke…"></div>' +
      '<div class="form-group"><label class="form-label" for="niBody">Description</label>' +
      '<textarea class="input" id="niBody" rows="6" placeholder="Describe the issue in detail…"></textarea></div>' +
      '<div class="form-error" id="niErr"></div>',
    actions: [
      { label: 'Create issue', primary: true, icon: 'issue', id: 'niGo' },
      { label: 'Cancel' },
    ],
    onMount: function (root) {
      var go = root.querySelector('#niGo');
      if (!go) return;
      go.addEventListener('click', function () {
        var title = root.querySelector('#niTitle').value.trim();
        var body = root.querySelector('#niBody').value.trim();
        var err = root.querySelector('#niErr');
        if (!title) { if (err) err.textContent = 'A title is required.'; return; }
        if (!ME) { if (err) err.textContent = 'Sign in to open an issue.'; return; }
        var issue = createIssue(found.user, found.forge, { title: title, body: body });
        closeModal();
        toast('Issue #' + issue.number + ' opened', 'success');
        location.hash = '#/' + ownerUsername + '/' + forgeName + '/issues/' + issue.number;
        render();
      });
    },
  });
}

export function openPullModal(ownerUsername, forgeName) {
  var found = findForgeLocal(ownerUsername, forgeName);
  if (!found) return;
  var forge = found.forge;
  var branches = forge.branches || [forge.defaultBranch];
  if (branches.length < 2) { toast('Create a second branch first', 'error'); return; }
  openModal({
    title: 'New pull request',
    icon: 'redPR',
    body: '<div class="form-row"><select class="input" id="npBase" aria-label="Base">' + branches.map(function (b) {
        return '<option value="' + esc(b) + '"' + (b === forge.defaultBranch ? ' selected' : '') + '>base: ' + esc(b) + '</option>';
      }).join('') + '</select>' +
      '<select class="input" id="npHead" aria-label="Head">' + branches.map(function (b) {
        return '<option value="' + esc(b) + '"' + (b !== forge.defaultBranch ? ' selected' : '') + '>compare: ' + esc(b) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="form-group mt-2"><label class="form-label" for="npTitle">Title</label>' +
      '<input type="text" class="input" id="npTitle" placeholder="Short summary"></div>' +
      '<div class="form-group"><label class="form-label" for="npBody">Description</label>' +
      '<textarea class="input" id="npBody" rows="6"></textarea></div>' +
      '<div class="form-error" id="npErr"></div>',
    actions: [
      { label: 'Create pull request', primary: true, icon: 'redPR', id: 'npGo' },
      { label: 'Cancel' },
    ],
    onMount: function (root) {
      var go = root.querySelector('#npGo');
      if (!go) return;
      go.addEventListener('click', function () {
        var err = root.querySelector('#npErr');
        var baseBranch = root.querySelector('#npBase').value;
        var headBranch = root.querySelector('#npHead').value;
        if (baseBranch === headBranch) { if (err) err.textContent = 'Base and head must differ.'; return; }
        if (!ME) { if (err) err.textContent = 'Sign in to open a pull request.'; return; }
        var title = root.querySelector('#npTitle').value.trim();
        var pr = createPull(found.user, forge, {
          title: title || headBranch + ' → ' + baseBranch,
          body: root.querySelector('#npBody').value,
          base: baseBranch,
          head: headBranch,
        });
        closeModal();
        toast('Pull request #' + pr.number + ' opened', 'success');
        location.hash = '#/' + ownerUsername + '/' + forgeName + '/pull/' + pr.number;
        render();
      });
    },
  });
}

function findForgeLocal(ownerUsername, forgeName) {
  var user = getUserByUsername(ownerUsername);
  if (!user) { toast('That account does not exist here', 'error'); return null; }
  var forge = (user.forges || []).filter(function (r) { return r.name === forgeName; })[0];
  if (!forge) { toast('Forge not found', 'error'); return null; }
  return { user: user, forge: forge };
}

/* ===================================================================== *
   Everything below this line lives in ./forgeExtras.js. The re-exports keep
   the dispatcher in core/render.js and the switch above stable.
\* ===================================================================== */

export {
  viewForgeActions, viewForgeProjects, viewForgeWiki, viewForgeSecurity, viewForgeInsights,
  viewForgeSettings, viewForgeDanger, viewForgeReleases, openReleaseModal, viewForgeTags,
  viewForgeBranches, viewForgeDiscussions, viewForgePackages, viewForgeStargazers, viewForgeForks,
} from './forgeExtras.js';

import { viewForgeActions, viewForgeProjects, viewForgeWiki, viewForgeSecurity, viewForgeInsights,
  viewForgeSettings, viewForgeDanger, viewForgeReleases, viewForgeTags, viewForgeBranches,
  viewForgeDiscussions, viewForgePackages, viewForgeStargazers, viewForgeForks } from './forgeExtras.js';
