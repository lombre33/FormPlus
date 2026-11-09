#!/usr/bin/env node
// Peut-on se passer de faire copier le lien d'un formulaire publié ? Sonde, contre un VRAI Grist
// (celui de start-grist-test.sh), tout ce qu'un widget à accès complet pourrait essayer pour lire la
// clé de partage lui-même. La clé « réelle » est lue dans home.sqlite3 (table `shares`) : elle sert de
// témoin, on cherche si elle apparaît quelque part que le widget peut atteindre.
//
// Usage : tests/grist-env/start-grist-test.sh   (Grist) + python3 -m http.server 8010 (le widget)
//         NODE_PATH=$(npm root -g) node tests/grist-env/probe-share-key.js
// Sort avec un code non nul si une piste ÉCHAPPE à ce qui était établi (une clé lisible, une
// WebSocket qui s'ouvre depuis un autre site) : c'est alors que le guide de publication est à revoir.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');

const GRIST_PORT = process.env.GRIST_PORT || '8484';
const WIDGET_PORT = process.env.WIDGET_PORT || '8010';
const STATE_DIR = process.env.GRIST_TEST_STATE_DIR || path.join(os.homedir(), '.formplus-grist-test');
const info = JSON.parse(fs.readFileSync(path.join(STATE_DIR, 'grist-test-doc.json'), 'utf8'));
const GRIST = `http://localhost:${GRIST_PORT}`;
const DOC_URL = `${GRIST}/o/${info.org}/${info.docId}`;
const HOME_DB = path.join(STATE_DIR, 'grist-data', 'home.sqlite3');
const apiKey = () => fs.readFileSync(path.join(STATE_DIR, 'apikey.txt'), 'utf8').trim();

let surprises = 0;
const line = (ok, name, detail) => console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
const expect = (name, cond, detail) => { line(cond, name, detail); if (!cond) surprises++; };
const section = (t) => console.log(`\n── ${t}`);

// Les (linkId, clé) que le serveur a vraiment en base pour ce document.
const realShares = () => JSON.parse(execFileSync('python3', ['-c',
  'import sqlite3,json,sys\n' +
  'db=sqlite3.connect("file:"+sys.argv[1]+"?mode=ro",uri=True)\n' +
  'print(json.dumps(db.execute("select link_id,key from shares where doc_id=?",(sys.argv[2],)).fetchall()))',
  HOME_DB, info.docId]).toString());

const request = (method, url, { headers = {}, body } = {}) => new Promise((resolve) => {
  const req = http.request(url, { method, headers }, (r) => {
    const chunks = [];
    r.on('data', (c) => chunks.push(c));
    r.on('end', () => resolve({ status: r.statusCode, body: Buffer.concat(chunks).toString('latin1') }));
  });
  req.on('error', (e) => resolve({ status: 0, body: String(e.message) }));
  if (body) req.write(body);
  req.end();
});
const get = (url, headers) => request('GET', url, { headers });
const owner = () => ({ Authorization: `Bearer ${apiKey()}` });

