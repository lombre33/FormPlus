# Feuille de route : UI d'abord, fonctionnalités par valeur

Priorités fixées le 16 septembre 2026 : 1. POC du lien public, 2. socle avec une interface simple, 3. fonctionnalités par ordre de valeur ajoutée.

## 0. Bilan de la validation (16 septembre 2026)

Le POC (jalon J1) est allé plus loin que prévu : il a aussi validé une bonne partie de ce qui était classé V1 ou V2. Concrètement, `poc/widget.html` prouve aujourd'hui, sur l'instance DINUM :

- **Transport** : lien sur le domaine Grist, un seul document, aucune règle d'accès, page dédiée sans habillage du formulaire natif (la clé de partage porte sur la table, pas sur la page).
- **Sécurité** : réponses anonymisées et invisibles au répondant, distinction fiable concepteur / répondant (test réel de droit de schéma, pas un indicateur déclaratif).
- **Multi-tables en lecture** : liste de choix lue depuis une table quelconque, avec le vrai libellé (colonne affichée fixée explicitement, sinon Grist retombe sur l'identifiant numérique — piège identifié et corrigé).
- **Multi-tables en écriture** : réponse conditionnelle écrite dans une table différente, ouverture du droit d'écriture automatisée en un clic (`ensureTableGate`, plus besoin d'aller publier un formulaire à la main sur une autre table).
- **Champs natifs complets** : tous les types de colonnes Grist (texte, nombre, date, booléen, choix, référence, listes, pièces jointes), validation, requis, pré-remplissage par URL, hérités du rendu natif.
- **Robustesse** : détection de page fiable même avec plusieurs widgets, diagnostic visible sans outils de développeur, réparation en cas de configuration corrompue.

**Mise à jour du même jour : le constructeur à N questions est fait, puis l'interface a été reprise en profondeur.** `widget.html` propose une liste de questions extensible (« Questions supplémentaires »), chaque question de type « Choix depuis une table » ou « Texte », avec description, obligatoire, condition référençant n'importe quelle question à choix précédente, et destination d'écriture (table du formulaire par défaut ou une autre, ouverte automatiquement). L'interface est devenue des cartes repliées avec icône par type, une seule dépliée à la fois, options avancées masquées jusqu'au clic ; listes de tables et colonnes recherchables en tapant ; import à sens unique des champs natifs compatibles (Texte, Référence) vers des questions FormPlus éditables, qui masque le champ côté formulaire natif. Corrigé au passage : la colonne réellement créée pour une question à choix (`ensureChoiceField`) n'était jamais utilisée comme destination, un vrai bug de fond. Reste non fait : fusionner visuellement les champs natifs NON importés et les questions supplémentaires en une seule liste homogène (ils restent deux blocs distincts pour les champs non importés), le glisser-déposer pour réordonner.

**Mise à jour du 16 septembre 2026 (suite) : types de questions étendus, réinitialisation, démarrage à vide.** Les questions supplémentaires et l'import des champs natifs couvrent désormais 7 types : texte, nombre, date, oui/non, choix (liste fixe saisie à la main), choix multiples (liste fixe), choix depuis une table. Le sélecteur de type dans la carte d'édition est passé de 2 boutons à une grille de 7 icônes. L'import gère maintenant Nombre, Date, Oui/non, Choix et Choix multiples (précédemment ignorés faute de type de question équivalent côté FormPlus) ; restent hors périmètre DateTime, Liste de références et Pièces jointes, faute de « kind » dédié. Chaque question importée porte désormais un `importedFrom` (identifiant du champ natif d'origine), ce qui permet un bouton « Réinitialiser les questions » : il vide la liste ET démasque précisément les champs natifs que l'import avait masqués, sans toucher aux champs masqués à la main dans Grist. Nouveau aussi : un bouton « Créer un formulaire natif vide », visible avant même de coller un lien, qui crée (ou réutilise) une table et y ajoute une section Formulaire native vide sur la page du widget (`CreateViewSection`, même mécanisme qu'`ensureTableGate`). Il ne reste alors au concepteur qu'à cliquer Publier puis Copier le lien : aucune méthode de l'API plugin n'expose la clé de partage secrète que « Publier » génère, cette dernière étape reste donc manuelle par nature, pas par paresse.

