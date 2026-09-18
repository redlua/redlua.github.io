/**
 * RedGet — repository chrome.
 *
 * Markup contract (documented at the top of /assets/css/repo.css):
 *
 *   <div class="repo-shell container">
 *     <nav class="repo-breadcrumb" aria-label="Repository breadcrumb">
 *       <ol><li><a href="/octored">octored</a></li><li><a aria-current="page">redget-core</a></li></ol>
 *     </nav>
 *     <div class="repo-header">
 *       <div class="repo-title-col">
 *         <div class="repo-title-row">
 *           <img class="avatar avatar-20" alt="">
 *           <h1 class="repo-title"><a>/octored</a><span class="sep">/</span>
 *             <a class="repo-name">redget-core</a><span class="badge">Public</span></h1>
 *         </div>
 *         <p class="repo-forked-from">forked from <a>/…</a></p>
 *       </div>
 *       <div class="repo-actions">
 *         <div class="repo-action-group"> <button class="btn">Watch</button> <a class="btn-count">
 *       </div>
 *     </div>
 *     <div class="repo-nav" role="navigation" aria-label="Repository">
 *       <ul class="repo-tabs" role="list"> <li><a aria-current="page"><svg class="icon">Code
 *         <span class="counter">…</span></a></li> … </ul>
 *     </div>
 *     <div class="repo-body"> <main> … </main> <aside class="repo-sidebar"> … </aside> </div>
 *   </div>
 */

import { h, icon, qs, clear, replaceChildren } from '../core/dom.js';
import { getDb, getSession, getCurrentUser } from '../core/store.js';
import { navigate } from '../core/router.js';
import { attachMenu, dropdown, openDialog, confirmDialog, toast, toastSuccess, copyButton, initTooltips } from './overlay.js';
import { avatar } from './avatars.js';
import { counter, visibilityBadge, relativeTimeEl, labelPill, emptyState, segmented, badge } from './kit.js';
import { compactNumber, formatBytes, truncate } from '../core/util.js';
import { BRAND, FEATURES } from '../config.js';
import { CONTENT } from '../data/mockData.js';
import * as api from '../core/api.js';

/* ==========================================================================
   Repository tabs
   ========================================================================== */

/**
 * The tab set mirrors RedGet's repository navigation. Each entry declares the
 * feature flag that enables it, so turning a feature off in /src/config.js
 * removes the tab everywhere at once.
 */
export function repoTabDefs(repo) {
  const db = getDb() || {};
  const runs = (db.runs || []).filter((r) => r.repoFullName === repo.fullName);
  const failedRuns = runs.filter((r) => r.status !== 'completed' || r.conclusion === 'failure').length;
  const advisories = (db.advisories || []).filter((a) => a.repoFullName === repo.fullName).length;
  const openAlerts = (db.dependabotAlerts || []).filter((a) => a.repoFullName === repo.fullName && a.state === 'open').length
    + (db.codeScanningAlerts || []).filter((a) => a.repoFullName === repo.fullName && a.state === 'open').length
    + (db.secretScanningAlerts || []).filter((a) => a.repoFullName === repo.fullName && a.state === 'open').length;
  const projects = (db.projects || []).filter((p) => !p.repoFullName || p.repoFullName === repo.fullName).length;
  const packages = (db.packages || []).filter((p) => p.repoFullName === repo.fullName).length;
  const discussions = (db.discussions || []).filter((d) => d.repoFullName === repo.fullName).length;

  const tabs = [
    { id: 'code', label: 'Code', icon: 'code-square', href: `/${repo.fullName}` },
    { id: 'issues', label: 'Issues', icon: 'issue-opened', href: `/${repo.fullName}/issues`, count: repo.openIssues || 0, feature: 'issues' },
    { id: 'pulls', label: 'Pull requests', icon: 'git-pull-request', href: `/${repo.fullName}/pulls`, count: repo.openPulls || 0, feature: 'pulls' },
    { id: 'actions', label: 'Actions', icon: 'play', href: `/${repo.fullName}/actions`, count: failedRuns || null, feature: 'actions' },
    { id: 'projects', label: 'Projects', icon: 'project', href: `/${repo.fullName}/projects`, count: projects || null, feature: 'projects' },
    { id: 'wiki', label: 'Wiki', icon: 'book', href: `/${repo.fullName}/wiki`, feature: 'wiki', requires: repo.hasWiki },
    { id: 'security', label: 'Security', icon: 'shield', href: `/${repo.fullName}/security`, count: openAlerts + advisories || null, feature: 'security' },
    { id: 'insights', label: 'Insights', icon: 'graph', href: `/${repo.fullName}/pulse`, feature: 'insights' },
    { id: 'settings', label: 'Settings', icon: 'gear', href: `/${repo.fullName}/settings`, feature: 'settings' },
  ];

  const extra = [
    { id: 'discussions', label: 'Discussions', icon: 'comment-discussion', href: `/${repo.fullName}/discussions`, count: discussions || null, feature: 'discussions', requires: repo.hasDiscussions },
    { id: 'releases', label: 'Releases', icon: 'tag', href: `/${repo.fullName}/releases`, count: repo.releaseCount || null, feature: 'releases' },
    { id: 'packages', label: 'Packages', icon: 'package', href: `/${repo.fullName}/packages`, count: packages || null, feature: 'packages', requires: packages > 0 },
  ];

  return [...tabs, ...extra].filter((tab) => {
    if (tab.feature && FEATURES[tab.feature] === false) return false;
    if (tab.requires === false) return false;
    return true;
  });
}

/** <div class="repo-nav"><ul class="repo-tabs" role="list"> … </ul></div> */
export function repoTabs(repo, activeId) {
  const defs = repoTabDefs(repo);
  const visible = defs.slice(0, 9);
  const overflow = defs.slice(9);

  const list = h('ul', { class: 'repo-tabs', role: 'list' });
  visible.forEach((tab) => {
    const active = tab.id === activeId;
    list.appendChild(h('li', {},
      h('a', {
        href: tab.href,
        'aria-current': active ? 'page' : undefined,
        title: tab.label,
      },
      icon(tab.icon, { size: 16 }),
      h('span', {}, tab.label),
      tab.count ? counter(tab.count) : null)));
  });

  if (overflow.length) {
    const menuId = 'repo-tabs-more';
    const menu = h('ul', { class: 'dropdown-menu', role: 'menu', id: menuId, hidden: true, dataset: { align: 'right' } },
      overflow.map((tab) => h('li', { role: 'none' },
        h('a', {
          class: 'dropdown-item', role: 'menuitem', href: tab.href, tabindex: '-1',
          'aria-current': tab.id === activeId ? 'page' : undefined,
        }, icon(tab.icon, { size: 16 }), h('span', { class: 'grow text-ellipsis' }, tab.label),
        tab.count ? counter(tab.count) : null))));
    const trigger = h('button', {
      class: 'repo-tabs-more', type: 'button',
      'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId,
      'aria-label': 'More repository tabs',
    }, icon('kebab', { size: 16 }));
    attachMenu(trigger, menu, { align: 'right' });
    list.appendChild(h('li', {}, h('div', { class: 'dropdown' }, trigger, menu)));
  }

  return h('div', { class: 'repo-nav', role: 'navigation', 'aria-label': 'Repository' }, list);
}

