# Tests

Point d'entrée unique pour tout ce qui touche aux tests de FormPlus.

## Suite de non-régression du widget

`poc/widget.html#test` exécute ~184 vérifications hors ligne (aucune requête
réseau, `grist.docApi` et `fetch()` simulés) sur le code de `poc/js/` :
fonctions pures, chaque type de question, import des champs natifs,
réinitialisation, création d'un formulaire vide, construction des champs
envoyés à l'API. Détail du contenu et de l'organisation en modules :
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
`tests/grist-env/start-grist-test.sh`. Détails, écarts constatés avec
l'instance DINUM et nettoyage : [`tests/grist-env/README.md`](grist-env/README.md).

## Tests manuels côté transport (POC)

`poc/poc_transport1.py` — script en ligne de commande qui vérifie la lecture
et l'écriture d'un formulaire publié via sa clé de partage (transport 1),
contre une vraie instance Grist. Reste dans `poc/` avec le reste de la
documentation du POC ; usage détaillé dans
[`poc/README-poc.md`](../poc/README-poc.md), sections 3 et 6.
