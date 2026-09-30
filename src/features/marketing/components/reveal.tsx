"use client";

import { useEffect, useRef, type ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/** Apparition douce au défilement (visible d'emblée si le mouvement est réduit). */
export function Reveal({ className, delay = 0, as: Tag = "div", style, ...props }: ComponentProps<"div"> & { delay?: number; as?: "div" | "section" | "li" | "article" }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.dataset.visible = "true";
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = "true";
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const Component = Tag as "div";
  return <Component ref={ref} className={cn("site-reveal", className)} style={{ "--delay": `${delay}ms`, ...style } as React.CSSProperties} {...props} />;
}

/** Vrai tant que l'élément est à l'écran : les animations en boucle ne tournent que visibles. */
export function useInView<T extends HTMLElement>(ref: React.RefObject<T | null>, onChange: (visible: boolean) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return onChange(true);
    const io = new IntersectionObserver(([entry]) => onChange(Boolean(entry?.isIntersecting)), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref]);
}
