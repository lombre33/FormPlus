#!/usr/bin/env node
// Les vignettes des modèles de formulaire (consigne GFS 033) : une image 240 x 320 px (WebP, 12 Ko au plus) par
// modèle de poc/js/templates.js, rangée dans modeles/ à côté de modeles.json. Elles sont prises dans un VRAI Grist (celui
// de start-grist-test.sh) avec la vraie app : pour chaque modèle, GFS est simulé comme dans e2e-model.js (le cadre porte
// `gfs=1`, la page répond à `contexte` par l'ouverture `raison: 'modele'`), le clic sur « Créer ce formulaire » fait
// tout, le formulaire se publie par le bouton de Form+ (lien copié par le bouton de Grist), puis la capture est celle de
// la page publique, vue par une personne qui répond : un cadre de 360 x 480 px (le haut du formulaire, le rapport 3:4 de la
// vignette), pris à deux fois la taille puis ramené à 240 x 320 (texte plus net). Aucune donnée saisie, aucun nom.
// Pillow est requis pour la conversion WebP (python3 -c "import PIL").
//
// Usage : un document NEUF si possible ; Grist et le widget servis par tests/grist-env/start-grist-test.sh
//         NODE_PATH=$(npm root -g) node tests/grist-env/modeles-captures.js [modeles] [id-du-modele ...]
//   (sans identifiant : tous les modèles ; sortie : <dossier>/<vignette du modèle>, dossier `modeles` par défaut)
// Variables : GRIST_PORT (8484), WIDGET_PORT (8010), GRIST_TEST_STATE_DIR (~/.formplus-grist-test).
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
const WIDGET_PORT = process.env.WIDGET_PORT || '8010';
const STATE_DIR = process.env.GRIST_TEST_STATE_DIR || path.join(os.homedir(), '.formplus-grist-test');
const OUT = path.resolve(process.argv[2] || 'modeles');
const ONLY = process.argv.slice(3);
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-modeles-'));
const info = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'grist-test-doc.json'), 'utf8'));
const GRIST = `http://localhost:${GRIST_PORT}`;
const DOC_URL = `${GRIST}/o/${info.org}/${info.docId}`;
fs.mkdirSync(OUT, { recursive: true });