**Mise à jour du 16 septembre 2026 (encore) : personnalisation, sections/blocs d'info, glisser-déposer, choix de formulaire dans une liste.** Nouveaux types de bloc dans la même liste de questions, sans collecter de réponse : « Titre de section » et « Bloc d'info repliable » (fermé par défaut), tous deux réordonnables et conditionnables comme une question normale. Glisser-déposer sur une poignée dédiée pour réordonner, en plus des flèches (gardées pour le clavier). Les questions « choix » (liste fixe ou depuis une table) peuvent s'afficher en menu déroulant ou en boutons radio, réglage repris automatiquement à l'import si le formulaire natif l'utilisait déjà. Nouvelle carte « Apparence et personnalisation » : titre et description du formulaire (sinon repris du natif), logo ou image d'en-tête, couleur d'accent (recalcule un fond adouci et un texte de bouton lisible automatiquement, jamais appliquée à l'écran de configuration lui-même), texte du bouton d'envoi, message de fin personnalisé, redirection différée après l'envoi, barre de progression optionnelle. Thème clair/sombre au choix du répondant (bouton dédié, mémorisé par navigateur via `localStorage`, jamais écrit dans le document — indépendant du réglage du concepteur). Étape 1 enrichie d'une liste déroulante des formulaires natifs déjà présents dans le document : un formulaire déjà publié voit sa clé de partage retrouvée automatiquement (`_grist_Pages.shareRef` → `_grist_Shares.linkId`, terrain non exposé par l'API plugin mais lisible comme n'importe quelle métadonnée) et son adresse générée sans copier-coller ; un formulaire non publié affiche une consigne précise (Publier, puis Copier le lien) plutôt qu'une tentative de publication automatique, qui resterait hors de portée pour la même raison que le point précédent. Le champ de collage manuel reste toujours disponible en repli. Couverte par une suite de 181 tests hors ligne (`widget.html#test`, voir `poc/README-poc.md`).

**Nettoyage du 18 septembre 2026, avant reprise des fonctionnalités.** `widget.html` (alors un
seul fichier de 2437 lignes) a été découpé en modules ES sous `poc/js/` et sa feuille de style
sous `poc/css/`, sans changement de comportement (suite de tests intégrale, désormais 184
vérifications, toujours au vert et rejouée automatiquement par une intégration continue GitHub
Actions). `poc/multi-table-test.html`, fusionné dans `widget.html` le 16 septembre mais jamais
retiré, a été supprimé. Une licence Apache-2.0 a été ajoutée (`LICENSE`), condition posée par ce
même document pour une inscription dans la galerie de widgets. Un bug de fond corrigé au passage :
un envoi dont l'écriture dans une table secondaire échouait s'affichait comme un succès complet
au répondant, sans aucun indice visible. Détails dans `docs/04-architecture.md`, qui décrit
l'architecture réelle du code et remplace la section 2 ci-dessous sur ce point (TypeScript/Vite/
`FormBuilder_Forms` n'ont jamais été mis en œuvre).

**Mise à jour du 18 septembre 2026 (suite) : conditions combinées ET/OU, pièces jointes et texte
long.** Les deux points fonctionnels laissés à ce fil de priorisation après la refonte UI (voir
section 3) sont faits. Une condition d'affichage peut désormais combiner plusieurs critères, en
ET (toutes vraies) ou en OU (au moins une), au lieu d'un seul critère d'égalité ; éditeur et rendu
répondant lisent un même format normalisé (`normalizeCondition`, `links.js`), l'ancien format à un
seul critère continue de fonctionner sans migration à faire à la main. Deux types de question
supplémentaires : « Texte long » (zone multi-lignes) et « Pièces jointes » (upload vers
`/attachments`, comme un champ natif Attachments, y compris quand la question écrit dans une table
différente de la principale). L'import des champs natifs suit : un champ Texte natif marqué
multiligne devient une question « Texte long », un champ Attachments natif devient une question
« Pièces jointes » ; seuls DateTime et Liste de références restent hors périmètre côté types de
question. Suite de tests étendue à 238 vérifications (`poc/js/tests.js`), toutes au vert.

## 1. Principes d'interface

