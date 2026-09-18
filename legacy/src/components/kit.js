/**
 * RedGet — shared UI kit.
 *
 * Small, composable builders for the pieces every page needs. Each one returns a
 * real DOM node built with h(), and each follows the markup contract documented
 * in /assets/css/ui.css and /assets/css/base.css:
 *
 *   empty state   → <section class="empty-state"> <span class="empty-icon"> <h2> <p>
 *                   <div class="empty-actions">
 *   pagination    → <nav class="pagination" aria-label="Pagination">
 *                     <a rel="prev"> <span class="current" aria-current="page"> <a rel="next">
 *   skeleton      → <div class="skeleton skeleton-line" style="--skeleton-w:60%">
 *   state tabs    → <div class="state-tabs" role="group"> <a class="state-tab" aria-current>
 *   filter bar    → <div class="filter-bar"> <div class="filter-group"> <div class="grow">
 *   chip          → <span class="chip"> label <button aria-label="Remove …">
 *   segmented     → <div class="segmented" role="group"> <button aria-pressed>
 *   item row      → <div class="item-row"> <span class="item-row-status">
 *                     <div class="item-row-main"> <span class="item-row-title">
 *   relative time → <relative-time datetime="…" data-tz> (custom element, auto-updating)
 */

import { h, icon, qs, qsa } from '../core/dom.js';
import { relativeTime, absoluteTime, compactNumber, formatNumber } from '../core/util.js';
import { getPrefs } from '../core/store.js';
import { LIMITS } from '../config.js';
import { withTooltip, copyButton, attachMenu } from './overlay.js';
import { avatar } from './avatars.js';

/* ==========================================================================
   Relative time
   ========================================================================== */

const TIME_ELEMENTS = new Set();
let timeTicker = null;

/**
 * `<relative-time datetime="…" data-tz="…">2 hours ago</relative-time>`
 * Custom element so it can update itself on an interval and expose the absolute
 * timestamp in a tooltip plus a machine-readable `datetime` attribute.
 */
export function relativeTimeEl(value, options = {}) {
  const { cls = '', prefix = '', suffix = '' } = options;
  if (!value) return h('span', { class: ['text-muted', cls].filter(Boolean).join(' ') }, '—');
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return h('span', { class: cls }, String(value));
  const timeZone = getPrefs().timeZone || undefined;
  const node = h('relative-time', {
    class: ['relative-time', cls].filter(Boolean).join(' '),
    datetime: date.toISOString(),
    'data-tz': timeZone || '',
    title: absoluteTime(date, timeZone),
  }, `${prefix}${relativeTime(date)}${suffix}`);
  TIME_ELEMENTS.add(node);
  return node;
}

function tickRelativeTimes() {
  const timeZone = getPrefs().timeZone || undefined;
  TIME_ELEMENTS.forEach((node) => {
    if (!node.isConnected) { TIME_ELEMENTS.delete(node); return; }
    const iso = node.getAttribute('datetime');
    if (!iso) return;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return;
    const prefix = node.dataset.prefix || '';
    const suffix = node.dataset.suffix || '';
    const next = `${prefix}${relativeTime(date)}${suffix}`;
    if (node.textContent !== next) node.textContent = next;
    const title = absoluteTime(date, timeZone);
    if (node.getAttribute('title') !== title) node.setAttribute('title', title);
  });
}

/** Start the shared 30s ticker that keeps every relative timestamp fresh. */
export function startTimeUpdater() {
  if (timeTicker || typeof window === 'undefined') return () => {};
  timeTicker = window.setInterval(tickRelativeTimes, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tickRelativeTimes();
  });
  return () => { window.clearInterval(timeTicker); timeTicker = null; };
}

export function refreshRelativeTimes() {
  tickRelativeTimes();
}

