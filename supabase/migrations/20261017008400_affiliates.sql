-- =============================================================================
-- NEOSCOOL Affiliates : programme de recommandation d'établissements.
--
-- Principes :
--  • désactivé par défaut ; tout est réglé par le Super Admin (Console › Affiliation) ;
--  • comptes existants réutilisés (un affilié = un profil, aucune authentification à part) ;
--  • une école est attribuée UNE fois, à sa création, côté serveur (lien vérifié en base
--    ou code saisi à l'inscription, ou code promo lié à l'affilié) ; preuve conservée ;
--  • une commission naît uniquement d'un paiement d'abonnement réellement confirmé
--    (subscription_payments) ; elle est annulée si le paiement est remboursé ;
--  • une commission n'est « payée » que si un versement réel est enregistré avec sa
--    référence (Mobile Money, virement…) ; aucune passerelle de versement simulée ;
--  • désactivation : plus de nouvelles demandes, clics, attributions ni commissions ;
--    l'historique est conservé et les commissions déjà validées restent payables.
-- =============================================================================

create table public.affiliate_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  signups_open boolean not null default true,
  links_enabled boolean not null default true,
  codes_enabled boolean not null default true,
  campaigns_enabled boolean not null default false,
  require_approval boolean not null default true,
  allowed_kinds text[] not null default array['teacher', 'ambassador', 'freelance', 'partner', 'other'],
  require_phone boolean not null default true,
  require_payout_details boolean not null default true,
  terms text check (terms is null or char_length(terms) <= 6000),
  reward_type text not null default 'percent' check (reward_type in ('percent', 'fixed')),
  reward_value integer not null default 20 check (reward_value > 0),
  reward_event text not null default 'first_payment' check (reward_event in ('first_payment', 'each_payment')),
  reward_months integer not null default 12 check (reward_months between 1 and 60),
  eligible_plans text[],
  attribution_days integer not null default 60 check (attribution_days between 1 and 365),
  conflict_rule text not null default 'code_first' check (conflict_rule in ('code_first', 'first_click', 'last_click')),
  hold_days integer not null default 30 check (hold_days between 0 and 365),
  min_payout integer not null default 10000 check (min_payout >= 0),
  monthly_cap integer check (monthly_cap is null or monthly_cap > 0),
  count_test_payments boolean not null default false,
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null,
  check (reward_type <> 'percent' or reward_value <= 100),
  check (allowed_kinds <@ array['teacher', 'ambassador', 'freelance', 'partner', 'other'])
);
insert into public.affiliate_settings (id) values (1);

create table public.affiliate_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 3 and 120),
  description text check (description is null or char_length(description) <= 1000),
  starts_on date not null default current_date,
  ends_on date,
  reward_type text not null check (reward_type in ('percent', 'fixed')),
  reward_value integer not null check (reward_value > 0),
  reward_event text not null default 'first_payment' check (reward_event in ('first_payment', 'each_payment')),
  reward_months integer not null default 12 check (reward_months between 1 and 60),
  eligible_plans text[],
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (reward_type <> 'percent' or reward_value <= 100),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'suspended', 'rejected')),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{3,29}$'),
  kind text not null check (kind in ('teacher', 'ambassador', 'freelance', 'partner', 'other')),
  phone text check (phone is null or phone ~ '^\+?[0-9 ().-]{6,25}$'),
  country text references public.countries (code),
  city text check (city is null or char_length(city) <= 80),
  motivation text check (motivation is null or char_length(motivation) <= 1000),
  payout_method text check (payout_method is null or payout_method in ('mobile_money', 'bank', 'other')),
  payout_details text check (payout_details is null or char_length(payout_details) <= 300),
  campaign_id uuid references public.affiliate_campaigns (id) on delete set null,
  promo_code_id uuid unique references public.promo_codes (id) on delete set null,
  terms_accepted_at timestamptz not null default now(),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete cascade,
  campaign_id uuid references public.affiliate_campaigns (id) on delete set null,
  ip_hash text check (ip_hash is null or ip_hash ~ '^[a-f0-9]{64}$'),
  landing text check (landing is null or char_length(landing) <= 200),
  created_at timestamptz not null default now()
);
create index affiliate_clicks_affiliate_idx on public.affiliate_clicks (affiliate_id, created_at desc);

create table public.affiliate_attributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations (id) on delete cascade,
  affiliate_id uuid not null references public.affiliates (id) on delete restrict,
  source text not null check (source in ('link', 'code', 'promo', 'manual')),
  click_id uuid references public.affiliate_clicks (id) on delete set null,
  code_used text check (code_used is null or char_length(code_used) <= 40),
  campaign_id uuid references public.affiliate_campaigns (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'rejected')),
  flags text[] not null default '{}',
  proof jsonb not null default '{}'::jsonb,
  previous_affiliate_id uuid references public.affiliates (id) on delete set null,
  correction_reason text check (correction_reason is null or char_length(correction_reason) <= 500),
  corrected_by uuid references public.profiles (id) on delete set null,
  corrected_at timestamptz,
  created_at timestamptz not null default now()
);
create index affiliate_attributions_affiliate_idx on public.affiliate_attributions (affiliate_id);

create table public.affiliate_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete restrict,
  amount integer not null check (amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  method text not null check (method in ('mobile_money', 'bank', 'other')),
  reference text not null check (char_length(btrim(reference)) between 3 and 120),
  paid_on date not null,
  note text check (note is null or char_length(note) <= 500),
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (method, reference)
);

