#!/usr/bin/env node
// Connexion à Grist qui arrive APRÈS les 4 secondes de poc/js/main.js : l'écran « Cette page est un widget
// Grist » (#standalone) se corrige-t-il tout seul, ou reste-t-il ? Question de la consigne GFS 032 (point 5 :
// le labo de GFS voit cet écran avec le diagnostic `timeout`, et ne sait pas si c'est la lenteur de son labo).
//
// Ce que fait main.js (`(async () => {…})()`) : juste après `grist.ready`, un minuteur de 4 s montre #standalone et
// note `timeout` dans le diagnostic si `state.connected` est encore faux ; `state.connected` ne passe à vrai que dans
// le rappel de `grist.onOptions`, qui finit par `showConfig()` ou `renderFill()` (`show('config')`/`show('fill')`,
// donc #standalone se cache). Entre `grist.ready` et `grist.onOptions(…)` il y a pourtant `await GfsLink.ready` : sans
// GFS (adresse sans `gfs=`) c'est une promesse déjà tenue, mais dans GFS (adresse avec `gfs=<n>`) elle attend la
// réponse de GFS à `contexte`, 5 s au plus (kit, `CONTEXT_TIMEOUT_MS`). Or `grist.onOptions` est un abonnement sans
// mémoire (EventEmitter du script de Grist) : une réponse de Grist arrivée AVANT l'abonnement est perdue.
// Ce test MESURE les trois cas contre un vrai Grist, plutôt que de s'en tenir à cette lecture :
//   - le widget est ouvert dans la vraie page du document de test, avec le vrai `grist-plugin-api.js` ;
//   - « retard » : l'entrée du script de Grist est retenue les premières secondes (voir `hold`) : `onOptions`
//     arrive donc tard, comme sur une connexion lente ;
//   - « GFS muet » : l'adresse du widget reçoit `gfs=1` (le widget se croit hébergé) mais le parent, le vrai Grist,
//     ne répond jamais à `contexte` ; `GfsLink.ready` prend ses 5 s, Grist a répondu bien avant.
//
// Vérifie :
//   1. témoin (aucun retard) : #standalone n'apparaît jamais, l'écran final est config ou fill ;
//   2. retard : #standalone apparaît à 4 s avec `timeout` au diagnostic ; la connexion arrivée, il est remplacé tout seul
//      par la configuration (sans rechargement ni geste) et le diagnostic passe à `onOptions` ; l'écran est utilisable ;
//   3. GFS muet : #standalone n'apparaît jamais, la configuration ou le formulaire s'affiche dès que `GfsLink.ready`
//      est tenue (≈ 5 s) ; avant la correction du 18 nov, #standalone arrivait à 4 s et restait pour toujours.
//   Aucune erreur de page pendant tout le parcours.
//
// Le cas 3 était un défaut de l'app (poc/js/main.js : `await GfsLink.ready` placé entre `grist.ready` et
// `grist.onOptions`, le message d'options arrivé entre-temps était perdu). Corrigé : main.js s'abonne à `grist.onOptions`
// tout de suite et le rappel attend lui-même l'installation du lien GFS. Ce cas garde la correction.
//
// Usage : tests/grist-env/start-grist-test.sh   (une fois, démarre Grist et sert le widget)
//         NODE_PATH=$(npm root -g) node tests/grist-env/e2e-late-connection.js [dossier_captures]
// Variables : GRIST_PORT (8484), WIDGET_PORT (8010), GRIST_TEST_STATE_DIR (~/.formplus-grist-test), LATE_MS (6500).
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
const LATE_MS = Number(process.env.LATE_MS || '6500');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-e2e-late-'));
const info = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'grist-test-doc.json'), 'utf8'));
const GRIST = `http://localhost:${GRIST_PORT}`;
const DOC_URL = `${GRIST}/o/${info.org}/${info.docId}`;
fs.mkdirSync(SHOTS, { recursive: true });

let failed = 0;
const check = (name, cond, detail) => {
  console.log(`${cond ? '✓' : '✗'} ${name}${!cond && detail ? ` — ${detail}` : ''}`);
  if (!cond) failed++;
};
const get = (url) => new Promise((resolve, reject) => http.get(url, (r) => { let b = ''; r.on('data', (c) => { b += c; }); r.on('end', () => resolve(b)); }).on('error', reject));

