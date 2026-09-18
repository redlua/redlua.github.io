/**
 * RedGet — landing page and personal dashboard.
 *
 * Landing (/)
 *   <section class="hero">          marketing intro + primary actions
 *   <section class="feature-grid">  four product pillars
 *   <section class="showcase">      live HTML structure sample from the demo
 *   <section class="cta-band">      join / explore
 *
 * Dashboard (/dashboard)
 *   <div class="dashboard grid grid-sidebar">
 *     <main class="main-col">
 *       <nav class="subnav">…</nav>          Feed / All activity / Saved
 *       <ul class="feed-list" role="list">   one <li class="feed-item"> per event
 *       <nav aria-label="Pagination">…</nav>
 *     </main>
 *     <aside class="sidebar">
 *       <section class="sidebar-section">Top repositories</section>
 *       <section class="sidebar-section">Recent activity</section>
 *       <section class="sidebar-section">Explore repositories</section>
 *       <section class="sidebar-section">Teams</section>
 *
 * Everything reads from the local dataset; nothing is fetched.
 */

import { h, icon } from '../core/dom.js';
import { navigate } from '../core/router.js';
import { BRAND, FEATURES, LIMITS } from '../config.js';
import { getSession, getDb } from '../core/store.js';
import * as api from '../core/api.js';
import { avatar, avatarStack } from '../components/avatars.js';
import { openCommandPalette } from '../components/commandPalette.js';
import { relativeTimeEl, badge, emptyState, pagination, paginate, queryPage, sidebarSection, chipRow, counter } from '../components/kit.js';
import {
  dashboardFeed, visibleReposFor, starredBy, findUserByLogin,
  rerender, toast, confirmDialog, openDialog,
} from './_shared.js';

/* ============================================================ landing page */

export function renderLanding() {
  const session = getSession();
  const db = getDb();
  const headlineRepo = db.repos.find((r) => r.fullName === 'octored/redget-core') || db.repos[0];

  return h('div', { class: 'landing' },
    hero(),
    metrics(db),
    features(),
    showcase(headlineRepo),
    themesBand(),
    a11yBand(),
    ctaBand(session.login));
}

function hero() {
  return h('section', { class: 'hero', 'aria-labelledby': 'hero-title' },
    h('div', { class: 'container hero-inner' },
      h('div', { class: 'hero-copy' },
        h('p', { class: 'hero-eyebrow' },
          h('span', { class: 'hero-badge' }, icon('sparkle', { size: 16 }), 'RedGet 4.3 — merge queue, split diff pairing, crimson themes')),
        h('h1', { class: 'hero-title', id: 'hero-title' },
          'Where the ', h('span', { class: 'hero-accent' }, 'crimson'), ' code lives.'),
        h('p', { class: 'hero-lede' },
          'RedGet is a complete source collaboration platform that runs entirely in your browser: repositories, commits, issues, pull requests, code review, Actions, projects, wikis, security alerts and settings — generated locally, persisted to localStorage, and never sent anywhere.'),
        h('div', { class: 'hero-actions' },
          h('a', { class: 'btn btn-primary btn-lg', href: '/join' }, icon('rocket', { size: 16 }), 'Create your account'),
          h('a', { class: 'btn btn-lg', href: '/login' }, icon('sign-in', { size: 16 }), 'Sign in'),
          h('a', { class: 'btn btn-lg', href: '/explore' }, icon('telescope', { size: 16 }), 'Explore the demo'),
          h('button', { class: 'btn btn-lg', type: 'button', onClick: () => openCommandPalette() },
            icon('search', { size: 16 }), 'Search or jump to…', h('kbd', {}, '/'))),
        h('p', { class: 'hero-note text-small text-muted' },
          'No network calls. No external domains. Press ', h('kbd', {}, '?'), ' for the full keyboard map.')),
      h('div', { class: 'hero-art', 'aria-hidden': 'true' },
        h('div', { class: 'hero-window' },
          h('div', { class: 'hero-window-bar' },
            h('span', { class: 'hero-dot' }), h('span', { class: 'hero-dot' }), h('span', { class: 'hero-dot' }),
            h('span', { class: 'hero-window-title' }, `${BRAND.hostPlaceholder}/octored/redget-core`)),
          h('pre', { class: 'hero-code' }, h('code', {},
            '$ rgt clone /octored/redget-core\n',
            '$ rgt issue create --title "Split diff drift" --label bug,crimson\n',
            '✓ Created issue #82\n',
            '$ rgt pr create --base main --head feature/split-diff-alignment\n',
            '✓ Opened pull request #43 · 3 checks queued\n',
            '$ rgt actions watch 90975\n',
            '● validate      success  1m 33s\n',
            '● build         success  2m 04s\n',
            '● a11y-audit    success  0m 48s\n',
            '✓ Run 90975 completed')),
          h('div', { class: 'hero-window-footer' },
            h('span', {}, 'RedGet CLI 1.14.2'),
            h('span', {}, 'theme: crimson'))))));
}

