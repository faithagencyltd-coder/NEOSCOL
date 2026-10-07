/** Échéancier : répartition du montant payé sur les tranches, dans l'ordre (la plus ancienne d'abord). */

export type InstallmentRow = { id: string; label: string; due_on: string; amount: number | string; sequence: number };
export type AllocatedInstallment = { id: string; label: string; dueOn: string; amount: number; remaining: number };
export type InstallmentState = "paid" | "partial" | "overdue" | "upcoming";

export function allocateInstallments(paid: number, installments: InstallmentRow[]): AllocatedInstallment[] {
  let left = paid;
  return [...installments]
    .sort((a, b) => a.sequence - b.sequence)
    .map((i) => {
      const amount = Number(i.amount);
      const covered = Math.min(amount, Math.max(0, left));
      left -= covered;
      return { id: i.id, label: i.label, dueOn: i.due_on, amount, remaining: Math.round((amount - covered) * 100) / 100 };
    });
}

/** État d'une tranche à une date donnée (AAAA-MM-JJ). */
export function installmentState(i: AllocatedInstallment, today: string): InstallmentState {
  if (i.remaining <= 0) return "paid";
  if (i.dueOn < today) return "overdue";
  if (i.remaining < i.amount) return "partial";
  return "upcoming";
}
