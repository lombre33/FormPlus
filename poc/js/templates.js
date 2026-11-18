// Les modèles de formulaire de Form+ : ce que « Nouveau > Depuis un modèle » de GFS propose (consigne GFS 033,
// contrats de GFS 5.4 point 13). Un modèle est un formulaire prêt à publier : un titre, un texte d'accueil, un message
// de fin et une liste de questions, dans les deux langues. Ce fichier est LA source : `modeles/modeles.json` (le
// catalogue que GFS copie, avec ses vignettes) s'en déduit par `node tests/check-modeles.mjs --ecrire`, et le même
// script refuse tout écart entre les deux. Aucune importation ici : le fichier se charge aussi bien dans le widget
// que sous Node (le script ci-dessus, la suite #test).
//
// Rien de ce qui est écrit ici ne touche un document tant que la personne n'a pas cliqué « Créer ce formulaire »
// (config-editor.js, createFormFromModel) : le modèle ne fait que dire quoi créer. Chaque modèle vient avec sa propre
// table de réponses, jamais une table existante : `tables: true` dans le catalogue.
//
// Une question : { key, kind, label, col, required?, choices?, display?, allowOther?, scale?, description?, showIf? }.
//  - `kind` : un type de kinds.js (jamais « map », grisée hors GFS, ni « attachments » : le 403 d'une pièce jointe
//    pour un visiteur anonyme est une limite de Grist, voir config-editor.js) ;
//  - `col` : l'identifiant de la colonne de réponse, en lettres sans accent, unique dans le modèle (jamais déduit du
//    libellé, qui donnerait « Participerez_vous_sur_place_ou___distance__ ») ; absent pour un bloc de mise en page ;
//  - `choices` : { fr: [...], en: [...] }, dans le même ordre ; `showIf: { key, equals: { fr, en } }` n'affiche la
//    question que si celle de `key` a reçu cette réponse (une valeur de ses `choices`, dans chaque langue).
export const MODEL_TYPE = 'formulaire';

