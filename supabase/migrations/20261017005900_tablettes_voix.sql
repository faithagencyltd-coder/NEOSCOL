-- =============================================================================
-- Tablettes de pointage : caractère de la voix (homme, femme ou automatique) et
-- hauteur, réglés par l'établissement. La voix exacte reste choisie sur chaque
-- tablette (les voix disponibles dépendent de l'appareil) ; ce réglage sert de
-- préférence quand la tablette n'a pas de choix propre.
-- =============================================================================

alter table public.voice_checkin_settings
  add column voice_gender text not null default 'auto' check (voice_gender in ('auto', 'female', 'male')),
  add column pitch numeric(3, 2) not null default 1 check (pitch between 0.5 and 1.5);

create or replace function public.save_voice_checkin_voice(p_org uuid, p_gender text, p_pitch numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before public.voice_checkin_settings;
begin
  if not app.has_permission(p_org, 'voice_checkin.manage') then
    raise exception 'Permission refusée : messages vocaux.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(p_gender, '') not in ('auto', 'female', 'male') then
    raise exception 'Type de voix invalide (automatique, femme ou homme).' using errcode = 'check_violation';
  end if;
  if p_pitch is null or p_pitch not between 0.5 and 1.5 then
    raise exception 'Hauteur de la voix invalide (0,5 à 1,5).' using errcode = 'check_violation';
  end if;
  select * into v_before from public.voice_checkin_settings where organization_id = p_org;
  insert into public.voice_checkin_settings (organization_id, voice_gender, pitch, updated_by, updated_at)
  values (p_org, p_gender, p_pitch, auth.uid(), now())
  on conflict (organization_id) do update
    set voice_gender = excluded.voice_gender, pitch = excluded.pitch, updated_by = excluded.updated_by, updated_at = now();
  if v_before.organization_id is null or v_before.voice_gender is distinct from p_gender or v_before.pitch is distinct from p_pitch then
    perform app.audit(p_org, 'settings.voice_checkin', 'voice_checkin_settings', p_org, 'Voix de la tablette modifiée',
      jsonb_build_object('before', jsonb_build_object('voice_gender', v_before.voice_gender, 'pitch', v_before.pitch),
                         'after', jsonb_build_object('voice_gender', p_gender, 'pitch', p_pitch)),
      'success');
  end if;
end;
$$;

-- Réglages effectifs (mêmes droits qu'avant), avec le caractère de la voix.
create or replace function public.voice_checkin_config(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_country public.countries;
  v_set public.voice_checkin_settings;
begin
  if not (app.has_permission(p_org, 'staff_attendance.scan') or app.has_permission(p_org, 'voice_checkin.manage')) then
    raise exception 'Permission refusée : messages vocaux.' using errcode = 'insufficient_privilege';
  end if;
  select c.* into v_country from public.organizations o join public.countries c on c.code = o.country where o.id = p_org;
  select * into v_set from public.voice_checkin_settings where organization_id = p_org;
  return jsonb_build_object(
    'available', coalesce((v_country.settings ->> 'voice_checkin_enabled')::boolean, true),
    'enabled', coalesce(v_set.enabled, false),
    'language', coalesce(v_set.language, case when v_country.default_language in ('fr', 'en') then v_country.default_language else 'fr' end),
    'rate', coalesce(v_set.rate, 1),
    'volume', coalesce(v_set.volume, 1),
    'pitch', coalesce(v_set.pitch, 1),
    'voice_gender', coalesce(v_set.voice_gender, 'auto'),
    'announce_names', coalesce(v_set.announce_names, true),
    'messages', coalesce(v_set.messages, '{}'::jsonb),
    'organization', (select name from public.organizations where id = p_org));
end;
$$;

revoke execute on function public.save_voice_checkin_voice(uuid, text, numeric) from public, anon;
grant execute on function public.save_voice_checkin_voice(uuid, text, numeric) to authenticated;
