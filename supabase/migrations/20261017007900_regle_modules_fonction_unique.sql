-- =============================================================================
-- Une seule fonction de règle des modules : la date de fin devient facultative
-- (valeur par défaut). La version sans date de fin, devenue redondante, est
-- retirée ; les appels existants à 5 arguments restent valables.
-- =============================================================================

drop function public.platform_set_feature_rule(text, text, text, boolean, text);

create or replace function public.platform_set_feature_rule(p_feature text, p_scope text, p_value text, p_enabled boolean, p_reason text, p_until timestamptz default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_value text := case when p_scope = 'global' then '' else btrim(coalesce(p_value, '')) end;
  v_label text;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  if not (p_feature = any (app.org_feature_keys())) then
    raise exception 'Fonctionnalité inconnue.' using errcode = 'check_violation';
  end if;
  if p_scope not in ('global', 'country', 'org_type', 'organization') then
    raise exception 'Niveau inconnu.' using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  if p_until is not null and p_until <= now() then
    raise exception 'La date de fin doit être dans le futur.' using errcode = 'check_violation';
  end if;
  if p_scope = 'country' and not exists (select 1 from public.countries where code = v_value) then
    raise exception 'Pays inconnu.' using errcode = 'check_violation';
  end if;
  if p_scope = 'org_type' and not (v_value = any (enum_range(null::public.organization_type)::text[])) then
    raise exception 'Type d''établissement inconnu.' using errcode = 'check_violation';
  end if;
  if p_scope = 'organization' and not exists (select 1 from public.organizations where id::text = v_value) then
    raise exception 'Établissement introuvable.' using errcode = 'check_violation';
  end if;
  v_label := case p_scope when 'global' then 'toute la plateforme' when 'country' then 'pays ' || v_value
             when 'org_type' then 'type ' || v_value else 'établissement ' || coalesce((select name from public.organizations where id::text = v_value), v_value) end;
  if p_enabled is null then
    delete from public.platform_feature_rules where feature_key = p_feature and scope = p_scope and scope_value = v_value;
    perform app.audit(null, 'platform.feature_rule_removed', 'platform_feature_rules', null, 'Règle retirée : ' || p_feature || ' — ' || v_label,
      jsonb_build_object('feature', p_feature, 'scope', p_scope, 'value', v_value, 'reason', left(btrim(p_reason), 500)));
    return;
  end if;
  insert into public.platform_feature_rules (feature_key, scope, scope_value, enabled, reason, updated_by, until)
  values (p_feature, p_scope, v_value, p_enabled, left(btrim(p_reason), 500), auth.uid(), p_until)
  on conflict (feature_key, scope, scope_value)
  do update set enabled = excluded.enabled, reason = excluded.reason, updated_by = excluded.updated_by, updated_at = now(), until = excluded.until;
  perform app.audit(null, 'platform.feature_rule', 'platform_feature_rules', null,
    case when p_enabled then 'Fonctionnalité ouverte : ' else 'Fonctionnalité arrêtée : ' end || p_feature || ' — ' || v_label
      || case when p_until is not null then ' (jusqu''au ' || to_char(p_until, 'DD/MM/YYYY') || ')' else '' end,
    jsonb_build_object('feature', p_feature, 'scope', p_scope, 'value', v_value, 'enabled', p_enabled, 'until', p_until, 'reason', left(btrim(p_reason), 500)));
end;
$$;

revoke all on function public.platform_set_feature_rule(text, text, text, boolean, text, timestamptz) from public, anon;
grant execute on function public.platform_set_feature_rule(text, text, text, boolean, text, timestamptz) to authenticated;
