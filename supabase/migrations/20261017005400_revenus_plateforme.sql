-- =============================================================================
-- Super Admin : tableau de bord des revenus et export comptable.
-- Lecture seule sur les données existantes (factures d'abonnement payées,
-- paiements des accès enseignants supplémentaires, abonnements). Les
-- établissements de démonstration et les paiements en mode test sont exclus
-- des chiffres (le nombre de paiements de test écartés est indiqué à part).
-- Aucune table n'est créée ni modifiée, aucune donnée n'est supprimée.
-- =============================================================================

-- Encaissements réels (hors démonstration). p_include_test : inclut aussi les
-- paiements de test (simulation, clés de test d'un agrégateur).
create or replace function app.revenue_entries(p_include_test boolean default false)
returns table (
  source text, organization_id uuid, paid_at timestamptz, reference text, label text, billing_interval text,
  period_start date, period_end date, list_amount integer, discount_amount integer, promo_code text,
  amount integer, currency text, payment_method text, provider text, mode text
)
language sql
stable
security definer
set search_path = ''
as $$
  select 'Abonnement', i.organization_id, i.paid_at, i.invoice_number, i.plan_name, i.billing_interval,
         i.period_start::date, i.period_end::date, i.list_amount, i.discount_amount, i.promo_code,
         i.amount, i.currency, i.payment_method, coalesce(t.provider, 'manual'), coalesce(t.mode, 'live')
    from public.subscription_invoices i
    join public.organizations o on o.id = i.organization_id
    left join public.payment_transactions t on t.id = i.payment_transaction_id
   where i.status = 'PAID' and not o.is_demo
     and (p_include_test or coalesce(t.mode, 'live') = 'live')
  union all
  select 'Accès enseignant', p.organization_id, p.paid_at, p.internal_reference, 'Accès enseignant supplémentaire',
         case p.period_months when 12 then 'YEARLY' else 'MONTHLY' end,
         p.covers_from, p.covers_to, p.amount, 0, null,
         p.amount, p.currency, coalesce(p.payment_method, p.provider), p.provider, p.mode
    from public.teacher_access_payments p
    join public.organizations o on o.id = p.organization_id
   where p.status = 'SUCCESS' and not o.is_demo
     and (p_include_test or p.mode = 'live');
$$;
revoke all on function app.revenue_entries(boolean) from public, anon, authenticated;

create or replace function app.revenue_check_period(p_from date, p_to date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Période invalide : la date de début doit précéder la date de fin.' using errcode = 'check_violation';
  end if;
  if p_to - p_from > 3660 then
    raise exception 'Période trop longue (10 ans au maximum).' using errcode = 'check_violation';
  end if;
end;
$$;
revoke all on function app.revenue_check_period(date, date) from public, anon, authenticated;

-- Indicateurs de la période [p_from, p_to] (dates incluses).
create or replace function public.platform_revenue_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_prev_start timestamptz;
  v_result jsonb;
begin
  perform app.require_platform_admin();
  perform app.revenue_check_period(p_from, p_to);
  v_start := p_from::timestamptz;
  v_end := (p_to + 1)::timestamptz;
  v_prev_start := v_start - (v_end - v_start);

  with live as (
    select * from app.revenue_entries(false)
  ), period as (
    select * from live where paid_at >= v_start and paid_at < v_end
  ), subs as (
    select s.*, p.name as plan_name, o.name as organization_name, o.code as organization_code
      from public.subscriptions s
      join public.organizations o on o.id = s.organization_id
      join public.subscription_plans p on p.id = s.plan_id
     where not o.is_demo and not s.is_demo
  ), first_paid as (
    select organization_id, min(paid_at) as first_at from live where source = 'Abonnement' group by organization_id
  ), trials as (
    select s.organization_id, exists (select 1 from first_paid f where f.organization_id = s.organization_id) as converted
      from subs s
     where s.trial_end >= v_start and s.trial_end < v_end
  ), unpaid as (
    select s.organization_id, s.organization_name, s.organization_code, s.plan_name, s.status, s.status_changed_at,
           coalesce((select i.amount from public.subscription_invoices i
                      where i.organization_id = s.organization_id and i.status in ('PENDING', 'FAILED')
                      order by i.issued_at desc limit 1),
                    case s.billing_interval when 'YEARLY' then s.annual_price else s.monthly_price end) as amount,
           s.currency
      from subs s
     where s.status in ('PAST_DUE', 'GRACE_PERIOD', 'RESTRICTED')
  ), churn as (
    select s.organization_id, s.organization_name, s.organization_code, s.plan_name, s.status, s.status_changed_at,
           s.cancellation_reason
      from subs s
     where s.status in ('CANCELLED', 'EXPIRED') and s.status_changed_at >= v_start and s.status_changed_at < v_end
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'totals', coalesce((select jsonb_agg(x order by x.amount desc) from (
        select currency, sum(amount)::bigint as amount, count(*)::int as count from period group by currency) x), '[]'),
    'previous_totals', coalesce((select jsonb_agg(x) from (
        select currency, sum(amount)::bigint as amount, count(*)::int as count
          from live where paid_at >= v_prev_start and paid_at < v_start group by currency) x), '[]'),
    'discounts', coalesce((select jsonb_agg(x) from (
        select currency, sum(discount_amount)::bigint as amount, count(*) filter (where discount_amount > 0)::int as count
          from period group by currency having sum(discount_amount) > 0) x), '[]'),
    'test_excluded', (select jsonb_build_object('count', count(*), 'amount', coalesce(sum(amount), 0))
                        from app.revenue_entries(true) e
                       where e.mode = 'test' and e.paid_at >= v_start and e.paid_at < v_end),
    'monthly', coalesce((select jsonb_agg(x order by x.month, x.currency) from (
        select to_char(date_trunc('month', paid_at), 'YYYY-MM') as month, currency, sum(amount)::bigint as amount, count(*)::int as count
          from live
         where paid_at >= date_trunc('month', v_end - interval '1 day') - interval '11 months' and paid_at < v_end
         group by 1, 2) x), '[]'),
    'by_label', coalesce((select jsonb_agg(x order by x.amount desc) from (
        select label, currency, sum(amount)::bigint as amount, count(*)::int as count from period group by label, currency) x), '[]'),
    'by_method', coalesce((select jsonb_agg(x order by x.amount desc) from (
        select coalesce(nullif(payment_method, ''), provider) as method, currency, sum(amount)::bigint as amount, count(*)::int as count
          from period group by 1, currency) x), '[]'),
    'top_organizations', coalesce((select jsonb_agg(x order by x.amount desc) from (
        select o.name, o.code, p.currency, sum(p.amount)::bigint as amount, count(*)::int as count
          from period p join public.organizations o on o.id = p.organization_id
         group by o.id, o.name, o.code, p.currency order by sum(p.amount) desc limit 10) x), '[]'),
    'new_organizations', (select count(*) from public.organizations o
                           where not o.is_demo and o.parent_id is null and o.created_at >= v_start and o.created_at < v_end),
    'new_paying', (select count(*) from first_paid where first_at >= v_start and first_at < v_end),
    'trials_ended', (select count(*) from trials),
    'trials_converted', (select count(*) from trials where converted),
    'trialing_now', (select count(*) from subs where status = 'TRIALING'),
    'active_now', (select count(*) from subs where status = 'ACTIVE'),
    'recurring', coalesce((select jsonb_agg(x) from (
        select currency, sum(case billing_interval when 'YEARLY' then round(annual_price / 12.0) else monthly_price end)::bigint as amount,
               count(*)::int as count
          from subs where status = 'ACTIVE' group by currency) x), '[]'),
    'unpaid_count', (select count(*) from unpaid),
    'unpaid_totals', coalesce((select jsonb_agg(x) from (
        select currency, sum(amount)::bigint as amount from unpaid group by currency) x), '[]'),
    'unpaid', coalesce((select jsonb_agg(u order by u.status_changed_at) from (select * from unpaid order by status_changed_at limit 100) u), '[]'),
    'churn_count', (select count(*) from churn),
    'churn', coalesce((select jsonb_agg(c order by c.status_changed_at desc) from (select * from churn order by status_changed_at desc limit 100) c), '[]')
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.platform_revenue_summary(date, date) from public, anon;
grant execute on function public.platform_revenue_summary(date, date) to authenticated;

-- Lignes de l'export comptable (encaissements de la période). Chaque export
-- est inscrit au journal d'audit.
create or replace function public.platform_revenue_export(p_from date, p_to date, p_include_test boolean default false)
returns table (
  paid_at timestamptz, source text, organization_name text, organization_code text, reference text, label text,
  billing_interval text, period_start date, period_end date, list_amount integer, discount_amount integer,
  promo_code text, amount integer, currency text, payment_method text, provider text, mode text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  perform app.revenue_check_period(p_from, p_to);
  perform app.audit(null, 'platform.revenue_exported', 'subscription_invoices', null,
    'Export comptable des encaissements du ' || to_char(p_from, 'DD/MM/YYYY') || ' au ' || to_char(p_to, 'DD/MM/YYYY'),
    jsonb_build_object('from', p_from, 'to', p_to, 'include_test', coalesce(p_include_test, false)));
  return query
  select e.paid_at, e.source, o.name, o.code, e.reference, e.label, e.billing_interval, e.period_start, e.period_end,
         e.list_amount, e.discount_amount, e.promo_code, e.amount, e.currency, e.payment_method, e.provider, e.mode
    from app.revenue_entries(coalesce(p_include_test, false)) e
    join public.organizations o on o.id = e.organization_id
   where e.paid_at >= p_from::timestamptz and e.paid_at < (p_to + 1)::timestamptz
   order by e.paid_at, e.reference;
end;
$$;
revoke all on function public.platform_revenue_export(date, date, boolean) from public, anon;
grant execute on function public.platform_revenue_export(date, date, boolean) to authenticated;
