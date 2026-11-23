#!/usr/bin/env node
// Sert la racine du dépôt (à la place du `python3 -m http.server` de start-grist-test.sh) avec la politique de
// sécurité des pages EXACTEMENT comme dans le dépôt, à une seule différence près : l'origine de ce Grist de test
// (http://localhost:8484, en HTTP nu) est ajoutée à `connect-src` de poc/widget.html et poc/public-form.html. Un vrai
// Grist est en https, que cette directive ouvre déjà (règle S3, consigne GFS 037) : cette origine n'est que
// l'équivalent, pour le banc, de « https: ». `img-src` n'est plus touchée : aucune image ne vient de Grist (le 23/11,
// le logo saisi par adresse a été remplacé par une image intégrée ; les images passent par fetch puis data:). Rien d'autre n'est touché : script-src,
// style-src, default-src, form-action… restent ceux du dépôt, et sont donc appliqués pour de bon dans les essais.
//
// Pourquoi : les essais réels ouvraient leur navigateur avec `bypassCSP: true` (ce Grist de test est en HTTP nu, le
// `connect-src 'self' https:` du widget bloquerait ses appels vers lui). La politique n'était donc mesurée nulle
// part en conditions réelles, sauf par e2e-send-another.js (son propre petit serveur). Avec ce serveur et
// `FORMPLUS_CSP=1`, les essais e2e-*.js gardent la politique (voir « Mesurer avec la politique de sécurité
// appliquée » dans README.md) ; le serveur écrit en sortie chaque réécriture, pour qu'on voie ce qu'il change.
//
// Usage : node tests/grist-env/serveur-csp.js [port_widget=8010] [port_grist=8484]
//   (arrêter d'abord le `python3 -m http.server` du port 8010 : le document de test pointe sur ce port)
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.WIDGET_PORT || '8010');
const GRIST = `http://localhost:${process.argv[3] || process.env.GRIST_PORT || '8484'}`;
const ROOT = path.resolve(__dirname, '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.md': 'text/plain; charset=utf-8' };

// Ajoute l'origine du Grist de test à une directive de la politique de la page ; faux si la directive n'y est pas.
function open(csp, directive, origin) {
  const re = new RegExp(`(^|;\\s*)(${directive}\\s)`);
  return re.test(csp) ? csp.replace(re, `$1$2${origin} `) : csp;
}
function rewrite(file, html) {
  const base = path.basename(file);
  if (base !== 'widget.html' && base !== 'public-form.html') return html;
  return html.replace(/(http-equiv="Content-Security-Policy" content=")([^"]*)(")/, (all, a, csp, c) => {
    const next = open(csp, 'connect-src', GRIST);
    if (next === csp) throw new Error(`${base} : rien à rouvrir pour ${GRIST}, la politique a changé de forme ?`);
    return `${a}${next}${c}`;
  });
}

http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  const file = path.join(ROOT, rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    let body = data;
    if (/\.html$/.test(file)) {
      try { body = Buffer.from(rewrite(file, data.toString('utf8'))); } catch (e) { res.writeHead(500); res.end(String(e.message)); return; }
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
}).listen(PORT, () => console.log(`serveur-csp : ${ROOT} sur http://localhost:${PORT}, ${GRIST} ajouté à connect-src`));
