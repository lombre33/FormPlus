#!/usr/bin/env node
// Contrôle des modèles de formulaire de Form+ (consigne GFS 033) : le contenu (poc/js/templates.js), le catalogue que
// GFS copie (modeles/modeles.json) et les vignettes (modeles/*.webp : WebP, 240 x 320 px, 12 Ko au plus).
//   node tests/check-modeles.mjs            vérifie, code de sortie non nul au premier défaut
//   node tests/check-modeles.mjs --ecrire   réécrit modeles/modeles.json d'après templates.js, puis vérifie
// Rien d'autre que Node : aucune dépendance.
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, catalogue, modelProblems } from '../poc/js/templates.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'modeles');
const file = join(dir, 'modeles.json');
const write = process.argv.includes('--ecrire');
const MAX_BYTES = 12 * 1024;
const WIDTH = 240;
const HEIGHT = 320;

// Largeur et hauteur d'un WebP (lossy « VP8 », sans perte « VP8L » ou étendu « VP8X »), lues dans son en-tête.
function webpSize(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
  if (kind === 'VP8X') return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  return null;
}

if (write) { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(catalogue(), null, 2) + '\n'); }

const problems = modelProblems(MODELS);
if (!existsSync(file)) problems.push('modeles/modeles.json manque (node tests/check-modeles.mjs --ecrire)');
else {
  let onDisk = null;
  try { onDisk = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { problems.push(`modeles/modeles.json illisible : ${e.message}`); }
  if (onDisk && JSON.stringify(onDisk) !== JSON.stringify(catalogue())) problems.push('modeles/modeles.json ne correspond plus à poc/js/templates.js (node tests/check-modeles.mjs --ecrire)');
}
for (const m of MODELS) {
  const img = join(dir, m.vignette);
  if (!existsSync(img)) { problems.push(`« ${m.id} » : vignette modeles/${m.vignette} manquante`); continue; }
  const size = statSync(img).size;
  const dims = webpSize(readFileSync(img));
  if (!dims) problems.push(`« ${m.id} » : modeles/${m.vignette} n'est pas un WebP lisible`);
  else if (dims.width !== WIDTH || dims.height !== HEIGHT) problems.push(`« ${m.id} » : vignette de ${dims.width} x ${dims.height} px au lieu de ${WIDTH} x ${HEIGHT}`);
  if (size > MAX_BYTES) problems.push(`« ${m.id} » : vignette de ${size} octets (${MAX_BYTES} au plus)`);
}

if (problems.length) {
  console.error(`✗ ${problems.length} défaut(s) :\n` + problems.map(p => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${MODELS.length} modèles, catalogue et vignettes en règle (${MODELS.map(m => m.id).join(', ')})`);
