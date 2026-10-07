"use client";

import { ArrowLeft, Check, Loader2, Plus, Printer, Search, UserRound, Wallet } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { ActionForm } from "@/components/shared/action-form";
import { SubmitButton } from "@/components/shared/submit-button";
import { AnimatedSuccess } from "@/components/motion/animated-feedback";
import { useFeedbackAction } from "@/components/motion/use-feedback-action";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { recordPayment } from "@/features/finance/actions";
import { payableForInvoice, searchPayableStudents, type PayableInvoice, type PayableStudent } from "@/features/finance/cashier";
import { cn } from "@/lib/utils/cn";

type Labels = { student: string; theStudent: string };

/** Modes proposés en un clic ; « Autre » ouvre la liste complète (chèque, carte…). */
const QUICK_METHODS = [
  { value: "cash", label: "Espèces" },
  { value: "mobile_money", label: "Mobile Money" },
  { value: "bank_transfer", label: "Virement" },
  { value: "other", label: "Autre" },
] as const;
const OTHER_METHODS = [
  { value: "cheque", label: "Chèque" },
  { value: "card", label: "Carte bancaire" },
  { value: "other", label: "Autre" },
] as const;

/**
 * Caisse : « Enregistrer un paiement » depuis la page Finances. On choisit
 * l'élève, la facture et la tranche ; le montant restant est proposé, puis le
 * reçu est généré. L'enregistrement passe par recordPayment (contrôles en base).
 */
export function CashierDialog({
  currency,
  today,
  minDate,
  labels,
  initialInvoiceId,
}: {
  currency: string;
  today: string;
  minDate: string;
  labels: Labels;
  initialInvoiceId?: string;
}) {
  const [open, setOpen] = useState(Boolean(initialInvoiceId));
  const [round, setRound] = useState(0);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="cashier-open">
          <Plus aria-hidden /> Enregistrer un paiement
        </Button>
      </DialogTrigger>
      <DialogContent title="Enregistrer un paiement" description={`Encaissement à la caisse : choisissez ${labels.theStudent}, la tranche, puis validez pour générer le reçu.`} className="max-w-xl">
        <CashierFlow key={round} currency={currency} today={today} minDate={minDate} labels={labels} initialInvoiceId={round === 0 ? initialInvoiceId : undefined} onAgain={() => setRound((r) => r + 1)} />
      </DialogContent>
    </Dialog>
  );
}

