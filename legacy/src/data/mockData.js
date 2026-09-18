/**
 * RedGet — deterministic mock database.
 *
 * buildDatabase() generates the whole dataset from seeded pseudo-random numbers,
 * so a reload, a screenshot and two different browsers all see identical data.
 * Timestamps are relative to load time so "relative time" labels always look live.
 *
 * The shape stored in localStorage (redget:db:v4):
 *
 *   { version, currentLogin, users[], orgs[], teams[], memberships[], repos[],
 *     branches[], commits[], issues[], comments[], reactions[], labels[],
 *     milestones[], pullRequests[], reviews[], reviewThreads[], checks[],
 *     projects[], projectViews[], wikiPages[], wikiHistory[], workflows[],
 *     runs[], artifacts[], caches[], secrets[], variables[], runners[],
 *     environments[], deployments[], packages[], releases[], discussions[],
 *     notifications[], advisories[], dependabotAlerts[], codeScanningAlerts[],
 *     secretScanningAlerts[], traffic{}, stars[], watches[], forks[],
 *     follows[], pinned[], savedReplies[], gists[], codespaces[], topics[],
 *     marketplace[], events[], achievements[] }
 */

import {
  REDGET_CORE_TREE, SECONDARY_TREES, WIKI_PAGES, WIKI_SIDEBAR, WIKI_FOOTER,
  PR_DIFF_SOURCES, genericReadme, README_MD,
} from '../../data/files.js';
import { makeRandom, pick, pickMany, randomInt, shortId, hashString } from '../core/util.js';
import { STORAGE } from '../config.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * All generated timestamps hang off one reference instant so the dataset is
 * reproducible: the same anchor always produces byte-identical data, which is
 * what lets user mutations be stored as a small patch on top of a regenerated
 * seed (see /src/core/store.js). Defaults to midnight UTC today.
 */
let REF = defaultReferenceTime();

function defaultReferenceTime() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/** Read a persisted anchor from localStorage (called before the first build). */
export function prepareReferenceTime(storageKey = 'redget:anchor:v4') {
  try {
    const raw = globalThis.localStorage ? globalThis.localStorage.getItem(storageKey) : null;
    const parsed = raw ? Number(JSON.parse(raw)) : NaN;
    if (Number.isFinite(parsed)) { REF = parsed; return parsed; }
  } catch { /* storage unavailable — fall back to the default anchor */ }
  return REF;
}

/** Set (and optionally persist) a new anchor, then regenerate the dataset. */
export function applyReferenceTime(value = Date.now(), storageKey = 'redget:anchor:v4') {
  REF = Number.isFinite(value) ? value : defaultReferenceTime();
  try {
    if (globalThis.localStorage) globalThis.localStorage.setItem(storageKey, JSON.stringify(REF));
  } catch { /* ignore */ }
  return REF;
}

export function getReferenceTime() {
  return REF;
}

/** ISO timestamp `offsetMs` before the reference instant (negative = future). */
function ago(offsetMs) {
  return new Date(REF - offsetMs).toISOString();
}

function rngFor(seed) {
  return makeRandom(`redget:${seed}`);
}

/* ==========================================================================
   People and organizations
   ========================================================================== */

const USER_SEEDS = [
  { login: 'octored', name: 'Octavia Red', pronouns: 'she/her', bio: 'Founder of RedGet. I make forges crimson. Offline-first, keyboard-first, contrast-always.', company: '@redget-collective', location: 'Chișinău, MD', website: '/octored', email: 'octavia@redget.local', twitter: 'octored', mastodon: '@octored@redget.social', linkedin: 'octaviared', bluesky: 'octored.dev', followers: 4820, following: 213, status: { emoji: '🔴', message: 'Shipping the 4.3 release train', until: ago(-3 * DAY) }, sponsorable: true, verified: true, pro: true, achievements: ['Pull Shark', 'YOLO', 'Quickdraw', 'Heart On Your Sleeve', 'Open Sourcerer', 'Pair Extraordinaire'] },
  { login: 'crimsonfox', name: 'Vera Crimson', pronouns: 'she/they', bio: 'Maintainer of @crimson-collective. Rust, runners and reproducible builds.', company: '@crimson-collective', location: 'Berlin, DE', website: '/crimsonfox', email: 'vera@redget.local', twitter: 'crimsonfox', followers: 3110, following: 96, status: { emoji: '🦊', message: 'Reviewing the merge queue RFC' }, sponsorable: true, verified: true, achievements: ['Pull Shark', 'Starstruck', 'Open Sourcerer'] },
  { login: 'nightshade', name: 'Nox Nightshade', pronouns: 'he/him', bio: 'Diffs, blame and the geometry of code review.', company: '@redget-collective', location: 'Lisbon, PT', website: '/nightshade', followers: 1874, following: 61, verified: true, achievements: ['Pair Extraordinaire', 'Quickdraw'] },
  { login: 'velvetbyte', name: 'Iris Velvet', pronouns: 'she/her', bio: 'Markdown parser apologist. Writes the docs nobody reads and everybody needs.', company: '@crimson-collective', location: 'Toronto, CA', followers: 992, following: 140, achievements: ['Open Sourcerer'] },
  { login: 'scarletui', name: 'Sable Scarlet', pronouns: 'they/them', bio: 'Design systems: tokens, contrast ratios, focus rings. Accessibility is the feature.', company: '@crimson-collective', location: 'Seoul, KR', website: '/crimson-collective/crimson-ui', followers: 2410, following: 88, sponsorable: true, verified: true, achievements: ['Heart On Your Sleeve', 'Starstruck'] },
  { login: 'ember', name: 'Ash Ember', pronouns: 'he/him', bio: 'RedGet Actions. I break CI so you do not have to.', company: '@redget-collective', location: 'Austin, TX', followers: 1502, following: 203, achievements: ['Pull Shark'] },
  { login: 'ironvale', name: 'Rhea Ironvale', pronouns: 'she/her', bio: 'Security guild. Dependabot, code scanning, secret scanning, SBOMs.', company: '@redget-collective', location: 'Warsaw, PL', email: 'rhea@redget.local', followers: 1188, following: 44, verified: true, achievements: ['Open Sourcerer'] },
  { login: 'quill', name: 'Marcus Quill', pronouns: 'he/him', bio: 'Technical writer. Wikis, changelogs, release notes.', location: 'Dublin, IE', followers: 431, following: 118 },
  { login: 'zephyrine', name: 'Zeph Zephyrine', pronouns: 'she/her', bio: 'Performance. Virtualised lists, incremental parsing, 60fps or bust.', location: 'Bengaluru, IN', followers: 1760, following: 72, achievements: ['Quickdraw'] },
  { login: 'nova', name: 'Nikola Nova', pronouns: 'they/them', bio: 'Projects and roadmaps. Turning chaos into columns.', location: 'Amsterdam, NL', followers: 655, following: 190 },
  { login: 'garnet', name: 'Gil Garnet', pronouns: 'he/him', bio: 'Packages, registries and supply chain attestations.', company: '@crimson-collective', location: 'Melbourne, AU', followers: 388, following: 57 },
  { login: 'sanguine', name: 'Sol Sanguine', pronouns: 'she/her', bio: 'Front-end. Serverless rendering and edge caching.', location: 'São Paulo, BR', followers: 812, following: 133 },
  { login: 'vermilion', name: 'Vic Vermilion', pronouns: 'he/him', bio: 'Mobile layouts. If it does not work at 320px it does not work.', location: 'Nairobi, KE', followers: 276, following: 91 },
  { login: 'redget-bot', name: 'RedGet Bot', pronouns: 'it/its', bio: 'Automation account: dependabot, release drafter, stale bot.', company: '@redget-collective', type: 'bot', followers: 12, following: 0, verified: true },
];

const ORG_SEEDS = [
  {
    login: 'crimson-collective', name: 'Crimson Collective', description: 'An open source collective building the crimson toolchain: UI kit, static analyzer, runner and docs.',
    location: 'Distributed', website: '/crimson-collective', email: 'hello@redget.local', plan: 'enterprise',
    verified: true, sponsorable: true, followers: 9210, createdAt: ago(1420 * DAY),
  },
  {
    login: 'redget-collective', name: 'RedGet Collective', description: 'The RedGet platform organization. Core, CLI, docs and the community programme.',
    location: 'Chișinău, MD', website: '/redget-collective', email: 'team@redget.local', plan: 'enterprise',
    verified: true, sponsorable: true, followers: 15840, createdAt: ago(1980 * DAY),
  },
];

const TEAM_SEEDS = [
  { org: 'crimson-collective', name: 'Core maintainers', slug: 'core', description: 'Can merge to protected branches.', privacy: 'closed', members: ['crimsonfox', 'nightshade', 'scarletui'] },
  { org: 'crimson-collective', name: 'Design guild', slug: 'design', description: 'Tokens, components, contrast.', privacy: 'closed', members: ['scarletui', 'velvetbyte'] },
  { org: 'crimson-collective', name: 'Docs guild', slug: 'docs', description: 'Wiki, changelog, templates.', privacy: 'visible', members: ['velvetbyte', 'quill'] },
  { org: 'crimson-collective', name: 'Contributors', slug: 'contributors', description: 'Everyone with triage access.', privacy: 'visible', members: ['crimsonfox', 'ember', 'garnet', 'nova', 'sanguine', 'zephyrine'] },
  { org: 'redget-collective', name: 'Platform', slug: 'platform', description: 'RedGet Core and the CLI.', privacy: 'closed', members: ['octored', 'ember', 'zephyrine'] },
  { org: 'redget-collective', name: 'Security guild', slug: 'security', description: 'Advisories, scanning, response.', privacy: 'secret', members: ['ironvale', 'octored'] },
  { org: 'redget-collective', name: 'Community', slug: 'community', description: 'Discussions, sponsors, events.', privacy: 'visible', members: ['quill', 'nova', 'vermilion'] },
];

/* ==========================================================================
   Repositories
   ========================================================================== */

const REPO_SEEDS = [
  {
    owner: 'octored', name: 'redget-core',
    description: 'RedGet Core — the crimson-and-black source collaboration platform. Offline, accessible, themeable.',
    visibility: 'public', language: 'JavaScript', homepage: '/octored/redget-core/pages',
    topics: ['redget', 'crimson', 'accessibility', 'offline-first', 'design-system', 'javascript', 'spa'],
    stars: 12840, forks: 942, watchers: 318, openIssues: 0, license: 'MIT',
    createdAt: ago(820 * DAY), defaultBranch: 'main', hasWiki: true, hasPages: true, hasDiscussions: true, hasProjects: true,
    tree: REDGET_CORE_TREE, wiki: true, primary: true,
  },
  {
    owner: 'octored', name: 'redget-cli',
    description: 'rgt — the RedGet command line. Clone, review, merge and run workflows from the terminal.',
    visibility: 'public', language: 'Go', topics: ['cli', 'go', 'redget'],
    stars: 2411, forks: 187, watchers: 96, license: 'MIT', createdAt: ago(430 * DAY), defaultBranch: 'main',
    tree: null, hasWiki: false, hasDiscussions: false,
  },
  {
    owner: 'octored', name: 'dotfiles',
    description: 'Crimson terminal configuration: zsh, tmux, neovim and the RedGet theme.',
    visibility: 'private', language: 'Shell', topics: ['dotfiles', 'shell'],
    stars: 42, forks: 3, watchers: 2, license: null, createdAt: ago(1500 * DAY), defaultBranch: 'main', tree: null,
  },
  {
    owner: 'crimson-collective', name: 'crimson-ui',
    description: 'A crimson design system: tokens, components and documentation for RedGet surfaces.',
    visibility: 'public', language: 'Svelte', topics: ['design-system', 'svelte', 'tokens', 'accessibility'],
    stars: 3980, forks: 264, watchers: 143, license: 'MIT', createdAt: ago(610 * DAY), defaultBranch: 'main',
    tree: SECONDARY_TREES['crimson-ui'], hasWiki: true, hasDiscussions: true,
  },
  {
    owner: 'crimson-collective', name: 'redql',
    description: 'Static analysis queries for the RedGet code scanning surface. Written in Rust.',
    visibility: 'public', language: 'Rust', topics: ['static-analysis', 'rust', 'security', 'codeql-alternative'],
    stars: 1876, forks: 132, watchers: 88, license: 'Apache-2.0', createdAt: ago(520 * DAY), defaultBranch: 'main',
    tree: SECONDARY_TREES.redql, hasWiki: false,
  },
  {
    owner: 'crimson-collective', name: 'actions-runner',
    description: 'Self-hosted runner for RedGet Actions, with runner scale sets and larger runner profiles.',
    visibility: 'public', language: 'Go', topics: ['ci', 'runner', 'go', 'actions'],
    stars: 1204, forks: 211, watchers: 74, license: 'MIT', createdAt: ago(390 * DAY), defaultBranch: 'main',
    tree: SECONDARY_TREES['actions-runner'], hasWiki: true,
  },
  {
    owner: 'crimson-collective', name: 'crimson-docs',
    description: 'The RedGet documentation site: guides, API reference and the accessibility contract.',
    visibility: 'public', language: 'Markdown', topics: ['docs', 'markdown', 'accessibility'],
    stars: 604, forks: 88, watchers: 41, license: 'CC-BY-4.0', createdAt: ago(300 * DAY), defaultBranch: 'main',
    tree: null, hasWiki: true, hasPages: true,
  },
  {
    owner: 'redget-collective', name: 'platform',
    description: 'Internal platform repository: infrastructure, migrations and the deployment pipeline.',
    visibility: 'internal', language: 'TypeScript', topics: ['platform', 'infrastructure'],
    stars: 12, forks: 0, watchers: 24, license: null, createdAt: ago(700 * DAY), defaultBranch: 'main', tree: null,
  },
  {
    owner: 'redget-collective', name: 'redget-desktop',
    description: 'RedGet Desktop — a native client for browsing repositories, reviewing pull requests and running checks.',
    visibility: 'public', language: 'TypeScript', topics: ['desktop', 'electron', 'typescript'],
    stars: 2210, forks: 190, watchers: 120, license: 'MIT', createdAt: ago(260 * DAY), defaultBranch: 'main', tree: null,
    archived: false,
  },
];

const LANGUAGE_PALETTES = {
  JavaScript: { 'JavaScript': 71, 'CSS': 14, 'HTML': 9, 'Shell': 4, 'SQL': 2 },
  TypeScript: { 'TypeScript': 78, 'CSS': 12, 'HTML': 6, 'Shell': 4 },
  Go: { 'Go': 88, 'Shell': 7, 'Makefile': 5 },
  Rust: { 'Rust': 92, 'TOML': 5, 'Shell': 3 },
  Svelte: { 'Svelte': 54, 'JavaScript': 24, 'CSS': 18, 'HTML': 4 },
  Shell: { 'Shell': 74, 'Vim Script': 16, 'Makefile': 10 },
  Markdown: { 'Markdown': 88, 'HTML': 8, 'CSS': 4 },
};

const LANGUAGE_COLORS = {
  JavaScript: '#f0c04a', TypeScript: '#ff6b81', Go: '#79c0ff', Rust: '#e08a4b',
  Svelte: '#ff8b3d', CSS: '#ff4d5f', HTML: '#e34c26', Shell: '#7ee787',
  SQL: '#a5d6ff', Markdown: '#a29a9c', 'Vim Script': '#3fb950', Makefile: '#d29922',
  TOML: '#bc8cff', Python: '#79c0ff',
};

/* ==========================================================================
   Labels, milestones, discussions, advisories, packages, marketplace
   ========================================================================== */

const LABEL_SEEDS = [
  { name: 'bug', color: 'd61a2f', description: 'Something is broken' },
  { name: 'enhancement', color: '8b1220', description: 'New feature or request' },
  { name: 'documentation', color: '5c0912', description: 'Improvements or additions to documentation' },
  { name: 'good first issue', color: 'ff6b81', description: 'Good for newcomers' },
  { name: 'help wanted', color: 'ff9aa5', description: 'Extra attention is welcome' },
  { name: 'accessibility', color: 'a371f7', description: 'ARIA, keyboard, contrast, screen readers' },
  { name: 'performance', color: 'd29922', description: 'Faster rendering, smaller payloads' },
  { name: 'diff', color: 'ff4d5f', description: 'Diff rendering and review flows' },
  { name: 'ci', color: '3fb950', description: 'RedGet Actions and workflows' },
  { name: 'security', color: '82071e', description: 'Vulnerabilities, scanning, advisories' },
  { name: 'theming', color: 'bf3989', description: 'Tokens, themes, dark and light' },
  { name: 'mobile', color: '0969da', description: 'Responsive and touch behaviour' },
  { name: 'priority: high', color: 'cf222e', description: 'Fix before the next release' },
  { name: 'priority: low', color: '6e7781', description: 'Whenever there is time' },
  { name: 'wontfix', color: '4d5560', description: 'This will not be worked on' },
  { name: 'duplicate', color: '7a7478', description: 'This issue or pull request already exists' },
  { name: 'invalid', color: '57606a', description: 'This does not seem right' },
  { name: 'question', color: 'bc8cff', description: 'Further information is requested' },
  { name: 'dependencies', color: '2f81f7', description: 'Pull requests that update a dependency' },
  { name: 'regression', color: 'ff3d54', description: 'Broke something that used to work' },
];

const MILESTONE_SEEDS = [
  { title: '4.3 — Split diff & merge queue', description: 'Ship the paired split diff, the merge queue UI and the diff settings panel.', dueOn: ago(-12 * DAY), state: 'open' },
  { title: '4.2 — Crimson themes', description: 'Five themes, two of them high contrast, plus the theme switcher in the header.', dueOn: ago(60 * DAY), state: 'closed' },
  { title: 'Accessibility audit', description: 'Close every finding from the ARIA and contrast audit.', dueOn: ago(-40 * DAY), state: 'open' },
  { title: '5.0 — Projects v3', description: 'Roadmap view, iterations, custom fields and project insights.', dueOn: ago(-120 * DAY), state: 'open' },
];

