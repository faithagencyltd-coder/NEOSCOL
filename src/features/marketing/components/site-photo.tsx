import Image from "next/image";

import { photoSrc, SITE_PHOTOS, type SitePhotoName } from "@/features/marketing/visuals";
import { cn } from "@/lib/utils/cn";

/**
 * Photo réelle de la bibliothèque NEOSCOOL (WebP optimisé, tailles adaptées
 * à l'écran). `fill` : remplit son conteneur avec un cadrage choisi par emplacement.
 */
export function SitePhoto({
  name,
  locale = "fr",
  className,
  imgClassName,
  sizes = "100vw",
  priority = false,
  fill = false,
  position,
  decorative = false,
}: {
  name: SitePhotoName;
  locale?: "fr" | "en";
  className?: string;
  imgClassName?: string;
  sizes?: string;
  priority?: boolean;
  fill?: boolean;
  position?: string;
  decorative?: boolean;
}) {
  const p = SITE_PHOTOS[name];
  const width = p.widths[p.widths.length - 1]!;
  const alt = decorative ? "" : p.alt[locale];
  if (fill) {
    return (
      <div className={cn("relative overflow-hidden", className)}>
        <Image src={photoSrc(name)} alt={alt} fill sizes={sizes} priority={priority} className={cn("object-cover", imgClassName)} style={position ? { objectPosition: position } : undefined} />
      </div>
    );
  }
  return (
    <Image src={photoSrc(name)} alt={alt} width={width} height={Math.round(width / p.ratio)} sizes={sizes} priority={priority} className={cn("h-auto w-full", className, imgClassName)} />
  );
}
