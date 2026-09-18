import { $, show, esc } from './dom.js';
import { parseCustomView, myPageFromReferrer } from './links.js';
import { diag } from './diag.js';

export async function fetchMeta(tableId) { return grist.docApi.fetchTable(tableId); }
export async function getTableRef(tableId) {
  const t = await fetchMeta('_grist_Tables');
  const i = t.tableId.indexOf(tableId);
  return i >= 0 ? t.id[i] : null;
}
export async function tableIdOfRef(tableRef) {
  const t = await fetchMeta('_grist_Tables');
  const i = t.id.indexOf(tableRef);
  return i >= 0 ? t.tableId[i] : null;
}
export async function getColRef(tableId, colId) {
  const tref = await getTableRef(tableId);
  const c = await fetchMeta('_grist_Tables_column');
  for (let i = 0; i < c.id.length; i++) if (c.parentId[i] === tref && c.colId[i] === colId) return c.id[i];
  return null;
}
export async function colExists(tableId, colId) { return (await getColRef(tableId, colId)) !== null; }
export function columnOptions(tableData) {
  return Object.keys(tableData).filter(k => k !== 'id' && !k.startsWith('gristHelper') && k !== 'manualSort');
}
export function fillSelect(sel, values, labels, selected) {
  sel.innerHTML = values.map((v, i) => `<option value="${esc(v)}" ${selected != null && String(v) === String(selected) ? 'selected' : ''}>${esc(labels ? labels[i] : v)}</option>`).join('');
}
export async function getFormTableId(vsId) {
  const sections = await fetchMeta('_grist_Views_section');
  const idx = sections.id.indexOf(vsId);
  if (idx < 0) return null;
  return tableIdOfRef(sections.tableRef[idx]);
}
// Tables ayant un formulaire natif PUBLIÉ sur la page donnée (nécessaire pour qu'une clé
// accorde l'écriture — voir ACLRulesReader._addRulesForShare).
export async function formTablesOnPage(viewRef) {
  const s = await fetchMeta('_grist_Views_section');
  const out = [];
  for (let i = 0; i < s.id.length; i++) {
    if (s.parentId[i] !== viewRef || s.parentKey[i] !== 'form') continue;
    let opt = {}; try { opt = JSON.parse(s.shareOptions[i] || '{}') || {}; } catch (e) { /* ignore */ }
    if (opt.publish && opt.form) out.push(s.tableRef[i]);
  }
  return Promise.all(out.map(tableIdOfRef));
}

// Retrouve, pour une page déjà publiée, la clé de partage déjà générée par « Publier » — sans
// que le concepteur ait besoin de la copier-coller. D'après docs/01-etude-comparative.md
// (ACLRulesReader.ts, vérifié dans le code source) : _grist_Pages.shareRef pointe vers la ligne
// _grist_Shares dont le linkId EST la clé utilisée dans /forms/<clé>/... et /s/<clé>/... Terrain
// non vérifié en direct sur un document réel (pas d'accès à un document Grist depuis cet
// environnement) : en cas d'échec, renvoie null sans jamais lever d'erreur, et journalise les
// noms de colonnes réellement lus dans _grist_Shares pour corriger rapidement si le schéma
// diffère. Le champ « coller un lien manuellement » reste toujours disponible en repli.
export async function findExistingShareKey(viewRef) {
  try {
    const pages = await fetchMeta('_grist_Pages');
    const pIdx = pages.viewRef.indexOf(viewRef);
    if (pIdx < 0) { diag({ event: 'findExistingShareKey-no-page', viewRef }); return null; }
    const shareRef = pages.shareRef[pIdx];
    if (!shareRef) { diag({ event: 'findExistingShareKey-no-shareRef', viewRef }); return null; }
    const shares = await fetchMeta('_grist_Shares');
    const sIdx = shares.id.indexOf(shareRef);
    if (sIdx < 0) { diag({ event: 'findExistingShareKey-share-not-found', shareRef }); return null; }
    const key = shares.linkId ? shares.linkId[sIdx] : null;
    diag({ event: 'findExistingShareKey', viewRef, shareRef, found: !!key, shareColumns: Object.keys(shares) });
    return key || null;
  } catch (e) {
    diag({ event: 'findExistingShareKey-error', message: e.message });
    return null;
  }
}

