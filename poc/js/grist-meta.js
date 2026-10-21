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

// Crée une section Formulaire et renvoie directement son id, sans jamais avoir à le deviner :
// applyUserActions renvoie déjà l'id créé dans retValues[0].sectionRef (vérifié contre un vrai
// document Grist par tests/grist-env/grist_test_doc.py, qui l'utilise déjà côté harness Python).
// Avant ce correctif (audit du 21 sept 2026), duplicateFormSection et ensureTableGate retrouvaient
// la section créée en comparant deux photographies de _grist_Views_section avant/après, ou en
// prenant l'id le plus grand correspondant à (page, table) : fragile dès qu'une AUTRE section est
// créée n'importe où dans le document pendant cette fenêtre (un autre designer, un autre onglet).
export async function createFormSection(tref, viewRef, tableId) {
  const res = await grist.docApi.applyUserActions([['CreateViewSection', tref, viewRef, 'form', null, tableId]]);
  const sectionId = res.retValues?.[0]?.sectionRef;
  if (sectionId == null) throw new Error('CreateViewSection : identifiant de section absent de la réponse.');
  return sectionId;
}

// CreateViewSection peuple automatiquement la nouvelle section avec un champ par colonne de la
// table (comportement natif de Grist, vérifié sur un vrai document, voir duplicateFormSection
// plus bas) : retire ces champs auto-créés pour qu'une section censée rester vide (portillon
// d'accès, formulaire "vide" créé depuis zéro) le soit réellement.
export async function clearAutoFields(vsId) {
  const fields = await fetchMeta('_grist_Views_section_field');
  const autoFieldIds = [];
  for (let i = 0; i < fields.id.length; i++) if (fields.parentId[i] === vsId) autoFieldIds.push(fields.id[i]);
  if (autoFieldIds.length) {
    await grist.docApi.applyUserActions(autoFieldIds.map(id => ['RemoveRecord', '_grist_Views_section_field', id]));
  }
  return autoFieldIds.length;
}

