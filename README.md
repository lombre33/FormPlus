# FormPlus

Form builder pour Grist, pensé pour l'instance de la DINUM (grist.numerique.gouv.fr) et compatible avec toute instance Grist.

Objectif : dépasser les limites du formulaire natif de Grist avec une interface aussi simple que Google Forms.

- Questions conditionnelles (afficher si), sections et blocs d'information repliables.
- Lecture et écriture dans plusieurs tables d'un même document.
- Interface sobre, responsive, accessible.
- Lien public sans compte, sans règles d'accès et sans clé API, en réutilisant la clé de partage d'un formulaire natif publié.

**Statut : exploration et preuve de concept (septembre 2026).** Rien n'est encore utilisable en production.

## Contenu du dépôt

| Dossier | Contenu |
|---|---|
| `docs/01-etude-comparative.md` | Comparatif Grist natif / widget isaytoo / FormPlus, et les 4 options de lien dédié |
| `docs/02-poc-transport1-resultats.md` | Résultats de la preuve de concept du lien public |
| `docs/03-roadmap-priorites.md` | Principes d'interface, backlog V1 / V2 / V3 |
| `docs/04-architecture.md` | Architecture réelle du code : modules, où vit la configuration, suite de tests |
| `docs/08-tutoriel-cas-usage.md` | Tutoriel pas à pas sur un cas d'usage réel (inscription à un atelier), captures à l'appui |
| `poc/widget.html` + `poc/js/` + `poc/css/` | Le widget : point d'entrée HTML, modules JavaScript (un rôle par fichier), feuille de style |
| `poc/poc_transport1.py`, `poc/public-form.html` + `poc/public-form.js`, `poc/README-poc.md` | Script de test en ligne de commande, page de secours hors-Grist, mode d'emploi |
| `index.html` + `index.js` | Page d'accueil GitHub Pages avec accès à la page de test |
| `manifest.json` | Déclare les points d'entrée du widget (`poc/widget.html`, `poc/public-form.html`) — convention de l'écosystème Grist, lue aussi par les outils d'audit externes |
| `SECURITY.md` | Canal de signalement d'une vulnérabilité |
| `.github/workflows/tests.yml` | Relance la suite de tests du widget (181+ vérifications) à chaque push, voir plus bas |
| `tests/` | Point d'entrée de tout ce qui touche aux tests : suite hors ligne, environnement Grist auto-hébergé pour tester en conditions réelles |

Le widget lui-même n'a ni build ni dépendance à installer : `poc/js/` est chargé par le
navigateur en modules ES natifs (`<script type="module">`), servis tels quels par GitHub Pages.
Détails dans `docs/04-architecture.md`.

## Tester la preuve de concept

1. Dans Grist, publier un formulaire natif et copier son lien, de la forme `https://<instance>/o/<org>/forms/<clé>/<section>`.
2. Ouvrir la page de test hébergée par GitHub Pages en lui passant ce lien :

```
https://lombre33.github.io/FormPlus/poc/public-form.html#form=<lien du formulaire publié>
```

Le lien est placé après `#` : cette partie de l'adresse reste dans le navigateur et n'est jamais transmise au serveur qui héberge la page. La forme `?form=` reste acceptée.

3. Pour la tester comme widget dans Grist : Ajouter un widget, Personnalisé, URL personnalisée, coller la même adresse, niveau d'accès « Aucun accès au document ». La page n'a pas besoin d'accéder au document, elle passe par la clé de partage.

### Adresse sur le domaine Grist, générée par le widget

Sur la page qui porte le formulaire natif publié, ajouter un widget Personnalisé avec l'URL `https://lombre33.github.io/FormPlus/poc/widget.html` et l'accès complet. Coller dans le widget le lien obtenu par « Copier le lien » du formulaire natif : il génère l'adresse à diffuser, `https://<instance>/o/<org>/s/<clé>/p/<page>?style=singlePage`. Elle ouvre le document en session « partage » anonyme, sans règle d'accès et dans le même document. Détails dans `docs/01-etude-comparative.md`, transport 1 bis.

