// Guide de publication : l'assistant en 3 étapes qui s'affiche juste après « Créer le formulaire »
// (config-editor.js, createEmptyForm). Le formulaire natif vide vit sur une page neuve de Grist.
// Aucune méthode de l'API plugin n'expose la clé de partage que génère « Publier » (mesuré sur un
// vrai Grist, tests/grist-env/probe-share-key.js : ni l'API plugin, ni le REST, ni le presse-papiers,
// ni la page qui affiche le lien), donc la personne doit la copier elle-même dans Grist. Tout le
// reste, Form+ le fait :
//   1. publier : un bouton ici (publishFormSection, grist-meta.js) fait ce que fait « Publier » dans
//      Grist, sans la page à ouvrir ni la confirmation. Refusé (GFS, tant que son manifeste ne déclare
//      pas ces écritures), il laisse la place au geste à la main : ouvrir la page, Publier, confirmer,
//      l'étape se coche alors toute seule (Form+ relit shareOptions de la section toutes les 2,5 s et
//      au retour sur l'onglet, ce qui vaut aussi pour une publication faite à la main d'emblée) ;
//   2. copier le lien : ouvrir la page (bouton « Ouvrir la page », lien direct quand l'adresse est
//      sûre, sinon son nom et sa place dans la liste), Partager > Copier le lien ;
//   3. le coller ici : le formulaire se prépare dès que le lien est reconnu, sans autre clic.
// Avant ce guide (retour d'Antoine, 9 nov 2026) tout tenait dans un paragraphe qui ne disait ni où
// était la page (« New page », tout en bas de la liste, sous une autre page « <table> » qui est la
// grille), ni qu'il fallait 4 clics (Publier, confirmer, Partager, Copier le lien) au lieu de 2. Le
// même jour, Antoine a choisi que Form+ publie lui-même (il en reste 2 dans Grist).
//
// Le guide n'est pas une porte à passer pour avancer (demande d'Antoine, 9 nov 2026 : « construire sans
// avoir collé le lien, avec un rappel qu'il n'est pas publié ») : « Construire le formulaire d'abord »
// ouvre l'éditeur tout de suite, publié ou non, lien collé ou non (buildNow, config-editor.js :
// buildWithoutLink). Le bandeau de l'éditeur rappelle ce qu'il reste à faire et rouvre ce guide en mode
// RATTACHEMENT (startAttachGuide) : mêmes étapes, sur la copie déjà construite ; publier marque la copie ET
// la section d'origine de la page (Grist n'affiche « Partager » que sur une section publiée), le lien collé
// s'ajoute au formulaire sans rien recréer (attachLink). La clé reste, elle, à copier dans Grist.
//
// Le parcours survit à un rechargement (la personne qui clique la page dans la barre latérale de
// Grist, au lieu du bouton, fait recharger le widget) : il est noté sous PENDING_KEY (GfsLink.
// storageSet : chez GFS, ou dans le navigateur seul) avec le document, la table, la page et la
// section, et repris tant que cette section existe encore.
import { $, esc } from './dom.js';
import { I18n } from '../../kit/js/i18n.js';
import { GfsLink } from '../../kit/js/gfs-link.js';
import { Dialogs } from '../../kit/js/dialogs.js';
import './strings.js'; // enregistre form.* avant tout usage de I18n.t() au chargement de ce module (voir strings.js)
import { parseFormLink } from './links.js';
import { fetchMeta, tableIdOfRef, gristPageUrl, nameFormPage, isSectionPublished, publishFormSection, completeSectionPublication } from './grist-meta.js';
import { diag } from './diag.js';

export const PENDING_KEY = 'formplus_pending_guide';
export const POLL_MS = 2500;

// Posé par config-editor.js (évite l'import circulaire) : show(vue) affiche une vue de l'écran de
// départ (showStartView), onLink(lien, élémentMessage) prépare le formulaire (generate).
// hosted() dit si GFS héberge l'app : sa fenêtre d'ouverture hérite alors du bac à sable (origine nulle,
// stockage refusé), donc une page de Grist ouverte depuis ce cadre ne fonctionnerait pas.
// onAttach(lien, élémentMessage) -> vrai quand le lien est enregistré (mode rattachement, ci-dessous) ;
// onBuild({ sourceVsId, published, msgEl }) prépare le formulaire SANS lien (« Construire d'abord ») ;
// onBack({ linked }) rend la main à l'éditeur.
const hooks = { show: () => {}, onLink: async () => {}, onAttach: async () => false, onBuild: async () => {}, onBack: () => {}, onExtraTables: () => ({ writes: [], reads: [] }), hosted: () => GfsLink.hosted };
export function initPublishGuide(h) { Object.assign(hooks, h); wire(); }

