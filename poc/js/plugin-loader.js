// Charge grist-plugin-api.js depuis l'origine Grist qui héberge ce widget (déduite du référent),
// avec repli sur docs.getgrist.com si le référent est absent ou différent (essai manuel hors
// iframe, ou instance qui ne sert pas ce fichier à la même adresse).
export function loadPluginApi() {
  return new Promise((resolve) => {
    let origin = 'https://docs.getgrist.com';
    try { if (document.referrer) origin = new URL(document.referrer).origin; } catch (e) { /* ignore */ }
    const tryLoad = (src, next) => {
      const s = document.createElement('script');
      s.src = src; s.onload = () => resolve(true); s.onerror = next;
      document.head.appendChild(s);
    };
    tryLoad(`${origin}/grist-plugin-api.js`, () =>
      origin === 'https://docs.getgrist.com' ? resolve(false) : tryLoad('https://docs.getgrist.com/grist-plugin-api.js', () => resolve(false)));
  });
}
