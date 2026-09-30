-- =============================================================================
-- Remises sur facture pour tous les modules (école, université, formation) :
-- bourse, fratrie, enfant du personnel, geste commercial…
--
-- Droit « finance.invoices.manage », motif obligatoire, plafond = montant de la
-- ligne, jamais en dessous de ce qui est déjà payé (contrôle existant sur la
-- facture). L'échéancier est réduit du même montant en partant de la dernière
-- tranche. Tout est journalisé ; rien n'est supprimé.
-- =============================================================================

create or replace function public.apply_invoice_discount(p_invoice uuid, p_line uuid, p_amount numeric, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
  v_line public.invoice_lines;
  v_left numeric;
  v_inst record;
  v_cut numeric;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if v_inv.id is null or not app.has_permission(v_inv.organization_id, 'finance.invoices.manage') then
    raise exception 'Facture introuvable.' using errcode = 'no_data_found';
  end if;
  if v_inv.status = 'cancelled' then
    raise exception 'Une facture annulée ne peut plus être modifiée.' using errcode = 'check_violation';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Montant de la remise invalide.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif de la remise est obligatoire (bourse, fratrie, enfant du personnel…).' using errcode = 'check_violation';
  end if;
  if p_line is not null then
    select * into v_line from public.invoice_lines where id = p_line and invoice_id = v_inv.id for update;
  else
    -- Par défaut : la ligne la plus importante (frais de scolarité ou de formation).
    select * into v_line from public.invoice_lines where invoice_id = v_inv.id order by amount desc, sort_order limit 1 for update;
  end if;
  if v_line.id is null then
    raise exception 'Ligne de facture introuvable.' using errcode = 'no_data_found';
  end if;
  if v_line.discount_amount + p_amount > v_line.quantity * v_line.unit_amount then
    raise exception 'La remise dépasse le montant de la ligne (% restant).', v_line.amount using errcode = 'check_violation';
  end if;
  update public.invoice_lines
     set discount_amount = discount_amount + p_amount,
         discount_reason = left(case when discount_reason is null or btrim(discount_reason) = '' then btrim(p_reason)
                                     else discount_reason || ' ; ' || btrim(p_reason) end, 500)
   where id = v_line.id;
  -- Échéancier : réduit du même montant, en partant de la dernière tranche.
  v_left := p_amount;
  for v_inst in select id, amount from public.installments where invoice_id = v_inv.id order by sequence desc, due_on desc loop
    exit when v_left <= 0;
    v_cut := least(v_inst.amount, v_left);
    update public.installments set amount = amount - v_cut where id = v_inst.id;
    v_left := v_left - v_cut;
  end loop;
  perform app.audit(v_inv.organization_id, 'finance.discount', 'invoices', v_inv.id,
    'Remise de ' || p_amount || ' ' || v_inv.currency || ' sur la facture ' || v_inv.number || ' : ' || left(btrim(p_reason), 200),
    jsonb_build_object('line_id', v_line.id, 'amount', p_amount, 'reason', left(btrim(p_reason), 500)));
  return jsonb_build_object('invoice_id', v_inv.id, 'total', (select total from public.invoices where id = v_inv.id));
end;
$$;

revoke all on function public.apply_invoice_discount(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.apply_invoice_discount(uuid, uuid, numeric, text) to authenticated;
