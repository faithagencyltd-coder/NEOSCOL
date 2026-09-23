/**
 * Instantanés des documents officiels. Chaque document émis conserve dans
 * issued_documents.data l'instantané qui a servi à le produire : le PDF peut
 * être régénéré à l'identique (portails, dossier complet) même si les données
 * sources évoluent ensuite.
 */

export type DocOrganization = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  currency: string;
  header_text: string | null;
  footer_text: string | null;
  signatory_name: string | null;
  signatory_title: string | null;
  primary_color: string;
  accent_color: string;
  logo_file_id: string | null;
  stamp_file_id: string | null;
  signature_file_id: string | null;
  is_demo: boolean;
  /** Type d'établissement (vocabulaire des documents) ; absent des anciens instantanés. */
  type?: string | null;
};

export type DocStudent = {
  id: string;
  first_name: string;
  last_name: string;
  other_names?: string | null;
  matricule: string;
  sex: string | null;
  birth_date: string | null;
  birth_place: string | null;
  nationality?: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  email?: string | null;
  photo_file_id?: string | null;
};

export type ReportColumn = { key: string; label: string; weight: number };

export type ReportSubjectRow = {
  subject: string;
  teacher: string | null;
  coefficient: number;
  columns?: Record<string, number>;
  average: number | null;
  points?: number | null;
  rank?: number | null;
  class_average: number | null;
  min: number | null;
  max: number | null;
  mention?: string | null;
  /** Crédits (ECTS) de la matière / unité d'enseignement, si l'établissement en utilise. */
  credits?: number | null;
};

/** Crédits acquis : une matière est validée si sa moyenne atteint le seuil. */
export type CreditSummary = { threshold: number; earned: number; total: number };

export type ReportCardConfig = {
  title: string;
  show_teacher: boolean;
  show_rank: boolean;
  show_subject_rank: boolean;
  show_class_stats: boolean;
  show_attendance: boolean;
  show_appreciation: boolean;
  show_logo: boolean;
  show_stamp: boolean;
  show_qr: boolean;
  signatures: { label: string }[];
  primary_color: string;
  accent_color: string;
  footer_note: string;
};

export type ReportCardSnapshot = {
  kind: "report_card";
  organization: DocOrganization;
  config: ReportCardConfig;
  student: DocStudent;
  class_name: string;
  head_teacher: string | null;
  year: string;
  period: string;
  ranking_enabled: boolean;
  credits?: CreditSummary | null;
  card: {
    id: string;
    status: string;
    average: number | null;
    rank: number | null;
    class_size: number | null;
    appreciation: string | null;
    head_teacher_comment: string | null;
    decision: string | null;
    columns: ReportColumn[];
    subjects: ReportSubjectRow[];
    class_average: number | null;
    best_average: number | null;
    worst_average: number | null;
    coefficient_total: number | null;
    points_total: number | null;
    mention: string | null;
    proposed_decision: string | null;
    attendance: { absences: number; justified: number; lates: number } | null;
  };
};

export type ReceiptSnapshot = {
  kind: "receipt";
  organization: DocOrganization;
  student: DocStudent;
  class_name: string | null;
  payment: {
    id: string;
    number: string;
    amount: number;
    method: string;
    reference: string | null;
    payer_name: string | null;
    paid_at: string;
    received_by_name: string | null;
    balance_after: number | null;
    status: string;
  };
  invoice: { number: string; total: number };
};

export type InvoiceSnapshot = {
  kind: "invoice";
  organization: DocOrganization;
  student: DocStudent;
  class_name: string | null;
  guardian: string | null;
  invoice: {
    id: string;
    number: string;
    status: string;
    issued_on: string;
    due_on: string | null;
    subtotal: number;
    discount_total: number;
    total: number;
    paid: number;
    balance: number;
    lines: { description: string; quantity: number; unit_amount: number; discount_amount: number; amount: number }[];
    installments: { label: string; due_on: string; amount: number }[];
    payments: { number: string; paid_at: string; amount: number; method: string }[];
  };
};

/** Documents rédigés à partir d'un modèle de texte (Document Studio). */
export const TEXT_DOCUMENT_KINDS = ["school_certificate", "attestation", "training_certificate", "convocation", "contract", "custom"] as const;
export type TextDocumentKind = (typeof TEXT_DOCUMENT_KINDS)[number];

export type CertificateSnapshot = {
  kind: TextDocumentKind;
  organization: DocOrganization;
  student: DocStudent;
  class_name: string | null;
  year: string | null;
  program?: string | null;
  program_hours?: number | null;
  title: string;
  body: string;
  closing: string;
  purpose: string | null;
  template_id?: string | null;
};

export type TranscriptSnapshot = {
  kind: "transcript";
  organization: DocOrganization;
  student: DocStudent;
  class_name: string | null;
  year: string | null;
  periods: string[];
  subjects: { subject: string; coefficient: number; averages: (number | null)[]; credits?: number | null }[];
  averages: (number | null)[];
  ranks: (number | null)[];
  annual_average: number | null;
  credits?: CreditSummary | null;
};

export type EnrollmentFormSnapshot = {
  kind: "enrollment_form";
  organization: DocOrganization;
  student: DocStudent;
  guardians: { name: string; relationship: string; phone: string | null; email: string | null; profession: string | null; is_financial_responsible: boolean }[];
  enrollment: {
    reference: string;
    type: string;
    status: string;
    year: string;
    class_name: string | null;
    level: string | null;
    program: string | null;
    submitted_at: string | null;
    decided_at: string | null;
    fields: { label: string; value: string; section: string }[];
  };
};

export type CommitmentSnapshot = {
  kind: "commitment_form";
  organization: DocOrganization;
  student: DocStudent;
  guardian: { name: string; phone: string | null; relationship: string } | null;
  enrollment: { reference: string; year: string; class_name: string | null };
  fees: { total: number; lines: { description: string; amount: number }[]; installments: { label: string; due_on: string; amount: number }[] };
};

export type StudentCardSnapshot = {
  kind: "student_card";
  organization: DocOrganization;
  student: DocStudent;
  class_name: string | null;
  year: string | null;
};

export type DossierSnapshot = {
  kind: "dossier";
  organization: DocOrganization;
  student: DocStudent;
  class_name: string | null;
  sections: { key: string; label: string; count: number }[];
};

export type DocumentSnapshot =
  | ReportCardSnapshot
  | ReceiptSnapshot
  | InvoiceSnapshot
  | CertificateSnapshot
  | TranscriptSnapshot
  | EnrollmentFormSnapshot
  | CommitmentSnapshot
  | StudentCardSnapshot
  | DossierSnapshot;

export type DocumentKind = DocumentSnapshot["kind"];

/** Vérification (QR) imprimée sur le document. */
export type Verification = { number: string; code: string; url: string; qr: string };

/** Images résolues au moment du rendu (data URL). */
export type DocImages = { logo?: string | null; stamp?: string | null; signature?: string | null; photo?: string | null };

export const DOCUMENT_KIND_LABELS: Record<string, string> = {
  report_card: "Bulletin de notes",
  receipt: "Reçu de paiement",
  invoice: "Facture",
  school_certificate: "Certificat de scolarité",
  attestation: "Attestation",
  training_certificate: "Certificat de formation",
  convocation: "Convocation",
  contract: "Contrat",
  custom: "Document personnalisé",
  transcript: "Relevé de notes",
  enrollment_form: "Fiche d'inscription",
  commitment_form: "Engagement",
  student_card: "Carte scolaire",
  dossier: "Dossier complet",
};
