import { $, esc, show } from './dom.js';
import { LAYOUT_KINDS, SINGLE_CHOICE_KINDS } from './kinds.js';
import { parseFormLink, migrateLegacy } from './links.js';
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
      input = `<input id="i${id}" type="number" step="any" name="${name}" value="${esc(prefill ?? '')}">`; break;
    case 'Bool':
      input = `<label class="switch"><input type="checkbox" name="${name}" ${prefill === 'true' ? 'checked' : ''}> Oui</label>`; break;
    case 'Date':
      input = `<input id="i${id}" type="date" name="${name}" value="${esc(prefill ?? '')}">`; break;
    case 'DateTime':
      input = `<input id="i${id}" type="datetime-local" name="${name}" value="${esc(prefill ?? '')}">`; break;
    case 'Choice':
    case 'Ref': {
      const opts = fl.type === 'Choice' ? choices.map(c => [c, c]) : refs.map(([rid, v]) => [rid, v]);
      if (o.formSelectFormat === 'radio') {
        input = opts.map(([v, l]) => `<label class="opt"><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === prefill ? 'checked' : ''}> ${esc(l)}</label>`).join('');
      } else {
        input = `<select id="i${id}" name="${name}"><option value="">Choisir…</option>` +
          opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === prefill ? 'selected' : ''}>${esc(l)}</option>`).join('') + `</select>`;
      }
      break;
    }
    case 'ChoiceList':
    case 'RefList': {
      const opts = fl.type === 'ChoiceList' ? choices.map(c => [c, c]) : refs.map(([rid, v]) => [rid, v]);
      input = opts.map(([v, l]) => `<label class="opt"><input type="checkbox" name="${name}[]" value="${esc(v)}"> ${esc(l)}</label>`).join('');
      break;
    }
    case 'Attachments':
      input = `<input id="i${id}" type="file" name="${name}" multiple>`; break;
    default:
      input = o.formTextFormat === 'multiline'
        ? `<textarea id="i${id}" name="${name}" rows="${o.formTextLineCount || 3}">${esc(prefill ?? '')}</textarea>`
        : `<input id="i${id}" type="text" name="${name}" value="${esc(prefill ?? '')}" ${o.formTextMaximumLength ? `maxlength="${o.formTextMaximumLength}"` : ''}>`;
  }
  return `<div class="q" data-native="1" data-type="${fl.type}" data-col="${name}" data-required="${o.formRequired ? 1 : 0}" ${hidden ? 'hidden' : ''}>${head}${input}<div class="err-msg">Ce champ est obligatoire.</div></div>`;
}

// Lit la valeur courante d'un champ à choix unique, qu'il s'affiche en menu déroulant (élément
// <select>, direct ou imbriqué pour une question "choix depuis une table" chargée après coup)
// ou en boutons radio (conteneur générique) — un seul point de lecture pour la condition
// d'affichage (renderFill) et pour la soumission (onSubmit), jamais deux logiques à maintenir.
export function singleValueOf(container) {
  if (!container) return { value: '', label: '' };
  const sel = container.tagName === 'SELECT' ? container : container.querySelector('select');
  if (sel) return { value: sel.value, label: sel.selectedOptions[0]?.dataset.label ?? sel.value };
  const checked = container.querySelector('input[type=radio]:checked');
  if (checked) return { value: checked.value, label: checked.dataset.label ?? checked.value };
  if (container.querySelector('input[type=radio]')) return { value: '', label: '' };
  return { value: container.value ?? '', label: container.value ?? '' };
}

export function radioGroup(name, choices) {
  return choices.map(c => `<label class="opt"><input type="radio" name="${name}" value="${esc(c)}" data-label="${esc(c)}"> ${esc(c)}</label>`).join('');
}

export function renderExtraQuestion(q) {
  if (q.kind === 'section') {
    return `<div class="q q-section" data-extra="${q.id}" data-kind="section">
      <h2>${esc(q.label)}</h2>
      ${q.description ? `<p class="muted">${esc(q.description)}</p>` : ''}
    </div>`;
  }
  if (q.kind === 'info') {
    return `<details class="q q-info" data-extra="${q.id}" data-kind="info">
      <summary>${esc(q.label)}</summary>
      <div class="info-body">${esc(q.description)}</div>
    </details>`;
  }
  const req = q.required ? 'req' : '';
  let input;
  switch (q.kind) {
    case 'choice':
      // Conteneur générique : le chargement (renderFill) y injecte un <select> ou des radios
      // selon q.displayMode, une fois les libellés lus dans la table source.
      input = `<div id="eq-${q.id}"><span class="muted">Chargement…</span></div>`;
      break;
    case 'select':
      input = q.displayMode === 'radio'
        ? `<div id="eq-${q.id}">${radioGroup(`eq-${q.id}`, q.choices || [])}</div>`
        : `<select id="eq-${q.id}"><option value="">Choisir…</option>${(q.choices || []).map(c => `<option value="${esc(c)}" data-label="${esc(c)}">${esc(c)}</option>`).join('')}</select>`;
      break;
    case 'multiselect':
      input = `<div id="eq-${q.id}">` +
        (q.choices || []).map(c => `<label class="opt"><input type="checkbox" name="eqm-${q.id}" value="${esc(c)}"> ${esc(c)}</label>`).join('') +
        `</div>`;
      break;
    case 'number':
      input = `<input id="eq-${q.id}" type="number" step="any">`;
      break;
    case 'date':
      input = `<input id="eq-${q.id}" type="date">`;
      break;
    case 'bool':
      input = `<label class="switch"><input id="eq-${q.id}" type="checkbox"> Oui</label>`;
      break;
    default:
      input = `<input id="eq-${q.id}" type="text">`;
  }
  return `<div class="q" data-extra="${q.id}" data-kind="${q.kind}" data-required="${q.required ? 1 : 0}">
    <label class="title ${req}" for="eq-${q.id}">${esc(q.label)}</label>
    ${q.description ? `<p class="desc">${esc(q.description)}</p>` : ''}
    ${input}<div class="err-msg">Ce champ est obligatoire.</div></div>`;
}

// Un champ compte comme "répondu" pour la barre de progression : mêmes règles de "vide" que la
// validation à l'envoi, en plus permissif (ne bloque jamais, ne fait qu'indiquer où on en est).
export function isAnswered(q) {
  if (q.hidden || q.classList.contains('cond-hidden')) return null; // hors calcul
  if (q.dataset.kind === 'section' || q.dataset.kind === 'info') return null;
  const checkboxes = [...q.querySelectorAll('input[type=checkbox]')];
  if (checkboxes.length > 1) return checkboxes.some(c => c.checked); // liste à choix multiples
  if (checkboxes.length === 1) return true; // Oui/non : toujours "répondu", comme à l'envoi
  if (q.querySelectorAll('input[type=radio]').length) return q.querySelector('input[type=radio]:checked') != null;
  const file = q.querySelector('input[type=file]');
  if (file) return file.files.length > 0;
  const el = q.querySelector('input, select, textarea');
  return el ? el.value !== '' : null;
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

  card.innerHTML = `
    ${state.options?.logoUrl ? `<img class="fill-logo" src="${esc(state.options.logoUrl)}" alt="">` : ''}
    <h1>${esc(title)}</h1>
    ${description ? `<p class="muted">${esc(description)}</p>` : ''}
    <p class="muted">Les champs marqués * sont obligatoires.</p>
    <form id="f" novalidate>
      ${nativeRows}
      ${extraRows ? `<hr class="divider">${extraRows}` : ''}
      <label class="hp">Ne pas remplir <input type="text" name="_website" tabindex="-1" autocomplete="off"></label>
      <div class="actions">
        <span id="fill-status" class="muted"></span>
        <button type="submit" class="primary">${esc(submitLabel)}</button>
      </div>
    </form>`;

  // Charge les options de chaque question "choix depuis une table", en menu déroulant ou en
  // radios selon q.displayMode, et relie chaque condition à sa question source (qui doit être
  // elle-même "choix" ou "select" pour fournir des valeurs à comparer).
  for (const q of extraQuestions) {
    if (q.kind !== 'choice') continue;
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
      box.innerHTML = q.displayMode === 'radio'
        ? ids.map((id, i) => `<label class="opt"><input type="radio" name="eq-${q.id}" value="${id}" data-label="${esc(labels[i])}"> ${esc(labels[i])}</label>`).join('')
        : '<select><option value="">Choisir…</option>' + ids.map((id, i) => `<option value="${id}" data-label="${esc(labels[i])}">${esc(labels[i])}</option>`).join('') + '</select>';
      diag({ event: 'choice-loaded', questionId: q.id, sourceTable: q.sourceTable, sourceCol: q.sourceCol, hasCol, rowCount: ids.length });
    } catch (e) {
      box.innerHTML = '<span class="muted">(indisponible)</span>';
      diag({ event: 'choice-error', questionId: q.id, message: e.message });
    }
  }
  for (const q of extraQuestions) {
    if (!q.condition) continue;
    const srcContainer = $(`eq-${q.condition.questionId}`);
    if (!srcContainer) continue;
    const target = card.querySelector(`[data-extra="${q.id}"]`);
    const check = () => target.classList.toggle('cond-hidden', singleValueOf(srcContainer).label !== q.condition.value);
    srcContainer.addEventListener('change', check);
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
      if (files.length) uploads.push({ col, files });
      value = files.length ? 'pending' : null;
    } else if (q.querySelector('input[type=radio]')) {
      const c = q.querySelector('input:checked'); value = c ? c.value : null;
      if (type === 'Ref' && value != null) value = Number(value);
    } else {
      const el = q.querySelector('input, select, textarea');
      value = el.value === '' ? null : (type === 'Ref' ? Number(el.value) : (type === 'Int' || type === 'Numeric') ? Number(el.value) : el.value);
    }
    const empty = value === null || value === '' || (value === false && type !== 'Bool');
    q.classList.toggle('invalid', required && empty && !q.hidden);
    if (required && empty && !q.hidden) valid = false;
    if (value !== null && type !== 'Attachments') fieldsByTable[form.formTableId][col] = value;
  }

  // Questions supplémentaires : regroupées par table de destination, pour n'envoyer qu'une
  // requête par table (la principale ET chacune des tables choisies, quel que soit leur nombre).
  for (const q of extraQuestions) {
    if (LAYOUT_KINDS.has(q.kind)) continue; // titre de section / bloc d'info : rien à envoyer
    const el = formEl.querySelector(`[data-extra="${q.id}"]`);
    if (!el) continue;
    const visible = !el.classList.contains('cond-hidden');
    let value = null, empty;
    if (q.kind === 'multiselect') {
      const checked = [...el.querySelectorAll('input:checked')].map(i => i.value);
      empty = checked.length === 0;
      if (!empty) value = ['L', ...checked];
    } else if (q.kind === 'bool') {
      // Un bouton oui/non n'est jamais "vide" : obligatoire n'a pas de sens ici, comme pour
      // les champs natifs Oui/non (voir la boucle des champs natifs juste au-dessus).
      value = $(`eq-${q.id}`).checked;
      empty = false;
    } else if (SINGLE_CHOICE_KINDS.has(q.kind)) {
      // Menu déroulant ou radios selon q.displayMode : même lecture des deux (singleValueOf).
      const raw = singleValueOf($(`eq-${q.id}`)).value;
      empty = raw === '' || raw == null;
      if (!empty) value = q.kind === 'choice' ? Number(raw) : raw;
    } else {
      const raw = $(`eq-${q.id}`).value;
      empty = raw === '' || raw == null;
      // Même règle que pour les champs natifs : seuls les nombres sont convertis, une date reste
      // une chaîne ISO que l'API REST sait déjà interpréter (voir renderNativeField/onSubmit natif).
      if (!empty) value = q.kind === 'number' ? Number(raw) : raw;
    }
    el.classList.toggle('invalid', q.required && empty && visible);
    if (q.required && empty && visible) valid = false;
    if (!visible || empty) continue;
    fieldsByTable[q.writeTable] = fieldsByTable[q.writeTable] || {};
    fieldsByTable[q.writeTable][q.writeCol] = value;
  }

  if (!valid) { formEl.querySelector('.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

  const btn = formEl.querySelector('button[type=submit]');
  const status = $('fill-status');
  btn.disabled = true; status.textContent = 'Envoi…'; status.classList.remove('err');
  try {
    for (const up of uploads) {
      const fd = new FormData();
      up.files.forEach(file => fd.append('upload', file));
      const r = await fetch(`${link.api}/attachments`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error(`Pièces jointes : HTTP ${r.status}`);
      fieldsByTable[form.formTableId][up.col] = ['L', ...(await r.json())];
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
    const redirectUrl = failedTables.length ? '' : (state.options?.redirectUrl || ''); // pas de redirection auto sur un envoi partiel : le répondant doit voir l'avertissement
    const warning = failedTables.length
      ? `<p class="err">Une partie de la réponse n'a pas pu être enregistrée (table${failedTables.length > 1 ? 's' : ''} : ${failedTables.map(esc).join(', ')}). Le reste a bien été pris en compte ; contactez le responsable du formulaire pour signaler ce message.</p>`
      : '';
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