// Ouvre l'écriture sur une table pour la clé de partage, sans intervention manuelle : crée une
// section Formulaire VIDE (jamais destinée à être affichée ni remplie) sur la page du formulaire
// principal, et la publie. Seule la présence + shareOptions.publish/form comptent pour la règle
// d'accès (ACLRulesReader._addRulesForShare) — le contenu du formulaire n'a aucune importance.
// Réutilise le partage déjà en place sur cette page, n'en crée jamais un nouveau.
export async function ensureTableGate(tableId, viewRef) {
  const already = (await formTablesOnPage(viewRef)).includes(tableId);
  if (already) return { created: false };
  const tref = await getTableRef(tableId);
  if (!tref) throw new Error(`Table « ${tableId} » introuvable.`);
  await grist.docApi.applyUserActions([['CreateViewSection', tref, viewRef, 'form', null, tableId]]);
  const sections = await fetchMeta('_grist_Views_section');
  let newest = null;
  for (let i = 0; i < sections.id.length; i++) {
    if (sections.parentId[i] === viewRef && sections.tableRef[i] === tref && sections.parentKey[i] === 'form') {
      if (newest == null || sections.id[i] > newest) newest = sections.id[i];
    }
  }
  if (newest == null) throw new Error('Section créée introuvable après CreateViewSection.');
  await grist.docApi.applyUserActions([['UpdateRecord', '_grist_Views_section', newest, { shareOptions: JSON.stringify({ publish: true, form: true }) }]]);
  return { created: true, sectionId: newest };
}

// Ouvre la lecture d'une table pour une question à choix : colonne Référence cachée sur la
// table du formulaire, attachée au formulaire publié, avec sa "colonne affichée" (visibleCol)
// fixée explicitement — sans elle, ACLRulesReader._shareTableReferencesForForm retombe sur
// l'identifiant numérique de la ligne (colId="id") au lieu du libellé choisi, pour une session
// de partage. Un nom déterministe par (table, colonne) permet de réutiliser le même champ si
// deux questions lisent la même source. Idempotent : peut être rappelé sans risque.
export async function ensureChoiceField(mainTableId, formSectionId, sourceTable, sourceCol) {
  const hiddenColId = `FormPlus_src_${sourceTable}_${sourceCol}`.replace(/[^A-Za-z0-9_]/g, '_');
  if (!(await colExists(mainTableId, hiddenColId))) {
    await grist.docApi.applyUserActions([['AddColumn', mainTableId, hiddenColId, { type: `Ref:${sourceTable}` }]]);
  }
  const colRef = await getColRef(mainTableId, hiddenColId);
  const srcColRef = await getColRef(sourceTable, sourceCol);
  if (srcColRef) {
    await grist.docApi.applyUserActions([['UpdateRecord', '_grist_Tables_column', colRef, { visibleCol: srcColRef }]]);
  }
  const fields = await fetchMeta('_grist_Views_section_field');
  let already = false;
  for (let i = 0; i < fields.id.length; i++) if (fields.parentId[i] === formSectionId && fields.colRef[i] === colRef) already = true;
  if (!already) {
    await grist.docApi.applyUserActions([['AddRecord', '_grist_Views_section_field', null, {
      parentId: formSectionId, colRef, widgetOptions: JSON.stringify({ formIsHidden: true }),
    }]]);
  }
  return hiddenColId;
}

export async function findViewRefForSection(vsId) {
  // La clé accordée par le formulaire natif porte sur sa TABLE, pas sur sa page : elle vaut
  // pour tout le document (voir ACLRulesReader._shareTableForForm, aclFormula ne référence que
  // user.ShareRef). Le widget peut donc être sur une page distincte du formulaire natif — page
  // que l'on préfère pour l'adresse finale, puisqu'elle n'affiche pas le formulaire natif.
  const sections = await fetchMeta('_grist_Views_section');
  const idx = sections.id.indexOf(vsId);
  if (idx < 0) return { formPage: null, widgetPage: null, self: null, samePage: null };
  const formPage = sections.parentId[idx];
  const myFile = location.pathname.split('/').pop();
  const candidates = [];
  let onFormPage = 0;
  for (let i = 0; i < sections.id.length; i++) {
    if (sections.parentKey[i] !== 'custom') continue;
    let o = {};
    try { o = JSON.parse(sections.options[i] || '{}') || {}; } catch (e) { /* ignore */ }
    const cv = parseCustomView(o);
    const rec = { id: sections.id[i], parentId: sections.parentId[i], url: cv.url || '', options: o, customView: cv };
    candidates.push(rec);
    if (rec.parentId === formPage) onFormPage++;
  }
  const myPage = myPageFromReferrer();
  let self = null;
  if (myPage != null) {
    const onMyPage = candidates.filter(s => s.parentId === myPage);
    const named = onMyPage.filter(s => s.url.includes(myFile));
    self = named.length === 1 ? named[0] : (onMyPage.length === 1 ? onMyPage[0] : null);
  }
  if (!self) {
    // Repli si le référent est absent ou ne contient pas de numéro de page (ex. embed=true).
    const matches = candidates.filter(s => s.url.includes(myFile));
    self = matches.length === 1 ? matches[0] : (candidates.length === 1 ? candidates[0] : null);
  }
  const widgetPage = myPage ?? (self ? self.parentId : formPage);
  return { formPage, widgetPage, self, samePage: widgetPage === formPage, onFormPage, ambiguous: myPage != null && !self };
}

