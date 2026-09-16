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

## 6. Test du périmètre fonctionnel : lecture multi-tables, condition, écriture multi-tables

**16 septembre 2026 — généralisé.** `widget.html` propose désormais un éditeur de questions à nombre libre (« Questions supplémentaires », sous l'étape 1 et l'adresse générée), plus les deux questions fixes d'origine. Objectif de ce test : prouver, avec le transport `/s/<clé>`, que le widget peut lire une liste de choix depuis une table quelconque du document, afficher une question conditionnelle, et écrire la réponse dans une table différente de celle du formulaire natif.

**À faire d'abord sur un document de test**, cet outil modifie la structure du document (ajout d'une colonne, ajout d'un formulaire technique). Prévoir 3 tables :

| Table | Rôle | Colonnes minimales |
|---|---|---|
| `Departements` | Source des choix | `nom` Texte |
| `Reponses` | Porte le formulaire natif publié | n'importe quelle colonne de départ |
| `Commentaires` | Destination de la question conditionnelle | `Texte` Texte |

1. Sur une page, ajouter un widget **Formulaire** sur `Reponses`, le publier, copier le lien.
2. Sur la même page, ajouter un widget **Personnalisé**, URL `https://lombre33.github.io/FormPlus/poc/widget.html`, accès complet.
3. Coller le lien du formulaire `Reponses`, **Générer l'adresse**. Le bloc « Questions supplémentaires » apparaît.
4. **+ Ajouter une question** : type « Choix, options lues depuis une autre table », table source `Departements`, colonne affichée `nom`, intitulé libre, table de destination laissée sur `Reponses` (par défaut), colonne de destination laissée au choix. **Enregistrer cette question.** Ceci ajoute une colonne cachée `FormPlus_src_Departements_nom` (Référence vers `Departements`, colonne affichée fixée) à `Reponses`, l'attache masquée au formulaire natif publié.
5. **+ Ajouter une question** à nouveau : type « Texte simple », intitulé libre, table de destination `Commentaires`, colonne `Texte`, condition « Si « (la première question) » égale… » puis une valeur de `Departements`. **Enregistrer cette question.** Aucune préparation manuelle de `Commentaires` n'est nécessaire : l'enregistrement crée et publie tout seul un formulaire technique vide pour `Commentaires` sur la page du formulaire, qui ouvre le droit d'écriture pour la même clé (`ensureTableGate`, décrit dans `docs/01-etude-comparative.md`).
6. Une troisième question, un quatrième champ à choix depuis une autre table encore, une condition combinant plusieurs questions : tout ça fonctionne de la même façon, sans limite du nombre de questions.
7. Copier l'adresse générée (bouton **Copier l'adresse** dans le bloc « Adresse à diffuser », inchangée depuis l'étape 1), l'ouvrir en navigation privée. Le formulaire affiche les champs natifs de `Reponses` puis, après un filet de séparation, la question à choix et la question conditionnelle. Le journal Diagnostic en bas confirme la lecture de `Departements` ; après avoir choisi une valeur déclenchant la condition, rempli le second champ et cliqué Envoyer, la réponse apparaît dans `Reponses` (choix compris) et dans `Commentaires`.

Si une étape échoue, le journal affiche le message d'erreur exact de Grist, à coller ici pour diagnostic.

## 7. Page dédiée au widget, sans l'habillage des formulaires natifs

La clé accordée par « Publier » porte sur la table, pas sur la page : une fois le formulaire natif publié, la table reste accessible depuis n'importe quelle autre page du même document, avec la même clé. On peut donc séparer :

1. Une page technique, jamais montrée aux répondants, qui porte le ou les formulaires natifs publiés (`Reponses`, et `Commentaires` si le test de la section 6 est utilisé).
2. Une seconde page, qui ne contient QUE le widget `widget.html`.

Sur cette seconde page, ouvrez la configuration du widget et cliquez de nouveau sur **Générer l'adresse** (le lien du formulaire natif collé précédemment suffit, pas besoin de le recopier). Le message sous l'adresse indique désormais si le widget est isolé sur sa propre page (adresse propre) ou encore sur la même page que le formulaire natif (adresse fonctionnelle, mais avec l'habillage du formulaire natif visible en plus). Déplacez le widget vers la seconde page avec un simple glisser-déposer si besoin, puis régénérez l'adresse.

### Dépannage : « JSON.parse: unexpected character at line 1 column 2 »

Une version du widget du 16 septembre 2026 a écrit la clé `customView` des options de section en objet au lieu d'une chaîne JSON, ce qui fait planter la page qui porte le widget. Trois remèdes, du plus simple au plus technique :

1. Si l'onglet du concepteur est encore ouvert sans rechargement : **Annuler** (Ctrl+Z ou la flèche en haut du document).
2. Sur une autre page du document qui s'ouvre normalement : ajouter un widget Personnalisé avec l'URL `https://lombre33.github.io/FormPlus/poc/widget.html#repair`, accès complet. Il répare les sections corrompues et affiche un compte-rendu. Recharger, puis supprimer ce widget.
3. Si aucune page ne s'ouvre : `python poc/repair_section_options.py "<adresse du document>" --api-key <clé API Grist>`, la clé API se crée dans Profil, Paramètres du compte. Option `--dry-run` pour prévisualiser.