const ISSUE_SEEDS = [
  { title: 'Split diff misaligns paired deletions on long files', labels: ['bug', 'diff', 'priority: high'], comments: 7, reactions: { '+1': 12, '-1': 0, heart: 4, hooray: 2 }, milestone: 0, state: 'open' },
  { title: 'Command palette should index repository settings sections', labels: ['enhancement', 'good first issue'], comments: 4, reactions: { '+1': 8 }, state: 'open' },
  { title: 'Blame view repeats the same commit for adjacent lines', labels: ['bug', 'regression'], comments: 3, reactions: { '+1': 5 }, milestone: 0, state: 'open' },
  { title: 'High contrast theme: focus ring disappears on the branch selector', labels: ['accessibility', 'theming', 'priority: high'], comments: 6, reactions: { '+1': 15, heart: 3 }, state: 'open' },
  { title: 'Add merge queue with configurable concurrency', labels: ['enhancement', 'ci'], comments: 11, reactions: { '+1': 21, hooray: 6, rocket: 4 }, milestone: 0, state: 'open' },
  { title: 'File finder should support fuzzy matching on directory segments', labels: ['enhancement', 'performance'], comments: 5, reactions: { '+1': 9 }, state: 'open' },
  { title: 'Mobile: repository tab bar clips the Settings tab at 360px', labels: ['bug', 'mobile'], comments: 2, reactions: { '+1': 4 }, state: 'open' },
  { title: 'Secret scanning custom patterns are not persisted across reloads', labels: ['bug', 'security'], comments: 4, reactions: { '+1': 6 }, state: 'open' },
  { title: 'Docs: publish the HTML structure contract for every component', labels: ['documentation', 'accessibility'], comments: 3, reactions: { '+1': 11, heart: 5 }, state: 'closed' },
  { title: 'Support AsciiDoc and reStructuredText in the wiki', labels: ['enhancement', 'documentation'], comments: 8, reactions: { '+1': 14 }, state: 'closed' },
  { title: 'Toast announcements are read twice by screen readers', labels: ['accessibility', 'bug'], comments: 5, reactions: { '+1': 7 }, state: 'closed' },
  { title: 'Diff toolbar should be sticky on long pull requests', labels: ['enhancement', 'diff'], comments: 2, reactions: { '+1': 6 }, state: 'open' },
  { title: 'Relative time ignores the user-selected time zone', labels: ['bug'], comments: 3, reactions: { '+1': 5 }, state: 'closed' },
  { title: 'Add a "Copy permalink" action to blob line numbers', labels: ['enhancement', 'good first issue'], comments: 6, reactions: { '+1': 10 }, state: 'open' },
  { title: 'Actions log viewer: virtualise for runs with 20k+ lines', labels: ['performance', 'ci'], comments: 9, reactions: { '+1': 13, rocket: 3 }, state: 'open' },
  { title: 'Project roadmap view does not group by iteration', labels: ['bug'], comments: 4, reactions: { '+1': 3 }, state: 'open' },
  { title: 'Keyboard: "y" should expand the focused diff section', labels: ['enhancement', 'accessibility'], comments: 2, reactions: { '+1': 4 }, state: 'open' },
  { title: 'README anchors collide for headings with identical text', labels: ['bug', 'documentation'], comments: 3, reactions: { '+1': 2 }, state: 'closed' },
  { title: 'Dependabot grouped updates should respect semver ranges', labels: ['enhancement', 'dependencies', 'security'], comments: 7, reactions: { '+1': 8 }, state: 'open' },
  { title: 'Add CODEOWNERS-aware reviewer suggestions', labels: ['enhancement'], comments: 5, reactions: { '+1': 12, heart: 2 }, state: 'open' },
  { title: 'Empty state for a repository with no commits links to a dead route', labels: ['bug'], comments: 2, reactions: { '+1': 3 }, state: 'closed' },
  { title: 'Issue forms: required dropdowns accept an empty submission', labels: ['bug'], comments: 4, reactions: { '+1': 6 }, state: 'open' },
  { title: 'Add a status page and maintenance mode route', labels: ['enhancement'], comments: 3, reactions: { '+1': 5 }, state: 'closed' },
  { title: 'Notifications inbox: bulk archive selection', labels: ['enhancement'], comments: 6, reactions: { '+1': 9 }, state: 'open' },
  { title: 'Compare view should render three-dot diffs', labels: ['enhancement', 'diff'], comments: 4, reactions: { '+1': 7 }, state: 'open' },
  { title: 'Crimson theme: diff deletion background is too close to the border', labels: ['theming', 'accessibility'], comments: 3, reactions: { '+1': 4 }, state: 'closed' },
  { title: 'Search: support repo: and language: qualifiers', labels: ['enhancement'], comments: 8, reactions: { '+1': 16 }, state: 'open' },
  { title: 'Wiki history should diff two revisions', labels: ['enhancement', 'documentation'], comments: 2, reactions: { '+1': 5 }, state: 'open' },
  { title: 'Actions: re-run failed jobs only', labels: ['enhancement', 'ci'], comments: 5, reactions: { '+1': 18, hooray: 4 }, state: 'closed' },
  { title: 'Blob view: wrap long lines toggle is not remembered', labels: ['bug'], comments: 2, reactions: { '+1': 3 }, state: 'closed' },
  { title: 'Add release asset upload simulation', labels: ['enhancement'], comments: 3, reactions: { '+1': 6 }, state: 'open' },
  { title: 'Profile contributions heatmap should show a year tooltip', labels: ['enhancement'], comments: 4, reactions: { '+1': 8 }, state: 'open' },
  { title: 'Organization settings: audit log filters are ignored', labels: ['bug'], comments: 3, reactions: { '+1': 2 }, state: 'open' },
  { title: 'Pull request checks tab should group by workflow', labels: ['enhancement', 'ci'], comments: 5, reactions: { '+1': 7 }, state: 'open' },
  { title: 'Support issue transfer between repositories', labels: ['enhancement'], comments: 6, reactions: { '+1': 11 }, state: 'closed' },
  { title: 'Locked conversations should hide the composer entirely', labels: ['accessibility', 'bug'], comments: 2, reactions: { '+1': 4 }, state: 'closed' },
  { title: 'Add a "Pin issue" action for maintainers', labels: ['enhancement'], comments: 3, reactions: { '+1': 9 }, state: 'closed' },
  { title: 'Diff annotations overlap the gutter on narrow screens', labels: ['bug', 'mobile', 'diff'], comments: 4, reactions: { '+1': 5 }, state: 'open' },
  { title: 'Secrets UI should show which environments can access a secret', labels: ['enhancement', 'security'], comments: 3, reactions: { '+1': 6 }, state: 'open' },
  { title: 'Suggested change blocks should batch into one commit', labels: ['enhancement', 'diff'], comments: 7, reactions: { '+1': 14 }, state: 'open' },
  { title: 'Insights: traffic page needs a date range selector', labels: ['enhancement'], comments: 2, reactions: { '+1': 4 }, state: 'open' },
  { title: 'Rate limit page should explain secondary limits', labels: ['documentation'], comments: 3, reactions: { '+1': 5 }, state: 'closed' },
];

const PR_SEEDS = [
  { title: 'Pair deletions with additions in the split diff view', branch: 'feature/split-diff-alignment', labels: ['diff', 'enhancement'], draft: false, state: 'open', reviews: { approve: 1, changes: 1, comment: 1 }, checks: 'mixed', files: 3, additions: 148, deletions: 32, comments: 9, source: 'feature/split-diff-alignment' },
  { title: 'Fix blame grouping so adjacent lines collapse', branch: 'fix/blame-grouping', labels: ['bug', 'regression'], draft: false, state: 'open', reviews: { approve: 2 }, checks: 'pass', files: 1, additions: 22, deletions: 6, comments: 3, source: 'fix/blame-grouping' },
  { title: 'Add merge queue settings to the branches page', branch: 'feature/merge-queue', labels: ['enhancement', 'ci'], draft: false, state: 'open', reviews: { approve: 1, comment: 2 }, checks: 'pending', files: 4, additions: 310, deletions: 41, comments: 12 },
  { title: 'Restore the focus ring in the high contrast themes', branch: 'fix/contrast-focus-ring', labels: ['accessibility', 'theming'], draft: false, state: 'open', reviews: { approve: 3 }, checks: 'pass', files: 2, additions: 44, deletions: 12, comments: 5 },
  { title: 'WIP: virtualise the Actions log viewer', branch: 'perf/log-virtualisation', labels: ['performance', 'ci'], draft: true, state: 'open', reviews: {}, checks: 'pending', files: 5, additions: 512, deletions: 88, comments: 7 },
  { title: 'Index repository settings in the command palette', branch: 'feature/palette-settings', labels: ['enhancement'], draft: false, state: 'open', reviews: { approve: 1 }, checks: 'pass', files: 2, additions: 96, deletions: 8, comments: 4 },
  { title: 'Docs: publish the HTML structure contract', branch: 'docs/html-contract', labels: ['documentation', 'accessibility'], draft: false, state: 'merged', reviews: { approve: 2 }, checks: 'pass', files: 3, additions: 402, deletions: 0, comments: 6 },
  { title: 'Support AsciiDoc and reStructuredText in the wiki', branch: 'feature/wiki-formats', labels: ['documentation', 'enhancement'], draft: false, state: 'merged', reviews: { approve: 2, comment: 1 }, checks: 'pass', files: 4, additions: 288, deletions: 22, comments: 8 },
  { title: 'Announce toasts exactly once for screen readers', branch: 'fix/toast-live-region', labels: ['accessibility', 'bug'], draft: false, state: 'merged', reviews: { approve: 1 }, checks: 'pass', files: 1, additions: 18, deletions: 9, comments: 2 },
  { title: 'Respect the user time zone in relative timestamps', branch: 'fix/timezone-relative', labels: ['bug'], draft: false, state: 'merged', reviews: { approve: 2 }, checks: 'pass', files: 2, additions: 61, deletions: 27, comments: 3 },
  { title: 'Re-run failed jobs only in workflow runs', branch: 'feature/rerun-failed', labels: ['ci', 'enhancement'], draft: false, state: 'merged', reviews: { approve: 3 }, checks: 'pass', files: 3, additions: 174, deletions: 30, comments: 5 },
  { title: 'Group pull request checks by workflow', branch: 'feature/grouped-checks', labels: ['ci', 'enhancement'], draft: false, state: 'closed', reviews: { changes: 2 }, checks: 'fail', files: 2, additions: 88, deletions: 51, comments: 11 },
  { title: 'Add three-dot compare diffs', branch: 'feature/three-dot-compare', labels: ['diff', 'enhancement'], draft: false, state: 'open', reviews: {}, checks: 'queued', files: 3, additions: 205, deletions: 14, comments: 2 },
  { title: 'Batch suggested changes into a single commit', branch: 'feature/suggestion-batch', labels: ['diff', 'enhancement'], draft: true, state: 'open', reviews: { comment: 2 }, checks: 'pending', files: 4, additions: 260, deletions: 44, comments: 9 },
  { title: 'Bump the runner image to node:20-alpine', branch: 'deps/node-20', labels: ['dependencies'], draft: false, state: 'merged', reviews: { approve: 1 }, checks: 'pass', files: 1, additions: 3, deletions: 3, comments: 1 },
  { title: 'Remove the legacy blue palette tokens', branch: 'chore/drop-blue', labels: ['theming'], draft: false, state: 'merged', reviews: { approve: 2 }, checks: 'pass', files: 2, additions: 12, deletions: 148, comments: 4 },
  { title: 'Add the repository dispatch placeholder event', branch: 'feature/repo-dispatch', labels: ['ci'], draft: false, state: 'closed', reviews: { changes: 1 }, checks: 'fail', files: 2, additions: 74, deletions: 6, comments: 7 },
  { title: 'Crimson identity pass on the pricing page', branch: 'design/pricing-crimson', labels: ['theming', 'enhancement'], draft: false, state: 'open', reviews: { approve: 1, comment: 1 }, checks: 'pass', files: 3, additions: 190, deletions: 120, comments: 6 },
];

const COMMIT_MESSAGE_SEEDS = [
  'feat(diff): pair deletions with additions in split view',
  'fix(blame): collapse adjacent lines from the same commit',
  'feat(ci): add merge_group trigger to the CI workflow',
  'style(tokens): raise focus ring contrast in high contrast themes',
  'docs(readme): document the five themes and the shortcut table',
  'perf(list): virtualise the file finder results',
  'refactor(router): extract pattern compilation',
  'feat(palette): index settings sections',
  'fix(i18n): use the selected time zone for relative dates',
  'feat(wiki): support AsciiDoc and reStructuredText',
  'chore(deps): bump runner base image to node:20-alpine',
  'test(validate): assert every internal route resolves',
  'feat(actions): re-run failed jobs only',
  'fix(a11y): announce toasts exactly once',
  'feat(releases): simulate asset upload with progress',
  'docs(wiki): add the accessibility contract page',
  'feat(projects): roadmap grouped by iteration',
  'fix(mobile): let the repository tab bar scroll at 360px',
  'feat(security): persist secret scanning custom patterns',
  'chore(repo): update CODEOWNERS for the docs guild',
];

const DISCUSSION_SEEDS = [
  { title: 'Welcome to RedGet Core discussions', category: 'Announcements', comments: 14, upvotes: 42, answered: true },
  { title: 'Should the default theme be dark or crimson?', category: 'Ideas', comments: 38, upvotes: 96, answered: false },
  { title: 'RFC: merge queue semantics', category: 'RFC', comments: 22, upvotes: 31, answered: true },
  { title: 'How do I reset the local demo data?', category: 'Q&A', comments: 6, upvotes: 11, answered: true },
  { title: 'Show and tell: my crimson neovim setup', category: 'Show and tell', comments: 19, upvotes: 58, answered: false },
  { title: 'Accessibility audit findings — March', category: 'Announcements', comments: 9, upvotes: 24, answered: false },
  { title: 'Poll: which wiki format do you actually use?', category: 'Polls', comments: 27, upvotes: 15, answered: false },
];

const PACKAGE_SEEDS = [
  { name: 'redget-core', type: 'npm', downloads: 128402, latest: '4.2.0', visibility: 'public' },
  { name: 'crimson-ui', type: 'npm', downloads: 48211, latest: '1.8.3', visibility: 'public' },
  { name: 'redql', type: 'cargo', downloads: 9120, latest: '0.9.4', visibility: 'public' },
  { name: 'actions-runner', type: 'docker', downloads: 33110, latest: '2.318.0', visibility: 'public' },
  { name: 'redget-cli', type: 'go', downloads: 21884, latest: '1.14.2', visibility: 'public' },
  { name: 'platform-internal', type: 'npm', downloads: 402, latest: '0.0.0-internal.7', visibility: 'internal' },
  { name: 'crimson-docs', type: 'docker', downloads: 1284, latest: '3.0.1', visibility: 'private' },
];

const MARKETPLACE_SEEDS = [
  { slug: 'crimson-lint', name: 'Crimson Lint', publisher: 'crimson-collective', category: 'Code quality', installs: 12840, verified: true, description: 'Opinionated linting with crimson-themed annotations on every pull request.' },
  { slug: 'redql-scan', name: 'RedQL Code Scanning', publisher: 'crimson-collective', category: 'Security', installs: 9210, verified: true, description: 'Static analysis queries that post code scanning alerts to the Security tab.' },
  { slug: 'merge-guard', name: 'Merge Guard', publisher: 'ironvale', category: 'Continuous integration', installs: 5510, verified: false, description: 'Branch protection as code with a merge queue and required deployments.' },
  { slug: 'release-notes', name: 'Release Notes Drafter', publisher: 'quill', category: 'Release management', installs: 8802, verified: true, description: 'Drafts release notes from conventional commits and linked pull requests.' },
  { slug: 'a11y-audit', name: 'Accessibility Audit', publisher: 'scarletui', category: 'Code review', installs: 4310, verified: true, description: 'Runs an ARIA and contrast audit on every changed route and comments inline.' },
  { slug: 'dependabot-groups', name: 'Dependency Grouper', publisher: 'garnet', category: 'Dependency management', installs: 3120, verified: false, description: 'Groups Dependabot updates by semver range and ecosystem.' },
  { slug: 'crimson-theme', name: 'Crimson Theme Pack', publisher: 'scarletui', category: 'Customization', installs: 15200, verified: true, description: 'Five themes for the RedGet web UI, exported as design tokens.' },
  { slug: 'wiki-sync', name: 'Wiki Sync', publisher: 'velvetbyte', category: 'Documentation', installs: 1902, verified: false, description: 'Mirrors repository markdown into the wiki on every merge to main.' },
];

const TOPIC_SEEDS = [
  { name: 'redget', description: 'Everything built on the RedGet platform.' },
  { name: 'crimson', description: 'Red-and-black visual identity work.' },
  { name: 'accessibility', description: 'ARIA, keyboard, contrast and screen reader support.' },
  { name: 'offline-first', description: 'Apps that work with no network at all.' },
  { name: 'design-system', description: 'Tokens, components and documentation.' },
  { name: 'javascript', description: 'The language of the web platform.' },
  { name: 'typescript', description: 'Typed JavaScript at any scale.' },
  { name: 'rust', description: 'Memory safety without a garbage collector.' },
  { name: 'go', description: 'Simple, fast, concurrent.' },
  { name: 'ci', description: 'Continuous integration and delivery.' },
  { name: 'security', description: 'Vulnerabilities, scanning and supply chain.' },
  { name: 'spa', description: 'Single page applications and client routing.' },
  { name: 'markdown', description: 'Plain text formatting.' },
  { name: 'svelte', description: 'Cybernetically enhanced web apps.' },
  { name: 'docs', description: 'Documentation sites and wikis.' },
  { name: 'cli', description: 'Command line tools.' },
  { name: 'runner', description: 'Self-hosted build agents.' },
  { name: 'static-analysis', description: 'Find defects before they ship.' },
  { name: 'theming', description: 'Dark, light, high contrast and everything crimson.' },
  { name: 'mobile', description: 'Responsive layouts and touch interaction.' },
  { name: 'dependencies', description: 'Package management and updates.' },
  { name: 'performance', description: 'Faster rendering and smaller payloads.' },
];

const GIST_SEEDS = [
  { description: 'Crimson terminal palette for tmux', files: ['crimson.tmux.conf'], public: true, comments: 4, stars: 38 },
  { description: 'One-liner: validate every internal route in a static site', files: ['routes.mjs'], public: true, comments: 2, stars: 91 },
  { description: 'Diff of the token rename (blue → crimson)', files: ['tokens.patch'], public: false, comments: 0, stars: 3 },
  { description: 'Neovim statusline in red and black', files: ['statusline.lua'], public: true, comments: 11, stars: 142 },
  { description: 'Snippet: focus trap without a library', files: ['focus-trap.js'], public: true, comments: 6, stars: 208 },
];

const ADVISORY_SEEDS = [
  {
    id: 'RGSA-2026-0007', summary: 'Markdown renderer allowed attribute injection through link titles',
    severity: 'high', state: 'published', cvss: 7.4, cve: 'CVE-2026-1043',
    package: 'redget-core', vulnerableRange: '>= 4.0.0, < 4.1.2', patched: '4.1.2',
    publishedAt: ago(48 * DAY), credits: ['ironvale', 'octored'],
    description: 'The markdown renderer concatenated a link title into an HTML attribute without escaping double quotes. A crafted README could inject additional attributes into an anchor element.\n\n## Impact\n\nAttribute injection only — no script execution was possible because event handler attributes are stripped. Affected surfaces: README rendering, wiki pages and comment bodies.\n\n## Patches\n\nVersion 4.1.2 escapes titles through the same code path as link text.\n\n## Workarounds\n\nDisable markdown rendering for untrusted repositories via Settings → Features.',
  },
  {
    id: 'RGSA-2026-0004', summary: 'Route matcher accepted encoded separators, bypassing repository visibility checks',
    severity: 'critical', state: 'published', cvss: 9.1, cve: 'CVE-2026-0881',
    package: 'redget-core', vulnerableRange: '< 4.0.6', patched: '4.0.6',
    publishedAt: ago(96 * DAY), credits: ['ironvale'],
    description: 'Percent-encoded slashes in a pathname were decoded before route matching, which allowed a crafted URL to match a public route while resolving a private entity.\n\n## Impact\n\nDisclosure of private repository metadata (name, description, star count).\n\n## Patches\n\nDecoding now happens after matching, segment by segment.',
  },
  {
    id: 'RGSA-2026-0011', summary: 'Prototype pollution through the settings merge helper',
    severity: 'moderate', state: 'draft', cvss: 5.3, cve: null,
    package: 'redget-core', vulnerableRange: '>= 4.1.0, < 4.2.0', patched: '4.2.0',
    publishedAt: ago(9 * DAY), credits: ['nightshade'],
    description: 'mergeDeep() accepted `__proto__` as a key when merging a parsed preferences object. A local attacker could escalate a preference write into a global property.',
  },
];

