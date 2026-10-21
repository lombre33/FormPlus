import { $ } from './dom.js';
import { ICONS } from './icons.js';
import { Theme } from '../../kit/js/theme.js';
import { I18n } from '../../kit/js/i18n.js';

// ───────────────────────── Icône et titre de la bascule de thème (répondant) ─────────────────────────
// L'état du thème lui-même (stockage, application sur <html>) vient du kit (kit/js/theme.js,
// même clé formplus_theme, mêmes valeurs : un choix déjà fait reste gardé). Cette fonction ne
// fait que refléter Theme.isDark() sur le bouton, à appeler après Theme.init et après chaque
// Theme.set (main.js).
export function updateThemeToggleIcon() {
  const btn = $('themeToggle');
  if (!btn) return;
  const dark = Theme.isDark();
  btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
  btn.title = I18n.t(dark ? 'form.main.themeToLight' : 'form.main.themeToDark');
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
  const bg = Theme.isDark() ? 32 : 255;
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
// thème par défaut, pour que le concepteur garde des repères visuels stables) : posée sur #fill,
// jamais sur <html>, sinon les écrans du concepteur et les fenêtres du kit prendraient eux aussi
// cette couleur (piège mesuré par GFS sur une copie du dépôt, consigne 005 point 2).
const BRAND_PROPS = ['--accent', '--accent-solid', '--accent-ink', '--accent-soft', '--on-accent'];
export function applyBranding(opts) {
  const fill = $('fill');
  if (!fill) return;
  const hex = opts && opts.accentColor;
  if (hex && hexToRgb(hex)) {
    fill.style.setProperty('--accent', hex);
    fill.style.setProperty('--accent-solid', hex);
    fill.style.setProperty('--accent-ink', hex);
    fill.style.setProperty('--accent-soft', softenColor(hex));
    fill.style.setProperty('--on-accent', contrastText(hex));
  } else {
    BRAND_PROPS.forEach(p => fill.style.removeProperty(p));
  }
}
