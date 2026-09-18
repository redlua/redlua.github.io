/**
 * RedGet — route table.
 *
 * Every pattern comes from ROUTE_PATTERNS in /src/config.js, which is also the
 * authority used by tools/validate.mjs to prove that each internal link resolves.
 * Handlers lazy-import their page module so the first paint only loads the shell.
 *
 * Page module contract:
 *   export function render(ctx) → Node | Promise<Node>
 *   ctx = { params, query, match, path }
 */

import { addRoute, notFound, navigate } from './core/router.js';
import { ROUTE_PATTERNS, BRAND } from './config.js';
import { getDb } from './core/store.js';

/** Lazily import a page module and call one of its render functions. */
function page(modulePath, exportName = 'render', title = null) {
  return async (match) => {
    const module = await import(modulePath);
    const factory = module[exportName] || module.default;
    if (typeof factory !== 'function') {
      throw new Error(`[RedGet] ${modulePath} has no ${exportName}() export`);
    }
    return factory({
      params: match.params || {},
      query: match.query || {},
      match,
      path: match.url || match.pathname,
    });
  };
}

function titleFor(match, suffix) {
  const params = match.params || {};
  if (params.login && params.repo) return `${params.login}/${params.repo}${suffix ? ` · ${suffix}` : ''} · ${BRAND.name}`;
  if (params.login) return `${params.login}${suffix ? ` · ${suffix}` : ''} · ${BRAND.name}`;
  return suffix ? `${suffix} · ${BRAND.name}` : BRAND.name;
}

const P = './pages/';

/**
 * Register every route. Order does not matter for matching (the router scores
 * literal segments), but the table mirrors ROUTE_PATTERNS for readability.
 */
