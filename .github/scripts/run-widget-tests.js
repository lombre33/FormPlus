#!/usr/bin/env node
// Sert la racine du dépôt en HTTP local, ouvre poc/widget.html#test dans Chromium headless
// (Playwright) et fait échouer le job si un test de la suite interne échoue. La suite elle-même
// (poc/js/tests.js) est entièrement hors ligne : aucune requête réseau réelle, aucun document
// Grist touché. Voir docs/04-architecture.md, section "Suite de tests".
// Jouée deux fois (kit commun, consigne 005 point 2.5.2) : le Chromium de la CI est en anglais,
// et la suite lirait de l'anglais là où elle attend du français si on ne forçait pas la langue —
// un essai qui compare un texte de l'interface le compare à I18n.t(clé), jamais à du français
// écrit en dur, donc les deux langues doivent passer, pas seulement celle du conteneur.
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const port = 8123;
const contentTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const filePath = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0]));
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});

async function runOnce(browser, locale) {
  // locale pilote navigator.language/navigator.languages (Playwright) : I18n (kit) les lit à
  // l'init faute de langue stockée ou donnée par GFS (browserLanguage, kit/js/i18n.js).
  const context = await browser.newContext({ locale });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('CONSOLE ERROR: ' + m.text()); });

  await page.goto(`http://localhost:${port}/poc/widget.html#test`, { waitUntil: 'networkidle' });
  // Attend la fin réelle de la suite (« N / N tests réussis », avec ou sans échec), pas la simple
  // présence d'un texte : « Exécution… » (poc/js/tests.js) est lui aussi non vide, et un module
  // chargé par le réseau local peut laisser le temps à une frame de l'afficher avant la fin.
  await page.waitForFunction(
    () => {
      const el = document.getElementById('test-summary');
      return !!(el && /\d+\s*\/\s*\d+/.test(el.textContent || ''));
    },
    { timeout: 60000 },
  );

  const summary = (await page.textContent('#test-summary')).trim();
  const log = (await page.textContent('#test-log')) || '';
  const failLines = log.split('\n').filter((l) => l.startsWith('✗'));

  await context.close();
  return { locale, summary, failLines, consoleErrors };
}

server.listen(port, async () => {
  const browser = await chromium.launch();
  let anyFailed = false;
  for (const locale of ['fr-FR', 'en-US']) {
    const { summary, failLines, consoleErrors } = await runOnce(browser, locale);
    console.log(`[${locale}] ${summary}`);
    if (failLines.length) console.log(`[${locale}] Échecs :\n` + failLines.join('\n'));
    if (consoleErrors.length) console.log(`[${locale}] Erreurs console :\n` + consoleErrors.join('\n'));
    if (failLines.length > 0 || /\d+ échec/.test(summary) || consoleErrors.length > 0) anyFailed = true;
  }

  await browser.close();
  server.close();
  process.exit(anyFailed ? 1 : 0);
});
