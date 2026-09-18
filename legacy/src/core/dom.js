/**
 * RedGet — DOM helpers.
 *
 * Everything in the UI is built with `h()` (hyperscript) instead of innerHTML strings.
 * That guarantees no HTML injection from mock/user data and keeps tag nesting valid by
 * construction, which is what the validator in /tools checks for.
 *
 *   h('div', { class: 'card', 'data-id': 3, onClick: fn, ref: myRef }, title, body)
 *
 * Supported prop forms:
 *   class / className / classes : string | array | object map
 *   style                       : object (camelCase or kebab keys) | string
 *   dataset                     : object -> data-* attributes
 *   aria                        : object -> aria-* attributes
 *   on<Event>                   : addEventListener
 *   ref                         : (node) => void | { current: node }
 *   html                        : trusted pre-sanitized markup (escaped by default)
 *   value/checked/disabled/...  : set as DOM property when applicable
 *   everything else             : setAttribute
 */

export const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set([
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon',
  'text', 'tspan', 'defs', 'symbol', 'use', 'clipPath', 'mask', 'linearGradient',
  'radialGradient', 'stop', 'title', 'desc', 'marker', 'pattern', 'foreignObject',
  'image', 'animate', 'animateTransform', 'set', 'filter', 'feGaussianBlur',
  'feOffset', 'feMerge', 'feMergeNode', 'feBlend', 'feColorMatrix',
]);

const BOOLEAN_PROPS = new Set([
  'value', 'checked', 'selected', 'disabled', 'readOnly', 'multiple', 'open',
  'hidden', 'defaultChecked', 'defaultValue', 'indeterminate', 'autofocus',
]);

export function isNode(value) {
  return value instanceof Node;
}

export function normalizeClass(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return value.map(normalizeClass).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, on]) => Boolean(on))
      .map(([name]) => name)
      .join(' ');
  }
  return '';
}

function applyStyle(node, style) {
  if (!style) return;
  if (typeof style === 'string') {
    node.setAttribute('style', style);
    return;
  }
  for (const [key, value] of Object.entries(style)) {
    if (value == null || value === '') continue;
    if (key.startsWith('--')) node.style.setProperty(key, String(value));
    else node.style[key] = typeof value === 'number' && !/^(zIndex|opacity|fontWeight|lineHeight|order|flex|flexGrow|flexShrink|animationIterationCount|gridRow|gridColumn|scale)/i.test(key) ? `${value}px` : String(value);
  }
}

function setProp(node, key, value) {
  if (value == null || value === false) {
    if (value === false && BOOLEAN_PROPS.has(key)) node[key] = false;
    else if (value == null) node.removeAttribute(key.toLowerCase());
    return;
  }
  if (key === 'class' || key === 'className' || key === 'classes') {
    const cls = normalizeClass(value);
    if (cls) node.setAttribute('class', cls);
    return;
  }
  if (key === 'style') { applyStyle(node, value); return; }
  if (key === 'dataset') {
    for (const [dk, dv] of Object.entries(value || {})) {
      if (dv != null) node.dataset[dk] = String(dv);
    }
    return;
  }
  if (key === 'aria') {
    for (const [ak, av] of Object.entries(value || {})) {
      if (av != null && av !== false) node.setAttribute(`aria-${ak}`, String(av));
    }
    return;
  }
  if (key === 'attrs' || key === 'attributes') {
    for (const [ak, av] of Object.entries(value || {})) {
      if (av != null && av !== false) node.setAttribute(ak, String(av));
    }
    return;
  }
  if (key === 'html') { node.innerHTML = String(value); return; }
  if (key === 'text') { node.textContent = String(value); return; }
  if (key === 'ref') {
    if (typeof value === 'function') value(node);
    else if (value && typeof value === 'object') value.current = node;
    return;
  }
  if (key.startsWith('on') && typeof value === 'function') {
    const type = key.slice(2).toLowerCase();
    const passive = ['scroll', 'wheel', 'touchstart', 'touchmove'].includes(type);
    node.addEventListener(type, value, passive ? { passive: true } : undefined);
    return;
  }
  if (key === 'for') { node.setAttribute('for', String(value)); return; }
  if (BOOLEAN_PROPS.has(key)) { node[key] = value === true ? true : value; return; }
  if (key in node && typeof node[key] !== 'function' && key !== 'list' && key !== 'form') {
    try { node[key] = value; return; } catch { /* fall through to attribute */ }
  }
  node.setAttribute(key, value === true ? '' : String(value));
}

/** Create an element (SVG aware) with props + children. */
export function h(tag, props, ...children) {
  let realTag = tag;
  let realProps = props;
  if (props == null || typeof props !== 'object' || isNode(props) || Array.isArray(props)) {
    children.unshift(props);
    realProps = {};
  }
  if (typeof realTag === 'function') {
    // Component function: h(MyComponent, props, ...children)
    return realTag({ ...(realProps || {}), children: children.flat(Infinity) });
  }
  if (isNode(realTag)) return realTag;

  const isSvg = SVG_TAGS.has(realTag) || (realProps && realProps.xmlns === SVG_NS);
  const node = isSvg ? document.createElementNS(SVG_NS, realTag) : document.createElement(realTag);

  for (const [key, value] of Object.entries(realProps || {})) setProp(node, key, value);
  append(node, children);
  return node;
}

