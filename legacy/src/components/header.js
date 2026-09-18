/**
 * RedGet — global header, mobile drawer, header menus and dialogs.
 *
 * Markup contract (see the comment block at the top of /assets/css/header.css):
 *
 *   <header class="app-header">
 *     <div class="container header-inner">
 *       <button class="header-btn hamburger" aria-expanded aria-controls="mobile-nav">
 *       <a class="brand" href="/"> <svg class="brand-mark"> <span class="brand-name">
 *       <nav aria-label="Global"> <ul class="header-nav"> <li><a aria-current="page">
 *       <div class="header-search"> <button role="combobox" aria-haspopup="listbox"
 *            aria-expanded aria-controls="search-suggestions"> <span>Search or jump to…</span> <kbd>/</kbd>
 *       <button class="copilot-btn" aria-label="RedGet Copilot">
 *       <nav aria-label="Notifications and requests">
 *         <ul class="header-icons">
 *           <li><a class="header-icon-link" href="/issues" aria-label="Issues"> <span class="counter">
 *           <li><a class="header-icon-link" href="/pulls" aria-label="Pull requests"> <span class="counter">
 *           <li><a class="header-icon-link" href="/notifications" aria-label="Notifications"> <span class="unread-dot">
 *       <div class="dropdown" data-dropdown="create"> <button aria-haspopup="menu" aria-expanded aria-controls>
 *       <div class="dropdown" data-dropdown="avatar"> same pattern
 *   <div class="mobile-nav" id="mobile-nav" role="dialog" aria-modal="true" aria-label="Site menu" hidden>
 *   <div class="mobile-scrim" data-open="false">
 *
 * Everything is built with h() — no innerHTML — so the output is always valid,
 * balanced markup with correct ARIA.
 */

import { h, icon, qs } from '../core/dom.js';
import { BRAND, THEMES, LOCALES, SHORTCUTS, FEATURES } from '../config.js';
import { getDb, getSession, getCurrentUser, getPrefs, setPref } from '../core/store.js';
import { on, emit, EVENTS } from '../core/bus.js';
import { attachMenu, dropdown, openDialog, confirmDialog, toast, toastSuccess, initTooltips } from './overlay.js';
import { avatar } from './avatars.js';
import { applyTheme, applyDensity, applyReducedMotion, getCurrentThemeId, isFollowingSystem } from '../core/theme.js';
import { compactNumber, nextId } from '../core/util.js';
import { navigate, currentPath } from '../core/router.js';
import { openCommandPalette } from './commandPalette.js';
import * as api from '../core/api.js';

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'home' },
  { href: '/pulls', label: 'Pull requests', icon: 'git-pull-request' },
  { href: '/issues', label: 'Issues', icon: 'issue-opened' },
  { href: '/codespaces', label: 'Codespaces', icon: 'codespaces' },
  { href: '/marketplace', label: 'Marketplace', icon: 'package' },
  { href: '/explore', label: 'Explore', icon: 'telescope' },
];

let headerRefs = null;

/* ==========================================================================
   Header
   ========================================================================== */

/**
 * @returns {{ root: HTMLElement, drawer: HTMLElement, scrim: HTMLElement }}
 */
