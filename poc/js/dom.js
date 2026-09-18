// Petits utilitaires DOM partagés par tout le widget : accès par id, échappement HTML,
// génération d'identifiants courts, bascule entre les écrans (#loading, #config, #fill…).
export const $ = (id) => document.getElementById(id);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => 'q_' + Math.random().toString(36).slice(2, 9);
export const show = (id) => ['loading', 'config', 'fill', 'standalone', 'repair', 'test'].forEach(x => $(x).classList.toggle('hidden', x !== id));
// CSS.escape n'existe pas partout (anciens navigateurs) : repli simple par échappement manuel.
export function cssEsc(s) { return window.CSS && CSS.escape ? CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, '\\$&'); }
