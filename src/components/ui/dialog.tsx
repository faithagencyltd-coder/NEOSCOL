"use client";

import { X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export const Dialog = Primitive.Root;
export const DialogTrigger = Primitive.Trigger;
export const DialogClose = Primitive.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  variant = "modal",
  ...props
}: ComponentProps<typeof Primitive.Content> & { title: string; description?: string; children: ReactNode; variant?: "modal" | "drawer" }) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="overlay-anim fixed inset-0 z-40 bg-[#0b1f4d]/40 backdrop-blur-[3px]" />
      <Primitive.Content
        className={cn(
          variant === "drawer"
            ? "drawer-anim fixed inset-y-0 right-0 z-50 grid h-dvh w-full max-w-xl content-start gap-5 overflow-y-auto border-l border-border bg-surface p-6 shadow-2xl"
            : "modal-anim fixed left-1/2 top-1/2 z-50 grid max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl",
          className,
        )}
        {...props}
      >
        <div className="grid gap-1 pr-8">
          <Primitive.Title className="font-display text-lg font-semibold">{title}</Primitive.Title>
          {description ? (
            <Primitive.Description className="text-sm text-muted-foreground">{description}</Primitive.Description>
          ) : (
            <Primitive.Description className="sr-only">{title}</Primitive.Description>
          )}
        </div>
        {children}
        <Primitive.Close
          className="absolute right-4 top-4 flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:rotate-90 hover:bg-surface-muted hover:text-foreground"
          aria-label="Fermer"
        >
          <X className="size-4" />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