function metrics(db) {
  const stats = [
    { label: 'Repositories', value: db.repos.length, icon: 'repo' },
    { label: 'Commits', value: db.commits.length, icon: 'git-commit' },
    { label: 'Issues', value: db.issues.length, icon: 'issue-opened' },
    { label: 'Pull requests', value: db.pullRequests.length, icon: 'git-pull-request' },
    { label: 'Workflow runs', value: db.runs.length, icon: 'play' },
    { label: 'Contributors', value: db.users.length, icon: 'people' },
  ];
  return h('section', { class: 'metrics-band', 'aria-label': 'Demo dataset at a glance' },
    h('div', { class: 'container' },
      h('ul', { class: 'metric-list', role: 'list' },
        ...stats.map((stat) => h('li', { class: 'metric' },
          icon(stat.icon, { size: 20 }),
          h('span', { class: 'metric-value' }, String(stat.value)),
          h('span', { class: 'metric-label' }, stat.label))))));
}

function features() {
  const pillars = [
    {
      icon: 'code', title: 'Code, rendered properly',
      body: 'File trees, blob views with line numbers, syntax highlighting for 20+ languages, blame with grouped ranges, history per path, raw output and in-browser editing.',
      links: [
        { href: '/octored/redget-core', label: 'Repository home' },
        { href: '/octored/redget-core/blob/main/src/components/diff.js', label: 'Blob view' },
        { href: '/octored/redget-core/blame/main/assets/css/tokens.css', label: 'Blame' },
      ],
    },
    {
      icon: 'git-pull-request', title: 'Review that ships',
      body: 'Split and unified diffs, inline review threads, suggested changes you can apply, resolved conversations, required checks, drafts, auto-merge and a merge queue.',
      links: [
        { href: '/octored/redget-core/pull/43', label: 'Pull request #43' },
        { href: '/octored/redget-core/pull/43/files', label: 'Files changed' },
        { href: '/octored/redget-core/pulls', label: 'All pull requests' },
      ],
    },
    {
      icon: 'play', title: 'Automation, end to end',
      body: 'Workflows with matrix jobs, live logs, re-runs, artifacts, caches, secrets and variables, self-hosted runners, environments with protection rules and reusable workflows.',
      links: [
        { href: '/octored/redget-core/actions', label: 'Actions' },
        { href: '/octored/redget-core/actions/runs', label: 'Workflow runs' },
        { href: '/octored/redget-core/actions/secrets', label: 'Secrets' },
      ],
    },
    {
      icon: 'shield-check', title: 'Security by default',
      body: 'Dependabot alerts and updates, CodeQL code scanning, secret scanning with push protection, a dependency graph, SBOM export, advisories and an OpenSSF scorecard.',
      links: [
        { href: '/octored/redget-core/security', label: 'Security overview' },
        { href: '/octored/redget-core/security/dependabot', label: 'Dependabot' },
        { href: '/octored/redget-core/network/dependencies', label: 'Dependency graph' },
      ],
    },
    {
      icon: 'project', title: 'Plan in boards and tables',
      body: 'Projects with board, table and roadmap views, custom fields, iterations, archived items and cross-repository references.',
      links: [
        { href: '/octored/redget-core/projects', label: 'Projects' },
        { href: '/octored/redget-core/projects/1', label: 'Release train board' },
      ],
    },
    {
      icon: 'gear', title: 'Settings that persist',
      body: 'Repository, organization and account settings — branches, rulesets, webhooks, deploy keys, environments, notifications, billing and the danger zone — all saved to localStorage.',
      links: [
        { href: '/octored/redget-core/settings', label: 'Repository settings' },
        { href: '/settings', label: 'Your account' },
        { href: '/account/organizations/crimson-collective/settings', label: 'Organization settings' },
      ],
    },
  ];

  return h('section', { class: 'feature-band container', 'aria-labelledby': 'features-title' },
    h('h2', { class: 'band-title', id: 'features-title' }, 'Every part of the workflow, built out'),
    h('p', { class: 'band-lede' }, 'Not stubs: each link opens a real page with real generated data, real filters and real state changes.'),
    h('div', { class: 'feature-grid' },
      ...pillars.map((pillar) => h('article', { class: 'feature-card card' },
        h('div', { class: 'feature-icon', 'aria-hidden': 'true' }, icon(pillar.icon, { size: 24 })),
        h('h3', {}, pillar.title),
        h('p', { class: 'text-small' }, pillar.body),
        h('ul', { class: 'link-list', role: 'list' },
          ...pillar.links.map((link) => h('li', {}, h('a', { href: link.href }, link.label, ' ', icon('arrow-right', { size: 16 })))))))));
}