/* ==========================================================================
   Repository header
   ========================================================================== */

export function repoBreadcrumb(repo) {
  return h('nav', { class: 'repo-breadcrumb', 'aria-label': 'Repository breadcrumb' },
    h('ol', {},
      h('li', {}, h('a', { href: `/${repo.ownerLogin}` }, repo.ownerLogin)),
      h('li', {}, h('a', { href: `/${repo.fullName}`, 'aria-current': 'page' }, repo.name))));
}

export function repoTitle(repo) {
  return h('div', { class: 'repo-title-row' },
    h('a', { href: `/${repo.ownerLogin}`, 'aria-label': repo.ownerLogin },
      avatar({ login: repo.ownerLogin }, { size: 20 })),
    h('h1', { class: 'repo-title' },
      h('a', { href: `/${repo.ownerLogin}` }, repo.ownerLogin),
      h('span', { class: 'sep', 'aria-hidden': 'true' }, '/'),
      h('a', { class: 'repo-name', href: `/${repo.fullName}` }, repo.name),
      visibilityBadge(repo.visibility),
      repo.archived ? badge('Archived', 'attention', { iconName: 'archive' }) : null,
      repo.template ? badge('Template', 'neutral', { iconName: 'repo' }) : null));
}

/**
 * Watch / Fork / Star button groups. Each is
 * `<div class="repo-action-group"><button class="btn">…</button><a class="btn-count">…</a></div>`
 */
export function repoActions(repo) {
  const watchLevel = api.watchLevel(repo.fullName);
  const starred = api.hasStarred(repo.fullName);
  const db = getDb() || {};
  const forks = (db.forks || []).filter((f) => f.repoFullName === repo.fullName).length + (repo.forks || 0);

  const watchLabel = watchLevel === 'ignore' ? 'Ignoring' : watchLevel === 'all' ? 'Unwatch' : watchLevel ? 'Custom' : 'Watch';
  const watchIcon = watchLevel === 'ignore' ? 'bell' : watchLevel ? 'eye' : 'eye';

  const watchButton = h('button', {
    class: ['btn btn-sm', watchLevel ? 'btn-active' : ''].filter(Boolean).join(' '),
    type: 'button',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'data-watch-trigger': 'true',
  }, icon(watchIcon, { size: 16 }), h('span', { 'data-watch-label': '' }, watchLabel), icon('chevron-down', { size: 16 }));

  const watchMenu = h('ul', { class: 'dropdown-menu', role: 'menu', hidden: true, dataset: { align: 'left', width: 'wide' }, 'aria-label': 'Notification settings' },
    watchOption(repo, 'participating', 'Participating and @mentions', 'Only receive notifications from this repository when participating or @mentioned.', watchLevel),
    watchOption(repo, 'all', 'All Activity', 'Receive notifications for every conversation in this repository.', watchLevel),
    watchOption(repo, 'ignore', 'Ignore', 'Never receive notifications from this repository.', watchLevel),
    watchOption(repo, 'custom', 'Custom', 'Choose which events you want to be notified about.', watchLevel));

  const watchGroup = h('div', { class: 'repo-action-group dropdown' },
    watchButton,
    watchMenu,
    h('a', { class: 'btn-count', href: `/${repo.fullName}/watchers`, 'aria-label': `${repo.watchers} watchers`, title: `${compactNumber(repo.watchers)} watching` },
      icon('eye', { size: 16 }), compactNumber(repo.watchers)));
  attachMenu(watchButton, watchMenu, { align: 'left', focusFirst: false });

  const forkGroup = h('div', { class: 'repo-action-group' },
    h('button', {
      class: 'btn btn-sm', type: 'button', onClick: () => openForkDialog(repo),
    }, icon('repo-forked', { size: 16 }), h('span', {}, 'Fork')),
    h('a', { class: 'btn-count', href: `/${repo.fullName}/forks`, 'aria-label': `${forks} forks` },
      compactNumber(forks)));

  const starGroup = h('div', { class: 'repo-action-group' },
    h('button', {
      class: ['btn btn-sm', starred ? 'btn-starred' : ''].filter(Boolean).join(' '),
      type: 'button',
      'aria-pressed': String(starred),
      'data-star-trigger': 'true',
      onClick: () => {
        const nowStarred = api.toggleStar(repo.fullName);
        const button = qs('[data-star-trigger]');
        const countEl = qs('[data-star-count]');
        const fresh = api.repoByFullName(repo.fullName);
        if (button) {
          button.classList.toggle('btn-starred', nowStarred);
          button.setAttribute('aria-pressed', String(nowStarred));
          replaceChildren(button,
            icon(nowStarred ? 'star-fill' : 'star', { size: 16 }),
            h('span', {}, nowStarred ? 'Starred' : 'Star'));
        }
        if (countEl && fresh) countEl.textContent = compactNumber(fresh.stars);
        toastSuccess(nowStarred ? `Starred ${repo.fullName}` : `Removed your star from ${repo.fullName}`);
      },
    }, icon(starred ? 'star-fill' : 'star', { size: 16 }), h('span', {}, starred ? 'Starred' : 'Star')),
    h('a', { class: 'btn-count', href: `/${repo.fullName}/stargazers`, 'aria-label': `${repo.stars} stars`, 'data-star-count': '' },
      compactNumber(repo.stars)));

  return h('div', { class: 'repo-actions' }, watchGroup, forkGroup, starGroup);
}

function watchOption(repo, level, label, description, current) {
  return h('li', { role: 'none' },
    h('button', {
      class: 'dropdown-item', role: 'menuitemradio', type: 'button', tabindex: '-1',
      'aria-checked': String(current === level),
      onClick: () => {
        api.setWatch(repo.fullName, current === level ? null : level);
        const fresh = api.repoByFullName(repo.fullName);
        const button = qs('[data-watch-trigger]');
        if (button) {
          const nextLevel = current === level ? null : level;
          const text = nextLevel === 'ignore' ? 'Ignoring' : nextLevel === 'all' ? 'Unwatch' : nextLevel ? 'Custom' : 'Watch';
          const labelEl = qs('[data-watch-label]', button);
          if (labelEl) labelEl.textContent = text;
          button.classList.toggle('btn-active', Boolean(nextLevel));
        }
        void fresh;
        toastSuccess(current === level ? 'Notification settings cleared' : `Notification settings: ${label}`);
      },
    },
    icon(level === 'ignore' ? 'bell' : level === 'custom' ? 'filter' : 'eye', { size: 16 }),
    h('span', { class: 'dropdown-item-wrap' },
      h('span', {}, label),
      h('span', { class: 'dropdown-item-desc' }, description)),
    h('span', { class: 'check-mark' }, icon('check', { size: 16 }))));
}

