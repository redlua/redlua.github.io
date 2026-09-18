/**
 * RedGet — SSH / GPG key parsing and fingerprints.
 *
 * Only public keys are ever stored. A fingerprint is derived from the key
 * material with the same 16-byte, colon-separated shape the OpenSSH client
 * prints (`SHA256:`/`MD5:`-style), computed locally with a small hash so the
 * app stays dependency-free and offline.
 */

/** FNV-1a over a string, returned as 16 bytes of hex in 8 colon pairs. */
export function fingerprintKey(key) {
  var bytes = hash16(String(key || ''));
  var hex = bytes.map(function (b) { return ('0' + b.toString(16)).slice(-2); });
  return hex.join(':');
}

/** 16 pseudo-random-but-deterministic bytes for a string. */
function hash16(str) {
  var out = [];
  var h1 = 0x811c9dc5;
  var h2 = 0x01000193;
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 + c * (i + 7)) ^ (h2 >>> 13)) >>> 0;
    if (i % 2 === 1) {
      out.push(h1 & 0xff, (h2 >>> 8) & 0xff);
      h1 = (h1 * 31 + 7) >>> 0;
      h2 = (h2 * 17 + 13) >>> 0;
    }
  }
  while (out.length < 16) out.push((out.length * 37 + 11) & 0xff);
  return out.slice(0, 16);
}

var SSH_TYPES = ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'ssh-dss', 'sk-ssh-ed25519@openssh.com'];

/**
 * Validate and normalise a pasted public key.
 * @param {string} raw  the pasted text
 * @param {string} [expectKind]  'gpg' to require an ASCII-armoured block
 * @returns {{ type: string, key: string, fingerprint: string, kind: string }|null}
 */
export function parseSshKey(raw, expectKind) {
  var text = String(raw || '').trim();
  if (!text) return null;

  if (expectKind === 'gpg' || /^-----BEGIN PGP PUBLIC KEY BLOCK-----/m.test(text)) {
    if (!/^-----BEGIN PGP PUBLIC KEY BLOCK-----[\s\S]*-----END PGP PUBLIC KEY BLOCK-----$/m.test(text)) return null;
    return { type: 'GPG', key: text, fingerprint: fingerprintKey(text), kind: 'signing' };
  }

  var line = text.split('\n')[0].trim();
  var parts = line.split(/\s+/);
  if (parts.length < 2) return null;
  var type = parts[0];
  if (SSH_TYPES.indexOf(type) === -1) return null;
  if (!/^[A-Za-z0-9+/=]{40,}$/.test(parts[1])) return null;
  return {
    type: type,
    key: line,
    fingerprint: fingerprintKey(type + ' ' + parts[1]),
    kind: parts.length > 2 && /signing/i.test(parts[2]) ? 'signing' : 'authentication',
  };
}

/** A generated throwaway public key, for the "Generate a key pair" helper. */
export function sampleKey(comment) {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  var body = '';
  for (var i = 0; i < 68; i++) body += chars[Math.floor(Math.random() * chars.length)];
  return 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5' + body + ' ' + (comment || 'you@redget');
}