/** Absolute timestamp with the user's time zone in the tooltip. */
export function absoluteTimeEl(value, options = {}) {
  const { cls = '' } = options;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return h('span', { class: cls }, '—');
  return h('time', {
    class: cls, datetime: date.toISOString(),
    title: `${absoluteTime(date, getPrefs().timeZone)} · ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
  }, absoluteTime(date, getPrefs().timeZone));
}

/* ==========================================================================
   Counts, badges, state pills
   ========================================================================== */

export function counter(value, options = {}) {
  const { cls = '', title = null } = options;
  if (!value) return null;
  const node = h('span', {
    class: ['counter', cls].filter(Boolean).join(' '),
    title: title || (typeof value === 'number' ? formatNumber(value) : null),
  }, typeof value === 'number' ? compactNumber(value) : String(value));
  return node;
}

export function badge(text, variant = 'neutral', options = {}) {
  const { iconName = null, title = null } = options;
  return h('span', {
    class: `badge badge-${variant}`,
    title: title || undefined,
  }, iconName ? icon(iconName, { size: 12 }) : null, text);
}

export function visibilityBadge(visibility) {
  const map = {
    public: { label: 'Public', variant: 'neutral', iconName: 'repo' },
    private: { label: 'Private', variant: 'accent', iconName: 'lock' },
    internal: { label: 'Internal', variant: 'attention', iconName: 'enterprise' },
  };
  const config = map[visibility] || map.public;
  return h('span', { class: `badge badge-${config.variant}`, title: `${config.label} repository` },
    icon(config.iconName, { size: 12 }), config.label);
}

export function stateBadge(state, options = {}) {
  const map = {
    open: { label: 'Open', iconName: 'issue-opened', variant: 'success' },
    closed: { label: 'Closed', iconName: 'issue-closed', variant: 'danger' },
    merged: { label: 'Merged', iconName: 'git-merge', variant: 'done' },
    draft: { label: 'Draft', iconName: 'git-pull-request-draft', variant: 'neutral' },
    'not_planned': { label: 'Closed as not planned', iconName: 'issue-closed', variant: 'neutral' },
    reopened: { label: 'Reopened', iconName: 'issue-reopened', variant: 'success' },
  };
  const config = map[state] || { label: state, iconName: 'dot-fill', variant: 'neutral' };
  return h('span', { class: `badge badge-${options.variant || config.variant}` },
    icon(config.iconName, { size: 12 }), options.label || config.label);
}

export function labelPill(label, options = {}) {
  const { onClick = null, removable = false, onRemove = null } = options;
  const background = `#${label.color}`;
  const foreground = readableForeground(label.color);
  const children = [h('span', { class: 'label-name' }, label.name)];
  const node = h(onClick ? 'button' : 'span', {
    class: 'label-pill',
    type: onClick ? 'button' : undefined,
    style: `background-color:${background};color:${foreground};border-color:${background}`,
    title: label.description || label.name,
    onClick: onClick || undefined,
  }, children);
  if (removable) {
    node.appendChild(h('button', {
      type: 'button', 'aria-label': `Remove label ${label.name}`,
      onClick: (event) => { event.stopPropagation(); if (onRemove) onRemove(label); },
    }, icon('x', { size: 12 })));
  }
  return node;
}

/** Pick black or white text for a hex background (WCAG relative luminance). */
export function readableForeground(hex) {
  const value = String(hex || '').replace('#', '');
  if (value.length !== 6) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  return luminance > 0.45 ? '#1a0206' : '#ffffff';
}

export function checkStateIcon(status, conclusion, options = {}) {
  const { size = 16 } = options;
  if (status === 'queued') return icon('queue', { size, cls: 'state-pending' });
  if (status === 'in_progress') return icon('play', { size, cls: 'state-pending' });
  if (status === 'waiting') return icon('clock', { size, cls: 'state-pending' });
  if (conclusion === 'success') return icon('check-circle', { size, cls: 'state-success' });
  if (conclusion === 'failure') return icon('x-circle', { size, cls: 'state-danger' });
  if (conclusion === 'cancelled') return icon('stop', { size, cls: 'state-neutral' });
  if (conclusion === 'skipped') return icon('skip', { size, cls: 'state-neutral' });
  if (conclusion === 'timed_out') return icon('clock', { size, cls: 'state-attention' });
  return icon('dot-fill', { size, cls: 'state-neutral' });
}

export function statusDot(status, conclusion) {
  const kind = status === 'completed'
    ? (conclusion === 'success' ? 'success' : conclusion === 'failure' ? 'danger' : conclusion === 'cancelled' ? 'neutral' : 'attention')
    : status === 'in_progress' ? 'pending' : 'queued';
  return h('span', {
    class: `status-dot status-${kind}`,
    role: 'img',
    'aria-label': conclusion ? `${status} (${conclusion})` : status,
  });
}

/* ==========================================================================
   Layout primitives
   ========================================================================== */

export function pageHeader(title, options = {}) {
  const { description = null, actions = null, id = null, level = 1 } = options;
  const Heading = `h${level}`;
  return h('div', { class: 'page-header' },
    h('div', { class: 'page-header-text' },
      h(Heading, { class: 'page-title', id: id || undefined }, title),
      description ? h('p', { class: 'page-subtitle' }, description) : null),
    actions ? h('div', { class: 'page-header-actions' }, actions) : null);
}

export function subnav(items, options = {}) {
  const { ariaLabel = 'Sub navigation', selected = null, right = null, title = null } = options;
  return h('div', { class: 'subnav' },
    title ? h('h1', { class: 'subnav-title' }, title) : null,
    h('nav', { class: 'subnav-links', 'aria-label': ariaLabel },
      items.map((item) => {
        const active = selected != null && (item.id === selected || item.href === selected);
        return h('a', {
          class: ['subnav-item', active ? 'selected' : ''].filter(Boolean).join(' '),
          href: item.href || '#',
          'aria-current': active ? 'page' : undefined,
          onClick: item.onClick || undefined,
        }, item.icon ? icon(item.icon, { size: 16 }) : null, h('span', {}, item.label),
        item.count != null ? counter(item.count) : null);
      })),
    right ? h('div', { class: 'subnav-right' }, right) : null);
}

export function card(title, body, options = {}) {
  const { actions = null, cls = '', id = null, iconName = null, collapsible = false } = options;
  const headerEl = h('div', { class: 'card-header' },
    iconName ? icon(iconName, { size: 16 }) : null,
    h('h2', { class: 'card-title', id: id || undefined }, title),
    actions ? h('div', { class: 'card-actions' }, actions) : null);
  if (!collapsible) {
    return h('section', { class: ['card', 'card-flush', cls].filter(Boolean).join(' ') },
      headerEl, h('div', { class: 'card-body' }, body));
  }
  const details = h('details', { class: ['card', 'card-flush', 'card-collapsible', cls].filter(Boolean).join(' '), open: true },
    h('summary', { class: 'card-header' },
      icon('chevron-down', { size: 16, cls: 'card-caret' }),
      iconName ? icon(iconName, { size: 16 }) : null,
      h('h2', { class: 'card-title' }, title),
      actions ? h('div', { class: 'card-actions' }, actions) : null),
    h('div', { class: 'card-body' }, body));
  return details;
}

export function panel(title, body, options = {}) {
  return card(title, body, options);
}

/** Grid with a main column and a sidebar: <div class="grid grid-sidebar"> */
export function withSidebar(main, sidebar, options = {}) {
  const { cls = '', sidebarFirst = false } = options;
  const grid = sidebarFirst ? 'grid grid-sidebar-left' : 'grid grid-sidebar';
  return h('div', { class: [grid, cls].filter(Boolean).join(' ') },
    sidebarFirst
      ? h('aside', { class: 'sidebar' }, sidebar)
      : h('main', { class: 'main-col' }, main),
    sidebarFirst
      ? h('main', { class: 'main-col' }, main)
      : h('aside', { class: 'sidebar' }, sidebar));
}

export function sidebarSection(title, body, options = {}) {
  const { action = null, id = null } = options;
  return h('section', { class: 'meta-section' },
    h('h2', { class: 'meta-section-title', id: id || undefined },
      title,
      action ? h('span', { class: 'spacer' }) : null,
      action || null),
    body);
}

/* ==========================================================================
   Empty states, skeletons, errors
   ========================================================================== */

export function emptyState(options = {}) {
  const {
    title = 'Nothing here yet', description = null, iconName = 'inbox',
    actions = null, cls = '', small = false,
  } = options;
  return h('section', {
    class: ['empty-state', small ? 'empty-state-sm' : '', cls].filter(Boolean).join(' '),
    'aria-label': title,
  },
  h('span', { class: 'empty-icon', 'aria-hidden': 'true' }, icon(iconName, { size: 32 })),
  h('h2', {}, title),
  description ? h('p', {}, description) : null,
  actions ? h('div', { class: 'empty-actions' }, actions) : null);
}

export function emptyInline(text, options = {}) {
  return h('div', { class: ['empty-inline', options.cls || ''].filter(Boolean).join(' ') },
    options.iconName ? icon(options.iconName, { size: 16 }) : null,
    h('span', {}, text));
}

export function skeleton(options = {}) {
  const { lines = 3, width = null, cls = '', kind = 'text' } = options;
  const children = [];
  for (let i = 0; i < lines; i += 1) {
    const w = width || `${100 - ((i * 9) % 40)}%`;
    children.push(h('div', { class: `skeleton skeleton-${kind}`, style: `width:${w}` }));
  }
  return h('div', { class: ['skeleton-group', cls].filter(Boolean).join(' '), 'aria-hidden': 'true' }, children);
}

export function skeletonList(rows = 5) {
  const list = h('div', { class: 'skeleton-list', 'aria-busy': 'true', 'aria-label': 'Loading' });
  for (let i = 0; i < rows; i += 1) {
    list.appendChild(h('div', { class: 'skeleton-row' },
      h('div', { class: 'skeleton skeleton-avatar', style: 'width:20px;height:20px' }),
      h('div', { class: 'grow' },
        h('div', { class: 'skeleton skeleton-text', style: 'width:60%' }),
        h('div', { class: 'skeleton skeleton-text', style: 'width:35%' }))));
  }
  return list;
}

export function skeletonPage(options = {}) {
  const { title = true, rows = 6 } = options;
  return h('div', { class: 'skeleton-page', 'aria-busy': 'true', role: 'status' },
    h('span', { class: 'sr-only' }, 'Loading…'),
    title ? h('div', { class: 'skeleton skeleton-title', style: 'width:38%' }) : null,
    skeletonList(rows));
}

export function loadingRow(text = 'Loading…') {
  return h('div', { class: 'loading-row', role: 'status' },
    h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', {}, text));
}

export function errorBanner(message, options = {}) {
  const { retry = null, code = null } = options;
  return h('div', { class: 'flash flash-danger', role: 'alert' },
    icon('alert', { size: 16 }),
    h('div', { class: 'flash-content' },
      h('div', { class: 'flash-title' }, 'Something went wrong'),
      h('div', {}, message),
      code ? h('div', { class: 'error-code' }, `Code: ${code}`) : null),
    retry ? h('button', { class: 'btn btn-sm', type: 'button', onClick: retry }, icon('sync', { size: 16 }), 'Retry') : null);
}

/* ==========================================================================
   Pagination
   ========================================================================== */

/**
 * `<nav class="pagination" aria-label="Pagination">`
 * @param {object} options { page, pages, total, onPage, hrefFor, perPage }
 */
export function pagination(options = {}) {
  const { page = 1, pages = 1, total = null, onPage = null, hrefFor = null, label = 'Pagination' } = options;
  if (pages <= 1 && total == null) return null;

  const link = (target, text, opts = {}) => {
    const props = {
      class: ['pagination-item', opts.cls || ''].filter(Boolean).join(' '),
      'aria-label': opts.ariaLabel || `Page ${target}`,
      'aria-current': opts.current ? 'page' : undefined,
      'aria-disabled': opts.disabled ? 'true' : undefined,
    };
    if (opts.current) {
      return h('span', { ...props, class: `${props.class} current`.trim() }, text);
    }
    if (opts.disabled) return h('span', { ...props, class: `${props.class} disabled`.trim() }, text);
    const href = hrefFor ? hrefFor(target) : null;
    return h(href ? 'a' : 'button', {
      ...props,
      type: href ? undefined : 'button',
      href: href || undefined,
      rel: opts.rel || undefined,
      onClick: href ? undefined : (event) => { event.preventDefault(); if (onPage) onPage(target); },
    }, text);
  };

  const window = [];
  const span = 2;
  for (let i = Math.max(1, page - span); i <= Math.min(pages, page + span); i += 1) window.push(i);
  if (window[0] > 1) {
    window.unshift(1);
    if (window[1] > 2) window.splice(1, 0, 'gap-before');
  }
  if (window[window.length - 1] < pages) {
    if (window[window.length - 1] < pages - 1) window.push('gap-after');
    window.push(pages);
  }

  const nav = h('nav', { class: 'pagination', 'aria-label': label },
    link(Math.max(1, page - 1), h('span', { class: 'sr-only' }, 'Previous page'), {
      cls: 'pagination-prev', disabled: page <= 1, rel: 'prev', ariaLabel: 'Previous page',
    }),
    ...window.map((entry) => (typeof entry === 'string'
      ? h('span', { class: 'pagination-gap', 'aria-hidden': 'true' }, '…')
      : link(entry, String(entry), { current: entry === page }))),
    link(Math.min(pages, page + 1), h('span', { class: 'sr-only' }, 'Next page'), {
      cls: 'pagination-next', disabled: page >= pages, rel: 'next', ariaLabel: 'Next page',
    }));

  if (total != null) {
    nav.appendChild(h('span', { class: 'pagination-info' },
      `Page ${page} of ${pages} · ${formatNumber(total)} results`));
  }
  return nav;
}

export function paginate(list, page = 1, perPage = LIMITS.pageSize) {
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (current - 1) * perPage;
  return { items: list.slice(start, start + perPage), page: current, pages, total, start };
}

/* ==========================================================================
   Infinite scroll
   ========================================================================== */

/**
 * Append batches as the sentinel scrolls into view. Falls back to a "Load more"
 * button when IntersectionObserver is unavailable.
 */
export function infiniteScroll(options = {}) {
  const { batchSize = LIMITS.infiniteScrollBatch, onLoad, label = 'Load more' } = options;
  let loading = false;
  let done = false;
  const sentinel = h('div', { class: 'infinite-sentinel', 'aria-hidden': 'true' });
  const button = h('button', { class: 'btn btn-block', type: 'button', onClick: () => load() }, label);
  const status = h('div', { class: 'infinite-status', role: 'status', 'aria-live': 'polite' });
  const root = h('div', { class: 'infinite-scroll' }, sentinel, button, status);

  async function load() {
    if (loading || done) return;
    loading = true;
    status.textContent = 'Loading…';
    button.disabled = true;
    try {
      const items = await onLoad(batchSize);
      if (!items || !items.length) {
        done = true;
        status.textContent = 'End of list';
        button.hidden = true;
        sentinel.remove();
      } else {
        status.textContent = `Loaded ${items.length} more`;
      }
    } catch (error) {
      status.textContent = `Could not load more: ${error.message}`;
    } finally {
      loading = false;
      button.disabled = false;
      setTimeout(() => { status.textContent = ''; }, 1600);
    }
  }

  if (typeof IntersectionObserver !== 'undefined') {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) load();
    }, { rootMargin: '320px' });
    observer.observe(sentinel);
    button.hidden = true;
  }
  return root;
}

