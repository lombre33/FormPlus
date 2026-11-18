# Environnement de test : Grist auto-hébergé pour FormPlus

Un Grist complet (image officielle `gristlabs/grist`), lancé en conteneur,
avec un document de test prêt à l'emploi pour `poc/widget.html`. Pensé pour
une session sans accès à la machine d'Antoine ni à l'instance DINUM.

Ceci complète la suite de non-régression interne du widget (voir
`../README.md`) : cette dernière est hors ligne et ne touche jamais un vrai
document Grist ; l'environnement ci-dessous sert à vérifier le widget contre
un serveur Grist réel (installation, lecture/écriture, partage anonyme).

## Démarrage en une commande

```bash
tests/grist-env/start-grist-test.sh
```

Relançable tel quel dans une nouvelle session : le script est idempotent
(recrée le conteneur, réutilise ou crée le site d'équipe et le document de
test). Ports par défaut : `8484` pour Grist, `8010` pour le widget (servi
par `python3 -m http.server` depuis la racine du dépôt). Les deux se
changent en arguments : `tests/grist-env/start-grist-test.sh 8484 8010`.

À la fin, le script affiche :
- l'adresse de l'interface Grist, déjà connectée (`http://localhost:8484/o/formplus-test`) ;
- le chemin d'un fichier JSON (`~/.formplus-grist-test/grist-test-doc.json`)
  qui liste les adresses des formulaires publiés et du widget.

## Prérequis

