#!/usr/bin/env node
// « Envoyer une autre réponse » : un visiteur ANONYME répond à un VRAI formulaire Grist publié, voit l'écran
// de succès, clique sur « Envoyer une autre réponse » et retrouve un formulaire vierge, qu'il peut renvoyer.
//
// Bug visé (signalé par le fil « Corriger formulaire public sans questions », 17 nov) : l'écran de succès de
// respond.js posait le bouton avec `onclick="location.reload()"`, un gestionnaire inline que la CSP de
// widget.html (`script-src` sans `'unsafe-inline'`) bloque. Mesuré dans Chromium : le clic ne faisait rien,
// aucune erreur visible pour le répondant (seulement « Executing inline event handler violates… » en console).
//
// Pourquoi ce test ne passe PAS par `bypassCSP: true` comme les autres e2e du dossier : ce bug n'existe QUE
// sous la CSP. Les autres tests la contournent parce que ce Grist de test est en HTTP nu et que le
// `connect-src 'self' https:` du widget bloquerait son appel vers lui (README, point 5). Ici on garde la CSP
// intacte et on ne fait qu'ajouter l'origine de CE Grist à `connect-src` dans la copie de widget.html servie par
// le petit serveur de ce script : `script-src` (la directive qui bloque les gestionnaires inline) n'est pas
// touchée, et le test vérifie qu'elle ne contient toujours ni 'unsafe-inline' ni 'unsafe-hashes'.
// (Un `route.fulfill` de Playwright sur widget.html ne conviendrait pas : la page n'a alors plus d'adresse
// réseau réelle et Chromium refuse ses appels vers localhost, « Permission was denied … loopback ».)
//
// Ce que le test vérifie :
//   1. la CSP servie est celle du dépôt, script-src sans 'unsafe-inline' ;
//   2. un visiteur anonyme (contexte vierge, sans cookie) voit le formulaire publié et le remplit ;
//   3. sa réponse arrive dans la table de Grist, l'écran de succès s'affiche avec « Envoyer une autre réponse » ;
//   4. le bouton n'a aucun attribut on* ; le clic recharge la page (l'état de la page repart de zéro) et le
//      formulaire revient VIERGE, bouton d'envoi compris ;
//   5. une seconde réponse peut être envoyée et arrive aussi dans la table ;
//   6. aucune violation de CSP, aucune erreur console, aucune erreur de page pendant tout le parcours.
//
// Usage : tests/grist-env/start-grist-test.sh   (une fois, démarre Grist)
//         NODE_PATH=$(npm root -g) node tests/grist-env/e2e-send-another.js [dossier_captures]
// Variables : GRIST_PORT (8484), SERVER_PORT (8013, serveur du widget propre à ce test), GRIST_TEST_STATE_DIR
// (~/.formplus-grist-test). Sort avec un code non nul au premier contrôle qui échoue.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
const SERVER_PORT = Number(process.env.SERVER_PORT || '8013');
const STATE_DIR = process.env.GRIST_TEST_STATE_DIR || path.join(os.homedir(), '.formplus-grist-test');
const SHOTS = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'formplus-e2e-send-another-'));
const ROOT = path.resolve(__dirname, '..', '..');
const info = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'grist-test-doc.json'), 'utf8'));
const GRIST = `http://localhost:${GRIST_PORT}`;
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

// La vraie clé de partage du serveur (table `shares` de home.sqlite3), pas le linkId du document : voir
// README.md, « Écart constaté ». Lecture seule, par python3 (le binaire sqlite3 n'est pas toujours installé).
function realShareKey(linkId) {
  const db = path.join(STATE_DIR, 'grist-data', 'home.sqlite3');
  const py = 'import sqlite3,sys\nc=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True)\nr=c.execute("select key from shares where link_id=?",(sys.argv[2],)).fetchone()\nprint(r[0] if r else "")';
  const out = spawnSync('python3', ['-I', '-c', py, db, linkId], { encoding: 'utf8' });
  return (out.stdout || '').trim();
}

