/**
 * RedGet — application shell.
 *
 * Owns the persistent chrome around the routed view:
 *
 *   <body>
 *     <a class="skip-link" href="#app">Skip to content</a>
 *     <header class="app-header">…</header>            ← src/components/header.js
 *     <div class="mobile-scrim">
 *     <div class="mobile-nav" id="mobile-nav" role="dialog">
 *     <div class="banner-strip">                        ← optional announcement
 *     <main id="app" class="app-main" tabindex="-1">    ← router target
 *     <footer class="app-footer">
 *     <div class="toast-stack" role="region" aria-live="polite">
 *     <dialog class="command-palette">                  ← created on demand
 *
 * Boot order: theme → locale → seed database → hydrate store → header → routes.
 */

import { h, icon, qs } from './core/dom.js';
import { BRAND, LIMITS } from './config.js';
import { hydrate, getPrefs, setPref, getDb } from './core/store.js';
import { initTheme, applyDensity, applyReducedMotion, syncMotionPreference } from './core/theme.js';
import { setLocale, getLocaleDir, t } from './core/i18n.js';
import { on, EVENTS, emit } from './core/bus.js';
import { start as startRouter, setRoot, navigate, currentPath, handleLocation } from './core/router.js';
import { renderHeader, initHeader, markHeaderActive, openShortcutsDialog, toggleMobileNav } from './components/header.js';
import { openCommandPalette } from './components/commandPalette.js';
import { initTooltips, toast } from './components/overlay.js';
import { startTimeUpdater } from './components/kit.js';
import { appFaviconDataUri } from './components/avatars.js';
import { registerRoutes } from './routes.js';
import { buildDatabase, prepareReferenceTime } from './data/mockData.js';
import { registerShortcuts } from './shortcuts.js';

let booted = false;

export async function bootstrap(rootElement = document.body) {
  if (booted) return;
  booted = true;

  // 1. Preferences drive the very first paint, so apply them before any content.
  prepareReferenceTime();
  const prefs = getPrefs();
  initTheme(prefs);
  applyDensity(prefs.density);
  applyReducedMotion(prefs.reducedMotion);
  syncMotionPreference();
  setLocale(prefs.locale);
  document.documentElement.lang = prefs.locale || 'en';
  document.documentElement.dir = getLocaleDir();

  // 2. Build (or restore) the dataset.
  const db = buildDatabase();
  hydrate(db);

  // 3. Favicon from the generated RedGet mark.
  applyFavicon();

  // 4. Shell.
  const shell = buildShell(rootElement);

  // 5. Routing + global behaviour.
  registerRoutes();
  initHeader();
  startTimeUpdater();
  registerShortcuts();
  wireDataEvents();

  const mode = window.location.protocol === 'file:' ? 'hash' : 'history';
  setRoot(shell.main);
  await startRouter({ root: shell.main, initialMode: mode });

  markHeaderActive(currentPath());
  emit('app:ready', { db });
  return shell;
}

/* --------------------------------------------------------------------- shell */

function buildShell(rootElement) {
  const skipLink = h('a', { class: 'skip-link sr-only-focusable', href: '#app' }, 'Skip to content');

  const headerParts = renderHeader();

  const main = h('main', {
    class: 'app-main', id: 'app', tabindex: '-1',
    'aria-busy': 'false', role: 'main',
  });

  const footer = buildFooter();

  const toastRegion = h('div', {
    class: 'toast-stack', role: 'region',
    'aria-label': 'Notifications', 'aria-live': 'polite', 'aria-relevant': 'additions text',
    id: 'toast-stack',
  });

  rootElement.append(skipLink, headerParts.root, headerParts.scrim, headerParts.drawer, main, footer, toastRegion);

  initTooltips(document);
  return { main, header: headerParts.root, footer, toastRegion, skipLink };
}