- Docker, avec le démon lancé (`sudo dockerd &` si besoin dans une session
  Claude Code — il n'est pas démarré par défaut).
- Accès réseau sortant à un registre d'images. Docker Hub est bloqué par la
  politique réseau de certains environnements (403 sur
  `production.cloudfront.docker.com`) ; le script bascule automatiquement
  sur le miroir public `mirror.gcr.io`.

## Ce que le script met en place

1. **Le conteneur Grist**, avec :
   - `GRIST_TEST_LOGIN=1` : ajoute `/test/login`, une connexion sans mot de
     passe ni fournisseur d'identité externe, réservée au développement.
   - `GRIST_ORG_IN_PATH=true` : les sites Grist s'adressent par chemin
     (`/o/<site>/...`) plutôt que par sous-domaine, plus simple sans DNS.
   - Les données persistent dans `~/.formplus-grist-test/grist-data`
     (bind-mount), donc un `docker rm` du conteneur ne perd rien.
2. **Un site d'équipe** (`formplus-test`), pas le site personnel : seul un
   site d'équipe autorise l'accès anonyme aux liens de partage. Sur le site
   personnel, les adresses `/forms/...` et `/s/...` renvoient un 403/404
   même avec un formulaire correctement publié.
3. **Le document `POC Form Builder`**, recréé à chaque exécution avec les
   5 tables décrites dans `../../poc/README-poc.md` (section 1) :
   `Departements`, `Villes`, `Formulaires`, `Reponses`, `Enfants`, colonnes
   et données d'exemple comprises. Deux formulaires natifs publiés
   (`Reponses` + `Enfants` sur une page, `Formulaires` sur une autre, pour
   tester l'isolation des clés), plus une page dédiée qui ne porte que le
   widget FormPlus, comme documenté section 7.
4. **Le widget lui-même**, servi en HTTP local et ajouté comme widget
   personnalisé, accès complet, sur cette page dédiée.

Le script écrivant le document (`grist_test_doc.py`) parle directement
l'API REST Grist (aucune dépendance ajoutée) : création des tables et
colonnes, conversion en Référence après coup (la table cible doit exister
avant), quelques lignes, création des pages et sections de formulaire, puis
reproduction de l'action « Publier » du bouton natif (ajout d'une ligne dans
`_grist_Shares`, `shareRef` posé sur la page, `shareOptions` posées sur les
sections).

## Vérifié

- Le widget, ouvert en tant que concepteur (accès complet) dans Grist,
  détecte automatiquement le formulaire natif publié `Reponses` dans son
  sélecteur, sans coller de lien.
- Il génère une adresse à diffuser et l'enregistre dans le document
  (`Configuration enregistrée dans le document`).
- Côté API, en anonyme : la définition du formulaire (`GET
  /api/s/<clé>/forms/<section>`) renvoie les bons champs, les bonnes
  valeurs de référence, et masque bien `Interne` (absent du formulaire
  natif) tout en l'acceptant à l'écriture ; la création d'une réponse
  (`POST /api/s/<clé>/tables/Reponses/records`) réussit ; la lecture des
  réponses est refusée (valeurs censurées `["C"]`). Comportement conforme
  à `../../poc/README-poc.md`, section 3.
- Les en-têtes CORS (`Access-Control-Allow-Origin: *`) sont bien présents,
  donc une page hébergée ailleurs (GitHub Pages) peut appeler l'API.
- **Écran concepteur en iframe réel (21 oct 2026)** : testable avec Playwright
  directement contre ce conteneur, voir « Tester avec Playwright » ci-dessous.
  A révélé une vraie régression de CSP, corrigée le jour même (voir
  `docs/09-mode-interne.md` et le commit qui suit l'audit GWaudit du
  21 oct) : `widget.html` n'autorisait plus `docs.getgrist.com` en
  `script-src`, alors que `plugin-loader.js` en dépend comme repli dès que
  l'origine qui héberge le widget n'est pas dans sa liste blanche — donc sur
  **toute** instance auto-hébergée, y compris DINUM, pas seulement ici.
- **Mode interne, 2 identités réelles distinctes (21 oct 2026)** : `user.Email`
  (voir `grist-meta.js`, `probeRespondentIdentity`) résout bien l'adresse
  propre à CHAQUE session authentifiée (`/test/login`), jamais mélangée,
  jamais `anon@getgrist.com` pour une session réelle. Une question réservée
  à l'identité B, posée par l'identité A via l'éditeur réel : A ne la voit
  pas en répondant, B la voit. Détail et portée : `docs/09-mode-interne.md`.

## Parcours de création d'un formulaire, de bout en bout

`e2e-onboarding.js` rejoue, contre CE Grist, ce qu'une personne fait pour créer
un formulaire : « Partir de zéro », le guide de publication, « Publier le
formulaire » (Form+ publie lui-même, Grist montre ensuite la page publiée),
« Ouvrir la page » (nouvel onglet), Partager > Copier le lien, Ctrl+V dans le
widget (le lien vient du bouton de Grist lui-même, lu dans le presse-papiers),
fenêtre d'accord du kit, éditeur ; puis la variante « page cliquée dans la barre
latérale » (le widget se recharge, le guide est repris à l'étape 2, déjà publié). 21 contrôles,
code de sortie non nul au premier échec, captures dans le dossier donné en
argument. Le script retire lui-même les lignes de `FormPlus_Formulaires` pour la
variante (un widget qui a déjà un formulaire rouvre celui-ci) : le document de
test s'en trouve changé, `start-grist-test.sh` le recrée à neuf.

Mesures prises avec ce banc le 9 nov 2026, qui fondent le guide :
- `CreateViewSection(tref, 0, 'form', …)` nomme la page **« New page »** (en
  anglais, quelle que soit la langue de l'interface : `useractions.py`) et la
  range à la fin de la liste, juste sous la page de la table (`AddTable` en crée
  une, la grille) : c'est ce qui rendait le formulaire introuvable.
- Une page se renomme par `UpdateRecord _grist_Views <viewRef> {name}` ; Grist
  accepte deux pages de même nom.
- `/o/<site>/doc/<id>/p/<n>` ouvre la page (Grist complète l'adresse avec le
  nom du document) ; le référent du widget, lui, ne porte souvent que l'origine.
- Publier = 4 clics : Publier, confirmer (« Publier votre formulaire ? »),
  Partager, Copier le lien. La section reçoit alors
  `shareOptions = {"publish":true,"form":true}`, lisible par le widget.
- Dans GFS, un onglet ouvert depuis le cadre de l'app hérite de son bac à sable
  (origine nulle, stockage refusé, `contrats.md` 1.3 de GFS) : Grist n'y
  marcherait pas, d'où l'adresse à copier à la place du lien.

## Construire un formulaire AVANT d'avoir son lien (9 nov 2026)

`e2e-build-first.js` rejoue la demande d'Antoine « avancer sans coller le lien, avec un rappel qu'il n'est
pas publié », contre CE Grist : « Construire le formulaire d'abord » (rien n'est publié : aucune section
créée ne porte `publish`), éditeur en brouillon avec son bandeau, une question ajoutée et enregistrée
sans lien, onglet Paramètres sans adresse, aperçu (route du document), « Terminer la publication » puis
« Retour au formulaire », publication par le bandeau (la copie ET la section d'origine de la page, sinon
Grist y montre « Publier » au lieu de « Partager »), Partager > Copier le lien, collage dans le guide en
mode rattachement (aucune section de plus), puis **un visiteur anonyme** (autre contexte de navigateur)
répond par l'adresse à diffuser et sa réponse arrive dans la table ; enfin la variante « publier d'abord,
construire ensuite » (bandeau « il manque le lien »). 34 contrôles. Comme `e2e-onboarding.js`, il change le
document de test (`FormPlus_Formulaires` vidé au départ). Deux points de ce banc :
- **Lire le formulaire sans la clé** : `GET /api/docs/<doc>/forms/<section>` (même code côté Grist que la
  route de partage `/api/s/<clé>/forms/<section>`, mesuré identique) répond au widget avec le jeton de
  `getAccessToken` (`?auth=`). C'est ce qui permet de construire et de prévisualiser sans lien ; ce qui ne
  s'en passe pas : l'adresse à diffuser et l'envoi par un visiteur.
- **`bypassCSP: true`** pour les contextes Playwright (point 5 plus haut) : sans lui, la CSP du widget
  (`connect-src 'self' https:`) bloque ses appels au Grist de test en HTTP nu, y compris cette route.

## « Même lien que… » et le refus de la personne (consigne GFS 030, 17 nov 2026)

`e2e-same-link.js` rejoue contre CE Grist : un premier formulaire de bout en bout (publication par Form+,
Copier le lien, Ctrl+V), puis un second où la case « Même lien que… » est proposée **décochée** (avec son
prix dit dans la phrase), **cochée** elle publie sans étape de collage et le lien du second s'enregistre avec
la clé du premier. Mesuré ici (Grist 1.7.22) : la page du second reçoit le `shareRef` du premier (aucun
partage de plus), la clé du premier **ouvre les deux formulaires** (`GET /api/s/<clé>/forms/<section>` 200
pour chacun) et une réponse anonyme est écrite dans la table de chacun (jamais lue). Le refus de la
personne dans la fenêtre d'accord de GFS (qui n'existe pas dans ce banc) est joué en faisant lever par
l'API du widget l'erreur que GFS lève (`code: 'GFS_ANNULE'`) : le guide dit « Vous avez refusé », garde
le bouton, et le second clic reprend le partage déjà posé (branche « page déjà partagée »). Dernier point
mesuré : **« Dépublier » dans Grist, sur l'une ou l'autre des deux pages, passe l'unique partage à
`{"publish":false}` et les deux formulaires répondent 404** (même si la section de l'autre est restée
publiée) ; republier le partage (`_grist_Shares.options` = `{"publish":true}`) les rouvre. Une page de
formulaire porte DEUX sections (l'originale et la copie de Form+) donc deux boutons « Dépublier ». Deux
points de ce banc : `bypassCSP: true` (même raison que `e2e-build-first.js`) ; l'adresse d'une page
s'ouvre par `/o/<site>/doc/<id>/p/<n>` (la forme `/<id>/p/<n>` sans nom de document ne marche pas).
Comme les autres, il change le document de test (`FormPlus_Formulaires` vidé au départ).

## Un visiteur anonyme sur l'adresse à diffuser du parcours guidé (17 nov 2026)

`e2e-guided-visitor.js` rejoue le parcours guidé complet (« Partir de zéro », Publier, Copier le lien, Ctrl+V), ajoute
deux questions à la main, puis ouvre l'adresse à diffuser (`publicUrl`) dans un contexte vierge sans cookie : le
visiteur doit y voir **les deux questions** et le bouton « Envoyer », répondre, et sa réponse arrive dans la table ;
le concepteur connecté voit la même chose sur cette adresse. Le test vérifie d'abord la condition qui causait le bug :
la Definition garde le lien COLLÉ (section de départ) alors que `publicUrl` porte la COPIE gérée par Form+ (même clé,
autre numéro de section) — jamais égaux, d'où un formulaire public sans aucune question avant le correctif
(`optionsFromLink`, `respond.js`). Mesuré sur Grist 1.7.22 : rouge sans le correctif (« 0 questions affichées pour 2 »),
vert avec. `bypassCSP: true` comme les autres ; il vide `FormPlus_Formulaires` au départ.

## Les captures de la vitrine de GFS (consigne GFS 031, 17 nov 2026)

`vitrine/` (à la racine du dépôt) porte la description et les trois captures que GFS affiche sur la carte et la
fiche de Form+. Les images ne sont pas retouchées : `vitrine-captures.js` bâtit le formulaire d'exemple (« Retour
sur l'atelier », 5 questions) avec la vraie app dans un vrai Grist (Construire le formulaire d'abord, chaque
question ajoutée à la souris, publication par Form+, lien copié par le bouton de Grist, puis collé), pose six
réponses fictives sans nom de personne, et prend : 1 le formulaire tel que le voit un visiteur anonyme (celle qui
illustre la carte), 2 l'éditeur, 3 l'onglet Réponses. Chaque image est prise à deux fois la taille (la page de Grist
autour est masquée, dont sa bannière « Authentication is not enforced »), ramenée à 960 x 600 et écrite en WebP,
qualité baissée jusqu'à 60 Ko au plus (Pillow est requis). Le script vérifie que les questions enregistrées sont
celles saisies (libellé, type, obligatoire) avant de prendre quoi que ce soit.

```bash
# document NEUF (la table « Retours » ne doit pas exister) : grist_test_doc.py le supprime et le recrée
NODE_PATH=$(npm root -g) node tests/grist-env/vitrine-captures.js vitrine
```

`vitrine.json` (description, légendes, FR et EN) s'écrit à la main : le script ne le touche pas. Pour régénérer les
images après un changement d'apparence, relancer la commande puis redire la ligne « vitrine » à GFS (nouveau
commit dans `GFS-ETAT.md`).

