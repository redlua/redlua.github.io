/**
 * RedGet — error and status pages: 404, 500, rate limit, maintenance.
 *
 * Each page is a full <main> body (the header/footer come from the shell) built
 * from the same vocabulary as the rest of the app:
 *
 *   <div class="container error-container">
 *     <div class="error-card" role="alert">
 *       <p class="error-code">404</p>
 *       <h1 class="error-title">…</h1>
 *       <p class="error-description">…</p>
 *       <div class="error-actions">…</div>
 *
 * The 500 page also exposes the diagnostic console output because there is no
 * server to inspect: the stack is the only truth available offline.
 */

import { h, icon } from '../core/dom.js';
import { navigate, currentPath } from '../core/router.js';
import { BRAND, LIMITS } from '../config.js';
import { getDb, getSession } from '../core/store.js';
import { openCommandPalette } from '../components/commandPalette.js';
import { confirmDialog, toast } from '../components/overlay.js';
import { clearAllStorage } from '../core/store.js';

function errorCard({ code, title, description, actions = [], details = null, role = 'alert' }) {
  return h('div', { class: 'container error-container' },
    h('div', { class: 'error-card', role, 'aria-live': 'assertive' },
      h('p', { class: 'error-code' }, code),
      h('h1', { class: 'error-title' }, title),
      description ? h('p', { class: 'error-description' }, description) : null,
      details,
      actions.length ? h('div', { class: 'error-actions' }, ...actions) : null,
      h('p', { class: 'error-hint text-small text-muted' },
        'Press ', h('kbd', {}, '/'), ' to search, ', h('kbd', {}, '?'), ' for every shortcut, or ',
        h('a', { href: '/docs/html-structure' }, 'read the HTML structure guide'), '.')));
}

/* ----------------------------------------------------------------------- 404 */

export function render404(ctx = {}) {
  const path = ctx.path || ctx.params?.path || currentPath();
  const suggestions = suggestFor(path);

  return errorCard({
    code: '404',
    title: 'This is not the page you are looking for',
    description: `RedGet could not find anything at ${path || 'that address'}. The route may have moved, the repository may be private, or the link may simply be wrong.`,
    details: h('div', { class: 'error-details' },
      h('h2', { class: 'error-details-title' }, 'Did you mean one of these?'),
      suggestions.length
        ? h('ul', { class: 'link-list error-suggestions', role: 'list' },
          ...suggestions.map((item) => h('li', {},
            h('a', { href: item.href }, icon(item.icon || 'link', { size: 16 }), ' ', item.label))))
        : h('p', { class: 'text-small text-muted' }, 'No close matches — try the search palette instead.')),
    actions: [
      h('a', { class: 'btn btn-primary', href: '/dashboard' }, icon('home', { size: 16 }), 'Your dashboard'),
      h('button', { class: 'btn', type: 'button', onClick: () => openCommandPalette() }, icon('search', { size: 16 }), 'Search RedGet'),
      h('button', { class: 'btn', type: 'button', onClick: () => navigate(-1) }, icon('arrow-left', { size: 16 }), 'Go back'),
    ],
  });
}

