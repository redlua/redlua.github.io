import { $ } from './dom.js';
import { ic } from '../icons.js';
import { esc } from './util.js';

/**
 * Modal / dialog layer.
 *
 * `openModal` accepts either a raw HTML string (the shape the original app
 * used) or an options object:
 *
 *   openModal({
 *     title: 'New release',
 *     icon: 'tag',             // optional icon name
 *     wide: true,              // optional
 *     body: '<div class="form-group">…</div>',
 *     actions: [{ label, primary, danger, icon, id, onClick }],
 *     onMount: function (root) { … },
 *     onClose: function () { … },
 *   })
 *
 * Actions without an `onClick` and without `keepOpen` close the dialog, which
 * is what "Cancel" needs.
 */

var current = null;

export function openModal(payload) {
  var overlay = $('#overlay');
  if (!overlay) return null;
  var html = typeof payload === 'string' ? payload : buildModal(payload || {});
  overlay.innerHTML = html;
  overlay.classList.add('open');
  overlay.scrollTop = 0;
  document.body.classList.add('modal-open');

  current = { onClose: payload && payload.onClose };

  var box = overlay.querySelector('.modal');
  if (box) {
    var close = box.querySelector('.modal-close');
    if (close) close.addEventListener('click', closeModal);
  }

  if (payload && typeof payload === 'object') wireActions(payload);

  var focusTarget = overlay.querySelector('[data-autofocus]') ||
    overlay.querySelector('input, textarea, select') ||
    overlay.querySelector('.modal-close');
  if (focusTarget) focusTarget.focus();

  if (payload && typeof payload === 'object' && typeof payload.onMount === 'function') {
    payload.onMount(overlay);
  }
  return overlay;
}

export function closeModal() {
  var overlay = $('#overlay');
  if (!overlay) return;
  var had = overlay.classList.contains('open');
  overlay.classList.remove('open');
  overlay.innerHTML = '';
  document.body.classList.remove('modal-open');
  var pending = current;
  current = null;
  if (had && pending && typeof pending.onClose === 'function') pending.onClose();
}

export function modalOpen() {
  var overlay = $('#overlay');
  return Boolean(overlay && overlay.classList.contains('open'));
}

function buildModal(options) {
  var actions = (options.actions || []).map(function (action, index) {
    var cls = 'btn' + (action.primary ? ' primary' : '') + (action.danger ? ' danger' : '') + (action.green ? ' green' : '');
    var icon = action.icon ? ic(action.icon, 14) : '';
    var id = action.id ? ' id="' + esc(action.id) + '"' : '';
    var focus = index === 0 && options.autofocusFirst === false ? '' : '';
    return '<button class="' + cls + '"' + id + ' data-action="' + index + '"' + focus + '>' + icon + ' ' + esc(action.label) + '</button>';
  }).join('');

  return '<div class="modal' + (options.wide ? ' wide' : '') + '" role="dialog" aria-modal="true"' +
      (options.title ? ' aria-label="' + esc(options.title) + '"' : '') + '>' +
    '<div class="modal-head">' +
      '<div style="display:flex;align-items:center;gap:10px">' +
        (options.icon ? '<span class="modal-icon">' + ic(options.icon, 18) + '</span>' : '') +
        '<h2>' + esc(options.title || '') + '</h2>' +
      '</div>' +
      '<button class="modal-close" type="button" aria-label="Close dialog">' + ic('x', 16) + '</button>' +
    '</div>' +
    '<div class="modal-body">' + (options.body || '') + '</div>' +
    (actions ? '<div class="modal-foot">' + actions + '</div>' : '') +
  '</div>';
}

function wireActions(options) {
  var overlay = $('#overlay');
  if (!overlay) return;
  (options.actions || []).forEach(function (action, index) {
    var btn = overlay.querySelector('[data-action="' + index + '"]');
    if (!btn) return;
    btn.addEventListener('click', function () {
      if (typeof action.onClick === 'function') {
        action.onClick(overlay);
        return;
      }
      if (!action.keepOpen) closeModal();
    });
  });
}

/* Escape closes; clicking the backdrop closes; focus is trapped while open. */
document.addEventListener('keydown', function (e) {
  if (!modalOpen()) return;
  if (e.key === 'Escape') { closeModal(); return; }
  if (e.key !== 'Tab') return;
  var overlay = $('#overlay');
  var focusables = Array.prototype.slice.call(
    overlay.querySelectorAll('a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')
  ).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  if (!focusables.length) return;
  var first = focusables[0];
  var last = focusables[focusables.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

document.addEventListener('mousedown', function (e) {
  var overlay = $('#overlay');
  if (overlay && e.target === overlay) closeModal();
});
