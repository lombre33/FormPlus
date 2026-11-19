#!/usr/bin/env node
// Les deux pages statiques du dépôt, politique de sécurité APPLIQUÉE (consigne GFS 037, règles S1 à S4) : la page
// d'accueil `index.html` et la page de réponse seule `poc/public-form.html`, contre un vrai formulaire publié d'un
// vrai Grist. `poc/widget.html` est couvert par les autres essais (voir « Mesurer avec la politique de sécurité
// appliquée » dans README.md) ; ces deux pages n'avaient aucun essai réel.
//
// Vérifie :
//   1. chaque page porte une politique qui part de `default-src 'none'` et ferme `form-action` ;
//   2. index.html : la page s'affiche, le formulaire « go » ouvre public-form.html#form=<lien> (navigation, pas soumission) ;
//   3. public-form.html : un visiteur anonyme (contexte vierge) voit les champs du formulaire publié, répond, la réponse arrive
//      dans la table de Grist, l'écran de succès s'affiche et « Envoyer une autre réponse » recharge un formulaire vierge ;
//   4. aucune violation de la politique, aucune erreur console, aucune erreur de page pendant tout le parcours.
//
// À jouer avec le serveur du banc qui garde la politique (sinon la politique du dépôt bloque ce Grist en HTTP nu) :
//   node tests/grist-env/serveur-csp.js 8010 8484 &   (après avoir arrêté le serveur du port 8010)
//   NODE_PATH=$(npm root -g) node tests/grist-env/e2e-public-form.js [dossier_captures]
// Variables : GRIST_PORT (8484), WIDGET_PORT (8010), GRIST_TEST_STATE_DIR (~/.formplus-grist-test).
// Sort avec un code non nul au premier contrôle qui échoue. N'écrit que dans `Reponses` (une ligne de plus par passe).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
const WIDGET_PORT = process.env.WIDGET_PORT || '8010';
const STATE_DIR = process.env.GRIST_TEST_STATE_DIR || path.join(os.homedir(), '.formplus-grist-test');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-e2e-public-form-'));
const info = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'grist-test-doc.json'), 'utf8'));
const GRIST = `http://localhost:${GRIST_PORT}`;
const SITE = `http://localhost:${WIDGET_PORT}`;
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const apiKey = () => fs.readFileSync(path.join(STATE_DIR, 'apikey.txt'), 'utf8').trim();
const api = (method, route) => new Promise((resolve, reject) => {
  const req = http.request(`${GRIST}/o/${info.org}/api/docs/${info.docId}${route}`, { method, headers: { Authorization: `Bearer ${apiKey()}` } }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { try { resolve(JSON.parse(b)); } catch (e) { resolve({}); } }); });
  req.on('error', reject); req.end();
});
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));
// La vraie clé de partage du serveur (table `shares` de home.sqlite3), pas le linkId : voir README.md, « Écart constaté ».
function realShareKey(linkId) {
  const db = path.join(STATE_DIR, 'grist-data', 'home.sqlite3');
  const py = 'import sqlite3,sys\nc=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True)\nr=c.execute("select key from shares where link_id=?",(sys.argv[2],)).fetchone()\nprint(r[0] if r else "")';
  return (spawnSync('python3', ['-I', '-c', py, db, linkId], { encoding: 'utf8' }).stdout || '').trim();
}
const cspOf = (html) => (/http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html) || [])[1] || '';

