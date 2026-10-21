// Textes de l'interface de FormPlus, français et anglais côte à côte (kit, js/i18n.js). Préfixe
// `form.` ; ce que la personne écrit dans un formulaire (questions, aides) n'est jamais ici, il
// reste tel qu'elle l'a écrit. Une section par fichier qui s'en sert, pour s'y retrouver.
import { I18n } from '../../kit/js/i18n.js';

export const STRINGS = {
  // ───────────────────────── Générique, partagé entre plusieurs écrans ─────────────────────────
  'form.loadingGeneric': { fr: 'Chargement…', en: 'Loading…' },
  'form.connecting': { fr: 'Connexion à Grist…', en: 'Connecting to Grist…' },
  'form.diagLabel': { fr: 'Diagnostic', en: 'Diagnostics' },
  'form.themeToggleTitle': { fr: 'Changer de thème', en: 'Switch theme' },

  // ───────────────────────── widget.html : étape 1, démarrage ─────────────────────────
  'form.start.question': { fr: 'Comment voulez-vous démarrer ?', en: 'How do you want to start?' },
  'form.start.existingTitle': { fr: "Repartir d'un formulaire existant", en: 'Start from an existing form' },
  'form.start.existingDesc': {
    fr: "Utiliser un formulaire natif déjà publié dans ce document. FormPlus en crée une copie dédiée, sans jamais modifier l'original.",
    en: 'Use a native form already published in this document. FormPlus creates a dedicated copy of it, never modifying the original.',
  },
  'form.start.scratchTitle': { fr: 'Partir de zéro', en: 'Start from scratch' },
  'form.start.scratchDesc': {
    fr: "Créer un formulaire natif vide, juste pour obtenir son adresse de partage.",
    en: 'Create an empty native form, just to get its share address.',
  },
  'form.start.haveLink': { fr: 'Vous avez déjà un lien de formulaire ?', en: 'Already have a form link?' },
  'form.start.back': { fr: '‹ Changer de méthode', en: '‹ Change method' },
  'form.start.pickLabel': { fr: 'Formulaire natif trouvé dans ce document', en: 'Native form found in this document' },

  // ───────────────────────── widget.html : « Partir de zéro » ─────────────────────────
  'form.scratch.tableLabel': { fr: 'Table qui recevra les réponses', en: 'Table that will receive the answers' },
  'form.scratch.newTableOpt': { fr: 'Nouvelle table (vide)', en: 'New table (empty)' },
  'form.scratch.existingTableOpt': { fr: 'Table existante', en: 'Existing table' },
  'form.scratch.newNameLabel': { fr: 'Nom de la nouvelle table, réponses par défaut', en: 'Name of the new table, defaults to responses' },
  'form.scratch.defaultTableName': { fr: 'Réponses', en: 'Responses' },
  'form.scratch.newNameHint': {
    fr: 'Si une table de ce nom existe déjà, elle est réutilisée ; sinon FormPlus la crée pour vous.',
    en: 'If a table with this name already exists, it is reused; otherwise FormPlus creates it for you.',
  },
  'form.scratch.pickExistingLabel': { fr: 'Table à utiliser', en: 'Table to use' },
  'form.scratch.existingHint': {
    fr: 'FormPlus crée un formulaire natif vide sur cette page, relié à cette table existante.',
    en: 'FormPlus creates an empty native form on this page, linked to this existing table.',
  },
  'form.scratch.createBtn': { fr: 'Créer un formulaire natif vide', en: 'Create an empty native form' },

  // ───────────────────────── widget.html : lien d'un formulaire existant ─────────────────────────
  'form.link.label': { fr: "Lien du formulaire (bouton « Copier le lien » du formulaire)", en: 'Form link (the form\'s "Copy link" button)' },
  'form.link.pasteBtn': { fr: 'Coller', en: 'Paste' },
  'form.link.pasteTitle': { fr: 'Lire le presse-papiers', en: 'Read the clipboard' },
  'form.link.generateBtn': { fr: "Générer l'adresse", en: 'Generate the address' },

  // ───────────────────────── widget.html : onglets de l'éditeur ─────────────────────────
  'form.tabs.questions': { fr: 'Questions', en: 'Questions' },
  'form.tabs.responses': { fr: 'Réponses', en: 'Responses' },
  'form.tabs.settings': { fr: 'Paramètres', en: 'Settings' },
  'form.questions.hint': {
    fr: 'Les champs du formulaire natif apparaissent aussi ici (bordure en pointillés) : cliquez « Personnaliser ce champ » pour les régler comme une question.',
    en: 'The native form\'s fields appear here too (dashed border): click "Customize this field" to configure them like a question.',
  },
  'form.questions.empty': { fr: 'Aucune question supplémentaire pour l\'instant.', en: 'No additional question yet.' },

  // ───────────────────────── widget.html : Paramètres, adresse ─────────────────────────
  'form.settings.urlHeading': { fr: 'Adresse à diffuser', en: 'Address to share' },
  'form.settings.urlDesc': {
    fr: 'Sur le domaine Grist, sans compte, sans règle d\'accès. Le répondant ne peut lire aucune réponse.',
    en: "On the Grist domain, no account, no access rule. The respondent cannot read any answer.",
  },
  'form.settings.changeSourceBtn': { fr: 'Changer de formulaire source', en: 'Change source form' },
  'form.settings.copyBtn': { fr: "Copier l'adresse", en: 'Copy the address' },
  'form.settings.copiedBtn': { fr: 'Copiée', en: 'Copied' },
  'form.settings.openBtn': { fr: 'Ouvrir dans un nouvel onglet', en: 'Open in a new tab' },
  'form.settings.doneBtn': { fr: 'Voir le formulaire', en: 'View the form' },
  'form.settings.qrTitle': { fr: 'QR code', en: 'QR code' },
  'form.settings.qrDownloadBtn': { fr: 'Télécharger le QR code', en: 'Download the QR code' },

  // ───────────────────────── widget.html : Apparence et personnalisation ─────────────────────────
  'form.appearance.heading': { fr: 'Apparence et personnalisation', en: 'Appearance and customization' },
  'form.appearance.desc': {
    fr: 'Facultatif. Sans réglage, le formulaire garde le titre du formulaire natif et le thème sobre par défaut.',
    en: "Optional. Without any setting, the form keeps the native form's title and the plain default theme.",
  },
  'form.appearance.titleLabel': { fr: 'Titre du formulaire', en: 'Form title' },
  'form.appearance.titlePlaceholder': { fr: 'Repris du formulaire natif si laissé vide', en: "Taken from the native form if left empty" },
  'form.appearance.descLabel': { fr: 'Description', en: 'Description' },
  'form.appearance.descPlaceholder': { fr: 'Facultatif', en: 'Optional' },
  'form.appearance.logoLabel': { fr: "Logo ou image d'en-tête (URL)", en: 'Logo or header image (URL)' },
  'form.appearance.emojiLabel': { fr: "Icône d'en-tête (emoji, facultatif, remplace le logo)", en: 'Header icon (emoji, optional, replaces the logo)' },
  'form.appearance.accentLabel': { fr: "Couleur d'accent", en: 'Accent color' },
  'form.appearance.resetColorBtn': { fr: 'Réinitialiser la couleur', en: 'Reset the color' },
  'form.appearance.cornerLabel': { fr: 'Forme des coins (page du répondant)', en: 'Corner shape (respondent page)' },
  'form.appearance.cornerSoft': { fr: 'Arrondi doux', en: 'Soft rounding' },
  'form.appearance.cornerBold': { fr: 'Arrondi prononcé', en: 'Bold rounding' },
  'form.appearance.moodLabel': { fr: 'Ambiance de fond (page du répondant)', en: 'Background mood (respondent page)' },
  'form.appearance.moodFlat': { fr: 'Neutre', en: 'Flat' },
  'form.appearance.moodTinted': { fr: 'Bandeau teinté', en: 'Tinted band' },
  'form.appearance.progressLabel': { fr: 'Afficher une barre de progression', en: 'Show a progress bar' },
  'form.appearance.submitLabel': { fr: "Texte du bouton d'envoi", en: 'Submit button text' },
  'form.appearance.submitPlaceholder': { fr: 'Envoyer', en: 'Submit' },
  'form.appearance.endMsgLabel': { fr: "Message affiché après l'envoi", en: 'Message shown after submission' },
  'form.appearance.endMsgPlaceholder': { fr: 'Merci, votre réponse a bien été enregistrée.', en: 'Thank you, your answer has been recorded.' },
  'form.appearance.redirectLabel': { fr: "Redirection après l'envoi (URL, facultatif)", en: 'Redirect after submission (URL, optional)' },

  // ───────────────────────── widget.html : répondant, réparation, secours ─────────────────────────
  'form.respond.configBtn': { fr: 'Configuration', en: 'Configuration' },
  'form.repair.heading': { fr: 'Réparation', en: 'Repair' },
  'form.repair.desc': {
    fr: 'Rétablit le format des options des widgets personnalisés du document.',
    en: "Restores the options format of the document's custom widgets.",
  },
  'form.repair.analyzing': { fr: 'Analyse…', en: 'Analyzing…' },
  'form.standalone.desc1': {
    fr: "Cette page est un widget Grist. Ajoutez-la dans un document : Ajouter un widget, Personnalisé, URL personnalisée, puis collez l'adresse de cette page. Niveau d'accès : accès complet, nécessaire au concepteur pour retrouver la page et gérer les questions.",
    en: "This page is a Grist widget. Add it to a document: Add widget, Custom, Custom URL, then paste this page's address. Access level: full access, needed by the designer to find the page again and manage the questions.",
  },
  'form.standalone.publicFormA': {
    fr: 'Pour répondre à un formulaire hors de Grist (sans passer par une page Grist), utilisez',
    en: 'To answer a form outside of Grist (without going through a Grist page), use',
  },
  'form.standalone.publicFormB': {
    fr: 'avec le lien du formulaire après',
    en: "with the form's link after",
  },
  'form.standalone.publicFormC': {
    fr: ', ne rend que les champs natifs, pas les questions supplémentaires.',
    en: ', it only renders the native fields, not the extra questions.',
  },
  'form.standalone.fallbackA': {
    fr: "Secours : l'URL du widget peut elle-même contenir le lien du formulaire,",
    en: "Fallback: the widget's own URL can itself contain the form's link,",
  },
  'form.standalone.fallbackB': {
    fr: '. Le mode répondant fonctionne alors même sans options enregistrées.',
    en: '. The respondent mode then works even without saved options.',
  },

  // ───────────────────────── main.js : boutons posés en JS au démarrage ─────────────────────────
  'form.main.addQuestionBtn': { fr: 'Ajouter une question', en: 'Add a question' },
  'form.main.resetBtn': { fr: 'Réinitialiser les questions', en: 'Reset the questions' },
  'form.main.themeToLight': { fr: 'Passer en thème clair', en: 'Switch to light theme' },
  'form.main.themeToDark': { fr: 'Passer en thème sombre', en: 'Switch to dark theme' },

  // ───────────────────────── config-editor.js : messages génériques ─────────────────────────
  'form.editor.notPersistedSuffix': {
    fr: ' Non persisté : cliquez sur <strong>Enregistrer</strong> dans la barre du widget Grist pour conserver ce changement.',
    en: ' Not saved yet: click <strong>Save</strong> in the Grist widget bar to keep this change.',
  },
  'form.editor.savedGeneric': { fr: 'Enregistré.', en: 'Saved.' },
  'form.editor.colorReset': { fr: 'Couleur réinitialisée.', en: 'Color reset.' },
  'form.editor.questionsReset': { fr: 'Questions réinitialisées.', en: 'Questions reset.' },
  'form.editor.genericError': { fr: 'Erreur : {message}', en: 'Error: {message}' },

  // generate() : lien collé
  'form.editor.linkNotRecognized': {
    fr: 'Lien non reconnu. Il doit contenir <code>/forms/&lt;clé&gt;/&lt;numéro&gt;</code>.',
    en: 'Link not recognized. It must contain <code>/forms/&lt;key&gt;/&lt;number&gt;</code>.',
  },
  'form.editor.searchingPage': { fr: 'Recherche de la page du formulaire…', en: "Looking up the form's page…" },
  'form.editor.metaReadError': {
    fr: "Impossible de lire les métadonnées du document ({message}). Le widget a-t-il l'accès complet ?",
    en: "Could not read the document's metadata ({message}). Does the widget have full access?",
  },
  'form.editor.sectionMissing': {
    fr: "Cette section de formulaire n'existe pas dans ce document. Le lien vient-il bien d'ici ?",
    en: "This form section doesn't exist in this document. Does the link really come from here?",
  },
  'form.editor.duplicating': { fr: "Duplication du formulaire (le vôtre n'est jamais modifié)…", en: 'Duplicating the form (yours is never modified)…' },
  'form.editor.duplicateError': { fr: 'Impossible de dupliquer ce formulaire ({message}).', en: 'Could not duplicate this form ({message}).' },
  'form.editor.dupNote': { fr: 'Copie du formulaire créée pour FormPlus, le vôtre est inchangé. ', en: 'A copy of the form was created for FormPlus, yours is unchanged. ' },
  'form.editor.configSavedDoc': { fr: 'Configuration enregistrée dans le document.', en: 'Configuration saved in the document.' },
  'form.editor.configSessionOnly': {
    fr: 'Configuration posée dans cette session seulement : cliquez sur <strong>Enregistrer</strong> dans la barre du widget pour la conserver.',
    en: 'Configuration set for this session only: click <strong>Save</strong> in the widget bar to keep it.',
  },
  'form.editor.multiWidgetAmbiguous': {
    fr: "Plusieurs widgets personnalisés utilisant ce même fichier existent sur la page {page} : impossible de savoir lequel enregistrer. Supprimez les widgets FormPlus superflus laissés par d'anciens essais sur cette page, ne gardez que celui-ci, puis cliquez de nouveau sur Générer l'adresse.",
    en: 'Several custom widgets using this same file exist on page {page}: impossible to know which one to save to. Remove the extra FormPlus widgets left by earlier attempts on this page, keep only this one, then click Generate the address again.',
  },
  'form.editor.pageUnreadable': {
    fr: "Impossible de déterminer la page de ce widget (adresse de la page Grist illisible). L'adresse pointe vers la page du formulaire natif (page {page}), qui affichera aussi son propre habillage.",
    en: "Could not determine this widget's page (the Grist page address is unreadable). The address points to the native form's page (page {page}), which will also show its own chrome.",
  },
  'form.editor.samePageExtra': { fr: ', avec {n} widgets personnalisés dessus', en: ', with {n} custom widgets on it' },
  'form.editor.samePageWarning': {
    fr: "Le widget est sur la même page ({page}) que le formulaire natif{extra}. L'adresse fonctionnera, mais affichera aussi l'habillage du formulaire natif au-dessus ou à côté. Pour un rendu plus propre, déplacez ce widget seul sur une autre page : la clé reste valable, elle porte sur la table, pas sur la page.",
    en: "The widget is on the same page ({page}) as the native form{extra}. The address will work, but will also show the native form's chrome above or beside it. For a cleaner result, move this widget alone to another page: the key stays valid, it is tied to the table, not the page.",
  },
  'form.editor.cleanPage': {
    fr: "Le widget est seul sur la page {widgetPage}, distincte de la page {formPage} qui porte le formulaire natif. L'adresse n'affichera que ce widget : c'est la configuration la plus propre.",
    en: 'The widget is alone on page {widgetPage}, separate from page {formPage} which holds the native form. The address will only show this widget: this is the cleanest setup.',
  },
  'form.editor.clipboardReadDenied': { fr: 'Lecture du presse-papiers refusée : collez le lien dans le champ avec Ctrl+V.', en: 'Clipboard read denied: paste the link into the field with Ctrl+V.' },
  'form.editor.copyFallbackMsg': { fr: 'Copiez cette adresse :', en: 'Copy this address:' },

  // createEmptyForm()
  'form.editor.widgetPageUnreadable': {
    fr: 'Impossible de déterminer la page de ce widget (adresse de la page Grist illisible). Créez le formulaire manuellement depuis Grist : Ajouter une page → Formulaire.',
    en: "Could not determine this widget's page (the Grist page address is unreadable). Create the form manually from Grist: Add page → Form.",
  },
  'form.editor.pickTable': { fr: 'Choisissez une table.', en: 'Choose a table.' },
  'form.editor.creating': { fr: 'Création en cours…', en: 'Creating…' },
  'form.editor.emptyFormCreated': {
    fr: 'Formulaire natif vide créé sur cette page pour la table « {table} ». Cliquez sur <strong>Publier</strong> dans ce nouveau formulaire (repliez-le une fois publié), puis <strong>Copier le lien</strong>, et collez-le ci-dessus.',
    en: 'Empty native form created on this page for table "{table}". Click <strong>Publish</strong> in this new form (collapse it once published), then <strong>Copy link</strong>, and paste it above.',
  },
  'form.editor.giveTableName': { fr: 'Indiquez un nom de table.', en: 'Enter a table name.' },
  'form.editor.tableCreateFailed': { fr: "La table n'a pas pu être créée.", en: 'The table could not be created.' },

  // Onglet Réponses
  'form.editor.noFormLinkedYet': { fr: "Aucun formulaire lié pour l'instant.", en: 'No form linked yet.' },
  'form.editor.responsesCount': {
    fr: '{n} {n|réponse enregistrée|réponses enregistrées} dans la table « {table} ».',
    en: '{n} {n|response recorded|responses recorded} in table "{table}".',
  },
  'form.editor.responsesHint': { fr: 'Pour consulter le détail de chaque réponse, ouvrez cette table dans Grist.', en: 'To see each response in detail, open this table in Grist.' },
  'form.editor.responsesReadError': { fr: 'Impossible de lire les réponses ({message}).', en: 'Could not read the responses ({message}).' },

  // Types de question (pastille + popover)
  'form.editor.kind.text': { fr: 'Texte', en: 'Text' },
  'form.editor.kind.longtext': { fr: 'Texte long', en: 'Long text' },
  'form.editor.kind.number': { fr: 'Nombre', en: 'Number' },
  'form.editor.kind.date': { fr: 'Date', en: 'Date' },
  'form.editor.kind.datetime': { fr: 'Date et heure', en: 'Date and time' },
  'form.editor.kind.bool': { fr: 'Oui / non', en: 'Yes / No' },
  'form.editor.kind.select': { fr: 'Choix (liste fixe)', en: 'Choice (fixed list)' },
  'form.editor.kind.multiselect': { fr: 'Choix multiples (liste fixe)', en: 'Multiple choice (fixed list)' },
  'form.editor.kind.choice': { fr: 'Choix depuis une table', en: 'Choice from a table' },
  'form.editor.kind.reflist': { fr: 'Liste de références', en: 'Reference list' },
  'form.editor.kind.scale': { fr: 'Échelle', en: 'Scale' },
  'form.editor.kind.ranking': { fr: 'Classement', en: 'Ranking' },
  'form.editor.kind.signature': { fr: 'Signature / dessin', en: 'Signature / drawing' },
  'form.editor.kind.map': { fr: 'Lieu sur carte', en: 'Location on map' },
  'form.editor.kind.attachments': { fr: 'Pièces jointes', en: 'Attachments' },
  'form.editor.kind.section': { fr: 'Titre de section', en: 'Section title' },
  'form.editor.kind.info': { fr: "Bloc d'info repliable", en: 'Collapsible info block' },
  'form.editor.kind.page': { fr: 'Nouvelle page', en: 'New page' },
  'form.editor.mapDisabledTitle': {
    fr: 'Carte interactive désactivée sur cette version (nécessite une dépendance externe, voir le README)',
    en: 'Interactive map disabled on this version (requires an external dependency, see the README)',
  },

  // Combobox de recherche
  'form.editor.searchPlaceholder': { fr: 'Rechercher…', en: 'Search…' },
  'form.editor.pickTablePlaceholder': { fr: 'Choisir une table…', en: 'Choose a table…' },
  'form.editor.noResults': { fr: 'Aucun résultat', en: 'No results' },

  // Carte de question : poignée, ordre, nouvelle question
  'form.editor.dragToReorder': { fr: 'Glisser pour réordonner', en: 'Drag to reorder' },
  'form.editor.moveUp': { fr: 'Monter', en: 'Move up' },
  'form.editor.moveDown': { fr: 'Descendre', en: 'Move down' },
  'form.editor.newQuestionFlag': { fr: 'Nouvelle question', en: 'New question' },

  // Corps de carte : champs
  'form.editor.labelFieldSr': { fr: 'Intitulé', en: 'Label' },
  'form.editor.untitledQuestion': { fr: 'Question sans titre', en: 'Untitled question' },
  'form.editor.makeRequiredTitle': { fr: 'Rendre obligatoire', en: 'Make required' },
  'form.editor.descriptionFieldSr': { fr: 'Description', en: 'Description' },
  'form.editor.descriptionOptionalPlaceholder': { fr: 'Description (facultatif)', en: 'Description (optional)' },
  'form.editor.blockContentLabel': { fr: 'Contenu du bloc', en: 'Block content' },
  'form.editor.blockContentPlaceholder': { fr: 'Texte affiché une fois le bloc déplié', en: 'Text shown once the block is expanded' },
  'form.editor.sourceTableLabel': { fr: 'Table source', en: 'Source table' },
  'form.editor.displayedColumnLabel': { fr: 'Colonne affichée (libellé)', en: 'Displayed column (label)' },
  'form.editor.optionsFieldLabel': { fr: 'Options (une par ligne)', en: 'Options (one per line)' },
  'form.editor.optionsPlaceholder': { fr: 'Option 1&#10;Option 2', en: 'Option 1&#10;Option 2' },
  'form.editor.allowOtherOption': { fr: 'Permettre une réponse libre en plus (« Autre »)', en: 'Also allow a free-text answer ("Other")' },
  'form.editor.displayDropdown': { fr: 'Menu déroulant', en: 'Dropdown menu' },
  'form.editor.displayRadio': { fr: 'Boutons radio', en: 'Radio buttons' },
  'form.editor.valuesLabel': { fr: 'Valeurs', en: 'Values' },
  'form.editor.minimumAria': { fr: 'Minimum', en: 'Minimum' },
  'form.editor.maximumAria': { fr: 'Maximum', en: 'Maximum' },
  'form.editor.toSeparator': { fr: 'à', en: 'to' },
  'form.editor.endpointLabelsLabel': { fr: 'Libellés aux extrémités (facultatif)', en: 'Endpoint labels (optional)' },
  'form.editor.scaleLowPlaceholder': { fr: 'Ex. Pas du tout', en: 'E.g. Not at all' },
  'form.editor.scaleHighPlaceholder': { fr: 'Ex. Tout à fait', en: 'E.g. Totally' },
  'form.editor.destColumnLabel': { fr: 'Colonne de destination', en: 'Destination column' },
  'form.editor.destColumnPlaceholder': {
    fr: 'Colonne existante, ou nom pour en créer une',
    en: 'Existing column, or type a name to create one',
  },
  'form.editor.writeToOtherTable': { fr: 'Écrire dans une autre table', en: 'Write to another table' },
  'form.editor.destTableLabel': { fr: 'Table de destination', en: 'Destination table' },
  'form.editor.choiceTableHint': {
    fr: 'Ce type de question crée sa propre colonne (référence cachée) dans la table choisie : rien à régler pour la colonne, seulement la table.',
    en: 'This question type creates its own column (hidden reference) in the chosen table: nothing to set for the column, only the table.',
  },
  'form.editor.allowCaptureOption': { fr: 'Proposer la prise de photo directement (mobile)', en: 'Offer to take a photo directly (mobile)' },
  'form.editor.attachmentsHint': {
    fr: "⚠️ L'envoi de pièces jointes par un répondant échoue encore sur certaines instances Grist (limitation connue de Grist pour les fichiers envoyés de façon anonyme, pas un réglage de ce widget) : à tester sur votre instance avant de compter sur cette question.",
    en: "⚠️ A respondent's attachment upload still fails on some Grist instances (a known Grist limitation for anonymously-sent files, not a setting of this widget): test it on your instance before relying on this question.",
  },
  'form.editor.signatureHint': {
    fr: "La signature est envoyée comme une image, dans une colonne « Pièces jointes » (même limitation d'envoi anonyme que ci-dessus sur certaines instances Grist, à tester avant de compter sur cette question).",
    en: 'The signature is sent as an image, in an "Attachments" column (same anonymous-upload limitation as above on some Grist instances, test it before relying on this question).',
  },
  'form.editor.mapHint': {
    fr: 'Le point posé sur la carte est enregistré comme texte "latitude,longitude" dans une colonne Texte. Carte OpenStreetMap (bibliothèque Leaflet, chargée depuis un CDN) : seule question de ce widget à charger un script externe, grisée par défaut sur cette version (voir le README) — en son absence, le répondant saisit directement les coordonnées.',
    en: 'The point placed on the map is saved as "latitude,longitude" text in a Text column. OpenStreetMap map (Leaflet library, loaded from a CDN): the only question in this widget that loads an external script, greyed out by default on this version (see the README) — without it, the respondent types the coordinates directly.',
  },
  'form.editor.conditionButton': { fr: "Condition d'affichage", en: 'Display condition' },
  'form.editor.condModeAll': { fr: 'Toutes vraies (ET)', en: 'All true (AND)' },
  'form.editor.condModeAny': { fr: 'Au moins une vraie (OU)', en: 'At least one true (OR)' },
  'form.editor.showIfLabel': { fr: 'Afficher si', en: 'Show if' },
  'form.editor.removeCondition': { fr: 'Retirer cette condition', en: 'Remove this condition' },
  'form.editor.pickQuestionOption': { fr: '— choisir une question —', en: '— choose a question —' },
  'form.editor.equalsLabel': { fr: 'égale', en: 'equals' },
  'form.editor.addCondition': { fr: 'Ajouter une condition', en: 'Add a condition' },
  'form.editor.duplicateTitle': { fr: 'Dupliquer', en: 'Duplicate' },
  'form.editor.deleteTitle': { fr: 'Supprimer', en: 'Delete' },

  // Enregistrement d'une question (saveQuestionFromCard)
  'form.editor.defaultLabelChoice': { fr: 'Votre choix', en: 'Your choice' },
  'form.editor.defaultLabelSection': { fr: 'Section', en: 'Section' },
  'form.editor.defaultLabelInfo': { fr: "Bloc d'info", en: 'Info block' },
  'form.editor.defaultLabelPage': { fr: 'Nouvelle page', en: 'New page' },
  'form.editor.defaultLabelAnswer': { fr: 'Réponse', en: 'Answer' },
  'form.editor.saving': { fr: 'Enregistrement…', en: 'Saving…' },
  'form.editor.scaleMaxError': { fr: 'Le maximum doit être supérieur au minimum.', en: 'The maximum must be greater than the minimum.' },
  'form.editor.pickSourceTableCol': { fr: 'Choisissez une table source et sa colonne affichée.', en: 'Choose a source table and its displayed column.' },
  'form.editor.addAtLeastOneOption': { fr: 'Ajoutez au moins une option (une par ligne).', en: 'Add at least one option (one per line).' },
  'form.editor.pickDestColumn': { fr: 'Choisissez la colonne où enregistrer la réponse.', en: 'Choose the column to save the answer in.' },

  // Personnalisation d'un champ natif (fusion visuelle, jalon J2) / réinitialisation
  'form.editor.nativeFieldTag': { fr: 'Champ natif', en: 'Native field' },
  'form.editor.customizeNativeFieldBtn': { fr: 'Personnaliser ce champ', en: 'Customize this field' },
  'form.editor.skipRefNotFound': { fr: 'Référence (introuvable)', en: 'Reference (not found)' },
  'form.editor.skipRefTableNotFound': { fr: 'Référence (table introuvable)', en: 'Reference (table not found)' },
  'form.editor.importedCount': { fr: '{n} champ(s) importé(s).', en: '{n} field(s) imported.' },
  'form.editor.resetConfirmMsg': {
    fr: 'Retirer toutes les questions supplémentaires de ce widget ? Les champs natifs importés redeviendront visibles dans le formulaire natif. Les réponses déjà enregistrées ne sont pas touchées.',
    en: "Remove all of this widget's extra questions? Imported native fields will become visible again in the native form. Already recorded answers are not affected.",
  },
  'form.editor.resetConfirmBtn': { fr: 'Réinitialiser', en: 'Reset' },

  // Sélecteur de formulaire natif existant
  'form.editor.notPublishedSuffix': { fr: ' (non publié)', en: ' (not published)' },
  'form.editor.pickGeneric': { fr: '— choisir —', en: '— choose —' },
  'form.editor.noNativeFormFound': { fr: 'Aucun formulaire natif trouvé dans ce document', en: 'No native form found in this document' },
  'form.editor.listUnavailable': { fr: 'Liste indisponible', en: 'List unavailable' },
  'form.editor.formNotPublishedYet': {
    fr: "Ce formulaire n'est pas encore publié. Ouvrez-le sur sa page, cliquez sur <strong>Publier</strong>, puis <strong>Copier le lien</strong> et collez-le ci-dessous.",
    en: 'This form is not published yet. Open it on its page, click <strong>Publish</strong>, then <strong>Copy link</strong> and paste it below.',
  },
  'form.editor.lookingUpPublishedUrl': { fr: "Recherche de l'adresse déjà publiée…", en: 'Looking up the already-published address…' },
  'form.editor.publishedUrlNotFound': {
    fr: 'Adresse publiée non retrouvée automatiquement. Ouvrez ce formulaire, <strong>Copier le lien</strong>, et collez-le ci-dessous.',
    en: 'Published address not found automatically. Open this form, <strong>Copy link</strong>, and paste it below.',
  },
  'form.editor.urlFoundAuto': { fr: 'Adresse retrouvée automatiquement.', en: 'Address found automatically.' },

  // ───────────────────────── respond.js : écran du répondant ─────────────────────────
  'form.respond.yes': { fr: 'Oui', en: 'Yes' },
  'form.respond.choosePlaceholder': { fr: 'Choisir…', en: 'Choose…' },
  'form.respond.fieldRequired': { fr: 'Ce champ est obligatoire.', en: 'This field is required.' },
  'form.respond.specifyPlaceholder': { fr: 'Précisez…', en: 'Please specify…' },
  'form.respond.specifyAria': { fr: 'Précisez votre réponse', en: 'Specify your answer' },
  'form.respond.otherLabel': { fr: 'Autre', en: 'Other' },
  'form.respond.otherOptionText': { fr: 'Autre…', en: 'Other…' },
  'form.respond.clearSignature': { fr: 'Effacer', en: 'Clear' },
  'form.respond.mapClickHint': { fr: 'Cliquez sur la carte pour poser un point.', en: 'Click the map to place a point.' },
  'form.respond.mapCoordsPlaceholder': { fr: 'latitude, longitude (ex. 48.8566, 2.3522)', en: 'latitude, longitude (e.g. 48.8566, 2.3522)' },
  'form.respond.mapUnavailable': {
    fr: 'Carte interactive non disponible sur cette version : indiquez les coordonnées directement.',
    en: 'Interactive map not available on this version: enter the coordinates directly.',
  },
  'form.respond.mapPointSet': { fr: 'Point posé : {lat}, {lng}', en: 'Point set: {lat}, {lng}' },
  'form.respond.rankUp': { fr: 'Monter {choice}', en: 'Move up {choice}' },
  'form.respond.rankDown': { fr: 'Descendre {choice}', en: 'Move down {choice}' },
  'form.respond.progressCount': { fr: '{done} / {total} {total|question|questions}', en: '{done} / {total} {total|question|questions}' },
  'form.respond.pageIndicator': { fr: 'Page {rank} / {count}', en: 'Page {rank} / {count}' },
  'form.respond.prevBtn': { fr: 'Précédent', en: 'Previous' },
  'form.respond.nextBtn': { fr: 'Suivant', en: 'Next' },
  'form.respond.formUnavailable': { fr: 'Formulaire indisponible', en: 'Form unavailable' },
  'form.respond.untitledForm': { fr: 'Formulaire sans titre', en: 'Untitled form' },
  'form.respond.linkUnreadable': { fr: 'Lien de formulaire illisible.', en: 'Unreadable form link.' },
  'form.respond.requiredFieldsNote': { fr: 'Les champs marqués * sont obligatoires.', en: 'Fields marked * are required.' },
  'form.respond.honeypotLabel': { fr: 'Ne pas remplir', en: 'Leave this blank' },
  'form.respond.sending': { fr: 'Envoi…', en: 'Sending…' },
  'form.respond.warningTables': { fr: '{n|table|tables} : {list}', en: '{n|table|tables}: {list}' },
  'form.respond.warningAttachments': { fr: '{n|pièce jointe|pièces jointes} : {list}', en: '{n|attachment|attachments}: {list}' },
  'form.respond.partialFailureWarning': {
    fr: "Une partie de la réponse n'a pas pu être enregistrée ({parts}). Le reste a bien été pris en compte ; contactez le responsable du formulaire pour signaler ce message.",
    en: "Part of the response could not be saved ({parts}). The rest was recorded; contact the form's owner to report this message.",
  },
  'form.respond.recordId': { fr: 'Identifiant : {id}', en: 'ID: {id}' },
  'form.respond.redirectPrefix': { fr: 'Redirection dans ', en: 'Redirecting in ' },
  'form.respond.redirectSuffix': { fr: ' s… ', en: ' sec… ' },
  'form.respond.continueNowLink': { fr: 'continuer maintenant', en: 'continue now' },
  'form.respond.sendAnotherBtn': { fr: 'Envoyer une autre réponse', en: 'Submit another response' },
  'form.respond.attachmentsErrorPrefix': { fr: 'Pièces jointes : {message}', en: 'Attachments: {message}' },
  'form.respond.unavailable': { fr: '(indisponible)', en: '(unavailable)' },
};

// Enregistrée dès que ce module est importé (pas seulement depuis main.js) : config-editor.js
// construit certains éléments (ex. scratchExistingCombo) dès l'évaluation du module, avant que
// le corps de main.js n'ait eu la main pour appeler I18n.add lui-même. add() ignore un doublon
// identique (kit/js/i18n.js), donc le second appel depuis main.js reste sans effet ni avertissement.
I18n.add(STRINGS);
