#!/usr/bin/env node
/**
 * RedGet — jsdom smoke test.
 *
 * Boots the real index.html with the real ES modules inside a throwaway
 * localStorage, twice:
 *
 *   pass 1 — signed out: every public route must render, and the signed-in
 *            routes must degrade to a sign-in prompt instead of throwing.
 *   pass 2 — signed in: one account and one forge are seeded exactly the
 *            way the UI would create them, every route is visited, and the main
 *            interactive controls are clicked.
 *
 * Forgerts any uncaught error, any route that renders nothing, any leftover
 * "coming soon" placeholder, and any external GitHub domain in the output.
 *
 * Usage:  node tools/smoke.mjs [--routes-only]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import jsdomPkg from 'jsdom';
import { bundle } from './bundle.mjs';

const { JSDOM, VirtualConsole } = jsdomPkg;

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const htmlPath = path.join(root, 'index.html');
const routesOnly = process.argv.includes('--routes-only');
const BASE_URL = 'http://redget.local/index.html';

const KEY = 'SMOKETEST123456';
const USER = 'smoketester';
const FORGE = 'demo-project';

/* ── seed data ──────────────────────────────────────────────────── */
/**
 * The forge the smoke test lives in. The shape must match what
 * core/forges.js `createForge()` produces, because the views read it directly:
 * `branches` and `tags` are arrays of *strings*, commits carry a `branch`
 * marker, and there are no star/fork counters (those are always derived).
 */
function seedForge() {
  const now = Date.now();
  const hour = 3600 * 1000;
  const readme = '# demo-project\n\nHello from the smoke test.\n\n- one\n- two\n';
  const ci = 'name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\njobs:\n  build:\n    runs-on: local\n    steps:\n      - name: Check out\n        run: echo checking out\n      - name: Test\n        run: echo testing\n';
  const app = "export function hello(name) {\n  return 'Hello, ' + name + '!';\n}\n";
  const appFeature = "export function hello(name) {\n  return `Hello, ${name}!`;\n}\n\nexport function goodbye(name) {\n  return `Bye, ${name}.`;\n}\n";

  return {
    id: 'forge_smoke', name: FORGE, desc: 'Forge used by the smoke test',
    visibility: 'public', language: 'JavaScript', ownerUsername: USER,
    created: now - 40 * hour, updated: now - hour,
    files: [
      { name: 'README.md', content: readme, commitMsg: 'Initial commit', commitTime: now - 40 * hour, sha: 'sha_initial', author: USER },
      { name: '.redignore', content: 'node_modules/\n*.log\ndist/\n', commitMsg: 'Initial commit', commitTime: now - 40 * hour, sha: 'sha_initial', author: USER },
      { name: '.redget/workflows/ci.yml', content: ci, commitMsg: 'Add the CI workflow', commitTime: now - 30 * hour, sha: 'sha_ci', author: USER },
      { name: 'src/index.js', content: app, commitMsg: 'Add the hello helper', commitTime: now - 20 * hour, sha: 'sha_app', author: USER },
    ],
    branches: ['main', 'feature/greeting'],
    defaultBranch: 'main',
    commits: [
      { sha: 'sha_initial', short: 'sha_ini', msg: 'Initial commit', body: '', author: USER, time: now - 40 * hour,
        files: ['README.md', '.redignore'], additions: 8, deletions: 0, parents: [] },
      { sha: 'sha_ci', short: 'sha_ci_', msg: 'Add the CI workflow', body: '', author: USER, time: now - 30 * hour,
        files: ['.redget/workflows/ci.yml'], additions: 12, deletions: 0, parents: ['sha_initial'] },
      { sha: 'sha_app', short: 'sha_app', msg: 'Add the hello helper', body: '', author: USER, time: now - 20 * hour,
        files: ['src/index.js'], additions: 3, deletions: 0, parents: ['sha_ci'] },
      { sha: 'sha_feat', short: 'sha_fea', msg: 'Use a template literal and add goodbye', body: '', author: USER,
        time: now - 2 * hour, files: ['src/index.js'], additions: 6, deletions: 1, parents: ['sha_app'], branch: 'feature/greeting' },
    ],
    issues: [{
      id: 'issue_smoke', number: 1, title: 'The hello helper should greet by name', body: 'Right now it ignores empty names.',
      state: 'open', author: USER, created: now - 5 * hour, updated: now - 5 * hour,
      labels: [{ name: 'bug', color: 'red' }], assignees: [], milestone: null, reactions: {}, comments: [],
      locked: false, pinned: false, stateReason: null, closedAt: null, closedBy: null,
    }],
    pulls: [{
      id: 'pull_smoke', number: 2, title: 'Use a template literal in hello()', body: 'Closes #1',
      state: 'open', draft: false, author: USER, created: now - 2 * hour, updated: now - 2 * hour,
      base: 'main', head: 'feature/greeting', labels: [], assignees: [], reviewers: [], milestone: null,
      reactions: {}, comments: [], reviews: [], commits: ['sha_feat'], files: ['src/index.js'],
      additions: 6, deletions: 1, merged: false, mergedBy: null, mergedAt: null, method: null, mergeable: true,
    }],
    releases: [], tags: [], labels: [{ name: 'bug', color: 'red' }, { name: 'enhancement', color: 'blue' }],
    milestones: [], wiki: [], discussions: [], packages: [],
    actions: { workflows: [], runs: [] },
    security: { advisories: [], dependabot: [], scanning: [], secrets: [] },
    forkedFrom: null, topics: ['demo'], pinned: false, archived: false,
  };
}