(async () => {
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  const browser = await chromium.launch();
  // bypassCSP : ce Grist de test est en HTTP nu, le `connect-src 'self' https:` du widget bloquerait ses appels vers lui (README, point 5).
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fr-FR', bypassCSP: true });
  let holdMs = 0;
  let hosted = false;
  // Le vrai script, précédé (seulement si `holdMs`) d'une retenue de l'ENTRÉE du script de Grist : tout message de Grist
  // reçu pendant les `holdMs` premières ms n'est remis au script (`window.onmessage = …`) qu'à `holdMs`, dans l'ordre.
  // Pour le widget, `onOptions` arrive donc au plus tôt à `holdMs`, comme sur une connexion lente. Ni `window.parent`
  // ni `addEventListener` ne sont touchés : le lien avec GFS (kit) écoute le parent comme d'habitude.
  // (`grist.ready` lui-même n'est pas remplaçable : le script expose ses fonctions en lecture seule.)
  const hold = (ms) => `(function(){var q=[],open=false,fn=null;function deliver(e){if(fn)fn.call(window,e);}setTimeout(function(){open=true;q.forEach(deliver);q=[];},${ms});window.addEventListener('message',function(e){if(open)deliver(e);else q.push(e);});Object.defineProperty(window,'onmessage',{configurable:true,get:function(){return fn;},set:function(f){fn=f;}});})();`;
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({
    status: 200,
    contentType: 'application/javascript',
    headers: { 'Cache-Control': 'no-store' }, // sinon le navigateur réutilise le script d'une passe pour la suivante
    body: (holdMs ? hold(holdMs) : '') + `eval(${JSON.stringify(pluginApi)});`,
  }));
  // Dans GFS, l'adresse du cadre porte `gfs=<n>` (contrats 1.3) : une redirection ajoute ce paramètre à l'adresse que
  // Grist charge (un simple `route.continue({ url })` ne suffirait pas : la page, elle, garderait l'adresse d'origine).
  await ctx.route(new RegExp(`^http://localhost:${WIDGET_PORT}/poc/widget\\.html`), (route) => {
    const u = new URL(route.request().url());
    if (!hosted || u.searchParams.has('gfs')) return route.continue();
    u.searchParams.set('gfs', '1');
    return route.fulfill({ status: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' } });
  });
  const problems = [];
  ctx.on('page', (p) => p.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`)));

  const page = await ctx.newPage();
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(GRIST + '/o/' + info.org)}`);

  // Ouvre la page FormPlus du document et suit, toutes les 100 ms, l'écran affiché par le widget (le seul
  // visible parmi #loading, #config, #fill, #standalone), à partir de l'apparition de son cadre.
  const run = async ({ label, hold: h, gfs, watchMs, replyAt = null }) => {
    holdMs = h; hosted = gfs;
    await page.goto(DOC_URL);
    await page.getByText('FormPlus', { exact: true }).first().click();
    let f = null;
    for (let i = 0; i < 120 && !f; i++) {
      f = page.frames().find((fr) => fr.url().includes('widget.html'));
      if (!f) await page.waitForTimeout(100);
    }
    if (!f) throw new Error('cadre du widget introuvable');
    const hostedSeen = f.url().includes('gfs=1');
    const t0 = Date.now();
    const timeline = [];
    let last = '';
    let diagAtStandalone = null;
    let replied = false;
    const screen = () => f.evaluate(() => ['loading', 'config', 'fill', 'standalone', 'test']
      .filter((id) => !document.getElementById(id).classList.contains('hidden')).join('+') || '(aucun)').catch(() => '(cadre rechargé)');
    while (Date.now() - t0 < watchMs) {
      // Un GFS qui répond à `contexte` (appel n° 1, contrat 1) au bout de `replyAt` ms : la réponse part du parent, comme celle de GFS.
      if (replyAt !== null && !replied && Date.now() - t0 >= replyAt) {
        replied = true;
        await page.evaluate(() => { const fr = [...document.querySelectorAll('iframe')].find((i) => i.src.includes('widget.html')); fr.contentWindow.postMessage({ gfs: 1, type: 'reponse', id: 1, data: {} }, '*'); });
      }
      const s = await screen();
      if (s !== last) { timeline.push([Date.now() - t0, s]); last = s; }
      if (diagAtStandalone === null && s === 'standalone') {
        diagAtStandalone = await f.evaluate(() => document.getElementById('diag-standalone')?.textContent || '').catch(() => '');
        await page.screenshot({ path: path.join(SHOTS, `${label}-1-standalone.png`) });
      }
      // Fin d'observation anticipée : l'écran final (config ou fill) est posé depuis 2,5 s.
      const lastT = timeline.length ? timeline[timeline.length - 1][0] : 0;
      if ((s === 'config' || s === 'fill') && Date.now() - t0 - lastT > 2500) break;
      await page.waitForTimeout(100);
    }
    await page.screenshot({ path: path.join(SHOTS, `${label}-2-final.png`) });
    const diag = await f.evaluate(() => document.getElementById('diag-standalone')?.textContent || '').catch(() => '');
    const choicesOrEditor = await f.evaluate(() => ['start-choices', 'editor'].some((id) => { const e = document.getElementById(id); return !!(e && e.offsetParent); })).catch(() => false);
    console.log(`   ${label} : ${timeline.map(([t, s]) => `${(t / 1000).toFixed(1)} s ${s}`).join(' → ')}`);
    return { timeline, diag, diagAtStandalone, final: last, choicesOrEditor, hostedSeen };
  };
  const at = (r, pred) => (r.timeline.find(([, s]) => pred(s)) || [null])[0];
  const isMain = (s) => s === 'config' || s === 'fill';

  // ─── 1. Témoin : connexion immédiate, hors GFS ───
  const ctl = await run({ label: 'temoin', hold: 0, gfs: false, watchMs: 12000 });
  check('témoin : #standalone n\'apparaît à aucun moment', !ctl.timeline.some(([, s]) => s.includes('standalone')), JSON.stringify(ctl.timeline));
  check('témoin : l\'écran final est la configuration ou le formulaire', isMain(ctl.final), ctl.final);

  // ─── 2. Connexion qui arrive après les 4 s du minuteur, hors GFS ───
  const late = await run({ label: 'retard', hold: LATE_MS, gfs: false, watchMs: LATE_MS + 9000 });
  const standaloneAt = at(late, (s) => s === 'standalone');
  check('retard : le minuteur de 4 s a joué, #standalone apparaît', standaloneAt != null, JSON.stringify(late.timeline));
  check('…vers 4 s, pas avant (le minuteur n\'est pas déclenché trop tôt)', standaloneAt != null && standaloneAt >= 3500 && standaloneAt < LATE_MS, `apparu à ${standaloneAt} ms`);
  check('…avec `timeout` au diagnostic de l\'écran', /"event": "timeout"/.test(late.diagAtStandalone || ''), (late.diagAtStandalone || '').slice(0, 200));
  const backAt = at(late, isMain);
  check('la connexion arrivée, #standalone est remplacé par la configuration ou le formulaire, sans rechargement ni geste', backAt != null && isMain(late.final), JSON.stringify(late.timeline));
  check('…et pas avant l\'arrivée de la connexion (retard simulé respecté)', backAt != null && backAt >= LATE_MS - 800, `revenu à ${backAt} ms, retard ${LATE_MS} ms`);
  check('…et le diagnostic passe à `onOptions` (il ne garde que le dernier évènement)', /"event": "onOptions"/.test(late.diag), late.diag.slice(0, 200));
  check('l\'écran obtenu est utilisable : un choix de départ ou l\'éditeur est affiché', late.choicesOrEditor);

  // ─── 3. Dans GFS qui ne répond pas à `contexte` : `GfsLink.ready` prend ses 5 s, Grist a répondu avant ───
  const mute = await run({ label: 'gfs-muet', hold: 0, gfs: true, watchMs: 12000 });
  check('GFS muet : le widget s\'est bien cru hébergé (`gfs=1` dans l\'adresse du cadre)', mute.hostedSeen);
  check('GFS muet : #standalone n\'apparaît jamais (la connexion de Grist, elle, a eu lieu tout de suite : le minuteur de 4 s ne se déclenche pas)', !mute.timeline.some(([, s]) => s.includes('standalone')), JSON.stringify(mute.timeline));
  const muteMainAt = at(mute, isMain);
  check('GFS muet : la configuration ou le formulaire s\'affiche une fois `GfsLink.ready` tenue (≈ 5 s, pas avant)', muteMainAt != null && muteMainAt >= 4500 && isMain(mute.final), `écran final « ${mute.final} », ${JSON.stringify(mute.timeline)}`);

  // ─── 4. Dans GFS qui répond vite à `contexte`, Grist plus lent : l'abonnement est déjà posé, rien n'est perdu ───
  const quick = await run({ label: 'gfs-rapide', hold: 1500, gfs: true, watchMs: 12000, replyAt: 300 });
  check('GFS qui répond vite (Grist plus lent) : la configuration s\'affiche, #standalone n\'apparaît jamais', isMain(quick.final) && !quick.timeline.some(([, s]) => s.includes('standalone')), JSON.stringify(quick.timeline));

  check('aucune erreur de page', problems.length === 0, problems.join(' | '));
  await browser.close();
  console.log(failed ? `\n${failed} contrôle(s) en échec. Captures : ${SHOTS}` : `\nTous les contrôles passent. Captures : ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
