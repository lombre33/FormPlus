// État mutable partagé entre l'écran de configuration et le rendu répondant. Un seul objet
// exporté (plutôt que des variables de module séparées) : les deux écrans le lisent ET
// l'écrivent, et un objet partagé évite d'avoir à ré-exporter un setter par champ.
export const state = {
  options: null,
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
};
