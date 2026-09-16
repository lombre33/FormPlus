# Feuille de route : UI d'abord, fonctionnalités par valeur

Priorités fixées le 16 septembre 2026 : 1. POC du lien public, 2. socle avec une interface simple, 3. fonctionnalités par ordre de valeur ajoutée.

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

- Éditeur en place : ajouter, réordonner, supprimer, dupliquer une question ; titre et description du formulaire.
- Types de questions : texte court, texte long, nombre, date, oui/non, choix unique, choix multiples, liste depuis une table référencée, email et téléphone validés.
- Obligatoire, texte d'aide, sections avec titre, blocs d'information repliables.
- Questions conditionnelles « Afficher si » avec ET/OU sur questions et sections.
- Écriture dans une table, lecture des options depuis les tables référencées, création des colonnes manquantes avec le bon type Grist (ChoiceList, Ref, Bool respectés).
- Thème sobre, responsive, mode sombre, message de fin personnalisé, réinitialisation.
- Transport interne (widget dans le document) et transport public (clé du formulaire natif) avec assistant « Publier ».
- Sauvegarde de la définition dans le document, historique simple des versions.

### V2, forte valeur, plus technique

- Multi-pages avec progression, pages conditionnelles.
- Pièces jointes.
- Multi-tables parent et enfants en une soumission, via la même clé.
- Listes en cascade filtrées par une réponse précédente.
- Pré-remplissage par URL et champs masqués.
- Brouillon local et reprise de saisie.
- Modèles et duplication de formulaire, import/export JSON.

### V3, niche ou nécessitant une infrastructure

- Modification de sa propre réponse (LinkKey ou jeton via relais).
- Notifications email, anti-spam avancé, fermeture programmée et quotas.
- Champs calculés, signature, QR code, export PDF de la réponse.
- Questions répétables, logique de saut avancée.
- Relais serveur (transport 3), internationalisation complète, statistiques de réponses.

## 4. Jalons

| Jalon | Contenu | Condition de sortie |
|---|---|---|
| J1 | POC transport 1 sur DINUM | Les 8 points de `02-poc-transport1-resultats.md` passent |
| J2 | Socle V1 en usage interne | Un agent crée et remplit un formulaire sans lire de doc |
| J3 | Lien public | Un répondant sans compte soumit depuis mobile, pièces jointes incluses |
| J4 | V2 | Multi-tables et cascades en production chez un premier client |