/* ==========================================================================
   Tabs, filters, chips
   ========================================================================== */

export function stateTabs(tabs, options = {}) {
  const { ariaLabel = 'Filter by state' } = options;
  return h('div', { class: 'state-tabs', role: 'group', 'aria-label': ariaLabel },
    tabs.map((tab) => h('a', {
      class: ['state-tab', tab.active ? 'is-active' : ''].filter(Boolean).join(' '),
      href: tab.href || '#',
      'aria-current': tab.active ? 'true' : undefined,
      onClick: tab.onClick || undefined,
    }, icon(tab.icon || 'dot-fill', { size: 16 }),
    h('span', {}, tab.label),
    tab.count != null ? h('span', { class: 'counter counter-neutral' }, compactNumber(tab.count)) : null)));
}

export function segmented(options = {}) {
  const { items, value, onChange, ariaLabel = 'View options', size = 'sm' } = options;
  const group = h('div', { class: 'segmented', role: 'group', 'aria-label': ariaLabel });
  items.forEach((item) => {
    group.appendChild(h('button', {
      class: size === 'sm' ? '' : 'btn-sm',
      type: 'button',
      'aria-pressed': String(item.value === value),
      title: item.title || item.label,
      onClick: () => { if (onChange) onChange(item.value, item); },
    }, item.icon ? icon(item.icon, { size: 16 }) : null, item.label ? h('span', {}, item.label) : null));
  });
  return group;
}