// Sert la racine du dépôt tel quel ; seule différence : l'origine de ce Grist de test (HTTP nu) est ajoutée au
// `connect-src` du <meta> CSP de widget.html. Le reste de la CSP, script-src en tête, est celui du dépôt.
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    let body = data;
    if (path.basename(file) === 'widget.html') {
      body = Buffer.from(data.toString('utf8').replace("connect-src 'self' https:", `connect-src 'self' ${GRIST} https:`));
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(body);
  });
});

(async () => {
  const key = realShareKey(info.shareKey);
  if (!key) throw new Error(`clé de partage réelle introuvable dans home.sqlite3 pour le linkId ${info.shareKey} (Grist de test démarré avec start-grist-test.sh ?)`);
  await new Promise((r) => server.listen(SERVER_PORT, r));
  const pluginApi = await get(`${GRIST}/grist-plugin-api.js`);
  const browser = await chromium.launch();
  // Contexte VIERGE (aucun cookie : un visiteur anonyme) et SANS bypassCSP : c'est tout l'objet du test.
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 }, locale: 'fr-FR' });
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
  const problems = [];
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`CONSOLE ${m.type().toUpperCase()} ${m.text().slice(0, 300)}`); });
  // Une violation de CSP, quelle que soit la page (avant ET après le rechargement déclenché par le bouton).
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => { window.__csp.push(`${e.violatedDirective} : ${e.blockedURI || 'inline'}`); });
  });

  // ─── 1. La CSP servie est celle du dépôt ───
  const html = await get(`http://localhost:${SERVER_PORT}/poc/widget.html`);
  const csp = (/http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html) || [])[1] || '';
  const scriptSrc = (csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src')) || '');
  check('widget.html porte une CSP avec script-src', !!scriptSrc, csp.slice(0, 200));
  check('…script-src sans \'unsafe-inline\' ni \'unsafe-hashes\' : les gestionnaires on* sont bien bloqués ici comme chez le répondant', !/unsafe-inline|unsafe-hashes/.test(scriptSrc), scriptSrc);

  // ─── 2. Un visiteur anonyme ouvre le formulaire publié et le remplit ───
  const formLink = `${GRIST}/o/${info.org}/forms/${key}/${info.sectionReponses}`;
  const url = `http://localhost:${SERVER_PORT}/poc/widget.html#form=${encodeURIComponent(formLink)}`;
  await page.goto(url);
  await page.locator('#fill-card form').waitFor({ timeout: 30000 }).catch(async (e) => {
    await page.screenshot({ path: path.join(SHOTS, 'ECHEC-formulaire.png') });
    throw new Error(`${e.message.split('\n')[0]} (page : ${JSON.stringify((await page.locator('#fill-card').innerText().catch(() => '?')).slice(0, 200))} ; problèmes : ${problems.join(' | ')})`);
  });
  check('le visiteur voit le formulaire publié, sans outil de concepteur', (await page.locator('#pv-submit-btn').count()) === 1 && !(await page.locator('#preview-finish').count()));
  await page.screenshot({ path: path.join(SHOTS, '1-formulaire.png'), fullPage: true });
  const table = 'Reponses';
  const before = ((await api('GET', `/tables/${table}/records`)).records || []).length;
  const tag = `Vu${Date.now().toString(36)}`;
  const fillForm = async (value) => {
    // Tous les champs texte visibles, hors piège anti-robots `_website`.
    const inputs = page.locator('#f input[type=text]:not([name="_website"]), #f input:not([type]):not([name="_website"]), #f textarea');
    const n = await inputs.count();
    for (let i = 0; i < n; i++) await inputs.nth(i).fill(`${value}${i}`);
    return n;
  };
  const nFilled = await fillForm(tag);
  check('le formulaire a au moins un champ texte à remplir', nFilled > 0, String(nFilled));
  await page.evaluate(() => { window.__avantEnvoi = 'ancienne page'; });

  // ─── 3. Envoi : la réponse arrive, l'écran de succès propose « Envoyer une autre réponse » ───
  await page.locator('#pv-submit-btn').click();
  await page.locator('#fill-card h1.ok').waitFor({ timeout: 20000 }).catch(async (e) => {
    await page.screenshot({ path: path.join(SHOTS, 'ECHEC-envoi.png') });
    throw new Error(`${e.message.split('\n')[0]} (carte : ${JSON.stringify((await page.locator('#fill-card').innerText().catch(() => '?')).slice(0, 300))})`);
  });
  const after1 = (await api('GET', `/tables/${table}/records`)).records || [];
  check('sa réponse est dans la table de Grist', after1.length === before + 1 && after1.some((r) => Object.values(r.fields).some((v) => String(v).startsWith(tag))), JSON.stringify(after1.slice(-1).map((r) => r.fields)));
  // Trouvé par son rôle et son nom, comme le répondant le voit : pas par un identifiant que seul le correctif aurait.
  const btn = page.getByRole('button', { name: 'Envoyer une autre réponse' });
  check('l’écran de succès affiche « Envoyer une autre réponse »', (await btn.count()) === 1, await page.locator('#fill-card').innerText());
  check('…sans attribut on* sur le bouton (un gestionnaire inline est mort sous cette CSP)', (await btn.evaluate((el) => [...el.attributes].filter((a) => /^on/i.test(a.name)).map((a) => a.name))).length === 0);
  await page.screenshot({ path: path.join(SHOTS, '2-succes.png'), fullPage: true });
  const violationsBeforeReload = await page.evaluate(() => window.__csp); // le rechargement repart d'une liste vide : on garde celles-ci

  // ─── 4. Le clic : la page repart de zéro et le formulaire revient vierge ───
  await btn.click();
  const reloaded = await page.waitForFunction(() => window.__avantEnvoi === undefined, null, { timeout: 8000 }).then(() => true, () => false);
  check('le clic sur « Envoyer une autre réponse » recharge la page (sinon le bouton est mort)', reloaded, `la page précédente est toujours là : ${JSON.stringify((await page.locator('#fill-card').innerText().catch(() => '?')).slice(0, 120))}`);
  if (!reloaded) {
    await page.screenshot({ path: path.join(SHOTS, 'ECHEC-apres-clic.png') });
    check('aucune violation de CSP', false, (violationsBeforeReload.concat(await page.evaluate(() => window.__csp))).join(' | ') || 'aucune, mais le clic est resté sans effet');
    console.log(`\nCaptures : ${SHOTS}`);
    await browser.close(); server.close(); process.exit(1);
  }
  await page.locator('#fill-card form').waitFor({ timeout: 30000 });
  check('le formulaire est revenu, l’écran de succès est parti', (await page.locator('#pv-submit-btn').count()) === 1 && (await page.getByRole('button', { name: 'Envoyer une autre réponse' }).count()) === 0 && (await page.locator('#fill-card h1.ok').count()) === 0);
  const values = await page.locator('#f input[type=text]:not([name="_website"]), #f textarea').evaluateAll((els) => els.map((e) => e.value));
  check('…vierge : aucun champ ne garde la réponse précédente', values.length > 0 && values.every((v) => v === ''), JSON.stringify(values));
  await page.screenshot({ path: path.join(SHOTS, '3-formulaire-vierge.png'), fullPage: true });

  // ─── 5. Une seconde réponse part pour de bon ───
  const tag2 = `${tag}b`;
  await fillForm(tag2);
  await page.locator('#pv-submit-btn').click();
  await page.locator('#fill-card h1.ok').waitFor({ timeout: 20000 });
  const after2 = (await api('GET', `/tables/${table}/records`)).records || [];
  check('la seconde réponse est elle aussi dans la table de Grist', after2.length === before + 2 && after2.some((r) => Object.values(r.fields).some((v) => String(v).startsWith(tag2))), JSON.stringify(after2.slice(-1).map((r) => r.fields)));

  // ─── 6. Rien d'anormal en console ni côté CSP ───
  const violations = violationsBeforeReload.concat(await page.evaluate(() => window.__csp));
  check('aucune violation de CSP (pendant l’affichage, le clic et le second envoi)', violations.length === 0, violations.join(' | '));
  check('aucune erreur de page ni de console pendant tout le parcours', problems.length === 0, problems.join(' | '));

  await browser.close();
  server.close();
  console.log(`\nCaptures : ${SHOTS}`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('✗ exception :', e.message); try { server.close(); } catch (x) { /* déjà fermé */ } process.exit(1); });
