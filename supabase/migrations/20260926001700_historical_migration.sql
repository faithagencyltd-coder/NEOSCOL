-- =============================================================================
-- NéoScol — 1700 Migration des données historiques (anciens élèves)
--
-- Une école qui adopte NéoScol importe son historique : anciens élèves,
-- anciennes années scolaires, parcours (classes fréquentées), notes, absences,
-- paiements, diplômes et certificats.
--
-- Principes :
--   * tout est rattaché à l'établissement (organization_id + clés étrangères
--     composites) et protégé par RLS : une école ne voit jamais les données
--     d'une autre ;
--   * l'import passe par un lot (migration_batches) et des lignes en attente
--     (migration_rows) : analyse, validation, doublons et import sont faits
--     en base, par des fonctions qui vérifient la permission students.import ;
--   * l'historique est stocké à part (student_history…) : les modules vivants
--     (bulletins, factures de l'année) ne sont pas modifiés ;
--   * chaque import est tracé (historique de migration + journal d'audit).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permission
-- -----------------------------------------------------------------------------
insert into public.permissions (code, module, label, sort_order) values
  ('students.import', 'students', 'Importer et migrer les données historiques (anciens élèves)', 44);

insert into public.role_permissions (role_id, permission_code)
select r.id, 'students.import'
from public.roles r
where r.key in ('org_admin', 'director', 'secretary', 'training_manager')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Élèves : statut « ancien élève » et informations d'origine
-- -----------------------------------------------------------------------------
alter table public.students drop constraint students_status_check;
alter table public.students add constraint students_status_check
  check (status in ('prospect', 'active', 'inactive', 'alumni', 'graduated', 'transferred', 'withdrawn'));

alter table public.students
  add column legacy_matricule text check (legacy_matricule is null or length(legacy_matricule) <= 60),
  add column entry_year smallint check (entry_year is null or entry_year between 1900 and 2100),
  add column exit_year smallint check (exit_year is null or exit_year between 1900 and 2100),
  add column legacy_program text check (legacy_program is null or length(legacy_program) <= 200),
  add column origin text not null default 'native' check (origin in ('native', 'import', 'manual_history')),
  add column import_batch_id uuid,
  add constraint students_entry_exit_check check (entry_year is null or exit_year is null or exit_year >= entry_year);
create index students_org_legacy_matricule_idx on public.students (organization_id, legacy_matricule) where legacy_matricule is not null;
create index students_org_birth_idx on public.students (organization_id, birth_date) where birth_date is not null;

comment on column public.students.legacy_matricule is 'Matricule attribué par l''ancien système de l''établissement (le matricule NéoScol reste permanent).';
comment on column public.students.origin is 'native : créé dans NéoScol ; import : migration d''un fichier ; manual_history : ancien élève saisi manuellement.';

-- Changement de statut : « ancien élève » devient une cible possible.
create or replace function public.change_student_status(p_student_id uuid, p_status text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_year uuid;
begin
  select * into v_student from public.students where id = p_student_id for update;
  if v_student.id is null or not app.has_permission(v_student.organization_id, 'students.archive') then
    raise exception 'Ce changement de statut nécessite la permission students.archive.' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('active', 'inactive', 'alumni', 'withdrawn', 'transferred', 'graduated') then
    raise exception 'Statut invalide.' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Le motif est obligatoire.' using errcode = 'check_violation';
  end if;
  if v_student.archived_at is not null then
    raise exception 'Ce dossier est archivé : restaurez-le avant de changer son statut.' using errcode = 'check_violation';
  end if;
  update public.students
     set status = p_status, status_reason = btrim(p_reason), status_changed_at = now()
   where id = p_student_id;
  -- Retrait / transfert : l'inscription de l'année en cours est annulée (historique conservé).
  if p_status in ('withdrawn', 'transferred') then
    select id into v_year from public.academic_years where organization_id = v_student.organization_id and is_current;
    update public.enrollments
       set status = 'cancelled', decision_reason = btrim(p_reason)
     where student_id = p_student_id and academic_year_id = v_year and status in ('validated', 'pending');
  end if;
  perform app.audit(v_student.organization_id, 'student.status_' || p_status, 'students', p_student_id,
                    v_student.first_name || ' ' || v_student.last_name || ' — ' || btrim(p_reason),
                    jsonb_build_object('from', v_student.status, 'to', p_status));
end;
$$;

-- -----------------------------------------------------------------------------
-- Lots d'import et lignes en attente
-- -----------------------------------------------------------------------------
create table public.migration_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('students', 'grades', 'payments')),
  status text not null default 'draft' check (status in ('draft', 'analyzed', 'importing', 'completed', 'cancelled')),
  file_name text not null check (length(file_name) between 1 and 200),
  file_size integer not null check (file_size > 0),
  file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  headers text[] not null default '{}',
  row_count integer not null default 0 check (row_count between 0 and 10000),
  mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  stats jsonb not null default '{}'::jsonb check (jsonb_typeof(stats) = 'object'),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  analyzed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  unique (organization_id, id)
);
create index migration_batches_org_idx on public.migration_batches (organization_id, created_at desc);

alter table public.students
  add constraint students_import_batch_fk foreign key (organization_id, import_batch_id)
  references public.migration_batches (organization_id, id) on delete set null (import_batch_id);

create table public.migration_rows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  batch_id uuid not null,
  row_number integer not null check (row_number > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  normalized jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'valid', 'warning', 'invalid', 'duplicate', 'imported', 'skipped', 'rejected')),
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  group_key text,
  duplicate_student_id uuid,
  duplicate_score smallint,
  duplicate_reasons text[],
  resolution text check (resolution in ('pending', 'existing', 'merge', 'create', 'skip')),
  student_id uuid,
  processed_at timestamptz,
  unique (batch_id, row_number),
  foreign key (organization_id, batch_id) references public.migration_batches (organization_id, id) on delete cascade,
  foreign key (organization_id, duplicate_student_id) references public.students (organization_id, id) on delete set null (duplicate_student_id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete set null (student_id)
);
create index migration_rows_batch_idx on public.migration_rows (batch_id, row_number);
create index migration_rows_group_idx on public.migration_rows (batch_id, group_key);

-- -----------------------------------------------------------------------------
-- Historique scolaire
-- -----------------------------------------------------------------------------
create table public.student_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid,
  year_label text not null check (length(btrim(year_label)) between 4 and 20),
  class_name text check (class_name is null or length(class_name) <= 120),
  level_name text check (level_name is null or length(level_name) <= 120),
  program_name text check (program_name is null or length(program_name) <= 200),
  average numeric(5, 2) check (average is null or average between 0 and 100),
  rank integer check (rank is null or rank > 0),
  decision text check (decision is null or length(decision) <= 200),
  absences integer check (absences is null or absences >= 0),
  absences_justified integer check (absences_justified is null or absences_justified >= 0),
  notes text check (notes is null or length(notes) <= 2000),
  source text not null default 'manual' check (source in ('import', 'manual')),
  batch_id uuid,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete set null (academic_year_id),
  foreign key (organization_id, batch_id) references public.migration_batches (organization_id, id) on delete set null (batch_id)
);
create index student_history_student_idx on public.student_history (student_id, year_label);
create index student_history_org_year_idx on public.student_history (organization_id, year_label);

create table public.student_history_grades (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid,
  year_label text not null check (length(btrim(year_label)) between 4 and 20),
  period_label text check (period_label is null or length(period_label) <= 60),
  subject text not null check (length(btrim(subject)) between 1 and 120),
  score numeric(6, 2) not null check (score >= 0),
  max_score numeric(6, 2) not null default 20 check (max_score > 0),
  coefficient numeric(5, 2) not null default 1 check (coefficient > 0),
  appreciation text check (appreciation is null or length(appreciation) <= 500),
  source text not null default 'import' check (source in ('import', 'manual')),
  batch_id uuid,
  created_at timestamptz not null default now(),
  check (score <= max_score),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete set null (academic_year_id),
  foreign key (organization_id, batch_id) references public.migration_batches (organization_id, id) on delete set null (batch_id)
);
create index student_history_grades_student_idx on public.student_history_grades (student_id, year_label);