export function repoHeader(repo) {
  return h('div', { class: 'repo-header' },
    h('div', { class: 'repo-title-col' },
      repoTitle(repo),
      repo.fork && repo.forkParent
        ? h('p', { class: 'repo-forked-from' }, 'forked from ', h('a', { href: `/${repo.forkParent}` }, repo.forkParent))
        : null),
    repoActions(repo));
}

export function openForkDialog(repo) {
  const db = getDb() || {};
  const session = getSession();
  const owners = [session.login, ...(db.orgs || []).map((o) => o.login)].filter(Boolean);
  const ownerSelect = h('select', { class: 'input', id: 'fork-owner', 'aria-label': 'Fork owner' },
    owners.map((login) => h('option', { value: login, selected: login === session.login }, login)));
  const nameInput = h('input', { class: 'input', id: 'fork-name', type: 'text', value: repo.name, 'aria-label': 'Fork name' });
  const copyDefault = h('input', { type: 'checkbox', id: 'fork-default-branch', checked: true });

  openDialog({
    title: `Fork ${repo.fullName}`,
    body: h('div', { class: 'dialog-form' },
      h('div', { class: 'field' }, h('label', { for: 'fork-owner' }, 'Owner'), ownerSelect),
      h('div', { class: 'field' }, h('label', { for: 'fork-name' }, 'Repository name'), nameInput),
      h('div', { class: 'field' }, h('label', { for: 'fork-default-branch' }, 'Copy the default branch only'),
        h('label', { class: 'checkbox-row' }, copyDefault, h('span', {}, 'Leave unchecked to copy every branch'))),
      h('p', { class: 'field-help' }, `The fork keeps a link back to ${repo.fullName} and appears in the network graph.`)),
    confirmLabel: 'Create fork',
    onConfirm: () => {
      const owner = ownerSelect.value;
      const name = nameInput.value.trim() || repo.name;
      const fullName = `${owner}/${name}`;
      if (api.repoByFullName(fullName)) {
        toast({ variant: 'danger', message: `${fullName} already exists.` });
        return false;
      }
      api.createRepository({
        ownerLogin: owner, name, description: repo.description, visibility: repo.visibility,
        initReadme: false, license: repo.license,
      });
      api.updateRepository(fullName, { fork: true, forkParent: repo.fullName, language: repo.language, languages: repo.languages, topics: repo.topics.slice() });
      toastSuccess(`Forked to ${fullName}`);
      navigate(`/${fullName}`);
      return true;
    },
  });
}

/* ==========================================================================
   Repository shell
   ========================================================================== */

/**
 * Standard repository page: breadcrumb, header, tabs, then either a full-width
 * body or a body + right sidebar grid.
 *
 * @param {object} repo
 * @param {string} activeTab tab id from repoTabDefs()
 * @param {object} options { main, sidebar, fullWidth, beforeBody, afterBody }
 */
export function repoShell(repo, activeTab, options = {}) {
  const { main, sidebar = null, fullWidth = false, beforeBody = null, afterBody = null, cls = '' } = options;
  const body = fullWidth || !sidebar
    ? h('div', { class: 'repo-body repo-body-full' }, h('main', { class: 'main-col', id: 'repo-main' }, main))
    : h('div', { class: 'repo-body' },
      h('main', { class: 'main-col', id: 'repo-main' }, main),
      h('aside', { class: 'repo-sidebar', 'aria-label': 'Repository information' }, sidebar));

  const shell = h('div', { class: ['repo-shell', 'container', cls].filter(Boolean).join(' ') },
    repoBreadcrumb(repo),
    repoHeader(repo),
    repoTabs(repo, activeTab),
    beforeBody,
    body,
    afterBody);

  initTooltips(shell);
  return shell;
}

/* ==========================================================================
   Sidebar (About / Releases / Packages / Contributors / Languages)
   ========================================================================== */

export function repoSidebar(repo, options = {}) {
  const { show = ['about', 'releases', 'packages', 'contributors', 'languages'] } = options;
  const db = getDb() || {};
  const sidebar = h('div', { class: 'repo-sidebar-inner' });

  if (show.includes('about')) sidebar.appendChild(aboutSection(repo));
  if (show.includes('releases')) sidebar.appendChild(releasesSection(repo, db));
  if (show.includes('packages')) sidebar.appendChild(packagesSection(repo, db));
  if (show.includes('contributors')) sidebar.appendChild(contributorsSection(repo));
  if (show.includes('languages')) sidebar.appendChild(languagesSection(repo));
  return sidebar;
}

