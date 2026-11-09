# Tests

Point d'entrée unique pour tout ce qui touche aux tests de FormPlus.

## Suite de non-régression du widget

`poc/widget.html#test` exécute ~336 vérifications hors ligne (aucune requête
réseau, `grist.docApi` et `fetch()` simulés) sur le code de `poc/js/` :
fonctions pures, chaque type de question, conditions d'affichage combinées en
ET/OU et ouvertes à tous les types de question source, import des champs
natifs, réinitialisation, création d'un formulaire vide, une question « Choix
depuis une table » écrivant dans une autre table, construction des champs
envoyés à l'API (y compris les pièces jointes). Détail du contenu et de
l'organisation en modules :
[`docs/04-architecture.md`](../docs/04-architecture.md), section « Suite de
tests ».

- **À la main** : ouvrir `poc/widget.html#test` dans un navigateur (servir le
  dossier en HTTP, `file://` ne suffit pas — `poc/qrcode.js` est chargé en
  relatif).
- **En continu** : [`.github/workflows/tests.yml`](../.github/workflows/tests.yml)
  relance cette suite (Playwright + Chromium headless, via
  [`.github/scripts/run-widget-tests.js`](../.github/scripts/run-widget-tests.js))
  à chaque push et pull request.

Cette suite ne touche jamais un document Grist réel : elle valide le code du
widget seul, pas son comportement face à un vrai serveur.

## Environnement de test contre un vrai Grist

[`tests/grist-env/`](grist-env/) — un Grist auto-hébergé (Docker), avec un
document de test prêt à l'emploi, pour vérifier le widget en conditions
réelles (installation en widget personnalisé, publication de formulaire,
écriture anonyme via la clé de partage) sans dépendre de la machine
d'Antoine ni de l'instance DINUM. Démarrage en une commande :
`tests/grist-env/start-grist-test.sh`. Le parcours complet de création d'un formulaire (guide de publication, publication par Form+, page ouverte, Copier le lien, collage au vrai clavier, reprise après rechargement) se rejoue avec `NODE_PATH=$(npm root -g) node tests/grist-env/e2e-onboarding.js` une fois Grist démarré ; `e2e-build-first.js` rejoue la construction d'un formulaire avant son lien (brouillon, bandeau de rappel, publication puis collage plus tard, réponse d'un visiteur anonyme) ; `probe-share-key.js` (même banc) vérifie qu'aucune voie ne laisse un widget lire la clé de partage lui-même (il faut donc la faire copier à la personne). Détails, écarts constatés avec
l'instance DINUM et nettoyage : [`tests/grist-env/README.md`](grist-env/README.md).

## Vérifier que le site en ligne sert bien le lot qui vient d'être poussé

À chaque lot poussé sur `main`, après les ~10 minutes de cache de GitHub
Pages : (a) le run « pages build and deployment » de l'onglet Actions du
dépôt est vert ; (b) un détail visible du lot (une chaîne, un texte d'erreur,
un comportement nouveau) se retrouve bien sur
`https://lombre33.github.io/FormPlus/poc/widget.html`, pas seulement dans le
code poussé. Sans le fichier `.nojekyll` à la racine, une accolade double non
fermée dans un `.md` du dépôt (GitHub Pages passe tout par Jekyll par défaut)
fait échouer la publication en silence et le site reste sur une version
précédente sans rien montrer. Détail et origine de cette consigne :
`consignes/form/014-ton-site-en-ligne-reste-publie.md` dans
`lombre33/grist-widget-GFS`.

## Tests manuels côté transport (POC)

`poc/poc_transport1.py` — script en ligne de commande qui vérifie la lecture
et l'écriture d'un formulaire publié via sa clé de partage (transport 1),
contre une vraie instance Grist. Reste dans `poc/` avec le reste de la
documentation du POC ; usage détaillé dans
[`poc/README-poc.md`](../poc/README-poc.md), sections 3 et 6.