function showcase(repo) {
  const sample = `<div class="repo-shell">
  <nav class="repo-breadcrumb" aria-label="Breadcrumb">
    <ol>
      <li><a href="/${repo.ownerLogin}">${repo.ownerLogin}</a></li>
      <li><span aria-hidden="true">/</span></li>
      <li><a href="/${repo.fullName}" aria-current="page">${repo.name}</a></li>
    </ol>
  </nav>

  <div class="repo-header">
    <div class="repo-title-col">
      <h1 class="repo-title">
        <a href="/${repo.ownerLogin}">${repo.ownerLogin}</a> / <a href="/${repo.fullName}">${repo.name}</a>
        <span class="badge badge-neutral">Public</span>
      </h1>
    </div>
    <div class="repo-actions">
      <div class="repo-action-group">
        <button class="btn" aria-expanded="false">Watch <span class="counter">${repo.watchers}</span></button>
        <button class="btn">Fork <span class="counter">${repo.forks}</span></button>
        <button class="btn" aria-pressed="true">Star <span class="counter">${repo.stars}</span></button>
      </div>
    </div>
  </div>

  <nav class="repo-nav" aria-label="Repository">
    <ul class="repo-tabs" role="list">
      <li><a href="/${repo.fullName}" aria-current="page">Code</a></li>
      <li><a href="/${repo.fullName}/issues">Issues <span class="counter">${repo.openIssues}</span></a></li>
      <li><a href="/${repo.fullName}/pulls">Pull requests <span class="counter">${repo.openPulls}</span></a></li>
      <li><a href="/${repo.fullName}/actions">Actions</a></li>
      <li><a href="/${repo.fullName}/settings">Settings</a></li>
    </ul>
  </nav>
</div>`;

  return h('section', { class: 'showcase-band', 'aria-labelledby': 'showcase-title' },
    h('div', { class: 'container showcase-grid' },
      h('div', { class: 'showcase-copy' },
        h('h2', { class: 'band-title', id: 'showcase-title' }, 'Semantic HTML, all the way down'),
        h('p', {}, 'Every screen in RedGet is documented in markup terms. Dropdowns are ', h('code', { class: 'code-inline' }, 'button[aria-expanded]'), ' + ', h('code', { class: 'code-inline' }, 'ul[role="menu"]'), '; tabs are ', h('code', { class: 'code-inline' }, 'role="tablist"'), '; modals are real ', h('code', { class: 'code-inline' }, '<dialog>'), ' elements; toasts are ', h('code', { class: 'code-inline' }, 'div[role="status"]'), '; file lists are ', h('code', { class: 'code-inline' }, '<table>'), ' with a Name / Last commit message / Last commit time header row.'),
        h('p', {}, 'The guide in the app lists the exact structure of every component, so you can read the contract without reading the source.'),
        h('div', { class: 'hero-actions' },
          h('a', { class: 'btn btn-primary', href: '/docs/html-structure' }, icon('code', { size: 16 }), 'Open the HTML structure guide'),
          h('a', { class: 'btn', href: `/${repo.fullName}` }, icon('repo', { size: 16 }), `See ${repo.fullName} live`))),
      h('div', { class: 'showcase-code' },
        h('div', { class: 'code-block' },
          h('div', { class: 'code-block-header' },
            h('span', {}, 'repo-header.html'),
            h('button', {
              class: 'btn btn-sm', type: 'button',
              onClick: async () => {
                const { copyText } = await import('../components/overlay.js');
                copyText(sample);
              },
            }, icon('copy', { size: 16 }), 'Copy')),
          h('pre', {}, h('code', {}, sample))))));
}