function aboutSection(repo) {
  const homepage = repo.homepage ? h('a', { href: repo.homepage }, icon('link', { size: 16 }), h('span', {}, repo.homepage.replace(/^\//, ''))) : null;
  const topics = (repo.topics || []).length
    ? h('div', { class: 'topic-tags' }, repo.topics.map((topic) => h('a', { class: 'topic-tag', href: `/topics/${topic}` }, topic)))
    : null;

  return h('section', { class: 'sidebar-section' },
    h('h2', { class: 'sidebar-title' }, 'About'),
    repo.description ? h('p', { class: 'sidebar-about' }, repo.description) : h('p', { class: 'sidebar-about text-muted' }, 'No description, website or topics provided.'),
    topics,
    h('div', { class: 'sidebar-meta' },
      homepage,
      repo.license ? h('a', { href: `/${repo.fullName}/blob/${repo.defaultBranch}/LICENSE` }, icon('shield', { size: 16 }), h('span', {}, `${repo.license} license`)) : null,
      h('a', { href: `/${repo.fullName}/blob/${repo.defaultBranch}/CODE_OF_CONDUCT.md` }, icon('codes-of-conduct', { size: 16 }), h('span', {}, 'Code of conduct')),
      h('a', { href: `/${repo.fullName}/blob/${repo.defaultBranch}/SECURITY.md` }, icon('shield-check', { size: 16 }), h('span', {}, 'Security policy')),
      h('a', { href: `/${repo.fullName}/blob/${repo.defaultBranch}/CITATION.cff` }, icon('quote', { size: 16 }), h('span', {}, 'Citation')),
      repo.hasPages ? h('a', { href: `/${repo.fullName}/pages` }, icon('globe', { size: 16 }), h('span', {}, 'RedGet Pages')) : null),
    h('div', { class: 'sidebar-counts' },
      h('a', { href: `/${repo.fullName}/stargazers` }, icon('star', { size: 16 }), h('strong', {}, compactNumber(repo.stars)), ' stars'),
      h('a', { href: `/${repo.fullName}/forks` }, icon('repo-forked', { size: 16 }), h('strong', {}, compactNumber(repo.forks)), ' forks')),
    h('div', { class: 'sidebar-meta mt-3' },
      h('span', {}, icon('history', { size: 16 }), ' Updated ', relativeTimeEl(repo.pushedAt))));
}

function releasesSection(repo, db) {
  const releases = (db.releases || []).filter((r) => r.repoFullName === repo.fullName);
  const latest = releases.find((r) => r.latest) || releases[0];
  return h('section', { class: 'sidebar-section' },
    h('h2', { class: 'sidebar-title' },
      h('a', { class: 'sidebar-title-link', href: `/${repo.fullName}/releases` }, 'Releases'),
      h('span', { class: 'counter' }, String(releases.length))),
    latest
      ? h('div', { class: 'sidebar-release' },
        h('a', { class: 'sidebar-release-name', href: `/${repo.fullName}/releases/tag/${latest.tagName}` },
          icon('tag', { size: 16 }), h('span', {}, latest.name || latest.tagName)),
        h('div', { class: 'sidebar-release-meta' },
          latest.prerelease ? badge('Pre-release', 'attention') : badge('Latest', 'success'),
          h('span', {}, relativeTimeEl(latest.publishedAt || latest.createdAt))))
      : h('p', { class: 'text-muted text-small' }, 'No releases published'),
    h('a', { class: 'sidebar-more', href: `/${repo.fullName}/tags` }, `${repo.tagCount || 0} tags`));
}

function packagesSection(repo, db) {
  const packages = (db.packages || []).filter((p) => p.repoFullName === repo.fullName);
  if (!packages.length) return h('section', { class: 'sidebar-section' },
    h('h2', { class: 'sidebar-title' }, 'Packages'),
    h('p', { class: 'text-muted text-small' }, 'No packages published'));
  return h('section', { class: 'sidebar-section' },
    h('h2', { class: 'sidebar-title' },
      h('a', { class: 'sidebar-title-link', href: `/${repo.fullName}/packages` }, 'Packages')),
    h('ul', { class: 'sidebar-packages', role: 'list' },
      packages.slice(0, 4).map((pkg) => h('li', {},
        h('a', { href: `/${repo.fullName}/packages` },
          icon('package', { size: 16 }),
          h('span', {}, pkg.name),
          h('span', { class: 'text-muted text-small' }, pkg.latest))))));
}

function contributorsSection(repo) {
  const db = getDb() || {};
  const logins = repo.contributors || [];
  const commitCounts = new Map();
  (db.commits || []).filter((c) => c.repoFullName === repo.fullName).forEach((commit) => {
    commitCounts.set(commit.authorLogin, (commitCounts.get(commit.authorLogin) || 0) + 1);
  });
  const sorted = logins.slice().sort((a, b) => (commitCounts.get(b) || 0) - (commitCounts.get(a) || 0));
  if (!sorted.length) return null;
  return h('section', { class: 'sidebar-section' },
    h('h2', { class: 'sidebar-title' },
      h('a', { class: 'sidebar-title-link', href: `/${repo.fullName}/graphs/contributors` }, 'Contributors'),
      h('span', { class: 'counter' }, String(sorted.length))),
    h('div', { class: 'contributor-avatars' },
      sorted.slice(0, 14).map((login) => h('a', {
        href: `/${login}`, title: `${login} · ${commitCounts.get(login) || 0} commits`,
        'aria-label': `${login}, ${commitCounts.get(login) || 0} commits`,
      }, avatar({ login }, { size: 28 })))),
    sorted.length > 14 ? h('a', { class: 'sidebar-more', href: `/${repo.fullName}/graphs/contributors` }, `+ ${sorted.length - 14} more`) : null);
}

function languagesSection(repo) {
  const languages = repo.languages || [];
  if (!languages.length) return null;
  return h('section', { class: 'sidebar-section' },
    h('h2', { class: 'sidebar-title' }, 'Languages'),
    h('div', { class: 'lang-bar', role: 'img', 'aria-label': languages.map((l) => `${l.name} ${l.percent}%`).join(', ') },
      languages.map((entry) => h('span', {
        style: `width:${entry.percent}%;background-color:${entry.color}`,
        title: `${entry.name} ${entry.percent}%`,
      }))),
    h('ul', { class: 'lang-list', role: 'list' },
      languages.map((entry) => h('li', {},
        h('span', { class: 'lang-swatch', style: `background-color:${entry.color}`, 'aria-hidden': 'true' }),
        h('span', { class: 'lang-name' }, entry.name),
        h('span', { class: 'lang-pct' }, `${entry.percent.toFixed(1)}%`)))));
}

/* ==========================================================================
   Settings chrome
   ========================================================================== */

export const SETTINGS_SECTIONS = [
  {
    group: 'General',
    items: [
      { id: 'general', label: 'General', icon: 'gear', hrefSuffix: '/settings' },
      { id: 'access', label: 'Collaborators and teams', icon: 'people', hrefSuffix: '/settings/access' },
      { id: 'moderation', label: 'Moderation options', icon: 'shield', hrefSuffix: '/settings/moderation' },
      { id: 'analysis', label: 'Code security and analysis', icon: 'scan', hrefSuffix: '/settings/security-analysis' },
      { id: 'actions-general', label: 'Actions · General', icon: 'play', hrefSuffix: '/settings/actions' },
      { id: 'pages', label: 'Pages', icon: 'globe', hrefSuffix: '/settings/pages' },
      { id: 'notifications', label: 'Notifications', icon: 'bell', hrefSuffix: '/settings/notifications' },
      { id: 'rules', label: 'Rules · Rulesets', icon: 'list-ordered', hrefSuffix: '/settings/rules' },
      { id: 'branches', label: 'Branches', icon: 'git-branch', hrefSuffix: '/settings/branches' },
      { id: 'tags', label: 'Tags', icon: 'tag', hrefSuffix: '/settings/tags' },
    ],
  },
  {
    group: 'Code and automation',
    items: [
      { id: 'webhooks', label: 'Webhooks', icon: 'link', hrefSuffix: '/settings/hooks' },
      { id: 'environments', label: 'Environments', icon: 'server', hrefSuffix: '/settings/environments' },
      { id: 'codespaces', label: 'Codespaces', icon: 'codespaces', hrefSuffix: '/settings/codespaces' },
      { id: 'secrets', label: 'Secrets and variables', icon: 'key', hrefSuffix: '/actions/secrets' },
      { id: 'deploy-keys', label: 'Deploy keys', icon: 'key', hrefSuffix: '/settings/keys' },
      { id: 'apps', label: 'RedGet Apps', icon: 'package', hrefSuffix: '/settings/installations' },
    ],
  },
  {
    group: 'Security',
    items: [
      { id: 'security', label: 'Security overview', icon: 'shield-check', hrefSuffix: '/security' },
      { id: 'advisories', label: 'Advisories', icon: 'alert', hrefSuffix: '/security/advisories' },
      { id: 'dependabot', label: 'Dependabot', icon: 'dependabot', hrefSuffix: '/security/dependabot' },
    ],
  },
];

export function settingsMenu(repo, activeId) {
  const nav = h('nav', { class: 'settings-menu', 'aria-label': 'Repository settings' });

  SETTINGS_SECTIONS.forEach((section) => {
    const items = section.items.map((item) => {
      const link = h('a', {
        href: `/${repo.fullName}${item.hrefSuffix}`,
        'aria-current': item.id === activeId ? 'page' : undefined,
      });
      link.append(icon(item.icon, { size: 16 }), h('span', {}, item.label));
      return h('li', {}, link);
    });

    const group = h('div', { class: 'settings-menu-group' });
    group.append(
      h('h2', { class: 'settings-menu-title' }, section.group),
      h('ul', { class: 'settings-menu-list', role: 'list' }, ...items),
    );
    nav.appendChild(group);
  });

  return nav;
}

export function settingsLayout(repo, activeId, content, options = {}) {
  const { title = 'Settings' } = options;
  return h('div', { class: ['repo-shell', 'container'].join(' ') },
    repoBreadcrumb(repo),
    repoHeader(repo),
    repoTabs(repo, 'settings'),
    h('div', { class: 'settings-layout' },
      settingsMenu(repo, activeId),
      h('main', { class: 'settings-content', id: 'settings-main' },
        h('h1', { class: 'page-title settings-page-title' }, title),
        content)));
}

export function settingsSection(title, description, control, options = {}) {
  const { id = null } = options;
  return h('section', { class: 'settings-section', id: id || undefined },
    h('h2', {}, title),
    h('div', { class: 'settings-row' },
      h('div', { class: 'settings-row-label' },
        h('h3', {}, title),
        description ? h('p', {}, description) : null),
      h('div', { class: 'settings-row-control' }, control)));
}

export function dangerZone(rows) {
  return h('section', { class: 'danger-zone', 'aria-labelledby': 'danger-zone-title' },
    h('h2', { class: 'danger-zone-header', id: 'danger-zone-title' }, 'Danger Zone'),
    rows.map((row) => h('div', { class: 'danger-zone-row' },
      h('div', { class: 'grow' },
        h('h3', {}, row.title),
        h('p', {}, row.description)),
      h('button', { class: 'btn btn-danger', type: 'button', onClick: row.onClick }, row.label))));
}

export function confirmDanger({ title, description, repoName, confirmLabel }) {
  const input = h('input', { class: 'input', type: 'text', 'data-autofocus': 'true', 'aria-label': `Type ${repoName} to confirm`, placeholder: repoName });
  return confirmDialog({
    title,
    size: 'md',
    danger: true,
    confirmLabel: confirmLabel || title,
    requireText: repoName,
    body: h('div', { class: 'dialog-form' },
      h('p', {}, description),
      h('div', { class: 'field' },
        h('label', { for: input.id || undefined, class: 'text-strong' }, `To confirm, type `, h('code', { class: 'code-inline' }, repoName), ' in the box below'),
        input)),
  });
}

/* ==========================================================================
   Branch selector / code toolbar / clone panel
   ========================================================================== */

/**
 * Branch and tag switcher:
 * `<div class="branch-selector"><button class="branch-btn">…</button>
 *  <div class="branch-menu dropdown-menu"> <div class="branch-tabs" role="tablist">
 *  <div class="branch-search"><input role="combobox" aria-expanded aria-controls="…"></div>
 *  <ul class="branch-list" role="listbox" id="…"> <li><button role="option" aria-selected> </ul>`
 */
export function branchSelector(repo, options = {}) {
  const { branch = repo.defaultBranch, kind = 'branch', onChange = null, path = '' } = options;
  const db = getDb() || {};
  const branches = (db.branches || []).filter((b) => b.repoFullName === repo.fullName);
  const tags = (db.tags || []).filter((t) => t.repoFullName === repo.fullName);
  const listId = `branch-list-${Math.random().toString(36).slice(2, 8)}`;

  const trigger = h('button', {
    class: 'branch-btn', type: 'button',
    'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-controls': listId,
    title: `Switch ${kind}s`,
  },
  icon(kind === 'tag' ? 'tag' : 'git-branch', { size: 16 }),
  h('span', { class: 'branch-name' }, branch),
  icon('chevron-down', { size: 16 }));

  const menu = h('div', { class: 'branch-menu dropdown-menu', id: `${listId}-menu`, role: 'group', 'aria-label': 'Switch branches or tags', hidden: true, dataset: { align: 'left' } });

  let activeKind = kind === 'tag' ? 'tags' : 'branches';
  const tabs = h('div', { class: 'branch-tabs', role: 'tablist', 'aria-label': 'Ref kind' });
  const searchInput = h('input', {
    class: 'input branch-search-input', type: 'search', placeholder: 'Find a branch…',
    role: 'combobox', 'aria-expanded': 'true', 'aria-controls': listId,
    'aria-autocomplete': 'list', autocomplete: 'off', 'data-autofocus': 'true',
  });
  const list = h('ul', { class: 'branch-list', id: listId, role: 'listbox', 'aria-label': activeKind });
  const emptyRow = h('li', { class: 'branch-empty text-muted text-small', role: 'presentation', hidden: true }, 'Nothing matched');

  function entriesFor(tabKind) {
    if (tabKind === 'tags') {
      return tags.map((tag) => ({ name: tag.name, meta: `tag · ${tag.date.slice(0, 10)}`, selected: tag.name === branch }));
    }
    return branches.map((entry) => ({
      name: entry.name,
      meta: entry.name === repo.defaultBranch ? 'default branch' : `${entry.aheadBy} ahead · ${entry.behindBy} behind`,
      selected: entry.name === branch,
      isDefault: entry.name === repo.defaultBranch,
    }));
  }

  function renderList(filter = '') {
    clear(list);
    const items = entriesFor(activeKind).filter((entry) => entry.name.toLowerCase().includes(filter.toLowerCase()));
    emptyRow.hidden = items.length > 0;
    items.forEach((entry) => {
      list.appendChild(h('li', { role: 'presentation' },
        h('button', {
          type: 'button', role: 'option', 'aria-selected': String(entry.selected), tabindex: '-1',
          onClick: () => {
            if (onChange) onChange(entry.name, activeKind === 'tags' ? 'tag' : 'branch');
            else {
              const target = path
                ? `/${repo.fullName}/blob/${entry.name}/${path}`
                : `/${repo.fullName}/tree/${entry.name}`;
              navigate(target);
            }
            if (menuApi) menuApi.close();
          },
        },
        icon(activeKind === 'tags' ? 'tag' : 'git-branch', { size: 16 }),
        h('span', { class: 'grow text-ellipsis' }, entry.name),
        entry.isDefault ? badge('default', 'accent') : null,
        entry.selected ? h('span', { class: 'check-mark' }, icon('check', { size: 16 })) : null)));
    });
  }

  function renderTabs() {
    clear(tabs);
    ['branches', 'tags'].forEach((tabKind) => {
      const count = tabKind === 'tags' ? tags.length : branches.length;
      tabs.appendChild(h('button', {
        type: 'button', role: 'tab',
        id: `${listId}-tab-${tabKind}`,
        'aria-selected': String(activeKind === tabKind),
        'aria-controls': listId,
        onClick: () => {
          activeKind = tabKind;
          renderTabs();
          renderList(searchInput.value);
          searchInput.placeholder = tabKind === 'tags' ? 'Find a tag…' : 'Find a branch…';
          list.setAttribute('aria-label', tabKind);
        },
      }, `${tabKind === 'tags' ? 'Tags' : 'Branches'} (${count})`));
    });
  }

  const footer = h('div', { class: 'dropdown-footer' },
    h('a', { href: `/${repo.fullName}/branches` }, 'View all branches'),
    h('a', { href: `/${repo.fullName}/tags` }, 'View all tags'));

  menu.append(tabs, h('div', { class: 'branch-search' }, searchInput), list, emptyRow, footer);
  searchInput.addEventListener('input', () => renderList(searchInput.value));

  const root = h('div', { class: 'branch-selector dropdown' }, trigger, menu);
  let menuApi = null;
  menuApi = attachMenu(trigger, menu, {
    align: 'left',
    onOpen: () => { renderTabs(); renderList(''); searchInput.value = ''; requestAnimationFrame(() => searchInput.focus()); },
  });
  menu.addEventListener('click', (event) => {
    const option = event.target instanceof Element ? event.target.closest('[role="option"]') : null;
    if (option && menuApi) menuApi.close();
  });
  return root;
}

/**
 * Clone / download panel opened from the green "Code" button.
 * `<div class="clone-panel"> <div class="clone-tabs" role="tablist"> <div class="clone-row"> <code class="clone-url">`
 */
export function clonePanel(repo, options = {}) {
  const { onDownload = null } = options;
  const https = `https://${BRAND.hostPlaceholder}/${repo.fullName}.git`;
  const ssh = `git@${BRAND.hostPlaceholder}:${repo.fullName}.git`;
  const cli = `rgt repo clone ${repo.fullName}`;

  const tabs = [
    { id: 'local', label: 'Local' },
    { id: 'codespaces', label: 'Codespaces' },
    { id: 'cli', label: 'RedGet CLI' },
  ];
  let active = 'local';

  const urlField = h('code', { class: 'clone-url' });
  const panelBody = h('div', { class: 'clone-body' });

  function renderBody() {
    clear(panelBody);
    if (active === 'local') {
      panelBody.append(
        h('div', { class: 'clone-section-label' }, 'Clone with HTTPS'),
        h('div', { class: 'clone-row' }, setUrl(urlField, https), copyButton(() => https, { tooltipText: 'Copy HTTPS clone URL' })),
        h('div', { class: 'clone-section-label' }, 'Clone with SSH'),
        h('div', { class: 'clone-row' }, setUrl(urlField, ssh), copyButton(() => ssh, { tooltipText: 'Copy SSH clone URL' })),
        h('p', { class: 'clone-help text-small text-muted' }, 'Use a personal access token or an SSH key configured in /settings/keys.'),
        h('div', { class: 'clone-section-label' }, 'Download ZIP'),
        h('div', { class: 'clone-row' },
          h('a', { class: 'btn btn-sm btn-block', href: `/${repo.fullName}/archive/refs/heads/${repo.defaultBranch}.zip`, onClick: onDownload || undefined },
            icon('download', { size: 16 }), `Download ${repo.defaultBranch}.zip`)));
    } else if (active === 'codespaces') {
      panelBody.append(
        h('div', { class: 'clone-section-label' }, 'Work in a cloud editor'),
        h('div', { class: 'clone-row' },
          h('button', { class: 'btn btn-sm btn-primary btn-block', type: 'button', onClick: () => navigate('/codespaces') },
            icon('codespaces', { size: 16 }), 'Create codespace on ', h('code', { class: 'code-inline' }, repo.defaultBranch))),
        h('p', { class: 'clone-help text-small text-muted' }, 'Codespaces include 120 core-hours per month on the Free plan.'));
    } else {
      panelBody.append(
        h('div', { class: 'clone-section-label' }, 'Clone with the RedGet CLI'),
        h('div', { class: 'clone-row' }, setUrl(urlField, cli), copyButton(() => cli, { tooltipText: 'Copy CLI command' })),
        h('p', { class: 'clone-help text-small text-muted' }, 'Install with ', h('code', { class: 'code-inline' }, 'rgt install'), ' then run ', h('code', { class: 'code-inline' }, 'rgt auth login'), '.'));
    }
  }

  const tabBar = h('div', { class: 'clone-tabs', role: 'tablist', 'aria-label': 'Clone options' },
    tabs.map((tab) => h('button', {
      type: 'button', role: 'tab', id: `clone-tab-${tab.id}`,
      'aria-selected': String(tab.id === active), 'aria-controls': 'clone-panel-body',
      onClick: () => {
        active = tab.id;
        tabBar.querySelectorAll('[role="tab"]').forEach((button) => button.setAttribute('aria-selected', String(button.id === `clone-tab-${active}`)));
        renderBody();
      },
    }, tab.label)));

  panelBody.id = 'clone-panel-body';
  panelBody.setAttribute('role', 'tabpanel');
  panelBody.setAttribute('aria-labelledby', `clone-tab-${active}`);
  renderBody();
  return h('div', { class: 'clone-panel' }, tabBar, panelBody);
}

function setUrl(node, value) {
  node.textContent = value;
  node.title = value;
  return node;
}

export function openCodeMenu(repo, anchor) {
  const menuId = 'code-menu';
  const menu = h('div', { class: 'dropdown-menu', role: 'group', id: menuId, hidden: true, dataset: { align: 'right', width: 'wide' }, 'aria-label': 'Clone, open or download' },
    clonePanel(repo));
  const trigger = anchor || h('button', {
    class: 'btn btn-sm btn-primary', type: 'button',
    'aria-haspopup': 'dialog', 'aria-expanded': 'false', 'aria-controls': menuId,
  }, icon('code-square', { size: 16 }), h('span', {}, 'Code'), icon('chevron-down', { size: 16 }));
  const root = h('div', { class: 'dropdown code-dropdown' }, trigger, menu);
  attachMenu(trigger, menu, { align: 'right' });
  return { root, trigger, menu };
}

/** The green Code button rendered in the code toolbar. */
export function codeButton(repo) {
  return openCodeMenu(repo).root;
}

/**
 * Toolbar above the file list: branch selector, go to file, add file, code button.
 * `<div class="code-toolbar">`
 */
export function codeToolbar(repo, options = {}) {
  const { branch = repo.defaultBranch, path = '', onGoToFile = null, onAddFile = null, extra = null } = options;
  const bar = h('div', { class: 'code-toolbar' },
    branchSelector(repo, { branch, path }),
    h('button', {
      class: 'btn btn-sm', type: 'button',
      onClick: () => { if (onGoToFile) onGoToFile(); else openGoToFile(repo, branch); },
      title: 'Search this repository (t)',
    }, icon('search', { size: 16 }), h('span', { class: 'hide-sm' }, 'Go to file')),
    h('div', { class: 'dropdown' }, ...addFileMenu(repo, branch, path, onAddFile)),
    h('span', { class: 'grow' }),
    extra,
    codeButton(repo));
  return bar;
}

function addFileMenu(repo, branch, path, onAddFile) {
  const menuId = 'add-file-menu';
  const prefix = path ? `${path}/` : '';
  const menu = h('ul', { class: 'dropdown-menu', role: 'menu', id: menuId, hidden: true, dataset: { align: 'right' }, 'aria-label': 'Add a file' },
    h('li', { role: 'none' }, h('a', { class: 'dropdown-item', role: 'menuitem', href: `/${repo.fullName}/new/${branch}/${prefix}`, tabindex: '-1' },
      icon('file-added', { size: 16 }), h('span', {}, 'Create new file'))),
    h('li', { role: 'none' }, h('button', {
      class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
      onClick: () => { if (onAddFile) onAddFile(); else openUploadDialog(repo, branch, prefix); },
    }, icon('upload', { size: 16 }), h('span', {}, 'Upload files'))));
  const trigger = h('button', {
    class: 'btn btn-sm', type: 'button',
    'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId,
  }, icon('plus', { size: 16 }), h('span', { class: 'hide-sm' }, 'Add file'), icon('chevron-down', { size: 16 }));
  attachMenu(trigger, menu, { align: 'right' });
  return [trigger, menu];
}

export function openUploadDialog(repo, branch, prefix = '') {
  const input = h('input', { class: 'input', type: 'file', multiple: true, id: 'upload-files', 'aria-label': 'Choose files to upload' });
  const message = h('input', { class: 'input', type: 'text', id: 'upload-message', placeholder: `Upload files to ${prefix || 'the repository root'}` });
  openDialog({
    title: 'Upload files',
    body: h('div', { class: 'dialog-form' },
      h('div', { class: 'field' },
        h('label', { for: 'upload-files' }, `Drag files here or choose them — uploading to `, h('code', { class: 'code-inline' }, `${repo.fullName}/${branch}/${prefix}`)),
        input),
      h('div', { class: 'field' }, h('label', { for: 'upload-message' }, 'Commit message'), message),
      h('p', { class: 'field-help' }, 'Files are stored locally in this browser as part of the demo dataset. Up to 100 files, 25 MB each.')),
    confirmLabel: 'Commit changes',
    onConfirm: () => {
      const files = input.files ? Array.from(input.files) : [];
      if (!files.length) { toast({ variant: 'danger', message: 'Choose at least one file.' }); return false; }
      const commitMessage = message.value.trim() || `Upload ${files.length} file(s)`;
      files.forEach((file) => {
        api.saveFile(repo.fullName, {
          path: `${prefix}${file.name}`,
          content: `[Uploaded file placeholder: ${file.name}, ${formatBytes(file.size)}]\n`,
          message: commitMessage,
          branch,
        });
      });
      toastSuccess(`Committed ${files.length} file(s)`);
      navigate(`/${repo.fullName}/tree/${branch}${prefix ? `/${prefix.replace(/\/$/, '')}` : ''}`);
      return true;
    },
  });
}

/** Go-to-file dialog: `<dialog class="go-to-file-dialog">` with a listbox of paths. */
export function openGoToFile(repo, branch = repo.defaultBranch) {
  const paths = listRepoPaths(repo);
  const dialog = h('dialog', { class: 'go-to-file-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gtf-title' });
  const listId = 'gtf-list';
  const input = h('input', {
    class: 'input gtf-input', type: 'search', id: 'gtf-input', placeholder: 'Search files by name…',
    role: 'combobox', 'aria-expanded': 'true', 'aria-controls': listId, 'aria-autocomplete': 'list',
    autocomplete: 'off', spellcheck: 'false',
  });
  const list = h('ul', { class: 'gtf-list', id: listId, role: 'listbox', 'aria-label': 'Files in this repository' });
  let selected = 0;
  let visible = [];

  function paint() {
    clear(list);
    if (!visible.length) {
      list.appendChild(h('li', { class: 'gtf-item text-muted', role: 'presentation' }, 'No files matched'));
      return;
    }
    visible.forEach((entry, index) => {
      list.appendChild(h('li', {
        class: 'gtf-item', role: 'option', id: `gtf-opt-${index}`,
        'aria-selected': String(index === selected), tabindex: '-1',
        onMouseenter: () => { selected = index; paintSelection(); },
        onClick: () => { selected = index; go(); },
      },
      icon(entry.dir ? 'file-directory' : 'file', { size: 16 }),
      h('span', { class: 'gtf-path' }, entry.path)));
    });
    input.setAttribute('aria-activedescendant', `gtf-opt-${selected}`);
  }

  function paintSelection() {
    list.querySelectorAll('[role="option"]').forEach((item, index) => item.setAttribute('aria-selected', String(index === selected)));
    const active = qs(`#gtf-opt-${selected}`, list);
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  function filter() {
    const query = input.value.trim().toLowerCase();
    visible = (query ? paths.filter((entry) => entry.path.toLowerCase().includes(query)) : paths).slice(0, 60);
    selected = 0;
    paint();
  }

  function go() {
    const entry = visible[selected];
    close();
    if (!entry) return;
    navigate(entry.dir
      ? `/${repo.fullName}/tree/${branch}/${entry.path}`
      : `/${repo.fullName}/blob/${branch}/${entry.path}`);
  }

  function close() {
    try { if (dialog.open) dialog.close(); } catch { dialog.remove(); }
    if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
  }

  dialog.append(
    h('h2', { class: 'sr-only', id: 'gtf-title' }, 'Go to file'),
    h('div', { class: 'gtf-input-wrap' }, icon('search', { size: 16 }), input,
      h('kbd', {}, 't')),
    list,
    h('div', { class: 'gtf-hint' }, 'Press ', h('kbd', {}, 'Enter'), ' to open the selected file, ', h('kbd', {}, 'Esc'), ' to dismiss.'));

  input.addEventListener('input', filter);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); selected = Math.min(visible.length - 1, selected + 1); paintSelection(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); selected = Math.max(0, selected - 1); paintSelection(); }
    else if (event.key === 'Enter') { event.preventDefault(); go(); }
    else if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (event.key === 'Tab') event.preventDefault();
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });

  document.body.appendChild(dialog);
  try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
  filter();
  requestAnimationFrame(() => input.focus());
  return { dialog, close };
}

