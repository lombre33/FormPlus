# GFS-ETAT : Form+

Mis à jour le 2026-10-21, au commit `038dd1b` (dernier commit de code que cette page décrit).

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
- 007 · faite · `038dd1b` · la définition de chaque formulaire vit maintenant dans une table
  du document, **`FormPlus_Formulaires`**, une ligne par formulaire, colonnes :
  - `Nom` (Text) — le titre du formulaire.
  - `TypeFormulaire` (Text) — toujours `formulaire` (le manifeste).
  - `DateModif` (DateTime) — horodatage de la dernière sauvegarde, en secondes.
  - `ModifiePar` (Text) — toujours `Form+` aujourd'hui : aucune méthode de l'API plugin ne rend
    l'identité de la personne connectée (vérifié dans `prototype/js/demo.js`,
    `prototype/labo/run-form.mjs` : même GFS n'a qu'un nom statique). Dès qu'un client du courtier
    l'expose (point 4 de la 007), cette colonne prendra la vraie identité.
  - `Definition` (Text) — la définition entière en JSON, ce que `persistOptions` mettait avant dans
    `customView.widgetOptions`. GFS ne lit que les quatre colonnes ci-dessus, celle-ci reste
    opaque pour lui. Exemple (formulaire d'inscription à 2 questions supplémentaires) :
    ```json
    {
      "formLink": "https://grist.exemple.org/o/equipe/forms/AbCdEf123456/18",
      "vsId": 42, "sourceVsId": 18, "viewRef": 9,
      "publicUrl": "https://grist.exemple.org/o/equipe/s/AbCdEf123456/p/9?style=singlePage",
      "formTitle": "Inscription à la formation", "formDescription": "",
      "questions": [
        { "id": "q1", "kind": "text", "label": "Allergie alimentaire", "writeTable": "Reponses", "writeCol": "Allergie" },
        { "id": "q2", "kind": "choice", "label": "Repas", "sourceTable": "Menus", "sourceCol": "Nom" }
      ]
    }
    ```
    `vsId` est l'id de la section de formulaire natif que FormPlus a dupliquée pour ce formulaire
    (déjà présent avant la 007) : c'est la clé de jointure réutilisée par les répondants (ci-dessous).
  - `IdSectionWidget` (Numeric) — colonne propre à Form+, au-delà des quatre que lit le manifeste
    (« si tu veux d'autres colonnes, dis-le dans ta page ») : l'id de la section PERSONNALISÉE qui
    héberge ce widget-ci (`parentKey='custom'`, jamais le formulaire natif). Sert uniquement à
    cette instance du widget pour retrouver sa propre ligne à la réouverture
    (`resolveMyDefinition`/`findMySection`, `grist-meta.js`), sans dépendre de
    `grist.onOptions()`/`getOptions()` (confirmés inopérants dans GFS par la mesure de la 007).
  - **Comment les répondants la lisent** : l'adresse publique donnée au répondant
    (`buildPublicUrl`) est une page Grist en session de partage (`/s/<clé>/p/<page>`) qui héberge CE
    MÊME widget — le répondant est donc, de son point de vue, "dans" le widget comme le
    concepteur, et `resolveMyDefinition()` (même mécanisme, même `IdSectionWidget`) lui sert
    directement sa Definition ; `ensureTableGate` (déjà utilisé pour toute autre table lue par une
    question "Choix depuis une table") ouvre la lecture de `FormPlus_Formulaires` à cette session
    de partage de la même façon. Pour le secours hors Grist (`#form=<lien>`,
    `poc/public-form.html`, pas de session Grist du tout) : `renderFill()` (`respond.js`) fait un
    `fetch` direct de l'API REST du partage (`<api>/tables/FormPlus_Formulaires/records`, la même
    déjà utilisée pour l'envoi des réponses) et retient la ligne dont `Definition.vsId` correspond
    au `vsId` du lien ouvert — avant la 007, ce secours n'affichait jamais les questions
    supplémentaires (écart connu de l'audit du 21 oct), c'est désormais corrigé.
  - **Aucune clé de réglage de vue** n'a été nécessaire (point 4 de la 007) : `IdSectionWidget`
    suffit, rien à déclarer côté GFS pour ce pas-ci.
  - Plus écrit : `persistOptions`, le marqueur de copie (`formplusDuplicate`/`formplusSource`,
    remplacé par une comparaison aux `Definition.vsId` déjà enregistrés, `fetchManagedVsIds`), la
    réparation (`#repair`, retirée du widget — `poc/repair_section_options.py` reste disponible en
    dehors de Grist pour un formulaire pas encore migré). Plus lu : `_grist_Shares`
    (`findExistingShareKey` retirée ; choisir un formulaire natif publié dans la liste affiche
    maintenant une consigne de copier son lien, au lieu d'une adresse reconstruite). Les
    formulaires faits avant la 007 restent lisibles (`options` toujours lu en repli,
    `resolveMyDefinition`) et migrent vers la table à leur prochain enregistrement, avec le même
    consentement que pour un document qui n'a encore aucun formulaire FormPlus.

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
- 2026-10-21 · `038dd1b` (consigne 007) · plus aucune écriture dans
  `_grist_Views_section.options` ni lecture de `_grist_Shares` : la définition de chaque
  formulaire vit dans la table du document `FormPlus_Formulaires` (une ligne par formulaire,
  colonnes et détail dans « Consignes » ci-dessus), créée avec l'accord de la personne (fenêtre du
  kit) et ouverte en lecture aux sessions de partage par `ensureTableGate`, déjà utilisé pour toute
  autre table lue par une question "Choix depuis une table".

## Questions pour GFS
(aucune en attente)

## Demandes à GFS
- leaflet · 1.9.4 · type de question « Lieu sur carte » (`poc/js/kinds.js`, `poc/js/respond.js`) ·
  en attente de l'entrée de Form+ dans GFS (décision du porteur, consigne 006) ; d'ici là, le
  chargement autonome (`window.FORMPLUS_ENABLE_MAP`, unpkg) reste le mécanisme hors GFS
