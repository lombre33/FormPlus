# POC transport 1 : résultats au 16 septembre 2026

Transport 1 = réutiliser la clé de partage d'un formulaire Grist natif publié pour appeler l'API REST en anonyme depuis une page hébergée n'importe où. Kit de test dans `../poc/` (`poc_transport1.py`, `public-form.html`, `README-poc.md`).

## Ce qui est validé en production (lecture seule)

Cibles : deux formulaires publiés par Grist Labs eux-mêmes, celui de l'aide en ligne (`public.getgrist.com/forms/n2x1dCRpqF14ymCQqpkCS7/4`) et le formulaire de retours sur les formulaires (`grist-marketing.getgrist.com/forms/uxKu8p4khy1PdPP1Y594S1/4`). Aucune donnée n'a été envoyée.

| Test | Résultat | Interprétation |
|---|---|---|
| `GET /api/s/<clé>/forms/<section>` | 200, JSON complet | Titre, table cible, `layoutSpec`, champs avec `colId`, type, `formRequired`, `formIsHidden`, `formAcceptFromUrl`, `choices`, `refValues` |
| Même appel via `/api/docs/s.<clé>/forms/<section>` | 200 | Les deux formes d'URL sont équivalentes |
| Clé invalide | 404 | Aucune fuite d'information |
| `GET /api/s/<clé>/tables` | 200 | La table du formulaire est listée. À vérifier sur un document multi-tables : les autres tables sont-elles listées ? |
| `GET /api/s/<clé>/tables/<table>/records` | 200, `records: []` | La lecture des réponses est censurée par les règles, pas refusée. Le widget doit traiter 200-vide et 403 de la même manière |
| `GET /api/s/<clé>/tables/<table>/columns` | 200 | Le schéma de la table du formulaire est lisible, `widgetOptions` compris. Les noms de colonnes non affichées dans le formulaire sont donc visibles, pas leurs données |
| Preflight `OPTIONS` avec `Origin: https://example.org` | 200, `Access-Control-Allow-Origin: *`, `Allow-Headers: Content-Type` | Une page tierce peut appeler l'API en JSON |
| `GET` réel avec `Origin` tiers | `Access-Control-Allow-Origin: *` | Confirmé sur requête réelle |
| Page `public-form.html` servie depuis `http://localhost:8010` | Rendu des 5 champs, aucune erreur console, mobile OK | La chaîne lecture, rendu, validation fonctionne dans un vrai navigateur |

Le script `poc_transport1.py` en mode lecture rapporte « aucun échec » sur ces cibles.

## Transport 1 bis : la clé dans le client web Grist (`/s/<clé>`), observé le 16 septembre 2026

| Test | Résultat | Interprétation |
|---|---|---|
| `https://public.getgrist.com/s/<clé>` sans connexion | Le document s'ouvre dans le client Grist complet, boutons Sign in / Sign up visibles | Session « partage » anonyme acceptée par le client web |
| Grille de la table cible | Affichée, vide, une ligne d'ajout | Lecture des lignes censurée, schéma visible |
| Pages listées | Les deux pages du document, toutes sur la table du formulaire | Une page n'est masquée que si sa table est totalement interdite en lecture |
| `?style=singlePage` | Panneau gauche et barre du haut masqués, seuls les widgets de la page restent | Rendu utilisable pour un répondant |
| Widgets personnalisés | Aucun dans ce document (0 iframe) | Le rendu d'un widget FormPlus en session partage reste à vérifier sur votre document |

Conclusion provisoire : une URL sur le domaine Grist, un seul document, aucune règle d'accès, réponses illisibles par le répondant. À confirmer sur DINUM avec un widget sur la page (procédure en section 5 de `../poc/README-poc.md`).

## Ce qui reste à valider sur votre document DINUM

Ces tests écrivent des données, ils ne peuvent être faits que sur un document que vous contrôlez. Le mode `--write` du script les enchaîne.

1. `POST /tables/<table>/records` crée une ligne et renvoie son id.
2. Une colonne absente du formulaire natif (`Interne`) est acceptée à la création, conformément à la règle `+C` sur toutes les colonnes.
3. `POST /attachments` accepte un fichier et la ligne peut le référencer.
4. Deux formulaires sur la même page partagent la même clé : `POST` dans la table enfant avec l'id parent fonctionne.
5. La clé d'un formulaire d'une autre page ne peut pas écrire dans la première table.
6. `PATCH` est refusé, la ligne créée n'est pas relisible.
7. Une table `Formulaires` référencée par une colonne masquée du formulaire natif expose sa colonne affichée (`Definition`) : lisible via `refValues` du `GET /forms`, et peut-être via `GET /tables/Formulaires/records`. C'est la piste pour stocker la définition étendue dans le document sans rien héberger.
8. Comportement identique sur `grist.numerique.gouv.fr` avec ProConnect : les clés de partage ne dépendent pas de l'authentification, à confirmer.

Mode d'emploi détaillé : `../poc/README-poc.md`. Il faut un document de test avec cinq tables et trois formulaires publiés, environ 15 minutes de préparation.

## Décisions déjà possibles

- Le formulaire natif publié devient le contrat de données et le « credential » du lien public. Le widget n'a pas besoin de gérer des règles d'accès ni de clé API pour la création publique.
- La définition de champ renvoyée par `/forms` (types, obligatoire, choix, valeurs de référence, ordre du `layoutSpec`) suffit à rendre un formulaire complet. La couche widget ajoute conditions, sections repliables, pages, thème.
- Toute donnée renvoyée à un répondant transite par la clé : ne jamais embarquer de données de tables dans l'URL.