/** Every path known for a repository (seeded tree + locally created files). */
export function listRepoPaths(repo) {
  const db = getDb() || {};
  const files = CONTENT.get(repo.fullName) || null;
  const out = new Map();
  const localFiles = (db.localFiles || []).filter((f) => f.repoFullName === repo.fullName);
  localFiles.forEach((file) => out.set(file.path, { path: file.path, dir: false }));
  (db.commits || []).filter((c) => c.repoFullName === repo.fullName).forEach((commit) => {
    (commit.files || []).forEach((path) => { if (!out.has(path)) out.set(path, { path, dir: false }); });
  });
  if (files) {
    files.files.forEach((file) => out.set(file.path, { path: file.path, dir: false }));
    files.dirs.forEach((dir) => out.set(dir.path, { path: dir.path, dir: true }));
  }
  return Array.from(out.values()).sort((a, b) => a.path.localeCompare(b.path));
}

/* ==========================================================================
   Repository resolution helpers used by the repo pages
   ========================================================================== */

export function findRepoFromParams(params) {
  const db = getDb();
  if (!db) return null;
  const login = String(params.login || '').toLowerCase();
  const name = String(params.repo || '').toLowerCase();
  return db.repos.find((r) => r.ownerLogin.toLowerCase() === login && r.name.toLowerCase() === name) || null;
}

