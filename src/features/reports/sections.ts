/** Sections du module Rapports : colonnes affichées et exportées (CSV). */
export type ReportColumn = { key: string; label: string; kind?: "money" | "percent" | "number" | "text" };

export const REPORT_SECTIONS = {
  effectifs: {
    title: "Effectifs",
    description: "Élèves inscrits par classe et par niveau, répartition filles / garçons, taux de remplissage.",
    columns: [
      { key: "niveau", label: "Niveau / filière" },
      { key: "classe", label: "Classe" },
      { key: "effectif", label: "Effectif", kind: "number" },
      { key: "filles", label: "Filles", kind: "number" },
      { key: "garcons", label: "Garçons", kind: "number" },
      { key: "capacite", label: "Capacité", kind: "number" },
      { key: "taux_remplissage", label: "Remplissage", kind: "percent" },
    ],
    chart: { label: "classe", value: "effectif" },
  },
  inscriptions: {
    title: "Inscriptions et réinscriptions",
    description: "Année en cours : nouvelles inscriptions, réinscriptions, dossiers en attente, rejetés ou annulés.",
    columns: [
      { key: "classe", label: "Classe" },
      { key: "nouvelles", label: "Nouvelles", kind: "number" },
      { key: "reinscriptions", label: "Réinscriptions", kind: "number" },
      { key: "transferts", label: "Transferts", kind: "number" },
      { key: "en_attente", label: "En attente", kind: "number" },
      { key: "rejetees", label: "Rejetées", kind: "number" },
      { key: "annulees", label: "Annulées", kind: "number" },
    ],
    chart: { label: "classe", value: "nouvelles" },
  },
  finances: {
    title: "Finances",
    description: "Facturé, encaissé, reste à payer et impayés par classe ; recettes et dépenses par mois.",
    columns: [
      { key: "classe", label: "Classe" },
      { key: "factures", label: "Factures", kind: "number" },
      { key: "facture", label: "Facturé", kind: "money" },
      { key: "encaisse", label: "Encaissé", kind: "money" },
      { key: "reste", label: "Reste à payer", kind: "money" },
      { key: "en_retard", label: "Factures en retard", kind: "number" },
    ],
    chart: { label: "classe", value: "reste" },
  },
  absences: {
    title: "Présences et absences",
    description: "Appels validés : absences, absences justifiées, retards et taux de présence par classe.",
    columns: [
      { key: "classe", label: "Classe" },
      { key: "seances", label: "Séances", kind: "number" },
      { key: "absences", label: "Absences", kind: "number" },
      { key: "justifiees", label: "Justifiées", kind: "number" },
      { key: "retards", label: "Retards", kind: "number" },
      { key: "taux_presence", label: "Taux de présence", kind: "percent" },
    ],
    chart: { label: "classe", value: "taux_presence" },
  },
  resultats: {
    title: "Résultats et performances",
    description: "Moyenne /20, taux de réussite (≥ 10), minimum et maximum par classe et par matière.",
    columns: [
      { key: "classe", label: "Classe" },
      { key: "matiere", label: "Matière" },
      { key: "evaluations", label: "Évaluations", kind: "number" },
      { key: "notes", label: "Notes", kind: "number" },
      { key: "moyenne", label: "Moyenne /20", kind: "number" },
      { key: "taux_reussite", label: "Réussite", kind: "percent" },
      { key: "min", label: "Min.", kind: "number" },
      { key: "max", label: "Max.", kind: "number" },
    ],
    chart: { label: "matiere", value: "moyenne" },
  },
  formations: {
    title: "Formations",
    description: "Formations professionnelles : sessions ouvertes et apprenants inscrits.",
    columns: [
      { key: "formation", label: "Formation" },
      { key: "code", label: "Code" },
      { key: "duree_heures", label: "Durée (h)", kind: "number" },
      { key: "sessions", label: "Sessions", kind: "number" },
      { key: "apprenants", label: "Apprenants", kind: "number" },
    ],
    chart: { label: "formation", value: "apprenants" },
  },
} as const satisfies Record<string, { title: string; description: string; columns: ReportColumn[]; chart: { label: string; value: string } }>;

export type ReportSectionKey = keyof typeof REPORT_SECTIONS;

export function isReportSection(value: string | undefined): value is ReportSectionKey {
  return Boolean(value && value in REPORT_SECTIONS);
}

export type ReportRow = Record<string, string | number | null>;

/** CSV compatible Excel (séparateur « ; », BOM UTF-8). */
export function toCsv(columns: readonly ReportColumn[], rows: ReportRow[]): string {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value).replace(".", ",");
    return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => escape(c.label)).join(";"), ...rows.map((row) => columns.map((c) => escape(typeof row[c.key] === "number" ? row[c.key] : row[c.key] ?? "")).join(";"))];
  return `﻿${lines.join("\r\n")}\r\n`;
}