function themesBand() {
  const themes = [
    { id: 'dark', label: 'Dark red-black', note: 'The default. Charcoal surfaces, crimson accents.' },
    { id: 'light', label: 'Light', note: 'Paper white with deep crimson links.' },
    { id: 'red', label: 'Crimson', note: 'Saturated red chrome for demos and screenshots.' },
    { id: 'contrast-dark', label: 'Dark high contrast', note: 'WCAG AAA contrast, thicker focus rings.' },
    { id: 'contrast-light', label: 'Light high contrast', note: 'Pure black text on white, no low-contrast greys.' },
  ];

  return h('section', { class: 'theme-band container', 'aria-labelledby': 'themes-title' },
    h('h2', { class: 'band-title', id: 'themes-title' }, 'Five themes, one token set'),
    h('p', { class: 'band-lede' }, 'Every colour in RedGet is a CSS custom property on ', h('code', { class: 'code-inline' }, 'html[data-theme]'), '. Switching themes never re-renders a component.'),
    h('ul', { class: 'theme-list', role: 'list' },
      ...themes.map((theme) => h('li', {},
        h('button', {
          class: 'theme-card', type: 'button', 'data-theme-preview': theme.id,
          onClick: async () => {
            const { applyTheme } = await import('../core/theme.js');
            applyTheme(theme.id);
            api.switchTheme(theme.id);
            toast({ message: `Theme: ${theme.label}`, variant: 'success' });
          },
        },
          h('span', { class: `theme-swatch theme-swatch-${theme.id}`, 'aria-hidden': 'true' }),
          h('span', { class: 'theme-card-body' },
            h('span', { class: 'theme-card-title' }, theme.label),
            h('span', { class: 'theme-card-note text-small text-muted' }, theme.note)),
          h('span', { class: 'theme-card-action' }, icon('paintbrush', { size: 16 }), 'Preview'))))));
}

function a11yBand() {
  const points = [
    { icon: 'keyboard', title: 'Keyboard first', body: 'Every control is reachable and operable with a keyboard. Focus traps in dialogs, roving focus in menus and tablists, and a documented shortcut map behind ?.' },
    { icon: 'eye', title: 'Screen-reader contract', body: 'Landmarks, aria-live regions for toasts and relative times, aria-current on tabs and nav, descriptive labels on icon-only buttons, and tables with real <th scope> headers.' },
    { icon: 'accessibility', title: 'Contrast and motion', body: 'Two high-contrast themes, a density switch, and prefers-reduced-motion honoured everywhere including the loading bar and skeleton shimmer.' },
    { icon: 'globe', title: 'Localisation and RTL', body: 'Seven locales with a full string table, including an RTL layout that flips the shell, the sidebar and the diff gutters.' },
  ];
  return h('section', { class: 'a11y-band', 'aria-labelledby': 'a11y-title' },
    h('div', { class: 'container' },
      h('h2', { class: 'band-title', id: 'a11y-title' }, 'Accessible by construction'),
      h('div', { class: 'feature-grid' },
        ...points.map((point) => h('article', { class: 'feature-card card' },
          h('div', { class: 'feature-icon', 'aria-hidden': 'true' }, icon(point.icon, { size: 24 })),
          h('h3', {}, point.title),
          h('p', { class: 'text-small' }, point.body))))));
}

