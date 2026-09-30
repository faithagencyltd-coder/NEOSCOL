import { Building2, GraduationCap, History, Mail, MapPin, Phone, Globe } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PortalSchoolRecord } from "@/features/portal/queries";
import { ENROLLMENT_STATUS, ENROLLMENT_TYPE } from "@/lib/labels";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { ORGANIZATION_TYPE_LABELS, type Vocabulary } from "@/lib/vocabulary";

/** Classe ou formation de l'année en cours (formation = programme + session). */
export function currentPlacement(record: PortalSchoolRecord, v: Vocabulary): string {
  const current = record.years.find((y) => y.is_current && y.enrollment_status === "validated") ?? record.years[0];
  if (!current) return `${v.klass} non affectée`;
  const parts = v.family === "training" ? [current.program, current.class ? `${v.klass} ${current.class}` : null, current.group] : [current.class, current.level, current.program, current.track];
  return parts.filter(Boolean).join(" · ") || `${v.klass} non affectée`;
}

/** Fiche de l'établissement (coordonnées, année en cours). */
export function OrganizationCard({ record }: { record: PortalSchoolRecord }) {
  const o = record.organization;
  const address = [o.address, o.city, o.country].filter(Boolean).join(", ");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="size-4 text-primary" aria-hidden /> Mon établissement
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <p className="font-semibold">{o.name}</p>
        <p className="text-muted-foreground">
          {ORGANIZATION_TYPE_LABELS[o.type] ?? o.type}
          {o.current_year ? ` · année en cours ${o.current_year}` : ""}
        </p>
        <ul className="grid gap-1.5">
          {address ? (
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /> {address}
            </li>
          ) : null}
          {o.phone ? (
            <li className="flex items-center gap-2">
              <Phone className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <a href={`tel:${o.phone.replace(/\s+/g, "")}`} className="hover:text-primary">
                {o.phone}
              </a>
            </li>
          ) : null}
          {o.email ? (
            <li className="flex items-center gap-2">
              <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <a href={`mailto:${o.email}`} className="break-all hover:text-primary">
                {o.email}
              </a>
            </li>
          ) : null}
          {o.website ? (
            <li className="flex items-center gap-2">
              <Globe className="size-4 shrink-0 text-muted-foreground" aria-hidden /> <span className="break-all">{o.website}</span>
            </li>
          ) : null}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Historique scolaire : inscriptions de toutes les années, résultats annuels validés, anciennes années importées. */
export function SchoolHistory({ record, vocabulary: v }: { record: PortalSchoolRecord; vocabulary: Vocabulary }) {
  if (record.years.length === 0 && record.history.length === 0) {
    return <EmptyState icon={History} title="Aucun historique" description="Les inscriptions et résultats de chaque année apparaîtront ici." />;
  }
  return (
    <div className="grid gap-4">
      {record.years.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="size-4 text-primary" aria-hidden /> Parcours dans l&apos;établissement
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3">
              {record.years.map((y, i) => {
                const status = ENROLLMENT_STATUS[y.enrollment_status];
                return (
                  <li key={`${y.academic_year}-${i}`} className="grid gap-1.5 rounded-xl border border-border bg-background p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{y.academic_year}</span>
                      {y.is_current ? <Badge tone="info">En cours</Badge> : null}
                      {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
                      <span className="text-xs text-muted-foreground">{ENROLLMENT_TYPE[y.enrollment_type] ?? y.enrollment_type}</span>
                    </div>
                    <p>
                      {v.family === "training"
                        ? [y.program, y.class ? `${v.klass} ${y.class}` : null, y.group].filter(Boolean).join(" · ")
                        : [y.class, y.level, y.program, y.track].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {y.result ? (
                      <p className="text-muted-foreground">
                        Résultat annuel :{" "}
                        <strong className="text-foreground">
                          {y.result.average !== null ? `${formatNumber(Number(y.result.average))}/20` : "—"}
                        </strong>
                        {y.result.rank ? ` · rang ${y.result.rank}` : ""}
                        {y.result.mention ? ` · ${y.result.mention}` : ""}
                        {y.result.decision ? ` · décision : ${y.result.decision}` : ""}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{y.is_current ? "Résultat annuel à venir." : "Aucun résultat annuel validé."}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {y.report_cards > 0 ? `${y.report_cards} bulletin(s) publié(s)` : "Aucun bulletin publié"}
                      {y.decided_at ? ` · inscription validée le ${formatDate(y.decided_at)}` : ""}
                    </p>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : null}
      {record.history.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-primary" aria-hidden /> Années antérieures
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2">
              {record.history.map((h, i) => (
                <li key={`${h.year_label}-${i}`} className="grid gap-1 rounded-xl border border-border bg-background p-3 text-sm">
                  <span className="font-semibold">{h.year_label}</span>
                  <span>{[h.class, h.level, h.program].filter(Boolean).join(" · ") || "—"}</span>
                  <span className="text-muted-foreground">
                    {[
                      h.average !== null ? `moyenne ${formatNumber(Number(h.average))}/20` : null,
                      h.rank ? `rang ${h.rank}` : null,
                      h.decision ? `décision : ${h.decision}` : null,
                      h.absences !== null ? `${h.absences} absence(s)${h.absences_justified ? ` dont ${h.absences_justified} justifiée(s)` : ""}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