function suggestFor(path) {
  const db = getDb();
  const out = [];
  if (!db) return out;
  const segments = String(path || '').split('/').filter(Boolean);
  const [owner, name] = segments;

  if (owner) {
    const user = db.users.find((u) => u.login.toLowerCase() === owner.toLowerCase());
    const org = db.orgs.find((o) => o.login.toLowerCase() === owner.toLowerCase());
    if (user) out.push({ href: `/${user.login}`, label: `${user.name || user.login}'s profile`, icon: 'person' });
    if (org) out.push({ href: `/orgs/${org.login}`, label: `${org.name} organization`, icon: 'organization' });
    if (!user && !org) {
      const close = db.users.concat(db.orgs)
        .filter((record) => record.login.toLowerCase().includes(owner.toLowerCase().slice(0, 3)))
        .slice(0, 3);
      close.forEach((record) => out.push({
        href: record.type === 'org' ? `/orgs/${record.login}` : `/${record.login}`,
        label: record.login, icon: record.type === 'org' ? 'organization' : 'person',
      }));
    }
  }

  if (owner && name) {
    const repo = db.repos.find((r) => r.fullName.toLowerCase() === `${owner}/${name}`.toLowerCase());
    if (repo) out.push({ href: `/${repo.fullName}`, label: `${repo.fullName} code`, icon: 'repo' });
    else {
      db.repos.filter((r) => r.name.toLowerCase().includes(name.toLowerCase().slice(0, 4)))
        .slice(0, 3)
        .forEach((r) => out.push({ href: `/${r.fullName}`, label: r.fullName, icon: 'repo' }));
    }
  }

  out.push({ href: '/explore', label: 'Explore repositories', icon: 'telescope' });
  out.push({ href: '/issues', label: 'Issues assigned to you', icon: 'issue-opened' });
  out.push({ href: '/pulls', label: 'Pull requests you opened', icon: 'git-pull-request' });
  out.push({ href: '/docs', label: 'RedGet documentation', icon: 'book' });
  return out.slice(0, 7);
}

/* ----------------------------------------------------------------------- 500 */

export function render500(ctx = {}) {
  const detail = ctx.error ? String(ctx.error.stack || ctx.error.message || ctx.error) : null;
  return errorCard({
    code: '500',
    title: 'Something went wrong on our side',
    description: 'A page module threw while rendering. RedGet keeps running — the shell, the header and your data are untouched.',
    details: h('div', { class: 'error-details' },
      h('h2', { class: 'error-details-title' }, 'What you can do'),
      h('ul', { class: 'link-list', role: 'list' },
        h('li', {}, h('a', { href: '/dashboard' }, 'Return to your dashboard')),
        h('li', {}, h('a', { href: '/status' }, 'Check RedGet status')),
        h('li', {}, h('a', { href: '/docs/troubleshooting' }, 'Troubleshooting guide')),
        h('li', {}, h('a', { href: '/changelog' }, 'Recent changes'))),
      detail
        ? h('details', { class: 'error-stack' },
          h('summary', {}, 'Technical details'),
          h('pre', {}, h('code', {}, detail)))
        : null),
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => window.location.reload() }, icon('sync', { size: 16 }), 'Reload this page'),
      h('a', { class: 'btn', href: '/dashboard' }, icon('home', { size: 16 }), 'Dashboard'),
      h('button', {
        class: 'btn btn-danger', type: 'button',
        onClick: () => confirmDialog({
          title: 'Clear all demo data?',
          body: 'This removes every local mutation (stars, comments, settings) and reloads RedGet with a fresh seed.',
          confirmLabel: 'Clear and reload',
          danger: true,
        }).then((ok) => {
          if (!ok) return;
          clearAllStorage();
          window.location.reload();
        }),
      }, icon('trash', { size: 16 }), 'Reset demo data'),
    ],
  });
}

/* ----------------------------------------------------------------- rate limit */