/** Append text, nodes, arrays, or falsy-skipped values. */
export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false || child === true) continue;
    if (Array.isArray(child)) { append(parent, child); continue; }
    if (isNode(child)) { parent.appendChild(child); continue; }
    if (child instanceof DocumentFragment) { parent.appendChild(child); continue; }
    parent.appendChild(document.createTextNode(String(child)));
  }
  return parent;
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

/** Convenience: <svg class="icon"><use href="#icon-name"/></svg> */
export function icon(name, opts = {}) {
  const {
    size = 16, label = null, cls = '', viewBox = '0 0 16 16', fill = 'currentColor', title = null,
  } = opts;
  const svg = h('svg', {
    class: ['icon', `icon-${name}`, cls].filter(Boolean).join(' '),
    width: String(size), height: String(size), viewBox, fill,
    'aria-hidden': label || title ? undefined : 'true',
    role: label || title ? 'img' : undefined,
    focusable: 'false',
    xmlns: SVG_NS,
  },
  label || title ? h('title', {}, label || title) : null,
  h('use', { href: `#icon-${name}` }));
  return svg;
}

/** Icon wrapped with an accessible text label for screen readers. */
export function iconWithLabel(name, label, opts = {}) {
  return h('span', { class: 'icon-label' }, icon(name, opts), h('span', { class: 'sr-only' }, label));
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function replaceChildren(node, ...children) {
  clear(node);
  append(node, children);
  return node;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

/** Delegate an event on a container. Returns an off() function. */
export function delegate(root, type, selector, handler, options) {
  const listener = (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (target && root.contains(target)) handler(event, target);
  };
  root.addEventListener(type, listener, options);
  return () => root.removeEventListener(type, listener, options);
}

/**
 * Mount a node/fragment into a container, replacing previous content.
 * Runs a "settled" microtask afterwards so pages can measure layout.
 */
export function mount(container, content, onSettled) {
  clear(container);
  append(container, content);
  if (typeof onSettled === 'function') requestAnimationFrame(() => onSettled(container));
  return container;
}

/** Focus the first focusable element inside a container. */
export function focusFirst(container, selector = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])') {
  const el = container.querySelector(selector);
  if (el && typeof el.focus === 'function') {
    try { el.focus({ preventScroll: false }); return el; } catch { el.focus(); return el; }
  }
  return null;
}

/** Trap focus inside an element while it is open (dialogs, menus). */
export function createFocusTrap(container) {
  const selector = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function focusables() {
    return Array.from(container.querySelectorAll(selector)).filter((el) => el.offsetParent !== null || el === document.activeElement);
  }
  function onKeyDown(event) {
    if (event.key !== 'Tab') return;
    const items = focusables();
    if (items.length === 0) { event.preventDefault(); return; }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  container.addEventListener('keydown', onKeyDown);
  return () => container.removeEventListener('keydown', onKeyDown);
}

/** Build a <table> from column definitions + row data (used by file lists, tables in insights). */
export function table(columns, rows, opts = {}) {
  const { caption = null, cls = '', rowKey = null, onRowClick = null, emptyText = 'Nothing to show yet.' } = opts;
  const thead = h('thead', {}, h('tr', {}, columns.map((col) => h('th', {
    scope: 'col',
    class: col.cls,
    ariaSort: col.sortable && col.sorted ? col.sorted : undefined,
    style: col.width ? { width: col.width } : undefined,
  }, col.label))));

  const tbody = h('tbody', {}, rows.length === 0
    ? h('tr', {}, h('td', { colspan: String(columns.length), class: 'table-empty' }, h('span', { class: 'empty-inline' }, emptyText)))
    : rows.map((row, rowIndex) => h('tr', {
      class: [row.cls, onRowClick ? 'row-clickable' : ''].filter(Boolean).join(' '),
      dataset: rowKey ? { key: String(rowKey(row, rowIndex)) } : undefined,
      tabIndex: onRowClick ? 0 : undefined,
      onClick: onRowClick ? (event) => onRowClick(event, row, rowIndex) : undefined,
      onKeydown: onRowClick ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onRowClick(event, row, rowIndex); } } : undefined,
    }, columns.map((col) => h('td', { class: col.cls, headers: undefined }, typeof col.cell === 'function' ? col.cell(row, rowIndex) : row[col.key])))));

  return h('table', { class: ['table', cls].filter(Boolean).join(' ') }, caption ? h('caption', { class: 'sr-only' }, caption) : null, thead, tbody);
}

export default {
  h, frag, append, clear, replaceChildren, mount, icon, iconWithLabel, qs, qsa,
  delegate, focusFirst, createFocusTrap, table, normalizeClass, isNode, SVG_NS,
};
