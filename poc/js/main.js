// Point d'entrée du widget : icônes des boutons statiques, thème initial, puis démarrage
// (détection du mode #test/#repair/standalone/config/fill). Importer ce module suffit à
// charger — et à câbler leurs propres écouteurs — tous les autres modules du widget.
import { $, show } from './dom.js';
import { ICONS } from './icons.js';
import { Theme } from '../../kit/js/theme.js';
import { I18n } from '../../kit/js/i18n.js';
import { applyBranding, updateThemeToggleIcon } from './theme.js';
import { STRINGS } from './strings.js';
import { diag, hashParams, fragmentFormLink } from './diag.js';
import { decideStartScreen } from './links.js';
import { runRepair } from './grist-meta.js';
import { state } from './state.js';
import { showConfig } from './config-editor.js';
import { renderFill } from './respond.js';
import { runTests } from './tests.js';
import { loadPluginApi } from './plugin-loader.js';

// Thème et langue d'abord, avant que rien ne soit dessiné (sinon la page s'affiche en clair, en
// français, puis bascule — kit/README.md). Pas encore de langue venue de GFS (client du courtier,
// étape 5) : stockage par navigateur, sinon celle du navigateur lui-même.
Theme.init({ storageKey: 'formplus_theme' });
I18n.add(STRINGS);
I18n.init({ storageKey: 'formplus_lang' });
I18n.translateDom();
I18n.onChange(() => I18n.translateDom());

$('qadd').innerHTML = ICONS.plus + `<span>${I18n.t('form.main.addQuestionBtn')}</span>`;
$('qreset').innerHTML = ICONS.refresh + `<span>${I18n.t('form.main.resetBtn')}</span>`;
$('qrToggle').innerHTML = ICONS.qrcode;
$('scratchTable').value = I18n.t('form.scratch.defaultTableName');
document.querySelectorAll('.start-tile-icon[data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon] || ''; });

// applyBranding dépend de `state.options`, pas encore chargé à ce stade du démarrage : appelée
// séparément, jamais depuis le thème lui-même.
updateThemeToggleIcon();
$('themeToggle').addEventListener('click', () => { Theme.set(Theme.isDark() ? 'light' : 'dark'); updateThemeToggleIcon(); applyBranding(state.options); });

(async () => {
  // Suite de non-régression, hors ligne, indépendante de Grist : mêmes conditions qu'un vrai
  // document (grist.docApi simulé) sans jamais y toucher. Même convention que #repair.
  if (hashParams.has('test')) { await runTests(); return; }
  const inIframe = window.self !== window.top;
  const ok = inIframe && await loadPluginApi();
  if (!ok) {
    diag({ event: 'standalone', inIframe });
    // Secours annoncé sur l'écran standalone lui-même : #form=<lien> doit fonctionner ICI, hors
    // iframe/sans connexion Grist, puisque c'est exactement le cas où ce texte s'affiche. Avant
    // ce correctif (écart relevé par l'audit du 21 sept 2026), le code sortait toujours avant de
    // lire ce fragment : le secours promis ne fonctionnait en fait jamais. renderFill() ne
    // dépend pas de `grist` pour lire le formulaire (fetch direct de l'API REST publique) ;
    // state.options reste vide, donc sans les questions supplémentaires (comme public-form.html).
    if (fragmentFormLink) { await renderFill(); return; }
    show('standalone');
    return;
  }
  grist.ready({ requiredAccess: 'full', onEditOptions: () => showConfig() });
  const timeout = setTimeout(() => { if (!state.connected) { diag({ event: 'timeout' }); show('standalone'); } }, 4000);
  grist.onOptions(async (opts, settings) => {
    state.connected = true; clearTimeout(timeout);
    state.options = opts || {};
    diag({ event: 'onOptions', optionKeys: Object.keys(state.options), hasFormLink: !!state.options.formLink, settings });
    if (hashParams.has('repair')) { if (!state.stayOnConfig) { state.stayOnConfig = true; runRepair(); } return; }
    // #form=<lien> dans l'URL du widget est le mode répondant explicite (secours quand l'adresse
    // publique habituelle ne fonctionne pas, voir l'écran standalone). Sinon, decideStartScreen()
    // (links.js) tranche selon l'accès réellement accordé par Grist pour CE visiteur : un visiteur
    // sans accès complet (ex. visiteur externe anonyme sur l'adresse publique) va directement au
    // formulaire s'il est déjà lié, jamais à la configuration — voir #result pour "Voir le
    // formulaire", le moyen explicite d'y répondre depuis l'écran concepteur lui-même.
    if (!state.stayOnConfig) {
      const screen = decideStartScreen({ formLink: state.options.formLink, fragmentFormLink, accessLevel: settings?.accessLevel });
      if (screen === 'fill') await renderFill(); else await showConfig();
    }
  });
})();
