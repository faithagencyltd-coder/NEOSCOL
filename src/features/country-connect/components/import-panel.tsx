"use client";

import { CheckCircle2, FileCheck2, Upload } from "lucide-react";
import { useState, useTransition } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

import { runCountryImport } from "../actions";
import type { CcImportResult } from "../types";

const STATUS: Record<CcImportResult["report"][number]["status"], { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  ok: { label: "Valide", tone: "success" },
  warning: { label: "À vérifier", tone: "warning" },
  unchanged: { label: "Déjà à jour", tone: "neutral" },
  error: { label: "Erreur", tone: "danger" },
};

/**
 * Import d'un fichier national en deux temps : vérification (rien n'est
 * modifié) puis application du même fichier. Seul l'identifiant national est
 * écrit ; les lignes en erreur sont ignorées.
 */
export function CountryImportPanel({ mappings, label }: { mappings: { id: string; name: string }[]; label: string }) {
  const [mappingId, setMappingId] = useState(mappings[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<CcImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (apply: boolean) => {
    if (!file) return setError("Choisissez le fichier reçu (Excel .xlsx ou CSV).");
    if (!mappingId) return setError("Choisissez une correspondance d'import.");
    const fd = new FormData();
    fd.set("mapping_id", mappingId);
    fd.set("file", file);
    fd.set("apply", apply ? "1" : "0");
    setError(null);
    startTransition(async () => {
      const res = await runCountryImport(fd);
      notifyResult(res);
      if (!res.ok || !res.data) {
        setError(res.ok ? "Traitement impossible." : res.message);
        return;
      }
      setResult(res.data);
    });
  };

  const lower = label === label.toUpperCase() ? label : label.toLowerCase();
  const checked = result && !result.applied;
  const applicable = checked && result.ok > 0;

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="cc-mapping">Correspondance</Label>
          <Select
            id="cc-mapping"
            value={mappingId}
            onChange={(e) => {
              setMappingId(e.target.value);
              setResult(null);
            }}
          >
            {mappings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cc-file">Fichier reçu (Excel ou CSV)</Label>
          <Input
            id="cc-file"
            type="file"
            accept=".xlsx,.csv,text/csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </div>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => run(false)} disabled={pending || !file}>
          <FileCheck2 aria-hidden /> Vérifier le fichier
        </Button>
        <Button type="button" onClick={() => run(true)} disabled={pending || !applicable}>
          <Upload aria-hidden /> Enregistrer les {result && !result.applied ? result.ok : ""} identifiant(s) valides
        </Button>
      </div>

      {result ? (
        <div className="grid gap-3" aria-live="polite">
          <Alert tone={result.applied ? "success" : result.errors > 0 ? "warning" : "info"} title={result.applied ? "Import appliqué" : "Vérification terminée — rien n'a été modifié"}>
            {result.total} ligne(s) lue(s) : {result.ok} valide(s), {result.errors} en erreur
            {result.applied ? `, ${result.updated} ${lower}(s) enregistré(s).` : ". Les lignes en erreur seront ignorées."}
          </Alert>
          <div className="max-h-[28rem] overflow-auto rounded-xl border border-border">
            <Table>
              <THead>
                <tr>
                  <TH>Ligne</TH>
                  <TH>Élève</TH>
                  <TH>{label}</TH>
                  <TH>Résultat</TH>
                </tr>
              </THead>
              <tbody>
                {result.report.map((r) => (
                  <TR key={`${r.line}-${r.national_id}`} data-cc-status={r.status}>
                    <TD className="tabular-nums">{r.line}</TD>
                    <TD>{r.student ?? "—"}</TD>
                    <TD className="font-mono text-xs">{r.national_id ?? "—"}</TD>
                    <TD>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge tone={STATUS[r.status].tone}>
                          {r.status === "ok" && result.applied ? <CheckCircle2 className="size-3" aria-hidden /> : null}
                          {STATUS[r.status].label}
                        </Badge>
                        {r.message ? <span className="text-xs text-muted-foreground">{r.message}</span> : null}
                      </span>
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          </div>
          {result.total > result.report.length ? (
            <p className="text-xs text-muted-foreground">Seules les {result.report.length} premières lignes sont détaillées.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
