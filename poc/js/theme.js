import { $ } from './dom.js';
import { ICONS } from './icons.js';

// ───────────────────────── Thème du répondant (indépendant du réglage du concepteur) ─────────────────────────
// Préférence par navigateur (localStorage), jamais écrite dans le document. Bascule entre clair
// et sombre explicites ; sans choix, suit le système comme aujourd'hui.
export function getStoredTheme() { try { return localStorage.getItem('formplus_theme') || ''; } catch (e) { return ''; } }
export function setStoredTheme(t) { try { if (t) localStorage.setItem('formplus_theme', t); else localStorage.removeItem('formplus_theme'); } catch (e) { /* stockage indisponible, tant pis */ } }
export function effectiveDark() {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}
export function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const btn = $('themeToggle');
  if (btn) { btn.innerHTML = effectiveDark() ? ICONS.sun : ICONS.moon; btn.title = effectiveDark() ? 'Passer en thème clair' : 'Passer en thème sombre'; }
}

// ───────────────────────── Couleur d'accent personnalisable ─────────────────────────
export function hexToRgb(hex) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
export function softenColor(hex) {
  const c = hexToRgb(hex);
  if (!c) return null;
  const bg = effectiveDark() ? 32 : 255;
  const mix = (v) => Math.round(v * 0.18 + bg * 0.82);
  return `rgb(${mix(c.r)}, ${mix(c.g)}, ${mix(c.b)})`;
}
export function contrastText(hex) {
  const c = hexToRgb(hex);
  if (!c) return null;
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum > 0.6 ? '#1c1d21' : '#fff';
}
// Applique la couleur d'accent choisie par le concepteur (options.accentColor) sur le rendu
// répondant. N'est jamais utilisée dans l'écran de configuration lui-même (réservé au sobre
// thème par défaut, pour que le concepteur garde des repères visuels stables).
export function applyBranding(opts) {
  const root = document.documentElement;
  const hex = opts && opts.accentColor;
  if (hex && hexToRgb(hex)) {
    root.style.setProperty('--accent', hex);
    root.style.setProperty('--accent-soft', softenColor(hex));
    root.style.setProperty('--accent-text', contrastText(hex));
  } else {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--accent-soft');
    root.style.removeProperty('--accent-text');
  }
}