export function chip(label, options = {}) {
  const { onRemove = null, accent = false, iconName = null } = options;
  const node = h('span', { class: ['chip', accent ? 'chip-accent' : ''].filter(Boolean).join(' ') },
    iconName ? icon(iconName, { size: 12 }) : null,
    h('span', {}, label));
  if (onRemove) {
    node.appendChild(h('button', { type: 'button', 'aria-label': `Remove filter ${label}`, onClick: () => onRemove(label) }, icon('x', { size: 12 })));
  }
  return node;
}

export function chipRow(chips) {
  if (!chips.length) return null;
  return h('div', { class: 'chip-row' }, chips);
}

/**
 * Filter bar with a search input, filter dropdowns and optional right-hand tools.
 * @param {object} options { query, onQuery, filters: [{id,label,icon,items,value,onChange}], right }
 */
export function filterBar(options = {}) {
  const {
    query = '', onQuery = null, placeholder = 'Filter…', filters = [], right = null,
    label = 'Filters', id = 'filter-input',
  } = options;
  const input = h('input', {
    class: 'input grow', type: 'search', id, value: query, placeholder,
    'aria-label': placeholder, spellcheck: 'false', autocomplete: 'off',
    onInput: (event) => { if (onQuery) onQuery(event.currentTarget.value); },
  });
  return h('div', { class: 'filter-bar', role: 'search', 'aria-label': label },
    filters.map((filter) => filterDropdown(filter)),
    h('div', { class: 'grow input-with-icon' }, icon('search', { size: 16 }), input),
    right ? h('div', { class: 'filter-group filter-right' }, right) : null);
}

