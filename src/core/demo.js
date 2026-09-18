/**
 * RedGet — optional demo workspace.
 *
 * The app starts completely empty: no seeded accounts, no invented activity.
 * This module is the one place where sample data is generated, and it only ever
 * runs when you press "Load a demo workspace" in Settings → Data.
 *
 * Everything it creates is real data written through the same functions the UI
 * uses — `createForge`, `saveFile`, `createIssue`, `createPull`, `createProject`,
 * `createWikiPage`, `createRelease`, `triggerRuns` — so commits, workflow runs,
 * notifications and activity entries are genuinely derived, not decoration.
 * It creates one extra local account (with its own generated key) so issues and
 * comments have a second real author. Remove it again with "Reset everything".
 */

import { DB, ME, SESSION_KEY, saveDB, setSession, userByKey } from '../state.js';
import { createUser } from './account.js';
import { createForge, logActivity } from './forges.js';
import { createOrg, addMember, createTeam, addToTeam } from './orgs.js';
import {
  saveFile, createBranch, createIssue, addComment, createPull, addReview,
  createRelease, saveMilestone, saveLabel,
} from './model.js';
import { createProject, addItem, addItemFromRef } from './projects.js';
import { createWikiPage } from './wiki.js';
import { createDiscussion, createPackage, installApp, marketplaceApps } from './marketplace.js';
import { createGist } from './gists.js';
import { createCodespace } from './codespaces.js';
import { syncWorkflows, triggerRuns } from './actions.js';
import { toggleStar, toggleFollow } from './social.js';
import { fingerprintKey, sampleKey } from './sshKeys.js';

var COLLEAGUE = 'demo-colleague';

/**
 * Build the workspace. Returns a summary object, or null when nobody is signed
 * in (the demo always belongs to the account that asked for it).
 */