let G = null;        // le parcours en cours : { tableId, viewRef, sectionId, attach, sourceVsId, pageName, pageUrl, opened, published, publishing, refused, busy }
let timer = null;
let listening = false;

export function currentPublishGuide() { return G; }

async function docName() {
  try { return String(await grist.docApi.getDocName()); } catch (e) { return ''; }
}
// 1 tant que le formulaire n'est pas publié ; 2 une fois publié (copier le lien dans Grist) ; 3 quand la
// personne dit avoir le lien (ou a ouvert la page) : le champ de collage.
function stepNumber() { return !G.published ? 1 : G.opened ? 3 : 2; }

async function remember() {
  const doc = await docName();
  GfsLink.storageSet(PENDING_KEY, JSON.stringify({ doc, tableId: G.tableId, viewRef: G.viewRef, sectionId: G.sectionId, pageName: G.pageName }));
}

// Commence le parcours pour la section `sectionId` que createEmptyForm vient de poser sur la page
// neuve `viewRef` : la renomme d'après la table (« New page » ne dit rien), cherche son adresse
// directe, affiche l'étape 1.
export async function startPublishGuide({ tableId, viewRef, sectionId }) {
  const { name } = await nameFormPage(viewRef, I18n.t('form.guide.pageName', { table: tableId }));
  const hosted = !!hooks.hosted();
  G = { tableId, viewRef, sectionId, pageName: name, hosted, pageUrl: await gristPageUrl(viewRef, hosted), opened: false, published: false, publishing: false, refused: false, busy: false };
  await remember();
  showGuide();
}

// Mode « rattachement » : le formulaire est DÉJÀ construit (config-editor.js, buildWithoutLink), il lui
// manque d'être publié et/ou son lien. `sectionId` est la section que Form+ gère (sa copie), `sourceVsId`
// la section native d'origine, sur la même page : si la personne publie celle-ci à la main, la copie
// suit toute seule (refreshPublication). Rien n'est créé ni renommé, rien n'est noté pour un
// rechargement (le bandeau de l'éditeur ramène ici). « Retour au formulaire » quitte sans rien changer.
export async function startAttachGuide({ tableId, viewRef, sectionId, sourceVsId }) {
  let pageName = '';
  try {
    const views = await fetchMeta('_grist_Views');
    const i = views.id.indexOf(viewRef);
    if (i >= 0) pageName = String(views.name[i] || '');
  } catch (e) { /* nom illisible (GFS sans cette lecture) : le guide s'en passe */ }
  const hosted = !!hooks.hosted();
  G = { tableId, viewRef, sectionId, attach: true, sourceVsId: sourceVsId ?? null, pageName, hosted, pageUrl: await gristPageUrl(viewRef, hosted), opened: false, published: false, publishing: false, refused: false, busy: false };
  showGuide();
}

// Reprend un parcours noté par un chargement précédent, quand il vaut encore : même document, la
// section existe toujours (sur la même page, pour la même table). Rend vrai quand le guide est
// affiché. Un parcours d'un AUTRE document n'est ni repris ni effacé (le sien le retrouvera).
export async function resumePublishGuide() {
  if (G) { showGuide(); return true; }
  let rec = null;
  try { rec = JSON.parse(GfsLink.storageGet(PENDING_KEY) || 'null'); } catch (e) { rec = null; }
  if (!rec || !Number.isInteger(rec.sectionId) || !Number.isInteger(rec.viewRef) || !rec.tableId) return false;
  if (rec.doc && rec.doc !== await docName()) return false;
  const sections = await fetchMeta('_grist_Views_section');
  const idx = sections.id.indexOf(rec.sectionId);
  const stillThere = idx >= 0 && sections.parentId[idx] === rec.viewRef && sections.parentKey[idx] === 'form'
    && await tableIdOfRef(sections.tableRef[idx]) === rec.tableId;
  if (!stillThere) { GfsLink.storageSet(PENDING_KEY, null); return false; }
  const hosted = !!hooks.hosted();
  G = { tableId: rec.tableId, viewRef: rec.viewRef, sectionId: rec.sectionId, pageName: rec.pageName || '', hosted, pageUrl: await gristPageUrl(rec.viewRef, hosted), opened: false, published: false, publishing: false, refused: false, busy: false };
  showGuide();
  return true;
}

// Fin du parcours (formulaire préparé, abandon, ou « Nouveau ») : plus rien à attendre ni à garder.
export function forgetPublishGuide() {
  stopWatching();
  G = null;
  GfsLink.storageSet(PENDING_KEY, null);
}

