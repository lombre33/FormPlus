#!/usr/bin/env node
// Parcours de création d'un formulaire contre un VRAI Grist (celui de start-grist-test.sh) :
// « Partir de zéro » -> guide de publication -> « Ouvrir la page » -> Publier -> Partager ->
// Copier le lien -> Ctrl+V dans le widget -> éditeur. Tout est réel : la page créée par Grist, son
// nom, l'adresse directe, la détection de la publication par le widget, le lien copié par le
// bouton de Grist lui-même et collé au vrai clavier.
//
// Usage : tests/grist-env/start-grist-test.sh   (une fois, démarre Grist et sert le widget)
//         NODE_PATH=$(npm root -g) node tests/grist-env/e2e-onboarding.js [dossier_captures]
// Variables : GRIST_PORT (8484), WIDGET_PORT (8010), GRIST_TEST_STATE_DIR (~/.formplus-grist-test).
// Sort avec un code non nul au premier contrôle qui échoue (les captures déjà prises restent).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
const WIDGET_PORT = process.env.WIDGET_PORT || '8010';
const STATE_DIR = process.env.GRIST_TEST_STATE_DIR || path.join(os.homedir(), '.formplus-grist-test');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-e2e-'));
const info = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'grist-test-doc.json'), 'utf8'));
const GRIST = `http://localhost:${GRIST_PORT}`;
const DOC_URL = `${GRIST}/o/${info.org}/${info.docId}`;
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const apiKey = () => fs.readFileSync(path.join(STATE_DIR, 'apikey.txt'), 'utf8').trim();
const api = (method, route, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request(`${GRIST}/o/${info.org}/api/docs/${info.docId}${route}`, { method, headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' } }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(JSON.parse(b || '{}'))); });
  req.on('error', reject); if (data) req.write(data); req.end();
});
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));

