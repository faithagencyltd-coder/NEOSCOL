-- =============================================================================
-- P7f — HORS LIGNE : appel et pointage enregistrés sans réseau, synchronisés
--
-- Sans API nouvelle côté métier : les règles existantes s'appliquent, au
-- moment réel de la saisie.
--   * Pointage : scan_staff_badge_core accepte l'heure de capture (p_at) ;
--     arrivée, retard, départ, déverrouillage du cours et anti-double scan
--     sont calculés à cette heure. Les badges dynamiques sont vérifiés dans la
--     fenêtre de 30 s de la capture (anti-rejeu inchangé).
--   * Appel : même RPC take_lesson_attendance (droits et verrouillages).
--   * Idempotence : chaque saisie hors ligne porte un identifiant ; un envoi
--     rejoué renvoie le résultat enregistré (jamais deux arrivées ni deux
--     notifications aux familles).
--   * Fenêtre acceptée : 72 h au plus dans le passé, 2 min dans le futur.
--   * Côté appareil : seuls des identifiants et statuts sont en attente ; aucun
--     nom, aucune donnée personnelle n'est mise en cache.
-- =============================================================================

alter table public.badge_scans add column captured_offline boolean not null default false;

drop function public.scan_staff_badge_core(uuid, text, text);
create function public.scan_staff_badge_core(p_organization_id uuid, p_code text, p_device text default null,
  p_at timestamptz default now(), p_offline boolean default false)
 RETURNS jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
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
    'staff', jsonb_build_object('name', v_staff.first_name || ' ' || v_staff.last_name, 'job_title', v_staff.job_title,
                                'employee_number', v_staff.employee_number, 'photo_file_id', v_staff.photo_path),
    'at', to_char(v_local, 'HH24:MI'),
    'minutes_late', case when v_kind = 'arrival' then v_late end,
    'lesson', v_lesson,
    'offline', p_offline
  );
end;
$function$;
revoke execute on function public.scan_staff_badge_core(uuid, text, text, timestamptz, boolean) from public, anon, authenticated;

