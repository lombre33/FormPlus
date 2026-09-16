# Form builder Grist : étude comparative et options de lien dédié

Date : 16 septembre 2026.
Sources : code source `gristlabs/grist-core` (branche main), dépôt `isaytoo/grist-form-builder-widget` (dernier commit 22 juin 2026), aide Grist (support.getgrist.com), forum grist.libre.sh, dépôts `gristgouv`, `gristlabs/grist-form-submit`.

Légende : ✅ oui · 🟡 partiel ou avec réserve · ❌ non · n/a sans objet.

---

## 1. Synthèse

- **Le widget isaytoo** est un vrai form builder visuel (5 000 lignes de JS vanilla, licence Apache-2.0). Il est riche en fonctions : listes en cascade, champs calculés, signature, templates, export PDF, 6 proxys. Mais il est conçu pour une mise en page A4 imprimable à positions absolues, limité à une table de destination, et son lien public dépend d'un proxy à héberger avec une clé API. Ce lien public embarque la définition du formulaire et le contenu des tables sources en base64 dans l'URL.
- **Grist natif** a progressé depuis 2024 : champs masqués, pré-remplissage par URL, pièces jointes, redirection avec `{{ID}}`, sections, colonnes, recherche dans les listes. Il n'a toujours pas de questions conditionnelles (issue grist-core #955 ouverte depuis avril 2024), écrit dans une seule table, et n'a pas de thème personnalisable.
- **Découverte clé pour le lien dédié** : publier un formulaire natif crée une clé de partage. Cette clé fonctionne aussi avec l'API REST en anonyme via `/api/s/<clé>/...`. Elle donne le droit de créer des enregistrements dans la table du formulaire, de lire les colonnes affichées des tables référencées, et d'envoyer des pièces jointes. Sans clé API, sans règles d'accès, sans proxy, et le serveur autorise les requêtes cross-origin sans identifiants. Un widget perso peut réutiliser cette clé comme "credential" pour sa propre page publique.
- **Sur l'instance DINUM** : le partage public et la publication de formulaires sont actifs (confirmé par l'équipe DINUM sur le forum, février 2025). Les widgets par URL personnalisée sont possibles, grist-core n'a aucun mécanisme de liste blanche. La galerie officielle est gérée dans `gristgouv/widgets-config` et un widget de formulaire communautaire, Intra Form, y a été audité et ajouté en mars-avril 2026. C'est le chemin à suivre pour être listé.

---

## 2. Le widget isaytoo en détail

### Architecture réelle (lecture du code)

| Élément | Constat |
|---|---|
| Fichiers | `index.html` (éditeur, 800 lignes), `widget.js` (5 000 lignes), `form.html` (page de saisie autonome, 1 100 lignes), `proxy/` (Cloudflare Worker, Vercel, Netlify, Deno, Node/Docker, Nextcloud PHP) |
| Stockage de la définition | Triple : options du widget (`grist.setOptions`), table `BM_FormConfig` créée dans le document (colonnes `ConfigKey`, `ConfigData` JSON), et copie allégée encodée en base64 dans l'URL publique |
| Accès requis | Accès complet au document |
| Écriture | `applyUserActions` avec `AddRecord` ou `UpdateRecord` sur une seule table de destination. Les colonnes formule sont détectées via `_grist_Tables_column` et exclues |
| Lien interne | `form.html?mode=form&formId=...` à intégrer dans un widget du même document |
| Lien public | `form.html?proxy=<url>&docId=<id>&config=<base64>`. La page POSTe `{docId, tableId, record}` au proxy, qui appelle l'API REST avec la clé stockée en secret |
| Rôles | `detectUserRole()` renvoie `isOwner = true` en dur : pas de distinction éditeur / répondant hors du paramètre `mode=form` |
| Mise en page | Canvas A4 (210 × 297 mm), positions x/y en pixels, grille, règles, zoom. Pas de flux responsive |

### Types d'éléments proposés

Texte court, texte long, nombre, date, email, téléphone, liste déroulante, choix unique, cases à cocher, signature, section, image, titre/texte, QR code, lookup, champ calculé, filet.

### Points forts à retenir