export function renderHeader() {
  const user = getCurrentUser();
  const db = getDb() || {};

  const hamburger = h('button', {
    class: 'header-btn hamburger',
    type: 'button',
    'aria-label': 'Open site menu',
    'aria-expanded': 'false',
    'aria-controls': 'mobile-nav',
    onClick: () => toggleMobileNav(),
  }, icon('three-bars', { size: 16 }));

  const brand = h('a', {
    class: 'brand', href: '/', 'aria-label': `${BRAND.name} home`,
  },
  h('svg', { class: 'brand-mark', viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false', width: '32', height: '32' },
    h('use', { href: `#${BRAND.logoSymbol}` })),
  h('span', { class: 'brand-name' }, BRAND.name));

  const primaryNav = h('nav', { 'aria-label': 'Global' },
    h('ul', { class: 'header-nav' }, NAV_LINKS.filter((link) => featureEnabled(link.href)).map((link) => h('li', {},
      h('a', { href: link.href, 'data-nav': link.href }, link.label)))));

  const searchId = 'search-suggestions';
  const searchTrigger = h('button', {
    class: 'header-search-trigger',
    type: 'button',
    role: 'combobox',
    'aria-haspopup': 'listbox',
    'aria-expanded': 'false',
    'aria-controls': searchId,
    'aria-label': 'Search or jump to a repository, issue, pull request or command',
    onClick: () => openCommandPalette({ mode: 'search' }),
  },
  icon('search', { size: 16 }),
  h('span', { class: 'search-placeholder' }, 'Search or jump to…'),
  h('kbd', {}, '/'));

  const search = h('div', { class: 'header-search', 'data-search': 'header' }, searchTrigger);

  const copilot = h('button', {
    class: 'copilot-btn',
    type: 'button',
    'aria-label': 'RedGet Copilot',
    onClick: () => openCopilotDialog(),
  }, icon('copilot', { size: 16 }), h('span', { class: 'copilot-label' }, 'Copilot'));

  const openIssues = countOpen(db, 'issues');
  const openPulls = countOpen(db, 'pulls');
  const unread = unreadNotifications();

  const issuesLink = headerIconLink({
    href: '/issues', iconName: 'issue-opened', label: 'Issues assigned to you', count: openIssues, testId: 'issues-count',
  });
  const pullsLink = headerIconLink({
    href: '/pulls', iconName: 'git-pull-request', label: 'Pull requests assigned to you', count: openPulls, testId: 'pulls-count',
  });
  const notificationsLink = headerIconLink({
    href: '/notifications', iconName: 'bell', label: 'Notifications', unread, testId: 'notifications-unread',
    onClick: (event) => {
      if (!event.shiftKey) return;
      event.preventDefault();
      api.markAllNotificationsRead();
      toastSuccess('All notifications marked as read');
    },
  });

  const iconNav = h('nav', { 'aria-label': 'Notifications and requests' },
    h('ul', { class: 'header-icons' },
      h('li', {}, issuesLink),
      h('li', {}, pullsLink),
      h('li', {}, notificationsLink)));

  const createMenu = buildCreateMenu(user);
  const avatarMenu = buildAvatarMenu(user);

  const header = h('header', { class: 'app-header', role: 'banner' },
    h('div', { class: 'container header-inner' },
      hamburger,
      brand,
      primaryNav,
      search,
      copilot,
      iconNav,
      createMenu.root,
      avatarMenu.root));

  const drawer = buildMobileNav(user);
  const scrim = h('div', {
    class: 'mobile-scrim', 'data-open': 'false', hidden: true,
    onClick: () => toggleMobileNav(false),
  });

  headerRefs = {
    header,
    drawer,
    scrim,
    searchTrigger,
    issues: qs('.counter', issuesLink),
    pulls: qs('.counter', pullsLink),
    bell: notificationsLink,
    bellDot: qs('.unread-dot', notificationsLink),
    avatarTrigger: avatarMenu.trigger,
  };

  initTooltips(header);
  updateHeaderCounts();

  return { root: header, drawer, scrim };
}

function featureEnabled(href) {
  if (href === '/codespaces') return FEATURES.codespaces;
  if (href === '/marketplace') return FEATURES.marketplace;
  return true;
}

function headerIconLink({ href, iconName, label, count = 0, unread = 0, testId = '', onClick = null }) {
  const link = h('a', {
    class: 'header-icon-link',
    href,
    'aria-label': count ? `${label} (${count})` : unread ? `${label} (${unread} unread)` : label,
    'data-count-target': testId,
    onClick: onClick || undefined,
  },
  icon(iconName, { size: 16 }),
  count ? h('span', { class: 'counter', 'aria-hidden': 'true' }, compactNumber(count)) : null,
  unread ? h('span', { class: 'unread-dot', role: 'img', 'aria-label': 'Unread notifications' }) : null);
  return link;
}

function countOpen(db, kind) {
  const login = getSession().login;
  if (!login || !db.issues) return 0;
  if (kind === 'issues') {
    return db.issues.filter((i) => i.state === 'open' && (i.assignees.includes(login) || i.authorLogin === login)).length;
  }
  return db.pullRequests.filter((p) => p.state === 'open' && (p.assignees.includes(login) || p.reviewers.includes(login) || p.authorLogin === login)).length;
}

function unreadNotifications() {
  return api.notifications().filter((n) => n.unread).length;
}

/** Refresh the counters without re-rendering the whole header. */
export function updateHeaderCounts() {
  if (!headerRefs) return;
  const db = getDb() || {};
  const issues = countOpen(db, 'issues');
  const pulls = countOpen(db, 'pulls');
  const unread = unreadNotifications();

  if (headerRefs.issues) {
    headerRefs.issues.textContent = compactNumber(issues);
    headerRefs.issues.hidden = !issues;
  }
  if (headerRefs.pulls) {
    headerRefs.pulls.textContent = compactNumber(pulls);
    headerRefs.pulls.hidden = !pulls;
  }
  const bellLink = headerRefs.bell;
  if (bellLink) {
    const dot = qs('.unread-dot', bellLink);
    bellLink.setAttribute('aria-label', unread ? `Notifications (${unread} unread)` : 'Notifications');
    if (unread && !dot) {
      bellLink.appendChild(h('span', { class: 'unread-dot', role: 'img', 'aria-label': 'Unread notifications' }));
      headerRefs.bellDot = qs('.unread-dot', bellLink);
    } else if (!unread && dot) {
      dot.remove();
      headerRefs.bellDot = null;
    }
  }
  const session = getSession();
  if (headerRefs.avatarTrigger) {
    headerRefs.avatarTrigger.setAttribute('aria-label', session.login ? `Account menu for ${session.login}` : 'Account menu');
  }
}

export function markHeaderActive(pathname = currentPath()) {
  if (!headerRefs) return;
  headerRefs.header.querySelectorAll('[data-nav]').forEach((link) => {
    const target = link.getAttribute('data-nav');
    const active = pathname === target || (target !== '/dashboard' && pathname.startsWith(`${target}/`));
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

/* ==========================================================================
   Create menu (+)
   ========================================================================== */

function buildCreateMenu(user) {
  const login = user ? user.login : null;
  const menuId = nextId('create-menu');
  const item = (label, iconName, href, onClick, desc) => h('li', { role: 'none' },
    h(onClick ? 'button' : 'a', {
      class: 'dropdown-item',
      role: 'menuitem',
      type: onClick ? 'button' : undefined,
      href: onClick ? undefined : href,
      tabindex: '-1',
      onClick: onClick || undefined,
    },
    icon(iconName, { size: 16 }),
    h('span', { class: 'dropdown-item-wrap' },
      h('span', {}, label),
      desc ? h('span', { class: 'dropdown-item-desc' }, desc) : null)));

  const menu = h('ul', { class: 'dropdown-menu', role: 'menu', id: menuId, 'aria-label': 'Create new…', dataset: { align: 'right', width: 'wide' }, hidden: true },
    item('New repository', 'repo', '/new', null, 'Start a repository from scratch or a template'),
    item('Import repository', 'repo-push', '/new/import', null, 'Import from another registry'),
    item('New codespace', 'codespaces', '/codespaces', null, 'Spin up a cloud development environment'),
    item('New gist', 'code', '/gists', null, 'Share a single file or snippet'),
    h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })),
    item('New organization', 'organization', '/organizations/new', null, 'Create a free organization'),
    item('New project', 'project', login ? `/${login}?tab=projects` : '/dashboard', () => {
      openNewProjectDialog();
    }, 'Plan work on a board, table or roadmap'),
    item('New issue', 'issue-opened', null, () => {
      openNewIssueDialog();
    }, 'File an issue in any repository you can see'));

  const trigger = h('button', {
    class: 'header-btn',
    type: 'button',
    'aria-label': 'Create new…',
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-controls': menuId,
  }, icon('plus', { size: 16 }), icon('chevron-down', { size: 16, cls: 'caret' }));

  const root = h('div', { class: 'dropdown', dataset: { dropdown: 'create' } }, trigger, menu);
  attachMenu(trigger, menu, { align: 'right' });
  return { root, trigger, menu };
}

function openNewIssueDialog() {
  const db = getDb();
  const repos = (db ? db.repos : []).filter((r) => r.hasIssues && (r.visibility === 'public' || r.ownerLogin === getSession().login));
  const select = h('select', { class: 'input', id: 'new-issue-repo', name: 'repo' },
    repos.map((repo) => h('option', { value: repo.fullName }, repo.fullName)));
  const title = h('input', { class: 'input', id: 'new-issue-title', type: 'text', placeholder: 'Summarise the problem in one line', required: true, maxlength: '200' });
  const body = h('textarea', { class: 'input', id: 'new-issue-body', rows: '6', placeholder: 'Describe the behaviour, the steps to reproduce and what you expected.' });

  openDialog({
    title: 'New issue',
    size: 'lg',
    body: h('form', { class: 'dialog-form', id: 'new-issue-form' },
      h('div', { class: 'field' }, h('label', { for: 'new-issue-repo' }, 'Repository'), select),
      h('div', { class: 'field' }, h('label', { for: 'new-issue-title' }, 'Title'), title),
      h('div', { class: 'field' }, h('label', { for: 'new-issue-body' }, 'Description'), body,
        h('p', { class: 'field-help' }, 'Markdown is supported. Use `/issues/new` inside a repository for templates and issue forms.')),
    ),
    confirmLabel: 'Create issue',
    onConfirm: () => {
      const fullName = select.value;
      const value = title.value.trim();
      if (!fullName || !value) {
        toast({ variant: 'danger', message: 'Pick a repository and write a title first.' });
        return false;
      }
      const created = api.createIssue(fullName, { title: value, body: body.value });
      toastSuccess(`Issue #${created.number} created in ${fullName}`);
      navigate(`/${fullName}/issues/${created.number}`);
      return true;
    },
  });
}

function openNewProjectDialog() {
  const title = h('input', { class: 'input', id: 'new-project-title', type: 'text', value: 'New project', required: true });
  const description = h('textarea', { class: 'input', id: 'new-project-description', rows: '3', placeholder: 'What is this project tracking?' });
  const owner = h('select', { class: 'input', id: 'new-project-owner' },
    h('option', { value: 'octored/redget-core' }, 'octored/redget-core'),
    h('option', { value: 'crimson-collective/crimson-ui' }, 'crimson-collective/crimson-ui'));
  openDialog({
    title: 'New project',
    body: h('div', { class: 'dialog-form' },
      h('div', { class: 'field' }, h('label', { for: 'new-project-owner' }, 'Repository'), owner),
      h('div', { class: 'field' }, h('label', { for: 'new-project-title' }, 'Project name'), title),
      h('div', { class: 'field' }, h('label', { for: 'new-project-description' }, 'Description'), description)),
    confirmLabel: 'Create project',
    onConfirm: () => {
      const id = api.createProject(owner.value, { title: title.value.trim() || 'New project', description: description.value.trim() });
      toastSuccess('Project created');
      navigate(`/${owner.value}/projects/${id}`);
      return true;
    },
  });
}

/* ==========================================================================
   Avatar menu
   ========================================================================== */

function buildAvatarMenu(user) {
  const menuId = nextId('avatar-menu');
  const login = user ? user.login : 'octored';
  const displayName = user ? user.name : 'Octavia Red';

  const menu = h('ul', { class: 'dropdown-menu', role: 'menu', id: menuId, 'aria-label': 'Account menu', dataset: { align: 'right', width: 'wide' }, hidden: true });

  menu.appendChild(h('li', { role: 'none', class: 'dropdown-header' },
    h('div', { class: 'avatar-menu-head' },
      avatar({ login, name: displayName }, { size: 40 }),
      h('div', {},
        h('div', { class: 'text-strong' }, `Signed in as ${h('strong', {}, login)}`),
        user && user.pronouns ? h('div', { class: 'dropdown-item-desc' }, user.pronouns) : null))));

  menu.appendChild(h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })));

  const statusButton = h('button', {
    class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
    'data-keep-open': 'true',
    onClick: () => openStatusDialog(),
  },
  icon('emoji-smile', { size: 16 }),
  h('span', { class: 'dropdown-item-wrap' },
    h('span', {}, 'Set status'),
    h('span', { class: 'dropdown-item-desc' }, user && user.status ? `${user.status.emoji || ''} ${user.status.message}`.trim() : 'Tell collaborators what you are up to')));
  menu.appendChild(h('li', { role: 'none' }, statusButton));

  const link = (label, iconName, href, opts = {}) => h('li', { role: 'none' },
    h('a', { class: 'dropdown-item', role: 'menuitem', href, tabindex: '-1', onClick: opts.onClick || undefined },
      icon(iconName, { size: 16 }),
      h('span', { class: 'grow text-ellipsis' }, label),
      opts.trailing || null));

  menu.appendChild(link('Your profile', 'person', `/${login}`));
  menu.appendChild(link('Your repositories', 'repo', `/${login}?tab=repositories`));
  menu.appendChild(link('Your codespaces', 'codespaces', '/codespaces'));
  menu.appendChild(link('Your organizations', 'organization', `/settings/organizations`));
  menu.appendChild(link('Your enterprises', 'enterprise', '/enterprise'));
  menu.appendChild(link('Your projects', 'project', `/${login}?tab=projects`));
  menu.appendChild(link('Your stars', 'star', `/${login}?tab=stars`));
  menu.appendChild(link('Your gists', 'code', '/gists'));
  menu.appendChild(link('Your sponsors', 'heart', '/sponsors'));

  menu.appendChild(h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })));
  menu.appendChild(h('li', { role: 'none', class: 'dropdown-label' }, 'Enterprises'));
  menu.appendChild(link('Crimson Collective', 'organization', '/orgs/crimson-collective'));
  menu.appendChild(link('RedGet Collective', 'organization', '/orgs/redget-collective'));

  menu.appendChild(h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })));
  menu.appendChild(h('li', { role: 'none' },
    h('button', {
      class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
      onClick: (event) => { event.preventDefault(); openAppearanceDialog(); },
    }, icon('paintbrush', { size: 16 }),
    h('span', { class: 'grow text-ellipsis' }, 'Appearance'),
    h('span', { class: 'dropdown-item-desc' }, themeLabel(getPrefs().theme)))));

  menu.appendChild(link('Feature preview', 'flask', '/settings/preview'));
  menu.appendChild(link('Settings', 'gear', '/settings'));
  menu.appendChild(link('RedGet Copilot', 'copilot', null, { onClick: (event) => { event.preventDefault(); openCopilotDialog(); } }));
  menu.appendChild(link('RedGet Support', 'life-ring', null, { onClick: (event) => { event.preventDefault(); openSupportDialog(); } }));
  menu.appendChild(h('li', { role: 'none' },
    h('button', {
      class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
      onClick: (event) => { event.preventDefault(); openShortcutsDialog(); },
    }, icon('keyboard', { size: 16 }), h('span', { class: 'grow text-ellipsis' }, 'Keyboard shortcuts'), h('kbd', {}, '?'))));

  menu.appendChild(h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })));
  menu.appendChild(h('li', { role: 'none' },
    h('button', {
      class: 'dropdown-item', role: 'menuitem', type: 'button', tabindex: '-1',
      onClick: (event) => { event.preventDefault(); signOutConfirm(); },
    }, icon('sign-out', { size: 16 }), h('span', { class: 'grow text-ellipsis' }, 'Sign out'))));

  const trigger = h('button', {
    class: 'avatar-btn header-btn',
    type: 'button',
    'aria-label': `Account menu for ${login}`,
    'aria-haspopup': 'menu',
    'aria-expanded': 'false',
    'aria-controls': menuId,
  }, avatar({ login, name: displayName }, { size: 24 }));

  const root = h('div', { class: 'dropdown', dataset: { dropdown: 'avatar' } }, trigger, menu);
  attachMenu(trigger, menu, { align: 'right' });
  return { root, trigger, menu };
}

