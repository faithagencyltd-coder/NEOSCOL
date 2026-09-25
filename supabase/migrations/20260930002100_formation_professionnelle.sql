-- =============================================================================
-- NéoScol — 2100 MODULE 2 : FORMATION PROFESSIONNELLE
--
-- Centres de formation (vocational_center, technical_center). Tout s'appuie sur
-- l'existant — aucun système parallèle :
--   formations      = programs (kind 'training')         + champs de formation
--   sessions        = classes  (kind 'training_session') + programme, tarif
--   modules/cours   = subjects + class_subjects (formateur par module)
--   apprenants      = students ; inscriptions = enrollments (+ groupe)
--   paiements       = invoices / installments / payments (reçus existants)
--   badges / scan   = même format de QR (« NEOSCOL-BADGE:<jeton> »), même
--                     tablette, même journal badge_scans ; les badges du
--                     personnel passent toujours par scan_staff_badge
--   emploi du temps = timetable_slots (+ groupe facultatif)
-- Nouveautés : classes/groupes FACULTATIFS (réglage par centre), badges
-- apprenants, entrées/sorties des apprenants, compétences, stages, tableau
-- de bord et statistiques.
-- Le Module Scolaire (settings.school) et les universités ne sont pas touchés.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permission : badges des apprenants
-- -----------------------------------------------------------------------------
insert into public.permissions (code, module, label, sort_order) values
  ('students.badges.manage', 'students', 'Générer, imprimer, désactiver et remplacer les badges des apprenants', 27);

insert into public.role_permissions (role_id, permission_code)
select r.id, 'students.badges.manage'
from public.roles r
where r.key in ('org_admin', 'director', 'secretary')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Réglages du centre : settings.training
--   groups_enabled          classes / groupes utilisés dans les sessions
--   late_tolerance_minutes  retard toléré avant « EN RETARD »
--   open_before_minutes     entrée acceptée avant le début du cours
--   entry_without_course    entrée acceptée même sans cours prévu
-- -----------------------------------------------------------------------------
create or replace function app.is_training_org_type(p_type public.organization_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in ('vocational_center', 'technical_center');
$$;

create or replace function app.default_training_settings()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"groups_enabled": false, "late_tolerance_minutes": 5, "open_before_minutes": 30, "entry_without_course": false}'::jsonb;
$$;

update public.organizations
   set settings = settings || jsonb_build_object('training', app.default_training_settings())
 where app.is_training_org_type(type) and not (settings ? 'training');

create or replace function app.organization_training_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_training_org_type(new.type) and not (coalesce(new.settings, '{}'::jsonb) ? 'training') then
    new.settings := coalesce(new.settings, '{}'::jsonb) || jsonb_build_object('training', app.default_training_settings());
  end if;
  return new;
end;
$$;
create trigger organizations_training_defaults
  before insert on public.organizations
  for each row execute function app.organization_training_defaults();

