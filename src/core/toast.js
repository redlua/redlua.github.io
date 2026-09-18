/**
 * RedGet — toasts and clipboard.
 *
 * `toast(message, kind)` shows a single transient message. `kind` is optional
 * and only affects the accent colour: 'success' | 'error' | 'info'.
 *
 * `copyText(text)` uses the async clipboard when the browser allows it and
 * falls back to a hidden textarea + `execCommand`, because RedGet is served
 * from a file or a plain static host where the clipboard API may be blocked.
 */

import { $ } from './dom.js';
import { ic } from '../icons.js';

var KIND_ICONS = { success: 'checkCircle', error: 'alert', info: 'info' };

export function toast(msg, kind, ms) {
  var t = $('#toast');
  if (!t) return;
  var icon = KIND_ICONS[kind] || 'info';
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.innerHTML = '<span class="toast-icon">' + ic(icon, 14) + '</span><span class="toast-text"></span>';
  t.querySelector('.toast-text').textContent = String(msg == null ? '' : msg);
  t.setAttribute('role', 'status');
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(function () { t.classList.remove('show'); }, ms || 2600);
}

export function toastSuccess(msg) { toast(msg, 'success'); }
export function toastError(msg) { toast(msg, 'error'); }

export function copyText(text, label) {
  var value = String(text == null ? '' : text);
  function done() { toast(label || 'Copied to clipboard', 'success'); }
  function failed() { toast('Copy failed — select the text manually', 'error'); }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(value).then(done, function () { legacyCopy(value, done, failed); });
    return;
  }
  legacyCopy(value, done, failed);
}

function legacyCopy(value, done, failed) {
  var ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-1000px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  if (ok) done(); else failed();
}

/** Trigger a download of `text` as `filename` — used by data export. */
export function downloadText(filename, text, mime) {
  try {
    var blob = new Blob([String(text)], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    toast('Saved ' + filename, 'success');
    return true;
  } catch (e) {
    toast('Could not save the file', 'error');
    return false;
  }
}
