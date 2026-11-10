// Point d'entrée du widget : icônes des boutons statiques, thème initial, puis démarrage
// (détection du mode #test/standalone/config/fill). Importer ce module suffit à
// charger — et à câbler leurs propres écouteurs — tous les autres modules du widget.
import { $, show } from './dom.js';
import { ICONS } from './icons.js';
import { Theme } from '../../kit/js/theme.js';
import { Ambiance } from '../../kit/js/ambiance.js';
import { I18n } from '../../kit/js/i18n.js';
import { GfsLink } from '../../kit/js/gfs-link.js';
import { Dialogs } from '../../kit/js/dialogs.js';
import { applyBranding, updateThemeToggleIcon } from './theme.js';
import { STRINGS } from './strings.js';
import { diag, hashParams, fragmentFormLink } from './diag.js';
import { decideStartScreen } from './links.js';
import { resolveMyDefinition, loadDefinitionByRowId, closeManagedFormPublicLink, duplicateManagedForm } from './grist-meta.js';
import { state } from './state.js';
import { showConfig } from './config-editor.js';
import { renderFill, hasPendingFillAnswers } from './respond.js';
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

// « Nouveau » (porte "ouvrir" de GFS, fichier null) : repart de zéro, jamais un ancien formulaire
// gardé ouvert (consigne GFS 012, point 4).
function resetToNewForm() {
  state.options = {}; state.currentLink = null; state.currentFormSection = null; state.cfgQuestions = [];
  state.formRowId = null; state.formRowVsId = null; state.formRowTitle = undefined;
  if (GfsLink.hosted) GfsLink.storageSet(GFS_OPEN_ROW_KEY, null);
  // Un guide de publication non terminé (publish-guide.js) n'est PAS jeté ici : dans GFS, ouvrir la
  // page du formulaire dans Grist quitte la page de GFS, qui se recharge au retour - le seul moyen
  // de retrouver le guide est alors « Nouveau », que showConfig() reprend (resumePublishGuide).
  // « ‹ Choisir une autre méthode », en haut du guide, est la sortie de qui veut repartir de zéro.
}

