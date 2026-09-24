"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils/cn";

/** Photo qui apparaît en fondu une fois chargée (fond neutre en attendant ; erreur → affichée quand même). */
export function AvatarPhoto({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <Image
      src={src}
      alt={alt}
      width={160}
      height={160}
      unoptimized
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
      // Image déjà en cache (chargée avant l'hydratation) : pas d'événement load, on l'affiche directement.
      ref={(img) => {
        if (img?.complete && img.naturalWidth > 0) setLoaded(true);
      }}
      className={cn(
        "size-9 shrink-0 rounded-full bg-surface-muted object-cover transition-[opacity,filter] duration-500 ease-out motion-reduce:transition-none",
        loaded ? "opacity-100 blur-0" : "opacity-0 blur-sm",
        className,
      )}
    />
  );
}
