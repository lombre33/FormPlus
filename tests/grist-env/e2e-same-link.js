#!/usr/bin/env node
// Consigne GFS 030 contre un VRAI Grist (celui de start-grist-test.sh) :
//  - « Même lien que… » : un premier formulaire est créé de bout en bout (publication par Form+, lien copié
//    par le bouton de Grist, collé au vrai clavier), puis un second reprend son lien : la case est proposée
//    décochée, cochée elle publie sans rien à copier, et la clé du premier ouvre bien les DEUX formulaires,
//    en lecture du formulaire et en écriture anonyme dans la table de chacun (seulement la sienne) ;
//  - le refus de la PERSONNE : la fenêtre d'accord de GFS n'existe pas dans ce banc, on la joue en faisant
//    lever par l'API du widget l'erreur que GFS lève (code GFS_ANNULE) : le guide le dit, garde le bouton, et
//    le second clic reprend le partage déjà posé (branche « page déjà partagée », sans en créer un second) ;
//  - ce qui arrive quand on dépublie l'un des deux dans Grist (mesuré : le lien des DEUX se ferme, parce que le
//    partage est unique ; republier le partage rouvre les deux) : la phrase du guide le dit.
// Ce que ce banc ne couvre PAS : les fenêtres de GFS elles-mêmes (« Un seul lien pour deux formulaires ? »,
// « Ouvrir au public ? »), qui n'existent que dans un vrai GFS ; leurs refus sont joués ici par l'erreur
// qu'elles produisent, et dans la suite #test.
//
// Usage : tests/grist-env/start-grist-test.sh   (une fois)
//         NODE_PATH=$(npm root -g) node tests/grist-env/e2e-same-link.js [dossier_captures]
// Variables : GRIST_PORT (8484), WIDGET_PORT (8010), GRIST_TEST_STATE_DIR (~/.formplus-grist-test).
// Sort avec un code non nul au premier contrôle qui échoue. Laisse dans le document de test des tables
// EssaiXXX et deux pages de formulaire : `start-grist-test.sh` le recrée à neuf.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
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
const request = (method, url, body, auth = true) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers.Authorization = `Bearer ${apiKey()}`;
  const req = http.request(url, { method, headers }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { let json = null; try { json = JSON.parse(b || 'null'); } catch (e) { /* pas du JSON */ } resolve({ status: r.statusCode, json, text: b }); }); });
  req.on('error', reject); if (data) req.write(data); req.end();
});
const api = async (method, route, body) => (await request(method, `${GRIST}/o/${info.org}/api/docs/${info.docId}${route}`, body)).json || {};
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));
const recs = async (table) => (await api('GET', `/tables/${table}/records`)).records || [];

