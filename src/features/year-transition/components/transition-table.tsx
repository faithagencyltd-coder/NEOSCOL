"use client";

import { UserCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { notifyResult } from "@/components/motion/animated-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";

import { createReenrollments } from "../actions";

export type Proposal = {
  student_id: string;
  student_name: string;
  matricule: string;
  from_class: string;
  decision_label: string | null;
  result_status: string | null;
  average: number | null;
  action: "promote" | "repeat" | "leave" | "graduate" | "undecided";
  target_class_id: string | null;
  next_enrollment: string | null;
};

export const ACTIONS: Record<Proposal["action"], { label: string; tone: "success" | "warning" | "danger" | "primary" | "neutral" }> = {
  promote: { label: "Passage", tone: "success" },
  repeat: { label: "Redoublement", tone: "warning" },
  leave: { label: "Départ", tone: "danger" },
  graduate: { label: "Fin de cycle", tone: "primary" },
  undecided: { label: "À décider", tone: "neutral" },
};

/**
 * Propositions de passage : les élèves admis ou redoublants sont cochés avec
 * leur classe cible ; les autres restent à décider. Rien n'est créé avant
 * « Créer les réinscriptions » (inscriptions en attente, validées ensuite).
 */
export function TransitionTable({ proposals, classes, nextYear }: { proposals: Proposal[]; classes: { id: string; name: string }[]; nextYear: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const open = proposals.filter((p) => !p.next_enrollment);
  const [targets, setTargets] = useState<Record<string, string>>(() => Object.fromEntries(open.map((p) => [p.student_id, p.target_class_id ?? ""])));
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(open.filter((p) => (p.action === "promote" || p.action === "repeat") && p.target_class_id).map((p) => p.student_id)),
  );
  const ready = useMemo(() => [...selected].filter((id) => targets[id]), [selected, targets]);
  const toggle = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const submit = () =>
    startTransition(async () => {
      const result = await createReenrollments(ready.map((id) => ({ student_id: id, class_id: targets[id] ?? "" })));
      notifyResult(result);
      if (result.ok) router.refresh();
    });

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-xl border border-border">
        <Table>
          <THead>
            <tr>
              <TH className="w-10">
                <input
                  type="checkbox"
                  aria-label="Tout sélectionner"
                  checked={open.length > 0 && open.every((p) => selected.has(p.student_id))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(open.map((p) => p.student_id)) : new Set())}
                />
              </TH>
              <TH>Élève</TH>
              <TH className="hidden md:table-cell">Classe actuelle</TH>
              <TH>Décision</TH>
              <TH>Classe en {nextYear}</TH>
            </tr>
          </THead>
          <tbody>
            {proposals.map((p) => {
              const done = Boolean(p.next_enrollment);
              return (
                <TR key={p.student_id} data-action={p.action}>
                  <TD>
                    {done ? (
                      <UserCheck className="size-4 text-success" aria-label="Déjà réinscrit(e)" />
                    ) : (
                      <input type="checkbox" aria-label={`Sélectionner ${p.student_name}`} checked={selected.has(p.student_id)} onChange={(e) => toggle(p.student_id, e.target.checked)} />
                    )}
                  </TD>
                  <TD>
                    <span className="font-medium">{p.student_name}</span>
                    <span className="block font-mono text-xs text-muted-foreground">{p.matricule}</span>
                  </TD>
                  <TD className="hidden md:table-cell">{p.from_class}</TD>
                  <TD>
                    <span className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge tone={ACTIONS[p.action].tone}>{ACTIONS[p.action].label}</Badge>
                      {p.average !== null ? <span className="tabular-nums">{Number(p.average).toFixed(2)}</span> : null}
                      {p.result_status === "draft" ? <span className="text-muted-foreground">(non validé)</span> : null}
                    </span>
                  </TD>
                  <TD>
                    {done ? (
                      <span className="text-xs text-muted-foreground">{p.next_enrollment}</span>
                    ) : (
                      <Select
                        aria-label={`Classe cible de ${p.student_name}`}
                        value={targets[p.student_id] ?? ""}
                        onChange={(e) => setTargets((t) => ({ ...t, [p.student_id]: e.target.value }))}
                        className="min-w-32"
                      >
                        <option value="">— Ne pas réinscrire</option>
                        {classes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </Select>
                    )}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={submit} disabled={pending || ready.length === 0}>
          <UserCheck aria-hidden /> Créer {ready.length} réinscription(s)
        </Button>
        <p className="text-xs text-muted-foreground">Les réinscriptions sont créées « en attente » : validation et facture par le circuit habituel des inscriptions.</p>
      </div>
    </div>
  );
}
