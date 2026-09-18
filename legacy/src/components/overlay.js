/**
 * RedGet — overlay primitives: dropdown menus, popovers, dialogs, tabs, toasts, tooltips.
 *
 * Every overlay here is built on native, accessible elements:
 *   menu     -> <button aria-haspopup="menu" aria-expanded> + <ul role="menu"> with
 *               <li role="none"> children and roving tabindex
 *   listbox  -> <ul role="listbox"> + <li role="option" aria-selected>
 *   dialog   -> <dialog> + showModal() so we get native focus trapping, ::backdrop
 *               and Esc handling for free
 *   tabs     -> <div role="tablist"> + <button role="tab"> + <div role="tabpanel">
 *   toast    -> container with role="status" aria-live="polite"
 *   tooltip  -> <div role="tooltip"> referenced by aria-describedby
 */

import { h, clear, createFocusTrap, focusFirst, icon } from '../core/dom.js';
import { on, EVENTS } from '../core/bus.js';
import { LIMITS } from '../config.js';
import { t } from '../core/i18n.js';
import { nextId } from '../core/util.js';

/* ==========================================================================
   Dropdown / menu
   ========================================================================== */

const openMenus = new Set();

function closeMenu(entry) {
  if (!entry || entry.closed) return;
  entry.closed = true;
  const { trigger, menu, offDoc, offKey, restoreFocus } = entry;
  if (trigger) {
    trigger.setAttribute('aria-expanded', 'false');
    trigger.dataset.open = 'false';
  }
  if (menu) menu.hidden = true;
  openMenus.delete(entry);
  if (offDoc) offDoc();
  if (offKey) offKey();
  if (restoreFocus && document.activeElement !== trigger && trigger && typeof trigger.focus === 'function') {
    try { trigger.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
}

function closeAllMenus(except) {
  for (const entry of Array.from(openMenus)) {
    if (entry !== except) closeMenu(entry);
  }
}

function menuItems(menu) {
  return Array.from(menu.querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],a[href],button:not([disabled])'))
    .filter((el) => el.offsetParent !== null && !el.hasAttribute('data-no-nav'));
}

function moveFocus(menu, current, delta) {
  const items = menuItems(menu);
  if (items.length === 0) return;
  const idx = items.indexOf(current);
  const next = delta > 0
    ? items[(idx + 1 + items.length) % items.length]
    : items[(idx - 1 + items.length) % items.length];
  items.forEach((el) => el.setAttribute('tabindex', '-1'));
  next.setAttribute('tabindex', '0');
  next.focus();
}

/**
 * Attach menu behaviour to a trigger + menu pair.
 * @param {HTMLElement} trigger button with aria-haspopup
 * @param {HTMLElement} menu <ul role="menu"> or any container with menuitems
 * @param {object} options { openOnHover, onOpen, onClose, align }
 */
export function attachMenu(trigger, menu, options = {}) {
  if (!trigger || !menu) return null;
  const entry = { trigger, menu, closed: true };
  menu.hidden = true;
  menu.id = menu.id || nextId('menu');
  trigger.setAttribute('aria-controls', menu.id);
  trigger.setAttribute('aria-expanded', 'false');
  if (!trigger.hasAttribute('aria-haspopup')) trigger.setAttribute('aria-haspopup', 'menu');

  const offDoc = (handler) => { document.addEventListener('click', handler); return () => document.removeEventListener('click', handler); };

  function onDocumentClick(event) {
    if (menu.contains(event.target) || trigger.contains(event.target)) return;
    closeMenu(entry);
  }

  function onKeydown(event) {
    const key = event.key;
    if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeMenu(entry); return; }
    if (!menu.contains(document.activeElement) && document.activeElement !== trigger) return;
    const items = menuItems(menu);
    if (key === 'ArrowDown') {
      event.preventDefault();
      if (menu.hidden) open();
      else moveFocus(menu, document.activeElement, 1);
    } else if (key === 'ArrowUp') {
      event.preventDefault();
      if (menu.hidden) open();
      else moveFocus(menu, document.activeElement, -1);
    } else if (key === 'Home' && !menu.hidden) {
      event.preventDefault();
      if (items[0]) { items.forEach((el) => el.setAttribute('tabindex', '-1')); items[0].setAttribute('tabindex', '0'); items[0].focus(); }
    } else if (key === 'End' && !menu.hidden) {
      event.preventDefault();
      const last = items[items.length - 1];
      if (last) { items.forEach((el) => el.setAttribute('tabindex', '-1')); last.setAttribute('tabindex', '0'); last.focus(); }
    } else if (key === 'Tab' && !menu.hidden) {
      closeMenu(entry);
    } else if (/^[a-zA-Z]$/.test(key) && !menu.hidden) {
      const match = items.find((el) => (el.textContent || '').trim().toLowerCase().startsWith(key.toLowerCase()));
      if (match) { items.forEach((el) => el.setAttribute('tabindex', '-1')); match.setAttribute('tabindex', '0'); match.focus(); }
    }
  }

  function open() {
    if (!entry.closed) return;
    closeAllMenus(entry);
    entry.closed = false;
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    trigger.dataset.open = 'true';
    openMenus.add(entry);
    entry.offDoc = offDoc(onDocumentClick);
    entry.offKey = () => document.removeEventListener('keydown', onKeydown, true);
    document.addEventListener('keydown', onKeydown, true);
    const items = menuItems(menu);
    items.forEach((el, index) => el.setAttribute('tabindex', index === 0 ? '0' : '-1'));
    if (typeof options.onOpen === 'function') options.onOpen(menu);
    if (options.focusFirst !== false) {
      const target = menu.querySelector('[data-autofocus]') || items[0];
      if (target) { try { target.focus({ preventScroll: true }); } catch { /* ignore */ } }
    }
  }

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (entry.closed) open();
    else closeMenu(entry);
  });

  if (options.openOnHover) {
    let hoverTimer = null;
    trigger.addEventListener('mouseenter', () => {
      hoverTimer = setTimeout(() => { if (entry.closed) open(); }, 120);
    });
    trigger.addEventListener('mouseleave', () => { if (hoverTimer) clearTimeout(hoverTimer); });
  }

  menu.addEventListener('click', (event) => {
    const item = event.target instanceof Element ? event.target.closest('[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],a,button') : null;
    if (!item || item.hasAttribute('data-keep-open')) return;
    if (item.hasAttribute('data-no-close')) return;
    closeMenu(entry);
  });

  entry.open = open;
  entry.close = () => closeMenu(entry);
  entry.isOpen = () => !entry.closed;
  return entry;
}

