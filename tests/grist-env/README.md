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
