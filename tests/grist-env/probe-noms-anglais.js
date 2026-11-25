#!/usr/bin/env node
// SONDE (pas une vérification ordinaire : elle MESURE, elle ne garde rien) : que fait Form+ tel qu'il est publié devant un
// document dont ses propres tables ou colonnes ont été renommées en anglais ? Question 5a de la consigne GFS 040
// (« que fait-elle devant un document dont `Nom` est devenu `Name` : recrée-t-elle `Nom`, échoue-t-elle, dit-elle quelque chose ? »).
//
// Le parcours, contre un VRAI Grist (celui de start-grist-test.sh), pour chaque cas :
//   1. repartir d'une table `FormPlus_Formulaires` neuve aux noms d'aujourd'hui (la même que l'app pose) ;
//   2. « Partir de zéro » -> « Construire le formulaire d'abord » : un formulaire est enregistré dans la table, avec une question ;
//   3. renommer, EN PLACE (RenameColumn / RenameTable, ce que fera la fenêtre commune du kit) ; relire ce que le document a gardé ;
//   4. rouvrir la page du widget : qu'est-ce que la personne voit (l'éditeur du formulaire, l'écran de départ, une fenêtre) ?
//      quelles tables et quelles colonnes existent après ? combien de lignes dans chacune ?
//   5. faire une modification (le titre) : où l'enregistrement va-t-il écrire ?
// Cas : « colonnes » (Nom, TypeFormulaire, DateModif, ModifiePar renommées, la table gardée), « table » (la table renommée,
// les colonnes gardées), « tout » (la table et les cinq colonnes, IdSectionWidget comprise).
//
// Usage : tests/grist-env/start-grist-test.sh   (une fois, démarre Grist et sert le widget)
//         NODE_PATH=$(npm root -g) node tests/grist-env/probe-noms-anglais.js [dossier_captures]
// Variables : GRIST_PORT (8484), GRIST_TEST_STATE_DIR (~/.formplus-grist-test), CASES (liste séparée par des virgules).
// Ne sort jamais en erreur sur un constat : il imprime ce qu'il a vu (JSON à la fin).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
const STATE_DIR = process.env.GRIST_TEST_STATE_DIR || path.join(os.homedir(), '.formplus-grist-test');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-probe-noms-'));
const info = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'grist-test-doc.json'), 'utf8'));
const GRIST = `http://localhost:${GRIST_PORT}`;
const DOC_URL = `${GRIST}/o/${info.org}/${info.docId}`;
const CASES = (process.env.CASES || 'colonnes,table,tout').split(',');
fs.mkdirSync(SHOTS, { recursive: true });

