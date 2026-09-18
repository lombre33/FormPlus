import { $, esc, uid, cssEsc, show } from './dom.js';
import { ICONS } from './icons.js';
import { KINDS, LAYOUT_KINDS, SINGLE_CHOICE_KINDS } from './kinds.js';
import { parseFormLink, buildPublicUrl, migrateLegacy, myPageFromReferrer, hostOrgFromReferrer, normalizeCondition } from './links.js';
import { diag } from './diag.js';
import {
  fetchMeta, getTableRef, tableIdOfRef, columnOptions,
  findExistingShareKey, ensureTableGate, ensureChoiceField,
  findViewRefForSection, persistOptions, duplicateFormSection,
} from './grist-meta.js';
import { state } from './state.js';
import { renderFill } from './respond.js';

// ───────────────────────── Configuration (concepteur) ─────────────────────────
// Exactement 2 façons de commencer, jamais plus :
// 1. « Créer un formulaire natif vide » (createEmptyForm, plus bas) : table + section vides,
//    pour un concepteur qui n'a encore rien.
// 2. Choisir dans la liste ou coller le lien d'un formulaire natif déjà publié (generate,
//    ci-dessous) : FormPlus en crée systématiquement une COPIE (duplicateFormSection, dans
//    grist-meta.js) et ne travaille plus que sur cette copie. Le formulaire natif du concepteur
//    n'est jamais modifié, qu'il soit tout juste créé (voie 1) ou déjà rempli depuis longtemps.
// Ces deux voies convergent donc sur le même état ensuite : state.currentFormSection pointe
// toujours vers une section que FormPlus a lui-même créée.

export async function saveConfig(publicUrl, widgetPage) {
  const saved = {
    formLink: state.currentLink ? $('link').value.trim() : state.options?.formLink,
    shareKey: state.currentLink?.key ?? state.options?.shareKey,
    vsId: state.currentLink?.vsId ?? state.options?.vsId,
    // Le formulaire natif réellement collé/choisi par le concepteur, avant duplication : sert à
    // reconnaître un nouveau collage du MÊME lien (on garde alors la copie déjà créée, voir
    // generate()) plutôt que d'en créer une de plus à chaque fois.
    sourceVsId: state.currentLink?.sourceVsId ?? state.options?.sourceVsId,
    viewRef: widgetPage,
    publicUrl,
    questions: state.cfgQuestions,
    // Apparence : toujours relue depuis les champs de l'écran de configuration, quel que soit
    // l'appelant (question, réordonnancement, réglage d'apparence…) pour ne jamais en perdre
    // une valeur déjà saisie entre deux sauvegardes.
    formTitle: $('opt-title').value.trim(),
    formDescription: $('opt-desc').value.trim(),
    logoUrl: $('opt-logo').value.trim(),
    accentColor: $('opt-accent').value || '',
    showProgress: $('opt-progress').checked,
    submitLabel: $('opt-submit').value.trim(),
    endMessage: $('opt-endmsg').value.trim(),
    redirectUrl: $('opt-redirect').value.trim(),
  };
  const { self } = await findViewRefForSection(saved.vsId);
  let persisted = false;
  if (self) { try { await persistOptions(self, saved); persisted = true; } catch (e) { console.warn('[FormPlus] écriture directe refusée', e); } }
  if (!persisted) { try { await grist.setOptions(saved); } catch (e) { /* ignore */ } }
  state.options = saved;
  return persisted;
}

export async function generate() {
  const msg = $('cfg-msg');
  const pastedLink = parseFormLink($('link').value);
  if (!pastedLink) { msg.innerHTML = '<span class="err">Lien non reconnu. Il doit contenir <code>/forms/&lt;clé&gt;/&lt;numéro&gt;</code>.</span>'; return; }
  msg.textContent = 'Recherche de la page du formulaire…';
  let formPage = null, widgetPage = null, self = null, samePage = null, onFormPage = 0, ambiguous = false;
  try { ({ formPage, widgetPage, self, samePage, onFormPage, ambiguous } = await findViewRefForSection(pastedLink.vsId)); }
  catch (e) { msg.innerHTML = `<span class="err">Impossible de lire les métadonnées du document (${esc(e.message)}). Le widget a-t-il l'accès complet ?</span>`; return; }
  if (!formPage) { msg.innerHTML = '<span class="err">Cette section de formulaire n\'existe pas dans ce document. Le lien vient-il bien d\'ici ?</span>'; return; }

  // FormPlus ne travaille jamais directement sur un formulaire natif qu'il n'a pas lui-même
  // créé. Même lien déjà collé auparavant (sourceVsId inchangé) : on garde la copie déjà faite,
  // avec ses questions. Lien nouveau ou différent : on en duplique un exemplaire (même colonnes,
  // même page, donc même clé de partage, sans republication manuelle), et on repart d'une liste
  // de questions vide, comme pour tout changement de formulaire aujourd'hui. Les configurations
  // enregistrées avant cette fonctionnalité (sourceVsId absent) sont préservées telles quelles :
  // pas de duplication rétroactive tant que le même lien continue d'être utilisé.
  const knownSource = state.options?.sourceVsId ?? state.options?.vsId;
  const isSameSource = knownSource === pastedLink.vsId;
  let vsId;
  if (isSameSource && state.options?.vsId) {
    vsId = state.options.vsId;
  } else {
    msg.textContent = "Duplication du formulaire (le vôtre n'est jamais modifié)…";
    try { vsId = await duplicateFormSection(pastedLink.vsId); }
    catch (e) { msg.innerHTML = `<span class="err">Impossible de dupliquer ce formulaire (${esc(e.message)}).</span>`; return; }
  }
  const link = { ...pastedLink, vsId, sourceVsId: pastedLink.vsId };
  state.currentLink = link;
  const sections = await fetchMeta('_grist_Views_section');
  const idx = sections.id.indexOf(vsId);
  state.currentFormSection = { id: vsId, viewRef: formPage, tableRef: sections.tableRef[idx] };
  state.mainTableIdCache = await tableIdOfRef(state.currentFormSection.tableRef);
  // On garde les questions déjà enregistrées si ce lien était déjà configuré.
  state.cfgQuestions = isSameSource ? migrateLegacy(state.options) : [];
  state.stayOnConfig = true;
  const publicUrl = buildPublicUrl(link, widgetPage);
  const persisted = await saveConfig(publicUrl, widgetPage);
  const dupNote = isSameSource ? '' : 'Copie du formulaire créée pour FormPlus, le vôtre est inchangé. ';
  msg.innerHTML = persisted
    ? `<span class="ok">${dupNote}Configuration enregistrée dans le document.</span>`
    : `<span class="err">${dupNote}Configuration posée dans cette session seulement : cliquez sur <strong>Enregistrer</strong> dans la barre du widget pour la conserver.</span>`;
  $('public-url').textContent = publicUrl;
  $('result').classList.remove('hidden');
  $('qrPanel').classList.add('hidden'); // évite d'afficher un QR code périmé après une nouvelle adresse
  if (!self && ambiguous) {
    $('page-check').innerHTML = `<span class="err">Plusieurs widgets personnalisés utilisant ce même fichier existent sur la page ${widgetPage} : impossible de savoir lequel enregistrer. Supprimez les widgets FormPlus superflus laissés par d'anciens essais sur cette page, ne gardez que celui-ci, puis cliquez de nouveau sur Générer l'adresse.</span>`;
  } else if (!self) {
    $('page-check').innerHTML = `<span class="err">Impossible de déterminer la page de ce widget (adresse de la page Grist illisible). L'adresse pointe vers la page du formulaire natif (page ${formPage}), qui affichera aussi son propre habillage.</span>`;
  } else if (samePage) {
    $('page-check').innerHTML = `<span class="ok">Le widget est sur la même page (${formPage}) que le formulaire natif${onFormPage > 1 ? `, avec ${onFormPage} widgets personnalisés dessus` : ''}. L'adresse fonctionnera, mais affichera aussi l'habillage du formulaire natif au-dessus ou à côté. Pour un rendu plus propre, déplacez ce widget seul sur une autre page : la clé reste valable, elle porte sur la table, pas sur la page.</span>`;
  } else {
    $('page-check').innerHTML = `<span class="ok">Le widget est seul sur la page ${widgetPage}, distincte de la page ${formPage} qui porte le formulaire natif. L'adresse n'affichera que ce widget : c'est la configuration la plus propre.</span>`;
  }
  $('questions-card').classList.remove('hidden');
  $('appearance-card').classList.remove('hidden');
  renderQuestionList();
}