/**
 * Build a dropdown: returns { root, trigger, menu, api }.
 * items: [{ label, icon, href, onClick, checked, disabled, desc, divider, group, shortcut }]
 */
export function dropdown(options = {}) {
  const {
    label, items = [], triggerClass = 'btn', icon: iconName = null, ariaLabel = null,
    align = 'right', width = null, header = null, footer = null, variant = 'menu',
    onSelect = null, count = null, title = null,
  } = options;

  const menuId = nextId('dropdown-menu');
  const menu = h('ul', {
    class: 'dropdown-menu',
    role: variant === 'listbox' ? 'listbox' : 'menu',
    id: menuId,
    'aria-label': ariaLabel || label || t('a11y.menu'),
    dataset: { align, width: width || '' },
    hidden: true,
  });

  if (header) menu.appendChild(typeof header === 'string' ? h('li', { role: 'none', class: 'dropdown-header' }, header) : header);

  let currentGroup = null;
  for (const item of items) {
    if (item.divider) {
      menu.appendChild(h('li', { role: 'none' }, h('hr', { class: 'dropdown-divider', role: 'separator' })));
      currentGroup = null;
      continue;
    }
    if (item.group && item.group !== currentGroup) {
      currentGroup = item.group;
      menu.appendChild(h('li', { role: 'none', class: 'dropdown-label' }, item.group));
    }
    const tag = item.href ? 'a' : 'button';
    const props = {
      class: 'dropdown-item',
      role: variant === 'listbox' ? 'option' : (item.checked != null ? 'menuitemcheckbox' : 'menuitem'),
      type: item.href ? undefined : 'button',
      href: item.href || undefined,
      tabindex: '-1',
      dataset: item.value != null ? { value: String(item.value) } : undefined,
      disabled: item.disabled ? true : undefined,
      'aria-disabled': item.disabled ? 'true' : undefined,
      'aria-checked': item.checked != null ? String(Boolean(item.checked)) : undefined,
      'aria-selected': variant === 'listbox' && item.checked ? 'true' : undefined,
      onClick: (event) => {
        if (item.disabled) { event.preventDefault(); return; }
        if (typeof item.onClick === 'function') item.onClick(event, item);
        if (typeof onSelect === 'function') onSelect(item, event);
      },
    };
    const children = [];
    if (item.icon) children.push(icon(item.icon, { size: 16 }));
    if (item.desc) {
      children.push(h('span', { class: 'dropdown-item-wrap' },
        h('span', {}, item.label),
        h('span', { class: 'dropdown-item-desc' }, item.desc)));
    } else {
      children.push(h('span', { class: 'grow text-ellipsis' }, item.label));
    }
    if (item.count != null) children.push(h('span', { class: 'counter' }, String(item.count)));
    if (item.shortcut) children.push(h('kbd', {}, item.shortcut));
    if (item.trailing) children.push(item.trailing);
    if (item.checked != null) children.push(h('span', { class: 'check-mark' }, icon('check', { size: 16 })));

    menu.appendChild(h('li', { role: 'none' }, h(tag, props, children)));
  }

  if (footer) menu.appendChild(typeof footer === 'string' ? h('li', { role: 'none', class: 'dropdown-footer' }, footer) : footer);

  const triggerChildren = [];
  if (iconName) triggerChildren.push(icon(iconName, { size: 16 }));
  if (label) triggerChildren.push(h('span', {}, label));
  if (count != null) triggerChildren.push(h('span', { class: 'counter' }, String(count)));
  if (options.showCaret !== false && label) triggerChildren.push(icon('chevron-down', { size: 16 }));

  const trigger = h('button', {
    class: triggerClass,
    type: 'button',
    title: title || label || undefined,
    'aria-label': ariaLabel || (label ? undefined : title),
    'aria-haspopup': variant === 'listbox' ? 'listbox' : 'menu',
    'aria-expanded': 'false',
    'aria-controls': menuId,
  }, triggerChildren);

  const root = h('div', { class: 'dropdown' }, trigger, menu);
  const api = attachMenu(trigger, menu, options);
  return { root, trigger, menu, api };
}

