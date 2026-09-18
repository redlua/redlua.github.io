/**
 * RedGet — avatars.
 *
 * There are no external image hosts, so every avatar is generated locally as a
 * deterministic inline SVG: a red/black gradient derived from the login plus a
 * 5×5 mirrored identicon pattern and the user's initials. The same markup is
 * returned both as a DOM node and as a data: URI (for <img src> and favicons).
 */

import { h, SVG_NS } from '../core/dom.js';
import { hashString, hueFromString, initials, makeRandom } from '../core/util.js';

const CACHE = new Map();

/** Deterministic red-family palette per login (never leaves the crimson/black range). */
function paletteFor(seed) {
  const hue = hueFromString(seed);
  // Keep hues inside the red/magenta band so every avatar reads as RedGet.
  const redHue = (hue % 40) - 12; // -12..28  (deep red → orange-red)
  const altHue = redHue + 18;
  return {
    from: `hsl(${((redHue % 360) + 360) % 360} 78% 34%)`,
    to: `hsl(${((altHue % 360) + 360) % 360} 72% 12%)`,
    fg: `hsl(${(((redHue + 8) % 360) + 360) % 360} 96% 92%)`,
    dot: `hsl(${(((redHue + 22) % 360) + 360) % 360} 90% 62%)`,
    bg: '#0b0b0d',
  };
}

/** 5x5 mirrored identicon cells from the seed. */
function identiconCells(seed) {
  const rng = makeRandom(`${seed}:identicon`);
  const cells = [];
  for (let y = 0; y < 5; y += 1) {
    for (let x = 0; x < 3; x += 1) {
      if (rng() > 0.52) {
        cells.push([x, y]);
        cells.push([4 - x, y]);
      }
    }
  }
  return cells;
}

export function avatarSvgMarkup(seed, options = {}) {
  const { showInitials = true, size = 64, org = false } = options;
  const key = `${seed}|${showInitials}|${org}`;
  if (CACHE.has(key)) return CACHE.get(key);

  const pal = paletteFor(seed);
  const gradId = `g-${hashString(key).toString(36)}`;
  const cells = identiconCells(seed);
  const cellRects = cells
    .map(([x, y]) => `<rect x="${16 + x * 12}" y="${16 + y * 12}" width="12" height="12" rx="2" fill="${pal.dot}" opacity="0.55"/>`)
    .join('');
  const text = showInitials
    ? `<text x="64" y="64" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif" font-size="${org ? 40 : 44}" font-weight="700" fill="${pal.fg}" text-anchor="middle" dominant-baseline="central">${initials(seed).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
    : '';
  const shape = org
    ? `<rect x="8" y="8" width="112" height="112" rx="20" fill="${pal.bg}"/><rect x="8" y="8" width="112" height="112" rx="20" fill="url(#${gradId})" opacity="0.9"/>`
    : `<circle cx="64" cy="64" r="60" fill="${pal.bg}"/><circle cx="64" cy="64" r="60" fill="url(#${gradId})" opacity="0.92"/>`;

  const svg = `<svg xmlns="${SVG_NS}" width="${size}" height="${size}" viewBox="0 0 128 128" role="img">
<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0%" stop-color="${pal.from}"/><stop offset="55%" stop-color="${pal.to}"/><stop offset="100%" stop-color="#050506"/>
</linearGradient></defs>
${shape}
<g opacity="0.85">${cellRects}</g>
${text}
</svg>`;
  CACHE.set(key, svg);
  return svg;
}

export function avatarDataUri(seed, options = {}) {
  const svg = avatarSvgMarkup(seed, options);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * Avatar as an <img> (best for lists where we want the browser to cache it).
 * @param {object} user { login, name, type }
 */
export function avatar(user, options = {}) {
  const {
    size = 20, cls = '', circle = false, alt = null, link = false, presence = null, lazy = true,
  } = options;
  const login = (user && (user.login || user.name)) || 'anonymous';
  const isOrg = user && (user.type === 'org' || user.type === 'Organization');
  const label = alt != null ? alt : `${login} avatar`;
  const img = h('img', {
    class: ['avatar', `avatar-${size}`, circle ? 'avatar-circle' : '', cls].filter(Boolean).join(' '),
    width: String(size), height: String(size),
    src: avatarDataUri(login, { showInitials: size >= 24, size: Math.max(size, 64), org: isOrg }),
    alt: label,
    loading: lazy ? 'lazy' : undefined,
    decoding: 'async',
    dataset: { login, presence: presence || '' },
  });
  if (presence) {
    return h('span', {
      class: ['presence-ring', cls].filter(Boolean).join(' '),
      dataset: { presence },
      title: `${login}: ${presence}`,
    }, img);
  }
  if (link) {
    return h('a', { class: 'avatar-link', href: `/${encodeURIComponent(login)}`, 'aria-label': label }, img);
  }
  return img;
}

/** Avatar as inline <svg> — useful when we need currentColor theming. */
export function avatarInline(user, options = {}) {
  const { size = 20, cls = '' } = options;
  const login = (user && (user.login || user.name)) || 'anonymous';
  const isOrg = user && (user.type === 'org' || user.type === 'Organization');
  const wrapper = h('span', {
    class: ['avatar', `avatar-${size}`, isOrg ? '' : 'avatar-circle', cls].filter(Boolean).join(' '),
    style: { width: `${size}px`, height: `${size}px` },
    role: 'img', 'aria-label': `${login} avatar`,
  });
  wrapper.innerHTML = avatarSvgMarkup(login, { showInitials: size >= 24, size, org: isOrg });
  const svg = wrapper.firstChild;
  if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); svg.removeAttribute('role'); }
  return wrapper;
}

export function avatarStack(users, options = {}) {
  const { size = 20, max = 5, cls = '' } = options;
  const shown = users.slice(0, max);
  const extra = users.length - shown.length;
  const node = h('span', { class: ['avatar-stack', cls].filter(Boolean).join(' ') },
    shown.map((u) => avatar(u, { size, link: true })),
    extra > 0 ? h('span', {
      class: `avatar avatar-${size} avatar-circle`,
      style: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '10px', fontWeight: '700', color: 'var(--fg-muted)', backgroundColor: 'var(--bg-muted)',
      },
      title: `${extra} more`,
    }, `+${extra}`) : null);
  return node;
}

export function appFaviconDataUri(seed = 'RedGet') {
  return avatarDataUri(seed, { showInitials: true, size: 32 });
}

export default { avatar, avatarInline, avatarStack, avatarDataUri, avatarSvgMarkup, appFaviconDataUri, paletteFor };
