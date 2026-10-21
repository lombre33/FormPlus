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

- `start-grist-test.sh` — le script de démarrage.
- `grist_test_doc.py` — crée/recrée le document de test (appelé par le
  script ci-dessus, utilisable seul avec `GRIST_URL`, `GRIST_API_KEY`,
  `GRIST_ORG_DOMAIN`, `FORMPLUS_URL` en variables d'environnement).

## Nettoyage

```bash
docker rm -f grist-formplus-test
rm -rf ~/.formplus-grist-test
```