function themeLabel(id) {
  const theme = THEMES.find((entry) => entry.id === id);
  return theme ? theme.label : id;
}

/**
 * Appearance dialog: theme radios, follow-system switch, density, reduced motion
 * and language. Opened from the avatar menu and from /settings/appearance.
 */
export function openAppearanceDialog() {
  const prefs = getPrefs();
  const radios = THEMES.map((theme) => h('label', { class: 'checkbox-row' },
    h('input', {
      type: 'radio', name: 'appearance-theme', value: theme.id,
      checked: prefs.theme === theme.id,
      onChange: () => {
        setPref('theme', theme.id);
        setPref('followSystem', false);
        applyTheme(theme.id);
        const status = qs('[data-appearance-status]');
        if (status) status.textContent = `Theme: ${theme.label}`;
      },
    }),
    h('span', {}, theme.label),
    h('span', { class: 'theme-swatch', dataset: { group: theme.group }, 'aria-hidden': 'true' })));

  const followSystem = h('input', {
    type: 'checkbox', id: 'appearance-follow-system', checked: Boolean(prefs.followSystem),
    onChange: (event) => {
      setPref('followSystem', event.currentTarget.checked);
      applyTheme(getPrefs().theme, { followSystem: event.currentTarget.checked });
    },
  });

  const density = h('select', {
    class: 'input', id: 'appearance-density',
    onChange: (event) => { setPref('density', event.currentTarget.value); applyDensity(event.currentTarget.value); },
  },
  h('option', { value: 'comfortable', selected: prefs.density !== 'compact' }, 'Comfortable'),
  h('option', { value: 'compact', selected: prefs.density === 'compact' }, 'Compact'));

  const motion = h('input', {
    type: 'checkbox', id: 'appearance-motion', checked: Boolean(prefs.reducedMotion),
    onChange: (event) => { setPref('reducedMotion', event.currentTarget.checked); applyReducedMotion(event.currentTarget.checked); },
  });

  const locale = h('select', {
    class: 'input', id: 'appearance-locale',
    onChange: (event) => {
      const found = LOCALES.find((entry) => entry.id === event.currentTarget.value);
      if (!found) return;
      setPref('locale', found.id);
      document.documentElement.lang = found.id;
      document.documentElement.dir = found.dir;
      toastSuccess(`Language set to ${found.label}`);
    },
  }, LOCALES.map((entry) => h('option', { value: entry.id, selected: prefs.locale === entry.id }, entry.label)));

  openDialog({
    title: 'Appearance and language',
    size: 'md',
    hideFooter: true,
    body: h('div', { class: 'dialog-form' },
      h('fieldset', { class: 'fieldset-plain' },
        h('legend', {}, 'Theme'),
        h('div', { class: 'radio-list', role: 'radiogroup', 'aria-label': 'Theme' }, radios),
        h('label', { class: 'checkbox-row' }, followSystem, h('span', {}, 'Follow my system preference')),
        h('p', { class: 'field-help', 'data-appearance-status': 'true' }, `Theme: ${themeLabel(getCurrentThemeId())}${isFollowingSystem() ? ' (following system)' : ''}`)),
      h('div', { class: 'field' }, h('label', { for: 'appearance-density' }, 'Density'), density),
      h('label', { class: 'checkbox-row' }, motion, h('span', {}, 'Reduce motion (respects prefers-reduced-motion automatically)')),
      h('div', { class: 'field' }, h('label', { for: 'appearance-locale' }, 'Language'), locale,
        h('p', { class: 'field-help' }, 'Arabic switches the whole interface to a right-to-left layout.'))),
  });
}

