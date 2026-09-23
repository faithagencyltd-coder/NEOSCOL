-- =============================================================================
-- NéoScol — 1200 Personnel : cycle de vie, badges QR, pointage sur tablette,
-- déverrouillage des cours, appel validé, justification des absences
--
-- Chaîne : emploi du temps → arrivée → scan du badge (tablette de
-- l'administration) → contrôles serveur → déverrouillage DU cours concerné →
-- appel par l'enseignant → validation → visibilité familles + statistiques.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Personnel : matricule automatique, cycle de vie
-- -----------------------------------------------------------------------------
alter table public.staff_members drop constraint staff_members_status_check;
alter table public.staff_members add constraint staff_members_status_check
  check (status in ('active', 'inactive', 'withdrawn'));
alter table public.staff_members
  add column status_reason text,
  add column status_changed_at timestamptz,
  add column archived_by uuid references public.profiles (id) on delete set null;

create or replace function app.staff_member_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate text;
  i integer := 0;
begin
  if tg_op = 'INSERT' then
    if nullif(btrim(new.employee_number), '') is null then
      loop
        v_candidate := app.generate_number(new.organization_id, 'staff', 'EMP-{CODE}-{SEQ:4}');
        exit when not exists (
          select 1 from public.staff_members where organization_id = new.organization_id and employee_number = v_candidate
        );
        i := i + 1;
        if i > 1000 then
          raise exception 'Impossible d''attribuer un matricule.' using errcode = 'unique_violation';
        end if;
      end loop;
      new.employee_number := v_candidate;
    end if;
    return new;
  end if;
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Un membre du personnel ne peut pas changer d''établissement.' using errcode = 'check_violation';
  end if;
  if new.status is distinct from old.status then
    new.status_changed_at := now();
  end if;
  if new.archived_at is distinct from old.archived_at then
    new.archived_by := case when new.archived_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;
create trigger staff_members_guard
  before insert or update on public.staff_members
  for each row execute function app.staff_member_guard();

-- -----------------------------------------------------------------------------
-- Badges du personnel : un seul badge actif par personne ; régénérer un badge
-- désactive automatiquement l'ancien (historique conservé).
-- -----------------------------------------------------------------------------
create table public.staff_badges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_id uuid not null,
  number text not null unique,
  token text not null unique default app.random_code(32),
  academic_year_id uuid,
  status text not null default 'active' check (status in ('active', 'revoked')),
  issued_at timestamptz not null default now(),
  issued_by uuid default auth.uid() references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  revoked_reason text,
  printed_count integer not null default 0,
  last_printed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, staff_id) references public.staff_members (organization_id, id) on delete cascade,
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete set null (academic_year_id),
  check (status <> 'revoked' or revoked_reason is not null)
);
create unique index staff_badges_one_active on public.staff_badges (staff_id) where status = 'active';
create index staff_badges_staff_idx on public.staff_badges (staff_id, issued_at desc);

create or replace function app.staff_badge_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.number := app.generate_number(new.organization_id, 'badge', 'BDG-{CODE}-{YY}-{SEQ:5}');
    new.token := app.random_code(32);
    new.status := 'active';
    new.issued_at := now();
    new.issued_by := coalesce(auth.uid(), new.issued_by);
    new.printed_count := 0;
    if new.academic_year_id is null then
      select id into new.academic_year_id from public.academic_years
       where organization_id = new.organization_id and is_current;
    end if;
    if exists (select 1 from public.staff_members s where s.id = new.staff_id and (s.status <> 'active' or s.archived_at is not null)) then
      raise exception 'Impossible de générer un badge pour un membre du personnel inactif.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if old.status = 'revoked' then
    raise exception 'Un badge désactivé ne peut plus être modifié.' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - array['status', 'revoked_at', 'revoked_by', 'revoked_reason', 'printed_count', 'last_printed_at'])
     is distinct from (to_jsonb(old) - array['status', 'revoked_at', 'revoked_by', 'revoked_reason', 'printed_count', 'last_printed_at']) then
    raise exception 'Un badge émis ne peut pas être modifié ; régénérez-le.' using errcode = 'check_violation';
  end if;
  if new.status = 'revoked' then
    if coalesce(btrim(new.revoked_reason), '') = '' then
      raise exception 'Le motif de désactivation est obligatoire.' using errcode = 'check_violation';
    end if;
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger staff_badges_guard
  before insert or update on public.staff_badges
  for each row execute function app.staff_badge_guard();

-- Désactivation / retrait / archivage du personnel → badge actif désactivé.
create or replace function app.staff_member_revoke_badges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status <> 'active' and old.status = 'active') or (new.archived_at is not null and old.archived_at is null) then
    update public.staff_badges
       set status = 'revoked',
           revoked_reason = case when new.archived_at is not null then 'Personnel archivé' else 'Personnel désactivé' end
     where staff_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;
create trigger staff_members_revoke_badges
  after update of status, archived_at on public.staff_members
  for each row execute function app.staff_member_revoke_badges();