**À vérifier avant de diffuser cette adresse (constat du 21 oct 2026, voir `docs/08-tutoriel-cas-usage.md`) :** testée depuis un navigateur sans aucune session, cette adresse affiche actuellement l'écran de configuration du widget plutôt que le formulaire à remplir. Ne pas la diffuser telle quelle tant que ce point n'est pas corrigé.

## Où passent les données

Aucun intermédiaire. Deux acteurs seulement : le navigateur du répondant et le serveur Grist qui héberge le document.

1. Le navigateur télécharge la page (HTML, CSS, JS) depuis l'hébergeur statique. Aucune donnée de formulaire ne transite à cette étape.
2. Le navigateur appelle directement Grist : `GET /api/s/<clé>/forms/<section>` pour la définition, `POST /api/s/<clé>/attachments` pour les fichiers, `POST /api/s/<clé>/tables/<table>/records` pour la réponse.
3. La réponse est stockée dans le document Grist, et nulle part ailleurs.

L'hébergeur de la page ne voit que la demande du fichier statique. Le code est public et auditable.

Tests en ligne de commande, lecture seule puis écriture :

```bash
python poc/poc_transport1.py "<lien du formulaire publié>"
python poc/poc_transport1.py "<lien du formulaire publié>" --write
```

Toutes les options sont décrites dans `poc/README-poc.md`.

## Suite de tests

`poc/js/tests.js` couvre les fonctions du widget hors ligne (`grist.docApi` et `fetch()` simulés,
aucun document Grist réel touché). Deux façons de la lancer :

- Dans un navigateur : ouvrir `poc/widget.html#test`.
- En ligne de commande (Chromium headless via Playwright) : `.github/workflows/tests.yml` la
  relance à chaque push et pull request. Pour la lancer en local, `npm install` dans
  `.github/scripts/` puis `node .github/scripts/run-widget-tests.js` depuis la racine du dépôt.

Cette suite ne touche jamais un vrai document Grist. Pour tester le widget contre un Grist réel
(installation en widget personnalisé, publication, écriture anonyme), voir
[`tests/`](tests/README.md), qui centralise aussi un environnement Grist auto-hébergé prêt à
l'emploi (`tests/grist-env/`).

## Sécurité