export function filterDropdown(filter) {
  const { id, label, iconName = 'filter', items = [], value = null, onChange = null, align = 'left' } = filter;
  const menuId = `filter-menu-${id}`;
  const trigger = h('button', {
    class: 'filter-trigger', type: 'button',
    'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': menuId,
  }, icon(iconName, { size: 16 }), h('span', {}, label),
  value ? h('span', { class: 'counter' }, compactNumber(value)) : null,
  icon('chevron-down', { size: 16 }));

  const menu = h('ul', { class: 'dropdown-menu', role: 'menu', id: menuId, hidden: true, dataset: { align, width: 'wide' } });
  items.forEach((item) => {
    if (item.divider) {
      menu.appendChild(h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })));
      return;
    }
    menu.appendChild(h('li', { role: 'none' },
      h('button', {
        class: 'dropdown-item', role: item.checked != null ? 'menuitemcheckbox' : 'menuitem', type: 'button', tabindex: '-1',
        'aria-checked': item.checked != null ? String(Boolean(item.checked)) : undefined,
        onClick: () => { if (onChange) onChange(item.value != null ? item.value : item.id, item); },
      },
      item.icon ? icon(item.icon, { size: 16 }) : null,
      h('span', { class: 'grow text-ellipsis' }, item.label),
      item.count != null ? counter(item.count) : null,
      item.checked != null ? h('span', { class: 'check-mark' }, icon('check', { size: 16 })) : null)));
  });

  const root = h('div', { class: 'filter-dropdown dropdown' }, trigger, menu);
  attachMenu(trigger, menu, { align });
  return root;
}