## « Envoyer une autre réponse » sous la CSP réelle (17 nov 2026)

`e2e-send-another.js` : un visiteur anonyme ouvre un formulaire publié du document de test (`#form=` vers
`/forms/<clé>/<section Reponses>`), répond, clique sur « Envoyer une autre réponse » de l'écran de succès et doit
retrouver un formulaire vierge, qu'il peut renvoyer (deux réponses dans la table). Bug visé : le bouton portait
`onclick="location.reload()"`, un gestionnaire inline que `script-src` de widget.html (sans `'unsafe-inline'`) bloque ;
le clic ne faisait rien et le répondant ne voyait aucune erreur. Corrigé par un `addEventListener` (`respond.js`,
comme `public-form.js` le faisait déjà). Mesuré sur Grist 1.7.22 : rouge sur l'ancien code (le bouton a un attribut
`onclick`, le clic ne recharge rien, deux violations `script-src-attr : inline`), vert avec le correctif.

**Seul test du dossier SANS `bypassCSP: true`** : ce bug n'existe que sous la CSP, la contourner le rendait invisible
(les tests précédents passaient tous alors que le bouton était mort). Le point 5 plus haut (HTTP nu, `connect-src`
qui bloque l'appel vers ce Grist) est traité autrement : le script sert lui-même la racine du dépôt sur son propre port
(`SERVER_PORT`, 8013) et n'ajoute que l'origine de CE Grist au `connect-src` de widget.html ; `script-src` reste celui
du dépôt, et le test vérifie qu'il n'a ni `'unsafe-inline'` ni `'unsafe-hashes'`. Un `route.fulfill` sur widget.html
ne convient pas : la page perd son adresse réseau réelle et Chromium refuse alors ses appels vers localhost
(« Permission was denied … `loopback` address space »). La clé de partage est la vraie, lue en lecture seule dans
`home.sqlite3` (table `shares`, voir « Écart constaté »). Ce test n'écrit que dans `Reponses` (2 lignes de plus).

## Connexion à Grist qui arrive après les 4 s de `main.js` (18 nov 2026, consigne GFS 032)

`e2e-late-connection.js` répond à la question de la consigne 032 : quand `grist.onOptions` arrive après le minuteur de
4 s de `poc/js/main.js` (écran « Cette page est un widget Grist », diagnostic `timeout`), l'écran se corrige-t-il tout
seul ? Quatre passes sur la vraie page du document de test, avec le vrai `grist-plugin-api.js` (l'entrée du script est
retenue quelques secondes pour simuler une connexion lente ; `grist.ready` n'est pas remplaçable, le script l'expose en
lecture seule ; la redirection qui ajoute `gfs=1` à l'adresse du cadre simule l'hébergement par GFS) :

| passe | mesuré (Grist 1.7.22, Chromium) |
|---|---|
| témoin, connexion immédiate | `config` dès 0,1 s, jamais `standalone` |
| Grist répond à 6,5 s, hors GFS | `standalone` à 4,1 s (diagnostic `timeout`), puis `config` à 6,6 s **tout seul**, diagnostic `onOptions` |
| dans GFS (`gfs=1`) qui ne répond pas à `contexte`, Grist répond tout de suite | `standalone` à 4,0 s, **il reste** (plus de 12 s) : DÉFAUT OUVERT |
| dans GFS qui répond à `contexte` à 0,3 s, Grist à 1,5 s | `config` à 1,5 s, jamais `standalone` |

Cause du défaut (sondée : le message d'options de Grist arrive 42 ms après le départ du cadre, `GfsLink.ready` renonce à
5 s, « contexte indisponible ») : entre `grist.ready(...)` et `grist.onOptions(...)`, `main.js` fait
`await GfsLink.ready` ; sans GFS c'est une promesse déjà tenue, dans GFS elle attend la réponse à `contexte` (5 s au
plus). Or `grist.onOptions` s'abonne à un `EventEmitter` sans mémoire : un message d'options arrivé avant l'abonnement
est perdu, `state.connected` ne passe jamais à vrai, le minuteur montre `standalone` à 4 s et plus rien ne le corrige.
C'est une course : il suffit que les options arrivent avant la réponse à `contexte`. Le défaut s'affiche en `⚠` sans
faire échouer le script (`STRICT=1` le fait échouer) et passe à `✓` tout seul le jour où l'app est corrigée. Il n'a pas
été corrigé dans le fil de la consigne 032 (« aucun code à changer », `main.js` partagé entre fils).

