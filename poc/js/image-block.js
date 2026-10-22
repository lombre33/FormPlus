// Image attachée à la description d'une question (ou d'un bloc section/info) : un bloc à part,
// jamais incrustée dans le texte (la description reste un simple <textarea>/<input>, pas un
// éditeur riche) — voir config-editor.js (édition : coller ou choisir une pièce jointe Grist) et
// respond.js (rendu répondant). Partagé entre les deux pour que le marquage HTML et sa validation
// restent un seul endroit.

// Toujours réencodée en JPEG au moment de l'insertion (coller ou choisir une pièce jointe) et
// jamais stockée telle quelle : une capture d'écran collée depuis le presse-papiers pèse souvent
// plusieurs Mo en PNG, bien au-delà de ce qu'une image de description justifie une fois stockée
// en base64 dans la cellule Definition du document (voir FormPlus_Formulaires, grist-meta.js).
export const IMAGE_MAX_DIMENSION = 1200;
export const IMAGE_JPEG_QUALITY = 0.85;
export const IMAGE_MAX_DATA_URL_BYTES = 1_500_000;
export const IMAGE_WIDTH_PRESETS = [25, 50, 100];
export const IMAGE_DEFAULT_WIDTH = 50;

// Redimensionne (bornée au plus grand côté) et réencode en JPEG via un canvas hors-écran — la
// même méthode, quelle que soit la source (presse-papiers ou pièce jointe Grist téléchargée).
// Lève si le résultat reste trop lourd malgré la réduction (ex. photo très détaillée) : jamais
// stocké à moitié, l'appelant affiche un message plutôt que d'enregistrer une image inutilisable.
export async function blobToResizedDataUrl(blob) {
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, IMAGE_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', IMAGE_JPEG_QUALITY);
    if (dataUrl.length > IMAGE_MAX_DATA_URL_BYTES) throw new Error('image-too-large');
    return dataUrl;
  } finally {
    bitmap.close?.();
  }
}

// Seule forme jamais posée en `src` : data:image/<type>;base64,<caractères base64>. Aucune autre
// valeur n'est faite confiance, même si elle vient d'une cellule Definition déjà enregistrée (une
// modification manuelle de la table par quelqu'un d'autre ne doit jamais pouvoir glisser une URL
// arbitraire, encore moins javascript:, dans un attribut src rendu sans échappement par nature).
const DATA_URL_RE = /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/]+=*$/;

export function imageBlockHtml(image, extraClass) {
  if (!image?.dataUrl || !DATA_URL_RE.test(image.dataUrl)) return '';
  const width = IMAGE_WIDTH_PRESETS.includes(image.width) ? image.width : IMAGE_DEFAULT_WIDTH;
  return `<p class="qf-image-block${extraClass ? ` ${extraClass}` : ''}"><img src="${image.dataUrl}" alt="" style="width:${width}%"></p>`;
}
