-- =============================================================================
-- NéoScol — 0300 Structure académique, personnel, élèves, parents, inscriptions
-- =============================================================================

create type public.period_type as enum ('trimester', 'semester', 'session', 'custom');
create type public.enrollment_status as enum ('draft', 'pending', 'validated', 'rejected', 'cancelled');
create type public.enrollment_type as enum ('new', 'reenrollment', 'transfer');

-- -----------------------------------------------------------------------------
-- Structure académique
-- -----------------------------------------------------------------------------
create table public.academic_years (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 40),
  starts_on date not null,
  ends_on date not null,
  is_current boolean not null default false,
  status text not null default 'planned' check (status in ('planned', 'active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on > starts_on),
  unique (organization_id, name),
  unique (organization_id, id)
);
create unique index academic_years_one_current on public.academic_years (organization_id) where is_current;

create table public.academic_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  academic_year_id uuid not null,
  name text not null,
  type public.period_type not null default 'trimester',
  sequence smallint not null default 1 check (sequence > 0),
  starts_on date not null,
  ends_on date not null,
  is_locked boolean not null default false,
  locked_at timestamptz,
  locked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on),
  unique (academic_year_id, sequence),
  unique (organization_id, id),
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete cascade
);

create table public.levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  short_name text,
  cycle text,
  sequence smallint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

