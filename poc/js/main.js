// Point d'entrée du widget : icônes des boutons statiques, thème initial, puis démarrage
// (détection du mode #test/standalone/config/fill). Importer ce module suffit à
// charger — et à câbler leurs propres écouteurs — tous les autres modules du widget.
import { $, show } from './dom.js';
import { ICONS } from './icons.js';
import { Theme } from '../../kit/js/theme.js';
import { I18n } from '../../kit/js/i18n.js';
import { GfsLink } from '../../kit/js/gfs-link.js';
import { applyBranding, updateThemeToggleIcon } from './theme.js';
import { STRINGS } from './strings.js';
import { diag, hashParams, fragmentFormLink } from './diag.js';
import { decideStartScreen } from './links.js';
import { resolveMyDefinition, loadDefinitionByRowId } from './grist-meta.js';
import { state } from './state.js';
import { showConfig } from './config-editor.js';
import { renderFill } from './respond.js';
import { runTests } from './tests.js';
import { loadPluginApi } from './plugin-loader.js';

// La ligne de FormPlus_Formulaires ouverte, gardée chez GFS (consigne GFS 010, point 4) : un
// rechargement du cadre (notamment après un changement de langue, voir plus bas) n'a plus
// d'ouverture à donner (GfsLink.opening() devient nul), donc rien d'autre ne permettrait de
// rouvrir le même formulaire - resolveMyDefinition() reste ambiguë dans GFS (consigne 008).
const GFS_OPEN_ROW_KEY = 'formplus_open_row';

// Ouvre un formulaire précis par l'identifiant de sa ligne (porte "ouvrir" de GFS, ou reprise
// après rechargement) : jamais via self.id/resolveMyDefinition, ambigu dans GFS. Faux si la ligne
// n'existe plus (formulaire supprimé depuis).
async function openRow(rowId) {
  const def = await loadDefinitionByRowId(rowId);
  if (!def) return false;
  state.options = def;
  state.stayOnConfig = true;
  if (GfsLink.hosted) GfsLink.storageSet(GFS_OPEN_ROW_KEY, String(state.formRowId));
  await showConfig();
  return true;
}

// Ce que la barre de GFS recouvre, à écarter (consigne GFS 011) : --gfs-bar-* (widget.css, .wrap)
// porte l'écart pour tous les écrans à la fois (concepteur, répondant, départ), puisqu'ils
// partagent tous ce même conteneur. Un bord qu'elle ne couvre pas, ou bar === null (explorateur
// ouvert, ou l'app seule), remet les quatre à 0 - jamais de valeur en dur, la barre a déjà changé
// de taille une fois (mesure du 21/10).
function applyGfsBar(bar) {
  const root = document.documentElement.style;
  root.setProperty('--gfs-bar-top', '0px');
  root.setProperty('--gfs-bar-bottom', '0px');
  root.setProperty('--gfs-bar-left', '0px');
  root.setProperty('--gfs-bar-right', '0px');
  if (!bar) return;
  if (bar.bord === 'haut') root.setProperty('--gfs-bar-top', `${bar.zone.y + bar.zone.hauteur}px`);
  else if (bar.bord === 'bas') root.setProperty('--gfs-bar-bottom', `${bar.epaisseur}px`);
  else if (bar.bord === 'gauche') root.setProperty('--gfs-bar-left', `${bar.epaisseur + 8}px`);
  else if (bar.bord === 'droite') root.setProperty('--gfs-bar-right', `${bar.epaisseur + 8}px`);
}

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
$('themeToggle').addEventListener('click', () => {
  const next = Theme.isDark() ? 'light' : 'dark';
  Theme.set(next);
  updateThemeToggleIcon();
  applyBranding(state.options);
  // Dans GFS, le cadre n'a pas de stockage à lui : le choix part aussi vers GFS (consigne GFS
  // 010, point 5), lu au prochain démarrage (plus bas). Sans effet seule (storageSet y écrit déjà
  // dans le navigateur, via Theme.set ci-dessus).
  if (GfsLink.hosted) GfsLink.storageSet('formplus_theme', next === 'system' ? null : next);
});

