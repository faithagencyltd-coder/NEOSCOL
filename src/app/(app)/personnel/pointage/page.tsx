import { BadgeCheck, Clock, KeyRound, ShieldAlert, Tablet, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { TabNav } from "@/components/shared/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { listActiveStaff, listBadgeScans, listLessonUnlocks, listStaffAttendance } from "@/features/staff/queries";
import { SCAN_KIND, SCAN_REASON } from "@/features/staff/schemas";
import { isIsoDate, todayIn } from "@/lib/dates";
import { requirePermission } from "@/lib/auth/guards";
import { can } from "@/lib/auth/session";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { isUuid, param } from "@/lib/utils/search-params";

export const metadata: Metadata = { title: "Pointage du personnel" };

const TABS = [
  { key: "presences", label: "Arrivées et départs" },
  { key: "cours", label: "Cours déverrouillés" },
  { key: "scans", label: "Journal des scans" },
] as const;

const clock = (iso: string | null, timeZone: string) =>
  iso ? new Intl.DateTimeFormat("fr-FR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "—";

export default async function StaffAttendancePage({ searchParams }: PageProps<"/personnel/pointage">) {
  const context = await requirePermission("staff_attendance.read");
  const organization = context.organization;
  const params = await searchParams;
  const today = todayIn(organization.timezone);
  const weekAgo = new Date(Date.parse(`${today}T12:00:00Z`) - 6 * 86400000).toISOString().slice(0, 10);
  const from = isIsoDate(param(params, "du")) ? param(params, "du")! : weekAgo;
  const to = isIsoDate(param(params, "au")) ? param(params, "au")! : today;
  const staffId = isUuid(param(params, "personnel")) ? param(params, "personnel") : undefined;
  const late = param(params, "retards") === "1";
  const result = param(params, "resultat");
  const tab = TABS.some((t) => t.key === param(params, "onglet")) ? param(params, "onglet")! : "presences";

  const [staff, attendance, unlocks, scans] = await Promise.all([
    listActiveStaff(organization.id),
    listStaffAttendance(organization.id, { from, to, staffId, late, q: param(params, "q") }),
    listLessonUnlocks(organization.id, { from, to, staffId }),
    listBadgeScans(organization.id, { from, to, staffId, result: result === "accepted" || result === "rejected" ? result : undefined }),
  ]);
  const lates = attendance.filter((a) => a.minutes_late > 0);
  const averageLate = lates.length ? Math.round(lates.reduce((s, a) => s + a.minutes_late, 0) / lates.length) : 0;
  const presentToday = attendance.filter((a) => a.work_date === today).length;
  const rejected = scans.filter((s) => s.result === "rejected").length;
  const qs = new URLSearchParams(
    Object.entries({ du: from, au: to, personnel: staffId ?? "", retards: late ? "1" : "", resultat: result ?? "" }).filter(([, v]) => v),
  ).toString();

  return (
    <div className="grid gap-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid gap-1">
          <nav aria-label="Fil d'Ariane" className="text-sm text-muted-foreground">
            <Link href="/personnel" className="hover:text-primary">
              Personnel
            </Link>{" "}
            / Pointage
          </nav>
          <h1 className="text-2xl font-semibold sm:text-[26px]">Pointage du personnel</h1>
          <p className="text-sm text-muted-foreground">
            Arrivées, départs, retards et déverrouillage des cours par scan du badge à l&apos;administration.
          </p>
        </div>
        {can(context, "staff_attendance.scan") ? (
          <Button asChild>
            <Link href="/pointage">
              <Tablet aria-hidden /> Ouvrir la tablette de pointage
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { label: "Présents aujourd'hui", value: presentToday, icon: Users },
          { label: "Jours pointés (période)", value: attendance.length, icon: BadgeCheck },
          { label: "Retards", value: lates.length, icon: Clock, hint: lates.length ? `${averageLate} min en moyenne` : undefined },
          { label: "Cours déverrouillés", value: unlocks.length, icon: KeyRound, hint: `${unlocks.filter((u) => u.method === "manual").length} manuellement` },
          { label: "Scans refusés", value: rejected, icon: ShieldAlert },
        ].map(({ label, value, icon: Icon, hint }) => (
          <Card key={label} className="grid gap-1 p-4">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <Icon className="size-4" aria-hidden /> {label}
            </span>
            <strong className="font-display text-2xl tabular-nums">{value}</strong>
            {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end" action="/personnel/pointage">
          <input type="hidden" name="onglet" value={tab} />
          <div className="grid gap-1.5">
            <Label htmlFor="f-du">Du</Label>
            <Input id="f-du" name="du" type="date" defaultValue={from} max={today} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-au">Au</Label>
            <Input id="f-au" name="au" type="date" defaultValue={to} max={today} />
          </div>
          <div className="grid gap-1.5 lg:col-span-2">
            <Label htmlFor="f-personnel">Membre du personnel</Label>
            <Select id="f-personnel" name="personnel" defaultValue={staffId ?? ""}>
              <option value="">Tout le personnel</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.last_name} {s.first_name}
                </option>
              ))}
            </Select>
          </div>
          {tab === "scans" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="f-resultat">Résultat</Label>
              <Select id="f-resultat" name="resultat" defaultValue={result ?? ""}>
                <option value="">Tous</option>
                <option value="accepted">Acceptés</option>
                <option value="rejected">Refusés</option>
              </Select>
            </div>
          ) : (
            <label className="flex min-h-12 items-center gap-2 text-sm">
              <input type="checkbox" name="retards" value="1" defaultChecked={late} className="size-4.5 accent-[var(--primary)]" />
              Retards uniquement
            </label>
          )}
          <Button type="submit">Filtrer</Button>
        </form>
      </Card>

      <TabNav tabs={TABS.map((t) => ({ key: t.key, label: t.label, href: `?${qs}&onglet=${t.key}` }))} active={tab} label="Vues du pointage" />

      <Card className="overflow-hidden">
        {tab === "presences" ? (
          attendance.length === 0 ? (
            <EmptyState icon={BadgeCheck} title="Aucun pointage sur la période" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Membre du personnel</TH>
                  <TH>Arrivée</TH>
                  <TH>Début prévu</TH>
                  <TH>Départ</TH>
                  <TH>Retard</TH>
                </tr>
              </THead>
              <tbody>
                {attendance.map((a) => (
                  <TR key={a.id}>
                    <TD>{formatDate(a.work_date, "fr-FR", { weekday: "short", day: "2-digit", month: "short" })}</TD>
                    <TD>
                      <Link href={`/personnel/${a.staff.id}`} className="grid hover:text-primary">
                        <span className="font-medium">
                          {a.staff.last_name} {a.staff.first_name}
                        </span>
                        <span className="text-xs text-muted-foreground">{a.staff.job_title ?? a.staff.employee_number}</span>
                      </Link>
                    </TD>
                    <TD className="tabular-nums">{clock(a.arrived_at, organization.timezone)}</TD>
                    <TD className="tabular-nums">{a.expected_start?.slice(0, 5) ?? "—"}</TD>
                    <TD className="tabular-nums">{clock(a.departed_at, organization.timezone)}</TD>
                    <TD>{a.minutes_late > 0 ? <Badge tone="warning">{a.minutes_late} min</Badge> : <Badge tone="success">À l&apos;heure</Badge>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        ) : null}
        {tab === "cours" ? (
          unlocks.length === 0 ? (
            <EmptyState icon={KeyRound} title="Aucun cours déverrouillé sur la période" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Cours</TH>
                  <TH>Enseignant</TH>
                  <TH>Déverrouillé à</TH>
                  <TH>Méthode</TH>
                </tr>
              </THead>
              <tbody>
                {unlocks.map((u) => (
                  <TR key={u.id}>
                    <TD>{formatDate(u.lesson_date, "fr-FR", { weekday: "short", day: "2-digit", month: "short" })}</TD>
                    <TD>
                      {u.starts_at.slice(0, 5)}–{u.ends_at.slice(0, 5)} · {u.class_subject?.subject?.name ?? "Cours"} · {u.class?.name}
                    </TD>
                    <TD>{u.teacher ? `${u.teacher.last_name} ${u.teacher.first_name}` : "—"}</TD>
                    <TD className="tabular-nums">{clock(u.unlocked_at, organization.timezone)}</TD>
                    <TD>{u.method === "badge" ? <Badge tone="success">Badge</Badge> : <Badge tone="warning" title={u.reason ?? undefined}>Manuel</Badge>}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        ) : null}
        {tab === "scans" ? (
          scans.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="Aucun scan sur la période" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Horodatage</TH>
                  <TH>Membre du personnel</TH>
                  <TH>Résultat</TH>
                  <TH>Détail</TH>
                </tr>
              </THead>
              <tbody>
                {scans.map((s) => (
                  <TR key={s.id}>
                    <TD className="tabular-nums">{formatDateTime(s.scanned_at, "fr-FR", organization.timezone)}</TD>
                    <TD>{s.staff ? `${s.staff.last_name} ${s.staff.first_name}` : <span className="text-muted-foreground">Inconnu</span>}</TD>
                    <TD>
                      {s.result === "accepted" ? (
                        <Badge tone="success">{SCAN_KIND[s.kind ?? ""] ?? "Accepté"}</Badge>
                      ) : (
                        <Badge tone="danger">{SCAN_REASON[s.reason] ?? s.reason}</Badge>
                      )}
                    </TD>
                    <TD className="max-w-md text-sm text-muted-foreground">{s.message}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )
        ) : null}
      </Card>
    </div>
  );
}