Le différenciateur n'est pas technique, c'est la simplicité. Référence : Google Forms.

1. **Le formulaire est l'éditeur.** Une colonne, une question par carte, édition en place. Pas de canvas, pas de grille, pas de panneau latéral permanent.
2. **Trois onglets, pas plus** : Questions, Réponses, Paramètres. Paramètres regroupe la table cible, le lien de partage, le message de fin, le thème.
3. **Les options vivent dans la carte sélectionnée** : type, obligatoire, description, « Afficher si ». Tout le reste derrière un « Plus ».
4. **Zéro jargon Grist pour le répondant, minimum pour le concepteur.** On parle de questions et de réponses ; la colonne Grist est déduite ou créée automatiquement.
5. **Défauts intelligents.** Le type de question découle du type de colonne. Les colonnes manquantes sont créées. « Publier » tient en un clic et s'occupe du formulaire natif sous-jacent.
6. **Sobre et accessible.** Typographie système, une couleur d'accent personnalisable sur palette libre (jamais la charte DSFR, réservée aux services de l'État — FormPlus n'y a pas droit), mode sombre, mobile d'abord, RGAA dès la conception, aucun élément décoratif.
7. **L'aperçu est le vrai rendu.** Le même moteur affiche l'aperçu du concepteur, le widget interne et la page publique.

## 2. Décisions d'architecture

*Section d'intention, écrite avant le code. L'architecture réellement en place — modules ES sous
`poc/js/`, définition stockée dans les options de la section du widget, aucune dépendance
d'exécution — est décrite dans `docs/04-architecture.md`, à lire en priorité sur les points où
les deux divergent (stockage de la définition, TypeScript/Vite jamais introduits).*

- **Un moteur de rendu unique** : définition JSON vers DOM, avec évaluation des conditions. Testé unitairement.
- **Définition JSON versionnée**, stockée dans une table `FormBuilder_Forms` du document, sans secret. Le formulaire natif publié sert de contrat de données et de clé pour le lien public.
- **Transports interchangeables** : interne via l'API plugin pour les agents connectés ; public via la clé de partage native ; plus tard, relais serveur sur le VPS pour les cas avancés.
- **Stack légère** : TypeScript et Vite, pas de framework lourd, CSS en variables, une seule dépendance d'exécution (`grist-plugin-api`). Pas d'`eval`, CSP stricte, échappement systématique.
- **Hébergement statique** (GitHub Pages ou VPS), dépôt public prêt pour une revue par les équipes DINUM/ANCT et une inscription dans `gristgouv/widgets-config`.
- **Hors périmètre** : mise en page A4 et impression. Ce n'est pas notre différenciateur.

## 3. Backlog priorisé

### V1, le socle : indispensable et à forte valeur