(async () => {
  const key = realShareKey(info.shareKey);
  if (!key) throw new Error(`clé de partage réelle introuvable dans home.sqlite3 pour le linkId ${info.shareKey}`);
  const problems = [];
  const violations = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, locale: 'fr-FR' }); // contexte vierge, politique appliquée
  ctx.on('page', (p) => p.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`)));
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`CONSOLE ${m.type().toUpperCase()} ${m.text().slice(0, 300)}`); });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => { window.__csp.push(`${e.violatedDirective} : ${e.blockedURI || 'inline'}`); });
  });
  const csp = async () => page.evaluate(() => window.__csp).catch(() => []);

  // ─── 1. Les politiques servies ───
  for (const file of ['index.html', 'poc/public-form.html']) {
    const policy = cspOf(await get(`${SITE}/${file}`));
    check(`${file} : default-src 'none' et form-action 'none'`, /(^|;\s*)default-src 'none'(;|$)/.test(policy) && /(^|;\s*)form-action 'none'(;|$)/.test(policy), policy);
  }

  // ─── 2. index.html ───
  const formLink = `${GRIST}/o/${info.org}/forms/${key}/${info.sectionReponses}`;
  await page.goto(`${SITE}/index.html`);
  check('index.html : la page s\'affiche avec l\'adresse du widget', /poc\/widget\.html/.test(await page.locator('#widget-url').innerText()));
  await page.locator('#go input').first().fill(formLink);
  await Promise.all([page.waitForURL(/public-form\.html#form=/), page.locator('#go button[type=submit], #go input[type=submit]').first().click().catch(() => page.locator('#go input').first().press('Enter'))]);
  check('index.html : le formulaire « go » ouvre public-form.html#form=<lien> (navigation, pas soumission)', page.url().includes('public-form.html#form=') && decodeURIComponent(page.url()).includes(formLink), page.url());

  // ─── 3. public-form.html : un visiteur répond ───
  await page.locator('#f').waitFor({ timeout: 30000 }).catch(async () => {
    await page.screenshot({ path: path.join(SHOTS, 'ECHEC-formulaire.png') });
    throw new Error(`formulaire absent (page : ${JSON.stringify((await page.locator('#app').innerText().catch(() => '?')).slice(0, 200))} ; problèmes : ${problems.join(' | ')})`);
  });
  check('public-form.html : le visiteur voit les champs du formulaire publié', (await page.locator('#f .q, #f input, #f textarea').count()) > 1);
  await page.screenshot({ path: path.join(SHOTS, '1-formulaire.png'), fullPage: true });
  const before = ((await api('GET', '/tables/Reponses/records')).records || []).length;
  const tag = `Pub${Date.now().toString(36)}`;
  const inputs = page.locator('#f input[type=text]:not([name="_website"]), #f input:not([type]):not([name="_website"]), #f textarea');
  const n = await inputs.count();
  for (let i = 0; i < n; i++) await inputs.nth(i).fill(`${tag}${i}`);
  check('le formulaire a au moins un champ texte à remplir', n > 0, String(n));
  await page.locator('#f button[type=submit]').click();
  await page.locator('#restart-btn').waitFor({ timeout: 20000 }).catch(async () => {
    await page.screenshot({ path: path.join(SHOTS, 'ECHEC-envoi.png') });
    throw new Error(`pas d'écran de succès (statut : ${JSON.stringify(await page.locator('#status').innerText().catch(() => '?'))} ; problèmes : ${problems.join(' | ')})`);
  });
  const after = ((await api('GET', '/tables/Reponses/records')).records || []).length;
  check('la réponse est arrivée dans la table de Grist (une ligne de plus)', after === before + 1, `${before} → ${after}`);
  await page.screenshot({ path: path.join(SHOTS, '2-succes.png'), fullPage: true });
  await page.evaluate(() => { window.__avant = 'ancienne page'; });
  await page.locator('#restart-btn').click();
  await page.locator('#f').waitFor({ timeout: 20000 });
  check('« Envoyer une autre réponse » recharge un formulaire vierge (la page repart de zéro)', (await page.evaluate(() => window.__avant)) === undefined && (await inputs.first().inputValue()) === '');

  // ─── 4. Aucune violation, aucune erreur ───
  const seen = await csp();
  check('aucune violation de la politique pendant tout le parcours', seen.length === 0, seen.join(' | '));
  check('aucune erreur de page ni de console', problems.length === 0, problems.join(' | '));
  await browser.close();
  if (failed) { console.log(`\n${failed} contrôle(s) en échec. Captures : ${SHOTS}`); process.exit(1); }
  console.log(`\nTout est vert. Captures : ${SHOTS}`);
})().catch((e) => { console.log(`✗ exception : ${e.message}`); process.exit(1); });
