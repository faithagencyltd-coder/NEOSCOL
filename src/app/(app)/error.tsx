"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Card className="mx-auto grid max-w-md gap-4 p-6 text-center">
      <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <div className="grid gap-1">
        <h1 className="text-lg font-semibold">Une erreur est survenue</h1>
        <p className="text-sm text-muted-foreground">Le contenu n&apos;a pas pu être chargé. Réessayez dans un instant.</p>
      </div>
      <Button onClick={reset} variant="secondary" className="mx-auto">
        <RotateCcw aria-hidden /> Réessayer
      </Button>
    </Card>
  );
}
