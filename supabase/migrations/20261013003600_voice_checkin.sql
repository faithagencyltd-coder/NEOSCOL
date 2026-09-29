-- =============================================================================
-- VOICE CHECK-IN — messages vocaux à l'arrivée (tablette de pointage)
--
-- Conforme au cahier des charges (§ 36) : configurable, désactivable, sécurisé,
-- soumis aux permissions, multi-établissements, multi-pays.
--   * Réglages par établissement : activation, langue (par défaut celle du
--     pays), débit, volume, annonce ou non des noms, messages par événement
--     avec variables ({prenom}, {retard}, {cours}…) vérifiées en base.
--   * Le Super Admin peut désactiver la fonctionnalité pour un pays
--     (countries.settings.voice_checkin_enabled = false).
--   * Synthèse vocale sur la tablette (navigateur) : aucun enregistrement
--     audio, aucun envoi à un service externe, rien de stocké.
--   * Désactiver ne supprime aucun réglage.
-- =============================================================================

insert into public.permissions (code, module, label, sort_order) values
  ('voice_checkin.manage', 'settings', 'Configurer les messages vocaux à l''arrivée', 16);
insert into public.role_permissions (role_id, permission_code)
select r.id, 'voice_checkin.manage' from public.roles r where r.key in ('org_admin', 'director')
on conflict do nothing;

create or replace function app.voice_event_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['arrival', 'arrival_late', 'departure', 'lesson', 'learner_entry', 'learner_late', 'learner_exit', 'duplicate', 'rejected', 'offline'];
$$;

create or replace function app.voice_messages_error(p_messages jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v text;
  var text;
begin
  if jsonb_typeof(coalesce(p_messages, '{}'::jsonb)) <> 'object' then
    return 'Messages invalides.';
  end if;
  for k, v in select key, value #>> '{}' from jsonb_each(coalesce(p_messages, '{}'::jsonb)) loop
    if not (k = any (app.voice_event_keys())) then
      return 'Événement inconnu : ' || k || '.';
    end if;
    if char_length(btrim(coalesce(v, ''))) > 200 then
      return 'Message trop long (200 caractères au plus).';
    end if;
    for var in select (regexp_matches(coalesce(v, ''), '\{\s*([^}]*?)\s*\}', 'g'))[1] loop
      if not (var = any (array['prenom', 'nom', 'retard', 'cours', 'classe', 'salle', 'heure', 'etablissement'])) then
        return 'Variable inconnue : {' || var || '}.';
      end if;
    end loop;
  end loop;
  return null;
end;
$$;

create table public.voice_checkin_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  enabled boolean not null default false,
  language text check (language is null or language in ('fr', 'en')),
  rate numeric(3, 2) not null default 1 check (rate between 0.5 and 1.5),
  volume numeric(3, 2) not null default 1 check (volume between 0 and 1),
  announce_names boolean not null default true,
  messages jsonb not null default '{}'::jsonb check (app.voice_messages_error(messages) is null),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.voice_checkin_settings enable row level security;
revoke all on public.voice_checkin_settings from anon, authenticated;
grant select on public.voice_checkin_settings to authenticated;
create policy voice_checkin_settings_read on public.voice_checkin_settings for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('voice_checkin.manage'))::uuid[]));