(async () => {
  // Le script d'API que sert CE Grist, enveloppé dans eval() comme le fait docs.getgrist.com
  // (consigne GFS 018) : la CSP de la page doit donc garder 'unsafe-eval'.
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
  const consoleProblems = [];
  ctx.on('page', (p) => p.on('pageerror', (e) => consoleProblems.push(`PAGEERROR ${e.message}`)));

  const page = await ctx.newPage();
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);
  await page.goto(DOC_URL);
  await page.getByText('FormPlus', { exact: true }).first().click(); // la page du widget : plus fiable que reconstruire /p/<n>
  const widget = async () => {
    for (let i = 0; i < 60; i++) {
      const f = page.frames().find((fr) => fr.url().includes('widget.html'));
      if (f) return f;
      await page.waitForTimeout(250);
    }
    throw new Error('cadre du widget introuvable');
  };
  const w = await widget();
  // Les écrans se montrent en retirant `.hidden` d'un conteneur : :visible tient compte de TOUS
  // les parents, `:not(.hidden)` seul répondait vrai pour un écran de départ dans un #step1 caché.
  await w.locator('#start-choices:visible, #editor:visible, #start-panel-guide:visible').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500); // le widget choisit son écran en plusieurs temps (lecture de la table des formulaires) : attendre qu'il ait fini

  // Le widget de test a peut-être déjà un formulaire lié (essai précédent) ou un guide en cours :
  // repartir de l'écran de départ, comme le ferait « Nouveau » dans GFS.
  if (await w.locator('#editor:visible').count()) {
    await w.click('[data-etab="settings"]');
    await w.click('#change-source-btn');
  } else if (await w.locator('#start-panel-guide:visible').count()) {
    await w.click('[data-guide="cancel"]');
  }
  await w.locator('#start-choices:visible').waitFor({ timeout: 10000 }).catch(async (e) => {
    await page.screenshot({ path: path.join(SHOTS, 'ECHEC-depart.png') });
    throw new Error(`${e.message.split('\n')[0]} — écrans visibles : ${await w.evaluate(() => ['editor', 'step1', 'start-choices', 'start-panel-guide', 'start-panel-link'].filter((id) => document.getElementById(id).offsetParent).join(', '))}`);
  });

  // ─── 1. Créer ───
  const table = `Essai${Date.now().toString(36)}`;
  await w.click('[data-startgo="scratch"]');
  await w.fill('#scratchTable', table);
  await w.click('#scratchCreate');
  await w.locator('#start-panel-guide:visible').waitFor({ timeout: 20000 });
  const pageName = `Formulaire ${table[0].toUpperCase()}${table.slice(1)}`;
  const guideText = () => w.locator('#start-panel-guide').innerText();
  check('le guide remplace le panneau de création', (await w.locator('#start-panel-scratch:visible').count()) === 0 && (await w.locator('#start-panel-guide:visible').count()) === 1);
  check('étape 1 sur 3', (await w.locator('[aria-current="step"] .guide-num').innerText()) === '1');
  check('le guide nomme la page créée', (await guideText()).includes(pageName), await guideText());
  const href = await w.getAttribute('#guide-open', 'href');
  check('« Ouvrir la page » a une adresse directe vers une page du document', new RegExp(`^${GRIST}/o/${info.org}/doc/[^/]+/p/\\d+$`).test(String(href)), String(href));
  await w.locator('body').screenshot({ path: path.join(SHOTS, '1-guide-etape1.png') });
  await page.screenshot({ path: path.join(SHOTS, '1-grist-sidebar.png') });
  check('la page porte son nom dans la barre latérale de Grist', await page.getByText(pageName, { exact: true }).count() > 0);

  // ─── 2. Ouvrir la page (nouvel onglet) ───
  const [grist2] = await Promise.all([ctx.waitForEvent('page'), w.click('#guide-open')]);
  await grist2.waitForLoadState();
  await grist2.getByText('Publier', { exact: true }).waitFor({ timeout: 30000 });
  check('l’onglet ouvert est bien la page du formulaire (adresse complétée par Grist)', new RegExp(`/${info.docId.slice(0, 12)}[^/]*/[^/]+/p/${href.split('/p/')[1]}$`).test(grist2.url()), grist2.url());
  await grist2.screenshot({ path: path.join(SHOTS, '2-page-formulaire.png') });
  await page.bringToFront();
  await page.waitForTimeout(400);
  check('après le clic, étape 2', (await w.locator('[aria-current="step"] .guide-num').innerText()) === '2');

  // ─── 3. Publier : le widget doit s'en apercevoir tout seul ───
  await grist2.getByText('Publier', { exact: true }).click();
  await grist2.locator('button:has-text("Publier")').last().click();
  await grist2.getByText('Partager', { exact: true }).first().waitFor();
  let step = '2';
  for (let i = 0; i < 20 && step !== '3'; i++) { await page.waitForTimeout(500); step = await w.locator('[aria-current="step"] .guide-num').innerText(); }
  check('publication détectée sans aucun clic dans le widget : étape 3', step === '3');
  await w.locator('body').screenshot({ path: path.join(SHOTS, '3-guide-etape3.png') });

  // ─── 4. Partager > Copier le lien, puis Ctrl+V dans le widget ───
  await grist2.getByText('Partager', { exact: true }).first().click();
  await grist2.getByText('Copier le lien', { exact: true }).click();
  const link = await grist2.evaluate(() => navigator.clipboard.readText());
  check('le bouton de Grist a copié un lien de formulaire', /\/forms\/[^/]+\/\d+$/.test(link), link);
  await page.bringToFront();
  await w.locator('#guide-link').focus();
  await page.keyboard.press('Control+V');
  // Le formulaire se prépare tout seul ; seule la fenêtre d'accord du kit (rendre la copie publique,
  // consigne GFS 013) attend un clic - c'est voulu, et le seul de ce côté de Grist.
  await w.locator('#editor:visible, #pp-dialog-modal:visible').first().waitFor({ timeout: 30000 });
  if (!(await w.locator('#editor:visible').count())) {
    await w.locator('body').screenshot({ path: path.join(SHOTS, '4-consentement.png') });
    await w.locator('#pp-dialog-modal .pp-modal-primary').first().click({ timeout: 5000 });
  }
  await w.locator('#editor:visible').waitFor({ timeout: 30000 }).catch(async (e) => {
    await w.locator('body').screenshot({ path: path.join(SHOTS, 'ECHEC-apres-collage.png') });
    throw new Error(`${e.message.split('\n')[0]} (message du guide : ${JSON.stringify(await w.locator('#guide-msg').innerText().catch(() => '(absent)'))})`);
  });
  check('le collage a suffi : l’éditeur de questions est affiché', true);
  check('le guide a disparu avec l’écran de départ', (await w.locator('#step1:visible').count()) === 0);
  await w.locator('body').screenshot({ path: path.join(SHOTS, '5-editeur.png') });

  // ─── 5. Recharger : plus de guide à reprendre, on est dans l'éditeur ───
  await page.reload();
  const w2 = await widget();
  await w2.locator('#editor:visible').waitFor({ timeout: 30000 });
  check('après rechargement : toujours l’éditeur, jamais un guide périmé', (await w2.locator('#start-panel-guide:visible').count()) === 0);

  // ─── 6. Variante : la personne clique la page dans la barre latérale de Grist (même onglet) ───
  // Le widget est détruit puis rechargé à son retour : le guide doit repartir de là où il en était.
  // Un widget qui a déjà un formulaire lié rouvre CE formulaire : on part donc d'un widget neuf en
  // retirant les formulaires gardés dans FormPlus_Formulaires (comme un premier usage).
  const rows = await api('GET', '/tables/FormPlus_Formulaires/records');
  if (rows.records && rows.records.length) await api('POST', '/apply', [['BulkRemoveRecord', 'FormPlus_Formulaires', rows.records.map((r) => r.id)]]);
  await page.reload();
  const w3 = await widget();
  await w3.locator('#start-choices:visible').waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const table2 = `Essai${Date.now().toString(36)}b`;
  await w3.click('[data-startgo="scratch"]');
  await w3.fill('#scratchTable', table2);
  await w3.click('#scratchCreate');
  await w3.locator('#start-panel-guide:visible').waitFor({ timeout: 20000 }).catch(async (e) => {
    await page.screenshot({ path: path.join(SHOTS, 'ECHEC-variante.png') });
    throw new Error(`${e.message.split('\n')[0]} (message de création : ${JSON.stringify(await w3.locator('#scratch-msg').innerText().catch(() => '?'))})`);
  });
  const pageName2 = `Formulaire ${table2[0].toUpperCase()}${table2.slice(1)}`;
  await page.getByText(pageName2, { exact: true }).click(); // même onglet : le cadre du widget disparaît
  await page.getByText('Publier', { exact: true }).waitFor({ timeout: 30000 });
  await page.getByText('Publier', { exact: true }).click();
  await page.locator('button:has-text("Publier")').last().click();
  await page.getByText('Partager', { exact: true }).first().waitFor();
  await page.getByText('FormPlus', { exact: true }).first().click(); // retour sur la page du widget : il se recharge
  const w4 = await widget();
  await w4.locator('#start-panel-guide:visible').waitFor({ timeout: 20000 }).catch(async (e) => {
    await page.screenshot({ path: path.join(SHOTS, 'ECHEC-reprise.png') });
    throw new Error(`${e.message.split('\n')[0]} — écrans visibles : ${await w4.evaluate(() => ['editor', 'step1', 'start-choices', 'start-panel-guide'].filter((id) => document.getElementById(id).offsetParent).join(', '))} ; note : ${await w4.evaluate(() => { try { return JSON.stringify(Object.entries(localStorage).filter(([k]) => /pending/.test(k))); } catch (err) { return 'stockage illisible'; } })}`);
  });
  check('après rechargement, le guide est repris (pas l’écran de départ)', (await w4.locator('#start-choices:visible').count()) === 0);
  check('…pour la même table', (await w4.locator('#start-panel-guide').innerText()).includes(`« ${pageName2.replace('Formulaire ', '')} »`));
  await w4.locator('[aria-current="step"] .guide-num').filter({ hasText: '3' }).waitFor({ timeout: 10000 }).catch(() => {});
  check('…et déjà à l’étape 3 : la publication faite pendant l’absence est vue tout de suite', (await w4.locator('[aria-current="step"] .guide-num').innerText()) === '3');
  await w4.locator('body').screenshot({ path: path.join(SHOTS, '6-guide-repris.png') });
  await w4.click('[data-guide="cancel"]');
  check('« Choisir une autre méthode » ramène les tuiles de départ', (await w4.locator('#start-choices:visible').count()) === 1);

  check('aucune erreur de page pendant tout le parcours', consoleProblems.length === 0, consoleProblems.join(' | '));
  await browser.close();
  console.log(`\nCaptures : ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✗ exception :', e.message); process.exit(1); });