export function registerRoutes() {
  const routes = [
    /* ---------------------------------------------------------- top level */
    ['/', () => import(`${P}dashboard.js`).then((m) => m.renderLanding()), { title: `${BRAND.name} · ${BRAND.tagline}` }],
    ['/dashboard', page(`${P}dashboard.js`), { title: `Dashboard · ${BRAND.name}` }],
    ['/explore', page(`${P}discovery.js`, 'renderExplore'), { title: `Explore · ${BRAND.name}` }],
    ['/trending', page(`${P}discovery.js`, 'renderTrending'), { title: `Trending · ${BRAND.name}` }],
    ['/topics', page(`${P}discovery.js`, 'renderTopics'), { title: `Topics · ${BRAND.name}` }],
    ['/topics/:topic', page(`${P}discovery.js`, 'renderTopic'), { title: (m) => `${m.params.topic} · Topics · ${BRAND.name}` }],
    ['/collections', page(`${P}discovery.js`, 'renderCollections'), { title: `Collections · ${BRAND.name}` }],
    ['/events', page(`${P}discovery.js`, 'renderEvents'), { title: `Events · ${BRAND.name}` }],
    ['/sponsors', page(`${P}discovery.js`, 'renderSponsors'), { title: `Sponsors · ${BRAND.name}` }],
    ['/search', page(`${P}search.js`), { title: `Search · ${BRAND.name}` }],
    ['/notifications', page(`${P}notifications.js`), { title: `Notifications · ${BRAND.name}` }],
    ['/notifications/subscriptions', page(`${P}notifications.js`, 'renderSubscriptions'), { title: `Subscriptions · ${BRAND.name}` }],
    ['/issues', page(`${P}issuesDashboard.js`, 'renderIssues'), { title: `Issues · ${BRAND.name}` }],
    ['/pulls', page(`${P}issuesDashboard.js`, 'renderPulls'), { title: `Pull requests · ${BRAND.name}` }],
    ['/codespaces', page(`${P}codespaces.js`), { title: `Codespaces · ${BRAND.name}` }],
    ['/codespaces/:name', page(`${P}codespaces.js`, 'renderCodespace'), { title: (m) => `${m.params.name} · Codespaces · ${BRAND.name}` }],
    ['/marketplace', page(`${P}marketplace.js`), { title: `Marketplace · ${BRAND.name}` }],
    ['/marketplace/:slug', page(`${P}marketplace.js`, 'renderListing'), { title: (m) => `${m.params.slug} · Marketplace · ${BRAND.name}` }],
    ['/enterprise', page(`${P}marketing.js`, 'renderEnterprise'), { title: `RedGet Enterprise · ${BRAND.name}` }],
    ['/pricing', page(`${P}marketing.js`, 'renderPricing'), { title: `Pricing · ${BRAND.name}` }],
    ['/security', page(`${P}marketing.js`, 'renderSecurity'), { title: `RedGet Security · ${BRAND.name}` }],
    ['/status', page(`${P}marketing.js`, 'renderStatus'), { title: `RedGet status · ${BRAND.name}` }],
    ['/changelog', page(`${P}marketing.js`, 'renderChangelog'), { title: `Changelog · ${BRAND.name}` }],
    ['/docs', page(`${P}docs.js`), { title: `Documentation · ${BRAND.name}` }],
    ['/docs/:topic', page(`${P}docs.js`, 'renderTopic'), { title: (m) => `${m.params.topic} · Docs · ${BRAND.name}` }],
    ['/shortcuts', page(`${P}docs.js`, 'renderShortcuts'), { title: `Keyboard shortcuts · ${BRAND.name}` }],
    ['/login', page(`${P}auth.js`, 'renderLogin'), { title: `Sign in · ${BRAND.name}` }],
    ['/join', page(`${P}auth.js`, 'renderJoin'), { title: `Join · ${BRAND.name}` }],
    ['/password_reset', page(`${P}auth.js`, 'renderPasswordReset'), { title: `Reset your password · ${BRAND.name}` }],
    ['/gists', page(`${P}gists.js`), { title: `Gists · ${BRAND.name}` }],
    ['/gist/:id', page(`${P}gists.js`, 'renderGist'), { title: (m) => `${m.params.id} · Gist · ${BRAND.name}` }],
    ['/new', page(`${P}newRepo.js`), { title: `New repository · ${BRAND.name}` }],
    ['/new/import', page(`${P}newRepo.js`, 'renderImport'), { title: `Import repository · ${BRAND.name}` }],
    ['/organizations/new', page(`${P}newRepo.js`, 'renderNewOrg'), { title: `New organization · ${BRAND.name}` }],

    /* --------------------------------------------------------- user settings */
    ['/settings', page(`${P}settingsAccount.js`), { title: `Your settings · ${BRAND.name}` }],
    ['/settings/:section', page(`${P}settingsAccount.js`, 'renderSection'), { title: (m) => `${m.params.section} · Settings · ${BRAND.name}` }],
    ['/settings/organizations/:org', page(`${P}settingsAccount.js`, 'renderOrgMembership'), { title: (m) => `${m.params.org} · Organizations · ${BRAND.name}` }],
    ['/account/organizations/:org/settings', page(`${P}orgSettings.js`), { title: (m) => `${m.params.org} · Organization settings · ${BRAND.name}` }],
    ['/account/organizations/:org/settings/:section', page(`${P}orgSettings.js`, 'renderSection'), { title: (m) => `${m.params.section} · ${m.params.org} settings · ${BRAND.name}` }],

    /* ------------------------------------------------------ organizations */
    ['/orgs/:org', page(`${P}org.js`), { title: (m) => titleFor(m, 'Overview') }],
    ['/orgs/:org/people', page(`${P}org.js`, 'renderPeople'), { title: (m) => titleFor(m, 'People') }],
    ['/orgs/:org/teams', page(`${P}org.js`, 'renderTeams'), { title: (m) => titleFor(m, 'Teams') }],
    ['/orgs/:org/repositories', page(`${P}org.js`, 'renderRepositories'), { title: (m) => titleFor(m, 'Repositories') }],
    ['/orgs/:org/projects', page(`${P}org.js`, 'renderProjects'), { title: (m) => titleFor(m, 'Projects') }],
    ['/orgs/:org/packages', page(`${P}org.js`, 'renderPackages'), { title: (m) => titleFor(m, 'Packages') }],
    ['/orgs/:org/discussions', page(`${P}org.js`, 'renderDiscussions'), { title: (m) => titleFor(m, 'Discussions') }],
    ['/orgs/:org/sponsoring', page(`${P}org.js`, 'renderSponsoring'), { title: (m) => titleFor(m, 'Sponsoring') }],
    ['/orgs/:org/audit-log', page(`${P}org.js`, 'renderAuditLog'), { title: (m) => titleFor(m, 'Audit log') }],
    ['/orgs/:org/security', page(`${P}org.js`, 'renderSecurity'), { title: (m) => titleFor(m, 'Security') }],
    ['/orgs/:org/invitations', page(`${P}org.js`, 'renderInvitations'), { title: (m) => titleFor(m, 'Invitations') }],

    /* ------------------------------------------------------------- profiles */
    ['/:login', page(`${P}profile.js`), { title: (m) => titleFor(m) }],

    /* --------------------------------------------------------- repositories */
    ['/:login/:repo', page(`${P}repoCode.js`), { title: (m) => titleFor(m, 'Code') }],
    ['/:login/:repo/tree/:branch*', page(`${P}repoCode.js`, 'renderTree'), { title: (m) => titleFor(m, 'Tree') }],
    ['/:login/:repo/blob/:branch*/:path*', page(`${P}repoBlob.js`), { title: (m) => titleFor(m, m.params.path) }],
    ['/:login/:repo/blame/:branch*/:path*', page(`${P}repoBlob.js`, 'renderBlame'), { title: (m) => titleFor(m, `Blame · ${m.params.path}`) }],
    ['/:login/:repo/raw/:branch*/:path*', page(`${P}repoBlob.js`, 'renderRaw'), { title: (m) => titleFor(m, `Raw · ${m.params.path}`) }],
    ['/:login/:repo/history/:branch*/:path*', page(`${P}repoBlob.js`, 'renderHistory'), { title: (m) => titleFor(m, `History · ${m.params.path}`) }],
    ['/:login/:repo/edit/:branch*/:path*', page(`${P}repoBlob.js`, 'renderEdit'), { title: (m) => titleFor(m, `Edit · ${m.params.path}`) }],
    ['/:login/:repo/new/:branch*', page(`${P}repoBlob.js`, 'renderNewFile'), { title: (m) => titleFor(m, 'New file') }],
    ['/:login/:repo/upload/:branch*', page(`${P}repoBlob.js`, 'renderUpload'), { title: (m) => titleFor(m, 'Upload files') }],
    ['/:login/:repo/find/:branch*', page(`${P}repoCode.js`, 'renderFileFinder'), { title: (m) => titleFor(m, 'Find file') }],
    ['/:login/:repo/search', page(`${P}repoCode.js`, 'renderRepoSearch'), { title: (m) => titleFor(m, 'Search') }],
    ['/:login/:repo/commits/:branch*', page(`${P}repoCommits.js`), { title: (m) => titleFor(m, 'Commits') }],
    ['/:login/:repo/commit/:sha', page(`${P}repoCommits.js`, 'renderCommit'), { title: (m) => titleFor(m, `Commit ${String(m.params.sha).slice(0, 7)}`) }],
    ['/:login/:repo/compare', page(`${P}repoCommits.js`, 'renderCompare'), { title: (m) => titleFor(m, 'Compare') }],
    ['/:login/:repo/compare/:range*', page(`${P}repoCommits.js`, 'renderCompare'), { title: (m) => titleFor(m, 'Compare') }],
    ['/:login/:repo/branches', page(`${P}repoBranches.js`), { title: (m) => titleFor(m, 'Branches') }],
    ['/:login/:repo/tags', page(`${P}repoBranches.js`, 'renderTags'), { title: (m) => titleFor(m, 'Tags') }],

    /* --------------------------------------------------------------- issues */
    ['/:login/:repo/issues', page(`${P}repoIssues.js`), { title: (m) => titleFor(m, 'Issues') }],
    ['/:login/:repo/issues/new', page(`${P}repoIssues.js`, 'renderNew'), { title: (m) => titleFor(m, 'New issue') }],
    ['/:login/:repo/issues/new/choose', page(`${P}repoIssues.js`, 'renderTemplates'), { title: (m) => titleFor(m, 'Issue templates') }],
    ['/:login/:repo/issues/:number', page(`${P}repoIssueDetail.js`), { title: (m) => titleFor(m, `Issue #${m.params.number}`) }],
    ['/:login/:repo/labels', page(`${P}repoIssues.js`, 'renderLabels'), { title: (m) => titleFor(m, 'Labels') }],
    ['/:login/:repo/milestones', page(`${P}repoIssues.js`, 'renderMilestones'), { title: (m) => titleFor(m, 'Milestones') }],

    /* ---------------------------------------------------------- pull requests */
    ['/:login/:repo/pulls', page(`${P}repoPulls.js`), { title: (m) => titleFor(m, 'Pull requests') }],
    ['/:login/:repo/pull/new', page(`${P}repoPulls.js`, 'renderNew'), { title: (m) => titleFor(m, 'New pull request') }],
    ['/:login/:repo/pull/new/:range*', page(`${P}repoPulls.js`, 'renderNew'), { title: (m) => titleFor(m, 'New pull request') }],
    ['/:login/:repo/pull/:number', page(`${P}repoPullDetail.js`), { title: (m) => titleFor(m, `Pull request #${m.params.number}`) }],
    ['/:login/:repo/pull/:number/files', page(`${P}repoPullDetail.js`, 'renderFiles'), { title: (m) => titleFor(m, `Files changed #${m.params.number}`) }],
    ['/:login/:repo/pull/:number/commits', page(`${P}repoPullDetail.js`, 'renderCommits'), { title: (m) => titleFor(m, `Commits #${m.params.number}`) }],
    ['/:login/:repo/pull/:number/checks', page(`${P}repoPullDetail.js`, 'renderChecks'), { title: (m) => titleFor(m, `Checks #${m.params.number}`) }],

    /* --------------------------------------------------------------- actions */
    ['/:login/:repo/actions', page(`${P}repoActions.js`), { title: (m) => titleFor(m, 'Actions') }],
    ['/:login/:repo/actions/runs', page(`${P}repoActions.js`, 'renderRuns'), { title: (m) => titleFor(m, 'Workflow runs') }],
    ['/:login/:repo/actions/runs/:runId', page(`${P}repoActions.js`, 'renderRun'), { title: (m) => titleFor(m, `Run ${m.params.runId}`) }],
    ['/:login/:repo/actions/runs/:runId/job/:jobId', page(`${P}repoActions.js`, 'renderJob'), { title: (m) => titleFor(m, `Job ${m.params.jobId}`) }],
    ['/:login/:repo/actions/workflows/:workflowId', page(`${P}repoActions.js`, 'renderWorkflow'), { title: (m) => titleFor(m, m.params.workflowId) }],
    ['/:login/:repo/actions/caches', page(`${P}repoActions.js`, 'renderCaches'), { title: (m) => titleFor(m, 'Caches') }],
    ['/:login/:repo/actions/secrets', page(`${P}repoActions.js`, 'renderSecrets'), { title: (m) => titleFor(m, 'Secrets') }],
    ['/:login/:repo/actions/variables', page(`${P}repoActions.js`, 'renderVariables'), { title: (m) => titleFor(m, 'Variables') }],
    ['/:login/:repo/actions/runners', page(`${P}repoActions.js`, 'renderRunners'), { title: (m) => titleFor(m, 'Runners') }],
    ['/:login/:repo/actions/environments', page(`${P}repoActions.js`, 'renderEnvironments'), { title: (m) => titleFor(m, 'Environments') }],
    ['/:login/:repo/actions/artifacts', page(`${P}repoActions.js`, 'renderArtifacts'), { title: (m) => titleFor(m, 'Artifacts') }],
    ['/:login/:repo/actions/queue', page(`${P}repoActions.js`, 'renderQueue'), { title: (m) => titleFor(m, 'Merge queue') }],

    /* -------------------------------------------------------------- projects */
    ['/:login/:repo/projects', page(`${P}repoProjects.js`), { title: (m) => titleFor(m, 'Projects') }],
    ['/:login/:repo/projects/:projectId', page(`${P}repoProjects.js`, 'renderProject'), { title: (m) => titleFor(m, 'Project') }],

    /* ------------------------------------------------------------------ wiki */
    ['/:login/:repo/wiki', page(`${P}repoWiki.js`), { title: (m) => titleFor(m, 'Wiki') }],
    ['/:login/:repo/wiki/_history', page(`${P}repoWiki.js`, 'renderHistory'), { title: (m) => titleFor(m, 'Wiki history') }],
    ['/:login/:repo/wiki/_new', page(`${P}repoWiki.js`, 'renderNew'), { title: (m) => titleFor(m, 'New wiki page') }],
    ['/:login/:repo/wiki/:page*', page(`${P}repoWiki.js`, 'renderPage'), { title: (m) => titleFor(m, 'Wiki') }],

    /* -------------------------------------------------------------- security */
    ['/:login/:repo/security', page(`${P}repoSecurity.js`), { title: (m) => titleFor(m, 'Security') }],
    ['/:login/:repo/security/advisories', page(`${P}repoSecurity.js`, 'renderAdvisories'), { title: (m) => titleFor(m, 'Advisories') }],
    ['/:login/:repo/security/advisories/:advisoryId', page(`${P}repoSecurity.js`, 'renderAdvisory'), { title: (m) => titleFor(m, m.params.advisoryId) }],
    ['/:login/:repo/security/dependabot', page(`${P}repoSecurity.js`, 'renderDependabot'), { title: (m) => titleFor(m, 'Dependabot') }],
    ['/:login/:repo/security/dependabot/:alertId', page(`${P}repoSecurity.js`, 'renderDependabotAlert'), { title: (m) => titleFor(m, 'Dependabot alert') }],
    ['/:login/:repo/security/code-scanning', page(`${P}repoSecurity.js`, 'renderCodeScanning'), { title: (m) => titleFor(m, 'Code scanning') }],
    ['/:login/:repo/security/code-scanning/:alertId', page(`${P}repoSecurity.js`, 'renderCodeScanningAlert'), { title: (m) => titleFor(m, 'Code scanning alert') }],
    ['/:login/:repo/security/secret-scanning', page(`${P}repoSecurity.js`, 'renderSecretScanning'), { title: (m) => titleFor(m, 'Secret scanning') }],
    ['/:login/:repo/security/secret-scanning/:alertId', page(`${P}repoSecurity.js`, 'renderSecretScanningAlert'), { title: (m) => titleFor(m, 'Secret scanning alert') }],

    /* -------------------------------------------------------------- insights */
    ['/:login/:repo/pulse', page(`${P}repoInsights.js`), { title: (m) => titleFor(m, 'Pulse') }],
    ['/:login/:repo/graphs', page(`${P}repoInsights.js`, 'renderGraphs'), { title: (m) => titleFor(m, 'Insights') }],
    ['/:login/:repo/graphs/contributors', page(`${P}repoInsights.js`, 'renderContributors'), { title: (m) => titleFor(m, 'Contributors') }],
    ['/:login/:repo/graphs/commit-activity', page(`${P}repoInsights.js`, 'renderCommitActivity'), { title: (m) => titleFor(m, 'Commit activity') }],
    ['/:login/:repo/graphs/code-frequency', page(`${P}repoInsights.js`, 'renderCodeFrequency'), { title: (m) => titleFor(m, 'Code frequency') }],
    ['/:login/:repo/graphs/traffic', page(`${P}repoInsights.js`, 'renderTraffic'), { title: (m) => titleFor(m, 'Traffic') }],
    ['/:login/:repo/graphs/community', page(`${P}repoInsights.js`, 'renderCommunity'), { title: (m) => titleFor(m, 'Community') }],
    ['/:login/:repo/network', page(`${P}repoInsights.js`, 'renderNetwork'), { title: (m) => titleFor(m, 'Network') }],
    ['/:login/:repo/network/dependencies', page(`${P}repoInsights.js`, 'renderDependencies'), { title: (m) => titleFor(m, 'Dependency graph') }],
    ['/:login/:repo/network/members', page(`${P}repoInsights.js`, 'renderMembers'), { title: (m) => titleFor(m, 'Members') }],
    ['/:login/:repo/insights', page(`${P}repoInsights.js`, 'renderGraphs'), { title: (m) => titleFor(m, 'Insights') }],
    ['/:login/:repo/insights/:section', page(`${P}repoInsights.js`, 'renderSection'), { title: (m) => titleFor(m, 'Insights') }],

    /* -------------------------------------------------------------- settings */
    ['/:login/:repo/settings', page(`${P}repoSettings.js`), { title: (m) => titleFor(m, 'Settings') }],
    ['/:login/:repo/settings/:section', page(`${P}repoSettings.js`, 'renderSection'), { title: (m) => titleFor(m, 'Settings') }],
    ['/:login/:repo/settings/:section/:item', page(`${P}repoSettings.js`, 'renderSectionItem'), { title: (m) => titleFor(m, 'Settings') }],

    /* ------------------------------------------------------- releases & more */
    ['/:login/:repo/releases', page(`${P}repoReleases.js`), { title: (m) => titleFor(m, 'Releases') }],
    ['/:login/:repo/releases/new', page(`${P}repoReleases.js`, 'renderNew'), { title: (m) => titleFor(m, 'Draft a release') }],
    ['/:login/:repo/releases/tag/:tag', page(`${P}repoReleases.js`, 'renderTag'), { title: (m) => titleFor(m, m.params.tag) }],
    ['/:login/:repo/releases/edit/:tag', page(`${P}repoReleases.js`, 'renderEdit'), { title: (m) => titleFor(m, `Edit ${m.params.tag}`) }],
    ['/:login/:repo/deployments', page(`${P}repoSettings.js`, 'renderDeployments'), { title: (m) => titleFor(m, 'Deployments') }],
    ['/:login/:repo/deployments/:env', page(`${P}repoSettings.js`, 'renderEnvironment'), { title: (m) => titleFor(m, m.params.env) }],
    ['/:login/:repo/environments', page(`${P}repoSettings.js`, 'renderDeployments'), { title: (m) => titleFor(m, 'Environments') }],
    ['/:login/:repo/packages', page(`${P}repoPackages.js`), { title: (m) => titleFor(m, 'Packages') }],
    ['/:login/:repo/discussions', page(`${P}repoDiscussions.js`), { title: (m) => titleFor(m, 'Discussions') }],
    ['/:login/:repo/discussions/new', page(`${P}repoDiscussions.js`, 'renderNew'), { title: (m) => titleFor(m, 'New discussion') }],
    ['/:login/:repo/discussions/:number', page(`${P}repoDiscussions.js`, 'renderDiscussion'), { title: (m) => titleFor(m, `Discussion #${m.params.number}`) }],
    ['/:login/:repo/stargazers', page(`${P}repoBranches.js`, 'renderStargazers'), { title: (m) => titleFor(m, 'Stargazers') }],
    ['/:login/:repo/forks', page(`${P}repoBranches.js`, 'renderForks'), { title: (m) => titleFor(m, 'Forks') }],
    ['/:login/:repo/watchers', page(`${P}repoBranches.js`, 'renderWatchers'), { title: (m) => titleFor(m, 'Watchers') }],
    ['/:login/:repo/pages', page(`${P}repoSettings.js`, 'renderPages'), { title: (m) => titleFor(m, 'Pages') }],
    ['/:login/:repo/archive/refs/heads/:branch*.zip', page(`${P}repoCode.js`, 'renderArchive'), { title: (m) => titleFor(m, 'Archive') }],
    ['/:login/:repo/archive/refs/tags/:tag*.zip', page(`${P}repoCode.js`, 'renderArchive'), { title: (m) => titleFor(m, 'Archive') }],
    ['/:login/:repo/actions/workflows/:workflowId/badge.svg', page(`${P}repoActions.js`, 'renderBadge'), { title: (m) => titleFor(m, 'Badge') }],

    /* ---------------------------------------------------------------- errors */
    ['/404', page(`${P}errorPages.js`, 'render404'), { title: `Page not found · ${BRAND.name}`, skeleton: false }],
    ['/500', page(`${P}errorPages.js`, 'render500'), { title: `Server error · ${BRAND.name}`, skeleton: false }],
    ['/rate-limit', page(`${P}errorPages.js`, 'renderRateLimit'), { title: `Rate limit · ${BRAND.name}`, skeleton: false }],
    ['/maintenance', page(`${P}errorPages.js`, 'renderMaintenance'), { title: `Maintenance · ${BRAND.name}`, skeleton: false }],
  ];

  routes.forEach(([pattern, handler, options]) => addRoute(pattern, handler, options || {}));

  // Unmatched path → the 404 page (which still renders inside the shell).
  notFound((match) => {
    import(`${P}errorPages.js`).then((m) => {
      const root = document.getElementById('app');
      if (!root) return;
      const view = m.render404({ path: match.url || match.pathname });
      root.replaceChildren(view.nodeType ? view : document.createTextNode(String(view)));
    });
    document.title = `Page not found · ${BRAND.name}`;
    const placeholder = document.createElement('div');
    placeholder.className = 'error-page-skeleton';
    return placeholder;
  });

  // Archive downloads are not real files: explain instead of navigating away.
  addRoute('/:login/:repo/releases/download/:tag/:asset', async (match) => {
    const module = await import(`${P}repoReleases.js`);
    return module.renderAsset({ params: match.params, query: match.query });
  }, { title: (m) => titleFor(m, 'Release asset') });

  return routes.length;
}

/** Guard used by pages that need a real repository (redirects to 404 otherwise). */
export function requireRepo(params) {
  const db = getDb();
  if (!db) return null;
  const login = String(params.login || '').toLowerCase();
  const name = String(params.repo || '').toLowerCase();
  return db.repos.find((r) => r.ownerLogin.toLowerCase() === login && r.name.toLowerCase() === name) || null;
}

export function requireOwner(login) {
  const db = getDb();
  if (!db) return null;
  const target = String(login || '').toLowerCase();
  return db.users.find((u) => u.login.toLowerCase() === target)
    || db.orgs.find((o) => o.login.toLowerCase() === target)
    || null;
}

export { navigate };
export default { registerRoutes, requireRepo, requireOwner };
