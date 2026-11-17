#!/usr/bin/env node
// Les trois captures de la vitrine de GFS (consigne GFS 031) : 1 = ce formulaire tel que le voit la personne qui
// répond (c'est elle qui illustre la carte), 2 = l'éditeur d'un formulaire, 3 = les réponses reçues. Tout est pris
// dans un VRAI Grist (celui de start-grist-test.sh) avec la vraie app : le formulaire d'exemple se bâtit par
// l'éditeur lui-même (Partir de zéro, « Construire le formulaire d'abord », chaque question ajoutée à la souris,
// publication par le bouton de Form+, lien copié par le bouton de Grist puis collé), seules les réponses reçues
// sont posées d'un coup dans la table. Données d'exemple sans aucun nom de personne.
//
// Sortie : <dossier>/1.webp, 2.webp, 3.webp (960 x 600 px, 60 Ko au plus chacune : qualité baissée jusqu'à y
// tenir). vitrine.json (description et légendes) s'écrit à la main : le script ne le touche pas. Les images sont
// prises à deux fois la taille puis ramenées à 960 x 600 (texte plus net) ; l'app seule, sans la barre du
// navigateur ni la page de Grist autour, en clair, en français (une capture en français sert aux deux langues).
// Pillow est requis pour la conversion WebP (python3 -c "import PIL").
//
// Usage : un document NEUF (la table « Retours » ne doit pas déjà exister) :
//           tests/grist-env/start-grist-test.sh                       (premier démarrage), ou, si Grist tourne déjà,
//           GRIST_URL=… GRIST_API_KEY=… GRIST_ORG_DOMAIN=formplus-test FORMPLUS_URL=… DOC_INFO_PATH=… \
//             python3 tests/grist-env/grist_test_doc.py                (supprime et recrée le document)
//         NODE_PATH=$(npm root -g) node tests/grist-env/vitrine-captures.js vitrine
// Variables : GRIST_PORT (8484), GRIST_TEST_STATE_DIR (~/.formplus-grist-test).
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
const STATE_DIR = process.env.GRIST_TEST_STATE_DIR || path.join(os.homedir(), '.formplus-grist-test');
const OUT = path.resolve(process.argv[2] || 'vitrine');
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-vitrine-'));
const info = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'grist-test-doc.json'), 'utf8'));
const GRIST = `http://localhost:${GRIST_PORT}`;
const DOC_URL = `${GRIST}/o/${info.org}/${info.docId}`;
fs.mkdirSync(OUT, { recursive: true });