(async () => {
  const shares = realShares();
  const keys = shares.map((s) => s[1]);
  const linkIds = shares.map((s) => s[0]);
  console.log(`Grist ${GRIST} · document ${info.docId} · ${shares.length} partages en base, dont des clés serveur comme « ${keys[0]} » (lien interne « ${linkIds[0]} »)`);
  const leaks = (text) => keys.filter((k) => text.includes(k));

  const pluginApi = (await get(`${GRIST}/grist-plugin-api.js`)).body;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: `eval(${JSON.stringify(pluginApi)});` }));
  const wsUrls = [];
  ctx.on('page', (p) => p.on('websocket', (ws) => wsUrls.push(ws.url())));

  const page = await ctx.newPage();
  page.on('websocket', (ws) => wsUrls.push(ws.url()));
  await page.goto(`${GRIST}/test/login?username=test@formplus.local&name=Test%20FormPlus&next=${encodeURIComponent(`${GRIST}/o/${info.org}`)}`);
  await page.goto(DOC_URL);
  await page.getByText('FormPlus', { exact: true }).first().click();
  let w = null;
  for (let i = 0; i < 80 && !w; i++) { w = page.frames().find((fr) => fr.url().includes('widget.html')); if (!w) await page.waitForTimeout(250); }
  if (!w) throw new Error('cadre du widget introuvable');
  await page.waitForTimeout(2500);

  // ─── 0. Le témoin : l'interface de Grist, elle, lit la clé (WebSocket, rôle propriétaire) ───
  section('0. Témoin : ce que fait l’interface de Grist elle-même');
  const uiKey = await page.evaluate(async (linkId) => {
    try {
      const gd = window.gristDocPageModel.gristDoc.get();
      const s = await gd.docComm.getShare(linkId);
      return s && s.key;
    } catch (e) { return `ERREUR ${e.message}`; }
  }, linkIds[0]).catch((e) => `ERREUR ${e.message}`);
  expect('la page Grist (même origine, session propriétaire) obtient la clé via docComm.getShare', uiKey === keys[0], String(uiKey));

  // ─── 1. L'API plugin ───
  section('1. L’API plugin (grist.*), accès complet');
  const surface = await w.evaluate(() => {
    const names = (o) => { const out = []; for (let p = o; p && p !== Object.prototype; p = Object.getPrototypeOf(p)) out.push(...Object.getOwnPropertyNames(p)); return [...new Set(out)].sort(); };
    return { grist: names(window.grist), docApi: names(window.grist.docApi), rawApi: names(window.grist.rawApi || {}), sectionApi: names(window.grist.sectionApi || {}) };
  });
  console.log(`   grist : ${surface.grist.join(', ')}\n   docApi : ${surface.docApi.join(', ')}\n   rawApi : ${surface.rawApi.join(', ')}\n   sectionApi : ${surface.sectionApi.join(', ')}`);
  const shareish = Object.values(surface).flat().filter((n) => /share|publish|linkId|shareKey/i.test(n));
  expect('aucune méthode de l’API plugin ne parle de partage, de lien de partage ou de publication', shareish.length === 0, shareish.join(', '));

  // Le canal RPC brut : le côté Grist ne filtre que par niveau d'accès, pas par liste de méthodes. On
  // appelle donc à la main des noms qu'une personne pressée essaierait ; seuls ceux de GristDocAPI existent.
  const rpc = await w.evaluate(async (linkId) => {
    const stub = grist.rpc.getStub('GristDocAPI@grist');
    const out = { __temoin: await stub.getDocName().catch((e) => `ERREUR ${e.message}`) };
    for (const m of ['getShare', 'getShareKey', 'getShares', 'listShares', 'getPublishedKey', 'docComm', '_doc']) {
      try { out[m] = `RÉPOND ${JSON.stringify(await stub[m](linkId)).slice(0, 80)}`; } catch (e) { out[m] = `erreur (${String(e.message || e).slice(0, 60)})`; }
    }
    return out;
  }, linkIds[0]);
  const rpcWitness = rpc.__temoin; delete rpc.__temoin;
  console.log(`   canal RPC brut : ${Object.entries(rpc).map(([m, r]) => `${m} → ${r}`).join(' ; ')}`);
  expect('témoin : le même canal répond pour une méthode qui existe (getDocName)', rpcWitness === info.docId, String(rpcWitness));
  expect('appeler à la main getShare & co. sur le canal RPC du widget ne rend rien', Object.values(rpc).every((r) => r.startsWith('erreur')));

  // ─── 2. Les métadonnées du document, lues par le widget ───
  section('2. Tout le document, lu comme le fait le widget (fetchTable de chaque table, métadonnées comprises)');
  const dump = await w.evaluate(async () => {
    const out = {};
    const meta = ['_grist_DocInfo', '_grist_Tables', '_grist_Tables_column', '_grist_Views', '_grist_Views_section', '_grist_Views_section_field', '_grist_Pages', '_grist_Shares', '_grist_ACLResources', '_grist_ACLRules', '_grist_Filters', '_grist_Cells', '_grist_Attachments', '_grist_Triggers', '_grist_Imports', '_grist_TableViews', '_grist_TabItems', '_grist_TabBar', '_grist_Validations', '_grist_REPL_Hist', '_grist_Bots'];
    let user = [];
    try { user = await grist.docApi.listTables(); } catch (e) { /* inutile */ }
    for (const t of [...meta, ...user]) {
      try { out[t] = await grist.docApi.fetchTable(t); } catch (e) { out[t] = { __error: String(e.message || e).slice(0, 80) }; }
    }
    return out;
  });
  const readable = Object.entries(dump).filter(([, v]) => !v.__error).map(([k]) => k);
  console.log(`   ${readable.length} tables lues (${Object.keys(dump).length - readable.length} refusées ou absentes)`);
  const shareTable = dump._grist_Shares;
  console.log(`   _grist_Shares : colonnes ${Object.keys(shareTable).join(', ')} · ${shareTable.id.length} lignes`);
  expect('la table _grist_Shares ne porte que linkId / options (aucune colonne de clé)', !Object.keys(shareTable).some((c) => /^key$/i.test(c)));
  // Les tables FormPlus_* gardent le lien que la personne a COLLÉ (c'est justement ce qu'on cherche à
  // éviter) : leurs clés ne comptent pas comme une fuite, on les met de côté. Toute autre table, ou
  // toute clé jamais collée, qui en porterait une serait une vraie fuite.
  const where = {};
  for (const [t, v] of Object.entries(dump)) for (const k of leaks(JSON.stringify(v))) (where[t] = where[t] || new Set()).add(k);
  console.log(`   clés serveur retrouvées dans : ${Object.entries(where).map(([t, ks]) => `${t} (${ks.size})`).join(', ') || 'nulle part'}`);
  const outsideFormPlus = Object.keys(where).filter((t) => !t.startsWith('FormPlus_'));
  expect('aucune clé serveur dans une table qui n’est pas celle de Form+ (= collée par la personne)', outsideFormPlus.length === 0, outsideFormPlus.join(', '));
  const pasted = new Set(Object.values(where).flatMap((ks) => [...ks]));
  const virgin = keys.filter((k) => !pasted.has(k));
  console.log(`   ${virgin.length} clés jamais collées dans le document : elles servent de témoin pour la suite`);
  expect('au moins une clé jamais collée sert de témoin', virgin.length > 0);
  const leaks2 = (text) => virgin.filter((k) => text.includes(k));
  expect('le linkId n’est PAS la clé (c’est un uuid distinct)', linkIds.every((l) => !keys.includes(l)));

  // ─── 3. L'API REST, avec la clé d'API du propriétaire (le pouvoir maximal) ───
  section('3. L’API REST, avec la clé d’API du propriétaire');
  const d = `${GRIST}/o/${info.org}/api/docs/${info.docId}`;
  const routes = [
    [`${GRIST}/api/docs/${info.docId}`, 'doc (serveur d’accueil)'], [`${d}/access`, 'accès'], [`${d}/tables`, 'tables'],
    [`${d}/tables/_grist_Shares/records`, 'métadonnées _grist_Shares'], [`${d}/tables/_grist_Shares/columns`, 'colonnes _grist_Shares'],
    [`${d}/tables/_grist_Pages/records`, '_grist_Pages'], [`${d}/tables/_grist_Views_section/records`, '_grist_Views_section'],
    [`${d}/sql?q=${encodeURIComponent('select * from _grist_Shares')}`, 'SQL sur _grist_Shares'], [`${d}/webhooks`, 'webhooks'],
    [`${d}/snapshots`, 'instantanés'], [`${d}/states`, 'états'], [`${d}/usersForViewAs`, 'utilisateurs'], [`${d}/download`, 'téléchargement du .grist'],
    [`${d}/download/csv?tableId=_grist_Shares`, 'CSV de _grist_Shares'], [`${GRIST}/api/orgs/${info.org}`, 'site'], [`${GRIST}/api/orgs/${info.org}/workspaces`, 'espaces de travail'],
    [`${d}/forms`, 'forms'], [`${d}/shares`, 'shares'], [`${d}/share`, 'share'],
  ];
  const restLeaks = [];
  for (const [url, label] of routes) {
    const r = await get(url, owner());
    const found = leaks2(r.body);
    if (found.length) restLeaks.push(`${label} (${found.join(',')})`);
    console.log(`   ${String(r.status).padEnd(4)} ${label}${found.length ? '  ⚠ CLÉ PRÉSENTE' : ''}`);
  }
  expect('aucune route REST (toutes essayées avec la clé du propriétaire) ne rend une clé', restLeaks.length === 0, restLeaks.join(' ; '));
  const linkIdAsKey = await get(`${GRIST}/api/s/${info.shareKey}/forms/${info.sectionReponses}`);
  expect('le linkId ne sert pas de clé : /api/s/<linkId>/… répond « Share not known »', linkIdAsKey.status === 404, `${linkIdAsKey.status} ${linkIdAsKey.body.slice(0, 60)}`);
  const reponsesKey = (shares.find((x) => x[0] === info.shareKey) || [])[1];
  const realKey = await get(`${GRIST}/api/s/${reponsesKey}/forms/${info.sectionReponses}`);
  expect('… alors que la vraie clé ouvre le formulaire', realKey.status === 200, String(realKey.status));

  // ─── 4. La jeton d'accès du widget ───
  section('4. Le jeton que l’API plugin donne au widget (getAccessToken)');
  const tok = await w.evaluate(() => grist.docApi.getAccessToken({ readOnly: false }));
  const tokenBase = String(tok.baseUrl);
  const withTok = (route) => `${tokenBase}${route}${route.includes('?') ? '&' : '?'}auth=${tok.token}`;
  const t1 = await get(withTok('/tables/_grist_Shares/records'));
  console.log(`   ${t1.status} jeton → métadonnées _grist_Shares (${leaks2(t1.body).length ? 'CLÉ' : 'sans clé'})`);
  const t2 = await request('PATCH', `${GRIST}/api/docs/${info.docId}/access?auth=${tok.token}`, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta: { maxInheritedRole: 'viewers' } }) });
  expect('le jeton ne donne pas accès à l’API d’accueil (gérer l’accès public du document)', [401, 403, 404].includes(t2.status), String(t2.status));
  expect('rien du jeton ne rend une clé', leaks2(t1.body).length === 0);

  // ─── 5. La WebSocket de Grist, depuis une autre origine ───
  section('5. La WebSocket de Grist (celle d’où l’interface lit la clé), depuis une page qui n’est pas Grist');
  const wsUrl = wsUrls.find((u) => /\/dw\//.test(u)) || wsUrls[0];
  console.log(`   adresse de la WebSocket de Grist : ${wsUrl ? wsUrl.replace(/\?.*/, '?…') : '(non vue)'}`);
  const tryWs = async (origin, label) => {
    const p = await ctx.newPage();
    await p.route('**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' }));
    await p.goto(`${origin}/sonde.html`);
    const r = await p.evaluate((u) => new Promise((resolve) => {
      let opened = false; const ws = new WebSocket(u);
      const t = setTimeout(() => resolve({ opened, note: 'délai' }), 8000);
      ws.onopen = () => { opened = true; };
      ws.onmessage = (m) => { clearTimeout(t); resolve({ opened, note: `message reçu : ${String(m.data).slice(0, 120)}` }); };
      ws.onclose = (e) => { clearTimeout(t); resolve({ opened, note: `fermée, code ${e.code}` }); };
    }), wsUrl);
    await p.close();
    return { label, ...r };
  };
  const control = await page.evaluate((u) => new Promise((resolve) => {
    let opened = false; const ws = new WebSocket(u);
    const t = setTimeout(() => resolve({ opened, note: 'délai' }), 8000);
    ws.onopen = () => { opened = true; };
    ws.onmessage = (m) => { clearTimeout(t); resolve({ opened, note: `message reçu : ${String(m.data).slice(0, 100)}` }); };
    ws.onclose = (e) => { clearTimeout(t); resolve({ opened, note: `fermée, code ${e.code}` }); };
  }), wsUrl);
  expect('témoin : la même adresse ouverte depuis la page Grist elle-même s’ouvre', control.opened, control.note);
  const sameSiteOtherOrigin = await tryWs(`http://localhost:${WIDGET_PORT}`, 'même site (localhost), autre origine : les cookies de session partent');
  const otherSite = await tryWs(`http://127.0.0.1:${WIDGET_PORT}`, 'autre site (127.0.0.1) : situation réelle d’un widget hébergé ailleurs, sans cookie');
  for (const r of [sameSiteOtherOrigin, otherSite]) console.log(`   ${r.label} → ${r.opened ? 'OUVERTE' : 'refusée'} (${r.note})`);
  expect('depuis un autre site, la WebSocket de Grist ne s’ouvre pas', !otherSite.opened, otherSite.note);
  console.log(`   (info) depuis le même site mais une autre origine : ${sameSiteOtherOrigin.opened ? 'ouverte — le contrôle d’origine ne protège pas ici' : 'refusée par le contrôle d’origine'}`);

  // ─── 6. Publier À LA PLACE de la personne : possible, mais la clé reste invisible ───
  section('6. Le widget publie lui-même (les mêmes actions que le bouton Publier de Grist), puis tente de lire la clé');
  const probeTable = `Sonde${Date.now().toString(36)}`;
  const made = await w.evaluate(async (t) => {
    const add = await grist.docApi.applyUserActions([['AddTable', t, [{ id: 'Nom', type: 'Text' }]]]);
    const tref = add.retValues[0].table_ref;
    const cv = await grist.docApi.applyUserActions([['CreateViewSection', tref, 0, 'form', null, t]]);
    const { viewRef, sectionRef } = cv.retValues[0];
    const pages = await grist.docApi.fetchTable('_grist_Pages');
    const pageRef = pages.id[pages.viewRef.indexOf(viewRef)];
    const linkId = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-sonde`;
    const sh = await grist.docApi.applyUserActions([['AddRecord', '_grist_Shares', null, { linkId, options: JSON.stringify({ publish: true }) }]]);
    const shareRef = sh.retValues[0];
    await grist.docApi.applyUserActions([
      ['UpdateRecord', '_grist_Pages', pageRef, { shareRef }],
      ['UpdateRecord', '_grist_Views_section', sectionRef, { shareOptions: JSON.stringify({ publish: true, form: true }) }],
    ]);
    return { viewRef, sectionRef, linkId };
  }, probeTable);
  let serverKey = null;
  for (let i = 0; i < 30 && !serverKey; i++) {
    const row = realShares().find((x) => x[0] === made.linkId);
    if (row) serverKey = row[1]; else await page.waitForTimeout(300);
  }
  expect('publier par des actions utilisateur crée bien un partage côté serveur (clé tirée au hasard)', !!serverKey && serverKey !== made.linkId, String(serverKey));
  const anon = await get(`${GRIST}/api/s/${serverKey}/forms/${made.sectionRef}`);
  expect('… et le formulaire est joignable en anonyme avec cette clé, sans aucun clic dans Grist', anon.status === 200, String(anon.status));
  const after = await w.evaluate(async () => JSON.stringify({ s: await grist.docApi.fetchTable('_grist_Shares'), v: await grist.docApi.fetchTable('_grist_Views_section'), p: await grist.docApi.fetchTable('_grist_Pages') }));
  expect('le widget qui vient de publier ne voit toujours pas la clé qu’il a fait naître', !after.includes(serverKey));

  const grist2 = await ctx.newPage();
  await grist2.goto(`${GRIST}/o/${info.org}/doc/${info.docId}/p/${made.viewRef}`);
  await grist2.getByText('Partager', { exact: true }).first().waitFor({ timeout: 30000 });
  const publishButton = await grist2.getByText('Publier', { exact: true }).count();
  expect('l’interface de Grist montre ce formulaire comme déjà publié (Partager présent, plus de bouton Publier)', publishButton === 0);
  await grist2.getByText('Partager', { exact: true }).first().click();
  await grist2.getByText('Copier le lien', { exact: true }).click();
  const clip = await grist2.evaluate(() => navigator.clipboard.readText());
  expect('le bouton « Copier le lien » de Grist donne /forms/<clé du serveur>/<section> (c’est LE geste qui reste à la personne)', clip.includes(`/forms/${serverKey}/${made.sectionRef}`), clip);
  await w.evaluate((t) => grist.docApi.applyUserActions([['RemoveTable', t]]), probeTable).catch(() => {});

  await browser.close();
  console.log(surprises ? `\n${surprises} point(s) à revoir : une piste n’est PAS fermée.` : '\nToutes les pistes testées sont fermées : la clé ne se lit que dans l’interface de Grist, par le propriétaire.');
  process.exit(surprises ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
