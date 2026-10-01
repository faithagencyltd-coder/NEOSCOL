import { ArrowLeft, Image as ImageIcon, Shapes } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ILLUSTRATIONS, type IllustrationName } from "@/components/illustrations/scenes";
import { Badge } from "@/components/ui/badge";
import { SitePhoto } from "@/features/marketing/components/site-photo";
import { ILLUSTRATION_USES, SITE_PHOTOS, type SitePhotoName } from "@/features/marketing/visuals";

export const metadata: Metadata = { title: "Bibliothèque visuelle — Plateforme" };

/**
 * Bibliothèque visuelle du site et de l'application : photos réelles et
 * illustrations NEOSCOOL, avec la fonction et les emplacements de chacune.
 */
export default function VisualLibraryPage() {
  return (
    <div className="grid min-w-0 gap-8 [&>*]:min-w-0" data-testid="visual-library">
      <div className="grid gap-2">
        <Link href="/plateforme/site-web" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Site web
        </Link>
        <h2 className="text-2xl font-bold">Bibliothèque visuelle</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Photos réelles (authenticité, confiance) et illustrations NEOSCOOL (explication, identité), réparties avec une fonction précise. Style des
          illustrations : bleu nuit, bleu et cyan avec accent ambre, cartes d&apos;interface arrondies, personnages simplifiés dans l&apos;uniforme des photos.
        </p>
      </div>

      <section className="grid gap-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <ImageIcon className="size-5 text-primary" aria-hidden /> Photos ({Object.keys(SITE_PHOTOS).length})
        </h3>
        <ul className="grid gap-5 md:grid-cols-3">
          {(Object.keys(SITE_PHOTOS) as SitePhotoName[]).map((name) => {
            const p = SITE_PHOTOS[name];
            return (
              <li key={name} className="hover-lift grid content-start gap-3 overflow-hidden rounded-3xl border border-border bg-surface" data-photo={name}>
                <div className={p.transparent ? "bg-[repeating-conic-gradient(#eef3fb_0%_25%,#fff_0%_50%)] bg-[length:20px_20px]" : ""}>
                  <SitePhoto name={name} sizes="(min-width: 768px) 33vw, 100vw" className={p.transparent ? "mx-auto max-h-72 w-auto" : "aspect-[3/2] object-cover"} />
                </div>
                <div className="grid gap-2 p-4 pt-1">
                  <p className="font-mono text-xs text-muted-foreground">{name}.webp · {p.widths.join(" / ")} px</p>
                  <p className="text-sm">{p.subject}</p>
                  <p className="text-xs text-muted-foreground">{p.framing}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {p.usedIn.map((u) => (
                      <Badge key={u} tone="info">
                        {u}
                      </Badge>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-4">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <Shapes className="size-5 text-primary" aria-hidden /> Illustrations NEOSCOOL ({Object.keys(ILLUSTRATIONS).length})
        </h3>
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(Object.keys(ILLUSTRATIONS) as IllustrationName[]).map((name) => {
            const Illustration = ILLUSTRATIONS[name];
            const use = ILLUSTRATION_USES[name];
            return (
              <li key={name} className="hover-lift grid content-start gap-2 rounded-3xl border border-border bg-surface p-4" data-illustration={name}>
                <Illustration title={use.label} />
                <p className="font-semibold">{use.label}</p>
                <div className="flex flex-wrap gap-1.5">
                  {use.usedIn.map((u) => (
                    <Badge key={u} tone="neutral">
                      {u}
                    </Badge>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
