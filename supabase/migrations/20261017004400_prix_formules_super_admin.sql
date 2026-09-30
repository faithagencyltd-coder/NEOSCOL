-- =============================================================================
-- Prix des formules modifiables par le Super Admin, avec historique.
--
-- Jamais rétroactif : chaque abonnement garde le prix de sa souscription (les
-- renouvellements et factures d'un abonné utilisent son prix enregistré) ; le
-- nouveau prix s'applique aux nouvelles souscriptions, aux essais qui passent
-- au paiement et aux changements de formule. Chaque changement est historisé
-- (ancien / nouveau prix, auteur, motif) et audité.
-- =============================================================================

create table public.subscription_plan_price_history (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.subscription_plans (id) on delete cascade,
  old_monthly_price integer not null,
  old_annual_price integer not null,
  monthly_price integer not null,
  annual_price integer not null,
  annual_discount_percent numeric(5, 2) not null,
  reason text not null check (char_length(reason) between 3 and 500),
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default now()
);
create index subscription_plan_price_history_plan_idx on public.subscription_plan_price_history (plan_id, changed_at desc);
alter table public.subscription_plan_price_history enable row level security;
create policy subscription_plan_price_history_select on public.subscription_plan_price_history for select to authenticated
  using ((select app.is_platform_admin()));
grant select on public.subscription_plan_price_history to authenticated;

create or replace function public.platform_update_plan_prices(p_plan uuid, p_monthly_price integer, p_annual_discount_percent numeric, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.subscription_plans;
  v_annual integer;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_monthly_price is null or p_monthly_price < 100 or p_monthly_price > 100000000 then
    raise exception 'Prix mensuel invalide.' using errcode = 'check_violation';
  end if;
  if p_annual_discount_percent is null or p_annual_discount_percent < 0 or p_annual_discount_percent > 60 then
    raise exception 'Remise annuelle invalide (0 à 60 %%).' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif du changement de prix est obligatoire.' using errcode = 'check_violation';
  end if;
  select * into v_plan from public.subscription_plans where id = p_plan for update;
  if v_plan.id is null then
    raise exception 'Formule introuvable.' using errcode = 'no_data_found';
  end if;
  -- Prix annuel = 12 mois moins la remise, arrondi à la centaine (comme les prix officiels).
  v_annual := (round(p_monthly_price * 12 * (1 - p_annual_discount_percent / 100) / 100) * 100)::integer;
  insert into public.subscription_plan_price_history (plan_id, old_monthly_price, old_annual_price, monthly_price, annual_price,
                                                      annual_discount_percent, reason, changed_by)
  values (v_plan.id, v_plan.monthly_price, v_plan.annual_price, p_monthly_price, v_annual, p_annual_discount_percent, left(btrim(p_reason), 500), auth.uid());
  update public.subscription_plans
     set monthly_price = p_monthly_price, annual_price = v_annual, annual_discount_percent = p_annual_discount_percent
   where id = v_plan.id;
  perform app.audit(null, 'platform.plan_prices', 'subscription_plans', v_plan.id,
    'Prix de la formule ' || v_plan.name || ' : ' || v_plan.monthly_price || ' → ' || p_monthly_price || ' ' || v_plan.currency || ' / mois',
    jsonb_build_object('old_monthly', v_plan.monthly_price, 'old_annual', v_plan.annual_price, 'monthly', p_monthly_price,
                       'annual', v_annual, 'discount', p_annual_discount_percent, 'reason', left(btrim(p_reason), 500)));
  return jsonb_build_object('monthly_price', p_monthly_price, 'annual_price', v_annual);
end;
$$;

revoke all on function public.platform_update_plan_prices(uuid, integer, numeric, text) from public, anon;
grant execute on function public.platform_update_plan_prices(uuid, integer, numeric, text) to authenticated;
