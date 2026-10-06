/** Statuts du suivi commercial (les quatre premiers existaient déjà dans « Site web »). */
export const CRM_STATUS: Record<string, { label: string; tone: "info" | "warning" | "success" | "neutral" | "primary" | "danger" }> = {
  new: { label: "Nouvelle", tone: "info" },
  in_progress: { label: "En cours", tone: "warning" },
  contacted: { label: "Contacté", tone: "primary" },
  demo_planned: { label: "Démo planifiée", tone: "primary" },
  proposal: { label: "Proposition envoyée", tone: "warning" },
  won: { label: "Gagné (client)", tone: "success" },
  lost: { label: "Perdu", tone: "danger" },
  done: { label: "Traitée", tone: "success" },
  spam: { label: "Indésirable", tone: "neutral" },
};

export const CRM_EVENT_KINDS: Record<string, string> = { note: "Note", call: "Appel", email: "E-mail", meeting: "Rendez-vous", status: "Changement d'état" };