/** Convenience: a details/summary disclosure (used for file trees, diff sections). */
export function disclosure(summaryContent, bodyContent, options = {}) {
  const { open = false, cls = '', onToggle = null } = options;
  const details = h('details', { class: cls, open: open || undefined },
    h('summary', {}, summaryContent),
    bodyContent);
  if (typeof onToggle === 'function') details.addEventListener('toggle', () => onToggle(details.open, details));
  return details;
}

/* ==========================================================================
   Dialogs / modals
   ========================================================================== */

const dialogStack = [];

export function supportsDialog() {
  return typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function';
}

/**
 * Open a modal dialog.
 * @param {object} options { title, body, footer, size, onClose, onConfirm, confirmLabel, cancelLabel, hideFooter }
 */
export function openDialog(options = {}) {
  const {
    title = '', body = null, footer = null, size = 'md', onClose = null,
    confirmLabel = null, cancelLabel = t('common.cancel'), danger = false,
    onConfirm = null, hideFooter = false, labelledBy = null,
  } = options;

  const dialog = h('dialog', { class: 'dialog', dataset: { size }, role: 'dialog', 'aria-modal': 'true' });
  const titleId = nextId('dialog-title');

  const closeButton = h('button', {
    class: 'dialog-close', type: 'button',
    'aria-label': t('common.close'),
    onClick: () => close(),
  }, icon('x', { size: 16 }));

  const headerEl = title || !labelledBy
    ? h('div', { class: 'dialog-header' },
      h('h2', { class: 'dialog-title', id: titleId }, title),
      closeButton)
    : null;

  const bodyEl = h('div', { class: 'dialog-body' }, body);

  let footerEl = null;
  if (!hideFooter) {
    const buttons = [];
    if (footer) buttons.push(footer);
    else {
      if (cancelLabel) buttons.push(h('button', { class: 'btn', type: 'button', 'data-close': 'true', onClick: () => close() }, cancelLabel));
      if (confirmLabel) {
        buttons.push(h('button', {
          class: ['btn', danger ? 'btn-danger' : 'btn-primary'].join(' '),
          type: 'button',
          onClick: (event) => {
            const result = typeof onConfirm === 'function' ? onConfirm({ dialog, close, event, body: bodyEl }) : true;
            if (result !== false) close();
          },
        }, confirmLabel));
      }
    }
    footerEl = h('div', { class: 'dialog-footer' }, buttons);
  }

  if (labelledBy) dialog.setAttribute('aria-labelledby', labelledBy);
  else if (title) dialog.setAttribute('aria-labelledby', titleId);

  dialog.append(headerEl, bodyEl, footerEl);

  function close(returnValue) {
    const idx = dialogStack.indexOf(dialog);
    if (idx >= 0) dialogStack.splice(idx, 1);
    try {
      if (dialog.open) dialog.close(returnValue || 'closed');
    } catch { dialog.remove(); }
    if (typeof onClose === 'function') onClose(returnValue);
  }

  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close('cancelled');
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close('backdrop');
    const closer = event.target instanceof Element ? event.target.closest('[data-close]') : null;
    if (closer) close('closed');
  });

  const previousFocus = document.activeElement;
  if (supportsDialog()) {
    document.body.appendChild(dialog);
    try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
  } else {
    // Fallback for environments without <dialog>: manual overlay + focus trap.
    dialog.setAttribute('open', '');
    dialog.style.position = 'fixed';
    document.body.appendChild(dialog);
  }
  dialogStack.push(dialog);

  requestAnimationFrame(() => {
    const auto = dialog.querySelector('[data-autofocus]');
    if (auto) { try { auto.focus(); } catch { /* ignore */ } } else focusFirst(dialog);
  });

  if (!supportsDialog()) createFocusTrap(dialog);

  dialog.addEventListener('close', () => {
    setTimeout(() => { if (dialog.parentNode) dialog.parentNode.removeChild(dialog); }, 60);
    if (previousFocus && typeof previousFocus.focus === 'function') {
      try { previousFocus.focus({ preventScroll: true }); } catch { /* ignore */ }
    }
  });

  return { dialog, close, body: bodyEl };
}

