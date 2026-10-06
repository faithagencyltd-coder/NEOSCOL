"use client";

import { Download } from "lucide-react";
import { useState } from "react";

/** Télécharge le visuel en PNG : le SVG est dessiné dans un canvas par le navigateur (aucun service externe). */
export function KitPngButton({ href, width, height, name }: { href: string; width: number; height: number; name: string }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const svg = await (await fetch(href, { cache: "no-store" })).text();
      const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${name}.png`;
      a.click();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={download} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline disabled:opacity-50">
      <Download className="size-3.5" aria-hidden /> {busy ? "Préparation…" : "PNG"}
    </button>
  );
}
