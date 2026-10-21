# Carte interactive (type de question « Lieu sur carte »)

## Pourquoi c'est la seule dépendance externe du widget

FormPlus est zéro-dépendance par architecture (voir `04-architecture.md`) : aucun build, aucun
script tiers, tout servi tel quel par GitHub Pages. Le type de question « Lieu sur carte », pour
afficher une vraie carte cliquable (fond OpenStreetMap), est la seule exception : il charge la
bibliothèque [Leaflet](https://leafletjs.com/) depuis un CDN (`unpkg.com`), à la demande, et
seulement si une question de ce type existe dans le formulaire ouvert.

Comme on ne sait pas à l'avance si la plateforme qui héberge le widget autorise ce script tiers
(règles réseau, CSP…), la fonctionnalité est **grisée par défaut**.

## Comportement selon l'activation

- **Désactivée (par défaut, y compris sur la version autonome GitHub Pages)** : dans l'éditeur, le
  type « Lieu sur carte » reste visible dans le sélecteur de type mais ne peut pas être choisi pour
  une NOUVELLE question (bouton grisé, infobulle explicative). Une question déjà configurée avec ce
  type (par exemple créée sur une plateforme où la fonctionnalité est active) reste normalement
  éditable. Côté répondant, la question se dégrade en simple champ texte « latitude, longitude » :
  aucune requête vers le CDN, aucune carte chargée.
- **Activée** : l'éditeur propose le type normalement ; côté répondant, un vrai fond de carte
  OpenStreetMap s'affiche, cliquable pour poser un point (la valeur enregistrée est strictement la
  même chaîne `"latitude,longitude"` dans les deux cas — changer le réglage n'affecte jamais les
  données déjà collectées ni la colonne Grist de destination).

## Activer la carte interactive sur une plateforme qui l'autorise (ex. GFS)

1. **Poser le réglage AVANT le chargement du widget**, dans la page qui l'héberge (avant la balise
   `<script type="module" src=".../main.js">`) :
   ```html
   <script>window.FORMPLUS_ENABLE_MAP = true;</script>
   ```
2. **Autoriser en CSP** (ou équivalent liste blanche réseau) :
   - le script `https://unpkg.com/leaflet@1.9.4/dist/leaflet.js` et la feuille de style
     `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` (`script-src`/`style-src`) — ou héberger ces
     deux fichiers soi-même et changer `LEAFLET_CDN_URL`/`LEAFLET_CDN_CSS` dans `poc/js/kinds.js` ;
   - les tuiles `https://*.tile.openstreetmap.org` (`img-src`, et `connect-src` si la CSP distingue
     les deux).

Rien d'autre à faire côté Grist : la colonne de destination reste une colonne Texte ordinaire,
comme pour tout autre type de question texte libre.

## Où c'est implémenté

- `poc/js/kinds.js` : `mapFeatureEnabled()`, `LEAFLET_CDN_URL`, `LEAFLET_CDN_CSS`.
- `poc/js/config-editor.js` : bouton de type grisé quand désactivé (`wireKindSelector`).
- `poc/js/respond.js` : rendu (carte réelle ou repli texte) et chargement à la demande
  (`renderExtraQuestion`, `wireMaps`, `loadLeaflet`).