create table public.affiliate_commissions (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references public.affiliates (id) on delete restrict,
  attribution_id uuid not null references public.affiliate_attributions (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  payment_id uuid not null unique references public.subscription_payments (id) on delete cascade,
  transaction_id uuid,
  invoice_id uuid,
  plan_code text,
  payment_amount integer not null check (payment_amount > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  mode text not null check (mode in ('test', 'live')),
  rule jsonb not null default '{}'::jsonb,
  amount integer not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'in_review', 'validated', 'payable', 'paid', 'cancelled', 'rejected')),
  reason text check (reason is null or char_length(reason) <= 500),
  refunded_after_payout boolean not null default false,
  disputed boolean not null default false,
  dispute_message text check (dispute_message is null or char_length(dispute_message) <= 1000),
  payout_id uuid references public.affiliate_payouts (id) on delete restrict,
  validated_by uuid references public.profiles (id) on delete set null,
  validated_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check ((status = 'paid') = (payout_id is not null)),
  check (status not in ('cancelled', 'rejected') or reason is not null)
);
create index affiliate_commissions_affiliate_idx on public.affiliate_commissions (affiliate_id, status);
create index affiliate_commissions_tx_idx on public.affiliate_commissions (transaction_id);

-- -----------------------------------------------------------------------------
-- Droits : lecture de ses propres données (affilié) ou de tout (plateforme) ;
-- écriture uniquement par les fonctions ci-dessous.
-- -----------------------------------------------------------------------------
alter table public.affiliate_settings enable row level security;
alter table public.affiliate_campaigns enable row level security;
alter table public.affiliates enable row level security;
alter table public.affiliate_clicks enable row level security;
alter table public.affiliate_attributions enable row level security;
alter table public.affiliate_payouts enable row level security;
alter table public.affiliate_commissions enable row level security;

create or replace function app.my_affiliate_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.affiliates where user_id = auth.uid();
$$;

create policy affiliate_settings_select on public.affiliate_settings for select to anon, authenticated using (true);
create policy affiliate_campaigns_select on public.affiliate_campaigns for select to authenticated
  using (app.is_platform_admin() or id = (select campaign_id from public.affiliates where user_id = auth.uid()));
create policy affiliates_select on public.affiliates for select to authenticated using (user_id = auth.uid() or app.is_platform_admin());
create policy affiliate_clicks_select on public.affiliate_clicks for select to authenticated using (app.is_platform_admin());
create policy affiliate_attributions_select on public.affiliate_attributions for select to authenticated using (affiliate_id = app.my_affiliate_id() or app.is_platform_admin());
create policy affiliate_payouts_select on public.affiliate_payouts for select to authenticated using (affiliate_id = app.my_affiliate_id() or app.is_platform_admin());
create policy affiliate_commissions_select on public.affiliate_commissions for select to authenticated using (affiliate_id = app.my_affiliate_id() or app.is_platform_admin());

grant select on public.affiliate_settings to anon, authenticated;
grant select on public.affiliate_campaigns, public.affiliates, public.affiliate_clicks, public.affiliate_attributions,
  public.affiliate_payouts, public.affiliate_commissions to authenticated;
revoke insert, update, delete on public.affiliate_settings, public.affiliate_campaigns, public.affiliates, public.affiliate_clicks,
  public.affiliate_attributions, public.affiliate_payouts, public.affiliate_commissions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Affilié : demande d'adhésion, coordonnées de versement, espace, contestation