- Listes en cascade avec source Grist, 4 opérateurs (`=`, `≥`, `≤`, entre deux colonnes), filtres combinés en ET.
- Champ lookup avec autocomplétion multi-colonnes.
- Champs calculés (somme, différence, produit, division, pourcentage, formule libre).
- Champ signature sur canvas.
- Conditions d'affichage par champ (égal, différent, contient, vide, non vide).
- Multi-pages avec navigation.
- Templates, import/export JSON, historique des 10 dernières versions.
- Création automatique de la table de réponses avec horodatage `Soumis_le`.
- Mode édition d'un enregistrement existant (sélecteur et écoute du curseur via `grist.onRecord`).
- Export PDF de la saisie.
- Test de connectivité du proxy intégré.

### Réserves et risques (à ne pas reproduire)

1. **Fuite de données dans le lien public.** La config base64 inclut `dsTablesData`, c'est-à-dire toutes les lignes des tables sources des listes en cascade. Quiconque reçoit le lien peut décoder ces tables. L'URL devient aussi très longue et toute modification du formulaire impose de rediffuser un nouveau lien.
2. **Proxy trop permissif.** Le worker Cloudflare écrit dans n'importe quel `docId` et `tableId` reçus dans le corps de requête, avec une clé API qui a accès complet. Toute personne connaissant l'URL du proxy peut écrire dans n'importe quelle table de n'importe quel document accessible par cette clé. Seuls l'origine CORS et un rate-limit par IP protègent.
3. **Secrets dans le document.** Les URL et secrets de proxy sont enregistrés dans `BM_FormConfig` et dans les options du widget, donc lisibles par tout lecteur du document.
4. **`eval()`** pour les formules libres des champs calculés.
5. **Typage Grist ignoré** : les cases à cocher multiples sont écrites en texte `"a, b"` et non en ChoiceList, les colonnes Référence ne sont pas gérées, pas de booléen, pas de DateHeure, pas de pièce jointe.
6. **Pas responsive** : positions absolues pensées pour l'impression A4, avec zoom pour les petits écrans.
7. **Hébergement GitHub Pages non audité** par la DINUM ; la question de la conformité code publié / code servi a été soulevée sur le forum (février 2026).

---

## 3. Tableau comparatif

Colonne 4 : faisabilité pour votre widget. « Interne » = widget dans le document pour agents connectés ; « Public » = page à lien dédié. Voir la section 4 pour les transports.

### 3.1 Types de champs

| Fonctionnalité | Grist natif | Widget isaytoo | Faisabilité widget perso |
|---|---|---|---|
| Texte court / texte long | ✅ single ou multiline | ✅ | Facile |
| Nombre, entier, formats | ✅ Int, Numeric | 🟡 Numeric seulement | Facile |
| Date / DateHeure | ✅ | 🟡 Date seule | Facile |
| Booléen (bascule, case unique) | ✅ switch ou checkbox | ❌ | Facile |
| Choix (liste ou boutons radio) lisant les options et couleurs de la colonne Choice | ✅ | 🟡 options saisies à la main ou depuis une table | Facile, lire `widgetOptions` de la colonne |
| Choix multiples écrits en vraie ChoiceList | ✅ | ❌ écrit du texte | Facile, encoder `["L", ...]` |
| Référence / Liste de références avec colonne affichée | ✅ select ou radio, recherche | ❌ | Moyen, résoudre id et libellé |
| Pièces jointes (upload, multiple) | ✅ | ❌ | Moyen. Interne : `getAccessToken` puis `POST /attachments`. Public : `POST /api/s/<clé>/attachments` |
| Email, téléphone, URL validés | ❌ texte libre | ✅ | Facile |
| Signature manuscrite | ❌ | ✅ dataURL en texte | Facile, stocker en pièce jointe plutôt qu'en texte |
| Champ calculé en direct | ❌ | ✅ via `eval` | Facile avec un parseur d'expressions sûr |
| Lookup / autocomplétion sur une table | 🟡 recherche dans un select Ref | ✅ | Facile |
| Listes en cascade filtrées par un autre champ | ❌ | ✅ 4 opérateurs, ET | Interne : facile. Public : moyen, lecture limitée aux colonnes exposées |
| Champ masqué et valeur par URL | ✅ depuis oct. 2025 | ❌ | Facile |
| Valeur par défaut | 🟡 via URL | ❌ | Facile |
| Colonnes formule exclues automatiquement | ✅ | ✅ | Facile |
| Limite d'options dans une liste | 🟡 30 par défaut, configurable côté serveur | ✅ illimité | Facile |