function ctaBand(isSignedIn) {
  return h('section', { class: 'cta-band', 'aria-labelledby': 'cta-title' },
    h('div', { class: 'container cta-inner' },
      h('div', {},
        h('h2', { class: 'band-title', id: 'cta-title' }, isSignedIn ? 'Back to work' : 'Start with the demo dataset'),
        h('p', { class: 'band-lede' }, isSignedIn
          ? `Signed in as ${getSession().login}. Your stars, comments and settings persist in localStorage.`
          : 'Fourteen contributors, nine repositories, 206 commits, 81 issues, 37 pull requests and 68 workflow runs — all generated deterministically in your browser.'),
      h('div', { class: 'hero-actions' },
        h('a', { class: 'btn btn-primary btn-lg', href: isSignedIn ? '/dashboard' : '/join' }, isSignedIn ? 'Open your dashboard' : 'Create an account'),
        h('a', { class: 'btn btn-lg', href: '/docs' }, 'Documentation'),
        h('a', { class: 'btn btn-lg', href: '/pricing' }, 'Pricing')))));
}

/* ============================================================== dashboard */

const FEED_TABS = [
  { id: 'feed', label: 'Feed', href: '/dashboard' },
  { id: 'activity', label: 'All activity', href: '/dashboard?tab=activity' },
  { id: 'saved', label: 'Saved replies', href: '/dashboard?tab=saved' },
  { id: 'stars', label: 'Stars', href: '/dashboard?tab=stars' },
];

export function render(ctx = {}) {
  const session = getSession();
  const tab = ctx.query.tab || 'feed';
  const page = queryPage(ctx.query.page, 1);

  const main = h('main', { class: 'main-col' },
    h('nav', { class: 'subnav', 'aria-label': 'Dashboard views' },
      h('ul', { class: 'subnav-links', role: 'list' },
        ...FEED_TABS.map((item) => h('li', {},
          h('a', {
            href: item.href, class: 'subnav-link',
            'aria-current': item.id === tab ? 'page' : undefined,
          }, item.label)))),
      h('div', { class: 'subnav-right' },
        h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openCommandPalette() }, icon('search', { size: 16 }), 'Search'),
        h('a', { class: 'btn btn-sm btn-primary', href: '/new' }, icon('plus', { size: 16 }), 'New repository'))),
    tabBody(tab, session, page));

  const sidebar = h('aside', { class: 'sidebar', 'aria-label': 'Dashboard sidebar' },
    topRepositories(session.login),
    yourWork(session.login),
    exploreRepositories(session.login),
    teamsSection(),
    h('section', { class: 'sidebar-section' },
      h('h2', { class: 'sidebar-title' }, 'Demo data'),
      h('p', { class: 'text-small text-muted' }, 'Everything you change is stored as a patch log in localStorage and replayed on a fresh seed at boot.'),
      h('div', { class: 'sidebar-actions' },
        h('button', {
          class: 'btn btn-sm btn-block', type: 'button',
          onClick: () => import('../components/resetData.js').then((m) => m.openDataDialog()),
        }, icon('database', { size: 16 }), 'Manage demo data'))));

  return h('div', { class: 'container dashboard' },
    h('div', { class: 'grid grid-sidebar' }, main, sidebar));
}

function tabBody(tab, session, page) {
  if (tab === 'saved') return savedRepliesTab();
  if (tab === 'stars') return starsTab(session.login, page);
  if (tab === 'activity') return activityTab(session.login, page);
  return feedTab(session.login, page);
}

