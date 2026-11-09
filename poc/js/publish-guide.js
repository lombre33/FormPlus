// Guide de publication : l'assistant en 3 étapes qui s'affiche juste après « Créer le formulaire »
// (config-editor.js, createEmptyForm). Le formulaire natif vide vit sur une page neuve de Grist ;
// il reste à la personne trois gestes que le widget ne peut pas faire à sa place - aucune méthode
// de l'API plugin n'expose la clé de partage que génère « Publier » (voir createEmptyForm) :
//   1. ouvrir cette page (bouton « Ouvrir la page », lien direct quand l'adresse est sûre, sinon
//      son nom et sa place dans la liste) ;
//   2. cliquer Publier, puis confirmer - l'étape se coche toute seule, Form+ relit shareOptions de
//      la section toutes les 2,5 s et au retour sur l'onglet ;
//   3. Partager > Copier le lien, puis coller ici : le formulaire se prépare dès que le lien est
//      reconnu, sans autre clic.
// Avant ce guide (retour d'Antoine, 9 nov 2026) tout tenait dans un paragraphe qui ne disait ni où
// était la page (« New page », tout en bas de la liste, sous une autre page « <table> » qui est la
// grille), ni qu'il fallait 4 clics (Publier, confirmer, Partager, Copier le lien) au lieu de 2.
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
import { fetchMeta, tableIdOfRef, gristPageUrl, nameFormPage, isSectionPublished } from './grist-meta.js';

export const PENDING_KEY = 'formplus_pending_guide';
export const POLL_MS = 2500;

// Posé par config-editor.js (évite l'import circulaire) : show(vue) affiche une vue de l'écran de
// départ (showStartView), onLink(lien, élémentMessage) prépare le formulaire (generate).
// hosted() dit si GFS héberge l'app : sa fenêtre d'ouverture hérite alors du bac à sable (origine nulle,
// stockage refusé), donc une page de Grist ouverte depuis ce cadre ne fonctionnerait pas.
const hooks = { show: () => {}, onLink: async () => {}, hosted: () => GfsLink.hosted };
export function initPublishGuide(h) { Object.assign(hooks, h); wire(); }

let G = null;        // le parcours en cours : { tableId, viewRef, sectionId, pageName, pageUrl, opened, published, busy }
let timer = null;
let listening = false;

export function currentPublishGuide() { return G; }