/** Simple confirm dialog returning a Promise<boolean>. */
export function confirmDialog(options = {}) {
  const {
    title = t('common.confirm'), message = '', confirmLabel = t('common.confirm'),
    cancelLabel = t('common.cancel'), danger = false, requireText = null,
    body = null, onClose = null, size = 'sm',
  } = options;
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value) => { if (!settled) { settled = true; resolve(value); } };
    const input = requireText
      ? h('input', { type: 'text', class: 'mt-3', 'data-autofocus': 'true', placeholder: requireText, 'aria-label': requireText })
      : null;
    const handle = openDialog({
      title,
      size,
      danger,
      confirmLabel,
      cancelLabel,
      body: body || h('div', {}, message ? h('p', { class: 'm-0' }, message) : null, input),
      onConfirm: () => {
        if (requireText && (!input || input.value.trim() !== requireText)) return false;
        settle(true);
        return true;
      },
      onClose: (value) => {
        if (typeof onClose === 'function') onClose(value);
        settle(false);
      },
    });
    // Any dismissal path (cancel button, Esc, backdrop) resolves false exactly once.
    handle.dialog.addEventListener('close', () => settle(false));
  });
}

export function closeTopDialog() {
  const top = dialogStack[dialogStack.length - 1];
  if (!top) return false;
  try { top.close('escape'); } catch { top.remove(); }
  dialogStack.pop();
  return true;
}

export function isDialogOpen() {
  return dialogStack.length > 0;
}

/** Alert-style dialog (non-blocking). */
export function alertDialog(options = {}) {
  const { title = '', message = '', variant = 'info' } = options;
  const iconName = variant === 'danger' ? 'alert' : variant === 'success' ? 'check-circle' : 'info';
  return openDialog({
    title,
    size: 'sm',
    hideFooter: true,
    body: h('div', { class: `flash flash-${variant}` },
      icon(iconName, { size: 16 }),
      h('div', { class: 'flash-content' }, message)),
  });
}

/* ==========================================================================
   Tabs
   ========================================================================== */

/**
 * Build a tablist. Panels are rendered lazily via render(tabId).
 * @param {Array<{id,label,icon,count,panel}>} tabs
 */
