#!/usr/bin/env node
// Parcours guidé « Partir de zéro » -> Publier -> Copier le lien dans Grist -> coller, puis un visiteur
// ANONYME ouvre l'adresse à diffuser (publicUrl), contre un VRAI Grist (celui de start-grist-test.sh).
//
// Bug visé (signalé par le fil « Appliquer les nouvelles consignes GFS », mesuré sur Grist 1.7.22) : dans
// ce parcours, la Definition garde le lien COLLÉ (celui de la section de départ, formLink) alors que
// l'adresse à diffuser porte la COPIE que Form+ gère (même clé, autre numéro de section). Le visiteur
// lisait bien la Definition de la copie, mais respond.js n'en gardait les questions que si
// `state.options.formLink === formLink` : jamais vrai ici, donc titre et bouton « Envoyer » s'affichaient
// SANS aucune question. Les parcours « Construire d'abord » (e2e-build-first.js) et « coller un lien
// existant » n'étaient pas touchés : leur formLink porte déjà la copie.
//
// Ce que le test vérifie :
//   1. le parcours guidé complet, jusqu'à l'éditeur, avec 2 questions ajoutées à la main ;
//   2. la Definition enregistrée a bien un formLink (section de départ) DIFFÉRENT de celui de l'adresse à
//      diffuser (la copie) : c'est la condition qui déclenchait le bug, le test ne vaut que si elle est là ;
//   3. un visiteur anonyme (contexte vierge, sans cookie) voit titre, TOUTES les questions de la Definition
//      et le bouton d'envoi, répond, et sa réponse arrive dans la table de Grist ;
//   4. la même adresse, ouverte par le concepteur (connecté, autre contexte), montre les mêmes questions.
//
// Usage : tests/grist-env/start-grist-test.sh   (une fois, démarre Grist et sert le widget)
//         NODE_PATH=$(npm root -g) node tests/grist-env/e2e-guided-visitor.js [dossier_captures]
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
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-e2e-guided-visitor-'));
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
  const req = http.request(`${GRIST}/o/${info.org}/api/docs/${info.docId}${route}`, { method, headers: { Authorization: `Bearer ${apiKey()}`, 'Content-Type': 'application/json' } }, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => { let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) { j = { raw: b }; } resolve(j); }); });
  req.on('error', reject); if (data) req.write(data); req.end();
});
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));

