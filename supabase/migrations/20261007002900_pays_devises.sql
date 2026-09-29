-- =============================================================================
-- P7a — PAYS ET DEVISES CONFIGURABLES (Super Admin)
--
-- Un seul NéoScol pour tous les pays : un pays est une LIGNE de configuration,
-- ajoutée ou modifiée par le Super Admin sans toucher au code. Les
-- établissements existants sont conservés (leurs codes pays deviennent des
-- références ; aucun n'est modifié).
-- =============================================================================

create table public.currencies (
  code text primary key check (code ~ '^[A-Z]{3}$'),
  name text not null check (char_length(name) between 2 and 80),
  symbol text not null check (char_length(symbol) between 1 and 8),
  decimals smallint not null default 2 check (decimals between 0 and 4),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null check (char_length(name) between 2 and 80),
  name_en text check (name_en is null or char_length(name_en) between 2 and 80),
  dial_code text not null check (dial_code ~ '^\+[1-9][0-9]{0,3}$'),
  default_currency text not null references public.currencies (code),
  currencies text[] not null default '{}',
  languages text[] not null default '{fr}' check (languages <@ array['fr', 'en', 'pt', 'ar', 'es', 'de']::text[] and cardinality(languages) >= 1),
  default_language text not null default 'fr',
  timezone text not null default 'UTC' check (char_length(timezone) between 3 and 64),
  phone_pattern text not null default '^[0-9]{6,12}$' check (char_length(phone_pattern) <= 120),
  date_format text not null default 'dd/MM/yyyy' check (date_format in ('dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd')),
  -- Académique (modèle par défaut pour les nouveaux établissements), fiscal,
  -- numérotation, identifiant national (libellé seulement : aucune API inventée).
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  is_active boolean not null default true,
  sort_order integer not null default 100,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (default_language = any (languages))
);

insert into public.currencies (code, name, symbol, decimals) values
  ('XOF', 'Franc CFA (UEMOA)', 'F CFA', 0),
  ('XAF', 'Franc CFA (CEMAC)', 'F CFA', 0),
  ('EUR', 'Euro', '€', 2),
  ('CDF', 'Franc congolais', 'FC', 2),
  ('GNF', 'Franc guinéen', 'FG', 0),
  ('USD', 'Dollar américain', '$', 2);

-- Données de départ : toutes modifiables (ou désactivables) par le Super Admin.
insert into public.countries (code, name, name_en, dial_code, default_currency, currencies, languages, default_language, timezone, phone_pattern, date_format, settings, sort_order) values
  ('BJ', 'Bénin', 'Benin', '+229', 'XOF', '{XOF}', '{fr,en}', 'fr', 'Africa/Porto-Novo', '^(01)?[0-9]{8}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 10),
  ('CI', 'Côte d''Ivoire', 'Ivory Coast', '+225', 'XOF', '{XOF}', '{fr,en}', 'fr', 'Africa/Abidjan', '^[0-9]{10}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 20),
  ('TG', 'Togo', 'Togo', '+228', 'XOF', '{XOF}', '{fr,en}', 'fr', 'Africa/Lome', '^[0-9]{8}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 30),
  ('BF', 'Burkina Faso', 'Burkina Faso', '+226', 'XOF', '{XOF}', '{fr,en}', 'fr', 'Africa/Ouagadougou', '^[0-9]{8}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 40),
  ('SN', 'Sénégal', 'Senegal', '+221', 'XOF', '{XOF}', '{fr,en}', 'fr', 'Africa/Dakar', '^[0-9]{9}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "semester"}', 50),
  ('CM', 'Cameroun', 'Cameroon', '+237', 'XAF', '{XAF}', '{fr,en}', 'fr', 'Africa/Douala', '^[0-9]{9}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 60),
  ('GA', 'Gabon', 'Gabon', '+241', 'XAF', '{XAF}', '{fr,en}', 'fr', 'Africa/Libreville', '^[0-9]{8,9}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 70),
  ('NE', 'Niger', 'Niger', '+227', 'XOF', '{XOF}', '{fr,en}', 'fr', 'Africa/Niamey', '^[0-9]{8}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 80),
  ('ML', 'Mali', 'Mali', '+223', 'XOF', '{XOF}', '{fr,en}', 'fr', 'Africa/Bamako', '^[0-9]{8}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 90),
  ('GN', 'Guinée', 'Guinea', '+224', 'GNF', '{GNF}', '{fr,en}', 'fr', 'Africa/Conakry', '^[0-9]{9}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 100),
  ('CG', 'Congo', 'Republic of the Congo', '+242', 'XAF', '{XAF}', '{fr,en}', 'fr', 'Africa/Brazzaville', '^[0-9]{9}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 110),
  ('CD', 'RD Congo', 'DR Congo', '+243', 'CDF', '{CDF,USD}', '{fr,en}', 'fr', 'Africa/Kinshasa', '^[0-9]{9}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 120),
  ('FR', 'France', 'France', '+33', 'EUR', '{EUR}', '{fr,en}', 'fr', 'Europe/Paris', '^0?[1-9][0-9]{8}$', 'dd/MM/yyyy', '{"grading_scale": 20, "school_periods": "trimester"}', 130);

-- Codes déjà utilisés par des établissements mais absents : conservés tels quels
-- (pays inactif à compléter par le Super Admin) — aucune donnée modifiée.
insert into public.countries (code, name, dial_code, default_currency, is_active, sort_order)
select distinct o.country, o.country, '+1', 'XOF', false, 999
from public.organizations o
where not exists (select 1 from public.countries c where c.code = o.country);

alter table public.organizations
  add constraint organizations_country_fkey foreign key (country) references public.countries (code);
alter table public.organizations
  add constraint organizations_currency_fkey foreign key (currency) references public.currencies (code) not valid;

-- Nouvel établissement : devise, fuseau et langue par défaut du pays choisi
-- (valeurs explicites conservées).
create or replace function app.organization_country_defaults()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_country public.countries;
begin
  select * into v_country from public.countries where code = new.country;
  if v_country.code is null then
    return new;
  end if;
  if tg_op = 'INSERT' or new.country is distinct from old.country then
    if new.currency = 'XOF' and v_country.default_currency <> 'XOF' then
      new.currency := v_country.default_currency;
    end if;
    if new.timezone = 'Africa/Abidjan' and v_country.timezone <> 'Africa/Abidjan' then
      new.timezone := v_country.timezone;
    end if;
    if new.locale not in (select unnest(v_country.languages)) then
      new.locale := v_country.default_language;
    end if;
  end if;
  return new;
end;
$$;
create trigger organizations_country_defaults
  before insert or update of country on public.organizations
  for each row execute function app.organization_country_defaults();

-- -----------------------------------------------------------------------------
-- Accès : lecture publique des pays et devises actifs (inscription, tarifs),
-- tout pour le Super Admin ; écriture uniquement par fonctions auditées.
-- -----------------------------------------------------------------------------
alter table public.countries enable row level security;
alter table public.currencies enable row level security;
revoke all on public.countries, public.currencies from anon, authenticated;
grant select on public.countries, public.currencies to anon, authenticated;
create policy countries_read on public.countries for select to anon, authenticated using (is_active or app.is_platform_admin());
create policy currencies_read on public.currencies for select to anon, authenticated using (is_active or app.is_platform_admin());

create or replace function public.platform_upsert_currency(p_code text, p_name text, p_symbol text, p_decimals int, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  insert into public.currencies (code, name, symbol, decimals, is_active, updated_at)
  values (upper(btrim(p_code)), btrim(p_name), btrim(p_symbol), p_decimals, p_active, now())
  on conflict (code) do update
    set name = excluded.name, symbol = excluded.symbol, decimals = excluded.decimals, is_active = excluded.is_active, updated_at = now();
  if not p_active and exists (select 1 from public.countries where default_currency = upper(btrim(p_code)) and is_active) then
    raise exception 'Cette devise est la devise principale d''un pays actif.' using errcode = 'check_violation';
  end if;
  perform app.audit(null, 'platform.currency_saved', 'currencies', null, 'Devise ' || upper(btrim(p_code)) || ' enregistrée',
    jsonb_build_object('code', upper(btrim(p_code)), 'active', p_active), 'success');
end;
$$;

-- Ajout ou modification d'un pays : aucune modification du code n'est nécessaire.
create or replace function public.platform_upsert_country(p_country jsonb)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text := upper(btrim(p_country ->> 'code'));
  v_old public.countries;
  v_langs text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p_country -> 'languages') x), '{fr}');
  v_currencies text[] := coalesce((select array_agg(upper(x)) from jsonb_array_elements_text(p_country -> 'currencies') x), '{}');
  v_default_currency text := upper(btrim(p_country ->> 'default_currency'));
begin
  perform app.require_platform_admin();
  if v_code is null or v_code !~ '^[A-Z]{2}$' then
    raise exception 'Code pays ISO à 2 lettres attendu (ex. BJ, FR).' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.currencies where code = v_default_currency and is_active) then
    raise exception 'Devise principale inconnue ou inactive : ajoutez-la d''abord.' using errcode = 'check_violation';
  end if;
  if not (v_default_currency = any (v_currencies)) then
    v_currencies := array_prepend(v_default_currency, v_currencies);
  end if;
  if exists (select 1 from unnest(v_currencies) c where not exists (select 1 from public.currencies where code = c)) then
    raise exception 'Une devise acceptée est inconnue.' using errcode = 'check_violation';
  end if;
  if coalesce(p_country ->> 'phone_pattern', '') <> '' then
    begin
      perform '' ~ (p_country ->> 'phone_pattern');
    exception when others then
      raise exception 'Format de téléphone invalide (expression régulière).' using errcode = 'check_violation';
    end;
  end if;
  if coalesce(p_country ->> 'timezone', '') <> '' and not exists (select 1 from pg_catalog.pg_timezone_names where name = p_country ->> 'timezone') then
    raise exception 'Fuseau horaire inconnu (ex. Africa/Porto-Novo, Europe/Paris).' using errcode = 'check_violation';
  end if;
  select * into v_old from public.countries where code = v_code;
  if v_old.code is not null and coalesce((p_country ->> 'is_active')::boolean, true) = false
     and exists (select 1 from public.organizations where country = v_code and status = 'active') then
    raise exception 'Des établissements actifs utilisent ce pays : il ne peut pas être désactivé.' using errcode = 'check_violation';
  end if;
  insert into public.countries (code, name, name_en, dial_code, default_currency, currencies, languages, default_language, timezone,
                                phone_pattern, date_format, settings, is_active, sort_order, updated_by, updated_at)
  values (v_code, btrim(p_country ->> 'name'), nullif(btrim(coalesce(p_country ->> 'name_en', '')), ''), btrim(p_country ->> 'dial_code'),
          v_default_currency, v_currencies, v_langs, coalesce(nullif(p_country ->> 'default_language', ''), v_langs[1]),
          coalesce(nullif(p_country ->> 'timezone', ''), 'UTC'), coalesce(nullif(p_country ->> 'phone_pattern', ''), '^[0-9]{6,12}$'),
          coalesce(nullif(p_country ->> 'date_format', ''), 'dd/MM/yyyy'), coalesce(p_country -> 'settings', v_old.settings, '{}'::jsonb),
          coalesce((p_country ->> 'is_active')::boolean, true), coalesce((p_country ->> 'sort_order')::int, v_old.sort_order, 100), auth.uid(), now())
  on conflict (code) do update set
    name = excluded.name, name_en = excluded.name_en, dial_code = excluded.dial_code, default_currency = excluded.default_currency,
    currencies = excluded.currencies, languages = excluded.languages, default_language = excluded.default_language, timezone = excluded.timezone,
    phone_pattern = excluded.phone_pattern, date_format = excluded.date_format, settings = excluded.settings, is_active = excluded.is_active,
    sort_order = excluded.sort_order, updated_by = excluded.updated_by, updated_at = now();
  perform app.audit(null, case when v_old.code is null then 'platform.country_created' else 'platform.country_updated' end, 'countries', null,
    'Pays ' || v_code || ' — ' || btrim(p_country ->> 'name') || case when v_old.code is null then ' ajouté' else ' modifié' end,
    jsonb_build_object('code', v_code, 'before', to_jsonb(v_old) - 'updated_by' - 'updated_at',
                       'after', (select to_jsonb(c) - 'updated_by' - 'updated_at' from public.countries c where c.code = v_code)), 'success');
  return v_code;
end;
$$;

revoke execute on function public.platform_upsert_currency(text, text, text, int, boolean) from public, anon;
revoke execute on function public.platform_upsert_country(jsonb) from public, anon;
grant execute on function public.platform_upsert_currency(text, text, text, int, boolean) to authenticated;
grant execute on function public.platform_upsert_country(jsonb) to authenticated;

-- Vue d'ensemble par pays (console) : établissements et abonnements réels.
create or replace function public.platform_country_overview()
returns table (code text, organizations bigint, active_subscriptions bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  return query
  select c.code,
         (select count(*) from public.organizations o where o.country = c.code and not o.is_demo),
         (select count(*) from public.subscriptions s join public.organizations o on o.id = s.organization_id
           where o.country = c.code and s.status in ('ACTIVE', 'TRIALING') and not s.is_demo)
  from public.countries c;
end;
$$;
revoke execute on function public.platform_country_overview() from public, anon;
grant execute on function public.platform_country_overview() to authenticated;