export function tablist(tabs, options = {}) {
  const { onChange = null, cls = 'tabs', activeId = null, lazy = true, ariaLabel = t('a11y.tabs') } = options;
  const listId = nextId('tablist');
  const panels = new Map();
  const buttons = new Map();
  let activeTabId = activeId || (tabs[0] && tabs[0].id) || null;

  const container = h('div', { class: 'tabs-container' });
  const nav = h('div', { class: cls, role: 'tablist', 'aria-label': ariaLabel, id: listId });

  function renderPanel(tab) {
    let panel = panels.get(tab.id);
    if (!panel) {
      panel = h('div', {
        class: 'tabpanel', role: 'tabpanel', id: `${listId}-panel-${tab.id}`,
        'aria-labelledby': `${listId}-tab-${tab.id}`, tabindex: '0', hidden: true,
      });
      panels.set(tab.id, panel);
      container.appendChild(panel);
    }
    if (lazy && !panel.dataset.rendered) {
      panel.dataset.rendered = 'true';
      const content = typeof tab.panel === 'function' ? tab.panel(panel) : tab.panel;
      clear(panel);
      if (content) panel.appendChild(content.nodeType ? content : document.createTextNode(String(content)));
    }
    return panel;
  }

  function activate(tabId, focus = false) {
    activeTabId = tabId;
    for (const tab of tabs) {
      const button = buttons.get(tab.id);
      const panel = panels.get(tab.id);
      const isActive = tab.id === tabId;
      if (button) {
        button.setAttribute('aria-selected', String(isActive));
        button.setAttribute('tabindex', isActive ? '0' : '-1');
        if (focus && isActive) button.focus();
      }
      if (isActive) {
        const rendered = renderPanel(tab);
        rendered.hidden = false;
      } else if (panel) {
        panel.hidden = true;
      }
    }
    if (typeof onChange === 'function') onChange(tabId);
  }

  tabs.forEach((tab, index) => {
    const button = h('button', {
      class: 'tab', type: 'button', role: 'tab',
      id: `${listId}-tab-${tab.id}`,
      'aria-selected': 'false',
      'aria-controls': `${listId}-panel-${tab.id}`,
      tabindex: '-1',
      dataset: { tabId: tab.id },
      onClick: () => activate(tab.id),
      onKeydown: (event) => {
        const ids = tabs.map((x) => x.id);
        const current = ids.indexOf(activeTabId);
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault(); activate(ids[(current + 1) % ids.length], true);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault(); activate(ids[(current - 1 + ids.length) % ids.length], true);
        } else if (event.key === 'Home') {
          event.preventDefault(); activate(ids[0], true);
        } else if (event.key === 'End') {
          event.preventDefault(); activate(ids[ids.length - 1], true);
        }
      },
    },
    tab.icon ? icon(tab.icon, { size: 16 }) : null,
    tab.label,
    tab.count != null ? h('span', { class: 'counter' }, String(tab.count)) : null);
    buttons.set(tab.id, button);
    nav.appendChild(button);
    if (!lazy || index === 0 || tab.id === activeTabId) renderPanel(tab);
  });

  container.prepend(nav);
  activate(activeTabId);

  return { root: container, nav, activate, getActive: () => activeTabId, panels };
}

/* ==========================================================================
   Popover (used for watch/star/reaction pickers with custom content)
   ========================================================================== */