create table public.student_history_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  academic_year_id uuid,
  year_label text check (year_label is null or length(btrim(year_label)) between 4 and 20),
  label text not null check (length(btrim(label)) between 1 and 200),
  amount numeric(14, 2) not null check (amount > 0),
  paid_on date,
  method text check (method is null or length(method) <= 60),
  reference text check (reference is null or length(reference) <= 120),
  source text not null default 'import' check (source in ('import', 'manual')),
  batch_id uuid,
  created_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete set null (academic_year_id),
  foreign key (organization_id, batch_id) references public.migration_batches (organization_id, id) on delete set null (batch_id)
);
create index student_history_payments_student_idx on public.student_history_payments (student_id, paid_on);

create table public.student_diplomas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  kind text not null default 'diploma' check (kind in ('diploma', 'certificate', 'attestation', 'other')),
  title text not null check (length(btrim(title)) between 2 and 200),
  year_label text check (year_label is null or length(btrim(year_label)) between 4 and 20),
  mention text check (mention is null or length(mention) <= 120),
  number text check (number is null or length(number) <= 120),
  issued_on date,
  issuer text check (issuer is null or length(issuer) <= 200),
  file_id uuid,
  notes text check (notes is null or length(notes) <= 1000),
  source text not null default 'manual' check (source in ('import', 'manual')),
  batch_id uuid,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade,
  foreign key (organization_id, file_id) references public.file_objects (organization_id, id) on delete set null (file_id),
  foreign key (organization_id, batch_id) references public.migration_batches (organization_id, id) on delete set null (batch_id)
);
create index student_diplomas_student_idx on public.student_diplomas (student_id);

-- -----------------------------------------------------------------------------
-- RLS : lecture avec students.read, écriture manuelle avec students.update ;
-- lots d'import visibles avec students.import (écriture uniquement par RPC).
-- -----------------------------------------------------------------------------
alter table public.migration_batches enable row level security;
alter table public.migration_rows enable row level security;
alter table public.student_history enable row level security;
alter table public.student_history_grades enable row level security;
alter table public.student_history_payments enable row level security;
alter table public.student_diplomas enable row level security;

create policy migration_batches_select on public.migration_batches for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.import'))::uuid[]));
create policy migration_rows_select on public.migration_rows for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.import'))::uuid[]));

create policy student_history_select on public.student_history for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[]));
create policy student_history_write on public.student_history for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[]));

create policy student_history_grades_select on public.student_history_grades for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[]));
create policy student_history_grades_write on public.student_history_grades for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[]));

-- Paiements historiques : données financières → finance.read pour les consulter.
create policy student_history_payments_select on public.student_history_payments for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[]));
create policy student_history_payments_write on public.student_history_payments for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.import'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('students.import'))::uuid[]));

create policy student_diplomas_select on public.student_diplomas for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[]));
create policy student_diplomas_write on public.student_diplomas for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[]));

do $$
declare
  t text;
begin
  foreach t in array array['student_history', 'student_history_grades', 'student_history_payments', 'student_diplomas']
  loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s
                    for each row execute function app.audit_row()', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Normalisation des valeurs importées
-- -----------------------------------------------------------------------------
create or replace function app.mig_date(p_value text)
returns date
language plpgsql
stable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_value, ''));
  m text[];
  y integer;
  n numeric;
begin
  if v = '' then
    return null;
  end if;
  m := regexp_match(v, '^(\d{4})-(\d{1,2})-(\d{1,2})');
  if m is not null then
    return make_date(m[1]::integer, m[2]::integer, m[3]::integer);
  end if;
  m := regexp_match(v, '^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$');
  if m is not null then
    y := m[3]::integer;
    if length(m[3]) = 2 then
      y := case when y > extract(year from current_date)::integer % 100 then 1900 + y else 2000 + y end;
    end if;
    return make_date(y, m[2]::integer, m[1]::integer);
  end if;
  -- Numéro de série Excel (jours depuis le 30/12/1899)
  if v ~ '^\d{4,5}(\.\d+)?$' then
    n := v::numeric;
    if n between 1000 and 80000 then
      return date '1899-12-30' + floor(n)::integer;
    end if;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- « 2015-2016 », « 2015/2016 », « 2015-16 » → « 2015-2016 » ; « 2015 » → « 2015-2016 ».
create or replace function app.mig_year_label(p_value text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p_value, ''), '\s+', '', 'g');
  m text[];
  y1 integer;
  y2 integer;
begin
  m := regexp_match(v, '^(\d{4})[-/_](\d{2}|\d{4})$');
  if m is not null then
    y1 := m[1]::integer;
    y2 := case when length(m[2]) = 2 then (y1 / 100) * 100 + m[2]::integer else m[2]::integer end;
    if y2 = y1 + 1 and y1 between 1950 and 2100 then
      return y1 || '-' || y2;
    end if;
    return null;
  end if;
  m := regexp_match(v, '^(\d{4})$');
  if m is not null and m[1]::integer between 1950 and 2100 then
    return m[1] || '-' || (m[1]::integer + 1);
  end if;
  return null;
end;
$$;

-- Année civile : première (entrée) ou dernière (sortie) année d'un libellé.
create or replace function app.mig_year(p_value text, p_last boolean)
returns smallint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p_value, ''), '\s+', '', 'g');
  l text;
begin
  if v ~ '^\d{4}$' then
    return case when v::integer between 1900 and 2100 then v::smallint end;
  end if;
  l := app.mig_year_label(v);
  if l is null then
    return null;
  end if;
  return (case when p_last then split_part(l, '-', 2) else split_part(l, '-', 1) end)::smallint;
end;
$$;