-- Génère (ou régénère) le badge d'un membre du personnel. SECURITY INVOKER :
-- la RLS (staff.badges.manage) s'applique.
create or replace function public.issue_staff_badge(p_staff_id uuid, p_reason text default null)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_badge uuid;
begin
  select organization_id into v_org from public.staff_members where id = p_staff_id;
  if v_org is null then
    raise exception 'Membre du personnel introuvable.' using errcode = 'no_data_found';
  end if;
  update public.staff_badges
     set status = 'revoked', revoked_reason = coalesce(nullif(btrim(p_reason), ''), 'Badge régénéré')
   where staff_id = p_staff_id and status = 'active';
  insert into public.staff_badges (organization_id, staff_id) values (v_org, p_staff_id) returning id into v_badge;
  return v_badge;
end;
$$;
revoke execute on function public.issue_staff_badge(uuid, text) from public, anon;
grant execute on function public.issue_staff_badge(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Pointage : journal de TOUS les scans (acceptés et refusés), présence
-- journalière du personnel, déverrouillage des cours.
-- -----------------------------------------------------------------------------
create table public.staff_attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_id uuid not null,
  work_date date not null,
  arrived_at timestamptz not null,
  departed_at timestamptz,
  expected_start time,
  minutes_late integer not null default 0 check (minutes_late >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, work_date),
  unique (organization_id, id),
  foreign key (organization_id, staff_id) references public.staff_members (organization_id, id) on delete cascade,
  check (departed_at is null or departed_at >= arrived_at)
);
create index staff_attendance_org_date_idx on public.staff_attendance (organization_id, work_date desc);

alter table public.timetable_slots add unique (organization_id, id);

create table public.lesson_unlocks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  timetable_slot_id uuid not null,
  lesson_date date not null,
  class_id uuid not null,
  class_subject_id uuid,
  teacher_id uuid not null,
  starts_at time not null,
  ends_at time not null,
  method text not null default 'badge' check (method in ('badge', 'manual')),
  reason text,
  unlocked_at timestamptz not null default now(),
  unlocked_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (timetable_slot_id, lesson_date),
  unique (organization_id, id),
  foreign key (organization_id, timetable_slot_id) references public.timetable_slots (organization_id, id) on delete cascade,
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete cascade,
  foreign key (organization_id, teacher_id) references public.staff_members (organization_id, id) on delete cascade,
  check (method <> 'manual' or reason is not null)
);
create index lesson_unlocks_teacher_idx on public.lesson_unlocks (teacher_id, lesson_date);

create table public.badge_scans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  badge_id uuid references public.staff_badges (id) on delete set null,
  staff_id uuid references public.staff_members (id) on delete set null,
  scanned_at timestamptz not null default now(),
  result text not null check (result in ('accepted', 'rejected')),
  kind text check (kind in ('arrival', 'departure', 'lesson')),
  reason text not null,
  message text not null,
  lesson_unlock_id uuid references public.lesson_unlocks (id) on delete set null,
  scanned_by uuid default auth.uid() references public.profiles (id) on delete set null,
  device text
);
create index badge_scans_org_idx on public.badge_scans (organization_id, scanned_at desc);
create index badge_scans_staff_idx on public.badge_scans (staff_id, scanned_at desc);

create or replace function app.org_local_now(p_org uuid)
returns timestamp
language sql
stable
security definer
set search_path = ''
as $$
  select now() at time zone coalesce((select timezone from public.organizations where id = p_org), 'UTC');
$$;

-- -----------------------------------------------------------------------------
-- Scan d'un badge sur la tablette de pointage.
-- Contrôles : permission de la tablette, badge connu, même établissement, badge
-- actif, personnel actif, anti double-scan, cours dans la fenêtre horaire,
-- affectation de l'enseignant, année scolaire courante.
-- p_code : contenu du QR (« NEOSCOL-BADGE:<jeton> ») ou jeton seul.
-- -----------------------------------------------------------------------------
create or replace function public.scan_staff_badge(p_organization_id uuid, p_code text, p_device text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
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
  v_local := now() at time zone v_org.timezone;
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
  else
    select * into v_staff from public.staff_members where id = v_badge.staff_id;
    if v_staff.status <> 'active' or v_staff.archived_at is not null then
      v_reason := 'inactive_staff';
      v_message := 'Ce membre du personnel n''est pas actif.';
    elsif exists (
      select 1 from public.badge_scans
      where staff_id = v_staff.id and result = 'accepted'
        and scanned_at > now() - make_interval(secs => v_dup_window)
    ) then
      v_reason := 'duplicate';
      v_message := 'Badge déjà scanné à l''instant.';
    end if;
  end if;

  if v_reason is not null then
    insert into public.badge_scans (organization_id, badge_id, staff_id, result, reason, message, device)
    values (p_organization_id, v_badge.id, v_staff.id, 'rejected', v_reason, v_message, left(p_device, 120))
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
    values (p_organization_id, v_staff.id, v_today, now(), v_first_start, v_late)
    returning * into v_attendance;
  elsif v_slot.id is not null then
    v_kind := 'lesson';
  elsif v_track_departure then
    v_kind := 'departure';
    update public.staff_attendance set departed_at = now() where id = v_attendance.id returning * into v_attendance;
  else
    v_reason := 'already_checked_in';
    v_message := 'Arrivée déjà enregistrée aujourd''hui et aucun cours à débloquer maintenant.';
    insert into public.badge_scans (organization_id, badge_id, staff_id, result, reason, message, device)
    values (p_organization_id, v_badge.id, v_staff.id, 'rejected', v_reason, v_message, left(p_device, 120))
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

  insert into public.badge_scans (organization_id, badge_id, staff_id, result, kind, reason, message, lesson_unlock_id, device)
  values (p_organization_id, v_badge.id, v_staff.id, 'accepted', v_kind, 'ok', v_message, v_unlock_id, left(p_device, 120))
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
    'lesson', v_lesson
  );
