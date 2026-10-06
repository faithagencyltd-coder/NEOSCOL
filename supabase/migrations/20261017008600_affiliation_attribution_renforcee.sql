-- =============================================================================
-- Affiliation : attribution à l'inscription renforcée.
-- Une école n'est attribuée que si elle vient d'être créée PAR L'INSCRIPTION EN LIGNE
-- (trace « settings.organization_signup ») et n'a encore aucun paiement : une école
-- existante, créée par la console ou déjà cliente n'est jamais attribuée, même récente.
-- =============================================================================

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
  -- Seule une école qui vient d'être créée par l'inscription en ligne (moins d'une heure), sans aucun
  -- paiement, peut être attribuée ici : jamais une école existante, créée par la console ou déjà cliente.
  if o.created_at < now() - interval '1 hour'
     or not exists (select 1 from public.audit_logs l
                     where l.organization_id = p_org and l.action = 'settings.organization_signup' and l.entity_id = p_org)
     or exists (select 1 from public.subscription_payments sp where sp.organization_id = p_org) then
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
revoke all on function public.affiliate_attribute_signup(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.affiliate_attribute_signup(uuid, uuid, uuid, text, text, text) to service_role;
