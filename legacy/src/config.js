/**
 * RedGet — global configuration.
 *
 * Single source of truth for branding, storage keys, feature flags and limits.
 * RedGet has no public URL yet, therefore every link in the application is a
 * root-relative local placeholder route (e.g. "/octored/redget-core").
 * No external domain is ever referenced: not in markup, not in CSS, not at runtime.
 */

export const BRAND = {
  name: 'RedGet',
  shortName: 'RedGet',
  legalName: 'RedGet, Inc.',
  /** Placeholder hostname used only inside copy text, never as a real link target. */
  hostPlaceholder: 'redget.local',
  tagline: 'Where the crimson code lives.',
  /** RedGet's octocat-like mark. Inline SVG symbol id (see /assets/icons/sprite.svg). */
  logoSymbol: 'icon-redget-mark',
  supportEmail: 'support@redget.local',
  statusPage: '/status',
  changelog: '/changelog',
};

/** Versioned storage namespace so schema changes can migrate cleanly. */
export const STORAGE = {
  version: 4,
  prefix: 'redget:',
  db: 'redget:patch:v4',
  session: 'redget:session:v4',
  prefs: 'redget:prefs:v4',
  drafts: 'redget:drafts:v4',
  anchor: 'redget:anchor:v4',
};

/**
 * The seeded database is regenerated deterministically from a fixed reference
 * instant, so only the user's own mutations need to be persisted. They are kept
 * as an ordered patch log replayed on top of a fresh seed at boot.
 */
export const PATCH_LIMITS = {
  maxMutations: 4000,
};

export const FEATURES = {
  codespaces: true,
  copilot: true,
  discussions: true,
  packages: true,
  projects: true,
  wiki: true,
  actions: true,
  pages: true,
  sponsors: true,
  marketplace: true,
  securityAdvanced: true,
  mergeQueue: true,
  dependabot: true,
  codeScanning: true,
  secretScanning: true,
};

export const LIMITS = {
  pageSize: 25,
  infiniteScrollBatch: 15,
  maxToastVisible: 4,
  toastMs: 4200,
  skeletonMs: 320,
  searchDebounceMs: 160,
  maxAvatarChars: 2,
  diffMaxLines: 4000,
};

/** Repository visibility options mirrored across badges, filters and settings. */
export const VISIBILITY = ['public', 'private', 'internal'];

export const ISSUE_STATE = { open: 'open', closed: 'closed' };
export const PR_STATE = { open: 'open', closed: 'closed', merged: 'merged', draft: 'draft' };

export const MERGE_METHODS = [
  { id: 'merge', label: 'Create a merge commit', hint: 'All commits from the base branch will be added to the base branch via a merge commit.' },
  { id: 'squash', label: 'Squash and merge', hint: 'The 3 commits from this branch will be combined into one commit in the base branch.' },
  { id: 'rebase', label: 'Rebase and merge', hint: 'The 3 commits will be rebased onto the base branch without a merge commit.' },
];

/** Themes available from the header theme switcher. */
export const THEMES = [
  { id: 'dark', label: 'Dark red-black', group: 'dark', default: true },
  { id: 'light', label: 'Light', group: 'light' },
  { id: 'red', label: 'Crimson', group: 'dark' },
  { id: 'contrast-dark', label: 'Dark high contrast', group: 'dark' },
  { id: 'contrast-light', label: 'Light high contrast', group: 'light' },
];

/** Locales shipped with the app (i18n is string-table driven). */
export const LOCALES = [
  { id: 'en', label: 'English', dir: 'ltr' },
  { id: 'es', label: 'Español', dir: 'ltr' },
  { id: 'fr', label: 'Français', dir: 'ltr' },
  { id: 'de', label: 'Deutsch', dir: 'ltr' },
  { id: 'ja', label: '日本語', dir: 'ltr' },
  { id: 'pt-BR', label: 'Português (Brasil)', dir: 'ltr' },
  { id: 'ar', label: 'العربية', dir: 'rtl' },
];

