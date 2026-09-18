/**
 * RedGet — global Projects: list, detail (board / table / roadmap) and the
 * creation form.
 *
 * A project belongs to an account, an organization or a forge, and its
 * items are either free-form notes or references to real issues and pull
 * requests (`owner/forge#12`). Nothing is pre-populated.
 */

import { ME } from '../state.js';
import { ic } from '../icons.js';
import { visibleForges } from '../core/forges.js';
import { orgsFor, orgRole } from '../core/orgs.js';
import { projectById, visibleProjects, setProjectLayout, itemsInColumn, columnCounts,
  projectProgress, PROJECT_LAYOUTS, DEFAULT_COLUMNS } from '../core/projects.js';
import { esc, timeAgo, formatDate } from '../core/util.js';

/* ===================================================================== *
   List
\* ===================================================================== */

export function viewProjects() {
  if (!ME) return signedOut();
  var list = visibleProjects();
  var query = hashQuery();
  var scope = query.scope || 'all';

  var filtered = list.filter(function (p) {
    if (scope === 'mine') return p.owner === 'user' && p.ownerKey === ME.username;
    if (scope === 'org') return p.owner === 'org';
    if (scope === 'forge') return p.owner === 'forge';
    return true;
  });

  return '<div class="container page">' +
    '<div class="page-head">' +
      '<div><h1 class="page-title">' + ic('project', 22) + ' Projects</h1>' +
        '<p class="muted fs-13">' + filtered.length + ' project' + (filtered.length === 1 ? '' : 's') +
        ' · boards, tables and roadmaps that track real issues and pull requests</p></div>' +
      '<div class="page-head-actions"><a class="btn primary" href="#/projects/new">' + ic('plus', 14) + ' New project</a></div>' +
    '</div>' +
    '<div class="filter-bar">' +
      [['all', 'All'], ['mine', 'Yours'], ['forge', 'Forge'], ['org', 'Organization']].map(function (f) {
        return '<a class="filter-chip' + (scope === f[0] ? ' on' : '') + '" href="#/projects' + (f[0] === 'all' ? '' : '?scope=' + f[0]) + '">' + esc(f[1]) + '</a>';
      }).join('') +
    '</div>' +
    (filtered.length
      ? '<div class="project-grid">' + filtered.map(projectCard).join('') + '</div>'
      : '<div class="empty"><div class="empty-icon">' + ic('project', 32) + '</div>' +
        '<h3>No projects</h3>' +
        '<p>A project is a view over work: columns of notes, issues and pull requests. Create one for yourself, an organization or a forge.</p>' +
        '<a class="btn primary" href="#/projects/new">' + ic('plus', 14) + ' Create your first project</a></div>') +
  '</div>';
}

function projectCard(project) {
  var counts = columnCounts(project);
  var total = (project.items || []).length;
  var progress = projectProgress(project);
  var owner = ownerLabel(project);
  return '<a class="project-card card" href="#/projects/' + esc(project.id) + '">' +
    '<div class="project-card-head">' +
      '<b>' + esc(project.title) + '</b>' +
      '<span class="label">' + ic(PROJECT_LAYOUTS[project.layout] ? PROJECT_LAYOUTS[project.layout].icon : 'project', 10) + ' ' + esc(project.layout) + '</span>' +
    '</div>' +
    '<p class="muted fs-13">' + esc(project.description || 'No description') + '</p>' +
    '<div class="project-card-owner muted fs-12">' + owner.icon + ' ' + esc(owner.label) + '</div>' +
    '<div class="progress" title="' + progress.done + ' of ' + progress.total + ' items done"><span style="width:' + progress.percent + '%"></span></div>' +
    '<div class="project-card-meta">' +
      '<span>' + ic('rows', 12) + ' ' + (project.columns || []).length + ' columns</span>' +
      '<span>' + ic('tasklist', 12) + ' ' + total + ' items</span>' +
      '<span>' + ic('checkCircle', 12) + ' ' + progress.percent + '% done</span>' +
      '<span>Updated ' + timeAgo(project.updated || project.created) + '</span>' +
    '</div>' +
  '</a>';
}

