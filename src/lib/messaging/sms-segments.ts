/**
 * Nombre de SMS facturés pour un texte : 160 caractères (alphabet GSM standard)
 * ou 70 (accents spéciaux, emojis) pour un seul SMS ; au-delà, le message est
 * découpé en parties de 153 ou 67 caractères. Utilisé pour le devis affiché
 * avant l'envoi et pour le décompte réel.
 */
const GSM7 = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà".split(""),
);
const GSM7_EXTENDED = new Set("^{}\\[~]|€".split(""));

export function smsSegments(text: string): number {
  if (!text) return 0;
  let gsm = true;
  let length = 0;
  for (const char of text) {
    if (GSM7.has(char)) length += 1;
    else if (GSM7_EXTENDED.has(char)) length += 2;
    else {
      gsm = false;
      break;
    }
  }
  if (!gsm) {
    const units = [...text].length;
    return units <= 70 ? 1 : Math.ceil(units / 67);
  }
  return length <= 160 ? 1 : Math.ceil(length / 153);
}