create or replace function public.save_voice_checkin_settings(
  p_org uuid, p_enabled boolean, p_language text, p_rate numeric, p_volume numeric, p_announce_names boolean, p_messages jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before public.voice_checkin_settings;
  v_error text := app.voice_messages_error(p_messages);
  v_clean jsonb;
begin
  if not app.has_permission(p_org, 'voice_checkin.manage') then
    raise exception 'Permission refusée : messages vocaux.' using errcode = 'insufficient_privilege';
  end if;
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;
  if p_rate not between 0.5 and 1.5 or p_volume not between 0 and 1 then
    raise exception 'Débit (0,5 à 1,5) ou volume (0 à 1) invalide.' using errcode = 'check_violation';
  end if;
  -- Messages vides = message par défaut : non conservés.
  select coalesce(jsonb_object_agg(key, btrim(value #>> '{}')), '{}'::jsonb) into v_clean
    from jsonb_each(coalesce(p_messages, '{}'::jsonb)) where btrim(coalesce(value #>> '{}', '')) <> '';
  select * into v_before from public.voice_checkin_settings where organization_id = p_org;
  insert into public.voice_checkin_settings (organization_id, enabled, language, rate, volume, announce_names, messages, updated_by, updated_at)
  values (p_org, p_enabled, nullif(p_language, ''), p_rate, p_volume, p_announce_names, v_clean, auth.uid(), now())
  on conflict (organization_id) do update
    set enabled = excluded.enabled, language = excluded.language, rate = excluded.rate, volume = excluded.volume,
        announce_names = excluded.announce_names, messages = excluded.messages, updated_by = excluded.updated_by, updated_at = now();
  perform app.audit(p_org, 'settings.voice_checkin', 'voice_checkin_settings', p_org,
    'Messages vocaux à l''arrivée ' || case when p_enabled then 'activés' else 'désactivés' end,
    jsonb_build_object('before', to_jsonb(v_before) - 'updated_by', 'after',
      jsonb_build_object('enabled', p_enabled, 'language', p_language, 'rate', p_rate, 'volume', p_volume, 'announce_names', p_announce_names, 'messages', v_clean)),
    'success');
end;
$$;

-- Réglages effectifs pour la tablette (ou l'écran de configuration).
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
    'announce_names', coalesce(v_set.announce_names, true),
    'messages', coalesce(v_set.messages, '{}'::jsonb),
    'organization', (select name from public.organizations where id = p_org));
end;
$$;

revoke execute on function public.save_voice_checkin_settings(uuid, boolean, text, numeric, numeric, boolean, jsonb) from public, anon;
revoke execute on function public.voice_checkin_config(uuid) from public, anon;
grant execute on function public.save_voice_checkin_settings(uuid, boolean, text, numeric, numeric, boolean, jsonb) to authenticated;
grant execute on function public.voice_checkin_config(uuid) to authenticated;

-- Prénom dans le résultat du scan (variable {prenom}).
create or replace function public.scan_staff_badge_core(p_organization_id uuid, p_code text, p_device text DEFAULT NULL::text, p_at timestamp with time zone DEFAULT now(), p_offline boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_token text;
  v_badge public.staff_badges;
  v_staff public.staff_members;
  v_org public.organizations;
  v_local timestamp;
  v_today date;
  v_time time;
  v_cfg jsonb;
  v_open_before interval;
  v_tolerance integer;
  v_dup_window integer;
  v_track_departure boolean;
  v_attendance public.staff_attendance;
  v_first_start time;
  v_late integer := 0;
  v_slot record;
  v_unlock_id uuid;
  v_kind text;
  v_reason text;
  v_message text;
  v_lesson jsonb;
  v_scan_id uuid;
  v_year uuid;
begin
  if auth.uid() is null or not app.has_permission(p_organization_id, 'staff_attendance.scan') then
    raise exception 'Cette tablette n''est pas autorisée à pointer pour cet établissement.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_org from public.organizations where id = p_organization_id;
  v_local := p_at at time zone v_org.timezone;
  v_today := v_local::date;
  v_time := v_local::time;
  v_cfg := coalesce(v_org.settings -> 'staff_attendance', '{}'::jsonb);
  v_open_before := make_interval(mins => coalesce((v_cfg ->> 'open_before_minutes')::integer, 15));
  v_tolerance := coalesce((v_cfg ->> 'late_tolerance_minutes')::integer, 5);
  v_dup_window := coalesce((v_cfg ->> 'duplicate_window_seconds')::integer, 60);
  v_track_departure := coalesce((v_cfg ->> 'track_departure')::boolean, true);

  v_token := substring(upper(btrim(coalesce(p_code, ''))) from '([A-HJ-NP-Z2-9]{32})$');
  if v_token is not null then
    select * into v_badge from public.staff_badges where token = v_token;
  end if;

  -- Refus : badge inconnu, autre établissement, désactivé, personnel inactif.
  if v_badge.id is null then
    v_reason := 'unknown_badge';
    v_message := 'Badge non reconnu.';
  elsif v_badge.organization_id <> p_organization_id then
    v_reason := 'other_organization';
    v_message := 'Ce badge appartient à un autre établissement.';
    v_badge := null; -- aucune information sur l'autre établissement n'est conservée ici
  elsif v_badge.status <> 'active' then
    v_reason := 'revoked_badge';
    v_message := 'Ce badge a été désactivé. Adressez-vous à l''administration.';
    select * into v_staff from public.staff_members where id = v_badge.staff_id;
  else
    select * into v_staff from public.staff_members where id = v_badge.staff_id;
    if v_staff.status <> 'active' or v_staff.archived_at is not null then
      v_reason := 'inactive_staff';
      v_message := 'Ce membre du personnel n''est pas actif.';
    elsif exists (
      select 1 from public.badge_scans
      where staff_id = v_staff.id and result = 'accepted'
        and scanned_at > p_at - make_interval(secs => v_dup_window)
        and scanned_at <= p_at + make_interval(secs => v_dup_window)
    ) then
      v_reason := 'duplicate';
      v_message := 'Badge déjà scanné à l''instant.';
    end if;
  end if;

  if v_reason is not null then
    insert into public.badge_scans (organization_id, badge_id, staff_id, result, reason, message, device, scanned_at, captured_offline)
    values (p_organization_id, v_badge.id, v_staff.id, 'rejected', v_reason, v_message, left(p_device, 120), p_at, p_offline)
    returning id into v_scan_id;
    perform app.audit(p_organization_id, 'staff_attendance.scan', 'badge_scans', v_scan_id, v_message,
                      jsonb_build_object('reason', v_reason, 'staff_id', v_staff.id), 'denied');
    return jsonb_build_object('result', 'rejected', 'reason', v_reason, 'message', v_message,
      'staff', case when v_staff.id is not null then jsonb_build_object(
        'name', v_staff.first_name || ' ' || v_staff.last_name, 'job_title', v_staff.job_title) end);
  end if;

  select id into v_year from public.academic_years where organization_id = p_organization_id and is_current;

  -- Cours de l'enseignant dans la fenêtre horaire (déjà ouvert ou ouvrant dans
  -- « open_before_minutes »), pas encore déverrouillé, affectation vérifiée.
  select ts.id, ts.class_id, ts.class_subject_id, ts.starts_at, ts.ends_at, c.name as class_name,
         coalesce(s.name, ts.label, 'Cours') as subject_name, r.name as room_name
    into v_slot
  from public.timetable_slots ts
  join public.classes c on c.id = ts.class_id and c.archived_at is null
  left join public.class_subjects cs on cs.id = ts.class_subject_id
  left join public.subjects s on s.id = cs.subject_id
  left join public.rooms r on r.id = ts.room_id
  join public.academic_years ay on ay.id = ts.academic_year_id
  where ts.organization_id = p_organization_id
    and ts.teacher_id = v_staff.id
    and ts.academic_year_id = v_year
    and v_today between ay.starts_on and ay.ends_on
    and ts.weekday = extract(isodow from v_today)
    and (ts.class_subject_id is null or cs.teacher_id = v_staff.id)
    and v_time >= ts.starts_at - v_open_before
    and v_time < ts.ends_at
    and not exists (select 1 from public.lesson_unlocks lu where lu.timetable_slot_id = ts.id and lu.lesson_date = v_today)
  order by ts.starts_at
  limit 1;

  select * into v_attendance from public.staff_attendance where staff_id = v_staff.id and work_date = v_today;

  if v_attendance.id is null then
    v_kind := 'arrival';
    select min(ts.starts_at) into v_first_start
    from public.timetable_slots ts
    where ts.teacher_id = v_staff.id and ts.academic_year_id = v_year and ts.weekday = extract(isodow from v_today);
    if v_first_start is not null and v_time > v_first_start + make_interval(mins => v_tolerance) then
      v_late := floor(extract(epoch from (v_time - v_first_start)) / 60)::integer;
    end if;
    insert into public.staff_attendance (organization_id, staff_id, work_date, arrived_at, expected_start, minutes_late)
    values (p_organization_id, v_staff.id, v_today, p_at, v_first_start, v_late)
    returning * into v_attendance;
  elsif v_slot.id is not null then
    v_kind := 'lesson';
  elsif v_track_departure then
    v_kind := 'departure';
    update public.staff_attendance set departed_at = greatest(p_at, arrived_at) where id = v_attendance.id returning * into v_attendance;
  else
    v_reason := 'already_checked_in';
    v_message := 'Arrivée déjà enregistrée aujourd''hui et aucun cours à débloquer maintenant.';
    insert into public.badge_scans (organization_id, badge_id, staff_id, result, reason, message, device, scanned_at, captured_offline)
    values (p_organization_id, v_badge.id, v_staff.id, 'rejected', v_reason, v_message, left(p_device, 120), p_at, p_offline)
    returning id into v_scan_id;
    perform app.audit(p_organization_id, 'staff_attendance.scan', 'badge_scans', v_scan_id, v_message,
                      jsonb_build_object('reason', v_reason, 'staff_id', v_staff.id), 'denied');
    return jsonb_build_object('result', 'rejected', 'reason', v_reason, 'message', v_message,
      'staff', jsonb_build_object('name', v_staff.first_name || ' ' || v_staff.last_name, 'job_title', v_staff.job_title));
  end if;

  if v_slot.id is not null then
    insert into public.lesson_unlocks (organization_id, timetable_slot_id, lesson_date, class_id, class_subject_id,
                                       teacher_id, starts_at, ends_at, method)
    values (p_organization_id, v_slot.id, v_today, v_slot.class_id, v_slot.class_subject_id,
            v_staff.id, v_slot.starts_at, v_slot.ends_at, 'badge')
    returning id into v_unlock_id;
    v_lesson := jsonb_build_object('class', v_slot.class_name, 'subject', v_slot.subject_name, 'room', v_slot.room_name,
                                   'starts_at', to_char(v_slot.starts_at, 'HH24:MI'), 'ends_at', to_char(v_slot.ends_at, 'HH24:MI'));
  end if;

  v_message := case v_kind
    when 'arrival' then 'Arrivée enregistrée' || case when v_late > 0 then ' (retard de ' || v_late || ' min)' else '' end || '.'
    when 'departure' then 'Départ enregistré.'
    else 'Cours débloqué.'
  end || case when v_slot.id is not null and v_kind <> 'lesson' then ' Cours débloqué.' else '' end
      || case when v_slot.id is null and v_staff.is_teacher and v_kind = 'arrival' then ' Aucun cours à débloquer dans la fenêtre horaire.' else '' end;

  insert into public.badge_scans (organization_id, badge_id, staff_id, result, kind, reason, message, lesson_unlock_id, device, scanned_at, captured_offline)
  values (p_organization_id, v_badge.id, v_staff.id, 'accepted', v_kind, 'ok', v_message, v_unlock_id, left(p_device, 120), p_at, p_offline)
  returning id into v_scan_id;
  perform app.audit(p_organization_id, 'staff_attendance.scan', 'badge_scans', v_scan_id,
                    v_staff.first_name || ' ' || v_staff.last_name || ' — ' || v_message,
                    jsonb_build_object('kind', v_kind, 'staff_id', v_staff.id, 'lesson_unlock_id', v_unlock_id), 'success');

  return jsonb_build_object(
    'result', 'accepted',
    'kind', v_kind,
    'message', v_message,
    'staff', jsonb_build_object('name', v_staff.first_name || ' ' || v_staff.last_name, 'first_name', v_staff.first_name, 'job_title', v_staff.job_title,
                                'employee_number', v_staff.employee_number, 'photo_file_id', v_staff.photo_path),
    'at', to_char(v_local, 'HH24:MI'),
    'minutes_late', case when v_kind = 'arrival' then v_late end,
    'lesson', v_lesson,
    'offline', p_offline
  );
end;
$function$;
revoke execute on function public.scan_staff_badge_core(uuid, text, text, timestamptz, boolean) from public, anon, authenticated;