/* ==========================================================================
   Item rows (issues, pull requests, notifications, releases…)
   ========================================================================== */

export function itemRow(options = {}) {
  const {
    status = null, title = null, titleHref = null, meta = null, labels = [],
    side = null, comments = null, selectable = false, selected = false, onSelect = null,
    dataAttrs = {}, onClick = null, extra = null,
  } = options;
  const row = h('div', {
    class: ['item-row', selected ? 'is-selected' : ''].filter(Boolean).join(' '),
    onClick: onClick || undefined,
    ...dataAttrs,
  });
  if (selectable) {
    row.appendChild(h('span', { class: 'item-row-check' },
      h('input', {
        type: 'checkbox', checked: selected, 'aria-label': `Select ${typeof title === 'string' ? title : 'item'}`,
        onChange: (event) => { if (onSelect) onSelect(event.currentTarget.checked); },
      })));
  }
  if (status) row.appendChild(h('span', { class: 'item-row-status' }, status));
  row.appendChild(h('div', { class: 'item-row-main' },
    h('span', { class: 'item-row-title' },
      titleHref ? h('a', { href: titleHref }, title) : title,
      extra || null),
    labels && labels.length ? h('span', { class: 'item-row-labels' }, labels) : null,
    meta ? h('div', { class: 'item-row-meta' }, meta) : null));
  if (comments != null) {
    row.appendChild(h('span', { class: 'item-row-comments', title: `${comments} comment${comments === 1 ? '' : 's'}` },
      icon('comment', { size: 16, label: `${comments} comments` }),
      comments ? h('span', {}, compactNumber(comments)) : null));
  }
  if (side) row.appendChild(h('div', { class: 'item-row-side' }, side));
  return row;
}