function showGuide() {
  renderGuide();
  hooks.show('guide');
  watch();
  refreshPublication(); // sans attendre le premier tour du minuteur : un guide repris peut être déjà publié
}

// ───────────────────────── Attente de la publication ─────────────────────────
// Exposé pour les essais, qui l'appellent directement plutôt que d'attendre le minuteur.
export async function refreshPublication() {
  if (!G || G.published) return;
  try {
    let published = await isSectionPublished(G.sectionId);
    // Mode rattachement : la page porte DEUX sections de formulaire, la copie que Form+ gère et la section
    // d'origine (vide), côte à côte. Grist n'affiche « Partager » que sur une section publiée : si la
    // personne en publie une à la main (celle d'origine est la première qu'elle voit), Form+ marque
    // lui-même l'autre. Le partage de la page existe alors, la clé aussi, rien d'autre à écrire ; et
    // rien de plus n'est exposé (même table, même clé, une section d'origine sans aucun champ).
    if (G.attach && G.sourceVsId != null && G.sourceVsId !== G.sectionId) {
      try {
        const sourcePublished = await isSectionPublished(G.sourceVsId);
        if (published === false && sourcePublished) { await completeSectionPublication(G.sectionId); published = true; }
        else if (published && sourcePublished === false) await completeSectionPublication(G.sourceVsId);
      } catch (e) { diag({ event: 'completePublicationFailed', message: e && e.message }); }
    }
    if (published === null) { // la section n'existe plus : la page a été supprimée dans Grist
      stopWatching();
      $('guide-msg').innerHTML = `<span class="err">${I18n.t('form.guide.pageGone', { page: esc(G.pageName) })}</span>`;
      return;
    }
    if (published && G && !G.published) { G.published = true; G.publishing = false; stopWatching(); renderGuide(); }
  } catch (e) { /* lecture momentanément impossible : le prochain tour réessaie */ }
}
function onWake() { if (document.visibilityState !== 'hidden') refreshPublication(); }
function watch() {
  stopWatching();
  if (!G || G.published) return;
  timer = setInterval(refreshPublication, POLL_MS);
  document.addEventListener('visibilitychange', onWake);
  window.addEventListener('focus', onWake);
  listening = true;
}
function stopWatching() {
  clearInterval(timer); timer = null;
  if (listening) { document.removeEventListener('visibilitychange', onWake); window.removeEventListener('focus', onWake); listening = false; }
}
function focusPaste() { const el = $('guide-link'); if (el) el.focus({ preventScroll: true }); }

// ───────────────────────── Affichage ─────────────────────────
const stepClass = (n, current) => (n < current ? 'done' : n === current ? 'active' : 'future');