export function seedDemoWorkspace() {
  if (!ME) return null;

  var me = ME;
  var summary = { accounts: 1, orgs: 0, forges: 0, issues: 0, pulls: 0, projects: 0, wiki: 0, releases: 0, runs: 0 };

  /* ── a second real account, so other people exist ─────────────── */
  var colleague = findOrCreateColleague();
  if (colleague) summary.accounts = 2;

  /* ── an organization you own ─────────────────────────────────── */
  var org = DB.orgs && DB.orgs['redget-labs'] ? DB.orgs['redget-labs'] : createOrg({
    name: 'redget-labs',
    displayName: 'RedGet Labs',
    description: 'Sample organization created by the demo workspace.',
    location: 'Local',
    website: '',
    billing: 'free',
  });
  if (org) {
    summary.orgs = 1;
    if (colleague) {
      addMember(org.slug, colleague.username, 'member');
      var team = createTeam(org.slug, { name: 'Maintainers', description: 'Can merge to every forge', privacy: 'closed' });
      if (team) addToTeam(org.slug, team.id, colleague.username);
    }
  }

  /* ── forge one: yours ───────────────────────────────────── */
  var atlas = findForgeByName(me, 'atlas') || createForge(
    'atlas', 'A tiny API client with retries, caching and typed errors.', 'public', 'JavaScript', false, me.username);
  if (me.forges.indexOf(atlas) === -1) me.forges.push(atlas);
  summary.forges += 1;

  saveFile(atlas, 'README.md', [
    '# atlas',
    '',
    'A tiny API client with retries, caching and typed errors.',
    '',
    '```bash',
    'red copy /' + me.username + '/atlas',
    'cd atlas',
    '```',
    '',
    '## Usage',
    '',
    '```js',
    "import { createClient } from './src/client.js';",
    '',
    "const api = createClient({ baseUrl: '/api', retries: 3 });",
    "const user = await api.get('/users/1');",
    '```',
  ].join('\n'), 'Document the client');

  saveFile(atlas, 'src/client.js', [
    'export function createClient(options) {',
    '  var config = Object.assign({ baseUrl: "", retries: 2, timeout: 5000 }, options || {});',
    '',
    '  async function request(method, path, body) {',
    '    var attempt = 0;',
    '    while (true) {',
    '      try {',
    '        var response = await fetch(config.baseUrl + path, {',
    '          method: method,',
    '          headers: { "content-type": "application/json" },',
    '          body: body === undefined ? undefined : JSON.stringify(body),',
    '        });',
    '        if (!response.ok) throw new Error(method + " " + path + " failed: " + response.status);',
    '        return response.json();',
    '      } catch (error) {',
    '        attempt += 1;',
    '        if (attempt > config.retries) throw error;',
    '      }',
    '    }',
    '  }',
    '',
    '  return {',
    '    get: function (path) { return request("GET", path); },',
    '    post: function (path, body) { return request("POST", path, body); },',
    '  };',
    '}',
  ].join('\n'), 'Add the client with retry support');

  saveFile(atlas, '.redget/workflows/ci.yml', [
    'name: CI',
    'on: [push, pull_request, workflow_dispatch]',
    'jobs:',
    '  test:',
    '    runs-on: redget-runner',
    '    steps:',
    '      - name: Set up job',
    '        run: echo setting up',
    '      - name: Check out forge',
    '        run: echo checking out',
    '      - name: Run tests',
    '        run: node --check src/client.js',
    '      - name: Complete job',
    '        run: echo done',
  ].join('\n'), 'Add the CI workflow');

  syncWorkflows(atlas);
  saveLabel(atlas, { name: 'bug', color: 'red', description: 'Something is broken' });
  saveLabel(atlas, { name: 'good first issue', color: 'green', description: 'A good place to start' });
  saveMilestone(atlas, { title: '1.0', description: 'First stable release', due: Date.now() + 14 * 86400000 });

  var atlasIssue = createIssue(me, atlas, {
    title: 'Retries swallow the original error',
    body: 'When every attempt fails the client throws the last error, which hides the status code from the first attempt.\n\nCould we keep the first failure and attach the retry count?',
    labels: [{ name: 'bug', color: 'red' }],
  });
  summary.issues += 1;

  createBranch(atlas, 'fix/retry-error');
  saveFile(atlas, 'src/errors.js', [
    'export class ApiError extends Error {',
    '  constructor(message, options) {',
    '    super(message);',
    '    this.name = "ApiError";',
    '    this.status = (options && options.status) || 0;',
    '    this.attempts = (options && options.attempts) || 1;',
    '  }',
    '}',
  ].join('\n'), 'Add a typed error that keeps the attempt count');
  var atlasPull = createPull(me, atlas, {
    title: 'Keep the first failure when retrying',
    body: 'Closes #' + (atlasIssue ? atlasIssue.number : 1) + '\n\nAdds `ApiError` with the status of the first failed attempt and the number of retries.',
    base: 'main',
    head: 'fix/retry-error',
    labels: [{ name: 'bug', color: 'red' }],
  });
  summary.pulls += 1;

  createRelease(atlas, {
    tag: 'v0.1.0',
    title: 'First working client',
    body: '## What is in here\n\n- `createClient()` with retries\n- typed `ApiError`\n- CI workflow that runs on every push',
  });
  summary.releases += 1;

  createWikiPage(atlas, {
    title: 'Home',
    body: '# atlas wiki\n\nThis wiki is part of the demo workspace.\n\n- [[Design notes]] explains the retry policy\n- every page keeps a real edit history',
    format: 'markdown',
  });
  createWikiPage(atlas, {
    title: 'Design notes',
    body: '## Retry policy\n\nRetries only happen for network failures and 5xx responses. A 4xx is a bug in the\ncaller, so it is returned immediately.\n\n```js\nif (status >= 500) retry();\n```',
    format: 'markdown',
  });
  summary.wiki += 2;

  createDiscussion(me, atlas, {
    title: 'Should the client cache GET responses?',
    body: 'A small in-memory cache would help the dashboard, but it needs an invalidation story. Ideas welcome.',
    category: 'ideas',
  });

  createPackage(atlas, { name: 'atlas', type: 'npm', version: '0.1.0', description: 'Tiny API client', visibility: 'public' });

  /* ── forge two: the organization's ──────────────────────── */
  var beacon = null;
  if (org) {
    beacon = findForgeByName(org, 'beacon') || createForge(
      'beacon', 'Status page generator that reads real workflow runs.', 'public', 'TypeScript', false, org.slug);
    if (org.forges.indexOf(beacon) === -1) org.forges.push(beacon);
    summary.forges += 1;

    saveFile(beacon, 'README.md', '# beacon\n\nStatus page generator owned by ' + org.name + '.\n', 'Document beacon');
    saveFile(beacon, 'src/render.ts', [
      'export interface Component {',
      '  name: string;',
      '  status: "operational" | "degraded" | "down";',
      '}',
      '',
      'export function render(components: Component[]): string {',
      '  return components',
      '    .map((c) => `<li class="${c.status}">${c.name}</li>`)',
      '    .join("");',
      '}',
    ].join('\n'), 'Add the renderer');
    saveFile(beacon, '.redget/workflows/release.yml', [
      'name: Release',
      'on: [push]',
      'jobs:',
      '  package:',
      '    runs-on: redget-runner',
      '    steps:',
      '      - name: Install',
      '        run: echo installing',
      '      - name: Build',
      '        run: echo building',
    ].join('\n'), 'Add the release workflow');

    syncWorkflows(beacon);
    createIssue(me, beacon, {
      title: 'Show the last 90 days of uptime',
      body: 'The status page only shows the current state. A 90-day bar per component would make regressions obvious.',
    });
    summary.issues += 1;
  }

  /* ── a project that spans both forges ──────────────────── */
  var project = createProject({
    title: 'Demo roadmap',
    description: 'Board created by the demo workspace: issues and pull requests from atlas and beacon.',
    layout: 'board',
    owner: org ? 'org' : 'user',
    ownerKey: org ? org.slug : me.username,
    ownerName: org ? org.name : me.username,
    columns: ['Todo', 'In progress', 'Done'],
  });
  if (project) {
    summary.projects = 1;
    var todo = project.columns[0].id;
    var doing = project.columns[1].id;
    var done = project.columns[2].id;
    if (atlasIssue) addItemFromRef(project, me.username + '/' + atlas.name, atlasIssue, todo);
    if (atlasPull) addItemFromRef(project, me.username + '/' + atlas.name, atlasPull, doing);
    addItem(project, { columnId: done, title: 'Pick the retry policy', kind: 'note', body: 'Settled on three attempts with backoff.' });
    addItem(project, { columnId: todo, title: 'Write the caching proposal', kind: 'note', body: 'Blocked on the discussion in atlas.' });
  }

  /* ── a codespace, a gist, a marketplace install ──────────────── */
  createCodespace({ name: 'atlas-dev', forgeOwner: me.username, forgeName: atlas.name, branch: 'main', template: 'node', idleMinutes: 30 });
  createGist({
    description: 'Retry helper used while writing atlas',
    isPublic: true,
    files: [{ name: 'retry.js', content: 'export async function retry(fn, attempts) {\n  let last;\n  for (let i = 0; i < attempts; i++) {\n    try { return await fn(); } catch (e) { last = e; }\n  }\n  throw last;\n}\n' }],
  });
  var apps = marketplaceApps();
  if (apps && apps.length) installApp(apps[0].id, me.username);

  /* ── real social state, generated by the other account ───────── */
  if (colleague) {
    var remember = me.key;
    setSession(colleague);
    toggleStar(colleague, atlas);
    toggleFollow(colleague, me.username);
    if (atlasIssue) {
      addComment(colleague, atlas, atlasIssue, 'Reproduced this on the dashboard: the toast shows "failed" with no status.');
    }
    if (atlasPull) {
      addReview(colleague, atlas, atlasPull, { state: 'approved', body: 'The typed error reads much better in the console.' });
    }
    if (beacon) {
      createIssue(colleague, beacon, { title: 'Add a JSON endpoint for the status page', body: 'So other tools can poll it instead of scraping HTML.' });
      summary.issues += 1;
    }
    setSession(userByKey(remember) || me);
  }

  /* ── workflow runs, triggered by the events above ────────────── */
  var runs = triggerRuns(atlas, 'push', { branch: 'main', title: 'Add the CI workflow', actor: me.username });
  if (beacon) runs = runs.concat(triggerRuns(beacon, 'push', { branch: 'main', title: 'Add the release workflow', actor: me.username }));
  summary.runs = runs.length;

  /* ── an SSH key so the keys page has something to show ───────── */
  var keyText = sampleKey(me.username + '@redget.local');
  var parsed = keyText.split(' ');
  if (!DB.sshKeys[me.username]) DB.sshKeys[me.username] = [];
  if (!DB.sshKeys[me.username].some(function (k) { return k.title === 'Demo laptop'; })) {
    DB.sshKeys[me.username].push({
      id: 'key_demo',
      title: 'Demo laptop',
      type: parsed[0] || 'ssh-ed25519',
      key: keyText,
      fingerprint: fingerprintKey(keyText),
      kind: 'authentication',
      added: Date.now(),
      lastUsed: null,
    });
  }

  logActivity('system', 'Loaded the demo workspace');
  saveDB();
  return summary;
}

/** The colleague account is created once and reused on later runs. */
function findOrCreateColleague() {
  var existing = Object.keys(DB.users).map(function (k) { return DB.users[k]; })
    .filter(function (u) { return u.username === COLLEAGUE; })[0];
  if (existing) return existing;

  var me = ME;
  var created = createUser(COLLEAGUE, 'Demo Colleague');
  // createUser signs the new account in; hand the session straight back.
  if (created) {
    created.bio = 'Second local account, created by the demo workspace so issues and reviews have another author.';
    created.location = 'Local';
    setSession(me);
    try { localStorage.setItem(SESSION_KEY, me.key); } catch (e) { /* private mode */ }
  }
  return created || null;
}

function findForgeByName(owner, name) {
  return (owner.forges || []).filter(function (r) { return r.name === name; })[0] || null;
}

/** Has the demo workspace already been loaded? */
export function demoLoaded() {
  return Boolean(DB.orgs && DB.orgs['redget-labs']);
}