end;
$$;
revoke execute on function public.scan_staff_badge(uuid, text, text) from public, anon;
grant execute on function public.scan_staff_badge(uuid, text, text) to authenticated;

-- Déverrouillage exceptionnel (badge oublié) : attendance.manage + motif, audité.
create or replace function public.unlock_lesson_manually(p_slot_id uuid, p_date date, p_reason text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_slot public.timetable_slots;
  v_id uuid;
begin
  select * into v_slot from public.timetable_slots where id = p_slot_id;
  if v_slot.id is null or not app.has_permission(v_slot.organization_id, 'attendance.manage') then
    raise exception 'Déverrouillage manuel non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  if v_slot.teacher_id is null then
    raise exception 'Aucun enseignant n''est affecté à ce créneau.' using errcode = 'check_violation';
  end if;
  if extract(isodow from p_date) <> v_slot.weekday or p_date <> app.org_local_now(v_slot.organization_id)::date then
    raise exception 'Le déverrouillage manuel n''est possible que pour un cours du jour.' using errcode = 'check_violation';
  end if;
  insert into public.lesson_unlocks (organization_id, timetable_slot_id, lesson_date, class_id, class_subject_id,
                                     teacher_id, starts_at, ends_at, method, reason)
  values (v_slot.organization_id, v_slot.id, p_date, v_slot.class_id, v_slot.class_subject_id,
          v_slot.teacher_id, v_slot.starts_at, v_slot.ends_at, 'manual', btrim(p_reason))
  on conflict (timetable_slot_id, lesson_date) do nothing
  returning id into v_id;
  if v_id is null then
    raise exception 'Ce cours est déjà déverrouillé.' using errcode = 'unique_violation';
  end if;
  perform app.audit(v_slot.organization_id, 'attendance.unlock_manual', 'lesson_unlocks', v_id, btrim(p_reason));
  return v_id;
end;
$$;
revoke execute on function public.unlock_lesson_manually(uuid, date, text) from public, anon;
grant execute on function public.unlock_lesson_manually(uuid, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Appel : lien au créneau, validation, verrouillage après validation
-- -----------------------------------------------------------------------------
alter table public.attendance_sessions
  add column timetable_slot_id uuid,
  add column status text not null default 'draft' check (status in ('draft', 'validated')),
  add column validated_at timestamptz,
  add column validated_by uuid references public.profiles (id) on delete set null,
  add foreign key (organization_id, timetable_slot_id) references public.timetable_slots (organization_id, id) on delete set null (timetable_slot_id);
create unique index attendance_sessions_slot_date on public.attendance_sessions (timetable_slot_id, session_date)
  where timetable_slot_id is not null;
-- Les séances antérieures sont considérées comme validées.
update public.attendance_sessions set status = 'validated', validated_at = updated_at;

alter table public.attendance_records
  add column arrived_at time,
  add column comment text check (comment is null or length(comment) <= 500);

create or replace function app.attendance_session_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.attendance_sessions := coalesce(new, old);
  v_manage boolean;
  v_slot record;
begin
  if auth.uid() is null then
    if tg_op <> 'DELETE' and new.status = 'validated' and new.validated_at is null then
      new.validated_at := now();
    end if;
    return coalesce(new, old);
  end if;
  v_manage := app.has_permission(v_row.organization_id, 'attendance.manage');

  if tg_op = 'DELETE' then
    if not v_manage then
      raise exception 'La suppression d''un appel est réservée à l''administration.' using errcode = 'insufficient_privilege';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.status = 'validated' and not v_manage then
    raise exception 'Cet appel est validé : il ne peut plus être modifié.' using errcode = 'check_violation';
  end if;

  if new.status = 'validated' and (tg_op = 'INSERT' or old.status <> 'validated') then
    new.validated_at := now();
    new.validated_by := auth.uid();
  elsif new.status = 'draft' then
    new.validated_at := null;
    new.validated_by := null;
  end if;

  if not v_manage then
    -- Enseignant : uniquement un cours de SON emploi du temps, du jour, déverrouillé par badge.
    if new.timetable_slot_id is null then
      raise exception 'L''appel n''est possible que pour un cours de votre emploi du temps, déverrouillé par le scan de votre badge.'
        using errcode = 'insufficient_privilege';
    end if;
    select ts.*, cs.teacher_id as assigned_teacher, c.academic_year_id as class_year
      into v_slot
    from public.timetable_slots ts
    join public.classes c on c.id = ts.class_id
    left join public.class_subjects cs on cs.id = ts.class_subject_id
    where ts.id = new.timetable_slot_id;
    if v_slot.id is null or v_slot.teacher_id is null or not (v_slot.teacher_id = any (app.my_staff_ids()))
       or (v_slot.class_subject_id is not null and v_slot.assigned_teacher is distinct from v_slot.teacher_id) then
      raise exception 'Ce cours ne vous est pas affecté.' using errcode = 'insufficient_privilege';
    end if;
    if new.class_id <> v_slot.class_id or new.class_subject_id is distinct from v_slot.class_subject_id
       or new.starts_at <> v_slot.starts_at or new.ends_at <> v_slot.ends_at
       or v_slot.academic_year_id <> v_slot.class_year then
      raise exception 'L''appel ne correspond pas au créneau de l''emploi du temps.' using errcode = 'check_violation';
    end if;
    if new.session_date <> app.org_local_now(new.organization_id)::date
       or extract(isodow from new.session_date) <> v_slot.weekday then
      raise exception 'L''appel ne peut être fait que le jour du cours.' using errcode = 'check_violation';
    end if;
    if not exists (
      select 1 from public.lesson_unlocks lu
      where lu.timetable_slot_id = new.timetable_slot_id and lu.lesson_date = new.session_date
    ) then
      raise exception 'Cours verrouillé : scannez votre badge à l''administration pour débloquer l''appel.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;
create trigger attendance_sessions_guard
  before insert or update or delete on public.attendance_sessions
  for each row execute function app.attendance_session_guard();

-- Enregistrements d'un appel validé : figés, sauf administration (attendance.manage)
-- et passage « absent/retard → absence justifiée » par attendance.justify.
create or replace function app.attendance_record_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.attendance_records := coalesce(new, old);
  v_status text;
begin
  if auth.uid() is null then
    return coalesce(new, old);
  end if;
  select status into v_status from public.attendance_sessions where id = v_row.session_id;
  if v_status = 'validated' and not app.has_permission(v_row.organization_id, 'attendance.manage') then
    if tg_op = 'UPDATE'
       and app.has_permission(v_row.organization_id, 'attendance.justify')
       and new.minutes_late is not distinct from old.minutes_late
       and new.arrived_at is not distinct from old.arrived_at
       and new.comment is not distinct from old.comment
       and (new.status = old.status or (old.status in ('absent', 'late') and new.status = 'excused')) then
      return new;
    end if;
    raise exception 'Cet appel est validé : il ne peut plus être modifié.' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger attendance_records_lock_guard
  before insert or update or delete on public.attendance_records
  for each row execute function app.attendance_record_lock_guard();

-- Notifications : envoyées à la VALIDATION de l'appel (plus à la saisie).
drop trigger attendance_records_notify on public.attendance_records;

create or replace function app.notify_attendance_record(p_record public.attendance_records)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_session record;
begin
  if p_record.status not in ('absent', 'late') then
    return;
  end if;
  select s.session_date, s.starts_at, coalesce(sub.name, 'cours') as subject
    into v_session
  from public.attendance_sessions s
  left join public.class_subjects cs on cs.id = s.class_subject_id
  left join public.subjects sub on sub.id = cs.subject_id
  where s.id = p_record.session_id;
  for v_user in select * from app.family_user_ids(p_record.student_id) loop
    perform app.notify(p_record.organization_id, v_user, 'attendance.' || p_record.status::text,
      case when p_record.status = 'absent' then 'Absence signalée' else 'Retard signalé' end,
      'Le ' || to_char(v_session.session_date, 'DD/MM/YYYY') || ' à ' || to_char(v_session.starts_at, 'HH24"h"MI')
        || ' (' || v_session.subject || ')'
        || case when p_record.status = 'late' and p_record.minutes_late is not null then ' — ' || p_record.minutes_late || ' min' else '' end || '.',
      '/portail/presences', jsonb_build_object('attendance_record_id', p_record.id, 'student_id', p_record.student_id));
  end loop;
end;
$$;

create or replace function app.notify_attendance_session_validated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_record public.attendance_records;
begin
  if new.status = 'validated' and (tg_op = 'INSERT' or old.status <> 'validated') then
    for v_record in select * from public.attendance_records where session_id = new.id loop
      perform app.notify_attendance_record(v_record);
    end loop;
  end if;
  return new;
end;
$$;
create trigger attendance_sessions_notify after insert or update of status on public.attendance_sessions
  for each row execute function app.notify_attendance_session_validated();

create or replace function app.notify_absence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Correction d'un appel déjà validé : la famille est prévenue du nouveau statut.
  if (tg_op = 'INSERT' or old.status is distinct from new.status)
     and exists (select 1 from public.attendance_sessions s where s.id = new.session_id and s.status = 'validated') then
    perform app.notify_attendance_record(new);
  end if;
  return new;
end;
$$;
create trigger attendance_records_notify after insert or update of status on public.attendance_records
  for each row execute function app.notify_absence();

-- Familles : uniquement les appels VALIDÉS.
drop policy attendance_sessions_select on public.attendance_sessions;
create policy attendance_sessions_select on public.attendance_sessions for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('attendance.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('attendance.manage'))::uuid[])
    or class_id = any ((select app.my_taught_class_ids())::uuid[])
    or (status = 'validated' and class_id = any ((select app.my_portal_class_ids())::uuid[]))
  );
drop policy attendance_records_select on public.attendance_records;
create policy attendance_records_select on public.attendance_records for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('attendance.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('attendance.manage'))::uuid[])
    or session_id in (
      select s.id from public.attendance_sessions s
      where s.class_id = any ((select app.my_taught_class_ids())::uuid[])
    )
    or (
      student_id = any ((select app.my_portal_student_ids())::uuid[])
      and session_id in (select s.id from public.attendance_sessions s where s.status = 'validated')
    )
  );

-- -----------------------------------------------------------------------------
-- Appel d'un cours de l'emploi du temps (enseignant ou administration).
-- p_records : [{ student_id, status, minutes_late?, arrived_at?, comment? }]
-- p_validate : valide l'appel (verrouillage + notifications + statistiques).
-- -----------------------------------------------------------------------------
create or replace function public.take_lesson_attendance(
  p_slot_id uuid, p_date date, p_records jsonb default '[]'::jsonb, p_validate boolean default false
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_slot public.timetable_slots;
  v_session uuid;
  v_status text;
  v_record jsonb;
begin
  select * into v_slot from public.timetable_slots where id = p_slot_id;
  if v_slot.id is null then
    raise exception 'Cours introuvable.' using errcode = 'no_data_found';
  end if;

  select id, status into v_session, v_status from public.attendance_sessions
   where timetable_slot_id = p_slot_id and session_date = p_date;
  if v_session is null then
    insert into public.attendance_sessions (organization_id, class_id, class_subject_id, timetable_slot_id,
                                            session_date, starts_at, ends_at)
    values (v_slot.organization_id, v_slot.class_id, v_slot.class_subject_id, v_slot.id,
            p_date, v_slot.starts_at, v_slot.ends_at)
    returning id into v_session;
  else
    -- Déclenche les contrôles (verrouillage, affectation) avant toute écriture.
    update public.attendance_sessions set taken_by = auth.uid() where id = v_session;
  end if;

  for v_record in select * from jsonb_array_elements(coalesce(p_records, '[]'::jsonb)) loop
    if exists (
      select 1 from public.enrollments e
      where e.class_id = v_slot.class_id and e.status = 'validated' and e.student_id = (v_record ->> 'student_id')::uuid
    ) then
      insert into public.attendance_records (organization_id, session_id, student_id, status, minutes_late, arrived_at, comment)
      values (
        v_slot.organization_id, v_session, (v_record ->> 'student_id')::uuid,
        (v_record ->> 'status')::public.attendance_status,
        case when v_record ->> 'status' = 'late' then nullif(v_record ->> 'minutes_late', '')::integer end,
        case when v_record ->> 'status' = 'late' then nullif(v_record ->> 'arrived_at', '')::time end,
        nullif(btrim(v_record ->> 'comment'), '')
      )
      on conflict (session_id, student_id)
        do update set status = excluded.status, minutes_late = excluded.minutes_late,
                      arrived_at = excluded.arrived_at, comment = excluded.comment
        where (public.attendance_records.status, public.attendance_records.minutes_late,
               public.attendance_records.arrived_at, public.attendance_records.comment)
              is distinct from (excluded.status, excluded.minutes_late, excluded.arrived_at, excluded.comment);
    end if;
  end loop;

  if p_validate then
    if exists (
      select 1 from public.enrollments e
      where e.class_id = v_slot.class_id and e.status = 'validated'
        and not exists (select 1 from public.attendance_records r where r.session_id = v_session and r.student_id = e.student_id)
    ) then
      raise exception 'Tous les élèves de la classe doivent avoir un statut avant la validation.' using errcode = 'check_violation';
    end if;
    update public.attendance_sessions set status = 'validated' where id = v_session and status = 'draft';
  end if;
  return v_session;
end;
$$;
revoke execute on function public.take_lesson_attendance(uuid, date, jsonb, boolean) from public, anon;
grant execute on function public.take_lesson_attendance(uuid, date, jsonb, boolean) to authenticated;

-- Validation d'un appel libre (saisi par l'administration via record_attendance).
create or replace function public.validate_attendance_session(p_session_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  update public.attendance_sessions set status = 'validated' where id = p_session_id and status = 'draft';
  if not found then
    raise exception 'Appel introuvable ou déjà validé.' using errcode = 'no_data_found';
  end if;
end;
$$;
revoke execute on function public.validate_attendance_session(uuid) from public, anon;
grant execute on function public.validate_attendance_session(uuid) to authenticated;

-- Réouverture d'un appel validé (correction) : administration uniquement.
create or replace function public.reopen_attendance_session(p_session_id uuid, p_reason text)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.attendance_sessions where id = p_session_id;
  if v_org is null or not app.has_permission(v_org, 'attendance.manage') then
    raise exception 'La réouverture d''un appel est réservée à l''administration.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  update public.attendance_sessions set status = 'draft', notes = btrim(p_reason) where id = p_session_id;
end;
$$;
revoke execute on function public.reopen_attendance_session(uuid, text) from public, anon;
grant execute on function public.reopen_attendance_session(uuid, text) to authenticated;

-- Cours d'un enseignant (emploi du temps daté) avec l'état de l'appel :
-- pending (En attente) · unlocked (Appel disponible) · in_progress · validated · missed
create or replace function public.my_lessons(p_from date, p_to date)
returns table (
  slot_id uuid, lesson_date date, starts_at time, ends_at time,
  class_id uuid, class_name text, class_subject_id uuid, subject_name text, room_name text,
  status text, unlocked_at timestamptz, unlock_method text, session_id uuid
)
language sql
stable
security invoker
set search_path = ''
as $$
  select ts.id, d::date, ts.starts_at, ts.ends_at,
         c.id, c.name, ts.class_subject_id, coalesce(s.name, ts.label, 'Cours'), r.name,
         case
           when sess.status = 'validated' then 'validated'
           when sess.id is not null then 'in_progress'
           when lu.id is not null and d::date = app.org_local_now(ts.organization_id)::date then 'unlocked'
           when d::date < app.org_local_now(ts.organization_id)::date
             or (d::date = app.org_local_now(ts.organization_id)::date and ts.ends_at <= app.org_local_now(ts.organization_id)::time)
             then 'missed'
           else 'pending'
         end,
         lu.unlocked_at, lu.method, sess.id
  from generate_series(p_from, least(p_to, p_from + 62), interval '1 day') d
  join public.timetable_slots ts
    on ts.weekday = extract(isodow from d) and ts.teacher_id = any (app.my_staff_ids())
  join public.academic_years ay on ay.id = ts.academic_year_id and d::date between ay.starts_on and ay.ends_on
  join public.classes c on c.id = ts.class_id
  left join public.class_subjects cs on cs.id = ts.class_subject_id
  left join public.subjects s on s.id = cs.subject_id
  left join public.rooms r on r.id = ts.room_id
  left join public.lesson_unlocks lu on lu.timetable_slot_id = ts.id and lu.lesson_date = d::date
  left join public.attendance_sessions sess on sess.timetable_slot_id = ts.id and sess.session_date = d::date
  order by d, ts.starts_at;
$$;
revoke execute on function public.my_lessons(date, date) from public, anon;
grant execute on function public.my_lessons(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Justification des absences : absence → justificatif (famille ou administration)
-- → validation administrative (accepter / refuser / demander une correction).
-- -----------------------------------------------------------------------------
create table public.absence_justifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  starts_on date not null,
  ends_on date not null,
  reason text not null check (length(btrim(reason)) between 3 and 1000),
  file_id uuid,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'correction_requested')),
  submitted_by uuid default auth.uid() references public.profiles (id) on delete set null,
  submitted_via text not null default 'staff' check (submitted_via in ('staff', 'portal')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  review_comment text,
  records_justified integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, file_id) references public.file_objects (organization_id, id) on delete set null (file_id),
  check (ends_on >= starts_on and ends_on - starts_on <= 120)
);
create index absence_justifications_student_idx on public.absence_justifications (student_id, starts_on desc);
create index absence_justifications_pending_idx on public.absence_justifications (organization_id) where status = 'pending';

alter table public.absence_justifications enable row level security;
create policy absence_justifications_select on public.absence_justifications for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('attendance.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('attendance.justify'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
    or student_id = any ((select app.my_taught_student_ids())::uuid[]) -- l'enseignant voit le statut
  );
-- Aucune écriture directe : RPC submit / review ci-dessous.

create or replace function app.can_read_file(p_org uuid, p_owner_type text, p_owner_id uuid, p_uploaded_by uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_uploaded_by = auth.uid() or case p_owner_type
    when 'organization' then app.is_member(p_org)
    when 'student' then app.has_permission(p_org, 'students.read') or p_owner_id = any (app.my_portal_student_ids())
    when 'guardian' then app.has_permission(p_org, 'guardians.read')
    when 'staff' then app.has_permission(p_org, 'staff.read')
      or p_owner_id = any (app.my_staff_ids())
      or app.has_permission(p_org, 'staff_attendance.scan')
    when 'enrollment' then app.has_permission(p_org, 'enrollments.read')
    when 'issued_document' then app.has_permission(p_org, 'documents.read')
    when 'attendance_record' then app.has_permission(p_org, 'attendance.read')
    when 'absence_justification' then app.has_permission(p_org, 'attendance.justify')
      or app.has_permission(p_org, 'attendance.read')
      or exists (select 1 from public.absence_justifications j
                 where j.id = p_owner_id and j.student_id = any (app.my_portal_student_ids()))
    when 'expense' then app.has_permission(p_org, 'finance.expenses.read')
      or app.has_permission(p_org, 'finance.expenses.manage')
    else false
  end;
$$;

create or replace function public.submit_absence_justification(
  p_student_id uuid, p_starts_on date, p_ends_on date, p_reason text,
  p_file_id uuid default null, p_justification_id uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_staff boolean;
  v_portal boolean;
  v_id uuid;
  v_existing public.absence_justifications;
  v_user uuid;
begin
  select organization_id into v_org from public.students where id = p_student_id;
  if v_org is null then
    raise exception 'Élève introuvable.' using errcode = 'no_data_found';
  end if;
  v_staff := app.has_permission(v_org, 'attendance.justify');
  v_portal := p_student_id = any (app.my_portal_student_ids());
  if not (v_staff or v_portal) then
    raise exception 'Vous ne pouvez pas justifier les absences de cet élève.' using errcode = 'insufficient_privilege';
  end if;
  if p_ends_on < p_starts_on then
    raise exception 'La période est invalide.' using errcode = 'check_violation';
  end if;
  if p_file_id is not null and not exists (
    select 1 from public.file_objects f
    where f.id = p_file_id and f.organization_id = v_org and f.owner_type = 'absence_justification'
      and (f.uploaded_by = auth.uid() or v_staff)
  ) then
    raise exception 'Justificatif introuvable.' using errcode = 'no_data_found';
  end if;

  if p_justification_id is not null then
    -- Correction demandée par l'administration : la famille renvoie sa justification.
    select * into v_existing from public.absence_justifications where id = p_justification_id and student_id = p_student_id;
    if v_existing.id is null or v_existing.status not in ('pending', 'correction_requested') then
      raise exception 'Cette justification ne peut plus être modifiée.' using errcode = 'check_violation';
    end if;
    update public.absence_justifications
       set starts_on = p_starts_on, ends_on = p_ends_on, reason = btrim(p_reason),
           file_id = coalesce(p_file_id, file_id), status = 'pending', submitted_at = now(), submitted_by = auth.uid()
     where id = v_existing.id
    returning id into v_id;
  else
    insert into public.absence_justifications (organization_id, student_id, starts_on, ends_on, reason, file_id, submitted_via)
    values (v_org, p_student_id, p_starts_on, p_ends_on, btrim(p_reason), p_file_id,
            case when v_staff then 'staff' else 'portal' end)
    returning id into v_id;
  end if;
  if p_file_id is not null then
    update public.file_objects set owner_id = v_id where id = p_file_id and owner_id is null;
  end if;

  -- Prévenir les personnes chargées de la validation.
  if not v_staff then
    for v_user in
      select distinct m.user_id from public.memberships m
      join public.membership_roles mr on mr.membership_id = m.id
      join public.role_permissions rp on rp.role_id = mr.role_id and rp.permission_code = 'attendance.justify'
      where m.organization_id = v_org and m.status = 'active'
    loop
      perform app.notify(v_org, v_user, 'attendance.justification_submitted', 'Justificatif d''absence à valider',
        'Du ' || to_char(p_starts_on, 'DD/MM/YYYY') || ' au ' || to_char(p_ends_on, 'DD/MM/YYYY') || '.',
        '/presences?onglet=justificatifs', jsonb_build_object('justification_id', v_id));
    end loop;
  end if;
  perform app.audit(v_org, 'attendance.justification_submit', 'absence_justifications', v_id,
                    'Justificatif du ' || to_char(p_starts_on, 'DD/MM/YYYY') || ' au ' || to_char(p_ends_on, 'DD/MM/YYYY'));
  return v_id;
end;
$$;
revoke execute on function public.submit_absence_justification(uuid, date, date, text, uuid, uuid) from public, anon;
grant execute on function public.submit_absence_justification(uuid, date, date, text, uuid, uuid) to authenticated;

-- Décision administrative. Accepter justifie les absences/retards de la période.
create or replace function public.review_absence_justification(p_id uuid, p_decision text, p_comment text default null)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_j public.absence_justifications;
  v_count integer := 0;
  v_user uuid;
begin
  select * into v_j from public.absence_justifications where id = p_id for update;
  if v_j.id is null or not app.has_permission(v_j.organization_id, 'attendance.justify') then
    raise exception 'La validation des justificatifs nécessite la permission attendance.justify.' using errcode = 'insufficient_privilege';
  end if;
  if p_decision not in ('accepted', 'rejected', 'correction_requested') then
    raise exception 'Décision invalide.' using errcode = 'check_violation';
  end if;
  if v_j.status = 'accepted' then
    raise exception 'Cette justification a déjà été acceptée.' using errcode = 'check_violation';
  end if;
  if p_decision in ('rejected', 'correction_requested') and coalesce(btrim(p_comment), '') = '' then
    raise exception 'Un commentaire est obligatoire pour refuser ou demander une correction.' using errcode = 'check_violation';
  end if;

  if p_decision = 'accepted' then
    -- Passe par les contrôles standards (attendance.justify de l'utilisateur).
    update public.attendance_records r
       set is_justified = true,
           justification = left(v_j.reason, 500),
           status = case when r.status = 'absent' then 'excused'::public.attendance_status else r.status end
      from public.attendance_sessions s
     where s.id = r.session_id and r.student_id = v_j.student_id
       and s.session_date between v_j.starts_on and v_j.ends_on
       and r.status in ('absent', 'late', 'excused') and not r.is_justified;
    get diagnostics v_count = row_count;
  end if;

  update public.absence_justifications
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(),
         review_comment = nullif(btrim(p_comment), ''),
         records_justified = case when p_decision = 'accepted' then v_count end
   where id = p_id;

  for v_user in select * from app.family_user_ids(v_j.student_id) loop
    perform app.notify(v_j.organization_id, v_user, 'attendance.justification_' || p_decision,
      case p_decision when 'accepted' then 'Justificatif accepté'
                      when 'rejected' then 'Justificatif refusé'
                      else 'Correction demandée sur un justificatif' end,
      coalesce(nullif(btrim(p_comment), ''), 'Absences du ' || to_char(v_j.starts_on, 'DD/MM/YYYY') || ' au ' || to_char(v_j.ends_on, 'DD/MM/YYYY') || '.'),
      '/portail/presences', jsonb_build_object('justification_id', p_id));
  end loop;
  perform app.audit(v_j.organization_id, 'attendance.justification_' || p_decision, 'absence_justifications', p_id,
                    coalesce(nullif(btrim(p_comment), ''), p_decision), jsonb_build_object('records', v_count));
  return v_count;
end;
$$;
revoke execute on function public.review_absence_justification(uuid, text, text) from public, anon;
grant execute on function public.review_absence_justification(uuid, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.staff_badges enable row level security;
alter table public.staff_attendance enable row level security;
alter table public.lesson_unlocks enable row level security;
alter table public.badge_scans enable row level security;

create policy staff_badges_select on public.staff_badges for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('staff.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('staff.badges.manage'))::uuid[])
    or staff_id = any ((select app.my_staff_ids())::uuid[])
  );
create policy staff_badges_insert on public.staff_badges for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('staff.badges.manage'))::uuid[]));
create policy staff_badges_update on public.staff_badges for update to authenticated
  using (organization_id = any ((select app.permitted_org_ids('staff.badges.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('staff.badges.manage'))::uuid[]));

create policy staff_attendance_select on public.staff_attendance for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('staff_attendance.read'))::uuid[])
    or staff_id = any ((select app.my_staff_ids())::uuid[])
  );

create policy lesson_unlocks_select on public.lesson_unlocks for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('staff_attendance.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('attendance.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('attendance.manage'))::uuid[])
    or teacher_id = any ((select app.my_staff_ids())::uuid[])
  );

create policy badge_scans_select on public.badge_scans for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('staff_attendance.read'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('staff_attendance.scan'))::uuid[])
        and scanned_at > now() - interval '1 day')
    or staff_id = any ((select app.my_staff_ids())::uuid[])
  );

