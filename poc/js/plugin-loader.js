// Liste blanche des origines Grist de confiance : docs.getgrist.com par défaut, plus toute
// instance self-hosted qu'Antoine (ou qui que ce soit déployant son propre fork) ajoute ici.
// Volontairement dans le CODE SOURCE, jamais lue depuis un paramètre d'URL du widget : cette URL
// fait partie de l'iframe que la page qui encadre le widget choisit elle-même, donc un paramètre
// serait sous le contrôle de l'attaquant décrit ci-dessous, pas une protection contre lui.
const TRUSTED_ORIGINS = ['https://docs.getgrist.com'];

// Charge grist-plugin-api.js depuis l'origine Grist qui héberge ce widget (déduite du référent),
// avec repli sur docs.getgrist.com si le référent est absent, hors liste blanche, ou différent
// (essai manuel hors iframe, ou instance qui ne sert pas ce fichier à la même adresse). Sans cette
// liste blanche, n'importe quelle page tierce qui met ce widget dans une iframe ferait charger,
// avec les pleins privilèges de l'origine du widget, un grist-plugin-api.js entièrement fourni par
// cette page tierce — capable de définir un faux window.grist et de piloter tout le widget hors de
// tout document Grist réel (audit du 21 sept 2026, bug #12).
// Consigne GFS 018 : l'évènement "load" d'un <script> se déclenche même quand son contenu a
// planté à l'exécution (ex. un eval() bloqué par la CSP, panne vue par le porteur le 04/11) -
// window.grist reste alors vide, et grist.ready() (main.js) plante plus loin sans rien dire.
// Fonction pure, testable seule (tests.js) sans vraiment charger de script.
export function isPluginApiReady() {
  return !!(window.grist && typeof window.grist.ready === 'function');
}

export function loadPluginApi() {
  return new Promise((resolve) => {
    let origin = 'https://docs.getgrist.com';
    try {
      if (document.referrer) {
        const refOrigin = new URL(document.referrer).origin;
        if (TRUSTED_ORIGINS.includes(refOrigin)) origin = refOrigin;
      }
    } catch (e) { /* ignore */ }
    // true : chargé et prêt. null : chargé mais planté à l'exécution (voir isPluginApiReady).
    // false : jamais chargé (réseau, 404, CSP qui bloque le <script> lui-même).
    const tryLoad = (src, next) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => resolve(isPluginApiReady() ? true : null); s.onerror = next;
      document.head.appendChild(s);
    };
    tryLoad(`${origin}/grist-plugin-api.js`, () =>
      origin === 'https://docs.getgrist.com' ? resolve(false) : tryLoad('https://docs.getgrist.com/grist-plugin-api.js', () => resolve(false)));
  });
}