export function itemList(rows, options = {}) {
  const { header = null, cls = '', ariaLabel = 'Items' } = options;
  if (!rows.length) return null;
  return h('div', { class: ['item-list', cls].filter(Boolean).join(' '), role: 'list', 'aria-label': ariaLabel },
    header ? h('div', { class: 'item-list-header' }, header) : null,
    rows.map((row) => h('div', { role: 'listitem' }, row)));
}

/* ==========================================================================
   Avatars / people
   ========================================================================== */

export function assigneeList(logins, options = {}) {
  const { size = 20 } = options;
  if (!logins || !logins.length) return h('span', { class: 'text-muted text-small' }, 'No assignees');
  return h('span', { class: 'assignee-list' },
    logins.map((login) => h('a', { href: `/${login}`, title: login, 'aria-label': `Assigned to ${login}` },
      avatar({ login }, { size }))));
}

export function participantAvatars(logins, options = {}) {
  const { size = 20, max = 6 } = options;
  const shown = (logins || []).slice(0, max);
  const rest = (logins || []).length - shown.length;
  return h('span', { class: 'participant-avatars' },
    shown.map((login) => h('a', { href: `/${login}`, 'aria-label': `Participant ${login}`, title: login }, avatar({ login }, { size }))),
    rest > 0 ? h('span', { class: 'counter', title: `${rest} more participants` }, `+${rest}`) : null);
}

/* ==========================================================================
   Progress, meters, language bars
   ========================================================================== */

export function progressBar(percent, options = {}) {
  const { label = null, variant = '' } = options;
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  return h('div', {
    class: 'progress', role: 'progressbar',
    'aria-valuenow': String(value), 'aria-valuemin': '0', 'aria-valuemax': '100',
    'aria-label': label || 'Progress',
  }, h('span', { class: ['progress-bar', variant ? `progress-bar-${variant}` : ''].filter(Boolean).join(' '), style: `width:${value}%` }));
}

export function languageBar(languages, options = {}) {
  const { showLegend = true, total = null } = options;
  if (!languages || !languages.length) return null;
  const sum = total || languages.reduce((acc, entry) => acc + (entry.percent || 0), 0);
  const bar = h('div', {
    class: 'lang-bar', role: 'img',
    'aria-label': languages.map((l) => `${l.name} ${Math.round((l.percent / sum) * 100)}%`).join(', '),
  }, languages.map((entry) => h('span', {
    style: `width:${((entry.percent / sum) * 100).toFixed(2)}%;background-color:${entry.color || 'var(--accent)'}`,
    title: `${entry.name} ${((entry.percent / sum) * 100).toFixed(1)}%`,
  })));
  if (!showLegend) return bar;
  return h('div', { class: 'lang-wrap' }, bar,
    h('ul', { class: 'lang-legend', role: 'list' },
      languages.map((entry) => h('li', {},
        h('span', { class: 'lang-dot', style: `background-color:${entry.color || 'var(--accent)'}`, 'aria-hidden': 'true' }),
        h('span', { class: 'lang-name' }, entry.name),
        h('span', { class: 'lang-percent' }, `${((entry.percent / sum) * 100).toFixed(1)}%`)))));
}

/* ==========================================================================
   Tables
   ========================================================================== */

/**
 * Accessible table builder.
 * @param {Array<{key,label,cls,sortable,align,render}>} columns
 * @param {Array<object>} rows
 */
