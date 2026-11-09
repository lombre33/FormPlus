#!/usr/bin/env node
// Construire un formulaire AVANT d'avoir son lien, contre un VRAI Grist (celui de start-grist-test.sh).
// Demande d'Antoine (9 nov 2026) : « avancer sur la construction du formulaire sans avoir à coller le
// lien, et que ça soit rappelé à un moment qu'il n'est pas publié ». Le parcours, en vrai :
//   1. « Partir de zéro » -> guide -> « Construire le formulaire d'abord » (rien n'est publié) ;
//   2. l'éditeur s'ouvre en brouillon : bandeau « Pas encore publié », adresse à diffuser éteinte ;
//      une question s'ajoute et s'enregistre ; l'aperçu s'ouvre (route du document, jeton du widget) ;
//   3. le bandeau ramène au guide : « Publier le formulaire » (Form+ publie la COPIE qu'il gère) ;
//   4. « Partager > Copier le lien » dans Grist, collé dans le guide : l'adresse à diffuser apparaît, aucune
//      nouvelle copie n'est faite ;
//   5. un visiteur ANONYME (autre contexte de navigateur) ouvre l'adresse, répond, et la réponse arrive
//      dans la table - preuve que ce qui s'est construit avant la publication fonctionne après ;
//   6. variante : publier d'abord puis construire -> bandeau « il manque le lien ».
//
// Usage : tests/grist-env/start-grist-test.sh   (une fois, démarre Grist et sert le widget)
//         NODE_PATH=$(npm root -g) node tests/grist-env/e2e-build-first.js [dossier_captures]
// Variables : GRIST_PORT (8484), WIDGET_PORT (8010), GRIST_TEST_STATE_DIR (~/.formplus-grist-test).
// Sort avec un code non nul au premier contrôle qui échoue (les captures déjà prises restent).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
const STATE_DIR = process.env.GRIST_TEST_STATE_DIR || path.join(os.homedir(), '.formplus-grist-test');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-e2e-build-'));
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
  const req = http.request(url, { method, headers }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) { j = { raw: b }; } resolve({ status: r.statusCode, body: j }); }); });
  req.on('error', reject); if (data) req.write(data); req.end();
});
const api = async (method, route, body) => (await request(method, `${GRIST}/o/${info.org}/api/docs/${info.docId}${route}`, body)).body;
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));
// Sections de formulaire du document, relues dans les métadonnées (la vérité du côté de Grist).
const sections = async () => {
  const r = await api('GET', '/tables/_grist_Views_section/records');
  return (r.records || []).map((x) => ({ id: x.id, ...x.fields }));
};
const shares = async () => ((await api('GET', '/tables/_grist_Shares/records')).records || []).map((x) => ({ id: x.id, ...x.fields }));