function CashierFlow({
  currency,
  today,
  minDate,
  labels,
  initialInvoiceId,
  onAgain,
}: {
  currency: string;
  today: string;
  minDate: string;
  labels: Labels;
  initialInvoiceId?: string;
  onAgain: () => void;
}) {
  const money = (n: number) =>
    new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: currency === "XOF" || currency === "XAF" ? 0 : 2 }).format(n);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PayableStudent[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [student, setStudent] = useState<PayableStudent | null>(null);
  const [invoiceId, setInvoiceId] = useState("");
  const [choice, setChoice] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("cash");
  const [otherOpen, setOtherOpen] = useState(false);
  const [paidOn, setPaidOn] = useState(today);
  const [state, formAction, pending] = useFeedbackAction(recordPayment);
  const searchRef = useRef<HTMLInputElement>(null);

  const invoice: PayableInvoice | undefined = student?.invoices.find((i) => i.id === invoiceId);

  /** Sélectionne une facture : la première tranche non soldée est proposée. */
  function pickInvoice(inv: PayableInvoice | undefined) {
    setInvoiceId(inv?.id ?? "");
    const next = inv?.installments.find((i) => i.remaining > 0);
    if (next) {
      setChoice(next.id);
      setAmount(String(Math.min(next.remaining, inv!.balance)));
    } else {
      setChoice("all");
      setAmount(inv ? String(inv.balance) : "");
    }
  }
  function pickStudent(s: PayableStudent) {
    setStudent(s);
    pickInvoice(s.invoices[0]);
  }
  function pickChoice(value: string) {
    setChoice(value);
    if (!invoice) return;
    if (value === "all") setAmount(String(invoice.balance));
    else if (value !== "custom") {
      const inst = invoice.installments.find((i) => i.id === value);
      if (inst) setAmount(String(Math.min(inst.remaining, invoice.balance)));
    }
  }

  // Ouverture depuis une ligne de facture : élève et facture déjà choisis.
  useEffect(() => {
    if (!initialInvoiceId) return;
    startSearch(async () => {
      const res = await payableForInvoice(initialInvoiceId);
      const s = res.ok ? res.data : null;
      if (s) {
        setStudent(s);
        const inv = s.invoices.find((i) => i.id === initialInvoiceId) ?? s.invoices[0];
        pickInvoice(inv);
      }
    });
  }, [initialInvoiceId]);

  // Recherche au fil de la saisie (nom, prénom ou matricule).
  useEffect(() => {
    if (student) return;
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const res = await searchPayableStudents(q);
        setResults(res.ok ? (res.data ?? []) : []);
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, student]);

  const shown = query.trim().length >= 2 ? results : null;
  const done = state?.ok ? state.data : undefined;
  if (done) {
    return (
      <div className="grid gap-3" data-testid="cashier-done">
        <div className="grid justify-items-center gap-2 py-2 text-center">
          <AnimatedSuccess className="size-16" label="Paiement enregistré" />
          {done.balanceAfter === 0 ? (
            <span className="status-change rounded-full bg-success-soft px-3 py-1 text-sm font-semibold text-success">Payé · facture soldée</span>
          ) : (
            <span className="anim-fade text-sm text-muted-foreground">Reste dû sur la facture : {money(done.balanceAfter)}</span>
          )}
        </div>
        <Alert tone="success">{state?.message}</Alert>
        <Button asChild>
          <a href={`/api/documents/recus/${done.paymentId}`} target="_blank" rel="noopener">
            <Printer aria-hidden /> Imprimer le reçu
          </a>
        </Button>
        <DialogClose asChild>
          <Button variant="secondary">Fermer</Button>
        </DialogClose>
        <Button variant="ghost" onClick={onAgain}>
          <Plus aria-hidden /> Encaisser un autre paiement
        </Button>
      </div>
    );
  }

  // Étape 1 : choisir l'élève.
  if (!student) {
    return (
      <div className="grid gap-3">
        <FormField id="cashier-search" label={`${labels.student} (nom, prénom ou matricule)`}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="cashier-search"
              ref={searchRef}
              autoFocus
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ex. : Bamba, DEMO-26-00003…"
              className="pl-9"
            />
            {searching ? <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden /> : null}
          </div>
        </FormField>
        {initialInvoiceId && searching && !shown ? <p className="text-sm text-muted-foreground">Chargement de la facture…</p> : null}
        {shown ? (
          shown.length ? (
            <ul className="grid gap-1.5" data-testid="cashier-results" aria-live="polite">
              {shown.map((s) => {
                const due = s.invoices.reduce((sum, i) => sum + i.balance, 0);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pickStudent(s)}
                      disabled={!s.invoices.length}
                      className="flex w-full items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-primary-soft/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                        <UserRound className="size-4" aria-hidden />
                      </span>
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium">
                          {s.lastName} {s.firstName}
                        </span>
                        <span className="text-xs text-muted-foreground">{s.matricule ?? "—"}</span>
                      </span>
                      <span className={cn("shrink-0 text-right text-sm font-semibold tabular-nums", due > 0 ? "text-danger" : "text-muted-foreground")}>
                        {due > 0 ? `Reste ${money(due)}` : "Rien à payer"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-xl bg-surface-muted p-3 text-sm text-muted-foreground">Aucun résultat pour « {query.trim()} ».</p>
          )
        ) : (
          <p className="text-sm text-muted-foreground">Tapez au moins deux lettres.</p>
        )}
      </div>
    );
  }

  // Étape 2 : facture, tranche, montant, mode, date.
  const typed = Math.max(0, Number(amount) || 0);
  const tooMuch = invoice ? typed > invoice.balance : false;
  const selectedInstallment = invoice?.installments.find((i) => i.id === choice);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <ActionForm dispatch={formAction} pending={pending} className="grid gap-4" data-testid="cashier-form">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface-muted/50 px-3 py-2.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <Wallet className="size-5" aria-hidden />
        </span>
        <span className="grid min-w-0 flex-1">
          <strong className="truncate" data-testid="cashier-student">
            {student.lastName} {student.firstName}
          </strong>
          <span className="text-xs text-muted-foreground">{student.matricule ?? "—"}</span>
        </span>
        {!initialInvoiceId ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setStudent(null)}>
            <ArrowLeft aria-hidden /> Changer
          </Button>
        ) : null}
      </div>

      {student.invoices.length === 0 ? (
        <Alert tone="info">Aucune facture à payer pour {labels.theStudent}.</Alert>
      ) : (
        <>
          <input type="hidden" name="invoice_id" value={invoiceId} />
          {student.invoices.length > 1 ? (
            <FormField id="cashier-invoice" label="Facture">
              <Select id="cashier-invoice" value={invoiceId} onChange={(e) => pickInvoice(student.invoices.find((i) => i.id === e.target.value))}>
                {student.invoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.number}
                    {i.label ? ` — ${i.label}` : ""} · reste {money(i.balance)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          {invoice ? (
            <div className="grid grid-cols-3 gap-2" data-testid="cashier-summary">
              {(
                [
                  ["Total", invoice.total, ""],
                  ["Payé", invoice.paid, "text-success"],
                  ["Reste", invoice.balance, "text-danger"],
                ] as const
              ).map(([label, value, tone]) => (
                <div key={label} className="rounded-xl border border-border px-3 py-2">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={cn("text-sm font-semibold tabular-nums sm:text-base", tone)}>{money(value)}</p>
                </div>
              ))}
            </div>
          ) : null}

          {invoice ? (
            <FormField id="cashier-choice" label="Type de paiement">
              <Select id="cashier-choice" value={choice} onChange={(e) => pickChoice(e.target.value)} data-testid="cashier-choice">
                {invoice.installments.map((i) =>
                  i.remaining > 0 ? (
                    <option key={i.id} value={i.id}>
                      {i.label} — {money(i.remaining)} restant
                    </option>
                  ) : (
                    <option key={i.id} value={i.id} disabled>
                      {i.label} — soldée
                    </option>
                  ),
                )}
                <option value="all">Tout le reste — {money(invoice.balance)}</option>
                <option value="custom">Autre montant</option>
              </Select>
            </FormField>
          ) : null}

          <FormField id="cashier-amount" label={`Montant (${currency === "XOF" || currency === "XAF" ? "FCFA" : currency}) *`} errors={errors.amount}>
            <Input
              id="cashier-amount"
              name="amount"
              type="number"
              inputMode="numeric"
              min={1}
              step="1"
              max={invoice?.balance}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (choice === "all" || choice === "") setChoice("custom");
              }}
              required
            />
          </FormField>
          <p className={cn("-mt-2 text-sm", tooMuch ? "text-danger" : "text-muted-foreground")} aria-live="polite">
            {tooMuch
              ? `Montant supérieur au reste dû (${money(invoice!.balance)}).`
              : selectedInstallment
                ? `Reste sur cette échéance : ${money(selectedInstallment.remaining)}`
                : invoice
                  ? `Reste dû sur la facture : ${money(invoice.balance)} · après ce paiement : ${money(Math.max(0, invoice.balance - typed))}`
                  : null}
          </p>

          <fieldset className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">Mode de paiement</legend>
            <input type="hidden" name="method" value={method} />
            <div className="flex flex-wrap gap-1 rounded-xl bg-surface-muted p-1" role="radiogroup" aria-label="Mode de paiement">
              {QUICK_METHODS.map((m) => {
                const active = m.value === "other" ? otherOpen : !otherOpen && method === m.value;
                return (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      if (m.value === "other") {
                        setOtherOpen(true);
                        setMethod("cheque");
                      } else {
                        setOtherOpen(false);
                        setMethod(m.value);
                      }
                    }}
                    className={cn("flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors", active ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
            {otherOpen ? (
              <Select aria-label="Autre mode de paiement" value={method} onChange={(e) => setMethod(e.target.value)}>
                {OTHER_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            ) : null}
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="cashier-date" label="Date" errors={errors.paid_on}>
              <Input id="cashier-date" name="paid_on" type="date" value={paidOn} min={minDate} max={today} onChange={(e) => setPaidOn(e.target.value)} required />
            </FormField>
            <FormField id="cashier-payer" label="Versé par">
              <Input id="cashier-payer" name="payer_name" maxLength={120} placeholder="Nom du parent (facultatif)" />
            </FormField>
            {method !== "cash" ? (
              <FormField id="cashier-ref" label="Référence (transaction, chèque…)" className="sm:col-span-2">
                <Input id="cashier-ref" name="reference" maxLength={80} />
              </FormField>
            ) : null}
          </div>

          {state && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Annuler
              </Button>
            </DialogClose>
            <SubmitButton disabled={!invoice || tooMuch || typed <= 0}>
              <Check aria-hidden /> Valider et générer le reçu
            </SubmitButton>
          </div>
        </>
      )}
    </ActionForm>
  );
}