-- Suppression définitive d'un membre du personnel : archivé au préalable,
-- confirmation par le matricule, staff.delete. Historique d'audit conservé.
create or replace function public.delete_staff_member(p_staff_id uuid, p_confirmation text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_staff public.staff_members;
begin
  select * into v_staff from public.staff_members where id = p_staff_id for update;
  if v_staff.id is null or not app.has_permission(v_staff.organization_id, 'staff.delete') then
    raise exception 'La suppression définitive nécessite la permission staff.delete.' using errcode = 'insufficient_privilege';
  end if;
  if v_staff.archived_at is null then
    raise exception 'Archivez d''abord ce membre du personnel : la suppression définitive n''est possible qu''après archivage.'
      using errcode = 'check_violation';
  end if;
  if upper(btrim(coalesce(p_confirmation, ''))) <> upper(v_staff.employee_number) then
    raise exception 'Confirmation invalide : saisissez le matricule exact.' using errcode = 'check_violation';
  end if;
  perform app.audit(v_staff.organization_id, 'staff.delete', 'staff_members', v_staff.id,
                    v_staff.first_name || ' ' || v_staff.last_name || ' (' || v_staff.employee_number || ')');
  delete from public.file_objects where owner_type = 'staff' and owner_id = v_staff.id;
  delete from public.staff_members where id = v_staff.id;
end;
$$;
revoke execute on function public.delete_staff_member(uuid, text) from public, anon;
grant execute on function public.delete_staff_member(uuid, text) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['staff_badges', 'staff_attendance', 'lesson_unlocks', 'absence_justifications', 'attendance_sessions']
  loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s
                    for each row execute function app.audit_row()', t);
  end loop;
end;
$$;
create trigger staff_attendance_touch before update on public.staff_attendance for each row execute function app.touch_updated_at();
create trigger absence_justifications_touch before update on public.absence_justifications for each row execute function app.touch_updated_at();

grant execute on function app.org_local_now(uuid) to authenticated, service_role;
