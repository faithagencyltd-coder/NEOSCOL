import "server-only";

import { loadDocOrganization, loadImage, type Client } from "@/features/documents/server";
import { qrDataUrl } from "@/lib/pdf/qr";
import { ORGANIZATION_TYPE_LABELS, vocabularyFor } from "@/lib/vocabulary";

import { cardLabels, resolveCardDesign, type CardData, type CardDesign } from "./design";

export type CardBadge = {
  id: string;
  number: string;
  status: string;
  issued_at: string;
  printed_count: number;
  last_printed_at: string | null;
  valid_until: string | null;
};

const frDate = (value: string | null | undefined, timezone: string) =>
  value ? new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value)) : null;

/** Design des cartes de l'établissement (réglages + coordonnées déjà saisies). */
export async function loadCardDesign(supabase: Client, organizationId: string) {
  const [doc, { data: org }] = await Promise.all([
    loadDocOrganization(supabase, organizationId),
    supabase.from("organizations").select("settings, website, type").eq("id", organizationId).maybeSingle(),
  ]);
  if (!doc || !org) return null;
  const design = resolveCardDesign(org.settings, {
    address: doc.address,
    city: doc.city,
    phone: doc.phone,
    email: doc.email,
    website: org.website,
    signatory: [doc.signatory_title, doc.signatory_name].filter(Boolean).join(" : ") || null,
  });
  const logo = await loadImage(supabase, doc.logo_file_id);
  const organization: CardData["organization"] = {
    name: doc.name,
    kind: ORGANIZATION_TYPE_LABELS[org.type] ?? "Établissement",
    logo,
    demo: doc.is_demo,
  };
  return { design, organization, timezone: doc.timezone, type: org.type as string };
}

/**
 * Carte d'un élève / apprenant / étudiant, prête à afficher : identité, dernière
 * inscription validée, badge actif (QR), design de l'établissement.
 * La RLS s'applique à chaque lecture.
 */
export async function loadStudentCard(
  supabase: Client,
  organizationId: string,
  studentId: string,
): Promise<{ card: CardData; design: CardDesign; badge: CardBadge | null; token: string | null } | null> {
  const base = await loadCardDesign(supabase, organizationId);
  if (!base) return null;
  const v = vocabularyFor(base.type);
  const labels = cardLabels(v);
  const [{ data: student }, { data: badge }, { data: enrollment }] = await Promise.all([
    supabase.from("students").select("id, first_name, last_name, matricule, photo_path").eq("organization_id", organizationId).eq("id", studentId).maybeSingle(),
    supabase
      .from("student_badges")
      .select("id, number, token, status, issued_at, printed_count, last_printed_at, valid_until")
      .eq("organization_id", organizationId)
      .eq("student_id", studentId)
      .eq("status", "active")
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select("created_at, decided_at, group:training_groups(name), class:classes(name, program:programs(name), level:levels(name), academic_year:academic_years(name))")
      .eq("organization_id", organizationId)
      .eq("student_id", studentId)
      .eq("status", "validated")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!student) return null;

  const klass = enrollment?.class ?? null;
  const year = klass?.academic_year?.name ?? null;
  const fields: CardData["fields"] = [];
  if (v.family === "higher") {
    if (klass?.program?.name) fields.push({ label: labels.program, value: klass.program.name });
    if (klass?.level?.name ?? klass?.name) fields.push({ label: labels.group, value: (klass?.level?.name ?? klass?.name) as string });
  } else if (v.family === "training") {
    if (klass?.program?.name) fields.push({ label: labels.program, value: klass.program.name });
    const session = [klass?.name, enrollment?.group?.name].filter(Boolean).join(" · ");
    if (session) fields.push({ label: labels.group, value: session });
  } else {
    if (klass?.name) fields.push({ label: labels.program, value: klass.name });
    if (klass?.level?.name) fields.push({ label: labels.group, value: klass.level.name });
  }

  const photo = await loadImage(supabase, student.photo_path);
  const card: CardData = {
    title: labels.title,
    yearLabel: year ? `${labels.year} ${year}` : null,
    organization: base.organization,
    holder: { lastName: student.last_name, firstName: student.first_name, matricule: student.matricule, photo },
    fields,
    enrolledOn: frDate(enrollment?.decided_at ?? enrollment?.created_at, base.timezone),
    validity: badge?.valid_until ? frDate(`${badge.valid_until}T12:00:00Z`, base.timezone) : year ? `Fin ${year}` : null,
    qr: badge ? await qrDataUrl(`NEOSCOL-BADGE:${badge.token}`, "#000000") : null,
    badgeNumber: badge?.number ?? null,
    barcode: student.matricule,
  };
  const { token, ...rest } = badge ?? { token: null };
  return { card, design: base.design, badge: badge ? (rest as CardBadge) : null, token };
}
