/**
 * RedGet — account keys.
 *
 * The key is the entire credential: 15 characters drawn from an alphabet with
 * the ambiguous glyphs (I, O, 0, 1) removed so a key can be read aloud and
 * typed back without confusion.
 */

export var KEY_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export var KEY_LENGTH = 15;

/** Generate a key with the strongest random source available. */
export function genKey() {
  var out = '';
  if (window.crypto && window.crypto.getRandomValues) {
    var buf = new Uint32Array(KEY_LENGTH);
    window.crypto.getRandomValues(buf);
    for (var i = 0; i < KEY_LENGTH; i++) out += KEY_CHARS[buf[i] % KEY_CHARS.length];
    return out;
  }
  for (var j = 0; j < KEY_LENGTH; j++) out += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)];
  return out;
}

/** `ABCD-EFGH-JKLM-NPQ` — how keys are displayed. */
export function fmtKey(k) {
  if (!k) return '';
  return k.slice(0, 4) + '-' + k.slice(4, 8) + '-' + k.slice(8, 12) + '-' + k.slice(12, 15);
}

/** Strip separators and upper-case so pasted keys match. */
export function normKey(v) {
  return String(v || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/** Is this a plausible key? Used for inline validation before lookup. */
export function validKey(v) {
  var norm = normKey(v);
  if (norm.length !== KEY_LENGTH) return false;
  for (var i = 0; i < norm.length; i++) {
    if (KEY_CHARS.indexOf(norm.charAt(i)) === -1) return false;
  }
  return true;
}

/** Partially mask a key for display: `ABCD-…-NPQ`. */
export function maskKey(k) {
  if (!k || k.length < 8) return '';
  return k.slice(0, 4) + '-••••-••••-' + k.slice(12);
}