function feedTab(login, page) {
  const events = dashboardFeed(login);
  const { items, pages, total } = paginate(events, page, LIMITS.pageSize);

  if (!items.length) {
    return emptyState({
      icon: 'bell',
      title: 'Your feed is quiet',
      body: 'Follow a repository or a contributor and their activity will show up here.',
      action: h('a', { class: 'btn btn-primary', href: '/explore' }, icon('telescope', { size: 16 }), 'Explore repositories'),
    });
  }

  return h('div', { class: 'feed' },
    h('h1', { class: 'sr-only' }, 'Dashboard feed'),
    h('ul', { class: 'feed-list', role: 'list' }, ...items.map((event) => feedItem(event))),
    pagination({
      page, pages, total,
      hrefFor: (n) => `/dashboard?page=${n}`,
      onPage: (n) => navigate(`/dashboard?page=${n}`),
    }));
}

function feedItem(event) {
  const actor = findUserByLogin(event.actorLogin);
  const kindIcon = {
    PushEvent: 'git-commit', WatchEvent: 'star', ForkEvent: 'repo-forked', CreateEvent: 'repo',
    IssuesEvent: 'issue-opened', PullRequestEvent: 'git-pull-request', ReleaseEvent: 'tag',
    PublicEvent: 'globe', CommitCommentEvent: 'comment', MemberEvent: 'person',
  }[event.kind] || 'dot';

  return h('li', { class: 'feed-item' },
    h('span', { class: 'feed-avatar' }, avatar(actor || { login: event.actorLogin }, { size: 32 })),
    h('div', { class: 'feed-body' },
      h('p', { class: 'feed-title' },
        icon(kindIcon, { size: 16 }),
        ' ',
        h('a', { class: 'feed-actor', href: `/${event.actorLogin}` }, event.actorLogin),
        ' ',
        h('span', {}, event.title || event.kind),
        ' ',
        h('span', { class: 'text-muted' }, 'in '),
        h('a', { class: 'feed-repo', href: `/${event.repoFullName}` }, event.repoFullName)),
      h('p', { class: 'feed-meta text-small text-muted' },
        relativeTimeEl(event.createdAt),
        event.public === false ? h('span', {}, ' · ', badge('Private', 'attention')) : null)),
    h('a', { class: 'feed-link', href: event.url || `/${event.repoFullName}`, 'aria-label': `Open ${event.title || event.kind}` }, icon('arrow-right', { size: 16 })));
}

function activityTab(login, page) {
  const db = getDb();
  const all = (db.events || []).slice();
  const { items, pages, total } = paginate(all, page, LIMITS.pageSize);

  return h('div', { class: 'activity' },
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'All public activity'),
        h('p', { class: 'page-subtitle' }, `${total} events across ${db.repos.length} repositories in the demo dataset.`))),
    h('ul', { class: 'feed-list', role: 'list' }, ...items.map((event) => feedItem(event))),
    pagination({ page, pages, total, hrefFor: (n) => `/dashboard?tab=activity&page=${n}`, onPage: (n) => navigate(`/dashboard?tab=activity&page=${n}`) }));
}

