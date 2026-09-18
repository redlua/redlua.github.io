/**
 * RedGet — documentation.
 *
 * These pages describe what this build actually does: the real route table,
 * the real data shapes, the real shortcut list and the real limits. Nothing
 * here advertises a feature that is not wired up.
 */

import { ME } from '../state.js';
import { ic } from '../icons.js';
import { RESERVED } from '../core/render.js';
import { KEY_LENGTH } from '../core/keys.js';
import { SHORTCUTS } from '../core/shortcuts.js';
import { DISCUSSION_CATEGORIES, marketplaceApps } from '../core/marketplace.js';
import { CODESPACE_TEMPLATES } from '../core/codespaces.js';
import { PROJECT_LAYOUTS, DEFAULT_COLUMNS } from '../core/projects.js';
import { WIKI_FORMATS } from '../core/wiki.js';
import { ADVISORY_SEVERITIES } from '../core/security.js';
import { REACTION_KINDS, DEFAULT_LABELS } from '../core/model.js';
import { esc } from '../core/util.js';

var SECTIONS = [
  ['getting-started', 'Getting started', 'rocket'],
  ['accounts-and-keys', 'Accounts & keys', 'key'],
  ['forges', 'Forges', 'forge'],
  ['code', 'Code & files', 'code'],
  ['issues-and-pulls', 'Issues & pull requests', 'issue'],
  ['actions', 'Actions', 'play'],
  ['projects', 'Projects', 'project'],
  ['wiki', 'Wiki', 'book'],
  ['discussions', 'Discussions', 'commentDiscussion'],
  ['releases-and-packages', 'Releases & packages', 'tag'],
  ['security', 'Security', 'shield'],
  ['organizations', 'Organizations', 'organization'],
  ['gists', 'Gists', 'codeSquare'],
  ['codespaces', 'Codespaces', 'codespaces'],
  ['marketplace', 'Marketplace', 'package'],
  ['notifications', 'Notifications', 'bell'],
  ['shortcuts', 'Keyboard shortcuts', 'keyboard'],
  ['routes', 'Route reference', 'link'],
  ['data-and-privacy', 'Data & privacy', 'lock'],
];

export function viewDocs(rest) {
  var active = (rest && rest[0]) || 'getting-started';
  if (!SECTIONS.some(function (s) { return s[0] === active; })) active = 'getting-started';

  return '<div class="container page">' +
    '<div class="page-head"><div><h1 class="page-title">' + ic('book', 22) + ' RedGet documentation</h1>' +
      '<p class="muted fs-13">Everything below describes this build exactly — the routes, the data and the limits.</p></div></div>' +
    '<div class="docs-layout">' +
      '<nav class="docs-nav" aria-label="Documentation sections">' + SECTIONS.map(function (s) {
        return '<a class="docs-nav-link' + (active === s[0] ? ' active' : '') + '" href="#/docs/' + s[0] + '">' +
          ic(s[2], 14) + ' ' + esc(s[1]) + '</a>';
      }).join('') + '</nav>' +
      '<article class="docs-body">' + sectionFor(active) + '</article>' +
    '</div>' +
  '</div>';
}

function sectionFor(id) {
  switch (id) {
    case 'accounts-and-keys': return accountsSection();
    case 'forges': return forgesSection();
    case 'code': return codeSection();
    case 'issues-and-pulls': return issuesSection();
    case 'actions': return actionsSection();
    case 'projects': return projectsSection();
    case 'wiki': return wikiSection();
    case 'discussions': return discussionsSection();
    case 'releases-and-packages': return releasesSection();
    case 'security': return securitySection();
    case 'organizations': return orgsSection();
    case 'gists': return gistsSection();
    case 'codespaces': return codespacesSection();
    case 'marketplace': return marketplaceSection();
    case 'notifications': return notificationsSection();
    case 'shortcuts': return shortcutsSection();
    case 'routes': return routesSection();
    case 'data-and-privacy': return dataSection();
    default: return gettingStarted();
  }
}

