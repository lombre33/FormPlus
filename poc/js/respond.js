import { $, esc, show } from './dom.js';
import { ICONS } from './icons.js';
import { LAYOUT_KINDS, SINGLE_CHOICE_KINDS } from './kinds.js';
import { parseFormLink, migrateLegacy, normalizeCondition } from './links.js';
import { applyBranding } from './theme.js';
import { probeCanEdit } from './grist-meta.js';
import { diag, fragmentFormLink } from './diag.js';
import { state } from './state.js';

// ───────────────────────── Rendu répondant (formulaire natif + questions supplémentaires) ─────────────────────────

export function layoutOrder(f) {
  const ids = [];
  try {
    const walk = (n) => { if (!n) return; if (n.type === 'Field' && n.leaf != null) ids.push(String(n.leaf)); (n.children || []).forEach(walk); };
    walk(JSON.parse(f.formLayoutSpec));
  } catch (e) { /* ignore */ }
  const all = Object.keys(f.formFieldsById);
  return ids.filter(i => all.includes(i)).concat(all.filter(i => !ids.includes(i)));
}

export function renderNativeField(id, fl, prefillParams) {
  const o = fl.options || {};
  const name = fl.colId;
  // colId vient de l'API /forms/<clé>/<section> d'un document Grist quelconque (y compris,
  // documenté plus bas, via le secours d'URL #form=<lien> sur un hôte arbitraire) : jamais fait
  // confiance sans échappement dans le HTML produit, comme fl.question/fl.description juste en
  // dessous — mais uniquement à l'affichage : le nom de paramètre d'URL et l'attribut `name` lu
  // par onSubmit (via dataset.col, que le navigateur décode automatiquement) restent la valeur
  // brute, jamais la version échappée.
  const nameAttr = esc(name);
  const req = o.formRequired ? 'req' : '';
  const hidden = o.formIsHidden;
  const prefill = o.formAcceptFromUrl ? prefillParams.get(name) : null;
  const head = `<label class="title ${req}" for="i${id}">${esc(fl.question)}</label>` +
    (fl.description ? `<p class="desc">${esc(fl.description)}</p>` : '');
  let input = '';
  const choices = o.choices || [];
  const refs = fl.refValues || [];
  switch (fl.type) {
    case 'Int': case 'Numeric':
      input = `<input id="i${id}" type="number" step="any" name="${nameAttr}" value="${esc(prefill ?? '')}">`; break;
    case 'Bool':
      input = `<label class="switch"><input type="checkbox" name="${nameAttr}" ${prefill === 'true' ? 'checked' : ''}> Oui</label>`; break;
    case 'Date':
      input = `<input id="i${id}" type="date" name="${nameAttr}" value="${esc(prefill ?? '')}">`; break;
    case 'DateTime':
      input = `<input id="i${id}" type="datetime-local" name="${nameAttr}" value="${esc(prefill ?? '')}">`; break;
    case 'Choice':
    case 'Ref': {
      const opts = fl.type === 'Choice' ? choices.map(c => [c, c]) : refs.map(([rid, v]) => [rid, v]);
      if (o.formSelectFormat === 'radio') {
        input = `<div class="pv-pill-group">${opts.map(([v, l]) => `<label class="pv-pill"><input type="radio" name="${nameAttr}" value="${esc(v)}" ${String(v) === prefill ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
      } else {
        input = `<select id="i${id}" name="${nameAttr}"><option value="">Choisir…</option>` +
          opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === prefill ? 'selected' : ''}>${esc(l)}</option>`).join('') + `</select>`;
      }
      break;
    }
    case 'ChoiceList':
    case 'RefList': {
      const opts = fl.type === 'ChoiceList' ? choices.map(c => [c, c]) : refs.map(([rid, v]) => [rid, v]);
      input = `<div class="pv-pill-group">${opts.map(([v, l]) => `<label class="pv-pill"><input type="checkbox" name="${nameAttr}[]" value="${esc(v)}"><span>${esc(l)}</span></label>`).join('')}</div>`;
      break;
    }
    case 'Attachments':
      input = `<input id="i${id}" type="file" name="${nameAttr}" multiple>`; break;
    default:
      input = o.formTextFormat === 'multiline'
        ? `<textarea id="i${id}" name="${nameAttr}" rows="${o.formTextLineCount || 3}">${esc(prefill ?? '')}</textarea>`
        : `<input id="i${id}" type="text" name="${nameAttr}" value="${esc(prefill ?? '')}" ${o.formTextMaximumLength ? `maxlength="${o.formTextMaximumLength}"` : ''}>`;
  }
  return `<div class="q pv-q" data-native="1" data-type="${fl.type}" data-col="${nameAttr}" data-required="${o.formRequired ? 1 : 0}" ${hidden ? 'hidden' : ''}>${head}${input}<div class="err-msg">Ce champ est obligatoire.</div></div>`;
}

// Lit la valeur courante d'un champ à choix unique, qu'il s'affiche en menu déroulant (élément
// <select>, direct ou imbriqué pour une question "choix depuis une table" chargée après coup)
// ou en boutons radio (conteneur générique) — un seul point de lecture pour la condition
// d'affichage (renderFill) et pour la soumission (onSubmit), jamais deux logiques à maintenir.
export function singleValueOf(container) {
  if (!container) return { value: '', label: '' };
  const sel = container.tagName === 'SELECT' ? container : container.querySelector('select');
  if (sel) return { value: sel.value, label: sel.selectedOptions[0]?.dataset.label ?? sel.value };
  // Question "Oui/non" (l'élément eq-<id> EST directement la case à cocher, pas un conteneur
  // englobant) : .value d'une case à cocher vaut toujours "on", coché ou non — sans ce cas, une
  // condition basée sur un Oui/non lisait toujours la même valeur, jamais son état réel.
  if (container.type === 'checkbox') return { value: String(container.checked), label: container.checked ? 'Oui' : 'Non' };
  const checked = container.querySelector('input[type=radio]:checked');
  if (checked) return { value: checked.value, label: checked.dataset.label ?? checked.value };
  if (container.querySelector('input[type=radio]')) return { value: '', label: '' };
  return { value: container.value ?? '', label: container.value ?? '' };
}

export function radioGroup(name, choices) {
  return `<div class="pv-pill-group">${choices.map(c => `<label class="pv-pill"><input type="radio" name="${name}" value="${esc(c)}" data-label="${esc(c)}"><span>${esc(c)}</span></label>`).join('')}</div>`;
}

// Valeur technique de l'option "Autre" (select/multiselect, q.allowOther) : jamais confondue
// avec une vraie option saisie par le concepteur, remplacée par le texte libre tapé par le
// répondant au moment de l'envoi (voir onSubmit) et de l'affichage (wireOtherOption, renderFill).
export const OTHER_SENTINEL = '__formplus_other__';
function otherInputHtml(id) {
  return `<input type="text" id="eq-${id}-other" class="pv-other-input hidden" placeholder="Précisez…" aria-label="Précisez votre réponse">`;
}

// Une condition d'affichage combine N critères (question source = valeur) en ET (toutes vraies)
// ou en OU (au moins une) — voir normalizeCondition (links.js) pour les deux formats acceptés en
// entrée. Chaque critère se lit sur le conteneur #eq-<questionId> de sa question source, avec la
// même lecture que la soumission (singleValueOf) : un seul point de lecture pour les deux usages.
// extraQuestions permet de retrouver le TYPE de chaque question source : nécessaire pour "Choix
// multiples", seul type dont la comparaison n'est pas une égalité simple (voir plus bas).
export function conditionMet(condition, extraQuestions) {
  const cond = normalizeCondition(condition);
  if (!cond?.rules?.length) return true;
  const results = cond.rules.map(r => {
    const el = $(`eq-${r.questionId}`);
    // Une question elle-même masquée par SA PROPRE condition n'a plus de valeur pertinente à
    // offrir à ses dépendants, même si son <select>/input garde encore sa dernière valeur dans
    // le DOM (rien ne la réinitialise visuellement) : sans ce contrôle, une règle en cascade sur
    // trois questions (A masque B, B masque C) reste évaluée sur la valeur PÉRIMÉE de B une fois
    // B masqué par le changement de A, et C reste affiché à tort.
    if (el?.closest('.q')?.classList.contains('cond-hidden')) return false;
    const src = (extraQuestions || []).find(q => q.id === r.questionId);
    // "Choix multiples" coche plusieurs cases à la fois : la condition est vraie si la valeur
    // attendue fait partie de la sélection, jamais une égalité stricte (qui ne matcherait jamais
    // qu'une réponse à un seul choix coché).
    if (src?.kind === 'multiselect') {
      const checked = [...(el?.querySelectorAll('input:checked') || [])].map(i => i.value);
      return checked.includes(r.value);
    }
    return singleValueOf(el).label === r.value;
  });
  return cond.mode === 'any' ? results.some(Boolean) : results.every(Boolean);
}

export function renderExtraQuestion(q) {
  if (q.kind === 'section') {
    return `<div class="q q-section pv-section" data-extra="${q.id}" data-kind="section">
      <span class="pv-section-icon" aria-hidden="true">${ICONS.heading}</span>
      <h2>${esc(q.label)}</h2><hr>
      ${q.description ? `<p class="muted">${esc(q.description)}</p>` : ''}
    </div>`;
  }
  if (q.kind === 'info') {
    return `<details class="q q-info pv-info" data-extra="${q.id}" data-kind="info">
      <summary>${esc(q.label)}</summary>
      <div class="info-body">${esc(q.description)}</div>
    </details>`;
  }
  const req = q.required ? 'req' : '';
  let input;
  switch (q.kind) {
    case 'choice':
    case 'reflist':
      // Conteneur générique : le chargement (renderFill) y injecte un <select>/des radios
      // (choice) ou des cases à cocher (reflist) selon q.displayMode, une fois les libellés lus
      // dans la table source.
      input = `<div id="eq-${q.id}"><span class="muted">Chargement…</span></div>`;
      break;
    case 'select': {
      const otherPill = q.allowOther ? `<label class="pv-pill"><input type="radio" name="eq-${q.id}" value="${OTHER_SENTINEL}" data-label="Autre"><span>Autre…</span></label>` : '';
      const otherOpt = q.allowOther ? `<option value="${OTHER_SENTINEL}" data-label="Autre">Autre…</option>` : '';
      input = q.displayMode === 'radio'
        ? `<div id="eq-${q.id}" class="pv-pill-group">${(q.choices || []).map(c => `<label class="pv-pill"><input type="radio" name="eq-${q.id}" value="${esc(c)}" data-label="${esc(c)}"><span>${esc(c)}</span></label>`).join('')}${otherPill}</div>`
        : `<select id="eq-${q.id}"><option value="">Choisir…</option>${(q.choices || []).map(c => `<option value="${esc(c)}" data-label="${esc(c)}">${esc(c)}</option>`).join('')}${otherOpt}</select>`;
      if (q.allowOther) input += otherInputHtml(q.id);
      break;
    }
    case 'multiselect': {
      const otherPill = q.allowOther ? `<label class="pv-pill"><input type="checkbox" name="eqm-${q.id}" value="${OTHER_SENTINEL}"><span>Autre…</span></label>` : '';
      input = `<div id="eq-${q.id}" class="pv-pill-group">` +
        (q.choices || []).map(c => `<label class="pv-pill"><input type="checkbox" name="eqm-${q.id}" value="${esc(c)}"><span>${esc(c)}</span></label>`).join('') +
        otherPill + `</div>`;
      if (q.allowOther) input += otherInputHtml(q.id);
      break;
    }
    case 'number':
      input = `<input id="eq-${q.id}" type="number" step="any">`;
      break;
    case 'date':
      input = `<input id="eq-${q.id}" type="date">`;
      break;
    case 'datetime':
      input = `<input id="eq-${q.id}" type="datetime-local">`;
      break;
    case 'bool':
      input = `<label class="switch"><input id="eq-${q.id}" type="checkbox"> Oui</label>`;
      break;
    case 'longtext':
      input = `<textarea id="eq-${q.id}" rows="4"></textarea>`;
      break;
    case 'attachments':
      input = `<input id="eq-${q.id}" type="file" multiple ${q.allowCapture ? 'capture="environment"' : ''}>`;
      break;
    case 'scale': {
      const min = Number.isFinite(q.scaleMin) ? q.scaleMin : 1;
      const max = Number.isFinite(q.scaleMax) ? q.scaleMax : 5;
      const mid = Math.round((min + max) / 2);
      input = `<div class="pv-scale">
        <input id="eq-${q.id}" type="range" min="${min}" max="${max}" step="1" value="${mid}">
        <div class="pv-scale-labels">
          <span class="pv-scale-edge">${esc(q.scaleLowLabel || min)}</span>
          <span class="pv-scale-value" id="eq-${q.id}-value">${mid}</span>
          <span class="pv-scale-edge">${esc(q.scaleHighLabel || max)}</span>
        </div>
      </div>`;
      break;
    }
    case 'ranking':
      input = `<ol id="eq-${q.id}" class="pv-ranking">` +
        (q.choices || []).map((c, i) => `<li class="pv-ranking-item" data-value="${esc(c)}">
          <span class="pv-ranking-rank">${i + 1}</span><span class="pv-ranking-label">${esc(c)}</span>
          <span class="pv-ranking-btns">
            <button type="button" class="icon-btn" data-rank="up" aria-label="Monter ${esc(c)}">${ICONS.arrowUp}</button>
            <button type="button" class="icon-btn" data-rank="down" aria-label="Descendre ${esc(c)}">${ICONS.arrowDown}</button>
          </span></li>`).join('') +
        `</ol>`;
      break;
    case 'signature':
      input = `<div id="eq-${q.id}" class="pv-signature" data-drawn="0">
        <canvas class="pv-signature-canvas" width="500" height="160"></canvas>
        <button type="button" class="qf-link pv-sign-clear">${ICONS.trash}<span>Effacer</span></button>
      </div>`;
      break;
    case 'map':
      input = `<div class="pv-map">
        <div class="pv-map-canvas" id="eq-${q.id}-canvas"></div>
        <p class="muted pv-map-coords" id="eq-${q.id}-coords">Cliquez sur la carte pour poser un point.</p>
        <input type="hidden" id="eq-${q.id}" value="">
      </div>`;
      break;
    default:
      input = `<input id="eq-${q.id}" type="text">`;
  }
  return `<div class="q pv-q" data-extra="${q.id}" data-kind="${q.kind}" data-required="${q.required ? 1 : 0}">
    <label class="title ${req}" for="eq-${q.id}">${esc(q.label)}</label>
    ${q.description ? `<p class="desc pv-hint">${esc(q.description)}</p>` : ''}
    ${input}<div class="err-msg">Ce champ est obligatoire.</div></div>`;
}

// Un champ compte comme "répondu" pour la barre de progression : mêmes règles de "vide" que la
// validation à l'envoi, en plus permissif (ne bloque jamais, ne fait qu'indiquer où on en est).
export function isAnswered(q) {
  if (q.hidden || q.classList.contains('cond-hidden')) return null; // hors calcul
  if (q.dataset.kind === 'section' || q.dataset.kind === 'info') return null;
  // Classement : un ordre (même celui par défaut) est toujours une réponse, comme Oui/non.
  if (q.dataset.kind === 'ranking') return true;
  // Signature : ni case, ni radio, ni champ texte à l'intérieur (juste un canvas) — sans ce cas
  // dédié, la question tomberait sur le repli générique plus bas, qui ne trouve aucun élément
  // input/select/textarea et la sortirait toujours du calcul (null), jamais comptée.
  if (q.dataset.kind === 'signature') return q.querySelector('.pv-signature')?.dataset.drawn === '1';
  const checkboxes = [...q.querySelectorAll('input[type=checkbox]')];
  if (checkboxes.length > 1) return checkboxes.some(c => c.checked); // liste à choix multiples
  if (checkboxes.length === 1) return true; // Oui/non : toujours "répondu", comme à l'envoi
  if (q.querySelectorAll('input[type=radio]').length) return q.querySelector('input[type=radio]:checked') != null;
  const file = q.querySelector('input[type=file]');
  if (file) return file.files.length > 0;
  const el = q.querySelector('input, select, textarea');
  return el ? el.value.trim() !== '' : null;
}
export function updateProgress(formEl) {
  const box = $('progress');
  if (box.classList.contains('hidden')) return;
  const items = [...formEl.querySelectorAll('.q')].map(isAnswered).filter(v => v !== null);
  const done = items.filter(Boolean).length;
  const total = items.length;
  $('progress-fill').style.width = total ? `${Math.round((done / total) * 100)}%` : '0%';
  $('progress-text').textContent = total ? `${done} / ${total} question${total > 1 ? 's' : ''}` : '';
}

export async function renderFill() {
  show('fill');
  const card = $('fill-card');
  card.classList.remove('respond-card-shell');
  card.innerHTML = '<p class="muted">Chargement…</p>';
  $('progress').classList.add('hidden');

  const formLink = state.options?.formLink || fragmentFormLink;
  const link = parseFormLink(formLink);
  if (!link) { card.innerHTML = '<h1>Formulaire indisponible</h1><p class="muted">Lien de formulaire illisible.</p>'; return; }

  applyBranding(state.options);
  state.canEdit = await probeCanEdit(state.options?.vsId ?? link.vsId);
  diag({ event: 'canEdit', canEdit: state.canEdit });
  $('fill-toolbar').classList.toggle('hidden', !state.canEdit);

  let form;
  try {
    const r = await fetch(`${link.api}/forms/${link.vsId}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    form = await r.json();
  } catch (e) {
    card.innerHTML = `<h1>Formulaire indisponible</h1><p class="muted">${esc(e.message)}</p>`;
    return;
  }

  const extraQuestions = (state.options?.formLink === formLink) ? migrateLegacy(state.options) : [];

  const prefillParams = new URLSearchParams(location.search);
  const nativeRows = layoutOrder(form).map(id => renderNativeField(id, form.formFieldsById[id], prefillParams)).join('');
  const extraRows = extraQuestions.map(renderExtraQuestion).join('');
  const title = state.options?.formTitle || form.formTitle;
  const description = state.options?.formDescription || '';
  const submitLabel = state.options?.submitLabel || 'Envoyer';
  const headerEmoji = state.options?.headerEmoji || '';
  const moodTinted = state.options?.bgMood === 'tinted';

  $('fill').dataset.corner = state.options?.cornerStyle === 'bold' ? 'bold' : 'soft';
  card.classList.add('respond-card-shell');
  card.innerHTML = `
    <div class="respond-band"></div>
    <div class="respond-head-wrap${moodTinted ? ' mood-tinted' : ''}">
      ${headerEmoji ? `<div class="respond-avatar" aria-hidden="true">${esc(headerEmoji)}</div>` : (state.options?.logoUrl ? `<img class="fill-logo" src="${esc(state.options.logoUrl)}" alt="">` : '')}
      <h1>${esc(title)}</h1>
      ${description ? `<p class="muted">${esc(description)}</p>` : ''}
    </div>
    <div class="respond-body">
      <p class="muted">Les champs marqués * sont obligatoires.</p>
      <form id="f" novalidate>
        ${nativeRows}
        ${extraRows ? `<hr class="divider">${extraRows}` : ''}
        <label class="hp">Ne pas remplir <input type="text" name="_website" tabindex="-1" autocomplete="off"></label>
        <div class="actions">
          <span id="fill-status" class="muted"></span>
          <button type="submit" class="primary">${esc(submitLabel)}</button>
        </div>
      </form>
    </div>`;

  // Charge les options de chaque question "choix depuis une table" (menu ou radios selon
  // q.displayMode) et "liste de références" (cases à cocher, toujours plusieurs valeurs
  // possibles), et relie chaque condition à sa question source (qui doit être elle-même "choix"
  // ou "select" pour fournir des valeurs à comparer).
  for (const q of extraQuestions) {
    if (q.kind !== 'choice' && q.kind !== 'reflist') continue;
    const box = $(`eq-${q.id}`);
    try {
      const data = await grist.docApi.fetchTable(q.sourceTable);
      const ids = data.id || [];
      const availableCols = Object.keys(data);
      const hasCol = availableCols.includes(q.sourceCol);
      const rawLabels = hasCol ? (data[q.sourceCol] || []) : [];
      const labels = ids.map((id, i) => {
        const v = rawLabels[i];
        return (v !== undefined && v !== null && v !== '') ? String(v) : `#${id}`;
      });
      if (q.kind === 'reflist') {
        box.innerHTML = `<div class="pv-pill-group">${ids.map((id, i) => `<label class="pv-pill"><input type="checkbox" name="eqm-${q.id}" value="${id}"><span>${esc(labels[i])}</span></label>`).join('')}</div>`;
      } else {
        box.innerHTML = q.displayMode === 'radio'
          ? ids.map((id, i) => `<label class="opt"><input type="radio" name="eq-${q.id}" value="${id}" data-label="${esc(labels[i])}"> ${esc(labels[i])}</label>`).join('')
          : '<select><option value="">Choisir…</option>' + ids.map((id, i) => `<option value="${id}" data-label="${esc(labels[i])}">${esc(labels[i])}</option>`).join('') + '</select>';
      }
      diag({ event: 'choice-loaded', questionId: q.id, sourceTable: q.sourceTable, sourceCol: q.sourceCol, hasCol, rowCount: ids.length });
    } catch (e) {
      box.innerHTML = '<span class="muted">(indisponible)</span>';
      diag({ event: 'choice-error', questionId: q.id, message: e.message });
    }
  }

  // Option "Autre" (select/multiselect, q.allowOther) : affiche le champ de précision quand le
  // répondant choisit "Autre…", le masque sinon — jamais soumis en l'état "Autre" lui-même (voir
  // onSubmit, qui relit ce champ pour remplacer la valeur technique OTHER_SENTINEL).
  for (const q of extraQuestions) {
    if (!q.allowOther) continue;
    const container = $(`eq-${q.id}`);
    const otherInput = $(`eq-${q.id}-other`);
    if (!container || !otherInput) continue;
    const sync = () => {
      const active = q.kind === 'multiselect'
        ? [...container.querySelectorAll('input:checked')].some(i => i.value === OTHER_SENTINEL)
        : singleValueOf(container).value === OTHER_SENTINEL;
      otherInput.classList.toggle('hidden', !active);
    };
    container.addEventListener('change', sync);
    sync();
  }

  // Échelle : affiche la valeur courante du curseur en direct, comme le ferait un vrai curseur
  // natif (sans retour visuel, le répondant ne sait pas quelle valeur il vient de choisir).
  for (const q of extraQuestions) {
    if (q.kind !== 'scale') continue;
    const slider = $(`eq-${q.id}`);
    const out = $(`eq-${q.id}-value`);
    if (!slider || !out) continue;
    slider.addEventListener('input', () => { out.textContent = slider.value; });
  }

  // Classement : boutons monter/descendre plutôt qu'un glisser-déposer, pour rester utilisable
  // au clavier et aux lecteurs d'écran (même choix que l'éditeur de questions, qui garde lui
  // aussi des flèches en complément du glisser-déposer). Réordonne les <li> dans le DOM ; l'ordre
  // envoyé à la soumission (onSubmit) est relu directement dans cet ordre, jamais stocké à part.
  card.querySelectorAll('.pv-ranking').forEach((list) => {
    const renumber = () => list.querySelectorAll('.pv-ranking-item').forEach((li, i) => { li.querySelector('.pv-ranking-rank').textContent = i + 1; });
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-rank]');
      if (!btn) return;
      const li = btn.closest('.pv-ranking-item');
      const sib = btn.dataset.rank === 'up' ? li.previousElementSibling : li.nextElementSibling;
      if (!sib) return;
      if (btn.dataset.rank === 'up') list.insertBefore(li, sib); else list.insertBefore(sib, li);
      renumber();
      li.querySelector(`[data-rank="${btn.dataset.rank}"]`).focus();
    });
  });

  // Signature : dessin au doigt/souris sur un canvas, effaçable. data-drawn sert à la fois à la
  // validation "obligatoire" (onSubmit) et à la barre de progression (isAnswered) : un canvas a
  // toujours une valeur de pixels, jamais une façon de savoir "vide" sans ce drapeau explicite.
  card.querySelectorAll('.pv-signature').forEach((wrap) => {
    const canvas = wrap.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = getComputedStyle(document.body).color || '#1c1d21';
    let drawing = false;
    const posFromEvent = (e) => {
      const r = canvas.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - r.left) * (canvas.width / r.width), y: (p.clientY - r.top) * (canvas.height / r.height) };
    };
    const start = (e) => { drawing = true; const p = posFromEvent(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = (e) => { if (!drawing) return; const p = posFromEvent(e); ctx.lineTo(p.x, p.y); ctx.stroke(); wrap.dataset.drawn = '1'; e.preventDefault(); };
    const end = () => { drawing = false; };
    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    wrap.querySelector('.pv-sign-clear').addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      wrap.dataset.drawn = '0';
    });
  });

  for (const q of extraQuestions) {
    const cond = normalizeCondition(q.condition);
    if (!cond?.rules?.length) continue;
    const target = card.querySelector(`[data-extra="${q.id}"]`);
    // Répercute le changement de visibilité sur les conditions EN CASCADE : une question qui
    // dépend de q (pas de sa propre source directe) n'écoute que le conteneur eq-<q.id> de q,
    // jamais celui de la source de q — sans cet événement synthétique, un masquage en chaîne (A
    // masque B, B masque C) ne réveille jamais le check de C quand B se masque à son tour.
    const check = () => {
      target.classList.toggle('cond-hidden', !conditionMet(q.condition, extraQuestions));
      $(`eq-${q.id}`)?.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // 'input' en plus de 'change' : une source Nombre/Texte/Texte long ne déclenche 'change' qu'au
    // blur, ce qui masquerait/afficherait la question dépendante avec un temps de retard sensible
    // par rapport aux sources à choix (select/radio/case), qui réagissent immédiatement.
    cond.rules.map(r => $(`eq-${r.questionId}`)).filter(Boolean)
      .forEach(c => ['input', 'change'].forEach(evt => c.addEventListener(evt, check)));
    check();
  }

  if (state.options?.showProgress) {
    $('progress').classList.remove('hidden');
    $('f').addEventListener('input', () => updateProgress($('f')));
    $('f').addEventListener('change', () => updateProgress($('f')));
    updateProgress($('f'));
  }

  $('f').addEventListener('submit', (ev) => onSubmit(ev, form, link, extraQuestions));
}