// Ouvre l'écriture sur une table pour la clé de partage, sans intervention manuelle : crée une
// section Formulaire VIDE sur la page du formulaire principal, et la publie. Seule la présence +
// shareOptions.publish/form comptent pour la règle d'accès (ACLRulesReader._addRulesForShare) —
// le contenu du formulaire n'a aucune importance pour ce droit. Mais CreateViewSection remplit
// la nouvelle section d'un champ par colonne de la table (voir clearAutoFields ci-dessus) : sans
// nettoyage, cette section publiée exposerait un vrai formulaire natif complet sur cette table,
// atteignable par quiconque connaît/devine l'adresse /forms/<clé>/<id-section>, alors que le
// concepteur n'a jamais choisi de publier cette table. Réutilise le partage déjà en place sur
// cette page, n'en crée jamais un nouveau.
export async function ensureTableGate(tableId, viewRef) {
  const tref = await getTableRef(tableId);
  if (!tref) throw new Error(`Table « ${tableId} » introuvable.`);
  // sectionId du formulaire déjà publié pour CETTE table sur cette page, s'il existe : les
  // appelants qui n'ont besoin que d'ouvrir le droit d'écriture (texte/nombre/... écrits
  // ailleurs) l'ignorent, mais une question "Choix depuis une table" écrivant ailleurs en a
  // besoin pour y attacher son champ Référence caché (ensureChoiceField, config-editor.js).
  const sections = await fetchMeta('_grist_Views_section');
  for (let i = 0; i < sections.id.length; i++) {
    if (sections.parentId[i] !== viewRef || sections.tableRef[i] !== tref || sections.parentKey[i] !== 'form') continue;
    let opt = {}; try { opt = JSON.parse(sections.shareOptions[i] || '{}') || {}; } catch (e) { /* ignore */ }
    if (opt.publish && opt.form) return { created: false, sectionId: sections.id[i] };
  }
  const sectionId = await createFormSection(tref, viewRef, tableId);
  await clearAutoFields(sectionId);
  await grist.docApi.applyUserActions([['UpdateRecord', '_grist_Views_section', sectionId, { shareOptions: JSON.stringify({ publish: true, form: true }) }]]);
  return { created: true, sectionId };
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

// Même mécanisme qu'ensureChoiceField ci-dessus, pour une question "Liste de références" :
// colonne RefList cachée (plusieurs lignes choisies, pas une seule), même convention de nom
// déterministe par (table, colonne), même fixation de la colonne affichée (visibleCol) pour que
// la session de partage anonyme lise le libellé plutôt que l'identifiant numérique.
export async function ensureRefListField(mainTableId, formSectionId, sourceTable, sourceCol) {
  const hiddenColId = `FormPlus_srcL_${sourceTable}_${sourceCol}`.replace(/[^A-Za-z0-9_]/g, '_');
  if (!(await colExists(mainTableId, hiddenColId))) {
    await grist.docApi.applyUserActions([['AddColumn', mainTableId, hiddenColId, { type: `RefList:${sourceTable}` }]]);
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

// Type de colonne Grist à créer pour chaque type de question à destination "libre" (toutes sauf
// 'choice'/'reflist', qui gèrent leur propre colonne Référence cachée via ensureChoiceField/
// ensureRefListField ci-dessus) — même correspondance que la lecture inverse utilisée par
// importNativeFields (config-editor.js, SIMPLE_MAP) pour qu'une colonne créée ici soit reconnue
// plus tard comme champ natif compatible si elle est un jour importée dans un autre formulaire.
// 'ranking' et 'map' n'ont pas de type Grist dédié pour ce qu'ils stockent (un ordre, des
// coordonnées) : Texte simple, comme le fait déjà respond.js en écriture.
export const KIND_TO_GRIST_TYPE = {
  text: 'Text', longtext: 'Text', number: 'Numeric', scale: 'Numeric', date: 'Date',
  datetime: 'DateTime', bool: 'Bool', select: 'Choice', multiselect: 'ChoiceList',
  ranking: 'Text', map: 'Text', attachments: 'Attachments', signature: 'Attachments',
  timeslot: 'Choice', // une seule valeur prise dans une liste fixe, comme 'select'
};

// Type Grist réel d'une colonne déjà existante (sans le ":Table" d'un Ref/RefList), ou null si
// elle n'existe pas encore. Partagé par ensureFreeColumn (suffixe numérique en cas de collision
// de type) et saveQuestionFromCard (config-editor.js, détecte un changement de type de QUESTION
// qui rendrait incompatible une colonne de destination choisie avant ce changement — voir son
// commentaire, même principe que ci-dessous : jamais d'écriture silencieuse au mauvais type).
export async function getColumnType(tableId, colId) {
  const cols = await fetchMeta('_grist_Tables_column');
  const tref = await getTableRef(tableId);
  const count = (cols.id || []).length;
  for (let i = 0; i < count; i++) {
    if (cols.parentId?.[i] === tref && cols.colId?.[i] === colId) return (cols.type?.[i] || '').split(':')[0];
  }
  return null;
}

// Comme ensureChoiceField/ensureRefListField : crée la colonne de destination si elle manque
// encore, plutôt que de bloquer l'enregistrement en attendant que le concepteur en choisisse une
// à la main (principe n°5 de la feuille de route, docs/03-roadmap-priorites.md : « les colonnes
// manquantes sont créées »). Nom déduit du libellé de la question (même sanitisation que pour les
// colonnes techniques ci-dessus), avec suffixe numérique en cas de collision avec une colonne
// existante d'un autre type — jamais d'écriture silencieuse dans la colonne de quelqu'un d'autre.
// Idempotent : si la colonne déduite existe déjà avec le type attendu, elle est réutilisée telle
// quelle (même résultat que si le concepteur l'avait choisie à la main).
export async function ensureFreeColumn(tableId, desiredLabel, kind) {
  const type = KIND_TO_GRIST_TYPE[kind] || 'Text';
  let base = String(desiredLabel || '').trim().replace(/[^A-Za-z0-9_]/g, '_').replace(/^_+/, '');
  if (!/^[A-Za-z]/.test(base)) base = (`Champ_${base}`).replace(/_+$/, '') || 'Champ';
  let colId = base;
  let n = 2;
  let existingType = await getColumnType(tableId, colId);
  while (existingType != null && existingType !== type) {
    colId = `${base}_${n++}`;
    existingType = await getColumnType(tableId, colId);
  }
  if (existingType == null) {
    await grist.docApi.applyUserActions([['AddColumn', tableId, colId, { type }]]);
  }
  return colId;
}

// Duplique un formulaire natif déjà publié en une nouvelle section, sur la MÊME page : une clé
// de partage porte sur la PAGE (_grist_Pages.shareRef), jamais sur une section précise (voir
// docs/01-etude-comparative.md, "toutes les sections d'une même page appartiennent au même
// partage"). Poser shareOptions.publish/form sur la nouvelle section suffit donc à la rendre
// utilisable tout de suite sous la clé déjà existante : ni republication, ni nouvelle clé,
// exactement le mécanisme déjà utilisé par ensureTableGate pour ouvrir une AUTRE table. Mêmes
// colonnes, même ordre (parentPos) : les réponses continuent d'atterrir exactement là où le
// concepteur les attendait déjà. Le formulaire source n'est JAMAIS modifié : uniquement des
// lectures dessus, toute écriture vise la section nouvellement créée.
export async function duplicateFormSection(sourceVsId) {
  const sections = await fetchMeta('_grist_Views_section');
  const srcIdx = sections.id.indexOf(sourceVsId);
  if (srcIdx < 0) throw new Error('Formulaire source introuvable dans ce document.');
  const viewRef = sections.parentId[srcIdx];
  const tableRef = sections.tableRef[srcIdx];
  const tableId = await tableIdOfRef(tableRef);
  if (!tableId) throw new Error('Table du formulaire source introuvable.');

  const newVsId = await createFormSection(tableRef, viewRef, tableId);

  // CreateViewSection peuple automatiquement la nouvelle section avec un champ par colonne de la
  // table (comportement natif de Grist, vérifié sur un vrai document, jamais documenté par
  // ailleurs dans ce dépôt) : on la vide d'abord, sinon chaque colonne se retrouve en double une
  // fois les champs du formulaire source recopiés ci-dessous.
  const fields = await fetchMeta('_grist_Views_section_field');
  const autoFieldIds = [];
  const srcFields = [];
  for (let i = 0; i < fields.id.length; i++) {
    if (fields.parentId[i] === newVsId) autoFieldIds.push(fields.id[i]);
    if (fields.parentId[i] === sourceVsId) {
      srcFields.push({ colRef: fields.colRef[i], widgetOptions: fields.widgetOptions[i], parentPos: fields.parentPos ? fields.parentPos[i] : 0 });
    }
  }
  if (autoFieldIds.length) {
    await grist.docApi.applyUserActions(autoFieldIds.map(id => ['RemoveRecord', '_grist_Views_section_field', id]));
  }
  srcFields.sort((a, b) => (a.parentPos || 0) - (b.parentPos || 0));
  if (srcFields.length) {
    await grist.docApi.applyUserActions(srcFields.map(f => (
      ['AddRecord', '_grist_Views_section_field', null, { parentId: newVsId, colRef: f.colRef, widgetOptions: f.widgetOptions }]
    )));
  }

  // « formplusDuplicate » marque cette section comme une copie gérée par FormPlus : ignorée par
  // populateFormPicker (jamais proposée comme SOURCE d'une autre duplication) et par nous-mêmes
  // si on la retrouve un jour dans les métadonnées. shareOptions la rend utilisable tout de suite.
  await grist.docApi.applyUserActions([['UpdateRecord', '_grist_Views_section', newVsId, {
    shareOptions: JSON.stringify({ publish: true, form: true }),
    options: JSON.stringify({ formplusDuplicate: true, formplusSource: sourceVsId }),
  }]]);

  return newVsId;
}

// Détermine la page Grist qui héberge CE widget, sans connaître de vsId de formulaire (utile
// avant même la première génération, ex. pour poser une nouvelle section vide sur la bonne
// page) : d'abord le référent (myPageFromReferrer, fiable dans le cas courant), puis, s'il est
// absent ou ne contient pas de numéro de page (référent bloqué par le navigateur, embed=true…),
// un repli sur les métadonnées, en cherchant l'unique section personnalisée dont l'URL
// correspond à ce widget — même repli que celui déjà utilisé par findViewRefForSection ci-
// dessous, mais utilisable sans lien de formulaire déjà connu.
export async function findMyWidgetPage() {
  const myPage = myPageFromReferrer();
  if (myPage != null) return myPage;
  const sections = await fetchMeta('_grist_Views_section');
  const myFile = location.pathname.split('/').pop();
  const candidates = [];
  for (let i = 0; i < sections.id.length; i++) {
    if (sections.parentKey[i] !== 'custom') continue;
    let o = {}; try { o = JSON.parse(sections.options[i] || '{}') || {}; } catch (e) { /* ignore */ }
    const cv = parseCustomView(o);
    candidates.push({ parentId: sections.parentId[i], url: cv.url || '' });
  }
  const matches = candidates.filter(s => s.url.includes(myFile));
  if (matches.length === 1) return matches[0].parentId;
  if (candidates.length === 1) return candidates[0].parentId;
  return null;
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

// ───────────────────────── Mode interne : identité réelle du répondant ─────────────────────────
// Mécanisme documenté par la communauté Grist, pas une API officielle (voir
// formplus-identite-mode-interne.md, mémoire projet) : une colonne "formule déclencheur" (colonne
// de données, pas une formule classique, mais calculée côté serveur une seule fois, à la création
// de la ligne) peut lire `user.Email`, qui vaut la vraie adresse de qui exécute l'action — MAIS
// seulement pour une session réellement authentifiée dans le document. Une session de partage
// anonyme (le mode public habituel de FormPlus) reçoit toujours `anon@getgrist.com`, quelle que
// soit la formule. C'est pour ça que le mode interne n'a de sens que pour un widget ouvert
// directement sur une page Grist (grist.docApi disponible), jamais pour le lien public.
//
// Non vérifié en direct sur un vrai document Grist depuis cet environnement (pas d'accès réseau,
// voir formplus-sandbox-network-limits, mémoire projet) : isFormula:false + formula posée +
// recalcWhen:0 est la convention documentée pour "Appliquer aux nouveaux enregistrements" côté
// serveur Grist. À confirmer par Antoine sur un document réel avant de s'y fier en production — le
// mode interne reste de toute façon "confort, pas sécurité" (docs/01-etude-comparative.md, section
// 6.5) : seules les règles d'accès du document protègent vraiment une donnée sensible, la
// réservation de question n'est qu'un affichage adapté, jamais un contrôle d'accès réel.
const RESPONDENT_PROBE_TABLE = 'FormPlus_Repondants';
const RESPONDENT_EMAIL_COL = 'Email';

// Crée, si elle manque encore, une table technique partagée par TOUS les formulaires du document
// (pas une par formulaire : la même sonde d'identité sert à tous). Idempotent, rappelable sans
// risque à chaque activation du mode interne dans l'éditeur.
export async function ensureRespondentProbeTable() {
  const colInfo = { type: 'Text', isFormula: false, formula: 'user.Email', recalcWhen: 0 };
  if (!(await getTableRef(RESPONDENT_PROBE_TABLE))) {
    await grist.docApi.applyUserActions([['AddTable', RESPONDENT_PROBE_TABLE, [{ id: RESPONDENT_EMAIL_COL, ...colInfo }]]]);
    return RESPONDENT_PROBE_TABLE;
  }
  if (!(await colExists(RESPONDENT_PROBE_TABLE, RESPONDENT_EMAIL_COL))) {
    await grist.docApi.applyUserActions([['AddColumn', RESPONDENT_PROBE_TABLE, RESPONDENT_EMAIL_COL, colInfo]]);
  }
  return RESPONDENT_PROBE_TABLE;
}

// Résout l'identité réelle de qui consulte CE widget EN CE MOMENT (jamais celle, figée, d'une
// réponse déjà enregistrée) : pose une ligne jetable dans la table-sonde ci-dessus, relit la
// valeur que Grist vient de calculer côté serveur pour CETTE ligne, puis la retire — aucune ligne
// ne s'accumule au fil des consultations. Renvoie null si le mode interne n'a encore jamais été
// activé (table absente), si l'écriture est refusée (répondant sans droit d'écriture réel sur ce
// document, malgré un `window.grist` présent), ou si l'identité résolue est celle d'une session de
// partage anonyme (`anon@getgrist.com`, ex. widget ouvert via #form= en aperçu) : dans tous ces
// cas, traité comme une identité inconnue par l'appelant (respond.js), jamais comme une erreur
// bloquante pour le reste du formulaire.
export async function probeRespondentIdentity() {
  const tref = await getTableRef(RESPONDENT_PROBE_TABLE);
  if (!tref) return null;
  let rowId;
  try {
    const res = await grist.docApi.applyUserActions([['AddRecord', RESPONDENT_PROBE_TABLE, null, {}]]);
    rowId = res.retValues?.[0];
    if (rowId == null) return null;
  } catch (e) {
    diag({ event: 'probeRespondentIdentity-addrecord-failed', message: e.message });
    return null;
  }
  let email = null;
  try {
    const data = await fetchMeta(RESPONDENT_PROBE_TABLE);
    const idx = (data.id || []).indexOf(rowId);
    email = idx >= 0 ? (data[RESPONDENT_EMAIL_COL]?.[idx] || null) : null;
  } catch (e) {
    diag({ event: 'probeRespondentIdentity-reread-failed', message: e.message });
  }
  grist.docApi.applyUserActions([['RemoveRecord', RESPONDENT_PROBE_TABLE, rowId]])
    .catch(e => diag({ event: 'probeRespondentIdentity-cleanup-failed', message: e.message }));
  if (email === 'anon@getgrist.com') return null;
  return email;
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