(async () => {
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'], bypassCSP: true }); // bypassCSP : ce Grist de test est en HTTP nu, le `connect-src 'self' https:` du widget bloquerait ses appels (README.md, point 5)
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
  const problems = [];
  ctx.on('page', (p) => p.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`)));

  // Partir d'un widget sans formulaire gardé (comme un premier usage).
  const old = await recs('FormPlus_Formulaires');
  if (old.length) await api('POST', '/apply', [['BulkRemoveRecord', 'FormPlus_Formulaires', old.map((r) => r.id)]]);

  const page = await ctx.newPage();
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);
  await page.goto(DOC_URL);
  await page.getByText('FormPlus', { exact: true }).first().click();
  const widget = async () => {
    for (let i = 0; i < 60; i++) {
      const f = page.frames().find((fr) => fr.url().includes('widget.html'));
      if (f) return f;
      await page.waitForTimeout(250);
    }
    throw new Error('cadre du widget introuvable');
  };
  let w = await widget();
  await w.locator('#start-choices:visible, #editor:visible, #start-panel-guide:visible').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500);
  const guideText = () => w.locator('#start-panel-guide').innerText();
  const step = () => w.locator('[aria-current="step"] .guide-num').innerText();
  const startScratch = async (table) => {
    await w.locator('#start-choices:visible').waitFor({ timeout: 15000 });
    await w.click('[data-startgo="scratch"]');
    await w.fill('#scratchTable', table);
    await w.click('#scratchCreate');
    await w.locator('#start-panel-guide:visible').waitFor({ timeout: 20000 });
  };
  const backToStart = async () => {
    await w.click('[data-etab="settings"]');
    await w.click('#change-source-btn');
    await w.locator('#start-choices:visible').waitFor({ timeout: 10000 });
  };
  const consent = async () => { // les fenêtres d'accord de Form+ et du kit (créer la table des formulaires, rendre la copie publique) : les seuls clics de ce côté de Grist
    for (let i = 0; i < 120; i++) {
      if (await w.locator('#editor:visible').count()) return;
      if (await w.locator('#pp-dialog-modal:visible').count()) await w.locator('#pp-dialog-modal .pp-modal-primary').first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
    await w.locator('body').screenshot({ path: path.join(SHOTS, 'ECHEC-consent.png') });
    throw new Error(`éditeur jamais affiché (message du guide : ${JSON.stringify(await w.locator('#guide-msg').innerText().catch(() => '(absent)'))})`);
  };
  const shareInfo = async () => {
    const pages = await recs('_grist_Pages');
    const views = await recs('_grist_Views');
    const sections = await recs('_grist_Views_section');
    return { pages, views, sections };
  };
  const rowFor = async (tableName) => (await recs('FormPlus_Formulaires')).map((r) => ({ id: r.id, name: r.fields.Nom, def: JSON.parse(r.fields.Definition || '{}') })).find((r) => String(r.def.formTitle || r.name || '').includes(tableName) || (r.def.questions || []).some(() => false));

  // ─── 1. Le premier formulaire, de bout en bout (comme e2e-onboarding.js) ───
  const stamp = Date.now().toString(36);
  const tA = `Essai${stamp}a`, tB = `Essai${stamp}b`, tC = `Essai${stamp}c`;
  await startScratch(tA);
  check('premier formulaire : aucune case « Même lien » (aucun autre formulaire publié)', (await w.locator('#guide-same').count()) === 0);
  await w.click('#guide-publish');
  await w.locator('[aria-current="step"] .guide-num').filter({ hasText: '2' }).waitFor({ timeout: 15000 });
  const [gristA] = await Promise.all([ctx.waitForEvent('page'), w.click('#guide-open')]);
  await gristA.waitForLoadState();
  await gristA.getByText('Partager', { exact: true }).first().waitFor({ timeout: 30000 });
  await gristA.getByText('Partager', { exact: true }).first().click();
  await gristA.getByText('Copier le lien', { exact: true }).click();
  const linkA = await gristA.evaluate(() => navigator.clipboard.readText());
  check('lien du premier formulaire copié par Grist', /\/forms\/[^/]+\/\d+$/.test(linkA), linkA);
  const keyA = (linkA.match(/\/forms\/([^/]+)\/\d+$/) || [])[1];
  await page.bringToFront();
  await w.locator('#guide-link').focus();
  await page.keyboard.press('Control+V');
  await consent();
  const rowA = (await recs('FormPlus_Formulaires'))[0];
  const defA = JSON.parse(rowA.fields.Definition);
  check('le premier formulaire garde sa clé', defA.shareKey === keyA, `${defA.shareKey} / ${keyA}`);
  await gristA.close();

  // ─── 2. Le second : la case, décochée par défaut, avec son prix ───
  await backToStart();
  await startScratch(tB);
  check('étape 1', (await step()) === '1');
  const box = w.locator('#guide-same');
  check('la case « Même lien » est proposée', (await box.count()) === 1);
  check('…décochée', !(await box.isChecked()));
  const phrase = await w.locator('.guide-same').innerText();
  check('…elle nomme le premier formulaire', phrase.includes(String(rowA.fields.Nom)), phrase);
  check('…dit ce que ça évite et ce que ça coûte', /rien à copier/.test(phrase) && /les deux/.test(phrase), phrase);
  await w.locator('body').screenshot({ path: path.join(SHOTS, 'b1-guide-case.png') });

  // ─── 3. Cochée : publication sans rien à copier ───
  await box.check();
  const partagesAvantB = (await recs('_grist_Shares')).length;
  await w.click('#guide-publish');
  await consent(); // l'étape de collage est franchie par Form+ : on arrive directement à l'éditeur (après l'accord de Form+)
  check('cochée : l’éditeur s’affiche sans étape de collage', (await w.locator('#start-panel-guide:visible').count()) === 0);
  const rows = await recs('FormPlus_Formulaires');
  const defs = rows.map((r) => JSON.parse(r.fields.Definition));
  const defB = defs.find((d) => d.vsId !== defA.vsId);
  check('deux formulaires gérés', defs.length === 2 && !!defB);
  check('le second a enregistré la clé du premier', defB && defB.shareKey === keyA, defB && defB.shareKey);
  check('…et son lien porte la clé du premier, avec la section native du second (comme tout lien collé)', defB && defB.formLink && defB.formLink.endsWith(`/forms/${keyA}/${defB.sourceVsId}`), defB && defB.formLink);
  const { pages, sections } = await shareInfo();
  const pageOf = (vsId) => pages.find((p) => p.fields.viewRef === (sections.find((s) => s.id === vsId) || { fields: {} }).fields.parentId);
  const pA = pageOf(defA.vsId), pB = pageOf(defB.vsId);
  check('les deux pages portent le même partage', pA && pB && pA.fields.shareRef > 0 && pA.fields.shareRef === pB.fields.shareRef, `${pA && pA.fields.shareRef} / ${pB && pB.fields.shareRef}`);
  check('…et elles sont bien deux pages différentes', pA && pB && pA.id !== pB.id);
  const shares = await recs('_grist_Shares');
  check('aucun partage de plus n’a été créé pour le second', shares.length === partagesAvantB, `${partagesAvantB} -> ${shares.length} partage(s)`);

  // La clé du premier ouvre les DEUX formulaires, et chacun reçoit des lignes dans sa propre table, seulement la sienne.
  const anon = (m, p, b) => request(m, `${GRIST}/o/${info.org}/api/s/${keyA}${p}`, b, false);
  const fA = await anon('GET', `/forms/${defA.vsId}`);
  const fB = await anon('GET', `/forms/${defB.vsId}`);
  check('la clé ouvre le premier formulaire', fA.status === 200, String(fA.status));
  check('la clé ouvre aussi le second', fB.status === 200, String(fB.status));
  const tableOf = (f) => f.json && f.json.formTableId;
  check('chacun montre sa propre table', tableOf(fA) === tA.replace(/^./, (c) => c.toUpperCase()) || String(tableOf(fA)).toLowerCase() === tA.toLowerCase(), `${tableOf(fA)} / ${tableOf(fB)}`);
  const postA = await anon('POST', `/tables/${tableOf(fA)}/records`, { records: [{ fields: {} }] });
  const postB = await anon('POST', `/tables/${tableOf(fB)}/records`, { records: [{ fields: {} }] });
  check('une réponse anonyme est écrite dans la table du premier', postA.status === 200, String(postA.status) + ' ' + postA.text.slice(0, 120));
  check('une réponse anonyme est écrite dans la table du second', postB.status === 200, String(postB.status) + ' ' + postB.text.slice(0, 120));
  const readB = await anon('GET', `/tables/${tableOf(fB)}/records`);
  check('mais jamais lue', readB.status !== 200 || JSON.stringify(readB.json).includes('["C"]') || !(readB.json && readB.json.records && readB.json.records.length && readB.json.records[0].fields && Object.values(readB.json.records[0].fields).some((v) => v !== null && !Array.isArray(v))), String(readB.status));
  await w.locator('body').screenshot({ path: path.join(SHOTS, 'b2-editeur-second.png') });

  // ─── 4. Le refus de la PERSONNE (GFS_ANNULE), joué par l'erreur que GFS lève ───
  await backToStart();
  await startScratch(tC);
  await w.evaluate(() => {
    const orig = window.grist.docApi.applyUserActions.bind(window.grist.docApi);
    let refus = 1;
    window.__annules = 0;
    window.grist.docApi.applyUserActions = async (a) => {
      if (a[0] && a[0][1] === '_grist_Views_section' && a[0][3] && a[0][3].shareOptions && refus-- > 0) {
        window.__annules++;
        const e = new Error('GFS_ANNULE : la personne a refusé'); e.code = 'GFS_ANNULE'; throw e;
      }
      return orig(a);
    };
  });
  const partagesAvant = (await recs('_grist_Shares')).length;
  await w.click('#guide-publish');
  await w.locator('#guide-declined').waitFor({ timeout: 15000 });
  check('refus de la personne : elle lit qu’elle a refusé', /refusé|declined/.test(await w.locator('#guide-declined').innerText()));
  check('…le bouton « Publier le formulaire » est toujours là', (await w.locator('#guide-publish:not([disabled])').count()) === 1);
  check('…jamais le geste à la main ni « Form+ n’a pas pu publier »', (await w.locator('#guide-open').count()) === 0 && !/pas pu publier|could not publish/.test(await guideText()));
  check('…étape 1', (await step()) === '1');
  const partagesApresRefus = (await recs('_grist_Shares')).length;
  check('le partage posé avant le refus reste (un de plus)', partagesApresRefus === partagesAvant + 1, `${partagesAvant} -> ${partagesApresRefus}`);
  await w.locator('body').screenshot({ path: path.join(SHOTS, 'c1-refus.png') });
  await w.click('#guide-publish');
  await w.locator('[aria-current="step"] .guide-num').filter({ hasText: '2' }).waitFor({ timeout: 15000 });
  check('second clic : publié, étape 2', true);
  check('…sans créer un second partage (branche « page déjà partagée »)', (await recs('_grist_Shares')).length === partagesApresRefus);
  check('…et la phrase du refus a disparu', (await w.locator('#guide-declined').count()) === 0);

  // ─── 5. Mesure : dépublier l'un des deux dans Grist (bouton « Dépublier » de la page) ───
  // Mesuré sur Grist 1.7.22 : c'est ce qui permet au guide d'écrire « dépublier l'un ferme le lien de l'autre » (la
  // consigne 030 ne l'autorisait qu'une fois mesuré).
  const pageUrlOf = async (vsId) => {
    const secs = await recs('_grist_Views_section');
    const view = (secs.find((x) => x.id === vsId) || { fields: {} }).fields.parentId;
    return `${GRIST}/o/${info.org}/doc/${info.docId}/p/${view}`;
  };
  const statusOf = async (vsId) => (await anon('GET', `/forms/${vsId}`)).status;
  const snapshot = async (label) => {
    const pg = await recs('_grist_Pages');
    const sec = await recs('_grist_Views_section');
    const sh = await recs('_grist_Shares');
    const shareOf = (vsId) => { const v = (sec.find((x) => x.id === vsId) || { fields: {} }).fields.parentId; const p = pg.find((x) => x.fields.viewRef === v); return p ? p.fields.shareRef : '?'; };
    const opt = (vsId) => (sec.find((x) => x.id === vsId) || { fields: {} }).fields.shareOptions;
    console.log(`Mesure — ${label} : premier formulaire (section ${defA.vsId}) -> ${await statusOf(defA.vsId)}, second (section ${defB.vsId}) -> ${await statusOf(defB.vsId)} ; partage de la page du premier ${shareOf(defA.vsId)}, du second ${shareOf(defB.vsId)} ; shareOptions premier ${opt(defA.vsId)} second ${opt(defB.vsId)} ; options du partage ${JSON.stringify((sh.find((x) => x.id === shareOf(defA.vsId)) || { fields: {} }).fields.options)} ; ${sh.length} partages`);
    return { a: await statusOf(defA.vsId), b: await statusOf(defB.vsId) };
  };
  // La page porte DEUX sections de formulaire (l'originale et la copie de Form+), chacune avec son bouton
  // « Dépublier » : on les clique toutes, comme le ferait une personne qui retire la publication de la page.
  const unpublishInGrist = async (vsId) => {
    const g = await ctx.newPage();
    await g.goto(await pageUrlOf(vsId));
    await g.getByText('Dépublier', { exact: true }).first().waitFor({ timeout: 30000 });
    for (let i = 0; i < 4 && (await g.getByText('Dépublier', { exact: true }).count()) > 0; i++) {
      await g.getByText('Dépublier', { exact: true }).first().click();
      await g.waitForTimeout(1200);
      if ((await g.locator('.test-modal-dialog:visible').count()) > 0) await g.locator('.test-modal-confirm').first().click().catch(() => {});
      await g.waitForTimeout(1200);
    }
    await g.screenshot({ path: path.join(SHOTS, `d-apres-depublication-${vsId}.png`) });
    await g.close();
  };
  const before = await snapshot('avant');
  check('(avant) les deux formulaires s’ouvrent avec la clé du premier', before.a === 200 && before.b === 200, JSON.stringify(before));
  await unpublishInGrist(defB.vsId);
  const afterSecond = await snapshot('après avoir dépublié le SECOND dans Grist');
  check('« Dépublier » le second ferme le lien des DEUX (le partage est commun) : ce que la phrase du guide annonce', afterSecond.a === 404 && afterSecond.b === 404, JSON.stringify(afterSecond));
  // On republie le second (mêmes écritures que Form+) puis on dépublie le PREMIER.
  const secs2 = await recs('_grist_Views_section');
  const pg2 = await recs('_grist_Pages');
  const viewB = secs2.find((x) => x.id === defB.vsId).fields.parentId;
  const pageB2 = pg2.find((x) => x.fields.viewRef === viewB);
  const pageA2 = pg2.find((x) => x.fields.viewRef === secs2.find((x2) => x2.id === defA.vsId).fields.parentId);
  const shareRefA = pageA2.fields.shareRef;
  await api('POST', '/apply', [['UpdateRecord', '_grist_Shares', shareRefA, { options: '{"publish":true}' }], ['UpdateRecord', '_grist_Pages', pageB2.id, { shareRef: shareRefA }], ...secs2.filter((x) => x.fields.parentId === viewB && x.fields.parentKey === 'form').map((x) => ['UpdateRecord', '_grist_Views_section', x.id, { shareOptions: '{"publish":true,"form":true}' }])]);
  await page.waitForTimeout(500);
  const rearmed = await snapshot('second republié');
  check('republier le partage (options publish:true, la branche « page déjà partagée » de Form+) rouvre les deux', rearmed.a === 200 && rearmed.b === 200, JSON.stringify(rearmed));
  await unpublishInGrist(defA.vsId);
  const afterFirst = await snapshot('après avoir dépublié le PREMIER dans Grist');
  check('« Dépublier » le premier ferme aussi les deux', afterFirst.a === 404 && afterFirst.b === 404, JSON.stringify(afterFirst));

  check('aucune erreur de page pendant tout le parcours', problems.length === 0, problems.join(' | '));
  await browser.close();
  console.log(`\nCaptures : ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✗ exception :', e.message); process.exit(1); });
