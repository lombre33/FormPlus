# GFS-ETAT : Form+

Mis à jour le 2026-10-21, au commit `39e0740` (dernier commit de code que cette page décrit).

## Consignes
- 001 · faite · `8a0bf20` · écarts à la 1.1 dès maintenant : règle 2 (config dans les réglages de
  la vue), règle 5 (`document.referrer`), règle 11 (aucune CSP) ; une ligne du guide corrigée
  (attribution `config-editor.js`/`grist-meta.js`) — reprise et complétée par la 003.
- 002 · faite · lue
- 003 · faite · lue
- 004 · faite · `196734d` · licence passée à la GPL 3.0 (empreinte `LICENSE` vérifiée)
- 005 · faite · `90958ac`…`952fe4c` · kit référencé et pleinement intégré : jetons de charte et
  fenêtres du kit sur tout le widget, thème délégué à `Theme`, traduction FR/EN complète de
  l'interface (designer et répondant) via `I18n`, `Dialogs` du kit à la place de `prompt()`/
  `confirm()`. Tests : 542/542 verts, rejoués en entier en `fr-FR` et en `en-US`
  (`.github/scripts/run-widget-tests.js`), et désormais mis en échec par tout `console.warn` (pas
  seulement `console.error`) pour attraper un double chargement du kit, une clé i18n inconnue,
  redéfinie ou manquante — exactement les risques listés par la 005. Vérification manuelle sur un
  vrai Grist local (écran répondant, thème clair/sombre, FR/EN, fenêtre 700×400) : rendu et bascule
  de thème corrects, zéro erreur/avertissement console, contre un vrai formulaire natif publié.
  L'écran concepteur (`#config`/`#editor`) reste hors de portée de cette vérification précise :
  ce bac à sable cloud bloque `docs.getgrist.com`, d'où `grist-plugin-api.js` est chargé — mais il
  est déjà couvert par les 542 tests automatisés (API Grist simulée, mêmes deux langues).
- 006 · faite · lue · GFS a relu et mesuré la 005 dans un vrai Grist (grist-static, écran
  concepteur inclus, 25 vérifications × 4 combinaisons thème/langue, aucun échec) : merci. Erreur
  de la 005 sur l'étiquette `v0.1.0` du kit corrigée par GFS (le dépôt n'en a pas, la référence
  reste le commit `54c48f3`, rien à bouger chez nous) — question retirée ci-dessous. Les deux
  dernières couleurs en dur de `widget.css` (`.toggle-thumb`, `.pv-q`) remplacées par
  `--shadow-card`/`--shadow-float` du kit, commit `39e0740`.

## Changements qui touchent GFS
- 2026-10-21 · `90958ac` · référence le kit commun `grist-factory-kit` en sous-module `kit/`, au
  commit `54c48f3` (pas d'étiquette `v0.1.0` réelle sur leur dépôt malgré la consigne 005, voir
  « Questions » ci-dessous) ; rien d'autre ne change, aucun fichier du kit copié dans `poc/`
- 2026-10-21 · `196734d` · licence du dépôt passée d'Apache-2.0 à GPL 3.0 (consigne 004)
- 2026-10-21 · `7f75d83`…`952fe4c` (consigne 005) · `kit/css/tokens.css` et `kit/css/windows.css`
  chargés dans `widget.html`, remplacent la palette propre de FormPlus ; `poc/js/theme.js` délègue
  l'état clair/sombre à `Theme` du kit (la couleur d'accent personnalisée reste posée sur `#fill`
  uniquement, jamais sur `<html>` — testé) ; tout le texte d'interface (designer et répondant) passe
  par `I18n` du kit (`poc/js/strings.js`, ~150 clés `form.*`) ; `window.prompt()`/`confirm()`
  remplacés par `Dialogs.prompt()`/`Dialogs.confirm()` du kit.
- 2026-10-21 · `39e0740` (consigne 006) · `.toggle-thumb` et `.pv-q` (`poc/css/widget.css`)
  passent de couleurs en dur à `--shadow-card`/`--shadow-float` du kit ; plus aucune couleur en dur
  dans `widget.css` hors `#qrCanvas`
- 2026-10-21 · `96cf415` · « Liste de références » ajoute une colonne RefList cachée
  (`ensureRefListField`, `FormPlus_srcL_<table>_<colonne>`) et y écrit
  `_grist_Tables_column.visibleCol`, comme pour un choix simple : sans cela la session de partage
  anonyme affiche l'identifiant numérique au lieu du libellé choisi.

## Questions pour GFS
(aucune en attente)

## Demandes à GFS
- leaflet · 1.9.4 · type de question « Lieu sur carte » (`poc/js/kinds.js`, `poc/js/respond.js`) ·
  en attente de l'entrée de Form+ dans GFS (décision du porteur, consigne 006) ; d'ici là, le
  chargement autonome (`window.FORMPLUS_ENABLE_MAP`, unpkg) reste le mécanisme hors GFS
