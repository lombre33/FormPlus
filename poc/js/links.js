import { uid } from './dom.js';
import { GfsLink } from '../../kit/js/gfs-link.js';

// ───────────────────────── Liens, adresses, format des options ─────────────────────────

// Analyse d'un lien de formulaire publié : https://hote[/o/org]/forms/<clé>/<section>
export function parseFormLink(u) {
  const m = /^(https?:\/\/[^/]+)(?:\/o\/([^/]+))?\/forms\/([^/?#]+)\/(\d+)/.exec((u || '').trim());
  if (!m) return null;
  const [, host, org, key, vsId] = m;
  const base = org ? `${host}/o/${org}` : host;
  return { host, org: org || null, key, vsId: Number(vsId), base, api: `${base}/api/s/${key}` };
}
// Adresse donnée au répondant ("adresse à diffuser", Paramètres, QR code) : la page STATIQUE du
// widget lui-même, avec le lien du formulaire natif dans le fragment #form= — déjà le secours
// documenté sur l'écran standalone (voir fragmentFormLink, diag.js, et son usage dans main.js),
// promu ici en mécanisme PRINCIPAL. PAS la page Grist /s/<clé>/p/<n> utilisée avant le 4 nov 2026 :
// mesuré ce jour-là contre un vrai Grist auto-hébergé (même moteur que l'instance DINUM), Grist
// donne TOUJOURS accessLevel='full' au widget sur cette page, même à un visiteur anonyme (le
// widget demande requiredAccess:'full' dans grist.ready(), main.js — un réglage du widget sur
// cette section, jamais une mesure de qui regarde) : decideStartScreen() ci-dessous ne pouvait
// donc jamais distinguer un vrai répondant du concepteur sur cette page, et affichait toujours la
// configuration (audit UI/UX du 4 nov 2026). Le fragment #form= ne dépend d'aucun signal Grist :
// renderFill() lit le formulaire par une simple requête REST publique (respond.js), que la page
// tourne dans un iframe Grist ou en autonome — fiable par construction, pas par mesure. Bonus :
// élimine aussi le bandeau de page Grist résiduel sur /s/<clé> (docs/03-roadmap-priorites.md,
// section V3), puisque le répondant ne voit plus jamais cette page Grist.
export function buildPublicUrl(link) {
  const formLink = `${link.base}/forms/${link.key}/${link.vsId}`;
  const selfUrl = `${location.origin}${location.pathname}`;
  return `${selfUrl}#form=${encodeURIComponent(formLink)}`;
}

// Dans _grist_Views_section.options, la clé customView est une CHAÎNE JSON imbriquée
// (Grist la relit avec JSON.parse). Cette fonction la décode, et récupère aussi une valeur
// corrompue en objet (table de caractères {0:'{',1:'"',…} ou objet brut).
export function parseCustomView(o) {
  const cv = o && o.customView;
  if (typeof cv === 'string') { try { return JSON.parse(cv) || {}; } catch (e) { return {}; } }
  if (cv && typeof cv === 'object') {
    const charKeys = Object.keys(cv).filter(k => /^\d+$/.test(k)).sort((a, b) => a - b);
    if (charKeys.length) {
      try {
        const rebuilt = JSON.parse(charKeys.map(k => cv[k]).join('')) || {};
        if (cv.widgetOptions) rebuilt.widgetOptions = cv.widgetOptions;
        return rebuilt;
      } catch (e) { /* ignore */ }
    }
    const rest = { ...cv };
    charKeys.forEach(k => delete rest[k]);
    return rest;
  }
  return {};
}

// Une condition d'affichage a deux formes possibles en mémoire : l'ancienne, un seul critère
// {questionId, op, value}, et l'actuelle, plusieurs critères combinés {mode: 'all'|'any', rules:
// [{questionId, op, value}, ...]} ('all' = ET, 'any' = OU). Cette fonction ramène les deux vers
// la forme actuelle, pour n'avoir qu'un seul format à lire partout ailleurs dans le widget.
export function normalizeCondition(condition) {
  if (!condition) return null;
  if (Array.isArray(condition.rules)) {
    return { mode: condition.mode === 'any' ? 'any' : 'all', rules: condition.rules };
  }
  if (condition.questionId) {
    return { mode: 'all', rules: [{ questionId: condition.questionId, op: condition.op || 'equals', value: condition.value }] };
  }
  return null;
}

// Convertit l'ancien format {fields:[q1,q2]} vers le modèle {questions:[...]} à N entrées,
// garantit un champ "description" (vide par défaut) sur chaque question, y compris anciennes,
// et normalise la condition de chacune (voir normalizeCondition ci-dessus).
export function migrateLegacy(opts) {
  let list;
  if (Array.isArray(opts?.questions)) list = opts.questions;
  else if (Array.isArray(opts?.fields)) {
    list = opts.fields.map(f => {
      if (f.type === 'choice-table' || f.id === 'q1') {
        return { id: f.id || uid(), kind: 'choice', label: f.label, sourceTable: f.sourceTable, sourceCol: f.sourceCol,
          writeTable: f.writeTable, writeCol: f.writeCol, required: false, condition: null };
      }
      return { id: f.id || uid(), kind: 'text', label: f.label, writeTable: f.writeTable, writeCol: f.writeCol, required: false,
        condition: f.condition ? { questionId: f.condition.field, op: f.condition.op, value: f.condition.value } : null };
    });
  } else list = [];
  return list.map(q => ({ description: '', ...q, condition: normalizeCondition(q.condition) }));
}

// Décide l'écran à afficher à l'ouverture du widget (config ou répondant), à partir des signaux
// reçus de Grist. `fragmentFormLink` (adresse à diffuser depuis le 4 nov 2026, voir buildPublicUrl
// ci-dessus) est le cas fiable, décidé par construction, pas par mesure.
// `accessLevel` reste un repli best-effort pour une adresse /s/<clé>/p/<n> générée AVANT le 4 nov
// 2026 (déjà distribuée, non régénérable à distance) : un visiteur sans accès complet
// (accessLevel ≠ 'full') est bien un visiteur externe sur ce genre d'adresse. Mais mesuré le 4 nov
// 2026 contre un vrai Grist auto-hébergé : `accessLevel` vaut TOUJOURS 'full' sur cette page, même
// pour un visiteur anonyme (reflète le requiredAccess:'full' que le widget demande lui-même dans
// grist.ready(), main.js — une propriété de la section, jamais de qui regarde), donc ce repli ne
// fonctionne en fait JAMAIS pour une ancienne adresse de ce type. Un formulaire déjà publié avec
// l'ancienne adresse doit donc être republié (nouveau clic sur « Générer l'adresse ») pour que ses
// futurs répondants reçoivent la nouvelle adresse fiable, pas seulement rouvert.
export function decideStartScreen({ formLink, fragmentFormLink, accessLevel }) {
  if (fragmentFormLink) return 'fill';
  if (formLink && accessLevel && accessLevel !== 'full') return 'fill';
  return 'config';
}

// Le référent (adresse de la page Grist qui charge ce widget dans son iframe) contient le
// numéro de page, ex. ".../p/7?style=singlePage". Bien plus fiable que de chercher "ce widget"
// par nom de fichier dans les métadonnées, qui échoue dès que plusieurs pages réutilisent la
// même URL de widget (ce qui arrive vite en testant).
export function myPageFromReferrer() {
  try {
    const u = new URL(document.referrer);
    const m = /\/p\/(\d+)(?:[/?]|$)/.exec(u.pathname + u.search);
    if (m) return Number(m[1]);
  } catch (e) { /* ignore */ }
  // Dans GFS, le référent est l'adresse de GFS (jamais celle de la page Grist) : repli sur le
  // contexte du lien (consigne GFS 010, point 6) - au mieux comme le référent seule, null quand
  // GFS ne connaît pas non plus la page. Seule (GfsLink.context() renvoie toujours null), rien ne
  // change ici par rapport à avant.
  const page = GfsLink.context()?.page;
  return typeof page === 'number' ? page : null;
}

// Adresse directe d'une page du document (celle qu'un clic sur « Ouvrir la page » ouvre dans un
// nouvel onglet) : la forme canonique de Grist, /doc/<id>/p/<n> sous le préfixe du site
// (/o/<site> ou rien). Sans le nom du document dans l'adresse, Grist la complète lui-même (mesuré
// sur un vrai Grist : /o/formplus-test/doc/<id>/p/11 redirige vers .../<id>/<nom>/p/11). Fonctions
// pures, testées seules (tests.js) ; la lecture du référent et du jeton est dans grist-meta.js.
const isPageRef = (n) => Number.isInteger(n) && n > 0;

// Depuis le référent (la page Grist qui encadre le widget) : on garde tout ce qui précède /p/<n>,
// on remplace le numéro. Un référent qui est une page de PARTAGE (/s/<clé>/...) n'est pas le
// document : un lien posé dessus n'ouvrirait pas la nouvelle page (non partagée), donc rien.
export function pageUrlFromReferrer(referrer, viewRef) {
  if (!isPageRef(viewRef)) return null;
  let u;
  try { u = new URL(referrer); } catch (e) { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const path = u.pathname.replace(/\/p\/\d+.*$/, '').replace(/\/+$/, '');
  if (!path || /\/s\/[^/]+(?:\/|$)/.test(path)) return null;
  return `${u.origin}${path}/p/${viewRef}`;
}

// Depuis l'adresse d'API du document (baseUrl du jeton d'accès : <origine>[/o/<site>]/api/docs/<id>) :
// utile quand le référent est muet - dans GFS notamment, où il ne porte que l'adresse de GFS. Le
// site est pris de cette adresse, l'origine de `instance` (celle que GFS a corrigée) l'emporte si
// elle est donnée.
export function pageUrlFromBaseUrl(baseUrl, viewRef, instance) {
  if (!isPageRef(viewRef)) return null;
  let u;
  try { u = new URL(baseUrl); } catch (e) { return null; }
  const m = /^(.*)\/api\/docs\/([^/]+)/.exec(u.pathname);
  if (!m) return null;
  let origin = u.origin;
  if (instance) { try { origin = new URL(instance).origin; } catch (e) { /* on garde celle du jeton */ } }
  return `${origin}${m[1]}/doc/${m[2]}/p/${viewRef}`;
}

// Exposé pour un débogage externe (console, script tiers) : jamais utilisé par le widget
// lui-même ni par sa suite de tests, qui importent ces fonctions directement comme modules.
window.FormPlus = { parseFormLink, buildPublicUrl, parseCustomView: (o) => parseCustomView(o) };
