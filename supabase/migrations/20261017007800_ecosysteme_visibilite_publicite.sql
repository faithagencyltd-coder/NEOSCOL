-- =============================================================================
-- Écosystème public — E6 et E7 : monétisation de la visibilité, publicité externe.
--
--  • Offres de visibilité (mise en avant d'une fiche, d'une campagne, d'une
--    annonce ; frais de publication ; accompagnement publicitaire) :
--    configurées par le Super Admin, INACTIVES tant qu'il ne les active pas.
--    Une commande reste « en attente de paiement » jusqu'à la confirmation du
--    paiement par la plateforme (aucun paiement simulé). Payer une mise en avant
--    ne donne JAMAIS le statut « vérifié ».
--  • Publicité externe (Meta : Facebook / Instagram, TikTok…) : architecture
--    de demandes et de suivi, sans connexion automatique. Aucune campagne
--    n'est lancée par l'application ; les résultats sont saisis depuis les
--    rapports de la plateforme publicitaire, avec leur source.
--    Règle financière : le budget publicitaire est payé directement par
--    l'établissement à la plateforme publicitaire ; il est distinct de
--    l'abonnement et des frais de service NeoScool.
-- =============================================================================

create table public.visibility_offers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{3,30}$'),
  label text not null check (char_length(btrim(label)) between 3 and 120),
  kind text not null check (kind in ('featured_profile', 'featured_campaign', 'featured_opportunity', 'publication', 'ad_assistance')),
  description text check (description is null or char_length(description) <= 500),
  price integer not null check (price > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  duration_days integer check (duration_days is null or duration_days between 1 and 365),
  country text references public.countries (code),
  org_type text,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.visibility_offers enable row level security;
create policy visibility_offers_select on public.visibility_offers for select to authenticated using (active or (select app.is_platform_admin()));
revoke insert, update, delete on public.visibility_offers from authenticated, anon;

create table public.visibility_orders (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  offer_id uuid not null references public.visibility_offers (id),
  organization_id uuid references public.organizations (id) on delete set null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('profile', 'campaign', 'opportunity', 'ad_request')),
  target_id uuid not null,
  amount integer not null check (amount > 0),
  currency text not null,
  status text not null default 'awaiting_payment' check (status in ('awaiting_payment', 'paid', 'cancelled', 'refused')),
  payment_reference text check (payment_reference is null or char_length(payment_reference) <= 120),
  confirmed_by uuid references public.profiles (id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.visibility_orders enable row level security;
create policy visibility_orders_select on public.visibility_orders for select to authenticated
  using (user_id = auth.uid() or (organization_id is not null and app.has_permission(organization_id, 'settings.manage')) or (select app.is_platform_admin()));
revoke insert, update, delete on public.visibility_orders from authenticated, anon;

create or replace function public.platform_save_visibility_offer(p_id uuid, p_code text, p_label text, p_kind text, p_description text, p_price integer,
  p_currency text, p_duration integer, p_country text, p_type text, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if p_kind like 'featured_%' and p_duration is null then
    raise exception 'Une mise en avant a une durée (en jours).' using errcode = 'check_violation';
  end if;
  if p_id is null then
    insert into public.visibility_offers (code, label, kind, description, price, currency, duration_days, country, org_type, active)
    values (upper(btrim(p_code)), btrim(p_label), p_kind, nullif(btrim(coalesce(p_description, '')), ''), p_price, upper(p_currency), p_duration,
            nullif(p_country, ''), nullif(p_type, ''), p_active);
  else
    update public.visibility_offers set code = upper(btrim(p_code)), label = btrim(p_label), kind = p_kind, description = nullif(btrim(coalesce(p_description, '')), ''),
           price = p_price, currency = upper(p_currency), duration_days = p_duration, country = nullif(p_country, ''), org_type = nullif(p_type, ''),
           active = p_active, updated_at = now()
     where id = p_id;
  end if;
  perform app.audit(null, 'platform.visibility_offer', 'visibility_offers', p_id,
    'Offre de visibilité ' || upper(btrim(p_code)) || case when p_active then ' (active)' else ' (inactive)' end, jsonb_build_object('price', p_price, 'currency', p_currency));
end;
$$;

-- Commande d'une offre active, sur un contenu appartenant au demandeur.
create or replace function public.create_visibility_order(p_offer uuid, p_target_type text, p_target uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  f public.visibility_offers;
  v_org uuid;
  v_id uuid;
  o public.organizations;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = 'insufficient_privilege';
  end if;
  select * into f from public.visibility_offers where id = p_offer and active;
  if f.id is null then
    raise exception 'Offre indisponible.' using errcode = 'no_data_found';
  end if;
  if not ((f.kind = 'featured_profile' and p_target_type = 'profile') or (f.kind = 'featured_campaign' and p_target_type = 'campaign')
          or (f.kind = 'featured_opportunity' and p_target_type = 'opportunity') or (f.kind = 'publication' and p_target_type = 'opportunity')
          or (f.kind = 'ad_assistance' and p_target_type = 'ad_request')) then
    raise exception 'Cette offre ne s''applique pas à ce contenu.' using errcode = 'check_violation';
  end if;
  if p_target_type = 'profile' then
    v_org := (select organization_id from public.org_public_profiles where organization_id = p_target);
    if v_org is null or not app.has_permission(v_org, 'settings.manage') then raise exception 'Contenu introuvable.' using errcode = 'no_data_found'; end if;
  elsif p_target_type = 'campaign' then
    v_org := (select organization_id from public.promo_campaigns where id = p_target);
    if v_org is null or not app.has_permission(v_org, 'communication.send') then raise exception 'Contenu introuvable.' using errcode = 'no_data_found'; end if;
  elsif p_target_type = 'ad_request' then
    v_org := (select organization_id from public.ad_requests where id = p_target);
    if v_org is null or not app.has_permission(v_org, 'communication.send') then raise exception 'Contenu introuvable.' using errcode = 'no_data_found'; end if;
  else
    if not app.can_manage_opportunity(p_target) then raise exception 'Contenu introuvable.' using errcode = 'no_data_found'; end if;
    v_org := (select organization_id from public.opportunities where id = p_target);
  end if;
  if v_org is not null then
    select * into o from public.organizations where id = v_org;
    if (f.country is not null and f.country <> o.country) or (f.org_type is not null and f.org_type <> o.type::text) then
      raise exception 'Cette offre n''est pas proposée pour votre établissement.' using errcode = 'check_violation';
    end if;
  end if;
  if exists (select 1 from public.visibility_orders where target_id = p_target and offer_id = p_offer and status = 'awaiting_payment') then
    raise exception 'Une commande identique attend déjà son paiement.' using errcode = 'unique_violation';
  end if;
  insert into public.visibility_orders (offer_id, organization_id, user_id, target_type, target_id, amount, currency)
  values (f.id, v_org, auth.uid(), p_target_type, p_target, f.price, f.currency) returning id into v_id;
  return v_id;
end;
$$;

-- Confirmation d'un paiement reçu (référence obligatoire) → mise en avant appliquée.
create or replace function public.platform_confirm_visibility_order(p_order uuid, p_decision text, p_reference text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.visibility_orders;
  f public.visibility_offers;
  v_until timestamptz;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  select * into v from public.visibility_orders where id = p_order and status = 'awaiting_payment' for update;
  if v.id is null then
    raise exception 'Commande introuvable ou déjà traitée.' using errcode = 'no_data_found';
  end if;
  if p_decision = 'refused' then
    update public.visibility_orders set status = 'refused', payment_reference = nullif(btrim(coalesce(p_reference, '')), ''), confirmed_by = auth.uid(), confirmed_at = now() where id = p_order;
    perform app.audit(v.organization_id, 'platform.visibility_order_refused', 'visibility_orders', p_order, 'Commande de visibilité n° ' || v.number || ' refusée', '{}'::jsonb);
    return;
  end if;
  if length(btrim(coalesce(p_reference, ''))) < 3 then
    raise exception 'La référence du paiement reçu est obligatoire.' using errcode = 'check_violation';
  end if;
  select * into f from public.visibility_offers where id = v.offer_id;
  update public.visibility_orders set status = 'paid', payment_reference = btrim(p_reference), confirmed_by = auth.uid(), confirmed_at = now() where id = p_order;
  if f.duration_days is not null then
    if v.target_type = 'profile' then
      select greatest(coalesce(featured_until, now()), now()) + make_interval(days => f.duration_days) into v_until from public.org_public_profiles where organization_id = v.target_id;
      update public.org_public_profiles set featured_until = v_until where organization_id = v.target_id;
    elsif v.target_type = 'campaign' then
      select greatest(coalesce(featured_until, now()), now()) + make_interval(days => f.duration_days) into v_until from public.promo_campaigns where id = v.target_id;
      update public.promo_campaigns set featured_until = v_until where id = v.target_id;
    elsif v.target_type = 'opportunity' and f.kind = 'featured_opportunity' then
      select greatest(coalesce(featured_until, now()), now()) + make_interval(days => f.duration_days) into v_until from public.opportunities where id = v.target_id;
      update public.opportunities set featured_until = v_until where id = v.target_id;
    end if;
  end if;
  perform app.audit(v.organization_id, 'platform.visibility_order_paid', 'visibility_orders', p_order,
    'Commande de visibilité n° ' || v.number || ' payée (' || v.amount || ' ' || v.currency || ')', jsonb_build_object('reference', btrim(p_reference)));
end;
$$;

create or replace function public.cancel_visibility_order(p_order uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.visibility_orders set status = 'cancelled' where id = p_order and status = 'awaiting_payment' and user_id = auth.uid();
  if not found then
    raise exception 'Commande introuvable.' using errcode = 'no_data_found';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Publicité externe
-- -----------------------------------------------------------------------------
create table public.ad_platforms (
  provider text primary key check (provider in ('meta', 'tiktok', 'google', 'other')),
  label text not null,
  enabled boolean not null default false,
  api_connected boolean not null default false,
  note text check (note is null or char_length(note) <= 500),
  updated_at timestamptz not null default now()
);
insert into public.ad_platforms (provider, label) values
  ('meta', 'Meta (Facebook, Instagram)'), ('tiktok', 'TikTok'), ('google', 'Google / YouTube'), ('other', 'Autre plateforme')
on conflict do nothing;
alter table public.ad_platforms enable row level security;
create policy ad_platforms_select on public.ad_platforms for select to authenticated using (true);
revoke insert, update, delete on public.ad_platforms from authenticated, anon;

create or replace function public.platform_set_ad_platform(p_provider text, p_enabled boolean, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  update public.ad_platforms set enabled = p_enabled, note = nullif(btrim(coalesce(p_note, '')), ''), updated_at = now() where provider = p_provider;
  perform app.audit(null, 'platform.ad_platform', 'ad_platforms', null, 'Publicité externe ' || p_provider || case when p_enabled then ' autorisée' else ' désactivée' end, '{}'::jsonb);
end;
$$;

create table public.ad_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mode text not null check (mode in ('self', 'assisted')),
  platform text not null references public.ad_platforms (provider),
  campaign_id uuid references public.promo_campaigns (id) on delete set null,
  objective text not null check (char_length(btrim(objective)) between 3 and 300),
  countries text[] not null default '{}',
  cities text[] not null default '{}',
  audience text check (audience is null or char_length(audience) <= 500),
  starts_on date,
  ends_on date,
  budget_amount integer check (budget_amount is null or budget_amount > 0),
  budget_currency text check (budget_currency is null or budget_currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'preparing', 'awaiting_school', 'validated', 'running', 'completed', 'cancelled', 'refused')),
  platform_note text check (platform_note is null or char_length(platform_note) <= 2000),
  school_validated_at timestamptz,
  school_validated_by uuid references public.profiles (id) on delete set null,
  results jsonb not null default '{}'::jsonb check (jsonb_typeof(results) = 'object'),
  results_source text check (results_source is null or char_length(results_source) <= 300),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.ad_requests enable row level security;
create policy ad_requests_select on public.ad_requests for select to authenticated
  using (app.has_permission(organization_id, 'communication.send') or (select app.is_platform_admin()));
revoke insert, update, delete on public.ad_requests from authenticated, anon;

create or replace function public.save_ad_request(p_org uuid, p_id uuid, p_data jsonb, p_submit boolean)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_id;
begin
  if not app.has_permission(p_org, 'communication.send') then
    raise exception 'Droit « Communication » requis.' using errcode = 'insufficient_privilege';
  end if;
  if not app.module_enabled('external_ads', p_org) then
    raise exception 'La publicité externe n''est pas ouverte pour votre établissement.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.ad_platforms where provider = p_data ->> 'platform' and enabled) then
    raise exception 'Cette plateforme publicitaire n''est pas autorisée par NeoScool.' using errcode = 'check_violation';
  end if;
  if v_id is null then
    insert into public.ad_requests (organization_id, mode, platform, campaign_id, objective, countries, cities, audience, starts_on, ends_on, budget_amount, budget_currency, status, created_by)
    values (p_org, p_data ->> 'mode', p_data ->> 'platform',
        (select c.id from public.promo_campaigns c where c.id = nullif(p_data ->> 'campaign_id', '')::uuid and c.organization_id = p_org),
        btrim(p_data ->> 'objective'),
        coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_data -> 'countries', '[]'::jsonb)) x), '{}'),
        coalesce((select array_agg(btrim(x)) from jsonb_array_elements_text(coalesce(p_data -> 'cities', '[]'::jsonb)) x where btrim(x) <> ''), '{}'),
        nullif(btrim(p_data ->> 'audience'), ''), nullif(p_data ->> 'starts_on', '')::date, nullif(p_data ->> 'ends_on', '')::date,
        nullif(p_data ->> 'budget_amount', '')::integer, nullif(p_data ->> 'budget_currency', ''),
        case when p_submit then 'submitted' else 'draft' end, auth.uid())
    returning id into v_id;
  else
    update public.ad_requests set mode = p_data ->> 'mode', platform = p_data ->> 'platform', objective = btrim(p_data ->> 'objective'),
        audience = nullif(btrim(p_data ->> 'audience'), ''), starts_on = nullif(p_data ->> 'starts_on', '')::date, ends_on = nullif(p_data ->> 'ends_on', '')::date,
        budget_amount = nullif(p_data ->> 'budget_amount', '')::integer, budget_currency = nullif(p_data ->> 'budget_currency', ''),
        status = case when p_submit then 'submitted' else status end, updated_at = now()
     where id = v_id and organization_id = p_org and status in ('draft', 'submitted', 'awaiting_school');
    if not found then
      raise exception 'Demande introuvable ou déjà en cours.' using errcode = 'no_data_found';
    end if;
  end if;
  perform app.audit(p_org, 'communication.ad_request', 'ad_requests', v_id, 'Demande de publicité externe (' || (p_data ->> 'platform') || ')', '{}'::jsonb);
  return v_id;
end;
$$;

-- L'établissement valide le plan proposé AVANT tout lancement ; il peut aussi saisir ses résultats (mode autonome).
create or replace function public.school_ad_request_action(p_org uuid, p_id uuid, p_action text, p_results jsonb, p_source text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.has_permission(p_org, 'communication.send') then
    raise exception 'Droit « Communication » requis.' using errcode = 'insufficient_privilege';
  end if;
  if p_action = 'validate' then
    update public.ad_requests set status = 'validated', school_validated_at = now(), school_validated_by = auth.uid(), updated_at = now()
     where id = p_id and organization_id = p_org and status in ('awaiting_school', 'submitted');
  elsif p_action = 'cancel' then
    update public.ad_requests set status = 'cancelled', updated_at = now() where id = p_id and organization_id = p_org and status not in ('running', 'completed');
  elsif p_action = 'results' then
    if length(btrim(coalesce(p_source, ''))) < 3 then
      raise exception 'Indiquez la source des résultats (rapport de la plateforme publicitaire).' using errcode = 'check_violation';
    end if;
    update public.ad_requests set results = coalesce(p_results, '{}'::jsonb), results_source = btrim(p_source), updated_at = now(),
           status = case when status = 'validated' or status = 'running' then status else status end
     where id = p_id and organization_id = p_org and mode = 'self';
  else
    raise exception 'Action inconnue.' using errcode = 'check_violation';
  end if;
  if not found then
    raise exception 'Demande introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.audit(p_org, 'communication.ad_request_' || p_action, 'ad_requests', p_id, 'Publicité externe : ' || p_action, '{}'::jsonb);
end;
$$;

-- Plateforme : préparation, demande de validation, lancement constaté (manuel), résultats saisis avec leur source.
create or replace function public.platform_update_ad_request(p_id uuid, p_status text, p_note text, p_results jsonb, p_source text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.ad_requests;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  select * into a from public.ad_requests where id = p_id for update;
  if a.id is null then
    raise exception 'Demande introuvable.' using errcode = 'no_data_found';
  end if;
  if p_status = 'running' and a.school_validated_at is null then
    raise exception 'L''établissement doit valider le plan avant tout lancement.' using errcode = 'check_violation';
  end if;
  if p_results is not null and p_results <> '{}'::jsonb and length(btrim(coalesce(p_source, ''))) < 3 then
    raise exception 'Indiquez la source des résultats (rapport de la plateforme publicitaire).' using errcode = 'check_violation';
  end if;
  update public.ad_requests set status = p_status, platform_note = coalesce(nullif(btrim(coalesce(p_note, '')), ''), platform_note),
         results = case when p_results is not null and p_results <> '{}'::jsonb then p_results else results end,
         results_source = coalesce(nullif(btrim(coalesce(p_source, '')), ''), results_source), updated_at = now()
   where id = p_id;
  perform app.audit(a.organization_id, 'platform.ad_request', 'ad_requests', p_id, 'Publicité externe : ' || a.status || ' → ' || p_status, '{}'::jsonb);
  if p_status = 'awaiting_school' then
    perform app.notify(a.organization_id, a.created_by, 'ads', 'Plan publicitaire à valider', 'NeoScool a préparé votre campagne : validez-la avant son lancement.', '/visibilite/publicite', '{}'::jsonb)
      where a.created_by is not null;
  end if;
end;
$$;

revoke all on function public.platform_save_visibility_offer(uuid, text, text, text, text, integer, text, integer, text, text, boolean),
  public.create_visibility_order(uuid, text, uuid), public.platform_confirm_visibility_order(uuid, text, text), public.cancel_visibility_order(uuid),
  public.platform_set_ad_platform(text, boolean, text), public.save_ad_request(uuid, uuid, jsonb, boolean),
  public.school_ad_request_action(uuid, uuid, text, jsonb, text), public.platform_update_ad_request(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.platform_save_visibility_offer(uuid, text, text, text, text, integer, text, integer, text, text, boolean),
  public.create_visibility_order(uuid, text, uuid), public.platform_confirm_visibility_order(uuid, text, text), public.cancel_visibility_order(uuid),
  public.platform_set_ad_platform(text, boolean, text), public.save_ad_request(uuid, uuid, jsonb, boolean),
  public.school_ad_request_action(uuid, uuid, text, jsonb, text), public.platform_update_ad_request(uuid, text, text, jsonb, text) to authenticated;

-- Revenus NeoScool : les commandes de visibilité payées s'ajoutent (jamais le budget publicitaire, payé à la plateforme publicitaire).
create or replace function app.revenue_entries(p_include_test boolean default false)
returns table (source text, organization_id uuid, paid_at timestamptz, reference text, label text, billing_interval text, period_start date, period_end date,
               list_amount integer, discount_amount integer, promo_code text, amount integer, currency text, payment_method text, provider text, mode text)
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
     and (p_include_test or p.mode = 'live')
  union all
  select 'Visibilité', v.organization_id, v.confirmed_at, 'VIS-' || v.number, f.label, null,
         v.confirmed_at::date, case when f.duration_days is not null then (v.confirmed_at + make_interval(days => f.duration_days))::date end,
         v.amount, 0, null, v.amount, v.currency, 'manual', 'manual', 'live'
    from public.visibility_orders v
    join public.visibility_offers f on f.id = v.offer_id
    left join public.organizations o on o.id = v.organization_id
   where v.status = 'paid' and coalesce(not o.is_demo, true);
$$;

-- -----------------------------------------------------------------------------
-- Vue d'ensemble de l'écosystème (Super Admin) et statistiques d'un établissement
-- -----------------------------------------------------------------------------
create or replace function public.platform_ecosystem_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'profiles', (select jsonb_build_object('total', count(*), 'public', count(*) filter (where app.profile_public(p)),
        'pending_review', count(*) filter (where p.published and p.review_status = 'pending'),
        'verified', count(*) filter (where p.verification_status = 'verified'), 'suspended', count(*) filter (where p.moderation = 'suspended'))
      from public.org_public_profiles p),
    'verification_pending', (select count(*) from public.org_verification_requests where status = 'pending'),
    'campaigns', (select jsonb_build_object('published', count(*) filter (where status = 'published'), 'pending', count(*) filter (where status = 'pending_review')) from public.promo_campaigns),
    'opportunities', (select jsonb_build_object('published', count(*) filter (where app.opportunity_public(o)), 'pending', count(*) filter (where status = 'pending'),
        'applications', (select count(*) from public.opportunity_applications)) from public.opportunities o),
    'leads_30d', coalesce((select jsonb_object_agg(source, n) from (select source, count(*) n from public.org_leads where created_at > now() - interval '30 days' group by source) x), '{}'::jsonb),
    'reports_open', (select count(*) from public.content_reports where status = 'open'),
    'orders_awaiting', (select count(*) from public.visibility_orders where status = 'awaiting_payment'),
    'ad_requests_open', (select count(*) from public.ad_requests where status in ('submitted', 'validated')),
    'public_accounts', (select count(*) from public.public_accounts)
  );
end;
$$;

create or replace function public.org_visibility_stats(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_slug text := (select slug from public.org_public_profiles where organization_id = p_org);
begin
  if not (app.has_permission(p_org, 'settings.manage') or app.has_permission(p_org, 'communication.send') or app.has_permission(p_org, 'enrollments.manage')) then
    raise exception 'Accès refusé.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'profile_views_30d', (select count(*) from public.site_visits v where v_slug is not null and v.path like '/decouvrir/' || v_slug || '%' and v.day > current_date - 30),
    'visitors_30d', (select count(distinct (visitor, day)) from public.site_visits v where v_slug is not null and v.path like '/decouvrir/' || v_slug || '%' and v.day > current_date - 30),
    'leads_30d', (select count(*) from public.org_leads where organization_id = p_org and created_at > now() - interval '30 days'),
    'leads_by_source', coalesce((select jsonb_object_agg(source, n) from (select source, count(*) n from public.org_leads where organization_id = p_org group by source) x), '{}'::jsonb),
    'converted', (select count(*) from public.org_leads where organization_id = p_org and status = 'converted'),
    'campaigns', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'title', c.title,
        'views', (select count(*) from public.site_visits v where v_slug is not null and v.path = '/decouvrir/' || v_slug || '/campagnes/' || c.id),
        'leads', (select count(*) from public.org_leads l where l.campaign_id = c.id))) from public.promo_campaigns c where c.organization_id = p_org), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.platform_ecosystem_overview(), public.org_visibility_stats(uuid) from public, anon;
grant execute on function public.platform_ecosystem_overview(), public.org_visibility_stats(uuid) to authenticated;