/* ==========================================================================
   Mobile drawer
   ========================================================================== */

function buildMobileNav(user) {
  const login = user ? user.login : 'octored';
  const db = getDb() || {};

  const section = (heading, links) => h('div', { class: 'mobile-nav-section' },
    heading ? h('h2', { id: `mobile-section-${heading.toLowerCase().replace(/\s+/g, '-')}` }, heading) : null,
    h('ul', { class: 'mobile-nav-list', role: 'list' }, links.map((entry) => h('li', {},
      h('a', { href: entry.href, 'data-nav': entry.href },
        icon(entry.icon, { size: 16 }),
        h('span', { class: 'grow' }, entry.label),
        entry.count ? h('span', { class: 'counter' }, compactNumber(entry.count)) : null)))));

  const drawer = h('div', {
    class: 'mobile-nav',
    id: 'mobile-nav',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Site menu',
    hidden: true,
    'data-open': 'false',
  },
  h('div', { class: 'mobile-nav-head' },
    h('span', { class: 'brand-name' }, BRAND.name),
    h('button', {
      class: 'header-btn', type: 'button', 'aria-label': 'Close site menu',
      onClick: () => toggleMobileNav(false),
    }, icon('x', { size: 16 }))),
  section('Navigate', NAV_LINKS.filter((link) => featureEnabled(link.href))),
  section('Account', [
    { href: `/${login}`, label: 'Your profile', icon: 'person' },
    { href: `/${login}?tab=repositories`, label: 'Your repositories', icon: 'repo' },
    { href: '/notifications', label: 'Notifications', icon: 'bell', count: unreadNotifications() },
    { href: '/settings', label: 'Settings', icon: 'gear' },
    { href: '/docs', label: 'Documentation', icon: 'book' },
  ]),
  section('Explore', [
    { href: '/explore', label: 'Explore RedGet', icon: 'telescope' },
    { href: '/trending', label: 'Trending', icon: 'graph' },
    { href: '/topics', label: 'Topics', icon: 'tag' },
    { href: '/collections', label: 'Collections', icon: 'stack' },
    { href: '/events', label: 'Events', icon: 'calendar' },
    { href: '/sponsors', label: 'Sponsors', icon: 'heart' },
  ]),
  section('Repositories', (db.repos || []).slice(0, 6).map((repo) => ({
    href: `/${repo.fullName}`, label: repo.fullName, icon: repo.visibility === 'private' ? 'lock' : 'repo',
  }))),
  section(null, [
    { href: '/new', label: 'New repository', icon: 'repo-push' },
    { href: '/shortcuts', label: 'Keyboard shortcuts', icon: 'keyboard' },
  ]));

  return drawer;
}

