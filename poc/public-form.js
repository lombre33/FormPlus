(function () {
  // Paramètres lus dans la requête (?...) et dans le fragment (#...). Le fragment est préféré :
  // il n'est jamais transmis au serveur qui héberge cette page, seul le navigateur le voit.
  const params = new URLSearchParams(location.search);
  new URLSearchParams(location.hash.replace(/^#/, '')).forEach((v, k) => params.set(k, v));
  const formUrl = params.get('form');
  const app = document.getElementById('app');

  function parseFormUrl(u) {
    const m = /^(https?:\/\/[^/]+)(?:\/o\/([^/]+))?\/forms\/([^/]+)\/(\d+)/.exec(u || '');
    if (!m) return null;
    const [, host, org, key, vsId] = m;
    return { api: org ? `${host}/o/${org}/api/s/${key}` : `${host}/api/s/${key}`, vsId: Number(vsId) };
  }

  const target = parseFormUrl(formUrl);
  if (!target) {
    app.innerHTML = `<h1>Formulaire de test</h1>
      <p class="sub">Ajoutez <code>#form=&lt;lien du formulaire Grist publié&gt;</code> à l'URL de cette page.</p>
      <p class="sub">Exemple : <code>public-form.html#form=https://grist.numerique.gouv.fr/o/equipe/forms/CLE/12</code></p>`;
    return;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let form = null;

  fetch(`${target.api}/forms/${target.vsId}`)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
    .then(f => { form = f; render(f); })
    .catch(e => { app.innerHTML = `<h1>Formulaire indisponible</h1><p class="sub">${esc(e.message)}</p>`; });

  function layoutOrder(f) {
    // Ordre des champs d'après le layoutSpec du formulaire natif, sinon ordre des ids.
    const ids = [];
    try {
      const walk = (n) => { if (!n) return; if (n.type === 'Field' && n.leaf != null) ids.push(String(n.leaf)); (n.children || []).forEach(walk); };
      walk(JSON.parse(f.formLayoutSpec));
    } catch (e) { /* ignore */ }
    const all = Object.keys(f.formFieldsById);
    return ids.filter(i => all.includes(i)).concat(all.filter(i => !ids.includes(i)));
  }

  function render(f) {
    const rows = layoutOrder(f).map(id => renderField(id, f.formFieldsById[id])).join('');
    app.innerHTML = `
      <h1>${esc(f.formTitle)}</h1>
      <p class="sub">Les champs marqués * sont obligatoires.</p>
      <form id="f" novalidate>
        ${rows}
        <label class="hp">Ne pas remplir <input type="text" name="_website" tabindex="-1" autocomplete="off"></label>
        <div class="actions">
          <span id="status" class="sub"></span>
          <button type="submit" class="primary">Envoyer</button>
        </div>
      </form>`;
    document.getElementById('f').addEventListener('submit', onSubmit);
  }

  function renderField(id, fl) {
    const o = fl.options || {};
    const name = fl.colId;
    // colId vient de l'API /forms/<clé>/<section> d'un document Grist quelconque (cette page
    // n'affiche QUE ce que #form=<lien> lui donne, sans aucune restriction d'hôte, par nature) :
    // jamais fait confiance sans échappement dans le HTML produit, comme fl.question/fl.description
    // juste en dessous. nameAttr est réservé à l'affichage ; name (brut) reste utilisé pour le
    // paramètre d'URL de préremplissage et est relu tel quel via dataset.col dans onSubmit (le
    // navigateur décode automatiquement les entités d'un attribut).
    const nameAttr = esc(name);
    const req = o.formRequired ? 'req' : '';
    const hidden = o.formIsHidden;
    const prefill = o.formAcceptFromUrl ? params.get(name) : null;
    const labelId = `qlabel-i${id}`;
    const errId = `err-i${id}`;
    // Obligatoire : attribut HTML natif `required` (jamais pour bloquer l'envoi — le <form>
    // reste novalidate, seule la validation JS d'onSubmit ci-dessous fait foi — mais lu par les
    // lecteurs d'écran comme aria-required). aria-describedby relie le champ à son message
    // d'erreur, uniquement quand il est obligatoire (seul cas où ce message a un sens).
    const reqAttr = o.formRequired ? ' required' : '';
    const describedBy = o.formRequired ? ` aria-describedby="${errId}"` : '';
    // "for" ne vise le titre que vers un contrôle réellement labelable : pour Choix multiples et
    // Choix-en-boutons-radio, les options sont regroupées dans un conteneur <div> dédié (ajouté
    // ci-dessous) qui porte role="group" + aria-labelledby à la place — un `for` pointant vers
    // un <div> ne crée aucune association pour les lecteurs d'écran.
    const isGroupList = fl.type === 'ChoiceList' || fl.type === 'RefList' || ((fl.type === 'Choice' || fl.type === 'Ref') && o.formSelectFormat === 'radio');
    const forAttr = isGroupList ? '' : ` for="i${id}"`;
    const head = `<label class="title ${req}" id="${labelId}"${forAttr}>${esc(fl.question)}</label>` +
      (fl.description ? `<p class="desc">${esc(fl.description)}</p>` : '');
    let input = '';
    const choices = o.choices || [];
    const refs = fl.refValues || [];
    switch (fl.type) {
      case 'Int': case 'Numeric':
        input = `<input id="i${id}" type="number" step="any" name="${nameAttr}" value="${esc(prefill ?? '')}"${reqAttr}${describedBy}>`; break;
      case 'Bool':
        input = `<label class="switch"><input id="i${id}" type="checkbox" name="${nameAttr}"${reqAttr}${describedBy} ${prefill === 'true' ? 'checked' : ''}> Oui</label>`; break;
      case 'Date':
        input = `<input id="i${id}" type="date" name="${nameAttr}" value="${esc(prefill ?? '')}"${reqAttr}${describedBy}>`; break;
      case 'DateTime':
        input = `<input id="i${id}" type="datetime-local" name="${nameAttr}" value="${esc(prefill ?? '')}"${reqAttr}${describedBy}>`; break;
      case 'Choice':
      case 'Ref': {
        const opts = fl.type === 'Choice' ? choices.map(c => [c, c]) : refs.map(([rid, v]) => [rid, v]);
        if (o.formSelectFormat === 'radio') {
          input = `<div role="group" aria-labelledby="${labelId}">` +
            opts.map(([v, l]) => `<label class="opt"><input type="radio" name="${nameAttr}" value="${esc(v)}"${reqAttr}${describedBy} ${String(v) === prefill ? 'checked' : ''}> ${esc(l)}</label>`).join('') +
            `</div>`;
        } else {
          input = `<select id="i${id}" name="${nameAttr}"${reqAttr}${describedBy}><option value="">Choisir…</option>` +
            opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === prefill ? 'selected' : ''}>${esc(l)}</option>`).join('') + `</select>`;
        }
        break;
      }
      case 'ChoiceList':
      case 'RefList': {
        const opts = fl.type === 'ChoiceList' ? choices.map(c => [c, c]) : refs.map(([rid, v]) => [rid, v]);
        // aria-required sur le GROUPE, jamais sur chaque case : « au moins une », pas « toutes ».
        input = `<div role="group" aria-labelledby="${labelId}"${o.formRequired ? ' aria-required="true"' : ''}>` +
          opts.map(([v, l]) => `<label class="opt"><input type="checkbox" name="${nameAttr}[]" value="${esc(v)}"${describedBy}> ${esc(l)}</label>`).join('') +
          `</div>`;
        break;
      }
      case 'Attachments':
        input = `<input id="i${id}" type="file" name="${nameAttr}" multiple${reqAttr}${describedBy}>`; break;
      default:
        input = o.formTextFormat === 'multiline'
          ? `<textarea id="i${id}" name="${nameAttr}"${reqAttr}${describedBy} rows="${o.formTextLineCount || 3}">${esc(prefill ?? '')}</textarea>`
          : `<input id="i${id}" type="text" name="${nameAttr}" value="${esc(prefill ?? '')}"${reqAttr}${describedBy} ${o.formTextMaximumLength ? `maxlength="${o.formTextMaximumLength}"` : ''}>`;
    }
    return `<div class="q" data-type="${fl.type}" data-col="${nameAttr}" data-required="${o.formRequired ? 1 : 0}" ${hidden ? 'hidden' : ''}>${head}${input}<div class="err" id="${errId}">Ce champ est obligatoire.</div></div>`;
  }

  async function onSubmit(ev) {
    ev.preventDefault();
    const formEl = ev.target;
    if (formEl._website.value) return; // honeypot
    const fields = {};
    const uploads = [];
    let valid = true;
    for (const q of formEl.querySelectorAll('.q')) {
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
      const empty = value === null || value === '' || value === false && type !== 'Bool';
      q.classList.toggle('invalid', required && empty && !q.hidden);
      if (required && empty && !q.hidden) valid = false;
      if (value !== null && type !== 'Attachments') fields[col] = value;
    }
    if (!valid) { formEl.querySelector('.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }

    const btn = formEl.querySelector('button[type=submit]');
    const status = document.getElementById('status');
    btn.disabled = true; status.textContent = 'Envoi…';
    try {
      for (const up of uploads) {
        const fd = new FormData();
        up.files.forEach(file => fd.append('upload', file));
        const r = await fetch(`${target.api}/attachments`, { method: 'POST', body: fd });
        if (!r.ok) throw new Error(`Pièces jointes : HTTP ${r.status}`);
        fields[up.col] = ['L', ...(await r.json())];
      }
      const r = await fetch(`${target.api}/tables/${form.formTableId}/records`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: [{ fields }] }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status} ${await r.text()}`);
      const j = await r.json();
      app.innerHTML = `<div class="center"><h1 class="ok">Merci, votre réponse a bien été enregistrée.</h1>
        <p class="sub">Identifiant : ${esc(j.records?.[0]?.id)}</p>
        <p><button type="button" class="primary" id="restart-btn">Envoyer une autre réponse</button></p></div>`;
      // addEventListener plutôt qu'un attribut `onclick` : un gestionnaire d'événement inline
      // est bloqué par la CSP `script-src` sans `'unsafe-inline'` (voir le <meta> CSP de cette
      // page), que ce bouton, généré après coup, ne pourrait alors plus jamais déclencher.
      document.getElementById('restart-btn').addEventListener('click', () => location.reload());
    } catch (e) {
      btn.disabled = false; status.textContent = 'Erreur : ' + e.message; status.style.color = 'var(--error)';
    }
  }
})();