// grist.setOptions ne modifie que la session du concepteur : Grist attend ensuite un clic sur
// « Enregistrer » dans la barre du widget. On écrit donc directement la configuration dans les
// métadonnées de la section, ce qui la rend visible à toutes les sessions, anonymes comprises.
// customView doit rester une chaîne JSON dans options.
export async function persistOptions(self, saved) {
  const current = self.options || {};
  const nextCustomView = { ...(self.customView || {}), widgetOptions: saved };
  const next = { ...current, customView: JSON.stringify(nextCustomView) };
  await grist.docApi.applyUserActions([
    ['UpdateRecord', '_grist_Views_section', self.id, { options: JSON.stringify(next) }],
  ]);
}

// Mode réparation (URL du widget terminée par #repair) : rétablit customView en chaîne JSON
// pour toutes les sections personnalisées du document dont la valeur a été corrompue.
export async function runRepair() {
  show('repair');
  const out = $('repair-log');
  const lines = [];
  try {
    const sections = await fetchMeta('_grist_Views_section');
    const fixes = [];
    for (let i = 0; i < sections.id.length; i++) {
      if (sections.parentKey[i] !== 'custom') continue;
      let o;
      try { o = JSON.parse(sections.options[i] || '{}') || {}; }
      catch (e) { lines.push(`Section ${sections.id[i]} : options illisibles, ignorée.`); continue; }
      if (o.customView == null || typeof o.customView === 'string') continue;
      const cv = parseCustomView(o);
      fixes.push(['UpdateRecord', '_grist_Views_section', sections.id[i], { options: JSON.stringify({ ...o, customView: JSON.stringify(cv) }) }]);
      lines.push(`Section ${sections.id[i]} (page ${sections.parentId[i]}) : customView rétabli, widget ${cv.url || 'sans URL'}.`);
    }
    if (fixes.length) { await grist.docApi.applyUserActions(fixes); lines.push('', `${fixes.length} section(s) réparée(s). Rechargez le document, puis retirez #repair de l'URL de ce widget ou supprimez-le.`); }
    else lines.push('Aucune section corrompue trouvée.');
  } catch (e) {
    lines.push(`Erreur : ${e.message}. Le widget a-t-il l'accès complet ?`);
  }
  out.textContent = lines.join('\n');
}

// Deux pistes écartées, chacune pour une raison précise et vérifiée :
// - le paramètre "readonly" transmis à l'iframe reflète le mode du DOCUMENT, pas les droits
//   réels de la session (une session de partage reçoit access=full, readonly=false, comme le
//   concepteur) ;
// - un jeton d'accès (getAccessToken) ne couvre QUE le contenu d'un document, tables et
//   cellules, jamais ses métadonnées (qui a accès, propriétaires...) — documenté explicitement
//   dans GristAPI.ts. Un appel à un point d'API réservé aux propriétaires (usersForViewAs) y
//   échoue donc systématiquement par 403, même pour le vrai propriétaire.
//
// Piste retenue : grist.docApi.applyUserActions() passe par la session complète du widget, pas
// par un jeton à portée réduite. On y teste une action de SCHÉMA (ajouter puis aussitôt retirer
// une colonne technique jetable, en un seul lot, un unique geste annulable) sur la table du
// formulaire. La modification du schéma est explicitement et sans exception interdite à toute
// session de partage par ACLRulesReader._addDefaultShareRules ("-S" générique sur "*"), à la
// différence de l'écriture dans une table _grist_* qui n'est, elle, pas couverte. Réussite =
// droits d'édition réels sur le document (concepteur) ; échec = session de partage anonyme.
export async function probeCanEdit(vsId) {
  let tableId;
  try {
    tableId = await getFormTableId(vsId);
  } catch (e) {
    diag({ event: 'probeCanEdit-lookup-failed', message: e.message, vsId });
    return false;
  }
  if (!tableId) { diag({ event: 'probeCanEdit-no-table', vsId }); return false; }
  const probeCol = '_FormPlus_probe_' + Date.now();
  try {
    // Seul l'ajout fait foi (refusé sans exception à une session de partage) : un souci sur le
    // nettoyage qui suit ne doit pas, à tort, faire conclure à une session anonyme.
    await grist.docApi.applyUserActions([['AddColumn', tableId, probeCol, { type: 'Text' }]]);
  } catch (e) {
    diag({ event: 'probeCanEdit-addcolumn-failed', message: e.message, tableId, probeCol });
    return false;
  }
  grist.docApi.applyUserActions([['RemoveColumn', tableId, probeCol]])
    .catch(e => diag({ event: 'probeCanEdit-cleanup-failed', message: e.message, tableId, probeCol }));
  return true;
}