export const MODELS = [
  {
    id: 'inscription-evenement',
    nom: { fr: 'Inscription à un événement', en: 'Event registration' },
    description: {
      fr: 'Coordonnées, présence sur place ou à distance, repas et besoins particuliers.',
      en: 'Contact details, on-site or remote attendance, meals and special needs.',
    },
    etiquettes: [
      { fr: 'événement', en: 'event' }, { fr: 'inscription', en: 'registration' },
      { fr: 'réunion', en: 'meeting' }, { fr: 'formation', en: 'training' },
    ],
    vignette: 'inscription-evenement.webp',
    table: { fr: 'Inscriptions', en: 'Registrations' },
    form: {
      title: { fr: 'Inscription à l’événement', en: 'Event registration' },
      description: { fr: 'Merci de remplir ce formulaire pour confirmer votre venue.', en: 'Please fill in this form to confirm your attendance.' },
      endMessage: { fr: 'Merci, votre inscription est bien enregistrée.', en: 'Thank you, your registration has been recorded.' },
    },
    questions: [
      { key: 'coord', kind: 'section', label: { fr: 'Vos coordonnées', en: 'Your details' } },
      { key: 'nom', kind: 'text', label: { fr: 'Nom', en: 'Last name' }, col: { fr: 'Nom', en: 'Last_name' }, required: true },
      { key: 'prenom', kind: 'text', label: { fr: 'Prénom', en: 'First name' }, col: { fr: 'Prenom', en: 'First_name' }, required: true },
      { key: 'email', kind: 'text', label: { fr: 'Adresse e-mail', en: 'Email address' }, col: { fr: 'Email', en: 'Email' }, required: true },
      { key: 'orga', kind: 'text', label: { fr: 'Organisation ou service', en: 'Organization or department' }, col: { fr: 'Organisation', en: 'Organization' } },
      { key: 'venue', kind: 'section', label: { fr: 'Votre venue', en: 'Your attendance' } },
      {
        key: 'presence', kind: 'select', label: { fr: 'Comment participerez-vous ?', en: 'How will you attend?' },
        col: { fr: 'Participation', en: 'Attendance' }, required: true, display: 'radio',
        choices: { fr: ['Sur place', 'À distance'], en: ['On site', 'Remotely'] },
      },
      { key: 'personnes', kind: 'number', label: { fr: 'Nombre de personnes (vous compris)', en: 'Number of people (including you)' }, col: { fr: 'Personnes', en: 'People' } },
      {
        key: 'repas', kind: 'multiselect', label: { fr: 'Contraintes alimentaires', en: 'Dietary needs' }, col: { fr: 'Repas', en: 'Meals' },
        choices: { fr: ['Aucune contrainte', 'Végétarien', 'Sans porc', 'Sans gluten'], en: ['No restriction', 'Vegetarian', 'No pork', 'Gluten-free'] },
        showIf: { key: 'presence', equals: { fr: 'Sur place', en: 'On site' } },
      },
      { key: 'besoins', kind: 'longtext', label: { fr: 'Un besoin particulier (accessibilité, question…) ?', en: 'Any special need (accessibility, question…)?' }, col: { fr: 'Besoins', en: 'Needs' } },
    ],
  },
  {
    id: 'enquete-satisfaction',
    nom: { fr: 'Enquête de satisfaction', en: 'Satisfaction survey' },
    description: {
      fr: 'Une note générale, ce qui a plu, ce qui peut être amélioré, et un contact facultatif.',
      en: 'An overall score, what worked, what could be better, and an optional contact.',
    },
    etiquettes: [
      { fr: 'satisfaction', en: 'satisfaction' }, { fr: 'avis', en: 'feedback' },
      { fr: 'enquête', en: 'survey' }, { fr: 'retour', en: 'review' },
    ],
    vignette: 'enquete-satisfaction.webp',
    table: { fr: 'Retours', en: 'Feedback' },
    form: {
      title: { fr: 'Votre avis nous intéresse', en: 'We value your feedback' },
      description: { fr: 'Quelques questions, moins de deux minutes.', en: 'A few questions, under two minutes.' },
      endMessage: { fr: 'Merci pour votre retour !', en: 'Thank you for your feedback!' },
    },
    questions: [
      {
        key: 'globale', kind: 'scale', label: { fr: 'Votre satisfaction générale', en: 'Your overall satisfaction' }, col: { fr: 'Satisfaction', en: 'Satisfaction' }, required: true,
        scale: { min: 1, max: 5, low: { fr: 'Pas du tout satisfait·e', en: 'Not at all satisfied' }, high: { fr: 'Très satisfait·e', en: 'Very satisfied' } },
      },
      {
        key: 'apprecie', kind: 'multiselect', label: { fr: 'Qu’avez-vous apprécié ?', en: 'What did you like?' }, col: { fr: 'Apprecie', en: 'Liked' },
        choices: {
          fr: ['L’accueil', 'La clarté des informations', 'Les délais', 'Le contenu'],
          en: ['The welcome', 'The clarity of the information', 'The turnaround time', 'The content'],
        },
      },
      { key: 'ameliorer', kind: 'longtext', label: { fr: 'Qu’est-ce qui pourrait être amélioré ?', en: 'What could be improved?' }, col: { fr: 'A_ameliorer', en: 'To_improve' } },
      {
        key: 'recontact', kind: 'select', label: { fr: 'Pouvons-nous vous recontacter à propos de votre retour ?', en: 'May we contact you about your feedback?' },
        col: { fr: 'Recontact', en: 'Follow_up' }, display: 'radio', choices: { fr: ['Oui', 'Non'], en: ['Yes', 'No'] },
      },
      {
        key: 'email', kind: 'text', label: { fr: 'Votre adresse e-mail', en: 'Your email address' }, col: { fr: 'Email', en: 'Email' },
        showIf: { key: 'recontact', equals: { fr: 'Oui', en: 'Yes' } },
      },
    ],
  },
  {
    id: 'demande-contact',
    nom: { fr: 'Demande de contact', en: 'Contact request' },
    description: {
      fr: 'Nom, adresse e-mail, objet de la demande et message : le formulaire de contact le plus simple.',
      en: 'Name, email address, subject and message: the simplest contact form.',
    },
    etiquettes: [
      { fr: 'contact', en: 'contact' }, { fr: 'message', en: 'message' },
      { fr: 'question', en: 'question' }, { fr: 'demande', en: 'request' },
    ],
    vignette: 'demande-contact.webp',
    table: { fr: 'Contacts', en: 'Contact_requests' },
    form: {
      title: { fr: 'Nous contacter', en: 'Contact us' },
      description: { fr: 'Écrivez-nous, nous vous répondrons dans les meilleurs délais.', en: 'Write to us and we will get back to you as soon as possible.' },
      endMessage: { fr: 'Merci, votre message a bien été envoyé.', en: 'Thank you, your message has been sent.' },
    },
    questions: [
      { key: 'nom', kind: 'text', label: { fr: 'Votre nom', en: 'Your name' }, col: { fr: 'Nom', en: 'Name' }, required: true },
      { key: 'email', kind: 'text', label: { fr: 'Votre adresse e-mail', en: 'Your email address' }, col: { fr: 'Email', en: 'Email' }, required: true },
      {
        key: 'objet', kind: 'select', label: { fr: 'Objet de votre demande', en: 'Subject of your request' }, col: { fr: 'Objet', en: 'Subject' }, required: true,
        display: 'dropdown', choices: { fr: ['Une question', 'Une suggestion', 'Un problème', 'Autre'], en: ['A question', 'A suggestion', 'A problem', 'Other'] },
      },
      { key: 'message', kind: 'longtext', label: { fr: 'Votre message', en: 'Your message' }, col: { fr: 'Message', en: 'Message' }, required: true },
    ],
  },
  {
    id: 'signalement-probleme',
    nom: { fr: 'Signalement d’un problème', en: 'Problem report' },
    description: {
      fr: 'Nature, lieu, date et urgence d’un problème constaté, avec une description libre.',
      en: 'Type, place, date and urgency of a problem, with a free description.',
    },
    etiquettes: [
      { fr: 'signalement', en: 'report' }, { fr: 'incident', en: 'incident' },
      { fr: 'panne', en: 'breakdown' }, { fr: 'assistance', en: 'support' },
    ],
    vignette: 'signalement-probleme.webp',
    table: { fr: 'Signalements', en: 'Reports' },
    form: {
      title: { fr: 'Signaler un problème', en: 'Report a problem' },
      description: { fr: 'Décrivez ce que vous avez constaté pour que nous puissions le traiter.', en: 'Describe what you noticed so that we can deal with it.' },
      endMessage: { fr: 'Merci, votre signalement est enregistré.', en: 'Thank you, your report has been recorded.' },
    },
    questions: [
      {
        key: 'nature', kind: 'select', label: { fr: 'Nature du problème', en: 'Type of problem' }, col: { fr: 'Nature', en: 'Problem_type' }, required: true,
        display: 'dropdown', choices: { fr: ['Matériel', 'Logiciel', 'Locaux', 'Autre'], en: ['Equipment', 'Software', 'Premises', 'Other'] },
      },
      { key: 'lieu', kind: 'text', label: { fr: 'Lieu concerné (bâtiment, salle…)', en: 'Where (building, room…)' }, col: { fr: 'Lieu', en: 'Location' } },
      { key: 'date', kind: 'date', label: { fr: 'Date du constat', en: 'Date noticed' }, col: { fr: 'Date_constat', en: 'Date_noticed' } },
      {
        key: 'urgence', kind: 'select', label: { fr: 'Niveau d’urgence', en: 'Level of urgency' }, col: { fr: 'Urgence', en: 'Urgency' }, required: true,
        display: 'radio', choices: { fr: ['Faible', 'Moyen', 'Élevé'], en: ['Low', 'Medium', 'High'] },
      },
      { key: 'description', kind: 'longtext', label: { fr: 'Description du problème', en: 'Description of the problem' }, col: { fr: 'Description', en: 'Description' }, required: true },
      { key: 'contact', kind: 'text', label: { fr: 'Comment vous joindre (facultatif)', en: 'How to reach you (optional)' }, col: { fr: 'Contact', en: 'Contact' } },
    ],
  },
  {
    id: 'reservation-creneau',
    nom: { fr: 'Réservation d’un créneau', en: 'Time slot booking' },
    description: {
      fr: 'Chaque personne choisit un créneau dans une liste que vous réglez, et laisse ses coordonnées.',
      en: 'Each person picks a time slot from a list you set, and leaves their details.',
    },
    etiquettes: [
      { fr: 'réservation', en: 'booking' }, { fr: 'rendez-vous', en: 'appointment' },
      { fr: 'créneau', en: 'time slot' }, { fr: 'permanence', en: 'office hours' },
    ],
    vignette: 'reservation-creneau.webp',
    table: { fr: 'Reservations', en: 'Bookings' },
    form: {
      title: { fr: 'Réserver un créneau', en: 'Book a time slot' },
      description: { fr: 'Choisissez le créneau qui vous convient.', en: 'Pick the time slot that suits you.' },
      endMessage: { fr: 'Merci, votre demande de réservation est enregistrée.', en: 'Thank you, your booking request has been recorded.' },
    },
    questions: [
      { key: 'nom', kind: 'text', label: { fr: 'Nom et prénom', en: 'Full name' }, col: { fr: 'Nom', en: 'Name' }, required: true },
      { key: 'email', kind: 'text', label: { fr: 'Adresse e-mail', en: 'Email address' }, col: { fr: 'Email', en: 'Email' }, required: true },
      {
        key: 'creneau', kind: 'timeslot', label: { fr: 'Créneau souhaité', en: 'Preferred time slot' }, col: { fr: 'Creneau', en: 'Time_slot' }, required: true,
        choices: {
          fr: ['Lundi 9 h – 10 h', 'Lundi 10 h – 11 h', 'Mardi 14 h – 15 h', 'Mercredi 9 h – 10 h', 'Jeudi 14 h – 15 h'],
          en: ['Monday 9–10 am', 'Monday 10–11 am', 'Tuesday 2–3 pm', 'Wednesday 9–10 am', 'Thursday 2–3 pm'],
        },
      },
      { key: 'motif', kind: 'longtext', label: { fr: 'Motif (facultatif)', en: 'Reason (optional)' }, col: { fr: 'Motif', en: 'Reason' } },
    ],
  },
];

