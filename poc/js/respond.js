import { $, esc, show } from './dom.js';
import { ICONS } from './icons.js';
import { I18n } from '../../kit/js/i18n.js';
import './strings.js'; // enregistre form.* avant tout usage de I18n.t() au chargement de ce module (voir strings.js)
import { LAYOUT_KINDS, SINGLE_CHOICE_KINDS, mapFeatureEnabled, LEAFLET_CDN_URL, LEAFLET_CDN_CSS } from './kinds.js';
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
  const labelId = `qlabel-i${id}`;
  const errId = `err-i${id}`;
  // Obligatoire : attribut HTML natif `required` (jamais pour bloquer l'envoi — le <form> reste
  // novalidate, seule notre propre validation ci-dessous fait foi — mais lu par les lecteurs
  // d'écran comme aria-required, cf. spécification ARIA-en-HTML). aria-describedby relie le
  // champ à son message d'erreur (#err-i<id>, masqué visuellement tant que .q n'est pas
  // .invalid, mais toujours présent dans l'arbre d'accessibilité) — uniquement quand le champ
  // est obligatoire, seul cas où ce message a un sens.
  const reqAttr = o.formRequired ? ' required' : '';
  const describedBy = o.formRequired ? ` aria-describedby="${errId}"` : '';
  // "for" ne vise le titre que vers un contrôle réellement « labelable » (id posé directement
  // sur lui) : pour Choix multiples et Choix-en-boutons-radio, c'est un conteneur générique
  // <div class="pv-pill-group"> qui porte le regroupement — un `for` pointant vers un <div> ne
  // crée AUCUNE association pour les lecteurs d'écran (seul un contrôle réellement labelable
  // peut l'être), c'était jusqu'ici le cas pour ces deux types sans que rien ne le remplace.
  // role="group" + aria-labelledby sur le conteneur prend le relais ; chaque option garde par
  // ailleurs son propre intitulé, déjà correct, via le <label class="pv-pill"> qui l'entoure.
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
      input = `<label class="switch"><input id="i${id}" type="checkbox" name="${nameAttr}"${reqAttr}${describedBy} ${prefill === 'true' ? 'checked' : ''}> ${I18n.t('form.respond.yes')}</label>`; break;
    case 'Date':
      input = `<input id="i${id}" type="date" name="${nameAttr}" value="${esc(prefill ?? '')}"${reqAttr}${describedBy}>`; break;
    case 'DateTime':
      input = `<input id="i${id}" type="datetime-local" name="${nameAttr}" value="${esc(prefill ?? '')}"${reqAttr}${describedBy}>`; break;
    case 'Choice':
    case 'Ref': {
      const opts = fl.type === 'Choice' ? choices.map(c => [c, c]) : refs.map(([rid, v]) => [rid, v]);
      if (o.formSelectFormat === 'radio') {
        input = `<div class="pv-pill-group" role="group" aria-labelledby="${labelId}">${opts.map(([v, l]) => `<label class="pv-pill"><input type="radio" name="${nameAttr}" value="${esc(v)}"${reqAttr}${describedBy} ${String(v) === prefill ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
      } else {
        input = `<select id="i${id}" name="${nameAttr}"${reqAttr}${describedBy}><option value="">${I18n.t('form.respond.choosePlaceholder')}</option>` +
          opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === prefill ? 'selected' : ''}>${esc(l)}</option>`).join('') + `</select>`;
      }
      break;
    }
    case 'ChoiceList':
    case 'RefList': {
      const opts = fl.type === 'ChoiceList' ? choices.map(c => [c, c]) : refs.map(([rid, v]) => [rid, v]);
      // `required` par case signifierait « toutes » doivent être cochées, alors qu'il s'agit
      // d'« au moins une » (même nuance que pour le kind "multiselect" des questions
      // supplémentaires, voir renderExtraQuestion) : aucun des deux n'est posé ici. aria-required
      // sur le groupe serait la façon la plus proche de le dire malgré tout, mais la spécification
      // ARIA ne l'autorise pas sur role="group" (confirmé par axe-core, règle "aria-allowed-attr")
      // — seuls l'astérisque visuel (classe .req) et le message d'erreur lié (aria-describedby,
      // ci-dessous) restent disponibles pour ce cas, limitation ARIA assumée.
      input = `<div class="pv-pill-group" role="group" aria-labelledby="${labelId}">${opts.map(([v, l]) => `<label class="pv-pill"><input type="checkbox" name="${nameAttr}[]" value="${esc(v)}"${describedBy}><span>${esc(l)}</span></label>`).join('')}</div>`;
      break;
    }
    case 'Attachments':
      input = `<input id="i${id}" type="file" name="${nameAttr}" multiple${reqAttr}${describedBy}>`; break;
    default:
      input = o.formTextFormat === 'multiline'
        ? `<textarea id="i${id}" name="${nameAttr}"${reqAttr}${describedBy} rows="${o.formTextLineCount || 3}">${esc(prefill ?? '')}</textarea>`
        : `<input id="i${id}" type="text" name="${nameAttr}" value="${esc(prefill ?? '')}"${reqAttr}${describedBy} ${o.formTextMaximumLength ? `maxlength="${o.formTextMaximumLength}"` : ''}>`;
  }
  return `<div class="q pv-q" data-native="1" data-type="${fl.type}" data-col="${nameAttr}" data-required="${o.formRequired ? 1 : 0}" ${hidden ? 'hidden' : ''}>${head}${input}<div class="err-msg" id="${errId}">${I18n.t('form.respond.fieldRequired')}</div></div>`;
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

export function radioGroup(name, choices, opts) {
  const { required = false, describedBy = null } = opts || {};
  return `<div class="pv-pill-group">${choices.map(c => `<label class="pv-pill"><input type="radio" name="${name}" value="${esc(c)}" data-label="${esc(c)}"${required ? ' required' : ''}${describedBy ? ` aria-describedby="${describedBy}"` : ''}><span>${esc(c)}</span></label>`).join('')}</div>`;
}

// Valeur technique de l'option "Autre" (select/multiselect, q.allowOther) : jamais confondue
// avec une vraie option saisie par le concepteur, remplacée par le texte libre tapé par le
// répondant au moment de l'envoi (voir onSubmit) et de l'affichage (wireOtherOption, renderFill).
export const OTHER_SENTINEL = '__formplus_other__';
function otherInputHtml(id) {
  return `<input type="text" id="eq-${id}-other" class="pv-other-input hidden" placeholder="${esc(I18n.t('form.respond.specifyPlaceholder'))}" aria-label="${esc(I18n.t('form.respond.specifyAria'))}">`;
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
  const labelId = `eqlabel-${q.id}`;
  const errId = `eqerr-${q.id}`;
  // Même principe que renderNativeField ci-dessus : attribut `required` natif (jamais bloquant,
  // le <form> reste novalidate — lu par les lecteurs d'écran comme aria-required) et
  // aria-describedby vers le message d'erreur, uniquement quand la question est obligatoire.
  const reqAttr = q.required ? ' required' : '';
  const describedBy = q.required ? ` aria-describedby="${errId}"` : '';
  // "for" ne vise le titre que vers un contrôle réellement labelable — jamais le conteneur
  // générique <div id="eq-${q.id}"> des types à options multiples ou chargés depuis une table
  // (select/radios injectés après coup par renderFill une fois les libellés connus) : un `for`
  // pointant vers un <div> ne crée aucune association pour les lecteurs d'écran. Même id que
  // celui déjà lu partout ailleurs par $(`eq-${q.id}`) (singleValueOf, conditionMet, onSubmit,
  // les écouteurs de condition) : INCHANGÉ, seuls role="group" + aria-labelledby s'y ajoutent.
  // reflist/ranking/signature : mêmes conteneurs génériques (non labelables) que choice/
  // multiselect ci-dessus. "map" ne l'est QUE si la carte interactive est active
  // (mapFeatureEnabled()) : sinon c'est un <input type=text> normal, directement labelable
  // (repli décrit dans renderExtraQuestion, cas 'map').
  const isGroupContainer = ['multiselect', 'choice', 'reflist', 'ranking', 'signature', 'timeslot'].includes(q.kind)
    || (q.kind === 'select' && q.displayMode === 'radio')
    || (q.kind === 'map' && mapFeatureEnabled());
  const titleFor = isGroupContainer ? '' : ` for="eq-${q.id}"`;
  let input;
  switch (q.kind) {
    case 'choice':
    case 'reflist':
      // Conteneur générique : le chargement (renderFill) y injecte un <select>/des radios
      // (choice) ou des cases à cocher (reflist) selon q.displayMode, une fois les libellés lus
      // dans la table source — il garde alors role="group"/aria-labelledby déjà posés ici
      // (innerHTML remplacé, pas l'élément lui-même). aria-required n'est pas posé ici, bien que
      // la question puisse être obligatoire : la spécification ARIA ne l'autorise pas sur
      // role="group" (confirmé par axe-core, règle "aria-allowed-attr") — limitation assumée, cf.
      // ChoiceList/RefList dans renderNativeField ci-dessus. L'astérisque visuel et le message
      // d'erreur lié restent.
      input = `<div id="eq-${q.id}" role="group" aria-labelledby="${labelId}"><span class="muted">${I18n.t('form.loadingGeneric')}</span></div>`;
      break;
    case 'select': {
      const otherPill = q.allowOther ? `<label class="pv-pill"><input type="radio" name="eq-${q.id}" value="${OTHER_SENTINEL}" data-label="${esc(I18n.t('form.respond.otherLabel'))}"><span>${I18n.t('form.respond.otherOptionText')}</span></label>` : '';
      const otherOpt = q.allowOther ? `<option value="${OTHER_SENTINEL}" data-label="${esc(I18n.t('form.respond.otherLabel'))}">${I18n.t('form.respond.otherOptionText')}</option>` : '';
      input = q.displayMode === 'radio'
        ? `<div id="eq-${q.id}" class="pv-pill-group" role="group" aria-labelledby="${labelId}">${(q.choices || []).map(c => `<label class="pv-pill"><input type="radio" name="eq-${q.id}" value="${esc(c)}" data-label="${esc(c)}"${reqAttr}${describedBy}><span>${esc(c)}</span></label>`).join('')}${otherPill}</div>`
        : `<select id="eq-${q.id}"${reqAttr}${describedBy}><option value="">${I18n.t('form.respond.choosePlaceholder')}</option>${(q.choices || []).map(c => `<option value="${esc(c)}" data-label="${esc(c)}">${esc(c)}</option>`).join('')}${otherOpt}</select>`;
      if (q.allowOther) input += otherInputHtml(q.id);
      break;
    }
    case 'timeslot':
      // Toujours en pastilles (jamais la bascule menu/radio de 'select', voir FIXED_LIST_KINDS,
      // kinds.js) : le but même du type, un choix "d'un peu visuel" (demandé par Antoine le 21
      // oct) — une icône horloge sur chaque créneau, en plus du texte choisi par le concepteur.
      input = `<div id="eq-${q.id}" class="pv-pill-group" role="group" aria-labelledby="${labelId}">${(q.choices || []).map(c => `<label class="pv-pill pv-timeslot-pill"><input type="radio" name="eq-${q.id}" value="${esc(c)}" data-label="${esc(c)}"${reqAttr}${describedBy}><span><span class="pv-timeslot-icon" aria-hidden="true">${ICONS.clock}</span>${esc(c)}</span></label>`).join('')}</div>`;
      break;
    case 'multiselect': {
      const otherPill = q.allowOther ? `<label class="pv-pill"><input type="checkbox" name="eqm-${q.id}" value="${OTHER_SENTINEL}"><span>${I18n.t('form.respond.otherOptionText')}</span></label>` : '';
      // Même nuance que ChoiceList/RefList natifs ci-dessus (« au moins une », pas « toutes » :
      // pas de `required` par case) et même limitation ARIA (pas d'aria-required sur role="group").
      input = `<div id="eq-${q.id}" class="pv-pill-group" role="group" aria-labelledby="${labelId}">` +
        (q.choices || []).map(c => `<label class="pv-pill"><input type="checkbox" name="eqm-${q.id}" value="${esc(c)}"${describedBy}><span>${esc(c)}</span></label>`).join('') +
        otherPill + `</div>`;
      if (q.allowOther) input += otherInputHtml(q.id);
      break;
    }
    case 'number':
      input = `<input id="eq-${q.id}" type="number" step="any"${reqAttr}${describedBy}>`;
      break;
    case 'date':
      input = `<input id="eq-${q.id}" type="date"${reqAttr}${describedBy}>`;
      break;
    case 'datetime':
      input = `<input id="eq-${q.id}" type="datetime-local"${reqAttr}${describedBy}>`;
      break;
    case 'bool':
      input = `<label class="switch"><input id="eq-${q.id}" type="checkbox"${reqAttr}${describedBy}> ${I18n.t('form.respond.yes')}</label>`;
      break;
    case 'longtext':
      input = `<textarea id="eq-${q.id}" rows="4"${reqAttr}${describedBy}></textarea>`;
      break;
    case 'attachments':
      input = `<input id="eq-${q.id}" type="file" multiple${reqAttr}${describedBy}${q.allowCapture ? ' capture="environment"' : ''}>`;
      break;
    case 'scale': {
      // Un curseur a toujours une valeur numérique (jamais "vide", voir isAnswered/onSubmit) :
      // `required`/aria-describedby n'auraient aucun effet réel ici, donc pas posés —
      // contrairement aux autres types ci-dessus/ci-dessous.
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
      // Classement : une liste ordonnée a toujours une valeur, même par défaut (voir
      // isAnswered/onSubmit) — pas de `required` ici, même raison que "scale" ci-dessus.
      // role="group" + aria-labelledby plutôt qu'un `for` : <ol> n'est pas un élément labelable
      // (même limite que les conteneurs de boutons radio/case ci-dessus) ; chaque bouton garde
      // par ailleurs son propre aria-label ("Monter X"/"Descendre X"), déjà explicite. Posé sur un
      // <div> ENGLOBANT la liste, jamais directement sur le <ol> : role="group" y écraserait le
      // rôle implicite "list" de l'élément et briserait l'association list/listitem avec ses <li>
      // (confirmé par axe-core, règle "listitem") — #eq-${q.id} reste l'<ol> lui-même, inchangé
      // pour les lecteurs existants (onSubmit, wirePages/renderFill qui réordonnent les <li>).
      input = `<div role="group" aria-labelledby="${labelId}"><ol id="eq-${q.id}" class="pv-ranking">` +
        (q.choices || []).map((c, i) => `<li class="pv-ranking-item" data-value="${esc(c)}">
          <span class="pv-ranking-rank">${i + 1}</span><span class="pv-ranking-label">${esc(c)}</span>
          <span class="pv-ranking-btns">
            <button type="button" class="icon-btn" data-rank="up" aria-label="${esc(I18n.t('form.respond.rankUp', { choice: c }))}">${ICONS.arrowUp}</button>
            <button type="button" class="icon-btn" data-rank="down" aria-label="${esc(I18n.t('form.respond.rankDown', { choice: c }))}">${ICONS.arrowDown}</button>
          </span></li>`).join('') +
        `</ol></div>`;
      break;
    case 'signature':
      // <div> non labelable, role="group" + aria-labelledby comme les autres conteneurs
      // génériques ci-dessus. Limite structurelle NON corrigée ici, signalée au rapport : un
      // dessin à la souris/au doigt n'a aucun équivalent clavier ni méthode de saisie alternative
      // pour un répondant qui ne peut pas voir ou utiliser le canevas (WCAG 2.1.1 Clavier).
      input = `<div id="eq-${q.id}" class="pv-signature" role="group" aria-labelledby="${labelId}" data-drawn="0">
        <canvas class="pv-signature-canvas" width="500" height="160"></canvas>
        <button type="button" class="qf-link pv-sign-clear">${ICONS.trash}<span>${I18n.t('form.respond.clearSignature')}</span></button>
      </div>`;
      break;
    case 'map':
      // Carte interactive (Leaflet, dépendance externe) grisée par défaut (voir mapFeatureEnabled,
      // kinds.js) : sur cette version, repli en simple saisie manuelle "latitude, longitude", lue
      // par le même champ générique que les autres types texte (onSubmit) — un contrôle normal,
      // labelable, avec les mêmes required/describedby que les autres champs simples. Activée
      // (ex. GFS, window.FORMPLUS_ENABLE_MAP = true), le canvas ci-dessous est transformé en carte
      // cliquable par wireMaps (appelée depuis renderFill), qui pose la même valeur dans un champ
      // devenu <input type=hidden>, jamais focusable — limite structurelle NON corrigée ici,
      // signalée au rapport : cliquer sur la carte n'a aucun équivalent clavier (WCAG 2.1.1).
      input = mapFeatureEnabled()
        ? `<div class="pv-map" role="group" aria-labelledby="${labelId}">
            <div class="pv-map-canvas" id="eq-${q.id}-canvas"></div>
            <p class="muted pv-map-coords" id="eq-${q.id}-coords">${I18n.t('form.respond.mapClickHint')}</p>
            <input type="hidden" id="eq-${q.id}" value="">
          </div>`
        : `<div class="pv-map">
            <input id="eq-${q.id}" type="text" placeholder="${esc(I18n.t('form.respond.mapCoordsPlaceholder'))}"${reqAttr}${describedBy}>
            <p class="muted pv-map-coords">${I18n.t('form.respond.mapUnavailable')}</p>
          </div>`;
      break;
    default:
      input = `<input id="eq-${q.id}" type="text"${reqAttr}${describedBy}>`;
  }
  return `<div class="q pv-q" data-extra="${q.id}" data-kind="${q.kind}" data-required="${q.required ? 1 : 0}">
    <label class="title ${req}" id="${labelId}"${titleFor}>${esc(q.label)}</label>
    ${q.description ? `<p class="desc pv-hint">${esc(q.description)}</p>` : ''}
    ${input}<div class="err-msg" id="${errId}">${I18n.t('form.respond.fieldRequired')}</div></div>`;
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
  $('progress-text').textContent = total ? I18n.t('form.respond.progressCount', { done, total }) : '';
}

// Découpe la liste des questions supplémentaires en pages, sur les marqueurs de type "page"
// (voir kinds.js) : tout ce qui précède le premier marqueur forme la page 1 (condition: null,
// jamais sautée, rien ne la précède pour porter une condition qui aurait un sens) ; chaque
// marqueur ouvre une nouvelle page qui porte SA condition (si elle est fausse, la page entière
// est sautée à la navigation, voir wirePages). Toujours au moins une page, même sans aucun
// marqueur (le cas de loin le plus courant aujourd'hui).
export function splitIntoPages(items) {
  const pages = [{ condition: null, label: null, items: [] }];
  for (const q of items) {
    if (q.kind === 'page') { pages.push({ condition: q.condition, label: q.label, items: [] }); continue; }
    pages[pages.length - 1].items.push(q);
  }
  return pages;
}

// Une page dont la condition est vraie (ou qui n'en a pas) est "éligible" : conditionMet(null,…)
// vaut déjà true, donc applicable aussi à la page 1. Seul point de vérité pour savoir si une
// page compte dans la navigation, utilisé à la fois pour avancer/reculer et pour les classer
// "vide"/"invalide" à la soumission (voir wirePages, plus bas).
function pageEligible(page, extraQuestions) {
  return conditionMet(page.condition, extraQuestions);
}

// Un champ obligatoire compte comme "manquant" avec les mêmes règles que la validation finale
// (onSubmit) : repli sur isAnswered (déjà testée pour chaque type), sauf Oui/non, qui isAnswered
// considère toujours répondu (choix volontaire, voir son commentaire) alors qu'onSubmit, lui,
// exige explicitement `true` pour un Oui/non obligatoire ("J'accepte les conditions", par
// exemple) — même écart à combler ici, pour que la navigation page par page bloque exactement
// sur les mêmes cas que l'envoi final, pas une version plus permissive.
function isRequiredFieldMissing(q) {
  if (q.classList.contains('cond-hidden')) return false;
  if (q.dataset.kind === 'bool') return q.querySelector('input[type=checkbox]')?.checked !== true;
  return isAnswered(q) === false;
}

// Câble la condition d'affichage de chaque question supplémentaire (hors marqueurs "page", voir
// plus bas) : masque/affiche son conteneur [data-extra] selon conditionMet, et réécoute le(s)
// conteneur(s) #eq-<id> de ses question(s) source(s) pour recalculer à chaque changement. Jamais
// appelée sur un marqueur "page" (q.kind === 'page') : splitIntoPages le retire de chaque
// pages[].items avant le rendu (renderFill), donc renderExtraQuestion n'est jamais appelée pour
// lui et aucun élément [data-extra=<id>] n'existe dans le DOM pour lui correspondre — sans cette
// exclusion, `target` vaut null pour un marqueur "page" conditionné et `target.classList.toggle`
// plante dès le premier appel de `check()` (immédiat ci-dessous, ou au moindre changement de la
// question source), bloquant tout le formulaire (Suivant/Envoi). La condition d'un marqueur
// "page" est déjà gérée par wirePages/applySkip ci-dessous (saut de page), qui ne passe jamais
// par ce conteneur.
export function wireConditions(card, extraQuestions) {
  for (const q of extraQuestions) {
    if (q.kind === 'page') continue;
    const cond = normalizeCondition(q.condition);
    if (!cond?.rules?.length) continue;
    const target = card.querySelector(`[data-extra="${q.id}"]`);
    if (!target) continue;
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
}

// Navigation entre pages : boutons Précédent/Suivant, "obligatoire" vérifié page par page (pas
// seulement à l'envoi final), pages sans condition ou dont la condition est vraie seules
// comptées. N'est jamais appelée si une seule page (voir paginated, renderFill) : le rendu et le
// comportement d'un formulaire sans marqueur "page" restent alors identiques à avant.
export function wirePages(card, pages, extraQuestions) {
  const pageEl = (i) => card.querySelector(`.pv-page[data-page-index="${i}"]`);
  const submitBtn = card.querySelector('#pv-submit-btn');
  const prevBtn = card.querySelector('#pv-prev');
  const nextBtn = card.querySelector('#pv-next');
  const indicator = card.querySelector('#pv-page-indicator');

  // Une page sautée (condition fausse) masque aussi chacune de ses questions via la même classe
  // que les conditions de question (cond-hidden) : c'est ce qui garantit que l'envoi final
  // (onSubmit, qui ne connaît rien des pages) ne les traite ni comme obligatoires ni comme des
  // réponses à envoyer, exactement comme une question individuellement masquée par sa condition.
  const applySkip = () => {
    pages.forEach((p, i) => {
      const skip = !pageEligible(p, extraQuestions);
      pageEl(i)?.querySelectorAll('.q').forEach(q => q.classList.toggle('cond-hidden', skip));
    });
  };
  pages.forEach((p) => {
    const cond = normalizeCondition(p.condition);
    if (!cond?.rules?.length) return;
    cond.rules.map(r => $(`eq-${r.questionId}`)).filter(Boolean)
      .forEach(c => ['input', 'change'].forEach(evt => c.addEventListener(evt, applySkip)));
  });
  applySkip();

  const nextEligible = (from, dir) => {
    let i = from + dir;
    while (i >= 0 && i < pages.length) {
      if (pageEligible(pages[i], extraQuestions)) return i;
      i += dir;
    }
    return -1;
  };
  const eligibleCount = () => pages.filter(p => pageEligible(p, extraQuestions)).length;
  const eligibleRank = (idx) => pages.slice(0, idx + 1).filter(p => pageEligible(p, extraQuestions)).length;

  let current = 0;
  const show = (idx) => {
    current = idx;
    pages.forEach((_, i) => { const el = pageEl(i); if (el) el.hidden = i !== idx; });
    const hasNext = nextEligible(idx, 1) !== -1;
    prevBtn.classList.toggle('hidden', nextEligible(idx, -1) === -1);
    nextBtn.classList.toggle('hidden', !hasNext);
    submitBtn.classList.toggle('hidden', hasNext);
    indicator.textContent = I18n.t('form.respond.pageIndicator', { rank: eligibleRank(idx), count: eligibleCount() });
    pageEl(idx)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  prevBtn.addEventListener('click', () => { const i = nextEligible(current, -1); if (i !== -1) show(i); });
  nextBtn.addEventListener('click', () => {
    const el = pageEl(current);
    const missing = [...el.querySelectorAll('.q[data-required="1"]')].filter(isRequiredFieldMissing);
    missing.forEach(q => q.classList.add('invalid'));
    el.querySelectorAll('.q[data-required="1"]').forEach(q => { if (!missing.includes(q)) q.classList.remove('invalid'); });
    if (missing.length) { missing[0].scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    const i = nextEligible(current, 1);
    if (i !== -1) show(i);
  });

  show(0);
}

// Chargement à la demande du script et de la feuille de style Leaflet depuis le CDN (voir
// LEAFLET_CDN_URL/LEAFLET_CDN_CSS, kinds.js) : jamais au chargement du widget, seulement quand
// wireMaps en a réellement besoin. Mémorisé (une seule requête même avec plusieurs questions
// "map" sur le même formulaire, ou si renderFill est rappelée).
let leafletLoadPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (!leafletLoadPromise) {
    leafletLoadPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CDN_CSS;
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = LEAFLET_CDN_URL;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Impossible de charger Leaflet depuis le CDN'));
      document.head.appendChild(script);
    });
  }
  return leafletLoadPromise;
}

// Branche une vraie carte Leaflet (fond OpenStreetMap, clic pour poser un point) sur chaque
// question "map", à la place du canvas inerte posé par renderExtraQuestion. N'est appelée (et ne
// charge donc jamais Leaflet) que si la fonctionnalité est activée — voir le commentaire à
// l'appel, dans renderFill.
async function wireMaps(card, extraQuestions) {
  const mapQuestions = extraQuestions.filter(q => q.kind === 'map');
  if (!mapQuestions.length || !mapFeatureEnabled()) return;
  try {
    await loadLeaflet();
  } catch (e) {
    diag(`Carte interactive : ${e.message}`);
    return;
  }
  for (const q of mapQuestions) {
    const canvasEl = $(`eq-${q.id}-canvas`);
    const coordsEl = $(`eq-${q.id}-coords`);
    const hiddenEl = $(`eq-${q.id}`);
    if (!canvasEl || !hiddenEl) continue;
    const map = window.L.map(canvasEl).setView([46.6, 2.5], 5); // France entière par défaut
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    let marker = null;
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (marker) marker.setLatLng(e.latlng); else marker = window.L.marker(e.latlng).addTo(map);
      hiddenEl.value = `${lat.toFixed(6)},${lng.toFixed(6)}`;
      if (coordsEl) coordsEl.textContent = I18n.t('form.respond.mapPointSet', { lat: lat.toFixed(5), lng: lng.toFixed(5) });
    });
  }
}

// Titre affiché au répondant : titre FormPlus (options.formTitle) s'il est renseigné, sinon le
// titre natif du formulaire Grist (form.formTitle, API /forms) — SAUF quand ce dernier n'est que
// le nom brut de la table (form.formTableId porte ce même nom : égalité des deux -> jamais
// personnalisé côté Grist), auquel cas un libellé générique traduit est utilisé à la place. Zéro
// jargon Grist pour le répondant (principe n°4 de la feuille de route, docs/03-roadmap-priorites),
// plutôt que l'identifiant technique de la table (ex. « Table1 », audit UI/UX du 21 oct). Fonction
// pure, extraite de renderFill pour être testable sans tout le DOM de la page de réponse.
export function resolveFormTitle(options, form) {
  const nativeTitle = form?.formTitle && form.formTitle !== form?.formTableId ? form.formTitle : '';
  return options?.formTitle || nativeTitle || I18n.t('form.respond.untitledForm');
}

export async function renderFill() {
  show('fill');
  const card = $('fill-card');
  card.classList.remove('respond-card-shell');
  card.innerHTML = `<p class="muted">${I18n.t('form.loadingGeneric')}</p>`;
  $('progress').classList.add('hidden');

  const formLink = state.options?.formLink || fragmentFormLink;
  const link = parseFormLink(formLink);
  if (!link) { card.innerHTML = `<h1>${I18n.t('form.respond.formUnavailable')}</h1><p class="muted">${I18n.t('form.respond.linkUnreadable')}</p>`; return; }

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
    card.innerHTML = `<h1>${I18n.t('form.respond.formUnavailable')}</h1><p class="muted">${esc(e.message)}</p>`;
    return;
  }

  const extraQuestions = (state.options?.formLink === formLink) ? migrateLegacy(state.options) : [];

  const prefillParams = new URLSearchParams(location.search);
  const nativeRows = layoutOrder(form).map(id => renderNativeField(id, form.formFieldsById[id], prefillParams)).join('');
  // Pages (type "page", voir kinds.js) : chaque marqueur ouvre une nouvelle page ; tout ce qui le
  // précède (y compris sans aucun marqueur, le cas de loin le plus courant) forme la première,
  // jamais conditionnable (rien ne la précède pour porter une condition). Un seul marqueur
  // "page" dans le formulaire suffit à activer la pagination ci-dessous ; aucun marqueur -> rendu
  // strictement identique à avant (pas de wrapper, pas de barre de navigation).
  const pages = splitIntoPages(extraQuestions);
  const paginated = pages.length > 1;
  const extraRows = paginated
    ? pages.map((p, i) => `<div class="pv-page" data-page-index="${i}" ${i === 0 ? '' : 'hidden'}>${p.items.map(renderExtraQuestion).join('')}</div>`).join('')
    : (pages[0]?.items || []).map(renderExtraQuestion).join('');
  const title = resolveFormTitle(state.options, form);
  const description = state.options?.formDescription || '';
  const submitLabel = state.options?.submitLabel || I18n.t('form.appearance.submitPlaceholder');
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
      <p class="muted">${I18n.t('form.respond.requiredFieldsNote')}</p>
      <form id="f" novalidate>
        ${nativeRows}
        ${extraRows ? `<hr class="divider">${extraRows}` : ''}
        ${paginated ? `<p class="muted pv-page-indicator" id="pv-page-indicator" aria-live="polite"></p>` : ''}
        <label class="hp">${I18n.t('form.respond.honeypotLabel')} <input type="text" name="_website" tabindex="-1" autocomplete="off"></label>
        <div class="actions">
          <span id="fill-status" class="muted"></span>
          ${paginated ? `<div class="pv-pager-nav">
            <button type="button" id="pv-prev" class="hidden">${I18n.t('form.respond.prevBtn')}</button>
            <button type="button" id="pv-next">${I18n.t('form.respond.nextBtn')}</button>
          </div>` : ''}
          <button type="submit" class="primary${paginated ? ' hidden' : ''}" id="pv-submit-btn">${esc(submitLabel)}</button>
        </div>
      </form>
    </div>`;

  // Navigation entre pages : établie tout de suite, avant la moindre pause asynchrone (aucun
  // "await" entre l'affectation de card.innerHTML ci-dessus et cet appel), pour que l'état
  // initial correct (bouton Suivant/Envoyer, page 1 visible) soit posé avant la première
  // peinture du navigateur plutôt qu'après — jamais d'éclair visible avec le mauvais bouton.
  if (paginated) wirePages(card, pages, extraQuestions);

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
      // aria-labelledby posé directement sur le <select> injecté : le role="group" déjà présent
      // sur le conteneur (renderExtraQuestion) regroupe les radios/cases, mais ne donne pas à lui
      // seul un nom au <select> — sans quoi un lecteur d'écran l'annonce comme un contrôle sans
      // nom (confirmé par axe-core, règle "select-name").
      const choiceReq = q.required ? ' required' : '';
      const choiceDescribedBy = q.required ? ` aria-describedby="eqerr-${q.id}"` : '';
      if (q.kind === 'reflist') {
        // Pas d'aria-required par case (même nuance que "multiselect" : « au moins une », pas
        // « toutes ») ; le groupe est déjà nommé par role="group"/aria-labelledby posés par
        // renderExtraQuestion sur ce conteneur (innerHTML remplacé ici, pas l'élément lui-même).
        box.innerHTML = `<div class="pv-pill-group">${ids.map((id, i) => `<label class="pv-pill"><input type="checkbox" name="eqm-${q.id}" value="${id}"${choiceDescribedBy}><span>${esc(labels[i])}</span></label>`).join('')}</div>`;
      } else {
        box.innerHTML = q.displayMode === 'radio'
          ? ids.map((id, i) => `<label class="opt"><input type="radio" name="eq-${q.id}" value="${id}" data-label="${esc(labels[i])}"${choiceReq}${choiceDescribedBy}> ${esc(labels[i])}</label>`).join('')
          : `<select aria-labelledby="eqlabel-${q.id}"${choiceReq}${choiceDescribedBy}><option value="">${I18n.t('form.respond.choosePlaceholder')}</option>` + ids.map((id, i) => `<option value="${id}" data-label="${esc(labels[i])}">${esc(labels[i])}</option>`).join('') + '</select>';
      }
      diag({ event: 'choice-loaded', questionId: q.id, sourceTable: q.sourceTable, sourceCol: q.sourceCol, hasCol, rowCount: ids.length });
    } catch (e) {
      box.innerHTML = `<span class="muted">${I18n.t('form.respond.unavailable')}</span>`;
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

  // Carte interactive : seule fonctionnalité du widget à dépendre d'une bibliothèque externe
  // (Leaflet), donc seule à être chargée depuis un CDN, et seulement si mapFeatureEnabled() et au
  // moins une question "map" existent (jamais de requête réseau pour rien, jamais sur la version
  // grisée par défaut — voir mapFeatureEnabled, kinds.js, et le repli en case 'map' ci-dessus).
  await wireMaps(card, extraQuestions);

  wireConditions(card, extraQuestions);

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
    } else if (SINGLE_CHOICE_KINDS.has(q.kind) || q.kind === 'timeslot') {
      // Menu déroulant ou radios selon q.displayMode (select/choice), ou pastilles toujours
      // (timeslot, jamais de q.allowOther pour ce type) : même lecture dans les deux cas
      // (singleValueOf).
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
  btn.disabled = true; status.textContent = I18n.t('form.respond.sending'); status.classList.remove('err');
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
        if (up.table === form.formTableId) throw new Error(I18n.t('form.respond.attachmentsErrorPrefix', { message: e.message }));
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
    const endMessage = state.options?.endMessage || I18n.t('form.appearance.endMsgPlaceholder');
    const partial = failedTables.length || failedUploads.length;
    // Redirection automatique jamais lancée sur un envoi partiel (le répondant doit voir
    // l'avertissement d'abord), et jamais vers un schéma autre que http(s) : esc() échappe les
    // caractères HTML mais ne filtre aucun schéma d'URI, un opt-redirect à javascript:… passerait
    // tel quel et s'exécuterait automatiquement 3 secondes après l'envoi, sans clic du répondant.
    const rawRedirect = partial ? '' : (state.options?.redirectUrl || '');
    let redirectUrl = '';
    if (rawRedirect) { try { redirectUrl = ['http:', 'https:'].includes(new URL(rawRedirect, location.href).protocol) ? rawRedirect : ''; } catch (e) { redirectUrl = ''; } }
    const warningParts = [];
    if (failedTables.length) warningParts.push(I18n.t('form.respond.warningTables', { n: failedTables.length, list: failedTables.map(esc).join(', ') }));
    if (failedUploads.length) warningParts.push(I18n.t('form.respond.warningAttachments', { n: failedUploads.length, list: failedUploads.map(esc).join(', ') }));
    const warning = warningParts.length
      ? `<p class="err">${I18n.t('form.respond.partialFailureWarning', { parts: warningParts.join(' ; ') })}</p>`
      : '';
    $('fill-card').classList.remove('respond-card-shell'); // ce message tient dans le padding normal de .card, plus de bandeau/en-tête à afficher
    $('fill-card').innerHTML = `<div class="center"><h1 class="ok">${esc(endMessage)}</h1>
      <p class="muted">${I18n.t('form.respond.recordId', { id: esc(j.records?.[0]?.id) })}</p>
      ${warning}
      ${redirectUrl ? `<p class="muted" id="redirect-msg">${I18n.t('form.respond.redirectPrefix')}<span id="redirect-count">3</span>${I18n.t('form.respond.redirectSuffix')}<a href="${esc(redirectUrl)}">${I18n.t('form.respond.continueNowLink')}</a></p>` : ''}
      <p><button class="primary" onclick="location.reload()">${I18n.t('form.respond.sendAnotherBtn')}</button></p></div>`;
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
    btn.disabled = false; status.textContent = I18n.t('form.editor.genericError', { message: e.message }); status.classList.add('err'); status.style.color = 'var(--error)';
  }
}

