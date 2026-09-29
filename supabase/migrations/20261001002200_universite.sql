-- =============================================================================
-- NéoScol — 2200 MODULE 3 : UNIVERSITÉ / ENSEIGNEMENT SUPÉRIEUR
--
-- Établissements de type `university` ou `institute`. Tout s'appuie sur les
-- briques communes (étudiants, inscriptions, emploi du temps, notes, finances,
-- badges, scan, documents, RLS) ; les données métier universitaires ont leurs
-- propres tables : facultés, départements, parcours, cycles, UE, inscriptions
-- pédagogiques, résultats, délibérations, mémoires, soutenances, diplômes.
-- Toutes les options (facultés, départements, groupes, crédits, classement,
-- stages, mémoires, soutenances, badges, scan, portails…) sont des réglages
-- de l'établissement (settings.university) : rien n'est imposé.
-- Les Modules 1 (Scolaire) et 2 (Formation professionnelle) sont inchangés.
-- =============================================================================

create or replace function app.is_higher_org_type(p_type public.organization_type)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_type in ('university', 'institute');
$$;

create or replace function app.is_higher_org(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select app.is_higher_org_type(type) from public.organizations where id = p_org), false);
$$;

-- -----------------------------------------------------------------------------
-- Réglages : settings.university
-- -----------------------------------------------------------------------------
create or replace function app.default_university_settings()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "establishment_kind": "universite",
    "features": {
      "faculties": true, "departments": true, "groups": false, "semesters": true, "credits": true,
      "ranking": false, "internships": true, "theses": true, "defenses": true, "badges": true,
      "scan": true, "student_portal": true, "teacher_portal": true, "payments": true, "documents": true
    },
    "rules": {
      "pass_mark": 10,
      "ue_compensation": true,
      "semester_compensation": true,
      "semester_weighting": "credits",
      "eliminatory_mark": null,
      "absent_as_zero": true,
      "retake_rule": "best",
      "retake_cap": 10,
      "year_pass_ratio": 1,
      "conditional_pass_ratio": 0.75,
      "late_tolerance_minutes": 10,
      "open_before_minutes": 15,
      "entry_without_course": false,
      "ranking_scope": "promotion"
    },
    "teacher_ranks": ["Professeur titulaire", "Maître de conférences", "Maître-assistant", "Assistant", "Chargé de cours", "Vacataire", "Intervenant"],
    "decisions": {
      "validated": "Admis(e)",
      "compensated": "Admis(e) par compensation",
      "retake": "Autorisé(e) au rattrapage",
      "failed": "Ajourné(e)",
      "year_pass": "Admis(e) en année supérieure",
      "year_conditional": "Admis(e) avec dette de crédits",
      "year_repeat": "Redouble"
    }
  }'::jsonb;
$$;

update public.organizations
   set settings = settings || jsonb_build_object('university', app.default_university_settings())
 where app.is_higher_org_type(type) and not (settings ? 'university');

create or replace function app.organization_university_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if app.is_higher_org_type(new.type) and not (coalesce(new.settings, '{}'::jsonb) ? 'university') then
    new.settings := coalesce(new.settings, '{}'::jsonb) || jsonb_build_object('university', app.default_university_settings());
  end if;
  return new;
end;
$$;
create trigger organizations_university_defaults
  before insert on public.organizations
  for each row execute function app.organization_university_defaults();