const DEPENDABOT_SEEDS = [
  { package: 'node-fetch', ecosystem: 'npm', severity: 'high', advisory: 'GHSA-r683-j2x4-v87g', vulnerable: '< 2.6.7', patched: '2.6.7', manifest: 'package.json', state: 'open', introduced: ago(21 * DAY), cvss: 8.1 },
  { package: 'semver', ecosystem: 'npm', severity: 'moderate', advisory: 'GHSA-c2qf-rxjj-qqgw', vulnerable: '< 7.5.2', patched: '7.5.2', manifest: 'package.json', state: 'open', introduced: ago(40 * DAY), cvss: 5.3 },
  { package: 'cross-spawn', ecosystem: 'npm', severity: 'high', advisory: 'GHSA-3xgq-45jj-v275', vulnerable: '< 7.0.5', patched: '7.0.5', manifest: 'package.json', state: 'dismissed', introduced: ago(74 * DAY), cvss: 7.5 },
  { package: 'regex', ecosystem: 'cargo', severity: 'moderate', advisory: 'RUSTSEC-2025-0054', vulnerable: '< 1.10.6', patched: '1.10.6', manifest: 'redql/Cargo.toml', state: 'open', introduced: ago(12 * DAY), cvss: 6.5 },
  { package: 'golang.org/x/net', ecosystem: 'go', severity: 'critical', advisory: 'GO-2025-3421', vulnerable: '< 0.33.0', patched: '0.33.0', manifest: 'go.mod', state: 'fixed', introduced: ago(120 * DAY), cvss: 9.4 },
  { package: 'openssl', ecosystem: 'docker', severity: 'low', advisory: 'GHSA-2mxp-3q64-3r4c', vulnerable: '< 3.0.13', patched: '3.0.13', manifest: 'Dockerfile', state: 'open', introduced: ago(5 * DAY), cvss: 3.7 },
];

const CODE_SCANNING_SEEDS = [
  { tool: 'redql', rule: 'js/xss-through-attribute', severity: 'high', message: 'Unescaped value assigned to an HTML attribute.', path: 'src/components/markdown.js', line: 214, state: 'open', introduced: ago(31 * DAY), cwe: 'CWE-79' },
  { tool: 'redql', rule: 'js/prototype-pollution', severity: 'medium', message: 'Object merge trusts a parsed JSON key.', path: 'src/core/store.js', line: 88, state: 'fixed', introduced: ago(120 * DAY), cwe: 'CWE-1321' },
  { tool: 'redql', rule: 'js/unused-import', severity: 'low', message: 'Imported binding is never referenced.', path: 'src/components/diff.js', line: 31, state: 'open', introduced: ago(6 * DAY), cwe: null },
  { tool: 'crimson-lint', rule: 'a11y/missing-label', severity: 'medium', message: 'Interactive control has no accessible name.', path: 'src/components/header.js', line: 402, state: 'dismissed', introduced: ago(58 * DAY), cwe: 'CWE-1050' },
  { tool: 'redql', rule: 'js/insecure-random', severity: 'low', message: 'Math.random used where a CSPRNG is expected.', path: 'src/core/util.js', line: 62, state: 'open', introduced: ago(14 * DAY), cwe: 'CWE-338' },
  { tool: 'redql', rule: 'js/path-injection', severity: 'high', message: 'User-controlled path joined without normalisation.', path: 'src/pages/repoCode.js', line: 118, state: 'open', introduced: ago(2 * DAY), cwe: 'CWE-22' },
];

const SECRET_SCANNING_SEEDS = [
  { type: 'redget_deploy_token', provider: 'RedGet', state: 'open', introduced: ago(3 * DAY), path: 'scripts/deploy.sh', line: 12, resolution: null, publiclyLeaked: false, multiUser: false },
  { type: 'redget_personal_access_token', provider: 'RedGet', state: 'resolved', introduced: ago(88 * DAY), path: '.redget/config.yml', line: 40, resolution: 'revoked', publiclyLeaked: true, multiUser: false },
  { type: 'generic_api_key', provider: 'Custom pattern', state: 'open', introduced: ago(11 * DAY), path: 'data/demo.json', line: 7, resolution: null, publiclyLeaked: false, multiUser: true },
  { type: 'cloud_storage_credentials', provider: 'RedGet Cloud', state: 'dismissed', introduced: ago(140 * DAY), path: 'tools/publish.mjs', line: 33, resolution: 'used_in_tests', publiclyLeaked: false, multiUser: false },
];

const RUNNER_SEEDS = [
  { name: 'redget-runner-01', labels: ['self-hosted', 'linux', 'x64', 'crimson'], status: 'idle', version: '2.318.0', os: 'Ubuntu 24.04', busy: false },
  { name: 'redget-runner-02', labels: ['self-hosted', 'linux', 'arm64'], status: 'active', version: '2.318.0', os: 'Ubuntu 24.04', busy: true },
  { name: 'mac-mini-crimson', labels: ['self-hosted', 'macOS', 'arm64'], status: 'offline', version: '2.317.1', os: 'macOS 15', busy: false },
  { name: 'windows-builder', labels: ['self-hosted', 'windows', 'x64', 'gpu'], status: 'idle', version: '2.318.0', os: 'Windows Server 2025', busy: false },
  { name: 'larger-8core', labels: ['larger-runner', 'linux', 'x64', '8-core'], status: 'idle', version: '2.318.0', os: 'Ubuntu 24.04', busy: false },
];

const ENVIRONMENT_SEEDS = [
  { name: 'production', url: '/octored/redget-core/deployments/production', protectionRules: ['Required reviewers', 'Wait timer (5 minutes)', 'Deployment branches (main only)'], secrets: 4, variables: 2 },
  { name: 'staging', url: '/octored/redget-core/deployments/staging', protectionRules: ['Wait timer (0 minutes)'], secrets: 3, variables: 3 },
  { name: 'preview', url: '/octored/redget-core/deployments/preview', protectionRules: [], secrets: 1, variables: 1 },
];

const SECRET_SEEDS = [
  { name: 'REDGET_DEPLOY_TOKEN', scope: 'repository', updatedAt: ago(12 * DAY), environments: [] },
  { name: 'REGISTRY_USERNAME', scope: 'repository', updatedAt: ago(41 * DAY), environments: [] },
  { name: 'REGISTRY_PASSWORD', scope: 'repository', updatedAt: ago(41 * DAY), environments: [] },
  { name: 'ATTESTATION_KEY', scope: 'environment', updatedAt: ago(6 * DAY), environments: ['production'] },
  { name: 'STAGING_URL', scope: 'environment', updatedAt: ago(6 * DAY), environments: ['staging'] },
  { name: 'ORG_SIGNING_KEY', scope: 'organization', updatedAt: ago(80 * DAY), environments: [] },
  { name: 'DEPENDABOT_NPM_TOKEN', scope: 'dependabot', updatedAt: ago(22 * DAY), environments: [] },
  { name: 'CODESPACES_BUILD_SECRET', scope: 'codespaces', updatedAt: ago(30 * DAY), environments: [] },
];

const VARIABLE_SEEDS = [
  { name: 'NODE_VERSION', value: '20', scope: 'repository', updatedAt: ago(20 * DAY) },
  { name: 'REDGET_THEME', value: 'dark', scope: 'repository', updatedAt: ago(20 * DAY) },
  { name: 'DEPLOY_TARGET', value: 'static', scope: 'repository', updatedAt: ago(9 * DAY) },
  { name: 'ORG_TENANT', value: 'crimson-collective', scope: 'organization', updatedAt: ago(60 * DAY) },
];

const WEBHOOK_SEEDS = [
  { url: '/hooks/redget-core/ci', contentType: 'json', events: ['push', 'pull_request', 'workflow_run'], active: true, ssl: true, lastDelivery: ago(2 * HOUR), code: 200 },
  { url: '/hooks/redget-core/release', contentType: 'json', events: ['release', 'create'], active: true, ssl: true, lastDelivery: ago(3 * DAY), code: 200 },
  { url: '/hooks/redget-core/audit', contentType: 'form', events: ['*'], active: false, ssl: false, lastDelivery: ago(31 * DAY), code: 502 },
];

const PROJECT_SEEDS = [
  {
    id: 'p1', number: 1, title: 'RedGet 4.3 release train', description: 'Everything that must land before the 4.3 cut.', visibility: 'public', closed: false,
    fields: [
      { id: 'f-title', name: 'Title', type: 'title' },
      { id: 'f-status', name: 'Status', type: 'single_select', options: [{ id: 's-backlog', name: 'Backlog', color: 'gray' }, { id: 's-todo', name: 'Todo', color: 'accent' }, { id: 's-progress', name: 'In Progress', color: 'attention' }, { id: 's-review', name: 'In Review', color: 'done' }, { id: 's-done', name: 'Done', color: 'success' }] },
      { id: 'f-priority', name: 'Priority', type: 'single_select', options: [{ id: 'p-low', name: 'Low', color: 'gray' }, { id: 'p-med', name: 'Medium', color: 'attention' }, { id: 'p-high', name: 'High', color: 'danger' }] },
      { id: 'f-iteration', name: 'Iteration', type: 'iteration', duration: 14, start: ago(28 * DAY) },
      { id: 'f-effort', name: 'Effort', type: 'number' },
      { id: 'f-notes', name: 'Notes', type: 'text' },
    ],
    views: [
      { id: 'v-board', name: 'Board', layout: 'board', groupBy: 'f-status', sortBy: 'priority', filter: '' },
      { id: 'v-table', name: 'All items', layout: 'table', groupBy: null, sortBy: 'updated', filter: '' },
      { id: 'v-roadmap', name: 'Roadmap', layout: 'roadmap', groupBy: 'f-iteration', sortBy: 'start', filter: '' },
      { id: 'v-mine', name: 'Assigned to me', layout: 'table', groupBy: null, sortBy: 'priority', filter: 'assignee:@me' },
    ],
  },
  {
    id: 'p2', number: 2, title: 'Accessibility audit', description: 'Findings from the ARIA, contrast and keyboard audit.', visibility: 'public', closed: false,
    fields: [
      { id: 'f-title', name: 'Title', type: 'title' },
      { id: 'f-status', name: 'Status', type: 'single_select', options: [{ id: 's-backlog', name: 'Backlog', color: 'gray' }, { id: 's-todo', name: 'Todo', color: 'accent' }, { id: 's-done', name: 'Done', color: 'success' }] },
      { id: 'f-wcag', name: 'WCAG criterion', type: 'text' },
    ],
    views: [
      { id: 'v-board', name: 'Board', layout: 'board', groupBy: 'f-status', sortBy: 'priority', filter: '' },
      { id: 'v-table', name: 'Findings', layout: 'table', groupBy: null, sortBy: 'updated', filter: '' },
    ],
  },
];

const ACHIEVEMENT_SEEDS = [
  { id: 'pull-shark', name: 'Pull Shark', description: 'Opened a pull request that was merged.', icon: 'git-pull-request', tiers: [2, 16, 128] },
  { id: 'quickdraw', name: 'Quickdraw', description: 'Closed an issue or pull request within 5 minutes of opening it.', icon: 'zap', tiers: [1] },
  { id: 'yolo', name: 'YOLO', description: 'Merged your own pull request without review.', icon: 'rocket', tiers: [1] },
  { id: 'galaxy-brain', name: 'Galaxy Brain', description: 'Answered a discussion.', icon: 'light-bulb', tiers: [2, 4] },
  { id: 'heart-on-sleeve', name: 'Heart On Your Sleeve', description: 'Reacted to a public issue or pull request.', icon: 'heart', tiers: [2, 16] },
  { id: 'open-sourcerer', name: 'Open Sourcerer', description: 'Maintained a public repository.', icon: 'repo', tiers: [1, 4] },
  { id: 'pair-extraordinaire', name: 'Pair Extraordinaire', description: 'Co-authored a merged pull request.', icon: 'people', tiers: [2, 16] },
  { id: 'starstruck', name: 'Starstruck', description: 'Created a repository with 16+ stars.', icon: 'star', tiers: [16, 128, 512] },
];

/* ==========================================================================
   Builders
   ========================================================================== */

function buildUsers() {
  return USER_SEEDS.map((seed) => {
    const rng = rngFor(`user:${seed.login}`);
    return {
      id: `u-${seed.login}`,
      login: seed.login,
      name: seed.name,
      type: seed.type || 'user',
      pronouns: seed.pronouns || null,
      bio: seed.bio || '',
      company: seed.company || null,
      location: seed.location || null,
      website: seed.website || null,
      email: seed.email || null,
      twitter: seed.twitter || null,
      mastodon: seed.mastodon || null,
      linkedin: seed.linkedin || null,
      bluesky: seed.bluesky || null,
      orcid: null,
      status: seed.status || null,
      followers: seed.followers != null ? seed.followers : randomInt(rng, 4, 900),
      following: seed.following != null ? seed.following : randomInt(rng, 3, 400),
      sponsorable: Boolean(seed.sponsurable),
      verified: Boolean(seed.verified),
      pro: Boolean(seed.pro),
      achievements: seed.achievements || [],
      createdAt: ago(randomInt(rng, 400, 2600) * DAY),
      contributionCount: 0,
      longestStreak: 0,
      currentStreak: 0,
    };
  });
}

function buildContributions(seed) {
  const rng = rngFor(`contrib:${seed}`);
  const weeks = 53;
  const days = weeks * 7;
  const out = [];
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  // Align to the most recent Sunday.
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - (weeks - 1) * 7);
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const bias = weekend ? 0.35 : 1;
    const roll = rng();
    let count = 0;
    if (roll > 0.42 * (1 / bias)) count = Math.max(1, Math.round((rng() ** 1.6) * 14 * bias));
    if (roll > 0.965) count = Math.round(count * 2.4) + 3;
    out.push({ date: date.toISOString().slice(0, 10), count, level: count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 11 ? 3 : 4 });
  }
  return out;
}

function buildOrgs(users) {
  return ORG_SEEDS.map((seed) => {
    const members = TEAM_SEEDS.filter((t) => t.org === seed.login).flatMap((t) => t.members);
    const uniqueMembers = Array.from(new Set(members));
    return {
      id: `o-${seed.login}`,
      login: seed.login,
      name: seed.name,
      type: 'org',
      description: seed.description,
      location: seed.location,
      website: seed.website,
      email: seed.email,
      plan: seed.plan,
      verified: seed.verified,
      sponsorable: seed.sponsorable,
      followers: seed.followers,
      createdAt: seed.createdAt,
      members: uniqueMembers,
      memberCount: uniqueMembers.length,
      billingEmail: `billing@${seed.login}.local`,
      twoFactorRequired: true,
      saml: { enabled: true, provider: 'okta', ssoEnforced: true, scim: true },
    };
  });
}

function buildTeams() {
  return TEAM_SEEDS.map((seed, index) => ({
    id: `t-${seed.org}-${seed.slug}`,
    orgLogin: seed.org,
    name: seed.name,
    slug: seed.slug,
    description: seed.description,
    privacy: seed.privacy,
    permission: index < 2 ? 'admin' : index < 4 ? 'write' : 'read',
    members: seed.members,
    repos: [],
    createdAt: ago(randomInt(rngFor(`team:${seed.slug}`), 200, 900) * DAY),
  }));
}

function buildRepos() {
  return REPO_SEEDS.map((seed) => {
    const rng = rngFor(`repo:${seed.owner}/${seed.name}`);
    const languages = LANGUAGE_PALETTES[seed.language] || { [seed.language]: 100 };
    const total = Object.values(languages).reduce((a, b) => a + b, 0);
    return {
      id: `r-${seed.owner}-${seed.name}`,
      ownerLogin: seed.owner,
      ownerType: ORG_SEEDS.some((o) => o.login === seed.owner) ? 'org' : 'user',
      name: seed.name,
      fullName: `${seed.owner}/${seed.name}`,
      description: seed.description,
      visibility: seed.visibility,
      defaultBranch: seed.defaultBranch || 'main',
      language: seed.language,
      languages: Object.entries(languages).map(([name, value]) => ({
        name, percent: Number(((value / total) * 100).toFixed(1)), color: LANGUAGE_COLORS[name] || '#d61a2f',
      })),
      topics: seed.topics || [],
      homepage: seed.homepage || null,
      license: seed.license || null,
      stars: seed.stars || randomInt(rng, 1, 400),
      forks: seed.forks || randomInt(rng, 0, 90),
      watchers: seed.watchers || randomInt(rng, 1, 120),
      subscribers: randomInt(rng, 8, 200),
      openIssues: 0,
      openPulls: 0,
      fork: Boolean(seed.forkParent),
      forkParent: seed.forkParent || null,
      archived: Boolean(seed.archived),
      mirror: false,
      template: false,
      createdAt: seed.createdAt,
      updatedAt: ago(randomInt(rng, 1, 40) * DAY),
      pushedAt: ago(randomInt(rng, 1, 12) * HOUR),
      size: randomInt(rng, 1200, 92000),
      hasIssues: true,
      hasWiki: seed.hasWiki !== false,
      hasPages: Boolean(seed.hasPages),
      hasDiscussions: Boolean(seed.hasDiscussions),
      hasProjects: seed.hasProjects !== false,
      hasDownloads: true,
      allowForking: true,
      allowSquashMerge: true,
      allowMergeCommit: true,
      allowRebaseMerge: true,
      allowAutoMerge: true,
      allowUpdateBranch: true,
      deleteBranchOnMerge: true,
      useMergeQueue: Boolean(seed.primary),
      mergeQueueConcurrency: 4,
      webCommitSignoffRequired: false,
      requireSignedCommits: false,
      securityAndAnalysis: {
        secretScanning: true,
        secretScanningPushProtection: true,
        dependabotAlerts: true,
        dependabotSecurityUpdates: true,
        codeScanning: Boolean(seed.primary || seed.name === 'redql'),
      },
      primary: Boolean(seed.primary),
    };
  });
}