(async () => {
  // Suite de non-régression, hors ligne, indépendante de Grist : mêmes conditions qu'un vrai
  // document (grist.docApi simulé) sans jamais y toucher.
  if (hashParams.has('test')) { await runTests(); return; }
  const inIframe = window.self !== window.top;
  const ok = inIframe && await loadPluginApi();
  if (!ok) {
    diag({ event: 'standalone', inIframe });
    // Secours annoncé sur l'écran standalone lui-même : #form=<lien> doit fonctionner ICI, hors
    // iframe/sans connexion Grist, puisque c'est exactement le cas où ce texte s'affiche. Avant
    // ce correctif (écart relevé par l'audit du 21 sept 2026), le code sortait toujours avant de
    // lire ce fragment : le secours promis ne fonctionnait en fait jamais. renderFill() ne
    // dépend pas de `grist` pour lire le formulaire (fetch direct de l'API REST publique) ; les
    // questions supplémentaires s'y ajoutent aussi, via FormPlus_Formulaires (consigne 007).
    if (fragmentFormLink) { await renderFill(); return; }
    show('standalone');
    return;
  }
  grist.ready({ requiredAccess: 'full', onEditOptions: () => showConfig() });
  const timeout = setTimeout(() => { if (!state.connected) { diag({ event: 'timeout' }); show('standalone'); } }, 4000);

  // Le lien avec GFS (kit 0.2.0, consigne GFS 010) : sans effet si GFS n'héberge pas ce cadre
  // (GfsLink.ready se résout tout de suite, hosted reste faux, le reste de ce bloc est inerte).
  await GfsLink.ready;
  if (GfsLink.hosted) {
    const storedTheme = GfsLink.storageGet('formplus_theme');
    if (storedTheme) Theme.set(storedTheme);
    updateThemeToggleIcon();
    // La langue est un choix unique pour GFS et ses apps (point 4) : on se recharge plutôt que de
    // retraduire en direct, trop de texte étant écrit directement par I18n.t() (messages,
    // dialogues) sans jamais repasser par translateDom(). GFS redonne alors réglages/thème/table
    // au cadre rechargé (consigne 011, point 4) ; le formulaire ouvert, lui, se retrouve par
    // GFS_OPEN_ROW_KEY (ci-dessous), puisqu'un cadre rechargé n'a plus d'ouverture.
    GfsLink.onLanguage(() => location.reload());
    applyGfsBar(GfsLink.bar());
    GfsLink.onBar(applyGfsBar);
    // Le double-clic sur un AUTRE formulaire pendant que celui-ci tourne déjà (point 3) :
    // FormPlus enregistre à chaque champ (pas de bouton "Enregistrer"), donc rien n'est jamais en
    // attente ici - on ouvre directement, sans question préalable.
    GfsLink.onOpen(async ({ fichier }) => {
      if (!fichier) {
        if (state.formRowId == null) return true; // déjà sur l'écran de départ
        state.options = {}; state.currentLink = null; state.currentFormSection = null; state.cfgQuestions = [];
        state.formRowId = null; state.formRowVsId = null; state.formRowTitle = undefined;
        GfsLink.storageSet(GFS_OPEN_ROW_KEY, null);
        state.stayOnConfig = true;
        await showConfig();
        return true;
      }
      if (state.formRowId != null && String(state.formRowId) === String(fichier.id)) return true; // déjà ouvert
      return await openRow(fichier.id);
    });
  }

  grist.onOptions(async (opts, settings) => {
    state.connected = true; clearTimeout(timeout);
    // La porte "ouvrir" de GFS (consigne GFS 010, point 2) décide avant tout le reste : un cadre
    // neuf que GFS vient d'ouvrir sur un formulaire précis (fichier.id, l'identifiant de sa ligne
    // dans FormPlus_Formulaires), ou, à défaut (cadre rechargé : GfsLink.opening() redevient nul),
    // le formulaire gardé comme ouvert avant le rechargement (GFS_OPEN_ROW_KEY). resolveMyDefinition
    // (self.id) reste le repli hors GFS, et dans GFS tant qu'aucun des deux n'a encore rien dit.
    let opened = false;
    const wanted = GfsLink.opening();
    if (wanted?.fichier) opened = await openRow(wanted.fichier.id);
    if (!opened && GfsLink.hosted) {
      const storedRow = GfsLink.storageGet(GFS_OPEN_ROW_KEY);
      if (storedRow) opened = await openRow(storedRow);
    }
    if (!opened) {
      // Depuis la consigne 007, plus de lecture de `opts` (grist.onOptions ne garde ici que son
      // rôle de signal "connecté", le courtier de GFS le rend de toute façon inerte) : la
      // Definition de cette instance vient de FormPlus_Formulaires (ou, repli, des réglages de vue
      // d'un formulaire pas encore migré) — voir resolveMyDefinition.
      state.options = await resolveMyDefinition();
    }
    diag({ event: 'onOptions', optionKeys: Object.keys(state.options), hasFormLink: !!state.options.formLink, settings, gfsOpened: opened });
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