export function renderGuide() {
  const root = $('start-panel-guide');
  if (!root || !G) return;
  const current = stepNumber();
  const table = esc(G.tableId);
  const page = esc(G.pageName);
  const t = (k, v) => I18n.t(k, v);
  const mark = (n) => (n < current ? '✓' : String(n));
  const pct = [0, 12, 45, 80][current];

  // Hébergé par GFS, un lien s'ouvrirait dans un onglet qui hérite du bac à sable de GFS : Grist n'y
  // marcherait pas. On donne alors l'adresse à copier (le presse-papiers, lui, s'écrit), à coller
  // dans un onglet ordinaire - cet onglet-ci, avec le guide, reste ouvert.
  const open = !G.pageUrl ? `<p class="muted guide-noLink">${t('form.guide.s2.noLink')}</p>`
    : G.hosted ? `<button type="button" class="primary" id="guide-copy" data-guide="copy">${t('form.guide.s2.copy')}</button>`
    : `<a class="guide-open" id="guide-open" data-guide="open" href="${esc(G.pageUrl)}" target="_blank" rel="noopener">${t('form.guide.s2.open')} ↗</a>`;
  const side = `<div class="guide-pic guide-side" aria-hidden="true"><span class="sk"></span><span class="sk"></span><span class="sk short"></span><span class="you-row"><span class="you">${page}</span><em>${t('form.guide.s2.here')}</em></span></div>`;
  // Un formulaire construit avant sa publication peut avoir des questions qui écrivent dans d'autres tables ou
  // lisent d'autres listes : la publication ouvre aussi celles-là (même clé), la phrase le dit avant le clic.
  const extra = G.attach ? hooks.onExtraTables() : { writes: [], reads: [] };
  const list = (a) => a.map(x => `« ${esc(x)} »`).join(', ');
  const access = `<p class="muted">${t('form.guide.s1.access', { table })}</p>`
    + (extra.writes.length ? `<p class="muted">${t('form.guide.s1.accessWrites', { tables: list(extra.writes) })}</p>` : '')
    + (extra.reads.length ? `<p class="muted">${t('form.guide.s1.accessReads', { tables: list(extra.reads) })}</p>` : '');

  // Étape 1 : le bouton qui publie. Si Grist (ou GFS) le refuse, la publication à la main, avec la
  // page à ouvrir et l'attente qui se coche toute seule.
  const publishBody = G.refused
    ? `<div class="guide-body">
      <p>${t('form.guide.manual.text', { page })}</p>
      <div class="guide-row">${open}</div>
      ${side}
      <div class="guide-pic guide-bar" aria-hidden="true"><span>${t('form.guide.btn.preview')}</span><span class="hl">${t('form.guide.btn.publish')}</span></div>
      ${access}
      <p class="guide-wait muted" role="status"><span class="guide-dot" aria-hidden="true"></span>${t('form.guide.manual.waiting')}</p>
    </div>`
    : `<div class="guide-body">
      <p>${t('form.guide.s1.text', { table })}</p>
      ${access}
      <div class="guide-row"><button type="button" class="primary" id="guide-publish" data-guide="publish"${G.publishing ? ' disabled' : ''}>${G.publishing ? t('form.guide.s1.working') : t('form.guide.s1.btn')}</button></div>
    </div>`;
  const s1 = current !== 1 ? '' : publishBody;

  const s2 = current !== 2 ? '' : `<div class="guide-body">
      <p>${t('form.guide.s2.text', { page })}</p>
      <div class="guide-row">${open}<button type="button" class="qf-link" data-guide="opened">${t('form.guide.s2.copiedBtn')}</button></div>
      ${side}
      <div class="guide-pic guide-bar" aria-hidden="true"><span class="hl">${t('form.guide.btn.share')}</span><i>›</i><span class="hl">${t('form.guide.btn.copyLink')}</span></div>
    </div>`;

  const s3 = current !== 3 ? '' : `<div class="guide-body">
      <p>${t('form.guide.s3.text')}</p>
      <div class="guide-paste">
        <input id="guide-link" type="url" autocomplete="off" spellcheck="false" placeholder="${esc(t('form.guide.s3.placeholder'))}" aria-label="${esc(t('form.guide.s3.aria'))}">
        <button type="button" id="guide-clip" data-guide="clip">${t('form.link.pasteBtn')}</button>
        <button type="button" id="guide-go" class="primary" data-guide="go">${t('form.guide.s3.goBtn')}</button>
      </div>
      <p class="muted">${t('form.guide.s3.hint')}</p>
    </div>`;

  const li = (n, title, doneTitle, body) => `<li class="guide-step ${stepClass(n, current)}"${n === current ? ' aria-current="step"' : ''}>
      <span class="guide-num" aria-hidden="true">${mark(n)}</span>
      <span class="guide-title">${n < current ? doneTitle : title}</span>${body}</li>`;

  // « Construire d'abord » : on n'est pas obligé de finir ici pour avancer. Le formulaire se construit
  // tout de suite, publié ou non, lien collé ou non ; l'éditeur rappelle ce qu'il reste à faire (bandeau
  // en haut) et rouvre ce guide d'un clic. Pas en mode rattachement, où « Retour au formulaire » suffit.
  const later = G.attach ? '' : `<div class="guide-later">
      <p>${t('form.guide.build.text')}</p>
      <button type="button" id="guide-build" data-guide="build"${G.busy ? ' disabled' : ''}>${t('form.guide.build.btn')}</button>
    </div>`;
  root.innerHTML = `<button type="button" class="qf-link start-back" data-guide="cancel">${t(G.attach ? 'form.guide.attach.back' : 'form.guide.cancel')}</button>
    <div class="guide-head"><h2>${t('form.guide.title')}</h2><span class="muted">${t('form.guide.stepOf', { n: current })}</span></div>
    <p class="muted">${t('form.guide.intro', { table })}</p>
    <div class="guide-progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <ol class="guide-steps">
      ${li(1, t('form.guide.s1.title'), t('form.guide.s1.titleDone'), s1)}
      ${li(2, t('form.guide.s2.title'), t('form.guide.s2.titleDone'), s2)}
      ${li(3, t('form.guide.s3.title'), t('form.guide.s3.title'), s3)}
    </ol>
    ${later}
    <p id="guide-msg" class="muted" role="status" aria-live="polite"></p>`;
}