/** Keyboard shortcuts surfaced by the "?" modal and bound in app.js. */
export const SHORTCUTS = [
  { group: 'Site-wide', keys: [
    { combo: ['s'], action: 'Focus the search bar' },
    { combo: ['/'], action: 'Focus the search bar' },
    { combo: ['Ctrl', 'K'], action: 'Open the command palette (Cmd+K on macOS)' },
    { combo: ['?'], action: 'Open this help dialog' },
    { combo: ['g', 'h'], action: 'Go to your dashboard' },
    { combo: ['g', 'd'], action: 'Go to your dashboard' },
    { combo: ['g', 'n'], action: 'Go to notifications' },
    { combo: ['g', 'i'], action: 'Go to issues' },
    { combo: ['g', 'p'], action: 'Go to pull requests' },
    { combo: ['g', 'e'], action: 'Go to explore' },
    { combo: ['g', 's'], action: 'Go to your profile settings' },
    { combo: ['g', 'c'], action: 'Go to codespaces' },
    { combo: ['Esc'], action: 'Close dialog / cancel edit / blur input' },
  ] },
  { group: 'Repository pages', keys: [
    { combo: ['t'], action: 'Activate the file finder' },
    { combo: ['g', 'c'], action: 'Go to the Code tab' },
    { combo: ['g', 'i'], action: 'Go to the Issues tab' },
    { combo: ['g', 'p'], action: 'Go to the Pull requests tab' },
    { combo: ['g', 'a'], action: 'Go to the Actions tab' },
    { combo: ['g', 'w'], action: 'Go to the Wiki tab' },
    { combo: ['g', 'o'], action: 'Go to the Overview/README' },
    { combo: ['Shift', '?'], action: 'Focus the branch or tag selector' },
  ] },
  { group: 'Issues and pull requests', keys: [
    { combo: ['c'], action: 'Create a new issue or pull request' },
    { combo: ['l'], action: 'Edit labels' },
    { combo: ['a'], action: 'Edit assignees' },
    { combo: ['m'], action: 'Edit milestone' },
    { combo: ['e'], action: 'Focus the comment editor' },
    { combo: ['Ctrl', 'Enter'], action: 'Submit the focused comment' },
    { combo: ['r'], action: 'Quote the selected text in a reply' },
  ] },
  { group: 'Code and diffs', keys: [
    { combo: ['y'], action: 'Expand or collapse a diff section' },
    { combo: ['Shift', 'Y'], action: 'Toggle unified / split diff' },
    { combo: ['w'], action: 'Toggle whitespace changes in diffs' },
    { combo: ['b'], action: 'Open the blame view for a file' },
    { combo: ['Enter'], action: 'Open the focused file or row' },
  ] },
];