const LAYOUT = new Set(['section', 'info', 'page']);

// La valeur dans la langue demandée (`fr` si l'autre manque) ; une valeur qui n'est pas un objet { fr, en } reste telle quelle.
export function pick(value, lang) {
  if (value && typeof value === 'object' && !Array.isArray(value) && ('fr' in value || 'en' in value)) return value[lang] ?? value.fr;
  return value;
}

export function findModel(id) {
  return MODELS.find(m => m.id === String(id ?? '')) || null;
}

// Les colonnes de réponse du modèle, dans l'ordre : [{ id, kind }] (pas de colonne pour un bloc de mise en page).
export function modelColumns(model, lang) {
  return model.questions.filter(q => !LAYOUT.has(q.kind)).map(q => ({ id: pick(q.col, lang), kind: q.kind }));
}

// Les questions du modèle sous la forme qu'enregistre la Definition d'un formulaire (voir config-editor.js,
// saveQuestionFromCard), dans la langue demandée. `makeId` donne un identifiant neuf par question ; `tableId` est la
// table des réponses déjà créée, où chaque colonne `col` existe. Rien ne touche le document ici.
export function buildQuestions(model, lang, tableId, makeId) {
  const ids = new Map(model.questions.map(q => [q.key, makeId()]));
  return model.questions.map(src => {
    const q = { id: ids.get(src.key), kind: src.kind, label: pick(src.label, lang), description: pick(src.description, lang) || '', condition: null };
    if (src.showIf) {
      q.condition = { mode: 'all', rules: [{ questionId: ids.get(src.showIf.key), op: 'equals', value: pick(src.showIf.equals, lang) }] };
    }
    if (LAYOUT.has(src.kind)) return q;
    q.required = !!src.required;
    if (src.kind === 'select') q.displayMode = src.display || 'dropdown';
    if (src.kind === 'select' || src.kind === 'multiselect') q.allowOther = !!src.allowOther;
    if (src.choices) q.choices = pick(src.choices, lang).slice();
    if (src.scale) {
      q.scaleMin = src.scale.min; q.scaleMax = src.scale.max;
      q.scaleLowLabel = pick(src.scale.low, lang); q.scaleHighLabel = pick(src.scale.high, lang);
    }
    q.writeTable = tableId;
    q.writeCol = pick(src.col, lang);
    return q;
  });
}