// Convertit le canvas de signature en fichier image, pour l'envoyer par le même circuit que les
// pièces jointes (POST /attachments) plutôt que de stocker un dataURL en texte (ce que fait
// isaytoo, voir docs/01-etude-comparative.md — "stocker en pièce jointe plutôt qu'en texte").
function canvasToFile(canvas, filename) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(new File([blob], filename, { type: 'image/png' })), 'image/png'));
}

export async function onSubmit(ev, form, link, extraQuestions) {
  ev.preventDefault();
  const formEl = ev.target;
  if (formEl._website.value) return; // honeypot
  const fieldsByTable = { [form.formTableId]: {} };
  const uploads = [];
  let valid = true;

  for (const q of formEl.querySelectorAll('.q[data-native="1"]')) {
    const col = q.dataset.col, type = q.dataset.type, required = q.dataset.required === '1';
    let value = null;
    if (type === 'Bool') value = q.querySelector('input').checked;
    else if (type === 'ChoiceList' || type === 'RefList') {
      const vals = [...q.querySelectorAll('input:checked')].map(i => type === 'RefList' ? Number(i.value) : i.value);
      value = vals.length ? ['L', ...vals] : null;
    } else if (type === 'Attachments') {
      const files = [...q.querySelector('input').files];
      if (files.length) uploads.push({ table: form.formTableId, col, files });
      value = files.length ? 'pending' : null;
    } else if (q.querySelector('input[type=radio]')) {
      const c = q.querySelector('input:checked'); value = c ? c.value : null;
      if (type === 'Ref' && value != null) value = Number(value);
    } else {
      const el = q.querySelector('input, select, textarea');
      // trim() UNIQUEMENT pour juger si le champ est vide : la valeur réellement stockée reste
      // el.value tel quel (des espaces internes légitimes ne sont jamais altérés), sinon un champ
      // obligatoire rempli d'espaces passait la validation sans jamais bloquer l'envoi.
      value = el.value.trim() === '' ? null : (type === 'Ref' ? Number(el.value) : (type === 'Int' || type === 'Numeric') ? Number(el.value) : el.value);
    }
    const empty = value === null || value === '' || (value === false && type !== 'Bool');
    // Un Oui/Non n'est jamais "vide" au sens du stockage (empty reste false ci-dessus, une case
    // décochée est une réponse valide) mais DOIT pouvoir être rendu obligatoire (ex. "J'accepte
    // les conditions") : sans ce cas séparé, "Obligatoire" n'avait strictement aucun effet ici.
    const missingRequired = required && !q.hidden && (type === 'Bool' ? value !== true : empty);
    q.classList.toggle('invalid', missingRequired);
    if (missingRequired) valid = false;
    if (value !== null && type !== 'Attachments') fieldsByTable[form.formTableId][col] = value;
  }

  // Questions supplémentaires : regroupées par table de destination, pour n'envoyer qu'une
  // requête par table (la principale ET chacune des tables choisies, quel que soit leur nombre).
  for (const q of extraQuestions) {
    if (LAYOUT_KINDS.has(q.kind)) continue; // titre de section / bloc d'info : rien à envoyer
    const el = formEl.querySelector(`[data-extra="${q.id}"]`);
    if (!el) continue;
    const visible = !el.classList.contains('cond-hidden');
    if (q.kind === 'attachments') {
      // Pas de valeur directe à poser dans fieldsByTable : le fichier part vers /attachments à
      // l'envoi (comme pour un champ natif Attachments), la colonne n'est renseignée qu'ensuite
      // avec les identifiants renvoyés (voir la boucle "uploads" plus bas).
      const files = [...(el.querySelector('input[type=file]')?.files || [])];
      const empty = files.length === 0;
      el.classList.toggle('invalid', q.required && empty && visible);
      if (q.required && empty && visible) valid = false;
      if (visible && !empty) uploads.push({ table: q.writeTable, col: q.writeCol, files });
      continue;
    }
    if (q.kind === 'signature') {
      // Même principe que "attachments" ci-dessus : le fichier part vers /attachments à l'envoi,
      // jamais de valeur directe à poser dans fieldsByTable ici. data-drawn (posé par le dessin
      // sur le canvas dans renderFill) tient lieu de "vide" : un canvas a toujours des pixels,
      // jamais une façon de savoir si le répondant a vraiment dessiné quelque chose sans lui.
      const wrap = el.querySelector('.pv-signature') || el;
      const drawn = wrap.dataset.drawn === '1';
      const emptySig = !drawn;
      el.classList.toggle('invalid', q.required && emptySig && visible);
      if (q.required && emptySig && visible) valid = false;
      if (visible && drawn) {
        const canvas = wrap.querySelector('canvas');
        const file = await canvasToFile(canvas, `signature-${q.id}.png`);
        uploads.push({ table: q.writeTable, col: q.writeCol, files: [file] });
      }
      continue;
    }
    let value = null, empty, missingRequired;
    if (q.kind === 'multiselect') {
      let checked = [...el.querySelectorAll('input:checked')].map(i => i.value);
      if (q.allowOther) {
        const otherText = ($(`eq-${q.id}-other`)?.value || '').trim();
        checked = checked.map(v => (v === OTHER_SENTINEL ? otherText : v)).filter(v => v !== '');
      }
      empty = checked.length === 0;
      if (!empty) value = ['L', ...checked];
      missingRequired = q.required && empty && visible;
    } else if (q.kind === 'reflist') {
      const checked = [...el.querySelectorAll('input:checked')].map(i => Number(i.value));
      empty = checked.length === 0;
      if (!empty) value = ['L', ...checked];
      missingRequired = q.required && empty && visible;
    } else if (q.kind === 'ranking') {
      // L'ordre vient directement de l'ordre des <li> dans le DOM (réordonné par les boutons
      // monter/descendre, voir renderFill) : jamais d'état séparé à garder synchronisé. Un
      // classement a toujours une valeur (même l'ordre par défaut), comme Oui/non ou Échelle :
      // "obligatoire" n'a donc d'effet que si la liste elle-même est vide (aucune option réglée).
      const items = [...el.querySelectorAll('.pv-ranking-item')].map(li => li.dataset.value);
      empty = items.length === 0;
      if (!empty) value = items.join(', ');
      missingRequired = q.required && empty && visible;
    } else if (q.kind === 'bool') {
      // Stockage : un bouton oui/non n'est jamais "vide" (une case décochée est une réponse
      // valide, empty reste false). Validation : DOIT pouvoir être rendu obligatoire (ex.
      // "J'accepte les conditions") — sans missingRequired séparé, "Obligatoire" n'avait aucun
      // effet ici, comme pour les champs natifs Oui/non (voir la boucle native plus haut).
      value = $(`eq-${q.id}`).checked;
      empty = false;
      missingRequired = q.required && visible && value !== true;
    } else if (SINGLE_CHOICE_KINDS.has(q.kind)) {
      // Menu déroulant ou radios selon q.displayMode : même lecture des deux (singleValueOf).
      let raw = singleValueOf($(`eq-${q.id}`)).value;
      if (q.allowOther && raw === OTHER_SENTINEL) raw = ($(`eq-${q.id}-other`)?.value || '').trim();
      empty = raw === '' || raw == null;
      if (!empty) value = q.kind === 'choice' ? Number(raw) : raw;
      missingRequired = q.required && empty && visible;
    } else {
      const raw = $(`eq-${q.id}`).value;
      // trim() uniquement pour juger si le champ est vide (cf. la même règle sur les champs
      // natifs plus haut) : la valeur stockée reste raw tel quel, jamais trimmée. Un curseur
      // (scale) a toujours une valeur numérique, jamais vide ; la carte (map) pose une chaîne
      // "latitude,longitude" dans ce même champ générique (input caché), sans logique à part.
      empty = raw == null || raw.trim() === '';
      // Même règle que pour les champs natifs : seuls les nombres sont convertis, une date/date-
      // heure reste une chaîne ISO que l'API REST sait déjà interpréter (voir renderNativeField/
      // onSubmit natif).
      if (!empty) value = (q.kind === 'number' || q.kind === 'scale') ? Number(raw) : raw;
      missingRequired = q.required && empty && visible;
    }
    el.classList.toggle('invalid', missingRequired);
    if (missingRequired) valid = false;
    if (!visible || empty) continue;
    fieldsByTable[q.writeTable] = fieldsByTable[q.writeTable] || {};
    fieldsByTable[q.writeTable][q.writeCol] = value;
  }

  if (!valid) { formEl.querySelector('.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

  const btn = formEl.querySelector('button[type=submit]');
  const status = $('fill-status');
  btn.disabled = true; status.textContent = 'Envoi…'; status.classList.remove('err');
  try {
    // Une pièce jointe destinée à la table principale reste bloquante comme avant (le champ fait
    // partie du même enregistrement que les champs obligatoires déjà validés ci-dessus) ; un échec
    // sur une pièce jointe d'une question supplémentaire écrivant dans une AUTRE table ne doit pas
    // annuler toute la réponse, déjà valide par ailleurs — même principe que pour l'échec d'une
    // table secondaire plus bas (failedTables), jamais un succès affiché à tort, mais jamais non
    // plus la perte de données principales valides pour un fichier optionnel sans rapport.
    const failedUploads = [];
    for (const up of uploads) {
      try {
        const fd = new FormData();
        up.files.forEach(file => fd.append('upload', file));
        // Grist refuse toute requête anonyme de modification (POST/PUT/PATCH/DELETE) sans l'un
        // de ces deux signaux anti-CSRF ; le JSON envoyé plus bas (Content-Type: application/
        // json) en tient lieu pour les autres appels, mais un envoi de fichier est forcément en
        // multipart/form-data, donc sans cet en-tête explicite. Sans lui, Grist répond 401 sans
        // en-tête CORS, que le navigateur affiche comme une simple erreur réseau.
        const r = await fetch(`${link.api}/attachments`, {
          method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' }, body: fd,
        });
        if (!r.ok) {
          let serverMessage = null;
          try { serverMessage = (await r.json()).error; } catch (e2) { /* ignore */ }
          throw new Error(serverMessage || `HTTP ${r.status}`);
        }
        const ids = await r.json();
        if (ids.length !== up.files.length) throw new Error(`${ids.length}/${up.files.length} fichier(s) accepté(s)`);
        fieldsByTable[up.table] = fieldsByTable[up.table] || {};
        fieldsByTable[up.table][up.col] = ['L', ...ids];
      } catch (e) {
        if (up.table === form.formTableId) throw new Error(`Pièces jointes : ${e.message}`);
        failedUploads.push(up.col);
        diag({ event: 'upload-failed', table: up.table, col: up.col, message: e.message });
      }
    }
    // Table principale, via l'API REST (déjà utilisée pour les pièces jointes, cohérent).
    const r = await fetch(`${link.api}/tables/${form.formTableId}/records`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records: [{ fields: fieldsByTable[form.formTableId] }] }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`);
    const j = await r.json();

    // Chaque autre table, via l'API plugin (même clé, droit ouvert par ensureTableGate à la
    // configuration). Une table dont le formulaire-relais aurait été retiré échoue ici sans
    // bloquer le reste : chaque échec est journalisé ET signalé au répondant (voir failedTables
    // ci-dessous), jamais silencieux — la réponse principale est déjà enregistrée à ce stade et
    // ne peut pas être annulée, mais un échec partiel ne doit jamais s'afficher comme un succès.
    const failedTables = [];
    for (const [tableId, fields] of Object.entries(fieldsByTable)) {
      if (tableId === form.formTableId || Object.keys(fields).length === 0) continue;
      try { await grist.docApi.applyUserActions([['AddRecord', tableId, null, fields]]); }
      catch (e) { failedTables.push(tableId); diag({ event: 'extra-table-write-failed', tableId, message: e.message }); }
    }

    $('progress').classList.add('hidden');
    const endMessage = state.options?.endMessage || 'Merci, votre réponse a bien été enregistrée.';
    const partial = failedTables.length || failedUploads.length;
    // Redirection automatique jamais lancée sur un envoi partiel (le répondant doit voir
    // l'avertissement d'abord), et jamais vers un schéma autre que http(s) : esc() échappe les
    // caractères HTML mais ne filtre aucun schéma d'URI, un opt-redirect à javascript:… passerait
    // tel quel et s'exécuterait automatiquement 3 secondes après l'envoi, sans clic du répondant.
    const rawRedirect = partial ? '' : (state.options?.redirectUrl || '');
    let redirectUrl = '';
    if (rawRedirect) { try { redirectUrl = ['http:', 'https:'].includes(new URL(rawRedirect, location.href).protocol) ? rawRedirect : ''; } catch (e) { redirectUrl = ''; } }
    const warningParts = [];
    if (failedTables.length) warningParts.push(`table${failedTables.length > 1 ? 's' : ''} : ${failedTables.map(esc).join(', ')}`);
    if (failedUploads.length) warningParts.push(`pièce${failedUploads.length > 1 ? 's' : ''} jointe${failedUploads.length > 1 ? 's' : ''} : ${failedUploads.map(esc).join(', ')}`);
    const warning = warningParts.length
      ? `<p class="err">Une partie de la réponse n'a pas pu être enregistrée (${warningParts.join(' ; ')}). Le reste a bien été pris en compte ; contactez le responsable du formulaire pour signaler ce message.</p>`
      : '';
    $('fill-card').classList.remove('respond-card-shell'); // ce message tient dans le padding normal de .card, plus de bandeau/en-tête à afficher
    $('fill-card').innerHTML = `<div class="center"><h1 class="ok">${esc(endMessage)}</h1>
      <p class="muted">Identifiant : ${esc(j.records?.[0]?.id)}</p>
      ${warning}
      ${redirectUrl ? `<p class="muted" id="redirect-msg">Redirection dans <span id="redirect-count">3</span> s… <a href="${esc(redirectUrl)}">continuer maintenant</a></p>` : ''}
      <p><button class="primary" onclick="location.reload()">Envoyer une autre réponse</button></p></div>`;
    if (redirectUrl) {
      let n = 3;
      const t = setInterval(() => {
        n -= 1;
        const el = $('redirect-count');
        if (el) el.textContent = String(n);
        if (n <= 0) { clearInterval(t); location.href = redirectUrl; }
      }, 1000);
    }
  } catch (e) {
    btn.disabled = false; status.textContent = 'Erreur : ' + e.message; status.classList.add('err'); status.style.color = 'var(--error)';
  }
}

