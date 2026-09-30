-- =============================================================================
-- Offres commerciales réglables par le Super Admin, sans toucher au code :
--   * durée de l'essai gratuit par formule ;
--   * codes promo (pourcentage ou montant, formules et périodicités visées,
--     dates, nombre d'utilisations, une fois par établissement) ;
--   * offres automatiques limitées dans le temps (sans code) ;
--   * tarif négocié pour un établissement précis.
-- Les montants restent calculés EN BASE ; rien n'est modifié rétroactivement
-- (factures déjà émises inchangées). Aucune donnée existante n'est supprimée.
-- =============================================================================

alter table public.subscription_events drop constraint subscription_events_event_type_check;
alter table public.subscription_events add constraint subscription_events_event_type_check check (event_type in (
  'trial_started', 'plan_selected', 'checkout_created', 'payment_pending', 'payment_success', 'payment_failed', 'payment_cancelled',
  'invoice_created', 'invoice_paid', 'invoice_cancelled', 'subscription_activated', 'subscription_renewed', 'subscription_cancelled',
  'subscription_resumed', 'subscription_past_due', 'subscription_grace_period', 'subscription_restricted', 'subscription_expired',
  'subscription_reactivated', 'plan_changed', 'manual_payment', 'notification_sent', 'components_changed', 'space_created', 'promo_applied'));

alter table public.subscription_invoices add column promo_code text;
alter table public.subscription_invoices add column promo_discount integer not null default 0 check (promo_discount >= 0);
alter table public.subscription_invoices add column negotiated boolean not null default false;

create table public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,29}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  discount_type text not null check (discount_type in ('percent', 'amount')),
  discount_value integer not null check (discount_value > 0),
  plan_codes text[],
  intervals text[] check (intervals is null or intervals <@ array['MONTHLY', 'YEARLY']),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  auto_apply boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (discount_type <> 'percent' or discount_value <= 90),
  check (ends_at is null or ends_at > starts_at)
);

create table public.promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_id uuid not null references public.promo_codes (id),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invoice_id uuid not null unique references public.subscription_invoices (id) on delete cascade,
  amount_before integer not null,
  discount integer not null check (discount > 0),
  created_at timestamptz not null default now(),
  unique (promo_id, organization_id)
);

create table public.negotiated_prices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_code text not null,
  monthly_price integer not null check (monthly_price >= 100),
  annual_price integer not null check (annual_price >= 100),
  note text check (note is null or char_length(note) <= 300),
  valid_until date,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index negotiated_prices_one_active on public.negotiated_prices (organization_id, plan_code) where is_active;

alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.negotiated_prices enable row level security;
revoke all on public.promo_codes, public.promo_redemptions, public.negotiated_prices from anon, authenticated;
create policy promo_codes_platform on public.promo_codes for select to authenticated using (app.is_platform_admin());
create policy promo_redemptions_platform on public.promo_redemptions for select to authenticated using (app.is_platform_admin());
create policy negotiated_prices_read on public.negotiated_prices for select to authenticated
  using (app.is_platform_admin() or app.has_permission(organization_id, 'billing.read'));
grant select on public.promo_codes, public.promo_redemptions, public.negotiated_prices to authenticated;
grant select on public.promo_codes, public.promo_redemptions, public.negotiated_prices to service_role;

-- Tarif négocié en vigueur pour un établissement et une formule.
create or replace function app.negotiated_price(p_org uuid, p_plan_code text)
returns public.negotiated_prices
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.negotiated_prices
   where organization_id = p_org and plan_code = p_plan_code and is_active
     and (valid_until is null or valid_until >= current_date)
   limit 1;
$$;

-- Facture d'abonnement : même calcul qu'avant, avec le tarif négocié prioritaire.
create or replace function app.billing_create_invoice(p_org uuid, p_plan_code text, p_interval text, p_kind text)
returns public.subscription_invoices
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_plan public.subscription_plans;
  v_neg public.negotiated_prices;
  v_list integer;
  v_amount integer;
  v_unit_m integer;
  v_unit_a integer;
  v_inv public.subscription_invoices;
