import { Children, type ReactNode } from "react";

import { W } from "@/components/shared/wording";

/** Enveloppe les textes simples d'un contenu pour qu'ils suivent le vocabulaire du module. */
export function worded(children: ReactNode): ReactNode {
  return Children.map(children, (child) => (typeof child === "string" && child.trim() ? <W text={child} /> : child));
}