const apiKey = () => fs.readFileSync(path.join(STATE_DIR, 'apikey.txt'), 'utf8').trim();
const request = (method, url, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : null;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey()}` };
  const req = http.request(url, { method, headers }, (r) => {
    let b = ''; r.on('data', (c) => { b += c; });
    r.on('end', () => { let j = {}; try { j = JSON.parse(b || '{}'); } catch (e) { j = { raw: b }; } resolve({ status: r.statusCode, body: j }); });
  });
  req.on('error', reject); if (data) req.write(data); req.end();
});
const api = async (method, route, body) => (await request(method, `${GRIST}/o/${info.org}/api/docs/${info.docId}${route}`, body)).body;
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));
const apply = (actions) => api('POST', '/apply', actions);

const FR_COLUMNS = [['Nom', 'Text'], ['TypeFormulaire', 'Text'], ['DateModif', 'DateTime'], ['ModifiePar', 'Text'], ['Definition', 'Text'], ['IdSectionWidget', 'Numeric']];
const OWN = /^FormPlus_(Formulaires|Forms|Repondants|Respondents)$/;

// Les tables « de Form+ » du document avec leurs colonnes et leur nombre de lignes, relues chez Grist.
const snapshot = async () => {
  const tables = (await api('GET', '/tables/_grist_Tables/records')).records.map((r) => ({ ref: r.id, id: r.fields.tableId }));
  const cols = (await api('GET', '/tables/_grist_Tables_column/records')).records.map((r) => ({ parent: r.fields.parentId, id: r.fields.colId }));
  const out = {};
  for (const t of tables.filter((x) => OWN.test(x.id))) {
    const rows = (await api('GET', `/tables/${t.id}/records`)).records || [];
    out[t.id] = { colonnes: cols.filter((c) => c.parent === t.ref && !/^gristHelper_/.test(c.id)).map((c) => c.id), lignes: rows.length, aDefinition: rows.filter((r) => String(r.fields.Definition || '').includes('Votre prénom')).length };
  }
  return out;
};

const reset = async () => {
  const have = new Set((await api('GET', '/tables/_grist_Tables/records')).records.map((r) => r.fields.tableId));
  const drop = ['FormPlus_Forms', 'FormPlus_Formulaires'].filter((t) => have.has(t));
  if (drop.length) await apply(drop.map((t) => ['RemoveTable', t]));
  await apply([['AddTable', 'FormPlus_Formulaires', FR_COLUMNS.map(([id, type]) => ({ id, type }))]]);
};

(async () => {
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  const browser = await chromium.launch();
  const errors = [];
  let phase = 'démarrage';
  let ctx;
  let page;
  // Un navigateur neuf par cas : l'état gardé par l'app dans le navigateur (le guide de publication en cours, la ligne ouverte)
  // ne passe jamais d'un cas au suivant.
  const newSession = async () => {
    if (ctx) await ctx.close();
    ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', bypassCSP: true });
    await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
    page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${phase} : ${e.message}`));
    await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);
  };

  const widget = async () => {
    for (let i = 0; i < 80; i++) {
      const f = page.frames().find((fr) => fr.url().includes('widget.html'));
      if (f) return f;
      await page.waitForTimeout(250);
    }
    throw new Error('cadre du widget introuvable');
  };
  const openWidgetPage = async () => {
    await page.goto(DOC_URL);
    await page.getByText('FormPlus', { exact: true }).first().click();
    const f = await widget();
    await f.locator('#start-choices:visible, #editor:visible, #start-panel-guide:visible, #standalone:visible').first().waitFor({ timeout: 25000 }).catch(() => {});
    await page.waitForTimeout(3000);
    return f;
  };
  // Ce que la personne voit : lesquels des écrans sont affichés, le titre du formulaire de l'éditeur, le texte d'une fenêtre ouverte.
  const seen = async (w) => w.evaluate(() => {
    const vis = (id) => { const e = document.getElementById(id); return !!e && !!e.offsetParent; };
    // La fenêtre du kit est en position fixe : `offsetParent` y vaut toujours null, on lit donc son `display`.
    const dlg = document.getElementById('pp-dialog-modal');
    const overlay = dlg && (dlg.style.display !== undefined ? dlg : null);
    const open = !!overlay && getComputedStyle(overlay).display !== 'none';
    return {
      ecrans: ['start-choices', 'start-panel-guide', 'editor', 'standalone', 'fill'].filter(vis),
      fenetre: open ? dlg.innerText.replace(/\s+/g, ' ').slice(0, 300) : null,
      titre: vis('editor') ? (document.querySelector('#formTitle, [data-field="title"], #title') || {}).value || null : null,
    };
  });

  const results = {};
  for (const name of CASES) {
    const r = { cas: name };
    phase = `${name} / préparation`;
    await newSession();
    await reset();
    let w = await openWidgetPage();
    r.departEcran = await seen(w);
    await page.screenshot({ path: path.join(SHOTS, `${name}-0-depart.png`) });
    await w.click('[data-startgo="scratch"]');
    await w.fill('#scratchTable', `Sonde${Date.now().toString(36)}`);
    await w.click('#scratchCreate');
    await w.locator('#start-panel-guide:visible').waitFor({ timeout: 25000 });
    await w.click('#guide-build');
    await w.locator('#editor:visible').waitFor({ timeout: 30000 });
    await w.click('#qadd');
    await w.locator('.qf-label').first().fill('Votre prénom');
    await w.locator('.qf-label').first().blur();
    await w.click('[data-etab="settings"]');
    await page.waitForTimeout(2000);
    r.avant = await snapshot();

    phase = `${name} / renommage`;
    // Le renommage, en place : ce que fera la fenêtre commune du kit (un seul lot).
    const colRenames = { Nom: 'Name', TypeFormulaire: 'FormType', DateModif: 'ModifiedAt', ModifiePar: 'ModifiedBy' };
    const actions = [];
    const tableNow = () => (name === 'table' || name === 'tout' ? 'FormPlus_Forms' : 'FormPlus_Formulaires');
    if (name === 'colonnes' || name === 'tout') for (const [a, b] of Object.entries(colRenames)) actions.push(['RenameColumn', 'FormPlus_Formulaires', a, b]);
    if (name === 'tout') actions.push(['RenameColumn', 'FormPlus_Formulaires', 'IdSectionWidget', 'WidgetSectionId']);
    if (name === 'table' || name === 'tout') actions.push(['RenameTable', 'FormPlus_Formulaires', 'FormPlus_Forms']);
    const res = await apply(actions);
    r.renommage = res.error ? `ERREUR ${res.error}` : 'ok';
    r.apresRenommage = await snapshot();

    // Réouverture de la page du widget.
    phase = `${name} / réouverture`;
    w = await openWidgetPage();
    r.reouverture = await seen(w);
    await w.locator('body').screenshot({ path: path.join(SHOTS, `${name}-1-reouverture.png`) });
    r.apresReouverture = await snapshot();

    // Si une fenêtre propose de créer une table, on dit oui (c'est le geste qu'une personne ferait) pour voir ce qui se crée.
    if (r.reouverture.fenetre) {
      r.fenetreAcceptee = r.reouverture.fenetre;
      await w.locator('#pp-dialog-modal button').last().click().catch(() => {});
      await page.waitForTimeout(2500);
      r.apresFenetre = await snapshot();
    }

    // Écran de départ (la table est introuvable pour l'app) : la personne crée un nouveau formulaire. Qu'est-ce qui se pose ?
    if ((await seen(w)).ecrans.includes('start-choices')) {
      phase = `${name} / nouveau formulaire`;
      await w.click('[data-startgo="scratch"]');
      await w.fill('#scratchTable', `Apres${Date.now().toString(36)}`);
      await w.click('#scratchCreate');
      await page.waitForTimeout(2500);
      r.nouveauFormulaire = await seen(w);
      // Le guide s'ouvre ; « Construire le formulaire d'abord » enregistre la définition : c'est là que l'app a besoin de sa table.
      await w.click('#guide-build').catch(() => {});
      await page.waitForTimeout(Number(process.env.GUIDE_WAIT_MS || 2500));
      r.apresConstruire = await seen(w);
      r.messageDuGuide = await w.locator('#guide-msg').innerText().catch(() => '(absent)');
      await page.screenshot({ path: path.join(SHOTS, `${name}-2-apres-construire.png`) });
      if (r.apresConstruire.fenetre) {
        await w.locator('#pp-dialog-modal button').last().click().catch(() => {}); // « Créer la table » : le geste que ferait la personne
        await w.locator('#editor:visible').waitFor({ timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(2000);
      }
      r.apresNouveauFormulaire = await snapshot();
      r.apresNouveauFormulaireEcran = await seen(w);
    }

    // Une modification : retour à l'éditeur si on n'y est pas, puis on change la question et on quitte la carte.
    if ((await seen(w)).ecrans.includes('editor')) {
      phase = `${name} / modification`;
      await w.click('#qadd').catch(() => {});
      await w.locator('.qf-label').last().fill('Une autre question').catch(() => {});
      await w.locator('.qf-label').last().blur().catch(() => {});
      await w.click('[data-etab="settings"]').catch(() => {});
      await page.waitForTimeout(2500);
      r.apresModification = await snapshot();
    }
    r.tableAttendue = tableNow();
    results[name] = r;
  }
  r_print(results, errors);
  await browser.close();
})().catch((e) => { console.error('SONDE EN ÉCHEC', e); process.exit(1); });

function r_print(results, errors) {
  console.log(JSON.stringify({ results, erreursDePage: errors }, null, 1));
}
