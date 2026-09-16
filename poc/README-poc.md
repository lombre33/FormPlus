# POC transport 1 : lien public via la clé de partage d'un formulaire natif

Objectif : prouver qu'une page hébergée n'importe où peut lire la définition d'un formulaire Grist publié et créer des enregistrements, pièces jointes comprises, sans clé API, sans règles d'accès et sans proxy, en réutilisant la clé de partage générée par « Publier ».

## 1. Préparer le document de test sur grist.numerique.gouv.fr

Créer un document `POC Form Builder` avec ces tables (colonne, type) :

| Table | Colonnes |
|---|---|
| `Departements` | `code` Texte, `nom` Texte. Saisir 2 ou 3 lignes (69 Rhône, 75 Paris, 33 Gironde) |
| `Villes` | `nom` Texte, `Departement` Référence vers `Departements` affichant `nom`. Saisir 4 ou 5 villes |
| `Reponses` | `Nom` Texte, `Email` Texte, `Departement` Référence vers `Departements` affichant `nom`, `Ville` Référence vers `Villes` affichant `nom`, `Age` Entier, `Commentaire` Texte, `PJ` Pièces jointes, `Interne` Texte |
| `Enfants` | `Reponse` Référence vers `Reponses`, `Libelle` Texte, `Quantite` Numérique |
| `Formulaires` | `Nom` Texte, `Definition` Texte. Saisir 1 ligne avec un JSON quelconque dans `Definition` |

Puis, dans `Reponses`, ajouter une colonne `Formulaire` de type Référence vers `Formulaires` affichant `Definition`. Elle servira à tester si la définition étendue peut transiter par la clé.

## 2. Créer et publier les formulaires

1. Ajouter une page : **Ajouter une page → Formulaire → table `Reponses`**. Nommer la page `Formulaire POC`.
2. Sur cette même page : **Ajouter un widget à la page → Formulaire → table `Enfants`**.
3. Dans le formulaire `Reponses`, retirer le champ `Interne` (il ne doit pas être dans le formulaire), garder `Formulaire` et le marquer « Champ masqué » dans ses options.
4. Publier les deux formulaires (bouton **Publier**, réservé aux propriétaires). Copier les deux liens `.../forms/<clé>/<section>`. Ils devraient partager la même clé.
5. Ajouter une seconde page avec un formulaire sur `Formulaires`, le publier aussi, copier son lien : il sert à tester l'isolation des clés.

## 3. Lancer les tests

Lecture seule (aucune donnée créée) :

```bash
python poc_transport1.py "https://grist.numerique.gouv.fr/o/<org>/forms/<clé>/<section>"
```