export function canAccess(repo) {
  if (!repo) return false;
  if (repo.visibility === 'public') return true;
  const session = getSession();
  if (!session.login) return false;
  if (repo.ownerLogin.toLowerCase() === session.login.toLowerCase()) return true;
  const db = getDb();
  const org = db ? db.orgs.find((o) => o.login === repo.ownerLogin) : null;
  if (org && repo.visibility === 'internal') return Boolean(session.login);
  if (org && org.members.includes(session.login)) return true;
  const collaborators = api.collaboratorsFor(repo.fullName);
  return collaborators.some((c) => c.login === session.login);
}

export function isMaintainer(repo) {
  const session = getSession();
  if (!session.login) return false;
  if (repo.ownerLogin.toLowerCase() === session.login.toLowerCase()) return true;
  const db = getDb();
  const org = db ? db.orgs.find((o) => o.login === repo.ownerLogin) : null;
  if (org && org.members.includes(session.login)) return true;
  return api.collaboratorsFor(repo.fullName).some((c) => c.login === session.login && ['write', 'admin', 'maintain'].includes(c.permission));
}

/** 404 for private or missing repositories, matching RedGet's "not found" copy. */
export function repoNotFound(repoName) {
  return emptyState({
    title: 'This is not the repository you are looking for',
    description: repoName
      ? `${repoName} does not exist, is private, or has been moved. Private repositories are only visible to signed-in collaborators.`
      : 'The repository could not be found.',
    iconName: 'repo',
    actions: [
      h('a', { class: 'btn btn-primary', href: '/dashboard' }, icon('home', { size: 16 }), 'Back to the dashboard'),
      h('a', { class: 'btn', href: '/explore' }, icon('telescope', { size: 16 }), 'Explore repositories'),
    ],
  });
}

