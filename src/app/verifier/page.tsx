import { ScanLine } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const metadata: Metadata = { title: "Vérifier un document" };

export default async function VerifyFormPage({ searchParams }: PageProps<"/verifier">) {
  const { code } = await searchParams;
  const value = typeof code === "string" ? code.replace(/[\s-]/g, "").toUpperCase() : "";
  if (value) redirect(`/verifier/${encodeURIComponent(value)}`);
  return (
    <Card className="grid gap-4 p-6">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
        <ScanLine className="size-6" aria-hidden />
      </span>
      <div className="grid gap-1">
        <h1 className="text-lg font-semibold">Vérifier l&apos;authenticité d&apos;un document</h1>
        <p className="text-sm text-muted-foreground">
          Scannez le QR Code imprimé sur le document ou saisissez son code de vérification.
        </p>
      </div>
      <form className="grid gap-3" action="/verifier">
        <div className="grid gap-1.5">
          <Label htmlFor="code">Code de vérification</Label>
          <Input id="code" name="code" required autoComplete="off" placeholder="26 caractères" className="font-mono uppercase" />
        </div>
        <Button type="submit">Vérifier</Button>
      </form>
    </Card>
  );
}
