import { uid } from './dom.js';

// ───────────────────────── Liens, adresses, format des options ─────────────────────────

// Analyse d'un lien de formulaire publié : https://hote[/o/org]/forms/<clé>/<section>
export function parseFormLink(u) {
  const m = /^(https?:\/\/[^/]+)(?:\/o\/([^/]+))?\/forms\/([^/?#]+)\/(\d+)/.exec((u || '').trim());
  if (!m) return null;
  const [, host, org, key, vsId] = m;
  const base = org ? `${host}/o/${org}` : host;
  return { host, org: org || null, key, vsId: Number(vsId), base, api: `${base}/api/s/${key}` };
}
export function buildPublicUrl(link, viewRef) {
  return `${link.base}/s/${link.key}/p/${viewRef}?style=singlePage`;
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

// Le référent (adresse de la page Grist qui charge ce widget dans son iframe) contient le
// numéro de page, ex. ".../p/7?style=singlePage". Bien plus fiable que de chercher "ce widget"
// par nom de fichier dans les métadonnées, qui échoue dès que plusieurs pages réutilisent la
// même URL de widget (ce qui arrive vite en testant).
export function myPageFromReferrer() {
  try {
    const u = new URL(document.referrer);
    const m = /\/p\/(\d+)(?:[/?]|$)/.exec(u.pathname + u.search);
    return m ? Number(m[1]) : null;
  } catch (e) { return null; }
}

// Hôte + organisation Grist, déduits du référent (même logique que myPageFromReferrer), pour
// reconstruire une adresse .../forms/<clé>/<section> sans que le concepteur ait à la coller.
export function hostOrgFromReferrer() {
  try {
    const u = new URL(document.referrer);
    const m = /^\/o\/([^/]+)\//.exec(u.pathname);
    return { host: u.origin, org: m ? m[1] : null };
  } catch (e) { return null; }
}

// Exposé pour un débogage externe (console, script tiers) : jamais utilisé par le widget
// lui-même ni par sa suite de tests, qui importent ces fonctions directement comme modules.
window.FormPlus = { parseFormLink, buildPublicUrl, parseCustomView: (o) => parseCustomView(o) };
