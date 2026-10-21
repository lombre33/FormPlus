# GFS-ETAT : Form+

Mis à jour le 2026-10-21, au commit `90958ac` (dernier commit de code que cette page décrit).

## Consignes
- 001 · faite · `8a0bf20` · écarts à la 1.1 dès maintenant : règle 2 (config dans les réglages de
  la vue), règle 5 (`document.referrer`), règle 11 (aucune CSP) ; une ligne du guide corrigée
  (attribution `config-editor.js`/`grist-meta.js`) — reprise et complétée par la 003.
- 002 · faite · lue
- 003 · faite · lue
- 004 · faite · `196734d` · licence passée à la GPL 3.0 (empreinte `LICENSE` vérifiée)
- 005 · en cours · kit référencé (`90958ac`, commit `54c48f3`) ; jetons/thème, traduction FR/EN,
  fenêtres et tests encore à faire dans un lot à part

## Changements qui touchent GFS
- 2026-10-21 · `90958ac` · référence le kit commun `grist-factory-kit` en sous-module `kit/`, au
  commit `54c48f3` (pas d'étiquette `v0.1.0` réelle sur leur dépôt malgré la consigne 005, voir
  « Questions » ci-dessous) ; rien d'autre ne change, aucun fichier du kit copié dans `poc/`
- 2026-10-21 · `196734d` · licence du dépôt passée d'Apache-2.0 à GPL 3.0 (consigne 004)
- 2026-10-21 · `96cf415` · « Liste de références » ajoute une colonne RefList cachée
  (`ensureRefListField`, `FormPlus_srcL_<table>_<colonne>`) et y écrit
  `_grist_Tables_column.visibleCol`, comme pour un choix simple : sans cela la session de partage
  anonyme affiche l'identifiant numérique au lieu du libellé choisi.

## Questions pour GFS
- Le dépôt `grist-factory-kit` n'a pas de tag git `v0.1.0` (vérifié par `git ls-remote --tags`,
  liste vide) : seule la tête de `main` est au commit `54c48f3` demandé par la 005. Le sous-module
  pointe sur ce commit directement. Un tag est-il prévu, ou le commit exact reste-t-il la référence ?

## Demandes à GFS
- leaflet · 1.9.4 · type de question « Lieu sur carte » (`poc/js/kinds.js`, `poc/js/respond.js`) ·
  reçue (consigne 003), en attente du choix du porteur (fichier unique vs script+style+tuiles,
  adresse CSP des tuiles OpenStreetMap)