export function popover(anchor, contentFactory, options = {}) {
  const { placement = 'bottom-end', width = 320, onOpen = null, onClose = null } = options;
  const id = nextId('popover');
  const pop = h('div', {
    class: 'dropdown-menu', id, role: 'dialog', 'aria-modal': 'false',
    style: { width: `${width}px`, maxWidth: '92vw' }, hidden: true,
  });
  const entry = { closed: true };

  function position() {
    const rect = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 6;
    let left = placement.endsWith('start') ? rect.left + window.scrollX : rect.right + window.scrollX - popRect.width;
    const maxLeft = window.scrollX + document.documentElement.clientWidth - popRect.width - 8;
    left = Math.max(window.scrollX + 8, Math.min(left, maxLeft));
    if (rect.bottom + popRect.height > window.innerHeight - 8) {
      top = rect.top + window.scrollY - popRect.height - 6;
    }
    pop.style.position = 'absolute';
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
    pop.style.right = 'auto';
  }

  function open() {
    if (!entry.closed) return;
    entry.closed = false;
    clear(pop);
    const content = typeof contentFactory === 'function' ? contentFactory({ close, pop }) : contentFactory;
    pop.appendChild(content.nodeType ? content : document.createTextNode(String(content)));
    document.body.appendChild(pop);
    pop.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(position);
    if (typeof onOpen === 'function') onOpen(pop);
    document.addEventListener('click', onDocClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, { passive: true });
  }

  function close() {
    if (entry.closed) return;
    entry.closed = true;
    pop.hidden = true;
    anchor.setAttribute('aria-expanded', 'false');
    if (pop.parentNode) pop.parentNode.removeChild(pop);
    document.removeEventListener('click', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', position);
    window.removeEventListener('scroll', position);
    if (typeof onClose === 'function') onClose();
  }

  function onDocClick(event) {
    if (pop.contains(event.target) || anchor.contains(event.target)) return;
    close();
  }
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); anchor.focus(); }
  }

  anchor.setAttribute('aria-haspopup', 'dialog');
  anchor.setAttribute('aria-expanded', 'false');
  anchor.setAttribute('aria-controls', id);
  anchor.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (entry.closed) open(); else close();
  });

  return { open, close, toggle: () => (entry.closed ? open() : close()), element: pop };
}

/* ==========================================================================
   Tooltips — <div role="tooltip"> wired via aria-describedby
   ========================================================================== */

let tooltipEl = null;
let tooltipTimer = null;
let tooltipOwner = null;

function ensureTooltipEl() {
  if (tooltipEl && tooltipEl.isConnected) return tooltipEl;
  tooltipEl = h('div', { class: 'tooltip', role: 'tooltip', id: nextId('tooltip'), 'data-visible': 'false' });
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function showTooltip(target) {
  const text = target.getAttribute('data-tooltip') || target.getAttribute('aria-label') || target.getAttribute('title');
  if (!text) return;
  const el = ensureTooltipEl();
  const placement = target.getAttribute('data-tooltip-placement') || 'top';
  clear(el);
  el.textContent = text;
  el.dataset.placement = placement;
  el.dataset.visible = 'true';
  tooltipOwner = target;
  target.setAttribute('aria-describedby', el.id);
  // Keep inside the viewport.
  requestAnimationFrame(() => {
    const rect = target.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    let left = rect.left + window.scrollX + rect.width / 2 - elRect.width / 2;
    left = Math.max(window.scrollX + 8, Math.min(left, window.scrollX + document.documentElement.clientWidth - elRect.width - 8));
    if (placement === 'top' || placement === 'bottom') {
      el.style.left = `${left}px`;
      el.style.marginLeft = '0';
      if (placement === 'top') el.style.top = `${rect.top + window.scrollY - elRect.height - 6}px`;
      else el.style.top = `${rect.bottom + window.scrollY + 6}px`;
      el.style.bottom = 'auto';
    }
  });
}

function hideTooltip() {
  if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
  if (tooltipEl) {
    tooltipEl.dataset.visible = 'false';
    if (tooltipOwner) tooltipOwner.removeAttribute('aria-describedby');
  }
  tooltipOwner = null;
}

let tooltipBound = false;
export function initTooltips(root = document) {
  if (tooltipBound && root === document) return;
  tooltipBound = true;
  const selector = '[data-tooltip],[aria-label][data-tooltip-auto]';
  root.addEventListener('pointerover', (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!target || target === tooltipOwner) return;
    if (target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') return;
    hideTooltip();
    tooltipTimer = setTimeout(() => showTooltip(target), 420);
  });
  root.addEventListener('pointerout', (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target) hideTooltip();
  });
  root.addEventListener('focusin', (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target) showTooltip(target);
  });
  root.addEventListener('focusout', hideTooltip);
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') hideTooltip(); });
}

/** Wrap a node with tooltip semantics. */
export function withTooltip(node, text, placement = 'top') {
  if (!node || !text) return node;
  node.setAttribute('data-tooltip', text);
  node.setAttribute('data-tooltip-placement', placement);
  if (!node.hasAttribute('aria-label') && node.tagName !== 'A' && node.tagName !== 'BUTTON') {
    node.setAttribute('aria-label', text);
  }
  return node;
}