$('generate').addEventListener('click', generate);
$('link').addEventListener('keydown', (e) => { if (e.key === 'Enter') generate(); });

// ───────────────────────── Apparence et personnalisation ─────────────────────────
['opt-title', 'opt-desc', 'opt-logo', 'opt-accent', 'opt-progress', 'opt-submit', 'opt-endmsg', 'opt-redirect'].forEach(id => {
  $(id).addEventListener('change', async () => {
    if (!state.currentFormSection) return; // rien à sauvegarder tant qu'aucun formulaire n'est lié
    await saveConfig(state.options.publicUrl, state.options.viewRef);
    $('appearance-msg').innerHTML = '<span class="ok">Enregistré.</span>';
  });
});
$('opt-accent-reset').addEventListener('click', async () => {
  $('opt-accent').value = '#000091';
  if (!state.currentFormSection) return;
  await saveConfig(state.options.publicUrl, state.options.viewRef);
  $('appearance-msg').innerHTML = '<span class="ok">Couleur réinitialisée.</span>';
});
$('paste').addEventListener('click', async () => {
  try { $('link').value = (await navigator.clipboard.readText()).trim(); generate(); }
  catch (e) { $('cfg-msg').textContent = 'Lecture du presse-papiers refusée : collez le lien dans le champ avec Ctrl+V.'; $('link').focus(); }
});
$('copy').addEventListener('click', async () => {
  const url = $('public-url').textContent;
  try { await navigator.clipboard.writeText(url); $('copy').textContent = 'Copiée'; setTimeout(() => $('copy').textContent = "Copier l'adresse", 1500); }
  catch (e) { window.prompt('Copiez cette adresse :', url); }
});
$('open').addEventListener('click', () => window.open($('public-url').textContent, '_blank', 'noopener'));
$('done').addEventListener('click', () => { state.stayOnConfig = false; if (state.options?.formLink) renderFill(); });
$('qrToggle').addEventListener('click', () => {
  const panel = $('qrPanel');
  const opening = panel.classList.contains('hidden');
  panel.classList.toggle('hidden');
  if (opening) {
    $('qrCanvas').innerHTML = '';
    new QRCode($('qrCanvas'), { text: $('public-url').textContent, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M });
  }
});
$('qrDownload').addEventListener('click', () => {
  const canvas = $('qrCanvas').querySelector('canvas');
  if (!canvas) return;
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = 'formplus-qrcode.png';
  a.click();
});
$('edit').addEventListener('click', showConfig);

// ───────────────────────── Créer un formulaire natif vide depuis FormPlus ─────────────────────────
// Automatise la seule partie sans risque : la table (créée si besoin) et une section Formulaire
// native VIDE sur la page de ce widget, avec CreateViewSection (même action que ensureTableGate,
// ligne ~365). Ce qui reste manuel, volontairement : cliquer Publier puis Copier le lien. Aucune
// méthode de l'API plugin n'expose la clé de partage secrète que "Publier" génère (_grist_Shares) ;
// il n'y a donc pas moyen d'automatiser cette dernière étape sans passer par un compte propriétaire
// en dehors du widget (voir docs/01-etude-comparative.md).
// ───────────────────────── Démarrage : tuiles + panneau déplié, un seul à la fois ─────────────────────────
const START_VIEWS = { choices: 'start-choices', existing: 'start-panel-existing', scratch: 'start-panel-scratch', link: 'start-panel-link' };
export function showStartView(view) {
  state.startView = view;
  Object.entries(START_VIEWS).forEach(([v, id]) => $(id).classList.toggle('hidden', v !== view));
}
$('step1').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-startgo]');
  if (btn) showStartView(btn.dataset.startgo);
});

// « Partir de zéro » : l'utilisateur choisit explicitement entre créer une table vide et
// repartir d'une table déjà présente dans le document (au lieu de le déduire d'un nom tapé
// à l'aveugle, qui peut ou non correspondre à une table existante).
const scratchExistingCombo = mountCombo($('scratch-existing-fields').querySelector('.combo-host'), 'Choisir une table…');
export async function setScratchMode(mode) {
  state.scratchMode = mode;
  $('step1').querySelectorAll('[data-scratchmode]').forEach(b => b.classList.toggle('active', b.dataset.scratchmode === mode));
  $('scratch-new-fields').classList.toggle('hidden', mode !== 'new');
  $('scratch-existing-fields').classList.toggle('hidden', mode !== 'existing');
  if (mode === 'existing') {
    const tables = await grist.docApi.listTables();
    scratchExistingCombo.setOptions(tables.map(t => ({ value: t, label: t })));
  }
}
$('step1').addEventListener('click', (e) => {
  const b = e.target.closest('[data-scratchmode]');
  if (b) setScratchMode(b.dataset.scratchmode);
});
setScratchMode('new');
$('scratchCreate').addEventListener('click', createEmptyForm);