begin
  if p_interval not in ('MONTHLY', 'YEARLY') then
    raise exception 'Périodicité invalide.' using errcode = 'check_violation';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org;
  if v_sub.id is null then
    raise exception 'Abonnement introuvable.' using errcode = 'no_data_found';
  end if;
  select * into v_plan from public.subscription_plans where code = p_plan_code and (is_active or id = v_sub.plan_id);
  if v_plan.id is null then
    raise exception 'Formule inconnue ou indisponible.' using errcode = 'check_violation';
  end if;
  v_neg := app.negotiated_price(p_org, p_plan_code);
  if v_neg.id is not null then
    v_unit_m := v_neg.monthly_price;
    v_unit_a := v_neg.annual_price;
    v_list := case p_interval when 'YEARLY' then v_neg.monthly_price * 12 else v_neg.monthly_price end;
    v_amount := case p_interval when 'YEARLY' then v_neg.annual_price else v_neg.monthly_price end;
  elsif v_plan.id = v_sub.plan_id and v_sub.status <> 'TRIALING' then
    v_unit_m := v_sub.monthly_price;
    v_unit_a := v_sub.annual_price;
    v_list := case p_interval when 'YEARLY' then v_sub.monthly_price * 12 else v_sub.monthly_price end;
    v_amount := case p_interval when 'YEARLY' then v_sub.annual_price else v_sub.monthly_price end;
  else
    v_unit_m := v_plan.monthly_price;
    v_unit_a := v_plan.annual_price;
    v_list := case p_interval when 'YEARLY' then v_plan.annual_list_price else v_plan.monthly_price end;
    v_amount := case p_interval when 'YEARLY' then v_plan.annual_price else v_plan.monthly_price end;
  end if;
  insert into public.subscription_invoices (
    organization_id, subscription_id, invoice_number, plan_id, plan_code, plan_name, billing_interval,
    unit_monthly_price, unit_annual_price, list_amount, discount_amount, amount, currency, kind, status,
    due_at, created_by, negotiated
  ) values (
    p_org, v_sub.id,
    'NSC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.subscription_invoice_number_seq')::text, 6, '0'),
    v_plan.id, v_plan.code, v_plan.name, p_interval,
    v_unit_m, v_unit_a, v_list, greatest(v_list - v_amount, 0), v_amount, v_plan.currency, p_kind, 'PENDING',
    greatest(now(), coalesce(app.subscription_end_at(v_sub), now())), auth.uid(), v_neg.id is not null
  ) returning * into v_inv;
  update public.subscription_invoices set pdf_url = '/api/abonnement/factures/' || v_inv.id where id = v_inv.id;
  perform app.billing_event(p_org, v_sub.id, 'invoice_created',
    jsonb_build_object('invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number, 'amount', v_amount, 'plan', v_plan.code,
                       'interval', p_interval, 'kind', p_kind, 'negotiated', v_neg.id is not null));
  return v_inv;
end;
$$;

-- Offre applicable (code saisi, sinon meilleure offre automatique) : contrôles complets.
create or replace function app.find_promo(p_org uuid, p_plan_code text, p_interval text, p_code text)
returns public.promo_codes
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_promo public.promo_codes;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  select * into v_promo from public.promo_codes p
   where p.is_active
     and (case when v_code <> '' then p.code = v_code else p.auto_apply end)
     and p.starts_at <= now() and (p.ends_at is null or p.ends_at > now())
     and (p.plan_codes is null or p_plan_code = any (p.plan_codes))
     and (p.intervals is null or p_interval = any (p.intervals))
     and (p.max_uses is null or (select count(*) from public.promo_redemptions r where r.promo_id = p.id) < p.max_uses)
     and not exists (select 1 from public.promo_redemptions r where r.promo_id = p.id and r.organization_id = p_org)
   order by case p.discount_type when 'amount' then p.discount_value else p.discount_value * 1000 end desc
   limit 1;
  return v_promo;