function h2(text) { return '<h2 class="docs-h2">' + esc(text) + '</h2>'; }
function p(text) { return '<p class="docs-p">' + text + '</p>'; }
function ul(items) { return '<ul class="doc-list">' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul>'; }
function code(text) { return '<pre class="doc-code mono">' + esc(text) + '</pre>'; }
function note(text) { return '<div class="callout">' + ic('info', 14) + ' <span>' + text + '</span></div>'; }

function gettingStarted() {
  return h2('Getting started') +
    p('RedGet is a complete code-hosting interface that runs entirely in your browser. There is no server, no network request and no account database anywhere else — <span class="mono">localStorage</span> is the database.') +
    ul([
      '<b>Create an account.</b> Choose a username and RedGet generates a ' + KEY_LENGTH + '-character key. That key is your only credential; there is no password and no email.',
      '<b>Store the key.</b> Copy it somewhere safe. Losing it means losing the account — there is no recovery flow, by design.',
      '<b>Create a forge.</b> Add files through the web editor, or import a folder of files at <a href="#/new/import">/new/import</a>.',
      '<b>Work.</b> Commit files, open issues, propose pull requests, run Actions workflows, write wiki pages, track work on project boards.',
      '<b>Collaborate.</b> Create a second account in the same browser, follow the first, star its forges and comment on its issues.',
    ]) +
    note('Because everything is local, a fresh browser profile starts completely empty. No demo users, no demo forges and no seeded notifications are ever created.') +
    h2('Where to go next') +
    ul([
      '<a href="#/new">Create a forge</a>',
      '<a href="#/settings/keys">Add an SSH or GPG key</a>',
      '<a href="#/docs/routes">Read the full route reference</a>',
      '<a href="#/docs/shortcuts">Learn the keyboard shortcuts</a>',
    ]);
}

function accountsSection() {
  return h2('Accounts & keys') +
    p('An account is a record in <span class="mono">localStorage</span> keyed by its generated key. Signing in means presenting that key; RedGet looks it up and restores the session.') +
    ul([
      'Keys are ' + KEY_LENGTH + ' characters, generated locally with a cryptographically strong random source.',
      'You can rotate your key from <a href="#/settings/account">Settings → Account</a>. The old key stops working immediately.',
      'Sessions are recorded per sign-in with the browser agent string, and can be revoked individually from <a href="#/settings/sessions">Settings → Sessions</a>.',
      'SSH and GPG keys are stored per account under <a href="#/settings/keys">Settings → Keys</a> with a computed fingerprint. They are never used to contact a server — they identify you in commit metadata and on your profile.',
      'Deleting your account removes every forge, gist, project, codespace and notification that belongs to it.',
    ]) +
    h2('Data you can export') +
    p('Settings → Account → <b>Export data</b> writes the full database as JSON, and <b>Reset all data</b> clears it. Both act on the real stored records.') +
    code('redget.db.v4       → accounts, forges, issues, pull requests, gists, projects, codespaces\nredget.session.v4  → the key of the signed-in account\nredget.theme.v4    → dark | light | hc');
}

function forgesSection() {
  return h2('Forges') +
    p('A forge owns its files, branches, commits, issues, pull requests, releases, tags, wiki pages, discussions, packages, project boards, Actions runs and security findings.') +
    ul([
      '<b>Create</b> at <a href="#/new">/new</a> — name, description, visibility, primary language, optional README and .redignore.',
      '<b>Import</b> at <a href="#/new/import">/new/import</a> — pick files from your computer; each becomes a file record with a real commit.',
      '<b>Visibility</b> — private forges are hidden from Explore, search and other accounts; only the owner sees them.',
      '<b>Topics</b> drive Explore filtering and are editable in forge settings.',
      '<b>Features</b> can be switched off individually: issues, pull requests, Actions, projects, wiki, security, discussions and packages.',
      '<b>Archiving</b> makes a forge read-only without deleting it.',
      '<b>Forking</b> copies the files, history, branches and open issues into your account and records the relationship; stars, forks and watchers are counted from real records, never stored as counters.',
    ]) +
    note('Star, fork and watcher counts on every card and page are computed at render time from the star/fork/watch lists.') ;
}

function codeSection() {
  return h2('Code & files') +
    ul([
      '<b>Browse</b> — the file list shows directories first, each row carrying the message and timestamp of the commit that last touched it.',
      '<b>Branches</b> — switch branches from the branch picker; the tree, blob and history follow the selected branch.',
      '<b>Blame</b> groups consecutive lines by the commit that last touched them.',
      '<b>Raw</b> shows the stored file content with no rendering.',
      '<b>Edit</b> opens a code editor that writes a real commit with your message; you can commit to the current branch or create a new branch and open a pull request.',
      '<b>Delete</b> removes the file and records a commit for the deletion.',
      '<b>Compare</b> at <span class="mono">/owner/forge/compare/base...head</span> lists the commits and totals between two branches.',
      '<b>Go to file</b> searches every path in the forge.',
    ]) +
    h2('Languages') +
    p('The language meter and the Insights → Code frequency panel are computed from file extensions and byte counts of the files you actually stored.');
}

function issuesSection() {
  return h2('Issues') +
    ul([
      'Issues carry a title, markdown body, labels, assignees, a milestone, reactions, comments and a state (open, closed, closed as not planned).',
      'Comments are threaded per issue, editable and deletable by their author or a maintainer.',
      'Reactions available: ' + REACTION_KINDS.map(function (r) { return '<span class="mono">' + esc(r) + '</span>'; }).join(', ') + '.',
      'Default labels when a forge is created: ' + DEFAULT_LABELS.map(function (l) { return esc(l.name); }).join(', ') + '.',
      'Milestones show real progress: closed issues assigned to the milestone over the total.',
      'Writing <span class="mono">@username</span> notifies that account; writing <span class="mono">#12</span> cross-references issue 12.',
      '<a href="#/issues">/issues</a> lists every issue you can see, with filters for yours, assigned, mentioned and involved.',
    ]) +
    h2('Pull requests') +
    ul([
      'A pull request compares two branches and records the commits, files, additions and deletions between them.',
      'Draft pull requests cannot be merged until they are marked ready.',
      'Reviews can be <span class="mono">approved</span>, <span class="mono">changes requested</span> or <span class="mono">commented</span>.',
      'Merging supports merge commit, squash and rebase. Merge and squash delete the head branch when that forge setting is on; rebase keeps it.',
      'A merge message containing <span class="mono">Fixes #3</span>, <span class="mono">Closes #3</span> or <span class="mono">Resolves #3</span> closes that issue automatically and notifies its author.',
      'The Checks tab lists real Actions runs for the forge.',
    ]);
}

function actionsSection() {
  return h2('Actions') +
    p('Workflows are not invented: RedGet reads <span class="mono">.redget/workflows/*.yml</span> from the forge and parses the subset below.') +
    code('name: RedGet CI\non: [push, pull_request, workflow_dispatch]\njobs:\n  build:\n    runs-on: redget-runner\n    steps:\n      - name: Check out forge\n      - name: Install dependencies\n        run: npm ci\n      - name: Lint\n        run: npm run lint\n      - name: Test\n        run: npm test') +
    ul([
      'A run is created when a matching event fires — a commit to a watched branch, a pull request, or a manual dispatch from <span class="mono">Actions → New run</span>.',
      'Every job gets a real <span class="mono">Set up job</span> step, the steps you declared, and a <span class="mono">Complete job</span> step.',
      'Step logs are generated from the forge’s actual files: the checkout step forgerts the real file count, the lint step lists the files it examined, the test step forgerts the test files it found.',
      'A lint step fails if a file contains a <span class="mono">TODO: fail</span> marker — so a failing run is failing for a reason you can see in the source.',
      'Runs can be re-run (all jobs or failed jobs only), and a queued or running job can be cancelled.',
      'Artifacts appear for successful runs whose workflow declares a build or upload step; caches appear for runs that executed an install step against a real manifest.',
      'Secrets store only their name and update time — values are never displayed again. Variables store a visible value. Environments record deploy targets.',
      'Workflows can be disabled, which stops them from being triggered.',
    ]);
}

function projectsSection() {
  return h2('Projects') +
    p('A project belongs to an account, an organization or a forge, and can be viewed in three layouts.') +
    ul(Object.keys(PROJECT_LAYOUTS).map(function (key) {
      return '<b>' + esc(PROJECT_LAYOUTS[key].label) + '</b> — ' + esc(PROJECT_LAYOUTS[key].description) + '.';
    })) +
    ul([
      'Default columns: ' + DEFAULT_COLUMNS.map(esc).join(', ') + '. Add, rename, reorder and delete columns from the board header.',
      'Items are notes, or references to real issues and pull requests in the form <span class="mono">owner/forge#12</span>, which link straight through.',
      'Moving an item updates its column and its order; deleting a column deletes its items.',
      'Items can carry assignees, labels, a milestone, an iteration and a due date. Due dates drive the roadmap layout.',
      'Iterations are date ranges you add in project settings; items can be assigned to one.',
      'Progress is computed from the last column: items in it over total items.',
    ]);
}

function wikiSection() {
  return h2('Wiki') +
    ul([
      'Pages live on the forge record and have a title, a URL slug, a body and a format.',
      'Supported formats: ' + WIKI_FORMATS.map(function (f) { return '<span class="mono">' + esc(f.id) + '</span>'; }).join(', ') + '.',
      'Every save stores the previous body in the page history with the author, timestamp and your edit message — up to 50 revisions.',
      'Any revision can be restored, which itself records a new revision.',
      'Deleting a page removes it and its history.',
      'The sidebar and footer slots hold markdown that renders on every page.',
    ]);
}

function discussionsSection() {
  return h2('Discussions') +
    p('Discussions are open-ended threads attached to a forge, with categories, upvotes and an answer.') +
    ul([
      'Categories: ' + DISCUSSION_CATEGORIES.map(function (c) { return esc(c.name); }).join(', ') + '.',
      'Threads and comments can be upvoted; upvotes are recorded per account and can be withdrawn.',
      'The thread author can mark one comment as the answer, which floats the thread to the top of the list.',
      'Commenting notifies the thread author.',
    ]);
}

function releasesSection() {
  return h2('Releases & tags') +
    ul([
      'Publishing a release creates the tag if it does not exist, records the notes, the target branch and any assets, and adds a commit to the history.',
      'Asset names that match a file in the forge forgert that file’s real size.',
      'The newest release is marked <b>Latest</b> on the releases page and in the forge sidebar.',
      'Releases can be edited and deleted; deleting a release keeps the tag.',
      'Tags can be deleted from forge settings.',
    ]) +
    h2('Packages') +
    p('A release that carries assets also creates a package version automatically. Packages can also be created by hand and given extra versions; each version records its author, size and publish time.');
}

function securitySection() {
  return h2('Security') +
    p('The Security tab forgerts findings computed from the files in the forge. Nothing is scanned by an external service.') +
    ul([
      '<b>Secret scanning</b> looks for private key blocks, cloud access key ids, chat and registry tokens, bearer tokens, hardcoded password assignments and database connection strings, forgerting the file and line.',
      '<b>Code scanning</b> flags unescaped HTML assignment, <span class="mono">eval()</span>, <span class="mono">document.write()</span>, unquoted shell variables in destructive commands, and <span class="mono">TODO: fail</span> markers.',
      '<b>Dependency review</b> reads <span class="mono">package.json</span> and <span class="mono">requirements.txt</span> and flags wildcard ranges, URL-resolved dependencies, pre-1.0 pins, open upper bounds, unpinned requirements, unparsable manifests and missing licences.',
      'Any finding can be dismissed and reopened; the state is stored per forge.',
      '<b>Advisories</b> are ones you write: draft, publish or close them, with severities ' + ADVISORY_SEVERITIES.join(', ') + ', affected packages, CVE ids and credits.',
      '<b>Policy</b> stores the text of <span class="mono">SECURITY.md</span>.',
      'Scanning switches are per forge and stored in its security settings.',
    ]);
}

function orgsSection() {
  return h2('Organizations') +
    ul([
      'Create one at <a href="#/organizations/new">/organizations/new</a>. The creator becomes its owner and the first member of the Owners team.',
      'Roles: <span class="mono">owner</span>, <span class="mono">admin</span>, <span class="mono">write</span>, <span class="mono">read</span>. Owners and admins manage settings, members and teams.',
      'Teams group members and carry a default permission.',
      'Forges created under an organization are owned by it and appear on its Forges tab.',
      'Deleting an organization removes its membership records, teams and forges.',
      'Organizations that name the same <b>enterprise</b> are grouped on <a href="#/enterprises">/enterprises</a> with combined forge and member counts.',
    ]);
}

function gistsSection() {
  return h2('Gists') +
    ul([
      'A gist holds one or more files, each with a detected language, plus a description and a visibility (public or secret).',
      'Saving an edit stores the previous contents as a revision with your message — up to 30 revisions — and any revision can be restored.',
      'Gists can be starred, forked into your own account, and commented on.',
      'Markdown files can be rendered inline; all files get syntax highlighting and a copy button.',
    ]);
}

function codespacesSection() {
  return h2('Codespaces') +
    p('A codespace is a terminal environment pointed at one forge and branch. Templates available:') +
    '<div class="card-tight">' + CODESPACE_TEMPLATES.map(function (t) {
      return '<div class="list-item"><div class="list-icon">' + ic('deviceDesktop', 14) + '</div>' +
        '<div class="list-body"><div class="list-title">' + esc(t.label) + '</div>' +
        '<div class="list-meta">' + esc(t.detail) + ' · ' + t.cpu + ' CPU · ' + esc(t.memory) + '</div></div></div>';
    }).join('') + '</div>' +
    ul([
      'The terminal understands <span class="mono">ls</span>, <span class="mono">cat</span>, <span class="mono">wc</span>, <span class="mono">find</span>, <span class="mono">grep</span>, <span class="mono">rgt status|log|branch</span>, <span class="mono">node --version</span>, <span class="mono">whoami</span>, <span class="mono">pwd</span>, <span class="mono">echo</span>, <span class="mono">clear</span> and <span class="mono">help</span>.',
      'Output is read from the files and commits you stored. A command that cannot be answered honestly forgerts that instead of inventing output.',
      'Codespaces can be started, stopped, renamed, given a new idle timeout, and deleted. Every state change is written to the codespace history.',
      'Nothing is uploaded and nothing is executed as code — the shell is a simulator over your data.',
    ]);
}

function marketplaceSection() {
  var apps = marketplaceApps();
  return h2('Marketplace') +
    p('Installing an app writes a record against your account listing the permissions you accepted. ' + apps.length + ' apps are in the catalogue:') +
    '<div class="card-tight">' + apps.map(function (app) {
      return '<div class="list-item"><div class="list-icon">' + ic(app.icon, 14) + '</div>' +
        '<div class="list-body"><div class="list-title"><a href="#/marketplace/' + esc(app.id) + '">' + esc(app.name) + '</a></div>' +
        '<div class="list-meta">' + esc(app.tagline) + '</div></div>' +
        '<div class="list-side"><span class="label">' + esc(app.category) + '</span></div></div>';
    }).join('') + '</div>' +
    note('Marketplace apps do not run external code — RedGet has no network. An install records the permissions granted, which is what the app page forgerts back.');
}

function notificationsSection() {
  return h2('Notifications') +
    p('Notifications are created by real events involving your account:') +
    ul([
      'Someone follows you, stars your forge or forks it.',
      'An issue or pull request is opened in a forge you watch.',
      'Somebody comments on your issue or pull request, or replies to your discussion.',
      'A review is submitted on your pull request.',
      'A release is published in a forge you watch.',
      'You are added to an organization.',
      'Account events such as a key rotation.',
    ]) +
    p('The inbox at <a href="#/notifications">/notifications</a> filters by unread, issues & pull requests, stars & forks, and account events. Items can be marked read individually or all at once, and deleted.') +
    note('Notification preferences in Settings → Notifications control which kinds are delivered to the inbox and to the header badge.');
}

function shortcutsSection() {
  return h2('Keyboard shortcuts') +
    p('Shortcuts are active whenever a text field is not focused. Press <span class="mono">?</span> anywhere to reopen this list.') +
    '<div class="card-tight">' + SHORTCUTS.map(function (s) {
      return '<div class="list-item"><div class="list-icon"><kbd>' + esc(s.keys) + '</kbd></div>' +
        '<div class="list-body"><div class="list-title">' + esc(s.label) + '</div>' +
        '<div class="list-meta">' + esc(s.description || '') + '</div></div></div>';
    }).join('') + '</div>';
}

function routesSection() {
  var routes = [
    ['/', 'Dashboard when signed in, landing page when signed out'],
    ['/new', 'Create a forge'],
    ['/new/import', 'Import files into a new forge'],
    ['/explore', 'Search forges, people, organizations and topics'],
    ['/trending', 'Forges ranked by real recent activity'],
    ['/issues', 'Every issue you can see, with filters'],
    ['/pulls', 'Every pull request you can see'],
    ['/notifications', 'Your inbox'],
    ['/projects', 'Projects across accounts, organizations and forges'],
    ['/projects/new', 'Create a project'],
    ['/projects/:id', 'Project board, table or roadmap'],
    ['/gists', 'Your gists and all public gists'],
    ['/gists/new', 'Create a gist'],
    ['/gists/:id', 'Gist files, revisions and comments'],
    ['/codespaces', 'Your codespaces'],
    ['/codespaces/new', 'Create a codespace'],
    ['/codespaces/:id', 'Codespace terminal, settings and history'],
    ['/marketplace', 'App catalogue'],
    ['/marketplace/:app', 'App detail and install'],
    ['/organizations', 'Organizations you belong to'],
    ['/organizations/new', 'Create an organization'],
    ['/orgs/:slug', 'Organization overview'],
    ['/orgs/:slug/:tab', 'forges · people · teams · projects · settings'],
    ['/enterprises', 'Organizations grouped by enterprise'],
    ['/copilot', 'Local assistant over your own code'],
    ['/docs', 'This documentation'],
    ['/docs/:section', 'One documentation section'],
    ['/settings', 'Profile settings'],
    ['/settings/:section', 'profile · account · appearance · forges · notifications · keys · sessions · danger'],
    ['/:username', 'Profile (?tab=overview|forges|projects|packages|gists|stars|followers|following)'],
    ['/:owner/:forge', 'Forge code'],
    ['/:owner/:forge/tree/:branch/:path', 'Directory listing'],
    ['/:owner/:forge/blob/:branch/:path', 'File viewer'],
    ['/:owner/:forge/blame/:branch/:path', 'Blame'],
    ['/:owner/:forge/raw/:branch/:path', 'Raw file'],
    ['/:owner/:forge/edit/:branch/:path', 'Edit a file'],
    ['/:owner/:forge/new/:branch', 'Create a file'],
    ['/:owner/:forge/commits/:branch', 'Commit history'],
    ['/:owner/:forge/commit/:sha', 'Commit detail'],
    ['/:owner/:forge/compare/:base...:head', 'Branch comparison'],
    ['/:owner/:forge/issues', 'Issues (also /issues/closed, /issues/new, /issues/:n)'],
    ['/:owner/:forge/pulls', 'Pull requests (also /pulls/new, /pull/:n/:tab)'],
    ['/:owner/:forge/labels', 'Labels'],
    ['/:owner/:forge/milestones', 'Milestones'],
    ['/:owner/:forge/actions', 'Runs, workflows, artifacts and caches'],
    ['/:owner/:forge/projects', 'Forge project boards'],
    ['/:owner/:forge/wiki', 'Wiki (also /wiki/:slug and /wiki/:slug/_edit)'],
    ['/:owner/:forge/security', 'Overview, secrets, code, dependencies, advisories, policy'],
    ['/:owner/:forge/insights', 'Pulse, contributors, community, commits, frequency, dependencies, network, forks'],
    ['/:owner/:forge/discussions', 'Discussions (also /discussions/new and /discussions/:n)'],
    ['/:owner/:forge/packages', 'Packages'],
    ['/:owner/:forge/releases', 'Releases'],
    ['/:owner/:forge/tags', 'Tags'],
    ['/:owner/:forge/branches', 'Branches'],
    ['/:owner/:forge/stargazers', 'Who starred it'],
    ['/:owner/:forge/forks', 'Forks of it'],
    ['/:owner/:forge/settings', 'General, access, branches, actions, webhooks, deploy keys, secrets, environments, pages, danger'],
  ];
  return h2('Route reference') +
    p('Reserved words that can never be a username: ' + Object.keys(RESERVED).map(function (r) { return '<span class="mono">' + esc(r) + '</span>'; }).join(', ') + '.') +
    '<div class="card-tight">' + routes.map(function (r) {
      return '<div class="list-item"><div class="list-body"><div class="list-title mono">#' + esc(r[0]) + '</div>' +
        '<div class="list-meta">' + esc(r[1]) + '</div></div></div>';
    }).join('') + '</div>';
}

function dataSection() {
  return h2('Data & privacy') +
    ul([
      'Everything is stored under three <span class="mono">localStorage</span> keys in your browser. Clearing site data removes RedGet entirely.',
      'RedGet never contacts a server. There are no analytics, no fonts fetched from a CDN, no images from an external host and no external domains referenced anywhere in the markup, styles or scripts.',
      'Avatars are generated from your username as inline SVG — no image uploads leave the browser, and uploaded images are stored as data URLs.',
      'Secrets in forge settings keep only their name and update time; the value is discarded after saving.',
      'Marketplace installs, sessions and notifications are ordinary records you can delete.',
      'Exporting your data writes the whole database as a JSON file you control.',
    ]) +
    note('Because the key is the only credential, anyone who reads your localStorage or your exported JSON can sign in as you. Treat both as sensitive.');
}