/* ==========================================================================
   Toasts — <div role="status" aria-live="polite">
   ========================================================================== */

let toastStack = null;

function ensureToastStack() {
  if (toastStack && toastStack.isConnected) return toastStack;
  toastStack = h('div', {
    class: 'toast-stack', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'false',
  });
  document.body.appendChild(toastStack);
  return toastStack;
}

const VARIANTS = {
  success: 'check-circle',
  danger: 'alert',
  error: 'alert',
  attention: 'alert',
  warning: 'alert',
  info: 'info',
};

/**
 * Show a toast.
 * toast({ title, message, variant, duration, action: { label, onClick } })
 */
export function toast(options = {}) {
  const {
    title = '', message = '', variant = 'info', duration = LIMITS.toastMs,
    action = null, id = null,
  } = typeof options === 'string' ? { message: options } : options;

  const stack = ensureToastStack();
  if (id) {
    const existing = stack.querySelector(`[data-toast-id="${id}"]`);
    if (existing) existing.remove();
  }
  while (stack.children.length >= LIMITS.maxToastVisible) stack.removeChild(stack.firstChild);

  const el = h('div', { class: 'toast', dataset: { variant, toastId: id || '' } },
    icon(VARIANTS[variant] || 'info', { size: 16, cls: 'toast-icon' }),
    h('div', { class: 'toast-content' },
      title ? h('span', { class: 'toast-title' }, title) : null,
      message ? h('div', { class: 'toast-message' }, message) : null,
      action ? h('div', { class: 'toast-actions' },
        h('button', { class: 'btn-link', type: 'button', onClick: () => { action.onClick && action.onClick(); dismiss(); } }, action.label)) : null),
    h('button', { class: 'toast-close', type: 'button', 'aria-label': t('common.dismiss'), onClick: () => dismiss() }, icon('x', { size: 16 })));

  let timer = null;
  function dismiss() {
    if (timer) clearTimeout(timer);
    el.dataset.leaving = 'true';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 180);
  }
  if (duration > 0) timer = setTimeout(dismiss, duration);
  el.addEventListener('mouseenter', () => { if (timer) clearTimeout(timer); });
  el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1600); });

  stack.appendChild(el);
  return { el, dismiss };
}

export function toastSuccess(message, title) { return toast({ title, message, variant: 'success' }); }
export function toastError(message, title) { return toast({ title: title || 'Something went wrong', message, variant: 'danger', duration: 7000 }); }
export function toastInfo(message, title) { return toast({ title, message, variant: 'info' }); }

// Allow any module to raise a toast through the bus.
on(EVENTS.toast, (payload) => toast(payload || {}));

/* ==========================================================================
   Loading bar + async helpers
   ========================================================================== */

let loadingBar = null;
export function startLoading() {
  if (!loadingBar) {
    loadingBar = h('div', {
      class: 'loading-bar', role: 'progressbar', 'aria-label': t('a11y.loading'),
      'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0',
      style: {
        position: 'fixed', top: '0', left: '0', height: '2px', width: '0%',
        background: 'linear-gradient(90deg, var(--accent), var(--accent-emphasis))',
        zIndex: 'var(--z-toast)', transition: 'width 240ms var(--ease-out)', pointerEvents: 'none',
      },
    });
    document.body.appendChild(loadingBar);
  }
  loadingBar.style.opacity = '1';
  loadingBar.style.width = '12%';
  loadingBar.setAttribute('aria-valuenow', '12');
  requestAnimationFrame(() => { loadingBar.style.width = '72%'; loadingBar.setAttribute('aria-valuenow', '72'); });
}

export function stopLoading() {
  if (!loadingBar) return;
  loadingBar.style.width = '100%';
  loadingBar.setAttribute('aria-valuenow', '100');
  setTimeout(() => {
    if (!loadingBar) return;
    loadingBar.style.opacity = '0';
    setTimeout(() => { if (loadingBar) loadingBar.style.width = '0%'; }, 220);
  }, 160);
}

/** Wrap a promise so the global loading bar reflects it. */
export async function withLoading(promise) {
  startLoading();
  try { return await promise; } finally { stopLoading(); }
}

/* ==========================================================================
   Clipboard + copy buttons
   ========================================================================== */