-- Filières, formations professionnelles, diplômes
create table public.programs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  kind text not null default 'track' check (kind in ('track', 'training', 'degree')),
  description text,
  duration_hours integer check (duration_hours is null or duration_hours > 0),
  is_active boolean not null default true,
  search_text text generated always as (app.search_normalize(name || ' ' || code)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

-- Matières (enseignement général) ou modules (formation / université)
create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  program_id uuid,
  name text not null,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  kind text not null default 'subject' check (kind in ('subject', 'module')),
  credits numeric(5, 2) check (credits is null or credits >= 0),
  color text check (color is null or color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, program_id) references public.programs (organization_id, id) on delete set null (program_id)
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  building text,
  capacity integer check (capacity is null or capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

-- -----------------------------------------------------------------------------
-- Personnel
-- -----------------------------------------------------------------------------
create table public.staff_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  employee_number text,
  first_name text not null check (length(btrim(first_name)) > 0),
  last_name text not null check (length(btrim(last_name)) > 0),
  sex text check (sex in ('M', 'F')),
  email text,
  phone text,
  job_title text,
  is_teacher boolean not null default false,
  specialties text[] not null default '{}',
  hired_on date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  photo_path text,
  archived_at timestamptz,
  search_text text generated always as (
    app.search_normalize(last_name || ' ' || first_name || ' ' || coalesce(employee_number, '') || ' ' || coalesce(phone, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (organization_id, user_id),
  unique (organization_id, employee_number),
  unique (organization_id, id)
);

-- -----------------------------------------------------------------------------
-- Classes / cohortes / sessions de formation
-- -----------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  academic_year_id uuid not null,
  level_id uuid,
  program_id uuid,
  kind text not null default 'class' check (kind in ('class', 'training_session')),
  name text not null check (length(btrim(name)) between 1 and 80),
  code text,
  capacity integer check (capacity is null or capacity > 0),
  room_id uuid,
  head_teacher_id uuid,
  starts_on date,
  ends_on date,
  archived_at timestamptz,
  search_text text generated always as (app.search_normalize(name || ' ' || coalesce(code, ''))) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  unique (organization_id, academic_year_id, name),
  unique (organization_id, id),
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete restrict,
  foreign key (organization_id, level_id) references public.levels (organization_id, id) on delete restrict,
  foreign key (organization_id, program_id) references public.programs (organization_id, id) on delete restrict,
  foreign key (organization_id, room_id) references public.rooms (organization_id, id) on delete set null (room_id),
  foreign key (organization_id, head_teacher_id) references public.staff_members (organization_id, id) on delete set null (head_teacher_id)
);
create index classes_year_idx on public.classes (academic_year_id);
create index classes_head_teacher_idx on public.classes (head_teacher_id);

-- Matière enseignée dans une classe = affectation enseignant + coefficient
create table public.class_subjects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  class_id uuid not null,
  subject_id uuid not null,
  teacher_id uuid,
  coefficient numeric(5, 2) not null default 1 check (coefficient > 0),
  weekly_hours numeric(5, 2) check (weekly_hours is null or weekly_hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, subject_id),
  unique (organization_id, id),
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete cascade,
  foreign key (organization_id, subject_id) references public.subjects (organization_id, id) on delete restrict,
  foreign key (organization_id, teacher_id) references public.staff_members (organization_id, id) on delete set null (teacher_id)
);
create index class_subjects_teacher_idx on public.class_subjects (teacher_id);

-- -----------------------------------------------------------------------------
-- Élèves / apprenants
-- -----------------------------------------------------------------------------
create table public.students (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  matricule text not null unique,
  user_id uuid unique references public.profiles (id) on delete set null,
  first_name text not null check (length(btrim(first_name)) > 0),
  last_name text not null check (length(btrim(last_name)) > 0),
  other_names text,
  sex text check (sex in ('M', 'F')),
  birth_date date check (birth_date is null or birth_date > date '1900-01-01'),
  birth_place text,
  nationality text,
  national_id text,
  email text,
  phone text,
  address text,
  city text,
  photo_path text,
  status text not null default 'active'
    check (status in ('prospect', 'active', 'inactive', 'graduated', 'transferred', 'withdrawn')),
  custom_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(custom_fields) = 'object'),
  notes text,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,
  search_text text generated always as (
    app.search_normalize(last_name || ' ' || first_name || ' ' || coalesce(other_names, '') || ' ' || matricule)
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (organization_id, id)
);
create index students_org_status_idx on public.students (organization_id, status) where archived_at is null;
create index students_org_name_idx on public.students (organization_id, last_name, first_name);

comment on column public.students.matricule is
  'Matricule permanent, attribué automatiquement à la création, unique sur la plateforme et non modifiable.';

-- Attribution automatique et immuabilité du matricule
create or replace function app.assign_student_matricule()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.matricule := app.generate_number(new.organization_id, 'student', '{CODE}-{YY}-{SEQ:5}');
  elsif new.matricule is distinct from old.matricule then
    raise exception 'Le matricule est permanent et ne peut pas être modifié.' using errcode = 'check_violation';
  elsif new.organization_id is distinct from old.organization_id then
    raise exception 'Un dossier élève ne peut pas changer d''établissement.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger students_matricule
  before insert or update on public.students
  for each row execute function app.assign_student_matricule();

-- -----------------------------------------------------------------------------
-- Parents / tuteurs
-- -----------------------------------------------------------------------------
create table public.guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid references public.profiles (id) on delete set null,
  first_name text not null check (length(btrim(first_name)) > 0),
  last_name text not null check (length(btrim(last_name)) > 0),
  sex text check (sex in ('M', 'F')),
  phone text,
  phone_secondary text,
  email text,
  profession text,
  employer text,
  address text,
  city text,
  national_id text,
  archived_at timestamptz,
  search_text text generated always as (
    app.search_normalize(last_name || ' ' || first_name || ' ' || coalesce(phone, '') || ' ' || coalesce(email, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (organization_id, user_id),
  unique (organization_id, id)
);
create index guardians_phone_idx on public.guardians (organization_id, phone);

create table public.student_guardians (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  guardian_id uuid not null,
  relationship text not null default 'tutor'
    check (relationship in ('father', 'mother', 'tutor', 'grandparent', 'sibling', 'other')),
  is_primary boolean not null default false,
  is_financial_responsible boolean not null default false,
  is_emergency_contact boolean not null default false,
  portal_access boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, guardian_id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, guardian_id) references public.guardians (organization_id, id) on delete cascade
);
create index student_guardians_guardian_idx on public.student_guardians (guardian_id);

-- Informations médicales : table séparée, permission dédiée, fonctionnalité activable.
create table public.student_medical_records (
  student_id uuid primary key,
  organization_id uuid not null,
  blood_group text check (blood_group is null or blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  allergies text,
  conditions text,
  medications text,
  emergency_contact_name text,
  emergency_contact_phone text,
  doctor_name text,
  doctor_phone text,
  notes text,
  updated_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade
);

create table public.student_previous_schools (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  school_name text not null,
  city text,
  country text,
  from_year smallint,
  to_year smallint,
  last_level text,
  notes text,
  created_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade
);
create index student_previous_schools_student_idx on public.student_previous_schools (student_id);

create table public.conduct_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  kind text not null check (kind in ('sanction', 'reward')),
  title text not null,
  description text,
  occurred_on date not null default current_date,
  recorded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade
);
create index conduct_records_student_idx on public.conduct_records (student_id);

-- -----------------------------------------------------------------------------
-- Formulaires personnalisables
-- fields : [{ key, label, type, required, options?, section?, help? }]
-- -----------------------------------------------------------------------------
create table public.form_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('enrollment', 'reenrollment', 'student', 'guardian', 'commitment')),
  name text not null,
  description text,
  fields jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array'),
  version integer not null default 1,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index form_definitions_one_active on public.form_definitions (organization_id, kind) where is_active;

-- -----------------------------------------------------------------------------
-- Inscriptions / réinscriptions
-- -----------------------------------------------------------------------------
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  reference text not null unique,
  student_id uuid not null,
  academic_year_id uuid not null,
  class_id uuid,
  level_id uuid,
  program_id uuid,
  type public.enrollment_type not null default 'new',
  status public.enrollment_status not null default 'draft',
  form_definition_id uuid,
  form_data jsonb not null default '{}'::jsonb check (jsonb_typeof(form_data) = 'object'),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  decision_reason text,
  notes text,
  search_text text generated always as (app.search_normalize(reference)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete restrict,
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete restrict,
  foreign key (organization_id, level_id) references public.levels (organization_id, id) on delete restrict,
  foreign key (organization_id, program_id) references public.programs (organization_id, id) on delete restrict,
  foreign key (organization_id, form_definition_id) references public.form_definitions (organization_id, id) on delete set null (form_definition_id)
);
create index enrollments_student_idx on public.enrollments (student_id);
create index enrollments_class_idx on public.enrollments (class_id) where status = 'validated';
create index enrollments_org_status_idx on public.enrollments (organization_id, status);
create unique index enrollments_no_duplicate_active
  on public.enrollments (student_id, class_id)
  where class_id is not null and status in ('pending', 'validated');

-- Numérotation, cohérence et contrôle des transitions de statut
create or replace function app.enrollment_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_year uuid;
begin
  if tg_op = 'INSERT' then
    new.reference := app.generate_number(new.organization_id, 'enrollment', 'INS-{CODE}-{YY}-{SEQ:5}');
  elsif new.reference is distinct from old.reference then
    raise exception 'La référence d''inscription ne peut pas être modifiée.' using errcode = 'check_violation';
  end if;

  if new.class_id is not null then
    select academic_year_id into v_class_year from public.classes where id = new.class_id;
    if v_class_year is distinct from new.academic_year_id then
      raise exception 'La classe choisie n''appartient pas à l''année scolaire de l''inscription.' using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if not (
      (old.status = 'draft' and new.status in ('pending', 'cancelled'))
      or (old.status = 'pending' and new.status in ('validated', 'rejected', 'cancelled', 'draft'))
      or (old.status = 'validated' and new.status = 'cancelled')
      or (old.status = 'rejected' and new.status = 'pending')
    ) then
      raise exception 'Transition de statut non autorisée : % → %', old.status, new.status using errcode = 'check_violation';
    end if;
  end if;

  if (tg_op = 'INSERT' and new.status in ('validated', 'rejected'))
     or (tg_op = 'UPDATE' and new.status is distinct from old.status and new.status in ('validated', 'rejected')) then
    if auth.uid() is not null and not app.has_permission(new.organization_id, 'enrollments.validate') then
      raise exception 'La validation des inscriptions nécessite la permission enrollments.validate.' using errcode = 'insufficient_privilege';
    end if;
    if new.status = 'validated' and new.class_id is null then
      raise exception 'Une inscription validée doit être affectée à une classe.' using errcode = 'check_violation';
    end if;
    new.decided_at := now();
    new.decided_by := auth.uid();
  end if;

  if new.status = 'pending' and new.submitted_at is null then
    new.submitted_at := now();
  end if;
  return new;
end;
$$;
create trigger enrollments_guard
  before insert or update on public.enrollments
  for each row execute function app.enrollment_guard();

-- L'élève devient « actif » à la validation de son inscription.
create or replace function app.enrollment_activate_student()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'validated' and (tg_op = 'INSERT' or old.status is distinct from 'validated') then
    update public.students set status = 'active' where id = new.student_id and status = 'prospect';
  end if;
  return new;
end;
$$;
create trigger enrollments_activate_student
  after insert or update of status on public.enrollments
  for each row execute function app.enrollment_activate_student();

-- -----------------------------------------------------------------------------
-- Portée relationnelle (enseignant, parent, élève) — fonctions RLS
-- -----------------------------------------------------------------------------
create or replace function app.my_staff_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(s.id), '{}')
  from public.staff_members s
  where s.user_id = auth.uid()
    and s.status = 'active'
    and s.archived_at is null
    and s.organization_id = any (app.member_org_ids());
$$;

-- Classes où l'utilisateur enseigne une matière ou est professeur principal.
create or replace function app.my_taught_class_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select app.my_staff_ids() as ids)
  select coalesce(array_agg(distinct x.class_id), '{}')
  from (
    select cs.class_id from public.class_subjects cs, me where cs.teacher_id = any (me.ids)
    union
    select c.id from public.classes c, me where c.head_teacher_id = any (me.ids)
  ) x;