create or replace function app.mig_number(p_value text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := replace(regexp_replace(coalesce(p_value, ''), '[\s ]', '', 'g'), ',', '.');
begin
  if v = '' then
    return null;
  end if;
  v := regexp_replace(v, '(FCFA|CFA|XOF|F|€|EUR)$', '', 'i');
  if v !~ '^-?\d+(\.\d+)?$' then
    return null;
  end if;
  return v::numeric;
end;
$$;

create or replace function app.mig_sex(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when app.search_normalize(btrim(p_value)) in ('m', 'masculin', 'masc', 'garcon', 'homme', 'h', 'male', 'g') then 'M'
    when app.search_normalize(btrim(p_value)) in ('f', 'feminin', 'fem', 'fille', 'femme', 'female') then 'F'
  end;
$$;

-- Statut d'un ancien élève ; « archived » = dossier archivé.
create or replace function app.mig_status(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when v = '' then null
    when v like 'archiv%' then 'archived'
    when v like 'dipl%' or v like 'laureat%' or v = 'graduated' then 'graduated'
    when v like 'transf%' or v like 'mute%' then 'transferred'
    when v like 'retir%' or v like 'abandon%' or v like 'exclu%' or v like 'renvoy%' or v like 'demission%' or v = 'withdrawn' then 'withdrawn'
    when v like 'inacti%' then 'inactive'
    when v like 'ancien%' or v like 'sorti%' or v like 'parti%' or v = 'alumni' then 'alumni'
    when v like 'actif%' or v like 'active%' or v like 'en cours%' or v like 'inscrit%' then 'active'
  end
  from (select app.search_normalize(btrim(coalesce(p_value, ''))) as v) s;
$$;

-- -----------------------------------------------------------------------------
-- Détection des doublons (matricule, nom, prénom, date de naissance)
-- Score (sur 100) : matricule 45 · nom 20 (10 si proche) · prénom 20 (10 si proche) · naissance 40
-- (15 si homonyme dont la date manque). Doublon à partir de 50 ; « certain » à partir de 80.
-- -----------------------------------------------------------------------------
create or replace function public.find_student_duplicates(
  p_organization_id uuid, p_last_name text, p_first_name text, p_birth_date date, p_matricule text default null, p_limit integer default 5
)
returns table (student_id uuid, full_name text, matricule text, legacy_matricule text, birth_date date, status text, archived boolean, score integer, reasons text[])
language sql
stable
security invoker
set search_path = ''
as $$
  with input as (
    select app.search_normalize(btrim(p_last_name)) as ln,
           app.search_normalize(btrim(p_first_name)) as fn,
           nullif(btrim(coalesce(p_matricule, '')), '') as mat
  ),
  candidates as (
    select s.*, i.ln, i.fn, i.mat,
           app.search_normalize(s.last_name) as s_ln,
           app.search_normalize(s.first_name) as s_fn
    from public.students s, input i
    where s.organization_id = p_organization_id
      and (
        (i.mat is not null and (upper(s.legacy_matricule) = upper(i.mat) or upper(s.matricule) = upper(i.mat)))
        or app.search_normalize(s.last_name) = i.ln
        or (p_birth_date is not null and s.birth_date = p_birth_date)
      )
  ),
  scored as (
    select c.id, c.first_name, c.last_name, c.matricule, c.legacy_matricule, c.birth_date, c.status, c.archived_at,
           least(100,
             (case when c.mat is not null and (upper(c.legacy_matricule) = upper(c.mat) or upper(c.matricule) = upper(c.mat)) then 45 else 0 end)
             + (case when c.s_ln = c.ln then 20 when extensions.similarity(c.s_ln, c.ln) > 0.6 then 10 else 0 end)
             + (case when c.s_fn = c.fn then 20 when extensions.similarity(c.s_fn, c.fn) > 0.6 then 10 else 0 end)
             + (case when p_birth_date is not null and c.birth_date = p_birth_date then 40
                     -- Homonyme dont la date de naissance manque d'un côté : impossible de trancher.
                     when c.s_ln = c.ln and c.s_fn = c.fn and (p_birth_date is null or c.birth_date is null) then 15
                     else 0 end)
           ) as score,
           array_remove(array[
             case when c.mat is not null and (upper(c.legacy_matricule) = upper(c.mat) or upper(c.matricule) = upper(c.mat)) then 'matricule' end,
             case when c.s_ln = c.ln then 'nom' when extensions.similarity(c.s_ln, c.ln) > 0.6 then 'nom proche' end,
             case when c.s_fn = c.fn then 'prénom' when extensions.similarity(c.s_fn, c.fn) > 0.6 then 'prénom proche' end,
             case when p_birth_date is not null and c.birth_date = p_birth_date then 'date de naissance'
                  when c.s_ln = c.ln and c.s_fn = c.fn and (p_birth_date is null or c.birth_date is null) then 'date de naissance inconnue' end
           ], null) as reasons
    from candidates c
  )
  select id, last_name || ' ' || first_name, matricule, legacy_matricule, birth_date, status, archived_at is not null, score, reasons
  from scored
  where score >= 50
  order by score desc, last_name, first_name
  limit greatest(1, least(p_limit, 20));
$$;
revoke execute on function public.find_student_duplicates(uuid, text, text, date, text, integer) from public, anon;
grant execute on function public.find_student_duplicates(uuid, text, text, date, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Années scolaires anciennes
-- -----------------------------------------------------------------------------
create or replace function app.mig_ensure_year(p_org uuid, p_label text, p_create boolean, inout p_created integer)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  y1 integer;
begin
  if p_label is null then
    return;
  end if;
  select id into v_id from public.academic_years where organization_id = p_org and name = p_label;
  if v_id is null and p_create and p_label ~ '^\d{4}-\d{4}$' then
    y1 := split_part(p_label, '-', 1)::integer;
    insert into public.academic_years (organization_id, name, starts_on, ends_on, is_current, status)
    values (p_org, p_label, make_date(y1, 9, 1), make_date(y1 + 1, 7, 31), false, 'closed')
    on conflict (organization_id, name) do nothing;
    if found then
      p_created := p_created + 1;
    end if;
  end if;
end;
$$;

create or replace function app.mig_year_id(p_org uuid, p_label text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.academic_years where organization_id = p_org and name = p_label;
$$;

-- Crée les années « AAAA-AAAA » de p_from à p_to (clôturées) qui n'existent pas encore.
create or replace function public.create_past_academic_years(p_organization_id uuid, p_from integer, p_to integer)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_created integer := 0;
  y integer;
begin
  if not (app.has_permission(p_organization_id, 'academic.manage') or app.has_permission(p_organization_id, 'students.import')) then
    raise exception 'Cette action nécessite la permission academic.manage ou students.import.' using errcode = 'insufficient_privilege';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_from < 1950 or p_to > extract(year from current_date)::integer or p_to - p_from > 60 then
    raise exception 'Période invalide (de 1950 à l''année en cours, 60 ans au plus).' using errcode = 'check_violation';
  end if;
  for y in p_from .. p_to loop
    select app.mig_ensure_year(p_organization_id, y || '-' || (y + 1), true, v_created) into v_created;
  end loop;
  perform app.audit(p_organization_id, 'migration.years_created', 'academic_years', null,
                    v_created || ' année(s) scolaire(s) ancienne(s) créée(s) (' || p_from || ' à ' || p_to || ')',
                    jsonb_build_object('from', p_from, 'to', p_to, 'created', v_created));
  return v_created;
end;
$$;
revoke execute on function public.create_past_academic_years(uuid, integer, integer) from public, anon;
grant execute on function public.create_past_academic_years(uuid, integer, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Lot d'import : création, ajout des lignes, annulation
-- -----------------------------------------------------------------------------
create or replace function app.mig_require(p_batch_id uuid, p_statuses text[])
returns public.migration_batches
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_batch public.migration_batches;
begin
  select * into v_batch from public.migration_batches where id = p_batch_id;
  if v_batch.id is null or not app.has_permission(v_batch.organization_id, 'students.import') then
    raise exception 'Import introuvable ou permission students.import manquante.' using errcode = 'insufficient_privilege';
  end if;
  if not (v_batch.status = any (p_statuses)) then
    raise exception 'Cet import n''est plus modifiable (statut : %).', v_batch.status using errcode = 'check_violation';
  end if;
  return v_batch;
end;
$$;

create or replace function public.migration_create_batch(
  p_organization_id uuid, p_kind text, p_file_name text, p_file_size integer, p_file_sha256 text, p_headers text[]
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.has_permission(p_organization_id, 'students.import') then
    raise exception 'Cette action nécessite la permission students.import.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(array_length(p_headers, 1), 0) = 0 or array_length(p_headers, 1) > 80 then
    raise exception 'Le fichier doit contenir entre 1 et 80 colonnes.' using errcode = 'check_violation';
  end if;
  insert into public.migration_batches (organization_id, kind, file_name, file_size, file_sha256, headers)
  values (p_organization_id, p_kind, left(btrim(p_file_name), 200), p_file_size, p_file_sha256, p_headers)
  returning id into v_id;
  return v_id;
end;
$$;

-- p_rows : [{ "n": 2, "d": { "Nom": "…", … } }, …] (1 000 lignes au plus par appel)
create or replace function public.migration_append_rows(p_batch_id uuid, p_rows jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.migration_batches := app.mig_require(p_batch_id, array['draft']);
  v_count integer;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Envoi de 1 000 lignes au plus.' using errcode = 'check_violation';
  end if;
  if v_batch.row_count + jsonb_array_length(p_rows) > 10000 then
    raise exception 'Un import est limité à 10 000 lignes : découpez le fichier.' using errcode = 'check_violation';
  end if;
  insert into public.migration_rows (organization_id, batch_id, row_number, data)
  select v_batch.organization_id, p_batch_id, (r ->> 'n')::integer, r -> 'd'
  from jsonb_array_elements(p_rows) r
  where jsonb_typeof(r -> 'd') = 'object';
  get diagnostics v_count = row_count;
  update public.migration_batches set row_count = row_count + v_count where id = p_batch_id;
  return v_count;
end;
$$;

create or replace function public.migration_cancel(p_batch_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.migration_batches := app.mig_require(p_batch_id, array['draft', 'analyzed']);
begin
  delete from public.migration_rows where batch_id = p_batch_id;
  update public.migration_batches set status = 'cancelled', completed_at = now() where id = p_batch_id;
  perform app.audit(v_batch.organization_id, 'migration.cancelled', 'migration_batches', p_batch_id, 'Import annulé : ' || v_batch.file_name);
end;
$$;

-- -----------------------------------------------------------------------------
-- Analyse : correspondance des colonnes, normalisation, contrôles, doublons
-- p_mapping : { "last_name": "Nom", "birth_date": "Né(e) le", … }
-- p_options : { "default_status": "alumni", "create_years": true, "archive": false }
-- -----------------------------------------------------------------------------
create or replace function app.mig_value(p_data jsonb, p_mapping jsonb, p_field text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(left(btrim(p_data ->> (p_mapping ->> p_field)), 1000), '');
$$;

create or replace function public.migration_analyze(p_batch_id uuid, p_mapping jsonb, p_options jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.migration_batches := app.mig_require(p_batch_id, array['draft', 'analyzed']);
  v_org uuid := v_batch.organization_id;
  r record;
  v jsonb;
  v_issues jsonb;
  raw text;
  v_date date;
  v_num numeric;
  v_label text;
  v_status text;
  v_row_status text;
  v_dup record;
  v_key text;
  v_first integer;
  v_matches integer;
  v_student uuid;
  v_mat text;
  v_stats jsonb;
begin
  if jsonb_typeof(p_mapping) <> 'object' or jsonb_typeof(coalesce(p_options, '{}'::jsonb)) <> 'object' then
    raise exception 'Correspondance invalide.' using errcode = 'check_violation';
  end if;
  -- Colonnes inconnues refusées : la correspondance ne peut viser que les en-têtes du fichier.
  if exists (select 1 from jsonb_each_text(p_mapping) m where not (m.value = any (v_batch.headers))) then
    raise exception 'La correspondance vise une colonne absente du fichier.' using errcode = 'check_violation';
  end if;
  if v_batch.kind = 'students' and not (p_mapping ? 'last_name' and p_mapping ? 'first_name') then
    raise exception 'Associez au moins les colonnes Nom et Prénom.' using errcode = 'check_violation';
  end if;
  if v_batch.kind in ('grades', 'payments') and not (p_mapping ? 'student_ref' or (p_mapping ? 'last_name' and p_mapping ? 'first_name')) then
    raise exception 'Associez le matricule, ou le nom et le prénom, pour identifier l''élève.' using errcode = 'check_violation';
  end if;
  if v_batch.kind = 'grades' and not (p_mapping ? 'subject' and p_mapping ? 'score' and p_mapping ? 'year_label') then
    raise exception 'Associez au moins l''année scolaire, la matière et la note.' using errcode = 'check_violation';
  end if;
  if v_batch.kind = 'payments' and not (p_mapping ? 'amount') then
    raise exception 'Associez au moins la colonne Montant.' using errcode = 'check_violation';
  end if;

  for r in select * from public.migration_rows where batch_id = p_batch_id order by row_number loop
    v_issues := '[]'::jsonb;
    v := '{}'::jsonb;
    v_row_status := 'valid';
    v_student := null;

    -- Champs d'identité communs
    v := v || jsonb_strip_nulls(jsonb_build_object(
      'last_name', upper(app.mig_value(r.data, p_mapping, 'last_name')),
      'first_name', initcap(app.mig_value(r.data, p_mapping, 'first_name')),
      'legacy_matricule', app.mig_value(r.data, p_mapping, 'legacy_matricule'),
      'student_ref', app.mig_value(r.data, p_mapping, 'student_ref')
    ));
    raw := app.mig_value(r.data, p_mapping, 'birth_date');
    v_date := app.mig_date(raw);
    if raw is not null and v_date is null then
      v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'birth_date', 'message', 'Date de naissance illisible (« ' || raw || ' ») : ignorée.');
    elsif v_date is not null and (v_date < date '1900-01-02' or v_date > current_date) then
      v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'birth_date', 'message', 'Date de naissance improbable : ignorée.');
      v_date := null;
    end if;
    if v_date is not null then
      v := v || jsonb_build_object('birth_date', v_date);
    end if;

    if v_batch.kind = 'students' then
      if v ->> 'last_name' is null then
        v_issues := v_issues || jsonb_build_object('level', 'error', 'field', 'last_name', 'message', 'Nom manquant.');
      end if;
      if v ->> 'first_name' is null then
        v_issues := v_issues || jsonb_build_object('level', 'error', 'field', 'first_name', 'message', 'Prénom manquant.');
      end if;
      if v_date is null and raw is null then
        v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'birth_date', 'message', 'Date de naissance manquante : détection des doublons moins fiable.');
      end if;
      v := v || jsonb_strip_nulls(jsonb_build_object(
        'other_names', app.mig_value(r.data, p_mapping, 'other_names'),
        'birth_place', app.mig_value(r.data, p_mapping, 'birth_place'),
        'nationality', app.mig_value(r.data, p_mapping, 'nationality'),
        'phone', app.mig_value(r.data, p_mapping, 'phone'),
        'address', app.mig_value(r.data, p_mapping, 'address'),
        'city', app.mig_value(r.data, p_mapping, 'city'),
        'status_reason', app.mig_value(r.data, p_mapping, 'status_reason'),
        'class_name', app.mig_value(r.data, p_mapping, 'class_name'),
        'level_name', app.mig_value(r.data, p_mapping, 'level_name'),
        'program_name', app.mig_value(r.data, p_mapping, 'program_name'),
        'decision', app.mig_value(r.data, p_mapping, 'decision'),
        'diploma_title', app.mig_value(r.data, p_mapping, 'diploma_title'),
        'diploma_mention', app.mig_value(r.data, p_mapping, 'diploma_mention'),
        'notes', app.mig_value(r.data, p_mapping, 'notes')
      ));
      raw := app.mig_value(r.data, p_mapping, 'sex');
      if raw is not null then
        if app.mig_sex(raw) is null then
          v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'sex', 'message', 'Sexe non reconnu (« ' || raw || ' ») : ignoré.');
        else
          v := v || jsonb_build_object('sex', app.mig_sex(raw));
        end if;
      end if;
      raw := app.mig_value(r.data, p_mapping, 'email');
      if raw is not null then
        if raw ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
          v := v || jsonb_build_object('email', lower(raw));
        else
          v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'email', 'message', 'E-mail invalide : ignoré.');
        end if;
      end if;
      -- Statut
      raw := app.mig_value(r.data, p_mapping, 'status');
      v_status := coalesce(app.mig_status(raw), nullif(p_options ->> 'default_status', ''), 'alumni');
      if raw is not null and app.mig_status(raw) is null then
        v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'status', 'message', 'Statut non reconnu (« ' || raw || ' ») : « ancien élève » appliqué.');
      end if;
      if v_status not in ('active', 'inactive', 'alumni', 'graduated', 'transferred', 'withdrawn', 'archived') then
        v_status := 'alumni';
      end if;
      v := v || jsonb_build_object('status', v_status);
      -- Années d'entrée et de sortie, année scolaire de la ligne
      raw := app.mig_value(r.data, p_mapping, 'entry_year');
      if raw is not null then
        if app.mig_year(raw, false) is null then
          v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'entry_year', 'message', 'Année d''entrée illisible : ignorée.');
        else
          v := v || jsonb_build_object('entry_year', app.mig_year(raw, false));
        end if;
      end if;
      raw := app.mig_value(r.data, p_mapping, 'exit_year');
      if raw is not null then
        if app.mig_year(raw, true) is null then
          v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'exit_year', 'message', 'Année de sortie illisible : ignorée.');
        else
          v := v || jsonb_build_object('exit_year', app.mig_year(raw, true));
        end if;
      end if;
      if (v ->> 'entry_year')::integer > (v ->> 'exit_year')::integer then
        v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'exit_year', 'message', 'Année de sortie antérieure à l''entrée : ignorée.');
        v := v - 'exit_year';
      end if;
      raw := app.mig_value(r.data, p_mapping, 'year_label');
      v_label := app.mig_year_label(raw);
      if raw is not null and v_label is null then
        v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'year_label', 'message', 'Année scolaire illisible (« ' || raw || ' ») : parcours non importé pour cette ligne.');
      elsif v_label is not null then
        v := v || jsonb_build_object('year_label', v_label);
      end if;
      raw := app.mig_value(r.data, p_mapping, 'diploma_year');
      if raw is not null then
        v := v || jsonb_strip_nulls(jsonb_build_object('diploma_year', coalesce(app.mig_year_label(raw), raw)));
      end if;
      -- Valeurs numériques du parcours
      raw := app.mig_value(r.data, p_mapping, 'average');
      v_num := app.mig_number(raw);
      if raw is not null and (v_num is null or v_num < 0 or v_num > 100) then
        v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'average', 'message', 'Moyenne invalide (« ' || raw || ' ») : ignorée.');
      elsif v_num is not null then
        v := v || jsonb_build_object('average', round(v_num, 2));
      end if;
      raw := app.mig_value(r.data, p_mapping, 'rank');
      v_num := app.mig_number(raw);
      if v_num is not null and v_num >= 1 then
        v := v || jsonb_build_object('rank', floor(v_num)::integer);
      end if;
      raw := app.mig_value(r.data, p_mapping, 'absences');
      v_num := app.mig_number(raw);
      if raw is not null and (v_num is null or v_num < 0) then
        v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'absences', 'message', 'Nombre d''absences invalide : ignoré.');
      elsif v_num is not null then
        v := v || jsonb_build_object('absences', floor(v_num)::integer);
      end if;
      raw := app.mig_value(r.data, p_mapping, 'absences_justified');
      v_num := app.mig_number(raw);
      if v_num is not null and v_num >= 0 then
        v := v || jsonb_build_object('absences_justified', floor(v_num)::integer);
      end if;
      if (v ? 'class_name' or v ? 'average' or v ? 'absences') and not v ? 'year_label' then
        v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'year_label', 'message', 'Classe, moyenne ou absences sans année scolaire : parcours non importé.');
      end if;
    else
      -- Notes et paiements : l'élève doit déjà exister (import des anciens élèves au préalable).
      v_mat := coalesce(v ->> 'student_ref', v ->> 'legacy_matricule');
      v_matches := 0;
      if v_mat is not null then
        select count(*), min(s.id::text)::uuid into v_matches, v_student
        from public.students s
        where s.organization_id = v_org and (upper(s.matricule) = upper(v_mat) or upper(s.legacy_matricule) = upper(v_mat));
      end if;
      if v_matches = 0 and v ->> 'last_name' is not null and v ->> 'first_name' is not null then
        select count(*), min(s.id::text)::uuid into v_matches, v_student
        from public.students s
        where s.organization_id = v_org
          and app.search_normalize(s.last_name) = app.search_normalize(v ->> 'last_name')
          and app.search_normalize(s.first_name) = app.search_normalize(v ->> 'first_name')
          and (v_date is null or s.birth_date = v_date);
      end if;
      if v_matches = 0 then
        v_issues := v_issues || jsonb_build_object('level', 'error', 'field', 'student_ref', 'message', 'Élève introuvable : importez d''abord les anciens élèves.');
        v_student := null;
      elsif v_matches > 1 then
        v_issues := v_issues || jsonb_build_object('level', 'error', 'field', 'student_ref', 'message', 'Plusieurs élèves correspondent : précisez le matricule.');
        v_student := null;
      end if;
      raw := app.mig_value(r.data, p_mapping, 'year_label');
      v_label := app.mig_year_label(raw);
      if v_label is not null then
        v := v || jsonb_build_object('year_label', v_label);
      elsif raw is not null then
        v_issues := v_issues || jsonb_build_object('level', case when v_batch.kind = 'grades' then 'error' else 'warning' end, 'field', 'year_label', 'message', 'Année scolaire illisible (« ' || raw || ' »).');
      elsif v_batch.kind = 'grades' then
        v_issues := v_issues || jsonb_build_object('level', 'error', 'field', 'year_label', 'message', 'Année scolaire manquante.');
      end if;

      if v_batch.kind = 'grades' then
        v := v || jsonb_strip_nulls(jsonb_build_object(
          'subject', app.mig_value(r.data, p_mapping, 'subject'),
          'period_label', app.mig_value(r.data, p_mapping, 'period_label'),
          'appreciation', app.mig_value(r.data, p_mapping, 'appreciation'),
          'score', app.mig_number(app.mig_value(r.data, p_mapping, 'score')),
          'max_score', coalesce(app.mig_number(app.mig_value(r.data, p_mapping, 'max_score')), 20),
          'coefficient', coalesce(app.mig_number(app.mig_value(r.data, p_mapping, 'coefficient')), 1)
        ));
        if v ->> 'subject' is null then
          v_issues := v_issues || jsonb_build_object('level', 'error', 'field', 'subject', 'message', 'Matière manquante.');
        end if;
        if v ->> 'score' is null then
          v_issues := v_issues || jsonb_build_object('level', 'error', 'field', 'score', 'message', 'Note manquante ou illisible.');
        elsif (v ->> 'score')::numeric < 0 or (v ->> 'max_score')::numeric <= 0 or (v ->> 'score')::numeric > (v ->> 'max_score')::numeric then
          v_issues := v_issues || jsonb_build_object('level', 'error', 'field', 'score', 'message', 'Note hors barème (' || (v ->> 'score') || ' / ' || (v ->> 'max_score') || ').');
        end if;
        if (v ->> 'coefficient')::numeric <= 0 then
          v := v || jsonb_build_object('coefficient', 1);
        end if;
      else
        v := v || jsonb_strip_nulls(jsonb_build_object(
          'label', coalesce(app.mig_value(r.data, p_mapping, 'label'), 'Paiement (historique)'),
          'amount', app.mig_number(app.mig_value(r.data, p_mapping, 'amount')),
          'method', app.mig_value(r.data, p_mapping, 'method'),
          'reference', app.mig_value(r.data, p_mapping, 'reference')
        ));
        raw := app.mig_value(r.data, p_mapping, 'paid_on');
        if raw is not null then
          if app.mig_date(raw) is null then
            v_issues := v_issues || jsonb_build_object('level', 'warning', 'field', 'paid_on', 'message', 'Date de paiement illisible : ignorée.');
          else
            v := v || jsonb_build_object('paid_on', app.mig_date(raw));
          end if;
        end if;
        if v ->> 'amount' is null or (v ->> 'amount')::numeric <= 0 then
          v_issues := v_issues || jsonb_build_object('level', 'error', 'field', 'amount', 'message', 'Montant manquant ou invalide.');
        end if;
      end if;
    end if;

    if exists (select 1 from jsonb_array_elements(v_issues) i where i ->> 'level' = 'error') then
      v_row_status := 'invalid';
    elsif jsonb_array_length(v_issues) > 0 then
      v_row_status := 'warning';
    end if;

    -- Regroupement : plusieurs lignes d'un même élève (une par année) forment un seul dossier.
    v_key := null;
    if v_batch.kind = 'students' and v_row_status <> 'invalid' then
      v_key := coalesce('M:' || upper(v ->> 'legacy_matricule') || '|', '')
               || app.search_normalize(v ->> 'last_name') || '|' || app.search_normalize(v ->> 'first_name')
               || '|' || coalesce(v ->> 'birth_date', '?');
    end if;

    update public.migration_rows
       set normalized = v, issues = v_issues, status = v_row_status, group_key = v_key,
           student_id = v_student, duplicate_student_id = null, duplicate_score = null,
           duplicate_reasons = null, resolution = null, processed_at = null
     where id = r.id;
  end loop;

  if v_batch.kind = 'students' then
    -- Même élève et même année/classe sur deux lignes : ligne en double ignorée.
    update public.migration_rows mr
       set status = 'duplicate', resolution = 'skip',
           issues = mr.issues || jsonb_build_object('level', 'warning', 'field', null,
             'message', 'Ligne en double dans le fichier (identique à la ligne ' || d.first_row || ').')
      from (
        select id, first_value(row_number) over w as first_row, row_number() over w as pos
        from public.migration_rows
        where batch_id = p_batch_id and group_key is not null
        window w as (partition by group_key, coalesce(normalized ->> 'year_label', ''), coalesce(normalized ->> 'class_name', '') order by row_number)
      ) d
     where mr.id = d.id and d.pos > 1;

    -- Doublons avec les élèves déjà présents dans l'établissement (une fois par élève du fichier).
    for r in
      select distinct on (group_key) group_key, normalized
      from public.migration_rows
      where batch_id = p_batch_id and group_key is not null
      order by group_key, row_number
    loop
      select * into v_dup
      from public.find_student_duplicates(v_org, r.normalized ->> 'last_name', r.normalized ->> 'first_name',
                                          (r.normalized ->> 'birth_date')::date, r.normalized ->> 'legacy_matricule', 1);
      if v_dup.student_id is not null then
        update public.migration_rows
           set duplicate_student_id = v_dup.student_id, duplicate_score = v_dup.score, duplicate_reasons = v_dup.reasons,
               status = case when status = 'duplicate' then status else 'duplicate' end,
               resolution = case when resolution = 'skip' then 'skip' when v_dup.score >= 80 then 'existing' else 'pending' end
         where batch_id = p_batch_id and group_key = r.group_key;
      end if;
    end loop;
  end if;

  select jsonb_build_object(
    'rows', count(*),
    'valid', count(*) filter (where status = 'valid'),
    'warnings', count(*) filter (where status = 'warning'),
    'invalid', count(*) filter (where status = 'invalid'),
    'duplicates', count(*) filter (where status = 'duplicate'),
    'pending_decisions', count(*) filter (where resolution = 'pending'),
    'students', count(distinct group_key)
  ) into v_stats
  from public.migration_rows where batch_id = p_batch_id;

  update public.migration_batches
     set mapping = p_mapping, options = coalesce(p_options, '{}'::jsonb), stats = v_stats,
         status = 'analyzed', analyzed_at = now()
   where id = p_batch_id;
  return v_stats;
