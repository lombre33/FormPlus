# GFS-ETAT : Form+

Mis à jour le 2026-10-22, au commit `c249c4a` (dernier commit de code que cette page décrit).

## Consignes
- 008 · faite · `c249c4a` · ta page du 21/10 (soir) répondue point par point :
  1. **L'enregistrement qui ne passait pas.** `ensureFormulairesTable`/`ensureTableGate` posait sa
     section de garde pour `FormPlus_Formulaires` sur la page du WIDGET (`widgetPage`), qui recharge
     ce cadre dès que la section est créée - exactement le fait que ta page donnait. Corrigé : la
     section de garde se pose maintenant sur la page du FORMULAIRE NATIF
     (`state.currentFormSection.viewRef`, le même repère déjà utilisé pour les tables secondaires
     d'une question "Choix depuis une table") - elle ne recharge jamais le cadre du widget, et
     réutilise la clé de partage déjà posée par le bouton natif "Publier" sur cette page (jamais
     republiée à la main). Un second "Générer" retrouve la section déjà publiée, n'en pose jamais
     une de plus.
  2. **Une ligne par formulaire.** `saveFormDefinition` retrouvait sa ligne par `IdSectionWidget`
     (la section qui héberge CE widget) : dans GFS, toutes les instances de Form+ partagent la
     MÊME section hôte, donc un second formulaire réécrivait la ligne du premier. Corrigé : la
     ligne se retrouve maintenant par `Definition.vsId` (propre à chaque formulaire, dans GFS comme
     hors GFS), mis en cache (`state.formRowVsId`/`formRowTitle`) pour ne rescanner la table qu'au
     changement de formulaire. `IdSectionWidget` reste écrit (diagnostic, repli hors GFS) mais ne
     sert plus à choisir la ligne. 2 formulaires faits dans GFS ont maintenant 2 lignes
     indépendantes, testé hors ligne (`tests.js`, groupe "une section hôte partagée (GFS) donne
     quand même une ligne par formulaire").
  3. **Les répondants, mesuré sur un vrai Grist** (Docker `gristlabs/grist:latest`, site d'équipe,
     document réel, formulaire publié, lien de partage réel - jamais grist-static) : ta lecture du
     code de Grist est confirmée à la lettre. Une session de partage anonyme qui lit
     `FormPlus_Formulaires` (table ou REST `/api/s/<clé>/tables/.../records`) reçoit `{"records":
     []}` quelle que soit la ligne existante (restreint à `rec.id==0`) ; la même session PEUT y
     ajouter une ligne quelconque, toutes colonnes, par un simple `POST .../records` - vérifié en
     injectant une ligne factice, relue ensuite côté concepteur. `ensureTableGate` sur cette table
     n'apportait donc aucun bénéfice (ni le 007 ni le 008 n'en ont profité), seulement ce risque :
     **retirée** (plus de portillon posé pour `FormPlus_Formulaires`). À la place,
     `ensureRespondentDefinitionField` (`grist-meta.js`) pose une colonne Référence CACHÉE
     (`FormPlusDef`) sur la table cible du formulaire natif, vers `FormPlus_Formulaires`, affichant
     sa colonne `Definition`, ajoutée comme champ masqué (`formIsHidden`) sur la section publiée -
     exactement le mécanisme déjà utilisé pour "Choix depuis une table" (`ensureChoiceField`), déjà
     éprouvé : Grist expose alors son `refValues` (les lignes de la table visée, avec leur colonne
     affichée) dans la réponse PUBLIQUE de `/forms/<clé>/<section>`, jamais par une lecture de table.
     Vérifié en conditions réelles sur le Grist Docker : un champ caché `FormPlusDef` posé à la main
     sur le formulaire natif `Reponses`, pointant vers `FormPlus_Formulaires` (affichage `Definition`)
     rend bien la Définition complète de la ligne existante, en anonyme, via ce `refValues` - la
     même chose que fait désormais `respond.js` (`renderFill`) pour construire l'écran répondant.
     La ligne qu'un visiteur ajouterait toujours (point 2 ci-dessus, `+C`) n'apparaît elle jamais
     dans l'explorateur de GFS pour autant qu'il liste par la Définition qu'il lit, pas par une
     simple présence de ligne - à confirmer de ton côté si l'explorateur affiche autre chose qu'une
     ligne avec Definition correctement formée.
  4. **Une ligne par formulaire, reste de ton point 4** : la porte "ouvrir" (consigne 010,
     `GfsLink.opening()`/`fichier.id`) donne maintenant l'identifiant de ligne à ouvrir - voir 010.
  8. **Rangement/renommage par les fichiers de GFS** : voir 009.
- 009 · faite · `c249c4a` · `saveFormDefinition` ne met `Nom` dans son lot que pour une ligne tout
  juste créée (`AddRecord`), ou quand le titre (`formTitle`) a changé dans Form+ depuis la dernière
  lecture ou écriture (`state.formRowTitle`, comparé à la ligne existante au premier enregistrement
  d'une session) ; sinon `Nom` reste hors du lot. Le choix pris en attendant (le plus prudent, comme
  ta page le proposait) : le nom donné dans GFS reste celui du fichier, distinct du titre affiché
  aux répondants - renommer dans GFS ne change donc rien à ce qu'ils voient.
- 010 · faite · `c249c4a` · sous-module `kit/` à `c0c8660`. `GfsLink` (`poc/js/main.js`,
  `poc/js/links.js`) :
  - **Ouverture au démarrage** : `GfsLink.opening()?.fichier.id` (l'identifiant d'une ligne de
    `FormPlus_Formulaires`) charge directement cette Définition (`loadDefinitionByRowId`,
    `grist-meta.js`) et ouvre l'éditeur sur ce formulaire, à la place de l'écran de départ habituel.
  - **Double-clic pendant que Form+ tourne déjà** : `GfsLink.onOpen`. Form+ enregistre à chaque
    champ (pas de bouton "Enregistrer") : jamais de question "modifications en attente", on ouvre
    directement le nouveau formulaire (ou l'écran de départ pour "Nouveau").
  - **La langue** : choix pris, `GfsLink.onLanguage(() => location.reload())` - un rechargement
    plutôt qu'une retraduction en direct, trop de texte de Form+ passant par `I18n.t()` en dehors
    de `translateDom()` (messages, fenêtres du kit) pour garantir une reprise fidèle sans revue
    exhaustive de tout le code. Le formulaire ouvert avant le rechargement se retrouve lui-même
    (`GfsLink.storageGet('formplus_open_row')`, posé à chaque ouverture/enregistrement), puisqu'un
    cadre rechargé n'a plus d'ouverture à donner.
  - **Le thème** : la bascule envoie aussi `GfsLink.storageSet('formplus_theme', Theme.choice ===
    'system' ? null : Theme.choice)` ; au démarrage, `GfsLink.storageGet('formplus_theme')` est
    appliqué par `Theme.set` avant tout le reste.
  - **La page** : `myPageFromReferrer()` (`links.js`) retombe sur `GfsLink.context()?.page` quand
    le référent ne la donne pas - un seul point de repli, utilisé par les trois fonctions qui en
    dépendaient déjà (`findMyWidgetPage`, `findViewRefForSection`, `findMySection`).
  - Non mesuré de notre côté (pas d'accès à un vrai GFS) : à toi de rejouer `run-form`/tes propres
    essais avec ce commit.
- 011 · faite · `c249c4a` · `GfsLink.onBar` (appelé aussi une fois au démarrage avec `GfsLink.bar()`)
  pose quatre variables CSS (`--gfs-bar-top/bottom/left/right`, `0px` par défaut) sur `<html>`, lues
  par `.wrap` (`widget.css`) - le conteneur commun aux trois écrans (concepteur, répondant, départ),
  pour un seul point d'ajustement. Barre en haut : `zone.y + zone.hauteur` de marge en plus en haut
  (pousse tout sous la barre, onglets compris). Barre en bas : `epaisseur` en plus en bas (le
  rembourrage existant, 60px, garde déjà de la marge au défilement, l'addition la préserve). Barre à
  gauche/droite : `epaisseur + 8px` de ce côté. `bar === null` (explorateur ouvert, ou l'app seule)
  remet les quatre à 0. Non mesuré de notre côté (pas d'accès à un vrai GFS pour rejouer
  `run-barre-apps`) : à vérifier aux quatre bords avec ce commit.

## Consignes (001-007)
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
    **Corrigé par la 008** : mesuré sur un vrai Grist, ni l'un ni l'autre de ces deux mécanismes ne
    fonctionnait (`ensureTableGate` n'ouvre pas la lecture d'une session de partage, seulement
    l'ajout) — voir la 008 ci-dessus pour ce qui les remplace.
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
- 2026-10-22 · `c249c4a` (consignes 008-011, cette page) · sous-module `kit/` à `c0c8660` (010) ;
  plus de section de garde (`ensureTableGate`) pour `FormPlus_Formulaires` (008) ; une colonne
  Référence cachée `FormPlusDef` apparaît désormais sur la table cible de CHAQUE formulaire natif
  géré par Form+ (type `Ref:FormPlus_Formulaires`, affichage `Definition`, champ masqué sur la
  section publiée) — purement un détail d'implémentation côté répondant (008, point 3), jamais lue
  ni écrite par Form+ lui-même en dehors de ce mécanisme, sans lien avec les colonnes que lit le
  manifeste.
- 2026-10-21 · `02be13c` (fusion `652b156`) · mode interne : réglage par formulaire + réservation
  par question, table `FormPlus_Repondants` (identité du répondant via `user.Email`, colonne à
  formule — capacité `formules` du contrat GFS, accord de la personne à la création), jamais
  utilisée pour le lien public anonyme.
- 2026-10-21 · `aa13d26` puis `85ac56d` · CSP de `widget.html` : `script-src` autorise à nouveau
  `https://docs.getgrist.com`, d'où `plugin-loader.js` fait venir le script d'API de Grist en repli
  dès que l'origine qui héberge le widget n'est pas dans sa liste blanche — régression qui bloquait
  Form+ sur toute instance auto-hébergée, GFS compris, corrigée le jour même.
- 2026-10-21 · `00ad9d5` · le lien public ne montre plus jamais l'écran de configuration à un
  visiteur externe réel (`main.js`).
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