### 3.2 Logique et validation

| Fonctionnalité | Grist natif | Widget isaytoo | Faisabilité widget perso |
|---|---|---|---|
| Questions conditionnelles (afficher si) | ❌ issue #955 ouverte, « In progress » sans PR | 🟡 une condition par champ, 5 opérateurs, pas de ET/OU | Facile à moyen : règles multiples, ET/OU, sur champs, sections et pages |
| Pages ou sections conditionnelles | ❌ | ❌ | Moyen |
| Validation obligatoire | ✅ | ✅ | Facile |
| Validation avancée (regex, min/max, longueur, message) | 🟡 type et obligatoire seulement | ✅ | Facile |
| Validation croisée entre champs | ❌ | ❌ | Facile côté client, moyen côté serveur |
| Validation côté serveur | 🟡 typage Grist | 🟡 rate-limit du proxy | Moyen, uniquement avec proxy |
| Multi-pages avec barre de progression | 🟡 sections sans pagination | ✅ pages | Facile |
| Champs répétables (N lignes enfants) | ❌ | ❌ | Difficile, dépend du multi-tables |
| Logique de saut / branchement de parcours | ❌ | ❌ | Moyen |

### 3.3 Données et tables

| Fonctionnalité | Grist natif | Widget isaytoo | Faisabilité widget perso |
|---|---|---|---|
| Écriture dans plusieurs tables en une soumission | ❌ | ❌ une table | Interne : moyen (`applyUserActions` groupé, ids retournés). Public : moyen, voir transport 1 |
| Lecture d'options depuis plusieurs tables | 🟡 tables référencées seulement | ✅ | Interne : facile. Public : moyen |
| Lier parent et enfants (Ref vers l'id créé) | ❌ | ❌ | Moyen |
| Modifier un enregistrement existant | ❌ création seule | ✅ interne | Interne : facile. Public : transports 2 ou 3 uniquement |
| Horodatage et identité du répondant | 🟡 par colonnes formule | 🟡 `Soumis_le` | Facile |
| Brouillon local, reprise de saisie | ❌ | ❌ | Facile (localStorage) |
| Création automatique de la table de réponses | n/a | ✅ | Facile |
| Définition stockée dans le document, partagée entre pages | n/a | ✅ table `BM_FormConfig` | Facile, à reprendre |
| Templates, import/export JSON, historique | ❌ | ✅ | Facile |
| Duplication d'un formulaire | 🟡 dupliquer la page | 🟡 via template | Facile |

### 3.4 Présentation et expérience

| Fonctionnalité | Grist natif | Widget isaytoo | Faisabilité widget perso |
|---|---|---|---|
| Responsive mobile | ✅ | ❌ A4 positions absolues | Facile si layout en flux |
| Thème, charte, logo, couleurs (DSFR) | ❌ | 🟡 couleurs par élément | Facile |
| Volets repliables, accordéons d'information | ❌ | ❌ | Facile |
| Titres et paragraphes Markdown | ✅ | 🟡 titre stylé, image, QR code, filet | Facile |
| Aide contextuelle, infobulles, description sous le champ | 🟡 via paragraphe | 🟡 placeholder | Facile |
| Colonnes côte à côte | ✅ | ✅ libre | Facile |
| Message de succès personnalisé | ✅ | ❌ fixe | Facile |
| Redirection après envoi avec id créé | ✅ `{{ID}}` | ❌ | Facile |
| Soumissions multiples, bouton réinitialiser | ✅ | ✅ | Facile |
| Bilingue FR/EN | ✅ interface Grist | 🟡 annoncé, FR en pratique | Facile |
| Accessibilité (RGAA) | 🟡 | ❌ | Moyen, à prévoir dès la conception |
| Mode sombre | ✅ | 🟡 forcé en clair | Facile |
| Export PDF ou impression de la saisie | ❌ | ✅ | Facile (CSS print) |
| Aperçu avant publication | ✅ | ✅ | Facile |

### 3.5 Publication, accès et notifications

| Fonctionnalité | Grist natif | Widget isaytoo | Faisabilité widget perso |
|---|---|---|---|
| Lien public sans compte ni règles d'accès | ✅ publication par un propriétaire | 🟡 proxy à héberger et clé API | ✅ en réutilisant la clé de partage native (transport 1) |
| Utilisation par agents connectés dans le document | n/a | ✅ accès complet requis | Facile |
| Séparer concepteur et répondant | n/a | ❌ `isOwner` en dur | Moyen : `user.Access` via règles d'accès, ou paramètre d'URL et widget dédié |
| Pré-remplissage par URL | ✅ | ❌ | Facile |
| Lien pour modifier sa propre réponse | ❌ | ❌ | Moyen : `user.LinkKey` (transport 2) ou jeton via proxy (transport 3) |
| Anti-spam : honeypot, rate-limit, captcha | 🟡 côté serveur Grist | 🟡 rate-limit IP du proxy | Honeypot facile ; rate-limit et captcha moyens, avec proxy |
| Notification email à la soumission | 🟡 Automations Grist (mars 2026), plan Business ou édition complète, disponibilité DINUM à vérifier ; webhooks | ❌ | Moyen, via proxy ou Automations |
| Fermeture du formulaire (date, quota) | ❌ | ❌ | Facile dans la définition |
| Intégration iframe sur un site externe | ✅ URL `/forms/` | ✅ `form.html` | Facile |
| Statistiques de réponses | 🟡 tableaux Grist | ❌ | Facile côté Grist |

### 3.6 Sécurité et hébergement

| Fonctionnalité | Grist natif | Widget isaytoo | Faisabilité widget perso |
|---|---|---|---|
| Aucune clé API exposée ni à gérer | ✅ | 🟡 secret côté proxy, mais proxy ouvert à tout doc/table | ✅ transports 1 et 2 ; transport 3 clé côté serveur avec liste blanche |
| Aucune donnée métier dans le lien | ✅ | ❌ tables sources en base64 dans l'URL | À garantir |
| Hébergement nécessaire | aucun | GitHub Pages + proxy | Fichiers statiques du widget (GitHub Pages ou votre VPS) ; rien de plus avec le transport 1 |
| Code auditable et listable par la DINUM | natif | non listé | Possible : dépôt public, revue comme Intra Form (gristgouv) |
| Pas de dépendance à un tiers pour les soumissions | ✅ | ❌ proxy | ✅ transports 1 et 2 |

---

## 4. Lien dédié : les options en détail

Le besoin : un lien unique, ouvert à des personnes sans compte Grist, sans configurer de règles d'accès complexes, sans exposer le document.

### Transport 1 : réutiliser la clé de partage d'un formulaire natif publié (recommandé)

**Mécanisme, vérifié dans grist-core.**
Quand un propriétaire publie un formulaire natif, Grist crée une ligne dans `_grist_Shares` avec un `linkId`, et associe la page au partage. Le client officiel du formulaire publié appelle ensuite l'API REST en anonyme avec le préfixe `/api/s/<clé>/`, que le serveur réécrit en `/api/docs/s.<clé>/`. Les appels utilisés par Grist lui-même :

```
GET  /api/s/<clé>/forms/<idSection>            définition du formulaire, options des listes et références
POST /api/s/<clé>/tables/<table>/records       création d'un enregistrement
POST /api/s/<clé>/attachments                  envoi de fichiers, renvoie des ids de pièces jointes
```

Les règles d'accès virtuelles générées pour la session de partage (fichier `ACLRulesReader.ts`) sont :
- création (`+C`) sur toutes les colonnes de la table du formulaire, y compris les colonnes non affichées ;
- lecture (`+R`) des colonnes affichées des tables référencées par les colonnes Ref et RefList du formulaire ;
- tout le reste interdit (`-CRUDS` sur chaque table, `-S` sur le schéma).

L'utilisateur est anonymisé côté serveur. Le serveur renvoie `Access-Control-Allow-Origin: *` pour toute requête cross-origin sans cookie ni en-tête Authorization, donc une page hébergée sur GitHub Pages ou votre VPS peut appeler ces endpoints directement.

**Ce que cela permet pour votre widget.**
- Un formulaire natif minimal est publié sur une page par table cible. Il sert de contrat de données et de « credential ». Il peut rester caché de l'usage réel.
- Votre page publique lit la définition via `/forms/<idSection>` (libellés, obligatoire, options de Choice, valeurs des Ref) et y superpose votre couche : conditions, sections repliables, thème, pages.
- Multi-tables : le code précise que toutes les sections d'une même page appartiennent au même partage. Plusieurs widgets Formulaire sur une même page, un par table, publiés ensemble, donnent une seule clé avec `+C` sur chaque table. Le POST parent renvoie l'id, les POST enfants le réutilisent dans leur colonne Ref. À valider par un test.
- Pièces jointes possibles.
- Zéro règle d'accès à écrire, zéro clé API, zéro proxy, zéro hébergement autre que les fichiers statiques du widget.

**Limites.**
- Création uniquement, pas de modification de réponse par le répondant.
- Lecture des tables sources limitée aux colonnes affichées des Ref du formulaire. Pour une cascade département / ville, il faut soit une colonne affichée qui concatène les infos utiles, soit une colonne Ref supplémentaire masquée dans le formulaire natif pour exposer une autre colonne.
- **Piège confirmé le 16 septembre 2026 : la colonne Référence créée pour exposer une table doit avoir une « colonne affichée » (`visibleCol`) explicite.** Sans elle, `_shareTableReferencesForForm` (`ACLRulesReader.ts`) se rabat sur `colId = "id"` : la session anonyme ne lit que l'identifiant numérique de la ligne (`#1`, `#2`…), jamais le libellé, alors que le concepteur, qui a accès à tout, ne voit pas le problème en testant dans sa propre session. `widget.html` fixe désormais `visibleCol` sur la colonne choisie via `UpdateRecord` sur `_grist_Tables_column` au moment de créer le champ caché.
- Toute personne ayant la clé peut écrire toutes les colonnes de la table, comme avec un formulaire natif. Prévoir un honeypot côté client et éventuellement des colonnes formule de contrôle côté Grist.
- Endpoints non documentés publiquement, mais utilisés par le client officiel, donc stables de fait. Dépublier le formulaire natif coupe le lien.
- Où stocker la définition étendue (conditions, layout) pour que la page publique la lise ? Trois pistes : (a) l'exposer via une colonne affichée d'une table `Formulaires` référencée par une colonne Ref masquée du formulaire natif, ce qui la rend lisible par la clé ; à valider par test ; (b) l'embarquer compressée dans l'URL, définition seule sans données, quelques Ko ; (c) la publier en JSON statique sur votre VPS. Piste (a) à tester en premier, (b) en secours.

### Transport 1 bis : la même clé, mais avec une URL sur le domaine Grist (`/s/<clé>`)

Le client web Grist accepte l'adresse `https://<instance>/o/<org>/s/<clé>` (fichier `gristUrls.ts`, indicateur `viaShare`). Le document s'ouvre alors en session « partage », sans connexion, avec les mêmes règles virtuelles que le formulaire publié. C'est le mécanisme qui servait à soumettre des enregistrements depuis le client web avant l'existence des formulaires natifs.

Vérifié le 16 septembre 2026 sur `public.getgrist.com/s/<clé>` (document de Grist Labs) : le document s'ouvre sans compte, la grille de la table cible s'affiche vide car la lecture est censurée, la page du formulaire est visible, et `?style=singlePage` masque menus et panneaux. Le code de censure (`CensorshipInfo` dans `GranularAccess.ts`) ne masque une section que si la lecture de sa table est totalement interdite. La table d'un formulaire publié est en lecture « mixte » (schéma lisible, lignes interdites), donc toutes les sections posées sur cette table restent visibles, y compris un widget personnalisé.

Conséquence : une page qui contient le formulaire natif publié, replié, et un widget FormPlus sur la même table est accessible par une **URL Grist**, sans compte, sans règle d'accès, dans un **seul document**, et le répondant ne peut pas lire les réponses. Le widget écrit soit par l'API plugin (`applyUserActions`, filtré par les règles du partage), soit par l'API REST avec la clé. Adresse à diffuser : `https://<instance>/o/<org>/s/<clé>/p/<page>?style=singlePage`.

Limites : les mêmes que le transport 1, création seule et lecture limitée aux colonnes affichées des références. Sans `style=singlePage`, un curieux voit la liste des pages et les noms des tables et colonnes, jamais les données. Points à valider sur DINUM : rendu d'un widget personnalisé en session partage, écriture via l'API plugin, chemin `/o/<org>/s/<clé>`, comportement avec ProConnect. Risque : ce chemin est qualifié de « half-baked » dans les commentaires du code et Grist Labs pourrait le restreindre un jour. La page externe du transport 1 reste le plan B, avec le même code de widget.

**Constat de sécurité, observé le 16 septembre 2026 sur DINUM : les tables techniques de Grist (préfixe `_grist_`) ne sont pas couvertes par le refus par défaut d'un partage.** `ACLRulesReader._addDefaultShareRules` refuse explicitement tout (`-CRUDS`) sur chaque table du document, mais sa boucle exclut les tables dont l'identifiant commence par `_grist_` (`filter(tableId => !tableId.startsWith("_grist_"))`) ; seule une règle générique `-S` (schéma) s'applique ensuite à `*`. Conséquence vérifiée en pratique : une session anonyme via `/s/<clé>` a pu modifier `_grist_Views_section.options` (la configuration d'un widget personnalisé, y compris d'un widget qui n'est pas le sien) via `applyUserActions`, alors que l'écriture dans les tables normales du document reste bien bloquée hors de la table du formulaire publié. Le risque est limité (pas d'accès aux données des tables normales, seulement à des métadonnées de mise en page) mais réel : ne jamais compter sur une écriture dans une table `_grist_*` comme frontière de sécurité depuis un widget, et envisager de signaler ce comportement à Grist Labs. Pour distinguer un concepteur d'un répondant, utiliser un contrôle de rôle réel : jeton d'accès (`grist.docApi.getAccessToken`) puis appel à un point d'API réservé aux propriétaires côté serveur (`GET .../usersForViewAs`, gardé par le rôle `owners`), 200 signifiant propriétaire, tout le reste (éditeur, lecteur, partage anonyme) 403. C'est la méthode retenue dans `widget.html`.

