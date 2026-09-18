import { $ } from './dom.js';
import { myPageFromReferrer } from './links.js';

// ───────────────────────── Diagnostic ─────────────────────────

export const urlParams = new URLSearchParams(location.search);
export const hashParams = new URLSearchParams(location.hash.replace(/^#/, ''));
export const fragmentFormLink = hashParams.get('form');

export function diag(extra) {
  let referrerOrigin = null;
  try { referrerOrigin = document.referrer ? new URL(document.referrer).origin : null; } catch (e) { /* ignore */ }
  const d = { referrerOrigin, myPageFromReferrer: myPageFromReferrer(), access: urlParams.get('access'), readonly: urlParams.get('readonly'), fragmentFormLink: !!fragmentFormLink, ...extra };
  console.log('[FormPlus]', JSON.stringify(d));
  const text = JSON.stringify(d, null, 2);
  const el = $('diag'); if (el) el.textContent = text;
  const elFill = $('diag-fill'); if (elFill) elFill.textContent = text;
  return d;
}