-- Réglages effectifs (fusion avec les valeurs par défaut) ; NULL hors enseignement supérieur.
create or replace function app.org_university(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.is_higher_org_type(o.type) then
    app.default_university_settings()
      || coalesce(o.settings -> 'university', '{}'::jsonb)
      || jsonb_build_object(
           'features', (app.default_university_settings() -> 'features') || coalesce(o.settings #> '{university,features}', '{}'::jsonb),
           'rules', (app.default_university_settings() -> 'rules') || coalesce(o.settings #> '{university,rules}', '{}'::jsonb),
           'decisions', (app.default_university_settings() -> 'decisions') || coalesce(o.settings #> '{university,decisions}', '{}'::jsonb))
  end
  from public.organizations o where o.id = p_org;
$$;

create or replace function app.university_feature(p_org uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((app.org_university(p_org) #>> array['features', p_feature])::boolean, false);
$$;

create or replace function public.set_university_config(p_org uuid, p_config jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_rules jsonb;
  v_kind text;
  v_key text;
  v_num numeric;
begin
  if not app.has_permission(p_org, 'settings.manage') then
    raise exception 'Permission requise : settings.manage' using errcode = 'insufficient_privilege';
  end if;
  if not app.is_higher_org(p_org) then
    raise exception 'Le module Université ne s''applique pas à ce type d''établissement.' using errcode = 'check_violation';
  end if;
  v_before := app.org_university(p_org);
  v_kind := coalesce(p_config ->> 'establishment_kind', v_before ->> 'establishment_kind');
  if v_kind not in ('universite', 'institut', 'ecole_superieure', 'prive', 'faculte', 'autre') then
    raise exception 'Type d''établissement inconnu.' using errcode = 'check_violation';
  end if;
  -- Fonctionnalités : uniquement des booléens connus.
  for v_key in select jsonb_object_keys(coalesce(p_config -> 'features', '{}'::jsonb)) loop
    if not (app.default_university_settings() -> 'features') ? v_key or jsonb_typeof(p_config #> array['features', v_key]) <> 'boolean' then
      raise exception 'Fonctionnalité inconnue : %', v_key using errcode = 'check_violation';
    end if;
  end loop;
  v_rules := (v_before -> 'rules') || coalesce(p_config -> 'rules', '{}'::jsonb);
  for v_key in select unnest(array['pass_mark', 'retake_cap']) loop
    v_num := (v_rules ->> v_key)::numeric;
    if v_num is null or v_num < 0 or v_num > 20 then
      raise exception 'Règle « % » : valeur entre 0 et 20 attendue.', v_key using errcode = 'check_violation';
    end if;
  end loop;
  if v_rules ->> 'retake_rule' not in ('best', 'replace', 'cap', 'average') then
    raise exception 'Règle de rattrapage inconnue.' using errcode = 'check_violation';
  end if;
  if v_rules ->> 'semester_weighting' not in ('credits', 'coefficient') then
    raise exception 'Pondération des UE inconnue.' using errcode = 'check_violation';
  end if;
  if (v_rules ->> 'late_tolerance_minutes')::integer not between 0 and 120
     or (v_rules ->> 'open_before_minutes')::integer not between 0 and 240 then
    raise exception 'Règles de scan : tolérance 0 à 120 min, ouverture 0 à 240 min.' using errcode = 'check_violation';
  end if;
  if (v_rules ->> 'year_pass_ratio')::numeric not between 0 and 1 or (v_rules ->> 'conditional_pass_ratio')::numeric not between 0 and 1 then
    raise exception 'Seuils de passage : ratio entre 0 et 1.' using errcode = 'check_violation';
  end if;
  v_after := jsonb_build_object(
    'establishment_kind', v_kind,
    'features', (v_before -> 'features') || coalesce(p_config -> 'features', '{}'::jsonb),
    'rules', v_rules,
    'teacher_ranks', coalesce(p_config -> 'teacher_ranks', v_before -> 'teacher_ranks'),
    'decisions', (v_before -> 'decisions') || coalesce(p_config -> 'decisions', '{}'::jsonb));
  update public.organizations set settings = settings || jsonb_build_object('university', v_after) where id = p_org;
  perform app.audit(p_org, 'settings.university', 'organizations', p_org, 'Paramètres universitaires mis à jour',
                    jsonb_build_object('before', v_before, 'after', v_after));
  return v_after;
end;
$$;
revoke execute on function public.set_university_config(uuid, jsonb) from public, anon;
grant execute on function public.set_university_config(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Permissions et rôles universitaires (créés uniquement pour l'enseignement supérieur)
-- -----------------------------------------------------------------------------
insert into public.permissions (code, module, label, sort_order) values
  ('deliberations.read', 'university', 'Consulter les résultats universitaires et les délibérations', 140),
  ('deliberations.manage', 'university', 'Délibérer : calcul des résultats, décisions du jury, clôture, procès-verbal', 141),
  ('theses.manage', 'university', 'Gérer les stages, mémoires et soutenances', 142),
  ('diplomas.manage', 'university', 'Délivrer et révoquer les diplômes', 143);

create or replace function app.provision_university(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_higher_org(p_org) then
    return;
  end if;
  -- Vocabulaire universitaire des rôles existants.
  update public.roles set name = 'Étudiant' where organization_id = p_org and key = 'student';
  update public.roles set name = 'Enseignant' where organization_id = p_org and key = 'teacher';
  update public.roles set name = 'Administrateur universitaire' where organization_id = p_org and key = 'org_admin';
  insert into public.roles (organization_id, key, name, description, persona, is_system) values
    (p_org, 'registrar', 'Scolarité', 'Étudiants, inscriptions administratives et pédagogiques, documents, diplômes', 'staff', true),
    (p_org, 'program_head', 'Responsable de filière', 'Suivi de sa filière : étudiants, notes, résultats et délibérations de ses promotions', 'teacher', true),
    (p_org, 'jury', 'Jury', 'Accès aux données nécessaires aux délibérations et décisions du jury', 'staff', true)
  on conflict (organization_id, key) do nothing;
  insert into public.role_permissions (role_id, permission_code)
  select r.id, p.code
  from public.roles r
  join (values
    ('org_admin', 'deliberations.read'), ('org_admin', 'deliberations.manage'), ('org_admin', 'theses.manage'), ('org_admin', 'diplomas.manage'),
    ('director', 'deliberations.read'), ('director', 'deliberations.manage'), ('director', 'theses.manage'), ('director', 'diplomas.manage'),
    ('registrar', 'students.read'), ('registrar', 'students.create'), ('registrar', 'students.update'), ('registrar', 'students.archive'),
    ('registrar', 'students.badges.manage'), ('registrar', 'portal_access.manage'), ('registrar', 'guardians.read'), ('registrar', 'guardians.manage'),
    ('registrar', 'enrollments.read'), ('registrar', 'enrollments.manage'), ('registrar', 'enrollments.validate'), ('registrar', 'academic.read'),
    ('registrar', 'timetable.read'), ('registrar', 'attendance.read'), ('registrar', 'documents.read'), ('registrar', 'documents.generate'),
    ('registrar', 'documents.dossier'), ('registrar', 'theses.manage'), ('registrar', 'diplomas.manage'), ('registrar', 'deliberations.read'),
    ('registrar', 'staff.read'), ('registrar', 'reports.read'),
    ('program_head', 'academic.read'), ('program_head', 'timetable.read'), ('program_head', 'attendance.take'), ('program_head', 'grades.enter'),
    ('program_head', 'communication.message'),
    ('jury', 'deliberations.read'), ('jury', 'deliberations.manage'), ('jury', 'grades.read'), ('jury', 'students.read'),
    ('jury', 'academic.read'), ('jury', 'attendance.read')
  ) as p(role_key, code) on p.role_key = r.key
  where r.organization_id = p_org
  on conflict do nothing;
end;
$$;

create or replace function app.organization_university_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.provision_university(new.id);
  return new;
end;
$$;
-- Après le provisionnement standard (organizations_provision) : ordre alphabétique des déclencheurs.
create trigger organizations_university
  after insert on public.organizations
  for each row execute function app.organization_university_after_insert();

select app.provision_university(id) from public.organizations where app.is_higher_org_type(type);

-- -----------------------------------------------------------------------------
-- Structure : facultés / écoles (facultatives), départements (facultatifs),
-- filières enrichies, parcours / spécialités, cycles, niveaux.
-- -----------------------------------------------------------------------------
create table public.faculties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 160),
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  kind text not null default 'faculte' check (kind in ('faculte', 'ecole', 'institut', 'autre')),
  dean_id uuid,
  description text check (description is null or length(description) <= 2000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, dean_id) references public.staff_members (organization_id, id) on delete set null (dean_id)
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  faculty_id uuid,
  name text not null check (length(btrim(name)) between 2 and 160),
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  head_id uuid,
  description text check (description is null or length(description) <= 2000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, faculty_id) references public.faculties (organization_id, id) on delete restrict,
  foreign key (organization_id, head_id) references public.staff_members (organization_id, id) on delete set null (head_id)
);

create table public.academic_cycles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  credits_required numeric(6, 2) check (credits_required is null or credits_required > 0),
  duration_years smallint check (duration_years is null or duration_years between 1 and 12),
  sequence smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

alter table public.levels
  add column academic_cycle_id uuid,
  add column credits_target numeric(6, 2) check (credits_target is null or credits_target > 0);
alter table public.levels
  add foreign key (organization_id, academic_cycle_id) references public.academic_cycles (organization_id, id) on delete set null (academic_cycle_id);

alter table public.programs
  add column faculty_id uuid,
  add column department_id uuid,
  add column responsible_id uuid,
  add column academic_cycle_id uuid,
  add column degree_title text check (degree_title is null or length(degree_title) <= 200),
  add column duration_years smallint check (duration_years is null or duration_years between 1 and 12);
alter table public.programs
  add foreign key (organization_id, faculty_id) references public.faculties (organization_id, id) on delete restrict,
  add foreign key (organization_id, department_id) references public.departments (organization_id, id) on delete restrict,
  add foreign key (organization_id, responsible_id) references public.staff_members (organization_id, id) on delete set null (responsible_id),
  add foreign key (organization_id, academic_cycle_id) references public.academic_cycles (organization_id, id) on delete set null (academic_cycle_id);

create table public.program_tracks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  program_id uuid not null,
  name text not null check (length(btrim(name)) between 2 and 160),
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  kind text not null default 'parcours' check (kind in ('parcours', 'specialite', 'option')),
  starts_at_level_id uuid,
  responsible_id uuid,
  description text check (description is null or length(description) <= 2000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, code),
  unique (organization_id, id),
  foreign key (organization_id, program_id) references public.programs (organization_id, id) on delete cascade,
  foreign key (organization_id, starts_at_level_id) references public.levels (organization_id, id) on delete set null (starts_at_level_id),
  foreign key (organization_id, responsible_id) references public.staff_members (organization_id, id) on delete set null (responsible_id)
);

-- Cohérence : département de la faculté de la filière ; structures facultatives selon les réglages.
create or replace function app.program_university_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_faculty uuid;
begin
  if new.department_id is not null then
    select faculty_id into v_faculty from public.departments where id = new.department_id;
    if new.faculty_id is null then
      new.faculty_id := v_faculty;
    elsif v_faculty is not null and v_faculty <> new.faculty_id then
      raise exception 'Ce département n''appartient pas à la faculté choisie.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger programs_university_guard
  before insert or update of faculty_id, department_id on public.programs
  for each row execute function app.program_university_guard();

create or replace function app.faculty_feature_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app.is_higher_org(new.organization_id) then
    raise exception 'Réservé aux établissements d''enseignement supérieur.' using errcode = 'check_violation';
  end if;
  if tg_table_name = 'faculties' and not app.university_feature(new.organization_id, 'faculties') then
    raise exception 'Les facultés / écoles ne sont pas activées (Paramètres universitaires).' using errcode = 'check_violation';
  end if;
  if tg_table_name = 'departments' and not app.university_feature(new.organization_id, 'departments') then
    raise exception 'Les départements ne sont pas activés (Paramètres universitaires).' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger faculties_feature_guard before insert on public.faculties for each row execute function app.faculty_feature_guard();
create trigger departments_feature_guard before insert on public.departments for each row execute function app.faculty_feature_guard();
create trigger academic_cycles_feature_guard before insert on public.academic_cycles for each row execute function app.faculty_feature_guard();

-- Promotion (classe) : parcours facultatif ; inscription : parcours.
alter table public.classes add column track_id uuid;
alter table public.classes add foreign key (organization_id, track_id) references public.program_tracks (organization_id, id) on delete set null (track_id);
alter table public.enrollments add column track_id uuid;
alter table public.enrollments add foreign key (organization_id, track_id) references public.program_tracks (organization_id, id) on delete restrict;

create or replace function app.enrollment_track_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  if new.track_id is null and new.class_id is not null then
    select track_id into new.track_id from public.classes where id = new.class_id;
  end if;
  if new.track_id is not null then
    select program_id into v_program from public.program_tracks where id = new.track_id;
    if new.program_id is not null and v_program <> new.program_id then
      raise exception 'Ce parcours n''appartient pas à la filière de l''inscription.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;
create trigger enrollments_track_guard
  before insert or update of track_id, class_id, program_id on public.enrollments
  for each row execute function app.enrollment_track_guard();

-- -----------------------------------------------------------------------------
-- Calendrier : périodes d'inscription, sessions d'examen
-- -----------------------------------------------------------------------------
alter table public.academic_years
  add column registration_starts_on date,
  add column registration_ends_on date;

create table public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  academic_year_id uuid not null,
  academic_period_id uuid,
  name text not null check (length(btrim(name)) between 2 and 120),
  kind text not null default 'normal' check (kind in ('normal', 'retake')),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planned' check (status in ('planned', 'ongoing', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete cascade,
  foreign key (organization_id, academic_period_id) references public.academic_periods (organization_id, id) on delete set null (academic_period_id),
  check (ends_on >= starts_on)
);

-- -----------------------------------------------------------------------------
-- Unités d'enseignement (UE) et matières
-- -----------------------------------------------------------------------------
create table public.teaching_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  program_id uuid,
  track_id uuid,
  level_id uuid,
  semester_no smallint not null default 1 check (semester_no between 1 and 4),
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  name text not null check (length(btrim(name)) between 2 and 160),
  description text check (description is null or length(description) <= 2000),
  category text check (category is null or length(category) <= 60),
  credits numeric(5, 2) not null default 0 check (credits >= 0),
  coefficient numeric(5, 2) not null default 1 check (coefficient > 0),
  is_optional boolean not null default false,
  responsible_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, program_id) references public.programs (organization_id, id) on delete restrict,
  foreign key (organization_id, track_id) references public.program_tracks (organization_id, id) on delete restrict,
  foreign key (organization_id, level_id) references public.levels (organization_id, id) on delete restrict,
  foreign key (organization_id, responsible_id) references public.staff_members (organization_id, id) on delete set null (responsible_id)
);
create index teaching_units_curriculum_idx on public.teaching_units (program_id, level_id, semester_no);

alter table public.subjects
  add column teaching_unit_id uuid,
  add column coefficient numeric(5, 2) check (coefficient is null or coefficient > 0),
  add column hours_cm numeric(6, 1) check (hours_cm is null or hours_cm >= 0),
  add column hours_td numeric(6, 1) check (hours_td is null or hours_td >= 0),
  add column hours_tp numeric(6, 1) check (hours_tp is null or hours_tp >= 0),
  add column teaching_types text[] not null default '{}'
    check (teaching_types <@ array['cm', 'td', 'tp', 'projet', 'atelier', 'examen', 'oral', 'autre']);
alter table public.subjects
  add foreign key (organization_id, teaching_unit_id) references public.teaching_units (organization_id, id) on delete restrict;

alter table public.timetable_slots
  add column session_type text check (session_type is null or session_type in ('cm', 'td', 'tp', 'projet', 'atelier', 'examen', 'oral', 'autre'));

-- Enseignants : grade, département.
alter table public.staff_members
  add column academic_rank text check (academic_rank is null or length(academic_rank) <= 80),
  add column department_id uuid;
alter table public.staff_members
  add foreign key (organization_id, department_id) references public.departments (organization_id, id) on delete set null (department_id);

-- Salles universitaires.
alter table public.rooms
  add column number text check (number is null or length(number) <= 20),
  add column room_type text check (room_type is null or room_type in ('cours', 'amphi', 'labo', 'informatique', 'tp', 'autre')),
  add column equipment text check (equipment is null or length(equipment) <= 500),
  add column is_available boolean not null default true;

-- Évaluations universitaires (valeurs existantes conservées).
alter table public.assessments drop constraint assessments_kind_check;
alter table public.assessments add constraint assessments_kind_check
  check (kind in ('test', 'exam', 'homework', 'oral', 'practical', 'project', 'other', 'continuous', 'defense', 'retake'));

-- Frais universitaires (valeurs existantes conservées).
alter table public.fee_types drop constraint fee_types_category_check;
alter table public.fee_types add constraint fee_types_category_check
  check (category in ('registration', 'tuition', 'training', 'exam', 'uniform', 'transport', 'canteen', 'supplies', 'defense', 'diploma', 'other'));

-- -----------------------------------------------------------------------------
-- Inscription pédagogique : UE suivies par semestre (séparée de l'inscription administrative)
-- -----------------------------------------------------------------------------
create table public.course_registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  enrollment_id uuid not null,
  student_id uuid not null,
  academic_period_id uuid not null,
  teaching_unit_id uuid not null,
  status text not null default 'registered' check (status in ('registered', 'dropped', 'exempted')),
  note text check (note is null or length(note) <= 300),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (enrollment_id, academic_period_id, teaching_unit_id),
  unique (organization_id, id),
  foreign key (organization_id, enrollment_id) references public.enrollments (organization_id, id) on delete cascade,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, academic_period_id) references public.academic_periods (organization_id, id) on delete cascade,
  foreign key (organization_id, teaching_unit_id) references public.teaching_units (organization_id, id) on delete restrict
);
create index course_registrations_student_idx on public.course_registrations (student_id);

create or replace function app.course_registration_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select e.student_id into new.student_id from public.enrollments e where e.id = new.enrollment_id and e.status = 'validated';
  if new.student_id is null then
    raise exception 'L''inscription pédagogique nécessite une inscription administrative validée.' using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.enrollments e join public.academic_periods p on p.id = new.academic_period_id and p.academic_year_id = e.academic_year_id
    where e.id = new.enrollment_id
  ) then
    raise exception 'Ce semestre n''appartient pas à l''année de l''inscription.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger course_registrations_guard
  before insert or update of enrollment_id, academic_period_id on public.course_registrations
  for each row execute function app.course_registration_guard();

-- UE du programme d'études d'un étudiant pour un semestre de l'année : filière,
-- parcours (ou tronc commun), niveau, rang du semestre dans l'année.
create or replace function public.register_curriculum(p_enrollment_id uuid, p_period_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_e record;
  v_seq smallint;
  v_count integer;
begin
  select e.id, e.organization_id, e.student_id, e.program_id, coalesce(e.level_id, c.level_id) as level_id, e.track_id
    into v_e
  from public.enrollments e left join public.classes c on c.id = e.class_id
  where e.id = p_enrollment_id and e.status = 'validated';
  if v_e.id is null then
    raise exception 'Inscription administrative validée introuvable.' using errcode = 'no_data_found';
  end if;
  select sequence into v_seq from public.academic_periods where id = p_period_id;
  insert into public.course_registrations (organization_id, enrollment_id, student_id, academic_period_id, teaching_unit_id)
  select v_e.organization_id, v_e.id, v_e.student_id, p_period_id, tu.id
  from public.teaching_units tu
  where tu.organization_id = v_e.organization_id and tu.is_active and not tu.is_optional
    and tu.program_id is not distinct from v_e.program_id
    and (tu.level_id is null or tu.level_id = v_e.level_id)
    and (tu.track_id is null or tu.track_id is not distinct from v_e.track_id)
    and tu.semester_no = v_seq
  on conflict (enrollment_id, academic_period_id, teaching_unit_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.register_curriculum(uuid, uuid) from public, anon;
grant execute on function public.register_curriculum(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- RÉSULTATS : moyennes de matière, d'UE, de semestre ; crédits ; rattrapage ;
-- classement facultatif. Calculés selon les règles de l'établissement.
-- -----------------------------------------------------------------------------
create table public.ue_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  enrollment_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  academic_period_id uuid not null,
  teaching_unit_id uuid not null,
  session1_average numeric(5, 2),
  retake_average numeric(5, 2),
  average numeric(5, 2),
  credits numeric(5, 2) not null default 0,
  credits_earned numeric(5, 2) not null default 0,
  status text not null check (status in ('validated', 'compensated', 'failed', 'incomplete', 'jury')),
  subjects jsonb not null default '[]'::jsonb,
  computed_at timestamptz not null default now(),
  unique (enrollment_id, academic_period_id, teaching_unit_id),
  unique (organization_id, id),
  foreign key (organization_id, enrollment_id) references public.enrollments (organization_id, id) on delete cascade,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete cascade,
  foreign key (organization_id, academic_period_id) references public.academic_periods (organization_id, id) on delete cascade,
  foreign key (organization_id, teaching_unit_id) references public.teaching_units (organization_id, id) on delete cascade
);
create index ue_results_student_idx on public.ue_results (student_id);

create table public.semester_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  enrollment_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  academic_period_id uuid not null,
  average numeric(5, 2),
  credits_total numeric(6, 2) not null default 0,
  credits_earned numeric(6, 2) not null default 0,
  validated boolean not null default false,
  compensated boolean not null default false,
  retake_needed boolean not null default false,
  has_retake boolean not null default false,
  rank integer,
  population integer,
  absences integer not null default 0,
  decision text,
  published_at timestamptz,
  computed_at timestamptz not null default now(),
  unique (enrollment_id, academic_period_id),
  unique (organization_id, id),
  foreign key (organization_id, enrollment_id) references public.enrollments (organization_id, id) on delete cascade,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete cascade,
  foreign key (organization_id, academic_period_id) references public.academic_periods (organization_id, id) on delete cascade
);
create index semester_results_student_idx on public.semester_results (student_id);

-- Promotions dont l'utilisateur est responsable de filière.
create or replace function app.my_program_class_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(c.id), '{}')
  from public.classes c
  join public.programs p on p.id = c.program_id
  where p.responsible_id = any (app.my_staff_ids());
$$;

create or replace function app.can_deliberate_class(p_class uuid, p_manage boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class
      and (app.has_permission(c.organization_id, case when p_manage then 'deliberations.manage' else 'deliberations.read' end)
           or (not p_manage and c.id = any (app.my_program_class_ids()))
           or (p_manage and app.has_permission(c.organization_id, 'grades.manage')))
  );
$$;

create or replace function public.compute_university_results(p_class_id uuid, p_period_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_rules jsonb;
  v_ranking boolean;
  v_pass numeric;
  v_cap numeric;
  v_elim numeric;
  v_rule text;
  v_absent_zero boolean;
  v_ue_comp boolean;
  v_sem_comp boolean;
  v_weight text;
  v_count integer;
  v_period public.academic_periods;
begin
  select * into v_class from public.classes where id = p_class_id;
  if v_class.id is null or not app.is_higher_org(v_class.organization_id) then
    raise exception 'Promotion universitaire introuvable.' using errcode = 'no_data_found';
  end if;
  if not app.can_deliberate_class(p_class_id, true) then
    raise exception 'Permission requise : deliberations.manage' using errcode = 'insufficient_privilege';
  end if;
  select * into v_period from public.academic_periods where id = p_period_id and academic_year_id = v_class.academic_year_id;
  if v_period.id is null then
    raise exception 'Ce semestre n''appartient pas à l''année de la promotion.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.deliberations d where d.class_id = p_class_id and d.academic_period_id = p_period_id and d.status = 'closed') then
    raise exception 'La délibération de ce semestre est close : rouvrez-la pour recalculer.' using errcode = 'check_violation';
  end if;
  v_rules := app.org_university(v_class.organization_id) -> 'rules';
  v_ranking := app.university_feature(v_class.organization_id, 'ranking');
  v_pass := coalesce((v_rules ->> 'pass_mark')::numeric, 10);
  v_cap := coalesce((v_rules ->> 'retake_cap')::numeric, 10);
  v_elim := (v_rules ->> 'eliminatory_mark')::numeric;
  v_rule := coalesce(v_rules ->> 'retake_rule', 'best');
  v_absent_zero := coalesce((v_rules ->> 'absent_as_zero')::boolean, true);
  v_ue_comp := coalesce((v_rules ->> 'ue_compensation')::boolean, true);
  v_sem_comp := coalesce((v_rules ->> 'semester_compensation')::boolean, true);
  v_weight := coalesce(v_rules ->> 'semester_weighting', 'credits');

  delete from public.ue_results where class_id = p_class_id and academic_period_id = p_period_id;
  delete from public.semester_results where class_id = p_class_id and academic_period_id = p_period_id;

  -- Matières de la promotion rattachées à une UE du semestre (rang du semestre dans l'année).
  insert into public.ue_results (organization_id, enrollment_id, student_id, class_id, academic_period_id, teaching_unit_id,
                                 session1_average, retake_average, average, credits, credits_earned, status, subjects)
  with enr as (
    select e.id as enrollment_id, e.student_id from public.enrollments e where e.class_id = p_class_id and e.status = 'validated'
  ),
  mat as (
    select cs.id as class_subject_id, s.id as subject_id, s.name, s.teaching_unit_id,
           coalesce(s.coefficient, cs.coefficient, 1) as coef
    from public.class_subjects cs
    join public.subjects s on s.id = cs.subject_id
    join public.teaching_units tu on tu.id = s.teaching_unit_id and tu.semester_no = v_period.sequence
    where cs.class_id = p_class_id
  ),
  vals as (
    select enr.enrollment_id, enr.student_id, mat.subject_id, mat.teaching_unit_id, (a.kind = 'retake') as retake, a.coefficient,
           case when g.id is null or g.is_exempt then null
                when g.is_absent then case when v_absent_zero then 0 end
                when g.score is null then null
                else g.score / a.max_score * 20 end as v
    from enr cross join mat
    join public.assessments a on a.class_subject_id = mat.class_subject_id and a.academic_period_id = p_period_id
    left join public.grades g on g.assessment_id = a.id and g.student_id = enr.student_id
  ),
  subj as (
    select enr.enrollment_id, enr.student_id, mat.subject_id, mat.name, mat.teaching_unit_id, mat.coef,
           (select round(sum(v * coefficient) / nullif(sum(case when v is not null then coefficient end), 0), 2)
              from vals where vals.enrollment_id = enr.enrollment_id and vals.subject_id = mat.subject_id and not retake) as s1,
           (select round(sum(v * coefficient) / nullif(sum(case when v is not null then coefficient end), 0), 2)
              from vals where vals.enrollment_id = enr.enrollment_id and vals.subject_id = mat.subject_id and retake) as r
    from enr cross join mat
    -- Inscription pédagogique : si l'étudiant en a une pour le semestre, seules ses UE comptent.
    where not exists (select 1 from public.course_registrations cr where cr.enrollment_id = enr.enrollment_id and cr.academic_period_id = p_period_id)
       or exists (select 1 from public.course_registrations cr where cr.enrollment_id = enr.enrollment_id and cr.academic_period_id = p_period_id
                  and cr.teaching_unit_id = mat.teaching_unit_id and cr.status = 'registered')
  ),
  subj_final as (
    select subj.*,
           case when r is null then s1
                when v_rule = 'replace' then r
                when v_rule = 'cap' then greatest(coalesce(s1, 0), least(r, v_cap))
                when v_rule = 'average' then round((coalesce(s1, r) + r) / 2, 2)
                else greatest(coalesce(s1, 0), r) end as final
    from subj
  ),
  ue as (
    select sf.enrollment_id, sf.student_id, sf.teaching_unit_id, tu.credits,
           round(sum(sf.s1 * sf.coef) / nullif(sum(case when sf.s1 is not null then sf.coef end), 0), 2) as s1,
           case when bool_or(sf.r is not null)
                then round(sum(coalesce(sf.r, sf.s1) * sf.coef) / nullif(sum(case when coalesce(sf.r, sf.s1) is not null then sf.coef end), 0), 2) end as r,
           round(sum(sf.final * sf.coef) / nullif(sum(case when sf.final is not null then sf.coef end), 0), 2) as avg,
           bool_or(sf.final is null) as incomplete,
           jsonb_agg(jsonb_build_object('subject_id', sf.subject_id, 'name', sf.name, 'coefficient', sf.coef,
                                        'session1', sf.s1, 'retake', sf.r, 'average', sf.final) order by sf.name) as subjects
    from subj_final sf join public.teaching_units tu on tu.id = sf.teaching_unit_id
    group by sf.enrollment_id, sf.student_id, sf.teaching_unit_id, tu.credits
  )
  select v_class.organization_id, ue.enrollment_id, ue.student_id, p_class_id, p_period_id, ue.teaching_unit_id,
         ue.s1, ue.r, ue.avg, ue.credits,
         case when ue.avg >= v_pass then ue.credits else 0 end,
         case when ue.avg is null then 'incomplete' when ue.avg >= v_pass then 'validated' else 'failed' end,
         ue.subjects
  from ue;

  -- Semestre : moyenne pondérée des UE ; compensation ; crédits ; rattrapage.
  insert into public.semester_results (organization_id, enrollment_id, student_id, class_id, academic_period_id,
                                       average, credits_total, credits_earned, validated, compensated, retake_needed, has_retake)
  select v_class.organization_id, ur.enrollment_id, ur.student_id, p_class_id, p_period_id,
         round(sum(ur.average * case when v_weight = 'credits' then nullif(ur.credits, 0) else tu.coefficient end)
               / nullif(sum(case when ur.average is not null then case when v_weight = 'credits' then nullif(ur.credits, 0) else tu.coefficient end end), 0), 2),
         sum(ur.credits), sum(ur.credits_earned), false, false, false, bool_or(ur.retake_average is not null)
  from public.ue_results ur join public.teaching_units tu on tu.id = ur.teaching_unit_id
  where ur.class_id = p_class_id and ur.academic_period_id = p_period_id
  group by ur.enrollment_id, ur.student_id;

  update public.semester_results sr
     set validated = case
           when sr.average is null then false
           when bool_and_ok.all_ok then true
           when v_sem_comp and sr.average >= v_pass and not bool_and_ok.eliminated then true
           else false end,
         compensated = not bool_and_ok.all_ok and v_sem_comp and sr.average >= v_pass and not bool_and_ok.eliminated
    from (
      select ur.enrollment_id, bool_and(ur.status = 'validated') as all_ok,
             coalesce(bool_or(v_elim is not null and ur.average < v_elim), false) as eliminated
      from public.ue_results ur where ur.class_id = p_class_id and ur.academic_period_id = p_period_id
      group by ur.enrollment_id
    ) bool_and_ok
   where sr.enrollment_id = bool_and_ok.enrollment_id and sr.class_id = p_class_id and sr.academic_period_id = p_period_id;

  -- Compensation : les UE non validées d'un semestre validé sont acquises par compensation.
  if v_ue_comp then
    update public.ue_results ur set status = 'compensated', credits_earned = ur.credits
      from public.semester_results sr
     where sr.enrollment_id = ur.enrollment_id and sr.academic_period_id = ur.academic_period_id
       and ur.class_id = p_class_id and ur.academic_period_id = p_period_id and sr.validated and ur.status = 'failed';
  end if;
  update public.semester_results sr
     set credits_earned = (select coalesce(sum(credits_earned), 0) from public.ue_results ur
                           where ur.enrollment_id = sr.enrollment_id and ur.academic_period_id = sr.academic_period_id),
         retake_needed = not sr.validated and not sr.has_retake
   where sr.class_id = p_class_id and sr.academic_period_id = p_period_id;

  -- Absences au semestre (appels validés et cours manqués à la tablette).
  update public.semester_results sr
     set absences = (select count(*) from public.attendance_records ar join public.attendance_sessions ats on ats.id = ar.session_id
                     where ar.student_id = sr.student_id and ats.class_id = p_class_id and ar.status = 'absent'
                       and ats.session_date between v_period.starts_on and v_period.ends_on)
   where sr.class_id = p_class_id and sr.academic_period_id = p_period_id;

  if v_ranking then
    update public.semester_results sr set rank = r.rk, population = r.n
      from (select id, rank() over (order by average desc nulls last) as rk, count(*) over () as n
            from public.semester_results where class_id = p_class_id and academic_period_id = p_period_id) r
     where sr.id = r.id;
  end if;

  select count(*) into v_count from public.semester_results where class_id = p_class_id and academic_period_id = p_period_id;
  perform app.audit(v_class.organization_id, 'university.results_computed', 'classes', p_class_id,
                    'Résultats calculés — ' || v_class.name || ' — ' || v_period.name, jsonb_build_object('students', v_count));
  return v_count;
end;
$$;
revoke execute on function public.compute_university_results(uuid, uuid) from public, anon;
grant execute on function public.compute_university_results(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- DÉLIBÉRATIONS : jury, décisions (historique de chaque décision), clôture, PV
-- -----------------------------------------------------------------------------
create table public.deliberations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  class_id uuid not null,
  academic_period_id uuid,
  session text not null default 'normal' check (session in ('normal', 'retake')),
  title text not null check (length(btrim(title)) between 3 and 200),
  held_on date,
  president text check (president is null or length(president) <= 160),
  members text check (members is null or length(members) <= 2000),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  notes text check (notes is null or length(notes) <= 4000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete cascade,
  foreign key (organization_id, academic_period_id) references public.academic_periods (organization_id, id) on delete cascade
);
create unique index deliberations_one_per_session on public.deliberations (class_id, coalesce(academic_period_id, '00000000-0000-0000-0000-000000000000'::uuid), session);

create table public.deliberation_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  deliberation_id uuid not null,
  enrollment_id uuid not null,
  student_id uuid not null,
  average numeric(5, 2),
  credits_earned numeric(6, 2),
  credits_total numeric(6, 2),
  absences integer,
  proposed_decision text,
  decision text,
  validate_credits boolean not null default false,
  comment text check (comment is null or length(comment) <= 1000),
  version integer not null default 1,
  is_current boolean not null default true,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, deliberation_id) references public.deliberations (organization_id, id) on delete cascade,
  foreign key (organization_id, enrollment_id) references public.enrollments (organization_id, id) on delete cascade,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade
);
create unique index deliberation_decisions_current on public.deliberation_decisions (deliberation_id, student_id) where is_current;

-- Historique : une décision n'est jamais modifiée ; une nouvelle version la remplace.
create or replace function app.deliberation_decision_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'is_current') is distinct from (to_jsonb(old) - 'is_current') then
    raise exception 'Une décision du jury n''est jamais modifiée : une nouvelle version est enregistrée.' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'L''historique des décisions du jury est conservé.' using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger deliberation_decisions_guard
  before update or delete on public.deliberation_decisions
  for each row execute function app.deliberation_decision_guard();

create or replace function app.default_decision(p_org uuid, p_validated boolean, p_compensated boolean, p_retake_needed boolean, p_session text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_validated and p_compensated then d ->> 'compensated'
    when p_validated then d ->> 'validated'
    when p_retake_needed and p_session = 'normal' then d ->> 'retake'
    else d ->> 'failed' end
  from (select app.org_university(p_org) -> 'decisions' as d) x;
$$;

-- Prépare la délibération : calcule les résultats et propose une décision par étudiant.
create or replace function public.deliberation_prepare(p_deliberation_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d public.deliberations;
  v_count integer;
  v_rules jsonb;
begin
  select * into v_d from public.deliberations where id = p_deliberation_id;
  if v_d.id is null or not app.can_deliberate_class(v_d.class_id, true) then
    raise exception 'Permission requise : deliberations.manage' using errcode = 'insufficient_privilege';
  end if;
  if v_d.status = 'closed' then
    raise exception 'Délibération close.' using errcode = 'check_violation';
  end if;
  v_rules := app.org_university(v_d.organization_id) -> 'rules';
  if v_d.academic_period_id is not null then
    perform public.compute_university_results(v_d.class_id, v_d.academic_period_id);
    insert into public.deliberation_decisions (organization_id, deliberation_id, enrollment_id, student_id, average, credits_earned,
                                               credits_total, absences, proposed_decision, decision, version)
    select v_d.organization_id, v_d.id, sr.enrollment_id, sr.student_id, sr.average, sr.credits_earned, sr.credits_total, sr.absences,
           app.default_decision(v_d.organization_id, sr.validated, sr.compensated, sr.retake_needed, v_d.session),
           app.default_decision(v_d.organization_id, sr.validated, sr.compensated, sr.retake_needed, v_d.session), 1
    from public.semester_results sr
    where sr.class_id = v_d.class_id and sr.academic_period_id = v_d.academic_period_id
      and not exists (select 1 from public.deliberation_decisions x where x.deliberation_id = v_d.id and x.student_id = sr.student_id and x.is_current);
  else
    -- Délibération annuelle : crédits de l'année et moyenne des semestres.
    insert into public.deliberation_decisions (organization_id, deliberation_id, enrollment_id, student_id, average, credits_earned,
                                               credits_total, absences, proposed_decision, decision, version)
    select v_d.organization_id, v_d.id, y.enrollment_id, y.student_id, y.average, y.earned, y.total, y.absences, y.decision, y.decision, 1
    from (
      select sr.enrollment_id, sr.student_id, round(avg(sr.average), 2) as average, sum(sr.credits_earned) as earned,
             sum(sr.credits_total) as total, sum(sr.absences)::integer as absences,
             case when sum(sr.credits_earned) >= sum(sr.credits_total) * coalesce((v_rules ->> 'year_pass_ratio')::numeric, 1)
                  then d ->> 'year_pass'
                  when sum(sr.credits_earned) >= sum(sr.credits_total) * coalesce((v_rules ->> 'conditional_pass_ratio')::numeric, 0.75)
                  then d ->> 'year_conditional'
                  else d ->> 'year_repeat' end as decision
      from public.semester_results sr
      cross join (select app.org_university(v_d.organization_id) -> 'decisions' as d) dd
      where sr.class_id = v_d.class_id
      group by sr.enrollment_id, sr.student_id, dd.d
    ) y
    where not exists (select 1 from public.deliberation_decisions x where x.deliberation_id = v_d.id and x.student_id = y.student_id and x.is_current);
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.deliberation_prepare(uuid) from public, anon;
grant execute on function public.deliberation_prepare(uuid) to authenticated;

-- Décision du jury : nouvelle version (l'ancienne reste dans l'historique).
create or replace function public.deliberation_decide(p_deliberation_id uuid, p_student_id uuid, p_decision text, p_comment text default null, p_validate_credits boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d public.deliberations;
  v_prev public.deliberation_decisions;
  v_id uuid;
begin
  select * into v_d from public.deliberations where id = p_deliberation_id;
  if v_d.id is null or not app.can_deliberate_class(v_d.class_id, true) then
    raise exception 'Permission requise : deliberations.manage' using errcode = 'insufficient_privilege';
  end if;
  if v_d.status = 'closed' then
    raise exception 'Délibération close : rouvrez-la pour modifier une décision.' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_decision), '') = '' or length(p_decision) > 160 then
    raise exception 'Décision du jury obligatoire (160 caractères maximum).' using errcode = 'check_violation';
  end if;
  select * into v_prev from public.deliberation_decisions where deliberation_id = v_d.id and student_id = p_student_id and is_current;
  if v_prev.id is null then
    raise exception 'Étudiant absent de cette délibération : préparez-la d''abord.' using errcode = 'no_data_found';
  end if;
  update public.deliberation_decisions set is_current = false where id = v_prev.id;
  insert into public.deliberation_decisions (organization_id, deliberation_id, enrollment_id, student_id, average, credits_earned, credits_total,
                                             absences, proposed_decision, decision, validate_credits, comment, version, decided_by, decided_at)
  values (v_d.organization_id, v_d.id, v_prev.enrollment_id, v_prev.student_id, v_prev.average,
          case when p_validate_credits then v_prev.credits_total else v_prev.credits_earned end, v_prev.credits_total,
          v_prev.absences, v_prev.proposed_decision, btrim(p_decision), p_validate_credits, nullif(btrim(p_comment), ''),
          v_prev.version + 1, auth.uid(), now())
  returning id into v_id;
  perform app.audit(v_d.organization_id, 'university.jury_decision', 'deliberation_decisions', v_id,
                    'Décision du jury : ' || btrim(p_decision), jsonb_build_object('student_id', p_student_id, 'previous', v_prev.decision));
  return v_id;
end;
$$;
revoke execute on function public.deliberation_decide(uuid, uuid, text, text, boolean) from public, anon;
grant execute on function public.deliberation_decide(uuid, uuid, text, text, boolean) to authenticated;

-- Clôture : décisions figées, résultats publiés (portail étudiant), notification.
create or replace function public.deliberation_close(p_deliberation_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d public.deliberations;
  v_row record;
begin
  select * into v_d from public.deliberations where id = p_deliberation_id for update;
  if v_d.id is null or not app.can_deliberate_class(v_d.class_id, true) then
    raise exception 'Permission requise : deliberations.manage' using errcode = 'insufficient_privilege';
  end if;
  if v_d.status = 'closed' then
    return;
  end if;
  if not exists (select 1 from public.deliberation_decisions where deliberation_id = v_d.id and is_current) then
    raise exception 'Aucune décision : préparez la délibération avant de la clore.' using errcode = 'check_violation';
  end if;
  update public.deliberations set status = 'closed', closed_at = now(), closed_by = auth.uid(), held_on = coalesce(held_on, current_date)
   where id = v_d.id;
  if v_d.academic_period_id is not null then
    update public.semester_results sr
       set decision = dd.decision,
           published_at = now(),
           validated = sr.validated or dd.validate_credits,
           credits_earned = case when dd.validate_credits then sr.credits_total else sr.credits_earned end
      from public.deliberation_decisions dd
     where dd.deliberation_id = v_d.id and dd.is_current and dd.enrollment_id = sr.enrollment_id
       and sr.academic_period_id = v_d.academic_period_id;
    update public.ue_results ur set status = 'jury', credits_earned = ur.credits
      from public.deliberation_decisions dd
     where dd.deliberation_id = v_d.id and dd.is_current and dd.validate_credits and dd.enrollment_id = ur.enrollment_id
       and ur.academic_period_id = v_d.academic_period_id and ur.credits_earned < ur.credits;
  end if;
  for v_row in
    select s.user_id from public.deliberation_decisions dd join public.students s on s.id = dd.student_id
    where dd.deliberation_id = v_d.id and dd.is_current and s.user_id is not null
  loop
    perform app.notify(v_d.organization_id, v_row.user_id, 'university.results', 'Résultats publiés',
                       'Les résultats de « ' || v_d.title || ' » sont disponibles.', '/portail/resultats', '{}'::jsonb);
  end loop;
  perform app.audit(v_d.organization_id, 'university.deliberation_closed', 'deliberations', v_d.id, 'Délibération close : ' || v_d.title);
end;
$$;
revoke execute on function public.deliberation_close(uuid) from public, anon;
grant execute on function public.deliberation_close(uuid) to authenticated;

create or replace function public.deliberation_reopen(p_deliberation_id uuid, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_d public.deliberations;
begin
  select * into v_d from public.deliberations where id = p_deliberation_id for update;
  if v_d.id is null or not app.has_permission(v_d.organization_id, 'deliberations.manage') then
    raise exception 'Permission requise : deliberations.manage' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(length(btrim(p_reason)), 0) < 5 then
    raise exception 'Motif de réouverture obligatoire.' using errcode = 'check_violation';
  end if;
  update public.deliberations set status = 'open', closed_at = null, closed_by = null where id = v_d.id;
  if v_d.academic_period_id is not null then
    update public.semester_results set published_at = null where class_id = v_d.class_id and academic_period_id = v_d.academic_period_id;
  end if;
  perform app.audit(v_d.organization_id, 'university.deliberation_reopened', 'deliberations', v_d.id, 'Délibération rouverte : ' || btrim(p_reason));
end;
$$;
revoke execute on function public.deliberation_reopen(uuid, text) from public, anon;
grant execute on function public.deliberation_reopen(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- STAGES (table commune enrichie), MÉMOIRES / THÈSES, SOUTENANCES
-- -----------------------------------------------------------------------------
alter table public.internships
  add column host_kind text not null default 'entreprise' check (host_kind in ('entreprise', 'organisme', 'administration', 'laboratoire', 'autre')),
  add column supervisor_name text check (supervisor_name is null or length(supervisor_name) <= 160),
  add column convention_signed boolean not null default false,
  add column convention_file_id uuid references public.file_objects (id) on delete set null,
  add column report_file_id uuid references public.file_objects (id) on delete set null;

create table public.theses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null,
  enrollment_id uuid,
  academic_year_id uuid,
  kind text not null default 'memoire' check (kind in ('memoire', 'these', 'projet')),
  title text not null check (length(btrim(title)) between 5 and 300),
  summary text check (summary is null or length(summary) <= 4000),
  director_id uuid,
  director_name text check (director_name is null or length(director_name) <= 160),
  co_director_name text check (co_director_name is null or length(co_director_name) <= 160),
  jury text check (jury is null or length(jury) <= 2000),
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'in_progress', 'submitted', 'defended', 'abandoned')),
  file_id uuid references public.file_objects (id) on delete set null,
  grade numeric(5, 2) check (grade is null or grade between 0 and 20),
  mention text check (mention is null or length(mention) <= 80),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, enrollment_id) references public.enrollments (organization_id, id) on delete set null (enrollment_id),
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete set null (academic_year_id),
  foreign key (organization_id, director_id) references public.staff_members (organization_id, id) on delete set null (director_id)
);
create index theses_student_idx on public.theses (student_id);

create table public.defenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null,
  thesis_id uuid,
  title text not null check (length(btrim(title)) between 5 and 300),
  scheduled_at timestamptz not null,
  room_id uuid,
  jury jsonb not null default '[]'::jsonb check (jsonb_typeof(jury) = 'array'),
  status text not null default 'scheduled' check (status in ('scheduled', 'held', 'postponed', 'cancelled')),
  grade numeric(5, 2) check (grade is null or grade between 0 and 20),
  mention text check (mention is null or length(mention) <= 80),
  decision text check (decision is null or length(decision) <= 200),
  minutes text check (minutes is null or length(minutes) <= 4000),
  document_file_id uuid references public.file_objects (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, thesis_id) references public.theses (organization_id, id) on delete set null (thesis_id),
  foreign key (organization_id, room_id) references public.rooms (organization_id, id) on delete set null (room_id)
);
create index defenses_scheduled_idx on public.defenses (organization_id, scheduled_at);

-- Soutenance tenue avec une note → mémoire soutenu ; programmation → étudiant notifié.
create or replace function app.defense_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.status = 'held' and new.grade is not null and new.thesis_id is not null then
    update public.theses set status = 'defended', grade = new.grade, mention = coalesce(new.mention, mention) where id = new.thesis_id;
  end if;
  if tg_op = 'INSERT' or new.scheduled_at is distinct from old.scheduled_at then
    select user_id into v_user from public.students where id = new.student_id;
    if v_user is not null then
      perform app.notify(new.organization_id, v_user, 'university.defense', 'Soutenance programmée',
                         'Votre soutenance « ' || new.title || ' » est programmée le ' || to_char(new.scheduled_at, 'DD/MM/YYYY à HH24:MI') || '.',
                         '/portail/parcours', '{}'::jsonb);
    end if;
  end if;
  return new;
end;
$$;
create trigger defenses_after_write after insert or update on public.defenses for each row execute function app.defense_after_write();

-- -----------------------------------------------------------------------------
-- DIPLÔMES : délivrance numérotée, statut, historique (table commune enrichie)
-- -----------------------------------------------------------------------------
alter table public.student_diplomas drop constraint student_diplomas_source_check;
alter table public.student_diplomas add constraint student_diplomas_source_check check (source in ('import', 'manual', 'app'));
alter table public.student_diplomas
  add column program_id uuid,
  add column level_id uuid,
  add column academic_year_id uuid,
  add column status text not null default 'issued' check (status in ('issued', 'revoked')),
  add column conferred_on date,
  add column revoked_reason text check (revoked_reason is null or length(revoked_reason) <= 500),
  add column revoked_at timestamptz,
  add column issued_document_id uuid references public.issued_documents (id) on delete set null;
alter table public.student_diplomas
  add foreign key (organization_id, program_id) references public.programs (organization_id, id) on delete set null (program_id),
  add foreign key (organization_id, level_id) references public.levels (organization_id, id) on delete set null (level_id),
  add foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete set null (academic_year_id);

create or replace function app.diploma_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.source = 'app' then
      if not app.has_permission(new.organization_id, 'diplomas.manage') and auth.uid() is not null then
        raise exception 'Permission requise : diplomas.manage' using errcode = 'insufficient_privilege';
      end if;
      new.number := app.generate_number(new.organization_id, 'diploma', 'DIP-{CODE}-{YY}-{SEQ:5}');
      new.issued_on := coalesce(new.issued_on, current_date);
      new.status := 'issued';
    end if;
    return new;
  end if;
  if old.source = 'app' then
    if old.status = 'revoked' then
      raise exception 'Un diplôme révoqué ne peut plus être modifié.' using errcode = 'check_violation';
    end if;
    if (to_jsonb(new) - array['status', 'revoked_reason', 'revoked_at', 'issued_document_id', 'file_id'])
       is distinct from (to_jsonb(old) - array['status', 'revoked_reason', 'revoked_at', 'issued_document_id', 'file_id']) then
      raise exception 'Un diplôme délivré ne peut pas être modifié ; révoquez-le puis délivrez-en un nouveau.' using errcode = 'check_violation';
    end if;
    if new.status = 'revoked' then
      if coalesce(length(btrim(new.revoked_reason)), 0) < 3 then
        raise exception 'Motif de révocation obligatoire.' using errcode = 'check_violation';
      end if;
      new.revoked_at := now();
    end if;
  end if;
  return new;
end;
$$;
create trigger student_diplomas_guard before insert or update on public.student_diplomas for each row execute function app.diploma_guard();

-- =============================================================================
-- Briques communes étendues aux promotions universitaires
-- =============================================================================
-- Groupes facultatifs : ouverts aux promotions universitaires (règle des centres inchangée).
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
    if app.is_higher_org(new.organization_id) then
      -- Université : groupes (TD / TP) d'une promotion, s'ils sont activés.
      if not app.university_feature(new.organization_id, 'groups') then
        raise exception 'Les groupes ne sont pas activés (Paramètres universitaires).' using errcode = 'check_violation';
      end if;
    else
      if v_kind is distinct from 'training_session' then
        raise exception 'Les groupes ne concernent que les sessions de formation.' using errcode = 'check_violation';
      end if;
      if not coalesce((app.org_training(new.organization_id) ->> 'groups_enabled')::boolean, false) then
        raise exception 'Les classes / groupes ne sont pas activés pour ce centre (Formation → Paramètres).' using errcode = 'check_violation';
      end if;
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

-- Scan unifié : étudiants des promotions universitaires (contexte : année, semestre, filière, niveau,
-- groupe, cours, salle, horaire), sortie anticipée. Comportement des centres de formation inchangé.
alter table public.learner_attendance add column left_early_minutes integer not null default 0 check (left_early_minutes >= 0);
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
  v_higher boolean;
  v_early integer := 0;
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
  v_higher := app.is_higher_org(p_organization_id);
  v_cfg := coalesce(app.org_training(p_organization_id), app.org_university(p_organization_id) -> 'rules', app.default_training_settings());
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
             g.name as group_name, l.name as level_name, ay.name as year_name
        into v_enr
      from public.enrollments e
      join public.classes c on c.id = e.class_id and c.archived_at is null
      join public.academic_years ay on ay.id = c.academic_year_id
      left join public.programs p on p.id = c.program_id
      left join public.levels l on l.id = coalesce(e.level_id, c.level_id)
      left join public.training_groups g on g.id = e.group_id
      where e.student_id = v_student.id and e.organization_id = p_organization_id and e.status = 'validated'
        and (
          (c.kind = 'training_session' and (c.starts_on is null or c.starts_on <= v_today) and (c.ends_on is null or c.ends_on >= v_today))
          -- Université : promotion de l'année académique en cours.
          or (v_higher and c.kind = 'class' and v_today between coalesce(c.starts_on, ay.starts_on) and coalesce(c.ends_on, ay.ends_on))
        )
      order by c.starts_on desc nulls last, ay.starts_on desc
      limit 1;
      if v_enr.id is null then
        v_reason := 'no_active_session';
        v_message := case when v_higher then 'Aucune inscription pour l''année académique en cours.'
                          else 'Aucune session de formation en cours pour cet apprenant.' end;
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
        -- Université : si l'étudiant a une inscription pédagogique, seuls les cours de ses UE comptent.
        and (not v_higher or s.teaching_unit_id is null
             or not exists (select 1 from public.course_registrations cr where cr.enrollment_id = v_enr.id)
             or exists (select 1 from public.course_registrations cr where cr.enrollment_id = v_enr.id
                        and cr.teaching_unit_id = s.teaching_unit_id and cr.status = 'registered'))
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
    -- Université : sortie avant la fin du cours = sortie anticipée.
    if v_higher and v_row.timetable_slot_id is not null then
      select greatest(0, floor(extract(epoch from (ts.ends_at - v_time)) / 60))::integer into v_early
      from public.timetable_slots ts where ts.id = v_row.timetable_slot_id and v_time < ts.ends_at;
      v_early := coalesce(v_early, 0);
      if v_early > 0 then
        update public.learner_attendance set left_early_minutes = v_early where id = v_row.id;
      end if;
    end if;
    select coalesce(sum(floor(extract(epoch from (coalesce(exited_at, now()) - entered_at)) / 60)), 0)::integer into v_day
    from public.learner_attendance where student_id = v_student.id and attendance_date = v_today;
    v_message := case when v_early > 0 then 'Sortie anticipée (' || v_early || ' min avant la fin du cours). Présence : '
                      else 'Sortie enregistrée. Présence : ' end || app.format_minutes(v_period)
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
    'level', v_enr.level_name,
    'year', v_enr.year_name,
    'early_exit_minutes', case when v_kind = 'exit' then v_early end,
    'course', case when v_slot.subject is not null then jsonb_build_object(
      'subject', v_slot.subject, 'room', v_slot.room, 'teacher', v_slot.teacher,
      'starts_at', to_char(v_slot.starts_at, 'HH24:MI'), 'ends_at', to_char(v_slot.ends_at, 'HH24:MI')) end
  );
end;
$$;

revoke execute on function public.scan_badge(uuid, text, text, uuid) from public, anon;
grant execute on function public.scan_badge(uuid, text, text, uuid) to authenticated;

-- Occurrences de cours : aussi pour les promotions universitaires.
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
    select en.id, en.student_id, en.class_id, en.group_id, c.program_id,
           case when c.kind = 'training_session' then c.starts_on else coalesce(c.starts_on, ay.starts_on) end as starts_on,
           case when c.kind = 'training_session' then c.ends_on else coalesce(c.ends_on, ay.ends_on) end as ends_on
    from public.enrollments en
    join public.classes c on c.id = en.class_id and c.archived_at is null
    join public.academic_years ay on ay.id = c.academic_year_id
    join public.students s on s.id = en.student_id and s.archived_at is null
    where en.organization_id = p_org and en.status = 'validated' and (p_student is null or en.student_id = p_student)
      -- Sessions de formation, ou promotions universitaires (établissements d'enseignement supérieur).
      and (c.kind = 'training_session' or app.is_higher_org(p_org))
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
                     (select min(ay.starts_on) from public.enrollments e join public.academic_years ay on ay.id = e.academic_year_id
                      where e.student_id = v_student.id and e.status = 'validated' and ay.is_current and app.is_higher_org(v_student.organization_id)),
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

-- Tableau du jour : réutilisé par le tableau de bord universitaire.
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
    join public.classes c on c.id = ts.class_id and c.archived_at is null
      and (c.kind = 'training_session' or app.is_higher_org(p_organization_id))
    join public.academic_years ay on ay.id = c.academic_year_id and (c.kind = 'training_session' or v_date between ay.starts_on and ay.ends_on)
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

-- -----------------------------------------------------------------------------
-- STATISTIQUES UNIVERSITAIRES
-- -----------------------------------------------------------------------------
create or replace function public.university_statistics(p_organization_id uuid, p_from date default null, p_to date default null)
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
  v_year uuid;
  v_finance boolean;
  v_result jsonb;
begin
  if not app.is_higher_org(p_organization_id) then
    raise exception 'Réservé aux établissements d''enseignement supérieur.' using errcode = 'check_violation';
  end if;
  if not (app.has_permission(p_organization_id, 'reports.read') or app.has_permission(p_organization_id, 'deliberations.read')
          or app.has_permission(p_organization_id, 'academic.manage')) then
    raise exception 'Permission requise : reports.read' using errcode = 'insufficient_privilege';
  end if;
  v_finance := app.has_permission(p_organization_id, 'finance.read') or app.has_permission(p_organization_id, 'reports.finance');
  select timezone into v_tz from public.organizations where id = p_organization_id;
  v_today := (now() at time zone v_tz)::date;
  v_to := coalesce(p_to, v_today);
  v_from := coalesce(p_from, v_to - 29);
  select id into v_year from public.academic_years where organization_id = p_organization_id and is_current;

  with enr as (
    select e.* from public.enrollments e where e.organization_id = p_organization_id and e.academic_year_id = v_year and e.status = 'validated'
  ),
  occ as (select * from app.learner_occurrences(p_organization_id, v_from, v_to, null, true)),
  sr as (select * from public.semester_results where organization_id = p_organization_id
         and class_id in (select id from public.classes where academic_year_id = v_year)),
  inv as (
    select i.id, i.student_id, i.total,
           coalesce((select sum(p.amount) from public.payments p where p.invoice_id = i.id and p.status = 'completed'), 0) as paid
    from public.invoices i where i.organization_id = p_organization_id and i.status = 'issued' and i.academic_year_id = v_year
  )
  select jsonb_build_object(
    'from', v_from, 'to', v_to,
    'year', (select name from public.academic_years where id = v_year),
    'students_enrolled', (select count(distinct student_id) from enr),
    'students_active', (select count(*) from public.students where organization_id = p_organization_id and status = 'active' and archived_at is null),
    'teachers', (select count(*) from public.staff_members where organization_id = p_organization_id and is_teacher and status = 'active' and archived_at is null),
    'faculties', (select count(*) from public.faculties where organization_id = p_organization_id and is_active),
    'departments', (select count(*) from public.departments where organization_id = p_organization_id and is_active),
    'programs', (select count(*) from public.programs where organization_id = p_organization_id and is_active and kind <> 'training'),
    'tracks', (select count(*) from public.program_tracks where organization_id = p_organization_id and is_active),
    'teaching_units', (select count(*) from public.teaching_units where organization_id = p_organization_id and is_active),
    'courses', (select count(*) from public.class_subjects cs join public.classes c on c.id = cs.class_id where c.organization_id = p_organization_id and c.academic_year_id = v_year),
    'attendance_rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where attended) / count(*), 1) end from occ),
    'presences', (select count(*) from occ where attended),
    'absences', (select count(*) from occ where not attended),
    'lates', (select count(*) from public.learner_attendance where organization_id = p_organization_id and attendance_date between v_from and v_to and minutes_late > 0),
    'results', jsonb_build_object(
      'computed', (select count(*) from sr),
      'validated', (select count(*) from sr where validated),
      'published', (select count(*) from sr where published_at is not null),
      'success_rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where validated) / count(*), 1) end from sr)),
    'credits', jsonb_build_object('earned', (select coalesce(sum(credits_earned), 0) from sr), 'total', (select coalesce(sum(credits_total), 0) from sr)),
    'internships', jsonb_build_object(
      'ongoing', (select count(*) from public.internships where organization_id = p_organization_id and status = 'ongoing'),
      'total', (select count(*) from public.internships where organization_id = p_organization_id)),
    'theses', jsonb_build_object(
      'in_progress', (select count(*) from public.theses where organization_id = p_organization_id and status in ('approved', 'in_progress', 'submitted')),
      'defended', (select count(*) from public.theses where organization_id = p_organization_id and status = 'defended')),
    'defenses', jsonb_build_object(
      'upcoming', (select count(*) from public.defenses where organization_id = p_organization_id and status = 'scheduled' and scheduled_at >= now()),
      'held', (select count(*) from public.defenses where organization_id = p_organization_id and status = 'held')),
    'diplomas', (select count(*) from public.student_diplomas where organization_id = p_organization_id and source = 'app' and status = 'issued'),
    'finance', case when v_finance then jsonb_build_object(
      'invoiced', (select coalesce(sum(total), 0) from inv),
      'collected', (select coalesce(sum(paid), 0) from inv),
      'remaining', (select coalesce(sum(greatest(total - paid, 0)), 0) from inv),
      'students_with_balance', (select count(distinct student_id) from inv where total > paid)) end,
    'by_program', coalesce((select jsonb_agg(x order by x ->> 'name') from (
        select jsonb_build_object('name', p.name,
          'students', (select count(distinct student_id) from enr where enr.program_id = p.id),
          'success_rate', (select case when count(*) = 0 then null else round(100.0 * count(*) filter (where s.validated) / count(*), 1) end
                           from sr s join public.classes c on c.id = s.class_id where c.program_id = p.id)) as x
        from public.programs p where p.organization_id = p_organization_id and p.kind <> 'training' and p.is_active) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function public.university_statistics(uuid, date, date) from public, anon;
grant execute on function public.university_statistics(uuid, date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Documents universitaires (Document Studio) et sujets des documents émis
-- -----------------------------------------------------------------------------
alter table public.document_templates drop constraint document_templates_kind_check;
alter table public.document_templates add constraint document_templates_kind_check check (kind in (
  'school_certificate', 'attestation', 'training_certificate', 'training_attestation', 'enrollment_certificate',
  'success_certificate', 'internship_certificate', 'report_card', 'receipt', 'student_card', 'enrollment_form',
  'commitment_form', 'contract', 'convocation', 'transcript', 'custom'));
alter table public.issued_documents drop constraint issued_documents_subject_type_check;
alter table public.issued_documents add constraint issued_documents_subject_type_check check (subject_type in (
  'payment', 'report_card', 'enrollment', 'student', 'invoice', 'staff', 'dossier', 'deliberation', 'diploma'));

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.faculties enable row level security;
alter table public.departments enable row level security;
alter table public.academic_cycles enable row level security;
alter table public.program_tracks enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.teaching_units enable row level security;
alter table public.course_registrations enable row level security;
alter table public.ue_results enable row level security;
alter table public.semester_results enable row level security;
alter table public.deliberations enable row level security;
alter table public.deliberation_decisions enable row level security;
alter table public.theses enable row level security;
alter table public.defenses enable row level security;

do $$
declare
  t text;
begin
  -- Référentiel académique : lecture par les membres, écriture academic.manage.
  foreach t in array array['faculties', 'departments', 'academic_cycles', 'program_tracks', 'exam_sessions', 'teaching_units']
  loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated
                    using (organization_id = any ((select app.member_org_ids())::uuid[]))', t);
    execute format('create policy %1$s_write on public.%1$s for all to authenticated
                    using (organization_id = any ((select app.permitted_org_ids(''academic.manage''))::uuid[]))
                    with check (organization_id = any ((select app.permitted_org_ids(''academic.manage''))::uuid[]))', t);
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function app.touch_updated_at()', t);
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit_row()', t);
  end loop;
end;
$$;

create policy course_registrations_select on public.course_registrations for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('enrollments.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
    or exists (select 1 from public.enrollments e where e.id = enrollment_id
               and (e.class_id = any ((select app.my_taught_class_ids())::uuid[]) or e.class_id = any ((select app.my_program_class_ids())::uuid[])))
  );
create policy course_registrations_write on public.course_registrations for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('enrollments.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('enrollments.manage'))::uuid[]));

-- Résultats : écrits uniquement par les fonctions de calcul ; l'étudiant ne voit que ses résultats publiés.
create policy ue_results_select on public.ue_results for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('deliberations.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or class_id = any ((select app.my_program_class_ids())::uuid[])
    or (student_id = any ((select app.my_portal_student_ids())::uuid[])
        and exists (select 1 from public.semester_results sr where sr.enrollment_id = ue_results.enrollment_id
                    and sr.academic_period_id = ue_results.academic_period_id and sr.published_at is not null))
  );
create policy semester_results_select on public.semester_results for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('deliberations.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or class_id = any ((select app.my_program_class_ids())::uuid[])
    or (student_id = any ((select app.my_portal_student_ids())::uuid[]) and published_at is not null)
  );

create policy deliberations_select on public.deliberations for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('deliberations.read'))::uuid[])
    or class_id = any ((select app.my_program_class_ids())::uuid[])
  );
create policy deliberations_insert on public.deliberations for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('deliberations.manage'))::uuid[]));
create policy deliberations_update on public.deliberations for update to authenticated
  using (organization_id = any ((select app.permitted_org_ids('deliberations.manage'))::uuid[]) and status = 'open')
  with check (organization_id = any ((select app.permitted_org_ids('deliberations.manage'))::uuid[]));
create policy deliberation_decisions_select on public.deliberation_decisions for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('deliberations.read'))::uuid[])
    or exists (select 1 from public.deliberations d where d.id = deliberation_id and d.class_id = any ((select app.my_program_class_ids())::uuid[]))
    or (student_id = any ((select app.my_portal_student_ids())::uuid[]) and is_current
        and exists (select 1 from public.deliberations d where d.id = deliberation_id and d.status = 'closed'))
  );

create policy theses_select on public.theses for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('theses.manage'))::uuid[])
    or director_id = any ((select app.my_staff_ids())::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
  );
