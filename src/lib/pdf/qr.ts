import "server-only";

import QRCode from "qrcode";

/** QR Code en data URL (PNG) pour les documents PDF. */
export function qrDataUrl(text: string, dark = "#0B1F3A"): Promise<string> {
  return QRCode.toDataURL(text, { margin: 0, width: 320, errorCorrectionLevel: "M", color: { dark, light: "#FFFFFF" } });
}
