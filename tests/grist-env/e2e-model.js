#!/usr/bin/env node
// « Nouveau > Depuis un modèle » de GFS (consigne GFS 033), contre un VRAI Grist (celui de start-grist-test.sh) avec la
// vraie app. GFS est simulé par la page de Grist elle-même (le parent du cadre du widget) : l'adresse du cadre porte
// `gfs=1`, la page répond à l'appel `contexte` du widget avec l'ouverture voulue, puis lui envoie l'appel `ouvrir`
// (contrats de GFS 5.2 point 3 et 5.4 point 13), exactement les messages que GFS envoie. Ce que ce test vérifie :
//   A. ouverture au démarrage sur un modèle (`raison: 'modele'`) : le panneau du modèle s'affiche, et RIEN n'est écrit dans
//      le document (ni table, ni page, ni section) tant que la personne n'a pas cliqué « Créer ce formulaire » ;
//   B. le clic crée la table des réponses (une colonne par question, au bon type), le formulaire natif sur une page
//      nommée, la copie que Form+ gère (brouillon, non publié), le titre, l'accueil, le message de fin et toutes les
//      questions du modèle, conditions comprises ;
//   C. ce formulaire se publie et répond comme n'importe quel autre : un visiteur ANONYME répond (la question à condition
//      n'apparaît qu'après le bon choix) et sa réponse arrive dans les bonnes colonnes ;
//   D. l'appel `ouvrir` d'un cadre déjà ouvert : un modèle connu s'ouvre ({ ouvert: true }) ; un identifiant inconnu et un
//      autre type rendent { ouvert: false } sans rien changer à l'écran (jamais un formulaire vierge à la place) ;
//   E. une ouverture de démarrage sur un modèle inconnu : l'écran de départ le dit, aucun panneau, rien n'est créé.
//
// Usage : tests/grist-env/start-grist-test.sh   (une fois, démarre Grist et sert le widget)
//         NODE_PATH=$(npm root -g) node tests/grist-env/e2e-model.js [dossier_captures]
// Variables : GRIST_PORT (8484), WIDGET_PORT (8010), GRIST_TEST_STATE_DIR (~/.formplus-grist-test), MODEL (inscription-evenement).
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
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-e2e-model-'));
const MODEL = process.env.MODEL || 'inscription-evenement';
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
const request = (method, url, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const req = http.request(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` } }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) { j = { raw: b }; } resolve(j); }); });
  req.on('error', reject); if (data) req.write(data); req.end();
});
const api = (method, route, body) => request(method, `${GRIST}/o/${info.org}/api/docs/${info.docId}${route}`, body);
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));
const records = async (table) => ((await api('GET', `/tables/${table}/records`)).records || []).map((r) => ({ id: r.id, ...r.fields }));
const tableIds = async () => ((await api('GET', '/tables')).tables || []).map((t) => t.id);
// L'état du document que le panneau ne doit jamais changer : tables, pages, sections.
const docShape = async () => JSON.stringify({ tables: (await tableIds()).sort(), pages: (await records('_grist_Pages')).length, sections: (await records('_grist_Views_section')).length });

// Les mêmes questions que le modèle, lues dans le module de l'app (Node sait importer ce fichier sans dépendance).
async function loadModel(id) {
  const url = new URL(`../../poc/js/templates.js`, `file://${__filename}`);
  const mod = await import(url.href);
  return { model: mod.findModel(id), mod };
}

(async () => {
  const { model, mod } = await loadModel(MODEL);
  if (!model) throw new Error(`modèle « ${MODEL} » introuvable dans poc/js/templates.js`);
  const T = (v) => mod.pick(v, 'fr');
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  const browser = await chromium.launch();
  // bypassCSP : ce Grist de test est en HTTP nu, le `connect-src 'self' https:` du widget bloquerait ses appels vers lui (README, point 5).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'], bypassCSP: true });
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'Cache-Control': 'no-store' }, body: `eval(${JSON.stringify(pluginApi)});` }));
  // Dans GFS, l'adresse du cadre porte `gfs=<n>` et la langue (contrats 1.3) : une redirection les ajoute (un simple
  // `route.continue({ url })` laisserait la page voir l'adresse d'origine).
  let hosted = true;
  await ctx.route(new RegExp(`^http://localhost:${WIDGET_PORT}/poc/widget\\.html`), (route) => {
    const u = new URL(route.request().url());
    if (!hosted || u.searchParams.has('gfs')) return route.continue();
    u.searchParams.set('gfs', '1'); u.searchParams.set('language', 'fr');
    return route.fulfill({ status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' } });
  });
  const problems = [];
  ctx.on('page', (p) => p.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`)));
  // Le parent note tout ce que le cadre lui envoie (appels à GFS, réponses à ses appels).
  await ctx.addInitScript(() => { window.__gfs = []; window.addEventListener('message', (e) => { if (e.data && typeof e.data === 'object' && 'gfs' in e.data) window.__gfs.push(e.data); }); });

  const page = await ctx.newPage();
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);

  const widget = async () => {
    for (let i = 0; i < 120; i++) {
      const f = page.frames().find((fr) => fr.url().includes('widget.html'));
      if (f) return f;
      await page.waitForTimeout(250);
    }
    throw new Error('cadre du widget introuvable');
  };
  // Ouvre la page du widget ; en mode GFS, répond à `contexte` avec l'ouverture donnée (ou aucune).
  const openWidget = async ({ opening = null } = {}) => {
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
    await page.waitForTimeout(2500); // le widget choisit son écran en plusieurs temps : attendre qu'il ait fini
    return f;
  };
  // GFS appelle `ouvrir` sur le cadre déjà ouvert ; rend la réponse du widget ({ ouvert }).
  const callOpen = async (args) => {
    const id = 9000 + Math.floor(Math.random() * 900);
    await page.evaluate(({ id, args }) => {
      const fr = [...document.querySelectorAll('iframe')].find((i) => i.src.includes('widget.html'));
      fr.contentWindow.postMessage({ gfs: 1, type: 'appel', id, nom: 'ouvrir', args }, '*');
    }, { id, args });
    for (let i = 0; i < 100; i++) {
      const r = await page.evaluate((id) => window.__gfs.find((m) => m.type === 'reponse' && m.id === id) || null, id);
      if (r) return r.data;
      await page.waitForTimeout(100);
    }
    return null;
  };
  const opening = (id, type = 'formulaire') => ({ fichier: null, type, dossier: '', raison: 'modele', modele: { id } });
  const visible = (f, sel) => f.locator(`${sel}:visible`).count().then((n) => n > 0);

  // Un document propre : les formulaires gardés par les essais d'avant sont retirés, comme un premier usage.
  const old = await records('FormPlus_Formulaires').catch(() => []);
  if (old.length) await api('POST', '/apply', [['BulkRemoveRecord', 'FormPlus_Formulaires', old.map((r) => r.id)]]);
  const TABLE = `${T(model.table)}${Date.now().toString(36).slice(-3)}`; // jamais une table déjà là : le modèle en crée toujours une neuve

  // ───────────────────────── A. Ouverture au démarrage sur un modèle : rien n'est écrit ─────────────────────────
  hosted = true;
  const shapeBefore = await docShape();
  let w = await openWidget({ opening: opening(MODEL) });
  check('A. le panneau du modèle s’affiche à l’ouverture', await visible(w, '#start-panel-model'));
  check('A. …les choix de départ et l’éditeur sont cachés', !(await visible(w, '#start-choices')) && !(await visible(w, '#editor')));
  const panelText = await w.locator('#start-panel-model').innerText();
  check('A. …il dit le nom du modèle et liste ses questions', panelText.includes(T(model.nom)) && model.questions.every((q) => panelText.includes(T(q.label))), panelText.slice(0, 200));
  check('A. …il propose le nom de la table des réponses', (await w.inputValue('#modelTable')) === T(model.table));
  check('A. …et dit que rien n’est créé avant le clic', /Rien n’est créé/.test(panelText));
  check('A. RIEN n’est écrit dans le document (ni table, ni page, ni section) tant que la personne n’a pas cliqué', (await docShape()) === shapeBefore);
  await w.locator('body').screenshot({ path: path.join(SHOTS, '1-panneau-du-modele.png') });

  // ───────────────────────── B. Le clic crée tout ─────────────────────────
  await w.fill('#modelTable', TABLE);
  await w.click('#modelCreate');
  // Dans un document neuf, Form+ demande d'abord l'accord de créer sa table de définitions : on l'accepte, après avoir
  // constaté que rien n'est encore créé (le refus ne doit laisser ni table ni page à moitié faites).
  let consent = false;
  for (let i = 0; i < 160; i++) {
    if (await w.locator('#editor:visible').count()) break;
    if (await w.locator('#pp-dialog-modal:visible').count()) {
      if (!consent) { consent = true; check('B. l’accord de créer FormPlus_Formulaires se demande AVANT toute création (aucune table de réponses encore)', !(await tableIds()).includes(TABLE)); }
      await w.locator('#pp-dialog-modal .pp-modal-primary').first().click({ timeout: 5000 }).catch(() => {});
    }
    await page.waitForTimeout(250);
  }
  await w.locator('#editor:visible').waitFor({ timeout: 30000 }).catch(async (e) => {
    await w.locator('body').screenshot({ path: path.join(SHOTS, 'ECHEC-creation.png') });
    throw new Error(`${e.message.split('\n')[0]} (message : ${JSON.stringify(await w.locator('#model-msg').innerText().catch(() => '?'))})`);
  });
  check('B. l’éditeur s’ouvre sur le formulaire créé', true);
  const tables = await tableIds();
  const tableId = tables.find((t) => t === TABLE || t.startsWith(TABLE));
  check('B. la table des réponses existe, sous le nom donné', !!tableId, JSON.stringify(tables));
  // Les colonnes techniques que Form+ pose lui-même (FormPlusDef_…, la définition donnée au répondant) ne sont pas celles du modèle.
  const cols = ((await api('GET', `/tables/${tableId}/columns`)).columns || []).filter((c) => !/^FormPlus/.test(c.id)).map((c) => ({ id: c.id, type: c.fields.type, label: c.fields.label }));
  const wanted = mod.modelColumns(model, 'fr');
  const TYPES = { text: 'Text', longtext: 'Text', number: 'Numeric', scale: 'Numeric', date: 'Date', select: 'Choice', multiselect: 'ChoiceList', timeslot: 'Choice' };
  check('B. une colonne par question qui reçoit une réponse, dans l’ordre et au bon type', JSON.stringify(cols.map((c) => [c.id, c.type])) === JSON.stringify(wanted.map((c) => [c.id, TYPES[c.kind]])), JSON.stringify(cols));
  check('B. aucune colonne en trop (pas de colonne « A » vide)', cols.length === wanted.length && !cols.some((c) => c.id === 'A'));
  const defRows = await records('FormPlus_Formulaires');
  check('B. une seule ligne dans FormPlus_Formulaires', defRows.length === 1, String(defRows.length));
  const def = JSON.parse(defRows[0].Definition);
  check('B. le titre, l’accueil et le message de fin du modèle', def.formTitle === T(model.form.title) && def.formDescription === T(model.form.description) && def.endMessage === T(model.form.endMessage), JSON.stringify([def.formTitle, def.formDescription, def.endMessage]));
  const expected = mod.buildQuestions(model, 'fr', tableId, (() => { let n = 0; return () => `x${++n}`; })());
  const shape = (q) => ({ kind: q.kind, label: q.label, required: !!q.required, choices: q.choices || null, writeTable: q.writeTable || null, writeCol: q.writeCol || null, cond: q.condition ? q.condition.rules[0].value : null });
  check('B. les questions du modèle sont toutes enregistrées, dans l’ordre', JSON.stringify(def.questions.map(shape)) === JSON.stringify(expected.map(shape)), JSON.stringify(def.questions.map(shape)).slice(0, 400));
  const condQ = def.questions.find((q) => q.condition);
  const condSrc = condQ && def.questions.find((q) => q.id === condQ.condition.rules[0].questionId);
  if (model.questions.some((x) => x.showIf)) check('B. la condition d’affichage vise bien la question qui la commande', !!condQ && !!condSrc && condSrc.kind === 'select', JSON.stringify(condQ && condQ.condition));
  check('B. le formulaire est un brouillon : ni lien, ni adresse, rien de publié', !def.formLink && !def.publicUrl);
  const sec = (await records('_grist_Views_section')).find((s) => s.id === def.vsId);
  check('B. …la copie que Form+ gère n’est pas publiée', !!sec && !JSON.parse(sec.shareOptions || '{}').publish, sec && sec.shareOptions);
  const views = await records('_grist_Views');
  check('B. la page du formulaire porte un nom qui dit à quoi elle sert', views.some((v) => v.name === `Formulaire ${tableId}`), JSON.stringify(views.map((v) => v.name)));
  const banner = await w.locator('#nolink-banner').innerText();
  check('B. le bandeau dit « Pas encore publié »', /pas encore publié/i.test(banner), banner);
  const created = await w.locator('#import-msg').innerText();
  check('B. un message dit ce qui a été créé', created.includes(T(model.nom)) && created.includes(tableId), created);
  const cards = await w.locator('#qlist .qcard').count();
  check('B. la liste des questions montre celles du modèle', cards >= model.questions.length, String(cards));
  await w.locator('body').screenshot({ path: path.join(SHOTS, '2-formulaire-cree.png') });

  // L'aperçu (route du document, jeton du widget) : la question à condition n'apparaît qu'après le bon choix.
  await w.click('[data-etab="settings"]');
  await w.click('#done');
  await w.locator('#preview-finish').waitFor({ timeout: 15000 });
  const preview = (await w.locator('#fill-card').innerText()).replace(/\s+/g, ' ').toLowerCase(); // les titres de section s'écrivent en capitales (CSS)
  const has = (txt) => preview.includes(String(txt).replace(/\s+/g, ' ').toLowerCase());
  check('B. l’aperçu montre le titre, l’accueil et les questions du modèle (celle à condition reste cachée)', has(def.formTitle) && has(def.formDescription) && model.questions.filter((q) => !q.showIf).every((q) => has(T(q.label))) && model.questions.filter((q) => q.showIf).every((q) => !has(T(q.label))), preview.slice(0, 300));
  await w.locator('body').screenshot({ path: path.join(SHOTS, '3-apercu.png') });

  // ───────────────────────── C. Publier, puis un visiteur anonyme répond ─────────────────────────
  hosted = false; // la publication se rejoue hors GFS (le guide y ouvre la vraie page de Grist, d'où le lien se copie)
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
  check('C. Grist donne un lien de formulaire', /\/forms\/[^/]+\/\d+$/.test(link), link);
  await page.bringToFront();
  await w.click('[data-guide="opened"]');
  await w.locator('#guide-link').focus();
  await page.evaluate((l) => navigator.clipboard.writeText(l), link);
  await page.keyboard.press('Control+V');
  await w.locator('#editor:visible').waitFor({ timeout: 30000 });
  let def2 = null;
  for (let i = 0; i < 80; i++) {
    const rows = await records('FormPlus_Formulaires');
    def2 = JSON.parse(rows[0].Definition);
    if (def2.publicUrl) break;
    await page.waitForTimeout(250);
  }
  check('C. le lien est rattaché : l’adresse à diffuser existe, les questions sont intactes', !!def2.publicUrl && def2.questions.length === def.questions.length);

  const anon = await browser.newContext({ viewport: { width: 900, height: 900 }, locale: 'fr-FR', bypassCSP: true });
  await anon.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
  const visitor = await anon.newPage();
  visitor.on('pageerror', (e) => problems.push(`VISITEUR PAGEERROR ${e.message}`));
  await visitor.goto(def2.publicUrl.replace(/^https?:\/\/[^/]+/, `http://localhost:${WIDGET_PORT}`));
  await visitor.locator('#fill-card form').waitFor({ timeout: 30000 });
  await visitor.waitForTimeout(1200);
  const q = (key) => def2.questions[model.questions.findIndex((x) => x.key === key)];
  const sel = (key) => `#eq-${q(key).id}`;
  const cond = model.questions.find((x) => x.showIf);
  if (cond) {
    const src = model.questions.find((x) => x.key === cond.showIf.key);
    check('C. le visiteur voit le formulaire du modèle, sans aperçu ni bandeau de concepteur', !(await visitor.locator('#preview-finish').count()) && (await visitor.locator('#fill-card').innerText()).includes(T(model.questions.find((x) => x.col).label)));
    const condBlock = visitor.locator(`.q[data-extra="${q(cond.key).id}"]`);
    check('C. la question à condition est cachée au départ', !(await condBlock.isVisible()));
    const other = T(src.choices).find((c) => c !== T(cond.showIf.equals));
    await visitor.locator(`${sel(src.key)} input[value="${other}"]`).check({ force: true });
    check('C. …toujours cachée après un autre choix', !(await condBlock.isVisible()));
    await visitor.locator(`${sel(src.key)} input[value="${T(cond.showIf.equals)}"]`).check({ force: true });
    await condBlock.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    check('C. …elle apparaît après le bon choix', await condBlock.isVisible());
  }
  await visitor.screenshot({ path: path.join(SHOTS, '4-visiteur.png'), fullPage: true });
  if (MODEL === 'inscription-evenement') {
    await visitor.locator(sel('nom')).fill('Nom d’essai');
    await visitor.locator(sel('prenom')).fill('Prénom d’essai');
    await visitor.locator(sel('email')).fill('essai@example.org');
    await visitor.locator(sel('personnes')).fill('3');
    await visitor.locator(`${sel('repas')} input[value="Sans gluten"]`).check({ force: true });
    await visitor.locator('#pv-submit-btn').click();
    let row = null;
    for (let i = 0; i < 40 && !row; i++) {
      await visitor.waitForTimeout(250);
      row = (await records(tableId))[0] || null;
    }
    check('C. la réponse du visiteur arrive dans la table, une ligne', !!row);
    check('C. …dans les bonnes colonnes (texte, choix, nombre)', !!row && row.Nom === 'Nom d’essai' && row.Prenom === 'Prénom d’essai' && row.Email === 'essai@example.org' && row.Participation === 'Sur place' && row.Personnes === 3, JSON.stringify(row));
    check('C. …y compris le choix multiple de la question à condition', !!row && Array.isArray(row.Repas) && row.Repas.includes('Sans gluten'), JSON.stringify(row && row.Repas));
  }
  await anon.close();

  // ───────────────────────── D. L'appel `ouvrir` d'un cadre déjà ouvert ─────────────────────────
  hosted = true;
  w = await openWidget({ opening: null });
  const shapeD = await docShape();
  const other = mod.MODELS.find((m) => m.id !== MODEL);
  const r1 = await callOpen(opening(other.id));
  check('D. `ouvrir` sur un modèle connu : { ouvert: true }', r1 && r1.ouvert === true, JSON.stringify(r1));
  check('D. …le panneau de ce modèle s’affiche, avec son nom de table', (await visible(w, '#start-panel-model')) && (await w.locator('#start-panel-model h2').innerText()) === T(other.nom) && (await w.inputValue('#modelTable')) === T(other.table));
  check('D. …et rien n’est écrit pour autant', (await docShape()) === shapeD);
  await w.locator('body').screenshot({ path: path.join(SHOTS, '5-ouvrir-un-autre-modele.png') });
  const r2 = await callOpen(opening('modele-qui-n-existe-pas'));
  check('D. `ouvrir` sur un identifiant inconnu : { ouvert: false }', r2 && r2.ouvert === false, JSON.stringify(r2));
  check('D. …l’écran ne change pas (le panneau d’avant reste, jamais un formulaire vierge)', (await visible(w, '#start-panel-model')) && (await w.locator('#start-panel-model h2').innerText()) === T(other.nom));
  const r3 = await callOpen(opening(MODEL, 'document'));
  check('D. `ouvrir` sur un autre type que « formulaire » : { ouvert: false }', r3 && r3.ouvert === false, JSON.stringify(r3));
  const r4 = await callOpen({ ...opening(MODEL), modele: undefined });
  check('D. `ouvrir` en raison « modele » sans identifiant : { ouvert: false }', r4 && r4.ouvert === false, JSON.stringify(r4));
  check('D. rien n’a été écrit pendant ces appels', (await docShape()) === shapeD);

  // ───────────────────────── E. Ouverture au démarrage sur un modèle inconnu ─────────────────────────
  w = await openWidget({ opening: opening('modele-qui-n-existe-pas') });
  check('E. modèle inconnu au démarrage : l’écran de départ, sans panneau de modèle', (await visible(w, '#start-choices')) && !(await visible(w, '#start-panel-model')));
  const notice = await w.locator('#start-notice').innerText();
  check('E. …et il dit que ce modèle n’existe pas, que rien n’a été créé', /n’existe pas/.test(notice) && /rien n’a été créé/.test(notice), notice);
  check('E. …aucun formulaire ancien n’est rouvert à la place (pas d’éditeur)', !(await visible(w, '#editor')));
  check('E. …et rien n’est écrit', (await docShape()) === shapeD);
  await w.locator('body').screenshot({ path: path.join(SHOTS, '6-modele-inconnu.png') });

  check('aucune erreur de page pendant tout le parcours', problems.length === 0, problems.join(' | '));
  await browser.close();
  console.log(`\nCaptures : ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✗ exception :', e.message); process.exit(1); });
