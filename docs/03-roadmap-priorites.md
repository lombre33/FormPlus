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

Ce qui n'est **pas encore fait**, et qui redevient la priorité : l'interface elle-même. `widget.html` est aujourd'hui un outil de test technique — bandeau d'avertissement, étapes numérotées, journaux, exactement deux questions enrichies possibles (une à choix, une conditionnelle) câblées en dur. Ce n'est pas l'éditeur simple visé en priorité 2. La section 3 ci-dessous reflète ce point de départ.

## 1. Principes d'interface

Le différenciateur n'est pas technique, c'est la simplicité. Référence : Google Forms.

1. **Le formulaire est l'éditeur.** Une colonne, une question par carte, édition en place. Pas de canvas, pas de grille, pas de panneau latéral permanent.
2. **Trois onglets, pas plus** : Questions, Réponses, Paramètres. Paramètres regroupe la table cible, le lien de partage, le message de fin, le thème.
3. **Les options vivent dans la carte sélectionnée** : type, obligatoire, description, « Afficher si ». Tout le reste derrière un « Plus ».
4. **Zéro jargon Grist pour le répondant, minimum pour le concepteur.** On parle de questions et de réponses ; la colonne Grist est déduite ou créée automatiquement.
5. **Défauts intelligents.** Le type de question découle du type de colonne. Les colonnes manquantes sont créées. « Publier » tient en un clic et s'occupe du formulaire natif sous-jacent.
6. **Sobre et accessible.** Typographie système, une couleur d'accent compatible DSFR, mode sombre, mobile d'abord, RGAA dès la conception, aucun élément décoratif.
7. **L'aperçu est le vrai rendu.** Le même moteur affiche l'aperçu du concepteur, le widget interne et la page publique.

## 2. Décisions d'architecture

- **Un moteur de rendu unique** : définition JSON vers DOM, avec évaluation des conditions. Testé unitairement.
- **Définition JSON versionnée**, stockée dans une table `FormBuilder_Forms` du document, sans secret. Le formulaire natif publié sert de contrat de données et de clé pour le lien public.
- **Transports interchangeables** : interne via l'API plugin pour les agents connectés ; public via la clé de partage native ; plus tard, relais serveur sur le VPS pour les cas avancés.
- **Stack légère** : TypeScript et Vite, pas de framework lourd, CSS en variables, une seule dépendance d'exécution (`grist-plugin-api`). Pas d'`eval`, CSP stricte, échappement systématique.
- **Hébergement statique** (GitHub Pages ou VPS), dépôt public prêt pour une revue par les équipes DINUM/ANCT et une inscription dans `gristgouv/widgets-config`.
- **Hors périmètre** : mise en page A4 et impression. Ce n'est pas notre différenciateur.

## 3. Backlog priorisé

### V1, le socle : indispensable et à forte valeur

**L'éditeur, la vraie priorité maintenant.**
- Remplacer les étapes numérotées et le bandeau technique par l'interface visée section 1 : liste de questions en cartes, une sélectionnée à la fois, ajout par un bouton simple, réordonner par glisser-déposer ou flèches, dupliquer, supprimer.
- Généraliser au-delà des deux questions enrichies câblées en dur (`q1`/`q2`) : un constructeur à **N questions**, chacune d'un type au choix, chacune pouvant lire depuis une autre table ou écrire ailleurs si besoin — pas seulement la première et la deuxième.
- Fusionner la question native (colonne du formulaire natif) et la question enrichie (lecture ou écriture croisée) en un seul concept côté interface : le concepteur ajoute « une question », le type de source (colonne locale ou table externe) est un simple réglage, pas deux mécanismes visiblement différents.
- Titre et description du formulaire, réordonnancement indépendant de l'ordre des champs natifs.

**Fonctionnel, déjà prouvé au niveau technique, à exposer dans l'éditeur :**
- Types de questions : tous ceux déjà rendus (texte court, texte long, nombre, date, oui/non, choix, référence, listes, pièces jointes) plus email et téléphone validés.
- Obligatoire, texte d'aide, sections avec titre, blocs d'information repliables — ces derniers pas encore développés du tout.
- Questions conditionnelles avec ET/OU sur plusieurs conditions, pas seulement une égalité (déjà validé pour un cas simple, à généraliser).
- Ouverture automatique des accès multi-tables déjà faite (`ensureTableGate`), à relier à l'éditeur généralisé plutôt qu'aux étapes fixes actuelles.

**Présentation :**
- Thème sobre, DSFR, responsive complet, mode sombre propre sur l'ensemble de l'interface (les listes déroulantes sont corrigées, le reste de l'éditeur pas encore vérifié).
- Message de fin personnalisé, redirection après envoi, réinitialisation.
- Assistant « Publier » qui explique et guide les deux étapes actuellement manuelles : publier le formulaire natif la première fois, copier son lien.

### V2, forte valeur, plus technique

- Multi-pages avec progression, pages conditionnelles.
- Listes en cascade à plusieurs niveaux filtrées par une réponse précédente (aujourd'hui un seul niveau validé).
- Champs masqués et valeurs par défaut pour les questions enrichies (déjà natif pour les champs du formulaire Grist).
- Brouillon local et reprise de saisie.
- Modèles et duplication de formulaire, import/export JSON.
- Visualisation des réponses directement dans FormPlus, sans repasser par la grille Grist.
- Automatiser aussi la publication initiale du formulaire natif (étape 1), pas seulement l'ouverture des tables suivantes — plus délicat, touche `_grist_Shares`/`_grist_Pages`, à traiter avec la même prudence qu'`ensureTableGate`.

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