export function repoTitleString(repo, suffix = '') {
  return `${repo.fullName}${suffix ? ` · ${suffix}` : ''} · ${BRAND.name}`;
}

export function repoMetaSummary(repo) {
  const db = getDb() || {};
  const openIssues = (db.issues || []).filter((i) => i.repoFullName === repo.fullName && i.state === 'open').length;
  const openPulls = (db.pullRequests || []).filter((p) => p.repoFullName === repo.fullName && p.state === 'open').length;
  return [
    { icon: 'git-commit', label: `${compactNumber(repo.commitCount || 0)} commits`, href: `/${repo.fullName}/commits/${repo.defaultBranch}` },
    { icon: 'git-branch', label: `${repo.branchCount || 0} branches`, href: `/${repo.fullName}/branches` },
    { icon: 'tag', label: `${repo.tagCount || 0} tags`, href: `/${repo.fullName}/tags` },
    { icon: 'database', label: formatBytes((repo.size || 0) * 1024), href: `/${repo.fullName}/settings` },
    { icon: 'issue-opened', label: `${openIssues} open issues`, href: `/${repo.fullName}/issues` },
    { icon: 'git-pull-request', label: `${openPulls} open pull requests`, href: `/${repo.fullName}/pulls` },
  ];
}

export function repoMetaRow(repo) {
  return h('ul', { class: 'repo-meta-row', role: 'list' },
    repoMetaSummary(repo).map((entry) => h('li', {},
      h('a', { href: entry.href }, icon(entry.icon, { size: 16 }), h('span', {}, entry.label)))));
}