export async function copyText(text, options = {}) {
  const { silent = false, successMessage = t('common.copied') } = options;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const area = h('textarea', {
        value: text, style: { position: 'fixed', top: '-1000px', opacity: '0' }, 'aria-hidden': 'true',
      });
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (!ok) throw new Error('execCommand copy failed');
    }
    if (!silent) toastSuccess(successMessage);
    return true;
  } catch (error) {
    console.warn('[RedGet] copy failed', error);
    if (!silent) toastError('Clipboard access was blocked by the browser.', 'Copy failed');
    return false;
  }
}

export function copyButton(getText, options = {}) {
  const { label = null, iconName = 'copy', cls = 'btn btn-sm btn-invisible', tooltipText = t('common.copy') } = options;
  const button = h('button', {
    class: cls, type: 'button', 'data-tooltip': tooltipText,
    'aria-label': tooltipText,
    onClick: async () => {
      const text = typeof getText === 'function' ? getText() : getText;
      const ok = await copyText(text);
      if (!ok) return;
      // Keep the original nodes instead of round-tripping innerHTML, which would
      // lose the SVG namespace on the icon.
      const original = Array.from(button.childNodes);
      button.replaceChildren(icon('check', { size: 16 }), label ? h('span', {}, t('common.copied')) : null);
      button.setAttribute('aria-label', t('common.copied'));
      setTimeout(() => {
        button.replaceChildren(...original);
        button.setAttribute('aria-label', tooltipText);
      }, 1400);
    },
  }, icon(iconName, { size: 16 }), label ? h('span', {}, label) : null);
  return button;
}

/* ==========================================================================
   Small shared widgets
   ========================================================================== */

/** Keyboard-navigable listbox used by filters, branch selectors, go-to-file. */
export function listbox(items, options = {}) {
  const { onSelect = null, renderItem = null, ariaLabel = t('a11y.listbox'), id = null } = options;
  const listId = id || nextId('listbox');
  const list = h('ul', { class: 'list-unstyled', role: 'listbox', id: listId, 'aria-label': ariaLabel });

  function setItems(nextItems) {
    clear(list);
    nextItems.forEach((item, index) => {
      const content = renderItem ? renderItem(item, index) : item.label;
      const option = h('li', {
        role: 'option', id: `${listId}-opt-${index}`, 'aria-selected': item.selected ? 'true' : 'false',
        tabindex: index === 0 ? '0' : '-1', dataset: { index: String(index) },
        class: item.class || '',
      }, content);
      option.addEventListener('click', () => { if (onSelect) onSelect(item, index); });
      list.appendChild(option);
    });
  }

  list.addEventListener('keydown', (event) => {
    const options_ = Array.from(list.querySelectorAll('[role="option"]'));
    const current = options_.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = options_[Math.min(options_.length - 1, current + 1)] || options_[0];
      if (next) next.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const prev = options_[Math.max(0, current - 1)] || options_[0];
      if (prev) prev.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      const item = items[current];
      if (item && onSelect) onSelect(item, current);
    }
  });

  setItems(items);
  return { root: list, setItems: (next) => { items = next; setItems(next); }, list };
}

/** Accessible disclosure section used in settings pages. */
export function settingsSection(title, description, control, options = {}) {
  const { id = null } = options;
  return h('div', { class: 'settings-row', id: id || undefined },
    h('div', { class: 'settings-row-label' },
      h('h3', {}, title),
      description ? h('p', {}, description) : null),
    h('div', { class: 'settings-row-control' }, control));
}

/** Generic "copy to clipboard" input row. */
export function copyableRow(value, options = {}) {
  const { label = null, mono = true } = options;
  return h('div', { class: 'clone-row' },
    label ? h('span', { class: 'text-small text-muted nowrap' }, label) : null,
    h('code', { class: mono ? 'clone-url' : 'grow' }, value),
    copyButton(() => value));
}

export function closeAllOverlays() {
  closeAllMenus();
  hideTooltip();
}

export default {
  attachMenu, dropdown, disclosure, openDialog, confirmDialog, alertDialog,
  closeTopDialog, isDialogOpen, tablist, popover, initTooltips, withTooltip,
  toast, toastSuccess, toastError, toastInfo, startLoading, stopLoading, withLoading,
  copyText, copyButton, listbox, settingsSection, copyableRow, closeAllOverlays, supportsDialog,
};
