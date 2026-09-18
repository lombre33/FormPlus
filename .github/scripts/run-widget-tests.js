#!/usr/bin/env node
// Sert la racine du dépôt en HTTP local, ouvre poc/widget.html#test dans Chromium headless
// (Playwright) et fait échouer le job si un test de la suite interne échoue. La suite elle-même
// (poc/js/tests.js) est entièrement hors ligne : aucune requête réseau réelle, aucun document
// Grist touché. Voir docs/04-architecture.md, section "Suite de tests".
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

server.listen(port, async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push('CONSOLE ERROR: ' + m.text()); });

  await page.goto(`http://localhost:${port}/poc/widget.html#test`, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => document.getElementById('test-summary') && document.getElementById('test-summary').textContent.trim().length > 0,
    { timeout: 60000 },
  );

  const summary = (await page.textContent('#test-summary')).trim();
  const log = (await page.textContent('#test-log')) || '';
  const failLines = log.split('\n').filter((l) => l.startsWith('✗'));

  console.log(summary);
  if (failLines.length) {
    console.log('\nÉchecs :\n' + failLines.join('\n'));
  }
  if (consoleErrors.length) {
    console.log('\nErreurs console :\n' + consoleErrors.join('\n'));
  }

  await browser.close();
  server.close();

  const failed = failLines.length > 0 || /\d+ échec/.test(summary) || consoleErrors.length > 0;
  process.exit(failed ? 1 : 0);
});