create policy theses_write on public.theses for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('theses.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('theses.manage'))::uuid[]));
create policy defenses_select on public.defenses for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('theses.manage'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
    or exists (select 1 from public.theses t where t.id = thesis_id and t.director_id = any ((select app.my_staff_ids())::uuid[]))
  );
create policy defenses_write on public.defenses for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('theses.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('theses.manage'))::uuid[]));

-- Stages : aussi gérés par theses.manage ; diplômes : délivrance par diplomas.manage, consultation par l'étudiant.
create policy internships_write_theses on public.internships for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('theses.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('theses.manage'))::uuid[]));
create policy student_diplomas_select_university on public.student_diplomas for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('diplomas.manage'))::uuid[])
    or (student_id = any ((select app.my_portal_student_ids())::uuid[]) and source = 'app')
  );
create policy student_diplomas_insert_university on public.student_diplomas for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('diplomas.manage'))::uuid[]) and source = 'app');
create policy student_diplomas_update_university on public.student_diplomas for update to authenticated
  using (organization_id = any ((select app.permitted_org_ids('diplomas.manage'))::uuid[]) and source = 'app')
  with check (organization_id = any ((select app.permitted_org_ids('diplomas.manage'))::uuid[]));

do $$
declare
  t text;
begin
  foreach t in array array['course_registrations', 'deliberations', 'deliberation_decisions', 'theses', 'defenses']
  loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s for each row execute function app.audit_row()', t);
  end loop;
  foreach t in array array['course_registrations', 'deliberations', 'theses', 'defenses']
  loop
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function app.touch_updated_at()', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Formule commerciale (inchangée en prix) : libellé universitaire
-- -----------------------------------------------------------------------------
update public.subscription_plans
   set name = 'Université',
       description = 'Universités, instituts et écoles supérieures : facultés, filières, parcours, UE et crédits, inscriptions administratives et pédagogiques, délibérations, mémoires, soutenances, diplômes.'
 where code = 'UNIVERSITE';