- **Accès Grist `full`** : le widget (`poc/widget.html`) demande l'accès complet au document, y compris des actions de structure (création de table/colonne, ou renommage, au moment de générer un formulaire natif ou une colonne pour une nouvelle question). `poc/public-form.html` ne demande, lui, aucun accès au document — il n'utilise que la clé de partage du formulaire publié, via l'API REST de Grist.
- **Réseau** : la page ne contacte qu'elle-même (`'self'`) et **le serveur Grist de la personne**, dont l'hôte n'est connu qu'à l'exécution (celui du document, ou celui du lien de formulaire collé : `<hôte>/api/s/<clé>/...`, jamais un tiers fixé par le code) : pièces jointes et formulaire natif avec le jeton d'accès, route de partage avec la clé, envoi des réponses. C'est la seule raison pour laquelle `connect-src` reste ouvert à `https:` (l'exception dite de la règle S3 du guide des apps de GFS). **Aucune image n'est chargée par adresse** : le logo ou l'image d'en-tête et les images de description sont des images *intégrées* au formulaire (collées, ou prises dans une pièce jointe du document puis converties en `data:`), jamais une adresse que le navigateur irait chercher (depuis le 23 nov 2026 ; un ancien logo saisi par adresse n'est plus affiché). Deux autres adresses n'existent que pour des options **inactives aujourd'hui** : Leaflet 1.9.4 sur `unpkg.com` (adresses exactes des deux fichiers, avec empreinte SRI) et ses tuiles OpenStreetMap (les trois hôtes `a`/`b`/`c.tile.openstreetmap.org`, nommés un à un), seulement si `window.FORMPLUS_ENABLE_MAP === true` est posé, ce que rien ne fait dans l'app livrée. Aucune autre requête sortante, aucun traceur, aucune télémétrie. Détail adresse par adresse : section « Adresses que l'app appelle » de `GFS-ETAT.md`.
- **Stockage dans le navigateur (`localStorage`)** : l'app garde dans `localStorage` quatre choix, sous des clés qu'elle nomme : `formplus_theme` (thème clair, sombre ou système), `formplus_lang` (langue), `formplus_open_row` (numéro de la ligne du formulaire ouvert dans le concepteur, pour le rouvrir après un rechargement) et `formplus_pending_guide` (l'étape en cours du guide de publication : identifiant du document, de la table et de la section, nom de la page, jamais une question ni une réponse). Jamais le contenu d'un formulaire ni d'un document ; ni `sessionStorage`, ni `IndexedDB`, ni cookie. Ces écritures sont celles du kit commun (`kit/js/theme.js`, `kit/js/i18n.js`, `kit/js/gfs-link.js`), appelées avec ces clés par `poc/js/main.js` et `poc/js/publish-guide.js` : si tu changes une clé, change cette ligne. Dans un cadre de GFS, le navigateur peut refuser ce stockage (cadre isolé) : le kit s'en passe sans erreur, et `formplus_theme`, `formplus_open_row` et `formplus_pending_guide` sont alors gardés chez GFS (`GfsLink.storageSet`).
- **Presse-papiers** : lu uniquement au clic sur le bouton « Coller » de l'écran de configuration (jamais en arrière-plan).
- **Échappement** : toute donnée de cellule ou de réponse insérée dans le HTML (titres, options, réponses affichées dans l'onglet « Réponses ») passe par une fonction d'échappement HTML dédiée (`esc()`, `poc/js/dom.js`) avant d'être concaténée dans un gabarit — jamais de donnée brute non échappée dans un `innerHTML`. Vérifié à l'audit du 21 septembre 2026 (`audit-formplus-2026-09-21.md`) puis revérifié ponctuellement depuis.
- **CSP** : `widget.html`, `public-form.html` et `index.html` déclarent une `Content-Security-Policy` restrictive en balise `<meta>` (repli acceptable pour des pages statiques sans serveur applicatif ; une telle balise ne peut pas porter `frame-ancestors`, ignoré par les navigateurs dans ce contexte — Grist encadre de toute façon déjà le widget dans son iframe). La page que GFS ouvre (`widget.html`) part de `default-src 'none'` et ne rouvre que ce qu'elle utilise (règles S1 à S4 du guide des apps de GFS) ; chaque ouverture est commentée dans la balise et dite dans `GFS-ETAT.md`. `'unsafe-eval'` y reste pour le script d'API de Grist (consigne GFS 018), `'unsafe-inline'` en `style-src` pour des attributs `style`, et `https:` en `connect-src` seulement (voir « Réseau » ci-dessus) : `img-src` ne nomme que `'self'`, `data:` et, pour la carte inactive, les adresses exactes de ses tuiles et des images de Leaflet. Dans GFS, le kit relaie à GFS le nom d'hôte seul des appels que cette politique bloque (règle S8) : cela informe, cela ne protège pas.
- **Vulnérabilité trouvée** : voir `SECURITY.md`.

## Licence

GNU General Public License v3.0, voir `LICENSE`.

## Dépendances tierces

- `poc/qrcode.js` — générateur de QR code, [QRCode for JavaScript](https://github.com/davidshimjs/qrcodejs) par Kazuhiko Arase, licence MIT. Hébergé dans le dépôt (servi depuis la même origine que le widget) plutôt que chargé depuis un CDN, pour que le widget reste autonome et sans dépendance réseau au moment de l'exécution.
- [Leaflet](https://leafletjs.com/) (licence BSD-2-Clause) — carte GPS pour les questions de type carte, chargé depuis `unpkg.com` (adresses exactes de la 1.9.4, avec empreinte SRI) à la demande seulement, et seulement si la carte est activée, ce qu'aucune page livrée ne fait aujourd'hui (voir « Sécurité » ci-dessus) ; jamais embarqué dans le dépôt. Grisé par défaut tant que FormPlus n'est pas intégré à GFS (Grist Factory Suite), qui portera cette fonctionnalité différemment.