end;
$$;

-- Décision sur les doublons (appliquée à toutes les lignes du même élève).
create or replace function public.migration_resolve(p_batch_id uuid, p_row_ids uuid[], p_resolution text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.migration_batches := app.mig_require(p_batch_id, array['analyzed']);
  v_count integer;
begin
  if p_resolution not in ('existing', 'merge', 'create', 'skip') then
    raise exception 'Décision invalide.' using errcode = 'check_violation';
  end if;
  update public.migration_rows mr
     set resolution = p_resolution
   where mr.batch_id = p_batch_id
     and mr.status = 'duplicate'
     and (p_resolution in ('create', 'skip') or mr.duplicate_student_id is not null)
     and (mr.id = any (p_row_ids) or mr.group_key in (select group_key from public.migration_rows where id = any (p_row_ids) and batch_id = p_batch_id))
     -- Une ligne en double dans le fichier reste ignorée.
     and not exists (select 1 from jsonb_array_elements(mr.issues) i where i ->> 'message' like 'Ligne en double dans le fichier%');
  get diagnostics v_count = row_count;
  update public.migration_batches
     set stats = stats || jsonb_build_object('pending_decisions',
                   (select count(*) from public.migration_rows where batch_id = p_batch_id and resolution = 'pending'))
   where id = p_batch_id;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Import par tranches (progression réelle côté interface)
-- -----------------------------------------------------------------------------
create or replace function app.mig_bump(p_stats jsonb, p_key text, p_by integer default 1)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select p_stats || jsonb_build_object(p_key, coalesce((p_stats ->> p_key)::integer, 0) + p_by);
$$;

create or replace function public.migration_import_chunk(p_batch_id uuid, p_limit integer default 200)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_batch public.migration_batches := app.mig_require(p_batch_id, array['analyzed', 'importing']);
  v_org uuid := v_batch.organization_id;
  v_opts jsonb := v_batch.options;
  v_stats jsonb := v_batch.stats;
  r record;
  v jsonb;
  v_student uuid;
  v_status text;
  v_years integer;
  v_year_id uuid;
  v_remaining integer;
  v_limit integer := greatest(1, least(coalesce(p_limit, 200), 500));
begin
  if v_batch.status = 'analyzed' then
    if exists (select 1 from public.migration_rows where batch_id = p_batch_id and resolution = 'pending') then
      raise exception 'Des doublons attendent encore votre décision.' using errcode = 'check_violation';
    end if;
    update public.migration_batches set status = 'importing', started_at = now() where id = p_batch_id;
    v_stats := v_stats || jsonb_build_object('created', 0, 'linked', 0, 'merged', 0, 'skipped', 0, 'imported', 0,
                                             'history', 0, 'diplomas', 0, 'grades', 0, 'payments', 0, 'years_created', 0, 'errors', 0);
  end if;
  v_years := coalesce((v_stats ->> 'years_created')::integer, 0);

  for r in
    select * from public.migration_rows
    where batch_id = p_batch_id and processed_at is null and status in ('valid', 'warning', 'duplicate')
    order by row_number
    limit v_limit
    for update
  loop
    v := r.normalized;
    begin
      if r.resolution = 'skip' then
        update public.migration_rows set status = 'skipped', processed_at = now() where id = r.id;
        v_stats := app.mig_bump(v_stats, 'skipped');
        continue;
      end if;

      if v_batch.kind = 'students' then
        -- Élève déjà traité plus haut dans ce fichier (autre année du même élève) ?
        select student_id into v_student from public.migration_rows
        where batch_id = p_batch_id and group_key = r.group_key and student_id is not null and processed_at is not null
        limit 1;
        if v_student is null then
          if r.resolution in ('existing', 'merge') and r.duplicate_student_id is not null then
            v_student := r.duplicate_student_id;
            if r.resolution = 'merge' then
              update public.students s set
                birth_date = coalesce(s.birth_date, (v ->> 'birth_date')::date),
                birth_place = coalesce(s.birth_place, v ->> 'birth_place'),
                sex = coalesce(s.sex, v ->> 'sex'),
                nationality = coalesce(s.nationality, v ->> 'nationality'),
                other_names = coalesce(s.other_names, v ->> 'other_names'),
                phone = coalesce(s.phone, v ->> 'phone'),
                email = coalesce(s.email, v ->> 'email'),
                address = coalesce(s.address, v ->> 'address'),
                city = coalesce(s.city, v ->> 'city'),
                legacy_matricule = coalesce(s.legacy_matricule, v ->> 'legacy_matricule'),
                entry_year = coalesce(s.entry_year, (v ->> 'entry_year')::smallint),
                exit_year = coalesce(s.exit_year, (v ->> 'exit_year')::smallint),
                legacy_program = coalesce(s.legacy_program, v ->> 'program_name')
              where s.id = v_student and s.organization_id = v_org;
              v_stats := app.mig_bump(v_stats, 'merged');
            else
              v_stats := app.mig_bump(v_stats, 'linked');
            end if;
          else
            v_status := v ->> 'status';
            insert into public.students (
              organization_id, first_name, last_name, other_names, sex, birth_date, birth_place, nationality,
              email, phone, address, city, status, status_reason, status_changed_at, notes,
              legacy_matricule, entry_year, exit_year, legacy_program, origin, import_batch_id, archived_at
            ) values (
              v_org, v ->> 'first_name', v ->> 'last_name', v ->> 'other_names', v ->> 'sex', (v ->> 'birth_date')::date,
              v ->> 'birth_place', v ->> 'nationality', v ->> 'email', v ->> 'phone', v ->> 'address', v ->> 'city',
              case when v_status = 'archived' then 'alumni' else v_status end,
              coalesce(v ->> 'status_reason', 'Import des données historiques'), now(), v ->> 'notes',
              v ->> 'legacy_matricule', (v ->> 'entry_year')::smallint, (v ->> 'exit_year')::smallint, v ->> 'program_name',
              'import', p_batch_id,
              case when v_status = 'archived' or coalesce((v_opts ->> 'archive')::boolean, false) then now() end
            ) returning id into v_student;
            v_stats := app.mig_bump(v_stats, 'created');
          end if;
        end if;

        -- Parcours de l'année (classe, niveau, filière, moyenne, décision, absences)
        if v ? 'year_label' and (v ? 'class_name' or v ? 'level_name' or v ? 'program_name' or v ? 'average' or v ? 'decision' or v ? 'absences') then
          select app.mig_ensure_year(v_org, v ->> 'year_label', coalesce((v_opts ->> 'create_years')::boolean, true), v_years) into v_years;
          v_year_id := app.mig_year_id(v_org, v ->> 'year_label');
          if not exists (
            select 1 from public.student_history h
            where h.student_id = v_student and h.year_label = v ->> 'year_label'
              and coalesce(h.class_name, '') = coalesce(v ->> 'class_name', '')
          ) then
            insert into public.student_history (organization_id, student_id, academic_year_id, year_label, class_name, level_name,
                                                program_name, average, rank, decision, absences, absences_justified, source, batch_id)
            values (v_org, v_student, v_year_id, v ->> 'year_label', v ->> 'class_name', v ->> 'level_name', v ->> 'program_name',
                    (v ->> 'average')::numeric, (v ->> 'rank')::integer, v ->> 'decision', (v ->> 'absences')::integer,
                    (v ->> 'absences_justified')::integer, 'import', p_batch_id);
            v_stats := app.mig_bump(v_stats, 'history');
          end if;
        end if;
        -- Diplôme / certificat
        if v ? 'diploma_title' and length(v ->> 'diploma_title') >= 2 and not exists (
          select 1 from public.student_diplomas d
          where d.student_id = v_student and app.search_normalize(d.title) = app.search_normalize(v ->> 'diploma_title')
            and coalesce(d.year_label, '') = coalesce(v ->> 'diploma_year', '')
        ) then
          insert into public.student_diplomas (organization_id, student_id, kind, title, year_label, mention, source, batch_id)
          values (v_org, v_student, 'diploma', left(v ->> 'diploma_title', 200), left(v ->> 'diploma_year', 20),
                  left(v ->> 'diploma_mention', 120), 'import', p_batch_id);
          v_stats := app.mig_bump(v_stats, 'diplomas');
        end if;
      elsif v_batch.kind = 'grades' then
        v_student := r.student_id;
        select app.mig_ensure_year(v_org, v ->> 'year_label', coalesce((v_opts ->> 'create_years')::boolean, true), v_years) into v_years;
        insert into public.student_history_grades (organization_id, student_id, academic_year_id, year_label, period_label, subject,
                                                   score, max_score, coefficient, appreciation, source, batch_id)
        values (v_org, v_student, app.mig_year_id(v_org, v ->> 'year_label'), v ->> 'year_label', left(v ->> 'period_label', 60),
                left(v ->> 'subject', 120), (v ->> 'score')::numeric, (v ->> 'max_score')::numeric, (v ->> 'coefficient')::numeric,
                left(v ->> 'appreciation', 500), 'import', p_batch_id);
        v_stats := app.mig_bump(v_stats, 'grades');
      else
        v_student := r.student_id;
        if v ? 'year_label' then
          select app.mig_ensure_year(v_org, v ->> 'year_label', coalesce((v_opts ->> 'create_years')::boolean, true), v_years) into v_years;
        end if;
        insert into public.student_history_payments (organization_id, student_id, academic_year_id, year_label, label, amount,
                                                     paid_on, method, reference, source, batch_id)
        values (v_org, v_student, app.mig_year_id(v_org, v ->> 'year_label'), v ->> 'year_label', left(v ->> 'label', 200),
                (v ->> 'amount')::numeric, (v ->> 'paid_on')::date, left(v ->> 'method', 60), left(v ->> 'reference', 120),
                'import', p_batch_id);
        v_stats := app.mig_bump(v_stats, 'payments');
      end if;

      update public.migration_rows set status = 'imported', student_id = v_student, processed_at = now() where id = r.id;
      v_stats := app.mig_bump(v_stats, 'imported');
    exception when others then
      -- Ligne refusée par la base (contrainte) : rejetée, l'import continue.
      update public.migration_rows
         set status = 'rejected', processed_at = now(),
             issues = issues || jsonb_build_object('level', 'error', 'field', null, 'message', 'Refusée à l''import : ' || left(sqlerrm, 200))
       where id = r.id;
      v_stats := app.mig_bump(v_stats, 'errors');
    end;
  end loop;

  v_stats := v_stats || jsonb_build_object('years_created', v_years);
  select count(*) into v_remaining
  from public.migration_rows
  where batch_id = p_batch_id and processed_at is null and status in ('valid', 'warning', 'duplicate');

  if v_remaining = 0 then
    update public.migration_rows set status = 'rejected', processed_at = now()
     where batch_id = p_batch_id and status = 'invalid';
    -- Dossiers créés par cet import sans années d'entrée / de sortie : déduites du parcours importé
    -- (première et dernière année trouvées). Les dossiers existants rattachés ne sont pas modifiés.
    if v_batch.kind = 'students' then
      update public.students s
         set entry_year = coalesce(s.entry_year, h.first_year),
             exit_year = coalesce(s.exit_year, case when s.status <> 'active' then h.last_year end)
        from (
          select student_id, min(split_part(year_label, '-', 1))::smallint as first_year, max(split_part(year_label, '-', 2))::smallint as last_year
          from public.student_history
          where batch_id = p_batch_id and year_label ~ '^\d{4}-\d{4}$'
          group by student_id
        ) h
       where s.id = h.student_id and s.import_batch_id = p_batch_id and s.organization_id = v_org
         and (s.entry_year is null or s.exit_year is null);
    end if;
    select v_stats || jsonb_build_object('rejected', count(*) filter (where status = 'rejected'))
      into v_stats from public.migration_rows where batch_id = p_batch_id;
    update public.migration_batches set stats = v_stats, status = 'completed', completed_at = now() where id = p_batch_id;
    perform app.audit(v_org, 'migration.completed', 'migration_batches', p_batch_id,
                      'Import « ' || v_batch.file_name || ' » : ' || coalesce(v_stats ->> 'imported', '0') || ' ligne(s) importée(s) sur '
                      || v_batch.row_count || ', ' || coalesce(v_stats ->> 'rejected', '0') || ' rejetée(s)',
                      v_stats || jsonb_build_object('kind', v_batch.kind, 'file', v_batch.file_name));
  else
    update public.migration_batches set stats = v_stats where id = p_batch_id;
  end if;

  return jsonb_build_object('remaining', v_remaining, 'done', v_remaining = 0, 'stats', v_stats);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.migration_create_batch(uuid, text, text, integer, text, text[])',
    'public.migration_append_rows(uuid, jsonb)',
    'public.migration_cancel(uuid)',
    'public.migration_analyze(uuid, jsonb, jsonb)',
    'public.migration_resolve(uuid, uuid[], text)',
    'public.migration_import_chunk(uuid, integer)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Ajout manuel d'un ancien élève (avec parcours et diplôme facultatifs)
-- -----------------------------------------------------------------------------
create or replace function public.create_legacy_student(p_organization_id uuid, p_student jsonb, p_history jsonb default null, p_diploma jsonb default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_status text := coalesce(nullif(p_student ->> 'status', ''), 'alumni');
  v_years integer := 0;
  v_label text;
begin
  if not app.has_permission(p_organization_id, 'students.create') then
    raise exception 'Cette action nécessite la permission students.create.' using errcode = 'insufficient_privilege';
  end if;
  if v_status not in ('alumni', 'graduated', 'transferred', 'withdrawn', 'inactive') then
    raise exception 'Statut invalide pour un ancien élève.' using errcode = 'check_violation';
  end if;
  insert into public.students (
    organization_id, first_name, last_name, other_names, sex, birth_date, birth_place, nationality, phone, email,
    address, city, status, status_reason, status_changed_at, legacy_matricule, entry_year, exit_year, legacy_program, notes, origin,
    archived_at
  ) values (
    p_organization_id, btrim(p_student ->> 'first_name'), upper(btrim(p_student ->> 'last_name')), nullif(btrim(p_student ->> 'other_names'), ''),
    nullif(p_student ->> 'sex', ''), nullif(p_student ->> 'birth_date', '')::date, nullif(btrim(p_student ->> 'birth_place'), ''),
    nullif(btrim(p_student ->> 'nationality'), ''), nullif(btrim(p_student ->> 'phone'), ''), nullif(lower(btrim(p_student ->> 'email')), ''),
    nullif(btrim(p_student ->> 'address'), ''), nullif(btrim(p_student ->> 'city'), ''),
    v_status, coalesce(nullif(btrim(p_student ->> 'status_reason'), ''), 'Ancien élève ajouté manuellement'), now(),
    nullif(btrim(p_student ->> 'legacy_matricule'), ''), nullif(p_student ->> 'entry_year', '')::smallint,
    nullif(p_student ->> 'exit_year', '')::smallint, nullif(btrim(p_student ->> 'legacy_program'), ''),
    nullif(btrim(p_student ->> 'notes'), ''), 'manual_history',
    case when coalesce((p_student ->> 'archive')::boolean, false) then now() end
  ) returning id into v_id;

  v_label := app.mig_year_label(p_history ->> 'year_label');
  if v_label is not null then
    select app.mig_ensure_year(p_organization_id, v_label, true, v_years) into v_years;
    insert into public.student_history (organization_id, student_id, academic_year_id, year_label, class_name, level_name, program_name,
                                        average, decision, absences, source)
    values (p_organization_id, v_id, app.mig_year_id(p_organization_id, v_label), v_label,
            nullif(btrim(p_history ->> 'class_name'), ''), nullif(btrim(p_history ->> 'level_name'), ''),
            nullif(btrim(p_history ->> 'program_name'), ''), nullif(p_history ->> 'average', '')::numeric,
            nullif(btrim(p_history ->> 'decision'), ''), nullif(p_history ->> 'absences', '')::integer, 'manual');
  end if;
  if coalesce(length(btrim(p_diploma ->> 'title')), 0) >= 2 then
    insert into public.student_diplomas (organization_id, student_id, kind, title, year_label, mention, number, issued_on, source)
    values (p_organization_id, v_id, coalesce(nullif(p_diploma ->> 'kind', ''), 'diploma'), btrim(p_diploma ->> 'title'),
            coalesce(app.mig_year_label(p_diploma ->> 'year_label'), nullif(btrim(p_diploma ->> 'year_label'), '')),
            nullif(btrim(p_diploma ->> 'mention'), ''), nullif(btrim(p_diploma ->> 'number'), ''),
            nullif(p_diploma ->> 'issued_on', '')::date, 'manual');
  end if;
  perform app.audit(p_organization_id, 'student.legacy_created', 'students', v_id,
                    'Ancien élève ajouté manuellement : ' || upper(btrim(p_student ->> 'last_name')) || ' ' || btrim(p_student ->> 'first_name'),
                    jsonb_build_object('status', v_status, 'years_created', v_years));
  return v_id;
end;
$$;
revoke execute on function public.create_legacy_student(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.create_legacy_student(uuid, jsonb, jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Compteurs : onglets de la liste des élèves et tableau de bord historique
-- (SECURITY INVOKER : la RLS s'applique).
-- -----------------------------------------------------------------------------
create or replace function public.student_status_counts(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'current', count(*) filter (where archived_at is null and status in ('prospect', 'active', 'inactive')),
    'former', count(*) filter (where archived_at is null and status in ('alumni', 'graduated', 'transferred', 'withdrawn')),
    'graduated', count(*) filter (where archived_at is null and status = 'graduated'),
    'transferred', count(*) filter (where archived_at is null and status = 'transferred'),
    'archived', count(*) filter (where archived_at is not null)
  )
  from public.students where organization_id = p_organization_id;
$$;
revoke execute on function public.student_status_counts(uuid) from public, anon;
grant execute on function public.student_status_counts(uuid) to authenticated;

create or replace function public.historical_overview(p_organization_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'former_total', (select count(*) from public.students where organization_id = p_organization_id
                      and (archived_at is not null or status in ('alumni', 'graduated', 'transferred', 'withdrawn'))),
    'alumni', (select count(*) from public.students where organization_id = p_organization_id and archived_at is null and status = 'alumni'),
    'graduated', (select count(*) from public.students where organization_id = p_organization_id and archived_at is null and status = 'graduated'),
    'transferred', (select count(*) from public.students where organization_id = p_organization_id and archived_at is null and status = 'transferred'),
    'withdrawn', (select count(*) from public.students where organization_id = p_organization_id and archived_at is null and status = 'withdrawn'),
    'archived', (select count(*) from public.students where organization_id = p_organization_id and archived_at is not null),
    'imported', (select count(*) from public.students where organization_id = p_organization_id and origin = 'import'),
    'manual', (select count(*) from public.students where organization_id = p_organization_id and origin = 'manual_history'),
    'diplomas', (select count(*) from public.student_diplomas where organization_id = p_organization_id),
    'history_lines', (select count(*) from public.student_history where organization_id = p_organization_id),
    'grades', (select count(*) from public.student_history_grades where organization_id = p_organization_id),
    'years', coalesce((
      select jsonb_agg(jsonb_build_object('id', y.id, 'name', y.name, 'status', y.status, 'is_current', y.is_current,
                                          'history', (select count(*) from public.student_history h where h.academic_year_id = y.id),
                                          'enrollments', (select count(*) from public.enrollments e where e.academic_year_id = y.id and e.status = 'validated'))
                       order by y.starts_on desc)
      from public.academic_years y where y.organization_id = p_organization_id
    ), '[]'::jsonb)
  );
$$;
revoke execute on function public.historical_overview(uuid) from public, anon;
grant execute on function public.historical_overview(uuid) to authenticated;