$$;

create or replace function app.my_taught_class_subject_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(cs.id), '{}')
  from public.class_subjects cs
  where cs.teacher_id = any (app.my_staff_ids());
$$;

create or replace function app.my_taught_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct e.student_id), '{}')
  from public.enrollments e
  where e.status = 'validated'
    and e.class_id = any (app.my_taught_class_ids());
$$;

-- Élèves accessibles par portail : enfants (parent) ou soi-même (élève).
create or replace function app.my_portal_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with orgs as (select app.member_org_ids() as ids)
  select coalesce(array_agg(distinct x.id), '{}')
  from (
    select sg.student_id as id
    from public.guardians g
    join public.student_guardians sg on sg.guardian_id = g.id and sg.portal_access
    , orgs
    where g.user_id = auth.uid() and g.archived_at is null and g.organization_id = any (orgs.ids)
    union
    select s.id
    from public.students s, orgs
    where s.user_id = auth.uid() and s.organization_id = any (orgs.ids)
  ) x;
$$;

create or replace function app.my_portal_class_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct e.class_id), '{}')
  from public.enrollments e
  where e.status = 'validated'
    and e.class_id is not null
    and e.student_id = any (app.my_portal_student_ids());
$$;

grant execute on function
  app.my_staff_ids(), app.my_taught_class_ids(), app.my_taught_class_subject_ids(),
  app.my_taught_student_ids(), app.my_portal_student_ids(), app.my_portal_class_ids()
