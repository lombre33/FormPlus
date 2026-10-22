// État mutable partagé entre l'écran de configuration et le rendu répondant. Un seul objet
// exporté (plutôt que des variables de module séparées) : les deux écrans le lisent ET
// l'écrivent, et un objet partagé évite d'avoir à ré-exporter un setter par champ.
export const state = {
  options: null,
  formRowId: null, // id de la ligne FormPlus_Formulaires déjà trouvée/créée pour cette instance (resolveMyDefinition/saveFormDefinition), en cache pour éviter de rescanner la table à chaque sauvegarde
  formRowVsId: null, // vsId du formulaire auquel formRowId correspond (consigne 008) : le cache n'est repris que pour ce même formulaire, jamais pour un autre partageant la même section hôte (cas GFS)
  formRowTitle: undefined, // formTitle lu ou écrit en dernier pour formRowVsId (consigne 009) : sert à savoir si la personne a changé le titre, sans jamais remettre un nom que GFS aurait posé
  connected: false,
  canEdit: true,
  stayOnConfig: false, // après une génération, rester sur l'écran de configuration pour copier l'adresse
  currentLink: null,   // lien du formulaire natif, analysé
  currentFormSection: null, // { id (vsId), viewRef, tableRef }, table du formulaire
  mainTableIdCache: null,
  cfgQuestions: [],    // questions supplémentaires, N entrées {id, kind, label, description, ...}
  expandedId: null,    // id de la carte actuellement dépliée, '__new__' pour un ajout, ou null
  formPickerItems: [],
  dragQId: null,
  startView: 'choices', // vue affichée sur l'écran de démarrage : choices | existing | scratch | link
  scratchMode: 'new',   // dans le panneau "Partir de zéro" : new (table à créer) | existing (table déjà là)
  editorTab: 'questions', // onglet affiché dans l'éditeur : questions | responses | settings
  editorTabPicked: false, // un onglet a été cliqué depuis le dernier showConfig() : l'empêche d'écraser ce choix une fois ses await terminés (course corrigée le 21 oct 2026)
  cornerStyle: 'soft',  // forme des coins de la page répondant : soft | bold
  bgMood: 'flat',       // ambiance de fond de la page répondant : flat | tinted
  generating: false,    // generate() en cours : bloque un second déclenchement concurrent (bouton + touche Entrée)
  internalIdentity: null, // email résolu pour le répondant courant en mode interne, ou null (inconnue/non applicable)
};