/** Build the file tree, commits and branches for a repository. */
function buildRepoContent(repo, users) {
  const rng = rngFor(`content:${repo.fullName}`);
  const tree = repo.primary
    ? REDGET_CORE_TREE
    : (SECONDARY_TREES[repo.name] || [
      { path: 'README.md', type: 'file', content: genericReadme(repo.name, repo.description, repo.ownerLogin), message: 'docs: initial README' },
      { path: 'LICENSE', type: 'file', content: 'MIT License\n\nCopyright (c) 2026 ' + repo.ownerLogin + '\n', message: 'chore: add licence' },
      { path: 'src', type: 'dir' },
      { path: 'src/index.js', type: 'file', content: `// ${repo.name}\nexport const name = '${repo.name}';\nexport const theme = 'crimson';\n\nexport function start() {\n  console.log(\`[redget] \${name} starting with the \${theme} theme\`);\n}\n`, message: 'feat: bootstrap' },
      { path: 'package.json', type: 'file', content: `{\n  "name": "${repo.name}",\n  "version": "1.0.0",\n  "type": "module",\n  "license": "${repo.license || 'MIT'}"\n}\n`, message: 'chore: package metadata' },
    ]);

  const contributors = repo.primary
    ? ['octored', 'nightshade', 'velvetbyte', 'scarletui', 'ember', 'crimsonfox', 'zephyrine', 'ironvale']
    : pickMany(rng, users.map((u) => u.login).filter((l) => l !== 'redget-bot'), randomInt(rng, 2, 6));

  const files = tree.filter((entry) => entry.type === 'file').map((entry, index) => ({
    path: entry.path,
    name: entry.path.split('/').pop(),
    dir: entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '',
    content: entry.content != null ? entry.content : '',
    binary: Boolean(entry.binary),
    size: (entry.content || '').length,
    lines: (entry.content || '').split('\n').length,
    message: entry.message || pick(rng, COMMIT_MESSAGE_SEEDS),
    authorLogin: contributors[index % contributors.length],
    sha: shortId(40, `${repo.fullName}:${entry.path}`),
    committedAt: ago((index + 1) * randomInt(rng, 3, 40) * HOUR + randomInt(rng, 0, 300) * DAY),
    language: guessLanguage(entry.path),
  }));

  const dirs = tree.filter((entry) => entry.type === 'dir').map((entry) => ({
    path: entry.path,
    name: entry.path.split('/').pop(),
    dir: entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '',
    type: 'dir',
  }));

  // Commits: derived from files plus a tail of extra history entries.
  const commits = files.map((file, index) => ({
    sha: shortId(40, `commit:${repo.fullName}:${index}`),
    shortSha: shortId(7, `commit:${repo.fullName}:${index}`),
    repoFullName: repo.fullName,
    branch: repo.defaultBranch,
    message: file.message,
    body: index % 5 === 0 ? 'Co-authored-by: ' + contributors[(index + 1) % contributors.length] + ' <' + contributors[(index + 1) % contributors.length] + '@redget.local>\n\nRefs #' + (index + 1) : '',
    authorLogin: file.authorLogin,
    authorName: (users.find((u) => u.login === file.authorLogin) || {}).name || file.authorLogin,
    authorEmail: `${file.authorLogin}@redget.local`,
    committerLogin: file.authorLogin,
    verified: rng() > 0.12,
    additions: randomInt(rng, 2, 340),
    deletions: randomInt(rng, 0, 120),
    files: [file.path],
    date: file.committedAt,
    parents: index > 0 ? [shortId(40, `commit:${repo.fullName}:${index - 1}`)] : [],
    tree: [{ path: file.path, type: 'blob' }],
  }));

  const extraCount = repo.primary ? 34 : randomInt(rng, 6, 18);
  for (let i = 0; i < extraCount; i += 1) {
    const authorLogin = pick(rng, contributors);
    const date = ago((files.length + i + 1) * randomInt(rng, 4, 30) * HOUR + randomInt(rng, 20, 700) * DAY);
    commits.push({
      sha: shortId(40, `commit:${repo.fullName}:extra:${i}`),
      shortSha: shortId(7, `commit:${repo.fullName}:extra:${i}`),
      repoFullName: repo.fullName,
      branch: repo.defaultBranch,
      message: pick(rng, COMMIT_MESSAGE_SEEDS),
      body: '',
      authorLogin,
      authorName: (users.find((u) => u.login === authorLogin) || {}).name || authorLogin,
      authorEmail: `${authorLogin}@redget.local`,
      committerLogin: authorLogin,
      verified: rng() > 0.2,
      additions: randomInt(rng, 1, 220),
      deletions: randomInt(rng, 0, 90),
      files: pickMany(rng, files.map((f) => f.path), randomInt(rng, 1, 3)),
      date,
      parents: [],
      tree: [],
    });
  }
  commits.sort((a, b) => new Date(b.date) - new Date(a.date));
  commits.forEach((commit, index) => {
    if (index < commits.length - 1) commit.parents = [commits[index + 1].sha];
  });

  const branchNames = repo.primary
    ? ['main', 'develop', 'release/4.3', 'feature/split-diff-alignment', 'fix/blame-grouping', 'feature/merge-queue', 'fix/contrast-focus-ring', 'perf/log-virtualisation', 'docs/html-contract']
    : ['main', 'develop', 'next'];
  const branches = branchNames.map((name, index) => ({
    name,
    repoFullName: repo.fullName,
    sha: commits[index % commits.length] ? commits[index % commits.length].sha : shortId(40, name),
    protected: name === repo.defaultBranch || name.startsWith('release/'),
    aheadBy: index === 0 ? 0 : randomInt(rng, 0, 24),
    behindBy: index === 0 ? 0 : randomInt(rng, 0, 18),
    updatedAt: commits[index % commits.length] ? commits[index % commits.length].date : ago(index * DAY),
    authorLogin: pick(rng, contributors),
  }));

  const tagNames = repo.primary
    ? ['v4.2.0', 'v4.1.0', 'v4.0.0', 'v3.9.2', 'v3.9.0']
    : ['v1.0.0', 'v0.9.0'];
  const tags = tagNames.map((name, index) => ({
    name,
    repoFullName: repo.fullName,
    sha: shortId(40, `tag:${repo.fullName}:${name}`),
    date: ago((index + 1) * randomInt(rng, 40, 90) * DAY),
    authorLogin: pick(rng, contributors),
    verified: true,
  }));

  CONTENT.set(repo.fullName, {
    files,
    dirs,
    readme: (files.find((f) => f.path.toLowerCase() === 'readme.md')
      || files.find((f) => f.name.toLowerCase() === 'readme.md')
      || { content: repo.primary ? README_MD : genericReadme(repo.name, repo.description, repo.ownerLogin) }).content,
  });

  return { files, dirs, commits, branches, tags, contributors };
}

function guessLanguage(path) {
  const lower = path.toLowerCase();
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : '';
  const map = {
    js: 'JavaScript', mjs: 'JavaScript', ts: 'TypeScript', tsx: 'TypeScript', jsx: 'JavaScript',
    css: 'CSS', scss: 'CSS', html: 'HTML', svg: 'HTML', md: 'Markdown', json: 'JavaScript',
    yml: 'YAML', yaml: 'YAML', sh: 'Shell', sql: 'SQL', rs: 'Rust', go: 'Go', toml: 'TOML',
  };
  if (lower.endsWith('license')) return 'Text';
  if (lower.endsWith('dockerfile')) return 'Dockerfile';
  if (lower.endsWith('codeowners')) return 'Text';
  return map[ext] || 'Text';
}

function buildLabels() {
  const out = [];
  REPO_SEEDS.forEach((repo) => {
    const fullName = `${repo.owner}/${repo.name}`;
    const set = repo.primary ? LABEL_SEEDS : LABEL_SEEDS.slice(0, 12);
    set.forEach((label, index) => {
      out.push({
        id: `l-${fullName}-${index}`,
        repoFullName: fullName,
        name: label.name,
        color: label.color,
        description: label.description || '',
        default: ['bug', 'enhancement', 'documentation', 'good first issue', 'help wanted'].includes(label.name),
      });
    });
  });
  return out;
}

function buildMilestones() {
  return MILESTONE_SEEDS.map((seed, index) => ({
    id: `m-${index}`,
    repoFullName: 'octored/redget-core',
    title: seed.title,
    description: seed.description,
    state: seed.state,
    dueOn: seed.dueOn,
    createdAt: ago((index + 2) * 60 * DAY),
    creatorLogin: index % 2 === 0 ? 'octored' : 'crimsonfox',
    openIssues: 0,
    closedIssues: 0,
  }));
}

const COMMENT_BODY_SEEDS = [
  'Reproduced on the crimson theme at 1280px. The gutter column collapses to 24px and the "+" button lands on top of the line number.',
  'I think this is a regression from the sticky toolbar change. Bisecting now.',
  '> The gutter column collapses\n\nConfirmed — `min-width: 46px` is being overridden by the mobile media query.',
  'Suggested fix:\n\n```suggestion\n.diff-split table.diff td.code-cell {\n  width: calc(50% - 46px);\n}\n```\n',
  'This needs an accessibility review before it merges. The toggle has no `aria-pressed`.',
  'Adding to the 4.3 milestone — @crimsonfox can you review?',
  'Nice catch. I have a branch with the paired-alignment rewrite: #14.',
  'Works for me on dark, crimson and light. High contrast still fails.',
  ':rocket: Shipped in 4.2.0. Thanks everyone!',
  'Closing as completed — the fix landed in the split diff rewrite.',
  'Not planning to work on this one; the behaviour matches the contract in the wiki.',
  'Duplicate of #3 — closing.',
  'Can we add a test to `tools/validate.mjs` so this does not regress?',
  'The log output for this run is at `/octored/redget-core/actions/runs/90214` if anyone wants the raw logs.',
  'Screen reader trace: the live region announces "Merged" twice because the toast and the status element both fire.',
  'I would prefer `aria-live="polite"` on the container and `role="status"` only on the message node.',
  'Confirmed at 375px too. The tab bar needs `overflow-x: auto` with a scroll shadow.',
  'Performance profile shows 42ms of layout thrash per keystroke in the file finder. Debouncing to 160ms fixes it.',
  'LGTM — approving. One nit: rename `pairLines` to `pairSplitLines` for clarity.',
  'Requested changes: the empty cell needs `aria-hidden="true"` so screen readers skip it.',
];

function buildIssues(repos, users, labels, milestones) {
  const out = [];
  const comments = [];
  const reactions = [];
  const timeline = [];
  let globalNumber = 0;

  const primary = repos.find((r) => r.primary);
  const repoPlan = repos.map((repo) => {
    if (repo.primary) return ISSUE_SEEDS.length;
    if (repo.visibility !== 'public') return 2;
    return randomInt(rngFor(`issuecount:${repo.fullName}`), 3, 9);
  });

  repos.forEach((repo, repoIndex) => {
    const count = repoPlan[repoIndex];
    const rng = rngFor(`issues:${repo.fullName}`);
    const repoLabels = labels.filter((l) => l.repoFullName === repo.fullName);
    for (let i = 0; i < count; i += 1) {
      globalNumber += 1;
      const seed = repo.primary && i < ISSUE_SEEDS.length
        ? ISSUE_SEEDS[i]
        : {
          title: pick(rng, ISSUE_SEEDS).title,
          labels: pickMany(rng, repoLabels.map((l) => l.name), randomInt(rng, 0, 3)),
          comments: randomInt(rng, 0, 6),
          reactions: { '+1': randomInt(rng, 0, 12) },
          milestone: rng() > 0.7 && repo.primary ? randomInt(rng, 0, 3) : null,
          state: rng() > 0.45 ? 'open' : 'closed',
        };
      const number = repo.primary ? i + 1 : i + 1;
      const authorLogin = pick(rng, users.map((u) => u.login));
      const createdAt = ago(randomInt(rng, 1, repo.primary ? 240 : 90) * DAY);
      const isPull = false;
      const id = `i-${repo.fullName}-${number}`;
      const body = buildIssueBody(repo, seed, authorLogin, rng);
      const state = seed.state || 'open';
      const closedAt = state === 'closed' ? ago(Math.max(1, randomInt(rng, 0, 60)) * DAY) : null;

      out.push({
        id,
        repoFullName: repo.fullName,
        number,
        title: seed.title,
        body,
        state,
        stateReason: state === 'closed' ? (rng() > 0.75 ? 'not_planned' : 'completed') : null,
        authorLogin,
        assignees: pickMany(rng, users.map((u) => u.login).filter((l) => l !== 'redget-bot'), randomInt(rng, 0, 2)),
        labels: (seed.labels || []).map((name) => {
          const found = repoLabels.find((l) => l.name === name) || { name, color: 'd61a2f', description: '' };
          return { name: found.name, color: found.color, description: found.description };
        }),
        milestone: seed.milestone != null && milestones[seed.milestone] ? milestones[seed.milestone].id : null,
        projects: repo.primary && rng() > 0.55 ? ['p1'] : [],
        reactions: seed.reactions || {},
        commentsCount: seed.comments || 0,
        locked: rng() > 0.94,
        lockReason: null,
        pinned: repo.primary && i < 2,
        createdAt,
        updatedAt: ago(randomInt(rng, 0, 20) * DAY),
        closedAt,
        closedByLogin: closedAt ? pick(rng, users.map((u) => u.login)) : null,
        isPull,
        linkedPullRequests: [],
        subscribed: rng() > 0.6,
        participants: [],
        timeline: [],
      });

      // Comments
      const commentCount = seed.comments || 0;
      for (let c = 0; c < commentCount; c += 1) {
        const cAuthor = pick(rng, users.map((u) => u.login));
        const cId = `c-${id}-${c}`;
        const createdAtC = ago(Math.max(1, randomInt(rng, 0, 120)) * DAY - c * 3 * HOUR);
        comments.push({
          id: cId,
          targetType: 'issue',
          targetId: id,
          repoFullName: repo.fullName,
          authorLogin: cAuthor,
          body: pick(rng, COMMENT_BODY_SEEDS),
          createdAt: createdAtC,
          updatedAt: createdAtC,
          reactions: rng() > 0.7 ? { '+1': randomInt(rng, 1, 6) } : {},
          minimized: false,
          isAnswer: false,
        });
        if (rng() > 0.85) {
          reactions.push({ id: `r-${cId}`, targetType: 'comment', targetId: cId, userLogin: pick(rng, users.map((u) => u.login)), content: pick(rng, ['+1', 'heart', 'hooray']) });
        }
      }

      // Timeline events
      const events = [];
      events.push({ id: `tl-${id}-0`, type: 'opened', actorLogin: authorLogin, createdAt });
      if ((out[out.length - 1].labels || []).length) {
        events.push({ id: `tl-${id}-1`, type: 'labeled', actorLogin: authorLogin, label: out[out.length - 1].labels[0].name, createdAt: ago(randomInt(rng, 1, 100) * DAY) });
      }
      if (out[out.length - 1].assignees.length) {
        events.push({ id: `tl-${id}-2`, type: 'assigned', actorLogin: authorLogin, assignee: out[out.length - 1].assignees[0], createdAt: ago(randomInt(rng, 1, 100) * DAY) });
      }
      if (out[out.length - 1].milestone) {
        events.push({ id: `tl-${id}-3`, type: 'milestoned', actorLogin: authorLogin, milestoneId: out[out.length - 1].milestone, createdAt: ago(randomInt(rng, 1, 100) * DAY) });
      }
      if (rng() > 0.7) events.push({ id: `tl-${id}-4`, type: 'mentioned', actorLogin: pick(rng, users.map((u) => u.login)), createdAt: ago(randomInt(rng, 1, 80) * DAY) });
      if (rng() > 0.8) events.push({ id: `tl-${id}-5`, type: 'cross-referenced', actorLogin: pick(rng, users.map((u) => u.login)), sourceTitle: pick(rng, PR_SEEDS).title, sourceNumber: randomInt(rng, 1, 18), createdAt: ago(randomInt(rng, 1, 80) * DAY) });
      if (rng() > 0.85) events.push({ id: `tl-${id}-6`, type: 'subscribed', actorLogin: pick(rng, users.map((u) => u.login)), createdAt: ago(randomInt(rng, 1, 60) * DAY) });
      if (state === 'closed') {
        events.push({ id: `tl-${id}-7`, type: out[out.length - 1].stateReason === 'not_planned' ? 'closed-not-planned' : 'closed', actorLogin: out[out.length - 1].closedByLogin, createdAt: closedAt });
      }
      events.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      out[out.length - 1].timeline = events;
      out[out.length - 1].participants = Array.from(new Set([authorLogin, ...comments.filter((c) => c.targetId === id).map((c) => c.authorLogin)]));
      timeline.push(...events);
    }
  });

  void primary; void globalNumber;
  return { issues: out, comments, reactions, timeline };
}

function buildIssueBody(repo, seed, authorLogin, rng) {
  const title = seed.title;
  if (/^Split diff/i.test(title)) {
    return `## What happened?\n\nIn the split diff view, a deletion block followed by an unrelated addition block renders on the same row, which makes the two columns drift apart on long files.\n\n## Steps to reproduce\n\n1. Open \`/${repo.fullName}/pull/1/files\`\n2. Switch the diff display to **Split**\n3. Scroll to \`src/components/diff.js\`\n\n## Expected\n\nEach deletion should be paired with the addition that replaces it; unpaired lines should render as an empty cell with \`--diff-empty-bg\`.\n\n## Actual\n\n\`\`\`text\n  41 |   if (line.type === 'del') left.push(line);      |  41 |   if (line.type === 'add') right.push(line);\n  42 |                                                  |  42 |   if (line.type === 'del') left.push(line);\n\`\`\`\n\n## Environment\n\n| Field | Value |\n| --- | --- |\n| RedGet version | 4.2.0 |\n| Browser | Chromium 133 |\n| Theme | crimson |\n| Viewport | 1440 × 900 |\n\n- [x] I attached a recording\n- [x] I searched existing issues at \`/${repo.fullName}/issues?q=is:issue split\`\n\n/cc @nightshade @scarletui`;
  }
  if (/High contrast/i.test(title)) {
    return `The focus ring on the branch selector uses \`--focus-ring\`, which in the high contrast themes resolves to a 3px white shadow. The selector also sets \`outline: none\` on focus, so the shadow is the only indicator — and it is clipped by the overflow on \`.branch-selector\`.\n\n> [!IMPORTANT]\n> WCAG 2.4.11 (Focus Appearance) requires a minimum 2px perimeter at 3:1 contrast.\n\n- [ ] Remove \`outline: none\` for \`[data-theme-group="contrast"]\`\n- [ ] Move \`overflow: hidden\` off the selector wrapper\n- [ ] Verify with a keyboard-only pass across all five themes`;
  }
  if (/merge queue/i.test(title)) {
    return `## Proposal\n\nAdd a merge queue to \`/${repo.fullName}/settings/branches\` with:\n\n1. Configurable concurrency (1–16)\n2. A required status check list\n3. A "Add to merge queue" button in the merge box\n4. A queue view at \`/${repo.fullName}/actions/queue\`\n\n## HTML sketch\n\n\`\`\`html\n<section class="merge-queue">\n  <h2>Merge queue</h2>\n  <ol class="queue-list">\n    <li class="queue-item" data-position="1">\n      <a href="/${repo.fullName}/pull/5">#5 Add merge queue settings</a>\n      <span class="badge badge-accent">Testing</span>\n    </li>\n  </ol>\n</section>\n\`\`\`\n\n## Open questions\n\n- Do we show the estimated wait time?\n- Should failed queue entries auto-requeue once?\n\ncc @ember`;
  }
  return `${title}.\n\n### Current behaviour\n\n${pick(rng, [
    'The control is not reachable with the keyboard.',
    'The value is not persisted across reloads.',
    'The layout breaks below 544px.',
    'The counter shows a stale value after the mutation.',
    'The filter is applied but the URL is not updated.',
  ])}\n\n### Expected behaviour\n\n${pick(rng, [
    'Every control is reachable with Tab and operable with Enter or Space.',
    'The preference is written to localStorage under redget:prefs:v4.',
    'The layout reflows to a single column without horizontal scrolling.',
    'The counter updates immediately and stays correct after a reload.',
    'The query string mirrors the active filters so the view is shareable.',
  ])}\n\n### Steps\n\n1. Open \`/${repo.fullName}\`\n2. Navigate to the affected surface\n3. Observe the behaviour above\n\nReported by @${authorLogin}.`;
}