**Chrome résiduel, observé le 16 septembre 2026 sur DINUM.** `style=singlePage` masque la barre du haut et le panneau de gauche, mais pas le bandeau de chaque section (titre, menu « ... », icône de filtre) ni, pour une section de type Formulaire natif spécifiquement, son rendu en mode éditeur complet (poignées de glisser-déposer `test-forms-drag`, bouton d'ajout de champ, bascule Aperçu, lien Réinitialiser) : ce n'est PAS le rendu épuré du répondant, qui n'existe que sur la route dédiée `/forms/<clé>/<section>` (et son équivalent `/o/<org>/<docId ou s.<clé>>/<slug>/f/<section>`, découvert via le lien du bouton Aperçu). Cette route dédiée est câblée côté serveur aux seules sections de type Formulaire (`section.parentKey !== WidgetType.Form` rejeté) : elle ne peut pas afficher un widget personnalisé, impasse pour FormPlus.

**Solution retenue, vérifiée dans le code le 16 septembre 2026 : séparer la page du formulaire natif et la page du widget.** La règle d'accès générée par `_shareTableForForm` (`ACLRulesReader.ts`) porte sur la ressource `{tableId, colIds:'*'}` avec la condition `user.ShareRef == <partage>` : ni page, ni section n'y figurent. `user.ShareRef` est déterminé une fois pour la session à partir de la clé de l'URL (`getDocSessionShare`, basé sur le `linkId` du partage), pas de la page consultée. Le formulaire natif ne doit exister QUE sur la page qui porte `_grist_Pages.shareRef` (celle où « Publier » a été cliqué) pour générer la règle ; une fois générée, la règle vaut pour tout le document, depuis n'importe quelle page.

Conséquence pratique : mettre le ou les formulaires natifs publiés sur une page technique jamais consultée par les répondants, et le widget FormPlus **seul** sur une autre page. L'adresse à diffuser cible la page du widget, pas celle du formulaire. Le répondant n'y voit plus que le mince bandeau de page et l'en-tête propre à la section du widget personnalisé, plus aucune trace du formulaire natif ni de son mode édition. `poc/widget.html` et `poc/multi-table-test.html` ont été corrigés en ce sens : ils recherchent la page qui porte réellement le widget (recherche parmi toutes les sections personnalisées du document, pas seulement celles de la page du formulaire) et construisent l'adresse sur cette page-là, avec un message qui indique si la séparation est déjà en place. Reste à confirmer par un test sur DINUM que le rendu, une fois la page isolée, est bien exempt de l'habillage du formulaire.

Autre piste, à moyen terme et hors du contrôle du widget : demander à l'administrateur de l'instance (DINUM) une règle CSS globale ciblant la classe `interface-singlePage` posée sur `<body>` quand `style=singlePage` est actif, via la variable d'environnement serveur `APP_STATIC_INCLUDE_CUSTOM_CSS` (self-hosted). Utile si un mince bandeau de page résiduel reste gênant.

**Écriture dans une table quelconque, sans geste manuel, ajouté le 16 septembre 2026.** Écrire dans une table B exige toujours qu'un formulaire natif publié existe pour elle sur la page du formulaire de l'étape 1 (`_addRulesForShare` ne qualifie que les sections remplissant cette condition) — c'est la seule façon dont Grist accorde ce droit à une session de partage, rien ne permet de l'ouvrir plus largement d'un coup, et ce n'est pas contournable pour le lien public sans renoncer à l'anonymisation des réponses. Rien n'oblige en revanche ce formulaire à être créé à la main : `ensureTableGate` (dans `widget.html`) crée une section Formulaire vide pour la table choisie via l'action `CreateViewSection`, la publie en écrivant `shareOptions = {publish:true, form:true}` sur cette nouvelle section, et retrouve son identifiant en relisant les métadonnées plutôt qu'en interprétant la valeur de retour de l'action. Uniquement additif (une section de plus, jamais affichée ni remplie), aucune donnée existante touchée. Pour le concepteur, choisir n'importe quelle table suffit : l'ouverture du droit est invisible. La lecture d'une autre table (options d'une liste déroulante, étape 2) n'a, elle, jamais eu besoin de ce mécanisme : elle passe par une colonne Référence cachée sur le formulaire déjà publié (`_shareTableReferencesForForm`), qui n'exige rien sur la table source elle-même.

### Transport 2 : document public et règles d'accès, widget dans le document

Le document est partagé « Tout le monde avec le lien » en Éditeur, avec des règles d'accès qui interdisent tout sauf la création dans les tables de réponses, et la lecture des tables d'options. Le widget est ouvert par l'URL de sa page avec `?style=singlePage`. C'est l'approche de `grist-form-submit`.

- Avantages : le widget tourne dans Grist avec l'API plugin, donc lecture et écriture multi-tables sans REST. `user.LinkKey` permet un lien de modification de sa propre réponse (`rec.Jeton == user.LinkKey.Jeton`), en création et en mise à jour.
- Inconvénients : c'est exactement la gestion de règles d'accès que vous voulez éviter. Une erreur de règle expose le document. Il faut désactiver « les éditeurs peuvent modifier la structure ». Les pages et tables internes restent listées si elles ne sont pas masquées.
- Cas d'usage : formulaires avec modification par le répondant, ou parcours en plusieurs sessions.

### Transport 3 : relais serveur avec clé API (approche isaytoo, corrigée)

Une petite API sur votre VPS reçoit les soumissions et écrit via l'API REST avec une clé de compte de service. À corriger par rapport à isaytoo : liste blanche des documents et tables autorisés par formulaire, validation du schéma côté serveur, rate-limit, jetons signés pour l'édition, pas de secret dans le document.

- Avantages : le plus puissant. Multi-tables transactionnel, modification, notifications email, anti-spam sérieux, journalisation, fichiers volumineux.
- Inconvénients : infrastructure à maintenir, clé API à protéger, disponibilité des clés API sur l'instance DINUM à confirmer avec grist@numerique.gouv.fr, et 3 000 appels API par mois pour les équipes gratuites de getgrist.com à partir du 31 août 2026 (sans impact sur DINUM).
- Cas d'usage : offre « avancée » pour clients qui ont besoin de workflows.

### Transport 4 : lien interne pour agents connectés

Pour des répondants qui ont un compte ProConnect, le lien vers la page du widget avec `?style=singlePage` suffit. Les droits sont ceux du document, lecture seule et règles d'accès si besoin. Pas de public.

### Alternative écosystème

Le connecteur « One Trick Poney » du ministère de l'Agriculture relie Démarche Numérique à Grist, mais impose une authentification FranceConnect ou ProConnect. Hors périmètre d'un widget, à connaître pour orienter certains clients.

### Recommandation

Un seul moteur de formulaire, plusieurs transports interchangeables selon le contexte :

| Contexte | Transport |
|---|---|
| Public, création seule, zéro infra, URL sur le domaine Grist | 1 bis, `/s/<clé>/p/<page>?style=singlePage` |
| Public, création seule, zéro infra, URL personnalisée | 1, page hébergée et clé de partage native |
| Public avec modification de sa réponse, ou parcours multi-sessions | 2, ou 3 si l'équipe cliente ne veut pas de règles d'accès |
| Workflows, emails, anti-spam fort, gros volumes | 3, relais sur votre VPS |
| Agents connectés | 4, plugin API direct |

---

## 5. Prochaines étapes proposées

1. **Preuve de concept du transport 1** en 30 minutes : publier un formulaire natif sur un document de test DINUM, récupérer la clé dans l'URL `/forms/<clé>/<idSection>`, puis tester au `curl` : `GET /api/s/<clé>/forms/<id>`, `POST .../records`, `POST .../attachments`, deux formulaires sur une même page, et la lecture d'une table `Formulaires` exposée via une Ref masquée.
2. **Spécifier le modèle de définition** (JSON versionné) : champs, sections, pages, conditions avec ET/OU, sources d'options, thème. Stocker dans une table `FormBuilder_Forms` du document comme le fait isaytoo, sans secrets.
3. **Choisir la stack** : vanilla ou framework léger, DSFR pour l'interface, layout en flux responsive, pas d'`eval`, CSP stricte, i18n FR/EN.
4. **Préparer la publication** : dépôt public, README bilingue, CI, hébergement statique (GitHub Pages ou VPS), puis demande d'ajout dans `gristgouv/widgets-config` après revue, comme Intra Form.
5. **Réutiliser** ce qui est bon chez isaytoo (Apache-2.0) : logique des cascades, création de table de réponses, templates et historique, mode édition via `onRecord`.

---

## Références

- isaytoo/grist-form-builder-widget : https://github.com/isaytoo/grist-form-builder-widget
- Fil forum Form Builder Pro : https://forum.grist.libre.sh/t/constructeur-de-formulaires-visuel/2957 et https://forum.grist.libre.sh/t/creation-de-formulaires/3636
- Aide Grist Formulaires : https://support.getgrist.com/widget-form/
- Aide Grist Widgets personnalisés : https://support.getgrist.com/widget-custom/
- Aide Grist Partage et Règles d'accès : https://support.getgrist.com/sharing/ et https://support.getgrist.com/access-rules/
- Issue questions conditionnelles : https://github.com/gristlabs/grist-core/issues/955
- grist-core, règles de partage : `app/common/ACLRulesReader.ts` ; endpoints : `app/server/lib/DocApi.ts` ; client formulaire : `app/client/ui/FormAPI.ts`, `app/client/models/FormModel.ts` ; CORS : `app/server/lib/FlexServer.ts` (`trustOriginHandler`)
- grist-form-submit : https://github.com/gristlabs/grist-form-submit
- Widgets DINUM/ANCT : https://github.com/gristgouv/widgets-config et https://github.com/gristgouv/grist-cw-intra-form
- Fil forum Intra Form : https://forum.grist.libre.sh/t/custom-widget-intra-form-formulaire-interne/2444
- Partage public sur l'instance DINUM : https://forum.grist.libre.sh/t/partage-dun-document-grist-instance-grist-numerique-gouv-fr/763
- Newsletters Grist : https://support.getgrist.com/newsletters/2025-10/ (champs masqués, URL), https://support.getgrist.com/newsletters/2026-03/ (Automations)
- Automations : https://support.getgrist.com/automations/
