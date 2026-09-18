/**
 * RedGet — tiny pub/sub event bus.
 * Used for cross-module signals: route changes, data mutations, toasts, theme changes.
 */

const listeners = new Map();

export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

export function once(event, handler) {
  const offFn = on(event, (payload) => {
    offFn();
    handler(payload);
  });
  return offFn;
}

export function off(event, handler) {
  const set = listeners.get(event);
  if (set) {
    set.delete(handler);
    if (set.size === 0) listeners.delete(event);
  }
}

export function emit(event, payload) {
  const set = listeners.get(event);
  if (!set || set.size === 0) return;
  for (const handler of Array.from(set)) {
    try {
      handler(payload);
    } catch (error) {
      // Never let one subscriber break the UI; surface in console only.
      console.error(`[RedGet] listener error for "${event}"`, error);
    }
  }
}

export const EVENTS = {
  routeChange: 'route:change',
  routeStart: 'route:start',
  dataChange: 'data:change',
  sessionChange: 'session:change',
  themeChange: 'theme:change',
  localeChange: 'locale:change',
  toast: 'toast',
  commandPalette: 'command-palette:toggle',
  mobileNav: 'mobile-nav:toggle',
  notifications: 'notifications:change',
  counts: 'counts:change',
};

export default { on, once, off, emit, EVENTS };