// Consigne GFS 019 : GFS appelle « fermer » (onClose) avant de remplacer cette app par une autre,
// et le même risque vaut pour « ouvrir » (onOpen, plus bas) un autre fichier de Form+ - les deux
// détruisent ce qui est à l'écran. #config écrit déjà à chaque champ (rien n'y attend jamais, voir
// le commentaire d'onOpen plus bas) ; #fill n'écrit qu'à l'envoi (onSubmit, respond.js) - une
// réponse commencée s'y perdrait en silence sans cette question. Pas d'« Enregistrer » : Form+
// n'a aucun brouillon à garder, seulement envoyer (ce que la personne n'a pas fini de faire) ou
// abandonner.
async function confirmLeaveIfPending() {
  if (!hasPendingFillAnswers()) return true;
  return await Dialogs.confirm({
    title: I18n.t('form.respond.leaveTitle'),
    message: I18n.t('form.respond.leaveMsg'),
    confirmLabel: I18n.t('form.respond.leaveConfirmBtn'),
    danger: true,
  });
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
// Consigne GFS 016 : pose et suit l'ambiance que la personne a choisie dans GFS (un seul choix
// pour GFS et toutes ses apps) - jamais posée seule (Ambiance.start() ne fait rien hors GFS), et
// jamais sur l'aperçu/l'écran du répondant (#fill, .pv-* dans widget.css) : ils gardent l'aspect
// que la personne a dessiné pour SON formulaire, pas celui de GFS (même principe que --accent*
// via applyBranding, commentaire au sommet de widget.css).
// Consigne GFS 017 : dans GFS, la page se dessine sinon un instant dans ses couleurs d'origine
// avant l'ambiance (66 à 100 ms mesurés par GFS). [data-gfs-pending] (widget.css) cache le corps
// jusqu'à l'ambiance posée (ambiance.ready) ou, si GFS tarde ou que le kit manque, 2 s au plus.
// Consigne GFS 023 : POSÉ par js/gfs-pending.js (un script classique en <head>, avant les feuilles
// - ce module, lui, s'exécute après la première image, trop tard : 76 ms mesurés contre 16 ms).
// Retiré ici SANS CONDITION (jamais besoin de retester hostContract) : retirer un attribut absent
// ne fait rien, ce qui évite tout risque d'écart entre le test volontairement simple de l'autre
// script et celui-ci - seule, hors GFS, l'attribut n'est de toute façon jamais posé.
const ambiance = Ambiance.start();
const revealGfsPending = () => document.documentElement.removeAttribute('data-gfs-pending');
ambiance.ready.then(revealGfsPending);
setTimeout(revealGfsPending, 2000);
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
  // document (grist.docApi simulé) sans jamais y toucher. Chargée à la demande (consigne GFS 029) :
  // tests.js pèse près de 300 Ko et ne sert qu'avec #test, il ne doit pas alourdir l'ouverture.
  if (hashParams.has('test')) { const { runTests } = await import('./tests.js'); await runTests(); return; }
  const inIframe = window.self !== window.top;
  const ok = inIframe && await loadPluginApi();
  if (!ok) {
    // Consigne GFS 018 : `ok === null` veut dire que grist-plugin-api.js a chargé (l'évènement
    // "load" s'est déclenché) mais a planté à l'exécution (CSP sans 'unsafe-eval', panne vue par
    // le porteur le 04/11) - window.grist est alors resté vide. Un évènement à part dans le
    // diagnostic (visible à l'écran, `#diag-standalone`) plutôt que le "standalone" générique :
    // ce n'est pas que l'app est seule hors de Grist, c'est que le chargement a échoué en plein
    // milieu, souvent dans Grist/GFS même.
    diag({ event: ok === null ? 'pluginApiBroken' : 'standalone', inIframe });
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
    // FormPlus enregistre à chaque champ sur #config (pas de bouton "Enregistrer"), donc rien n'y
    // est jamais en attente ; sur #fill, confirmLeaveIfPending (consigne GFS 019, ci-dessus) pose
    // la question d'abord si une réponse est en cours.
    GfsLink.onOpen(async ({ fichier }) => {
      if (!(await confirmLeaveIfPending())) return false;
      if (!fichier) {
        if (state.formRowId == null) return true; // déjà sur l'écran de départ
        resetToNewForm();
        state.stayOnConfig = true;
        await showConfig();
        return true;
      }
      if (state.formRowId != null && String(state.formRowId) === String(fichier.id)) return true; // déjà ouvert
      return await openRow(fichier.id);
    });
    // Consigne GFS 019 : GFS détruit le cadre de cette app dès que la réponse est { ferme: true } -
    // jamais avant, et jamais nous-mêmes (point 3 de la consigne).
    GfsLink.onClose(async () => confirmLeaveIfPending());
    // Consigne GFS 020 (kit 0.10.0) : GFS met un fichier à la corbeille depuis son explorateur -
    // ferme son lien public (closeManagedFormPublicLink, grist-meta.js) avant que GFS ne retire sa
    // ligne de FormPlus_Formulaires (qu'il garde lui-même, pour la restaurer). Jamais le fichier
    // qu'affiche CE cadre forcément : fichier.id vient de l'explorateur, pas de state.formRowId.
    GfsLink.onDelete(async ({ fichier }) => {
      try {
        await closeManagedFormPublicLink(fichier.id);
        return { fait: true, dit: I18n.t('form.gfs.deleteClosedLink') };
      } catch (e) {
        return { fait: false, dit: I18n.t('form.gfs.deleteFailed') };
      }
    });
    // Consigne GFS 021 (kit 0.10.0) : GFS copie un fichier depuis son explorateur - duplicateManagedForm
    // (grist-meta.js) copie la section native, la définition et les questions sous le nom déjà
    // calculé par GFS, avec sa propre table de réponses vide, jamais publiée.
    // Consigne GFS 026, point 3 : cette table nouvelle naît sans fenêtre d'accord (guide 1.1,
    // règle 4) - choix délibéré, pas un oubli. Une fenêtre à ce moment précis attendrait un clic
    // de la personne alors que Form+ n'est pas forcément l'écran affiché (GFS vient de l'appeler
    // depuis son explorateur) : elle resterait invisible, et GFS abandonnerait l'appel au bout de
    // 20 s (contrats 5.4) en disant à la personne que Form+ ne répond pas - pire que l'absence de
    // fenêtre. Le geste « Dupliquer » lui-même, déjà explicitement demandé par la personne sur UN
    // formulaire dont elle sait qu'il a sa table de réponses, en tient lieu (hypothèse de GFS,
    // reprise ici) ; `dit` dit quand même le nom de cette table, pour qu'elle le sache sans avoir
    // à cliquer.
    GfsLink.onDuplicate(async ({ fichier, nom }) => {
      try {
        const copy = await duplicateManagedForm(fichier.id, nom);
        if (!copy) return { dit: I18n.t('form.gfs.duplicateNotFound') };
        return { id: copy.id, dit: I18n.t('form.gfs.duplicateNotPublished', { table: copy.tableId }) };
      } catch (e) {
        return { dit: I18n.t('form.gfs.duplicateFailed') };
      }
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
    // « Nouveau » (raison 'nouveau', consigne GFS 012, point 4) décide avant même fichier/storedRow
    // : sans ce test, fichier null ne faisait qu'échouer le premier `if` ci-dessous, puis le
    // formulaire gardé ouvert (storedRow) ou resolveMyDefinition() rouvraient silencieusement un
    // ancien formulaire au tout premier chargement du cadre - jamais l'écran de départ demandé.
    const isNew = wanted?.raison === 'nouveau';
    if (isNew) resetToNewForm();
    else if (wanted?.fichier) opened = await openRow(wanted.fichier.id);
    if (!isNew && !opened && GfsLink.hosted) {
      const storedRow = GfsLink.storageGet(GFS_OPEN_ROW_KEY);
      if (storedRow) opened = await openRow(storedRow);
    }
    if (!isNew && !opened) {
      // Depuis la consigne 007, plus de lecture de `opts` (grist.onOptions ne garde ici que son
      // rôle de signal "connecté", le courtier de GFS le rend de toute façon inerte) : la
      // Definition de cette instance vient de FormPlus_Formulaires (ou, repli, des réglages de vue
      // d'un formulaire pas encore migré) — voir resolveMyDefinition.
      state.options = await resolveMyDefinition();
    }
    diag({ event: 'onOptions', optionKeys: Object.keys(state.options), hasFormLink: !!state.options.formLink, settings, gfsOpened: opened, isNew });
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