**Fusion visuelle des champs natifs et des questions supplémentaires, et passage à des cartes sobres** (ce qui viole aujourd'hui le principe n°1 ci-dessus et bloque la sortie du jalon J2) : repris par le chantier de refonte de l'UI qu'Antoine a demandé séparément le 18 septembre 2026 (deux maquettes proposées, façon Google Forms), pas par ce point de la feuille de route — voir ce fil-là pour l'avancement. C'est désormais le seul point qui reste à faire pour fermer J2 : le reste du socle fonctionnel de V1 est fait (conditions ET/OU et types de question compris, voir « Déjà fait » ci-dessous).

**Explicitement hors de portée : toute charte DSFR.** Antoine l'a rappelé le 18 septembre 2026 : FormPlus n'a pas le droit d'utiliser la charte graphique DSFR, réservée aux services de l'État — ce n'est pas un ministère. Le principe n°6 ci-dessus et la personnalisation de couleur restent sur une palette libre, jamais une présélection DSFR.

**Déjà fait — corrections apportées à cette feuille de route le 18 septembre 2026, après relecture du code (elle donnait encore ces points comme ouverts, à tort) :**
- ~~Constructeur à N questions~~ fait le 16 septembre 2026.
- ~~Glisser-déposer pour réordonner~~ fait le 16 septembre 2026, flèches gardées en complément (clavier, lecteurs d'écran).
- ~~Titre et description du formulaire éditables depuis l'interface~~ fait le 16 septembre 2026 (carte « Apparence et personnalisation », champs `opt-title`/`opt-desc`).
- ~~Types de questions étendus~~ : texte, nombre, date, oui/non, choix (liste fixe), choix multiples (liste fixe), choix depuis une table (référence).
- ~~Obligatoire, condition (un seul critère), texte d'aide (champ description sous chaque question), sections avec titre, blocs d'information repliables~~ faits le 16 septembre 2026 (types `section` et `info` de `kinds.js`).
- ~~Ouverture automatique des accès multi-tables~~ faite et généralisée à toute question (`ensureTableGate`, `ensureChoiceField`), plus liée aux étapes fixes.
- ~~Thème clair/sombre côté répondant, couleur d'accent personnalisable~~ faits.
- ~~Message de fin personnalisé, redirection après envoi, réinitialisation des questions~~ faits le 16 septembre 2026.
- ~~Assistant « Publier »~~ partiellement fait le 16 septembre 2026 : bouton « Créer un formulaire natif vide » qui prépare la table et la section Formulaire, ne laissant plus que Publier + Copier le lien à la charge du concepteur (ces deux clics restent hors de portée de l'API plugin, voir V2 pour l'automatisation complète).
- ~~Conditions combinées en ET/OU~~ et ~~types de question « Texte long » et « Pièces jointes »~~ faits le 18 septembre 2026 (voir bilan ci-dessus) : ne restent hors périmètre, côté types de question, que date+heure et liste de références.

**Qualité, à ne pas laisser de côté avant de considérer V1 vraiment fini :**
- Vérification d'accessibilité réelle (lecteur d'écran) sur l'écran répondant : le principe RGAA est posé depuis le début mais n'a encore été vérifié qu'à l'œil, jamais avec un lecteur d'écran.
- Checklist concrète pour l'inscription au catalogue `gristgouv/widgets-config` (README au format attendu par ce dépôt, captures d'écran, ouverture de la pull request) : objectif mentionné depuis le POC, jamais détaillé en tâche actionnable.

### V2, forte valeur, plus technique

- Multi-pages avec progression, pages conditionnelles.
- Listes en cascade à plusieurs niveaux filtrées par une réponse précédente (aujourd'hui un seul niveau validé).
- Champs masqués et valeurs par défaut pour les questions enrichies (déjà natif pour les champs du formulaire Grist).
- Brouillon local et reprise de saisie.
- Modèles et duplication de formulaire, import/export JSON.
- Visualisation des réponses directement dans FormPlus, sans repasser par la grille Grist.
- Automatiser aussi la publication initiale du formulaire natif (étape 1), pas seulement l'ouverture des tables suivantes — plus délicat, touche `_grist_Shares`/`_grist_Pages`, à traiter avec la même prudence qu'`ensureTableGate`. Partiellement contourné le 16 septembre 2026 : la clé d'un formulaire DÉJÀ publié est retrouvée automatiquement (lecture seule de `_grist_Shares.linkId`) depuis la liste déroulante de l'étape 1, ce qui ne reste manuel que pour la toute première publication.

### V3, niche ou nécessitant une infrastructure

- Modification de sa propre réponse (LinkKey ou jeton via relais).
- Notifications email, anti-spam avancé (honeypot déjà en place, captcha à voir), fermeture programmée et quotas.
- Champs calculés, signature, QR code, export PDF de la réponse.
- Questions répétables, logique de saut avancée.
- Relais serveur (transport 3), internationalisation complète.
- CSS globale proposée à la DINUM pour effacer le bandeau de page résiduel sur `/s/<clé>` (hors du contrôle du widget).

## 4. Jalons

| Jalon | Contenu | Condition de sortie | Statut |
|---|---|---|---|
| J1 | POC transport 1 sur DINUM | Les 8 points de `02-poc-transport1-resultats.md`, plus multi-tables et condition | **Atteint**, 16 septembre 2026 |
| J2 | Socle V1 en usage interne | Un agent crée et remplit un formulaire sans lire de doc, via une vraie interface | À faire |
| J3 | Lien public | Un répondant sans compte soumet depuis mobile, pièces jointes incluses | Techniquement prouvé, reste l'interface |
| J4 | V2 | Multi-tables et cascades en production chez un premier client | À faire |