export async function createEmptyForm() {
  const msg = $('scratch-msg');
  const widgetPage = myPageFromReferrer();
  if (!widgetPage) {
    msg.innerHTML = '<span class="err">Impossible de déterminer la page de ce widget (adresse de la page Grist illisible). Créez le formulaire manuellement depuis Grist : Ajouter une page → Formulaire.</span>';
    return;
  }

  if (state.scratchMode === 'existing') {
    const tableId = scratchExistingCombo.value;
    if (!tableId) { msg.innerHTML = '<span class="err">Choisissez une table.</span>'; return; }
    msg.textContent = 'Création en cours…';
    try {
      const tref = await getTableRef(tableId);
      await grist.docApi.applyUserActions([['CreateViewSection', tref, widgetPage, 'form', null, tableId]]);
      msg.innerHTML = `<span class="ok">Formulaire natif vide créé sur cette page pour la table « ${esc(tableId)} ». Cliquez sur <strong>Publier</strong> dans ce nouveau formulaire (repliez-le une fois publié), puis <strong>Copier le lien</strong>, et collez-le ci-dessus.</span>`;
    } catch (e) {
      msg.innerHTML = `<span class="err">Erreur : ${esc(e.message)}</span>`;
    }
    return;
  }

  const name = $('scratchTable').value.trim();
  if (!name) { msg.innerHTML = '<span class="err">Indiquez un nom de table.</span>'; return; }
  msg.textContent = 'Création en cours…';
  try {
    const existingRef = await getTableRef(name);
    let tableId = existingRef ? name : null;
    if (!tableId) {
      const before = await fetchMeta('_grist_Tables');
      await grist.docApi.applyUserActions([['AddTable', name, [{ id: 'A', type: 'Text' }]]]);
      const after = await fetchMeta('_grist_Tables');
      tableId = after.tableId.find(t => !before.tableId.includes(t));
      if (!tableId) throw new Error("La table n'a pas pu être créée.");
    }
    const tref = await getTableRef(tableId);
    await grist.docApi.applyUserActions([['CreateViewSection', tref, widgetPage, 'form', null, tableId]]);
    msg.innerHTML = `<span class="ok">Formulaire natif vide créé sur cette page pour la table « ${esc(tableId)} ». Cliquez sur <strong>Publier</strong> dans ce nouveau formulaire (repliez-le une fois publié), puis <strong>Copier le lien</strong>, et collez-le ci-dessus.</span>`;
    $('scratchTable').value = '';
  } catch (e) {
    msg.innerHTML = `<span class="err">Erreur : ${esc(e.message)}</span>`;
  }
}

// ───────────────────────── Liste des questions : cartes repliées, une seule dépliée à la fois ─────────────────────────

export function questionSummary(q) {
  const parts = [];
  if (q.kind === 'section') return q.description || '';
  if (q.kind === 'info') return 'Repliable';
  if (q.kind === 'choice') parts.push(`Depuis « ${q.sourceTable} »`);
  if (q.kind === 'select' || q.kind === 'multiselect') parts.push(`${(q.choices || []).length} option(s)`);
  if (SINGLE_CHOICE_KINDS.has(q.kind) && q.displayMode === 'radio') parts.push('en radio');
  if (q.writeTable && q.writeTable !== state.mainTableIdCache) parts.push(`écrit dans « ${q.writeTable} »`);
  const cond = normalizeCondition(q.condition);
  if (cond?.rules?.length) {
    const joiner = cond.mode === 'any' ? ' ou ' : ' et ';
    const desc = cond.rules.map(r => {
      const src = state.cfgQuestions.find(x => x.id === r.questionId);
      return `« ${src ? src.label : '?'} » = « ${r.value} »`;
    }).join(joiner);
    parts.push(`si ${desc}`);
  }
  return parts.join(' · ');
}

export function cardShell(q, i, total, isNew) {
  const id = isNew ? '__new__' : q.id;
  const expanded = state.expandedId === id;
  const icon = isNew ? ICONS.plus : (KINDS.find(k => k.id === q.kind)?.icon || ICONS.text);
  const label = isNew ? 'Nouvelle question' : (q.label || (q?.kind === 'section' ? '(titre de section)' : q?.kind === 'info' ? "(bloc d'info)" : '(sans titre)'));
  const meta = isNew ? '' : questionSummary(q);
  return `<div class="qcard ${expanded ? 'expanded' : ''}" data-id="${id}" data-kind="${isNew ? '' : q.kind}">
    <div class="qcard-row" data-toggle="${id}">
      ${!isNew ? `<span class="qgrip" draggable="true" data-qid="${id}" title="Glisser pour réordonner">${ICONS.grip}</span>` : ''}
      <span class="qicon">${icon}</span>
      <div class="qcard-main">
        <div class="qcard-label">${esc(label)}</div>
        ${meta ? `<div class="qcard-meta">${esc(meta)}</div>` : ''}
      </div>
      ${!isNew ? `<div class="qcard-order">
        <button type="button" class="icon-btn" data-move="up" data-qid="${id}" ${i === 0 ? 'disabled' : ''} title="Monter">${ICONS.arrowUp}</button>
        <button type="button" class="icon-btn" data-move="down" data-qid="${id}" ${i === total - 1 ? 'disabled' : ''} title="Descendre">${ICONS.arrowDown}</button>
      </div>` : ''}
      <span class="qcard-chevron">${ICONS.chevronDown}</span>
    </div>
    <div class="qcard-body hidden"></div>
  </div>`;
}

export function renderQuestionList() {
  const list = $('qlist');
  const total = state.cfgQuestions.length;
  let html = state.cfgQuestions.map((q, i) => cardShell(q, i, total, false)).join('');
  if (state.expandedId === '__new__') html += cardShell(null, total, total, true);
  list.innerHTML = html;
  $('qlist-empty').classList.toggle('hidden', total > 0 || state.expandedId === '__new__');
  if (state.expandedId) {
    const body = list.querySelector(`.qcard[data-id="${cssEsc(state.expandedId)}"] .qcard-body`);
    if (body) { body.classList.remove('hidden'); renderCardBody(state.expandedId, body); }
  }
}

$('qlist').addEventListener('click', (e) => {
  const moveEl = e.target.closest('[data-move]');
  if (moveEl) { e.stopPropagation(); moveQuestion(moveEl.dataset.qid, moveEl.dataset.move); return; }
  const toggleEl = e.target.closest('[data-toggle]');
  if (toggleEl) { toggleCard(toggleEl.dataset.toggle); }
});