function ownerLabel(project) {
  if (project.owner === 'forge') {
    var entry = forgeByKey(project.ownerKey);
    return { icon: ic('forge', 12), label: entry ? entry.user.username + '/' + entry.forge.name : project.ownerKey };
  }
  if (project.owner === 'org') return { icon: ic('organization', 12), label: project.ownerKey };
  return { icon: ic('person', 12), label: project.ownerKey };
}

function forgeByKey(key) {
  var parts = String(key || '').split('/');
  if (parts.length !== 2) return null;
  var found = null;
  visibleForges().forEach(function (entry) {
    if (entry.user.username === parts[0] && entry.forge.name === parts[1]) found = entry;
  });
  return found;
}

/* ===================================================================== *
   New
\* ===================================================================== */

export function viewNewProject() {
  if (!ME) return signedOut();
  var forges = visibleForges().filter(function (e) { return canOwn(e); });
  var orgs = orgsFor(ME.username).filter(function (o) { return ['owner', 'admin'].indexOf(orgRole(o, ME.username)) !== -1; });
  var query = hashQuery();

  return '<div class="container page narrow">' +
    '<div class="page-head"><div><h1 class="page-title">Create a project</h1>' +
      '<p class="muted fs-13">Choose what owns the project. Forge projects show on that forge’s Projects tab.</p></div></div>' +
    '<div class="card">' +
      '<div class="form-group"><label class="form-label" for="npOwner">Owner</label>' +
        '<select class="input" id="npOwner">' +
          '<option value="user:' + esc(ME.username) + '">You (' + esc(ME.username) + ')</option>' +
          orgs.map(function (o) { return '<option value="org:' + esc(o.slug) + '">Organization: ' + esc(o.name || o.slug) + '</option>'; }).join('') +
          forges.map(function (e) {
            return '<option value="forge:' + esc(e.user.username + '/' + e.forge.name) + '"' +
              (query.owner === e.user.username + '/' + e.forge.name ? ' selected' : '') + '>Forge: ' +
              esc(e.user.username) + '/' + esc(e.forge.name) + '</option>';
          }).join('') +
        '</select></div>' +
      '<div class="form-group"><label class="form-label" for="npTitle">Title <span class="required">*</span></label>' +
        '<input type="text" class="input" id="npTitle" data-autofocus placeholder="Q3 roadmap" maxlength="120"></div>' +
      '<div class="form-group"><label class="form-label" for="npDescription">Description</label>' +
        '<textarea class="input" id="npDescription" rows="3" placeholder="What is this project tracking?"></textarea></div>' +
      '<div class="form-group"><label class="form-label">Layout</label>' +
        '<div class="layout-picker">' + Object.keys(PROJECT_LAYOUTS).map(function (key) {
          var layout = PROJECT_LAYOUTS[key];
          return '<label class="layout-card' + (key === 'board' ? ' on' : '') + '">' +
            '<input type="radio" name="npLayout" value="' + key + '"' + (key === 'board' ? ' checked' : '') + '>' +
            '<span class="layout-icon">' + ic(layout.icon, 20) + '</span>' +
            '<span><b>' + esc(layout.label) + '</b><span class="muted fs-12">' + esc(layout.description) + '</span></span></label>';
        }).join('') + '</div></div>' +
      '<div class="form-group"><label class="form-label" for="npColumns">Columns <span class="muted fs-12">(comma separated)</span></label>' +
        '<input type="text" class="input" id="npColumns" value="' + esc(DEFAULT_COLUMNS.join(', ')) + '"></div>' +
      '<div class="form-error" id="npErr"></div>' +
      '<div style="display:flex;gap:8px;margin-top:12px">' +
        '<button class="btn primary" id="createProjectBtn" type="button">' + ic('project', 14) + ' Create project</button>' +
        '<a class="btn" href="#/projects">Cancel</a></div>' +
    '</div>' +
  '</div>';
}

function canOwn(entry) {
  if (!ME) return false;
  if (entry.user.username === ME.username) return true;
  var org = entry.org ? entry.user : null;
  return Boolean(org && ['owner', 'admin'].indexOf(orgRole(org, ME.username)) !== -1);
}

/* ===================================================================== *
   Detail
\* ===================================================================== */