// Le nombre de questions qui reçoivent une réponse (les blocs de mise en page ne comptent pas).
export function answerCount(model) {
  return model.questions.filter(q => !LAYOUT.has(q.kind)).length;
}

// Le catalogue que GFS copie (`modeles/modeles.json`) : une entrée par modèle, au format du contrat (5.4, point 13).
export function catalogue() {
  return MODELS.map(m => ({
    id: m.id,
    type: MODEL_TYPE,
    nom: { ...m.nom },
    description: { ...m.description },
    etiquettes: m.etiquettes.map(e => ({ ...e })),
    vignette: m.vignette,
    tables: true,
  }));
}

// ───────────────────────── Contrôle du contenu des modèles ─────────────────────────
// Rend la liste des défauts trouvés (vide : tout est en règle). Appelée par la suite #test (tests.js) et par
// `tests/check-modeles.mjs`, qui y ajoute ce qui touche les fichiers (catalogue, vignettes). Les règles viennent du
// contrat de GFS (5.4, point 13) pour le catalogue, et de Form+ pour les questions.
const LANGS = ['fr', 'en'];
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const COL_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const KIND_IDS = new Set(['text', 'longtext', 'number', 'date', 'datetime', 'bool', 'select', 'multiselect', 'timeslot', 'scale', 'ranking', 'section', 'info', 'page']);
const LIST_KINDS = new Set(['select', 'multiselect', 'timeslot', 'ranking']);
export const MODEL_NAME_MAX = 60;
export const MODEL_DESCRIPTION_MAX = 140;