-- Réglages effectifs (NULL : établissement hors Module Formation professionnelle).
create or replace function app.org_training(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.is_training_org_type(o.type)
    then app.default_training_settings() || coalesce(o.settings -> 'training', '{}'::jsonb) end
  from public.organizations o where o.id = p_org;
$$;

create or replace function public.set_training_config(p_org uuid, p_config jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_before jsonb;
  v_after jsonb;
  v_tolerance integer;
  v_open integer;
begin
  if not app.has_permission(p_org, 'settings.manage') then
    raise exception 'Permission requise : settings.manage' using errcode = 'insufficient_privilege';
  end if;
  select * into v_org from public.organizations where id = p_org;
  if not app.is_training_org_type(v_org.type) then
    raise exception 'Le module Formation professionnelle ne s''applique pas à ce type d''établissement.' using errcode = 'check_violation';
  end if;
  v_before := app.org_training(p_org);
  begin
    v_tolerance := coalesce((p_config ->> 'late_tolerance_minutes')::integer, (v_before ->> 'late_tolerance_minutes')::integer);
    v_open := coalesce((p_config ->> 'open_before_minutes')::integer, (v_before ->> 'open_before_minutes')::integer);
  exception when others then
    raise exception 'Valeur de réglage invalide.' using errcode = 'check_violation';
  end;
  if v_tolerance not between 0 and 120 then
    raise exception 'Tolérance de retard : entre 0 et 120 minutes.' using errcode = 'check_violation';
  end if;
  if v_open not between 0 and 240 then
    raise exception 'Ouverture avant le cours : entre 0 et 240 minutes.' using errcode = 'check_violation';
  end if;
  v_after := jsonb_build_object(
    'groups_enabled', coalesce((p_config ->> 'groups_enabled')::boolean, (v_before ->> 'groups_enabled')::boolean),
    'late_tolerance_minutes', v_tolerance,
    'open_before_minutes', v_open,
    'entry_without_course', coalesce((p_config ->> 'entry_without_course')::boolean, (v_before ->> 'entry_without_course')::boolean));
  update public.organizations set settings = settings || jsonb_build_object('training', v_after) where id = p_org;
  perform app.audit(p_org, 'settings.training', 'organizations', p_org, 'Réglages de la formation professionnelle mis à jour',
                    jsonb_build_object('before', v_before, 'after', v_after));
  return v_after;
end;
$$;
revoke execute on function public.set_training_config(uuid, jsonb) from public, anon;
grant execute on function public.set_training_config(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Formations (programs) : champs propres, définis librement par le centre
-- -----------------------------------------------------------------------------
alter table public.programs
  add column training_level text check (training_level is null or length(training_level) <= 120),
  add column admission_conditions text check (admission_conditions is null or length(admission_conditions) <= 2000),
  add column certificate_title text check (certificate_title is null or length(certificate_title) <= 160),
  add column syllabus text check (syllabus is null or length(syllabus) <= 8000),
  add column duration_label text check (duration_label is null or length(duration_label) <= 60),
  add column tuition_amount numeric(14, 2) check (tuition_amount is null or tuition_amount >= 0),
  add column registration_fee numeric(14, 2) check (registration_fee is null or registration_fee >= 0),
  add column default_installments smallint check (default_installments is null or default_installments between 1 and 24);

-- Suppression d'une formation : seulement si elle n'a jamais servi (sinon, la désactiver).
create or replace function public.delete_training_program(p_program_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_program public.programs;
begin
  select * into v_program from public.programs where id = p_program_id;
  if v_program.id is null or not app.has_permission(v_program.organization_id, 'academic.manage') then
    raise exception 'Formation introuvable ou permission academic.manage requise.' using errcode = 'insufficient_privilege';
  end if;
  if v_program.kind <> 'training' then
    raise exception 'Seules les formations peuvent être supprimées ici.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.classes where program_id = v_program.id)
     or exists (select 1 from public.enrollments where program_id = v_program.id) then
    raise exception 'Cette formation a déjà des sessions ou des inscriptions : désactivez-la plutôt (rien n''est perdu).'
      using errcode = 'check_violation';
  end if;
  perform app.audit(v_program.organization_id, 'training.program_deleted', 'programs', v_program.id,
                    'Formation supprimée : ' || v_program.name);
  delete from public.programs where id = v_program.id;
end;
$$;
revoke execute on function public.delete_training_program(uuid) from public, anon;
grant execute on function public.delete_training_program(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Sessions (classes kind 'training_session')
-- -----------------------------------------------------------------------------
alter table public.classes
  add column syllabus text check (syllabus is null or length(syllabus) <= 8000),
  add column tuition_amount numeric(14, 2) check (tuition_amount is null or tuition_amount >= 0);

create or replace function app.training_session_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program public.programs;
  v_count integer;
begin
  if new.kind <> 'training_session' then
    return new;
  end if;
  if tg_op = 'INSERT' or new.program_id is distinct from old.program_id then
    if new.program_id is null then
      raise exception 'Choisissez la formation de la session.' using errcode = 'check_violation';
    end if;
    select * into v_program from public.programs where id = new.program_id;
    if v_program.kind <> 'training' then
      raise exception 'Une session doit être rattachée à une formation.' using errcode = 'check_violation';
    end if;
    if tg_op = 'INSERT' and not v_program.is_active then
      raise exception 'Cette formation est désactivée : réactivez-la pour ouvrir une session.' using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.capacity is not null and new.capacity is distinct from old.capacity then
    select count(*) into v_count from public.enrollments where class_id = new.id and status in ('pending', 'validated');
    if v_count > new.capacity then
      raise exception 'Capacité trop faible : % apprenant(s) déjà inscrit(s).', v_count using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger classes_training_session_guard
  before insert or update on public.classes
  for each row execute function app.training_session_guard();

-- -----------------------------------------------------------------------------
-- Classes / groupes FACULTATIFS d'une session
-- -----------------------------------------------------------------------------
create table public.training_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 60),
  capacity integer check (capacity is null or capacity > 0),
  room_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, name),
  unique (organization_id, id),
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete cascade,
  foreign key (organization_id, room_id) references public.rooms (organization_id, id) on delete set null (room_id)
);
create index training_groups_class_idx on public.training_groups (class_id);

create or replace function app.training_group_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind text;
  v_count integer;
begin
  if tg_op = 'UPDATE' and new.class_id is distinct from old.class_id then
    raise exception 'Un groupe ne peut pas changer de session.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    select kind into v_kind from public.classes where id = new.class_id;
    if v_kind is distinct from 'training_session' then
      raise exception 'Les groupes ne concernent que les sessions de formation.' using errcode = 'check_violation';
    end if;
    if not coalesce((app.org_training(new.organization_id) ->> 'groups_enabled')::boolean, false) then
      raise exception 'Les classes / groupes ne sont pas activés pour ce centre (Formation → Paramètres).' using errcode = 'check_violation';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.capacity is not null and new.capacity is distinct from old.capacity then
    select count(*) into v_count from public.enrollments where group_id = new.id and status in ('pending', 'validated');
    if v_count > new.capacity then
      raise exception 'Capacité trop faible : % apprenant(s) déjà dans ce groupe.', v_count using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger training_groups_guard
  before insert or update on public.training_groups
  for each row execute function app.training_group_guard();
create trigger training_groups_touch before update on public.training_groups for each row execute function app.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Inscriptions : groupe facultatif, capacité de la session et du groupe
-- -----------------------------------------------------------------------------
alter table public.enrollments add column group_id uuid;
alter table public.enrollments
  add foreign key (organization_id, group_id) references public.training_groups (organization_id, id) on delete restrict;
create index enrollments_group_idx on public.enrollments (group_id) where group_id is not null;

-- Niveau d'étude de l'apprenant.
alter table public.students
  add column education_level text check (education_level is null or length(education_level) <= 120);

create or replace function app.enrollment_training_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_group public.training_groups;
  v_count integer;
  v_active boolean := new.status in ('pending', 'validated');
begin
  if new.group_id is not null and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id or new.class_id is distinct from old.class_id) then
    select * into v_group from public.training_groups where id = new.group_id;
    if v_group.class_id is distinct from new.class_id then
      raise exception 'Ce groupe n''appartient pas à la session choisie.' using errcode = 'check_violation';
    end if;
    if v_group.archived_at is not null then
      raise exception 'Ce groupe est archivé.' using errcode = 'check_violation';
    end if;
  end if;
  if not v_active or new.class_id is null then
    return new;
  end if;
  select * into v_class from public.classes where id = new.class_id;
  if v_class.kind <> 'training_session' then
    return new; -- Module Scolaire / université : comportement inchangé.
  end if;
  if tg_op = 'INSERT' or new.class_id is distinct from old.class_id or old.status not in ('pending', 'validated') then
    if v_class.capacity is not null then
      select count(*) into v_count from public.enrollments
       where class_id = new.class_id and status in ('pending', 'validated') and id <> new.id;
      if v_count >= v_class.capacity then
        raise exception 'Session complète : capacité de % apprenant(s) atteinte.', v_class.capacity using errcode = 'check_violation';
      end if;
    end if;
  end if;
  if new.group_id is not null
     and (tg_op = 'INSERT' or new.group_id is distinct from old.group_id or old.status not in ('pending', 'validated')) then
    select * into v_group from public.training_groups where id = new.group_id;
    if v_group.capacity is not null then
      select count(*) into v_count from public.enrollments
       where group_id = new.group_id and status in ('pending', 'validated') and id <> new.id;
      if v_count >= v_group.capacity then
        raise exception 'Groupe complet : capacité de % apprenant(s) atteinte.', v_group.capacity using errcode = 'check_violation';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger enrollments_training_guard
  before insert or update of class_id, group_id, status on public.enrollments
  for each row execute function app.enrollment_training_guard();

-- -----------------------------------------------------------------------------
-- Emploi du temps : créneau d'un groupe ou de toute la session.
-- La contrainte « une classe, un cours à la fois » est recréée avec le groupe :
-- identique pour les écoles (jamais de groupe) ; deux groupes d'une même
-- session peuvent avoir cours en même temps. Même nom de contrainte.
-- -----------------------------------------------------------------------------
alter table public.timetable_slots add column group_id uuid;
alter table public.timetable_slots
  add foreign key (organization_id, group_id) references public.training_groups (organization_id, id) on delete cascade;
alter table public.timetable_slots drop constraint timetable_no_class_overlap;
alter table public.timetable_slots add constraint timetable_no_class_overlap exclude using gist (
  class_id with =,
  (coalesce(group_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
  weekday with =,
  tsrange(date '2000-01-01' + starts_at, date '2000-01-01' + ends_at) with &&
);

create or replace function app.timetable_group_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.group_id is not null then
    if not exists (select 1 from public.training_groups g where g.id = new.group_id and g.class_id = new.class_id) then
      raise exception 'Ce groupe n''appartient pas à cette session.' using errcode = 'check_violation';
    end if;
    if exists (
      select 1 from public.timetable_slots ts
      where ts.class_id = new.class_id and ts.group_id is null and ts.weekday = new.weekday and ts.id <> new.id
        and ts.starts_at < new.ends_at and new.starts_at < ts.ends_at
    ) then
      raise exception 'La session entière a déjà un cours sur ce créneau.' using errcode = 'exclusion_violation';
    end if;
  elsif exists (select 1 from public.training_groups g where g.class_id = new.class_id) then
    if exists (
      select 1 from public.timetable_slots ts
      where ts.class_id = new.class_id and ts.group_id is not null and ts.weekday = new.weekday and ts.id <> new.id
        and ts.starts_at < new.ends_at and new.starts_at < ts.ends_at
    ) then
      raise exception 'Un groupe de la session a déjà un cours sur ce créneau.' using errcode = 'exclusion_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger timetable_slots_group_guard
  before insert or update of class_id, group_id, weekday, starts_at, ends_at on public.timetable_slots
  for each row execute function app.timetable_group_guard();

-- -----------------------------------------------------------------------------
-- Badges des apprenants (même format de QR que le personnel)
-- Un seul badge actif par apprenant ; remplacer désactive l'ancien, qui ne
-- scanne plus ; l'historique est conservé.
-- -----------------------------------------------------------------------------
create table public.student_badges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  number text not null unique,
  token text not null unique default app.random_code(32),
  status text not null default 'active' check (status in ('active', 'revoked')),
  issued_at timestamptz not null default now(),
  issued_by uuid default auth.uid() references public.profiles (id) on delete set null,
  replaces_badge_id uuid references public.student_badges (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  revoked_reason text,
  printed_count integer not null default 0,
  last_printed_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  check (status <> 'revoked' or revoked_reason is not null)
);
create unique index student_badges_one_active on public.student_badges (student_id) where status = 'active';
create index student_badges_student_idx on public.student_badges (student_id, issued_at desc);

create or replace function app.student_badge_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
begin
  if tg_op = 'INSERT' then
    select * into v_student from public.students where id = new.student_id;
    if v_student.status <> 'active' or v_student.archived_at is not null then
      raise exception 'Impossible de générer un badge : l''apprenant n''est pas actif.' using errcode = 'check_violation';
    end if;
    new.number := app.generate_number(new.organization_id, 'student_badge', 'APP-{CODE}-{YY}-{SEQ:5}');
    loop
      new.token := app.random_code(32);
      exit when not exists (select 1 from public.staff_badges where token = new.token)
            and not exists (select 1 from public.student_badges where token = new.token);
    end loop;
    new.status := 'active';
    new.issued_at := now();
    new.issued_by := coalesce(auth.uid(), new.issued_by);
    new.printed_count := 0;
    new.revoked_at := null;
    new.revoked_by := null;
    new.revoked_reason := null;
    return new;
  end if;
  if old.status = 'revoked' then
    raise exception 'Un badge désactivé ne peut plus être modifié ni réactivé ; générez-en un nouveau.' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - array['status', 'revoked_at', 'revoked_by', 'revoked_reason', 'printed_count', 'last_printed_at'])
     is distinct from (to_jsonb(old) - array['status', 'revoked_at', 'revoked_by', 'revoked_reason', 'printed_count', 'last_printed_at']) then
    raise exception 'Un badge émis ne peut pas être modifié ; remplacez-le.' using errcode = 'check_violation';
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
create trigger student_badges_guard
  before insert or update on public.student_badges
  for each row execute function app.student_badge_guard();

-- Apprenant désactivé, retiré, diplômé ou archivé → badge actif désactivé.
create or replace function app.student_revoke_badges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status <> 'active' and old.status = 'active') or (new.archived_at is not null and old.archived_at is null) then
    update public.student_badges
       set status = 'revoked',
           revoked_reason = case when new.archived_at is not null then 'Dossier archivé' else 'Apprenant plus actif' end
     where student_id = new.id and status = 'active';
  end if;
  return new;
end;
$$;
create trigger students_revoke_badges
  after update of status, archived_at on public.students
  for each row execute function app.student_revoke_badges();

-- Génère (ou remplace) le badge d'un apprenant. SECURITY INVOKER : RLS students.badges.manage.
create or replace function public.issue_student_badge(p_student_id uuid, p_reason text default null)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_old uuid;
  v_badge uuid;
begin
  select organization_id into v_org from public.students where id = p_student_id;
  if v_org is null then
    raise exception 'Apprenant introuvable.' using errcode = 'no_data_found';
  end if;
  update public.student_badges
     set status = 'revoked', revoked_reason = coalesce(nullif(btrim(p_reason), ''), 'Badge remplacé')
   where student_id = p_student_id and status = 'active'
  returning id into v_old;
  insert into public.student_badges (organization_id, student_id, replaces_badge_id)
  values (v_org, p_student_id, v_old)
  returning id into v_badge;
  return v_badge;
end;
$$;
revoke execute on function public.issue_student_badge(uuid, text) from public, anon;
grant execute on function public.issue_student_badge(uuid, text) to authenticated;

-- Génération groupée (tous les apprenants d'une session sans badge actif).
create or replace function public.issue_session_badges(p_class_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_student uuid;
  v_count integer := 0;
begin
  for v_student in
    select distinct e.student_id
    from public.enrollments e
    join public.students s on s.id = e.student_id and s.status = 'active' and s.archived_at is null
    where e.class_id = p_class_id and e.status = 'validated'
      and not exists (select 1 from public.student_badges b where b.student_id = e.student_id and b.status = 'active')
  loop
    perform public.issue_student_badge(v_student, null);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.issue_session_badges(uuid) from public, anon;
grant execute on function public.issue_session_badges(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Journal des scans : partagé personnel / apprenants
-- -----------------------------------------------------------------------------
alter table public.badge_scans
  add column student_id uuid references public.students (id) on delete set null,
  add column student_badge_id uuid references public.student_badges (id) on delete set null;
alter table public.badge_scans drop constraint badge_scans_kind_check;
alter table public.badge_scans add constraint badge_scans_kind_check
  check (kind in ('arrival', 'departure', 'lesson', 'entry', 'exit'));
create index badge_scans_student_idx on public.badge_scans (student_id, scanned_at desc) where student_id is not null;

-- -----------------------------------------------------------------------------
-- Entrées / sorties des apprenants : une ligne par période de présence
-- (plusieurs par jour possibles, additionnées).
-- -----------------------------------------------------------------------------
create table public.learner_attendance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null,
  enrollment_id uuid not null,
  class_id uuid not null,
  group_id uuid,
  timetable_slot_id uuid,
  room_id uuid,
  attendance_date date not null,
  entered_at timestamptz not null,
  exited_at timestamptz,
  auto_closed boolean not null default false,
  expected_start time,
  minutes_late integer not null default 0 check (minutes_late >= 0),
  entry_scan_id uuid references public.badge_scans (id) on delete set null,
  exit_scan_id uuid references public.badge_scans (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, enrollment_id) references public.enrollments (organization_id, id) on delete cascade,
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete cascade,
  foreign key (organization_id, group_id) references public.training_groups (organization_id, id) on delete set null (group_id),
  foreign key (organization_id, timetable_slot_id) references public.timetable_slots (organization_id, id) on delete set null (timetable_slot_id),
  foreign key (organization_id, room_id) references public.rooms (organization_id, id) on delete set null (room_id),
  check (exited_at is null or exited_at >= entered_at)
);
create unique index learner_attendance_one_open on public.learner_attendance (student_id) where exited_at is null;
create index learner_attendance_org_date_idx on public.learner_attendance (organization_id, attendance_date desc);
create index learner_attendance_student_idx on public.learner_attendance (student_id, attendance_date desc);
create trigger learner_attendance_touch before update on public.learner_attendance for each row execute function app.touch_updated_at();

-- Minutes « HH h MM ».
create or replace function app.format_minutes(p_minutes integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_minutes, 0) < 60 then coalesce(p_minutes, 0) || ' min'
              else (p_minutes / 60) || ' h ' || lpad((p_minutes % 60)::text, 2, '0') end;
$$;

-- Cours d'un formateur aujourd'hui (en cours ou suivant) : affiché au scan.
create or replace function app.trainer_course_now(p_org uuid, p_staff uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with loc as (
    select (now() at time zone o.timezone) as local_ts from public.organizations o where o.id = p_org
  )
  select jsonb_build_object(
           'subject', coalesce(s.name, ts.label, 'Cours'),
           'session', c.name,
           'formation', p.name,
           'group', g.name,
           'room', r.name,
           'starts_at', to_char(ts.starts_at, 'HH24:MI'),
           'ends_at', to_char(ts.ends_at, 'HH24:MI'),
           'in_progress', loc.local_ts::time >= ts.starts_at)
  from public.timetable_slots ts
  join public.classes c on c.id = ts.class_id and c.archived_at is null
  left join public.programs p on p.id = c.program_id
  left join public.training_groups g on g.id = ts.group_id
  left join public.class_subjects cs on cs.id = ts.class_subject_id
  left join public.subjects s on s.id = cs.subject_id
  left join public.rooms r on r.id = ts.room_id
  cross join loc
  where ts.organization_id = p_org
    and ts.teacher_id = p_staff
    and ts.weekday = extract(isodow from loc.local_ts)
    and ts.ends_at > loc.local_ts::time
    and (c.starts_on is null or c.starts_on <= loc.local_ts::date)
    and (c.ends_on is null or c.ends_on >= loc.local_ts::date)
  order by ts.starts_at
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- SCAN UNIFIÉ (tablette « SCANNER VOTRE BADGE ») : détecte automatiquement
-- FORMATEUR / PERSONNEL ou APPRENANT à partir du jeton du QR.
--   * personnel / formateur (ou code inconnu) → scan_staff_badge, inchangé,
--     enrichi du cours du formateur ;
--   * apprenant → contrôles : établissement, badge actif, apprenant actif,
--     inscription validée dans une session en cours, anti double-scan,
--     cours prévu (session / groupe / créneau), salle du poste ; puis ENTRÉE
--     (retard calculé) ou SORTIE (durée de présence).
-- p_room_id : salle de la tablette (facultatif) ; si le cours a lieu ailleurs,
-- l'entrée est refusée.
-- -----------------------------------------------------------------------------
create or replace function public.scan_badge(p_organization_id uuid, p_code text, p_device text default null, p_room_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_badge public.student_badges;
  v_result jsonb;
  v_staff public.staff_members;
  v_course jsonb;
  v_org public.organizations;
  v_cfg jsonb;
  v_local timestamp;
  v_today date;
  v_time time;
  v_tolerance integer;
  v_open_before interval;
  v_dup_window integer;
  v_student public.students;
  v_enr record;
  v_slot record;
  v_next record;
  v_open public.learner_attendance;
  v_row public.learner_attendance;
  v_reason text;
  v_message text;
  v_kind text;
  v_late integer := 0;
  v_period integer;
  v_day integer;
  v_scan uuid;
  v_person jsonb;
begin
  if auth.uid() is null or not app.has_permission(p_organization_id, 'staff_attendance.scan') then
    raise exception 'Cette tablette n''est pas autorisée à pointer pour cet établissement.' using errcode = 'insufficient_privilege';
  end if;
  v_token := substring(upper(btrim(coalesce(p_code, ''))) from '([A-HJ-NP-Z2-9]{32})$');
  if v_token is not null then
    select * into v_badge from public.student_badges where token = v_token;
  end if;

  -- Personnel / formateur (ou code inconnu) : pointage existant.
  if v_badge.id is null then
    v_result := public.scan_staff_badge(p_organization_id, p_code, p_device);
    if v_token is not null then
      select s.* into v_staff
      from public.staff_badges b join public.staff_members s on s.id = b.staff_id
      where b.token = v_token and b.organization_id = p_organization_id;
    end if;
    if v_staff.id is not null then
      v_course := app.trainer_course_now(p_organization_id, v_staff.id);
      v_result := v_result || jsonb_build_object(
        'profile', case when v_staff.is_teacher then 'trainer' else 'staff' end,
        'greeting', 'Bonjour ' || v_staff.first_name,
        'course', v_course);
    end if;
    return v_result;
  end if;

  -- Apprenant.
  select * into v_org from public.organizations where id = p_organization_id;
  v_local := now() at time zone v_org.timezone;
  v_today := v_local::date;
  v_time := v_local::time;
  v_cfg := coalesce(app.org_training(p_organization_id), app.default_training_settings());
  v_tolerance := coalesce((v_cfg ->> 'late_tolerance_minutes')::integer, 5);
  v_open_before := make_interval(mins => coalesce((v_cfg ->> 'open_before_minutes')::integer, 30));
  v_dup_window := coalesce((v_org.settings #>> '{staff_attendance,duplicate_window_seconds}')::integer, 60);

  if v_badge.organization_id <> p_organization_id then
    v_reason := 'other_organization';
    v_message := 'Ce badge appartient à un autre établissement.';
    v_badge := null; -- aucune information sur l'autre établissement n'est conservée
  else
    select * into v_student from public.students where id = v_badge.student_id;
    if v_badge.status <> 'active' then
      v_reason := 'revoked_badge';
      v_message := 'Ce badge a été désactivé (perdu ou remplacé). Adressez-vous à l''administration.';
    elsif v_student.status <> 'active' or v_student.archived_at is not null then
      v_reason := 'inactive_learner';
      v_message := 'Cet apprenant n''est pas actif.';
    else
      select e.id, e.class_id, e.group_id, c.name as session_name, c.room_id as session_room, p.name as formation_name,
             g.name as group_name
        into v_enr
      from public.enrollments e
      join public.classes c on c.id = e.class_id and c.kind = 'training_session' and c.archived_at is null
      left join public.programs p on p.id = c.program_id
      left join public.training_groups g on g.id = e.group_id
      where e.student_id = v_student.id and e.organization_id = p_organization_id and e.status = 'validated'
        and (c.starts_on is null or c.starts_on <= v_today)
        and (c.ends_on is null or c.ends_on >= v_today)
      order by c.starts_on desc nulls last
      limit 1;
      if v_enr.id is null then
        v_reason := 'no_active_session';
        v_message := 'Aucune session de formation en cours pour cet apprenant.';
      elsif exists (
        select 1 from public.badge_scans
        where student_id = v_student.id and result = 'accepted'
          and scanned_at > now() - make_interval(secs => v_dup_window)
      ) then
        v_reason := 'duplicate';
        v_message := 'Badge déjà scanné à l''instant.';
      end if;
    end if;
  end if;

  if v_student.id is not null then
    v_person := jsonb_build_object('name', v_student.first_name || ' ' || v_student.last_name,
                                   'first_name', v_student.first_name, 'matricule', v_student.matricule,
                                   'photo_file_id', v_student.photo_path);
  end if;

  if v_reason is null then
    -- Périodes restées ouvertes les jours précédents : clôturées à la fin du cours.
    update public.learner_attendance la
       set exited_at = greatest(la.entered_at,
                                coalesce((la.attendance_date + ts.ends_at) at time zone v_org.timezone, la.entered_at)),
           auto_closed = true
      from public.learner_attendance la2
      left join public.timetable_slots ts on ts.id = la2.timetable_slot_id
     where la.id = la2.id and la.student_id = v_student.id and la.exited_at is null and la.attendance_date < v_today;

    select * into v_open from public.learner_attendance where student_id = v_student.id and exited_at is null;

    if v_open.id is null then
      -- ENTRÉE : cours de la session (ou du groupe) dans la fenêtre horaire.
      select ts.id, ts.starts_at, ts.ends_at, ts.room_id, coalesce(s.name, ts.label, 'Cours') as subject, r.name as room,
             st.first_name || ' ' || st.last_name as teacher
        into v_slot
      from public.timetable_slots ts
      left join public.class_subjects cs on cs.id = ts.class_subject_id
      left join public.subjects s on s.id = cs.subject_id
      left join public.rooms r on r.id = ts.room_id
      left join public.staff_members st on st.id = ts.teacher_id
      where ts.class_id = v_enr.class_id
        and (ts.group_id is null or ts.group_id is not distinct from v_enr.group_id)
        and ts.weekday = extract(isodow from v_today)
        and v_time >= ts.starts_at - v_open_before
        and v_time < ts.ends_at
      order by ts.starts_at
      limit 1;
      if v_slot.id is null and not coalesce((v_cfg ->> 'entry_without_course')::boolean, false) then
        select coalesce(s.name, ts.label, 'Cours') as subject, ts.starts_at into v_next
        from public.timetable_slots ts
        left join public.class_subjects cs on cs.id = ts.class_subject_id
        left join public.subjects s on s.id = cs.subject_id
        where ts.class_id = v_enr.class_id
          and (ts.group_id is null or ts.group_id is not distinct from v_enr.group_id)
          and ts.weekday = extract(isodow from v_today) and ts.starts_at > v_time
        order by ts.starts_at limit 1;
        v_reason := 'no_course';
        v_message := 'Aucun cours prévu pour vous en ce moment.'
          || case when v_next.starts_at is not null
                  then ' Prochain cours : ' || v_next.subject || ' à ' || to_char(v_next.starts_at, 'HH24:MI') || '.' else '' end;
      elsif v_slot.id is not null and p_room_id is not null and v_slot.room_id is not null and v_slot.room_id <> p_room_id then
        v_reason := 'wrong_room';
        v_message := 'Votre cours « ' || v_slot.subject || ' » a lieu en salle ' || coalesce(v_slot.room, '?') || '.';
      else
        v_kind := 'entry';
        -- Retard : uniquement à la première entrée du cours (une ré-entrée n'est pas un retard).
        if v_slot.id is not null and v_time > v_slot.starts_at + make_interval(mins => v_tolerance)
           and not exists (select 1 from public.learner_attendance
                           where student_id = v_student.id and attendance_date = v_today and timetable_slot_id = v_slot.id) then
          v_late := floor(extract(epoch from (v_time - v_slot.starts_at)) / 60)::integer;
        end if;
      end if;
    else
      v_kind := 'exit';
    end if;
  end if;

  if v_reason is not null then
    insert into public.badge_scans (organization_id, student_id, student_badge_id, result, reason, message, device)
    values (p_organization_id, v_student.id, v_badge.id, 'rejected', v_reason, v_message, left(p_device, 120))
    returning id into v_scan;
    perform app.audit(p_organization_id, 'learner_attendance.scan', 'badge_scans', v_scan, v_message,
                      jsonb_build_object('reason', v_reason, 'student_id', v_student.id), 'denied');
    return jsonb_build_object('result', 'rejected', 'reason', v_reason, 'message', v_message, 'profile', 'learner',
                              'learner', v_person, 'at', to_char(v_local, 'HH24:MI'));
  end if;

  if v_kind = 'entry' then
    v_message := 'Entrée enregistrée — ' || case when v_late > 0 then 'EN RETARD — ' || v_late || ' MINUTE' || case when v_late > 1 then 'S' else '' end
                                                  when v_slot.id is null then 'hors cours' else 'À L''HEURE' end || '.';
    insert into public.badge_scans (organization_id, student_id, student_badge_id, result, kind, reason, message, device)
    values (p_organization_id, v_student.id, v_badge.id, 'accepted', 'entry', 'ok', v_message, left(p_device, 120))
    returning id into v_scan;
    insert into public.learner_attendance (organization_id, student_id, enrollment_id, class_id, group_id, timetable_slot_id, room_id,
                                           attendance_date, entered_at, expected_start, minutes_late, entry_scan_id)
    values (p_organization_id, v_student.id, v_enr.id, v_enr.class_id, v_enr.group_id, v_slot.id, coalesce(v_slot.room_id, p_room_id),
            v_today, now(), v_slot.starts_at, v_late, v_scan)
    returning * into v_row;
  else
    insert into public.badge_scans (organization_id, student_id, student_badge_id, result, kind, reason, message, device)
    values (p_organization_id, v_student.id, v_badge.id, 'accepted', 'exit', 'ok', 'Sortie', left(p_device, 120))
    returning id into v_scan;
    update public.learner_attendance set exited_at = now(), exit_scan_id = v_scan where id = v_open.id returning * into v_row;
    v_period := floor(extract(epoch from (v_row.exited_at - v_row.entered_at)) / 60)::integer;
    select coalesce(sum(floor(extract(epoch from (coalesce(exited_at, now()) - entered_at)) / 60)), 0)::integer into v_day
    from public.learner_attendance where student_id = v_student.id and attendance_date = v_today;
    v_message := 'Sortie enregistrée. Présence : ' || app.format_minutes(v_period)
                 || case when v_day > v_period then ' (aujourd''hui : ' || app.format_minutes(v_day) || ')' else '' end || '.';
    update public.badge_scans set message = v_message where id = v_scan;
    select coalesce(s.name, ts.label, 'Cours') as subject, ts.starts_at, ts.ends_at, r.name as room,
           st.first_name || ' ' || st.last_name as teacher
      into v_slot
    from public.timetable_slots ts
    left join public.class_subjects cs on cs.id = ts.class_subject_id
    left join public.subjects s on s.id = cs.subject_id
    left join public.rooms r on r.id = ts.room_id
    left join public.staff_members st on st.id = ts.teacher_id
    where ts.id = v_row.timetable_slot_id;
  end if;

  perform app.audit(p_organization_id, 'learner_attendance.scan', 'learner_attendance', v_row.id,
                    v_student.first_name || ' ' || v_student.last_name || ' — ' || v_message,
                    jsonb_build_object('kind', v_kind, 'student_id', v_student.id, 'minutes_late', v_late), 'success');

  return jsonb_build_object(
    'result', 'accepted',
    'kind', v_kind,
    'profile', 'learner',
    'message', v_message,
    'at', to_char(v_local, 'HH24:MI'),
    'status', case when v_kind = 'entry' then case when v_late > 0 then 'late' else 'on_time' end end,
    'minutes_late', case when v_kind = 'entry' then v_late end,
    'period_minutes', v_period,
    'day_minutes', v_day,
    'learner', v_person,
    'formation', v_enr.formation_name,
    'session', v_enr.session_name,
    'group', v_enr.group_name,
    'course', case when v_slot.subject is not null then jsonb_build_object(
      'subject', v_slot.subject, 'room', v_slot.room, 'teacher', v_slot.teacher,
      'starts_at', to_char(v_slot.starts_at, 'HH24:MI'), 'ends_at', to_char(v_slot.ends_at, 'HH24:MI')) end
  );
end;
$$;
revoke execute on function public.scan_badge(uuid, text, text, uuid) from public, anon;
grant execute on function public.scan_badge(uuid, text, text, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Occurrences de cours des apprenants (base de l'assiduité et des statistiques).
-- Un cours est « suivi » si une période de présence le chevauche : un apprenant
-- entré le matin et resté l'après-midi suit tous ses cours sans rescanner.
-- Réservée aux fonctions SECURITY DEFINER qui contrôlent les droits.
-- -----------------------------------------------------------------------------
create or replace function app.learner_occurrences(p_org uuid, p_from date, p_to date, p_student uuid default null, p_started_only boolean default true)
returns table (
  student_id uuid, enrollment_id uuid, program_id uuid, class_id uuid, group_id uuid, slot_id uuid,
  teacher_id uuid, occ_date date, starts_at time, ends_at time, subject text, attended boolean, minutes_late integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with org as (
    select o.timezone, (now() at time zone o.timezone) as local_now from public.organizations o where o.id = p_org
  ),
  e as (
    select en.id, en.student_id, en.class_id, en.group_id, c.program_id, c.starts_on, c.ends_on
    from public.enrollments en
    join public.classes c on c.id = en.class_id and c.kind = 'training_session' and c.archived_at is null
    join public.students s on s.id = en.student_id and s.archived_at is null
    where en.organization_id = p_org and en.status = 'validated' and (p_student is null or en.student_id = p_student)
  ),
  occ as (
    select e.student_id, e.id as enrollment_id, e.program_id, e.class_id, e.group_id, ts.id as slot_id, ts.teacher_id,
           d::date as occ_date, ts.starts_at, ts.ends_at, ts.class_subject_id, ts.label
    from e
    join public.timetable_slots ts on ts.class_id = e.class_id and (ts.group_id is null or ts.group_id is not distinct from e.group_id)
    cross join lateral generate_series(greatest(p_from, coalesce(e.starts_on, p_from)), least(p_to, coalesce(e.ends_on, p_to)), interval '1 day') d
    cross join org
    where extract(isodow from d) = ts.weekday
      and (not p_started_only
           or d::date < org.local_now::date
           or (d::date = org.local_now::date and ts.starts_at <= org.local_now::time))
  )
  select o.student_id, o.enrollment_id, o.program_id, o.class_id, o.group_id, o.slot_id, o.teacher_id, o.occ_date, o.starts_at, o.ends_at,
         coalesce(s.name, o.label, 'Cours') as subject,
         exists (
           select 1 from public.learner_attendance la, org
           where la.student_id = o.student_id and la.attendance_date = o.occ_date
             and (la.entered_at at time zone org.timezone) < o.occ_date + o.ends_at
             and coalesce(la.exited_at at time zone org.timezone,
                          case when o.occ_date = org.local_now::date then org.local_now else la.entered_at at time zone org.timezone end)
                 >= o.occ_date + o.starts_at
         ) as attended,
         coalesce((select max(la.minutes_late) from public.learner_attendance la
                   where la.student_id = o.student_id and la.attendance_date = o.occ_date and la.timetable_slot_id = o.slot_id), 0) as minutes_late
  from occ o
  left join public.class_subjects cs on cs.id = o.class_subject_id
  left join public.subjects s on s.id = cs.subject_id;
$$;
revoke execute on function app.learner_occurrences(uuid, date, date, uuid, boolean) from public, anon, authenticated;

-- Assiduité d'un apprenant (onglet « ASSIDUITÉ » du dossier, portail).
create or replace function public.learner_attendance_summary(p_student_id uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_tz text;
  v_today date;
  v_from date;
  v_to date;
  v_result jsonb;
begin
  select * into v_student from public.students where id = p_student_id;
  if v_student.id is null or not (
    app.has_permission(v_student.organization_id, 'students.read')
    or app.has_permission(v_student.organization_id, 'attendance.read')
    or v_student.id = any (app.my_portal_student_ids())
    or exists (select 1 from public.enrollments e where e.student_id = v_student.id and e.status = 'validated'
               and e.class_id = any (app.my_taught_class_ids()))
  ) then
    raise exception 'Accès refusé à l''assiduité de cet apprenant.' using errcode = 'insufficient_privilege';
  end if;
  select timezone into v_tz from public.organizations where id = v_student.organization_id;
  v_today := (now() at time zone v_tz)::date;
  v_to := coalesce(p_to, v_today);
  v_from := coalesce(p_from, (select min(c.starts_on) from public.enrollments e join public.classes c on c.id = e.class_id
                               where e.student_id = v_student.id and e.status = 'validated' and c.kind = 'training_session'),
                     v_to - 90);

  with occ as (
    select * from app.learner_occurrences(v_student.organization_id, v_from, v_to, v_student.id, true)
  ),
  periods as (
    select la.*, floor(extract(epoch from (coalesce(la.exited_at, case when la.attendance_date = v_today then now() else la.entered_at end) - la.entered_at)) / 60)::integer as minutes
    from public.learner_attendance la
    where la.student_id = v_student.id and la.attendance_date between v_from and v_to
  )
  select jsonb_build_object(
    'from', v_from,
    'to', v_to,
    'expected', (select count(*) from occ),
    'attended', (select count(*) from occ where attended),
    'absences', (select count(*) from occ where not attended),
    'lates', (select count(*) from periods where minutes_late > 0),
    'late_minutes', (select coalesce(sum(minutes_late), 0) from periods),
    'days_present', (select count(distinct attendance_date) from periods),
    'total_minutes', (select coalesce(sum(minutes), 0) from periods),
    'rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where attended) / count(*), 1) end from occ),
    'courses', coalesce((select jsonb_agg(x order by x ->> 'subject') from (
        select jsonb_build_object('subject', subject, 'expected', count(*), 'attended', count(*) filter (where attended),
                                  'lates', count(*) filter (where minutes_late > 0)) as x
        from occ group by subject) t), '[]'::jsonb),
    'absences_list', coalesce((select jsonb_agg(jsonb_build_object('date', occ_date, 'subject', subject,
                                  'starts_at', to_char(starts_at, 'HH24:MI'), 'ends_at', to_char(ends_at, 'HH24:MI'))
                                  order by occ_date desc, starts_at desc)
                               from (select * from occ where not attended order by occ_date desc, starts_at desc limit 60) a), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
                  'date', p.attendance_date,
                  'entered_at', to_char(p.entered_at at time zone v_tz, 'HH24:MI'),
                  'exited_at', to_char(p.exited_at at time zone v_tz, 'HH24:MI'),
                  'minutes', p.minutes, 'minutes_late', p.minutes_late, 'auto_closed', p.auto_closed,
                  'course', coalesce(s.name, ts.label), 'room', r.name)
                  order by p.entered_at desc)
               from (select * from periods order by entered_at desc limit 120) p
               left join public.timetable_slots ts on ts.id = p.timetable_slot_id
               left join public.class_subjects cs on cs.id = ts.class_subject_id
               left join public.subjects s on s.id = cs.subject_id
               left join public.rooms r on r.id = p.room_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.learner_attendance_summary(uuid, date, date) from public, anon;
grant execute on function public.learner_attendance_summary(uuid, date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Compétences : définies par formation, évaluées par inscription
-- -----------------------------------------------------------------------------
create table public.training_competencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  program_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 160),
  description text check (description is null or length(description) <= 1000),
  sequence integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, name),
  unique (organization_id, id),
  foreign key (organization_id, program_id) references public.programs (organization_id, id) on delete cascade
);
create trigger training_competencies_touch before update on public.training_competencies for each row execute function app.touch_updated_at();

create table public.learner_competencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  enrollment_id uuid not null,
  student_id uuid not null,
  competency_id uuid not null,
  level text not null check (level in ('not_acquired', 'in_progress', 'acquired', 'mastered')),
  comment text check (comment is null or length(comment) <= 500),
  evaluated_on date not null default current_date,
  evaluated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, competency_id),
  unique (organization_id, id),
  foreign key (organization_id, enrollment_id) references public.enrollments (organization_id, id) on delete cascade,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, competency_id) references public.training_competencies (organization_id, id) on delete cascade
);
create index learner_competencies_student_idx on public.learner_competencies (student_id);
create trigger learner_competencies_touch before update on public.learner_competencies for each row execute function app.touch_updated_at();

create or replace function app.learner_competency_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select e.student_id into new.student_id from public.enrollments e where e.id = new.enrollment_id;
  if not exists (
    select 1 from public.enrollments e
    join public.classes c on c.id = e.class_id
    join public.training_competencies tc on tc.id = new.competency_id and tc.program_id = c.program_id
    where e.id = new.enrollment_id
  ) then
    raise exception 'Cette compétence n''appartient pas à la formation de l''apprenant.' using errcode = 'check_violation';
  end if;
  new.evaluated_by := coalesce(auth.uid(), new.evaluated_by);
  return new;
end;
$$;
create trigger learner_competencies_guard
  before insert or update on public.learner_competencies
  for each row execute function app.learner_competency_guard();

-- -----------------------------------------------------------------------------
-- Stages
-- -----------------------------------------------------------------------------
create table public.internships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null,
  enrollment_id uuid,
  company_name text not null check (length(btrim(company_name)) between 2 and 160),
  company_address text check (company_address is null or length(company_address) <= 300),
  company_phone text check (company_phone is null or length(company_phone) <= 40),
  company_email text check (company_email is null or length(company_email) <= 160),
  tutor_name text check (tutor_name is null or length(tutor_name) <= 120),
  tutor_title text check (tutor_title is null or length(tutor_title) <= 120),
  tutor_phone text check (tutor_phone is null or length(tutor_phone) <= 40),
  tutor_email text check (tutor_email is null or length(tutor_email) <= 160),
  missions text check (missions is null or length(missions) <= 2000),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planned' check (status in ('planned', 'ongoing', 'completed', 'cancelled')),
  evaluation_score numeric(5, 2) check (evaluation_score is null or evaluation_score between 0 and 20),
  evaluation_comment text check (evaluation_comment is null or length(evaluation_comment) <= 2000),
  evaluated_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, enrollment_id) references public.enrollments (organization_id, id) on delete set null (enrollment_id),
  check (ends_on >= starts_on)
);
create index internships_student_idx on public.internships (student_id, starts_on desc);
create trigger internships_touch before update on public.internships for each row execute function app.touch_updated_at();

create or replace function app.internship_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.evaluation_score is distinct from (case when tg_op = 'UPDATE' then old.evaluation_score end)
     or new.evaluation_comment is distinct from (case when tg_op = 'UPDATE' then old.evaluation_comment end) then
    new.evaluated_at := case when new.evaluation_score is null and new.evaluation_comment is null then null else now() end;
  end if;
  return new;
end;
$$;
create trigger internships_guard before insert or update on public.internships for each row execute function app.internship_guard();

-- -----------------------------------------------------------------------------
-- Inscription d'un apprenant : apprenant → formation → session → groupe →
-- tarif → échéancier → paiement. Réutilise create_enrollment_application,
-- validate_enrollment, invoices / installments / payments. SECURITY INVOKER :
-- chaque étape est soumise aux permissions (inscriptions, factures, paiements).
-- p_payload : { student_id | student{…}, guardian{…}, session_id, group_id,
--   plan: 'full' | 'installments', installments, first_due_on,
--   discount, discount_reason, payment{amount, method, reference, payer_name} }
-- -----------------------------------------------------------------------------
create or replace function app.training_fee_type(p_org uuid, p_category text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code text := case p_category when 'registration' then 'INSCR-FP' else 'FORMATION' end;
begin
  select id into v_id from public.fee_types where organization_id = p_org and code = v_code;
  if v_id is null then
    insert into public.fee_types (organization_id, name, code, category)
    values (p_org, case p_category when 'registration' then 'Frais d''inscription (formation)' else 'Frais de formation' end, v_code, p_category)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.fee_types where organization_id = p_org and code = v_code;
    end if;
  end if;
  return v_id;
end;
$$;
revoke execute on function app.training_fee_type(uuid, text) from public, anon;
grant execute on function app.training_fee_type(uuid, text) to authenticated;

create or replace function public.enroll_learner(p_organization_id uuid, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_session public.classes;
  v_program public.programs;
  v_group uuid := nullif(p_payload ->> 'group_id', '')::uuid;
  v_enrollment uuid;
  v_student uuid;
  v_invoice uuid;
  v_tuition numeric;
  v_registration numeric;
  v_discount numeric := coalesce(nullif(p_payload ->> 'discount', '')::numeric, 0);
  v_total numeric;
  v_n integer;
  v_first date;
  v_amount numeric;
  v_allocated numeric := 0;
  v_payment uuid;
  v_pay_amount numeric := coalesce(nullif(p_payload #>> '{payment,amount}', '')::numeric, 0);
  v_tz text;
  v_today date;
  v_balance numeric;
begin
  if not app.is_training_org_type((select type from public.organizations where id = p_organization_id)) then
    raise exception 'Inscription réservée aux centres de formation.' using errcode = 'check_violation';
  end if;
  select timezone into v_tz from public.organizations where id = p_organization_id;
  v_today := (now() at time zone v_tz)::date;
  select * into v_session from public.classes
   where id = nullif(p_payload ->> 'session_id', '')::uuid and organization_id = p_organization_id and kind = 'training_session';
  if v_session.id is null or v_session.archived_at is not null then
    raise exception 'Choisissez une session de formation ouverte.' using errcode = 'check_violation';
  end if;
  if v_session.ends_on is not null and v_session.ends_on < v_today then
    raise exception 'Cette session est terminée.' using errcode = 'check_violation';
  end if;
  select * into v_program from public.programs where id = v_session.program_id;
  if not v_program.is_active then
    raise exception 'Cette formation est désactivée.' using errcode = 'check_violation';
  end if;
  if v_discount < 0 then
    raise exception 'Remise invalide.' using errcode = 'check_violation';
  end if;

  v_enrollment := public.create_enrollment_application(p_organization_id, jsonb_build_object(
    'student_id', p_payload ->> 'student_id',
    'student', p_payload -> 'student',
    'guardian', p_payload -> 'guardian',
    'academic_year_id', v_session.academic_year_id,
    'class_id', v_session.id,
    'type', 'new',
    'submit', true,
    'notes', p_payload ->> 'notes'));
  if v_group is not null then
    update public.enrollments set group_id = v_group where id = v_enrollment;
  end if;
  select student_id into v_student from public.enrollments where id = v_enrollment;
  if nullif(btrim(p_payload #>> '{student,education_level}'), '') is not null then
    update public.students set education_level = btrim(p_payload #>> '{student,education_level}') where id = v_student;
  end if;
  perform public.validate_enrollment(v_enrollment, false);

  v_tuition := coalesce(v_session.tuition_amount, v_program.tuition_amount, 0);
  v_registration := coalesce(v_program.registration_fee, 0);
  if v_discount > v_tuition then
    raise exception 'La remise dépasse le coût de la formation.' using errcode = 'check_violation';
  end if;
  v_total := v_tuition + v_registration - v_discount;

  if v_tuition + v_registration > 0 then
    insert into public.invoices (organization_id, student_id, enrollment_id, academic_year_id, status)
    values (p_organization_id, v_student, v_enrollment, v_session.academic_year_id, 'draft')
    returning id into v_invoice;
    if v_registration > 0 then
      insert into public.invoice_lines (organization_id, invoice_id, fee_type_id, description, unit_amount, sort_order)
      values (p_organization_id, v_invoice, app.training_fee_type(p_organization_id, 'registration'),
              'Frais d''inscription — ' || v_program.name, v_registration, 1);
    end if;
    if v_tuition > 0 then
      insert into public.invoice_lines (organization_id, invoice_id, fee_type_id, description, unit_amount, discount_amount, discount_reason, sort_order)
      values (p_organization_id, v_invoice, app.training_fee_type(p_organization_id, 'training'),
              'Formation « ' || v_program.name || ' » — ' || v_session.name, v_tuition, v_discount,
              case when v_discount > 0 then coalesce(nullif(btrim(p_payload ->> 'discount_reason'), ''), 'Remise') end, 2);
    end if;
    v_n := case when coalesce(p_payload ->> 'plan', 'full') = 'installments'
                then greatest(1, least(24, coalesce(nullif(p_payload ->> 'installments', '')::integer, v_program.default_installments, 3)))
                else 1 end;
    v_first := coalesce(nullif(p_payload ->> 'first_due_on', '')::date, greatest(coalesce(v_session.starts_on, v_today), v_today));
    for i in 1..v_n loop
      v_amount := case when i = v_n then v_total - v_allocated else floor(v_total / v_n) end;
      v_allocated := v_allocated + v_amount;
      insert into public.installments (organization_id, invoice_id, label, due_on, amount, sequence)
      values (p_organization_id, v_invoice, case when v_n = 1 then 'Paiement intégral' else 'Échéance ' || i || '/' || v_n end,
              (v_first + make_interval(months => i - 1))::date, v_amount, i);
    end loop;
    update public.invoices set status = 'issued', due_on = (v_first + make_interval(months => v_n - 1))::date where id = v_invoice;

    if v_pay_amount > 0 then
      insert into public.payments (organization_id, invoice_id, student_id, amount, method, reference, payer_name)
      values (p_organization_id, v_invoice, v_student, v_pay_amount,
              coalesce(nullif(p_payload #>> '{payment,method}', ''), 'cash')::public.payment_method,
              nullif(btrim(p_payload #>> '{payment,reference}'), ''), nullif(btrim(p_payload #>> '{payment,payer_name}'), ''))
      returning id, balance_after into v_payment, v_balance;
    end if;
  end if;

  perform app.audit(p_organization_id, 'training.enrollment', 'enrollments', v_enrollment,
                    'Inscription en formation « ' || v_program.name || ' » — session ' || v_session.name,
                    jsonb_build_object('total', v_total, 'installments', v_n, 'first_payment', v_pay_amount));
  return jsonb_build_object('enrollment_id', v_enrollment, 'student_id', v_student, 'invoice_id', v_invoice,
                            'payment_id', v_payment, 'total', v_total, 'paid', v_pay_amount,
                            'balance', coalesce(v_balance, v_total));
end;
$$;
revoke execute on function public.enroll_learner(uuid, jsonb) from public, anon;
grant execute on function public.enroll_learner(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Tableau de bord du jour et statistiques du centre
-- -----------------------------------------------------------------------------
create or replace function public.training_dashboard(p_organization_id uuid, p_date date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_now timestamp;
  v_date date;
  v_result jsonb;
begin
  if not (app.has_permission(p_organization_id, 'attendance.read') or app.has_permission(p_organization_id, 'reports.read')
          or app.has_permission(p_organization_id, 'staff_attendance.read')) then
    raise exception 'Permission requise : attendance.read ou reports.read' using errcode = 'insufficient_privilege';
  end if;
  select timezone into v_tz from public.organizations where id = p_organization_id;
  v_now := now() at time zone v_tz;
  v_date := coalesce(p_date, v_now::date);

  with occ_all as (select * from app.learner_occurrences(p_organization_id, v_date, v_date, null, false)),
  occ_started as (select * from occ_all where v_date < v_now::date or starts_at <= v_now::time),
  pres as (select * from public.learner_attendance where organization_id = p_organization_id and attendance_date = v_date),
  expected as (select distinct student_id, program_id, class_id, group_id from occ_all),
  started as (select distinct student_id from occ_started),
  present as (select distinct student_id from pres),
  late as (select distinct student_id from pres where minutes_late > 0),
  tslots as (
    select distinct ts.teacher_id, min(ts.starts_at) over (partition by ts.teacher_id) as first_start
    from public.timetable_slots ts
    join public.classes c on c.id = ts.class_id and c.kind = 'training_session' and c.archived_at is null
    where ts.organization_id = p_organization_id and ts.teacher_id is not null
      and ts.weekday = extract(isodow from v_date)
      and (c.starts_on is null or c.starts_on <= v_date) and (c.ends_on is null or c.ends_on >= v_date)
  ),
  sa as (select * from public.staff_attendance where organization_id = p_organization_id and work_date = v_date)
  select jsonb_build_object(
    'date', v_date,
    'learners', jsonb_build_object(
      'expected', (select count(distinct student_id) from expected),
      'present', (select count(*) from present),
      'absent', (select count(*) from started s where not exists (select 1 from present p where p.student_id = s.student_id)),
      'late', (select count(*) from late),
      'exits', (select count(*) from pres where exited_at is not null and not auto_closed),
      'on_site', (select count(*) from pres where exited_at is null)),
    'trainers', jsonb_build_object(
      'expected', (select count(distinct teacher_id) from tslots),
      'present', (select count(*) from tslots t where exists (select 1 from sa where sa.staff_id = t.teacher_id)),
      'absent', (select count(*) from tslots t where (v_date < v_now::date or t.first_start <= v_now::time)
                   and not exists (select 1 from sa where sa.staff_id = t.teacher_id)),
      'late', (select count(*) from tslots t join sa on sa.staff_id = t.teacher_id where sa.minutes_late > 0),
      'list', coalesce((select jsonb_agg(jsonb_build_object(
                 'name', st.first_name || ' ' || st.last_name,
                 'first_start', to_char(t.first_start, 'HH24:MI'),
                 'arrived_at', to_char(sa.arrived_at at time zone v_tz, 'HH24:MI'),
                 'minutes_late', sa.minutes_late) order by t.first_start, st.last_name)
               from tslots t join public.staff_members st on st.id = t.teacher_id
               left join sa on sa.staff_id = t.teacher_id), '[]'::jsonb)),
    'by_formation', coalesce((select jsonb_agg(x order by x ->> 'name') from (
        select jsonb_build_object('name', p.name,
          'expected', count(distinct e.student_id),
          'present', count(distinct e.student_id) filter (where exists (select 1 from present pr where pr.student_id = e.student_id)),
          'late', count(distinct e.student_id) filter (where exists (select 1 from late l where l.student_id = e.student_id))) as x
        from expected e join public.programs p on p.id = e.program_id group by p.name) t), '[]'::jsonb),
    'by_session', coalesce((select jsonb_agg(x order by x ->> 'name') from (
        select jsonb_build_object('name', c.name || coalesce(' — ' || g.name, ''),
          'expected', count(distinct e.student_id),
          'present', count(distinct e.student_id) filter (where exists (select 1 from present pr where pr.student_id = e.student_id)),
          'late', count(distinct e.student_id) filter (where exists (select 1 from late l where l.student_id = e.student_id))) as x
        from expected e join public.classes c on c.id = e.class_id left join public.training_groups g on g.id = e.group_id
        group by c.name, g.name) t), '[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object(
                 'name', s.first_name || ' ' || s.last_name, 'matricule', s.matricule,
                 'entered_at', to_char(r.entered_at at time zone v_tz, 'HH24:MI'),
                 'exited_at', to_char(r.exited_at at time zone v_tz, 'HH24:MI'),
                 'minutes_late', r.minutes_late) order by greatest(r.entered_at, coalesce(r.exited_at, r.entered_at)) desc)
               from (select * from pres order by greatest(entered_at, coalesce(exited_at, entered_at)) desc limit 12) r
               join public.students s on s.id = r.student_id), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.training_dashboard(uuid, date) from public, anon;
grant execute on function public.training_dashboard(uuid, date) to authenticated;

create or replace function public.training_statistics(p_organization_id uuid, p_from date default null, p_to date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_today date;
  v_from date;
  v_to date;
  v_result jsonb;
  v_finance boolean;
begin
  if not (app.has_permission(p_organization_id, 'reports.read') or app.has_permission(p_organization_id, 'attendance.read')) then
    raise exception 'Permission requise : reports.read' using errcode = 'insufficient_privilege';
  end if;
  v_finance := app.has_permission(p_organization_id, 'finance.read') or app.has_permission(p_organization_id, 'reports.finance');
  select timezone into v_tz from public.organizations where id = p_organization_id;
  v_today := (now() at time zone v_tz)::date;
  v_to := coalesce(p_to, v_today);
  v_from := coalesce(p_from, v_to - 29);

  with occ as (select * from app.learner_occurrences(p_organization_id, v_from, v_to, null, true)),
  tenr as (
    select e.*, c.ends_on, c.starts_on
    from public.enrollments e join public.classes c on c.id = e.class_id and c.kind = 'training_session'
    where e.organization_id = p_organization_id and e.status = 'validated'
  ),
  tinv as (
    select i.id, i.total, coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id and p.status = 'completed'), 0) as paid
    from public.invoices i join tenr on tenr.id = i.enrollment_id
    where i.status = 'issued'
  )
  select jsonb_build_object(
    'from', v_from, 'to', v_to,
    'learners', (select count(distinct student_id) from tenr),
    'active_learners', (select count(distinct student_id) from tenr where ends_on is null or ends_on >= v_today),
    'formations', (select count(*) from public.programs where organization_id = p_organization_id and kind = 'training' and is_active),
    'sessions', jsonb_build_object(
      'planned', (select count(*) from public.classes where organization_id = p_organization_id and kind = 'training_session' and archived_at is null and starts_on > v_today),
      'ongoing', (select count(*) from public.classes where organization_id = p_organization_id and kind = 'training_session' and archived_at is null
                  and (starts_on is null or starts_on <= v_today) and (ends_on is null or ends_on >= v_today)),
      'finished', (select count(*) from public.classes where organization_id = p_organization_id and kind = 'training_session' and ends_on < v_today)),
    'groups', (select count(*) from public.training_groups where organization_id = p_organization_id and archived_at is null),
    'trainers', (select count(*) from public.staff_members where organization_id = p_organization_id and is_teacher and status = 'active' and archived_at is null),
    'attendance_rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where attended) / count(*), 1) end from occ),
    'absences', (select count(*) from occ where not attended),
    'lates', (select count(*) from public.learner_attendance where organization_id = p_organization_id
              and attendance_date between v_from and v_to and minutes_late > 0),
    'completed', (select count(*) from tenr where ends_on < v_today),
    'certificates', (select count(*) from public.issued_documents where organization_id = p_organization_id
                     and kind = 'training_certificate' and status = 'valid'),
    'attestations', (select count(*) from public.issued_documents where organization_id = p_organization_id
                     and kind = 'training_attestation' and status = 'valid'),
    'badges_active', (select count(*) from public.student_badges where organization_id = p_organization_id and status = 'active'),
    'internships', jsonb_build_object(
      'ongoing', (select count(*) from public.internships where organization_id = p_organization_id and status = 'ongoing'),
      'completed', (select count(*) from public.internships where organization_id = p_organization_id and status = 'completed')),
    'finance', case when v_finance then jsonb_build_object(
      'invoiced', (select coalesce(sum(total), 0) from tinv),
      'collected', (select coalesce(sum(paid), 0) from tinv),
      'remaining', (select coalesce(sum(greatest(total - paid, 0)), 0) from tinv),
      'learners_with_balance', (select count(distinct i.student_id) from public.invoices i join tinv on tinv.id = i.id where tinv.total > tinv.paid),
      'collected_period', (select coalesce(sum(p.amount), 0) from public.payments p join public.invoices i on i.id = p.invoice_id
                           join tenr on tenr.id = i.enrollment_id
                           where p.status = 'completed' and (p.paid_at at time zone v_tz)::date between v_from and v_to)) end,
    'by_formation', coalesce((select jsonb_agg(x order by x ->> 'name') from (
        select jsonb_build_object('name', p.name,
          'learners', (select count(distinct t.student_id) from tenr t where t.program_id = p.id),
          'sessions', (select count(*) from public.classes c where c.program_id = p.id and c.kind = 'training_session'),
          'rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where attended) / count(*), 1) end
                   from occ o where o.program_id = p.id)) as x
        from public.programs p where p.organization_id = p_organization_id and p.kind = 'training') t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.training_statistics(uuid, date, date) from public, anon;
grant execute on function public.training_statistics(uuid, date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Documents de formation (Document Studio) : attestation de formation
-- -----------------------------------------------------------------------------
alter table public.document_templates drop constraint document_templates_kind_check;
alter table public.document_templates add constraint document_templates_kind_check check (kind in (
  'school_certificate', 'attestation', 'training_certificate', 'training_attestation', 'report_card', 'receipt',
  'student_card', 'enrollment_form', 'commitment_form', 'contract', 'convocation', 'transcript', 'custom'));

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.training_groups enable row level security;
alter table public.student_badges enable row level security;
alter table public.learner_attendance enable row level security;
alter table public.training_competencies enable row level security;
alter table public.learner_competencies enable row level security;
alter table public.internships enable row level security;

create policy training_groups_select on public.training_groups for select to authenticated
  using (organization_id = any ((select app.member_org_ids())::uuid[]));
create policy training_groups_write on public.training_groups for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('academic.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('academic.manage'))::uuid[]));

create policy student_badges_select on public.student_badges for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('students.badges.manage'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
  );
create policy student_badges_insert on public.student_badges for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('students.badges.manage'))::uuid[]));
create policy student_badges_update on public.student_badges for update to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.badges.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('students.badges.manage'))::uuid[]));

-- Écriture uniquement par le scan (fonction SECURITY DEFINER).
create policy learner_attendance_select on public.learner_attendance for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('attendance.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('attendance.manage'))::uuid[])
    or class_id = any ((select app.my_taught_class_ids())::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
  );

create policy badge_scans_select_learners on public.badge_scans for select to authenticated
  using (student_id is not null and organization_id = any ((select app.permitted_org_ids('attendance.read'))::uuid[]));

create policy training_competencies_select on public.training_competencies for select to authenticated
  using (organization_id = any ((select app.member_org_ids())::uuid[]));
create policy training_competencies_write on public.training_competencies for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('academic.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('academic.manage'))::uuid[]));

create policy learner_competencies_select on public.learner_competencies for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('grades.read'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
    or exists (select 1 from public.enrollments e where e.id = enrollment_id and e.class_id = any ((select app.my_taught_class_ids())::uuid[]))
  );
create policy learner_competencies_write on public.learner_competencies for all to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('grades.enter'))::uuid[])
        and exists (select 1 from public.enrollments e where e.id = enrollment_id and e.class_id = any ((select app.my_taught_class_ids())::uuid[])))
  )
  with check (
    organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('grades.enter'))::uuid[])
        and exists (select 1 from public.enrollments e where e.id = enrollment_id and e.class_id = any ((select app.my_taught_class_ids())::uuid[])))
  );

create policy internships_select on public.internships for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
  );
create policy internships_write on public.internships for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[]));

-- Journal d'audit (historique complet des badges, groupes, compétences, stages).
do $$
declare
  t text;
begin
  foreach t in array array['training_groups', 'training_competencies', 'learner_competencies', 'internships']
  loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s
                    for each row execute function app.audit_row()', t);
  end loop;
end;
$$;
-- Badges : le jeton du QR n'est jamais recopié dans le journal.
create trigger student_badges_audit after insert or update or delete on public.student_badges
  for each row execute function app.audit_row('redact');

-- -----------------------------------------------------------------------------
-- Formule commerciale : « Formation professionnelle » (15 000 F CFA / mois)
-- -----------------------------------------------------------------------------
update public.subscription_plans
   set name = 'Formation professionnelle',
       description = 'Centres de formation professionnelle : formations libres, sessions, classes facultatives, apprenants, badges QR, entrées/sorties, paiements échelonnés, compétences, stages et certificats.'
 where code = 'CENTRE_FORMATION';