const apiKey = () => fs.readFileSync(path.join(STATE_DIR, 'apikey.txt'), 'utf8').trim();
const request = (method, url, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` } }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) { j = { raw: b }; } resolve(j); }); });
  req.on('error', reject); if (data) req.write(data); req.end();
});
const api = (method, route, body) => request(method, `${GRIST}/o/${info.org}/api/docs/${info.docId}${route}`, body);
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));
const records = async (table) => ((await api('GET', `/tables/${table}/records`)).records || []).map((r) => ({ id: r.id, ...r.fields }));

let browser;
let mainPage;
(async () => {
  const mod = await import(new URL('../../poc/js/templates.js', `file://${__filename}`).href);
  const models = mod.MODELS.filter((m) => !ONLY.length || ONLY.includes(m.id));
  if (!models.length) throw new Error('aucun modèle à photographier');
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', colorScheme: 'light', permissions: ['clipboard-read', 'clipboard-write'], bypassCSP: true });
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'Cache-Control': 'no-store' }, body: `eval(${JSON.stringify(pluginApi)});` }));
  let hosted = true;
  await ctx.route(new RegExp(`^http://localhost:${WIDGET_PORT}/poc/widget\\.html`), (route) => {
    const u = new URL(route.request().url());
    if (!hosted || u.searchParams.has('gfs')) return route.continue();
    u.searchParams.set('gfs', '1'); u.searchParams.set('language', 'fr');
    return route.fulfill({ status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' } });
  });
  await ctx.addInitScript(() => { window.__gfs = []; window.addEventListener('message', (e) => { if (e.data && typeof e.data === 'object' && 'gfs' in e.data) window.__gfs.push(e.data); }); });
  const page = await ctx.newPage();
  mainPage = page;
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);

  const widget = async () => {
    for (let i = 0; i < 120; i++) {
      const f = page.frames().find((fr) => fr.url().includes('widget.html'));
      if (f) return f;
      await page.waitForTimeout(250);
    }
    throw new Error('cadre du widget introuvable');
  };
  const openWidget = async (opening) => {
    await page.goto(DOC_URL);
    await page.getByText('FormPlus', { exact: true }).first().click();
    const f = await widget();
    if (hosted) {
      let callId = null;
      for (let i = 0; i < 100 && callId === null; i++) {
        callId = await page.evaluate(() => { const c = window.__gfs.find((m) => m.type === 'appel' && m.nom === 'contexte'); return c ? c.id : null; });
        if (callId === null) await page.waitForTimeout(100);
      }
      if (callId === null) throw new Error('le widget n’a pas appelé `contexte`');
      await page.evaluate(({ id, data }) => {
        const fr = [...document.querySelectorAll('iframe')].find((i) => i.src.includes('widget.html'));
        fr.contentWindow.postMessage({ gfs: 1, type: 'reponse', id, data }, '*');
      }, { id: callId, data: { langue: 'fr', ...(opening ? { ouverture: opening } : {}) } });
    }
    await page.waitForTimeout(2500);
    return f;
  };

  for (const model of models) {
    const T = (v) => mod.pick(v, 'fr');
    console.log(`── ${model.id}`);
    // Un seul formulaire géré à la fois : les lignes des modèles d'avant sont retirées (leurs tables et pages restent).
    const old = await records('FormPlus_Formulaires').catch(() => []);
    if (old.length) await api('POST', '/apply', [['BulkRemoveRecord', 'FormPlus_Formulaires', old.map((r) => r.id)]]);

    hosted = true;
    let w = await openWidget({ fichier: null, type: mod.MODEL_TYPE, dossier: '', raison: 'modele', modele: { id: model.id } });
    await w.locator('#start-panel-model:visible').waitFor({ timeout: 20000 });
    await w.fill('#modelTable', `${T(model.table)}${Date.now().toString(36).slice(-3)}`);
    await w.click('#modelCreate');
    for (let i = 0; i < 160; i++) {
      if (await w.locator('#editor:visible').count()) break;
      if (await w.locator('#pp-dialog-modal:visible').count()) await w.locator('#pp-dialog-modal .pp-modal-primary').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
    await w.locator('#editor:visible').waitFor({ timeout: 30000 });

    // Publication (bouton de Form+), lien copié par le bouton de Grist, collé : l'adresse à diffuser existe.
    hosted = false;
    w = await openWidget();
    await w.locator('#editor:visible').waitFor({ timeout: 30000 });
    await w.click('#nolink-go');
    await w.locator('#guide-publish').waitFor({ timeout: 15000 });
    await w.click('#guide-publish');
    await w.locator('[aria-current="step"] .guide-num').filter({ hasText: '2' }).waitFor({ timeout: 20000 });
    const pageHref = await w.getAttribute('#guide-open', 'href');
    const g = await ctx.newPage();
    await g.goto(pageHref);
    await g.getByText('Partager', { exact: true }).first().waitFor({ timeout: 30000 });
    await g.getByText('Partager', { exact: true }).first().click();
    await g.getByText('Copier le lien', { exact: true }).click();
    const link = await g.evaluate(() => navigator.clipboard.readText());
    await g.close();
    await page.bringToFront();
    await w.click('[data-guide="opened"]');
    await w.locator('#guide-link').focus();
    await page.evaluate((l) => navigator.clipboard.writeText(l), link);
    await page.keyboard.press('Control+V');
    await w.locator('#editor:visible').waitFor({ timeout: 30000 });
    let def = null;
    for (let t = 0; t < 80; t++) {
      const rows = await records('FormPlus_Formulaires');
      def = JSON.parse(rows[0].Definition);
      if (def.publicUrl) break;
      await page.waitForTimeout(250);
    }
    if (!def.publicUrl) throw new Error(`« ${model.id} » : adresse à diffuser absente`);
    if (def.questions.length !== model.questions.length) throw new Error(`« ${model.id} » : ${def.questions.length} questions enregistrées au lieu de ${model.questions.length}`);

    // La personne qui répond : l'adresse à diffuser, dans un contexte neuf (aucune connexion à Grist), cadre de 360 x 480.
    const anon = await browser.newContext({ viewport: { width: 360, height: 480 }, deviceScaleFactor: 2, locale: 'fr-FR', colorScheme: 'light', bypassCSP: true });
    await anon.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
    const ap = await anon.newPage();
    await ap.goto(def.publicUrl.replace(/^https?:\/\/[^/]+/, `http://localhost:${WIDGET_PORT}`));
    await ap.locator('#fill:visible').waitFor({ timeout: 30000 });
    await ap.locator('#f .q:not([hidden]) .title', { hasText: T(model.questions.find((q) => q.col).label) }).first().waitFor({ state: 'visible', timeout: 30000 });
    await ap.waitForTimeout(1200);
    await ap.screenshot({ path: path.join(WORK, `${model.id}.png`) });
    await anon.close();
  }
  await browser.close();

  // Conversion : 720 x 960 -> 240 x 320, WebP sous 12 Ko (la qualité baisse jusqu'à y tenir).
  const py = `
import os, sys
from PIL import Image
work, out = sys.argv[1], sys.argv[2]
for pair in sys.argv[3:]:
    model_id, name = pair.split('=')
    im = Image.open(f'{work}/{model_id}.png').convert('RGB')
    im = im.resize((240, 320), Image.LANCZOS)
    for q in range(92, 19, -3):
        im.save(f'{out}/{name}', 'WEBP', quality=q, method=6)
        if os.path.getsize(f'{out}/{name}') <= 12 * 1024:
            print(name, q, os.path.getsize(f'{out}/{name}'))
            break
    else:
        print(name, 'TROP LOURD'); sys.exit(1)
`;
  execFileSync('python3', ['-I', '-c', py, WORK, OUT, ...models.map((m) => `${m.id}=${m.vignette}`)], { stdio: 'inherit' });
  console.log(`PNG intermédiaires : ${WORK}\nVignettes : ${OUT}`);
})().catch(async (e) => {
  console.error('✗ exception :', e.message);
  try { if (mainPage) { await mainPage.screenshot({ path: path.join(WORK, 'echec.png') }); console.error(`capture de l'échec : ${path.join(WORK, 'echec.png')}`); } if (browser) await browser.close(); } catch (x) { /* rien */ }
  process.exit(1);
});