function starsTab(login, page) {
  const db = getDb();
  const names = starredBy(login);
  const repos = names.map((name) => db.repos.find((r) => r.fullName === name)).filter(Boolean);
  const { items, pages, total } = paginate(repos, page, LIMITS.pageSize);

  return h('div', {},
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Your stars'),
        h('p', { class: 'page-subtitle' }, `${total} starred repositories.`))),
    items.length
      ? h('ul', { class: 'repo-list', role: 'list' }, ...items.map((repo) => h('li', { class: 'repo-list-item box-row' },
        h('div', { class: 'repo-list-main' },
          h('h2', { class: 'repo-list-title' },
            icon('repo', { size: 16 }), ' ',
            h('a', { href: `/${repo.fullName}` }, repo.fullName),
            ' ', badge(repo.visibility === 'public' ? 'Public' : repo.visibility === 'internal' ? 'Internal' : 'Private', 'neutral')),
          repo.description ? h('p', { class: 'repo-list-desc text-small text-muted' }, repo.description) : null,
          repo.topics && repo.topics.length ? chipRow(repo.topics.slice(0, 5).map((topic) => ({ label: topic, href: `/topics/${topic}` }))) : null),
        h('div', { class: 'repo-list-side' },
          h('span', { class: 'repo-stat' }, icon('star', { size: 16 }), ' ', String(repo.stars)),
          h('span', { class: 'repo-stat' }, icon('repo-forked', { size: 16 }), ' ', String(repo.forks)),
          h('button', {
            class: 'btn btn-sm', type: 'button',
            onClick: () => { api.toggleStar(repo.fullName); rerender(); },
          }, icon('star', { size: 16 }), 'Unstar')))))
      : emptyState({ icon: 'star', title: 'No stars yet', body: 'Star a repository and it will be listed here.', action: h('a', { class: 'btn btn-primary', href: '/explore' }, 'Explore') }),
    pages > 1 ? pagination({ page, pages, total, hrefFor: (n) => `/dashboard?tab=stars&page=${n}`, onPage: (n) => navigate(`/dashboard?tab=stars&page=${n}`) }) : null);
}

function savedRepliesTab() {
  const db = getDb();
  const replies = db.savedReplies || [];

  return h('div', {},
    h('div', { class: 'page-header' },
      h('div', { class: 'page-header-text' },
        h('h1', { class: 'page-title' }, 'Saved replies'),
        h('p', { class: 'page-subtitle' }, 'Reusable comment bodies, inserted into any composer.'))),
    replies.length
      ? h('ul', { class: 'saved-reply-list', role: 'list' }, ...replies.map((reply) => h('li', { class: 'saved-reply box-row' },
        h('div', { class: 'saved-reply-main' },
          h('h2', { class: 'saved-reply-title' }, reply.title),
          h('p', { class: 'text-small text-muted saved-reply-body' }, reply.body.slice(0, 220), reply.body.length > 220 ? '…' : '')),
        h('div', { class: 'saved-reply-actions' },
          h('button', {
            class: 'btn btn-sm', type: 'button',
            onClick: async () => {
              const { copyText } = await import('../components/overlay.js');
              copyText(reply.body);
            },
          }, icon('copy', { size: 16 }), 'Copy'),
          h('button', {
            class: 'btn btn-sm btn-danger', type: 'button',
            onClick: () => confirmDialog({
              title: `Delete “${reply.title}”?`, body: 'This saved reply will be removed.', confirmLabel: 'Delete', danger: true,
            }).then((ok) => { if (ok) { api.deleteSavedReply(reply.id); rerender(); toast({ message: 'Saved reply deleted', variant: 'info' }); } }),
          }, icon('trash', { size: 16 }), 'Delete')))))
      : emptyState({ icon: 'bookmark', title: 'No saved replies', body: 'Save a comment you write often.', action: h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openNewReplyDialog() }, 'Create a saved reply') }),
    h('div', { class: 'form-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => openNewReplyDialog() }, icon('plus', { size: 16 }), 'New saved reply')));
}

function openNewReplyDialog() {
  const title = h('input', { class: 'input', type: 'text', 'aria-label': 'Title', placeholder: 'Needs reproduction' });
  const body = h('textarea', { class: 'input', rows: '8', 'aria-label': 'Body', placeholder: 'Thanks for the report! …' });
  openDialog({
    title: 'New saved reply',
    body: h('div', { class: 'dialog-form' },
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Title'), title),
      h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Body'), body,
        h('span', { class: 'field-help' }, 'Markdown is supported. Insert with the bookmark button in any composer.'))),
    footer: (close) => [
      h('button', { class: 'btn', type: 'button', 'data-close': 'true' }, 'Cancel'),
      h('button', {
        class: 'btn btn-primary', type: 'button',
        onClick: () => {
          if (!title.value.trim()) { toast({ message: 'A title is required', variant: 'attention' }); return; }
          api.saveReply(title.value.trim(), body.value);
          close();
          rerender();
          toast({ message: 'Saved reply created', variant: 'success' });
        },
      }, 'Save reply'),
    ],
  });
}

