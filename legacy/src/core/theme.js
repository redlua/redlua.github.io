/**
 * RedGet — theming.
 *
 * Themes are pure CSS custom properties on <html data-theme="...">.
 * Switching never re-renders the page: only the attribute changes and the browser
 * re-resolves var() references. `prefers-color-scheme` and `prefers-contrast` are
 * honoured on first load, and the choice is persisted through the store.
 */

import { THEMES } from '../config.js';
import { emit, EVENTS } from './bus.js';

const MEDIA_DARK = '(prefers-color-scheme: dark)';
const MEDIA_CONTRAST = '(prefers-contrast: more)';
const MEDIA_MOTION = '(prefers-reduced-motion: reduce)';

let mediaDark = null;
let mediaContrast = null;
let mediaMotion = null;
let followSystem = true;
let currentThemeId = null;

export function getThemeIds() {
  return THEMES.map((t) => t.id);
}

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}

function systemTheme() {
  const dark = mediaDark ? mediaDark.matches : true;
  const contrast = mediaContrast ? mediaContrast.matches : false;
  if (contrast) return dark ? 'contrast-dark' : 'contrast-light';
  return dark ? 'dark' : 'light';
}

export function applyTheme(id, options = {}) {
  const theme = getTheme(id);
  const root = document.documentElement;
  currentThemeId = theme.id;
  root.dataset.theme = theme.id;
  root.dataset.themeGroup = theme.group;
  root.style.colorScheme = theme.group === 'light' ? 'light' : 'dark';
  if (options.followSystem != null) followSystem = options.followSystem;
  root.dataset.followSystem = followSystem ? 'true' : 'false';

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    const color = getComputedStyle(root).getPropertyValue('--bg-page').trim() || '#0a0a0c';
    themeMeta.setAttribute('content', color);
  }
  emit(EVENTS.themeChange, { theme: theme.id, group: theme.group, followSystem });
  return theme;
}

export function getCurrentThemeId() {
  return currentThemeId;
}

export function isFollowingSystem() {
  return followSystem;
}

export function refreshFromSystem() {
  if (!followSystem) return;
  const next = systemTheme();
  if (next !== currentThemeId) applyTheme(next, { followSystem: true });
}

export function applyDensity(density) {
  document.documentElement.dataset.density = density === 'compact' ? 'compact' : 'comfortable';
}

export function applyReducedMotion(enabled) {
  document.documentElement.dataset.reducedMotion = enabled ? 'true' : 'false';
}

export function syncMotionPreference() {
  if (!mediaMotion) return;
  document.documentElement.dataset.reducedMotion = mediaMotion.matches ? 'true' : 'false';
}

export function initTheme(prefs) {
  mediaDark = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MEDIA_DARK) : null;
  mediaContrast = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MEDIA_CONTRAST) : null;
  mediaMotion = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(MEDIA_MOTION) : null;

  const saved = prefs && prefs.theme;
  followSystem = !saved || saved === 'system';
  applyTheme(followSystem ? systemTheme() : saved, { followSystem });
  applyDensity(prefs && prefs.density ? prefs.density : 'comfortable');
  applyReducedMotion(Boolean(prefs && prefs.reducedMotion));
  syncMotionPreference();

  if (mediaDark && mediaDark.addEventListener) mediaDark.addEventListener('change', refreshFromSystem);
  if (mediaContrast && mediaContrast.addEventListener) mediaContrast.addEventListener('change', refreshFromSystem);
  if (mediaMotion && mediaMotion.addEventListener) mediaMotion.addEventListener('change', syncMotionPreference);
  return currentThemeId;
}

/** Cycle themes, used by the header switcher and the "t" style shortcuts. */
export function cycleTheme() {
  const ids = getThemeIds();
  const idx = ids.indexOf(currentThemeId);
  const next = ids[(idx + 1) % ids.length];
  applyTheme(next, { followSystem: false });
  return next;
}

export default { initTheme, applyTheme, cycleTheme, getTheme, getThemeIds, getCurrentThemeId, refreshFromSystem, applyDensity, applyReducedMotion, isFollowingSystem };