const apiKey = () => fs.readFileSync(path.join(STATE_DIR, 'apikey.txt'), 'utf8').trim();
const request = (method, url, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request(url, { method, headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' } }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { try { resolve(JSON.parse(b || 'null')); } catch (e) { resolve(null); } }); });
  req.on('error', reject); if (data) req.write(data); req.end();
});
const api = (method, route, body) => request(method, `${GRIST}/o/${info.org}/api/docs/${info.docId}${route}`, body);
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));
const recs = async (table) => ((await api('GET', `/tables/${table}/records`)) || {}).records || [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Le formulaire d'exemple : un retour sur un atelier, aucune donnée personnelle ───
const TABLE = 'Retours';
const TITLE = 'Retour sur l’atelier';
const DESCRIPTION = 'Deux minutes pour nous dire ce qui a marché et ce qu’on peut améliorer.';
const QUESTIONS = [
  { kind: 'select', label: 'Dans quel service travaillez-vous ?', choices: ['RH', 'Finances', 'Informatique', 'Communication'], display: 'radio', required: true },
  { kind: 'scale', label: 'Votre satisfaction générale', min: 1, max: 5, low: 'Pas du tout satisfait·e', high: 'Très satisfait·e', required: true },
  { kind: 'multiselect', label: 'Qu’avez-vous trouvé le plus utile ?', choices: ['Les exemples concrets', 'Les exercices en groupe', 'Les supports remis', 'Les échanges avec l’équipe'] },
  { kind: 'date', label: 'Date souhaitée pour une prochaine session' },
  { kind: 'longtext', label: 'Vos remarques ou suggestions' },
];
const day = (y, m, d) => Date.UTC(y, m - 1, d) / 1000;
const RESPONSES = [
  ['RH', 4, ['Les exemples concrets', 'Les supports remis'], day(2027, 1, 14), 'Très clair, j’aurais aimé un peu plus de temps pour les exercices.'],
  ['Finances', 5, ['Les exercices en groupe'], day(2027, 2, 2), 'Rythme parfait. À refaire avec toute l’équipe.'],
  ['Informatique', 3, ['Les échanges avec l’équipe'], day(2027, 1, 28), 'Un support avec les formules les plus utiles serait un vrai plus.'],
  ['Communication', 5, ['Les exemples concrets', 'Les exercices en groupe', 'Les supports remis'], day(2027, 1, 21), 'Merci, je l’ai déjà essayé sur mon suivi de projets.'],
  ['Finances', 4, ['Les exemples concrets'], day(2027, 2, 9), 'Plus d’exemples tirés de nos propres tableaux, si possible.'],
  ['RH', 5, ['Les supports remis', 'Les échanges avec l’équipe'], day(2027, 1, 14), 'Atelier très utile, bravo pour la clarté.'],
];

let browser;
let mainPage;
async function main() {
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  browser = await chromium.launch();
  // 2 x : on ramène ensuite à 960 x 600 pour un texte plus net. bypassCSP : ce Grist de test est en HTTP nu, le
  // `connect-src 'self' https:` du widget bloquerait ses appels (tests/grist-env/README.md, point 5).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 2, locale: 'fr-FR', colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'], bypassCSP: true });
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));

  const old = await recs('FormPlus_Formulaires');
  if (old.length) await api('POST', '/apply', [['BulkRemoveRecord', 'FormPlus_Formulaires', old.map((r) => r.id)]]);

  const page = await ctx.newPage();
  mainPage = page;
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);
  await page.goto(DOC_URL);
  await page.getByText('FormPlus', { exact: true }).first().click();
  const widget = async () => {
    for (let i = 0; i < 60; i++) {
      const f = page.frames().find((fr) => fr.url().includes('widget.html'));
      if (f) return f;
      await sleep(250);
    }
    throw new Error('cadre du widget introuvable');
  };
  const w = await widget();
  await w.locator('#start-choices:visible, #editor:visible, #start-panel-guide:visible').first().waitFor({ timeout: 20000 });
  await sleep(2500);
  if (await w.locator('#editor:visible').count()) { await w.click('[data-etab="settings"]'); await w.click('#change-source-btn'); }
  await w.locator('#start-choices:visible').waitFor({ timeout: 15000 });

  // ─── 1. Créer le formulaire comme une personne le ferait : « Construire le formulaire d'abord » ───
  await w.click('[data-startgo="scratch"]');
  await w.fill('#scratchTable', TABLE);
  await w.click('#scratchCreate');
  await w.locator('#start-panel-guide:visible').waitFor({ timeout: 20000 });
  await w.click('#guide-build');
  // Dans un document neuf, Form+ demande d'abord l'accord pour créer sa table de définitions : on l'accepte.
  for (let i = 0; i < 120; i++) {
    if (await w.locator('#editor:visible').count()) break;
    if (await w.locator('#pp-dialog-modal:visible').count()) await w.locator('#pp-dialog-modal .pp-modal-primary').first().click({ timeout: 5000 }).catch(() => {});
    await sleep(250);
  }
  await w.locator('#editor:visible').waitFor({ timeout: 10000 });

  // ─── 2. Apparence : titre, description ───
  await w.click('[data-etab="settings"]');
  await w.fill('#opt-title', TITLE);
  await w.fill('#opt-desc', DESCRIPTION);
  await w.locator('#opt-desc').blur();
  await w.click('[data-etab="questions"]');
  await sleep(800);

  // ─── 3. Les questions, une par une, à la souris ───
  const savedCount = async () => {
    const rows = await recs('FormPlus_Formulaires');
    return rows.length ? (JSON.parse(rows[0].fields.Definition).questions || []).length : 0;
  };
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    await w.click('#qadd');
    const card = w.locator('#qlist > .qcard[data-id="__new__"]'); // la carte vierge, jamais « la dernière » (des champs natifs s'ajoutent après)
    await card.locator('.qf-label').waitFor({ timeout: 10000 });
    await card.locator(`.qtype-opt[data-kind="${q.kind}"]`).evaluate((el) => el.click());
    await card.locator('.qf-label').fill(q.label);
    if (q.choices) await card.locator('.qf-choices').fill(q.choices.join('\n'));
    if (q.display) await card.locator(`.qf-display-btn[data-display="${q.display}"]`).click();
    if (q.kind === 'scale') {
      await card.locator('.qf-scale-min').fill(String(q.min));
      await card.locator('.qf-scale-max').fill(String(q.max));
      await card.locator('.qf-scale-low').fill(q.low);
      await card.locator('.qf-scale-high').fill(q.high);
    }
    if (q.required) await card.locator('.qf-required').check({ force: true });
    await w.click('[data-etab="questions"]'); // sortir de la carte : c'est ce qui l'enregistre
    for (let t = 0; t < 80 && (await savedCount()) < i + 1; t++) await sleep(250);
    if ((await savedCount()) < i + 1) throw new Error(`la question « ${q.label} » n'a pas été enregistrée`);
    await w.locator('#qlist > .qcard[data-id="__new__"]').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});
    await sleep(600);
  }
  // ─── 3 bis. Publier (bouton de Form+), copier le lien dans Grist, le coller : l'adresse à diffuser existe ───
  await w.click('#nolink-go');
  await w.locator('#guide-publish').waitFor({ timeout: 15000 });
  await w.click('#guide-publish');
  await w.locator('[aria-current="step"] .guide-num').filter({ hasText: '2' }).waitFor({ timeout: 20000 });
  const pageHref = await w.getAttribute('#guide-open', 'href');
  const formPage = await ctx.newPage();
  await formPage.goto(pageHref);
  await formPage.getByText('Partager', { exact: true }).first().waitFor({ timeout: 30000 });
  await formPage.getByText('Partager', { exact: true }).first().click();
  await formPage.getByText('Copier le lien', { exact: true }).click();
  const link = await formPage.evaluate(() => navigator.clipboard.readText());
  await formPage.close();
  await page.bringToFront();
  await w.click('[data-guide="opened"]');
  await w.locator('#guide-link').focus();
  await page.evaluate((l) => navigator.clipboard.writeText(l), link);
  await page.keyboard.press('Control+V');
  await w.locator('#editor:visible').waitFor({ timeout: 30000 });
  for (let t = 0; t < 80; t++) {
    const rows = await recs('FormPlus_Formulaires');
    if (rows.length && JSON.parse(rows[rows.length - 1].fields.Definition).publicUrl) break;
    await sleep(250);
  }

  const defRows = await recs('FormPlus_Formulaires');
  const defRow = defRows[defRows.length - 1];
  const def = JSON.parse(defRow.fields.Definition);
  console.log(`formulaire : « ${def.formTitle} », ${def.questions.length} questions, adresse ${def.publicUrl ? 'prête' : 'MANQUANTE'}`);
  QUESTIONS.forEach((q, i) => {
    const d = def.questions[i];
    if (!d || d.label !== q.label || d.kind !== q.kind || !!d.required !== !!q.required) {
      throw new Error(`la question ${i + 1} enregistrée n'est pas celle qu'on a saisie : ${JSON.stringify(d && { label: d.label, kind: d.kind, required: d.required })}`);
    }
  });
  if (def.questions.length !== QUESTIONS.length) throw new Error(`${def.questions.length} questions enregistrées au lieu de ${QUESTIONS.length}`);

  // ─── 4. Les réponses reçues (posées d'un coup dans la table) ───
  const col = (i) => def.questions[i].writeCol;
  const cols = {};
  [0, 1, 2, 3, 4].forEach((i) => { cols[col(i)] = RESPONSES.map((r) => (i === 2 ? ['L', ...r[i]] : r[i])); });
  await api('POST', '/apply', [['BulkAddRecord', TABLE, RESPONSES.map(() => null), cols]]);

  // Rechargement : l'éditeur relit tout depuis le document, comme à l'ouverture.
  await page.reload();
  const w2 = await widget();
  await w2.locator('#editor:visible').waitFor({ timeout: 30000 });
  await sleep(1500);

  // ─── 5. Les captures ───
  const sizeFrame = () => page.evaluate(() => {
    const f = [...document.querySelectorAll('iframe')].find((x) => x.src.includes('widget.html'));
    // Tout le reste de la page de Grist (dont la bannière « Authentication is not enforced » du Grist de test) est masqué.
    document.body.style.visibility = 'hidden';
    f.style.cssText = 'position:fixed;left:0;top:0;width:960px;height:600px;z-index:99999;border:0;background:#fff;visibility:visible';
  });
  const frameShot = async (file) => {
    await sleep(900);
    await page.locator('iframe[src*="widget.html"]').screenshot({ path: path.join(WORK, file) });
  };
  await sizeFrame();
  await w2.click('[data-etab="questions"]');
  await w2.evaluate(() => window.scrollTo(0, 0));
  await frameShot('2.png');

  await w2.click('[data-etab="responses"]');
  await w2.locator('.resp-card').first().waitFor({ timeout: 15000 });
  await w2.evaluate(() => window.scrollTo(0, 0));
  await frameShot('3.png');

  // La personne qui répond : l'adresse à diffuser, dans un contexte neuf (aucune connexion à Grist).
  const anon = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 2, locale: 'fr-FR', colorScheme: 'light', bypassCSP: true });
  await anon.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
  const ap = await anon.newPage();
  await ap.goto(def.publicUrl);
  await ap.locator('#fill:visible').waitFor({ timeout: 30000 });
  await ap.locator('#f .q:not([hidden]) .title', { hasText: def.questions[0].label }).first().waitFor({ state: 'visible', timeout: 30000 });
  await sleep(1200);
  await ap.screenshot({ path: path.join(WORK, '1.png') });
  await anon.close();
  await browser.close();

  // ─── 6. Conversion : 2 x -> 960 x 600, WebP sous 60 Ko ───
  const py = `
import sys
from PIL import Image
work, out = sys.argv[1], sys.argv[2]
for n in ('1', '2', '3'):
    im = Image.open(f'{work}/{n}.png').convert('RGB')
    if im.size != (960, 600):
        im = im.resize((960, 600), Image.LANCZOS)
    for q in range(90, 29, -4):
        im.save(f'{out}/{n}.webp', 'WEBP', quality=q, method=6)
        import os
        if os.path.getsize(f'{out}/{n}.webp') <= 60 * 1024:
            print(n, q, os.path.getsize(f'{out}/{n}.webp'))
            break
    else:
        print(n, 'TROP LOURD'); sys.exit(1)
`;
  execFileSync('python3', ['-I', '-c', py, WORK, OUT], { stdio: 'inherit' });
  console.log(`PNG intermédiaires : ${WORK}\nImages : ${OUT}`);
}
main().catch(async (e) => { console.error('✗ exception :', e.message); try { if (mainPage) { await mainPage.screenshot({ path: path.join(WORK, 'echec.png') }); console.error(`capture de l'échec : ${path.join(WORK, 'echec.png')}`); } if (browser) await browser.close(); } catch (x) { /* rien */ } process.exit(1); });