Piège rencontré en montant ce banc dans une session neuve : si `kit/` (sous-module) n'est pas initialisé, le widget
reste sur « Connexion à Grist… » sans aucune mise en forme et aucune erreur claire. `git submodule update --init` d'abord.

## Peut-on se passer de faire copier le lien du formulaire publié ? Non (sonde du 9 nov 2026)

`probe-share-key.js` essaie, contre CE Grist (1.7.22), tout ce qu'un widget à accès complet pourrait tenter
pour lire lui-même la clé de partage, avec comme témoin les vraies clés de `home.sqlite3`
(`NODE_PATH=$(npm root -g) node tests/grist-env/probe-share-key.js`, code de sortie non nul si une piste s'ouvre) :

- **D'où vient la clé** (code de Grist, `HomeDBManager.syncShares`) : `makeId()`, tirée au hasard par le serveur à la
  première synchronisation du partage, jamais dérivée de rien que le document connaisse. Le document ne porte que
  `linkId` (un uuid posé par le client) et `options`.
- **Qui peut la lire** : une seule méthode, `getShare(linkId)`, exposée par la WebSocket du serveur de documents
  au rôle propriétaire seulement. C'est elle qu'utilise le bouton « Copier le lien » (`FormView._getFormUrl`). Aucune
  route REST ne la rend ; l'API plugin n'a aucune méthode de partage ; le canal RPC du widget ne relaie que les 5
  méthodes de `GristDocAPI` (`getShare` & co. : « is not a function »).
- **Essayé pour de vrai** : les 65 tables du document lues comme le fait le widget (aucune clé hors des tables
  `FormPlus_*`, qui ne l'ont que parce que la personne l'a collée) ; 19 routes REST avec la clé d’API du
  propriétaire dont `/sql`, `/download` et la base entière (aucune clé) ; le jeton `getAccessToken` (ne donne ni la
  clé ni l'accès public du document : 403) ; la WebSocket ouverte depuis une autre origine (refusée, code 1006,
  alors que la même adresse ouverte depuis la page Grist s'ouvre).
- **L'affichage du lien et le bouton « Copier le lien »** : la clé y transite (serveur, WebSocket, page Grist), mais
  hors de portée du widget. Il vit dans un iframe d'une autre origine : la page Grist qui affiche le lien lui est
  illisible (`SecurityError`), le référent ne porte pas la clé, et Grist ne lui délègue que `clipboard-write`
  (`WidgetFrame.js`, `allow: "clipboard-write"`) : `navigator.clipboard.readText()` est refusé par la politique
  de permissions. Le seul chemin est donc ce que la personne colle elle-même (événement `paste`, Ctrl+V), ce que fait le guide.
- **Ce qui marche en revanche** : un widget peut **publier à la place de la personne**. Les trois actions du bouton
  Publier (`AddRecord _grist_Shares {linkId, options}`, `UpdateRecord _grist_Pages {shareRef}`,
  `UpdateRecord _grist_Views_section {shareOptions}`) créent la clé côté serveur, le formulaire répond en anonyme tout
  de suite, et l'interface de Grist le montre comme publié (Partager, plus de bouton Publier). La clé, elle, reste
  invisible au widget qui vient de la faire naître : seul « Copier le lien » la donne.
- **Limite de cette certitude** : c'est vrai pour cette version et pour un widget servi depuis un autre site que
  Grist. Le contrôle d'origine de la WebSocket (`trustOrigin`/`allowHost`) ne compare que le domaine de base :
  un widget servi depuis le même domaine que Grist le passerait avec les cookies de la personne. Ce n'est pas le
  cas de GitHub Pages, ni de GFS tant qu'il n'est pas hébergé sous le domaine de Grist.

## Tester avec Playwright

Pour piloter le widget EN IFRAME dans ce Grist (écran concepteur ou
répondant authentifié, pas seulement l'API REST en anonyme) :

1. **Deux identités réelles** : une par `http://localhost:8484/test/login?username=<email>&name=<nom>&next=<url>`,
   dans un `browser.newContext()` Playwright séparé par identité (cookies
   isolés). Donner l'accès au document à la seconde avec la clé API de la
   première : `PATCH /api/docs/<docId>/access`,
   `{"delta":{"users":{"<email>":"editors"}}}` — sans ça, `AddRecord`
   échoue pour elle et son identité ne peut jamais être résolue.
2. **grist-plugin-api.js** : `plugin-loader.js` ne charge l'origine qui
   héberge réellement le widget que si elle figure dans sa liste blanche
   (`TRUSTED_ORIGINS`, qui ne contient que `docs.getgrist.com`) ; sinon il
   retombe sur `https://docs.getgrist.com/grist-plugin-api.js`, injoignable
   depuis un bac à sable sans réseau sortant vers ce domaine précis.
   Contournement QUI NE TOUCHE JAMAIS AU WIDGET : intercepter cette requête
   avec `context.route()` et la servir depuis la copie que CE conteneur
   héberge lui-même (`curl http://localhost:8484/grist-plugin-api.js`,
   identique) :
   ```js
   await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', route =>
     route.fulfill({ status: 200, contentType: 'application/javascript',
       body: fs.readFileSync('/chemin/vers/grist-plugin-api.js', 'utf8') }));
   ```
   **Consigne GFS 018** : le script que sert CE conteneur (un Grist Docker)
   n'évalue rien, à la différence du bundle de développement que sert
   réellement `docs.getgrist.com` — c'est pourquoi ni ce banc ni les essais
   de GFS n'avaient vu la panne du 04/11 (`EvalError: call to eval() blocked
   by CSP`, CSP sans `'unsafe-eval'`) avant qu'elle ne soit vue en vrai, chez
   le porteur. Pour que ce banc la voie aussi, envelopper le contenu servi
   dans un `eval(…)`, comme le fait réellement `docs.getgrist.com` :
   ```js
   const code = fs.readFileSync('/chemin/vers/grist-plugin-api.js', 'utf8');
   await ctx.route('https://docs.getgrist.com/grist-plugin-api.js', route =>
     route.fulfill({ status: 200, contentType: 'application/javascript',
       body: `eval(${JSON.stringify(code)});` }));
   ```
   Une page dont la CSP a perdu `'unsafe-eval'` échoue alors ici comme chez
   le porteur (`window.grist` reste vide) ; avec `'unsafe-eval'` (consigne
   018 faite), elle réussit comme avant.
3. **Ouvrir la page du widget** : se connecter (`/test/login?...&next=` vers
   l'URL du document), puis cliquer l'entrée de page portant son nom dans la
   barre latérale (`page.getByText('FormPlus', { exact: true }).click()`) —
   plus fiable que reconstruire l'URL `/p/<n>` à la main. Le widget se
   trouve ensuite via `page.frames().find(f => f.url().includes('widget.html'))`.
4. **La vraie clé de partage, pas le `linkId`** (voir « Écart constaté » plus
   bas) : coller dans le champ lien (`#link`) une adresse `/forms/<clé>/<section>`
   construite avec la clé réelle (`home.sqlite3`, table `shares`, colonne
   `key`), jamais celle du fichier JSON produit par `grist_test_doc.py`
   (c'est un `linkId`, voir plus bas) — sinon `generate()` enregistre un
   `formLink` qui renvoie `404 Share not known` au moment de l'afficher.
5. **CSP en HTTP nu** : ce conteneur n'a pas de TLS, donc `connect-src 'self'
   https:` du widget bloque son propre appel vers l'API REST de CE MÊME
   Grist (ni same-origin avec le widget servi sur un autre port, ni
   `https:`). Ouvrir le contexte Playwright avec `bypassCSP: true` pour ce
   test précis : c'est un artefact du HTTP local, pas un cas réel (DINUM et
   le SaaS sont servis en HTTPS), donc jamais à reporter dans `widget.html`
   lui-même.
6. **Cases à cocher masquées** (`#opt-internal-mode`, etc., stylées par un
   `.toggle-track` visuel) : `.click()` échoue sur la visibilité réelle ;
   utiliser `.evaluate(el => { el.checked = true;
   el.dispatchEvent(new Event('change', {bubbles:true})) })`.
7. **Auto-enregistrement d'une carte question** (`wireCardFooter`,
   `config-editor.js`) : seul le `focusout` de `.qf-label`/`.qf-desc`/
   `.qf-choices` déclenche la sauvegarde, jamais celui de
   `.qf-reserved-emails` lui-même — quitter la carte depuis le champ libellé
   (ou un autre champ surveillé), jamais depuis le dernier champ rempli au
   hasard.

## Écart constaté : l'adresse `/s/<clé>/p/<page>` générée par le widget

Le widget lit `_grist_Shares.linkId` (via l'API plugin, métadonnées du
document) et l'utilise comme clé dans l'adresse `/s/<clé>/p/<page>` qu'il
propose de diffuser — logique documentée dans son code (`buildPublicUrl`,
commentaire citant une vérification dans le source de Grist et sur
l'instance DINUM).

Sur cette image Docker (`gristlabs/grist:latest`, serveur 1.7.19), ce n'est
pas la clé attendue par le serveur pour cette route précise. Le serveur
génère, au moment de la publication, une **clé aléatoire distincte**
(table `shares` de la base `home.sqlite3`, colonne `key`, différente de
`link_id`) et c'est **cette clé-là** qu'il faut pour `/s/<clé>/p/<page>`
*et* pour `/api/s/<clé>/...`. Avec le `linkId`, `/s/...` renvoie
« Document not found » et l'appel interne du widget vers
`/api/s/<linkId>/forms/<section>` renvoie « Share not known ».

En substituant la clé réelle (celle de la table `shares`, lisible en
inspectant `home.sqlite3` — pas d'endpoint REST qui l'expose directement),
la même adresse fonctionne parfaitement, y compris en session anonyme :
`curl http://localhost:8484/o/formplus-test/s/<clé réelle>/p/9?style=singlePage`
renvoie 200 et charge le widget.

Même écart pour `/forms/<clé>/<section>` (celle qu'on colle dans le champ
« Lien du formulaire » du widget) : avec le `linkId` du JSON, l'appel que
`renderFill()` fait vers `/api/s/<linkId>/forms/<section>` renvoie aussi
`{"error":"Share not known"}`. Avec la clé réelle, `200`. Confirmé le 21 oct
en pilotant le widget pour de vrai avec Playwright (voir « Tester avec
Playwright » ci-dessus) : sans la substitution, impossible de dérouler la
suite du test (écran répondant) au-delà de l'écran concepteur.

Autrement dit : **le mécanisme d'écriture publique est intact et vérifié**,
mais la génération d'adresse du widget, dans *cet* environnement, ne pointe
pas vers la bonne clé. Deux explications possibles, non tranchées ici : un
écart de version entre cette image et l'instance grist.numerique.gouv.fr,
ou une différence de comportement entre édition communautaire et l'instance
DINUM. `widget.html` n'a pas été modifié (hors périmètre de cette tâche) ;
ceci est à vérifier avant de faire confiance aux adresses générées
localement dans ce conteneur — utiliser plutôt les liens `formUrlReponses`
/ `formUrlFormulaires` du fichier JSON (basés sur la clé correcte) pour
tester la suite du transport 1 en anonyme.

## Fichiers

- `vitrine-captures.js` — les trois captures de la vitrine de GFS (voir plus haut).
- `e2e-late-connection.js` — connexion à Grist tardive, avec ou sans GFS (voir plus haut).
- `start-grist-test.sh` — le script de démarrage.
- `grist_test_doc.py` — crée/recrée le document de test (appelé par le
  script ci-dessus, utilisable seul avec `GRIST_URL`, `GRIST_API_KEY`,
  `GRIST_ORG_DOMAIN`, `FORMPLUS_URL` en variables d'environnement).

## Nettoyage

```bash
docker rm -f grist-formplus-test
rm -rf ~/.formplus-grist-test
```