export function viewProjectDetail(id, rest) {
  if (!ME) return signedOut();
  var project = projectById(id);
  if (!project) {
    return '<div class="container page"><div class="empty"><div class="empty-icon">' + ic('project', 32) + '</div>' +
      '<h3>Project not found</h3><p>No project with that id exists in this browser.</p>' +
      '<a class="btn" href="#/projects">All projects</a></div></div>';
  }

  var query = hashQuery();
  var layout = ['board', 'table', 'roadmap'].indexOf(query.layout) !== -1 ? query.layout : project.layout;
  if (layout !== project.layout) { setProjectLayout(project, layout); }
  var canManage = canManageProject(project);
  var columns = project.columns || [];
  var total = (project.items || []).length;
  var progress = projectProgress(project);
  var owner = ownerLabel(project);

  var head = '<div class="container page">' +
    '<div class="actions-head">' +
      '<div class="actions-head-left">' +
        '<a class="btn sm" href="#/projects">' + ic('chevronLeft', 14) + ' Projects</a>' +
        '<span class="actions-head-title">' + esc(project.title) + '</span>' +
        '<span class="actions-head-meta">' + owner.icon + ' ' + esc(owner.label) + ' · ' + total + ' items · ' +
          progress.percent + '% done · updated ' + timeAgo(project.updated || project.created) + '</span>' +
      '</div>' +
      '<div class="actions-head-right">' +
        ['board', 'table', 'roadmap'].map(function (key) {
          return '<a class="btn sm' + (layout === key ? ' primary' : '') + '" href="#/projects/' + esc(project.id) + '?layout=' + key + '">' +
            ic(PROJECT_LAYOUTS[key].icon, 12) + ' ' + esc(PROJECT_LAYOUTS[key].label) + '</a>';
        }).join('') +
        (canManage ? '<button class="btn sm addColumnBtn" type="button" data-project="' + esc(project.id) + '">' + ic('plus', 14) + ' Column</button>' +
          '<button class="btn sm danger deleteProjectBtn" type="button" data-project="' + esc(project.id) + '">' + ic('trash', 14) + '</button>' : '') +
      '</div>' +
    '</div>' +
    (project.description ? '<p class="project-description muted fs-13">' + esc(project.description) + '</p>' : '') +
    '<div class="progress project-progress" title="' + progress.done + ' of ' + progress.total + ' items in the last column">' +
      '<span style="width:' + progress.percent + '%"></span></div>';

  var body = '';
  if (layout === 'table') body = tableLayout(project, canManage);
  else if (layout === 'roadmap') body = roadmapLayout(project, canManage);
  else body = boardLayout(project, canManage);

  return head + body +
    (canManage ? '<div class="card mt-4"><h3 class="card-title">Project settings</h3>' +
      '<div class="form-row"><input type="text" class="input" id="projectTitleInput" value="' + esc(project.title) + '" aria-label="Title">' +
      '<input type="text" class="input" id="projectDescInput" value="' + esc(project.description || '') + '" placeholder="Description" aria-label="Description">' +
      '<button class="btn saveProjectBtn" type="button" data-project="' + esc(project.id) + '">Save</button></div>' +
      iterationsPanel(project) +
    '</div>' : '') +
  '</div>';
}

function boardLayout(project, canManage) {
  var columns = project.columns || [];
  if (!columns.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('rows', 32) + '</div><h3>No columns</h3>' +
      '<p>Add a column to start placing items.</p>' +
      (canManage ? '<button class="btn primary addColumnBtn" type="button" data-project="' + esc(project.id) + '">' + ic('plus', 14) + ' Add column</button>' : '') + '</div>';
  }
  return '<div class="board">' + columns.map(function (col, index) {
    var items = itemsInColumn(project, col.id);
    return '<section class="board-col">' +
      '<header class="board-col-head">' +
        '<b>' + esc(col.name) + '</b><span class="board-col-count">' + items.length + '</span>' +
        (canManage ? '<span class="board-col-actions">' +
          '<button class="btn xs addItemBtn" type="button" data-project="' + esc(project.id) + '" data-column="' + esc(col.id) + '" title="Add item">' + ic('plus', 12) + '</button>' +
          '<button class="btn xs moveColBtn" type="button" data-project="' + esc(project.id) + '" data-column="' + esc(col.id) + '" data-dir="-1" title="Move left"' + (index === 0 ? ' disabled' : '') + '>' + ic('arrowLeft', 12) + '</button>' +
          '<button class="btn xs moveColBtn" type="button" data-project="' + esc(project.id) + '" data-column="' + esc(col.id) + '" data-dir="1" title="Move right"' + (index === columns.length - 1 ? ' disabled' : '') + '>' + ic('arrowRight', 12) + '</button>' +
          '<button class="btn xs danger deleteColumnBtn" type="button" data-project="' + esc(project.id) + '" data-column="' + esc(col.id) + '" title="Delete column">' + ic('trash', 11) + '</button>' +
        '</span>' : '') +
      '</header>' +
      '<div class="board-col-body">' +
        (items.length ? items.map(function (item) { return boardCard(project, col, item, canManage); }).join('')
          : '<div class="board-col-empty muted fs-12">No items</div>') +
      '</div>' +
    '</section>';
  }).join('') + '</div>';
}

