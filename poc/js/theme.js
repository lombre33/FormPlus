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
// Luminance relative WCAG (pas l'approximation de luma NTSC utilisée avant le 21 oct, qui pouvait
// désigner un texte perdant sous le seuil AA de 4,5:1 pour certaines couleurs d'accent choisies
// par le concepteur — audit accessibilité axe-core du 21 oct, voir aussi strings.js). sRGB ->
// linéaire puis pondération 0,2126/0,7152/0,0722 (formule WCAG 2.x), reprise telle quelle.
function relLuminance(c) {
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}
function contrastRatio(l1, l2) {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}
const DARK_TEXT = '#1c1d21';
const DARK_TEXT_LUM = relLuminance({ r: 0x1c, g: 0x1d, b: 0x21 });
export function contrastText(hex) {
  const c = hexToRgb(hex);
  if (!c) return null;
  const bgLum = relLuminance(c);
  // Toujours le MEILLEUR des deux textes possibles face à cette couleur de fond précise, jamais
  // un seuil de luminosité fixe sur la couleur seule : les deux ratios sont comparés directement.
  return contrastRatio(1, bgLum) >= contrastRatio(DARK_TEXT_LUM, bgLum) ? '#fff' : DARK_TEXT;
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