(async () => {
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  const browser = await chromium.launch();
  // bypassCSP : ce Grist de test est en HTTP nu, le `connect-src 'self' https:` du widget bloquerait ses appels vers lui (voir tests/grist-env/README.md, point 5).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'], bypassCSP: true });
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
  const problems = [];
  ctx.on('page', (p) => p.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`)));

  const page = await ctx.newPage();
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);

  const widget = async (pg = page) => {
    for (let i = 0; i < 60; i++) {
      const f = pg.frames().find((fr) => fr.url().includes('widget.html'));
      if (f) return f;
      await pg.waitForTimeout(250);
    }
    throw new Error('cadre du widget introuvable');
  };
  const openWidgetPage = async () => {
    await page.goto(DOC_URL);
    await page.getByText('FormPlus', { exact: true }).first().click();
    const f = await widget();
    await f.locator('#start-choices:visible, #editor:visible, #start-panel-guide:visible').first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(2500); // le widget choisit son écran en plusieurs temps : attendre qu'il ait fini
    return f;
  };
  const freshStart = async () => {
    // Un widget neuf : on retire les formulaires gardés par les essais d'avant, comme un premier usage.
    const rows = await api('GET', '/tables/FormPlus_Formulaires/records');
    if (rows.records && rows.records.length) await api('POST', '/apply', [['BulkRemoveRecord', 'FormPlus_Formulaires', rows.records.map((r) => r.id)]]);
    const f = await openWidgetPage();
    await f.locator('#start-choices:visible').waitFor({ timeout: 20000 });
    return f;
  };
  const newForm = async (w, table) => {
    await w.click('[data-startgo="scratch"]');
    await w.fill('#scratchTable', table);
    await w.click('#scratchCreate');
    await w.locator('#start-panel-guide:visible').waitFor({ timeout: 20000 });
  };
  const state = async (w) => w.evaluate(() => ({
    editor: !!document.getElementById('editor').offsetParent,
    guide: !!document.getElementById('start-panel-guide').offsetParent,
    banner: document.getElementById('nolink-banner').classList.contains('hidden') ? '' : document.getElementById('nolink-banner').innerText,
  }));
  // Le lien que Grist met dans le presse-papiers (« Partager > Copier le lien ») : la seule voie vers la clé.
  const copyLinkFromGrist = async (pageUrl) => {
    const g = await ctx.newPage();
    await g.goto(pageUrl);
    await g.getByText('Partager', { exact: true }).first().waitFor({ timeout: 30000 });
    await g.getByText('Partager', { exact: true }).first().click();
    await g.getByText('Copier le lien', { exact: true }).click();
    const link = await g.evaluate(() => navigator.clipboard.readText());
    await g.close();
    return link;
  };

  // ───────────────────────── Parcours principal : construire d'abord, publier et coller ensuite ─────────────────────────
  let w = await freshStart();
  const table = `Brouillon${Date.now().toString(36)}`;
  await newForm(w, table);
  const secBefore = await sections();
  check('étape 1 : le bouton « Construire le formulaire d’abord » est proposé', (await w.locator('#guide-build').count()) === 1);
  await w.locator('body').screenshot({ path: path.join(SHOTS, '1-guide-construire-d-abord.png') });

  await w.click('#guide-build');
  await w.locator('#editor:visible').waitFor({ timeout: 30000 }).catch(async (e) => {
    await w.locator('body').screenshot({ path: path.join(SHOTS, 'ECHEC-construire.png') });
    throw new Error(`${e.message.split('\n')[0]} (message du guide : ${JSON.stringify(await w.locator('#guide-msg').innerText().catch(() => '(absent)'))})`);
  });
  check('l’éditeur s’ouvre sans avoir publié ni collé quoi que ce soit', true);
  const secAfter = await sections();
  const newSecs = secAfter.filter((s) => !secBefore.some((b) => b.id === s.id));
  check('Grist a de nouvelles sections : la copie gérée par Form+, et les sections techniques de Form+', newSecs.length >= 2, JSON.stringify(newSecs.map((s) => s.id)));
  check('aucune section créée n’est publiée (rien ne devient public avant le geste « Publier »)', newSecs.every((s) => !JSON.parse(s.shareOptions || '{}').publish), JSON.stringify(newSecs.map((s) => [s.id, s.shareOptions])));
  const sharesBefore = (await shares()).length;
  const banner = (await state(w)).banner;
  check('le bandeau dit « Pas encore publié »', /pas encore publié/i.test(banner), banner);
  check('…et propose de publier', (await w.locator('#nolink-go').innerText()) === 'Publier le formulaire');
  await w.locator('body').screenshot({ path: path.join(SHOTS, '2-editeur-brouillon.png') });

  // Une question s'ajoute et s'enregistre dans le document (la construction avance bien sans lien).
  await w.click('#qadd');
  await w.locator('.qf-label').first().fill('Votre prénom');
  await w.locator('.qf-label').first().blur();
  await w.click('[data-etab="settings"]'); // quitter la carte l'enregistre
  await page.waitForTimeout(1500);
  const defRows = await api('GET', '/tables/FormPlus_Formulaires/records');
  const def = defRows.records && defRows.records[0] && JSON.parse(defRows.records[0].fields.Definition || '{}');
  check('le formulaire est enregistré dans FormPlus_Formulaires, sans lien', !!def && !def.formLink && !def.shareKey && !def.publicUrl && def.vsId != null, JSON.stringify(def && { vsId: def.vsId, formLink: def.formLink }));
  check('…avec la question ajoutée', !!def && (def.questions || []).some((q) => q.label === 'Votre prénom'), JSON.stringify(def && def.questions));
  const copyVsId = def && def.vsId;
  check('l’onglet Paramètres explique que l’adresse viendra avec le lien', (await w.locator('#url-pending:visible').count()) === 1 && (await w.locator('#public-url:visible').count()) === 0);
  check('copier / ouvrir / QR code sont éteints (rien à copier)', (await w.locator('#copy').isDisabled()) && (await w.locator('#open').isDisabled()) && (await w.locator('#qrToggle').isDisabled()));
  await w.locator('body').screenshot({ path: path.join(SHOTS, '3-parametres-sans-adresse.png') });

  // L'aperçu : le formulaire se dessine par la route du document (jeton du widget), l'envoi est refusé.
  await w.click('#done');
  await w.locator('#preview-finish').waitFor({ timeout: 15000 }).catch(async (e) => {
    await page.screenshot({ path: path.join(SHOTS, 'ECHEC-apercu.png') });
    throw new Error(`${e.message.split('\n')[0]} (carte : ${JSON.stringify((await w.locator('#fill-card').innerText().catch(() => '?')).slice(0, 300))} ; écrans : ${await w.evaluate(() => ['config', 'fill', 'editor'].filter((id) => document.getElementById(id).offsetParent).join(', '))})`);
  });
  check('l’aperçu s’ouvre sans lien, avec son avertissement', (await w.locator('#fill-card').innerText()).includes('Aperçu'));
  check('…la question ajoutée y figure', (await w.locator('#fill-card').innerText()).includes('Votre prénom'));
  await w.locator('body').screenshot({ path: path.join(SHOTS, '4-apercu-sans-lien.png') });
  await w.locator('#f button[type=submit]').click();
  check('…l’envoi est désactivé avec une explication', (await w.locator('#fill-status').innerText()).includes('envoi'), await w.locator('#fill-status').innerText());

  // « Terminer la publication » : retour à l'éditeur, guide de rattachement ouvert à l'étape 1.
  await w.click('#preview-finish');
  await w.locator('#start-panel-guide:visible').waitFor({ timeout: 15000 });
  check('« Terminer la publication » ouvre le guide à l’étape 1 (publier)', (await w.locator('[aria-current="step"] .guide-num').innerText()) === '1' && (await w.locator('#guide-publish').count()) === 1);
  check('…sans « Construire d’abord » (déjà fait) et avec « Retour au formulaire »', (await w.locator('#guide-build').count()) === 0 && (await w.locator('[data-guide="cancel"]').innerText()).includes('Retour au formulaire'));
  await w.click('[data-guide="cancel"]');
  await w.locator('#editor:visible').waitFor({ timeout: 10000 });
  check('« Retour au formulaire » rend l’éditeur tel quel', (await state(w)).banner.length > 0);

  // 3. Le bandeau ramène au guide, Form+ publie la copie.
  await w.click('#nolink-go');
  await w.locator('#guide-publish').waitFor({ timeout: 15000 });
  await w.click('#guide-publish');
  await w.locator('[aria-current="step"] .guide-num').filter({ hasText: '2' }).waitFor({ timeout: 20000 }).catch(async (e) => {
    await w.locator('body').screenshot({ path: path.join(SHOTS, 'ECHEC-publication.png') });
    throw new Error(`${e.message.split('\n')[0]} (guide : ${JSON.stringify((await w.locator('#start-panel-guide').innerText()).slice(0, 300))})`);
  });
  const secPub = await sections();
  const copyPub = secPub.find((s) => s.id === copyVsId);
  const srcPub = secPub.find((s) => s.id === def.sourceVsId);
  check('Form+ a publié la copie qu’il gère', !!copyPub && JSON.parse(copyPub.shareOptions || '{}').publish === true, copyPub && copyPub.shareOptions);
  check('…et la section de départ, vide, de la même page : Grist y montre « Partager », pas « Publier »', !!srcPub && JSON.parse(srcPub.shareOptions || '{}').publish === true, srcPub && srcPub.shareOptions);
  check('un partage a été créé (un seul de plus)', (await shares()).length === sharesBefore + 1);
  await w.locator('body').screenshot({ path: path.join(SHOTS, '5-guide-rattachement-etape2.png') });

  // 4. Partager > Copier le lien dans Grist, collé dans le guide.
  const pageHref = await w.getAttribute('#guide-open', 'href');
  const link = await copyLinkFromGrist(pageHref);
  check('Grist donne un lien de formulaire', /\/forms\/[^/]+\/\d+$/.test(link), link);
  await w.click('[data-guide="opened"]');
  await w.locator('#guide-link').focus();
  await page.evaluate((l) => navigator.clipboard.writeText(l), link);
  await page.keyboard.press('Control+V');
  await w.locator('#editor:visible').waitFor({ timeout: 30000 }).catch(async (e) => {
    await w.locator('body').screenshot({ path: path.join(SHOTS, 'ECHEC-collage.png') });
    throw new Error(`${e.message.split('\n')[0]} (message : ${JSON.stringify(await w.locator('#guide-msg').innerText().catch(() => '(absent)'))})`);
  });
  const secLinked = await sections();
  check('le lien est rattaché sans nouvelle copie', secLinked.length === secPub.length, `${secPub.length} -> ${secLinked.length}`);
  const defRows2 = await api('GET', '/tables/FormPlus_Formulaires/records');
  const def2 = JSON.parse(defRows2.records[0].fields.Definition);
  check('la définition porte maintenant le lien, la clé et l’adresse à diffuser', !!def2.formLink && !!def2.shareKey && /#form=/.test(def2.publicUrl || ''), JSON.stringify({ formLink: def2.formLink, shareKey: !!def2.shareKey }));
  check('…avec la section gérée par Form+ (la copie), pas celle de départ', def2.formLink.endsWith(`/forms/${def2.shareKey}/${copyVsId}`), def2.formLink);
  check('…et ses questions sont intactes', (def2.questions || []).some((q) => q.label === 'Votre prénom'));
  check('le bandeau confirme que le lien est enregistré', /Lien enregistré/.test((await state(w)).banner), (await state(w)).banner);
  await w.click('[data-etab="settings"]');
  check('l’adresse à diffuser apparaît et ses boutons s’allument', (await w.locator('#public-url:visible').count()) === 1 && !(await w.locator('#copy').isDisabled()));
  await w.locator('body').screenshot({ path: path.join(SHOTS, '6-parametres-avec-adresse.png') });

  // 5. Un visiteur anonyme (contexte vierge, sans cookie) répond : ce qui a été construit avant la publication fonctionne.
  const anon = await browser.newContext({ viewport: { width: 900, height: 800 }, locale: 'fr-FR', bypassCSP: true });
  await anon.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
  const visitor = await anon.newPage();
  visitor.on('pageerror', (e) => problems.push(`VISITEUR PAGEERROR ${e.message}`));
  const publicUrl = def2.publicUrl.replace(/^https?:\/\/[^/]+/, `http://localhost:${process.env.WIDGET_PORT || '8010'}`);
  await visitor.goto(publicUrl);
  await visitor.locator('#fill-card form').waitFor({ timeout: 30000 }).catch(async (e) => {
    await visitor.screenshot({ path: path.join(SHOTS, 'ECHEC-visiteur.png') });
    throw new Error(`${e.message.split('\n')[0]} (page : ${JSON.stringify((await visitor.locator('#fill-card').innerText().catch(() => '?')).slice(0, 200))})`);
  });
  check('le visiteur voit le formulaire, sans aperçu ni bandeau de concepteur', !(await visitor.locator('#preview-finish').count()) && (await visitor.locator('#fill-card').innerText()).includes('Votre prénom'));
  await visitor.screenshot({ path: path.join(SHOTS, '7-visiteur.png') });
  await visitor.locator('#f input[type=text]:not([name="_website"])').first().fill('Camille');
  await visitor.locator('#pv-submit-btn').click();
  await visitor.waitForTimeout(2500);
  const rows = (await api('GET', `/tables/${table}/records`)).records || [];
  check('sa réponse est dans la table de Grist', rows.some((r) => Object.values(r.fields).includes('Camille')), JSON.stringify(rows.map((r) => r.fields)));
  await anon.close();

  // Rechargement : le formulaire est lié, plus aucun rappel.
  w = await openWidgetPage();
  await w.locator('#editor:visible').waitFor({ timeout: 30000 });
  check('après rechargement : l’éditeur, sans bandeau de rappel', (await state(w)).banner === '');

  // ───────────────────────── Variante : publier d'abord, construire ensuite -> « il manque le lien » ─────────────────────────
  w = await freshStart();
  const table2 = `Publie${Date.now().toString(36)}`;
  await newForm(w, table2);
  await w.click('#guide-publish');
  await w.locator('[aria-current="step"] .guide-num').filter({ hasText: '2' }).waitFor({ timeout: 20000 });
  await w.click('#guide-build');
  await w.locator('#editor:visible').waitFor({ timeout: 30000 });
  const b2 = (await state(w)).banner;
  check('(variante) déjà publié : le bandeau dit qu’il manque le lien', /il manque le lien/i.test(b2), b2);
  check('(variante) …et propose « Coller le lien »', (await w.locator('#nolink-go').innerText()) === 'Coller le lien');
  const defRows3 = await api('GET', '/tables/FormPlus_Formulaires/records');
  const def3 = JSON.parse(defRows3.records[0].fields.Definition);
  const copy3 = (await sections()).find((s) => s.id === def3.vsId);
  check('(variante) la copie est publiée sous la clé de la page', !!copy3 && JSON.parse(copy3.shareOptions || '{}').publish === true);
  await w.locator('body').screenshot({ path: path.join(SHOTS, '8-variante-il-manque-le-lien.png') });
  // Les champs natifs de la copie se lisent sans lien (route du document) : la carte de la colonne A apparaît dans la liste.
  check('(variante) l’éditeur ne plante pas sans lien (liste des questions rendue)', (await w.locator('#qlist').count()) === 1);

  check('aucune erreur de page pendant tout le parcours', problems.length === 0, problems.join(' | '));
  await browser.close();
  console.log(`\nCaptures : ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✗ exception :', e.message); process.exit(1); });