function boardCard(project, col, item, canManage) {
  var link = itemLink(item);
  var others = (project.columns || []).filter(function (c) { return c.id !== col.id; });
  return '<article class="board-item" data-item="' + esc(item.id) + '" data-column="' + esc(col.id) + '">' +
    '<div class="board-item-title">' + esc(item.title) + '</div>' +
    (item.body ? '<div class="board-item-body muted fs-12">' + esc(item.body) + '</div>' : '') +
    '<div class="board-item-meta">' +
      '<span class="label">' + ic(item.kind === 'note' ? 'quote' : item.kind === 'pull' ? 'redPR' : 'issue', 10) + ' ' + esc(item.kind) + '</span>' +
      (link ? '<a class="muted fs-12" href="' + link.href + '">' + esc(link.label) + '</a>' : '') +
      (item.due ? '<span class="muted fs-12' + (item.due < Date.now() ? ' overdue' : '') + '">' + ic('calendar', 10) + ' ' + formatDate(item.due) + '</span>' : '') +
      ((item.assignees || []).length ? '<span class="muted fs-12">' + esc(item.assignees.join(', ')) + '</span>' : '') +
    '</div>' +
    (canManage ? '<div class="board-item-actions">' +
      '<select class="input xs moveItemSelect" data-project="' + esc(project.id) + '" data-item="' + esc(item.id) + '" aria-label="Move item">' +
        '<option value="">Move to…</option>' +
        others.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('') +
      '</select>' +
      '<button class="btn xs danger deleteItemBtn" type="button" data-project="' + esc(project.id) + '" data-item="' + esc(item.id) + '" aria-label="Delete item">' + ic('trash', 11) + '</button>' +
    '</div>' : '') +
  '</article>';
}

function itemLink(item) {
  if (!item.ref) return null;
  var hash = String(item.ref).lastIndexOf('#');
  if (hash < 1) return null;
  var owner = item.ref.slice(0, hash);
  var number = item.ref.slice(hash + 1);
  var route = item.kind === 'pull' ? 'pull' : 'issues';
  if (owner.indexOf('/') === -1) return null;
  return { href: '#/' + owner + '/' + route + '/' + number, label: owner + '#' + number };
}

function tableLayout(project, canManage) {
  var rows = [];
  (project.columns || []).forEach(function (col) {
    itemsInColumn(project, col.id).forEach(function (item) { rows.push({ col: col, item: item }); });
  });
  if (!rows.length) return '<div class="empty"><h3>No items</h3><p>Switch to the board layout to add the first item.</p></div>';
  return '<div class="card-tight table-wrap"><table class="table">' +
    '<thead><tr><th>Title</th><th>Status</th><th>Kind</th><th>Assignees</th><th>Due</th>' + (canManage ? '<th></th>' : '') + '</tr></thead>' +
    '<tbody>' + rows.map(function (row) {
      var link = itemLink(row.item);
      return '<tr>' +
        '<td>' + esc(row.item.title) + (link ? ' <a class="muted fs-12" href="' + link.href + '">' + esc(link.label) + '</a>' : '') + '</td>' +
        '<td><span class="label">' + esc(row.col.name) + '</span></td>' +
        '<td>' + esc(row.item.kind) + '</td>' +
        '<td>' + ((row.item.assignees || []).map(esc).join(', ') || '<span class="muted fs-12">—</span>') + '</td>' +
        '<td>' + (row.item.due ? formatDate(row.item.due) : '<span class="muted fs-12">—</span>') + '</td>' +
        (canManage ? '<td><button class="btn xs danger deleteItemBtn" type="button" data-project="' + esc(project.id) + '" data-item="' + esc(row.item.id) + '">' + ic('trash', 11) + '</button></td>' : '') +
      '</tr>';
    }).join('') + '</tbody></table></div>';
}

