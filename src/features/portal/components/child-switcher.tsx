"use client";

import { useTransition } from "react";

import { Avatar } from "@/components/ui/avatar";
import { selectChild } from "@/features/portal/actions";
import { cn } from "@/lib/utils/cn";

/** Sélecteur d'enfant (parent ayant plusieurs enfants dans l'établissement). */
export function ChildSwitcher({
  students,
  selectedId,
}: {
  students: { id: string; first_name: string; last_name: string; class_name: string | null; photo_path: string | null }[];
  selectedId: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div role="radiogroup" aria-label="Enfant affiché" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-busy={pending}>
      {students.map((s) => {
        const selected = s.id === selectedId;
        const name = `${s.first_name} ${s.last_name}`;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={pending}
            onClick={() => !selected && startTransition(() => selectChild(s.id))}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-2xl border px-3 py-2 text-left transition-colors disabled:opacity-70",
              selected ? "border-white/50 bg-white text-[#0b2559] shadow" : "border-white/20 bg-white/10 text-white hover:bg-white/20",
            )}
          >
            <Avatar name={name} photoId={s.photo_path} className="size-8 text-xs" />
            <span className="grid leading-tight">
              <span className="text-sm font-semibold">{s.first_name}</span>
              <span className={cn("text-xs", selected ? "text-[#5b6b8c]" : "text-white/70")}>{s.class_name ?? "Non affecté"}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