function buildPullRequests(repos, users, issues, labels) {
  const out = [];
  const reviews = [];
  const threads = [];
  const checks = [];

  repos.forEach((repo) => {
    const rng = rngFor(`prs:${repo.fullName}`);
    const plan = repo.primary ? PR_SEEDS.length : (repo.visibility === 'public' ? randomInt(rng, 2, 5) : 1);
    const repoIssues = issues.filter((i) => i.repoFullName === repo.fullName);
    const repoLabels = labels.filter((l) => l.repoFullName === repo.fullName);

    for (let i = 0; i < plan; i += 1) {
      const seed = repo.primary && i < PR_SEEDS.length ? PR_SEEDS[i] : {
        title: pick(rng, PR_SEEDS).title,
        branch: `feature/seeded-${i}`,
        labels: pickMany(rng, repoLabels.map((l) => l.name), randomInt(rng, 0, 2)),
        draft: rng() > 0.85,
        state: rng() > 0.5 ? 'open' : rng() > 0.5 ? 'merged' : 'closed',
        reviews: {},
        checks: pick(rng, ['pass', 'fail', 'pending', 'mixed']),
        files: randomInt(rng, 1, 6),
        additions: randomInt(rng, 10, 400),
        deletions: randomInt(rng, 0, 150),
        comments: randomInt(rng, 0, 8),
      };
      const number = repoIssues.length + i + 1;
      const id = `pr-${repo.fullName}-${number}`;
      const authorLogin = pick(rng, users.map((u) => u.login).filter((l) => l !== 'redget-bot'));
      const createdAt = ago(randomInt(rng, 1, 120) * DAY);
      const merged = seed.state === 'merged';
      const closed = seed.state === 'closed';
      const state = merged || closed ? 'closed' : 'open';
      const headBranch = seed.branch || `feature/pr-${number}`;
      const baseBranch = repo.defaultBranch;

      out.push({
        id,
        repoFullName: repo.fullName,
        number,
        title: seed.title,
        body: buildPrBody(repo, seed, authorLogin),
        state,
        merged,
        draft: Boolean(seed.draft) && !merged && !closed,
        authorLogin,
        headBranch,
        baseBranch,
        headSha: shortId(40, `${id}:head`),
        baseSha: shortId(40, `${id}:base`),
        mergeableState: seed.checks === 'fail' ? 'dirty' : seed.reviews && seed.reviews.changes ? 'blocked' : 'clean',
        additions: seed.additions,
        deletions: seed.deletions,
        changedFiles: seed.files,
        labels: (seed.labels || []).map((name) => {
          const found = repoLabels.find((l) => l.name === name) || { name, color: 'd61a2f', description: '' };
          return { name: found.name, color: found.color, description: found.description };
        }),
        assignees: pickMany(rng, users.map((u) => u.login), randomInt(rng, 0, 2)),
        reviewers: pickMany(rng, users.map((u) => u.login).filter((l) => l !== authorLogin), randomInt(rng, 1, 3)),
        milestone: repo.primary && rng() > 0.7 ? 'm-0' : null,
        projects: repo.primary && rng() > 0.6 ? ['p1'] : [],
        commentsCount: seed.comments || 0,
        reactions: rng() > 0.6 ? { '+1': randomInt(rng, 1, 10), rocket: randomInt(rng, 0, 4) } : {},
        createdAt,
        updatedAt: ago(randomInt(rng, 0, 10) * DAY),
        mergedAt: merged ? ago(randomInt(rng, 1, 40) * DAY) : null,
        mergedByLogin: merged ? pick(rng, users.map((u) => u.login)) : null,
        mergeMethod: merged ? pick(rng, ['merge', 'squash', 'rebase']) : null,
        closedAt: closed ? ago(randomInt(rng, 1, 40) * DAY) : null,
        autoMerge: !merged && rng() > 0.8 ? { method: 'squash', enabledAt: ago(randomInt(rng, 1, 6) * DAY) } : null,
        linkedIssues: repo.primary && i < 3 ? [`${i + 1}`] : [],
        commits: randomInt(rng, 1, 9),
        viewedFiles: [],
        timeline: [],
      });

      // Reviews
      const reviewSpec = seed.reviews || {};
      Object.entries(reviewSpec).forEach(([kind, count], reviewIndex) => {
        for (let r = 0; r < count; r += 1) {
          const reviewerLogin = pick(rng, users.map((u) => u.login).filter((l) => l !== authorLogin));
          reviews.push({
            id: `rev-${id}-${reviewIndex}-${r}`,
            pullRequestId: id,
            repoFullName: repo.fullName,
            authorLogin: reviewerLogin,
            state: kind === 'approve' ? 'APPROVED' : kind === 'changes' ? 'CHANGES_REQUESTED' : 'COMMENTED',
            body: pick(rng, COMMENT_BODY_SEEDS),
            submittedAt: ago(randomInt(rng, 1, 40) * DAY),
            commitSha: shortId(40, `${id}:rev${r}`),
            dismissed: false,
          });
        }
      });

      // Review threads (inline comments)
      const threadCount = Math.min(seed.comments || 0, 4);
      for (let tI = 0; tI < threadCount; tI += 1) {
        const threadId = `th-${id}-${tI}`;
        threads.push({
          id: threadId,
          pullRequestId: id,
          repoFullName: repo.fullName,
          path: repo.primary ? pick(rng, ['src/components/diff.js', 'assets/css/repo.css', 'src/core/router.js', 'docs/diff.md']) : 'src/index.js',
          side: rng() > 0.5 ? 'RIGHT' : 'LEFT',
          oldNo: randomInt(rng, 10, 60),
          newNo: randomInt(rng, 10, 60),
          resolved: rng() > 0.6,
          authorLogin: pick(rng, users.map((u) => u.login)),
          body: pick(rng, COMMENT_BODY_SEEDS),
          suggestion: tI === 0 && repo.primary ? '.diff-split table.diff td.code-cell {\n  width: calc(50% - 46px);\n}' : null,
          suggestionApplied: false,
          createdAt: ago(randomInt(rng, 1, 30) * DAY),
          replies: rng() > 0.6 ? [{ authorLogin: authorLogin, body: pick(rng, COMMENT_BODY_SEEDS), createdAt: ago(randomInt(rng, 1, 10) * DAY) }] : [],
        });
      }

      // Checks
      const checkCount = randomInt(rng, 2, 6);
      for (let c = 0; c < checkCount; c += 1) {
        const passed = seed.checks === 'pass' || (seed.checks === 'mixed' && c > 0) || (seed.checks === 'pending' && false);
        const failed = seed.checks === 'fail' && c === 0;
        checks.push({
          id: `chk-${id}-${c}`,
          pullRequestId: id,
          repoFullName: repo.fullName,
          name: pick(rng, ['validate', 'build', 'a11y-audit', 'contrast-check', 'unit-tests', 'lint', 'publish']),
          workflowName: pick(rng, ['RedGet CI', 'Release', 'Accessibility audit']),
          status: seed.checks === 'pending' ? 'queued' : 'completed',
          conclusion: failed ? 'failure' : passed ? 'success' : seed.checks === 'pending' ? null : 'success',
          required: c < 2,
          detailsUrl: `/${repo.fullName}/actions/runs/${90200 + c}`,
          startedAt: createdAt,
          completedAt: seed.checks === 'pending' ? null : ago(randomInt(rng, 1, 20) * DAY),
          durationMs: randomInt(rng, 20000, 400000),
          annotations: failed ? randomInt(rng, 1, 3) : 0,
        });
      }
    }
  });

  return { pullRequests: out, reviews, threads, checks };
}

function buildPrBody(repo, seed, authorLogin) {
  return `## What does this change?\n\n${seed.title}.\n\nFixes #${randomInt(rngFor(`prbody:${repo.fullName}:${seed.title}`), 1, 20)}\n\n## Type of change\n\n- [x] ${/fix/i.test(seed.title) ? 'Bug fix (non-breaking)' : 'New feature (non-breaking)'}\n- [ ] Breaking change\n- [ ] Documentation only\n\n## How was this tested?\n\n- [x] \`node tools/validate.mjs\` passes\n- [x] Manual check at 375px and 1280px\n- [x] All five themes reviewed\n- [x] Keyboard-only navigation verified\n\n## Notes for reviewers\n\nThe diff is ${seed.additions} additions and ${seed.deletions} deletions across ${seed.files} files. Review the sticky toolbar interaction first — it changed the stacking context.\n\n/cc @${authorLogin}`;
}

function buildWorkflows(repos) {
  const out = [];
  repos.forEach((repo) => {
    const rng = rngFor(`wf:${repo.fullName}`);
    const defs = repo.primary
      ? [
        { id: 'ci.yml', name: 'RedGet CI', path: '.redget/workflows/ci.yml', events: ['push', 'pull_request', 'workflow_dispatch', 'schedule', 'merge_group'] },
        { id: 'release.yml', name: 'Release', path: '.redget/workflows/release.yml', events: ['push', 'workflow_dispatch'] },
        { id: 'a11y.yml', name: 'Accessibility audit', path: '.redget/workflows/a11y.yml', events: ['pull_request'] },
        { id: 'docs.yml', name: 'Docs deploy', path: '.redget/workflows/docs.yml', events: ['push'] },
        { id: 'codeql.yml', name: 'Code scanning', path: '.redget/workflows/codeql.yml', events: ['push', 'schedule'] },
      ]
      : [
        { id: 'ci.yml', name: 'CI', path: '.redget/workflows/ci.yml', events: ['push', 'pull_request'] },
        { id: 'release.yml', name: 'Release', path: '.redget/workflows/release.yml', events: ['push'] },
      ];
    defs.forEach((def, index) => {
      out.push({
        ...def,
        repoFullName: repo.fullName,
        state: index === 0 || rng() > 0.2 ? 'active' : 'disabled',
        badgeUrl: `/${repo.fullName}/actions/workflows/${def.id}/badge.svg`,
        runs: 0,
        updatedAt: ago(randomInt(rng, 1, 60) * DAY),
      });
    });
  });
  return out;
}

function buildRuns(repos, workflows, users) {
  STEP_LOGS.clear();
  const out = [];
  const jobs = [];
  repos.forEach((repo) => {
    const rng = rngFor(`runs:${repo.fullName}`);
    const repoWorkflows = workflows.filter((w) => w.repoFullName === repo.fullName);
    const count = repo.primary ? 26 : randomInt(rng, 3, 8);
    for (let i = 0; i < count; i += 1) {
      const workflow = repoWorkflows[i % repoWorkflows.length];
      const runNumber = count - i;
      const id = 90200 + hashString(`${repo.fullName}:${i}`) % 800;
      const roll = rng();
      const status = roll > 0.9 ? 'in_progress' : roll > 0.84 ? 'queued' : 'completed';
      const conclusion = status === 'completed'
        ? (rng() > 0.78 ? (rng() > 0.5 ? 'failure' : 'cancelled') : 'success')
        : null;
      const branch = pick(rng, repo.primary
        ? ['main', 'release/4.3', 'feature/split-diff-alignment', 'fix/blame-grouping', 'develop']
        : ['main', 'develop']);
      const event = pick(rng, ['push', 'pull_request', 'schedule', 'workflow_dispatch', 'merge_group']);
      const startedAt = ago((i + 1) * randomInt(rng, 6, 40) * HOUR);
      const durationMs = randomInt(rng, 45_000, 620_000);
      out.push({
        id: String(id),
        runNumber,
        repoFullName: repo.fullName,
        workflowId: workflow.id,
        workflowName: workflow.name,
        name: `${workflow.name} #${runNumber}`,
        displayTitle: pick(rng, COMMIT_MESSAGE_SEEDS),
        headBranch: branch,
        headSha: shortId(40, `${repo.fullName}:run:${i}`),
        event,
        status,
        conclusion,
        actorLogin: pick(rng, users.map((u) => u.login)),
        triggeringActorLogin: pick(rng, users.map((u) => u.login)),
        createdAt: startedAt,
        updatedAt: ago(i * randomInt(rng, 1, 6) * HOUR),
        runStartedAt: startedAt,
        durationMs: status === 'completed' ? durationMs : REF - new Date(startedAt).getTime(),
        attempt: rng() > 0.85 ? 2 : 1,
        artifacts: rng() > 0.6 ? [{ id: `a-${id}`, name: 'validation-report', size: randomInt(rng, 20000, 900000), createdAt: startedAt, expiresAt: ago(-14 * DAY), downloadCount: randomInt(rng, 0, 40) }] : [],
        url: `/${repo.fullName}/actions/runs/${id}`,
        jobs: [],
      });

      // Jobs
      const jobDefs = workflow.id === 'ci.yml'
        ? ['validate', 'build (web)', 'build (static)', 'a11y-audit', 'publish']
        : workflow.id === 'release.yml' ? ['release', 'attest'] : ['job'];
      jobDefs.forEach((jobName, jobIndex) => {
        const jobStatus = status === 'completed' ? 'completed' : jobIndex === 0 ? 'in_progress' : 'queued';
        const jobConclusion = jobStatus === 'completed'
          ? (conclusion === 'failure' && jobIndex === 1 ? 'failure' : conclusion)
          : null;
        const jobId = `${id}-job-${jobIndex}`;
        const steps = buildSteps(jobName, rng, jobConclusion, jobId);
        jobs.push({
          id: jobId,
          runId: String(id),
          repoFullName: repo.fullName,
          name: jobName,
          status: jobStatus,
          conclusion: jobConclusion,
          runnerName: pick(rng, RUNNER_SEEDS).name,
          runnerLabels: ['self-hosted', 'linux', 'x64'],
          startedAt: startedAt,
          completedAt: jobStatus === 'completed' ? ago(i * HOUR) : null,
          durationMs: jobStatus === 'completed' ? randomInt(rng, 20_000, 240_000) : 0,
          steps,
          logKey: jobId,
          annotations: jobConclusion === 'failure' ? [{ level: 'error', message: 'Validation failed: 2 unresolved internal routes', title: 'route check', path: 'tools/validate.mjs', line: 88 }] : [],
          matrix: jobName.includes('(') ? { target: jobName.replace(/.*\((.*)\)/, '$1') } : null,
        });
        const run = out[out.length - 1];
        run.jobs.push(jobId);
      });
    }
  });
  return { runs: out, jobs };
}

/**
 * Heavy, fully derived content that never needs to be persisted: repository file
 * trees and READMEs, pull request diff sources, wiki pages and the per-user
 * contribution heatmaps. Kept in module registries so localStorage only ever
 * holds the user's actual mutations (see `detachContent` / `attachContent`).
 */
export const CONTENT = new Map();
export const WIKI = new Map();
export const CONTRIBUTIONS = new Map();

/** Pull request diff sources, keyed by pull request id. */
export const PR_DIFFS = new Map();

/** Generated workflow log lines, keyed by job id (kept out of the persisted db). */
export const STEP_LOGS = new Map();

function buildSteps(jobName, rng, conclusion, jobId) {
  const names = jobName === 'validate'
    ? ['Set up job', 'Check out the repository', 'Set up Node', 'Parse every source file', 'Verify internal routes', 'Upload validation report', 'Post Check out the repository', 'Complete job']
    : jobName.startsWith('build')
      ? ['Set up job', 'Check out the repository', 'Install dependencies', 'Build', 'Cache build output', 'Complete job']
      : jobName === 'a11y-audit'
        ? ['Set up job', 'Check out the repository', 'Audit ARIA roles and semantics', 'Contrast check across themes', 'Publish summary', 'Complete job']
        : ['Set up job', 'Check out the repository', 'Run', 'Complete job'];
  const logs = [];
  let elapsed = 0;
  const steps = names.map((name, index) => {
    const failed = conclusion === 'failure' && index === Math.max(1, Math.floor(names.length / 2));
    const durationMs = failed ? randomInt(rng, 4000, 40000) : randomInt(rng, 400, 22000);
    elapsed += durationMs;
    return {
      number: index + 1,
      name,
      status: 'completed',
      conclusion: failed ? 'failure' : index === 0 && conclusion === 'cancelled' ? 'skipped' : 'success',
      durationMs,
      startedAt: elapsed,
      logLines: 0,
    };
  });
  steps.forEach((step, index) => {
    const lines = buildStepLog(names[index], rng, step.conclusion === 'failure');
    logs.push({ number: step.number, name: names[index], conclusion: step.conclusion, lines });
    step.logLines = lines.length;
  });
  STEP_LOGS.set(jobId, logs);
  return steps;
}

function buildStepLog(stepName, rng, failed) {
  const lines = [];
  const ts = (offsetSeconds) => new Date(REF - offsetSeconds * 1000).toISOString().slice(11, 19);
  lines.push({ level: 'group', text: `##[group]Run ${stepName}` });
  lines.push({ level: 'cmd', text: `$ ${stepName.toLowerCase().replace(/\s+/g, '-')}` });
  const count = randomInt(rng, 6, 18);
  for (let i = 0; i < count; i += 1) {
    const roll = rng();
    lines.push({
      level: roll > 0.9 ? 'warn' : roll > 0.72 ? 'debug' : 'info',
      text: pick(rng, [
        'Resolved 42 modules in 118ms',
        'Parsed assets/css/tokens.css — 5 themes, 412 declarations',
        'Parsed src/core/router.js — 24 exports, 0 syntax errors',
        'Validated 186 internal routes against ROUTE_PATTERNS',
        'Checked ARIA roles on 64 components',
        'Contrast ratio 8.4:1 for --fg-default on --bg-page (dark)',
        'Contrast ratio 12.1:1 for --fg-default on --bg-page (contrast-dark)',
        'Cache hit: build-web-dark (key build-web-dark)',
        'Uploading artifact validation-report (148 KB)',
        'No external domains referenced in any asset',
        'Skipping docs/** per paths-ignore',
        'Runner image: node:20-alpine, cpu: 8, memory: 16 GiB',
      ]),
      ts: ts(count - i),
    });
  }
  if (failed) {
    lines.push({ level: 'error', text: '##[error]Process completed with exit code 1.' });
    lines.push({ level: 'error', text: 'tools/validate.mjs: 2 routes did not resolve' });
  }
  lines.push({ level: 'group', text: '##[endgroup]' });
  lines.push({ level: 'info', text: `Post job status: ${failed ? 'failure' : 'success'}` });
  return lines;
}