(async () => {
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  const browser = await chromium.launch();
  // bypassCSP : ce Grist de test est en HTTP nu, le `connect-src 'self' https:` du widget bloquerait ses appels vers lui (voir tests/grist-env/README.md, point 5).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'], bypassCSP: true });
  const routePlugin = (c) => c.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
  await routePlugin(ctx);
  const problems = [];
  ctx.on('page', (p) => p.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`)));

  const page = await ctx.newPage();
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);

  const widget = async () => {
    for (let i = 0; i < 60; i++) {
      const f = page.frames().find((fr) => fr.url().includes('widget.html'));
      if (f) return f;
      await page.waitForTimeout(250);
    }
    throw new Error('cadre du widget introuvable');
  };
  // Un widget neuf : on retire les formulaires gardés par les essais d'avant, comme un premier usage.
  const rows0 = await api('GET', '/tables/FormPlus_Formulaires/records');
  if (rows0.records && rows0.records.length) await api('POST', '/apply', [['BulkRemoveRecord', 'FormPlus_Formulaires', rows0.records.map((r) => r.id)]]);
  await page.goto(DOC_URL);
  await page.getByText('FormPlus', { exact: true }).first().click();
  const w = await widget();
  await w.locator('#start-choices:visible, #editor:visible, #start-panel-guide:visible').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(2500); // le widget choisit son écran en plusieurs temps : attendre qu'il ait fini
  await w.locator('#start-choices:visible').waitFor({ timeout: 10000 });

  // ─── 1. Le parcours guidé, de bout en bout ───
  const table = `Guide${Date.now().toString(36)}`;
  await w.click('[data-startgo="scratch"]');
  await w.fill('#scratchTable', table);
  await w.click('#scratchCreate');
  await w.locator('#start-panel-guide:visible').waitFor({ timeout: 20000 });
  await w.click('#guide-publish'); // Form+ publie lui-même la section qu'il vient de créer
  await w.locator('[aria-current="step"] .guide-num').filter({ hasText: '2' }).waitFor({ timeout: 20000 });
  const href = await w.getAttribute('#guide-open', 'href');
  const [grist2] = await Promise.all([ctx.waitForEvent('page'), w.click('#guide-open')]);
  await grist2.waitForLoadState();
  await grist2.getByText('Partager', { exact: true }).first().waitFor({ timeout: 30000 });
  await grist2.getByText('Partager', { exact: true }).first().click();
  await grist2.getByText('Copier le lien', { exact: true }).click();
  const link = await grist2.evaluate(() => navigator.clipboard.readText());
  check('Grist a copié un lien de formulaire', /\/forms\/[^/]+\/\d+$/.test(link), link);
  await grist2.close();
  await page.bringToFront();
  await w.locator('#guide-link').focus();
  await page.keyboard.press('Control+V');
  // Le formulaire se prépare tout seul ; seules les fenêtres d'accord du kit (créer FormPlus_Formulaires, puis
  // rendre la copie publique, consigne GFS 013) attendent un clic - voulu, et les seuls de ce côté de Grist.
  for (let i = 0; i < 60 && !(await w.locator('#editor:visible').count()); i++) {
    const ok = w.locator('#pp-dialog-modal:visible .pp-modal-primary');
    if (await ok.count()) await ok.first().click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
  await w.locator('#editor:visible').waitFor({ timeout: 30000 }).catch(async (e) => {
    await w.locator('body').screenshot({ path: path.join(SHOTS, 'ECHEC-apres-collage.png') });
    throw new Error(`${e.message.split('\n')[0]} (message du guide : ${JSON.stringify(await w.locator('#guide-msg').innerText().catch(() => '(absent)'))})`);
  });
  check('le collage a suffi : l’éditeur de questions est affiché', true);

  // Deux questions ajoutées à la main (en plus des champs de la table) : ce que le visiteur doit retrouver.
  await w.click('#qadd');
  await w.locator('.qf-label').first().fill('Votre prénom');
  await w.locator('.qf-label').first().blur();
  await w.click('#qadd');
  await w.locator('.qf-label').last().fill('Votre ville');
  await w.locator('.qf-label').last().blur();
  await w.click('[data-etab="settings"]'); // quitter la carte l'enregistre
  await page.waitForTimeout(2000);
  await w.locator('body').screenshot({ path: path.join(SHOTS, '1-editeur-parametres.png') });

  // ─── 2. La condition qui déclenchait le bug : lien collé (départ) ≠ lien de l'adresse (copie) ───
  const defRows = await api('GET', '/tables/FormPlus_Formulaires/records');
  const def = JSON.parse(defRows.records[0].fields.Definition);
  const labels = (def.questions || []).map((q) => q.label).filter(Boolean);
  check('la Definition est enregistrée avec ses 2 questions', labels.length === 2 && labels.includes('Votre prénom') && labels.includes('Votre ville'), JSON.stringify(labels));
  const publicForm = decodeURIComponent((def.publicUrl || '').split('#form=')[1] || '');
  check('l’adresse à diffuser est un #form= vers une section', /\/forms\/[^/]+\/\d+$/.test(publicForm), def.publicUrl);
  check('la Definition garde le lien COLLÉ (section de départ), l’adresse porte la COPIE gérée par Form+ : deux liens différents', !!def.formLink && def.formLink !== publicForm && def.sourceVsId !== def.vsId && publicForm.endsWith(`/${def.vsId}`) && def.formLink.endsWith(`/${def.sourceVsId}`), JSON.stringify({ formLink: def.formLink, publicForm, vsId: def.vsId, sourceVsId: def.sourceVsId }));
  const nbQuestions = def.questions.length;

  // ─── 3. Un visiteur ANONYME (contexte vierge, sans cookie) ouvre l'adresse à diffuser ───
  const openAsVisitor = async (browserCtx, tag) => {
    const v = await browserCtx.newPage();
    v.on('pageerror', (e) => problems.push(`${tag} PAGEERROR ${e.message}`));
    await v.goto(def.publicUrl.replace(/^https?:\/\/[^/]+/, `http://localhost:${WIDGET_PORT}`));
    await v.locator('#fill-card form').waitFor({ timeout: 30000 }).catch(async (e) => {
      await v.screenshot({ path: path.join(SHOTS, `ECHEC-${tag}.png`) });
      throw new Error(`${e.message.split('\n')[0]} (page : ${JSON.stringify((await v.locator('#fill-card').innerText().catch(() => '?')).slice(0, 200))})`);
    });
    return v;
  };
  const anon = await browser.newContext({ viewport: { width: 900, height: 900 }, locale: 'fr-FR', bypassCSP: true });
  await routePlugin(anon);
  const visitor = await openAsVisitor(anon, 'visiteur');
  const text = await visitor.locator('#fill-card').innerText();
  await visitor.screenshot({ path: path.join(SHOTS, '2-visiteur.png'), fullPage: true });
  check('le visiteur n’a ni aperçu ni outil de concepteur', !(await visitor.locator('#preview-finish').count()) && (await visitor.locator('#fill-toolbar:visible').count()) === 0);
  check('le visiteur voit chaque question de la Definition', labels.every((l) => text.includes(l)), JSON.stringify(text.slice(0, 300)));
  const shown = await visitor.locator('#f [data-extra]').count();
  check('…toutes les questions ajoutées par Form+, pas seulement les champs natifs', shown === nbQuestions, `${shown} questions affichées pour ${nbQuestions} dans la Definition`);
  check('…et le bouton d’envoi', (await visitor.locator('#pv-submit-btn').count()) === 1);
  const firstText = visitor.locator('#f input[type=text]:not([name="_website"])').first();
  await firstText.fill('Camille');
  await visitor.locator('#pv-submit-btn').click();
  await visitor.waitForTimeout(3000);
  const recs = (await api('GET', `/tables/${table}/records`)).records || [];
  check('sa réponse est dans la table de Grist', recs.some((r) => Object.values(r.fields).includes('Camille')), JSON.stringify(recs.map((r) => r.fields)));
  await anon.close();

  // ─── 4. Le concepteur (connecté) ouvre la même adresse : mêmes questions ───
  const designer = await openAsVisitor(ctx, 'concepteur');
  const dtext = await designer.locator('#fill-card').innerText();
  check('le concepteur connecté voit les mêmes questions sur cette adresse', labels.every((l) => dtext.includes(l)), JSON.stringify(dtext.slice(0, 300)));
  await designer.close();

  check('aucune erreur de page pendant tout le parcours', problems.length === 0, problems.join(' | '));
  await browser.close();
  console.log(`\nCaptures : ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✗ exception :', e.message); process.exit(1); });