export function dataTable(columns, rows, options = {}) {
  const { caption = null, cls = '', onSort = null, sortBy = null, sortDir = 'asc', emptyText = 'No rows' } = options;
  const table = h('table', { class: ['table', cls].filter(Boolean).join(' ') });
  if (caption) table.appendChild(h('caption', { class: caption.srOnly ? 'sr-only' : '' }, caption.text || caption));
  table.appendChild(h('thead', {},
    h('tr', {}, columns.map((column) => h('th', {
      scope: 'col',
      class: [column.cls, column.align ? `text-${column.align}` : ''].filter(Boolean).join(' '),
      'aria-sort': column.sortable && sortBy === column.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined,
    }, column.sortable && onSort
      ? h('button', {
        class: 'th-sort', type: 'button',
        'aria-label': `Sort by ${column.label}`,
        onClick: () => onSort(column.key, sortBy === column.key && sortDir === 'asc' ? 'desc' : 'asc'),
      }, column.label, icon(sortBy === column.key && sortDir === 'desc' ? 'chevron-down' : 'chevron-up', { size: 12 }))
      : column.label)))));
  const body = h('tbody', {});
  if (!rows.length) {
    body.appendChild(h('tr', {}, h('td', { colspan: String(columns.length), class: 'text-muted text-center' }, emptyText)));
  } else {
    rows.forEach((row) => {
      body.appendChild(h('tr', { class: row.__cls || undefined, dataset: row.__data || undefined },
        columns.map((column) => h('td', {
          class: [column.cls, column.align ? `text-${column.align}` : ''].filter(Boolean).join(' '),
        }, column.render ? column.render(row) : row[column.key]))));
    });
  }
  table.appendChild(body);
  return table;
}

/* ==========================================================================
   Misc helpers
   ========================================================================== */

/**
 * <dl class="kv-list"><dt>Term</dt><dd>Value</dd>…</dl>
 * Accepts either [term, value] tuples or { label, value } objects.
 */
export function keyValueList(pairs, options = {}) {
  const { cls = '' } = options;
  const normalized = (pairs || []).filter(Boolean).map((entry) => (Array.isArray(entry)
    ? { label: entry[0], value: entry[1] }
    : entry));
  return h('dl', { class: ['kv-list', cls].filter(Boolean).join(' ') },
    ...normalized.flatMap((pair) => [
      h('dt', {}, pair.label),
      h('dd', {}, pair.value == null ? '—' : pair.value),
    ]));
}

export function copyRow(label, value, options = {}) {
  const { mono = true, cls = '' } = options;
  return h('div', { class: ['copy-row', cls].filter(Boolean).join(' ') },
    h('span', { class: 'copy-row-label' }, label),
    h('code', { class: mono ? 'code-inline' : '' }, value),
    copyButton(() => value, { label: `Copy ${label}`, cls: 'copy-row-btn' }));
}

export function linkList(items, options = {}) {
  const { cls = '' } = options;
  return h('ul', { class: ['link-list', cls].filter(Boolean).join(' '), role: 'list' },
    items.map((item) => h('li', {},
      h('a', { href: item.href, onClick: item.onClick || undefined },
        item.icon ? icon(item.icon, { size: 16 }) : null,
        h('span', { class: 'grow' }, item.label),
        item.trailing || null))));
}

export function tooltip(node, text, placement = 'top') {
  return withTooltip(node, text, placement);
}

export function srOnly(text) {
  return h('span', { class: 'sr-only' }, text);
}

export function anchorHeading(text, id, level = 2) {
  const Heading = `h${level}`;
  return h(Heading, { id },
    h('a', { class: 'anchor', href: `#${id}`, 'aria-label': `Permalink to ${text}` }, icon('link', { size: 16 })),
    text);
}

/** Simple client-side sort helper for tables driven by a column key. */
export function sortRows(rows, key, dir = 'asc') {
  const factor = dir === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (left == null) return 1;
    if (right == null) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    return String(left).localeCompare(String(right)) * factor;
  });
}

export function queryPage(query, fallback = 1) {
  const value = Number(query && query.page ? query.page : fallback);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function findInRoot(root, selector) {
  return qs(selector, root);
}

export function findAllInRoot(root, selector) {
  return qsa(selector, root);
}

export default {
  relativeTimeEl, absoluteTimeEl, startTimeUpdater, refreshRelativeTimes, counter, badge,
  visibilityBadge, stateBadge, labelPill, readableForeground, checkStateIcon, statusDot,
  pageHeader, subnav, card, panel, withSidebar, sidebarSection, emptyState, emptyInline,
  skeleton, skeletonList, skeletonPage, loadingRow, errorBanner, pagination, paginate,
  infiniteScroll, stateTabs, segmented, chip, chipRow, filterBar, filterDropdown, itemRow,
  itemList, assigneeList, participantAvatars, progressBar, languageBar, dataTable,
  keyValueList, copyRow, linkList, tooltip, srOnly, anchorHeading, sortRows, queryPage,
  findInRoot, findAllInRoot,
};