function buildReleases(repos, users, tags) {
  const out = [];
  repos.forEach((repo) => {
    const rng = rngFor(`rel:${repo.fullName}`);
    const repoTags = tags.filter((t) => t.repoFullName === repo.fullName);
    repoTags.forEach((tag, index) => {
      const isLatest = index === 0;
      out.push({
        id: `rel-${repo.fullName}-${index}`,
        repoFullName: repo.fullName,
        tagName: tag.name,
        targetCommitish: repo.defaultBranch,
        name: `${repo.name} ${tag.name}`,
        draft: false,
        prerelease: index > 2,
        authorLogin: tag.authorLogin,
        createdAt: tag.date,
        publishedAt: tag.date,
        body: buildReleaseNotes(repo, tag.name, index),
        assets: [
          { id: `as-${repo.fullName}-${index}-1`, name: `${repo.name}-${tag.name}.tar.gz`, size: randomInt(rng, 240000, 4200000), downloads: randomInt(rng, 20, 3400), contentType: 'application/gzip', createdAt: tag.date },
          { id: `as-${repo.fullName}-${index}-2`, name: `${repo.name}-${tag.name}-static.zip`, size: randomInt(rng, 400000, 6200000), downloads: randomInt(rng, 10, 1900), contentType: 'application/zip', createdAt: tag.date },
          { id: `as-${repo.fullName}-${index}-3`, name: 'sbom.spdx.json', size: randomInt(rng, 12000, 84000), downloads: randomInt(rng, 2, 400), contentType: 'application/json', createdAt: tag.date },
          { id: `as-${repo.fullName}-${index}-4`, name: 'attestation.json', size: randomInt(rng, 1200, 8000), downloads: randomInt(rng, 1, 90), contentType: 'application/json', createdAt: tag.date },
        ],
        reactions: rng() > 0.5 ? { hooray: randomInt(rng, 2, 40), '+1': randomInt(rng, 1, 30) } : {},
        latest: isLatest,
      });
    });
  });
  return out;
}

function buildReleaseNotes(repo, tag, index) {
  const changes = [
    'Command palette indexes settings sections',
    'Split diff pairs deletions with additions',
    'Merge queue with configurable concurrency',
    'Crimson theme raises diff deletion contrast',
    'Wiki supports AsciiDoc and reStructuredText',
    'Blame collapses adjacent lines from one commit',
    'Relative time respects the selected time zone',
    'Actions: re-run failed jobs only',
  ];
  const picked = changes.slice(index * 2, index * 2 + 4);
  return `## ${tag}\n\n${repo.name} ${tag} is available now. This is a ${index === 0 ? 'stable' : 'pre-'}release cut from \`${repo.defaultBranch}\`.\n\n### Added\n\n${picked.map((c) => `- ${c}`).join('\n')}\n\n### Fixed\n\n- Focus ring restored in the high contrast themes\n- Toast announcements are no longer duplicated by screen readers\n- File finder debounces input at 160ms\n\n### Upgrade\n\n\`\`\`bash\ngit fetch --tags\ngit switch ${tag}\nnode server.mjs --port 3000\n\`\`\`\n\n**Full changelog**: [/${repo.fullName}/compare/${index > 0 ? 'previous' : 'v0.0.0'}...${tag}](/${repo.fullName}/compare/${tag})\n`;
}

function buildWikiPages(repos, users) {
  const pages = [];
  const history = [];
  repos.filter((r) => r.hasWiki).forEach((repo) => {
    const rng = rngFor(`wiki:${repo.fullName}`);
    const repoPages = [];
    WIKI.set(repo.fullName, repoPages);
    const set = repo.primary ? WIKI_PAGES : [
      { title: 'Home', format: 'markdown', body: genericReadme(repo.name, repo.description, repo.ownerLogin) },
      { title: 'Getting started', format: 'markdown', body: `# Getting started with ${repo.name}\n\n\`\`\`bash\ngit clone /${repo.fullName}.git\ncd ${repo.name}\n\`\`\`\n\nSee the [README](/${repo.fullName}) for details.` },
      { title: 'FAQ', format: 'markdown', body: `# FAQ\n\n## Is this repository archived?\n\nNo. ${repo.name} is actively maintained by @${repo.ownerLogin}.` },
    ];
    set.forEach((page, index) => {
      const id = `w-${repo.fullName}-${slugTitle(page.title)}`;
      const record = {
        id,
        repoFullName: repo.fullName,
        title: page.title,
        slug: slugTitle(page.title),
        format: page.format || 'markdown',
        body: page.body,
        authorLogin: pick(rng, users.map((u) => u.login)),
        createdAt: ago((index + 1) * randomInt(rng, 20, 200) * DAY),
        updatedAt: ago(randomInt(rng, 1, 90) * DAY),
      };
      pages.push(record);
      repoPages.push(record);
      const revisions = randomInt(rng, 2, 6);
      for (let r = 0; r < revisions; r += 1) {
        history.push({
          id: `wh-${id}-${r}`,
          pageId: id,
          repoFullName: repo.fullName,
          title: page.title,
          authorLogin: pick(rng, users.map((u) => u.login)),
          message: pick(rng, ['Copy edit', 'Add the HTML structure table', 'Update for 4.2', 'Fix internal links', 'Expand the FAQ']),
          createdAt: ago((r + 1) * randomInt(rng, 5, 60) * DAY),
        });
      }
    });
  });
  return { pages, history };
}

/**
 * Old/new file content pairs for every pull request, so the diff view has real
 * material to chew on. Hand-written sources come from data/files.js; everything
 * else is derived from the repository tree by trimming and rewriting a few lines.
 */
function buildPrDiffs(repos, pullRequests) {
  PR_DIFFS.clear();
  const out = PR_DIFFS;
  pullRequests.forEach((pr) => {
    const repo = repos.find((r) => r.fullName === pr.repoFullName);
    const sources = PR_DIFF_SOURCES[pr.headBranch];
    if (sources) {
      out.set(pr.id, Object.keys(sources.new).map((path) => ({
        path,
        oldContent: sources.old[path] != null ? sources.old[path] : '',
        newContent: sources.new[path],
        status: sources.old[path] == null ? 'added' : 'modified',
      })));
      return;
    }
    const repoFiles = (CONTENT.get(repo.fullName) || {}).files || [];
    const files = repoFiles.filter((f) => !f.binary && f.content.length < 4000).slice(0, Math.max(1, Math.min(pr.changedFiles || 2, 4)));
    const rng = rngFor(`prdiff:${pr.id}`);
    out.set(pr.id, files.map((file, index) => {
      const lines = file.content.split('\n');
      const at = Math.max(1, Math.min(lines.length - 2, randomInt(rng, 1, lines.length - 1)));
      const next = lines.slice();
      const added = [
        `// ${pr.title}`,
        `if (!isSupported('${file.name}')) {`,
        '  throw new Error(`unsupported: ${file.name}`);',
        '}',
      ];
      next.splice(at, 0, ...added);
      if (index === 0 && lines.length > 4) next.splice(2, 2);
      return { path: file.path, oldContent: file.content, newContent: next.join('\n'), status: 'modified' };
    }));
    if (!out.get(pr.id).length) {
      out.set(pr.id, [{
        path: 'README.md',
        oldContent: `# ${repo.name}\n`,
        newContent: `# ${repo.name}\n\n${pr.title}.\n`,
        status: 'modified',
      }]);
    }
  });
  return out;
}

