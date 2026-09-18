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
| `poc/widget.html` + `poc/js/` + `poc/css/` | Le widget : point d'entrée HTML, modules JavaScript (un rôle par fichier), feuille de style |
| `poc/poc_transport1.py`, `poc/public-form.html`, `poc/README-poc.md` | Script de test en ligne de commande, page de secours hors-Grist, mode d'emploi |
| `index.html` | Page d'accueil GitHub Pages avec accès à la page de test |
| `.github/workflows/tests.yml` | Relance la suite de tests du widget (181+ vérifications) à chaque push, voir plus bas |

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

Sur la page qui porte le formulaire natif publié, ajouter un widget Personnalisé avec l'URL `https://lombre33.github.io/FormPlus/poc/widget.html` et l'accès complet. Coller dans le widget le lien obtenu par « Copier le lien » du formulaire natif : il génère l'adresse à diffuser, `https://<instance>/o/<org>/s/<clé>/p/<page>?style=singlePage`. Elle ouvre le document en session « partage » anonyme : le widget s'affiche, la création est possible, aucune réponse n'est lisible, sans règle d'accès et dans le même document. Détails dans `docs/01-etude-comparative.md`, transport 1 bis.

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

## Licence

Apache License 2.0, voir `LICENSE`.

## Dépendances tierces

`poc/qrcode.js` — générateur de QR code, [QRCode for JavaScript](https://github.com/davidshimjs/qrcodejs) par Kazuhiko Arase, licence MIT. Hébergé dans le dépôt (servi depuis la même origine que le widget) plutôt que chargé depuis un CDN, pour que le widget reste autonome et sans dépendance réseau au moment de l'exécution.