Écriture complète (crée une réponse, une pièce jointe, une ligne enfant, teste l'isolation) :

```bash
python poc_transport1.py "<lien formulaire Reponses>" --write \
  --field "Interne=ecrit hors formulaire" \
  --attach ./README-poc.md --attach-col PJ \
  --child "Enfants:Reponse" --child-field "Libelle=ligne enfant" --child-field "Quantite=2" \
  --read-table Formulaires \
  --other-url "<lien formulaire Formulaires>"
```

Résultats attendus :
- `GET /forms/<section>` renvoie titre, table, champs, choix et valeurs des références.
- La lecture des réponses est refusée, la création acceptée, la modification refusée.
- La colonne `Interne`, absente du formulaire, est acceptée à la création.
- La pièce jointe est acceptée et liée.
- La ligne `Enfants` est créée avec la même clé puisque son formulaire est sur la même page.
- La clé du formulaire `Formulaires` ne peut pas écrire dans `Reponses`.
- `GET /tables/Formulaires/records` indique si la colonne `Definition` est lisible via la référence masquée.
- Les en-têtes CORS autorisent une origine tierce.

## 4. Test dans un vrai navigateur

Servir la racine du dépôt depuis une autre origine que Grist, puis ouvrir la page avec le lien du formulaire :

```bash
python -m http.server 8010 --directory "D:\Dev Grist\Grist factory\Widget Form Builder"
```

`http://localhost:8010/poc/public-form.html#form=<lien formulaire Reponses>`

Ou directement depuis GitHub Pages, sans rien installer :

`https://lombre33.github.io/FormPlus/poc/public-form.html#form=<lien formulaire Reponses>`

La page lit la définition, affiche les champs dans un style sobre, envoie les pièces jointes puis l'enregistrement. Vérifier l'apparition de la ligne dans `Reponses`.

## 5. Test de l'URL Grist (transport 1 bis)

Objectif : le répondant ouvre une adresse sur le domaine Grist, sans compte, dans le même document, sans règle d'accès, et ne peut pas lire les réponses.

Méthode simple, avec le widget qui génère l'adresse :

1. Sur la page qui porte le formulaire natif publié de `Reponses`, cliquer **Ajouter un widget à la page**, type **Personnalisé**, table `Reponses`.
2. Dans le panneau de droite, **URL personnalisée** : coller `https://lombre33.github.io/FormPlus/poc/widget.html`. Niveau d'accès : **Accès complet au document**, nécessaire pour retrouver la page dans les métadonnées.
3. Dans le widget Formulaire natif de la page : **Copier le lien**. Dans le widget FormPlus : **Coller**, ou coller dans le champ puis **Générer l'adresse**. Le widget écrit la configuration dans le document et affiche l'adresse `https://<instance>/o/<org>/s/<clé>/p/<page>?style=singlePage`, avec un contrôle que la page contient bien un widget personnalisé. Si le message indique « Configuration posée dans cette session seulement », cliquez sur le bouton **Enregistrer** apparu dans la barre du widget : sans lui, une session anonyme ne recevrait pas la configuration et verrait l'écran de configuration au lieu du formulaire.
4. Replier le formulaire natif : menu `⋮` du widget Formulaire, **Réduire**. Il reste sur la page, c'est lui qui porte la clé.
5. **Copier l'adresse**, l'ouvrir dans une fenêtre de navigation privée, remplir, envoyer. Vérifier la ligne dans `Reponses`.
6. Ouvrir la même adresse sans `?style=singlePage` pour voir ce qu'un curieux verrait : la liste des pages et des tables, jamais les données.

Méthode manuelle, si le widget ne parvient pas à lire les métadonnées : utiliser `public-form.html#form=<lien du formulaire>` comme URL personnalisée avec « Aucun accès au document », relever le numéro de page `/p/N` dans la barre d'adresse, et construire l'adresse ci-dessus à la main à partir du lien `.../forms/<clé>/<section>`.

Pour être notés au retour : le widget s'affiche-t-il bien en navigation privée via l'adresse `/s/`, l'envoi crée-t-il la ligne, et le bouton « Configuration » est-il bien absent pour l'anonyme.

### Dépannage : « JSON.parse: unexpected character at line 1 column 2 »

Une version du widget du 16 septembre 2026 a écrit la clé `customView` des options de section en objet au lieu d'une chaîne JSON, ce qui fait planter la page qui porte le widget. Trois remèdes, du plus simple au plus technique :

1. Si l'onglet du concepteur est encore ouvert sans rechargement : **Annuler** (Ctrl+Z ou la flèche en haut du document).
2. Sur une autre page du document qui s'ouvre normalement : ajouter un widget Personnalisé avec l'URL `https://lombre33.github.io/FormPlus/poc/widget.html#repair`, accès complet. Il répare les sections corrompues et affiche un compte-rendu. Recharger, puis supprimer ce widget.
3. Si aucune page ne s'ouvre : `python poc/repair_section_options.py "<adresse du document>" --api-key <clé API Grist>`, la clé API se crée dans Profil, Paramètres du compte. Option `--dry-run` pour prévisualiser.
