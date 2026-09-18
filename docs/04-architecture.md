# Architecture du widget (état réel du code, 18 septembre 2026)

Ce document décrit ce que fait `poc/widget.html` et les modules sous `poc/js/`, pas ce qui était
envisagé. La feuille de route (`03-roadmap-priorites.md`) avait annoncé TypeScript, Vite et une
table `FormBuilder_Forms` : rien de tout cela n'existe. Le widget est un ensemble de modules
JavaScript natifs (ES modules), sans build, sans dépendance à installer, servis tels quels par
GitHub Pages. Ce document remplace cette annonce par ce qui est réellement en place.

## Pourquoi pas de build

Le widget est chargé par Grist comme URL personnalisée : un lien statique, sans étape de
compilation possible côté hébergeur (GitHub Pages sert des fichiers, rien de plus). Ajouter Vite
ou TypeScript demanderait une étape de build avant chaque déploiement, un risque de complexité
sans bénéfice mesurable pour un widget qui reste sous 3000 lignes au total. Les modules ES
natifs (`<script type="module">`, `import`/`export`) offrent déjà l'organisation en fichiers
sans cette étape : c'est le compromis retenu ici.

## Un fichier, deux écrans

`poc/widget.html` est le point d'entrée unique, chargé deux fois par Grist selon le contexte :

- **Écran de configuration** (concepteur, accès complet) : coller le lien du formulaire natif
  publié, régler les questions supplémentaires, l'apparence, obtenir l'adresse à diffuser.
- **Écran répondant** (`renderFill`) : lit `/forms/<clé>/<section>` via l'API REST anonyme,
  affiche les champs natifs puis les questions supplémentaires, valide et envoie.

Le mode dépend des options déjà enregistrées (`options.formLink` présent ou non) et du fragment
d'URL : `#test` (suite de tests), `#repair` (réparation d'une configuration corrompue), `#form=`
(secours hors iframe). Voir `poc/README-poc.md` pour le détail de chaque mode.

## Modules (`poc/js/`)

Un rôle par fichier, chargé depuis `main.js` (le seul `<script type="module">` de la page) :

| Module | Rôle |
|---|---|
| `dom.js` | `$`, `esc`, `uid`, `show`, `cssEsc` — utilitaires DOM sans état |
| `icons.js` | Icônes SVG en ligne, aucune dépendance externe |
| `kinds.js` | Types de question (`KINDS`), ensembles `LAYOUT_KINDS`/`SINGLE_CHOICE_KINDS` |
| `theme.js` | Thème clair/sombre du répondant, couleur d'accent personnalisée |
| `links.js` | Analyse du lien de formulaire, décodage des options stockées, migration de l'ancien format |
| `diag.js` | Journal de diagnostic affiché dans les écrans (`#diag`, `#diag-fill`) |
| `state.js` | État mutable partagé entre l'écran de configuration et le rendu répondant (un seul objet, voir plus bas) |
| `grist-meta.js` | Lecture des métadonnées du document (`_grist_Views_section`, `_grist_Shares`…), `ensureTableGate`, `ensureChoiceField`, `probeCanEdit`, `runRepair` |
| `config-editor.js` | Tout l'écran de configuration : questions, apparence, import des champs natifs |
| `respond.js` | Tout le rendu répondant : champs natifs et questions supplémentaires, soumission |
| `plugin-loader.js` | Charge `grist-plugin-api.js` depuis l'origine qui héberge le widget |
| `tests.js` | Suite de non-régression (`#test`), voir plus bas |
| `main.js` | Icônes des boutons statiques, thème initial, démarrage (`grist.ready`, choix de l'écran) |

`config-editor.js` importe `renderFill` de `respond.js` (pour le bouton « Voir le formulaire ») ;
la dépendance ne va jamais dans l'autre sens, le rendu répondant n'a pas besoin de l'éditeur.

### L'état partagé (`state.js`)

Le fichier d'origine gardait tout dans des variables `let` au niveau du script : `options`,
`cfgQuestions`, `currentLink`, etc., lues et modifiées par des dizaines de fonctions. Séparer ces
fonctions en modules sans réécrire leur logique interne demandait un point d'ancrage commun :
`state.js` exporte un seul objet mutable (`state.options`, `state.cfgQuestions`, …), importé par
tout module qui en a besoin. Un module JS ne peut pas exporter une variable primitive qu'un autre
modifierait et verrait changer ; un objet partagé, si.

### Où vit la configuration

Aucune table `FormBuilder_Forms`. La définition (lien du formulaire, questions, apparence) est
sérialisée en JSON et stockée dans `_grist_Views_section.options.customView.widgetOptions` — les
options de la section qui porte LE WIDGET LUI-MÊME, pas une table du document. C'est ce qui
permet à `persistOptions` de rendre la configuration visible à toute session (y compris anonyme)
sans dépendre de `grist.setOptions` (qui ne modifie que la session du concepteur). C'est aussi ce
qui a rendu nécessaires les deux outils de réparation (`#repair` et `poc/repair_section_options.py`) :
une valeur mal sérialisée à cet endroit précis casse le chargement de toute la page Grist qui
porte le widget, pas seulement le widget.

## Pourquoi `poc/` et `widget.html` gardent leur nom et leur emplacement

Le dossier `poc/` et le fichier `widget.html` ne sont plus une preuve de concept au sens propre,
mais leur adresse (`https://lombre33.github.io/FormPlus/poc/widget.html`) est déjà collée en URL
personnalisée dans des documents Grist existants, et `myPageFromReferrer` (dans `links.js`)
détecte la page du widget à partir de cette même adresse. Un renommage casserait ces widgets sans
avertissement pour leurs concepteurs. Le nom reste pour cette raison, pas par oubli.

## Suite de tests (`poc/js/tests.js`)

Suite hors ligne, sans document Grist réel : `grist.docApi` et `fetch()` sont simulés à
l'intérieur même du test, jamais de vraie requête réseau. Ouvrir `widget.html#test` (ou lancer
`.github/workflows/tests.yml`, voir plus bas) exécute environ 184 vérifications couvrant les
fonctions pures, chaque type de question, l'import des champs natifs, la réinitialisation, la
création d'un formulaire vide et la construction des champs envoyés à l'API à la soumission.

Le fichier exécute les fonctions des autres modules directement (imports ES), plutôt que de
compter sur une portée de script partagée comme dans l'ancien fichier unique : chaque fonction
testée est donc explicitement exportée par son module, ce qui rend aussi la surface publique de
chaque module explicite.

## Intégration continue

`.github/workflows/tests.yml` relance cette suite (Playwright + Chromium headless) à chaque push
et pull request, et échoue si un test régresse — voir ce fichier pour le détail.