function seedUser() {
  return {
    key: KEY, username: USER, displayName: 'Smoke Tester', bio: 'Created by tools/smoke.mjs',
    company: '', location: '', website: '', avatar: { type: 'initials', value: 'ST', bg: '#da3633' },
    joined: Date.now(), following: [], forges: [seedForge()], activity: [], pinned: [],
    status: { emoji: '', message: '', busy: false }, social: { links: [] },
    prefs: { theme: 'dark', editor: 'basic', diffView: 'unified', emailVisible: false },
    sshKeys: [], gpgKeys: [], orgs: [],
  };
}

/**
 * @param {boolean} signedIn  seed an account + session
 * @param {number}  dbVersion 5 = current shape; 4 = the pre-rename shape
 *               (`user.repos`, `repoId`), which state.js must migrate on load.
 */
function seedStorage(signedIn, dbVersion) {
  const legacy = dbVersion === 4;
  const user = seedUser();
  if (legacy) {
    // the v4 shape: forges lived under `repos` and stars pointed at `repoId`
    user.repos = user.forges;
    delete user.forges;
  }
  const store = {
    ['redget.db.v' + (legacy ? 4 : 5)]: JSON.stringify({
      users: signedIn ? { [KEY]: user } : {},
      orgs: {},
      stars: signedIn && legacy ? [{ user: USER, repoId: 'forge_smoke', at: Date.now() }] : [],
      watches: [], forks: [], notifications: [], projects: [], gists: [],
      codespaces: [], sshKeys: {}, marketInstalls: [],
      sessions: signedIn ? [{ key: KEY, at: Date.now(), agent: 'smoke' }] : [],
      version: legacy ? 4 : 5,
    }),
    'redget.theme.v4': 'dark',
  };
  if (signedIn) store['redget.session.v4'] = KEY;
  return store;
}

/* ── route tables ───────────────────────────────────────────────── */
const PUBLIC_ROUTES = [
  ['#/explore', 'explore'],
  ['#/trending', 'trending'],
  ['#/docs', 'docs'],
  ['#/marketplace', 'marketplace'],
  ['#/copilot', 'copilot'],
  ['#/organizations', 'organizations'],
  ['#/enterprises', 'enterprises'],
  ['#/' + USER, 'profile'],
  ['#/this-account-does-not-exist', 'unknown profile → graceful 404'],
  ['#/nope/nope', 'unknown forge → graceful 404'],
];

const AUTH_ROUTES = [
  ['#/', 'dashboard / landing'],
  ['#/new', 'new forge'],
  ['#/new/import', 'import forge'],
  ['#/issues', 'global issues'],
  ['#/pulls', 'global pulls'],
  ['#/notifications', 'notifications'],
  ['#/projects', 'projects'],
  ['#/projects/new', 'new project'],
  ['#/gists', 'gists'],
  ['#/gists/new', 'new gist'],
  ['#/codespaces', 'codespaces'],
  ['#/codespaces/new', 'new codespace'],
  ['#/organizations/new', 'new organization'],
  ['#/settings', 'settings · profile'],
  ['#/settings/account', 'settings · account'],
  ['#/settings/appearance', 'settings · appearance'],
  ['#/settings/security', 'settings · security'],
  ['#/settings/keys', 'settings · keys'],
  ['#/settings/sessions', 'settings · sessions'],
  ['#/settings/data', 'settings · data'],
];

