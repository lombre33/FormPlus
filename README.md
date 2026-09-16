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
| `docs/03-roadmap-priorites.md` | Principes d'interface, architecture, backlog V1 / V2 / V3 |
| `poc/` | Kit de test : script `poc_transport1.py`, page `public-form.html`, mode d'emploi `README-poc.md` |
| `index.html` | Page d'accueil GitHub Pages avec accès à la page de test |

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

## Licence

À définir. Une licence libre (Apache-2.0 ou MIT) est recommandée pour permettre une revue et une inscription dans la galerie de widgets des instances DINUM et ANCT.
