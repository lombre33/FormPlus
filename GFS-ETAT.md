# GFS-ETAT : Form+

Mis à jour le 2026-10-21, au commit `8a0bf20` (dernier commit de code que cette page décrit).

## Consignes
- 001 · faite · `8a0bf20` · écarts à la 1.1 : règle 2 (la config du formulaire vit dans les réglages
  de la vue, `grist.setOptions`, pas dans une table préfixée), règle 5 (`document.referrer` lu par 2
  fonctions distinctes, `poc/js/links.js`), règle 11 (aucune CSP). Ligne du guide à corriger :
  l'écriture de `_grist_Views_section` n'est pas dans `poc/js/config-editor.js` mais dans
  `poc/js/grist-meta.js` (vérifié au commit relevé `b073d03` comme au code actuel) ; les lignes
  1017/1064 citées ont bougé avec les lots suivants (dérive naturelle, pas un écart de fond).
- 002 · faite · lue

## Changements qui touchent GFS
- 2026-10-21 · `96cf415` · la question « Liste de références » ajoute une colonne RefList cachée
  (`ensureRefListField`, `FormPlus_srcL_<table>_<colonne>`) et y écrit `_grist_Tables_column.visibleCol`,
  comme pour un choix simple (`ensureChoiceField`) : sans cela la session de partage anonyme affiche
  l'identifiant numérique au lieu du libellé choisi (`ACLRulesReader._shareTableReferencesForForm`).

## Questions pour GFS
- Le type « Lieu sur carte » (Leaflet, voir Demandes ci-dessous) est aujourd'hui activé par un
  réglage posé par la page hôte (`window.FORMPLUS_ENABLE_MAP`), avec une adresse CDN et une CSP que
  Form+ fixe lui-même (`docs/06-carte-interactive.md`). En attendant votre réponse à la demande,
  peut-on garder ce mécanisme autonome tel quel, ou faut-il le suspendre/changer avant que l'adresse
  ne vienne de votre catalogue ?
- Les écritures `_grist_Views_section_field` (masquer un champ natif importé) et
  `_grist_Views_section.shareOptions` (ouvrir le partage d'une table liée) existent depuis plusieurs
  lots et ont leur raison en commentaire dans le code, mais ne sont déclarées nulle part côté GFS
  (pas de `gfs.json`) : cela attend bien l'étape 5 comme le dit la 002, ou faut-il déjà les lister
  quelque part d'ici là ?

## Demandes à GFS
- leaflet · 1.9.4 · type de question « Lieu sur carte » (`poc/js/kinds.js`, `poc/js/respond.js`) ·
  affiche un fond de carte OpenStreetMap cliquable pour poser un point (repli en champ texte
  « latitude, longitude » si absente)