export function toggleMobileNav(force) {
  if (!headerRefs) return false;
  const { drawer, scrim, header } = headerRefs;
  const hamburger = qs('.hamburger', header);
  const open = force != null ? Boolean(force) : drawer.hidden;
  drawer.hidden = !open;
  drawer.dataset.open = String(open);
  scrim.hidden = !open;
  scrim.dataset.open = String(open);
  if (hamburger) hamburger.setAttribute('aria-expanded', String(open));
  document.body.dataset.mobileNav = open ? 'open' : '';
  if (open) {
    const first = qs('a,button', drawer);
    if (first) first.focus();
  } else if (hamburger) {
    hamburger.focus();
  }
  emit(EVENTS.mobileNav, { open });
  return open;
}

/* ==========================================================================
   Dialogs: status, Copilot, support, shortcuts, sign out
   ========================================================================== */

export function openStatusDialog() {
  const user = getCurrentUser();
  const current = user && user.status ? user.status : { emoji: '', message: '' };
  const emoji = h('input', { class: 'input input-sm status-emoji', type: 'text', maxlength: '4', value: current.emoji || '', 'aria-label': 'Status emoji', placeholder: '🙂' });
  const message = h('input', { class: 'input', type: 'text', maxlength: '80', value: current.message || '', 'aria-label': 'Status message', placeholder: 'What is happening?' });
  const busy = h('input', { type: 'checkbox', id: 'status-busy', checked: Boolean(current.busy) });
  const expiry = h('select', { class: 'input', id: 'status-expiry' },
    h('option', { value: '' }, 'Never'),
    h('option', { value: '30' }, '30 minutes'),
    h('option', { value: '60' }, '1 hour'),
    h('option', { value: '240' }, '4 hours'),
    h('option', { value: '1440' }, 'Today'),
    h('option', { value: '10080' }, 'This week'));

  openDialog({
    title: 'Set a status',
    body: h('div', { class: 'dialog-form' },
      h('div', { class: 'status-form-row' },
        h('div', { class: 'field status-emoji-field' }, emoji),
        h('div', { class: 'field grow' }, message)),
      h('label', { class: 'checkbox-row' }, busy, h('span', {}, 'Busy — show a "do not disturb" indicator')),
      h('div', { class: 'field' }, h('label', { for: 'status-expiry' }, 'Remove status after'), expiry),
      h('p', { class: 'field-help' }, 'Your status is shown next to your avatar on your profile, in mentions and in the account menu.')),
    confirmLabel: 'Set status',
    onConfirm: () => {
      api.setStatus(emoji.value.trim(), message.value.trim(), busy.checked, expiry.value ? new Date(Date.now() + Number(expiry.value) * 60000).toISOString() : null);
      updateHeaderCounts();
      toastSuccess('Status updated');
      return true;
    },
    footer: h('div', { class: 'dialog-footer' },
      h('button', {
        class: 'btn', type: 'button',
        onClick: (event) => {
          api.setStatus('', '', false, null);
          toast('Status cleared');
          event.currentTarget.closest('dialog').close('cleared');
        },
      }, 'Clear status'),
      h('button', { class: 'btn', type: 'button', 'data-close': 'true' }, 'Cancel')),
  });
}