// Le bouton « Publier le formulaire ». Un refus (GFS, ou Grist qui ne reconnaît pas l'une des
// écritures) n'est jamais une erreur pour la personne : le guide passe au geste à la main, et la
// lecture de shareOptions continue de guetter la publication, de quelque façon qu'elle vienne.
export async function publishNow() {
  if (!G || G.published || G.publishing) return;
  G.publishing = true;
  renderGuide();
  try {
    await publishFormSection(G.viewRef, G.sectionId);
    // Mode rattachement : la section d'origine, sur la même page, l'est aussi (voir refreshPublication) -
    // sinon Grist y montre « Publier » au lieu de « Partager » et la personne ne sait plus quoi cliquer.
    if (G && G.attach && G.sourceVsId != null && G.sourceVsId !== G.sectionId) {
      try { await completeSectionPublication(G.sourceVsId); } catch (e) { diag({ event: 'completePublicationFailed', message: e && e.message }); }
    }
    if (!G) return;
    G.publishing = false; G.published = true; stopWatching();
  } catch (e) {
    diag({ event: 'publishFormRefused', message: e && e.message });
    if (!G) return;
    G.publishing = false; G.refused = true;
  }
  renderGuide();
}

// ───────────────────────── Gestes ─────────────────────────
// Le lien arrive par le collage (jamais en tapant : « …/forms/CLÉ/1 » est déjà un lien valable
// pendant qu'on écrit « …/12 »), par la touche Entrée, par « Continuer » ou par « Coller ».
export async function submitGuideLink(raw) {
  const msg = $('guide-msg');
  const value = String(raw || '').trim();
  if (!G || !value || G.busy) return;
  if (!parseFormLink(value)) { msg.innerHTML = `<span class="err">${I18n.t('form.editor.linkNotRecognized')}</span>`; return; }
  G.busy = true;
  msg.textContent = I18n.t('form.guide.s3.working');
  try {
    if (G.attach) {
      if (await hooks.onAttach(value, msg)) { forgetPublishGuide(); hooks.onBack({ linked: true }); }
    } else await hooks.onLink(value, msg);
  } finally { if (G) G.busy = false; }
}

// « Construire le formulaire d'abord » : on quitte le guide pour l'éditeur, sans lien.
export async function buildNow() {
  if (!G || G.attach || G.busy) return;
  G.busy = true;
  const btn = $('guide-build');
  if (btn) btn.disabled = true;
  const args = { sourceVsId: G.sectionId, published: G.published, msgEl: $('guide-msg') };
  // Pas de renderGuide() ensuite : il effacerait le message d'erreur que la préparation vient d'écrire.
  try { await hooks.onBuild(args); } finally { if (G) G.busy = false; const b = $('guide-build'); if (b) b.disabled = false; }
}

function wire() {
  const root = $('start-panel-guide');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';
  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-guide]');
    if (!el || !G) return;
    const what = el.dataset.guide;
    if (what === 'cancel') {
      const back = G.attach;
      forgetPublishGuide();
      if (back) hooks.onBack(); else hooks.show('choices');
    }
    else if (what === 'build') buildNow();
    else if (what === 'copy') {
      try { await navigator.clipboard.writeText(G.pageUrl); el.textContent = I18n.t('form.guide.s2.copied'); $('guide-msg').textContent = I18n.t('form.guide.s2.pasteInTab'); }
      catch (err) { await Dialogs.prompt({ title: I18n.t('form.guide.s2.copy'), message: I18n.t('form.editor.copyFallbackMsg'), value: G.pageUrl }); }
    }
    else if (what === 'publish') publishNow();
    else if (what === 'open' || what === 'opened') {
      // Le lien s'ouvre d'abord (action par défaut du clic) : on ne redessine qu'après, sinon
      // l'ancre disparaît avant d'avoir navigué. Avant la publication (geste à la main), ouvrir la
      // page ne fait pas avancer le guide : il reste à publier.
      setTimeout(() => { if (G && G.published && !G.opened) { G.opened = true; renderGuide(); focusPaste(); } }, 0);
    } else if (what === 'go') submitGuideLink($('guide-link')?.value);
    else if (what === 'clip') {
      try { const text = await navigator.clipboard.readText(); $('guide-link').value = text.trim(); submitGuideLink(text); }
      catch (err) { $('guide-msg').textContent = I18n.t('form.editor.clipboardReadDenied'); focusPaste(); }
    }
  });
  root.addEventListener('paste', (e) => { if (e.target.id === 'guide-link') setTimeout(() => submitGuideLink(e.target.value), 0); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'guide-link') submitGuideLink(e.target.value); });
}