const FORGE_ROUTES = [
  ['', 'forge · code'],
  ['/blob/main/README.md', 'forge · blob'],
  ['/blame/main/README.md', 'forge · blame'],
  ['/commits/main', 'forge · commits'],
  ['/issues/1', 'forge · issue detail'],
  ['/pulls/2', 'forge · pull detail'],
  ['/pulls/2/files', 'forge · pull files'],
  ['/pulls/2/commits', 'forge · pull commits'],
  ['/pulls/2/checks', 'forge · pull checks'],
  ['/pull/2', 'forge · pull alias'],
  ['/pull/2/files', 'forge · pull alias with tab'],
  ['/issues/1', 'forge · issue detail again'],
  ['/labels', 'forge · labels'],
  ['/milestones', 'forge · milestones'],
  ['/raw/main/README.md', 'forge · raw file'],
  ['/new/main', 'forge · new file'],
  ['/edit/main/src%2Findex.js', 'forge · edit file'],
  ['/issues/closed', 'forge · closed issues'],
  ['/pulls/closed', 'forge · closed pulls'],
  ['/commits/sha_app', 'forge · commit detail'],
  ['/tree/feature%2Fgreeting', 'forge · tree on a branch'],
  ['/compare/main...feature%2Fgreeting', 'forge · compare'],
  ['/branches', 'forge · branches'],
  ['/tags', 'forge · tags'],
  ['/issues', 'forge · issues'],
  ['/issues/new', 'forge · new issue'],
  ['/pulls', 'forge · pulls'],
  ['/pulls/new', 'forge · new pull'],
  ['/actions', 'forge · actions'],
  ['/projects', 'forge · projects'],
  ['/wiki', 'forge · wiki'],
  ['/security', 'forge · security'],
  ['/insights', 'forge · insights'],
  ['/releases', 'forge · releases'],
  ['/discussions', 'forge · discussions'],
  ['/packages', 'forge · packages'],
  ['/stargazers', 'forge · stargazers'],
  ['/forks', 'forge · forks'],
  ['/network', 'forge · network'],
  ['/settings', 'forge · settings'],
  ['/settings/danger', 'forge · danger zone'],
  ['/actions/workflows', 'forge · workflows'],
  ['/security/advisories', 'forge · advisories'],
  ['/security/policy', 'forge · policy'],
  ['/wiki/Home', 'forge · wiki page'],
  ['/projects/1', 'forge · project board'],
];

const PROFILE_TABS = ['overview', 'forges', 'projects', 'packages', 'stars'];