export function openCopilotDialog() {
  const input = h('textarea', {
    class: 'input copilot-input', rows: '3',
    placeholder: 'Ask RedGet Copilot about this repository, a diff, or a failing workflow…',
    'aria-label': 'Ask RedGet Copilot',
  });
  const thread = h('div', { class: 'copilot-thread', role: 'log', 'aria-live': 'polite' });
  const dialog = openDialog({
    title: h('span', { class: 'inline-flex' }, icon('copilot', { size: 16 }), 'RedGet Copilot'),
    size: 'lg',
    hideFooter: true,
    body: h('div', { class: 'copilot-panel' },
      thread,
      h('div', { class: 'copilot-suggestions' },
        ['Explain the split diff algorithm', 'Why did the last CI run fail?', 'Draft release notes for v4.3', 'Which files changed most this month?'].map((suggestion) => h('button', {
          class: 'btn btn-sm', type: 'button',
          onClick: () => { input.value = suggestion; ask(); },
        }, suggestion))),
      h('div', { class: 'copilot-composer' },
        input,
        h('button', { class: 'btn btn-primary', type: 'button', onClick: () => ask() }, icon('copilot', { size: 16 }), 'Ask'))),
  });

  function ask() {
    const question = input.value.trim();
    if (!question) return;
    thread.appendChild(h('div', { class: 'copilot-turn copilot-turn-user' },
      avatar(getCurrentUser(), { size: 20 }), h('div', { class: 'copilot-bubble' }, question)));
    input.value = '';
    const pending = h('div', { class: 'copilot-turn copilot-turn-bot' },
      h('span', { class: 'copilot-avatar' }, icon('copilot', { size: 20 })),
      h('div', { class: 'copilot-bubble' }, h('span', { class: 'skeleton skeleton-line', style: 'width:70%' })));
    thread.appendChild(pending);
    thread.scrollTop = thread.scrollHeight;
    setTimeout(() => {
      const answer = copilotAnswer(question);
      pending.querySelector('.copilot-bubble').textContent = answer;
      thread.scrollTop = thread.scrollHeight;
    }, 600);
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); ask(); }
  });
  return dialog;
}