function slugTitle(title) {
  return String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function buildNotifications(users, issues, prs) {
  const out = [];
  const rng = rngFor('notifications');
  const login = 'octored';
  const items = [
    ...issues.filter((i) => i.repoFullName === 'octored/redget-core').slice(0, 12).map((i) => ({ target: i, kind: 'issue' })),
    ...prs.filter((p) => p.repoFullName === 'octored/redget-core').slice(0, 8).map((p) => ({ target: p, kind: 'pull' })),
  ];
  items.forEach((item, index) => {
    const reason = pick(rng, ['participating', 'mention', 'review_requested', 'assign', 'author', 'comment', 'state_change', 'ci_activity', 'subscribed']);
    out.push({
      id: `n-${index}`,
      userLogin: login,
      repoFullName: item.target.repoFullName,
      type: item.kind === 'issue' ? 'Issue' : 'PullRequest',
      title: item.target.title,
      number: item.target.number,
      reason,
      unread: index < 6,
      updatedAt: ago(index * randomInt(rng, 3, 40) * HOUR),
      lastReadAt: index < 6 ? null : ago(index * DAY),
      url: item.kind === 'issue'
        ? `/${item.target.repoFullName}/issues/${item.target.number}`
        : `/${item.target.repoFullName}/pull/${item.target.number}`,
      pinned: index === 3,
      repository: { fullName: item.target.repoFullName, visibility: 'public' },
    });
  });
  // A few org and discussion notifications.
  out.push({
    id: 'n-org-1', userLogin: login, repoFullName: 'crimson-collective/crimson-ui', type: 'Discussion',
    title: 'Should the default theme be dark or crimson?', number: 2, reason: 'subscribed', unread: true,
    updatedAt: ago(2 * HOUR), lastReadAt: null, url: '/crimson-collective/crimson-ui/discussions/2', pinned: false,
    repository: { fullName: 'crimson-collective/crimson-ui', visibility: 'public' },
  });
  out.push({
    id: 'n-rel-1', userLogin: login, repoFullName: 'octored/redget-core', type: 'Release',
    title: 'redget-core v4.2.0', number: 0, reason: 'release', unread: false,
    updatedAt: ago(4 * DAY), lastReadAt: ago(3 * DAY), url: '/octored/redget-core/releases/tag/v4.2.0', pinned: false,
    repository: { fullName: 'octored/redget-core', visibility: 'public' },
  });
  out.push({
    id: 'n-sec-1', userLogin: login, repoFullName: 'octored/redget-core', type: 'SecurityAdvisory',
    title: 'RGSA-2026-0011 Prototype pollution through the settings merge helper', number: 0, reason: 'security_alert', unread: true,
    updatedAt: ago(20 * HOUR), lastReadAt: null, url: '/octored/redget-core/security/advisories/RGSA-2026-0011', pinned: false,
    repository: { fullName: 'octored/redget-core', visibility: 'public' },
  });
  void users;
  return out;
}

function buildTraffic(repos) {
  const out = {};
  repos.forEach((repo) => {
    const rng = rngFor(`traffic:${repo.fullName}`);
    const days = [];
    for (let i = 13; i >= 0; i -= 1) {
      days.push({
        date: ago(i * DAY).slice(0, 10),
        views: randomInt(rng, 40, repo.primary ? 2400 : 320),
        uniques: randomInt(rng, 8, repo.primary ? 620 : 90),
        clones: randomInt(rng, 2, repo.primary ? 220 : 30),
        cloneUniques: randomInt(rng, 1, repo.primary ? 70 : 12),
      });
    }
    out[repo.fullName] = {
      days,
      popularContent: [
        { path: `/${repo.fullName}`, title: repo.name, views: randomInt(rng, 200, 3000), uniques: randomInt(rng, 40, 900) },
        { path: `/${repo.fullName}/issues`, title: 'Issues', views: randomInt(rng, 80, 900), uniques: randomInt(rng, 20, 300) },
        { path: `/${repo.fullName}/blob/main/README.md`, title: 'README.md', views: randomInt(rng, 60, 700), uniques: randomInt(rng, 15, 250) },
        { path: `/${repo.fullName}/actions`, title: 'Actions', views: randomInt(rng, 30, 400), uniques: randomInt(rng, 8, 140) },
        { path: `/${repo.fullName}/wiki`, title: 'Wiki', views: randomInt(rng, 10, 260), uniques: randomInt(rng, 4, 90) },
      ],
      referrers: [
        { referrer: 'redget.local', count: randomInt(rng, 40, 900), uniques: randomInt(rng, 10, 300) },
        { referrer: 'search', count: randomInt(rng, 20, 500), uniques: randomInt(rng, 8, 200) },
        { referrer: 'newsletter', count: randomInt(rng, 5, 120), uniques: randomInt(rng, 3, 60) },
        { referrer: 'social', count: randomInt(rng, 2, 90), uniques: randomInt(rng, 1, 40) },
      ],
    };
  });
  return out;
}

function buildProjectsData(repos, issues, prs) {
  const items = [];
  const rng = rngFor('projects');
  const primary = repos.find((r) => r.primary);
  const statuses = ['s-backlog', 's-todo', 's-progress', 's-review', 's-done'];
  const priorities = ['p-low', 'p-med', 'p-high'];
  issues.filter((i) => i.repoFullName === primary.fullName).slice(0, 14).forEach((issue, index) => {
    items.push({
      id: `pi-${index}`,
      projectId: 'p1',
      type: 'issue',
      ref: `${issue.repoFullName}#${issue.number}`,
      title: issue.title,
      repoFullName: issue.repoFullName,
      number: issue.number,
      fields: {
        'f-status': issue.state === 'closed' ? 's-done' : statuses[index % 4],
        'f-priority': priorities[index % 3],
        'f-iteration': `iter-${Math.floor(index / 4)}`,
        'f-effort': randomInt(rng, 1, 8),
        'f-notes': '',
      },
      archived: false,
      updatedAt: issue.updatedAt,
    });
  });
  prs.filter((p) => p.repoFullName === primary.fullName).slice(0, 8).forEach((pr, index) => {
    items.push({
      id: `pp-${index}`,
      projectId: 'p1',
      type: 'pull',
      ref: `${pr.repoFullName}#${pr.number}`,
      title: pr.title,
      repoFullName: pr.repoFullName,
      number: pr.number,
      fields: {
        'f-status': pr.merged ? 's-done' : pr.draft ? 's-backlog' : 's-review',
        'f-priority': priorities[(index + 1) % 3],
        'f-iteration': `iter-${Math.floor(index / 3)}`,
        'f-effort': randomInt(rng, 1, 5),
        'f-notes': '',
      },
      archived: false,
      updatedAt: pr.updatedAt,
    });
  });
  items.push({
    id: 'pd-0', projectId: 'p1', type: 'draft', ref: null,
    title: 'Draft the 4.3 release notes', repoFullName: null, number: null,
    fields: { 'f-status': 's-todo', 'f-priority': 'p-med', 'f-iteration': 'iter-0', 'f-effort': 2, 'f-notes': 'Pull from conventional commits.' },
    archived: false, updatedAt: ago(2 * DAY),
  });
  items.push({
    id: 'pd-1', projectId: 'p1', type: 'note', ref: null,
    title: 'Standup: queue semantics still open', repoFullName: null, number: null,
    fields: { 'f-status': 's-backlog', 'f-priority': 'p-low', 'f-iteration': 'iter-1', 'f-effort': 1, 'f-notes': '' },
    archived: false, updatedAt: ago(6 * DAY),
  });

  const iterations = [];
  for (let i = 0; i < 6; i += 1) {
    iterations.push({
      id: `iter-${i}`,
      title: `Iteration ${i + 1}`,
      startDate: ago((4 - i) * 14 * DAY).slice(0, 10),
      duration: 14,
    });
  }

  const auditItems = [
    { id: 'pa-0', title: 'Focus ring visible in all five themes', fields: { 'f-status': 's-todo', 'f-wcag': '2.4.11 Focus Appearance' } },
    { id: 'pa-1', title: 'Menus implement roving tabindex', fields: { 'f-status': 's-done', 'f-wcag': '2.1.1 Keyboard' } },
    { id: 'pa-2', title: 'Live regions announce once', fields: { 'f-status': 's-done', 'f-wcag': '4.1.3 Status Messages' } },
    { id: 'pa-3', title: 'Diff table has a caption and scoped headers', fields: { 'f-status': 's-backlog', 'f-wcag': '1.3.1 Info and Relationships' } },
    { id: 'pa-4', title: 'Contrast ratio ≥ 7:1 in high contrast themes', fields: { 'f-status': 's-todo', 'f-wcag': '1.4.6 Contrast (Enhanced)' } },
    { id: 'pa-5', title: 'Dialog restores focus to the opener', fields: { 'f-status': 's-done', 'f-wcag': '2.4.3 Focus Order' } },
  ].map((item) => ({ ...item, projectId: 'p2', type: 'draft', ref: null, repoFullName: null, number: null, archived: false, updatedAt: ago(randomInt(rng, 1, 20) * DAY) }));

  return { items: [...items, ...auditItems], iterations };
}

function buildGists() {
  return GIST_SEEDS.map((seed, index) => ({
    id: shortId(16, `gist:${index}`),
    ownerLogin: index % 2 === 0 ? 'octored' : 'crimsonfox',
    description: seed.description,
    public: seed.public,
    comments: seed.comments,
    stars: seed.stars,
    createdAt: ago((index + 1) * 40 * DAY),
    updatedAt: ago((index + 1) * 6 * DAY),
    files: seed.files.map((name) => ({
      name,
      language: name.endsWith('.lua') ? 'Lua' : name.endsWith('.mjs') ? 'JavaScript' : name.endsWith('.js') ? 'JavaScript' : name.endsWith('.patch') ? 'Diff' : 'INI',
      size: 400 + index * 120,
      content: gistContent(name),
    })),
  }));
}

function gistContent(name) {
  if (name.endsWith('.lua')) {
    return `-- Crimson statusline for neovim\nlocal M = {}\n\nlocal colors = {\n  bg = '#0a0a0c',\n  fg = '#f0ecec',\n  accent = '#d61a2f',\n  muted = '#a29a9c',\n}\n\nfunction M.render()\n  return table.concat({\n    '%#StatusAccent# REDGET ',\n    '%#StatusFile# %t ',\n    '%#StatusMuted# %= %l:%c ',\n  }, '')\nend\n\nreturn M\n`;
  }
  if (name.endsWith('.mjs')) {
    return `// Validate every internal route in a static site\nimport { readFileSync } from 'node:fs';\n\nconst patterns = JSON.parse(readFileSync('./routes.json', 'utf8'));\nconst links = new Set();\n\nfor (const file of process.argv.slice(2)) {\n  const html = readFileSync(file, 'utf8');\n  for (const match of html.matchAll(/href="([^"]+)"/g)) {\n    if (!/^https?:/.test(match[1])) links.add(match[1]);\n  }\n}\n\nconst unresolved = [...links].filter((link) => !matches(patterns, link));\nif (unresolved.length) {\n  console.error('Unresolved routes:', unresolved);\n  process.exit(1);\n}\n\nfunction matches(list, link) {\n  return list.some((pattern) => toRegExp(pattern).test(link));\n}\n\nfunction toRegExp(pattern) {\n  const body = pattern\n    .split('/')\n    .map((seg) => (seg.startsWith(':') ? (seg.endsWith('*') ? '.*' : '[^/]+') : seg.replace(/[.*+?^\${}()|[\\]\\\\]/g, '\\\\$&')))\n    .join('/');\n  return new RegExp(\`^\${body}$\`);\n}\n`;
  }
  if (name.endsWith('.js')) {
    return `// Focus trap without a library\nexport function trap(container) {\n  const selector = 'a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])';\n  function onKeydown(event) {\n    if (event.key !== 'Tab') return;\n    const items = [...container.querySelectorAll(selector)];\n    if (!items.length) return event.preventDefault();\n    const first = items[0];\n    const last = items[items.length - 1];\n    if (event.shiftKey && document.activeElement === first) {\n      event.preventDefault();\n      last.focus();\n    } else if (!event.shiftKey && document.activeElement === last) {\n      event.preventDefault();\n      first.focus();\n    }\n  }\n  container.addEventListener('keydown', onKeydown);\n  return () => container.removeEventListener('keydown', onKeydown);\n}\n`;
  }
  if (name.endsWith('.patch')) {
    return `diff --git a/assets/css/tokens.css b/assets/css/tokens.css\nindex 1a2b3c4..5d6e7f8 100644\n--- a/assets/css/tokens.css\n+++ b/assets/css/tokens.css\n@@ -12,9 +12,9 @@\n [data-theme="dark"] {\n-  --accent: #0969da;\n-  --fg-link: #58a6ff;\n-  --border-accent: #1f6feb;\n+  --accent: #d61a2f;\n+  --fg-link: #ff5f6d;\n+  --border-accent: #d61a2f;\n }\n`;
  }
  return `# Crimson tmux palette\nset -g status-style "bg=#0a0a0c,fg=#f0ecec"\nset -g window-status-current-style "bg=#d61a2f,fg=#ffffff,bold"\nset -g pane-active-border-style "fg=#d61a2f"\nset -g message-style "bg=#140406,fg=#ff8090"\n`;
}

function buildCodespaces() {
  return [
    { name: 'octored-redget-core-4f2a', repoFullName: 'octored/redget-core', branch: 'feature/split-diff-alignment', state: 'available', machine: '8-core/32GB', region: 'eu-west', createdAt: ago(3 * DAY), lastUsedAt: ago(2 * HOUR), url: '/codespaces/octored-redget-core-4f2a' },
    { name: 'octored-redget-core-91cd', repoFullName: 'octored/redget-core', branch: 'main', state: 'shutdown', machine: '4-core/16GB', region: 'eu-west', createdAt: ago(21 * DAY), lastUsedAt: ago(6 * DAY), url: '/codespaces/octored-redget-core-91cd' },
    { name: 'crimsonfox-redql-22ab', repoFullName: 'crimson-collective/redql', branch: 'main', state: 'available', machine: '16-core/64GB', region: 'us-east', createdAt: ago(9 * DAY), lastUsedAt: ago(40 * MINUTE), url: '/codespaces/crimsonfox-redql-22ab' },
  ];
}

function buildEvents(repos, users, issues, prs) {
  const out = [];
  const rng = rngFor('events');
  const kinds = ['PushEvent', 'WatchEvent', 'CreateEvent', 'IssuesEvent', 'PullRequestEvent', 'ForkEvent', 'ReleaseEvent', 'DiscussionEvent'];
  for (let i = 0; i < 24; i += 1) {
    const actor = pick(rng, users);
    const repo = pick(rng, repos);
    const kind = pick(rng, kinds);
    out.push({
      id: `e-${i}`,
      kind,
      actorLogin: actor.login,
      repoFullName: repo.fullName,
      createdAt: ago(i * randomInt(rng, 2, 30) * HOUR),
      title: eventTitle(kind, repo, issues, prs, rng),
      url: eventUrl(kind, repo),
      public: repo.visibility === 'public',
    });
  }
  return out.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function eventTitle(kind, repo, issues, prs, rng) {
  switch (kind) {
    case 'PushEvent': return `pushed ${randomInt(rng, 1, 6)} commits to ${repo.defaultBranch}`;
    case 'WatchEvent': return `starred ${repo.name}`;
    case 'CreateEvent': return `created a branch in ${repo.name}`;
    case 'IssuesEvent': {
      const issue = pick(rng, issues.filter((i) => i.repoFullName === repo.fullName)) || issues[0];
      return issue ? `opened ${repo.name}#${issue.number} ${issue.title}` : `opened an issue in ${repo.name}`;
    }
    case 'PullRequestEvent': {
      const pr = pick(rng, prs.filter((p) => p.repoFullName === repo.fullName)) || prs[0];
      return pr ? `opened ${repo.name}#${pr.number} ${pr.title}` : `opened a pull request`;
    }
    case 'ForkEvent': return `forked ${repo.name}`;
    case 'ReleaseEvent': return `published a release in ${repo.name}`;
    case 'DiscussionEvent': return `started a discussion in ${repo.name}`;
    default: return `updated ${repo.name}`;
  }
}

function eventUrl(kind, repo) {
  switch (kind) {
    case 'IssuesEvent': return `/${repo.fullName}/issues`;
    case 'PullRequestEvent': return `/${repo.fullName}/pulls`;
    case 'ReleaseEvent': return `/${repo.fullName}/releases`;
    case 'DiscussionEvent': return `/${repo.fullName}/discussions`;
    default: return `/${repo.fullName}`;
  }
}

function buildSavedReplies() {
  return [
    { id: 'sr-0', title: 'Needs reproduction', body: 'Thanks for the report! I could not reproduce this on the crimson theme at 1280px. Could you share your browser, viewport size and theme?\n\n1. Open `/octored/redget-core`\n2. Press <kbd>?</kbd> and paste the shortcut table if relevant' },
    { id: 'sr-1', title: 'Works as designed', body: 'This behaviour is intentional and documented in the wiki page [[Accessibility contract]]. If you think the contract is wrong, please open a discussion first.' },
    { id: 'sr-2', title: 'Approval with nits', body: 'LGTM 🚀 — one nit inline, but it does not block merging.' },
    { id: 'sr-3', title: 'Request changes: a11y', body: 'Thanks for this! Before it merges we need:\n\n- [ ] an accessible name on the new control\n- [ ] a visible focus ring in all five themes\n- [ ] a keyboard path that reaches every new affordance' },
  ];
}

function buildBranchProtection(repos) {
  return repos.filter((r) => r.visibility !== 'private').map((repo) => ({
    repoFullName: repo.fullName,
    rules: [
      {
        id: `bp-${repo.name}-main`,
        pattern: repo.defaultBranch,
        requiredReviews: repo.primary ? 2 : 1,
        dismissStaleReviews: true,
        requireCodeOwnerReviews: repo.primary,
        requireLastPushApproval: true,
        requiredStatusChecks: repo.primary ? ['validate', 'build', 'a11y-audit'] : ['validate'],
        strictStatusChecks: true,
        requireSignedCommits: false,
        requireLinearHistory: repo.primary,
        allowForcePushes: false,
        allowDeletions: false,
        requiredDeployments: repo.primary ? ['staging'] : [],
        enforceAdmins: false,
        restrictions: { users: [], teams: repo.primary ? ['core'] : [] },
        pushRules: { maxFileSize: 100, blockForcePush: true, requireWorktree: false },
      },
      ...(repo.primary ? [{
        id: `bp-${repo.name}-release`,
        pattern: 'release/**',
        requiredReviews: 1,
        dismissStaleReviews: true,
        requireCodeOwnerReviews: false,
        requireLastPushApproval: false,
        requiredStatusChecks: ['validate'],
        strictStatusChecks: true,
        requireSignedCommits: true,
        requireLinearHistory: true,
        allowForcePushes: false,
        allowDeletions: false,
        requiredDeployments: [],
        enforceAdmins: true,
        restrictions: { users: [], teams: ['core'] },
        pushRules: { maxFileSize: 50, blockForcePush: true, requireWorktree: true },
      }] : []),
    ],
    rulesets: repo.primary ? [
      { id: 'rs-1', name: 'Protected branches', target: 'branch', enforcement: 'active', conditions: { refName: ['refs/heads/main', 'refs/heads/release/**'] }, rules: ['deletion', 'non_fast_forward', 'required_signatures', 'pull_request'], bypassActors: ['Repository admin'], createdAt: ago(200 * DAY) },
      { id: 'rs-2', name: 'Tag protection', target: 'tag', enforcement: 'active', conditions: { refName: ['refs/tags/v*'] }, rules: ['deletion', 'creation'], bypassActors: [], createdAt: ago(180 * DAY) },
      { id: 'rs-3', name: 'Push rules (evaluated)', target: 'push', enforcement: 'evaluate', conditions: {}, rules: ['max_file_size', 'commit_message_pattern'], bypassActors: ['Organization admin'], createdAt: ago(40 * DAY) },
    ] : [],
  }));
}

function buildDeployKeys() {
  return [
    { id: 'dk-0', repoFullName: 'octored/redget-core', title: 'ci-readonly', key: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDcrimson0readonlyKeyMaterial0000000000000000000000000 redget@runner', readOnly: true, verified: true, createdAt: ago(120 * DAY) },
    { id: 'dk-1', repoFullName: 'octored/redget-core', title: 'pages-deploy', key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICrimsonPagesDeploy0000000000000000000000 pages@redget.local', readOnly: false, verified: true, createdAt: ago(60 * DAY) },
  ];
}

function buildAuditLog() {
  const rng = rngFor('audit');
  const actions = [
    'repo.create', 'repo.destroy', 'repo.access', 'repo.add_member', 'repo.remove_member',
    'git.push', 'git.clone', 'branch_policy.update', 'protected_branch.create',
    'org.add_member', 'org.remove_member', 'org.update_member', 'team.create', 'team.destroy',
    'oauth_application.create', 'personal_access_token.create', 'personal_access_token.revoked',
    'secret_scanning.push_protection.disable', 'dependabot.alerts.enable',
    'workflows.approve_deploy', 'codespaces.create', 'codespaces.delete',
    'billing.change_plan', 'sso_session.authorize', 'two_factor_authentication.enable',
  ];
  const actors = ['octored', 'crimsonfox', 'ironvale', 'ember', 'scarletui', 'redget-bot'];
  const out = [];
  for (let i = 0; i < 40; i += 1) {
    const action = pick(rng, actions);
    out.push({
      id: `al-${i}`,
      action,
      actorLogin: pick(rng, actors),
      orgLogin: rng() > 0.5 ? 'crimson-collective' : 'redget-collective',
      repoFullName: rng() > 0.4 ? 'octored/redget-core' : 'crimson-collective/crimson-ui',
      ip: `10.0.${randomInt(rng, 0, 40)}.${randomInt(rng, 2, 250)}`,
      location: pick(rng, ['Chișinău, MD', 'Berlin, DE', 'Lisbon, PT', 'Toronto, CA', 'Seoul, KR']),
      createdAt: ago(i * randomInt(rng, 3, 60) * HOUR),
      result: rng() > 0.9 ? 'failure' : 'success',
      userAgent: pick(rng, ['RedGet Web', 'rgt/1.14.2', 'RedGet Desktop 4.2.0', 'RedGet Actions']),
    });
  }
  return out;
}

function buildCommunityHealth(repo) {
  return {
    healthPercentage: 88,
    files: {
      codeOfConduct: { name: 'CODE_OF_CONDUCT.md', url: `/${repo.fullName}/blob/main/CODE_OF_CONDUCT.md` },
      codeowners: { name: 'CODEOWNERS', url: `/${repo.fullName}/blob/main/CODEOWNERS` },
      contributing: { name: 'CONTRIBUTING.md', url: `/${repo.fullName}/blob/main/CONTRIBUTING.md` },
      funding: { name: 'FUNDING.yml', url: `/${repo.fullName}/blob/main/FUNDING.yml` },
      issueTemplate: { name: '.redget/ISSUE_TEMPLATE', url: `/${repo.fullName}/tree/main/.redget/ISSUE_TEMPLATE` },
      pullRequestTemplate: { name: '.redget/PULL_REQUEST_TEMPLATE.md', url: `/${repo.fullName}/blob/main/.redget/PULL_REQUEST_TEMPLATE.md` },
      license: { name: 'LICENSE', url: `/${repo.fullName}/blob/main/LICENSE` },
      readme: { name: 'README.md', url: `/${repo.fullName}/blob/main/README.md` },
      securityPolicy: { name: 'SECURITY.md', url: `/${repo.fullName}/blob/main/SECURITY.md` },
      citation: { name: 'CITATION.cff', url: `/${repo.fullName}/blob/main/CITATION.cff` },
    },
    updatedAt: ago(6 * DAY),
  };
}

/* ==========================================================================
   Assemble the database
   ========================================================================== */

export function buildDatabase() {
  const users = buildUsers();
  const orgs = buildOrgs(users);
  const teams = buildTeams();
  const repos = buildRepos();
  const labels = buildLabels();
  const milestones = buildMilestones();

  const content = new Map();
  repos.forEach((repo) => { content.set(repo.fullName, buildRepoContent(repo, users)); });

  const allCommits = [];
  const allBranches = [];
  const allTags = [];
  content.forEach((value, fullName) => {
    allCommits.push(...value.commits);
    allBranches.push(...value.branches);
    allTags.push(...value.tags);
  });

  const { issues, comments, reactions, timeline } = buildIssues(repos, users, labels, milestones);
  const { pullRequests, reviews, threads, checks } = buildPullRequests(repos, users, issues, labels);
  const workflows = buildWorkflows(repos);
  const { runs, jobs } = buildRuns(repos, workflows, users);
  const releases = buildReleases(repos, users, allTags);
  const { pages: wikiPages, history: wikiHistory } = buildWikiPages(repos, users);
  const notifications = buildNotifications(users, issues, pullRequests);
  const traffic = buildTraffic(repos);
  const { items: projectItems, iterations } = buildProjectsData(repos, issues, pullRequests);
  const events = buildEvents(repos, users, issues, pullRequests);
  const protection = buildBranchProtection(repos);

  // Per-repository counts derived from the generated entities.
  repos.forEach((repo) => {
    repo.openIssues = issues.filter((i) => i.repoFullName === repo.fullName && i.state === 'open').length;
    repo.closedIssues = issues.filter((i) => i.repoFullName === repo.fullName && i.state === 'closed').length;
    repo.openPulls = pullRequests.filter((p) => p.repoFullName === repo.fullName && p.state === 'open').length;
    repo.closedPulls = pullRequests.filter((p) => p.repoFullName === repo.fullName && p.state === 'closed' && !p.merged).length;
    repo.mergedPulls = pullRequests.filter((p) => p.repoFullName === repo.fullName && p.merged).length;
    repo.discussionCount = repo.hasDiscussions ? DISCUSSION_SEEDS.length : 0;
    repo.commitCount = allCommits.filter((c) => c.repoFullName === repo.fullName).length;
    repo.branchCount = allBranches.filter((b) => b.repoFullName === repo.fullName).length;
    repo.tagCount = allTags.filter((t) => t.repoFullName === repo.fullName).length;
    repo.releaseCount = releases.filter((r) => r.repoFullName === repo.fullName).length;
    repo.contributors = Array.from(new Set(
      allCommits.filter((c) => c.repoFullName === repo.fullName).map((c) => c.authorLogin)
    ));
    repo.community = buildCommunityHealth(repo);
    repo.scorecard = {
      score: repo.primary ? 8.6 : Number((4 + (hashString(repo.fullName) % 50) / 10).toFixed(1)),
      checks: [
        { name: 'Branch-Protection', score: repo.primary ? 8 : 4, reason: repo.primary ? 'branch protection enabled on main and release/**' : 'partial protection' },
        { name: 'Code-Review', score: 9, reason: 'all changes reviewed before merge' },
        { name: 'Dependency-Update-Tool', score: 10, reason: 'Dependabot enabled' },
        { name: 'Maintained', score: repo.primary ? 10 : 6, reason: 'commits within the last 90 days' },
        { name: 'Signed-Releases', score: repo.primary ? 9 : 0, reason: repo.primary ? 'releases carry provenance attestations' : 'no signed releases found' },
        { name: 'Vulnerabilities', score: 8, reason: 'no open critical vulnerabilities' },
        { name: 'Security-Policy', score: 10, reason: 'SECURITY.md present' },
        { name: 'Token-Permissions', score: 7, reason: 'workflow tokens are scoped' },
      ],
    };
    repo.sbom = {
      format: 'spdx-2.3',
      components: (repo.languages || []).map((l, index) => ({
        name: `${repo.name}-${l.name.toLowerCase()}`, version: `4.${index}.0`, license: repo.license || 'MIT', type: 'library',
      })),
      generatedAt: ago(3 * DAY),
    };
  });

  const stars = [];
  const watches = [];
  const forks = [];
  const follows = [];
  const pinned = [];
  repos.forEach((repo, repoIndex) => {
    const rng = rngFor(`stars:${repo.fullName}`);
    const stargazers = pickMany(rng, users.map((u) => u.login), Math.min(users.length, 8));
    stargazers.forEach((login, index) => {
      stars.push({ repoFullName: repo.fullName, userLogin: login, starredAt: ago((index + 1) * randomInt(rng, 1, 40) * DAY) });
    });
    if (repoIndex % 2 === 0) {
      watches.push({ repoFullName: repo.fullName, userLogin: 'octored', level: repoIndex === 0 ? 'all' : 'participating', ignored: false });
    }
    const forkers = pickMany(rng, users.map((u) => u.login), Math.min(users.length, 4));
    forkers.forEach((login, index) => {
      forks.push({ repoFullName: repo.fullName, userLogin: login, createdAt: ago((index + 1) * randomInt(rng, 2, 90) * DAY) });
    });
  });
  users.slice(0, 9).forEach((user, index) => {
    follows.push({ userLogin: 'octored', followsLogin: user.login, createdAt: ago((index + 1) * 12 * DAY) });
    if (index % 2 === 0) follows.push({ userLogin: user.login, followsLogin: 'octored', createdAt: ago((index + 2) * 9 * DAY) });
  });
  pinned.push(
    { userLogin: 'octored', repoFullName: 'octored/redget-core' },
    { userLogin: 'octored', repoFullName: 'octored/redget-cli' },
    { userLogin: 'octored', repoFullName: 'crimson-collective/crimson-ui' },
    { userLogin: 'octored', repoFullName: 'crimson-collective/redql' },
    { userLogin: 'crimsonfox', repoFullName: 'crimson-collective/actions-runner' },
    { userLogin: 'crimsonfox', repoFullName: 'crimson-collective/redql' },
  );

  const discussions = DISCUSSION_SEEDS.map((seed, index) => ({
    id: `d-${index}`,
    repoFullName: index < 4 ? 'octored/redget-core' : 'crimson-collective/crimson-ui',
    number: index + 1,
    title: seed.title,
    category: seed.category,
    body: `## ${seed.title}\n\n${seed.category === 'Q&A' ? 'Question from the community.' : 'Discussion starter with the context and the proposal.'}\n\n- Point one\n- Point two\n- Point three\n`,
    authorLogin: index % 2 === 0 ? 'octored' : 'velvetbyte',
    comments: seed.comments,
    upvotes: seed.upvotes,
    answered: seed.answered,
    locked: false,
    createdAt: ago((index + 1) * 14 * DAY),
    updatedAt: ago((index + 1) * 2 * DAY),
    poll: seed.category === 'Polls' ? {
      question: 'Which wiki format do you actually use?',
      options: [
        { id: 'o1', text: 'Markdown', votes: 142 },
        { id: 'o2', text: 'AsciiDoc', votes: 31 },
        { id: 'o3', text: 'reStructuredText', votes: 18 },
        { id: 'o4', text: 'MediaWiki', votes: 7 },
      ],
      voters: ['octored', 'velvetbyte'],
    } : null,
  }));

  const advisories = ADVISORY_SEEDS.map((seed, index) => ({
    ...seed,
    repoFullName: 'octored/redget-core',
    id: seed.id,
    cwe: ['CWE-79', 'CWE-22', 'CWE-1321'][index],
    vector: index === 1 ? 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N' : 'CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:N',
    url: `/octored/redget-core/security/advisories/${seed.id}`,
    identifiers: seed.cve ? [{ type: 'CVE', value: seed.cve }, { type: 'GHSA', value: seed.id.toLowerCase() }] : [{ type: 'GHSA', value: seed.id.toLowerCase() }],
    references: [`/octored/redget-core/commit/${shortId(40, `adv:${index}`)}`, `/octored/redget-core/security`],
  }));

  const dependabotAlerts = DEPENDABOT_SEEDS.map((seed, index) => ({
    ...seed,
    id: `dep-${index}`,
    number: index + 1,
    repoFullName: index < 3 ? 'octored/redget-core' : index === 3 ? 'crimson-collective/redql' : index === 4 ? 'crimson-collective/actions-runner' : 'octored/redget-core',
    url: `/${index < 3 ? 'octored/redget-core' : index === 3 ? 'crimson-collective/redql' : 'crimson-collective/actions-runner'}/security/dependabot/${index + 1}`,
    dismissedAt: seed.state === 'dismissed' ? ago(randomInt(rngFor(`dep:${index}`), 1, 40) * DAY) : null,
    dismissedReason: seed.state === 'dismissed' ? 'tolerable_risk' : null,
    fixStartedAt: seed.state === 'fixed' ? ago(4 * DAY) : null,
    autoPullRequest: seed.state === 'open' && index % 2 === 0 ? { number: 100 + index, state: 'open' } : null,
  }));

  const codeScanningAlerts = CODE_SCANNING_SEEDS.map((seed, index) => ({
    ...seed,
    id: `cs-${index}`,
    number: index + 1,
    repoFullName: index < 4 ? 'octored/redget-core' : 'crimson-collective/redql',
    url: `/${index < 4 ? 'octored/redget-core' : 'crimson-collective/redql'}/security/code-scanning/${index + 1}`,
    dismissedReason: seed.state === 'dismissed' ? 'used in tests' : null,
    dismissedAt: seed.state === 'dismissed' ? ago(20 * DAY) : null,
    fixedAt: seed.state === 'fixed' ? ago(30 * DAY) : null,
    instances: [{ ref: 'refs/heads/main', state: seed.state, commitSha: shortId(40, `cs:${index}`) }],
  }));

  const secretScanningAlerts = SECRET_SCANNING_SEEDS.map((seed, index) => ({
    ...seed,
    id: `ss-${index}`,
    number: index + 1,
    repoFullName: 'octored/redget-core',
    url: `/octored/redget-core/security/secret-scanning/${index + 1}`,
    resolvedAt: seed.state === 'resolved' ? ago(80 * DAY) : null,
    dismissedReason: seed.state === 'dismissed' ? 'used_in_tests' : null,
  }));

  const artifacts = runs.flatMap((run) => (run.artifacts || []).map((a) => ({ ...a, runId: run.id, repoFullName: run.repoFullName, workflowName: run.workflowName })));

  const caches = repos.slice(0, 4).flatMap((repo, repoIndex) => [0, 1, 2].map((index) => ({
    id: `cache-${repoIndex}-${index}`,
    repoFullName: repo.fullName,
    key: `build-${['web', 'static', 'bundle'][index]}-${['dark', 'crimson', 'light'][index]}`,
    version: shortId(8, `${repo.fullName}:${index}`),
    branch: repo.defaultBranch,
    size: randomInt(rngFor(`cache:${repo.fullName}:${index}`), 400000, 9000000),
    createdAt: ago((index + 1) * 3 * DAY),
    lastAccessedAt: ago((index + 1) * 5 * HOUR),
    cacheVersion: 'v4',
  })));

  const deployments = repos.slice(0, 5).flatMap((repo) => ENVIRONMENT_SEEDS.slice(0, 2).map((env, index) => ({
    id: `dpl-${repo.name}-${env.name}`,
    repoFullName: repo.fullName,
    environment: env.name,
    state: index === 0 ? 'success' : 'in_progress',
    description: `Deploy ${repo.name} to ${env.name}`,
    creator: 'redget-bot',
    createdAt: ago((index + 1) * randomInt(rngFor(`dpl:${repo.name}`), 2, 40) * HOUR),
    updatedAt: ago(randomInt(rngFor(`dpl2:${repo.name}`), 1, 10) * HOUR),
    url: `/${repo.fullName}/deployments/${env.name}`,
    sha: shortId(40, `deploy:${repo.fullName}:${env.name}`),
    transientEnvironment: env.name === 'preview',
    productionEnvironment: env.name === 'production',
  })));

  const packages = PACKAGE_SEEDS.map((seed, index) => ({
    ...seed,
    id: `pkg-${index}`,
    ownerLogin: index < 2 ? 'octored' : index < 5 ? 'crimson-collective' : 'redget-collective',
    repoFullName: index === 0 ? 'octored/redget-core' : index === 1 ? 'crimson-collective/crimson-ui' : index === 2 ? 'crimson-collective/redql' : index === 3 ? 'crimson-collective/actions-runner' : index === 4 ? 'octored/redget-cli' : 'redget-collective/platform',
    updatedAt: ago((index + 1) * 8 * DAY),
    versions: [seed.latest, `4.${index}.0-rc.1`].map((v, vi) => ({ version: v, publishedAt: ago((vi + 1) * 30 * DAY), size: 480000 + index * 22000 })),
    readme: `# ${seed.name}\n\nA ${seed.type} package published from the RedGet registry.\n\n## Install\n\n\`\`\`bash\nrgt package install ${seed.type}:${seed.name}@${seed.latest}\n\`\`\`\n`,
  }));

  const gists = buildGists();
  const codespaces = buildCodespaces();
  const auditLog = buildAuditLog();
  const savedReplies = buildSavedReplies();

  const sponsors = [
    { id: 'sp-0', login: 'redget-collective', name: 'RedGet Collective', tier: 'Enterprise sponsor', amount: 2500, since: ago(700 * DAY), privacy: 'public', target: 'octored' },
    { id: 'sp-1', login: 'crimsonfox', name: 'Vera Crimson', tier: 'Crimson tier', amount: 25, since: ago(240 * DAY), privacy: 'public', target: 'octored' },
    { id: 'sp-2', login: 'garnet', name: 'Gil Garnet', tier: 'Supporter', amount: 5, since: ago(90 * DAY), privacy: 'private', target: 'octored' },
    { id: 'sp-3', login: 'scarletui', name: 'Sable Scarlet', tier: 'Crimson tier', amount: 25, since: ago(150 * DAY), privacy: 'public', target: 'crimson-collective' },
  ];

  const sponsorTiers = [
    { id: 'tier-1', name: 'Supporter', price: 5, description: 'A coffee a month. You get a thank-you in the changelog.', benefits: ['Changelog thanks'] },
    { id: 'tier-2', name: 'Crimson tier', price: 25, description: 'Profile badge, sponsor-only discussions and early release notes.', benefits: ['Profile badge', 'Sponsor-only discussions', 'Early release notes'] },
    { id: 'tier-3', name: 'Ruby tier', price: 100, description: 'Logo in the README plus a monthly call with the maintainers.', benefits: ['README logo', 'Monthly call', 'Priority triage'] },
    { id: 'tier-4', name: 'Enterprise sponsor', price: 2500, description: 'Named sponsorship, private roadmap access and SLA on security reports.', benefits: ['Private roadmap', 'Security SLA', 'Named sponsorship'] },
  ];

  const achievements = ACHIEVEMENT_SEEDS.map((seed) => ({ ...seed }));

  const issueForms = [
    { id: 'form-0', repoFullName: 'octored/redget-core', name: 'Bug report', description: 'Something in RedGet is broken', file: '.redget/ISSUE_TEMPLATE/bug_report.md', labels: ['bug', 'triage'] },
    { id: 'form-1', repoFullName: 'octored/redget-core', name: 'Feature request', description: 'Propose an improvement', file: '.redget/ISSUE_TEMPLATE/feature_request.md', labels: ['enhancement'] },
    { id: 'form-2', repoFullName: 'octored/redget-core', name: 'Accessibility report', description: 'Keyboard, contrast or screen reader problem', file: '.redget/ISSUE_TEMPLATE/accessibility.yml', labels: ['accessibility'] },
  ];

  const oauthApps = [
    { id: 'oa-0', name: 'Crimson Deploy', clientId: 'rgt_oac_' + shortId(16, 'oa0'), ownerLogin: 'crimson-collective', homepage: '/crimson-collective', callbackUrl: '/oauth/crimson-deploy/callback', secret: shortId(40, 'oasecret0'), createdAt: ago(300 * DAY) },
    { id: 'oa-1', name: 'Wiki Sync', clientId: 'rgt_oac_' + shortId(16, 'oa1'), ownerLogin: 'octored', homepage: '/octored', callbackUrl: '/oauth/wiki-sync/callback', secret: shortId(40, 'oasecret1'), createdAt: ago(120 * DAY) },
  ];

  const redgetApps = [
    { id: 'ga-0', name: 'Merge Guard', slug: 'merge-guard', ownerLogin: 'ironvale', appId: 48210, privateKey: '-----BEGIN RSA PRIVATE KEY-----\n<redacted placeholder>\n-----END RSA PRIVATE KEY-----', webhookSecret: shortId(32, 'gs0'), permissions: { contents: 'write', pullRequests: 'write', checks: 'read' }, events: ['pull_request', 'push', 'check_run'], installations: 34, createdAt: ago(210 * DAY) },
    { id: 'ga-1', name: 'Crimson Lint', slug: 'crimson-lint', ownerLogin: 'crimson-collective', appId: 51984, privateKey: '-----BEGIN RSA PRIVATE KEY-----\n<redacted placeholder>\n-----END RSA PRIVATE KEY-----', webhookSecret: shortId(32, 'gs1'), permissions: { contents: 'read', pullRequests: 'write' }, events: ['pull_request'], installations: 128, createdAt: ago(400 * DAY) },
  ];

  const tokens = [
    { id: 'pat-0', name: 'ci-runner', scopes: ['repo', 'workflow'], lastUsedAt: ago(2 * HOUR), expiresAt: ago(-60 * DAY), createdAt: ago(30 * DAY), fineGrained: true, repositories: ['octored/redget-core'] },
    { id: 'pat-1', name: 'desktop-sync', scopes: ['read:user', 'repo:status'], lastUsedAt: ago(3 * DAY), expiresAt: ago(-120 * DAY), createdAt: ago(200 * DAY), fineGrained: false, repositories: [] },
    { id: 'pat-2', name: 'docs-publish', scopes: ['public_repo', 'pages'], lastUsedAt: ago(20 * DAY), expiresAt: ago(-14 * DAY), createdAt: ago(90 * DAY), fineGrained: true, repositories: ['crimson-collective/crimson-docs'] },
  ];

  const sshKeys = [
    { id: 'ssh-0', title: 'workstation-crimson', key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICrimsonWorkstation0000000000000000000 octavia@redget.local', createdAt: ago(300 * DAY), lastUsedAt: ago(4 * HOUR), verified: true },
    { id: 'ssh-1', title: 'ci-runner-01', key: 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQDcrimsonRunner0000000000000000000000 runner@redget.local', createdAt: ago(140 * DAY), lastUsedAt: ago(2 * DAY), verified: true },
  ];

  const gpgKeys = [
    { id: 'gpg-0', keyId: 'CR1MS0N0KEY00001', createdAt: ago(400 * DAY), expiresAt: ago(-200 * DAY), verified: true, emails: ['octavia@redget.local'], subkeys: 2 },
  ];

  const sessions = [
    { id: 'sess-0', device: 'Chromium on Linux', location: 'Chișinău, MD', ip: '10.0.4.21', lastAccessed: ago(2 * MINUTE), current: true },
    { id: 'sess-1', device: 'RedGet Desktop on macOS', location: 'Chișinău, MD', ip: '10.0.4.22', lastAccessed: ago(5 * HOUR), current: false },
    { id: 'sess-2', device: 'Safari on iOS', location: 'Ungheni, MD', ip: '10.0.7.9', lastAccessed: ago(2 * DAY), current: false },
  ];

  const billing = {
    plan: 'enterprise',
    seats: 42,
    usedSeats: 31,
    actionsMinutes: { included: 3000, used: 1284, multiplier: { linux: 1, windows: 2, macos: 10, larger8: 4 } },
    packagesStorage: { includedGb: 50, usedGb: 12.4 },
    codespacesHours: { included: 180, used: 64.2 },
    lfsStorage: { includedGb: 5, usedGb: 1.1 },
    advancedSecurity: true,
    copilotSeats: 24,
    nextInvoice: ago(-18 * DAY).slice(0, 10),
    monthlySpend: 148.5,
  };

  buildPrDiffs(repos, pullRequests);
  users.forEach((user) => {
    const contributions = buildContributions(user.login);
    CONTRIBUTIONS.set(user.login, contributions);
    user.contributionCount = contributions.reduce((total, day) => total + day.count, 0);
    let longest = 0;
    let current = 0;
    contributions.forEach((day) => {
      current = day.count > 0 ? current + 1 : 0;
      longest = Math.max(longest, current);
    });
    user.longestStreak = longest;
    user.currentStreak = current;
  });
  repos.forEach((repo) => {
    const files = (CONTENT.get(repo.fullName) || {}).files || [];
    repo.fileCount = files.length;
    repo.defaultBranchSha = (allBranches.find((b) => b.repoFullName === repo.fullName && b.name === repo.defaultBranch) || {}).sha || null;
  });

  const db = {
    version: STORAGE.version,
    generatedAt: new Date(REF).toISOString(),
    anchor: REF,
    currentLogin: 'octored',
    users,
    orgs,
    teams,
    memberships: teams.flatMap((team) => team.members.map((login) => ({ teamId: team.id, orgLogin: team.orgLogin, userLogin: login, role: team.privacy === 'secret' ? 'maintainer' : 'member' }))),
    repos,
    branches: allBranches,
    commits: allCommits,
    tags: allTags,
    issues,
    comments,
    reactions,
    timeline,
    labels,
    milestones,
    pullRequests,
    reviews,
    reviewThreads: threads,
    checks,
    workflows,
    runs,
    jobs,
    releases,
    wikiHistory,
    wikiSidebar: WIKI_SIDEBAR,
    wikiFooter: WIKI_FOOTER,
    projects: PROJECT_SEEDS,
    projectItems,
    iterations,
    notifications,
    traffic,
    discussions,
    advisories,
    dependabotAlerts,
    codeScanningAlerts,
    secretScanningAlerts,
    artifacts,
    caches,
    secrets: SECRET_SEEDS.map((seed, index) => ({ ...seed, id: `sec-${index}`, repoFullName: seed.scope === 'repository' || seed.scope === 'environment' ? 'octored/redget-core' : 'crimson-collective' })),
    variables: VARIABLE_SEEDS.map((seed, index) => ({ ...seed, id: `var-${index}`, repoFullName: seed.scope === 'repository' ? 'octored/redget-core' : 'crimson-collective' })),
    runners: RUNNER_SEEDS.map((seed, index) => ({ ...seed, id: `run-${index}`, repoFullName: 'octored/redget-core', orgLogin: index > 2 ? 'crimson-collective' : null, group: index > 2 ? 'scale-set-a' : 'default' })),
    environments: ENVIRONMENT_SEEDS.map((seed, index) => ({ ...seed, id: `env-${index}`, repoFullName: 'octored/redget-core', createdAt: ago((index + 1) * 100 * DAY) })),
    deployments,
    packages,
    gists,
    codespaces,
    topics: TOPIC_SEEDS,
    marketplace: MARKETPLACE_SEEDS,
    events,
    achievements,
    stars,
    watches,
    forks,
    follows,
    pinned,
    sponsors,
    sponsorTiers,
    savedReplies,
    issueForms,
    branchProtection: protection,
    deployKeys: buildDeployKeys(),
    auditLog,
    oauthApps,
    redgetApps,
    tokens,
    sshKeys,
    gpgKeys,
    sessions,
    billing,
    statusIncidents: [
      { id: 'inc-0', title: 'Elevated error rates on Actions', state: 'resolved', startedAt: ago(2 * DAY), resolvedAt: ago(2 * DAY - 40 * MINUTE), components: ['Actions'], updates: [{ body: 'Investigating elevated queue times on self-hosted runners.', createdAt: ago(2 * DAY), status: 'investigating' }, { body: 'Runners drained and rescheduled. Queue is clear.', createdAt: ago(2 * DAY - 40 * MINUTE), status: 'resolved' }] },
      { id: 'inc-1', title: 'Scheduled maintenance: database upgrade', state: 'scheduled', startedAt: ago(-4 * DAY), resolvedAt: null, components: ['Repositories', 'Database'], updates: [{ body: 'Planned upgrade window, 02:00–03:00 UTC. Expect brief read-only periods.', createdAt: ago(-4 * DAY), status: 'scheduled' }] },
    ],
    rateLimits: [
      { resource: 'core', limit: 5000, used: 1284, remaining: 3716, reset: ago(-38 * MINUTE) },
      { resource: 'search', limit: 30, used: 4, remaining: 26, reset: ago(-40 * 1000) },
      { resource: 'code_search', limit: 10, used: 0, remaining: 10, reset: ago(-55 * 60000) },
      { resource: 'graphql', limit: 5000, used: 320, remaining: 4680, reset: ago(-42 * MINUTE) },
    ],
    plans: [
      { id: 'free', name: 'RedGet Free', price: 0, per: 'forever', description: 'For personal projects and small teams getting started.', features: ['Unlimited public repositories', '2,000 Actions minutes / month', '500 MB package storage', 'Community support'] },
      { id: 'pro', name: 'RedGet Pro', price: 4, per: 'user / month', description: 'Advanced tools for individual developers.', features: ['Everything in Free', '3,000 Actions minutes / month', '2 GB package storage', 'Required reviewers for Pages', 'Code owners'] },
      { id: 'team', name: 'RedGet Team', price: 21, per: 'user / month', description: 'For organizations that need collaboration controls.', features: ['Everything in Pro', 'Protected branches', 'Code review assignment', 'Multiple teams and repositories', 'Draft pull requests'] },
      { id: 'enterprise', name: 'RedGet Enterprise', price: 21, per: 'user / month', description: 'Advanced security, compliance and deployment features.', features: ['Everything in Team', 'Advanced Security', 'Audit log API', 'SAML single sign-on and SCIM', 'Merge queue', 'Attestations and SBOM export'], featured: true },
    ],
  };
  return db;
}

export const WIKI_FORMATS = [
  { id: 'markdown', label: 'Markdown', extension: '.md' },
  { id: 'rst', label: 'reStructuredText', extension: '.rst' },
  { id: 'asciidoc', label: 'AsciiDoc', extension: '.adoc' },
  { id: 'org', label: 'Org mode', extension: '.org' },
  { id: 'creole', label: 'Creole', extension: '.creole' },
  { id: 'mediawiki', label: 'MediaWiki', extension: '.mediawiki' },
  { id: 'textile', label: 'Textile', extension: '.textile' },
  { id: 'rdoc', label: 'RDoc', extension: '.rdoc' },
  { id: 'pod', label: 'Pod', extension: '.pod' },
  { id: 'text', label: 'Plain text', extension: '.txt' },
];

export const DISCUSSION_CATEGORIES = ['Announcements', 'Ideas', 'Polls', 'Q&A', 'RFC', 'Show and tell'];

export default { buildDatabase, WIKI_FORMATS, DISCUSSION_CATEGORIES, LANGUAGE_COLORS, slugTitle };