end;
$$;

create or replace function app.promo_discount(p_promo public.promo_codes, p_amount integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select least(greatest(p_amount - 100, 0),
    case p_promo.discount_type when 'percent' then (round(p_amount * p_promo.discount_value / 100.0 / 100.0) * 100)::integer else p_promo.discount_value end);
$$;

-- Aperçu (aucune écriture) : réduction qui serait appliquée.
create or replace function public.billing_preview_promo(p_org uuid, p_plan_code text, p_interval text, p_code text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_promo public.promo_codes;
  v_neg public.negotiated_prices;
  v_plan public.subscription_plans;
  v_sub public.subscriptions;
  v_base integer;
  v_discount integer;
begin
  if not app.has_permission(p_org, 'billing.read') then
    raise exception 'Permission requise : billing.read' using errcode = 'insufficient_privilege';
  end if;
  select * into v_plan from public.subscription_plans where code = p_plan_code;
  select * into v_sub from public.subscriptions where organization_id = p_org;
  v_neg := app.negotiated_price(p_org, p_plan_code);
  -- Même base que la facture : tarif négocié, sinon prix garanti de l'abonné, sinon prix de la formule.
  v_base := case
    when v_neg.id is not null then (case p_interval when 'YEARLY' then v_neg.annual_price else v_neg.monthly_price end)
    when v_plan.id = v_sub.plan_id and v_sub.status <> 'TRIALING' then (case p_interval when 'YEARLY' then v_sub.annual_price else v_sub.monthly_price end)
    else (case p_interval when 'YEARLY' then v_plan.annual_price else v_plan.monthly_price end) end;
  v_promo := app.find_promo(p_org, p_plan_code, p_interval, p_code);
  if v_promo.id is null then
    return jsonb_build_object('ok', false, 'negotiated', v_neg.id is not null, 'base', v_base, 'amount', v_base,
      'message', case when coalesce(btrim(p_code), '') <> '' then 'Code promo invalide, expiré ou déjà utilisé.' else null end);
  end if;
  v_discount := app.promo_discount(v_promo, v_base);
  return jsonb_build_object('ok', v_discount > 0, 'negotiated', v_neg.id is not null, 'code', v_promo.code, 'name', v_promo.name,
    'auto', v_promo.auto_apply and coalesce(btrim(p_code), '') = '', 'base', v_base, 'discount', v_discount, 'amount', v_base - v_discount,
    'ends_at', v_promo.ends_at);
end;
$$;

-- Paiement avec offre : facture en attente préparée (tarif négocié + offre), puis
-- même circuit que billing_start_checkout (qui réutilise cette facture).
create or replace function public.billing_start_checkout_offer(p_org uuid, p_plan_code text, p_interval text, p_provider text, p_mode text, p_code text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_inv public.subscription_invoices;
  v_kind text;
  v_promo public.promo_codes;
  v_discount integer;
begin
  if not app.has_permission(p_org, 'billing.manage') then
    raise exception 'Permission requise : billing.manage' using errcode = 'insufficient_privilege';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org;
  v_kind := case
    when v_sub.status = 'TRIALING' then 'subscription'
    when v_sub.plan_id = (select id from public.subscription_plans where code = p_plan_code) and v_sub.billing_interval = p_interval then 'renewal'
    else 'plan_change' end;
  select * into v_inv from public.subscription_invoices
   where organization_id = p_org and status = 'PENDING' and plan_code = p_plan_code and billing_interval = p_interval
   order by issued_at desc limit 1 for update;
  if v_inv.id is null then
    v_inv := app.billing_create_invoice(p_org, p_plan_code, p_interval, v_kind);
  end if;
  if v_inv.promo_code is null then
    v_promo := app.find_promo(p_org, p_plan_code, p_interval, p_code);
    if coalesce(btrim(p_code), '') <> '' and v_promo.id is null then
      raise exception 'Code promo invalide, expiré ou déjà utilisé.' using errcode = 'check_violation';
    end if;
    if v_promo.id is not null then
      v_discount := app.promo_discount(v_promo, v_inv.amount);
      if v_discount > 0 then
        insert into public.promo_redemptions (promo_id, organization_id, invoice_id, amount_before, discount)
        values (v_promo.id, p_org, v_inv.id, v_inv.amount, v_discount);
        update public.subscription_invoices
           set promo_code = v_promo.code, promo_discount = v_discount,
               discount_amount = discount_amount + v_discount, amount = amount - v_discount, updated_at = now()
         where id = v_inv.id;
        perform app.billing_event(p_org, v_sub.id, 'promo_applied',
          jsonb_build_object('invoice_id', v_inv.id, 'code', v_promo.code, 'discount', v_discount));
      end if;
    end if;
  end if;
  return public.billing_start_checkout(p_org, p_plan_code, p_interval, p_provider, p_mode);
end;
$$;

-- Offres automatiques en cours (affichées sur la page des tarifs et au paiement).
create or replace function public.active_offers()
returns table (name text, description text, discount_type text, discount_value integer, plan_codes text[], intervals text[], ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.name, p.description, p.discount_type, p.discount_value, p.plan_codes, p.intervals, p.ends_at
    from public.promo_codes p
   where p.is_active and p.auto_apply and p.starts_at <= now() and (p.ends_at is null or p.ends_at > now())
     and (p.max_uses is null or (select count(*) from public.promo_redemptions r where r.promo_id = p.id) < p.max_uses)
   order by p.ends_at nulls last;
$$;

-- ----------------------------------------------------------------------------- Super Admin
create or replace function public.platform_save_promo(
  p_id uuid, p_code text, p_name text, p_description text, p_discount_type text, p_discount_value integer,
  p_plan_codes text[], p_intervals text[], p_starts_at timestamptz, p_ends_at timestamptz, p_max_uses integer,
  p_auto_apply boolean, p_is_active boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  perform app.require_platform_admin();
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{2,29}$' then
    raise exception 'Code invalide : 3 à 30 lettres majuscules, chiffres, tirets.' using errcode = 'check_violation';
  end if;
  if p_plan_codes is not null and exists (select 1 from unnest(p_plan_codes) c where c not in (select code from public.subscription_plans)) then
    raise exception 'Formule inconnue dans l''offre.' using errcode = 'check_violation';
  end if;
  if p_id is null then
    insert into public.promo_codes (code, name, description, discount_type, discount_value, plan_codes, intervals, starts_at, ends_at, max_uses, auto_apply, is_active, created_by)
    values (v_code, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), p_discount_type, p_discount_value,
            nullif(p_plan_codes, '{}'), nullif(p_intervals, '{}'), coalesce(p_starts_at, now()), p_ends_at, p_max_uses, coalesce(p_auto_apply, false), coalesce(p_is_active, true), auth.uid())
    returning id into v_id;
  else
    update public.promo_codes set code = v_code, name = btrim(p_name), description = nullif(btrim(coalesce(p_description, '')), ''),
      discount_type = p_discount_type, discount_value = p_discount_value, plan_codes = nullif(p_plan_codes, '{}'),
      intervals = nullif(p_intervals, '{}'), starts_at = coalesce(p_starts_at, starts_at), ends_at = p_ends_at, max_uses = p_max_uses,
      auto_apply = coalesce(p_auto_apply, false), is_active = coalesce(p_is_active, true), updated_at = now()
     where id = p_id returning id into v_id;
    if v_id is null then
      raise exception 'Offre introuvable.' using errcode = 'invalid_parameter_value';
    end if;
  end if;
  perform app.audit(null, 'platform.promo_saved', 'promo_codes', v_id,
    'Offre ' || v_code || ' (' || case p_discount_type when 'percent' then p_discount_value || ' %' else p_discount_value || ' F' end || ')'
      || case when coalesce(p_is_active, true) then '' else ' — désactivée' end,
    jsonb_build_object('code', v_code, 'type', p_discount_type, 'value', p_discount_value, 'auto', p_auto_apply, 'active', p_is_active), 'success');
  return v_id;
end;
$$;

create or replace function public.platform_set_negotiated_price(p_org uuid, p_plan_code text, p_monthly integer, p_annual integer, p_note text, p_valid_until date, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  if not exists (select 1 from public.subscription_plans where code = p_plan_code) then
    raise exception 'Formule inconnue.' using errcode = 'check_violation';
  end if;
  -- L'ancien tarif est conservé (historique), désactivé.
  update public.negotiated_prices set is_active = false, updated_at = now() where organization_id = p_org and plan_code = p_plan_code and is_active;
  if p_active then
    if p_monthly is null or p_annual is null or p_monthly < 100 or p_annual < 100 then
      raise exception 'Prix négociés invalides.' using errcode = 'check_violation';
    end if;
    insert into public.negotiated_prices (organization_id, plan_code, monthly_price, annual_price, note, valid_until, created_by)
    values (p_org, p_plan_code, p_monthly, p_annual, nullif(btrim(coalesce(p_note, '')), ''), p_valid_until, auth.uid());
  end if;
  perform app.audit(p_org, 'platform.negotiated_price', 'negotiated_prices', null,
    case when p_active then 'Tarif négocié ' || p_plan_code || ' : ' || p_monthly || ' F / mois, ' || p_annual || ' F / an' else 'Tarif négocié ' || p_plan_code || ' retiré' end,
    jsonb_build_object('plan', p_plan_code, 'monthly', p_monthly, 'annual', p_annual, 'active', p_active), 'success');
end;
$$;

create or replace function public.platform_update_plan_trial(p_plan uuid, p_trial_days integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_old integer;
begin
  perform app.require_platform_admin();
  if p_trial_days is null or p_trial_days < 0 or p_trial_days > 90 then
    raise exception 'Durée d''essai : de 0 à 90 jours.' using errcode = 'check_violation';
  end if;
  select trial_days into v_old from public.subscription_plans where id = p_plan for update;
  if v_old is null then
    raise exception 'Formule introuvable.' using errcode = 'invalid_parameter_value';
  end if;
  update public.subscription_plans set trial_days = p_trial_days, updated_at = now() where id = p_plan;
  perform app.audit(null, 'platform.plan_trial', 'subscription_plans', p_plan,
    'Essai gratuit : ' || v_old || ' → ' || p_trial_days || ' jours (nouveaux essais uniquement)', jsonb_build_object('from', v_old, 'to', p_trial_days), 'success');
end;
$$;

revoke all on function app.negotiated_price(uuid, text), app.find_promo(uuid, text, text, text), app.promo_discount(public.promo_codes, integer) from public, anon, authenticated;
revoke all on function public.billing_preview_promo(uuid, text, text, text), public.billing_start_checkout_offer(uuid, text, text, text, text, text),
  public.platform_save_promo(uuid, text, text, text, text, integer, text[], text[], timestamptz, timestamptz, integer, boolean, boolean),
  public.platform_set_negotiated_price(uuid, text, integer, integer, text, date, boolean), public.platform_update_plan_trial(uuid, integer) from public, anon;
grant execute on function public.billing_preview_promo(uuid, text, text, text), public.billing_start_checkout_offer(uuid, text, text, text, text, text),
  public.platform_save_promo(uuid, text, text, text, text, integer, text[], text[], timestamptz, timestamptz, integer, boolean, boolean),
  public.platform_set_negotiated_price(uuid, text, integer, integer, text, date, boolean), public.platform_update_plan_trial(uuid, integer) to authenticated;
revoke all on function public.active_offers() from public;
grant execute on function public.active_offers() to anon, authenticated;
