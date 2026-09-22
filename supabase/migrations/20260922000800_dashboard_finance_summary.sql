-- =============================================================================
-- NéoScol — 0800 Synthèse des factures pour le tableau de bord
-- SECURITY INVOKER : la RLS de invoices/payments s'applique (finance.read requis).
-- =============================================================================
create or replace function public.invoice_status_summary(p_organization_id uuid)
returns table (payment_status text, invoices bigint, balance numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select b.payment_status, count(*), coalesce(sum(b.balance), 0)::numeric(14, 2)
  from public.invoice_balances b
  where b.organization_id = p_organization_id
    and b.status = 'issued'
  group by b.payment_status;
$$;
revoke execute on function public.invoice_status_summary(uuid) from public, anon;
grant execute on function public.invoice_status_summary(uuid) to authenticated;