export function modelProblems(models = MODELS) {
  const out = [];
  const seenIds = new Set();
  const text = (v) => typeof v === 'string' && v.trim() !== '';
  models.forEach((m) => {
    const where = `« ${m.id} »`;
    if (!ID_RE.test(String(m.id))) out.push(`${where} : identifiant hors de la règle [a-z0-9][a-z0-9._-]{0,63}`);
    if (seenIds.has(m.id)) out.push(`${where} : identifiant en double`);
    seenIds.add(m.id);
    for (const lang of LANGS) {
      if (!text(m.nom?.[lang])) out.push(`${where} : nom ${lang} manquant`);
      else if (m.nom[lang].length > MODEL_NAME_MAX) out.push(`${where} : nom ${lang} de plus de ${MODEL_NAME_MAX} signes`);
      if (!text(m.description?.[lang])) out.push(`${where} : description ${lang} manquante`);
      else if (m.description[lang].length > MODEL_DESCRIPTION_MAX) out.push(`${where} : description ${lang} de plus de ${MODEL_DESCRIPTION_MAX} signes`);
      if (!text(m.table?.[lang])) out.push(`${where} : nom de table ${lang} manquant`);
      for (const k of ['title', 'description', 'endMessage']) if (!text(m.form?.[k]?.[lang])) out.push(`${where} : form.${k} ${lang} manquant`);
    }
    if (!Array.isArray(m.etiquettes) || !m.etiquettes.length) out.push(`${where} : aucune étiquette`);
    (m.etiquettes || []).forEach((e, i) => { for (const lang of LANGS) if (!text(e?.[lang])) out.push(`${where} : étiquette ${i + 1} ${lang} manquante`); });
    if (!/^[a-z0-9._-]+\.webp$/.test(String(m.vignette))) out.push(`${where} : vignette « ${m.vignette} » (un fichier .webp attendu)`);
    if (!Array.isArray(m.questions) || !m.questions.length) { out.push(`${where} : aucune question`); return; }
    if (!m.questions.some(q => !LAYOUT.has(q.kind))) out.push(`${where} : aucune question qui reçoive une réponse`);

    const byKey = new Map();
    for (const lang of LANGS) {
      const cols = new Set();
      m.questions.forEach((q) => {
        const qw = `${where} question « ${q.key} » (${lang})`;
        if (!q.key || (lang === 'fr' && byKey.has(q.key))) out.push(`${where} : clé de question absente ou en double (« ${q.key} »)`);
        if (lang === 'fr') byKey.set(q.key, q);
        if (!KIND_IDS.has(q.kind)) out.push(`${qw} : type « ${q.kind} » non retenu pour un modèle`);
        if (!text(q.label?.[lang])) out.push(`${qw} : libellé manquant`);
        if (LAYOUT.has(q.kind)) { if (q.col) out.push(`${qw} : un bloc de mise en page n'a pas de colonne`); return; }
        const col = q.col?.[lang];
        if (!COL_RE.test(String(col)) || String(col).toLowerCase() === 'id') out.push(`${qw} : colonne « ${col} » invalide`);
        else if (cols.has(col.toLowerCase())) out.push(`${qw} : colonne « ${col} » en double`);
        else cols.add(col.toLowerCase());
        if (LIST_KINDS.has(q.kind)) {
          const list = q.choices?.[lang];
          if (!Array.isArray(list) || list.length < 2 || list.some(c => !text(c))) out.push(`${qw} : au moins deux choix non vides attendus`);
          else if (new Set(list).size !== list.length) out.push(`${qw} : choix en double`);
          if (q.choices && q.choices.fr?.length !== q.choices.en?.length) out.push(`${qw} : les choix fr et en n'ont pas la même longueur`);
        } else if (q.choices) out.push(`${qw} : des choix sur un type qui n'en a pas`);
        if (q.kind === 'scale') {
          const s = q.scale;
          if (!s || !(s.max > s.min)) out.push(`${qw} : échelle sans bornes valides`);
        } else if (q.scale) out.push(`${qw} : une échelle sur un type qui n'en a pas`);
        if (q.display && !['radio', 'dropdown'].includes(q.display)) out.push(`${qw} : affichage « ${q.display} » inconnu`);
        if (q.showIf) {
          const src = m.questions.slice(0, m.questions.indexOf(q)).find(x => x.key === q.showIf.key);
          if (!src) out.push(`${qw} : la condition vise « ${q.showIf.key} », qui n'est pas une question précédente`);
          else if (!LIST_KINDS.has(src.kind) || !(src.choices?.[lang] || []).includes(q.showIf.equals?.[lang])) out.push(`${qw} : la condition n'est pas l'un des choix de « ${q.showIf.key} »`);
        }
      });
    }
  });
  return out;
}