export function archivedNotice(repo) {
  if (!repo.archived) return null;
  return h('div', { class: 'flash flash-attention', role: 'status' },
    icon('alert', { size: 16 }),
    h('div', { class: 'flash-content' },
      h('div', { class: 'flash-title' }, 'This repository has been archived'),
      h('div', {}, 'It is read-only. You can still fork it, clone it and open issues in your fork.')));
}

export function labelRow(labels, options = {}) {
  const { max = 4 } = options;
  if (!labels || !labels.length) return null;
  return h('span', { class: 'label-row' },
    labels.slice(0, max).map((label) => labelPill(label)),
    labels.length > max ? h('span', { class: 'counter', title: labels.slice(max).map((l) => l.name).join(', ') }, `+${labels.length - max}`) : null);
}

export function userLink(login, options = {}) {
  const { cls = '', showAvatar = false } = options;
  return h('a', { class: ['user-mention', cls].filter(Boolean).join(' '), href: `/${login}` },
    showAvatar ? avatar({ login }, { size: 16 }) : null,
    h('span', {}, `@${login}`));
}

export function commitLink(repo, commit, options = {}) {
  const { showSha = true, cls = '' } = options;
  return h('a', {
    class: ['commit-sha', cls].filter(Boolean).join(' '),
    href: `/${repo.fullName}/commit/${commit.sha}`,
    title: truncate(commit.message, 120),
  }, icon('git-commit', { size: 16 }), showSha ? h('code', {}, commit.sha.slice(0, 7)) : h('span', {}, truncate(commit.message, 60)));
}

export function repoToolbarSegmented(options = {}) {
  const { value, onChange, items } = options;
  return segmented({ items, value, onChange, ariaLabel: 'Display options' });
}

export default {
  repoTabDefs, repoTabs, repoBreadcrumb, repoTitle, repoActions, repoHeader, openForkDialog,
  repoShell, repoSidebar, SETTINGS_SECTIONS, settingsMenu, settingsLayout, settingsSection,
  dangerZone, confirmDanger, branchSelector, clonePanel, openCodeMenu, codeButton, codeToolbar,
  openUploadDialog, openGoToFile, listRepoPaths, findRepoFromParams, canAccess, isMaintainer,
  repoNotFound, repoTitleString, repoMetaSummary, repoMetaRow, archivedNotice, labelRow,
  userLink, commitLink, repoToolbarSegmented,
};