// Glisser-déposer pour réordonner, en plus des flèches (gardées pour le clavier et les lecteurs
// d'écran, jamais retirées : le glisser-déposer seul n'est pas accessible à tout le monde).
$('qlist').addEventListener('dragstart', (e) => {
  const grip = e.target.closest('.qgrip');
  if (!grip) { e.preventDefault(); return; }
  state.dragQId = grip.dataset.qid;
  e.dataTransfer.effectAllowed = 'move';
});
$('qlist').addEventListener('dragover', (e) => {
  if (!state.dragQId) return;
  e.preventDefault();
  const card = e.target.closest('.qcard');
  if (!card || card.dataset.id === state.dragQId) return;
  $('qlist').querySelectorAll('.qcard.drag-over').forEach(c => c.classList.remove('drag-over'));
  card.classList.add('drag-over');
});
$('qlist').addEventListener('dragleave', (e) => { e.target.closest('.qcard')?.classList.remove('drag-over'); });
$('qlist').addEventListener('dragend', () => { state.dragQId = null; $('qlist').querySelectorAll('.qcard.drag-over').forEach(c => c.classList.remove('drag-over')); });
$('qlist').addEventListener('drop', async (e) => {
  e.preventDefault();
  const card = e.target.closest('.qcard');
  $('qlist').querySelectorAll('.qcard.drag-over').forEach(c => c.classList.remove('drag-over'));
  const fromId = state.dragQId; state.dragQId = null;
  if (!card || !fromId || card.dataset.id === fromId) return;
  const fromIdx = state.cfgQuestions.findIndex(q => q.id === fromId);
  const toIdx = state.cfgQuestions.findIndex(q => q.id === card.dataset.id);
  if (fromIdx < 0 || toIdx < 0) return;
  const [moved] = state.cfgQuestions.splice(fromIdx, 1);
  state.cfgQuestions.splice(toIdx, 0, moved);
  await saveConfig(state.options.publicUrl, state.options.viewRef);
  renderQuestionList();
});
$('qadd').addEventListener('click', () => { state.expandedId = '__new__'; renderQuestionList(); $('qlist').lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); });
$('qimport').addEventListener('click', importNativeFields);
$('qreset').addEventListener('click', resetQuestions);

export function toggleCard(id) {
  state.expandedId = (state.expandedId === id) ? null : id;
  renderQuestionList();
}

export async function moveQuestion(id, dir) {
  const i = state.cfgQuestions.findIndex(q => q.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= state.cfgQuestions.length) return;
  [state.cfgQuestions[i], state.cfgQuestions[j]] = [state.cfgQuestions[j], state.cfgQuestions[i]];
  await saveConfig(state.options.publicUrl, state.options.viewRef);
  renderQuestionList();
}

export function choiceQuestionsBefore(excludeId) {
  return state.cfgQuestions.filter(q => (q.kind === 'choice' || q.kind === 'select') && q.id !== excludeId);
}

// Combobox de recherche, remplace un <select> pour les listes de tables/colonnes qui peuvent
// être longues. Filtre en tapant, ferme au clic extérieur, aucune dépendance externe.
export function mountCombo(host, placeholder) {
  host.innerHTML = `<div class="combo"><input type="text" class="combo-input" placeholder="${esc(placeholder || 'Rechercher…')}" autocomplete="off"><div class="combo-list hidden"></div></div>`;
  const input = host.querySelector('.combo-input');
  const listEl = host.querySelector('.combo-list');
  let items = [];
  let value = '';
  let onChangeCb = null;
  function renderOptions(filter) {
    const f = (filter || '').toLowerCase();
    const filtered = items.filter(it => it.label.toLowerCase().includes(f));
    listEl.innerHTML = filtered.length
      ? filtered.map(it => `<div class="combo-opt" data-value="${esc(it.value)}">${esc(it.label)}</div>`).join('')
      : `<div class="combo-empty">Aucun résultat</div>`;
  }
  input.addEventListener('focus', () => { renderOptions(''); listEl.classList.remove('hidden'); });
  input.addEventListener('input', () => { renderOptions(input.value); listEl.classList.remove('hidden'); });
  input.addEventListener('blur', () => setTimeout(() => listEl.classList.add('hidden'), 150));
  listEl.addEventListener('mousedown', (e) => {
    const opt = e.target.closest('.combo-opt');
    if (!opt) return;
    e.preventDefault();
    value = opt.dataset.value;
    const found = items.find(it => String(it.value) === value);
    input.value = found ? found.label : value;
    listEl.classList.add('hidden');
    if (onChangeCb) onChangeCb(value);
  });
  return {
    setOptions(newItems, selected) {
      items = newItems;
      if (selected != null && items.find(it => String(it.value) === String(selected))) {
        value = String(selected);
        input.value = items.find(it => String(it.value) === value).label;
      } else {
        value = ''; input.value = '';
      }
    },
    get value() { return value; },
    onChange(cb) { onChangeCb = cb; },
  };
}

