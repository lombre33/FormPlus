#!/usr/bin/env node
// Le logo ou image d'en-tête d'un formulaire est une IMAGE INTÉGRÉE (collée, ou prise dans une pièce jointe du
// document), jamais une adresse : depuis le 23 nov 2026 la politique de widget.html n'ouvre plus `img-src https:`
// (consigne GFS 037, règle S3 ; décision d'Antoine du 23/11, il n'y avait que des formulaires de test, donc pas de migration).
// Mesuré dans un vrai Grist, politique appliquée (voir « Mesurer avec la politique de sécurité appliquée » dans README.md).
//
// Vérifie :
//   1. un formulaire neuf : l'onglet Paramètres propose de coller ou de choisir une pièce jointe, sans champ d'adresse ni choix de taille ;
//   2. « Coller une image » (événement de collage avec un vrai PNG détouré) : le logo apparaît, s'enregistre tout de suite dans
//      FormPlus_Formulaires sous `logoImage` (data: URL PNG, transparence gardée, 512 px au plus), jamais sous `logoUrl` ;
//   3. « Pièce jointe du document » : une image téléversée dans une table du document est choisie (table -> colonne -> fichier), le
//      jeton d'accès sert au téléchargement sous `connect-src`, et remplace le logo ;
//   4. l'aperçu du formulaire montre le logo (`img.fill-logo`, data: URL, chargé : naturalWidth > 0) ;
//   5. un formulaire d'avant (Definition avec `logoUrl`, adresse https) : la note l'explique, l'aperçu n'affiche aucune image et
//      AUCUNE requête ne part vers cette adresse ; l'ancienne adresse disparaît de la Definition à la sauvegarde suivante ;
//   6. aucune violation de la politique, aucune erreur de page pendant tout le parcours.
//
// À jouer avec la politique appliquée :
//   node tests/grist-env/serveur-csp.js 8010 8484 &   (après avoir arrêté le serveur du port 8010)
//   FORMPLUS_CSP=1 NODE_PATH=$(npm root -g) node tests/grist-env/e2e-logo.js [dossier_captures]
// Variables : GRIST_PORT (8484), WIDGET_PORT (8010), GRIST_TEST_STATE_DIR (~/.formplus-grist-test).
// Sort avec un code non nul au moindre contrôle en échec. Écrit : un formulaire « Logo… » et la table `LogosTest` (un fichier).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
const STATE_DIR = process.env.GRIST_TEST_STATE_DIR || path.join(os.homedir(), '.formplus-grist-test');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-e2e-logo-'));
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
const request = (method, url, body, headers = {}) => new Promise((resolve, reject) => {
  const data = body === undefined ? null : (Buffer.isBuffer(body) ? body : JSON.stringify(body));
  const req = http.request(url, { method, headers: { Authorization: `Bearer ${apiKey()}`, ...(data && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers } }, (r) => {
    let b = ''; r.on('data', (c) => { b += c; });
    r.on('end', () => { let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) { j = { raw: b }; } resolve({ status: r.statusCode, body: j }); });
  });
  req.on('error', reject); if (data) req.write(data); req.end();
});
const api = async (method, route, body) => (await request(method, `${GRIST}/o/${info.org}/api/docs/${info.docId}${route}`, body)).body;
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));
const definition = async () => {
  const rows = (await api('GET', '/tables/FormPlus_Formulaires/records')).records || [];
  return rows.length ? { id: rows[0].id, def: JSON.parse(rows[0].fields.Definition || '{}') } : null;
};

