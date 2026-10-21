import { ICONS } from './icons.js';

// Types de question disponibles dans l'éditeur (question supplémentaire ou import de champ natif).
// 'section' et 'info' ne collectent aucune réponse : ce sont des blocs de mise en page insérés
// dans la même liste, réordonnables comme les autres (mêmes cartes, mêmes conditions d'affichage).
// Le libellé affiché n'est pas ici : il vient de I18n.t('form.editor.kind.<id>') (poc/js/strings.js,
// config-editor.js/kindLabel), pour rester FR/EN comme le reste de l'interface.
export const KINDS = [
  { id: 'text', icon: ICONS.text },
  { id: 'longtext', icon: ICONS.paragraph },
  { id: 'number', icon: ICONS.hash },
  { id: 'date', icon: ICONS.calendar },
  { id: 'datetime', icon: ICONS.calendar },
  { id: 'bool', icon: ICONS.toggleOn },
  { id: 'select', icon: ICONS.list },
  { id: 'multiselect', icon: ICONS.checkSquare },
  { id: 'timeslot', icon: ICONS.clock },
  { id: 'choice', icon: ICONS.table },
  { id: 'reflist', icon: ICONS.layers },
  { id: 'scale', icon: ICONS.slider },
  { id: 'ranking', icon: ICONS.ranking },
  { id: 'signature', icon: ICONS.pen },
  { id: 'map', icon: ICONS.pin },
  { id: 'attachments', icon: ICONS.paperclip },
  { id: 'section', icon: ICONS.heading },
  { id: 'info', icon: ICONS.info },
  { id: 'page', icon: ICONS.pageBreak },
];
export const LAYOUT_KINDS = new Set(['section', 'info', 'page']); // ne collectent pas de réponse
export const SINGLE_CHOICE_KINDS = new Set(['select', 'choice']); // peuvent s'afficher en menu ou en radio
// Types dont la réponse n'a pas de valeur simple à comparer dans une condition d'affichage : un
// fichier (attachments, signature), un point de carte (map) et un ordre (ranking) n'ont pas
// d'égalité qui ait du sens question par question ; une liste de références (reflist) est
// exclue pour la même raison que ChoiceList/multiselect ne l'était pas dès le départ — exposer
// un à un les identifiants de lignes référencées n'aiderait personne à écrire une condition.
export const NON_COMPARABLE_KINDS = new Set(['attachments', 'signature', 'map', 'ranking', 'reflist']);
// Types sans valeurs prédéfinies à choisir dans une liste pour la cellule "égale" d'une
// condition : saisie libre plutôt qu'un combo de recherche (voir wireConditionEditor,
// config-editor.js). 'scale' est un nombre comme 'number' ; 'datetime' prend un sélecteur natif
// plutôt qu'un champ texte générique.
export const FREE_ENTRY_KINDS = new Set(['number', 'text', 'longtext', 'scale', 'datetime']);
// Types dont les options (table source + colonne affichée) viennent d'une autre table, comme
// 'choice', et qui gèrent donc eux aussi leur propre colonne de destination cachée (voir
// ensureChoiceField / ensureRefListField) plutôt qu'une colonne choisie à la main.
export const TABLE_SOURCED_KINDS = new Set(['choice', 'reflist']);
// Types dont la liste d'options fixes se règle comme pour 'select'/'multiselect' (une option par
// ligne) : 'ranking' classe les mêmes options plutôt que d'en choisir une ou plusieurs ; 'timeslot'
// choisit un seul créneau prédéfini parmi la liste, affiché en pastilles plutôt qu'en menu (voir
// son cas dédié dans renderExtraQuestion, respond.js — jamais de bascule menu/radio comme pour
// 'select', toujours en pastilles : c'est tout le point du type, un choix "d'un peu visuel").
export const FIXED_LIST_KINDS = new Set(['select', 'multiselect', 'ranking', 'timeslot']);

// La carte interactive ('map') est la seule fonctionnalité du widget à charger une dépendance
// d'exécution externe (Leaflet, depuis un CDN) — tout le reste du widget reste zéro-dépendance
// par architecture (voir docs/04-architecture.md). Comme on ne sait pas à l'avance si la
// plateforme qui héberge le widget autorise ce script tiers, la fonctionnalité est GRISÉE PAR
// DÉFAUT : le type "Lieu sur carte" reste visible dans l'éditeur (pour ne pas perdre une
// question déjà configurée ailleurs) mais ne peut pas être choisi, et côté répondant la question
// se dégrade en simple saisie de coordonnées plutôt que de tenter de charger Leaflet.
// Pour activer la carte interactive sur une plateforme qui l'autorise (ex. GFS), poser AVANT le
// chargement du widget (donc avant <script type="module" src=".../main.js">) :
//   <script>window.FORMPLUS_ENABLE_MAP = true;</script>
// et autoriser en CSP le script LEAFLET_CDN_URL/LEAFLET_CDN_CSS ci-dessous ainsi que les tuiles
// OpenStreetMap (tile.openstreetmap.org, en img-src/connect-src). Voir docs/06-carte-interactive.md.
export function mapFeatureEnabled() {
  return typeof window !== 'undefined' && window.FORMPLUS_ENABLE_MAP === true;
}
export const LEAFLET_CDN_URL = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
export const LEAFLET_CDN_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
