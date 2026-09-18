/**
 * RedGet — projects: boards, tables and roadmaps.
 *
 * A project can belong to a forge (`owner: 'forge', ownerKey: 'me/app'`)
 * or to a user/org (`owner: 'user' | 'org'`). Cards reference real issues and
 * pull requests by `owner/name#number` so moving a card never loses the link.
 *
 *   project = {
 *     id, title, description, layout: 'board'|'table'|'roadmap',
 *     owner: 'forge'|'user'|'org', ownerKey, ownerName,
 *     created, updated, closed, isPublic,
 *     columns: [{ id, name, limit }],
 *     items:   [{ id, columnId, order, title, body, kind: 'note'|'issue'|'pull',
 *                 ref, assignees: [], labels: [], milestone, iterationId, due }],
 *     iterations: [{ id, title, start, end }],
 *   }
 */

import { DB, ME, saveDB } from '../state.js';
import { uid } from './util.js';
import { logActivity } from './forges.js';

export var DEFAULT_COLUMNS = ['To do', 'In progress', 'Done'];

export var PROJECT_LAYOUTS = {
  board: { label: 'Board', icon: 'project', description: 'Kanban columns you drag cards through' },
  table: { label: 'Table', icon: 'table', description: 'Spreadsheet-style rows with fields' },
  roadmap: { label: 'Roadmap', icon: 'graph', description: 'Iterations on a timeline' },
};

/* --------------------------------------------------------------- lookup */

export function allProjects() {
  return (DB.projects || []).slice().sort(function (a, b) { return b.updated - a.updated; });
}

export function projectsFor(owner, ownerKey) {
  return allProjects().filter(function (p) {
    return p.owner === owner && p.ownerKey === ownerKey;
  });
}

export function projectById(id) {
  return allProjects().filter(function (p) { return p.id === id; })[0] || null;
}

export function visibleProjects() {
  return allProjects().filter(function (p) {
    if (!ME) return false;
    if (p.owner === 'user') return p.ownerKey === ME.username;
    if (p.owner === 'forge') return canSeeForgeKey(p.ownerKey);
    return true;
  });
}

function canSeeForgeKey(key) {
  if (!ME) return false;
  var owner = String(key).split('/')[0];
  if (owner === ME.username) return true;
  var user = null;
  Object.keys(DB.users).forEach(function (k) { if (DB.users[k].username === owner) user = DB.users[k]; });
  if (!user) return false;
  var name = String(key).split('/')[1];
  var forge = (user.forges || []).filter(function (r) { return r.name === name; })[0];
  return Boolean(forge && forge.visibility === 'public');
}

/* --------------------------------------------------------------- create */

export function createProject(payload) {
  if (!ME) return null;
  var layout = PROJECT_LAYOUTS[payload.layout] ? payload.layout : 'board';
  var project = {
    id: uid('proj'),
    title: String(payload.title || 'Untitled project').slice(0, 120),
    description: payload.description || '',
    layout: layout,
    owner: payload.owner || 'user',
    ownerKey: payload.ownerKey || ME.username,
    ownerName: payload.ownerName || ME.username,
    created: Date.now(),
    updated: Date.now(),
    closed: false,
    isPublic: payload.isPublic !== false,
    columns: (payload.columns && payload.columns.length ? payload.columns : DEFAULT_COLUMNS).map(function (name) {
      return { id: uid('col'), name: name, limit: 0 };
    }),
    items: [],
    iterations: [],
  };
  if (!DB.projects) DB.projects = [];
  DB.projects.unshift(project);
  saveDB();
  logActivity('project.create', project.title);
  return project;
}

export function updateProject(project, changes) {
  Object.keys(changes || {}).forEach(function (key) {
    if (key === 'columns' || key === 'items' || key === 'iterations') return;
    project[key] = changes[key];
  });
  project.updated = Date.now();
  saveDB();
  return project;
}

export function deleteProject(project) {
  DB.projects = (DB.projects || []).filter(function (p) { return p.id !== project.id; });
  saveDB();
  return true;
}

export function setProjectLayout(project, layout) {
  if (!PROJECT_LAYOUTS[layout]) return project;
  project.layout = layout;
  project.updated = Date.now();
  saveDB();
  return project;
}

/* -------------------------------------------------------------- columns */

export function addColumn(project, name) {
  var column = { id: uid('col'), name: String(name || 'New column').slice(0, 40), limit: 0 };
  project.columns.push(column);
  touch(project);
  return column;
}

export function renameColumn(project, columnId, name) {
  project.columns.forEach(function (c) { if (c.id === columnId) c.name = String(name || '').slice(0, 40) || c.name; });
  return touch(project);
}

