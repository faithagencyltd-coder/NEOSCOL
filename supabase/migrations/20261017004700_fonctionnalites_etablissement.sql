-- =============================================================================
-- Fonctionnalités par établissement, à plusieurs niveaux :
--   1. Formule (Super Admin › Formules)          — déjà en place
--   2. Pays (ex. messages vocaux)                  — déjà en place
--   3. Super Admin › établissement : ARRÊT FORCÉ   — organizations.settings.platform_features
--   4. Établissement lui-même (Configuration)      — organizations.settings.features
-- Un arrêt forcé par la plateforme prime sur le réglage de l'établissement.
-- =============================================================================

create or replace function app.org_feature_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['parent_portal', 'student_portal', 'messaging', 'assistant', 'voice_checkin', 'medical_records', 'ranking', 'conduct'];
$$;

-- Ne garde que des clés connues à valeur booléenne.
create or replace function app.clean_feature_map(p_features jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_out jsonb := '{}'::jsonb;
begin
  if p_features is null or jsonb_typeof(p_features) <> 'object' then
    raise exception 'Réglage des fonctionnalités invalide.' using errcode = 'check_violation';
  end if;
  for v_key in select jsonb_object_keys(p_features) loop
    if not (v_key = any (app.org_feature_keys())) then
      raise exception 'Fonctionnalité inconnue : %', v_key using errcode = 'check_violation';
    end if;
    if jsonb_typeof(p_features -> v_key) <> 'boolean' then
      raise exception 'Valeur invalide pour %', v_key using errcode = 'check_violation';
    end if;
    v_out := v_out || jsonb_build_object(v_key, p_features -> v_key);
  end loop;
  return v_out;
end;
$$;

-- Niveau 3 : Super Admin, arrêt forcé pour un établissement (false = arrêté, true = laissé à l'établissement).
create or replace function public.platform_set_org_features(p_org uuid, p_features jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean jsonb;
  v_locked jsonb := '{}'::jsonb;
  v_key text;
  v_name text;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  v_clean := app.clean_feature_map(p_features);
  for v_key in select jsonb_object_keys(v_clean) loop
    if (v_clean ->> v_key)::boolean = false then v_locked := v_locked || jsonb_build_object(v_key, false); end if;
  end loop;
  update public.organizations
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{platform_features}', v_locked, true)
   where id = p_org
  returning name into v_name;
  if v_name is null then
    raise exception 'Établissement introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.audit(p_org, 'platform.org_features', 'organizations', p_org,
    'Fonctionnalités de l''établissement réglées par la plateforme',
    jsonb_build_object('locked', v_locked, 'reason', left(btrim(p_reason), 500)));
  return v_locked;
end;
$$;

-- Niveau 4 : l'établissement (droit settings.manage).
create or replace function public.save_org_features(p_org uuid, p_features jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean jsonb;
begin
  if not app.has_permission(p_org, 'settings.manage') then
    raise exception 'Droit « Paramètres » requis.' using errcode = 'insufficient_privilege';
  end if;
  v_clean := app.clean_feature_map(p_features);
  update public.organizations
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{features}', coalesce(settings -> 'features', '{}'::jsonb) || v_clean, true)
   where id = p_org;
  perform app.audit(p_org, 'settings.features', 'organizations', p_org, 'Fonctionnalités de l''établissement modifiées', jsonb_build_object('features', v_clean));
  return v_clean;
end;
$$;

-- Messages vocaux : l'arrêt (plateforme ou établissement) les rend indisponibles sur la tablette.
create or replace function app.org_feature_enabled(p_org uuid, p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((o.settings -> 'platform_features' ->> p_key)::boolean, true)
     and coalesce((o.settings -> 'features' ->> p_key)::boolean, true)
  from public.organizations o where o.id = p_org;
$$;

revoke all on function public.platform_set_org_features(uuid, jsonb, text), public.save_org_features(uuid, jsonb) from public, anon;
grant execute on function public.platform_set_org_features(uuid, jsonb, text), public.save_org_features(uuid, jsonb) to authenticated;
grant execute on function app.org_feature_enabled(uuid, text) to authenticated, service_role;
