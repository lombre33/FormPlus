// Textes de l'interface de FormPlus, français et anglais côte à côte (kit, js/i18n.js). Préfixe
// `form.` ; ce que la personne écrit dans un formulaire (questions, aides) n'est jamais ici, il
// reste tel qu'elle l'a écrit. Une section par fichier qui s'en sert, pour s'y retrouver.
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
    fr: 'En plus des champs du formulaire natif. Cliquez une question pour la régler.',
    en: "In addition to the native form's fields. Click a question to edit it.",
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
  'form.main.importBtn': { fr: 'Importer les champs du formulaire natif', en: "Import the native form's fields" },
  'form.main.resetBtn': { fr: 'Réinitialiser les questions', en: 'Reset the questions' },
  'form.main.themeToLight': { fr: 'Passer en thème clair', en: 'Switch to light theme' },
  'form.main.themeToDark': { fr: 'Passer en thème sombre', en: 'Switch to dark theme' },
};