/** Route table consumed by the router and by link/route validation. */
export const ROUTE_PATTERNS = [
  '/',
  '/dashboard',
  '/explore',
  '/trending',
  '/topics',
  '/topics/:topic',
  '/collections',
  '/events',
  '/sponsors',
  '/search',
  '/notifications',
  '/notifications/subscriptions',
  '/issues',
  '/pulls',
  '/codespaces',
  '/settings',
  '/settings/:section',
  '/settings/organizations/:org',
  '/marketplace',
  '/marketplace/:slug',
  '/enterprise',
  '/pricing',
  '/security',
  '/status',
  '/changelog',
  '/docs',
  '/docs/:topic',
  '/shortcuts',
  '/login',
  '/join',
  '/password_reset',
  '/gists',
  '/gist/:id',
  '/new',
  '/new/import',
  '/organizations/new',
  '/account/organizations/:org/settings',
  '/account/organizations/:org/settings/:section',
  '/orgs/:org',
  '/orgs/:org/people',
  '/orgs/:org/teams',
  '/orgs/:org/repositories',
  '/orgs/:org/projects',
  '/orgs/:org/packages',
  '/orgs/:org/discussions',
  '/orgs/:org/sponsoring',
  '/orgs/:org/audit-log',
  '/orgs/:org/security',
  '/orgs/:org/settings',
  '/orgs/:org/invitations',
  '/:login',
  '/:login?tab=repositories',
  '/:login/:repo',
  '/:login/:repo/tree/:branch*',
  '/:login/:repo/blob/:branch*/:path*',
  '/:login/:repo/blame/:branch*/:path*',
  '/:login/:repo/raw/:branch*/:path*',
  '/:login/:repo/history/:branch*/:path*',
  '/:login/:repo/edit/:branch*/:path*',
  '/:login/:repo/new/:branch*',
  '/:login/:repo/upload/:branch*',
  '/:login/:repo/find/:branch*',
  '/:login/:repo/search',
  '/:login/:repo/commits/:branch*',
  '/:login/:repo/commit/:sha',
  '/:login/:repo/compare',
  '/:login/:repo/compare/:range*',
  '/:login/:repo/issues',
  '/:login/:repo/issues/new',
  '/:login/:repo/issues/new/choose',
  '/:login/:repo/issues/:number',
  '/:login/:repo/labels',
  '/:login/:repo/milestones',
  '/:login/:repo/pulls',
  '/:login/:repo/pull/new',
  '/:login/:repo/pull/new/:range*',
  '/:login/:repo/pull/:number',
  '/:login/:repo/pull/:number/files',
  '/:login/:repo/pull/:number/commits',
  '/:login/:repo/pull/:number/checks',
  '/:login/:repo/actions',
  '/:login/:repo/actions/runs',
  '/:login/:repo/actions/runs/:runId',
  '/:login/:repo/actions/runs/:runId/job/:jobId',
  '/:login/:repo/actions/workflows/:workflowId',
  '/:login/:repo/actions/caches',
  '/:login/:repo/actions/secrets',
  '/:login/:repo/actions/variables',
  '/:login/:repo/actions/runners',
  '/:login/:repo/actions/environments',
  '/:login/:repo/actions/artifacts',
  '/:login/:repo/projects',
  '/:login/:repo/projects/:projectId',
  '/:login/:repo/wiki',
  '/:login/:repo/wiki/:page*',
  '/:login/:repo/wiki/_history',
  '/:login/:repo/wiki/_new',
  '/:login/:repo/security',
  '/:login/:repo/security/:section',
  '/:login/:repo/security/advisories/:advisoryId',
  '/:login/:repo/security/dependabot/:alertId',
  '/:login/:repo/security/code-scanning/:alertId',
  '/:login/:repo/security/secret-scanning/:alertId',
  '/:login/:repo/pulse',
  '/:login/:repo/graphs',
  '/:login/:repo/graphs/contributors',
  '/:login/:repo/graphs/commit-activity',
  '/:login/:repo/graphs/code-frequency',
  '/:login/:repo/graphs/traffic',
  '/:login/:repo/graphs/community',
  '/:login/:repo/network',
  '/:login/:repo/network/dependencies',
  '/:login/:repo/network/members',
  '/:login/:repo/insights',
  '/:login/:repo/insights/:section',
  '/:login/:repo/settings',
  '/:login/:repo/settings/:section',
  '/:login/:repo/settings/:section/:item',
  '/:login/:repo/releases',
  '/:login/:repo/releases/new',
  '/:login/:repo/releases/tag/:tag',
  '/:login/:repo/releases/edit/:tag',
  '/:login/:repo/tags',
  '/:login/:repo/branches',
  '/:login/:repo/stargazers',
  '/:login/:repo/forks',
  '/:login/:repo/watchers',
  '/:login/:repo/deployments',
  '/:login/:repo/deployments/:env',
  '/:login/:repo/environments',
  '/:login/:repo/packages',
  '/:login/:repo/discussions',
  '/:login/:repo/discussions/:number',
  '/:login/:repo/discussions/new',
  '/:login/:repo/archive/refs/heads/:branch*.zip',
  '/:login/:repo/archive/refs/tags/:tag*.zip',
  '/codespaces/:name',
  '/404',
  '/500',
  '/rate-limit',
  '/maintenance',
];

export default { BRAND, STORAGE, FEATURES, LIMITS, THEMES, LOCALES, SHORTCUTS, ROUTE_PATTERNS };
