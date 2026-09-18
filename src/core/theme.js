import { THEME_KEY } from '../state.js';

export function setTheme(t){document.documentElement.setAttribute('data-theme',t);try{localStorage.setItem(THEME_KEY,t);}catch(e){}}

export function getTheme(){try{return localStorage.getItem(THEME_KEY)||'dark';}catch(e){return 'dark';}}
/** Apply whatever theme is stored (called once from app.js before first paint). */
export function loadTheme(){setTheme(getTheme());}