/* ── one jsdom instance per pass ────────────────────────────────── */
export async function createApp(signedIn, dbVersion) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => {
    const detail = e.detail || e;
    errors.push('jsdomError: ' + (detail.stack || detail.message || String(detail)));
  });
  virtualConsole.on('error', (...args) => {
    const text = args.map(String).join(' ');
    if (!/Not implemented/i.test(text)) errors.push('console.error: ' + text.slice(0, 500));
  });

  const dom = new JSDOM(fs.readFileSync(htmlPath, 'utf8'), {
    url: BASE_URL + '#/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  });

  const { window } = dom;
  const document = window.document;

  // Seed storage *before* the app boots: state.js reads the database and the
  // session key while its module body runs.
  Object.entries(seedStorage(signedIn, dbVersion)).forEach(([k, v]) => window.localStorage.setItem(k, v));

  // jsdom leaves these unimplemented; the app uses them for polish only.
  window.scrollTo = () => {};
  window.Element.prototype.scrollIntoView = function () {};

  window.addEventListener('error', (e) => errors.push('window.onerror: ' + ((e.error && e.error.stack) || e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push('unhandledrejection: ' + ((e.reason && e.reason.stack) || e.reason)));

  // jsdom does not execute <script type="module">, so the real modules are
  // bundled into one classic script (tools/bundle.mjs) and evaluated here.
  const bundled = bundle(path.join(root, 'src', 'app.js'));
  bundled.problems.forEach((problem) => errors.push('bundler: ' + problem));
  try {
    window.eval(bundled.script);
  } catch (e) {
    errors.push('bundle eval: ' + (e.stack || e.message));
  }

  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const start = Date.now();
  while (window.redgetBooted !== true) {
    if (errors.length) break;
    if (Date.now() - start > 20000) { errors.push('app never finished booting'); break; }
    await wait(40);
  }

  return {
    dom, window, document, errors,
    go(hash) {
      window.location.hash = hash;
      window.dispatchEvent(new window.HashChangeEvent('hashchange'));
    },
    html() {
      const app = document.getElementById('app');
      return app ? app.innerHTML : '';
    },
    click(selector, opts) {
      const el = document.querySelector(selector);
      if (!el) { if (!(opts && opts.optional)) errors.push('click: no element for "' + selector + '"'); return false; }
      const before = errors.length;
      try { el.click(); } catch (e) { errors.push('click "' + selector + '" threw: ' + (e.stack || e.message)); return false; }
      return errors.length === before;
    },
    setValue(selector, value) {
      const el = document.querySelector(selector);
      if (!el) { errors.push('setValue: no element for "' + selector + '"'); return false; }
      el.value = value;
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      el.dispatchEvent(new window.Event('change', { bubbles: true }));
      return true;
    },
    key(key, opts) {
      const init = Object.assign({ key, bubbles: true, cancelable: true }, opts || {});
      document.dispatchEvent(new window.KeyboardEvent('keydown', init));
    },
  };
}

/* ── assertions ─────────────────────────────────────────────────── */
const results = [];
const allErrors = [];

function checkRoute(ctx, hash, label) {
  const before = ctx.errors.length;
  ctx.go(hash);
  const html = ctx.html();
  const newErrors = ctx.errors.slice(before);
  const placeholder = /coming soon|not implemented|TODO:|lorem ipsum/i.test(html);
  results.push({
    hash, label,
    ok: html.length > 80 && newErrors.length === 0 && !placeholder,
    size: html.length,
    errors: newErrors.concat(placeholder ? ['placeholder text still in output'] : []),
  });
}

/* ── passes ─────────────────────────────────────────────────────── */
async function signedOutPass() {
  const ctx = await createApp(false);
  PUBLIC_ROUTES.forEach(([h, l]) => checkRoute(ctx, h, l));
  AUTH_ROUTES.forEach(([h, l]) => checkRoute(ctx, h, l + ' (signed out)'));

  // the landing page must offer a way in
  ctx.go('#/');
  results.push({
    hash: '#/', label: 'landing offers sign-in',
    ok: /Sign in|Create (an )?account|Get started/i.test(ctx.html()), size: 0, errors: [],
  });

  allErrors.push(...ctx.errors.map((e) => '[signed-out] ' + e));
  ctx.dom.window.close();
}

async function signedInPass() {
  const ctx = await createApp(true);

  // If the session did not restore, every route silently renders the landing
  // page and the whole pass would be meaningless — assert that first.
  ctx.go('#/');
  const signedIn = ctx.html().includes('dash-');
  results.push({ hash: '#/', label: 'session restored (dashboard renders, not the landing page)',
    ok: signedIn, size: 0, errors: signedIn ? [] : ['ME is null — the seeded session was not restored'] });

  AUTH_ROUTES.forEach(([h, l]) => checkRoute(ctx, h, l));
  PUBLIC_ROUTES.forEach(([h, l]) => checkRoute(ctx, h, l));
  FORGE_ROUTES.forEach(([suffix, l]) => checkRoute(ctx, '#/' + USER + '/' + FORGE + suffix, l));
  PROFILE_TABS.forEach((tab) => checkRoute(ctx, '#/' + USER + '?tab=' + tab, 'profile · ' + tab));

  if (routesOnly) { allErrors.push(...ctx.errors.map((e) => '[signed-in] ' + e)); ctx.dom.window.close(); return ctx; }

  /* ── interaction pass ───────────────────────────────────────── */
  const base = '#/' + USER + '/' + FORGE;

  ctx.go(base);
  ctx.click('#starBtn');
  ctx.click('#starBtn');          // unstar again
  ctx.click('#watchBtn');
  ctx.click('#codeBtn');          // clone panel
  ctx.click('#copyAddressBtn', { optional: true });
  ctx.click('#forkBtn');

  // create an issue through the form
  ctx.go(base + '/issues/new');
  ctx.setValue('#niTitle', 'Smoke test issue');
  ctx.setValue('#niBody', 'Created by tools/smoke.mjs');
  const beforeIssue = ctx.errors.length;
  ctx.click('#niGo');
  results.push({ hash: base + '/issues/new', label: 'issue form submits cleanly',
    ok: ctx.errors.length === beforeIssue, size: 0, errors: ctx.errors.slice(beforeIssue) });

  // create a second forge through the form
  ctx.go('#/new');
  ctx.setValue('#nrName', 'second-forge');
  ctx.setValue('#nrDesc', 'Made by the smoke test');
  const beforeForge = ctx.errors.length;
  ctx.click('#nrGo', { optional: true });
  results.push({ hash: '#/new', label: 'create-forge form submits cleanly',
    ok: ctx.errors.length === beforeForge, size: 0, errors: ctx.errors.slice(beforeForge) });

  // projects
  ctx.go('#/projects/new');
  ctx.setValue('#npTitle', 'Smoke project');
  ctx.click('#createProjectBtn');

  // gists
  ctx.go('#/gists/new');
  ctx.setValue('.gistFileName', 'notes.md');
  ctx.setValue('.gistFileContent', '# notes from the smoke test');
  ctx.click('#createGistBtn');

  // organizations
  ctx.go('#/organizations/new');
  ctx.setValue('#orgName', 'Smoke Org');
  ctx.click('#createOrgBtn');

  // codespaces
  ctx.go('#/codespaces/new');
  ctx.click('#createCodespaceBtn');

  // forge chrome that must not dead-end
  ctx.go(base);
  ctx.click('#goToFileBtn', { optional: true });
  ctx.key('Escape');
  ctx.go(base + '/wiki');
  ctx.click('.createWikiPageBtn', { optional: true });
  ctx.key('Escape');
  ctx.go(base + '/actions');
  ctx.click('#newWorkflowBtn', { optional: true });
  ctx.key('Escape');
  ctx.go(base + '/releases');
  ctx.click('.newReleaseBtn', { optional: true });
  ctx.key('Escape');
  ctx.go('#/settings/keys');
  ctx.click('.addSshKeyBtn', { optional: true });
  ctx.key('Escape');
  ctx.go('#/notifications');
  ctx.click('#markAllReadBtn', { optional: true });

  // the demo workspace must build without throwing, then every page it
  // creates must still render
  ctx.go('#/settings/data');
  const beforeDemo = ctx.errors.length;
  ctx.click('#loadDemoBtn');
  await new Promise((r) => setTimeout(r, 600));
  results.push({ hash: '#/settings/data', label: 'demo workspace loads',
    ok: ctx.errors.length === beforeDemo, size: 0, errors: ctx.errors.slice(beforeDemo) });

  const demoRoutes = [
    '#/redget-labs', '#/redget-labs/beacon', '#/' + USER + '/atlas',
    '#/' + USER + '/atlas/actions', '#/' + USER + '/atlas/wiki', '#/' + USER + '/atlas/releases',
    '#/' + USER + '/atlas/issues/1', '#/' + USER + '/atlas/pulls/2', '#/' + USER + '/atlas/discussions',
    '#/' + USER + '/atlas/packages', '#/projects', '#/gists', '#/codespaces', '#/settings/keys',
    '#/' + USER, '#/',
  ];
  demoRoutes.forEach((route) => checkRoute(ctx, route, 'after demo · ' + route));

  // keyboard: shortcut help, palette, drawer
  ctx.go('#/');
  ctx.key('?');
  results.push({ hash: 'key ?', label: 'shortcut help dialog opens',
    ok: Boolean(ctx.document.querySelector('#overlay .modal')), size: 0, errors: [] });
  ctx.key('Escape');

  ctx.key('k', { ctrlKey: true });
  results.push({ hash: 'ctrl+k', label: 'command palette opens',
    ok: ctx.document.getElementById('paletteOverlay').classList.contains('open'), size: 0, errors: [] });
  ctx.key('Escape');

  ctx.click('#menuBtn');
  results.push({ hash: '#menuBtn', label: 'navigation drawer opens',
    ok: Boolean(ctx.document.querySelector('#drawerOverlay.open')), size: 0, errors: [] });
  ctx.click('#drawerClose', { optional: true });

  // g-then-x navigation
  ctx.go('#/');
  ctx.key('g');
  ctx.key('p');
  results.push({ hash: 'g then p', label: 'shortcut opens your profile',
    ok: ctx.window.location.hash === '#/' + USER, size: 0, errors: [] });

  ctx.go('#/');
  ctx.key('g');
  ctx.key('j');
  results.push({ hash: 'g then j', label: 'shortcut opens projects',
    ok: ctx.window.location.hash.indexOf('#/projects') === 0, size: 0, errors: [] });

  ctx.go('#/');
  ctx.key('n');
  results.push({ hash: 'n', label: 'shortcut opens the new-forge form',
    ok: ctx.window.location.hash === '#/new', size: 0, errors: [] });

  // globals used by inline onclick attributes
  const globals = ['navigate', 'closeModal', 'closeAllDropdowns', 'showAuth', 'setTheme', 'howAuth',
    'toast', 'copyText', 'downloadText', 'openMenu', 'closeMenu', 'openPalette', 'openSshKeyModal',
    'signOut', 'openShortcutHelpModal', 'openBranchModal', 'openGoToFileModal', 'openCodeModal'];
  const missing = globals.filter((g) => typeof ctx.window[g] !== 'function');
  results.push({ hash: 'window.*', label: 'inline-onclick globals present',
    ok: missing.length === 0, size: 0, errors: missing.map((g) => 'missing global: ' + g) });

  // no external GitHub domain anywhere in the rendered DOM
  const html = ctx.document.documentElement.innerHTML;
  const banned = ['raw.githubusercontent.com', 'api.github.com', 'codeload.github.com',
    'objects.githubusercontent.com', 'github.com'];
  const hits = banned.filter((d) => html.includes(d));
  results.push({ hash: 'dom', label: 'no external GitHub domain in output',
    ok: hits.length === 0, size: 0, errors: hits.map((d) => 'found domain: ' + d) });

  allErrors.push(...ctx.errors.map((e) => '[signed-in] ' + e));
  ctx.dom.window.close();
  return ctx;
}

/* ── forgert ─────────────────────────────────────────────────────── */
/** A database written before the repo → forge rename must still load. */
async function legacyPass() {
  const ctx = await createApp(true, 4);
  ctx.go('#/');
  const migrated = ctx.html().includes('dash-');
  results.push({ hash: 'v4 database', label: 'a v4 database migrates to v5 on load',
    ok: migrated, size: 0, errors: migrated ? [] : ['the v4 → v5 migration did not restore the session'] });

  ctx.go('#/' + USER + '/' + FORGE);
  const forgePage = !ctx.html().includes('Page not found');
  results.push({ hash: '#/' + USER + '/' + FORGE, label: 'migrated `user.repos` renders as forges',
    ok: forgePage, size: 0, errors: forgePage ? [] : ['the migrated forge list is empty'] });

  ctx.go('#/' + USER);
  const stars = ctx.html().includes('dash-') || !ctx.html().includes('Page not found');
  results.push({ hash: '#/' + USER, label: 'migrated profile renders', ok: stars, size: 0, errors: [] });

  allErrors.push(...ctx.errors.map((e) => '[legacy] ' + e));
  ctx.dom.window.close();
}

async function main() {
  await signedOutPass();
  await signedInPass();
  await legacyPass();

  const failed = results.filter((r) => !r.ok);
  const runtimeErrors = results.flatMap((r) => r.errors.map((e) => `[${r.hash}] ${e}`));
  const globalErrors = allErrors;

  console.log('');
  console.log('routes + checks : ' + results.length);
  console.log('failed          : ' + failed.length);
  failed.forEach((r) => console.log('   ✗ ' + r.hash.padEnd(48) + r.label + (r.size ? ` (${r.size} bytes)` : '')));

  if (runtimeErrors.length) {
    console.log('');
    console.log('runtime errors  : ' + runtimeErrors.length);
    runtimeErrors.slice(0, 30).forEach((e) => console.log('   ✗ ' + String(e).split('\n')[0]));
  }
  if (globalErrors.length) {
    console.log('');
    console.log('global errors   : ' + globalErrors.length);
    globalErrors.slice(0, 30).forEach((e) => console.log('   ✗ ' + String(e).split('\n')[0]));
  }

  const total = failed.length + globalErrors.length;
  console.log('');
  console.log(total === 0 ? '✓ smoke test passed' : `✗ smoke test found ${total} problem(s)`);
  process.exit(total === 0 ? 0 : 1);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((e) => {
    console.error('✗ smoke test crashed: ' + (e.stack || e.message));
    process.exit(1);
  });
}

export { main as runSmoke, KEY, USER, FORGE };