function roadmapLayout(project, canManage) {
  var rows = [];
  (project.columns || []).forEach(function (col) {
    itemsInColumn(project, col.id).forEach(function (item) { if (item.due) rows.push({ col: col, item: item }); });
  });
  if (!rows.length) {
    return '<div class="empty"><div class="empty-icon">' + ic('calendar', 32) + '</div><h3>Nothing scheduled</h3>' +
      '<p>Add a due date to an item and it appears on the roadmap.</p></div>';
  }
  rows.sort(function (a, b) { return a.item.due - b.item.due; });
  var first = rows[0].item.due;
  var last = rows[rows.length - 1].item.due;
  var span = Math.max(1, last - first);
  return '<div class="card"><h3 class="card-title">Roadmap</h3><div class="roadmap">' +
    rows.map(function (row) {
      var width = Math.max(6, Math.round((row.item.due - first) / span * 100));
      var overdue = row.item.due < Date.now();
      return '<div class="roadmap-row">' +
        '<span class="roadmap-date' + (overdue ? ' overdue' : '') + '">' + formatDate(row.item.due) + '</span>' +
        '<span class="roadmap-track"><span class="roadmap-bar" style="width:' + width + '%"></span></span>' +
        '<span class="roadmap-title">' + esc(row.item.title) + '</span>' +
        '<span class="label">' + esc(row.col.name) + '</span>' +
      '</div>';
    }).join('') + '</div></div>';
}

function iterationsPanel(project) {
  var iterations = project.iterations || [];
  return '<div class="form-group mt-4"><label class="form-label">Iterations</label>' +
    (iterations.length ? '<div class="card-tight mb-2">' + iterations.map(function (it) {
      return '<div class="list-item"><div class="list-icon">' + ic('sync', 14) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(it.title) + '</div>' +
        '<div class="list-meta">' + formatDate(it.start) + ' → ' + formatDate(it.end) + '</div></div>' +
        '<div class="list-side"><button class="btn xs danger deleteIterationBtn" type="button" data-project="' + esc(project.id) + '" data-iteration="' + esc(it.id) + '">' + ic('trash', 11) + '</button></div></div>';
    }).join('') + '</div>' : '<p class="muted fs-13">No iterations yet.</p>') +
    '<div class="form-row"><input type="text" class="input" id="iterTitle" placeholder="Sprint 1">' +
      '<input type="date" class="input" id="iterStart">' +
      '<input type="date" class="input" id="iterEnd">' +
      '<button class="btn addIterationBtn" type="button" data-project="' + esc(project.id) + '">Add iteration</button></div>' +
  '</div>';
}

/* ===================================================================== *
   Permissions + helpers
\* ===================================================================== */

export function canManageProject(project) {
  if (!ME) return false;
  if (project.owner === 'user') return project.ownerKey === ME.username;
  if (project.owner === 'org') {
    var org = orgsFor(ME.username).filter(function (o) { return o.slug === project.ownerKey; })[0];
    return Boolean(org && ['owner', 'admin'].indexOf(orgRole(org, ME.username)) !== -1);
  }
  var entry = forgeByKey(project.ownerKey);
  if (!entry) return false;
  if (entry.user.username === ME.username) return true;
  if (entry.org) return ['owner', 'admin', 'write'].indexOf(orgRole(entry.user, ME.username)) !== -1;
  return false;
}

function signedOut() {
  return '<div class="container page"><div class="empty"><div class="empty-icon">' + ic('lock', 32) + '</div>' +
    '<h3>Sign in required</h3><p>Projects belong to an account.</p>' +
    '<button class="btn primary" id="openAuthBtn" type="button">' + ic('signIn', 14) + ' Sign in with your key</button></div></div>';
}

function hashQuery() {
  var out = {};
  var hash = String(location.hash || '');
  var q = hash.indexOf('?');
  if (q === -1) return out;
  hash.slice(q + 1).split('&').forEach(function (pair) {
    if (!pair) return;
    var kv = pair.split('=');
    out[decodeURIComponent(kv[0])] = decodeURIComponent((kv[1] || '').replace(/\+/g, ' '));
  });
  return out;
}