async function docName() {
  try { return String(await grist.docApi.getDocName()); } catch (e) { return ''; }
}
function stepNumber() { return G.published ? 3 : G.opened ? 2 : 1; }

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
  G = { tableId, viewRef, sectionId, pageName: name, hosted, pageUrl: await gristPageUrl(viewRef, hosted), opened: false, published: false, busy: false };
  await remember();
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
  G = { tableId: rec.tableId, viewRef: rec.viewRef, sectionId: rec.sectionId, pageName: rec.pageName || '', hosted, pageUrl: await gristPageUrl(rec.viewRef, hosted), opened: false, published: false, busy: false };
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
    const published = await isSectionPublished(G.sectionId);
    if (published === null) { // la section n'existe plus : la page a été supprimée dans Grist
      stopWatching();
      $('guide-msg').innerHTML = `<span class="err">${I18n.t('form.guide.pageGone', { page: esc(G.pageName) })}</span>`;
      return;
    }
    if (published && G && !G.published) { G.published = true; stopWatching(); renderGuide(); focusPaste(); }
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
  const open = !G.pageUrl ? `<p class="muted guide-noLink">${t('form.guide.s1.noLink')}</p>`
    : G.hosted ? `<button type="button" class="primary" id="guide-copy" data-guide="copy">${t('form.guide.s1.copy')}</button>`
    : `<a class="guide-open" id="guide-open" data-guide="open" href="${esc(G.pageUrl)}" target="_blank" rel="noopener">${t('form.guide.s1.open')} ↗</a>`;
  const side = `<div class="guide-pic guide-side" aria-hidden="true"><span class="sk"></span><span class="sk"></span><span class="sk short"></span><span class="you-row"><span class="you">${page}</span><em>${t('form.guide.s1.here')}</em></span></div>`;
  const s1 = current > 1 ? '' : `<div class="guide-body">
      <p>${t('form.guide.s1.text', { page })}</p>
      <div class="guide-row">${open}<button type="button" class="qf-link" data-guide="opened">${G.pageUrl && !G.hosted ? t('form.guide.s1.already') : t('form.guide.s1.openedBtn')}</button></div>
      ${side}
    </div>`;

  const s2 = current !== 2 ? '' : `<div class="guide-body">
      <p>${t('form.guide.s2.text')}</p>
      <div class="guide-pic guide-bar" aria-hidden="true"><span>${t('form.guide.btn.preview')}</span><span class="hl">${t('form.guide.btn.publish')}</span></div>
      <p class="muted">${t('form.guide.s2.access', { table })}</p>
      <p class="guide-wait muted" role="status"><span class="guide-dot" aria-hidden="true"></span>${t('form.guide.s2.waiting')}</p>
    </div>`;

  const s3 = current !== 3 ? '' : `<div class="guide-body">
      <p>${t('form.guide.s3.text')}</p>
      <div class="guide-pic guide-bar" aria-hidden="true"><span class="hl">${t('form.guide.btn.share')}</span><i>›</i><span class="hl">${t('form.guide.btn.copyLink')}</span></div>
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

  root.innerHTML = `<button type="button" class="qf-link start-back" data-guide="cancel">${t('form.guide.cancel')}</button>
    <div class="guide-head"><h2>${t('form.guide.title')}</h2><span class="muted">${t('form.guide.stepOf', { n: current })}</span></div>
    <p class="muted">${t('form.guide.intro', { table })}</p>
    <div class="guide-progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <ol class="guide-steps">
      ${li(1, t('form.guide.s1.title'), t('form.guide.s1.titleDone'), s1)}
      ${li(2, t('form.guide.s2.title'), t('form.guide.s2.titleDone'), s2)}
      ${li(3, t('form.guide.s3.title'), t('form.guide.s3.title'), s3)}
    </ol>
    <p id="guide-msg" class="muted" role="status" aria-live="polite"></p>`;
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
  try { await hooks.onLink(value, msg); } finally { if (G) G.busy = false; }
}

function wire() {
  const root = $('start-panel-guide');
  if (!root || root.dataset.wired) return;
  root.dataset.wired = '1';
  root.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-guide]');
    if (!el || !G) return;
    const what = el.dataset.guide;
    if (what === 'cancel') { forgetPublishGuide(); hooks.show('choices'); }
    else if (what === 'copy') {
      try { await navigator.clipboard.writeText(G.pageUrl); el.textContent = I18n.t('form.guide.s1.copied'); $('guide-msg').textContent = I18n.t('form.guide.s1.pasteInTab'); }
      catch (err) { await Dialogs.prompt({ title: I18n.t('form.guide.s1.copy'), message: I18n.t('form.editor.copyFallbackMsg'), value: G.pageUrl }); }
    }
    else if (what === 'open' || what === 'opened') {
      // Le lien s'ouvre d'abord (action par défaut du clic) : on ne redessine qu'après, sinon
      // l'ancre disparaît avant d'avoir navigué.
      setTimeout(() => { if (G && !G.opened) { G.opened = true; renderGuide(); } }, 0);
    } else if (what === 'go') submitGuideLink($('guide-link')?.value);
    else if (what === 'clip') {
      try { const text = await navigator.clipboard.readText(); $('guide-link').value = text.trim(); submitGuideLink(text); }
      catch (err) { $('guide-msg').textContent = I18n.t('form.editor.clipboardReadDenied'); focusPaste(); }
    }
  });
  root.addEventListener('paste', (e) => { if (e.target.id === 'guide-link') setTimeout(() => submitGuideLink(e.target.value), 0); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'guide-link') submitGuideLink(e.target.value); });
}
