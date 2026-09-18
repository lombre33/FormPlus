import { ICONS } from './icons.js';

// Types de question disponibles dans l'éditeur (question supplémentaire ou import de champ natif).
// 'section' et 'info' ne collectent aucune réponse : ce sont des blocs de mise en page insérés
// dans la même liste, réordonnables comme les autres (mêmes cartes, mêmes conditions d'affichage).
export const KINDS = [
  { id: 'text', label: 'Texte', icon: ICONS.text },
  { id: 'longtext', label: 'Texte long', icon: ICONS.paragraph },
  { id: 'number', label: 'Nombre', icon: ICONS.hash },
  { id: 'date', label: 'Date', icon: ICONS.calendar },
  { id: 'bool', label: 'Oui / non', icon: ICONS.toggleOn },
  { id: 'select', label: 'Choix (liste fixe)', icon: ICONS.list },
  { id: 'multiselect', label: 'Choix multiples (liste fixe)', icon: ICONS.checkSquare },
  { id: 'choice', label: 'Choix depuis une table', icon: ICONS.table },
  { id: 'attachments', label: 'Pièces jointes', icon: ICONS.paperclip },
  { id: 'section', label: 'Titre de section', icon: ICONS.heading },
  { id: 'info', label: "Bloc d'info repliable", icon: ICONS.info },
];
export const LAYOUT_KINDS = new Set(['section', 'info']); // ne collectent pas de réponse
export const SINGLE_CHOICE_KINDS = new Set(['select', 'choice']); // peuvent s'afficher en menu ou en radio
