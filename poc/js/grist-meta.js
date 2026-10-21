import { esc } from './dom.js';
import { parseCustomView, myPageFromReferrer } from './links.js';
import { diag } from './diag.js';
import { I18n } from '../../kit/js/i18n.js';
import { Dialogs } from '../../kit/js/dialogs.js';
import './strings.js'; // enregistre form.* avant tout usage de I18n.t() au chargement de ce module (voir strings.js)
import { state } from './state.js';

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
};

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
  const cols = await fetchMeta('_grist_Tables_column');
  const tref = await getTableRef(tableId);
  const typeOf = (colId) => {
    for (let i = 0; i < cols.id.length; i++) if (cols.parentId[i] === tref && cols.colId[i] === colId) return (cols.type[i] || '').split(':')[0];
    return null;
  };
  let colId = base;
  let n = 2;
  let existingType = typeOf(colId);
  while (existingType != null && existingType !== type) {
    colId = `${base}_${n++}`;
    existingType = typeOf(colId);
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

  // Rend la copie utilisable tout de suite, sous la clé déjà existante. Avant la consigne 007,
  // un marqueur (formplusDuplicate/formplusSource) était aussi écrit ici, dans `options` — plus
  // possible (table FormPlus_Formulaires, voir plus bas) : populateFormPicker reconnaît maintenant
  // une copie gérée par FormPlus en comparant son id aux Definition.vsId déjà enregistrés, et
  // Definition.sourceVsId (saveFormDefinition) garde la même information que formplusSource.
  await grist.docApi.applyUserActions([['UpdateRecord', '_grist_Views_section', newVsId, {
    shareOptions: JSON.stringify({ publish: true, form: true }),
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

// ───────────────────────── Définition du formulaire : table FormPlus_Formulaires (consigne 007) ─────────────────────────
// Avant la 007, la définition (questions, apparence…) vivait dans _grist_Views_section.options
// (persistOptions, repli grist.setOptions) : hébergée dans GFS, cette colonne n'est jamais
// écrite par une app (le courtier refuse), et grist.setOptions/getOptions n'y déclarent aucune
// clé Form+ (silencieux, inopérant). La définition vit donc maintenant dans une table normale du
// document, FormPlus_Formulaires — une ligne par formulaire, lisible et inscriptible comme
// n'importe quelle autre table (manifeste GFS : lit/ecrit "*").
export const FORMULAIRES_TABLE = 'FormPlus_Formulaires';
const FORMULAIRES_COLUMNS = [
  ['Nom', 'Text'], ['TypeFormulaire', 'Text'], ['DateModif', 'DateTime'],
  ['ModifiePar', 'Text'], ['Definition', 'Text'],
  // Colonne propre à Form+, au-delà des quatre que GFS lit (manifeste, "colonnes") : relie une
  // ligne à SA section de widget (parentKey='custom'), pour que ce widget retrouve sa propre
  // définition à la réouverture sans jamais dépendre de grist.onOptions()/getOptions() (repli
  // désormais inopérant dans GFS). Documentée dans GFS-ETAT.md, consigne 007 ("si tu veux
  // d'autres colonnes pour la définition, dis-le dans ta page").
  ['IdSectionWidget', 'Numeric'],
];

// Repère la section personnalisée (parentKey='custom') qui EST ce widget lui-même — même
// mécanisme de repérage (référent puis nom de fichier) que findMyWidgetPage/findViewRefForSection
// ci-dessus, mais renvoie l'enregistrement de section complet (pas seulement sa page) : c'est
// cette section, pas le formulaire natif qu'elle gère, que IdSectionWidget référence.
async function findMySection() {
  const sections = await fetchMeta('_grist_Views_section');
  const myPage = myPageFromReferrer();
  const myFile = location.pathname.split('/').pop();
  const candidates = [];
  for (let i = 0; i < sections.id.length; i++) {
    if (sections.parentKey[i] !== 'custom') continue;
    let o = {}; try { o = JSON.parse(sections.options[i] || '{}') || {}; } catch (e) { /* ignore */ }
    candidates.push({ id: sections.id[i], parentId: sections.parentId[i], url: parseCustomView(o).url || '', options: o });
  }
  if (myPage != null) {
    const onMyPage = candidates.filter(s => s.parentId === myPage);
    const named = onMyPage.filter(s => s.url.includes(myFile));
    if (named.length === 1) return named[0];
    if (onMyPage.length === 1) return onMyPage[0];
  }
  const matches = candidates.filter(s => s.url.includes(myFile));
  if (matches.length === 1) return matches[0];
  if (candidates.length === 1) return candidates[0];
  return null;
}

// Résout la Définition de CETTE instance de widget au démarrage, sans jamais dépendre de
// grist.onOptions()/getOptions() au-delà du simple signal « prêt » (opts n'est plus lu) :
// repère sa propre section (ci-dessus), cherche sa ligne dans FormPlus_Formulaires
// (IdSectionWidget) si la table existe déjà, et ne retombe sur l'ancien
// _grist_Views_section.options.customView.widgetOptions (lecture directe, toujours permise,
// jamais via grist.onOptions) que si aucune ligne n'a encore été créée — formulaires faits avant
// la 007, migrés vers la table dès le premier enregistrement (saveFormDefinition plus bas).
export async function resolveMyDefinition() {
  let self;
  try { self = await findMySection(); } catch (e) { diag({ event: 'resolveMyDefinition-self-failed', message: e.message }); return {}; }
  if (!self) return {};
  try {
    const table = await fetchMeta(FORMULAIRES_TABLE);
    const idx = (table.IdSectionWidget || []).indexOf(self.id);
    if (idx >= 0) {
      let def = {}; try { def = JSON.parse(table.Definition[idx] || '{}') || {}; } catch (e) { /* ignore */ }
      state.formRowId = table.id[idx];
      return def;
    }
  } catch (e) { diag({ event: 'resolveMyDefinition-table-failed', message: e.message }); }
  // Repli : formulaire pas encore migré (ou table pas encore créée).
  const cv = parseCustomView(self.options);
  return (cv && typeof cv.widgetOptions === 'object' && cv.widgetOptions) ? cv.widgetOptions : {};
}

// Crée FormPlus_Formulaires avec l'accord de la personne (une fenêtre du kit, règle 4 du guide
// GFS) si elle n'existe pas encore ; sinon, s'assure que ses colonnes sont toutes présentes
// (idempotent, jamais d'écriture dans une colonne absente ailleurs dans ce module) et ouvre sa
// lecture aux sessions de partage anonymes (ensureTableGate, même mécanisme déjà utilisé pour
// toute autre table lue par un répondant). Jamais appelée depuis saveFormDefinition lui-même : un
// seul point d'entrée, generate() (voir config-editor.js), pour qu'une frappe dans les champs
// d'apparence ne déclenche jamais cette fenêtre de consentement à chaque sauvegarde automatique.
export async function ensureFormulairesTable(viewRef) {
  let tref = await getTableRef(FORMULAIRES_TABLE);
  if (!tref) {
    const ok = await Dialogs.confirm({
      title: I18n.t('form.editor.formulairesTableTitle'),
      message: I18n.t('form.editor.formulairesTableMsg'),
      confirmLabel: I18n.t('form.editor.formulairesTableConfirm'),
    });
    if (!ok) throw new Error(I18n.t('form.editor.formulairesTableDeclined'));
    await grist.docApi.applyUserActions([['AddTable', FORMULAIRES_TABLE, FORMULAIRES_COLUMNS.map(([id, type]) => ({ id, type }))]]);
    // Jamais supposé : l'identifiant réel de la table nouvellement créée est relu, pas déduit.
    tref = await getTableRef(FORMULAIRES_TABLE);
    if (!tref) throw new Error(I18n.t('form.editor.tableCreateFailed'));
  }
  for (const [colId, type] of FORMULAIRES_COLUMNS) {
    if (!(await colExists(FORMULAIRES_TABLE, colId))) {
      await grist.docApi.applyUserActions([['AddColumn', FORMULAIRES_TABLE, colId, { type }]]);
    }
  }
  if (viewRef != null) await ensureTableGate(FORMULAIRES_TABLE, viewRef);
}

// Écrit la Définition de self (la section de CE widget) dans sa ligne de FormPlus_Formulaires,
// la crée si c'est la première fois. Suppose la table déjà créée (ensureFormulairesTable,
// appelée une seule fois par generate()) : si elle manque encore (jamais générée, ou fenêtre de
// consentement refusée), échoue simplement — à l'appelant (saveConfig) de retomber sur "non
// enregistré", jamais de nouvelle tentative de création ici.
export async function saveFormDefinition(self, saved) {
  const tref = await getTableRef(FORMULAIRES_TABLE);
  if (!tref) throw new Error(`Table « ${FORMULAIRES_TABLE} » introuvable.`);
  const fields = {
    Nom: saved.formTitle || I18n.t('form.editor.defaultFormulaireName'),
    TypeFormulaire: 'formulaire',
    DateModif: Math.floor(Date.now() / 1000),
    ModifiePar: 'Form+',
    Definition: JSON.stringify(saved),
    IdSectionWidget: self.id,
  };
  let rowId = state.formRowId;
  if (rowId == null) {
    const table = await fetchMeta(FORMULAIRES_TABLE);
    const idx = (table.IdSectionWidget || []).indexOf(self.id);
    if (idx >= 0) rowId = table.id[idx];
  }
  if (rowId != null) {
    await grist.docApi.applyUserActions([['UpdateRecord', FORMULAIRES_TABLE, rowId, fields]]);
  } else {
    const res = await grist.docApi.applyUserActions([['AddRecord', FORMULAIRES_TABLE, null, fields]]);
    rowId = res.retValues?.[0];
    if (rowId == null) {
      // Jamais supposé, comme pour AddTable ci-dessus : relecture explicite si la création n'a
      // pas renvoyé l'id directement.
      const table = await fetchMeta(FORMULAIRES_TABLE);
      const idx = (table.IdSectionWidget || []).map((v, i) => (v === self.id ? i : -1)).filter(i => i >= 0).pop();
      rowId = idx != null && idx >= 0 ? table.id[idx] : null;
    }
  }
  state.formRowId = rowId;
  return rowId;
}

// Les vsId déjà gérés par FormPlus (copies créées par duplicateFormSection) : un ensemble des
// Definition.vsId de chaque ligne déjà enregistrée, pour que populateFormPicker (config-editor.js)
// les exclue de la liste des formulaires natifs proposés — remplace l'ancien marqueur
// formplusDuplicate (_grist_Views_section.options, plus écrit depuis la 007).
export async function fetchManagedVsIds() {
  try {
    const table = await fetchMeta(FORMULAIRES_TABLE);
    const vsIds = new Set();
    (table.Definition || []).forEach((d) => {
      try { const def = JSON.parse(d || '{}') || {}; if (def.vsId != null) vsIds.add(def.vsId); } catch (e) { /* ignore */ }
    });
    return vsIds;
  } catch (e) {
    return new Set();
  }
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

