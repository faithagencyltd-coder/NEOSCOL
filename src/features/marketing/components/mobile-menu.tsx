"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type Item = { href: string; label: string };

/**
 * Menu mobile plein écran du site. Rendu directement dans <body> : la barre du
 * haut a un flou d'arrière-plan (backdrop-filter), qui enfermerait sinon ce
 * panneau « fixed » dans sa hauteur et laisserait le reste transparent.
 */
export function MobileMenu({ labels, nav, sectors, demoHref, loginHref }: { labels: { menu: string; close: string; login: string; demo: string; solutions: string }; nav: Item[]; sectors: Item[]; demoHref: string; loginHref: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex size-10 items-center justify-center rounded-xl text-[#0b2559] hover:bg-[#0b2559]/5 lg:hidden" aria-label={labels.menu} aria-expanded={open}>
        <Menu className="size-5" aria-hidden />
      </button>
      {open
        ? createPortal(
            <div role="dialog" aria-modal="true" aria-label={labels.menu} data-testid="site-mobile-menu" className="anim-fade fixed inset-0 z-[70] flex flex-col overflow-y-auto overscroll-contain bg-[#07142b] p-5 text-white lg:hidden">
              <div className="flex justify-end">
                <button type="button" onClick={() => setOpen(false)} className="flex size-11 items-center justify-center rounded-xl bg-white/10" aria-label={labels.close}>
                  <X className="size-5" aria-hidden />
                </button>
              </div>
              <nav className="mt-4 grid gap-1 text-lg font-semibold">
                <span className="px-3 pt-2 text-xs uppercase tracking-wider text-sky-200/60">{labels.solutions}</span>
                {sectors.map((s) => (
                  <Link key={s.href} href={s.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 hover:bg-white/10">
                    {s.label}
                  </Link>
                ))}
                <span className="my-2 h-px bg-white/10" />
                {nav.map((s) => (
                  <Link key={s.href} href={s.href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2.5 hover:bg-white/10">
                    {s.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-auto grid gap-2 pt-6">
                <Link href={demoHref} onClick={() => setOpen(false)} className="rounded-xl bg-white px-4 py-3 text-center font-semibold text-[#0b2559]">
                  {labels.demo}
                </Link>
                <Link href={loginHref} className="rounded-xl border border-white/20 px-4 py-3 text-center font-semibold">
                  {labels.login}
                </Link>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