to authenticated, service_role;

-- L'archivage d'un élève exige students.archive.
create or replace function app.student_archive_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.archived_at is distinct from old.archived_at then
    if auth.uid() is not null and not app.has_permission(new.organization_id, 'students.archive') then
      raise exception 'L''archivage nécessite la permission students.archive.' using errcode = 'insufficient_privilege';
    end if;
    new.archived_by := case when new.archived_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;
create trigger students_archive_guard
  before update on public.students
  for each row execute function app.student_archive_guard();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.academic_years enable row level security;
alter table public.academic_periods enable row level security;
alter table public.levels enable row level security;
alter table public.programs enable row level security;
alter table public.subjects enable row level security;
alter table public.rooms enable row level security;
alter table public.staff_members enable row level security;
alter table public.classes enable row level security;
alter table public.class_subjects enable row level security;
alter table public.students enable row level security;
alter table public.guardians enable row level security;
alter table public.student_guardians enable row level security;
alter table public.student_medical_records enable row level security;
alter table public.student_previous_schools enable row level security;
alter table public.conduct_records enable row level security;
alter table public.form_definitions enable row level security;
alter table public.enrollments enable row level security;

-- Structure académique : lisible par tous les membres, modifiable avec academic.manage.
do $$
declare
  t text;
begin
  foreach t in array array['academic_years', 'academic_periods', 'levels', 'programs', 'subjects', 'rooms', 'classes', 'class_subjects']
  loop
    execute format(
      'create policy %1$s_select on public.%1$s for select to authenticated
         using (organization_id = any ((select app.member_org_ids())::uuid[]))', t);
    execute format(
      'create policy %1$s_write on public.%1$s for all to authenticated
         using (organization_id = any ((select app.permitted_org_ids(''academic.manage''))::uuid[]))
         with check (organization_id = any ((select app.permitted_org_ids(''academic.manage''))::uuid[]))', t);
  end loop;
end;
$$;

-- Le verrouillage des périodes exige periods.lock (en plus d'academic.manage).
create policy academic_periods_lock on public.academic_periods for update to authenticated
  using (organization_id = any ((select app.permitted_org_ids('periods.lock'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('periods.lock'))::uuid[]));

create or replace function app.period_lock_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_locked is distinct from old.is_locked then
    if auth.uid() is not null and not app.has_permission(new.organization_id, 'periods.lock') then
      raise exception 'Le verrouillage des périodes nécessite la permission periods.lock.' using errcode = 'insufficient_privilege';
    end if;
    new.locked_at := case when new.is_locked then now() end;
    new.locked_by := case when new.is_locked then auth.uid() end;
  end if;
  return new;
end;
$$;
create trigger academic_periods_lock_guard
  before update on public.academic_periods
  for each row execute function app.period_lock_guard();

create policy staff_select on public.staff_members for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('staff.read'))::uuid[])
    or user_id = (select auth.uid())
  );
create policy staff_write on public.staff_members for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('staff.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('staff.manage'))::uuid[]));

create policy students_select on public.students for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[])
    or id = any ((select app.my_portal_student_ids())::uuid[])
    or id = any ((select app.my_taught_student_ids())::uuid[])
  );