-- -----------------------------------------------------------------------------
create or replace function app.affiliate_new_code(p_user uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_code text;
begin
  select left(regexp_replace(upper(coalesce(nullif(p.last_name, ''), p.first_name, 'NEO')), '[^A-Z0-9]', '', 'g'), 8)
    into v_base from public.profiles p where p.id = p_user;
  if coalesce(v_base, '') = '' then v_base := 'AMI'; end if;
  loop
    v_code := 'NEO-' || v_base || '-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    exit when not exists (select 1 from public.affiliates where code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.affiliate_apply(
  p_kind text, p_phone text, p_country text, p_city text, p_motivation text,
  p_payout_method text, p_payout_details text, p_accept_terms boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.affiliate_settings;
  v_existing public.affiliates;
  v_status text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour rejoindre le programme.' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.affiliate_settings where id = 1;
  if not s.enabled or not s.signups_open then
    raise exception 'Le programme d''affiliation n''accepte pas de nouvelles demandes pour le moment.' using errcode = 'check_violation';
  end if;
  if not coalesce(p_accept_terms, false) then
    raise exception 'Acceptez les conditions du programme.' using errcode = 'check_violation';
  end if;
  if not (p_kind = any (s.allowed_kinds)) then
    raise exception 'Ce profil n''est pas accepté dans le programme.' using errcode = 'check_violation';
  end if;
  if s.require_phone and coalesce(btrim(p_phone), '') = '' then
    raise exception 'Le téléphone est obligatoire.' using errcode = 'check_violation';
  end if;
  if s.require_payout_details and (coalesce(p_payout_method, '') = '' or coalesce(btrim(p_payout_details), '') = '') then
    raise exception 'Indiquez comment recevoir vos commissions (Mobile Money ou banque).' using errcode = 'check_violation';
  end if;
  v_status := case when s.require_approval then 'pending' else 'approved' end;
  select * into v_existing from public.affiliates where user_id = auth.uid();
  if found then
    if v_existing.status <> 'rejected' then
      raise exception 'Vous avez déjà une demande ou un compte affilié.' using errcode = 'unique_violation';
    end if;
    update public.affiliates
       set status = v_status, kind = p_kind, phone = nullif(btrim(p_phone), ''), country = nullif(upper(p_country), ''),
           city = nullif(btrim(p_city), ''), motivation = nullif(btrim(p_motivation), ''), payout_method = nullif(p_payout_method, ''),
           payout_details = nullif(btrim(p_payout_details), ''), terms_accepted_at = now(), review_note = null,
           reviewed_by = null, reviewed_at = null, updated_at = now()
     where id = v_existing.id
     returning id into v_id;
  else
    insert into public.affiliates (user_id, status, code, kind, phone, country, city, motivation, payout_method, payout_details)
    values (auth.uid(), v_status, app.affiliate_new_code(auth.uid()), p_kind, nullif(btrim(p_phone), ''), nullif(upper(p_country), ''),
            nullif(btrim(p_city), ''), nullif(btrim(p_motivation), ''), nullif(p_payout_method, ''), nullif(btrim(p_payout_details), ''))
    returning id into v_id;
  end if;
  perform app.audit(null, 'affiliate.apply', 'affiliates', v_id, 'Demande d''adhésion au programme d''affiliation', jsonb_build_object('kind', p_kind, 'status', v_status));
  return jsonb_build_object('id', v_id, 'status', v_status);
end;
$$;

create or replace function public.affiliate_update_payout(p_phone text, p_payout_method text, p_payout_details text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid := app.my_affiliate_id();
begin
  if v_id is null then
    raise exception 'Aucun compte affilié.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_payout_method, '') not in ('mobile_money', 'bank', 'other') or coalesce(btrim(p_payout_details), '') = '' then
    raise exception 'Indiquez le moyen et les coordonnées de versement.' using errcode = 'check_violation';
  end if;
  update public.affiliates
     set phone = coalesce(nullif(btrim(p_phone), ''), phone), payout_method = p_payout_method,
         payout_details = btrim(p_payout_details), updated_at = now()
   where id = v_id;
  perform app.audit(null, 'affiliate.payout_details', 'affiliates', v_id, 'Coordonnées de versement modifiées par l''affilié', '{}'::jsonb);
end;
$$;

create or replace function public.affiliate_dispute(p_commission uuid, p_message text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if coalesce(char_length(btrim(p_message)), 0) < 5 then
    raise exception 'Expliquez votre contestation.' using errcode = 'check_violation';
  end if;
  update public.affiliate_commissions
     set disputed = true, dispute_message = left(btrim(p_message), 1000)
   where id = p_commission and affiliate_id = app.my_affiliate_id() and status not in ('paid');
  if not found then
    raise exception 'Commission introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.audit(null, 'affiliate.dispute', 'affiliate_commissions', p_commission, 'Contestation d''une commission par l''affilié', '{}'::jsonb);
end;
$$;

-- Espace affilié : uniquement ses propres données ; écoles réduites à leur nom et à leur état.
create or replace function public.my_affiliate_space()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  a public.affiliates;
begin
  select * into a from public.affiliates where user_id = auth.uid();
  if not found then return null; end if;
  return jsonb_build_object(
    'affiliate', jsonb_build_object('id', a.id, 'status', a.status, 'code', a.code, 'kind', a.kind, 'phone', a.phone,
      'payout_method', a.payout_method, 'payout_details', a.payout_details, 'review_note', a.review_note, 'created_at', a.created_at,
      'campaign', (select jsonb_build_object('name', c.name, 'ends_on', c.ends_on) from public.affiliate_campaigns c where c.id = a.campaign_id)),
    'clicks', (select count(*) from public.affiliate_clicks where affiliate_id = a.id),
    'referrals', coalesce((select jsonb_agg(jsonb_build_object(
        'organization', o.name, 'created_at', t.created_at, 'source', t.source, 'status', t.status,
        'subscription', (select s.status from public.subscriptions s where s.organization_id = o.id))
        order by t.created_at desc)
      from public.affiliate_attributions t join public.organizations o on o.id = t.organization_id where t.affiliate_id = a.id), '[]'::jsonb),
    'commissions', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'organization', o.name, 'amount', c.amount, 'currency', c.currency, 'payment_amount', c.payment_amount,
        'status', c.status, 'reason', c.reason, 'disputed', c.disputed, 'created_at', c.created_at, 'mode', c.mode)
        order by c.created_at desc)
      from public.affiliate_commissions c join public.organizations o on o.id = c.organization_id where c.affiliate_id = a.id), '[]'::jsonb),
    'payouts', coalesce((select jsonb_agg(jsonb_build_object('amount', p.amount, 'currency', p.currency, 'method', p.method,
        'reference', p.reference, 'paid_on', p.paid_on) order by p.paid_on desc)
      from public.affiliate_payouts p where p.affiliate_id = a.id), '[]'::jsonb),
    'totals', (select jsonb_build_object(
        'estimated', coalesce(sum(amount) filter (where status in ('pending', 'in_review')), 0),
        'validated', coalesce(sum(amount) filter (where status in ('validated', 'payable')), 0),
        'payable', coalesce(sum(amount) filter (where status = 'payable'), 0),
        'paid', coalesce(sum(amount) filter (where status = 'paid'), 0))
      from public.affiliate_commissions where affiliate_id = a.id)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Serveur (service_role) : clic sur un lien, attribution à l'inscription