function copilotAnswer(question) {
  const q = question.toLowerCase();
  if (q.includes('diff')) return 'The split view pairs each deletion with the addition that replaces it, so the two columns stay in lockstep. Unpaired lines render as an empty cell filled with --diff-empty-bg. See src/components/diff.js → pairSplitLines().';
  if (q.includes('fail') || q.includes('ci')) return 'The most recent failing run is "RedGet CI" on feature/split-diff-alignment: the validate step exits 1 because two internal routes did not resolve. Open the run, then the validate job log, for the exact paths.';
  if (q.includes('release notes')) return 'Draft for v4.3: split diff pairing, merge queue with configurable concurrency, blame grouping fix, high contrast focus rings restored, and the wiki now renders AsciiDoc and reStructuredText.';
  if (q.includes('changed most')) return 'Over the last 30 days: src/components/diff.js (24 commits), assets/css/repo.css (19), src/core/router.js (11) and assets/css/ui.css (9).';
  return 'RedGet Copilot answers from the local dataset only — no network calls. Try asking about a diff, a failing workflow, release notes or file churn.';
}

export function openSupportDialog() {
  const channels = [
    { icon: 'comment-discussion', label: 'Community discussions', href: '/octored/redget-core/discussions', desc: 'Ask questions and share ideas' },
    { icon: 'shield', label: 'Security advisories', href: '/octored/redget-core/security/advisories', desc: 'Privately report a vulnerability' },
    { icon: 'graph', label: 'RedGet status', href: '/status', desc: 'Incidents and scheduled maintenance' },
    { icon: 'book', label: 'Documentation', href: '/docs', desc: 'Guides, the HTML structure contract and the route reference' },
    { icon: 'keyboard', label: 'Keyboard shortcuts', href: '/shortcuts', desc: 'Every binding in one place' },
  ];

  const list = h('ul', { class: 'item-list', role: 'list' },
    ...channels.map((entry) => {
      const link = h('a', { class: 'inline-flex grow', href: entry.href },
        icon(entry.icon, { size: 16 }),
        h('span', {},
          h('span', { class: 'text-strong d-block' }, entry.label),
          h('span', { class: 'text-muted text-small' }, entry.desc)));
      return h('li', { class: 'box-row' }, link);
    }));

  const body = h('div', { class: 'support-panel' },
    h('p', {}, 'This is a self-contained demo, so support is simulated locally. Pick a channel:'),
    list);

  openDialog({ title: 'RedGet Support', size: 'md', hideFooter: true, body });
}

