// Point d'entrée du widget : icônes des boutons statiques, thème initial, puis démarrage
// (détection du mode #test/#repair/standalone/config/fill). Importer ce module suffit à
// charger — et à câbler leurs propres écouteurs — tous les autres modules du widget.
import { $, show } from './dom.js';
import { ICONS } from './icons.js';
import { getStoredTheme, setStoredTheme, applyTheme, applyBranding, effectiveDark } from './theme.js';
import { diag, hashParams, fragmentFormLink } from './diag.js';
import { runRepair } from './grist-meta.js';
import { state } from './state.js';
import { showConfig } from './config-editor.js';
import { renderFill } from './respond.js';
import { runTests } from './tests.js';
import { loadPluginApi } from './plugin-loader.js';

$('qadd').innerHTML = ICONS.plus + '<span>Ajouter une question</span>';
$('qimport').innerHTML = ICONS.download + '<span>Importer les champs du formulaire natif</span>';
$('qreset').innerHTML = ICONS.refresh + '<span>Réinitialiser les questions</span>';
$('qrToggle').innerHTML = ICONS.qrcode;
document.querySelectorAll('.start-tile-icon[data-icon]').forEach(el => { el.innerHTML = ICONS[el.dataset.icon] || ''; });

// applyBranding dépend de `state.options`, pas encore chargé à ce stade du démarrage : appelée
// séparément, jamais depuis applyTheme lui-même.
$('themeToggle').addEventListener('click', () => { const next = effectiveDark() ? 'light' : 'dark'; setStoredTheme(next); applyTheme(next); applyBranding(state.options); });
applyTheme(getStoredTheme());

(async () => {
  // Suite de non-régression, hors ligne, indépendante de Grist : mêmes conditions qu'un vrai
  // document (grist.docApi simulé) sans jamais y toucher. Même convention que #repair.
  if (hashParams.has('test')) { await runTests(); return; }
  const inIframe = window.self !== window.top;
  const ok = inIframe && await loadPluginApi();
  if (!ok) { diag({ event: 'standalone', inIframe }); show('standalone'); return; }
  grist.ready({ requiredAccess: 'full', onEditOptions: () => showConfig() });
  const timeout = setTimeout(() => { if (!state.connected) { diag({ event: 'timeout' }); show('standalone'); } }, 4000);
  grist.onOptions(async (opts, settings) => {
    state.connected = true; clearTimeout(timeout);
    state.options = opts || {};
    diag({ event: 'onOptions', optionKeys: Object.keys(state.options), hasFormLink: !!state.options.formLink, settings });
    if (hashParams.has('repair')) { if (!state.stayOnConfig) { state.stayOnConfig = true; runRepair(); } return; }
    const formLink = state.options.formLink || fragmentFormLink;
    if (formLink && !state.stayOnConfig) {
      await renderFill();
    } else if (!state.stayOnConfig) {
      await showConfig();
    }
  });
})();