create policy students_insert on public.students for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('students.create'))::uuid[]));
create policy students_update on public.students for update to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('students.archive'))::uuid[])
  )
  with check (
    organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('students.archive'))::uuid[])
  );

create policy guardians_select on public.guardians for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('guardians.read'))::uuid[])
    or user_id = (select auth.uid())
  );
create policy guardians_write on public.guardians for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('guardians.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('guardians.manage'))::uuid[]));

create policy student_guardians_select on public.student_guardians for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('guardians.read'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
  );
create policy student_guardians_write on public.student_guardians for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('guardians.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('guardians.manage'))::uuid[]));

create policy medical_select on public.student_medical_records for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('students.medical.read'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
  );
create policy medical_write on public.student_medical_records for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.medical.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('students.medical.manage'))::uuid[]));

create policy previous_schools_select on public.student_previous_schools for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[]));
create policy previous_schools_write on public.student_previous_schools for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[]));

create policy conduct_select on public.conduct_records for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('conduct.read'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
  );
create policy conduct_write on public.conduct_records for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('conduct.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('conduct.manage'))::uuid[]));

create policy forms_select on public.form_definitions for select to authenticated
  using (organization_id = any ((select app.member_org_ids())::uuid[]));
create policy forms_write on public.form_definitions for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('forms.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('forms.manage'))::uuid[]));

create policy enrollments_select on public.enrollments for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('enrollments.read'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
    or (status = 'validated' and class_id = any ((select app.my_taught_class_ids())::uuid[]))
  );
create policy enrollments_insert on public.enrollments for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('enrollments.manage'))::uuid[]));
create policy enrollments_update on public.enrollments for update to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('enrollments.manage'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('enrollments.validate'))::uuid[])
  )
  with check (
    organization_id = any ((select app.permitted_org_ids('enrollments.manage'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('enrollments.validate'))::uuid[])
  );

-- -----------------------------------------------------------------------------
-- Horodatage
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'academic_years', 'academic_periods', 'levels', 'programs', 'subjects', 'rooms', 'staff_members',
    'classes', 'class_subjects', 'students', 'guardians', 'student_guardians', 'student_medical_records',
    'form_definitions', 'enrollments']
  loop
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function app.touch_updated_at()', t);
  end loop;
end;
$$;

-- Index de recherche (trigram)
create index students_search_idx on public.students using gin (search_text extensions.gin_trgm_ops);
create index guardians_search_idx on public.guardians using gin (search_text extensions.gin_trgm_ops);
create index staff_search_idx on public.staff_members using gin (search_text extensions.gin_trgm_ops);
create index classes_search_idx on public.classes using gin (search_text extensions.gin_trgm_ops);
create index programs_search_idx on public.programs using gin (search_text extensions.gin_trgm_ops);
create index enrollments_search_idx on public.enrollments using gin (search_text extensions.gin_trgm_ops);