// Construit le contenu dépliable d'une carte : formulaire de réglages. La colonne de
// destination d'une question "texte" est toujours visible (chaque réponse doit bien être
// rangée quelque part) ; seul le choix d'une AUTRE table reste derrière un lien. Une question
// "choix" n'a jamais de destination à régler : elle est entièrement automatique (colonne
// Référence cachée créée et gérée par ensureChoiceField).
export async function renderCardBody(id, body) {
  const isNew = id === '__new__';
  const q = isNew ? null : state.cfgQuestions.find(x => x.id === id);
  const tables = await grist.docApi.listTables();
  const tableItems = tables.map(t => ({ value: t, label: t }));
  const condCandidates = choiceQuestionsBefore(isNew ? null : id);
  const tableOverrideOpen = !!(q && q.kind !== 'choice' && q.writeTable && q.writeTable !== state.mainTableIdCache);
  const conditionOpen = !!q?.condition;

  const displayMode = q?.displayMode || 'dropdown';
  body.innerHTML = `
    <div class="qtype-toggle">
      ${KINDS.map(k => `<button type="button" class="qtype-btn" data-kind="${k.id}">${k.icon}<span>${k.label}</span></button>`).join('')}
    </div>
    <label for="qf-label-${id}">Intitulé</label>
    <input id="qf-label-${id}" class="qf-label" type="text" placeholder="Votre question" value="${esc(q?.label || '')}">
    <label for="qf-desc-${id}" class="qf-desc-label-short">Description</label>
    <input id="qf-desc-${id}" class="qf-desc" type="text" placeholder="Facultatif" value="${esc(q?.description || '')}">
    <label for="qf-desc-long-${id}" class="qf-desc-label-long hidden">Contenu du bloc</label>
    <textarea id="qf-desc-long-${id}" class="qf-desc-long hidden" rows="4" placeholder="Texte affiché une fois le bloc déplié">${esc(q?.description || '')}</textarea>
    <div class="qf-choice-fields hidden">
      <label>Table source</label><div class="combo-host" data-combo="srcTable"></div>
      <label>Colonne affichée (libellé)</label><div class="combo-host" data-combo="srcCol"></div>
    </div>
    <div class="qf-fixed-options hidden">
      <label for="qf-choices-${id}">Options (une par ligne)</label>
      <textarea id="qf-choices-${id}" class="qf-choices" rows="4" placeholder="Option 1&#10;Option 2">${esc((q?.choices || []).join('\n'))}</textarea>
    </div>
    <div class="qf-display-mode hidden">
      <button type="button" class="qf-display-btn" data-display="dropdown">${ICONS.list}<span>Menu déroulant</span></button>
      <button type="button" class="qf-display-btn" data-display="radio">${ICONS.radio}<span>Boutons radio</span></button>
    </div>
    <div class="qf-text-fields hidden">
      <label>Colonne de destination</label><div class="combo-host" data-combo="writeCol"></div>
      <button type="button" class="qf-link" data-reveal="table">${ICONS.settings}<span>Écrire dans une autre table</span></button>
      <div class="qf-table-override ${tableOverrideOpen ? '' : 'hidden'}">
        <label>Table de destination</label><div class="combo-host" data-combo="writeTable"></div>
      </div>
    </div>
    <label class="toggle qf-required-row"><input type="checkbox" class="qf-required" ${q?.required ? 'checked' : ''}><span class="toggle-track"><span class="toggle-thumb"></span></span><span>Obligatoire</span></label>
    <button type="button" class="qf-link" data-reveal="condition">${ICONS.branch}<span>Condition d'affichage</span></button>
    <div class="qf-condition ${conditionOpen ? '' : 'hidden'}">
      <div class="qf-cond-mode hidden">
        <button type="button" class="qf-cond-mode-btn" data-mode="all">Toutes vraies (ET)</button>
        <button type="button" class="qf-cond-mode-btn" data-mode="any">Au moins une vraie (OU)</button>
      </div>
      <div class="qf-cond-rules"></div>
      <button type="button" class="qf-link qf-cond-add">${ICONS.plus}<span>Ajouter une condition</span></button>
    </div>
    <p class="qf-msg muted"></p>
    <div class="qcard-footer">
      <div class="qcard-footer-left">
        ${!isNew ? `<button type="button" class="icon-btn" data-dup title="Dupliquer">${ICONS.copy}</button><button type="button" class="icon-btn danger" data-del title="Supprimer">${ICONS.trash}</button>` : ''}
      </div>
      <div class="qcard-footer-right">
        <button type="button" class="qf-cancel">Annuler</button>
        <button type="button" class="qf-save primary">Enregistrer</button>
      </div>
    </div>`;

  const combos = {};
  body.querySelectorAll('[data-combo]').forEach(host => { combos[host.dataset.combo] = mountCombo(host); });

  const kind = q?.kind || 'text';
  const setKind = (k) => {
    const layout = LAYOUT_KINDS.has(k);
    body.querySelectorAll('.qtype-btn').forEach(b => b.classList.toggle('active', b.dataset.kind === k));
    body.querySelector('.qf-choice-fields').classList.toggle('hidden', k !== 'choice');
    body.querySelector('.qf-fixed-options').classList.toggle('hidden', k !== 'select' && k !== 'multiselect');
    body.querySelector('.qf-display-mode').classList.toggle('hidden', !SINGLE_CHOICE_KINDS.has(k));
    body.querySelector('.qf-text-fields').classList.toggle('hidden', k === 'choice' || layout);
    body.querySelector('.qf-required-row').classList.toggle('hidden', layout);
    body.querySelector('.qf-desc-label-short').classList.toggle('hidden', k === 'info');
    body.querySelector('.qf-desc').classList.toggle('hidden', k === 'info');
    body.querySelector('.qf-desc-label-long').classList.toggle('hidden', k !== 'info');
    body.querySelector('.qf-desc-long').classList.toggle('hidden', k !== 'info');
  };
  setKind(kind);
  body.querySelectorAll('.qtype-btn').forEach(b => b.addEventListener('click', () => setKind(b.dataset.kind)));

  const setDisplay = (d) => body.querySelectorAll('.qf-display-btn').forEach(b => b.classList.toggle('active', b.dataset.display === d));
  setDisplay(displayMode);
  body.querySelectorAll('.qf-display-btn').forEach(b => b.addEventListener('click', () => setDisplay(b.dataset.display)));

  body.querySelectorAll('[data-reveal]').forEach(b => b.addEventListener('click', () => {
    const el = body.querySelector(b.dataset.reveal === 'table' ? '.qf-table-override' : '.qf-condition');
    el.classList.toggle('hidden');
  }));

  combos.srcTable.setOptions(tableItems, q?.sourceTable);
  async function refreshSrcCol() {
    if (!combos.srcTable.value) { combos.srcCol.setOptions([]); return; }
    const data = await fetchMeta(combos.srcTable.value);
    combos.srcCol.setOptions(columnOptions(data).map(c => ({ value: c, label: c })), q?.sourceCol);
  }
  combos.srcTable.onChange(refreshSrcCol);
  await refreshSrcCol();

  // La colonne de destination "texte" suit toujours la table active (celle qu'on a choisi
  // d'écrire ailleurs, sinon la table principale) : jamais besoin d'ouvrir "Écrire dans une
  // autre table" juste pour voir où la réponse ira, seulement pour CHANGER la table.
  combos.writeTable.setOptions(tableItems, q?.writeTable ?? state.mainTableIdCache);
  async function refreshWriteCol() {
    if (!combos.writeTable.value) { combos.writeCol.setOptions([]); return; }
    const data = await fetchMeta(combos.writeTable.value);
    combos.writeCol.setOptions(columnOptions(data).map(c => ({ value: c, label: c })), q?.writeCol);
  }
  combos.writeTable.onChange(refreshWriteCol);
  await refreshWriteCol();

  // Conditions combinées : N critères (question source = valeur), combinés en ET (toutes vraies)
  // ou en OU (au moins une) — voir normalizeCondition (links.js) pour les deux formats acceptés.
  // condRules est la donnée de travail de cette carte ; body.getCondition() la relit à
  // l'enregistrement (saveQuestionFromCard n'a pas d'autre accès à cette fermeture).
  const condNorm = normalizeCondition(q?.condition);
  const condRules = (condNorm?.rules?.length ? condNorm.rules : [{ questionId: '', value: '' }])
    .map(r => ({ questionId: r.questionId, value: r.value }));
  let condMode = condNorm?.mode === 'any' ? 'any' : 'all';
  const condModeEl = body.querySelector('.qf-cond-mode');
  const condRulesEl = body.querySelector('.qf-cond-rules');
  const condRuleCombos = [];

  function setCondMode(m) {
    condMode = m;
    condModeEl.querySelectorAll('.qf-cond-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m));
  }

  async function refreshRuleValue(i) {
    const srcId = condRules[i].questionId;
    const combo = condRuleCombos[i];
    if (!srcId) { combo.setOptions([]); return; }
    const src = state.cfgQuestions.find(x => x.id === srcId);
    if (src?.kind === 'select') {
      combo.setOptions((src.choices || []).map(v => ({ value: v, label: v })), condRules[i].value);
    } else if (src?.kind === 'choice') {
      const data = await fetchMeta(src.sourceTable);
      combo.setOptions((data[src.sourceCol] || []).map(v => ({ value: v, label: v })), condRules[i].value);
    } else {
      combo.setOptions([]);
    }
  }

  async function renderCondRules() {
    condModeEl.classList.toggle('hidden', condRules.length < 2);
    setCondMode(condMode);
    condRulesEl.innerHTML = condRules.map((r, i) => `
      <div class="qf-cond-rule" data-idx="${i}">
        <div class="qf-cond-rule-head">
          <label>Afficher si</label>
          ${condRules.length > 1 ? `<button type="button" class="icon-btn danger qf-cond-remove" data-idx="${i}" title="Retirer cette condition">${ICONS.trash}</button>` : ''}
        </div>
        <select class="qf-condQ" data-idx="${i}"><option value="">— choisir une question —</option>${condCandidates.map(c => `<option value="${c.id}" ${c.id === r.questionId ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select>
        <label>égale</label><div class="combo-host"></div>
      </div>`).join('');
    condRuleCombos.length = 0;
    const rows = [...condRulesEl.querySelectorAll('.qf-cond-rule')];
    rows.forEach((row, i) => {
      const combo = mountCombo(row.querySelector('.combo-host'));
      condRuleCombos[i] = combo;
      combo.onChange((v) => { condRules[i].value = v; });
      row.querySelector('.qf-condQ').addEventListener('change', (e) => {
        condRules[i].questionId = e.target.value;
        condRules[i].value = '';
        refreshRuleValue(i);
      });
      row.querySelector('.qf-cond-remove')?.addEventListener('click', () => { condRules.splice(i, 1); renderCondRules(); });
    });
    await Promise.all(rows.map((_, i) => refreshRuleValue(i)));
  }
  await renderCondRules();
  body.querySelector('.qf-cond-add').addEventListener('click', () => { condRules.push({ questionId: '', value: '' }); renderCondRules(); });
  condModeEl.querySelectorAll('.qf-cond-mode-btn').forEach(b => b.addEventListener('click', () => setCondMode(b.dataset.mode)));

  body.getCondition = () => {
    const rules = condRules
      .filter(r => r.questionId && r.value !== '' && r.value != null)
      .map(r => ({ questionId: r.questionId, op: 'equals', value: r.value }));
    return rules.length ? { mode: condMode, rules } : null;
  };

  body.querySelector('.qf-cancel').addEventListener('click', () => { state.expandedId = null; renderQuestionList(); });
  body.querySelector('.qf-save').addEventListener('click', () => saveQuestionFromCard(id, body, q, combos));
  body.querySelector('[data-del]')?.addEventListener('click', async () => {
    state.cfgQuestions = state.cfgQuestions.filter(x => x.id !== id);
    state.expandedId = null;
    await saveConfig(state.options.publicUrl, state.options.viewRef);
    renderQuestionList();
  });
  body.querySelector('[data-dup]')?.addEventListener('click', async () => {
    const copy = { ...q, id: uid(), label: (q.label || '') + ' (copie)' };
    delete copy.importedFrom; // la copie n'est plus liée au champ natif d'origine
    state.cfgQuestions = [...state.cfgQuestions, copy];
    state.expandedId = copy.id;
    await saveConfig(state.options.publicUrl, state.options.viewRef);
    renderQuestionList();
  });
}

export async function saveQuestionFromCard(id, body, existing, combos) {
  const msg = body.querySelector('.qf-msg');
  const kind = body.querySelector('.qtype-btn.active')?.dataset.kind || 'text';
  const label = body.querySelector('.qf-label').value.trim() ||
    (kind === 'choice' ? 'Votre choix' : kind === 'section' ? 'Section' : kind === 'info' ? "Bloc d'info" : 'Réponse');
  const description = (kind === 'info' ? body.querySelector('.qf-desc-long') : body.querySelector('.qf-desc')).value.trim();
  const condition = body.getCondition ? body.getCondition() : null;

  try {
    msg.textContent = 'Enregistrement…';
    const q = { id: existing?.id || uid(), kind, label, description, condition };
    if (existing?.importedFrom) q.importedFrom = existing.importedFrom;

    if (LAYOUT_KINDS.has(kind)) {
      // Titre de section / bloc d'info : ne collecte rien, pas de destination ni d'obligatoire.
      state.cfgQuestions = [...state.cfgQuestions.filter(x => x.id !== q.id), q];
      await saveConfig(state.options.publicUrl, state.options.viewRef);
      state.expandedId = null;
      renderQuestionList();
      return;
    }

    q.required = body.querySelector('.qf-required').checked;
    if (SINGLE_CHOICE_KINDS.has(kind)) q.displayMode = body.querySelector('.qf-display-btn.active')?.dataset.display || 'dropdown';
    const mainTableId = await tableIdOfRef(state.currentFormSection.tableRef);
    if (kind === 'choice') {
      q.sourceTable = combos.srcTable.value;
      q.sourceCol = combos.srcCol.value;
      if (!q.sourceTable || !q.sourceCol) { msg.innerHTML = '<span class="err">Choisissez une table source et sa colonne affichée.</span>'; return; }
      // La colonne de destination est TOUJOURS la référence cachée que crée/retrouve
      // ensureChoiceField, jamais un choix libre : c'est ce qui garantit que la lecture
      // fonctionne aussi pour la session anonyme (voir docs/01, "piège visibleCol").
      q.writeTable = mainTableId;
      q.writeCol = await ensureChoiceField(mainTableId, state.currentFormSection.id, q.sourceTable, q.sourceCol);
    } else {
      if (kind === 'select' || kind === 'multiselect') {
        q.choices = body.querySelector('.qf-choices').value.split('\n').map(s => s.trim()).filter(Boolean);
        if (!q.choices.length) { msg.innerHTML = '<span class="err">Ajoutez au moins une option (une par ligne).</span>'; return; }
      }
      q.writeTable = combos.writeTable.value;
      q.writeCol = combos.writeCol.value;
      if (!q.writeTable || !q.writeCol) { msg.innerHTML = '<span class="err">Choisissez la colonne où enregistrer la réponse.</span>'; return; }
      if (q.writeTable !== mainTableId) await ensureTableGate(q.writeTable, state.currentFormSection.viewRef);
    }
    state.cfgQuestions = [...state.cfgQuestions.filter(x => x.id !== q.id), q];
    await saveConfig(state.options.publicUrl, state.options.viewRef);
    state.expandedId = null;
    renderQuestionList();
  } catch (e) {
    msg.innerHTML = `<span class="err">Erreur : ${esc(e.message)}</span>`;
  }
}

// ───────────────────────── Importer les champs du formulaire natif ─────────────────────────
// Bascule un champ natif compatible (Texte, Nombre, Date, Oui/non, Choix, Choix multiples ou
// Référence) vers une question FormPlus éditable dans la même liste : le masque côté formulaire
// natif (formIsHidden, même mécanisme que pour nos propres colonnes techniques) et crée
// l'entrée correspondante. state.currentFormSection est TOUJOURS la copie créée par
// duplicateFormSection (voir generate(), plus haut), jamais le formulaire d'origine du
// concepteur : masquer un champ ici ne touche donc que cette copie. À sens unique : une fois
// importé, le champ se gère depuis FormPlus ; le rendre à nouveau visible sur la copie ne
// resynchronise pas automatiquement les libellés ou réglages dans l'autre sens (seul
// « Réinitialiser les questions » sait revenir en arrière, en redémasquant précisément les
// champs qu'il a lui-même importés).
export async function importNativeFields() {
  const msg = $('import-msg');
  msg.textContent = 'Lecture du formulaire natif…';
  try {
    const r = await fetch(`${state.currentLink.api}/forms/${state.currentLink.vsId}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const form = await r.json();
    const mainTableId = await tableIdOfRef(state.currentFormSection.tableRef);
    const cols = await fetchMeta('_grist_Tables_column');
    const tables = await fetchMeta('_grist_Tables');
    const mainTableRef = tables.id[tables.tableId.indexOf(mainTableId)];
    const sectionFields = await fetchMeta('_grist_Views_section_field');

    const imported = [];
    const skipped = {};
    const fieldUpdates = [];

    // Correspondance type de colonne Grist → type de question FormPlus. Hors périmètre pour
    // l'instant : DateTime, RefList (aucun "kind" équivalent côté éditeur).
    const SIMPLE_MAP = { Date: 'date', Numeric: 'number', Int: 'number', Bool: 'bool' };
    for (const [fieldId, fl] of Object.entries(form.formFieldsById)) {
      const o = fl.options || {};
      if (o.formIsHidden) continue; // déjà masqué : déjà importé, ou masqué intentionnellement
      let kind = null;
      if (fl.type === 'Text' || fl.type === 'Any') kind = o.formTextFormat === 'multiline' ? 'longtext' : 'text';
      else if (fl.type === 'Attachments') kind = 'attachments';
      else if (fl.type === 'Ref') kind = 'choice';
      else if (fl.type === 'Choice') kind = 'select';
      else if (fl.type === 'ChoiceList') kind = 'multiselect';
      else if (SIMPLE_MAP[fl.type]) kind = SIMPLE_MAP[fl.type];
      if (!kind) {
        skipped[fl.type] = (skipped[fl.type] || 0) + 1;
        continue;
      }
      // importedFrom (id du champ natif) permet à « Réinitialiser » de retrouver précisément
      // et de démasquer le bon champ, sans toucher aux champs masqués manuellement dans Grist.
      const q = { id: uid(), label: fl.question, description: fl.description || '', required: !!o.formRequired, condition: null, importedFrom: fieldId };
      if (kind === 'choice' || kind === 'select') q.displayMode = o.formSelectFormat === 'radio' ? 'radio' : 'dropdown';
      if (kind === 'choice') {
        const colIdx = cols.colId.findIndex((c, i) => c === fl.colId && cols.parentId[i] === mainTableRef);
        if (colIdx < 0) { skipped['Référence (introuvable)'] = (skipped['Référence (introuvable)'] || 0) + 1; continue; }
        const m = /^Ref:(.+)$/.exec(cols.type[colIdx] || '');
        const sourceTable = m ? m[1] : null;
        const visibleColRef = cols.visibleCol[colIdx];
        const visIdx = visibleColRef ? cols.id.indexOf(visibleColRef) : -1;
        const sourceCol = visIdx >= 0 ? cols.colId[visIdx] : 'id';
        if (!sourceTable) { skipped['Référence (table introuvable)'] = (skipped['Référence (table introuvable)'] || 0) + 1; continue; }
        q.kind = 'choice';
        q.sourceTable = sourceTable;
        q.sourceCol = sourceCol;
        q.writeTable = mainTableId;
        q.writeCol = await ensureChoiceField(mainTableId, state.currentFormSection.id, sourceTable, sourceCol);
      } else if (kind === 'select' || kind === 'multiselect') {
        q.kind = kind;
        q.choices = o.choices || [];
        q.writeTable = mainTableId;
        q.writeCol = fl.colId; // colonne déjà existante : aucune nouvelle colonne créée
      } else {
        q.kind = kind;
        q.writeTable = mainTableId;
        q.writeCol = fl.colId; // colonne déjà existante : aucune nouvelle colonne créée
      }
      // Masque le champ natif d'origine pour que FormPlus en devienne le seul affichage.
      const fieldRowIdx = sectionFields.id.findIndex((rowId, i) =>
        sectionFields.parentId[i] === state.currentFormSection.id && String(rowId) === String(fieldId));
      if (fieldRowIdx >= 0) {
        let existingOpts = {};
        try { existingOpts = JSON.parse(sectionFields.widgetOptions[fieldRowIdx] || '{}') || {}; } catch (e) { /* ignore */ }
        fieldUpdates.push(['UpdateRecord', '_grist_Views_section_field', sectionFields.id[fieldRowIdx],
          { widgetOptions: JSON.stringify({ ...existingOpts, formIsHidden: true }) }]);
      }
      imported.push(q);
    }

    if (fieldUpdates.length) await grist.docApi.applyUserActions(fieldUpdates);
    if (imported.length) {
      state.cfgQuestions = [...state.cfgQuestions, ...imported];
      await saveConfig(state.options.publicUrl, state.options.viewRef);
      renderQuestionList();
    }
    const skipMsg = Object.keys(skipped).length ? ` Ignorés (type non pris en charge pour l'instant) : ${Object.entries(skipped).map(([t, n]) => `${n} ${t}`).join(', ')}.` : '';
    msg.innerHTML = imported.length
      ? `<span class="ok">${imported.length} champ(s) importé(s).${skipMsg}</span>`
      : `<span class="muted">Rien à importer.${skipMsg || ' Tous les champs sont déjà pris en charge ou déjà importés.'}</span>`;
  } catch (e) {
    msg.innerHTML = `<span class="err">Erreur : ${esc(e.message)}</span>`;
  }
}

// Vide la liste de questions de CE widget. Les champs natifs importés redeviennent visibles
// dans le formulaire natif (démasqués via leur importedFrom, jamais un champ masqué à la main
// dans Grist). La configuration vit entièrement dans les options de la section widget
// (_grist_Views_section.options.customView.widgetOptions, visible uniquement via l'API ou la
// "Vue du code" de Grist, jamais dans une colonne d'une table) : aucune donnée déjà répondue
// n'est touchée, seule la définition des questions l'est.
export async function resetQuestions() {
  if (!state.cfgQuestions.length) return;
  const ok = confirm('Retirer toutes les questions supplémentaires de ce widget ? Les champs natifs importés redeviendront visibles dans le formulaire natif. Les réponses déjà enregistrées ne sont pas touchées.');
  if (!ok) return;
  const msg = $('import-msg');
  try {
    const toUnhide = state.cfgQuestions.filter(q => q.importedFrom);
    if (toUnhide.length) {
      const sectionFields = await fetchMeta('_grist_Views_section_field');
      const actions = [];
      for (const q of toUnhide) {
        const idx = sectionFields.id.findIndex((rowId, i) =>
          sectionFields.parentId[i] === state.currentFormSection.id && String(rowId) === String(q.importedFrom));
        if (idx < 0) continue;
        let opts = {};
        try { opts = JSON.parse(sectionFields.widgetOptions[idx] || '{}') || {}; } catch (e) { /* ignore */ }
        delete opts.formIsHidden;
        actions.push(['UpdateRecord', '_grist_Views_section_field', sectionFields.id[idx], { widgetOptions: JSON.stringify(opts) }]);
      }
      if (actions.length) await grist.docApi.applyUserActions(actions);
    }
    state.cfgQuestions = [];
    state.expandedId = null;
    await saveConfig(state.options.publicUrl, state.options.viewRef);
    renderQuestionList();
    msg.innerHTML = '<span class="ok">Questions réinitialisées.</span>';
  } catch (e) {
    msg.innerHTML = `<span class="err">Erreur : ${esc(e.message)}</span>`;
  }
}

export function fillAppearanceFields(opts) {
  $('opt-title').value = opts?.formTitle || '';
  $('opt-desc').value = opts?.formDescription || '';
  $('opt-logo').value = opts?.logoUrl || '';
  $('opt-accent').value = opts?.accentColor || '#000091';
  $('opt-progress').checked = !!opts?.showProgress;
  $('opt-submit').value = opts?.submitLabel || '';
  $('opt-endmsg').value = opts?.endMessage || '';
  $('opt-redirect').value = opts?.redirectUrl || '';
}

export async function showConfig() {
  show('config');
  showStartView('choices');
  setScratchMode('new');
  populateFormPicker();
  if (state.options?.formLink) {
    $('link').value = state.options.formLink;
    // state.options.vsId est la section que FormPlus gère réellement (sa copie, voir generate()
    // dans grist-meta.js) : jamais ré-déduite du lien collé, qui pointe vers le formulaire
    // d'origine du concepteur et peut différer du vsId depuis l'ajout de la duplication.
    const parsed = parseFormLink(state.options.formLink);
    state.currentLink = parsed ? { ...parsed, vsId: state.options.vsId, sourceVsId: state.options.sourceVsId ?? state.options.vsId } : null;
    state.cfgQuestions = migrateLegacy(state.options);
    fillAppearanceFields(state.options);
    if (state.options.publicUrl) { $('public-url').textContent = state.options.publicUrl; $('result').classList.remove('hidden'); }
    if (state.currentLink?.vsId != null) {
      const sections = await fetchMeta('_grist_Views_section');
      const idx = sections.id.indexOf(state.currentLink.vsId);
      if (idx >= 0) {
        state.currentFormSection = { id: state.currentLink.vsId, viewRef: sections.parentId[idx], tableRef: sections.tableRef[idx] };
        state.mainTableIdCache = await tableIdOfRef(state.currentFormSection.tableRef);
        $('questions-card').classList.remove('hidden');
        $('appearance-card').classList.remove('hidden');
        renderQuestionList();
      }
    }
  }
}

// ───────────────────────── Choisir un formulaire natif déjà présent dans le document ─────────────────────────
// Repli toujours disponible : le champ de collage manuel du lien reste affiché sous la liste,
// jamais retiré. Un formulaire publié voit sa clé retrouvée automatiquement (findExistingShareKey)
// et l'adresse générée sans copier-coller ; un formulaire non publié affiche une consigne précise
// plutôt qu'une tentative de publication automatique (aucune méthode de l'API plugin ne génère la
// clé secrète que « Publier » crée, voir findExistingShareKey et docs/01-etude-comparative.md).
export async function populateFormPicker() {
  const sel = $('formPicker');
  sel.innerHTML = '<option value="">Chargement…</option>';
  try {
    const sections = await fetchMeta('_grist_Views_section');
    const tables = await fetchMeta('_grist_Tables');
    const tableIdByRef = {};
    tables.id.forEach((id, i) => { tableIdByRef[id] = tables.tableId[i]; });
    const items = [];
    for (let i = 0; i < sections.id.length; i++) {
      if (sections.parentKey[i] !== 'form') continue;
      const tableId = tableIdByRef[sections.tableRef[i]];
      if (!tableId || tableId.startsWith('_grist_')) continue;
      // Jamais nos propres copies (duplicateFormSection) : ce sont des formulaires GÉRÉS par
      // FormPlus, jamais une source à dupliquer à nouveau.
      let secOpt = {}; try { secOpt = JSON.parse(sections.options[i] || '{}') || {}; } catch (e) { /* ignore */ }
      if (secOpt.formplusDuplicate) continue;
      let opt = {}; try { opt = JSON.parse(sections.shareOptions[i] || '{}') || {}; } catch (e) { /* ignore */ }
      items.push({ vsId: sections.id[i], viewRef: sections.parentId[i], tableId, published: !!(opt.publish && opt.form) });
    }
    state.formPickerItems = items;
    sel.innerHTML = items.length
      ? '<option value="">— choisir —</option>' + items.map(it => `<option value="${it.vsId}">${esc(it.tableId)}${it.published ? '' : ' (non publié)'}</option>`).join('')
      : '<option value="">Aucun formulaire natif trouvé dans ce document</option>';
  } catch (e) {
    sel.innerHTML = '<option value="">Liste indisponible</option>';
    diag({ event: 'populateFormPicker-failed', message: e.message });
  }
}
$('formPicker').addEventListener('change', async () => {
  const vsId = Number($('formPicker').value);
  const msg = $('formPicker-msg');
  if (!vsId) { msg.textContent = ''; return; }
  const item = state.formPickerItems.find(it => it.vsId === vsId);
  if (!item) return;
  if (!item.published) {
    msg.innerHTML = `<span class="err">Ce formulaire n'est pas encore publié. Ouvrez-le sur sa page, cliquez sur <strong>Publier</strong>, puis <strong>Copier le lien</strong> et collez-le ci-dessous.</span>`;
    return;
  }
  msg.textContent = "Recherche de l'adresse déjà publiée…";
  const key = await findExistingShareKey(item.viewRef);
  const origin = hostOrgFromReferrer();
  if (!key || !origin) {
    msg.innerHTML = `<span class="err">Adresse publiée non retrouvée automatiquement. Ouvrez ce formulaire, <strong>Copier le lien</strong>, et collez-le ci-dessous.</span>`;
    return;
  }
  const base = origin.org ? `${origin.host}/o/${origin.org}` : origin.host;
  $('link').value = `${base}/forms/${key}/${item.vsId}`;
  msg.innerHTML = '<span class="ok">Adresse retrouvée automatiquement.</span>';
  await generate();
});