function buildFooter() {
  const columns = [
    {
      title: 'Product',
      links: [
        { label: 'Features', href: '/enterprise' },
        { label: 'RedGet Copilot', href: '/docs/copilot' },
        { label: 'RedGet Actions', href: '/docs/actions' },
        { label: 'RedGet Packages', href: '/docs/packages' },
        { label: 'RedGet Security', href: '/docs/security' },
        { label: 'RedGet Codespaces', href: '/docs/codespaces' },
        { label: 'Pricing', href: '/pricing' },
        { label: 'Marketplace', href: '/marketplace' },
      ],
    },
    {
      title: 'Platform',
      links: [
        { label: 'Developer API', href: '/docs/api' },
        { label: 'Partners', href: '/docs/partners' },
        { label: 'Education', href: '/docs/education' },
        { label: 'RedGet CLI', href: '/docs/cli' },
        { label: 'RedGet Desktop', href: '/docs/desktop' },
        { label: 'Status', href: '/status' },
        { label: 'Changelog', href: '/changelog' },
      ],
    },
    {
      title: 'Support',
      links: [
        { label: 'Documentation', href: '/docs' },
        { label: 'HTML structure guide', href: '/docs/html-structure' },
        { label: 'Community forum', href: '/octored/redget-core/discussions' },
        { label: 'RedGet Support', href: '/docs/support' },
        { label: 'Keyboard shortcuts', href: '/shortcuts' },
        { label: 'Report a vulnerability', href: '/docs/security' },
      ],
    },
    {
      title: 'Company',
      links: [
        { label: 'About', href: '/docs/about' },
        { label: 'Customer stories', href: '/docs/customers' },
        { label: 'Blog', href: '/docs/blog' },
        { label: 'Careers', href: '/docs/careers' },
        { label: 'Press', href: '/docs/press' },
        { label: 'Inclusion', href: '/docs/inclusion' },
        { label: 'Social impact', href: '/docs/social-impact' },
        { label: 'Shop', href: '/docs/shop' },
      ],
    },
    {
      title: 'Legal and privacy',
      links: [
        { label: 'Terms', href: '/docs/terms' },
        { label: 'Privacy', href: '/docs/privacy' },
        { label: 'Cookie preferences', href: '/settings/appearance' },
        { label: 'Accessibility statement', href: '/docs/accessibility' },
        { label: 'Licences', href: '/docs/licences' },
        { label: 'Subprocessors', href: '/docs/subprocessors' },
        { label: 'Trademark policy', href: '/docs/trademark' },
      ],
    },
  ];

  return h('footer', { class: 'app-footer', role: 'contentinfo' },
    h('div', { class: 'container' },
      h('div', { class: 'footer-grid' },
        h('div', { class: 'footer-brand' },
          h('a', { class: 'brand', href: '/', 'aria-label': `${BRAND.name} home` },
            h('svg', { class: 'brand-mark', viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false', width: '30', height: '30' },
              h('use', { href: `#${BRAND.logoSymbol}` }))),
          h('p', { class: 'text-small text-muted' }, `© ${new Date().getFullYear()} ${BRAND.legalName}`),
          h('p', { class: 'text-small text-muted' }, BRAND.tagline),
          h('p', { class: 'text-small text-muted' }, 'A self-contained demo: every route, avatar, commit and workflow run is generated locally. No external services are contacted.'),
          h('div', { class: 'footer-actions' },
            h('a', { class: 'btn btn-sm', href: '/status' }, icon('pulse', { size: 16 }), 'Status'),
            h('button', { class: 'btn btn-sm', type: 'button', onClick: () => openShortcutsDialog() }, icon('keyboard', { size: 16 }), 'Shortcuts'),
            h('button', {
              class: 'btn btn-sm', type: 'button',
              onClick: () => import('./components/resetData.js').then((m) => m.openDataDialog()),
            }, icon('database', { size: 16 }), 'Demo data'))),
        columns.map((column) => h('div', { class: 'footer-col' },
          h('h2', {}, column.title),
          h('ul', { class: 'footer-links', role: 'list' },
            column.links.map((link) => h('li', {}, h('a', { href: link.href }, link.label))))))),
      h('div', { class: 'footer-bottom' },
        h('span', {}, `${BRAND.name} ${BRAND.hostPlaceholder}`),
        h('span', { class: 'footer-bottom-links' },
          h('a', { href: '/docs' }, 'Docs'),
          h('a', { href: '/docs/html-structure' }, 'HTML structure'),
          h('a', { href: '/pricing' }, 'Pricing'),
          h('a', { href: '/security' }, 'Security')))));
}

function applyFavicon() {
  const href = appFaviconDataUri(BRAND.name);
  let link = qs('link[rel="icon"]');
  if (!link) {
    link = h('link', { rel: 'icon', type: 'image/svg+xml' });
    document.head.appendChild(link);
  }
  link.setAttribute('href', href);
}

/* --------------------------------------------------------------------- events */

function wireDataEvents() {
  on(EVENTS.localeChange, (payload) => {
    const locale = (payload && payload.locale) || getPrefs().locale || 'en';
    document.documentElement.lang = locale;
    document.documentElement.dir = getLocaleDir(locale);
  });
  on(EVENTS.routeChange, () => {
    markHeaderActive(currentPath());
    toggleMobileNav(false);
    document.body.dataset.route = currentPath().replace(/\W+/g, '_');
  });
  on('app:announce', (payload) => {
    if (payload && payload.message) toast({ message: payload.message, variant: payload.variant || 'info' });
  });
  window.addEventListener('error', (event) => {
    console.error('[RedGet] uncaught error', event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[RedGet] unhandled rejection', event.reason);
  });
}

/** Reload the current view without a full page refresh (used after data resets). */
export function refreshCurrentRoute() {
  return handleLocation();
}

export function goto(path) {
  navigate(path);
}

export default { bootstrap, refreshCurrentRoute, goto, LIMITS, t };