export function renderRateLimit() {
  const db = getDb();
  const limits = (db && db.rateLimits) || [];
  const now = new Date();
  const reset = new Date(now.getTime() + 42 * 60 * 1000);

  return errorCard({
    code: '429',
    title: 'You have exceeded a secondary rate limit',
    description: 'RedGet throttles burst traffic to keep the demo dataset responsive. Wait for the window to reset, or reduce the request rate.',
    role: 'status',
    details: h('div', { class: 'error-details' },
      h('table', { class: 'table rate-limit-table' },
        h('caption', { class: 'sr-only' }, 'Current rate limit usage by resource'),
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, 'Resource'),
          h('th', { scope: 'col' }, 'Limit'),
          h('th', { scope: 'col' }, 'Used'),
          h('th', { scope: 'col' }, 'Remaining'),
          h('th', { scope: 'col' }, 'Resets'))),
        h('tbody', {},
          ...(limits.length ? limits : [{ resource: 'core', limit: 5000, used: 5000, remaining: 0 }]).map((row) => h('tr', {},
            h('th', { scope: 'row' }, row.resource),
            h('td', {}, String(row.limit)),
            h('td', {}, String(row.used)),
            h('td', { class: row.remaining === 0 ? 'text-danger' : null }, String(row.remaining)),
            h('td', {}, row.resource === 'core' ? reset.toLocaleTimeString() : '—'))))),
      h('p', { class: 'text-small text-muted' },
        `Retry after: ${Math.ceil((reset - now) / 1000)} seconds. Per-page request budget in this demo: ${LIMITS.pageSize} items.`),
      h('p', { class: 'text-small text-muted' }, 'Abuse detection headers are simulated: ', h('code', { class: 'code-inline' }, 'Retry-After'), ', ', h('code', { class: 'code-inline' }, 'X-RateLimit-Remaining'), '.')),
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => toast({ message: 'Rate limit window cleared (demo)', variant: 'success' }) }, icon('sync', { size: 16 }), 'Simulate reset'),
      h('a', { class: 'btn', href: '/docs/rate-limit' }, icon('book', { size: 16 }), 'Read about rate limits'),
      h('a', { class: 'btn', href: '/dashboard' }, icon('home', { size: 16 }), 'Dashboard'),
    ],
  });
}

/* ---------------------------------------------------------------- maintenance */

export function renderMaintenance() {
  const db = getDb();
  const incidents = (db && db.statusIncidents) || [];
  const active = incidents.filter((incident) => incident.state !== 'resolved');

  return errorCard({
    code: '503',
    title: 'RedGet is down for scheduled maintenance',
    description: 'We are upgrading the demo dataset. Reads are unavailable for a few minutes; nothing you have written locally is lost.',
    role: 'status',
    details: h('div', { class: 'error-details' },
      h('h2', { class: 'error-details-title' }, 'Incidents'),
      active.length
        ? h('ul', { class: 'link-list', role: 'list' }, ...active.map((incident) => h('li', {},
          h('span', { class: 'status-dot status-critical', 'aria-hidden': 'true' }),
          ` ${incident.title} — ${incident.state}`)))
        : h('p', { class: 'text-small text-muted' }, 'No active incidents recorded.'),
      h('p', { class: 'text-small text-muted' }, 'Full component history: ', h('a', { href: '/status' }, '/status'))),
    actions: [
      h('button', { class: 'btn btn-primary', type: 'button', onClick: () => window.location.reload() }, icon('sync', { size: 16 }), 'Retry now'),
      h('a', { class: 'btn', href: '/status' }, icon('pulse', { size: 16 }), 'Status page'),
      h('a', { class: 'btn', href: '/changelog' }, icon('history', { size: 16 }), 'Changelog'),
    ],
  });
}

/* --------------------------------------------------------------- forbidden etc */

export function renderForbidden(ctx = {}) {
  const session = getSession();
  return errorCard({
    code: '403',
    title: 'You do not have access to this resource',
    description: ctx.reason || `Signed in as ${session.login || 'a guest'}, this repository is private or your permission level is too low.`,
    actions: [
      h('a', { class: 'btn btn-primary', href: '/dashboard' }, icon('home', { size: 16 }), 'Dashboard'),
      h('a', { class: 'btn', href: '/login' }, icon('sign-in', { size: 16 }), 'Switch account'),
    ],
  });
}

export function renderUnavailable() {
  return errorCard({
    code: '451',
    title: 'Unavailable for legal reasons',
    description: 'Access to this content is disabled in the current region. This is a simulated response — RedGet stores nothing outside your browser.',
    actions: [h('a', { class: 'btn btn-primary', href: '/dashboard' }, icon('home', { size: 16 }), 'Dashboard')],
  });
}

export default { render404, render500, renderRateLimit, renderMaintenance, renderForbidden, renderUnavailable, suggestFor };