(async () => {
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'], bypassCSP: !process.env.FORMPLUS_CSP });
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
  const problems = [], violations = [], toLogoHost = [], downloads = [];
  ctx.on('request', (r) => { if (/exemple\.test/.test(r.url())) toLogoHost.push(r.url()); if (/\/attachments\/\d+\/download/.test(r.url())) downloads.push(r.url()); });
  ctx.on('page', (p) => {
    p.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`));
    p.on('console', (m) => { if (/Content[- ]Security[- ]Policy|Refused to (load|connect|apply|execute|frame|create)|violates the following/i.test(m.text())) violations.push(m.text().slice(0, 200)); });
  });
  const page = await ctx.newPage();
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);

  const widget = async () => {
    for (let i = 0; i < 60; i++) { const f = page.frames().find((fr) => fr.url().includes('widget.html')); if (f) return f; await page.waitForTimeout(250); }
    throw new Error('cadre du widget introuvable');
  };
  const openWidgetPage = async () => {
    await page.goto(DOC_URL);
    await page.getByText('FormPlus', { exact: true }).first().click();
    const f = await widget();
    await f.locator('#start-choices:visible, #editor:visible, #start-panel-guide:visible').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500);
    return f;
  };

  // Une image réelle, détourée : un disque rouge sur fond transparent, 600 x 300 (plus large que les 512 px du logo).
  const pngB64 = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 300;
    const x = c.getContext('2d'); x.fillStyle = '#d33'; x.beginPath(); x.arc(300, 150, 140, 0, 2 * Math.PI); x.fill();
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ''; buf.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s);
  });

  // ─── 1. Un formulaire neuf, construit sans lien ───
  const rows = (await api('GET', '/tables/FormPlus_Formulaires/records')).records || [];
  if (rows.length) await api('POST', '/apply', [['BulkRemoveRecord', 'FormPlus_Formulaires', rows.map((r) => r.id)]]);
  let w = await openWidgetPage();
  await w.locator('#start-choices:visible').waitFor({ timeout: 20000 });
  await w.click('[data-startgo="scratch"]');
  await w.fill('#scratchTable', `Logo${Date.now().toString(36)}`);
  await w.click('#scratchCreate');
  await w.locator('#start-panel-guide:visible').waitFor({ timeout: 20000 });
  await w.click('#guide-build');
  await w.locator('#editor:visible').waitFor({ timeout: 30000 });
  await w.click('#qadd');
  await w.locator('.qf-label').first().fill('Votre prénom');
  await w.locator('.qf-label').first().blur();
  await w.click('[data-etab="settings"]');
  await page.waitForTimeout(1500);

  const host = w.locator('#opt-logo-host');
  await host.locator('.qf-image-paste').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
  check('Paramètres : « Coller une image » et « Pièce jointe » sont proposés', (await host.locator('.qf-image-paste').count()) === 1 && (await host.locator('.qf-image-pick').count()) === 1, (await host.innerHTML().catch(() => '?')).slice(0, 300));
  check('…aucun champ d\'adresse (plus de `input#opt-logo`) ni de choix de taille', (await w.locator('#opt-logo').count()) === 0 && (await host.locator('.qf-image-size').count()) === 0);
  await w.locator('body').screenshot({ path: path.join(SHOTS, '1-parametres-sans-logo.png') });

  // ─── 2. Coller une image (le collage au clavier d'un vrai PNG, événement `paste`) ───
  await host.locator('.qf-image-paste').evaluate((btn, b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer(); dt.items.add(new File([bytes], 'logo.png', { type: 'image/png' }));
    btn.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, pngB64);
  await host.locator('.qf-image-preview:not(.hidden)').waitFor({ timeout: 10000 });
  await page.waitForTimeout(2000); // l'enregistrement part tout de suite
  let d = await definition();
  check('le logo collé apparaît, la liste des gestes se range', (await host.locator('.qf-image-actions.hidden').count()) === 1);
  check('…enregistré dans FormPlus_Formulaires sous `logoImage`, jamais sous `logoUrl`', !!d && !!d.def.logoImage && !('logoUrl' in d.def), JSON.stringify(d && Object.keys(d.def)));
  const first = d && d.def.logoImage && d.def.logoImage.dataUrl;
  check('…en data: URL PNG (la transparence est gardée, pas de JPEG sur fond noir)', /^data:image\/png;base64,/.test(first || ''), String(first).slice(0, 40));
  const meta = await w.evaluate(async (u) => {
    const img = new Image(); img.src = u; await img.decode();
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    return { w: img.naturalWidth, h: img.naturalHeight, cornerAlpha: x.getImageData(2, 2, 1, 1).data[3] };
  }, first);
  check('…réduit à 512 px au plus (600 x 300 -> 512 x 256)', meta.w === 512 && meta.h === 256, JSON.stringify(meta));
  check('…coin transparent (alpha 0)', meta.cornerAlpha === 0, JSON.stringify(meta));
  await w.locator('body').screenshot({ path: path.join(SHOTS, '2-logo-colle.png') });

  // ─── 3. Pièce jointe du document : choisir un fichier téléversé dans une table ───
  const table = 'LogosTest';
  const tables = (await api('GET', '/tables')).tables || [];
  if (!tables.some((t) => t.id === table)) await api('POST', '/apply', [['AddTable', table, [{ id: 'Fichier', type: 'Attachments' }]]]);
  const boundary = `----fp${Date.now()}`;
  const png = Buffer.from(pngB64, 'base64');
  const multipart = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="upload"; filename="logo-pj.png"\r\nContent-Type: image/png\r\n\r\n`), png, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const up = await request('POST', `${GRIST}/o/${info.org}/api/docs/${info.docId}/attachments`, multipart, { 'Content-Type': `multipart/form-data; boundary=${boundary}` });
  const attId = Array.isArray(up.body) ? up.body[0] : null;
  check('un fichier est téléversé dans le document', !!attId, JSON.stringify(up.body));
  await api('POST', `/tables/${table}/records`, { records: [{ fields: { Fichier: ['L', attId] } }] });
  // L'éditeur relit les tables à l'ouverture de l'onglet : on recharge pour qu'il voie la table neuve.
  w = await openWidgetPage();
  await w.locator('#editor:visible').waitFor({ timeout: 30000 });
  await w.click('[data-etab="settings"]');
  const host2 = w.locator('#opt-logo-host');
  await host2.locator('.qf-image-preview:not(.hidden)').waitFor({ timeout: 10000 });
  check('après rechargement, le logo enregistré est là', (await host2.locator('.qf-image-thumb').getAttribute('src')) === first);
  await host2.locator('.qf-image-remove').click();
  await host2.locator('.qf-image-pick').click();
  await host2.locator('[data-img-combo="imgTable"] .combo-input').click();
  await host2.locator(`[data-img-combo="imgTable"] .combo-opt[data-value="${table}"]`).click();
  await host2.locator('[data-img-combo="imgCol"] .combo-input').click();
  await host2.locator('[data-img-combo="imgCol"] .combo-opt[data-value="Fichier"]').click();
  await host2.locator('.qf-image-file-btn').first().click();
  await host2.locator('.qf-image-preview:not(.hidden)').waitFor({ timeout: 15000 });
  await page.waitForTimeout(2000);
  d = await definition();
  const second = d && d.def.logoImage && d.def.logoImage.dataUrl;
  check('la pièce jointe choisie est téléchargée (fetch avec jeton, sous connect-src) puis enregistrée en data: URL PNG', downloads.length >= 1 && /^data:image\/png;base64,/.test(second || ''), `${downloads.length} téléchargement(s) ; ${String(second).slice(0, 40)}`);
  await w.locator('body').screenshot({ path: path.join(SHOTS, '3-logo-piece-jointe.png') });

  // ─── 4. L'aperçu montre le logo ───
  await w.click('#done');
  await w.locator('#fill-card form').waitFor({ timeout: 30000 });
  const shown = await w.locator('img.fill-logo').evaluate((img) => ({ src: img.getAttribute('src').slice(0, 22), loaded: img.complete && img.naturalWidth > 0 }));
  check('l\'aperçu montre le logo, en data: URL, réellement chargé', shown.src.startsWith('data:image/png') && shown.loaded, JSON.stringify(shown));
  await w.locator('body').screenshot({ path: path.join(SHOTS, '4-apercu-logo.png') });

  // ─── 5. Un formulaire d'avant : un logo saisi par adresse ───
  d = await definition();
  const legacy = { ...d.def, logoUrl: 'https://exemple.test/logo.png' }; delete legacy.logoImage;
  await api('PATCH', '/tables/FormPlus_Formulaires/records', { records: [{ id: d.id, fields: { Definition: JSON.stringify(legacy) } }] });
  toLogoHost.length = 0;
  w = await openWidgetPage();
  await w.locator('#editor:visible').waitFor({ timeout: 30000 });
  await w.click('[data-etab="settings"]');
  check('ancien logo par adresse : la note l\'explique', (await w.locator('#opt-logo-host .qf-logo-legacy').count()) === 1, await w.locator('#opt-logo-host').innerText());
  await w.locator('body').screenshot({ path: path.join(SHOTS, '5-ancien-logo.png') });
  await w.click('#done');
  await w.locator('#fill-card form').waitFor({ timeout: 30000 });
  check('…l\'aperçu n\'affiche aucune image', (await w.locator('#fill-card img').count()) === 0);
  check('…et aucune requête ne part vers l\'ancienne adresse', toLogoHost.length === 0, toLogoHost.join(' | '));
  await w.click('#preview-finish').catch(() => {});
  w = await openWidgetPage();
  await w.locator('#editor:visible').waitFor({ timeout: 30000 });
  await w.click('[data-etab="settings"]');
  await w.locator('#opt-title').fill('Titre après ancien logo');
  await w.locator('#opt-title').blur();
  await page.waitForTimeout(2000);
  d = await definition();
  check('…à la sauvegarde suivante, l\'ancienne adresse disparaît de la Definition', !!d && !('logoUrl' in d.def), JSON.stringify(d && Object.keys(d.def)));

  // ─── 6. Aucune violation, aucune erreur ───
  check('aucune violation de la politique pendant tout le parcours', violations.length === 0, violations.join(' | '));
  check('aucune erreur de page', problems.length === 0, problems.join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} contrôle(s) en échec. Captures : ${SHOTS}` : `\nTout est vert. Captures : ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log(`✗ exception : ${e.message}`); process.exit(1); });