-- Badge dynamique vérifié à l'heure de capture.
create or replace function app.resolve_badge_code_at(p_code text, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  m text[];
  v_badge uuid;
  v_window bigint;
  v_token text;
  v_now bigint := floor(extract(epoch from p_at) / 30)::bigint;
begin
  m := regexp_match(btrim(coalesce(p_code, '')), '^NEOSCOL-DYN:([SE]):([0-9a-f-]{36}):([0-9]{1,12}):([0-9a-f]{20})$');
  if m is null then
    return p_code; -- badge imprimé (code fixe) : inchangé
  end if;
  v_badge := m[2]::uuid;
  v_window := m[3]::bigint;
  if m[1] = 'S' then
    select token into v_token from public.staff_badges where id = v_badge and status = 'active';
  else
    select token into v_token from public.student_badges where id = v_badge and status = 'active';
  end if;
  if v_token is null or app.badge_signature(v_token, m[1], v_badge, v_window) <> m[4] then
    return 'INVALID';
  end if;
  if v_window < v_now - 2 or v_window > v_now + 1 then
    return 'EXPIRED';
  end if;
  insert into public.badge_dynamic_uses (badge_id, time_window) values (v_badge, v_window) on conflict do nothing;
  if not found then
    return 'REPLAY';
  end if;
  delete from public.badge_dynamic_uses where used_at < now() - interval '1 day';
  return 'NEOSCOL-BADGE:' || v_token;
end;
$$;
create or replace function app.resolve_badge_code(p_code text)
returns text
language sql
security definer
set search_path = ''
as $$
  select app.resolve_badge_code_at(p_code, now());
$$;
revoke execute on function app.resolve_badge_code_at(text, timestamptz) from public, anon, authenticated;
revoke execute on function app.resolve_badge_code(text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Saisies hors ligne reçues (idempotence)
-- -----------------------------------------------------------------------------
create table public.offline_submissions (
  client_id uuid primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('staff_scan', 'lesson_attendance')),
  captured_at timestamptz not null,
  received_at timestamptz not null default now(),
  result jsonb not null default '{}'::jsonb
);
create index offline_submissions_org on public.offline_submissions (organization_id, received_at desc);
alter table public.offline_submissions enable row level security;
revoke all on public.offline_submissions from anon, authenticated;
grant select, insert on public.offline_submissions to authenticated;
create policy offline_submissions_own_read on public.offline_submissions for select to authenticated using (user_id = auth.uid());
create policy offline_submissions_own_insert on public.offline_submissions for insert to authenticated
  with check (user_id = auth.uid() and organization_id = any (app.member_org_ids()));

create or replace function app.offline_capture_error(p_captured_at timestamptz)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_captured_at is null then 'Heure de saisie manquante.'
    when p_captured_at > now() + interval '2 minutes' then 'Heure de saisie dans le futur : vérifiez l''horloge de l''appareil.'
    when p_captured_at < now() - interval '72 hours' then 'Saisie hors ligne trop ancienne (plus de 72 h) : elle ne peut plus être enregistrée.'
  end;
$$;

-- Pointage capturé hors ligne (tablette autorisée uniquement).
create or replace function public.sync_offline_staff_scan(p_organization_id uuid, p_client_id uuid, p_code text, p_captured_at timestamptz, p_device text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_prev jsonb;
  v_error text := app.offline_capture_error(p_captured_at);
  v_code text;
  v_result jsonb;
begin
  if auth.uid() is null or not app.has_permission(p_organization_id, 'staff_attendance.scan') then
    raise exception 'Cette tablette n''est pas autorisée à pointer pour cet établissement.' using errcode = 'insufficient_privilege';
  end if;
  select result into v_prev from public.offline_submissions where client_id = p_client_id and organization_id = p_organization_id;
  if v_prev is not null then
    return v_prev || jsonb_build_object('duplicate', true);
  end if;
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;
  v_code := app.resolve_badge_code_at(p_code, p_captured_at);
  if v_code in ('EXPIRED', 'REPLAY', 'INVALID') then
    v_result := app.dynamic_badge_rejection(v_code) || jsonb_build_object('offline', true);
  else
    v_result := public.scan_staff_badge_core(p_organization_id, v_code, p_device, p_captured_at, true);
  end if;
  insert into public.offline_submissions (client_id, organization_id, user_id, kind, captured_at, result)
  values (p_client_id, p_organization_id, auth.uid(), 'staff_scan', p_captured_at, v_result);
  return v_result;
end;
$$;

-- Appel capturé hors ligne : mêmes droits que l'appel en ligne (RPC appelée avec l'identité de l'enseignant).
create or replace function public.sync_offline_lesson_attendance(p_client_id uuid, p_slot_id uuid, p_date date, p_records jsonb, p_validate boolean, p_captured_at timestamptz)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_error text := app.offline_capture_error(p_captured_at);
  v_session uuid;
  v_result jsonb;
begin
  if exists (select 1 from public.offline_submissions where client_id = p_client_id) then
    return (select result || jsonb_build_object('duplicate', true) from public.offline_submissions where client_id = p_client_id);
  end if;
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;
  select organization_id into v_org from public.timetable_slots where id = p_slot_id;
  if v_org is null then
    raise exception 'Cours introuvable.' using errcode = 'no_data_found';
  end if;
  v_session := public.take_lesson_attendance(p_slot_id, p_date, p_records, p_validate);
  v_result := jsonb_build_object('session_id', v_session, 'validated', p_validate, 'records', jsonb_array_length(coalesce(p_records, '[]'::jsonb)));
  insert into public.offline_submissions (client_id, organization_id, kind, captured_at, result)
  values (p_client_id, v_org, 'lesson_attendance', p_captured_at, v_result);
  return v_result;
end;
$$;

revoke execute on function public.sync_offline_staff_scan(uuid, uuid, text, timestamptz, text) from public, anon;
revoke execute on function public.sync_offline_lesson_attendance(uuid, uuid, date, jsonb, boolean, timestamptz) from public, anon;
grant execute on function public.sync_offline_staff_scan(uuid, uuid, text, timestamptz, text) to authenticated;
grant execute on function public.sync_offline_lesson_attendance(uuid, uuid, date, jsonb, boolean, timestamptz) to authenticated;