-- -----------------------------------------------------------------------------
create or replace function public.affiliate_record_click(p_code text, p_ip_hash text, p_landing text, p_campaign uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.affiliate_settings;
  a public.affiliates;
  v_id uuid;
  v_campaign uuid;
begin
  select * into s from public.affiliate_settings where id = 1;
  if not s.enabled or not s.links_enabled then return null; end if;
  select * into a from public.affiliates where code = upper(btrim(p_code)) and status = 'approved';
  if not found then return null; end if;
  v_campaign := case when s.campaigns_enabled then coalesce(
    (select id from public.affiliate_campaigns where id = p_campaign and is_active and current_date between starts_on and coalesce(ends_on, current_date)),
    a.campaign_id) end;
  -- Au plus un clic enregistré par visiteur, affilié et heure (rafraîchissements, robots).
  select id into v_id from public.affiliate_clicks
   where affiliate_id = a.id and ip_hash = p_ip_hash and created_at > now() - interval '1 hour'
   order by created_at desc limit 1;
  if v_id is null then
    insert into public.affiliate_clicks (affiliate_id, campaign_id, ip_hash, landing)
    values (a.id, v_campaign, p_ip_hash, left(p_landing, 200))
    returning id into v_id;
  end if;
  return jsonb_build_object('click', v_id, 'days', s.attribution_days, 'conflict_rule', s.conflict_rule);
end;
$$;

create or replace function public.affiliate_attribute_signup(p_org uuid, p_user uuid, p_click uuid, p_code text, p_phone text, p_ip_hash text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.affiliate_settings;
  o public.organizations;
  c public.affiliate_clicks;
  v_code_aff public.affiliates;
  v_click_aff public.affiliates;
  v_aff public.affiliates;
  v_source text;
  v_flags text[] := '{}';
  v_status text := 'active';
  v_digits text := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');
  v_id uuid;
begin
  select * into s from public.affiliate_settings where id = 1;
  if not s.enabled then return jsonb_build_object('attributed', false, 'reason', 'disabled'); end if;
  select * into o from public.organizations where id = p_org;
  if not found or exists (select 1 from public.affiliate_attributions where organization_id = p_org) then
    return jsonb_build_object('attributed', false, 'reason', 'already');
  end if;
  -- Seules les écoles créées il y a moins d'une heure (inscription en cours) peuvent être attribuées ici.
  if o.created_at < now() - interval '1 hour' then
    return jsonb_build_object('attributed', false, 'reason', 'existing_school');
  end if;

  if s.codes_enabled and coalesce(btrim(p_code), '') <> '' then
    select * into v_code_aff from public.affiliates where code = upper(btrim(p_code)) and status = 'approved';
  end if;
  if s.links_enabled and p_click is not null then
    select * into c from public.affiliate_clicks where id = p_click and created_at > now() - make_interval(days => s.attribution_days);
    if found then
      select * into v_click_aff from public.affiliates where id = c.affiliate_id and status = 'approved';
    end if;
  end if;
  if v_code_aff.id is not null and (s.conflict_rule = 'code_first' or v_click_aff.id is null) then
    v_aff := v_code_aff; v_source := 'code';
  elsif v_click_aff.id is not null then
    v_aff := v_click_aff; v_source := 'link';
  else
    return jsonb_build_object('attributed', false, 'reason', case when coalesce(btrim(p_code), '') <> '' then 'invalid_code' else 'none' end);
  end if;
  if v_code_aff.id is not null and v_click_aff.id is not null and v_code_aff.id <> v_click_aff.id then
    v_flags := array_append(v_flags, 'conflict');
  end if;

  -- Auto-parrainage : l'affilié ne peut pas recommander sa propre école.
  if v_aff.user_id = p_user
     or (length(v_digits) >= 8 and right(regexp_replace(coalesce(v_aff.phone, ''), '[^0-9]', '', 'g'), 8) = right(v_digits, 8)) then
    v_status := 'rejected';
    v_flags := array_append(v_flags, 'self_referral');
  end if;
  -- École peut-être déjà cliente (même nom et même ville, ou même téléphone qu'un établissement existant).
  if exists (
    select 1 from public.organizations x
     where x.id <> o.id and not x.is_demo
       and ((lower(btrim(x.name)) = lower(btrim(o.name)) and coalesce(lower(x.city), '') = coalesce(lower(o.city), ''))
            or (length(v_digits) >= 8 and right(regexp_replace(coalesce(x.phone, ''), '[^0-9]', '', 'g'), 8) = right(v_digits, 8)))
  ) then
    v_flags := array_append(v_flags, 'duplicate_school');
  end if;

  insert into public.affiliate_attributions (organization_id, affiliate_id, source, click_id, code_used, campaign_id, status, flags, proof)
  values (p_org, v_aff.id, v_source, case when v_source = 'link' then c.id end, case when v_source = 'code' then upper(btrim(p_code)) end,
          case when v_source = 'link' then c.campaign_id when s.campaigns_enabled then v_aff.campaign_id end, v_status, v_flags,
          jsonb_build_object('signup_at', now(), 'click_at', c.created_at, 'click_id', c.id, 'code', nullif(upper(btrim(p_code)), ''),
                             'signup_ip_hash', p_ip_hash, 'click_ip_hash', c.ip_hash, 'rule', s.conflict_rule))
  returning id into v_id;
  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, summary, metadata)
  values (p_org, p_user, 'affiliate.attribution', 'affiliate_attributions', v_id,
          'Établissement recommandé par l''affilié ' || v_aff.code || case when v_status = 'rejected' then ' (refusé : auto-parrainage)' else '' end,
          jsonb_build_object('source', v_source, 'flags', v_flags));
  return jsonb_build_object('attributed', v_status = 'active', 'source', v_source, 'flags', v_flags);
end;
$$;

-- Code promo lié à un affilié : utilisé par une école récente sans attribution → attribution « promo ».
create or replace function app.affiliate_on_promo_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.affiliate_settings;
  a public.affiliates;
  o public.organizations;
begin
  select * into s from public.affiliate_settings where id = 1;
  if not s.enabled or not s.codes_enabled then return new; end if;
  select * into a from public.affiliates where promo_code_id = new.promo_id and status = 'approved';
  if not found then return new; end if;
  select * into o from public.organizations where id = new.organization_id;
  if o.created_at < now() - make_interval(days => s.attribution_days)
     or exists (select 1 from public.affiliate_attributions where organization_id = o.id)
     or exists (select 1 from public.subscription_payments where organization_id = o.id) then
    return new;
  end if;
  insert into public.affiliate_attributions (organization_id, affiliate_id, source, code_used, campaign_id, proof)
  values (o.id, a.id, 'promo', (select code from public.promo_codes where id = new.promo_id),
          case when s.campaigns_enabled then a.campaign_id end,
          jsonb_build_object('promo_redemption', new.id, 'invoice_id', new.invoice_id, 'at', now()))
  on conflict (organization_id) do nothing;
  return new;
end;
$$;
create trigger affiliate_promo_redemption after insert on public.promo_redemptions
  for each row execute function app.affiliate_on_promo_redemption();

-- -----------------------------------------------------------------------------
-- Commission : à partir d'un paiement d'abonnement réellement enregistré
-- -----------------------------------------------------------------------------
create or replace function app.affiliate_on_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.affiliate_settings;
  t public.affiliate_attributions;
  a public.affiliates;
  k public.affiliate_campaigns;
  v_plan text;
  v_type text;
  v_value integer;
  v_event text;
  v_months integer;
  v_plans text[];
  v_first timestamptz;
  v_amount integer;
  v_month_total integer;
begin
  select * into s from public.affiliate_settings where id = 1;
  if not s.enabled then return new; end if;
  if new.mode = 'test' and not s.count_test_payments then return new; end if;
  select * into t from public.affiliate_attributions where organization_id = new.organization_id and status = 'active';
  if not found then return new; end if;
  select * into a from public.affiliates where id = t.affiliate_id and status = 'approved';
  if not found then return new; end if;

  -- Règle : campagne de l'attribution (si active à la date du paiement), sinon règle générale.
  if s.campaigns_enabled and t.campaign_id is not null then
    select * into k from public.affiliate_campaigns
     where id = t.campaign_id and is_active and new.paid_at::date between starts_on and coalesce(ends_on, new.paid_at::date);
  end if;
  if k.id is not null then
    v_type := k.reward_type; v_value := k.reward_value; v_event := k.reward_event; v_months := k.reward_months; v_plans := k.eligible_plans;
  else
    v_type := s.reward_type; v_value := s.reward_value; v_event := s.reward_event; v_months := s.reward_months; v_plans := s.eligible_plans;
  end if;
  select plan_code into v_plan from public.subscription_invoices where id = new.invoice_id;
  if v_plans is not null and cardinality(v_plans) > 0 and not (v_plan = any (v_plans)) then return new; end if;

  -- Premier paiement de l'école (les écoles déjà clientes ne sont jamais « nouvelles »).
  select min(paid_at) into v_first from public.subscription_payments where organization_id = new.organization_id and id <> new.id;
  if v_event = 'first_payment' and v_first is not null then return new; end if;
  if v_event = 'each_payment' and v_first is not null and new.paid_at > v_first + make_interval(months => v_months) then return new; end if;

  v_amount := case when v_type = 'percent' then round(new.amount * v_value / 100.0)::integer else v_value end;
  if s.monthly_cap is not null then
    select coalesce(sum(amount), 0) into v_month_total from public.affiliate_commissions
     where affiliate_id = a.id and status not in ('cancelled', 'rejected') and created_at >= date_trunc('month', now());
    v_amount := least(v_amount, s.monthly_cap - v_month_total);
  end if;
  if v_amount <= 0 then return new; end if;

  insert into public.affiliate_commissions (affiliate_id, attribution_id, organization_id, payment_id, transaction_id, invoice_id, plan_code,
                                            payment_amount, currency, mode, rule, amount, status)
  values (a.id, t.id, new.organization_id, new.id, new.transaction_id, new.invoice_id, v_plan, new.amount, new.currency, new.mode,
          jsonb_build_object('type', v_type, 'value', v_value, 'event', v_event, 'campaign', k.name),
          v_amount, case when cardinality(t.flags) > 0 then 'in_review' else 'pending' end)
  on conflict (payment_id) do nothing;
  return new;
end;
$$;
create trigger affiliate_subscription_payment after insert on public.subscription_payments
  for each row execute function app.affiliate_on_payment();

-- Remboursement : commission annulée (ou signalée si déjà versée).
create or replace function app.affiliate_on_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.affiliate_commissions
     set status = 'cancelled', reason = 'Paiement remboursé', status_changed_at = now()
   where transaction_id = new.id and status not in ('paid', 'cancelled', 'rejected');
  update public.affiliate_commissions
     set refunded_after_payout = true, reason = 'Paiement remboursé après versement : à régulariser'
   where transaction_id = new.id and status = 'paid';
  return new;
end;
$$;
create trigger affiliate_transaction_refund after update of status on public.payment_transactions
  for each row when (new.status = 'REFUNDED' and old.status is distinct from 'REFUNDED')
  execute function app.affiliate_on_refund();

-- Validées depuis le délai de garde → payables.
create or replace function public.affiliate_promote_payable()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v integer;
begin
  if auth.uid() is not null and not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  update public.affiliate_commissions c
     set status = 'payable', status_changed_at = now()
    from public.affiliate_settings s
   where s.id = 1 and c.status = 'validated' and c.created_at <= now() - make_interval(days => s.hold_days);
  get diagnostics v = row_count;
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- Console Super Admin
-- -----------------------------------------------------------------------------
create or replace function app.affiliate_guard()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.platform_save_affiliate_settings(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_plans text[];
  v_kinds text[];
begin
  perform app.affiliate_guard();
  if p ? 'eligible_plans' then
    select array_agg(x) into v_plans from jsonb_array_elements_text(p -> 'eligible_plans') x where x ~ '^[A-Z][A-Z_]{2,39}$';
  end if;
  if p ? 'allowed_kinds' then
    select coalesce(array_agg(x), '{}') into v_kinds from jsonb_array_elements_text(p -> 'allowed_kinds') x;
  end if;
  update public.affiliate_settings set
    enabled = coalesce((p ->> 'enabled')::boolean, enabled),
    signups_open = coalesce((p ->> 'signups_open')::boolean, signups_open),
    links_enabled = coalesce((p ->> 'links_enabled')::boolean, links_enabled),
    codes_enabled = coalesce((p ->> 'codes_enabled')::boolean, codes_enabled),
    campaigns_enabled = coalesce((p ->> 'campaigns_enabled')::boolean, campaigns_enabled),
    require_approval = coalesce((p ->> 'require_approval')::boolean, require_approval),
    allowed_kinds = coalesce(v_kinds, allowed_kinds),
    require_phone = coalesce((p ->> 'require_phone')::boolean, require_phone),
    require_payout_details = coalesce((p ->> 'require_payout_details')::boolean, require_payout_details),
    terms = case when p ? 'terms' then nullif(btrim(p ->> 'terms'), '') else terms end,
    reward_type = coalesce(nullif(p ->> 'reward_type', ''), reward_type),
    reward_value = coalesce((p ->> 'reward_value')::integer, reward_value),
    reward_event = coalesce(nullif(p ->> 'reward_event', ''), reward_event),
    reward_months = coalesce((p ->> 'reward_months')::integer, reward_months),
    eligible_plans = case when p ? 'eligible_plans' then v_plans else eligible_plans end,
    attribution_days = coalesce((p ->> 'attribution_days')::integer, attribution_days),
    conflict_rule = coalesce(nullif(p ->> 'conflict_rule', ''), conflict_rule),
    hold_days = coalesce((p ->> 'hold_days')::integer, hold_days),
    min_payout = coalesce((p ->> 'min_payout')::integer, min_payout),
    monthly_cap = case when p ? 'monthly_cap' then nullif((p ->> 'monthly_cap')::integer, 0) else monthly_cap end,
    count_test_payments = coalesce((p ->> 'count_test_payments')::boolean, count_test_payments),
    updated_at = now(), updated_by = auth.uid()
  where id = 1;
  perform app.audit(null, 'platform.affiliate_settings', 'affiliate_settings', null, 'Réglages du programme d''affiliation modifiés', p - 'terms');
end;
$$;

create or replace function public.platform_save_affiliate_campaign(p_id uuid, p jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_plans text[];
begin
  perform app.affiliate_guard();
  select array_agg(x) into v_plans from jsonb_array_elements_text(coalesce(p -> 'eligible_plans', '[]'::jsonb)) x where x ~ '^[A-Z][A-Z_]{2,39}$';
  if p_id is null then
    insert into public.affiliate_campaigns (name, description, starts_on, ends_on, reward_type, reward_value, reward_event, reward_months, eligible_plans, is_active, created_by)
    values (btrim(p ->> 'name'), nullif(btrim(p ->> 'description'), ''), coalesce((p ->> 'starts_on')::date, current_date), (nullif(p ->> 'ends_on', ''))::date,
            p ->> 'reward_type', (p ->> 'reward_value')::integer, coalesce(nullif(p ->> 'reward_event', ''), 'first_payment'),
            coalesce((p ->> 'reward_months')::integer, 12), v_plans, coalesce((p ->> 'is_active')::boolean, true), auth.uid())
    returning id into v_id;
  else
    update public.affiliate_campaigns
       set name = btrim(p ->> 'name'), description = nullif(btrim(p ->> 'description'), ''),
           starts_on = coalesce((p ->> 'starts_on')::date, starts_on), ends_on = (nullif(p ->> 'ends_on', ''))::date,
           reward_type = p ->> 'reward_type', reward_value = (p ->> 'reward_value')::integer,
           reward_event = coalesce(nullif(p ->> 'reward_event', ''), reward_event), reward_months = coalesce((p ->> 'reward_months')::integer, reward_months),
           eligible_plans = v_plans, is_active = coalesce((p ->> 'is_active')::boolean, is_active), updated_at = now()
     where id = p_id
     returning id into v_id;
    if v_id is null then raise exception 'Campagne introuvable.' using errcode = 'no_data_found'; end if;
  end if;
  perform app.audit(null, 'platform.affiliate_campaign', 'affiliate_campaigns', v_id, 'Campagne d''affiliation enregistrée : ' || btrim(p ->> 'name'), p - 'description');
  return v_id;
end;
$$;

create or replace function public.platform_review_affiliate(p_id uuid, p_action text, p_note text, p_campaign uuid default null, p_promo_code text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.affiliates;
  v_status text;
  v_promo uuid;
begin
  perform app.affiliate_guard();
  select * into a from public.affiliates where id = p_id for update;
  if not found then raise exception 'Affilié introuvable.' using errcode = 'no_data_found'; end if;
  v_status := case p_action when 'approve' then 'approved' when 'reactivate' then 'approved' when 'reject' then 'rejected'
                            when 'suspend' then 'suspended' when 'link' then a.status end;
  if v_status is null then raise exception 'Action inconnue.' using errcode = 'check_violation'; end if;
  if p_action in ('reject', 'suspend') and coalesce(char_length(btrim(p_note)), 0) < 3 then
    raise exception 'Indiquez le motif.' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_promo_code), '') <> '' then
    select id into v_promo from public.promo_codes where code = upper(btrim(p_promo_code));
    if v_promo is null then raise exception 'Code promo introuvable (Console › Offres).' using errcode = 'no_data_found'; end if;
  end if;
  update public.affiliates
     set status = v_status,
         review_note = case when p_action = 'link' then review_note else nullif(btrim(p_note), '') end,
         reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now(),
         campaign_id = case when p_action = 'link' then p_campaign else campaign_id end,
         promo_code_id = case when p_action = 'link' then v_promo else promo_code_id end
   where id = p_id;
  perform app.audit(null, 'platform.affiliate_review', 'affiliates', p_id, 'Affilié ' || a.code || ' : ' || p_action,
                    jsonb_build_object('from', a.status, 'to', v_status, 'note', p_note));
end;
$$;

create or replace function public.platform_review_commission(p_id uuid, p_action text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.affiliate_commissions;
  v_hold integer;
  v_status text;
begin
  perform app.affiliate_guard();
  select * into c from public.affiliate_commissions where id = p_id for update;
  if not found then raise exception 'Commission introuvable.' using errcode = 'no_data_found'; end if;
  select hold_days into v_hold from public.affiliate_settings where id = 1;
  if p_action = 'resolve_dispute' then
    update public.affiliate_commissions set disputed = false, reason = coalesce(nullif(btrim(p_reason), ''), reason) where id = p_id;
    perform app.audit(null, 'platform.affiliate_dispute', 'affiliate_commissions', p_id, 'Contestation traitée', jsonb_build_object('note', p_reason));
    return;
  end if;
  if c.status in ('paid', 'cancelled') then
    raise exception 'Cette commission ne peut plus être modifiée.' using errcode = 'check_violation';
  end if;
  v_status := case p_action
    when 'review' then 'in_review'
    when 'validate' then case when c.created_at <= now() - make_interval(days => v_hold) then 'payable' else 'validated' end
    when 'reject' then 'rejected'
    when 'reopen' then 'in_review'
  end;
  if v_status is null then raise exception 'Action inconnue.' using errcode = 'check_violation'; end if;
  if p_action = 'reject' and coalesce(char_length(btrim(p_reason)), 0) < 3 then
    raise exception 'Indiquez le motif du refus.' using errcode = 'check_violation';
  end if;
  if p_action = 'validate' and exists (select 1 from public.payment_transactions where id = c.transaction_id and status = 'REFUNDED') then
    raise exception 'Le paiement a été remboursé : commission non validable.' using errcode = 'check_violation';
  end if;
  update public.affiliate_commissions
     set status = v_status, status_changed_at = now(),
         reason = case when p_action = 'reject' then btrim(p_reason) when p_action = 'reopen' then null else reason end,
         validated_by = case when p_action = 'validate' then auth.uid() else validated_by end,
         validated_at = case when p_action = 'validate' then now() else validated_at end
   where id = p_id;
  perform app.audit(null, 'platform.affiliate_commission', 'affiliate_commissions', p_id, 'Commission : ' || c.status || ' → ' || v_status,
                    jsonb_build_object('amount', c.amount, 'reason', p_reason));
end;
$$;

-- Versement réel (effectué hors NeoScool) : référence obligatoire, commissions payables du même affilié.
create or replace function public.platform_record_affiliate_payout(p_affiliate uuid, p_commissions uuid[], p_method text, p_reference text, p_paid_on date, p_note text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_count integer;
  v_currencies integer;
  v_currency text;
  v_id uuid;
begin
  perform app.affiliate_guard();
  if coalesce(char_length(btrim(p_reference)), 0) < 3 then
    raise exception 'La référence du versement (Mobile Money, virement…) est obligatoire.' using errcode = 'check_violation';
  end if;
  if p_paid_on is null or p_paid_on > current_date then
    raise exception 'Date de versement invalide.' using errcode = 'check_violation';
  end if;
  select coalesce(sum(amount), 0), count(*), count(distinct currency), min(currency) into v_total, v_count, v_currencies, v_currency
    from public.affiliate_commissions
   where id = any (p_commissions) and affiliate_id = p_affiliate and status = 'payable';
  if v_count = 0 or v_count <> cardinality(p_commissions) then
    raise exception 'Sélectionnez uniquement des commissions payables de cet affilié.' using errcode = 'check_violation';
  end if;
  if v_currencies > 1 then
    raise exception 'Un versement ne peut regrouper qu''une seule devise.' using errcode = 'check_violation';
  end if;
  insert into public.affiliate_payouts (affiliate_id, amount, currency, method, reference, paid_on, note, recorded_by)
  values (p_affiliate, v_total, v_currency, p_method, btrim(p_reference), p_paid_on, nullif(btrim(p_note), ''), auth.uid())
  returning id into v_id;
  update public.affiliate_commissions set status = 'paid', payout_id = v_id, status_changed_at = now() where id = any (p_commissions);
  perform app.audit(null, 'platform.affiliate_payout', 'affiliate_payouts', v_id, 'Versement à un affilié : ' || v_total || ' ' || v_currency || ' (réf. ' || btrim(p_reference) || ')',
                    jsonb_build_object('affiliate', p_affiliate, 'commissions', v_count));
  return v_id;
end;
$$;

-- Correction d'une attribution (litige, erreur) : historique conservé, journalisée.
create or replace function public.platform_correct_attribution(p_org uuid, p_affiliate uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.affiliate_attributions;
begin
  perform app.affiliate_guard();
  if coalesce(char_length(btrim(p_reason)), 0) < 5 then
    raise exception 'Indiquez le motif de la correction.' using errcode = 'check_violation';
  end if;
  if p_affiliate is not null and not exists (select 1 from public.affiliates where id = p_affiliate and status = 'approved') then
    raise exception 'Affilié introuvable ou non approuvé.' using errcode = 'check_violation';
  end if;
  select * into t from public.affiliate_attributions where organization_id = p_org for update;
  if not found then
    if p_affiliate is null then raise exception 'Aucune attribution à retirer.' using errcode = 'no_data_found'; end if;
    insert into public.affiliate_attributions (organization_id, affiliate_id, source, proof, correction_reason, corrected_by, corrected_at)
    values (p_org, p_affiliate, 'manual', jsonb_build_object('manual', true, 'at', now()), btrim(p_reason), auth.uid(), now());
  elsif p_affiliate is null then
    update public.affiliate_attributions
       set status = 'rejected', correction_reason = btrim(p_reason), corrected_by = auth.uid(), corrected_at = now()
     where id = t.id;
    update public.affiliate_commissions
       set status = 'rejected', reason = 'Attribution retirée : ' || btrim(p_reason), status_changed_at = now()
     where attribution_id = t.id and status in ('pending', 'in_review', 'validated', 'payable');
  else
    update public.affiliate_attributions
       set affiliate_id = p_affiliate, previous_affiliate_id = t.affiliate_id, status = 'active',
           correction_reason = btrim(p_reason), corrected_by = auth.uid(), corrected_at = now()
     where id = t.id;
    update public.affiliate_commissions
       set affiliate_id = p_affiliate, status = 'in_review', status_changed_at = now()
     where attribution_id = t.id and status in ('pending', 'in_review', 'validated', 'payable');
  end if;
  perform app.audit(p_org, 'platform.affiliate_attribution', 'affiliate_attributions', t.id, 'Attribution corrigée : ' || btrim(p_reason),
                    jsonb_build_object('from', t.affiliate_id, 'to', p_affiliate));
end;
$$;

create or replace function public.platform_affiliate_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.affiliate_guard();
  return jsonb_build_object(
    'affiliates', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.affiliates group by 1) x),
    'clicks_30d', (select count(*) from public.affiliate_clicks where created_at > now() - interval '30 days'),
    'referrals', (select count(*) from public.affiliate_attributions where status = 'active'),
    'converted', (select count(distinct organization_id) from public.affiliate_commissions where status not in ('cancelled', 'rejected')),
    'flagged', (select count(*) from public.affiliate_attributions where cardinality(flags) > 0),
    'disputes', (select count(*) from public.affiliate_commissions where disputed),
    'commissions', (select jsonb_object_agg(status, jsonb_build_object('n', n, 'amount', amount))
                    from (select status, count(*) n, sum(amount) amount from public.affiliate_commissions group by 1) x),
    'paid_total', (select coalesce(sum(amount), 0) from public.affiliate_payouts),
    'top', coalesce((select jsonb_agg(x order by x.referrals desc) from (
              select a.code, coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), a.code) as name,
                     count(distinct t.id) as referrals,
                     coalesce(sum(c.amount) filter (where c.status not in ('cancelled', 'rejected')), 0) as commissions
                from public.affiliates a join public.profiles p on p.id = a.user_id
                left join public.affiliate_attributions t on t.affiliate_id = a.id and t.status = 'active'
                left join public.affiliate_commissions c on c.attribution_id = t.id
               where a.status = 'approved' group by a.id, p.first_name, p.last_name
               order by 3 desc limit 10) x), '[]'::jsonb)
  );
end;
$$;

-- Droits d'exécution
revoke all on function app.my_affiliate_id(), app.affiliate_new_code(uuid), app.affiliate_guard() from public, anon;
grant execute on function app.my_affiliate_id() to authenticated;
revoke all on function public.affiliate_apply(text, text, text, text, text, text, text, boolean), public.affiliate_update_payout(text, text, text),
  public.affiliate_dispute(uuid, text), public.my_affiliate_space() from public, anon;
grant execute on function public.affiliate_apply(text, text, text, text, text, text, text, boolean), public.affiliate_update_payout(text, text, text),
  public.affiliate_dispute(uuid, text), public.my_affiliate_space() to authenticated;
revoke all on function public.affiliate_record_click(text, text, text, uuid), public.affiliate_attribute_signup(uuid, uuid, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.affiliate_record_click(text, text, text, uuid), public.affiliate_attribute_signup(uuid, uuid, uuid, text, text, text) to service_role;
revoke all on function public.affiliate_promote_payable() from public, anon;
grant execute on function public.affiliate_promote_payable() to authenticated, service_role;
revoke all on function public.platform_save_affiliate_settings(jsonb), public.platform_save_affiliate_campaign(uuid, jsonb),
  public.platform_review_affiliate(uuid, text, text, uuid, text), public.platform_review_commission(uuid, text, text),
  public.platform_record_affiliate_payout(uuid, uuid[], text, text, date, text), public.platform_correct_attribution(uuid, uuid, text),
  public.platform_affiliate_overview() from public, anon;
grant execute on function public.platform_save_affiliate_settings(jsonb), public.platform_save_affiliate_campaign(uuid, jsonb),
  public.platform_review_affiliate(uuid, text, text, uuid, text), public.platform_review_commission(uuid, text, text),
  public.platform_record_affiliate_payout(uuid, uuid[], text, text, date, text), public.platform_correct_attribution(uuid, uuid, text),
  public.platform_affiliate_overview() to authenticated;