export function deleteColumn(project, columnId) {
  project.columns = project.columns.filter(function (c) { return c.id !== columnId; });
  project.items = project.items.filter(function (i) { return i.columnId !== columnId; });
  return touch(project);
}

export function moveColumn(project, columnId, direction) {
  var idx = project.columns.findIndex(function (c) { return c.id === columnId; });
  var target = idx + direction;
  if (idx < 0 || target < 0 || target >= project.columns.length) return project;
  var tmp = project.columns[idx];
  project.columns[idx] = project.columns[target];
  project.columns[target] = tmp;
  return touch(project);
}

/* ---------------------------------------------------------------- items */

export function addItem(project, payload) {
  var column = project.columns.filter(function (c) { return c.id === payload.columnId; })[0] || project.columns[0];
  if (!column) return null;
  var siblings = itemsInColumn(project, column.id);
  var item = {
    id: uid('item'),
    columnId: column.id,
    order: siblings.length,
    title: String(payload.title || '').slice(0, 200),
    body: payload.body || '',
    kind: payload.kind || 'note',
    ref: payload.ref || null,
    assignees: payload.assignees || [],
    labels: payload.labels || [],
    milestone: payload.milestone || null,
    iterationId: payload.iterationId || null,
    due: payload.due || null,
    created: Date.now(),
  };
  if (!item.title && !item.ref) return null;
  project.items.push(item);
  touch(project);
  return item;
}

/** Attach an existing issue or pull request to a project as a card. */
export function addItemFromRef(project, ownerName, item, columnId) {
  var kind = item.pull !== undefined || item.base ? 'pull' : 'issue';
  return addItem(project, {
    columnId: columnId || (project.columns[0] || {}).id,
    title: item.title,
    kind: kind,
    ref: ownerName + '#' + item.number,
    assignees: item.assignees || [],
    labels: (item.labels || []).map(function (l) { return l.name || l; }),
    milestone: item.milestone || null,
  });
}

export function itemsInColumn(project, columnId) {
  return project.items
    .filter(function (i) { return i.columnId === columnId; })
    .sort(function (a, b) { return a.order - b.order; });
}

export function updateItem(project, itemId, changes) {
  var item = project.items.filter(function (i) { return i.id === itemId; })[0];
  if (!item) return null;
  Object.keys(changes || {}).forEach(function (key) { item[key] = changes[key]; });
  touch(project);
  return item;
}

export function moveItem(project, itemId, columnId, beforeId) {
  var item = project.items.filter(function (i) { return i.id === itemId; })[0];
  if (!item) return null;
  item.columnId = columnId;
  var list = itemsInColumn(project, columnId).filter(function (i) { return i.id !== itemId; });
  var index = beforeId ? list.findIndex(function (i) { return i.id === beforeId; }) : list.length;
  if (index < 0) index = list.length;
  list.splice(index, 0, item);
  list.forEach(function (entry, i) { entry.order = i; });
  touch(project);
  return item;
}

export function deleteItem(project, itemId) {
  project.items = project.items.filter(function (i) { return i.id !== itemId; });
  return touch(project);
}

/** Progress per column, for the roadmap and the project header. */
export function columnCounts(project) {
  var counts = {};
  project.columns.forEach(function (c) { counts[c.id] = 0; });
  project.items.forEach(function (i) {
    if (counts[i.columnId] !== undefined) counts[i.columnId]++;
  });
  return counts;
}

export function projectProgress(project) {
  var total = project.items.length;
  if (!total) return { total: 0, done: 0, percent: 0 };
  var last = project.columns[project.columns.length - 1];
  var done = last ? itemsInColumn(project, last.id).length : 0;
  return { total: total, done: done, percent: Math.round((done / total) * 100) };
}

/* ----------------------------------------------------------- iterations */

export function addIteration(project, payload) {
  var iteration = {
    id: uid('iter'),
    title: String(payload.title || 'Iteration').slice(0, 60),
    start: payload.start || Date.now(),
    end: payload.end || Date.now() + 14 * 86400000,
  };
  project.iterations.push(iteration);
  touch(project);
  return iteration;
}

export function deleteIteration(project, iterationId) {
  project.iterations = project.iterations.filter(function (i) { return i.id !== iterationId; });
  project.items.forEach(function (item) { if (item.iterationId === iterationId) item.iterationId = null; });
  return touch(project);
}

export function itemsInIteration(project, iterationId) {
  return project.items.filter(function (i) { return i.iterationId === iterationId; });
}

function touch(project) {
  project.updated = Date.now();
  saveDB();
  return project;
}