/* ---------------------------------------------------------------- sidebar */

function topRepositories(login) {
  const repos = visibleReposFor(login).slice(0, 6);
  return sidebarSection('Top repositories',
    repos.length
      ? h('ul', { class: 'sidebar-repo-list', role: 'list' },
        ...repos.map((repo) => h('li', {},
          h('a', { class: 'sidebar-repo', href: `/${repo.fullName}` },
            icon(repo.fork ? 'repo-forked' : 'repo', { size: 16 }),
            h('span', { class: 'sidebar-repo-name' }, repo.name),
            repo.visibility === 'public' ? null : badge('Private', 'attention')))))
      : h('p', { class: 'text-small text-muted' }, 'No repositories yet.'),
    { action: h('a', { class: 'btn btn-sm', href: `/${login}?tab=repositories` }, `View all ${repos.length}`) });
}

function yourWork(login) {
  const db = getDb();
  const openIssues = (db.issues || []).filter((i) => i.state === 'open' && !i.isPull && (i.assignees || []).includes(login));
  const openPulls = (db.pullRequests || []).filter((p) => p.state === 'open' && (p.authorLogin === login || (p.reviewers || []).includes(login)));
  const mentions = (db.notifications || []).filter((n) => n.userLogin === login && n.reason === 'mention' && n.unread);

  return sidebarSection('Your work',
    h('ul', { class: 'kv-list', role: 'list' },
      h('li', {}, h('a', { href: '/issues' }, icon('issue-opened', { size: 16 }), ' Issues assigned to you'), counter(openIssues.length)),
      h('li', {}, h('a', { href: '/pulls' }, icon('git-pull-request', { size: 16 }), ' Pull requests to review'), counter(openPulls.length)),
      h('li', {}, h('a', { href: '/notifications' }, icon('bell', { size: 16 }), ' Unread mentions'), counter(mentions.length)),
      h('li', {}, h('a', { href: '/codespaces' }, icon('codespaces', { size: 16 }), ' Codespaces'), counter((db.codespaces || []).length)),
      h('li', {}, h('a', { href: '/gists' }, icon('code', { size: 16 }), ' Gists'), counter((db.gists || []).filter((g) => g.ownerLogin === login).length))));
}

function exploreRepositories(login) {
  const db = getDb();
  const own = new Set(visibleReposFor(login).map((r) => r.fullName));
  const suggestions = (db.repos || [])
    .filter((r) => !own.has(r.fullName) && r.visibility === 'public')
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 4);

  return sidebarSection('Explore repositories',
    suggestions.length
      ? h('ul', { class: 'sidebar-repo-list', role: 'list' }, ...suggestions.map((repo) => h('li', {},
        h('a', { class: 'sidebar-repo', href: `/${repo.fullName}` },
          icon('repo', { size: 16 }),
          h('span', { class: 'sidebar-repo-name' }, repo.fullName),
          h('span', { class: 'text-small text-muted' }, icon('star', { size: 16 }), ' ', String(repo.stars))))))
      : h('p', { class: 'text-small text-muted' }, 'You already follow everything.'),
    { action: h('a', { class: 'btn btn-sm', href: '/explore' }, 'Explore') });
}

function teamsSection() {
  const db = getDb();
  const session = getSession();
  const teams = (db.teams || []).filter((team) => (team.members || []).includes(session.login));
  if (!FEATURES.teams || !teams.length) return null;

  return sidebarSection('Your teams',
    h('ul', { class: 'sidebar-repo-list', role: 'list' },
      ...teams.map((team) => h('li', {},
        h('a', { class: 'sidebar-repo', href: `/orgs/${team.orgLogin}/teams` },
          icon('people', { size: 16 }),
          h('span', { class: 'sidebar-repo-name' }, team.name),
          h('span', { class: 'text-small text-muted' }, `${(team.members || []).length} members`))))));
}

export default { render, renderLanding };