export function openShortcutsDialog() {
  const groups = SHORTCUTS.map((group) => h('section', { class: 'shortcuts-group' },
    h('h3', {}, group.group),
    h('table', { class: 'table shortcuts-table' },
      h('caption', { class: 'sr-only' }, `${group.group} keyboard shortcuts`),
      h('tbody', {}, group.keys.map((entry) => h('tr', {},
        h('th', { scope: 'row' }, h('span', { class: 'shortcut-keys' }, entry.combo.map((key, index) => [
          index > 0 ? h('span', { class: 'shortcut-plus', 'aria-hidden': 'true' }, ' then ') : null,
          h('kbd', {}, key),
        ]))),
        h('td', {}, entry.action)))))));

  openDialog({
    title: 'Keyboard shortcuts',
    size: 'lg',
    hideFooter: true,
    body: h('div', { class: 'shortcuts-grid' }, groups),
  });
}

function signOutConfirm() {
  confirmDialog({
    title: 'Sign out of RedGet?',
    body: 'Your local data (stars, comments, merges and settings) stays in this browser. You can sign back in from /login.',
    confirmLabel: 'Sign out',
    danger: true,
  }).then((confirmed) => {
    if (!confirmed) return;
    api.signOut();
    toast('Signed out. Redirecting to the sign-in page…');
    navigate('/login');
  });
}

/* ==========================================================================
   Locale / banner helpers
   ========================================================================== */

export function openLocaleMenu(anchor) {
  const prefs = getPrefs();
  const items = LOCALES.map((locale) => ({
    label: locale.label,
    value: locale.id,
    checked: prefs.locale === locale.id,
    onClick: () => {
      setPref('locale', locale.id);
      document.documentElement.lang = locale.id;
      document.documentElement.dir = locale.dir;
      toastSuccess(`Language set to ${locale.label}`);
    },
  }));
  const dd = dropdown({
    label: 'Language',
    icon: 'globe',
    items,
    align: 'left',
    triggerClass: 'btn btn-sm',
    ariaLabel: 'Choose a language',
  });
  if (anchor && anchor.parentNode) anchor.parentNode.replaceChild(dd.root, anchor);
  return dd;
}

export function flash(variant = 'info', title, message, options = {}) {
  const el = h('div', { class: `flash flash-${variant}`, role: variant === 'danger' ? 'alert' : 'status' },
    icon(variant === 'success' ? 'check-circle' : variant === 'danger' ? 'alert' : variant === 'attention' ? 'alert' : 'info', { size: 16 }),
    h('div', { class: 'flash-content' },
      title ? h('div', { class: 'flash-title' }, title) : null,
      message ? h('div', {}, message) : null),
    options.dismissible !== false ? h('button', {
      class: 'btn-link flash-close', type: 'button', 'aria-label': 'Dismiss message',
      onClick: (event) => { event.currentTarget.closest('.flash').remove(); },
    }, icon('x', { size: 16 })) : null);
  return el;
}

export function bannerStrip(message) {
  return h('div', { class: 'banner-strip', role: 'status' },
    h('div', { class: 'container' }, icon('megaphone', { size: 16 }), h('span', {}, message)));
}

/* ==========================================================================
   Wiring
   ========================================================================== */

export function initHeader() {
  on(EVENTS.dataChange, () => updateHeaderCounts());
  on(EVENTS.sessionChange, () => updateHeaderCounts());
  on(EVENTS.notifications, () => updateHeaderCounts());
  on(EVENTS.routeChange, (payload) => markHeaderActive(payload && payload.path ? payload.path : currentPath()));
}

export default {
  renderHeader, updateHeaderCounts, markHeaderActive, toggleMobileNav, openStatusDialog,
  openCopilotDialog, openSupportDialog, openShortcutsDialog, openAppearanceDialog,
  openLocaleMenu, flash, bannerStrip, initHeader,
};
