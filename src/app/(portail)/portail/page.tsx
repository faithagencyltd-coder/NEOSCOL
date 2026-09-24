import { AlertTriangle, CalendarClock, CheckCircle2, FileText, Megaphone, NotebookPen, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getVisibleAnnouncements } from "@/features/dashboard/queries";
import { requirePortal } from "@/features/portal/context";
import { getPortalTimetable, getStudentAttendance, getStudentGrades } from "@/features/portal/queries";
import { isoWeekday, todayIn } from "@/lib/dates";
import { ATTENDANCE_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils/cn";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { AnimatedCounter, AnimatedMoney } from "@/components/motion/animated-counter";

export const metadata: Metadata = { title: "Portail" };

const FEATURE_LABELS = { grades: "Notes", report_cards: "Bulletins", documents: "Documents", timetable: "Emploi du temps" } as const;

export default async function PortalHomePage() {
  const { organization, parent, student, status } = await requirePortal();
  if (!student) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Aucun dossier rattaché"
        description="Votre compte n'est encore rattaché à aucun élève. Contactez le secrétariat de l'établissement."
      />
    );
  }
  const today = todayIn(organization.timezone);
  const currency = organization.currency;
  const [attendance, grades, slots, announcements] = await Promise.all([
    getStudentAttendance(organization.id, student.id, 300),
    getStudentGrades(organization.id, student.id),
    getPortalTimetable(student.id),
    getVisibleAnnouncements(organization.id),
  ]);
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const recent = attendance.filter((a) => a.date >= since);
  const absences = recent.filter((a) => a.status === "absent").length;
  const lates = recent.filter((a) => a.status === "late").length;
  const unjustified = attendance.filter((a) => a.status === "absent" && !a.isJustified).length;
  const todaySlots = slots.filter((s) => s.weekday === isoWeekday(today));
  const locked = status ? (Object.keys(FEATURE_LABELS) as (keyof typeof FEATURE_LABELS)[]).filter((f) => status.features[f]) : [];
  const name = `${student.first_name} ${student.last_name}`;

  return (
    <>
      <Card className="flex items-center gap-4 p-4">
        <Avatar name={name} photoId={student.photo_path} className="size-14 text-lg" />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h1 className="truncate text-lg font-bold">{student.is_self ? `Bonjour ${student.first_name}` : name}</h1>
          <p className="text-sm text-muted-foreground">
            {student.class_name ?? "Classe non affectée"} · {student.matricule}
          </p>
        </div>
      </Card>

      {status?.restricted ? (
        <div role="alert" className="grid gap-3 rounded-2xl border border-warning/30 bg-warning-soft p-4 text-warning">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-5 shrink-0" aria-hidden />
            Accès partiellement restreint pour impayé
          </p>
          <p className="text-sm text-foreground">
            Montant échu non réglé : <strong>{formatMoney(status.overdue_amount, currency)}</strong>.
            {locked.length ? ` Suspendu : ${locked.map((f) => FEATURE_LABELS[f]).join(", ")}.` : ""} Les présences restent toujours visibles et
            aucune donnée n&apos;est supprimée ; l&apos;accès est rétabli immédiatement après l&apos;enregistrement du paiement par l&apos;établissement.
          </p>
          {parent ? (
            <Link href="/portail/finances" className="justify-self-start rounded-xl bg-warning px-4 py-2 text-sm font-semibold text-white">
              Voir les factures et échéances
            </Link>
          ) : null}
        </div>
      ) : status && status.overdue_amount > 0 && parent ? (
        <div className="flex items-start gap-3 rounded-2xl border border-danger/20 bg-danger-soft p-4 text-sm">
          <Wallet className="size-5 shrink-0 text-danger" aria-hidden />
          <p>
            Échéance dépassée : <strong>{formatMoney(status.overdue_amount, currency)}</strong> à régler.{" "}
            <Link href="/portail/finances" className="font-semibold text-primary hover:underline">
              Détails
            </Link>
          </p>
        </div>
      ) : null}

      <section aria-label="Indicateurs" className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Absences (30 j)" value={absences} tone={absences ? "danger" : "success"} />
        <Stat label="Retards (30 j)" value={lates} tone={lates ? "warning" : "success"} />
        <Stat label="Absences non justifiées" value={unjustified} tone={unjustified ? "danger" : "success"} />
        {parent && status ? (
          <Stat label="Reste à payer" value={{ amount: status.balance, currency }} tone={status.balance > 0 ? "warning" : "success"} />
        ) : (
          <Stat label="Notes publiées" value={status?.features.grades ? "—" : grades.length} tone="primary" />
        )}
      </section>

      <div className="stagger grid grid-cols-1 gap-5 md:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-primary" aria-hidden /> Aujourd&apos;hui
            </CardTitle>
            <Link href="/portail/emploi-du-temps" className="text-sm font-medium text-primary hover:underline">
              Semaine
            </Link>
          </CardHeader>
          <CardContent>
            {status?.features.timetable ? (
              <p className="text-sm text-muted-foreground">Emploi du temps suspendu (impayé).</p>
            ) : todaySlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun cours aujourd&apos;hui.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {todaySlots.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl border-l-4 bg-background p-2.5 text-sm" style={{ borderLeftColor: s.color ?? "var(--primary)" }}>
                    <span className="w-24 shrink-0 text-xs font-semibold text-muted-foreground">
                      {s.starts_at}–{s.ends_at}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">{s.subject ?? "Cours"}</span>
                    {s.room ? <span className="text-xs text-muted-foreground">{s.room}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="size-4 text-primary" aria-hidden /> Dernières présences
            </CardTitle>
            <Link href="/portail/presences" className="text-sm font-medium text-primary hover:underline">
              Tout voir
            </Link>
          </CardHeader>
          <CardContent>
            {attendance.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun appel validé pour le moment.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {attendance.slice(0, 5).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      {formatDate(a.date)} · {a.subject ?? "Cours"}
                    </span>
                    <StatusBadge value={a.isJustified && a.status === "absent" ? "excused" : a.status} map={ATTENDANCE_STATUS} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <NotebookPen className="size-4 text-primary" aria-hidden /> Dernières notes
            </CardTitle>
            <Link href="/portail/notes" className="text-sm font-medium text-primary hover:underline">
              Tout voir
            </Link>
          </CardHeader>
          <CardContent>
            {status?.features.grades ? (
              <p className="text-sm text-muted-foreground">Notes suspendues (impayé).</p>
            ) : grades.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune note publiée.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {grades.slice(0, 5).map((g) => (
                  <li key={g.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{g.assessment.subject?.name ?? "—"}</span> · {g.assessment.title}
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">
                      {g.is_absent ? "Abs." : g.is_exempt ? "Disp." : `${g.score ?? "—"}/${g.assessment.max_score}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="size-4 text-primary" aria-hidden /> Annonces
            </CardTitle>
            <Link href="/portail/annonces" className="text-sm font-medium text-primary hover:underline">
              Tout voir
            </Link>
          </CardHeader>
          <CardContent>
            {announcements.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune annonce en cours.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3">
                {announcements.slice(0, 3).map((a) => (
                  <li key={a.id} className="grid gap-0.5 text-sm">
                    <span className="font-semibold">{a.title}</span>
                    <span className="line-clamp-2 text-muted-foreground">{a.body}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <nav aria-label="Accès rapides" className="stagger grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickLink href="/portail/notes?onglet=bulletins" icon={FileText} label="Bulletins" />
        <QuickLink href="/portail/documents" icon={ShieldCheck} label="Documents" />
        <QuickLink href="/portail/emploi-du-temps" icon={CalendarClock} label="Emploi du temps" />
        {parent ? <QuickLink href="/portail/finances" icon={Wallet} label="Finances" /> : <QuickLink href="/portail/annonces" icon={Megaphone} label="Annonces" />}
      </nav>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number | { amount: number; currency: string }; tone: "success" | "warning" | "danger" | "primary" }) {
  const tones = { success: "text-success", warning: "text-warning", danger: "text-danger", primary: "text-primary" };
  return (
    <Card className="grid gap-1 p-3.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className={cn("text-xl font-bold tabular-nums", tones[tone])}>
        {typeof value === "number" ? <AnimatedCounter value={value} /> : typeof value === "string" ? value : <AnimatedMoney value={value.amount} currency={value.currency} />}
      </span>
    </Card>
  );
}

function QuickLink({ href, icon: Icon, label }: { href: string; icon: typeof FileText; label: string }) {
  return (
    <Link href={href} className="hover-lift press group flex flex-col items-center gap-2 rounded-2xl border border-border bg-surface p-4 text-sm font-medium hover:border-primary hover:text-primary">
      <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary transition-transform duration-200 group-hover:scale-110">
        <Icon className="size-5" aria-hidden />
      </span>
      {label}
    </Link>
  );
}
