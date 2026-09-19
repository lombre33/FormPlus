import { $, show } from './dom.js';
import { parseFormLink, buildPublicUrl, parseCustomView, migrateLegacy, hostOrgFromReferrer, normalizeCondition } from './links.js';
import { hexToRgb, softenColor, contrastText } from './theme.js';
import { KINDS } from './kinds.js';
import { singleValueOf, isAnswered, renderExtraQuestion, onSubmit, conditionMet } from './respond.js';
import {
  questionSummary, choiceQuestionsBefore, renderCardBody,
  importNativeFields, resetQuestions, createEmptyForm, populateFormPicker, generate,
} from './config-editor.js';
import { findExistingShareKey } from './grist-meta.js';
import { state } from './state.js';

// ───────────────────────── Démarrage ─────────────────────────

// ───────────────────────── Suite de tests de non-régression (#test) ─────────────────────────
// Autonome et hors ligne : simule grist.docApi et fetch(), ne touche jamais à un vrai document.
// Accède directement aux fonctions internes (même portée que le reste du fichier), sans jamais
// passer par grist.ready — c'est pourquoi #test est intercepté avant même le test d'iframe, en
// tout début de la fonction de démarrage. Conçue pour être relancée après chaque changement.
export async function runTests() {
  show('test');
  $('test-summary').textContent = 'Exécution…';
  const results = [];
  const record = (name, pass, detail) => results.push({ name, pass, detail });
  const assert = (name, cond, detail) => record(name, !!cond, detail);
  // Égalité profonde indépendante de l'ordre des clés (JSON.stringify seul donnerait de faux
  // échecs entre deux objets équivalents construits dans un ordre de propriétés différent).
  function deepEqual(a, b) {
    if (a === b) return true;
    if (typeof a !== typeof b || a == null || b == null) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (typeof a !== 'object') return false;
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every(k => deepEqual(a[k], b[k]));
  }
  const assertEqual = (name, actual, expected, detail) => {
    const pass = deepEqual(actual, expected);
    record(name, pass, detail || (pass ? '' : `attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)}`));
  };
  const group = async (name, fn) => {
    try { await fn(); } catch (e) { record(`${name} (exception)`, false, `${e.message}\n${e.stack || ''}`); }
  };
  const tick = () => new Promise(r => setTimeout(r, 0));
  const sandbox = $('test-sandbox');
  const mount = (el) => { sandbox.innerHTML = ''; sandbox.appendChild(el); return el; };
  function selectCombo(comboHost, label) {
    const input = comboHost.querySelector('.combo-input');
    input.focus();
    input.value = label;
    input.dispatchEvent(new Event('input'));
    const opt = [...comboHost.querySelectorAll('.combo-opt')].find(o => o.textContent === label);
    if (!opt) throw new Error(`Option "${label}" introuvable dans la liste de "${comboHost.querySelector('.combo-input')?.placeholder}"`);
    opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  }

  // Sauvegarde l'état global mutable pour le restaurer une fois les tests terminés : cette
  // suite s'exécute dans le MÊME script que l'application (même portée), donc dans la même
  // session si elle était déjà active — jamais le cas via #test en pratique, mais prudence.
  const savedState = { options: state.options, cfgQuestions: state.cfgQuestions, currentLink: state.currentLink, currentFormSection: state.currentFormSection, mainTableIdCache: state.mainTableIdCache, expandedId: state.expandedId };
  const savedGrist = window.grist, savedFetch = window.fetch;

  await group('parseFormLink / buildPublicUrl', () => {
    const l1 = parseFormLink('https://grist.numerique.gouv.fr/o/mon-equipe/forms/ABC123/12');
    assertEqual('avec organisation', l1 && { host: l1.host, org: l1.org, key: l1.key, vsId: l1.vsId, base: l1.base },
      { host: 'https://grist.numerique.gouv.fr', org: 'mon-equipe', key: 'ABC123', vsId: 12, base: 'https://grist.numerique.gouv.fr/o/mon-equipe' });
    const l2 = parseFormLink('https://docs.getgrist.com/forms/XYZ/7');
    assertEqual('sans organisation', l2 && { org: l2.org, key: l2.key, vsId: l2.vsId, base: l2.base }, { org: null, key: 'XYZ', vsId: 7, base: 'https://docs.getgrist.com' });
    assert('lien invalide -> null', parseFormLink('pas un lien') === null);
    assert('lien vide -> null', parseFormLink('') === null);
    assertEqual('buildPublicUrl', buildPublicUrl(l1, 9), 'https://grist.numerique.gouv.fr/o/mon-equipe/s/ABC123/p/9?style=singlePage');
  });

  await group('parseCustomView', () => {
    assertEqual('chaîne JSON', parseCustomView({ customView: JSON.stringify({ widgetOptions: { a: 1 } }) }), { widgetOptions: { a: 1 } });
    assertEqual('déjà un objet', parseCustomView({ customView: { url: 'x' } }), { url: 'x' });
    assertEqual('rien', parseCustomView({}), {});
    const corrupt = {};
    JSON.stringify({ widgetOptions: { a: 2 } }).split('').forEach((c, i) => { corrupt[i] = c; });
    assertEqual('corrompu (table de caractères)', parseCustomView({ customView: corrupt }), { widgetOptions: { a: 2 } });
  });

  await group('migrateLegacy', () => {
    assertEqual('format à jour, description par défaut', migrateLegacy({ questions: [{ id: 'q1', kind: 'text' }] }), [{ id: 'q1', kind: 'text', description: '', condition: null }]);
    const legacy = migrateLegacy({ fields: [{ id: 'q1', type: 'choice-table', label: 'L', sourceTable: 'T', sourceCol: 'c', writeTable: 'T', writeCol: 'c' }] });
    assertEqual('ancien format choice-table -> kind choice', legacy[0]?.kind, 'choice');
    assertEqual('aucune donnée -> []', migrateLegacy({}), []);
    const withOldCond = migrateLegacy({ questions: [{ id: 'q1', kind: 'text', condition: { questionId: 'x', value: 'V' } }] });
    assertEqual('condition ancien format (un seul critère) normalisée en {mode, rules}', withOldCond[0].condition,
      { mode: 'all', rules: [{ questionId: 'x', op: 'equals', value: 'V' }] });
    const withNewCond = migrateLegacy({ questions: [{ id: 'q1', kind: 'text', condition: { mode: 'any', rules: [{ questionId: 'x', op: 'equals', value: 'V' }] } }] });
    assertEqual('condition déjà au nouveau format conservée', withNewCond[0].condition, { mode: 'any', rules: [{ questionId: 'x', op: 'equals', value: 'V' }] });
  });

  await group('normalizeCondition', () => {
    assertEqual('rien -> null', normalizeCondition(null), null);
    assertEqual('ancien format -> une règle, mode ET', normalizeCondition({ questionId: 'a', op: 'equals', value: 'V' }),
      { mode: 'all', rules: [{ questionId: 'a', op: 'equals', value: 'V' }] });
    assertEqual('nouveau format OU conservé', normalizeCondition({ mode: 'any', rules: [{ questionId: 'a', value: 'V' }] }),
      { mode: 'any', rules: [{ questionId: 'a', value: 'V' }] });
    assertEqual('mode absent -> ET par défaut', normalizeCondition({ rules: [{ questionId: 'a', value: 'V' }] }).mode, 'all');
  });

  await group('couleurs (hexToRgb / softenColor / contrastText)', () => {
    assertEqual('hexToRgb valide', hexToRgb('#ff0000'), { r: 255, g: 0, b: 0 });
    assert('hexToRgb invalide -> null', hexToRgb('pas une couleur') === null);
    assert('contrastText sur bleu sombre -> texte blanc', contrastText('#000091') === '#fff');
    assert('contrastText sur jaune clair -> texte sombre', contrastText('#ffe600') === '#1c1d21');
    delete document.documentElement.dataset.theme;
    const soft = softenColor('#000091');
    const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(soft || '');
    assert('softenColor en clair se rapproche du blanc', !!m && Number(m[1]) > 180 && Number(m[2]) > 180);
  });

  await group('choiceQuestionsBefore', () => {
    state.cfgQuestions = [{ id: 'a', kind: 'choice' }, { id: 'b', kind: 'select' }, { id: 'c', kind: 'text' }, { id: 'd', kind: 'section' }];
    assertEqual('choice + select seulement, exclut la question courante', choiceQuestionsBefore('a').map(q => q.id), ['b']);
  });

  await group('questionSummary', () => {
    state.mainTableIdCache = 'Main';
    state.cfgQuestions = [];
    assertEqual('section -> sa description', questionSummary({ kind: 'section', description: 'intro' }), 'intro');
    assertEqual("info -> 'Repliable'", questionSummary({ kind: 'info' }), 'Repliable');
    assertEqual('select -> nombre d’options', questionSummary({ kind: 'select', choices: ['a', 'b'] }), '2 option(s)');
    assertEqual('choice en radio', questionSummary({ kind: 'choice', sourceTable: 'T', displayMode: 'radio' }), 'Depuis « T » · en radio');
    assertEqual('écrit ailleurs + condition', questionSummary({ kind: 'text', writeTable: 'Autre', condition: { questionId: 'zzz', value: 'X' } }), 'écrit dans « Autre » · si « ? » = « X »');
    assertEqual('condition à plusieurs règles combinées en OU',
      questionSummary({ kind: 'text', condition: { mode: 'any', rules: [{ questionId: 'a', value: 'X' }, { questionId: 'b', value: 'Y' }] } }),
      'si « ? » = « X » ou « ? » = « Y »');
  });

  await group('singleValueOf', () => {
    const h1 = document.createElement('div');
    h1.innerHTML = '<select><option value="">-</option><option value="7" data-label="Sept">Sept</option></select>';
    h1.querySelector('select').value = '7';
    assertEqual('select imbriqué', singleValueOf(h1), { value: '7', label: 'Sept' });

    const bare = document.createElement('select');
    bare.innerHTML = '<option value="a" data-label="Alpha">Alpha</option>';
    bare.value = 'a';
    assertEqual('select direct', singleValueOf(bare), { value: 'a', label: 'Alpha' });

    const radios = document.createElement('div');
    radios.innerHTML = '<input type="radio" name="r" value="x" data-label="X"><input type="radio" name="r" value="y" data-label="Y">';
    assertEqual('radios : rien coché', singleValueOf(radios), { value: '', label: '' });
    radios.querySelectorAll('input')[1].checked = true;
    assertEqual('radios : coché', singleValueOf(radios), { value: 'y', label: 'Y' });

    const plain = document.createElement('input');
    plain.value = 'texte';
    assertEqual('repli sur un champ simple', singleValueOf(plain), { value: 'texte', label: 'texte' });
    assertEqual('conteneur nul', singleValueOf(null), { value: '', label: '' });
  });

  await group('conditionMet : combinaisons ET/OU', () => {
    const host = mount(document.createElement('div'));
    host.innerHTML = `
      <select id="eq-a"><option value=""></option><option value="x" data-label="X">X</option><option value="y" data-label="Y">Y</option></select>
      <select id="eq-b"><option value=""></option><option value="p" data-label="P">P</option><option value="q" data-label="Q">Q</option></select>`;
    $('eq-a').value = 'x';
    $('eq-b').value = 'p';
    assert('ET : toutes les règles vraies -> true', conditionMet({ mode: 'all', rules: [{ questionId: 'a', value: 'X' }, { questionId: 'b', value: 'P' }] }));
    assert('ET : une règle fausse -> false', !conditionMet({ mode: 'all', rules: [{ questionId: 'a', value: 'X' }, { questionId: 'b', value: 'Q' }] }));
    assert('OU : une règle vraie -> true', conditionMet({ mode: 'any', rules: [{ questionId: 'a', value: 'Y' }, { questionId: 'b', value: 'P' }] }));
    assert('OU : aucune règle vraie -> false', !conditionMet({ mode: 'any', rules: [{ questionId: 'a', value: 'Y' }, { questionId: 'b', value: 'Q' }] }));
    assert('aucune condition -> toujours affiché (true)', conditionMet(null));
    assert('ancien format à un seul critère -> normalisé et évalué', conditionMet({ questionId: 'a', value: 'X' }));
    assert('ancien format, valeur différente -> false', !conditionMet({ questionId: 'a', value: 'Y' }));
  });

  await group('isAnswered', () => {
    const form = document.createElement('form');
    form.innerHTML = `
      <div class="q" data-kind="text"><input type="text" value=""></div>
      <div class="q" data-kind="text"><input type="text" value="abc"></div>
      <div class="q" data-kind="bool"><input type="checkbox"></div>
      <div class="q" data-kind="multiselect"><input type="checkbox" value="a"><input type="checkbox" value="b"></div>
      <div class="q" data-kind="select"><input type="radio" name="r" value="a"><input type="radio" name="r" value="b"></div>
      <div class="q" data-kind="section"><h2>Titre</h2></div>
      <div class="q cond-hidden" data-kind="text"><input type="text" value="x"></div>`;
    const qs = [...form.querySelectorAll('.q')];
    assertEqual('texte vide -> false', isAnswered(qs[0]), false);
    assertEqual('texte rempli -> true', isAnswered(qs[1]), true);
    assertEqual('oui/non -> toujours true', isAnswered(qs[2]), true);
    assertEqual('choix multiples, rien coché -> false', isAnswered(qs[3]), false);
    qs[3].querySelector('input').checked = true;
    assertEqual('choix multiples, un coché -> true', isAnswered(qs[3]), true);
    assertEqual('radio, rien coché -> false', isAnswered(qs[4]), false);
    assertEqual('section -> hors calcul (null)', isAnswered(qs[5]), null);
    assertEqual('masquée par condition -> hors calcul (null)', isAnswered(qs[6]), null);
  });

  await group('renderExtraQuestion : forme du HTML par type', () => {
    const host = document.createElement('div');
    host.innerHTML = renderExtraQuestion({ id: 'q1', kind: 'text', label: 'L', required: true });
    assert('texte : input type=text', !!host.querySelector('input[type=text]#eq-q1'));
    assert('obligatoire : classe req sur le label', host.querySelector('label.req') != null);

    host.innerHTML = renderExtraQuestion({ id: 'q2', kind: 'number', label: 'N' });
    assert('nombre : input type=number', !!host.querySelector('input[type=number]#eq-q2'));

    host.innerHTML = renderExtraQuestion({ id: 'q3', kind: 'date', label: 'D' });
    assert('date : input type=date', !!host.querySelector('input[type=date]#eq-q3'));

    host.innerHTML = renderExtraQuestion({ id: 'q4', kind: 'bool', label: 'B' });
    assert('oui/non : checkbox', !!host.querySelector('input[type=checkbox]#eq-q4'));

    host.innerHTML = renderExtraQuestion({ id: 'q4b', kind: 'longtext', label: 'LT' });
    assert('texte long : textarea', host.querySelector('textarea#eq-q4b') != null);

    host.innerHTML = renderExtraQuestion({ id: 'q4c', kind: 'attachments', label: 'PJ' });
    assert('pièces jointes : input file multiple', host.querySelector('input[type=file]#eq-q4c')?.multiple === true);

    host.innerHTML = renderExtraQuestion({ id: 'q5', kind: 'select', label: 'S', choices: ['A', 'B'] });
    const sel = host.querySelector('#eq-q5');
    assert('choix liste fixe (menu) : select à 3 options', sel?.tagName === 'SELECT' && sel.options.length === 3);

    host.innerHTML = renderExtraQuestion({ id: 'q6', kind: 'select', label: 'S', choices: ['A', 'B'], displayMode: 'radio' });
    assert('choix liste fixe (radio) : 2 boutons radio', host.querySelectorAll('#eq-q6 input[type=radio]').length === 2);

    host.innerHTML = renderExtraQuestion({ id: 'q7', kind: 'multiselect', label: 'M', choices: ['A', 'B', 'C'] });
    assert('choix multiples : 3 cases', host.querySelectorAll('#eq-q7 input[type=checkbox]').length === 3);

    host.innerHTML = renderExtraQuestion({ id: 'q8', kind: 'choice', label: 'C' });
    assert('choix depuis une table : conteneur en attente, pas encore de select', host.querySelector('#eq-q8') != null && host.querySelector('#eq-q8 select') == null);

    host.innerHTML = renderExtraQuestion({ id: 'q9', kind: 'section', label: 'Titre section', description: 'sous-texte' });
    assert('section : titre + pas de champ ni message d’erreur', host.querySelector('h2')?.textContent === 'Titre section' && host.querySelector('.err-msg') == null);

    host.innerHTML = renderExtraQuestion({ id: 'q10', kind: 'info', label: 'Aide', description: 'contenu' });
    assert('bloc d’info : <details><summary>, pas de champ', host.querySelector('details.q-info summary')?.textContent === 'Aide' && host.querySelector('.err-msg') == null);
  });

  await group('renderCardBody : setKind affiche les bons blocs par type', async () => {
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = { docApi: { listTables: async () => ['Main', 'Autre'], fetchTable: async (t) => t === '_grist_Tables' ? { id: [1, 2], tableId: ['Main', 'Autre'] } : { id: [10], colA: ['x'] } } };
    const body = mount(document.createElement('div'));
    await renderCardBody('__new__', body);
    for (const k of KINDS.map(x => x.id)) {
      body.querySelector(`[data-kind="${k}"]`).click();
      const hidden = (sel) => body.querySelector(sel).classList.contains('hidden');
      assertEqual(`${k} : bloc "table source" (choice seul)`, hidden('.qf-choice-fields'), k !== 'choice', k);
      assertEqual(`${k} : bloc "options fixes" (select/multiselect)`, hidden('.qf-fixed-options'), !(k === 'select' || k === 'multiselect'), k);
      assertEqual(`${k} : bloc "affichage menu/radio" (select/choice)`, hidden('.qf-display-mode'), !(k === 'select' || k === 'choice'), k);
      assertEqual(`${k} : bloc "destination" (pas choice/section/info)`, hidden('.qf-text-fields'), (k === 'choice' || k === 'section' || k === 'info'), k);
      assertEqual(`${k} : "obligatoire" (pas section/info)`, hidden('.qf-required-row'), (k === 'section' || k === 'info'), k);
      assertEqual(`${k} : description courte (pas info)`, hidden('.qf-desc'), k === 'info', k);
      assertEqual(`${k} : description longue (info seul)`, hidden('.qf-desc-long'), k !== 'info', k);
    }
  });

  await group('saveQuestionFromCard : réponses simples, colonne par défaut', async () => {
    for (const k of ['text', 'longtext', 'number', 'date', 'bool', 'select', 'multiselect', 'attachments']) {
      state.cfgQuestions = [];
      state.mainTableIdCache = 'Main';
      state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
      window.grist = {
        docApi: {
          listTables: async () => ['Main', 'Autre'],
          fetchTable: async (t) => t === '_grist_Tables' ? { id: [1, 2], tableId: ['Main', 'Autre'] } : { id: [10], colA: ['x'] },
          applyUserActions: async () => ({}),
          setOptions: async () => {},
        },
      };
      state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
      const body = mount(document.createElement('div'));
      await renderCardBody('__new__', body);
      body.querySelector(`[data-kind="${k}"]`).click();
      body.querySelector('.qf-label').value = `Question ${k}`;
      if (k === 'select' || k === 'multiselect') body.querySelector('.qf-choices').value = 'Un\nDeux';
      selectCombo(body.querySelector('[data-combo="writeCol"]'), 'colA');
      body.querySelector('.qf-save').click();
      await tick();
      assertEqual(`${k} : une question créée`, state.cfgQuestions.length, 1, JSON.stringify(state.cfgQuestions));
      assertEqual(`${k} : bon type conservé`, state.cfgQuestions[0]?.kind, k);
      assertEqual(`${k} : colonne de destination`, state.cfgQuestions[0]?.writeCol, 'colA');
      if (k === 'select' || k === 'multiselect') assertEqual(`${k} : options`, state.cfgQuestions[0]?.choices, ['Un', 'Deux']);
    }
  });

  await group('saveQuestionFromCard : affichage radio persisté', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = { docApi: { listTables: async () => ['Main'], fetchTable: async (t) => t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : { id: [10], colA: ['x'] }, applyUserActions: async () => ({}), setOptions: async () => {} } };
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    await renderCardBody('__new__', body);
    body.querySelector('[data-kind="select"]').click();
    body.querySelector('.qf-label').value = 'Q';
    body.querySelector('.qf-choices').value = 'Un\nDeux';
    body.querySelector('[data-display="radio"]').click();
    selectCombo(body.querySelector('[data-combo="writeCol"]'), 'colA');
    body.querySelector('.qf-save').click();
    await tick();
    assertEqual('displayMode=radio enregistré', state.cfgQuestions[0]?.displayMode, 'radio');
  });

  await group('renderCardBody : condition, ajouter/retirer une règle fait apparaître/disparaître le choix ET/OU', async () => {
    state.cfgQuestions = [{ id: 'src1', kind: 'select', label: 'Statut', choices: ['Ouvert', 'Fermé'] }];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = { docApi: { listTables: async () => ['Main'], fetchTable: async (t) => t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : { id: [10], colA: ['x'] } } };
    const body = mount(document.createElement('div'));
    await renderCardBody('__new__', body);
    body.querySelector('[data-reveal="condition"]').click();
    assertEqual('une seule ligne de condition au départ', body.querySelectorAll('.qf-cond-rule').length, 1);
    assert('bascule ET/OU masquée avec une seule règle', body.querySelector('.qf-cond-mode').classList.contains('hidden'));
    assert('pas de bouton "retirer" sur la seule ligne', body.querySelector('.qf-cond-remove') == null);
    body.querySelector('.qf-cond-add').click();
    await tick();
    assertEqual('deux lignes après ajout', body.querySelectorAll('.qf-cond-rule').length, 2);
    assert('bascule ET/OU visible à partir de 2 règles', !body.querySelector('.qf-cond-mode').classList.contains('hidden'));
    assertEqual('un bouton "retirer" par ligne', body.querySelectorAll('.qf-cond-remove').length, 2);
    body.querySelector('.qf-cond-remove[data-idx="1"]').click();
    await tick();
    assertEqual('retour à une ligne après suppression', body.querySelectorAll('.qf-cond-rule').length, 1);
    assert('bascule ET/OU de nouveau masquée', body.querySelector('.qf-cond-mode').classList.contains('hidden'));
  });

  await group('renderCardBody / saveQuestionFromCard : condition à plusieurs règles, chargement puis changement ET/OU', async () => {
    state.cfgQuestions = [
      { id: 'src1', kind: 'select', label: 'Statut', choices: ['Ouvert', 'Fermé'] },
      { id: 'src2', kind: 'select', label: 'Priorité', choices: ['Haute', 'Basse'] },
      {
        id: 'q1', kind: 'text', label: 'Commentaire', writeTable: 'Main', writeCol: 'colA', required: false,
        condition: { mode: 'all', rules: [{ questionId: 'src1', op: 'equals', value: 'Ouvert' }, { questionId: 'src2', op: 'equals', value: 'Haute' }] },
      },
    ];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = { docApi: { listTables: async () => ['Main'], fetchTable: async (t) => t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : { id: [10], colA: ['x'] }, applyUserActions: async () => ({}), setOptions: async () => {} } };
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    await renderCardBody('q1', body);
    assertEqual('2 lignes de condition affichées au chargement', body.querySelectorAll('.qf-cond-rule').length, 2);
    assert('bascule ET/OU visible', !body.querySelector('.qf-cond-mode').classList.contains('hidden'));
    assert('ET actif au chargement (mode enregistré)', body.querySelector('.qf-cond-mode-btn[data-mode="all"]').classList.contains('active'));
    body.querySelector('.qf-cond-mode-btn[data-mode="any"]').click();
    body.querySelector('.qf-save').click();
    await tick();
    assertEqual('condition ré-enregistrée en OU, mêmes règles', state.cfgQuestions.find(q => q.id === 'q1')?.condition,
      { mode: 'any', rules: [{ questionId: 'src1', op: 'equals', value: 'Ouvert' }, { questionId: 'src2', op: 'equals', value: 'Haute' }] });
  });

  await group('saveQuestionFromCard : choix depuis une table', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    const sectionFields = { id: [], parentId: [], colRef: [], widgetOptions: [] };
    window.grist = {
      docApi: {
        listTables: async () => ['Main', 'Autre'],
        fetchTable: async (t) => {
          if (t === '_grist_Tables') return { id: [1, 2], tableId: ['Main', 'Autre'] };
          if (t === '_grist_Tables_column') return { id: [], colId: [], parentId: [], type: [], visibleCol: [] };
          if (t === '_grist_Views_section_field') return sectionFields;
          if (t === 'Autre') return { id: [1, 2], nom: ['Alpha', 'Beta'] };
          return {};
        },
        applyUserActions: async () => ({}),
        setOptions: async () => {},
      },
    };
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    await renderCardBody('__new__', body);
    body.querySelector('[data-kind="choice"]').click();
    body.querySelector('.qf-label').value = 'Departement';
    selectCombo(body.querySelector('[data-combo="srcTable"]'), 'Autre');
    await tick();
    selectCombo(body.querySelector('[data-combo="srcCol"]'), 'nom');
    body.querySelector('.qf-save').click();
    await tick();
    assertEqual('une question créée', state.cfgQuestions.length, 1, JSON.stringify(state.cfgQuestions));
    assertEqual('sourceTable', state.cfgQuestions[0]?.sourceTable, 'Autre');
    assertEqual('sourceCol', state.cfgQuestions[0]?.sourceCol, 'nom');
    assert('writeCol calculé (référence cachée)', typeof state.cfgQuestions[0]?.writeCol === 'string' && state.cfgQuestions[0].writeCol.startsWith('FormPlus_src_'));
  });

  await group('saveQuestionFromCard : section et bloc d’info', async () => {
    for (const k of ['section', 'info']) {
      state.cfgQuestions = [];
      state.mainTableIdCache = 'Main';
      state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
      window.grist = { docApi: { listTables: async () => ['Main'], fetchTable: async () => ({}), applyUserActions: async () => ({}), setOptions: async () => {} } };
      state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
      const body = mount(document.createElement('div'));
      await renderCardBody('__new__', body);
      body.querySelector(`[data-kind="${k}"]`).click();
      body.querySelector('.qf-label').value = `Titre ${k}`;
      (k === 'info' ? body.querySelector('.qf-desc-long') : body.querySelector('.qf-desc')).value = 'un contenu';
      body.querySelector('.qf-save').click();
      await tick();
      assertEqual(`${k} : une entrée créée sans écriture de colonne`, state.cfgQuestions.length === 1 && !state.cfgQuestions[0].writeTable, true, JSON.stringify(state.cfgQuestions));
      assertEqual(`${k} : description reprise`, state.cfgQuestions[0]?.description, 'un contenu');
    }
  });

  await group('importNativeFields : correspondance des types natifs', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Reponses';
    state.currentLink = { api: 'https://fake/api/s/KEY', vsId: 1 };
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    const sectionFields = { id: [100, 101, 102, 103, 104, 105, 106, 107, 108], parentId: [1, 1, 1, 1, 1, 1, 1, 1, 1], widgetOptions: ['{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}'] };
    window.grist = {
      docApi: {
        fetchTable: async (t) => {
          if (t === '_grist_Tables_column') return { id: [], colId: [], parentId: [], type: [], visibleCol: [] };
          if (t === '_grist_Tables') return { id: [1], tableId: ['Reponses'] };
          if (t === '_grist_Views_section_field') return sectionFields;
          return {};
        },
        applyUserActions: async () => ({}),
      },
    };
    window.fetch = async () => ({
      ok: true, json: async () => ({
        formFieldsById: {
          100: { colId: 'a', type: 'Text', question: 'Q1', options: {} },
          101: { colId: 'b', type: 'Numeric', question: 'Q2', options: {} },
          102: { colId: 'c', type: 'Date', question: 'Q3', options: {} },
          103: { colId: 'd', type: 'Bool', question: 'Q4', options: {} },
          104: { colId: 'e', type: 'Choice', question: 'Q5', options: { choices: ['X', 'Y'] } },
          105: { colId: 'f', type: 'ChoiceList', question: 'Q6', options: { choices: ['X', 'Y'] } },
          106: { colId: 'g', type: 'Attachments', question: 'Q7', options: {} },
          107: { colId: 'h', type: 'DateTime', question: 'Q8', options: {} },
          108: { colId: 'i', type: 'Text', question: 'Q9', options: { formTextFormat: 'multiline' } },
        },
      }),
    });
    await importNativeFields();
    await tick();
    const kindByLabel = Object.fromEntries(state.cfgQuestions.map(q => [q.label, q.kind]));
    assertEqual('Text -> text', kindByLabel.Q1, 'text');
    assertEqual('Numeric -> number', kindByLabel.Q2, 'number');
    assertEqual('Date -> date', kindByLabel.Q3, 'date');
    assertEqual('Bool -> bool', kindByLabel.Q4, 'bool');
    assertEqual('Choice -> select', kindByLabel.Q5, 'select');
    assertEqual('ChoiceList -> multiselect', kindByLabel.Q6, 'multiselect');
    assertEqual('Attachments -> attachments', kindByLabel.Q7, 'attachments');
    assertEqual('Text multiligne -> longtext', kindByLabel.Q9, 'longtext');
    assertEqual('seul DateTime ignoré (8 importés sur 9)', state.cfgQuestions.length, 8);
    assertEqual('colonne existante reprise telle quelle pour Attachments', state.cfgQuestions.find(q => q.label === 'Q7')?.writeCol, 'g');
    assertEqual('options reprises pour Choice', state.cfgQuestions.find(q => q.label === 'Q5')?.choices, ['X', 'Y']);
    assert('importedFrom renseigné', state.cfgQuestions.every(q => !!q.importedFrom));
  });

  await group('resetQuestions : démasque uniquement les champs importés', async () => {
    const calls = [];
    window.grist = {
      docApi: {
        fetchTable: async (t) => t === '_grist_Views_section_field'
          ? { id: [10, 11], parentId: [1, 1], colRef: [100, 101], widgetOptions: ['{"formIsHidden":true}', '{"formIsHidden":true,"formRequired":true}'] }
          : (t === '_grist_Views_section' ? { id: [1], parentId: [5], parentKey: ['custom'], tableRef: [1], options: ['{}'] } : {}),
        applyUserActions: async (a) => { calls.push(a); return {}; },
        setOptions: async () => {},
      },
    };
    const origConfirm = window.confirm;
    window.confirm = () => true;
    state.cfgQuestions = [{ id: 'q1', kind: 'text', label: 'Importée', importedFrom: '10' }, { id: 'q2', kind: 'number', label: 'Manuelle' }];
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1 };
    await resetQuestions();
    window.confirm = origConfirm;
    assertEqual('liste vidée', state.cfgQuestions, []);
    const unhideActions = calls.filter(a => a[0][0] === 'UpdateRecord' && a[0][1] === '_grist_Views_section_field');
    assertEqual('un seul champ démasqué (le champ importé, pas le manuel)', unhideActions.length, 1);
    assertEqual('cible bien la ligne 10 (importedFrom), pas la 11', unhideActions[0][0][2], 10);
    assertEqual('la configuration est aussi sauvegardée (UpdateRecord section)', calls.some(a => a[0][1] === '_grist_Views_section'), true);
  });

  await group('createEmptyForm : réutilise une table existante', async () => {
    const calls = [];
    window.grist = {
      docApi: {
        fetchTable: async (t) => t === '_grist_Tables' ? { tableId: ['Departements'], id: [1] } : {},
        applyUserActions: async (a) => { calls.push(a); return {}; },
      },
    };
    const el = mount(document.createElement('div'));
    el.innerHTML = '<input id="t-scratchTable"><p id="t-scratchMsg"></p>';
    // createEmptyForm lit les vrais #scratchTable/#scratch-msg de la page (pas de la sandbox) :
    // on les renseigne directement, ils existent déjà de façon statique dans le document.
    $('scratchTable').value = 'Departements';
    Object.defineProperty(document, 'referrer', { value: 'https://grist.example.com/o/team/docs/abc/p/7', configurable: true });
    await createEmptyForm();
    assertEqual('une seule action, CreateViewSection direct (pas de AddTable)', calls.length, 1);
    assertEqual('CreateViewSection sur la bonne table/page', calls[0][0], ['CreateViewSection', 1, 7, 'form', null, 'Departements']);
  });

  await group('createEmptyForm : crée une nouvelle table', async () => {
    const calls = [];
    let tablesState = { tableId: ['Departements'], id: [1] };
    window.grist = {
      docApi: {
        fetchTable: async (t) => t === '_grist_Tables' ? { ...tablesState } : {},
        applyUserActions: async (a) => {
          calls.push(a);
          if (a[0][0] === 'AddTable') tablesState = { tableId: [...tablesState.tableId, 'Reponses'], id: [...tablesState.id, 2] };
          return {};
        },
      },
    };
    $('scratchTable').value = 'Réponses';
    Object.defineProperty(document, 'referrer', { value: 'https://grist.example.com/o/team/docs/abc/p/7', configurable: true });
    await createEmptyForm();
    assertEqual('deux actions : AddTable puis CreateViewSection', calls.map(c => c[0][0]), ['AddTable', 'CreateViewSection']);
    assertEqual('CreateViewSection cible la table nouvellement créée (ref 2)', calls[1][0][1], 2);
  });

  await group('createEmptyForm : page introuvable -> message clair, aucune action', async () => {
    const calls = [];
    window.grist = { docApi: { fetchTable: async () => ({ tableId: [], id: [] }), applyUserActions: async (a) => { calls.push(a); return {}; } } };
    $('scratchTable').value = 'Table';
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
    await createEmptyForm();
    assertEqual('aucune action déclenchée', calls.length, 0);
    assert('message d’erreur affiché', $('scratch-msg').innerHTML.includes('err'));
  });

  await group('createEmptyForm : référent illisible mais widget retrouvé via les métadonnées -> page correcte', async () => {
    const calls = [];
    const myFile = location.pathname.split('/').pop();
    window.grist = {
      docApi: {
        fetchTable: async (t) => {
          if (t === '_grist_Tables') return { tableId: ['Departements'], id: [1] };
          if (t === '_grist_Views_section') return {
            id: [9], parentId: [7], parentKey: ['custom'],
            options: [JSON.stringify({ customView: JSON.stringify({ url: `https://cdn.example.com/${myFile}` }) })],
          };
          return {};
        },
        applyUserActions: async (a) => { calls.push(a); return {}; },
      },
    };
    $('scratchTable').value = 'Departements';
    // Référent vide (ex. embed=true, ou navigateur qui le bloque) : myPageFromReferrer() échoue,
    // le repli doit retrouver la page (7) via l'unique section personnalisée qui pointe vers ce
    // widget dans les métadonnées du document, sans jamais afficher le message d'erreur.
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
    await createEmptyForm();
    assertEqual('CreateViewSection déclenché malgré le référent illisible', calls.length, 1);
    assertEqual('page retrouvée via les métadonnées (7), pas via le référent', calls[0][0], ['CreateViewSection', 1, 7, 'form', null, 'Departements']);
    assert('aucun message d’erreur', !$('scratch-msg').innerHTML.includes('err'));
  });

  await group('hostOrgFromReferrer / findExistingShareKey', async () => {
    Object.defineProperty(document, 'referrer', { value: 'https://grist.example.com/o/team/docs/abc/p/7', configurable: true });
    assertEqual('hostOrgFromReferrer', hostOrgFromReferrer(), { host: 'https://grist.example.com', org: 'team' });

    window.grist = {
      docApi: {
        fetchTable: async (t) => {
          if (t === '_grist_Pages') return { id: [1], viewRef: [7], shareRef: [9] };
          if (t === '_grist_Shares') return { id: [9], linkId: ['SECRETKEY'] };
          return {};
        },
      },
    };
    assertEqual('clé retrouvée pour une page publiée', await findExistingShareKey(7), 'SECRETKEY');
    assertEqual('page sans partage -> null', await findExistingShareKey(999), null);
  });

  await group('populateFormPicker : liste et filtre les formulaires natifs', async () => {
    window.grist = {
      docApi: {
        fetchTable: async (t) => {
          if (t === '_grist_Views_section') return {
            id: [1, 2, 3], parentKey: ['form', 'form', 'form'], tableRef: [10, 20, 30], parentId: [5, 6, 7],
            shareOptions: ['{"publish":true,"form":true}', '{}', '{"publish":true,"form":true}'],
          };
          if (t === '_grist_Tables') return { id: [10, 20, 30], tableId: ['Reponses', 'Brouillon', '_grist_Interne'] };
          return {};
        },
      },
    };
    await populateFormPicker();
    assertEqual('table technique _grist_* exclue de la liste', state.formPickerItems.map(it => it.tableId), ['Reponses', 'Brouillon']);
    assertEqual('statut publié détecté', state.formPickerItems.find(it => it.tableId === 'Reponses')?.published, true);
    assertEqual('statut non publié détecté', state.formPickerItems.find(it => it.tableId === 'Brouillon')?.published, false);
    assertEqual('options du <select> (une de plus pour "choisir")', $('formPicker').options.length, 3);
  });

  await group('populateFormPicker : exclut les copies créées par FormPlus (formplusDuplicate)', async () => {
    window.grist = {
      docApi: {
        fetchTable: async (t) => {
          if (t === '_grist_Views_section') return {
            id: [1, 2], parentKey: ['form', 'form'], tableRef: [10, 10], parentId: [5, 5],
            shareOptions: ['{"publish":true,"form":true}', '{"publish":true,"form":true}'],
            options: ['{}', '{"formplusDuplicate":true,"formplusSource":1}'],
          };
          if (t === '_grist_Tables') return { id: [10], tableId: ['Reponses'] };
          return {};
        },
      },
    };
    await populateFormPicker();
    assertEqual('seul le vrai formulaire (1) reste proposé, pas sa copie (2)', state.formPickerItems.map(it => it.vsId), [1]);
  });

  await group('sélection dans formPicker : formulaire non publié -> consigne, pas de génération', async () => {
    state.formPickerItems = [{ vsId: 1, viewRef: 5, tableId: 'Brouillon', published: false }];
    $('formPicker').innerHTML = '<option value="1">Brouillon (non publié)</option>';
    $('formPicker').value = '1';
    $('link').value = '';
    $('formPicker').dispatchEvent(new Event('change'));
    await tick();
    assert('message explicite : publier puis copier le lien', $('formPicker-msg').innerHTML.includes('Publier'));
    assertEqual('le champ lien manuel reste vide (aucune tentative)', $('link').value, '');
  });

  await group('sélection dans formPicker : formulaire publié, clé retrouvée -> adresse générée', async () => {
    state.formPickerItems = [{ vsId: 12, viewRef: 7, tableId: 'Reponses', published: true }];
    $('formPicker').innerHTML = '<option value="12">Reponses</option>';
    $('formPicker').value = '12';
    $('link').value = '';
    Object.defineProperty(document, 'referrer', { value: 'https://grist.example.com/o/team/docs/abc/p/7', configurable: true });
    window.grist = {
      docApi: {
        listTables: async () => ['Reponses'],
        fetchTable: async (t) => {
          if (t === '_grist_Pages') return { id: [1], viewRef: [7], shareRef: [9] };
          if (t === '_grist_Shares') return { id: [9], linkId: ['SECRETKEY'] };
          if (t === '_grist_Views_section') return { id: [12], parentId: [7], tableRef: [10] };
          return {};
        },
        setOptions: async () => {},
      },
    };
    $('formPicker').dispatchEvent(new Event('change'));
    await tick(); await tick(); await tick(); // generate() enchaîne plusieurs opérations asynchrones
    assertEqual('lien reconstruit automatiquement', $('link').value, 'https://grist.example.com/o/team/forms/SECRETKEY/12');
    assert('message de succès', $('formPicker-msg').innerHTML.includes('ok'));
  });

  await group('generate() : formulaire natif existant → duplication automatique, original jamais modifié', async () => {
    state.options = {};
    state.cfgQuestions = [];
    let nextSectionId = 100;
    const sectionsState = {
      id: [12], parentId: [7], parentKey: ['form'], tableRef: [10],
      shareOptions: ['{"publish":true,"form":true}'], options: ['{}'],
    };
    const fieldsState = {
      // parentPos volontairement pas dans l'ordre de création, pour vérifier que la copie
      // respecte l'ORDRE (parentPos), pas l'ordre des lignes retournées par l'API.
      id: [1000, 1001], parentId: [12, 12], colRef: [500, 501],
      widgetOptions: ['{}', '{"formIsHidden":true}'], parentPos: [2, 1],
    };
    // Colonnes de la table Reponses (tableRef 10) : CreateViewSection peuple automatiquement la
    // nouvelle section avec un champ par colonne (comportement réel de Grist, voir la mémoire
    // formplus-createviewsection-autofields) ; duplicateFormSection doit les retirer avant de
    // recopier les champs du formulaire source, sinon chaque colonne se retrouve en double.
    const tableColumns = { 10: [500, 501] };
    let nextFieldId = 2000;
    const removeFieldRow = (id) => {
      const idx = fieldsState.id.indexOf(id);
      if (idx < 0) return;
      for (const key of ['id', 'parentId', 'colRef', 'widgetOptions', 'parentPos']) {
        fieldsState[key] = fieldsState[key].filter((_, i) => i !== idx);
      }
    };
    const calls = [];
    window.grist = {
      docApi: {
        listTables: async () => ['Reponses'],
        fetchTable: async (t) => {
          if (t === '_grist_Pages') return { id: [1], viewRef: [7], shareRef: [9] };
          if (t === '_grist_Shares') return { id: [9], linkId: ['SECRETKEY'] };
          if (t === '_grist_Views_section') return { ...sectionsState };
          if (t === '_grist_Views_section_field') return { ...fieldsState };
          if (t === '_grist_Tables') return { id: [10], tableId: ['Reponses'] };
          return {};
        },
        applyUserActions: async (actions) => {
          calls.push(actions);
          for (const a of actions) {
            if (a[0] === 'CreateViewSection') {
              const newId = nextSectionId++;
              sectionsState.id = [...sectionsState.id, newId];
              sectionsState.parentId = [...sectionsState.parentId, a[2]];
              sectionsState.parentKey = [...sectionsState.parentKey, 'form'];
              sectionsState.tableRef = [...sectionsState.tableRef, a[1]];
              sectionsState.shareOptions = [...sectionsState.shareOptions, '{}'];
              sectionsState.options = [...sectionsState.options, '{}'];
              for (const colRef of tableColumns[a[1]] || []) {
                fieldsState.id = [...fieldsState.id, nextFieldId++];
                fieldsState.parentId = [...fieldsState.parentId, newId];
                fieldsState.colRef = [...fieldsState.colRef, colRef];
                fieldsState.widgetOptions = [...fieldsState.widgetOptions, ''];
                fieldsState.parentPos = [...fieldsState.parentPos, fieldsState.parentPos.length];
              }
            } else if (a[0] === 'AddRecord' && a[1] === '_grist_Views_section_field') {
              fieldsState.id = [...fieldsState.id, nextFieldId++];
              fieldsState.parentId = [...fieldsState.parentId, a[3].parentId];
              fieldsState.colRef = [...fieldsState.colRef, a[3].colRef];
              fieldsState.widgetOptions = [...fieldsState.widgetOptions, a[3].widgetOptions];
              fieldsState.parentPos = [...fieldsState.parentPos, fieldsState.parentPos.length];
            } else if (a[0] === 'RemoveRecord' && a[1] === '_grist_Views_section_field') {
              removeFieldRow(a[2]);
            } else if (a[0] === 'UpdateRecord' && a[1] === '_grist_Views_section') {
              const idx = sectionsState.id.indexOf(a[2]);
              if (idx >= 0) {
                if (a[3].shareOptions !== undefined) { const arr = [...sectionsState.shareOptions]; arr[idx] = a[3].shareOptions; sectionsState.shareOptions = arr; }
                if (a[3].options !== undefined) { const arr = [...sectionsState.options]; arr[idx] = a[3].options; sectionsState.options = arr; }
              }
            }
          }
          return { retValues: actions.map(() => null) };
        },
        setOptions: async () => {},
      },
    };
    Object.defineProperty(document, 'referrer', { value: 'https://grist.example.com/o/team/docs/abc/p/7', configurable: true });
    $('link').value = 'https://grist.example.com/o/team/forms/SECRETKEY/12';
    await generate();
    await tick();

    const dupVsId = state.currentFormSection?.id;
    assert('une copie est créée (id différent du formulaire source 12)', dupVsId != null && dupVsId !== 12);
    assertEqual('sourceVsId enregistré', state.options.sourceVsId, 12);
    const allActions = calls.flatMap(a => a);
    assertEqual('le formulaire source (12) ne reçoit aucune écriture', allActions.some(a => a[0] === 'UpdateRecord' && a[1] === '_grist_Views_section' && a[2] === 12), false);
    const removeFieldCalls = allActions.filter(a => a[0] === 'RemoveRecord' && a[1] === '_grist_Views_section_field');
    assertEqual('les 2 champs auto-créés par CreateViewSection sont retirés avant la copie', removeFieldCalls.length, 2);
    const addFieldCalls = allActions.filter(a => a[0] === 'AddRecord' && a[1] === '_grist_Views_section_field');
    assertEqual('2 champs dupliqués', addFieldCalls.length, 2);
    assertEqual('ordre respecté (parentPos 1 puis 2, pas l’ordre des lignes source)', addFieldCalls.map(a => a[3].colRef), [501, 500]);
    assertEqual('widgetOptions repris tel quel', addFieldCalls.map(a => a[3].widgetOptions), ['{"formIsHidden":true}', '{}']);
    const finalFields = [];
    for (let i = 0; i < fieldsState.id.length; i++) if (fieldsState.parentId[i] === dupVsId) finalFields.push({ colRef: fieldsState.colRef[i], parentPos: fieldsState.parentPos[i] });
    finalFields.sort((a, b) => a.parentPos - b.parentPos);
    assertEqual('exactement 2 champs sur la copie au final (pas de doublon)', finalFields.map(f => f.colRef), [501, 500]);
    const dupIdx = sectionsState.id.indexOf(dupVsId);
    assertEqual('la copie est marquée formplusDuplicate', JSON.parse(sectionsState.options[dupIdx]).formplusDuplicate, true);
    assertEqual('la copie référence sa source', JSON.parse(sectionsState.options[dupIdx]).formplusSource, 12);
    assertEqual('la copie est publiée sous la clé existante (pas de republication manuelle)', JSON.parse(sectionsState.shareOptions[dupIdx]), { publish: true, form: true });

    // Recoller EXACTEMENT le même lien : on garde la copie déjà créée, pas de duplication en double.
    const callsBefore = calls.length;
    await generate();
    await tick();
    assertEqual('même copie réutilisée au second collage', state.currentFormSection?.id, dupVsId);
    assertEqual('aucune nouvelle section créée', calls.slice(callsBefore).flatMap(a => a).some(a => a[0] === 'CreateViewSection'), false);
  });

  await group('onSubmit : construit les bons champs par type et par table', async () => {
    const form = { formTableId: 'Reponses', formFieldsById: {} };
    const link = { api: 'https://fake/api/s/KEY' };
    const extraQuestions = [
      { id: 'q1', kind: 'text', label: 'Nom', required: true, writeTable: 'Reponses', writeCol: 'Nom' },
      { id: 'q2', kind: 'number', label: 'Age', writeTable: 'Reponses', writeCol: 'Age' },
      { id: 'q3', kind: 'date', label: 'Naissance', writeTable: 'Reponses', writeCol: 'Naissance' },
      { id: 'q4', kind: 'bool', label: 'OK', writeTable: 'Reponses', writeCol: 'OK' },
      { id: 'q5', kind: 'select', label: 'Ville', choices: ['Paris', 'Lyon'], writeTable: 'Reponses', writeCol: 'Ville' },
      { id: 'q6', kind: 'select', label: 'VilleRadio', choices: ['Paris', 'Lyon'], displayMode: 'radio', writeTable: 'Reponses', writeCol: 'VilleRadio' },
      { id: 'q7', kind: 'multiselect', label: 'Langues', choices: ['Fr', 'En'], writeTable: 'Reponses', writeCol: 'Langues' },
      { id: 'q8', kind: 'choice', label: 'Dept', writeTable: 'Reponses', writeCol: 'Dept', displayMode: 'radio' },
      { id: 'q9', kind: 'section', label: 'Section' },
      { id: 'q10', kind: 'info', label: 'Info' },
      { id: 'q11', kind: 'text', label: 'Commentaire', writeTable: 'Autre', writeCol: 'Texte' },
      { id: 'q12', kind: 'longtext', label: 'Remarques', writeTable: 'Reponses', writeCol: 'Remarques' },
      { id: 'q13', kind: 'attachments', label: 'Justificatif', writeTable: 'Pieces', writeCol: 'PJ' },
    ];
    const formEl = mount(document.createElement('form'));
    formEl.innerHTML = `<input type="text" name="_website" value="" style="display:none">${extraQuestions.map(renderExtraQuestion).join('')}<span id="fill-status"></span><button type="submit"></button>`;
    formEl.querySelector('#eq-q1').value = 'Alice';
    formEl.querySelector('#eq-q2').value = '30';
    formEl.querySelector('#eq-q3').value = '2026-01-02';
    formEl.querySelector('#eq-q4').checked = true;
    formEl.querySelector('#eq-q5').value = 'Lyon';
    formEl.querySelectorAll('#eq-q6 input[type=radio]')[0].checked = true; // Paris
    formEl.querySelectorAll('#eq-q7 input[type=checkbox]')[1].checked = true; // En
    formEl.querySelector('#eq-q11').value = 'Bonjour';
    formEl.querySelector('#eq-q8').innerHTML = '<label class="opt"><input type="radio" name="eq-q8" value="5" data-label="Rhône"></label>';
    formEl.querySelector('#eq-q8 input').checked = true;
    formEl.querySelector('#eq-q12').value = 'Sur plusieurs lignes';
    const dt = new DataTransfer();
    dt.items.add(new File(['contenu'], 'justif.pdf', { type: 'application/pdf' }));
    formEl.querySelector('#eq-q13').files = dt.files;

    const extraTableWrites = [];
    window.grist = { docApi: { applyUserActions: async (a) => { extraTableWrites.push(a); return {}; } } };
    let capturedBody = null;
    window.fetch = async (url, opts) => {
      if (String(url).includes('/tables/Reponses/records')) { capturedBody = JSON.parse(opts.body); return { ok: true, json: async () => ({ records: [{ id: 42 }] }) }; }
      if (String(url).includes('/attachments')) { return { ok: true, json: async () => ([99]) }; }
      return { ok: true, json: async () => ({}) };
    };
    state.options = {};
    await onSubmit({ preventDefault() {}, target: formEl }, form, link, extraQuestions);
    await tick();
    const fields = capturedBody?.records?.[0]?.fields || {};
    assertEqual('texte', fields.Nom, 'Alice');
    assertEqual('nombre converti', fields.Age, 30);
    assertEqual('date : chaîne ISO conservée telle quelle', fields.Naissance, '2026-01-02');
    assertEqual('oui/non', fields.OK, true);
    assertEqual('choix liste fixe (menu déroulant)', fields.Ville, 'Lyon');
    assertEqual('choix liste fixe (radio)', fields.VilleRadio, 'Paris');
    assertEqual('choix multiples', fields.Langues, ['L', 'En']);
    assertEqual('choix depuis une table (radio, numérique)', fields.Dept, 5);
    assertEqual('texte long', fields.Remarques, 'Sur plusieurs lignes');
    assert('titre de section absent des champs envoyés', !('Section' in fields));
    assert('bloc d’info absent des champs envoyés', !('Info' in fields));
    assert('pièces jointes absentes des champs de la table principale (envoyées à part)', !('Justificatif' in fields) && !('PJ' in fields));
    await tick();
    assertEqual('écriture séparée vers la table Autre', extraTableWrites[0]?.[0], ['AddRecord', 'Autre', null, { Texte: 'Bonjour' }]);
    assertEqual('pièce jointe : upload puis écriture séparée vers la table Pieces', extraTableWrites[1]?.[0], ['AddRecord', 'Pieces', null, { PJ: ['L', 99] }]);
  });

  await group('onSubmit : un échec sur une table secondaire ne s’affiche jamais comme un succès complet', async () => {
    const form = { formTableId: 'Reponses', formFieldsById: {} };
    const link = { api: 'https://fake/api/s/KEY' };
    const extraQuestions = [
      { id: 'q1', kind: 'text', label: 'Commentaire', writeTable: 'Autre', writeCol: 'Texte' },
    ];
    const formEl = mount(document.createElement('form'));
    formEl.innerHTML = `<input type="text" name="_website" value="" style="display:none">${extraQuestions.map(renderExtraQuestion).join('')}<span id="fill-status"></span><button type="submit"></button>`;
    formEl.querySelector('#eq-q1').value = 'Bonjour';

    window.grist = { docApi: { applyUserActions: async () => { throw new Error('droit retiré'); } } };
    window.fetch = async (url) => {
      if (String(url).includes('/tables/Reponses/records')) return { ok: true, json: async () => ({ records: [{ id: 99 }] }) };
      return { ok: true, json: async () => ({}) };
    };
    state.options = { redirectUrl: 'https://exemple.example/merci' }; // ne doit pas s'appliquer sur un échec partiel
    await onSubmit({ preventDefault() {}, target: formEl }, form, link, extraQuestions);
    await tick(); await tick();
    const cardHtml = $('fill-card').innerHTML;
    assert('la réponse principale reste annoncée (elle a bien été enregistrée)', cardHtml.includes('99'));
    assert('un avertissement visible nomme la table en échec', cardHtml.includes('Autre') && /err/.test(cardHtml));
    assert('pas de redirection automatique sur un envoi partiel', !cardHtml.includes('exemple.example'));
  });

  // Restauration de l'état global et des stubs, pour ne rien laisser fuiter si la page reste ouverte.
  state.options = savedState.options; state.cfgQuestions = savedState.cfgQuestions; state.currentLink = savedState.currentLink;
  state.currentFormSection = savedState.currentFormSection; state.mainTableIdCache = savedState.mainTableIdCache; state.expandedId = savedState.expandedId;
  window.grist = savedGrist; window.fetch = savedFetch;
  sandbox.innerHTML = '';

  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  $('test-summary').innerHTML = `<p class="${fail ? 'err' : 'ok'}" style="font-weight:700;font-size:1.1rem">${pass} / ${results.length} tests réussis${fail ? `, ${fail} échec(s)` : ''}</p>`;
  $('test-log').textContent = results.map(r => `${r.pass ? '✓' : '✗'} ${r.name}${!r.pass && r.detail ? '\n    ' + r.detail : ''}`).join('\n');
  console.log(`[FormPlus tests] ${pass}/${results.length} OK`, results.filter(r => !r.pass));
}
