import { $, show } from './dom.js';
import { parseFormLink, buildPublicUrl, parseCustomView, migrateLegacy, normalizeCondition } from './links.js';
import { hexToRgb, softenColor, contrastText, applyBranding } from './theme.js';
import { I18n, KIT_STRINGS } from '../../kit/js/i18n.js';
import { STRINGS } from './strings.js';
import { KINDS, LAYOUT_KINDS, TABLE_SOURCED_KINDS, FIXED_LIST_KINDS, mapFeatureEnabled } from './kinds.js';
import { singleValueOf, isAnswered, renderExtraQuestion, renderNativeField, onSubmit, conditionMet, splitIntoPages, wirePages, resolveFormTitle } from './respond.js';
import {
  questionSummary, conditionSourceCandidates, renderCardBody, saveQuestionFromCard,
  customizeNativeField, resetQuestions, createEmptyForm, populateFormPicker, generate, saveConfig,
  renderQuestionList, showEditorTab, showConfig,
} from './config-editor.js';
import {
  ensureTableGate, ensureFreeColumn, FORMULAIRES_TABLE,
  ensureFormulairesTable, saveFormDefinition, resolveMyDefinition, fetchManagedVsIds,
} from './grist-meta.js';
import { loadPluginApi } from './plugin-loader.js';
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
  // Carte interactive (Leaflet) : grisée par défaut (voir mapFeatureEnabled, kinds.js). La suite
  // active le réglage pour exercer le même chemin de code qu'une plateforme qui l'autorise (ex.
  // GFS) ; le comportement "désactivé par défaut" a son propre test dédié ci-dessous, qui
  // désactive puis réactive le réglage localement.
  window.FORMPLUS_ENABLE_MAP = true;
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

  // Fabrique de mock grist.docApi : centralise ce qui était répété à l'identique dans presque
  // chaque construction artisanale de window.grist ci-dessous (listTables/setOptions par défaut,
  // et `calls` qui accumule CHAQUE tableau d'actions reçu par applyUserActions, dans l'ordre —
  // même forme que les tests qui inspectaient déjà `calls` à la main), et remplace la
  // construction manuelle répétée de retValues (`actions.map(() => null)` puis
  // `actions.forEach(...)` pour n'en remplir que certains) par un simple onAction(action) par
  // action. fetchTable et onAction restent de simples fonctions : rien n'empêche un appelant de
  // garder son propre état mutable dans leur fermeture, comme le font déjà les tests qui simulent
  // un document Grist complet (sections/champs créés, renommés, supprimés...). `extra` permet de
  // remplacer ou d'ajouter des propriétés docApi que ce mock générique ne couvre pas (ex.
  // applyUserActions qui doit lever une exception).
  function makeGristStub({ listTables = [], fetchTable, onAction, extra } = {}) {
    const calls = [];
    const docApi = {
      listTables: async () => listTables,
      fetchTable: async (t) => (typeof fetchTable === 'function' ? fetchTable(t) : ((fetchTable || {})[t] ?? { id: [] })),
      applyUserActions: async (actions) => {
        calls.push(actions);
        if (!onAction) return {};
        const retValues = await Promise.all(actions.map(a => onAction(a)));
        return retValues.some(v => v !== undefined) ? { retValues } : {};
      },
      setOptions: async () => {},
      ...extra,
    };
    return { grist: { docApi }, calls };
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

  await group('loadPluginApi : liste blanche d’origines, un référent hors liste retombe toujours sur docs.getgrist.com', async () => {
    // Intercepte document.createElement('script')/appendChild pour lire l'origine choisie SANS
    // jamais laisser un vrai <script> s'insérer dans la page (donc sans requête réseau réelle,
    // vers un vrai domaine Grist ou un domaine imaginaire) : loadPluginApi() ne fait ensuite plus
    // rien avec la promesse (onload/onerror ne sont jamais déclenchés ici), seul le src choisi
    // avant tout chargement nous intéresse.
    const savedCreateElement = document.createElement.bind(document);
    const savedAppendChild = document.head.appendChild.bind(document.head);
    const capturedSrcs = [];
    document.createElement = (tag) => (tag === 'script' ? { set src(v) { capturedSrcs.push(v); }, onload: null, onerror: null } : savedCreateElement(tag));
    document.head.appendChild = (el) => el;
    try {
      Object.defineProperty(document, 'referrer', { value: 'https://attaquant.example', configurable: true });
      loadPluginApi();
      await tick();
      assertEqual('référent d’une page tierce (hors liste blanche) -> repli sur docs.getgrist.com, jamais l’origine tierce', capturedSrcs[0], 'https://docs.getgrist.com/grist-plugin-api.js');

      capturedSrcs.length = 0;
      Object.defineProperty(document, 'referrer', { value: 'https://docs.getgrist.com', configurable: true });
      loadPluginApi();
      await tick();
      assertEqual('référent dans la liste blanche -> utilisé tel quel', capturedSrcs[0], 'https://docs.getgrist.com/grist-plugin-api.js');
    } finally {
      document.createElement = savedCreateElement;
      document.head.appendChild = savedAppendChild;
    }
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

  await group('contrastText : vrai ratio WCAG (luminance relative), jamais un seuil de luma fixe pouvant tomber sous AA (audit accessibilité du 21 oct)', () => {
    // Même formule que theme.js, dupliquée ici volontairement : vérifie le RÉSULTAT (le ratio
    // obtenu respecte AA), pas l'implémentation — une régression vers l'ancienne approximation de
    // luma NTSC (seuil 0,6 sur 0,299R+0,587G+0,114B) doit faire échouer ce test.
    const linOf = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    const lumOf = (hex) => {
      const c = hexToRgb(hex);
      return 0.2126 * linOf(c.r) + 0.7152 * linOf(c.g) + 0.0722 * linOf(c.b);
    };
    const ratio = (l1, l2) => { const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); };
    // Bleu poussiéreux #6699CC : luma NTSC ≈ 0,563 (< seuil 0,6 de l'ancienne formule -> aurait
    // choisi du blanc), mais le blanc n'y obtient qu'un ratio WCAG ≈ 3,05:1 (sous le seuil AA de
    // 4,5:1) alors que le texte sombre y obtient ≈ 5,2:1 : exactement le cas relevé par l'audit.
    const chosen = contrastText('#6699CC');
    const chosenLum = chosen === '#fff' ? 1 : lumOf(chosen);
    const bgLum = lumOf('#6699CC');
    assertEqual('couleur d’accent intermédiaire -> texte sombre (meilleur ratio réel)', chosen, '#1c1d21');
    assert('le texte choisi atteint bien le seuil AA (4,5:1) pour cette couleur', ratio(chosenLum, bgLum) >= 4.5, `ratio obtenu : ${ratio(chosenLum, bgLum).toFixed(2)}`);
    assert('le blanc, lui, n’aurait pas atteint ce seuil (c’était le bug)', ratio(1, bgLum) < 4.5, `ratio du blanc : ${ratio(1, bgLum).toFixed(2)}`);
  });

  await group('conditionSourceCandidates : tous les types comparables, jamais les blocs de mise en page ni les types sans valeur comparable', () => {
    state.cfgQuestions = [
      { id: 'a', kind: 'choice' }, { id: 'b', kind: 'select' }, { id: 'c', kind: 'text' },
      { id: 'd', kind: 'section' }, { id: 'e', kind: 'info' }, { id: 'f', kind: 'attachments' },
      { id: 'g', kind: 'bool' }, { id: 'h', kind: 'number' }, { id: 'i', kind: 'multiselect' }, { id: 'j', kind: 'longtext' },
      { id: 'k', kind: 'datetime' }, { id: 'l', kind: 'scale' }, { id: 'm', kind: 'reflist' }, { id: 'n', kind: 'ranking' }, { id: 'o', kind: 'signature' }, { id: 'p', kind: 'map' },
    ];
    assertEqual('tous les types comparables (dont date et heure, échelle), jamais section/info/pièces jointes/liste de références/classement/signature/carte',
      conditionSourceCandidates('a').map(q => q.id), ['b', 'c', 'g', 'h', 'i', 'j', 'k', 'l']);
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

  await group('resolveFormTitle : jamais le nom brut de la table Grist en repli (audit UI/UX du 21 oct)', () => {
    // Comparé à I18n.t(clé), jamais à du français écrit en dur (voir .github/scripts/run-widget-tests.js :
    // la suite tourne aussi en anglais en CI, un texte en dur y échouerait).
    const untitled = I18n.t('form.respond.untitledForm');
    assertEqual('titre FormPlus renseigné -> toujours prioritaire', resolveFormTitle({ formTitle: 'Inscription à l’atelier' }, { formTitle: 'Table1', formTableId: 'Table1' }), 'Inscription à l’atelier');
    assertEqual('pas de titre FormPlus, titre natif ≠ nom de table -> titre natif utilisé', resolveFormTitle({}, { formTitle: 'Contactez-nous', formTableId: 'Table1' }), 'Contactez-nous');
    assertEqual('pas de titre FormPlus, titre natif = nom brut de la table -> repli générique, jamais "Table1"', resolveFormTitle({}, { formTitle: 'Table1', formTableId: 'Table1' }), untitled);
    assertEqual('aucun titre nulle part -> repli générique', resolveFormTitle({}, { formTableId: 'Reponses' }), untitled);
    assertEqual('options absentes (undefined) -> ne lève pas, repli générique', resolveFormTitle(undefined, { formTableId: 'Reponses' }), untitled);
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

    // Oui/non (eq-<id> EST directement la case à cocher) : .value d'une case vaut toujours "on"
    // qu'elle soit cochée ou non — sans le cas dédié, une condition sur un Oui/non lisait
    // toujours la même valeur (écart corrigé le 29 sept 2026, audit du 21 sept).
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    assertEqual('case décochée', singleValueOf(checkbox), { value: 'false', label: 'Non' });
    checkbox.checked = true;
    assertEqual('case cochée', singleValueOf(checkbox), { value: 'true', label: 'Oui' });
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

  await group('conditionMet : une question masquée par sa propre condition ne compte plus pour ses dépendants (cascade)', () => {
    const host = mount(document.createElement('div'));
    host.innerHTML = `
      <div class="q cond-hidden"><select id="eq-b"><option value=""></option><option value="p" data-label="P">P</option></select></div>`;
    $('eq-b').value = 'p'; // la valeur reste dans le DOM même une fois la question masquée
    assert('règle sur une question actuellement masquée -> jamais vraie, même si la valeur DOM correspond', !conditionMet({ mode: 'all', rules: [{ questionId: 'b', value: 'P' }] }));
    host.querySelector('.q').classList.remove('cond-hidden');
    assert('la même règle redevient vraie une fois la question de nouveau visible', conditionMet({ mode: 'all', rules: [{ questionId: 'b', value: 'P' }] }));
  });

  await group('conditionMet : sources Oui/non, Choix multiples, Nombre, Texte (écart fonctionnel de l’audit du 21 sept corrigé le 29 sept)', () => {
    const host = mount(document.createElement('div'));
    host.innerHTML = `
      <input id="eq-bool" type="checkbox">
      <div id="eq-multi"><input type="checkbox" value="Fr"><input type="checkbox" value="En"></div>
      <input id="eq-num" type="number">
      <input id="eq-txt" type="text">`;
    const extraQuestions = [
      { id: 'bool', kind: 'bool' }, { id: 'multi', kind: 'multiselect' },
      { id: 'num', kind: 'number' }, { id: 'txt', kind: 'text' },
    ];
    assert('Oui/non non coché ne matche pas "Oui"', !conditionMet({ mode: 'all', rules: [{ questionId: 'bool', value: 'Oui' }] }, extraQuestions));
    $('eq-bool').checked = true;
    assert('Oui/non coché matche "Oui"', conditionMet({ mode: 'all', rules: [{ questionId: 'bool', value: 'Oui' }] }, extraQuestions));
    assert('Oui/non coché ne matche pas "Non"', !conditionMet({ mode: 'all', rules: [{ questionId: 'bool', value: 'Non' }] }, extraQuestions));

    assert('choix multiples : rien coché ne matche jamais', !conditionMet({ mode: 'all', rules: [{ questionId: 'multi', value: 'Fr' }] }, extraQuestions));
    host.querySelector('#eq-multi input[value="En"]').checked = true;
    assert('choix multiples : la valeur cochée matche par inclusion, pas égalité stricte sur toute la sélection', conditionMet({ mode: 'all', rules: [{ questionId: 'multi', value: 'En' }] }, extraQuestions));
    assert('choix multiples : une valeur non cochée -> false, même si une autre l’est', !conditionMet({ mode: 'all', rules: [{ questionId: 'multi', value: 'Fr' }] }, extraQuestions));

    $('eq-num').value = '42';
    assert('nombre : égalité sur la valeur saisie', conditionMet({ mode: 'all', rules: [{ questionId: 'num', value: '42' }] }, extraQuestions));
    assert('nombre : valeur différente -> false', !conditionMet({ mode: 'all', rules: [{ questionId: 'num', value: '43' }] }, extraQuestions));

    $('eq-txt').value = 'Oui je confirme';
    assert('texte : égalité exacte sur la saisie', conditionMet({ mode: 'all', rules: [{ questionId: 'txt', value: 'Oui je confirme' }] }, extraQuestions));
    assert('texte : valeur différente -> false', !conditionMet({ mode: 'all', rules: [{ questionId: 'txt', value: 'autre chose' }] }, extraQuestions));
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
    qs[0].querySelector('input').value = '   ';
    assertEqual('texte rempli uniquement d’espaces -> false (pas répondu)', isAnswered(qs[0]), false);

    const ranking = document.createElement('div');
    ranking.className = 'q'; ranking.dataset.kind = 'ranking';
    assertEqual('classement -> toujours répondu (même l’ordre par défaut)', isAnswered(ranking), true);

    const sigEmpty = document.createElement('div');
    sigEmpty.className = 'q'; sigEmpty.dataset.kind = 'signature';
    sigEmpty.innerHTML = '<div class="pv-signature" data-drawn="0"></div>';
    assertEqual('signature non dessinée -> false', isAnswered(sigEmpty), false);
    sigEmpty.querySelector('.pv-signature').dataset.drawn = '1';
    assertEqual('signature dessinée -> true', isAnswered(sigEmpty), true);
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

    host.innerHTML = renderExtraQuestion({ id: 'q11', kind: 'reflist', label: 'Refs' });
    assert('liste de références : conteneur en attente, comme "choix depuis une table"', host.querySelector('#eq-q11') != null && host.querySelector('#eq-q11 input') == null);

    host.innerHTML = renderExtraQuestion({ id: 'q12', kind: 'datetime', label: 'DH' });
    assert('date et heure : input type=datetime-local', !!host.querySelector('input[type="datetime-local"]#eq-q12'));

    host.innerHTML = renderExtraQuestion({ id: 'q13', kind: 'scale', label: 'Note', scaleMin: 0, scaleMax: 10 });
    const range = host.querySelector('input[type=range]#eq-q13');
    assertEqual('échelle : curseur min/max repris', range && { min: range.min, max: range.max }, { min: '0', max: '10' });
    assert('échelle : valeur courante affichée', !!host.querySelector('#eq-q13-value'));

    host.innerHTML = renderExtraQuestion({ id: 'q14', kind: 'ranking', label: 'Classement', choices: ['A', 'B', 'C'] });
    assertEqual('classement : une ligne par option, dans l’ordre fourni', [...host.querySelectorAll('.pv-ranking-item')].map(li => li.dataset.value), ['A', 'B', 'C']);
    assertEqual('classement : des boutons monter/descendre', host.querySelectorAll('[data-rank]').length, 6);

    host.innerHTML = renderExtraQuestion({ id: 'q15', kind: 'signature', label: 'Signez' });
    assert('signature : un canvas et un bouton Effacer', !!host.querySelector('canvas') && !!host.querySelector('.pv-sign-clear'));

    host.innerHTML = renderExtraQuestion({ id: 'q16', kind: 'map', label: 'Lieu' });
    assert('carte : un conteneur de carte et un champ caché pour les coordonnées', !!host.querySelector('.pv-map-canvas') && host.querySelector('input[type=hidden]#eq-q16') != null);
    window.FORMPLUS_ENABLE_MAP = false;
    try {
      host.innerHTML = renderExtraQuestion({ id: 'q16b', kind: 'map', label: 'Lieu' });
      assert('carte grisée (hors GFS) : repli en champ texte visible, pas de canvas', host.querySelector('.pv-map-canvas') == null && host.querySelector('input[type=text]#eq-q16b') != null);
    } finally {
      window.FORMPLUS_ENABLE_MAP = true;
    }

    host.innerHTML = renderExtraQuestion({ id: 'q17', kind: 'attachments', label: 'Photo', allowCapture: true });
    assertEqual('pièces jointes, capture activée : attribut capture posé', host.querySelector('#eq-q17')?.getAttribute('capture'), 'environment');
    host.innerHTML = renderExtraQuestion({ id: 'q17b', kind: 'attachments', label: 'Photo' });
    assert('pièces jointes, capture non activée : pas d’attribut capture', !host.querySelector('#eq-q17b')?.hasAttribute('capture'));

    host.innerHTML = renderExtraQuestion({ id: 'q18', kind: 'select', label: 'S', choices: ['A', 'B'], allowOther: true });
    assertEqual('select + Autre : une option de plus, et un champ de précision caché', host.querySelector('#eq-q18').options.length, 4);
    assert('select + Autre : champ de précision présent (masqué)', host.querySelector('#eq-q18-other')?.classList.contains('hidden'));

    host.innerHTML = renderExtraQuestion({ id: 'q19', kind: 'multiselect', label: 'M', choices: ['A', 'B'], allowOther: true });
    assertEqual('multiselect + Autre : une case de plus', host.querySelectorAll('#eq-q19 input[type=checkbox]').length, 3);

    host.innerHTML = renderExtraQuestion({ id: 'q9', kind: 'section', label: 'Titre section', description: 'sous-texte' });
    assert('section : titre + pas de champ ni message d’erreur', host.querySelector('h2')?.textContent === 'Titre section' && host.querySelector('.err-msg') == null);

    host.innerHTML = renderExtraQuestion({ id: 'q10', kind: 'info', label: 'Aide', description: 'contenu' });
    assert('bloc d’info : <details><summary>, pas de champ', host.querySelector('details.q-info summary')?.textContent === 'Aide' && host.querySelector('.err-msg') == null);
  });

  await group('splitIntoPages : découpe sur les marqueurs de type "page"', () => {
    assertEqual('aucun marqueur : une seule page avec tout', splitIntoPages([{ id: 'a', kind: 'text' }, { id: 'b', kind: 'text' }]).map(p => p.items.map(q => q.id)), [['a', 'b']]);
    const withBreak = splitIntoPages([
      { id: 'a', kind: 'text' },
      { id: 'brk', kind: 'page', label: 'Page 2', condition: { mode: 'all', rules: [{ questionId: 'a', op: 'eq', value: 'x' }] } },
      { id: 'b', kind: 'text' },
    ]);
    assertEqual('un marqueur : deux pages', withBreak.length, 2);
    assertEqual('page 1 : ce qui précède le marqueur (jamais de condition)', { items: withBreak[0].items.map(q => q.id), condition: withBreak[0].condition }, { items: ['a'], condition: null });
    assertEqual('page 2 : ce qui suit, avec la condition portée par le marqueur (le marqueur lui-même n’est pas une question)', { items: withBreak[1].items.map(q => q.id), condition: withBreak[1].condition }, { items: ['b'], condition: { mode: 'all', rules: [{ questionId: 'a', op: 'eq', value: 'x' }] } });
  });

  await group('wirePages : navigation Précédent/Suivant, "obligatoire" bloque page par page', () => {
    const extraQuestions = [
      { id: 'q1', kind: 'text', label: 'Nom', required: true },
      { id: 'brk', kind: 'page', label: 'Page 2', condition: null },
      { id: 'q2', kind: 'text', label: 'Détail' },
    ];
    const pages = splitIntoPages(extraQuestions);
    const card = mount(document.createElement('div'));
    card.innerHTML = `<form id="f">
      <div class="pv-page" data-page-index="0">${renderExtraQuestion(pages[0].items[0])}</div>
      <div class="pv-page" data-page-index="1" hidden>${renderExtraQuestion(pages[1].items[0])}</div>
      <p id="pv-page-indicator"></p>
      <div class="pv-pager-nav"><button type="button" id="pv-prev" class="hidden">Précédent</button><button type="button" id="pv-next">Suivant</button></div>
      <button type="submit" id="pv-submit-btn" class="hidden">Envoyer</button>
    </form>`;
    wirePages(card, pages, extraQuestions);

    assertEqual('page 1 affichée au départ', card.querySelector('.pv-page[data-page-index="0"]').hidden, false);
    assertEqual('page 2 masquée au départ', card.querySelector('.pv-page[data-page-index="1"]').hidden, true);
    assertEqual('indicateur "Page 1 / 2"', $('pv-page-indicator').textContent, 'Page 1 / 2');
    assert('Précédent masqué sur la première page', $('pv-prev').classList.contains('hidden'));
    assert('Suivant visible (une page éligible après)', !$('pv-next').classList.contains('hidden'));
    assert('Envoyer masqué (pas encore la dernière page)', $('pv-submit-btn').classList.contains('hidden'));

    $('pv-next').click();
    assert('Suivant bloqué : "Nom" obligatoire est vide -> invalid posé', card.querySelector('[data-extra="q1"]').classList.contains('invalid'));
    assertEqual('reste sur la page 1', card.querySelector('.pv-page[data-page-index="0"]').hidden, false);

    $('eq-q1').value = 'Jean';
    $('eq-q1').dispatchEvent(new Event('input'));
    $('pv-next').click();
    assert('"Nom" rempli : invalid retiré', !card.querySelector('[data-extra="q1"]').classList.contains('invalid'));
    assertEqual('passe à la page 2', card.querySelector('.pv-page[data-page-index="1"]').hidden, false);
    assertEqual('page 1 masquée', card.querySelector('.pv-page[data-page-index="0"]').hidden, true);
    assertEqual('indicateur "Page 2 / 2"', $('pv-page-indicator').textContent, 'Page 2 / 2');
    assert('Précédent visible sur la dernière page', !$('pv-prev').classList.contains('hidden'));
    assert('Suivant masqué (dernière page)', $('pv-next').classList.contains('hidden'));
    assert('Envoyer visible (dernière page, bug corrigé : le modèle posait l’attribut "hidden", jamais retiré par show(), qui ne touche que la classe)', !$('pv-submit-btn').classList.contains('hidden'));

    $('pv-prev').click();
    assertEqual('Précédent revient à la page 1', card.querySelector('.pv-page[data-page-index="0"]').hidden, false);
    assertEqual('indicateur revenu à "Page 1 / 2"', $('pv-page-indicator').textContent, 'Page 1 / 2');
  });

  await group('wirePages : page sautée par sa condition, propagation en cascade (cond-hidden) comme une question', () => {
    const extraQuestions = [
      { id: 'q1', kind: 'text', label: 'Code' },
      { id: 'brk', kind: 'page', label: 'Page 2', condition: { mode: 'all', rules: [{ questionId: 'q1', op: 'eq', value: 'details' }] } },
      { id: 'q2', kind: 'text', label: 'Détail' },
    ];
    const pages = splitIntoPages(extraQuestions);
    const card = mount(document.createElement('div'));
    card.innerHTML = `<form id="f">
      <div class="pv-page" data-page-index="0">${renderExtraQuestion(pages[0].items[0])}</div>
      <div class="pv-page" data-page-index="1" hidden>${renderExtraQuestion(pages[1].items[0])}</div>
      <p id="pv-page-indicator"></p>
      <div class="pv-pager-nav"><button type="button" id="pv-prev" class="hidden">Précédent</button><button type="button" id="pv-next">Suivant</button></div>
      <button type="submit" id="pv-submit-btn" class="hidden">Envoyer</button>
    </form>`;
    wirePages(card, pages, extraQuestions);

    assert('page 2 sautée dès le départ (condition fausse) : son champ prend cond-hidden', card.querySelector('[data-extra="q2"]').classList.contains('cond-hidden'));
    assertEqual('une seule page éligible -> indicateur "Page 1 / 1"', $('pv-page-indicator').textContent, 'Page 1 / 1');
    assert('Suivant masqué : aucune page éligible après', $('pv-next').classList.contains('hidden'));
    assert('Envoyer visible directement (page 1 est la seule éligible)', !$('pv-submit-btn').classList.contains('hidden'));

    $('eq-q1').value = 'details';
    $('eq-q1').dispatchEvent(new Event('input'));
    assert('condition devenue vraie : cond-hidden retiré, en cascade comme une question', !card.querySelector('[data-extra="q2"]').classList.contains('cond-hidden'));

    $('pv-next').click();
    assertEqual('Suivant (recalculé au clic) avance bien à la page 2 devenue éligible', card.querySelector('.pv-page[data-page-index="1"]').hidden, false);
    assertEqual('indicateur "Page 2 / 2"', $('pv-page-indicator').textContent, 'Page 2 / 2');
  });

  await group('renderNativeField : colId échappé à l’affichage, jamais altéré pour la lecture (dataset.col)', () => {
    // colId vient de l'API /forms/<clé>/<section> d'un document Grist quelconque : jamais fait
    // confiance sans échappement dans le HTML produit (voir le commentaire au-dessus de nameAttr
    // dans respond.js), sous peine d'injection HTML/JS via un nom de colonne malveillant.
    const evilColId = '"><img src=x onerror=alert(1)>';
    const fl = { colId: evilColId, question: 'Q', options: {}, type: 'Text' };
    const html = renderNativeField(1, fl, new URLSearchParams());
    assert('le HTML produit ne contient jamais le colId brut (pas d’injection)', !html.includes(evilColId));
    assert('la version échappée (jamais interprétable comme balise) apparaît bien à sa place', html.includes('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'));
    const host = document.createElement('div');
    host.innerHTML = html;
    assertEqual('un seul champ produit (le HTML échappé n’a pas cassé la structure)', host.querySelectorAll('.q').length, 1);
    assertEqual('dataset.col retrouve la valeur brute exacte (décodage HTML par le navigateur)', host.querySelector('.q').dataset.col, evilColId);
  });

  await group('renderCardBody : setKind affiche les bons blocs par type', async () => {
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = makeGristStub({
      listTables: ['Main', 'Autre'],
      fetchTable: (t) => (t === '_grist_Tables' ? { id: [1, 2], tableId: ['Main', 'Autre'] } : { id: [10], colA: ['x'] }),
    }).grist;
    const body = mount(document.createElement('div'));
    await renderCardBody('__new__', body);
    for (const k of KINDS.map(x => x.id)) {
      body.querySelector(`[data-kind="${k}"]`).click();
      const hidden = (sel) => body.querySelector(sel).classList.contains('hidden');
      assertEqual(`${k} : bloc "table source" (choice/reflist)`, hidden('.qf-choice-fields'), !TABLE_SOURCED_KINDS.has(k), k);
      assertEqual(`${k} : bloc "options fixes" (select/multiselect/ranking)`, hidden('.qf-fixed-options'), !FIXED_LIST_KINDS.has(k), k);
      assertEqual(`${k} : bloc "réponse libre Autre" (select/multiselect seuls, pas ranking)`, hidden('.qf-other-option'), !(k === 'select' || k === 'multiselect'), k);
      assertEqual(`${k} : bloc "affichage menu/radio" (select/choice)`, hidden('.qf-display-mode'), !(k === 'select' || k === 'choice'), k);
      assertEqual(`${k} : bloc "échelle" (scale seul)`, hidden('.qf-scale-fields'), k !== 'scale', k);
      assertEqual(`${k} : bloc "destination" (pas mise en page)`, hidden('.qf-text-fields'), LAYOUT_KINDS.has(k), k);
      assertEqual(`${k} : "colonne de destination" (pas choice/reflist, écart corrigé 29 sept : choice règle sa table mais pas sa colonne)`, hidden('.qf-write-col-field'), TABLE_SOURCED_KINDS.has(k), k);
      assertEqual(`${k} : indice "choix depuis une table/liste de références" (choice/reflist)`, hidden('.qf-choice-table-hint'), !TABLE_SOURCED_KINDS.has(k), k);
      assertEqual(`${k} : case "prise de photo" (attachments seul)`, hidden('.qf-capture-option'), k !== 'attachments', k);
      assertEqual(`${k} : "obligatoire" (pas mise en page)`, hidden('.qf-required-row'), LAYOUT_KINDS.has(k), k);
      assertEqual(`${k} : description courte (pas info)`, hidden('.qf-desc'), k === 'info', k);
      assertEqual(`${k} : description longue (info seul)`, hidden('.qf-desc-long'), k !== 'info', k);
    }
  });

  await group('renderCardBody : carte interactive grisée par défaut (hors GFS)', async () => {
    window.FORMPLUS_ENABLE_MAP = false;
    try {
      state.mainTableIdCache = 'Main';
      state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
      window.grist = makeGristStub({
        listTables: ['Main', 'Autre'],
        fetchTable: (t) => (t === '_grist_Tables' ? { id: [1, 2], tableId: ['Main', 'Autre'] } : { id: [10], colA: ['x'] }),
      }).grist;
      const body = mount(document.createElement('div'));
      await renderCardBody('__new__', body);
      assert('mapFeatureEnabled() renvoie faux tant que window.FORMPLUS_ENABLE_MAP n’est pas posé à true', !mapFeatureEnabled());
      const mapBtn = body.querySelector('[data-kind="map"]');
      assert('bouton "Lieu sur carte" désactivé dans le popover de type', mapBtn.disabled);
      mapBtn.click();
      assertEqual('le clic sur un type désactivé ne change pas le type courant (reste "text")', body.querySelector('.qtype-opt.active')?.dataset.kind, 'text');
      // Une question "map" déjà configurée (ex. importée d’une config faite sous GFS) reste
      // éditable : le bouton de son propre type n’est pas désactivé quand il est déjà actif.
      state.cfgQuestions = [{ id: 'q1', kind: 'map', label: 'Lieu' }];
      const body2 = mount(document.createElement('div'));
      await renderCardBody('q1', body2);
      assert('le bouton "map" n’est pas désactivé quand c’est déjà le type de la question', !body2.querySelector('[data-kind="map"]').disabled);
    } finally {
      window.FORMPLUS_ENABLE_MAP = true;
    }
  });

  await group('saveQuestionFromCard : réponses simples, colonne par défaut', async () => {
    for (const k of ['text', 'longtext', 'number', 'date', 'datetime', 'bool', 'select', 'multiselect', 'ranking', 'attachments', 'scale', 'signature', 'map']) {
      state.cfgQuestions = [];
      state.mainTableIdCache = 'Main';
      state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
      window.grist = makeGristStub({
        listTables: ['Main', 'Autre'],
        fetchTable: (t) => (t === '_grist_Tables' ? { id: [1, 2], tableId: ['Main', 'Autre'] } : { id: [10], colA: ['x'] }),
      }).grist;
      state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
      const body = mount(document.createElement('div'));
      const { combos } = await renderCardBody('__new__', body);
      body.querySelector(`[data-kind="${k}"]`).click();
      body.querySelector('.qf-label').value = `Question ${k}`;
      if (FIXED_LIST_KINDS.has(k)) body.querySelector('.qf-choices').value = 'Un\nDeux';
      selectCombo(body.querySelector('[data-combo="writeCol"]'), 'colA');
      await saveQuestionFromCard('__new__', body, null, combos);
      assertEqual(`${k} : une question créée`, state.cfgQuestions.length, 1, JSON.stringify(state.cfgQuestions));
      assertEqual(`${k} : bon type conservé`, state.cfgQuestions[0]?.kind, k);
      assertEqual(`${k} : colonne de destination`, state.cfgQuestions[0]?.writeCol, 'colA');
      if (FIXED_LIST_KINDS.has(k)) assertEqual(`${k} : options`, state.cfgQuestions[0]?.choices, ['Un', 'Deux']);
      if (k === 'scale') {
        assertEqual(`${k} : min par défaut`, state.cfgQuestions[0]?.scaleMin, 1);
        assertEqual(`${k} : max par défaut`, state.cfgQuestions[0]?.scaleMax, 5);
      }
    }
  });

  await group('ensureFreeColumn : déduit le nom du libellé et le type Grist selon le type de question (principe n°5 de la feuille de route)', async () => {
    const addColumnCalls = [];
    window.grist = makeGristStub({
      fetchTable: (t) => (t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : t === '_grist_Tables_column' ? { id: [], colId: [], parentId: [], type: [] } : {}),
      onAction: (a) => { if (a[0] === 'AddColumn') addColumnCalls.push(a); },
    }).grist;
    assertEqual('espaces remplacés par "_" dans le nom déduit', await ensureFreeColumn('Main', 'Date de naissance', 'date'), 'Date_de_naissance');
    assertEqual('type Grist "date" -> Date', addColumnCalls[0]?.[3]?.type, 'Date');
    await ensureFreeColumn('Main', 'Langues', 'multiselect');
    assertEqual('type Grist "multiselect" -> ChoiceList', addColumnCalls[1]?.[3]?.type, 'ChoiceList');
    assertEqual('libellé sans aucun caractère valide -> repli "Champ"', await ensureFreeColumn('Main', '!!!', 'text'), 'Champ');
  });

  await group('ensureFreeColumn : réutilise une colonne existante de même type, en crée une autre en cas de collision avec un type différent', async () => {
    const addColumnCalls = [];
    const colTable = { id: [100], colId: ['Note'], parentId: [1], type: ['Numeric'] };
    window.grist = makeGristStub({
      fetchTable: (t) => (t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : t === '_grist_Tables_column' ? colTable : {}),
      onAction: (a) => { if (a[0] === 'AddColumn') addColumnCalls.push(a); },
    }).grist;
    assertEqual('même nom, même type (Numeric) -> colonne existante réutilisée', await ensureFreeColumn('Main', 'Note', 'number'), 'Note');
    assertEqual('aucune colonne créée dans ce cas', addColumnCalls.length, 0);
    assertEqual('même nom, type différent attendu (Texte) -> suffixe plutôt qu’écrire dans la colonne Numeric existante', await ensureFreeColumn('Main', 'Note', 'text'), 'Note_2');
    assertEqual('la colonne suffixée est bien créée avec le bon type', addColumnCalls[0]?.[3], { type: 'Text' });
  });

  await group('saveQuestionFromCard : colonne de destination laissée vide -> créée automatiquement (écart relevé par l’audit UI/UX du 21 oct, corrigé ici pour tous les types libres)', async () => {
    const EXPECTED_TYPE = {
      text: 'Text', longtext: 'Text', number: 'Numeric', date: 'Date', datetime: 'DateTime', bool: 'Bool',
      select: 'Choice', multiselect: 'ChoiceList', ranking: 'Text', attachments: 'Attachments', scale: 'Numeric', signature: 'Attachments', map: 'Text',
    };
    for (const k of Object.keys(EXPECTED_TYPE)) {
      state.cfgQuestions = [];
      state.mainTableIdCache = 'Main';
      state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
      const addColumnCalls = [];
      window.grist = makeGristStub({
        listTables: ['Main'],
        fetchTable: (t) => (t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : t === '_grist_Tables_column' ? { id: [], colId: [], parentId: [], type: [] } : {}),
        onAction: (a) => { if (a[0] === 'AddColumn') addColumnCalls.push(a); },
      }).grist;
      state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
      const body = mount(document.createElement('div'));
      const { combos } = await renderCardBody('__new__', body);
      body.querySelector(`[data-kind="${k}"]`).click();
      body.querySelector('.qf-label').value = `Ma question ${k}`;
      if (FIXED_LIST_KINDS.has(k)) body.querySelector('.qf-choices').value = 'Un\nDeux';
      // Combo "colonne de destination" jamais touchée (aucun selectCombo) : exactement le cas
      // bloquant relevé par l'audit — doit maintenant créer la colonne plutôt que refuser.
      await saveQuestionFromCard('__new__', body, null, combos);
      assertEqual(`${k} : une question créée malgré une colonne de destination vide`, state.cfgQuestions.length, 1, JSON.stringify(state.cfgQuestions));
      assertEqual(`${k} : colonne déduite du libellé`, state.cfgQuestions[0]?.writeCol, `Ma_question_${k}`);
      assertEqual(`${k} : une colonne créée (AddColumn)`, addColumnCalls.length, 1);
      assertEqual(`${k} : type Grist correct pour la colonne créée`, addColumnCalls[0]?.[3]?.type, EXPECTED_TYPE[k]);
    }

    // Texte tapé dans la combo sans correspondance choisie dans la liste (le concepteur tape un
    // nom qu'il a en tête, qui n'existe pas encore) : ce texte prime sur le libellé pour nommer
    // la colonne créée — pas seulement le cas "champ jamais touché" testé ci-dessus.
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    const addColumnCalls2 = [];
    window.grist = makeGristStub({
      listTables: ['Main'],
      fetchTable: (t) => (t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : t === '_grist_Tables_column' ? { id: [], colId: [], parentId: [], type: [] } : {}),
      onAction: (a) => { if (a[0] === 'AddColumn') addColumnCalls2.push(a); },
    }).grist;
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body2 = mount(document.createElement('div'));
    const { combos: combos2 } = await renderCardBody('__new__', body2);
    body2.querySelector('[data-kind="text"]').click();
    body2.querySelector('.qf-label').value = 'Libellé affiché';
    const writeColInput = body2.querySelector('[data-combo="writeCol"] .combo-input');
    writeColInput.focus();
    writeColInput.value = 'Nom voulu';
    writeColInput.dispatchEvent(new Event('input'));
    await saveQuestionFromCard('__new__', body2, null, combos2);
    assertEqual('texte tapé sans correspondance -> prime sur le libellé pour le nom de colonne créée', state.cfgQuestions[0]?.writeCol, 'Nom_voulu');
  });

  await group('saveQuestionFromCard : liste de références (reflist), même mécanisme que "choix depuis une table"', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    const sectionFields = { id: [], parentId: [], colRef: [], widgetOptions: [] };
    window.grist = makeGristStub({
      listTables: ['Main', 'Autre'],
      fetchTable: (t) => {
        if (t === '_grist_Tables') return { id: [1, 2], tableId: ['Main', 'Autre'] };
        if (t === '_grist_Tables_column') return { id: [], colId: [], parentId: [], type: [], visibleCol: [] };
        if (t === '_grist_Views_section_field') return sectionFields;
        if (t === 'Autre') return { id: [1, 2], nom: ['Alpha', 'Beta'] };
        return {};
      },
    }).grist;
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    const { combos } = await renderCardBody('__new__', body);
    body.querySelector('[data-kind="reflist"]').click();
    body.querySelector('.qf-label').value = 'Compétences';
    selectCombo(body.querySelector('[data-combo="srcTable"]'), 'Autre');
    await tick();
    selectCombo(body.querySelector('[data-combo="srcCol"]'), 'nom');
    await saveQuestionFromCard('__new__', body, null, combos);
    assertEqual('une question créée', state.cfgQuestions.length, 1, JSON.stringify(state.cfgQuestions));
    assertEqual('sourceTable', state.cfgQuestions[0]?.sourceTable, 'Autre');
    assertEqual('sourceCol', state.cfgQuestions[0]?.sourceCol, 'nom');
    assert('writeCol calculé (référence cachée, liste)', typeof state.cfgQuestions[0]?.writeCol === 'string' && state.cfgQuestions[0].writeCol.startsWith('FormPlus_srcL_'));
  });

  await group('saveQuestionFromCard : option "Autre" (select/multiselect) et capture photo (attachments)', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = makeGristStub({
      listTables: ['Main'],
      fetchTable: (t) => (t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : { id: [10], colA: ['x'] }),
    }).grist;
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    const { combos } = await renderCardBody('__new__', body);
    body.querySelector('[data-kind="select"]').click();
    body.querySelector('.qf-label').value = 'Q';
    body.querySelector('.qf-choices').value = 'Un\nDeux';
    body.querySelector('.qf-allow-other').click();
    selectCombo(body.querySelector('[data-combo="writeCol"]'), 'colA');
    await saveQuestionFromCard('__new__', body, null, combos);
    assertEqual('allowOther enregistré (select)', state.cfgQuestions[0]?.allowOther, true);

    state.cfgQuestions = [];
    const body2 = mount(document.createElement('div'));
    const { combos: combos2 } = await renderCardBody('__new__', body2);
    body2.querySelector('[data-kind="attachments"]').click();
    body2.querySelector('.qf-label').value = 'Photo';
    body2.querySelector('.qf-allow-capture').click();
    selectCombo(body2.querySelector('[data-combo="writeCol"]'), 'colA');
    await saveQuestionFromCard('__new__', body2, null, combos2);
    assertEqual('allowCapture enregistré (attachments)', state.cfgQuestions[0]?.allowCapture, true);
  });

  await group('saveQuestionFromCard : affichage radio persisté', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = makeGristStub({
      listTables: ['Main'],
      fetchTable: (t) => (t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : { id: [10], colA: ['x'] }),
    }).grist;
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    const { combos } = await renderCardBody('__new__', body);
    body.querySelector('[data-kind="select"]').click();
    body.querySelector('.qf-label').value = 'Q';
    body.querySelector('.qf-choices').value = 'Un\nDeux';
    body.querySelector('[data-display="radio"]').click();
    selectCombo(body.querySelector('[data-combo="writeCol"]'), 'colA');
    await saveQuestionFromCard('__new__', body, null, combos);
    assertEqual('displayMode=radio enregistré', state.cfgQuestions[0]?.displayMode, 'radio');
  });

  await group('renderCardBody : condition, ajouter/retirer une règle fait apparaître/disparaître le choix ET/OU', async () => {
    state.cfgQuestions = [{ id: 'src1', kind: 'select', label: 'Statut', choices: ['Ouvert', 'Fermé'] }];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = makeGristStub({
      listTables: ['Main'],
      fetchTable: (t) => (t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : { id: [10], colA: ['x'] }),
    }).grist;
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

  await group('renderCardBody : la cellule "égale" d’une condition s’adapte au type de la question source (écart fonctionnel de l’audit du 21 sept, corrigé le 29 sept)', async () => {
    state.cfgQuestions = [
      { id: 'srcSelect', kind: 'select', label: 'Statut', choices: ['Ouvert', 'Fermé'] },
      { id: 'srcBool', kind: 'bool', label: 'Urgent' },
      { id: 'srcNum', kind: 'number', label: 'Montant' },
      { id: 'srcTxt', kind: 'text', label: 'Note' },
    ];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    window.grist = { docApi: { listTables: async () => ['Main'], fetchTable: async (t) => t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : { id: [10], colA: ['x'] } } };
    const body = mount(document.createElement('div'));
    const { combos } = await renderCardBody('__new__', body);
    body.querySelector('[data-reveal="condition"]').click();
    const cell = () => body.querySelector('.qf-cond-value[data-idx="0"]');
    const pickSource = async (id) => { body.querySelector('.qf-condQ').value = id; body.querySelector('.qf-condQ').dispatchEvent(new Event('change')); await tick(); };

    await pickSource('srcSelect');
    assert('source à choix fixes -> combo de recherche', !!cell().querySelector('.combo-input'));

    await pickSource('srcBool');
    assert('source Oui/non -> combo (Oui/Non), pas une saisie libre', !!cell().querySelector('.combo-input'));
    cell().querySelector('.combo-input').dispatchEvent(new Event('focus'));
    assertEqual('valeurs proposées pour Oui/non : Oui et Non', [...cell().querySelectorAll('.combo-opt')].map(o => o.textContent), ['Oui', 'Non']);

    await pickSource('srcNum');
    assert('source Nombre -> saisie libre (pas de combo)', !!cell().querySelector('input[type=number].qf-cond-freevalue') && !cell().querySelector('.combo-input'));

    await pickSource('srcTxt');
    assert('source Texte -> saisie libre (pas de combo)', !!cell().querySelector('input[type=text].qf-cond-freevalue') && !cell().querySelector('.combo-input'));
    cell().querySelector('input').value = 'valeur libre';
    cell().querySelector('input').dispatchEvent(new Event('input'));
    body.querySelector('.qf-label').value = 'Dépendante';
    selectCombo(body.querySelector('[data-combo="writeCol"]'), 'colA');
    await saveQuestionFromCard('__new__', body, null, combos);
    assertEqual('la valeur saisie librement est bien reprise à l’enregistrement', state.cfgQuestions.find(q => q.label === 'Dépendante')?.condition,
      { mode: 'all', rules: [{ questionId: 'srcTxt', op: 'equals', value: 'valeur libre' }] });
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
    window.grist = makeGristStub({
      listTables: ['Main'],
      fetchTable: (t) => (t === '_grist_Tables' ? { id: [1], tableId: ['Main'] } : { id: [10], colA: ['x'] }),
    }).grist;
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    const { combos } = await renderCardBody('q1', body);
    assertEqual('2 lignes de condition affichées au chargement', body.querySelectorAll('.qf-cond-rule').length, 2);
    assert('bascule ET/OU visible', !body.querySelector('.qf-cond-mode').classList.contains('hidden'));
    assert('ET actif au chargement (mode enregistré)', body.querySelector('.qf-cond-mode-btn[data-mode="all"]').classList.contains('active'));
    body.querySelector('.qf-cond-mode-btn[data-mode="any"]').click();
    await saveQuestionFromCard('q1', body, state.cfgQuestions.find(x => x.id === 'q1'), combos);
    assertEqual('condition ré-enregistrée en OU, mêmes règles', state.cfgQuestions.find(q => q.id === 'q1')?.condition,
      { mode: 'any', rules: [{ questionId: 'src1', op: 'equals', value: 'Ouvert' }, { questionId: 'src2', op: 'equals', value: 'Haute' }] });
  });

  await group('saveQuestionFromCard : choix depuis une table', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    const sectionFields = { id: [], parentId: [], colRef: [], widgetOptions: [] };
    window.grist = makeGristStub({
      listTables: ['Main', 'Autre'],
      fetchTable: (t) => {
        if (t === '_grist_Tables') return { id: [1, 2], tableId: ['Main', 'Autre'] };
        if (t === '_grist_Tables_column') return { id: [], colId: [], parentId: [], type: [], visibleCol: [] };
        if (t === '_grist_Views_section_field') return sectionFields;
        if (t === 'Autre') return { id: [1, 2], nom: ['Alpha', 'Beta'] };
        return {};
      },
    }).grist;
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    const { combos } = await renderCardBody('__new__', body);
    body.querySelector('[data-kind="choice"]').click();
    body.querySelector('.qf-label').value = 'Departement';
    selectCombo(body.querySelector('[data-combo="srcTable"]'), 'Autre');
    await tick();
    selectCombo(body.querySelector('[data-combo="srcCol"]'), 'nom');
    await saveQuestionFromCard('__new__', body, null, combos);
    assertEqual('une question créée', state.cfgQuestions.length, 1, JSON.stringify(state.cfgQuestions));
    assertEqual('sourceTable', state.cfgQuestions[0]?.sourceTable, 'Autre');
    assertEqual('sourceCol', state.cfgQuestions[0]?.sourceCol, 'nom');
    assert('writeCol calculé (référence cachée)', typeof state.cfgQuestions[0]?.writeCol === 'string' && state.cfgQuestions[0].writeCol.startsWith('FormPlus_src_'));
  });

  await group('saveQuestionFromCard : choix depuis une table, écriture dans une autre table (écart fonctionnel de l’audit du 21 sept, corrigé le 29 sept)', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 7, tableRef: 1 };
    let sectionsState = { id: [], parentId: [], parentKey: [], tableRef: [], shareOptions: [] };
    let fieldsState = { id: [], parentId: [], colRef: [], widgetOptions: [] };
    let nextSectionId = 900, nextFieldId = 9000;
    window.grist = makeGristStub({
      listTables: ['Main', 'Autre', 'Secondaire'],
      fetchTable: (t) => {
        if (t === '_grist_Tables') return { id: [1, 2, 3], tableId: ['Main', 'Autre', 'Secondaire'] };
        if (t === '_grist_Tables_column') return { id: [], colId: [], parentId: [], type: [], visibleCol: [] };
        if (t === '_grist_Views_section') return { ...sectionsState };
        if (t === '_grist_Views_section_field') return { ...fieldsState };
        if (t === 'Autre') return { id: [1, 2], nom: ['Alpha', 'Beta'] };
        return {};
      },
      onAction: (a) => {
        if (a[0] === 'CreateViewSection') {
          const newId = nextSectionId++;
          sectionsState = {
            id: [...sectionsState.id, newId], parentId: [...sectionsState.parentId, a[2]],
            parentKey: [...sectionsState.parentKey, 'form'], tableRef: [...sectionsState.tableRef, a[1]],
            shareOptions: [...sectionsState.shareOptions, '{}'],
          };
          // Comme un vrai document Grist (voir createFormSection, grist-meta.js) : l'id créé
          // est renvoyé directement dans retValues, jamais retrouvé en re-lisant les tables.
          return { sectionRef: newId };
        } else if (a[0] === 'UpdateRecord' && a[1] === '_grist_Views_section') {
          const idx = sectionsState.id.indexOf(a[2]);
          if (idx >= 0 && a[3].shareOptions !== undefined) {
            const arr = [...sectionsState.shareOptions]; arr[idx] = a[3].shareOptions; sectionsState.shareOptions = arr;
          }
        } else if (a[0] === 'AddRecord' && a[1] === '_grist_Views_section_field') {
          fieldsState = {
            id: [...fieldsState.id, nextFieldId++], parentId: [...fieldsState.parentId, a[3].parentId],
            colRef: [...fieldsState.colRef, a[3].colRef], widgetOptions: [...fieldsState.widgetOptions, a[3].widgetOptions],
          };
        }
      },
    }).grist;
    state.options = { publicUrl: 'https://x', viewRef: 7, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    const { combos } = await renderCardBody('__new__', body);
    body.querySelector('[data-kind="choice"]').click();
    body.querySelector('.qf-label').value = 'Departement';
    selectCombo(body.querySelector('[data-combo="srcTable"]'), 'Autre');
    await tick();
    selectCombo(body.querySelector('[data-combo="srcCol"]'), 'nom');
    body.querySelector('[data-reveal="table"]').click();
    selectCombo(body.querySelector('[data-combo="writeTable"]'), 'Secondaire');
    await saveQuestionFromCard('__new__', body, null, combos);
    const q = state.cfgQuestions[0];
    assertEqual('une question créée', state.cfgQuestions.length, 1, JSON.stringify(state.cfgQuestions));
    assertEqual('écrit dans la table choisie, pas la table principale', q?.writeTable, 'Secondaire');
    assert('writeCol calculé (référence cachée)', typeof q?.writeCol === 'string' && q.writeCol.startsWith('FormPlus_src_'));
    assertEqual('un formulaire publié a été créé pour "Secondaire" (ensureTableGate)', sectionsState.tableRef.filter(t => t === 3).length, 1);
    const gateSectionId = sectionsState.id[sectionsState.tableRef.indexOf(3)];
    assertEqual('le champ Référence caché est attaché à CE formulaire, pas au formulaire principal', fieldsState.parentId, [gateSectionId]);
  });

  await group('renderCardBody : deux enregistrements automatiques rapides sur une question neuve ne créent qu’une seule entrée', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = makeGristStub({
      listTables: ['Main'],
      // _grist_Views_section a besoin d'un tableau `id` exploitable (findViewRefForSection,
      // appelé par saveConfig, y fait indexOf) : {} nu y provoquerait une exception qui ferait
      // échouer saveConfig à chaque fois, masquant justement le comportement que ce test vérifie.
      fetchTable: (t) => (t === '_grist_Views_section' ? { id: [], parentId: [], parentKey: [], options: [] } : { id: [] }),
    }).grist;
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    await renderCardBody('__new__', body);
    body.querySelector('[data-kind="section"]').click();
    // Deux frappes suivies chacune d'un blur, l'une juste après l'autre, avant qu'aucun des deux
    // aller-retours (saveConfig) n'ait eu le temps de se terminer : sans le verrou qui met à jour
    // `q` après chaque sauvegarde réussie, le second blur repartait d'un `existing` resté à `null`
    // et créait une SECONDE question au lieu de modifier la première.
    // focusout (pas blur) depuis le 21 oct 2026 : voir wireCardFooter, même événement déclenche
    // l'auto-enregistrement désormais.
    body.querySelector('.qf-label').value = 'Premier titre';
    body.querySelector('.qf-label').dispatchEvent(new Event('focusout'));
    body.querySelector('.qf-label').value = 'Second titre';
    body.querySelector('.qf-label').dispatchEvent(new Event('focusout'));
    await tick(); await tick(); await tick(); await tick();
    assertEqual('une seule question créée (pas de doublon)', state.cfgQuestions.length, 1, JSON.stringify(state.cfgQuestions));
    assertEqual('le second enregistrement met à jour la même entrée, avec le dernier libellé tapé', state.cfgQuestions[0]?.label, 'Second titre');
  });

  await group('wireCardFooter : ne valide/enregistre pas tant que le focus reste dans la même carte (audit UI/UX du 21 oct 2026)', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = makeGristStub({
      listTables: ['Main'],
      fetchTable: (t) => (t === '_grist_Views_section' ? { id: [], parentId: [], parentKey: [], options: [] } : { id: [] }),
    }).grist;
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    await renderCardBody('__new__', body);
    // "Choix depuis une table" : table/colonne source jamais choisies ici, un gate de validation
    // toujours requis même depuis que la colonne de destination se crée seule pour les types
    // libres (ensureFreeColumn) — contrairement à "texte", qui n'a plus d'erreur possible ici.
    body.querySelector('[data-kind="choice"]').click();
    const label = body.querySelector('.qf-label');
    const desc = body.querySelector('.qf-desc');
    label.value = 'Un titre';
    // Le focus quitte le titre vers la description, DANS la même carte : le concepteur continue
    // de la remplir, ne doit voir ni enregistrement ni erreur de validation prématurée.
    label.dispatchEvent(new FocusEvent('focusout', { relatedTarget: desc }));
    await tick();
    assertEqual('pas encore de question créée (toujours en train de remplir la carte)', state.cfgQuestions.length, 0);
    assertEqual('pas d’erreur affichée prématurément', body.querySelector('.qf-msg').textContent.trim(), '');
    // Le focus quitte vraiment la carte (relatedTarget hors carte, ou aucun) : la validation peut
    // enfin se déclencher — erreur légitime ici, la table source n'a toujours pas été choisie,
    // mais au moins plus AVANT que le concepteur ait eu l'occasion de s'en occuper.
    label.dispatchEvent(new FocusEvent('focusout', { relatedTarget: null }));
    await tick();
    assertEqual('en quittant la carte, la validation (légitime, table source non choisie) se déclenche enfin',
      body.querySelector('.qf-msg').textContent.trim(), I18n.t('form.editor.pickSourceTableCol'));
  });

  await group('[data-del] : supprimer une question retire aussi les règles de condition qui la référençaient ailleurs', async () => {
    state.cfgQuestions = [
      { id: 'src1', kind: 'select', label: 'Statut', choices: ['Ouvert', 'Fermé'] },
      { id: 'q1', kind: 'text', label: 'Commentaire', writeTable: 'Main', writeCol: 'colA', condition: { mode: 'all', rules: [{ questionId: 'src1', op: 'equals', value: 'Ouvert' }] } },
      { id: 'q2', kind: 'text', label: 'Autre', writeTable: 'Main', writeCol: 'colB', condition: { mode: 'all', rules: [{ questionId: 'src1', op: 'equals', value: 'Ouvert' }, { questionId: 'q1', op: 'equals', value: 'x' }] } },
    ];
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = makeGristStub({
      listTables: ['Main'],
      fetchTable: (t) => (t === '_grist_Views_section' ? { id: [], parentId: [], parentKey: [], options: [] } : { id: [] }),
    }).grist;
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    const body = mount(document.createElement('div'));
    await renderCardBody('src1', body);
    body.querySelector('[data-del]').click();
    await tick();
    assertEqual('la question supprimée n’est plus dans la liste', state.cfgQuestions.some(q => q.id === 'src1'), false);
    assertEqual('q1 ne référençait plus qu’elle : condition entièrement retirée (plus jamais masquée à tort)', state.cfgQuestions.find(q => q.id === 'q1')?.condition, null);
    assertEqual('q2 : seule la règle sur la question supprimée est retirée, l’autre règle reste', state.cfgQuestions.find(q => q.id === 'q2')?.condition, { mode: 'all', rules: [{ questionId: 'q1', op: 'equals', value: 'x' }] });
  });

  await group('saveQuestionFromCard : section et bloc d’info', async () => {
    for (const k of ['section', 'info']) {
      state.cfgQuestions = [];
      state.mainTableIdCache = 'Main';
      state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
      window.grist = makeGristStub({ listTables: ['Main'] }).grist;
      state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
      const body = mount(document.createElement('div'));
      const { combos } = await renderCardBody('__new__', body);
      body.querySelector(`[data-kind="${k}"]`).click();
      body.querySelector('.qf-label').value = `Titre ${k}`;
      (k === 'info' ? body.querySelector('.qf-desc-long') : body.querySelector('.qf-desc')).value = 'un contenu';
      await saveQuestionFromCard('__new__', body, null, combos);
      assertEqual(`${k} : une entrée créée sans écriture de colonne`, state.cfgQuestions.length === 1 && !state.cfgQuestions[0].writeTable, true, JSON.stringify(state.cfgQuestions));
      assertEqual(`${k} : description reprise`, state.cfgQuestions[0]?.description, 'un contenu');
    }
  });

  await group('customizeNativeField : correspondance des types natifs, un champ à la fois (bouton « Personnaliser ce champ »)', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Reponses';
    state.currentLink = { api: 'https://fake/api/s/KEY', vsId: 1 };
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    const sectionFields = { id: [100, 101, 102, 103, 104, 105, 106, 107, 108], parentId: [1, 1, 1, 1, 1, 1, 1, 1, 1], widgetOptions: ['{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}', '{}'] };
    window.grist = makeGristStub({
      fetchTable: (t) => {
        if (t === '_grist_Tables_column') return { id: [], colId: [], parentId: [], type: [], visibleCol: [] };
        if (t === '_grist_Tables') return { id: [1], tableId: ['Reponses'] };
        if (t === '_grist_Views_section_field') return sectionFields;
        return {};
      },
    }).grist;
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
    // Un seul champ à la fois, dans l'ordre d'apparition : exactement ce que fait un clic sur
    // « Personnaliser ce champ » d'une carte native, jamais un bouton d'import en bloc (retiré).
    for (const id of [100, 101, 102, 103, 104, 105, 106, 107, 108]) {
      await customizeNativeField(String(id));
    }
    await tick();
    const kindByLabel = Object.fromEntries(state.cfgQuestions.map(q => [q.label, q.kind]));
    assertEqual('Text -> text', kindByLabel.Q1, 'text');
    assertEqual('Numeric -> number', kindByLabel.Q2, 'number');
    assertEqual('Date -> date', kindByLabel.Q3, 'date');
    assertEqual('Bool -> bool', kindByLabel.Q4, 'bool');
    assertEqual('Choice -> select', kindByLabel.Q5, 'select');
    assertEqual('ChoiceList -> multiselect', kindByLabel.Q6, 'multiselect');
    assertEqual('Attachments -> attachments', kindByLabel.Q7, 'attachments');
    assertEqual('DateTime -> datetime', kindByLabel.Q8, 'datetime');
    assertEqual('Text multiligne -> longtext', kindByLabel.Q9, 'longtext');
    assertEqual('tous les 9 champs personnalisés (plus aucun type ignoré)', state.cfgQuestions.length, 9);
    assertEqual('colonne existante reprise telle quelle pour Attachments', state.cfgQuestions.find(q => q.label === 'Q7')?.writeCol, 'g');
    assertEqual('options reprises pour Choice', state.cfgQuestions.find(q => q.label === 'Q5')?.choices, ['X', 'Y']);
    assert('importedFrom renseigné', state.cfgQuestions.every(q => !!q.importedFrom));
  });

  await group('customizeNativeField : type non pris en charge -> ignoré sans bouton ni crash', async () => {
    state.cfgQuestions = [];
    state.mainTableIdCache = 'Reponses';
    state.currentLink = { api: 'https://fake/api/s/KEY', vsId: 1 };
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    window.grist = makeGristStub({
      fetchTable: (t) => (t === '_grist_Tables' ? { id: [1], tableId: ['Reponses'] } : { id: [] }),
    }).grist;
    window.fetch = async () => ({
      ok: true, json: async () => ({ formFieldsById: { 200: { colId: 'z', type: 'ManualSortPos', question: 'Technique', options: {} } } }),
    });
    await customizeNativeField('200');
    await tick();
    assertEqual('aucune question créée pour un type sans correspondance', state.cfgQuestions.length, 0);
  });

  await group('resetQuestions : démasque uniquement les champs importés', async () => {
    const { grist, calls } = makeGristStub({
      fetchTable: (t) => t === '_grist_Views_section_field'
        ? { id: [10, 11], parentId: [1, 1], colRef: [100, 101], widgetOptions: ['{"formIsHidden":true}', '{"formIsHidden":true,"formRequired":true}'] }
        : (t === '_grist_Views_section'
          // Section 1 : le widget lui-même (self). Section 2 : portillon déjà publié pour
          // FormPlus_Formulaires (tref 50) sur la même page (1) — sans lui, saveConfig (appelé
          // par resetQuestions, qui s'assure maintenant aussi de la table, consigne 007)
          // tenterait de le créer, hors de propos ici.
          ? { id: [1, 2], parentId: [5, 1], parentKey: ['custom', 'form'], tableRef: [1, 50], shareOptions: [undefined, '{"publish":true,"form":true}'], options: ['{}', '{}'] }
          : (t === '_grist_Tables' ? { id: [1, 50], tableId: ['Main', FORMULAIRES_TABLE] }
            : (t === '_grist_Tables_column' ? { id: [], parentId: [], colId: [], type: [], visibleCol: [] } : {}))),
    });
    window.grist = grist;
    state.cfgQuestions = [{ id: 'q1', kind: 'text', label: 'Importée', importedFrom: '10' }, { id: 'q2', kind: 'number', label: 'Manuelle' }];
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1 };
    state.formRowId = null;
    // resetQuestions() ouvre la confirmation du kit (Dialogs.confirm, plus de window.confirm) :
    // la fenêtre est déjà affichée au retour de l'appel (synchrone jusqu'au premier await), on
    // clique son bouton principal « Réinitialiser » avant d'attendre la fin de resetQuestions().
    const resetDone = resetQuestions();
    document.querySelector('#pp-dialog-modal .pp-modal-primary').click();
    await resetDone;
    assertEqual('liste vidée', state.cfgQuestions, []);
    const unhideActions = calls.filter(a => a[0][0] === 'UpdateRecord' && a[0][1] === '_grist_Views_section_field');
    assertEqual('un seul champ démasqué (le champ importé, pas le manuel)', unhideActions.length, 1);
    assertEqual('cible bien la ligne 10 (importedFrom), pas la 11', unhideActions[0][0][2], 10);
    assertEqual('la configuration est aussi sauvegardée (ligne FormPlus_Formulaires)', calls.some(a => a[0][1] === FORMULAIRES_TABLE), true);
  });

  await group('renderQuestionList : fusion visuelle des champs natifs non importés dans #qlist (jalon J2)', async () => {
    state.cfgQuestions = [];
    state.expandedId = null;
    state.mainTableIdCache = 'Main';
    state.currentFormSection = { id: 1, viewRef: 1, tableRef: 1 };
    state.currentLink = { api: 'https://fake/api/s/KEY', vsId: 1 };
    state.options = { publicUrl: 'https://x', viewRef: 1, vsId: 1, questions: [] };
    let formFieldHidden = false;
    window.grist = makeGristStub({
      listTables: ['Main'],
      fetchTable: (t) => {
        if (t === '_grist_Tables_column') return { id: [], colId: [], parentId: [], type: [], visibleCol: [] };
        if (t === '_grist_Tables') return { id: [1], tableId: ['Main'] };
        if (t === '_grist_Views_section_field') return { id: [900], parentId: [1], widgetOptions: ['{}'] };
        return { id: [] };
      },
      onAction: (a) => {
        if (a[0] === 'UpdateRecord' && a[1] === '_grist_Views_section_field' && a[2] === 900) {
          try { if ((JSON.parse(a[3].widgetOptions) || {}).formIsHidden) formFieldHidden = true; } catch (e) { /* ignore */ }
        }
      },
    }).grist;
    window.fetch = async () => ({
      ok: true, json: async () => ({
        formFieldsById: { 900: { colId: 'z', type: 'Text', question: 'Nom', description: '', options: formFieldHidden ? { formIsHidden: true } : {} } },
      }),
    });
    renderQuestionList();
    // La carte native s'injecte après coup (aller-retour réseau) : laisse le temps à la promesse
    // de renderNativeFieldCards de se résoudre, sans dépendre d'un délai fixe.
    for (let i = 0; i < 20 && !$('qlist').querySelector('.qcard-native'); i++) await tick();
    const nativeCard = $('qlist').querySelector('.qcard-native');
    assert('le champ natif non importé apparaît dans #qlist (pas derrière un bouton séparé, retiré)', !!nativeCard);
    assertEqual('tag « Champ natif » affiché', nativeCard?.querySelector('.qcard-native-tag')?.textContent.trim(), I18n.t('form.editor.nativeFieldTag'));
    assert('contrôle natif réel rendu (même rendu que côté répondant, renderNativeField)', !!nativeCard?.querySelector('input#i900'));
    const customizeBtn = nativeCard.querySelector('[data-native-customize]');
    assert('bouton « Personnaliser ce champ » présent', !!customizeBtn);
    customizeBtn.click();
    for (let i = 0; i < 20 && !state.cfgQuestions.length; i++) await tick();
    assertEqual('devient une vraie question FormPlus après personnalisation', state.cfgQuestions[0]?.label, 'Nom');
    assert('importedFrom renseigné (pour "Réinitialiser les questions")', !!state.cfgQuestions[0]?.importedFrom);
    for (let i = 0; i < 20 && $('qlist').querySelector('.qcard-native'); i++) await tick();
    assertEqual('le champ, maintenant personnalisé, ne réapparaît plus en bordure pointillée', $('qlist').querySelector('.qcard-native'), null);

    // Nettoyage : cet état (lien natif factice, #qlist rempli) ne doit pas fuir vers les tests suivants.
    state.cfgQuestions = [];
    state.currentLink = null;
    renderQuestionList();
  });

  await group('showConfig : un clic rapide sur un autre onglet n’est pas écrasé par le forçage "Questions" (course de l’audit du 21 oct 2026)', async () => {
    state.editorTab = 'questions';
    state.editorTabPicked = false;
    state.options = {
      formLink: 'https://grist.example/o/team/forms/KEY/42',
      vsId: 42, sourceVsId: 42, viewRef: 7, publicUrl: 'https://x', questions: [],
    };
    window.grist = makeGristStub({
      fetchTable: (t) => (t === '_grist_Views_section' ? { id: [42], parentId: [7], tableRef: [1] } : { id: [] }),
    }).grist;
    window.fetch = async () => ({ ok: true, json: async () => ({ formFieldsById: {} }) });
    const configDone = showConfig();
    // Avant même que showConfig() ait fini de lire _grist_Views_section (son premier "await"),
    // on simule le clic du concepteur sur "Paramètres" — exactement le scénario de l'audit.
    document.querySelector('[data-etab="settings"]').click();
    await configDone;
    await tick();
    assertEqual('le choix du concepteur (Paramètres) n’est pas écrasé par le forçage "Questions"', state.editorTab, 'settings');
    assertEqual('l’onglet "Paramètres" est bien affiché (pas juste state.editorTab)', $('tab-settings').classList.contains('hidden'), false);
    show('test'); // showConfig() a basculé l'écran visible sur #config : on revient à #test pour la suite.
  });

  // CreateViewSection peuple automatiquement la nouvelle section d'un champ par colonne de la
  // table (comportement natif de Grist, voir grist-meta.js/clearAutoFields) : un mock réaliste de
  // _grist_Views_section_field doit donc en simuler au moins un pour que ce nettoyage soit
  // vérifié, plutôt qu'un mock vide qui ne peut jamais faire échouer ce test si le nettoyage
  // disparaissait un jour. La section créée (id 50) est directement renvoyée dans retValues,
  // comme le fait un vrai document Grist (voir createFormSection, grist-meta.js) : plus besoin de
  // la retrouver en re-lisant _grist_Views_section après coup.
  await group('createEmptyForm : réutilise une table existante, section vidée de ses champs auto-créés', async () => {
    const { grist, calls } = makeGristStub({
      fetchTable: (t) => {
        if (t === '_grist_Tables') return { tableId: ['Departements'], id: [1] };
        if (t === '_grist_Views_section_field') return { id: [201], parentId: [50] };
        return {};
      },
      onAction: (a) => (a[0] === 'CreateViewSection' ? { sectionRef: 50, viewRef: a[2] } : undefined),
    });
    window.grist = grist;
    const el = mount(document.createElement('div'));
    el.innerHTML = '<input id="t-scratchTable"><p id="t-scratchMsg"></p>';
    // createEmptyForm lit les vrais #scratchTable/#scratch-msg de la page (pas de la sandbox) :
    // on les renseigne directement, ils existent déjà de façon statique dans le document.
    $('scratchTable').value = 'Departements';
    Object.defineProperty(document, 'referrer', { value: 'https://grist.example.com/o/team/docs/abc/p/7', configurable: true });
    await createEmptyForm();
    assertEqual('deux actions : CreateViewSection puis retrait du champ auto-créé', calls.map(c => c[0][0]), ['CreateViewSection', 'RemoveRecord']);
    assertEqual('CreateViewSection sur la bonne table/page', calls[0][0], ['CreateViewSection', 1, 7, 'form', null, 'Departements']);
    assertEqual('le champ auto-créé (201) est bien retiré', calls[1][0], ['RemoveRecord', '_grist_Views_section_field', 201]);
    assert('message de succès (formulaire réellement vide)', $('scratch-msg').innerHTML.includes('ok'));
  });

  await group('createEmptyForm : crée une nouvelle table', async () => {
    let tablesState = { tableId: ['Departements'], id: [1] };
    const { grist, calls } = makeGristStub({
      fetchTable: (t) => {
        if (t === '_grist_Tables') return { ...tablesState };
        if (t === '_grist_Views_section') return { id: [], parentId: [], tableRef: [], parentKey: [] };
        if (t === '_grist_Views_section_field') return { id: [], parentId: [] };
        return {};
      },
      onAction: (a) => {
        if (a[0] === 'AddTable') tablesState = { tableId: [...tablesState.tableId, 'Reponses'], id: [...tablesState.id, 2] };
        if (a[0] === 'CreateViewSection') return { sectionRef: 99 };
      },
    });
    window.grist = grist;
    $('scratchTable').value = 'Réponses';
    Object.defineProperty(document, 'referrer', { value: 'https://grist.example.com/o/team/docs/abc/p/7', configurable: true });
    await createEmptyForm();
    assertEqual('deux actions : AddTable puis CreateViewSection (rien à retirer, aucun champ auto simulé ici)', calls.map(c => c[0][0]), ['AddTable', 'CreateViewSection']);
    assertEqual('CreateViewSection cible la table nouvellement créée (ref 2)', calls[1][0][1], 2);
  });

  await group('createEmptyForm : page introuvable -> message clair, aucune action', async () => {
    const { grist, calls } = makeGristStub({ fetchTable: () => ({ tableId: [], id: [] }) });
    window.grist = grist;
    $('scratchTable').value = 'Table';
    Object.defineProperty(document, 'referrer', { value: '', configurable: true });
    await createEmptyForm();
    assertEqual('aucune action déclenchée', calls.length, 0);
    assert('message d’erreur affiché', $('scratch-msg').innerHTML.includes('err'));
  });

  await group('createEmptyForm : référent illisible mais widget retrouvé via les métadonnées -> page correcte', async () => {
    const myFile = location.pathname.split('/').pop();
    const { grist, calls } = makeGristStub({
      fetchTable: (t) => {
        if (t === '_grist_Tables') return { tableId: ['Departements'], id: [1] };
        if (t === '_grist_Views_section') return {
          // tableRef/parentKey doivent être définis pour TOUTES les sections, comme sur un vrai
          // document Grist : cette section personnalisée (le widget lui-même) n'est pas une
          // section "form", donc exclue par parentKey quel que soit son tableRef.
          id: [9], parentId: [7], tableRef: [1], parentKey: ['custom'],
          options: [JSON.stringify({ customView: JSON.stringify({ url: `https://cdn.example.com/${myFile}` }) })],
        };
        if (t === '_grist_Views_section_field') return { id: [], parentId: [] };
        return {};
      },
      onAction: () => ({ sectionRef: 55 }),
    });
    window.grist = grist;
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

  await group('populateFormPicker : liste et filtre les formulaires natifs', async () => {
    window.grist = makeGristStub({
      fetchTable: (t) => {
        if (t === '_grist_Views_section') return {
          id: [1, 2, 3], parentKey: ['form', 'form', 'form'], tableRef: [10, 20, 30], parentId: [5, 6, 7],
          shareOptions: ['{"publish":true,"form":true}', '{}', '{"publish":true,"form":true}'],
        };
        if (t === '_grist_Tables') return { id: [10, 20, 30], tableId: ['Reponses', 'Brouillon', '_grist_Interne'] };
        return {};
      },
    }).grist;
    await populateFormPicker();
    assertEqual('table technique _grist_* exclue de la liste', state.formPickerItems.map(it => it.tableId), ['Reponses', 'Brouillon']);
    assertEqual('statut publié détecté', state.formPickerItems.find(it => it.tableId === 'Reponses')?.published, true);
    assertEqual('statut non publié détecté', state.formPickerItems.find(it => it.tableId === 'Brouillon')?.published, false);
    assertEqual('options du <select> (une de plus pour "choisir")', $('formPicker').options.length, 3);
  });

  await group('populateFormPicker : exclut les copies créées par FormPlus (FormPlus_Formulaires)', async () => {
    // Depuis la 007, une copie gérée par FormPlus n'est plus marquée par un `options.formplusDuplicate`
    // (plus écrit) mais reconnue via FormPlus_Formulaires.Definition.vsId (fetchManagedVsIds).
    window.grist = makeGristStub({
      fetchTable: (t) => {
        if (t === '_grist_Views_section') return {
          id: [1, 2], parentKey: ['form', 'form'], tableRef: [10, 10], parentId: [5, 5],
          shareOptions: ['{"publish":true,"form":true}', '{"publish":true,"form":true}'],
        };
        if (t === '_grist_Tables') return { id: [10], tableId: ['Reponses'] };
        if (t === FORMULAIRES_TABLE) return { id: [1], Definition: ['{"vsId":2,"sourceVsId":1}'] };
        return {};
      },
    }).grist;
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
    // Indépendant de la langue active (I18n.t) : le texte français en dur ferait échouer ce test
    // en anglais (voir kit, I18n.setLanguage et run-widget-tests.js, qui joue la suite en fr-FR
    // ET en en-US).
    assertEqual('message explicite : publier puis copier le lien', $('formPicker-msg').innerHTML, `<span class="err">${I18n.t('form.editor.formNotPublishedYet')}</span>`);
    assertEqual('le champ lien manuel reste vide (aucune tentative)', $('link').value, '');
  });

  await group('sélection dans formPicker : formulaire publié -> consigne de copier le lien, pas de génération automatique', async () => {
    // Depuis la 007, plus de lecture de _grist_Shares (refusée par GFS) : aucune adresse n'est
    // plus reconstruite automatiquement, la personne colle toujours elle-même le lien.
    state.formPickerItems = [{ vsId: 12, viewRef: 7, tableId: 'Reponses', published: true }];
    $('formPicker').innerHTML = '<option value="12">Reponses</option>';
    $('formPicker').value = '12';
    $('link').value = '';
    $('formPicker').dispatchEvent(new Event('change'));
    await tick();
    assertEqual('le champ lien manuel reste vide (aucune tentative)', $('link').value, '');
    assertEqual('consigne de copier le lien affichée', $('formPicker-msg').innerHTML, `<span class="ok">${I18n.t('form.editor.pickedPasteLink')}</span>`);
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
    const { grist, calls } = makeGristStub({
      listTables: ['Reponses'],
      fetchTable: (t) => {
        if (t === '_grist_Pages') return { id: [1], viewRef: [7], shareRef: [9] };
        if (t === '_grist_Shares') return { id: [9], linkId: ['SECRETKEY'] };
        if (t === '_grist_Views_section') return { ...sectionsState };
        if (t === '_grist_Views_section_field') return { ...fieldsState };
        // FormPlus_Formulaires déjà créée (tref 50) : ensureFormulairesTable (appelée par
        // generate() avant toute duplication, consigne 007) ne doit pas rouvrir sa fenêtre de
        // consentement ici — ce test vérifie la duplication, pas cette fenêtre (voir le groupe
        // dédié à ensureFormulairesTable plus bas).
        if (t === '_grist_Tables') return { id: [10, 50], tableId: ['Reponses', 'FormPlus_Formulaires'] };
        if (t === '_grist_Tables_column') return { id: [], parentId: [], colId: [], type: [], visibleCol: [] };
        return {};
      },
      onAction: (a) => {
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
          // Comme un vrai document Grist (voir createFormSection, grist-meta.js) : l'id créé
          // est renvoyé directement dans retValues, jamais retrouvé en re-lisant les tables.
          return { sectionRef: newId };
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
      },
    });
    window.grist = grist;
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
    assertEqual('la copie n’écrit plus rien dans ses options (plus de marqueur, consigne 007)', sectionsState.options[dupIdx], '{}');
    assertEqual('la copie est publiée sous la clé existante (pas de republication manuelle)', JSON.parse(sectionsState.shareOptions[dupIdx]), { publish: true, form: true });

    // Recoller EXACTEMENT le même lien : on garde la copie déjà créée, pas de duplication en double.
    const callsBefore = calls.length;
    await generate();
    await tick();
    assertEqual('même copie réutilisée au second collage', state.currentFormSection?.id, dupVsId);
    assertEqual('aucune nouvelle section créée', calls.slice(callsBefore).flatMap(a => a).some(a => a[0] === 'CreateViewSection'), false);
  });

  await group('generate() : verrou de ré-entrance, un double déclenchement (clic + Entrée) ne duplique jamais deux fois', async () => {
    state.options = {};
    state.cfgQuestions = [];
    state.generating = false;
    // FormPlus_Formulaires déjà créée ET déjà gérée (section 40, formulaire vide publié sur la
    // même page 7) : ensureFormulairesTable (generate(), avant toute duplication) ne doit alors
    // déclencher ni fenêtre de consentement ni CreateViewSection, pour ne pas fausser le compte
    // ci-dessous (qui ne doit voir QUE la duplication du formulaire natif, jamais deux fois).
    const sectionsState = {
      id: [12, 40], parentId: [7, 7], parentKey: ['form', 'form'], tableRef: [10, 50],
      shareOptions: ['{"publish":true,"form":true}', '{"publish":true,"form":true}'], options: ['{}', '{}'],
    };
    let nextSectionId = 100;
    const { grist, calls } = makeGristStub({
      listTables: ['Reponses'],
      fetchTable: (t) => {
        if (t === '_grist_Pages') return { id: [1], viewRef: [7], shareRef: [9] };
        if (t === '_grist_Shares') return { id: [9], linkId: ['SECRETKEY'] };
        if (t === '_grist_Views_section') return { ...sectionsState };
        if (t === '_grist_Views_section_field') return { id: [], parentId: [], colRef: [], widgetOptions: [], parentPos: [] };
        if (t === '_grist_Tables') return { id: [10, 50], tableId: ['Reponses', 'FormPlus_Formulaires'] };
        if (t === '_grist_Tables_column') return { id: [], parentId: [], colId: [], type: [], visibleCol: [] };
        return {};
      },
      // Round-trip volontairement lent : laisse le temps à un second appel synchrone de
      // generate() (double-clic, ou clic après un Entrée déjà en vol) de s'exécuter avant que
      // le premier n'ait fini, si le verrou de ré-entrance ne l'empêchait pas.
      onAction: async (a) => {
        await tick();
        if (a[0] === 'CreateViewSection') {
          const newId = nextSectionId++;
          sectionsState.id = [...sectionsState.id, newId];
          sectionsState.parentId = [...sectionsState.parentId, a[2]];
          sectionsState.parentKey = [...sectionsState.parentKey, 'form'];
          sectionsState.tableRef = [...sectionsState.tableRef, a[1]];
          sectionsState.shareOptions = [...sectionsState.shareOptions, '{}'];
          sectionsState.options = [...sectionsState.options, '{}'];
          return { sectionRef: newId };
        }
      },
    });
    window.grist = grist;
    Object.defineProperty(document, 'referrer', { value: 'https://grist.example.com/o/team/docs/abc/p/7', configurable: true });
    $('link').value = 'https://grist.example.com/o/team/forms/SECRETKEY/12';
    const p1 = generate();
    const p2 = generate(); // synchrone, juste après : doit être ignoré tant que p1 n'est pas fini
    await Promise.all([p1, p2]);
    await tick();
    const createCalls = calls.flatMap(a => a).filter(a => a[0] === 'CreateViewSection');
    assertEqual('une seule section dupliquée créée, jamais deux', createCalls.length, 1, JSON.stringify(createCalls));
  });

  await group('saveConfig : deux sauvegardes rapprochées, l’ordre d’appel décide toujours (jamais la vitesse du réseau)', async () => {
    state.currentLink = null;
    state.cfgQuestions = [];
    ['opt-title', 'opt-desc', 'opt-logo', 'opt-emoji', 'opt-accent', 'opt-submit', 'opt-endmsg', 'opt-redirect'].forEach(k => { $(k).value = ''; });
    $('opt-progress').checked = false;
    state.options = { formLink: '' };
    let fetchCount = 0;
    let unblockFirst;
    window.grist = makeGristStub({
      fetchTable: async (t) => {
        if (t === '_grist_Views_section') {
          fetchCount++;
          // Seul le PREMIER appel (le premier saveConfig) est ralenti : simule un aller-retour
          // réseau plus lent pour l'appel parti en premier que pour celui parti juste après.
          if (fetchCount === 1) await new Promise(r => { unblockFirst = r; });
          return { id: [], parentId: [], parentKey: [], options: [] };
        }
        return {};
      },
    }).grist;
    const p1 = saveConfig('https://x/premier', 1);
    await tick(); // laisse le 1er appel démarrer et se bloquer sur son fetchTable
    const p2 = saveConfig('https://x/second', 2); // 2e appel, lancé juste après le 1er
    await tick();
    unblockFirst(); // le 1er débloque enfin, APRÈS que le 2e ait été lancé
    await Promise.all([p1, p2]);
    assertEqual('la configuration finale reflète le DERNIER appel, jamais le premier même débloqué après', state.options.publicUrl, 'https://x/second');
  });

  // ensureTableGate n'avait jusqu'ici AUCUN test (contrairement à duplicateFormSection ci-dessus,
  // qui simule déjà l'auto-remplissage de CreateViewSection) : la section « portillon » qu'elle
  // publie n'était en réalité jamais vidée de ses champs auto-créés, ce qui l'exposait comme un
  // vrai formulaire natif complet et public sur la table cible — voir clearAutoFields (grist-meta.js).
  await group('ensureTableGate : la section "portillon" est vidée de ses champs auto-créés avant publication', async () => {
    let sectionsState = { id: [], parentId: [], parentKey: [], tableRef: [], shareOptions: [] };
    let fieldsState = { id: [], parentId: [] };
    let nextSectionId = 900, nextFieldId = 9000;
    const { grist, calls } = makeGristStub({
      fetchTable: (t) => {
        if (t === '_grist_Tables') return { id: [20], tableId: ['Secondaire'] };
        if (t === '_grist_Views_section') return { ...sectionsState };
        if (t === '_grist_Views_section_field') return { ...fieldsState };
        return {};
      },
      onAction: (a) => {
        if (a[0] === 'CreateViewSection') {
          const newId = nextSectionId++;
          sectionsState = {
            id: [...sectionsState.id, newId], parentId: [...sectionsState.parentId, a[2]],
            parentKey: [...sectionsState.parentKey, 'form'], tableRef: [...sectionsState.tableRef, a[1]],
            shareOptions: [...sectionsState.shareOptions, '{}'],
          };
          // Comportement réel de Grist (voir duplicateFormSection ci-dessus) : la table cible
          // a 2 colonnes, donc 2 champs apparaissent automatiquement sur la nouvelle section.
          for (const colRef of [700, 701]) {
            fieldsState = { id: [...fieldsState.id, nextFieldId++], parentId: [...fieldsState.parentId, newId] };
          }
          return { sectionRef: newId };
        } else if (a[0] === 'RemoveRecord' && a[1] === '_grist_Views_section_field') {
          const idx = fieldsState.id.indexOf(a[2]);
          if (idx >= 0) fieldsState = { id: fieldsState.id.filter((_, i) => i !== idx), parentId: fieldsState.parentId.filter((_, i) => i !== idx) };
        } else if (a[0] === 'UpdateRecord' && a[1] === '_grist_Views_section') {
          const idx = sectionsState.id.indexOf(a[2]);
          if (idx >= 0 && a[3].shareOptions !== undefined) {
            const arr = [...sectionsState.shareOptions]; arr[idx] = a[3].shareOptions; sectionsState.shareOptions = arr;
          }
        }
      },
    });
    window.grist = grist;
    const result = await ensureTableGate('Secondaire', 7);
    assert('section signalée comme créée', result.created === true);
    assertEqual('sectionId de la section créée renvoyé (utilisé par "Choix depuis une table" écrivant ailleurs)', result.sectionId, 900);
    assertEqual('plus aucun champ sur la section une fois publiée : réellement vide', fieldsState.id.length, 0);
    const allActions = calls.flatMap(a => a);
    const removeCalls = allActions.filter(a => a[0] === 'RemoveRecord' && a[1] === '_grist_Views_section_field');
    assertEqual('les 2 champs auto-créés sont retirés', removeCalls.length, 2);
    const publishIdx = allActions.findIndex(a => a[0] === 'UpdateRecord' && a[1] === '_grist_Views_section');
    const lastRemoveIdx = allActions.map((a, i) => (a[0] === 'RemoveRecord' ? i : -1)).filter(i => i >= 0).pop();
    assert('le nettoyage a bien lieu AVANT la publication', lastRemoveIdx < publishIdx);
    assertEqual('shareOptions posé après coup', JSON.parse(allActions[publishIdx][3].shareOptions), { publish: true, form: true });

    // Rappelée pour la même table déjà ouverte : ne recrée jamais une seconde section.
    const callsBefore = calls.length;
    const result2 = await ensureTableGate('Secondaire', 7);
    assertEqual('déjà ouvert : aucune nouvelle section', result2.created, false);
    assertEqual('déjà ouvert : renvoie quand même le sectionId de la section existante', result2.sectionId, 900);
    assertEqual('aucun nouvel appel', calls.length, callsBefore);
  });

  // ───────────────────────── Table FormPlus_Formulaires (consigne 007) ─────────────────────────

  await group('ensureFormulairesTable : table absente, consentement accepté -> table créée, colonnes posées, portillon ouvert', async () => {
    let tablesState = { id: [], tableId: [] };
    let columnsState = { id: [], parentId: [], colId: [], type: [] };
    let sectionsState = { id: [], parentId: [], parentKey: [], tableRef: [], shareOptions: [] };
    let nextTref = 90, nextColRef = 900, nextSectionId = 9000;
    const { grist, calls } = makeGristStub({
      fetchTable: (t) => {
        if (t === '_grist_Tables') return { ...tablesState };
        if (t === '_grist_Tables_column') return { ...columnsState };
        if (t === '_grist_Views_section') return { ...sectionsState };
        if (t === '_grist_Views_section_field') return { id: [], parentId: [] };
        return {};
      },
      onAction: (a) => {
        if (a[0] === 'AddTable') {
          const tref = nextTref++;
          tablesState = { id: [...tablesState.id, tref], tableId: [...tablesState.tableId, a[1]] };
          for (const col of a[2]) {
            columnsState = {
              id: [...columnsState.id, nextColRef++], parentId: [...columnsState.parentId, tref],
              colId: [...columnsState.colId, col.id], type: [...columnsState.type, col.type],
            };
          }
        } else if (a[0] === 'AddColumn') {
          const tref = tablesState.id[tablesState.tableId.indexOf(a[1])];
          columnsState = {
            id: [...columnsState.id, nextColRef++], parentId: [...columnsState.parentId, tref],
            colId: [...columnsState.colId, a[2]], type: [...columnsState.type, a[3]?.type],
          };
        } else if (a[0] === 'CreateViewSection') {
          const newId = nextSectionId++;
          sectionsState = {
            id: [...sectionsState.id, newId], parentId: [...sectionsState.parentId, a[2]],
            parentKey: [...sectionsState.parentKey, 'form'], tableRef: [...sectionsState.tableRef, a[1]],
            shareOptions: [...sectionsState.shareOptions, '{}'],
          };
          return { sectionRef: newId };
        } else if (a[0] === 'UpdateRecord' && a[1] === '_grist_Views_section') {
          const idx = sectionsState.id.indexOf(a[2]);
          if (idx >= 0 && a[3].shareOptions !== undefined) { const arr = [...sectionsState.shareOptions]; arr[idx] = a[3].shareOptions; sectionsState.shareOptions = arr; }
        }
      },
    });
    window.grist = grist;
    // ensureFormulairesTable ouvre la confirmation du kit (règle 4 du guide GFS), mais seulement
    // après un premier aller-retour asynchrone (getTableRef) — contrairement à resetQuestions,
    // qui l'ouvre directement : laisser passer ce tick avant de chercher le bouton, sinon le clic
    // arrive trop tôt (rien à cliquer, ou le bouton d'une fenêtre précédente déjà refermée) et la
    // vraie fenêtre, ouverte juste après, n'est jamais cliquée.
    const done = ensureFormulairesTable(7);
    await tick(); await tick();
    document.querySelector('#pp-dialog-modal .pp-modal-primary').click();
    await done;
    assert('la table existe désormais', tablesState.tableId.includes(FORMULAIRES_TABLE));
    assertEqual('les 6 colonnes sont posées (4 du manifeste + Definition + IdSectionWidget)', columnsState.colId.length, 6);
    assert('toutes les colonnes attendues sont présentes', ['Nom', 'TypeFormulaire', 'DateModif', 'ModifiePar', 'Definition', 'IdSectionWidget'].every(c => columnsState.colId.includes(c)));
    assert('un portillon (section de formulaire publiée) est posé sur la page', sectionsState.shareOptions.some(o => { try { return JSON.parse(o).publish && JSON.parse(o).form; } catch (e) { return false; } }));
  });

  await group('ensureFormulairesTable : consentement refusé -> rien n’est créé, échec explicite', async () => {
    const { grist, calls } = makeGristStub({ fetchTable: (t) => (t === '_grist_Tables' ? { id: [], tableId: [] } : {}) });
    window.grist = grist;
    let caught = null;
    const done = ensureFormulairesTable(7).catch(e => { caught = e; });
    await tick(); await tick();
    document.querySelector('#pp-dialog-modal .pp-modal-actions button:not(.pp-modal-primary)').click();
    await done;
    // Indépendant de la langue active (voir run-widget-tests.js, qui joue la suite en fr-FR ET en
    // en-US) : comparé au texte résolu par I18n, jamais à un mot français en dur.
    assertEqual('rejet avec un message explicite', caught && caught.message, I18n.t('form.editor.formulairesTableDeclined'));
    assertEqual('aucune action tentée (ni AddTable, ni autre)', calls.length, 0);
  });

  await group('saveFormDefinition : crée une ligne la première fois, met à jour la même ensuite', async () => {
    let rowsState = { id: [], Nom: [], TypeFormulaire: [], DateModif: [], ModifiePar: [], Definition: [], IdSectionWidget: [] };
    let nextRowId = 1;
    const { grist, calls } = makeGristStub({
      fetchTable: (t) => (t === '_grist_Tables' ? { id: [50], tableId: [FORMULAIRES_TABLE] } : (t === FORMULAIRES_TABLE ? { ...rowsState } : {})),
      onAction: (a) => {
        if (a[0] === 'AddRecord' && a[1] === FORMULAIRES_TABLE) {
          const id = nextRowId++;
          rowsState = {
            id: [...rowsState.id, id], Nom: [...rowsState.Nom, a[3].Nom], TypeFormulaire: [...rowsState.TypeFormulaire, a[3].TypeFormulaire],
            DateModif: [...rowsState.DateModif, a[3].DateModif], ModifiePar: [...rowsState.ModifiePar, a[3].ModifiePar],
            Definition: [...rowsState.Definition, a[3].Definition], IdSectionWidget: [...rowsState.IdSectionWidget, a[3].IdSectionWidget],
          };
          return id;
        } else if (a[0] === 'UpdateRecord' && a[1] === FORMULAIRES_TABLE) {
          const idx = rowsState.id.indexOf(a[2]);
          if (idx >= 0) { const arr = [...rowsState.Definition]; arr[idx] = a[3].Definition; rowsState.Definition = arr; }
        }
      },
    });
    window.grist = grist;
    state.formRowId = null;
    const self = { id: 42 };
    const rowId1 = await saveFormDefinition(self, { formTitle: 'Mon formulaire', vsId: 12, formLink: 'https://x/forms/K/12' });
    assertEqual('une seule ligne créée', rowsState.id.length, 1);
    assertEqual('IdSectionWidget référence la section du widget', rowsState.IdSectionWidget[0], 42);
    assertEqual('Definition porte bien formTitle/vsId', JSON.parse(rowsState.Definition[0]).vsId, 12);
    assertEqual('state.formRowId mis en cache', state.formRowId, rowId1);

    await saveFormDefinition(self, { formTitle: 'Titre modifié', vsId: 12, formLink: 'https://x/forms/K/12' });
    assertEqual('toujours une seule ligne (mise à jour, pas une seconde création)', rowsState.id.length, 1);
    assertEqual('Definition mise à jour', JSON.parse(rowsState.Definition[0]).formTitle, 'Titre modifié');
    const addCalls = calls.flatMap(a => a).filter(a => a[0] === 'AddRecord' && a[1] === FORMULAIRES_TABLE);
    assertEqual('un seul AddRecord au total (le second appel a fait un UpdateRecord)', addCalls.length, 1);
  });

  await group('resolveMyDefinition : ligne déjà présente (IdSectionWidget) -> lue depuis la table ; sinon repli sur les anciennes options', async () => {
    Object.defineProperty(document, 'referrer', { value: 'https://grist.example.com/o/team/docs/abc/p/7', configurable: true });
    const myFile = location.pathname.split('/').pop();
    state.formRowId = null;
    window.grist = makeGristStub({
      fetchTable: (t) => {
        if (t === '_grist_Views_section') return {
          id: [1], parentId: [7], parentKey: ['custom'],
          options: [JSON.stringify({ customView: JSON.stringify({ url: `https://cdn.example.com/${myFile}`, widgetOptions: { formTitle: 'Ancien format' } }) })],
        };
        if (t === FORMULAIRES_TABLE) return { id: [5], IdSectionWidget: [1], Definition: [JSON.stringify({ formTitle: 'Dans la table' })] };
        return {};
      },
    }).grist;
    const def = await resolveMyDefinition();
    assertEqual('lue depuis FormPlus_Formulaires quand la ligne existe', def.formTitle, 'Dans la table');
    assertEqual('state.formRowId retrouvé', state.formRowId, 5);

    state.formRowId = null;
    window.grist = makeGristStub({
      fetchTable: (t) => {
        if (t === '_grist_Views_section') return {
          id: [1], parentId: [7], parentKey: ['custom'],
          options: [JSON.stringify({ customView: JSON.stringify({ url: `https://cdn.example.com/${myFile}`, widgetOptions: { formTitle: 'Ancien format' } }) })],
        };
        if (t === FORMULAIRES_TABLE) return { id: [], IdSectionWidget: [], Definition: [] };
        return {};
      },
    }).grist;
    const legacy = await resolveMyDefinition();
    assertEqual('repli sur les anciennes options (formulaire pas encore migré)', legacy.formTitle, 'Ancien format');
  });

  await group('fetchManagedVsIds : les vsId déjà gérés par FormPlus (une ligne par formulaire)', async () => {
    window.grist = makeGristStub({
      fetchTable: (t) => (t === FORMULAIRES_TABLE
        ? { id: [1, 2], Definition: [JSON.stringify({ vsId: 12 }), JSON.stringify({ vsId: 34 })] }
        : {}),
    }).grist;
    const ids = await fetchManagedVsIds();
    assertEqual('les deux vsId sont présents', [...ids].sort(), [12, 34]);

    window.grist = makeGristStub({ fetchTable: () => { throw new Error('table absente'); } }).grist;
    const empty = await fetchManagedVsIds();
    assertEqual('table absente -> ensemble vide, jamais d’erreur', [...empty], []);
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
      { id: 'q14', kind: 'datetime', label: 'RDV', writeTable: 'Reponses', writeCol: 'RDV' },
      { id: 'q15', kind: 'scale', label: 'Note', scaleMin: 0, scaleMax: 10, writeTable: 'Reponses', writeCol: 'NoteCol' },
      { id: 'q16', kind: 'ranking', label: 'Classement', choices: ['A', 'B', 'C'], writeTable: 'Reponses', writeCol: 'Classement' },
      { id: 'q17', kind: 'reflist', label: 'Refs', writeTable: 'Reponses', writeCol: 'RefsCol' },
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
    formEl.querySelector('#eq-q14').value = '2026-01-02T10:30';
    formEl.querySelector('#eq-q15').value = '7';
    // Simule le résultat d'un clic sur "descendre" (voir le câblage dans renderFill, non rejoué
    // ici) : déplace le premier élément en fin de liste, A/B/C -> B/C/A. onSubmit relit l'ordre
    // des <li> dans le DOM tel quel, peu importe comment on l'y a amené.
    { const list = formEl.querySelector('#eq-q16'); list.appendChild(list.children[0]); }
    // Simule le résultat du chargement des options d'une "liste de références" (voir la boucle
    // de chargement dans renderFill, non rejouée ici) : des cases à cocher, deux cochées.
    formEl.querySelector('#eq-q17').innerHTML = '<div class="pv-pill-group">' +
      '<label class="pv-pill"><input type="checkbox" name="eqm-q17" value="1"><span>Alpha</span></label>' +
      '<label class="pv-pill"><input type="checkbox" name="eqm-q17" value="2"><span>Beta</span></label></div>';
    formEl.querySelectorAll('#eq-q17 input[type=checkbox]').forEach(c => { c.checked = true; });

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
    assertEqual('date et heure : chaîne ISO conservée telle quelle', fields.RDV, '2026-01-02T10:30');
    assertEqual('échelle : convertie en nombre', fields.NoteCol, 7);
    assertEqual('classement : ordre du DOM, joint en texte', fields.Classement, 'B, C, A');
    assertEqual('liste de références : toutes les cases cochées, en RefList', fields.RefsCol, ['L', 1, 2]);
    assert('titre de section absent des champs envoyés', !('Section' in fields));
    assert('bloc d’info absent des champs envoyés', !('Info' in fields));
    assert('pièces jointes absentes des champs de la table principale (envoyées à part)', !('Justificatif' in fields) && !('PJ' in fields));
    await tick();
    assertEqual('écriture séparée vers la table Autre', extraTableWrites[0]?.[0], ['AddRecord', 'Autre', null, { Texte: 'Bonjour' }]);
    assertEqual('pièce jointe : upload puis écriture séparée vers la table Pieces', extraTableWrites[1]?.[0], ['AddRecord', 'Pieces', null, { PJ: ['L', 99] }]);
  });

  await group('onSubmit : signature envoyée comme pièce jointe (jamais en texte, voir docs/01)', async () => {
    const form = { formTableId: 'Reponses', formFieldsById: {} };
    const link = { api: 'https://fake/api/s/KEY' };
    const q = { id: 'qsig', kind: 'signature', label: 'Signature', required: true, writeTable: 'Pieces', writeCol: 'Sig' };
    const formEl = mount(document.createElement('form'));
    formEl.innerHTML = `<input type="text" name="_website" value="" style="display:none">${renderExtraQuestion(q)}<span id="fill-status"></span><button type="submit"></button>`;

    let uploadedFiles = null;
    window.grist = { docApi: { applyUserActions: async () => ({}) } };
    window.fetch = async (url, opts) => {
      if (String(url).includes('/attachments')) { uploadedFiles = [...opts.body.getAll('upload')]; return { ok: true, json: async () => ([77]) }; }
      if (String(url).includes('/tables/Reponses/records')) return { ok: true, json: async () => ({ records: [{ id: 1 }] }) };
      return { ok: true, json: async () => ({}) };
    };
    state.options = {};

    // Rien dessiné : "obligatoire" doit bloquer l'envoi, jamais de requête réseau.
    await onSubmit({ preventDefault() {}, target: formEl }, form, link, [q]);
    await tick();
    assert('signature vide + obligatoire : la carte est marquée invalide', formEl.querySelector('.pv-signature').closest('.q').classList.contains('invalid'));
    assertEqual('signature vide + obligatoire : aucun envoi tenté', uploadedFiles, null);

    // Dessine un trait (canvas réel, ce test tourne dans un vrai Chromium, pas un DOM simulé).
    const canvas = formEl.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillRect(10, 10, 50, 50);
    formEl.querySelector('.pv-signature').dataset.drawn = '1';

    await onSubmit({ preventDefault() {}, target: formEl }, form, link, [q]);
    await tick();
    assertEqual('signature dessinée : un seul fichier envoyé', uploadedFiles?.length, 1);
    assertEqual('signature dessinée : image PNG, jamais du texte base64 dans une colonne', uploadedFiles?.[0]?.type, 'image/png');
  });

  await group('onSubmit : l’envoi d’une pièce jointe porte l’en-tête anti-CSRF attendu par Grist', async () => {
    // Sans cet en-tête (ou un Content-Type: application/json, impossible ici puisque le corps
    // est un FormData), Grist refuse en 401 toute requête anonyme de modification — vu par le
    // navigateur comme une simple erreur réseau (bug constaté en production, jamais détecté par
    // cette suite tant que le mock ci-dessous ne vérifiait pas l'en-tête réellement envoyé).
    const form = { formTableId: 'Reponses', formFieldsById: {} };
    const link = { api: 'https://fake/api/s/KEY' };
    const formEl = mount(document.createElement('form'));
    formEl.innerHTML = `<input type="text" name="_website" value="" style="display:none">
      <div class="q pv-q" data-native="1" data-type="Attachments" data-col="PJ" data-required="0"><input type="file" multiple></div>
      <span id="fill-status"></span><button type="submit"></button>`;
    const dt = new DataTransfer();
    dt.items.add(new File(['contenu'], 'x.pdf', { type: 'application/pdf' }));
    formEl.querySelector('input[type=file]').files = dt.files;
    let capturedHeaders = null;
    window.fetch = async (url, opts) => {
      if (String(url).includes('/attachments')) { capturedHeaders = opts.headers; return { ok: true, json: async () => ([1]) }; }
      if (String(url).includes('/tables/Reponses/records')) return { ok: true, json: async () => ({ records: [{ id: 1 }] }) };
      return { ok: true, json: async () => ({}) };
    };
    state.options = {};
    await onSubmit({ preventDefault() {}, target: formEl }, form, link, []);
    await tick();
    assertEqual('X-Requested-With: XMLHttpRequest envoyé avec le fichier', capturedHeaders?.['X-Requested-With'], 'XMLHttpRequest');
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

  await group('onSubmit : nombre de pièces jointes acceptées différent du nombre envoyé -> erreur bloquante (table principale)', async () => {
    const form = { formTableId: 'Reponses', formFieldsById: {} };
    const link = { api: 'https://fake/api/s/KEY' };
    const formEl = mount(document.createElement('form'));
    formEl.innerHTML = `<input type="text" name="_website" value="" style="display:none">
      <div class="q pv-q" data-native="1" data-type="Attachments" data-col="PJ" data-required="0"><input type="file" multiple></div>
      <span id="fill-status"></span><button type="submit"></button>`;
    const dt = new DataTransfer();
    dt.items.add(new File(['contenu'], 'x.pdf', { type: 'application/pdf' }));
    formEl.querySelector('input[type=file]').files = dt.files;
    let recordsCalled = false;
    window.fetch = async (url) => {
      if (String(url).includes('/attachments')) return { ok: true, json: async () => ([]) }; // 0 accepté sur 1 envoyé
      if (String(url).includes('/tables/Reponses/records')) { recordsCalled = true; return { ok: true, json: async () => ({ records: [{ id: 1 }] }) }; }
      return { ok: true, json: async () => ({}) };
    };
    state.options = {};
    await onSubmit({ preventDefault() {}, target: formEl }, form, link, []);
    await tick();
    assert('message d’erreur explicite (compte de fichiers)', $('fill-status').textContent.includes('0/1'));
    assertEqual('la réponse n’est jamais envoyée si l’upload d’une pièce jointe obligatoire à la table principale échoue', recordsCalled, false);
  });

  await group('onSubmit : l’échec de l’upload d’une pièce jointe d’une question annexe (autre table) reste non bloquant', async () => {
    const form = { formTableId: 'Reponses', formFieldsById: {} };
    const link = { api: 'https://fake/api/s/KEY' };
    const extraQuestions = [{ id: 'q1', kind: 'attachments', label: 'Justificatif', writeTable: 'Pieces', writeCol: 'PJ' }];
    const formEl = mount(document.createElement('form'));
    formEl.innerHTML = `<input type="text" name="_website" value="" style="display:none">${extraQuestions.map(renderExtraQuestion).join('')}<span id="fill-status"></span><button type="submit"></button>`;
    const dt = new DataTransfer();
    dt.items.add(new File(['contenu'], 'x.pdf', { type: 'application/pdf' }));
    formEl.querySelector('#eq-q1').files = dt.files;
    window.fetch = async (url) => {
      if (String(url).includes('/attachments')) return { ok: false, status: 500 };
      if (String(url).includes('/tables/Reponses/records')) return { ok: true, json: async () => ({ records: [{ id: 7 }] }) };
      return { ok: true, json: async () => ({}) };
    };
    state.options = {};
    await onSubmit({ preventDefault() {}, target: formEl }, form, link, extraQuestions);
    await tick(); await tick();
    const cardHtml = $('fill-card').innerHTML;
    assert('la réponse principale reste annoncée malgré l’échec de la pièce jointe annexe', cardHtml.includes('7'));
    assert('un avertissement visible nomme la colonne en échec', cardHtml.includes('PJ') && /err/.test(cardHtml));
  });

  await group('onSubmit : redirection automatique jamais lancée vers un schéma autre que http(s)', async () => {
    const form = { formTableId: 'Reponses', formFieldsById: {} };
    const link = { api: 'https://fake/api/s/KEY' };
    const formEl = mount(document.createElement('form'));
    formEl.innerHTML = `<input type="text" name="_website" value="" style="display:none"><span id="fill-status"></span><button type="submit"></button>`;
    window.fetch = async (url) => {
      if (String(url).includes('/tables/Reponses/records')) return { ok: true, json: async () => ({ records: [{ id: 1 }] }) };
      return { ok: true, json: async () => ({}) };
    };
    // esc() échappe les caractères HTML mais ne filtre aucun schéma d'URI : un opt-redirect à
    // javascript:… doit être neutralisé explicitement, sinon il s'exécuterait tel quel 3 secondes
    // après l'envoi, sans aucun clic du répondant.
    state.options = { redirectUrl: 'javascript:alert(1)' };
    await onSubmit({ preventDefault() {}, target: formEl }, form, link, []);
    await tick();
    const cardHtml = $('fill-card').innerHTML;
    assert('un schéma javascript: est neutralisé, jamais de redirection automatique proposée', !cardHtml.includes('redirect-msg') && !cardHtml.includes('javascript:'));
  });

  await group('onSubmit : obligatoire refuse un texte fait uniquement d’espaces et un oui/non non cochée', async () => {
    const form = { formTableId: 'Reponses', formFieldsById: {} };
    const link = { api: 'https://fake/api/s/KEY' };
    const extraQuestions = [
      { id: 'q1', kind: 'text', label: 'Nom', required: true, writeTable: 'Reponses', writeCol: 'Nom' },
      { id: 'q2', kind: 'bool', label: 'Accord', required: true, writeTable: 'Reponses', writeCol: 'Accord' },
    ];
    const formEl = mount(document.createElement('form'));
    formEl.innerHTML = `<input type="text" name="_website" value="" style="display:none">
      <div class="q pv-q" data-native="1" data-type="Text" data-col="NomNatif" data-required="1"><input type="text"></div>
      ${extraQuestions.map(renderExtraQuestion).join('')}<span id="fill-status"></span><button type="submit"></button>`;
    formEl.querySelector('[data-col="NomNatif"] input').value = '   ';
    formEl.querySelector('#eq-q1').value = '   ';
    let submitted = false;
    window.fetch = async (url) => { if (String(url).includes('/tables/Reponses/records')) submitted = true; return { ok: true, json: async () => ({ records: [{ id: 1 }] }) }; };
    state.options = {};
    await onSubmit({ preventDefault() {}, target: formEl }, form, link, extraQuestions);
    await tick();
    assertEqual('texte natif obligatoire rempli d’espaces -> invalide', formEl.querySelector('[data-col="NomNatif"]').classList.contains('invalid'), true);
    assertEqual('question annexe texte obligatoire remplie d’espaces -> invalide', formEl.querySelector('[data-extra="q1"]').classList.contains('invalid'), true);
    assertEqual('oui/non obligatoire non cochée -> invalide', formEl.querySelector('[data-extra="q2"]').classList.contains('invalid'), true);
    assertEqual('aucun envoi tant que des champs obligatoires ne sont pas valides', submitted, false);
  });

  await group('I18n : chaque clé du dictionnaire (kit.* et form.*) a le français et l\'anglais', () => {
    const allEntries = { ...KIT_STRINGS, ...STRINGS };
    const missing = Object.entries(allEntries)
      .filter(([, v]) => !v || typeof v.fr !== 'string' || !v.fr || typeof v.en !== 'string' || !v.en)
      .map(([k]) => k);
    assertEqual('aucune clé sans français ou sans anglais', missing, []);
  });

  await group('applyBranding : la couleur personnalisée va sur #fill, jamais sur <html>', () => {
    // Piège mesuré par GFS (consigne 005) : poser les jetons d'accent sur document.documentElement
    // les ferait fuir sur l'écran du concepteur et sur les fenêtres du kit (partagées avec toute
    // la page), pas seulement sur le rendu du répondant.
    document.documentElement.style.removeProperty('--accent');
    applyBranding({ accentColor: '#e5484d' });
    assertEqual('rien posé sur <html>', document.documentElement.style.getPropertyValue('--accent'), '');
    assertEqual('--accent posé sur #fill', $('fill').style.getPropertyValue('--accent'), '#e5484d');
    assertEqual('--accent-solid posé sur #fill', $('fill').style.getPropertyValue('--accent-solid'), '#e5484d');
    assert('--on-accent posé sur #fill', !!$('fill').style.getPropertyValue('--on-accent'));
    applyBranding({}); // sans couleur : les jetons posés plus haut sont retirés, pas juste vidés
    assertEqual('--accent retiré de #fill sans couleur choisie', $('fill').style.getPropertyValue('--accent'), '');
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
