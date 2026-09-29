-- =============================================================================
-- P7c — COUNTRY CONNECT
--
-- Échanges avec les systèmes nationaux SANS API inventée : fichiers d'import
-- et d'export configurables (correspondance de colonnes), validés en base,
-- avec historique.
--   * Identifiant national de l'élève : colonne existante students.national_id,
--     distincte du matricule NéoScol (permanent) ; format contrôlé selon le
--     pays de l'établissement (countries.settings.national_id_pattern) ;
--     unique dans l'établissement.
--   * Correspondances : modèle du pays (Super Admin) ou de l'établissement.
--   * Import : vérification (aucune écriture) puis application ; seul
--     l'identifiant national est écrit — l'identité de l'élève n'est jamais
--     écrasée par un fichier (écarts signalés).
-- =============================================================================

-- Format de l'identifiant national (pack pays) : expression valide exigée.
create or replace function app.country_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.settings ->> 'national_id_pattern', '') <> '' then
    begin
      perform '' ~ (new.settings ->> 'national_id_pattern');
    exception when others then
      raise exception 'Format de l''identifiant national invalide (expression régulière).' using errcode = 'check_violation';
    end;
  end if;
  return new;
end;
$$;
create trigger countries_settings_guard before insert or update of settings on public.countries
  for each row execute function app.country_settings_guard();

-- Identifiant national : nettoyé, format du pays, unique dans l'établissement.
create or replace function app.student_national_id_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pattern text;
  v_label text;
begin
  new.national_id := nullif(upper(regexp_replace(btrim(coalesce(new.national_id, '')), '\s+', '', 'g')), '');
  if new.national_id is null or (tg_op = 'UPDATE' and new.national_id is not distinct from old.national_id) then
    return new;
  end if;
  select c.settings ->> 'national_id_pattern', coalesce(nullif(c.settings ->> 'national_id_label', ''), 'Identifiant national')
    into v_pattern, v_label
    from public.organizations o join public.countries c on c.code = o.country where o.id = new.organization_id;
  if coalesce(v_pattern, '') <> '' and new.national_id !~ v_pattern then
    raise exception '% « % » : format non conforme pour ce pays.', v_label, new.national_id using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger students_national_id_guard before insert or update of national_id on public.students
  for each row execute function app.student_national_id_guard();
create unique index students_org_national_id on public.students (organization_id, national_id) where national_id is not null;

-- -----------------------------------------------------------------------------
-- Correspondances de colonnes
-- -----------------------------------------------------------------------------
create or replace function app.country_connect_fields()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['matricule', 'national_id', 'last_name', 'first_name', 'other_names', 'sex', 'birth_date', 'birth_place',
               'nationality', 'class_name', 'academic_year', 'phone', 'email', 'status', 'ignore'];
$$;

create table public.country_connect_mappings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  country_code text references public.countries (code),
  name text not null check (char_length(name) between 2 and 120),
  direction text not null check (direction in ('import', 'export')),
  columns jsonb not null check (jsonb_typeof(columns) = 'array'),
  delimiter text not null default ';' check (delimiter in (';', ',', 'tab')),
  date_format text not null default 'dd/MM/yyyy' check (date_format in ('dd/MM/yyyy', 'yyyy-MM-dd', 'MM/dd/yyyy')),
  is_active boolean not null default true,
  description text check (description is null or char_length(description) <= 500),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((organization_id is null) <> (country_code is null))
);

create table public.country_connect_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  mapping_id uuid references public.country_connect_mappings (id) on delete set null,
  mapping_name text not null,
  direction text not null check (direction in ('import', 'export')),
  file_name text check (file_name is null or char_length(file_name) <= 200),
  status text not null check (status in ('checked', 'applied', 'exported')),
  total_rows integer not null default 0,
  ok_rows integer not null default 0,
  error_rows integer not null default 0,
  updated_rows integer not null default 0,
  report jsonb not null default '[]'::jsonb,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index country_connect_jobs_org on public.country_connect_jobs (organization_id, created_at desc);

alter table public.country_connect_mappings enable row level security;
alter table public.country_connect_jobs enable row level security;
revoke all on public.country_connect_mappings, public.country_connect_jobs from anon, authenticated;
grant select on public.country_connect_mappings, public.country_connect_jobs to authenticated;
create policy country_connect_mappings_read on public.country_connect_mappings for select to authenticated
  using (organization_id is null or app.has_permission(organization_id, 'students.read') or app.is_platform_admin());
create policy country_connect_jobs_read on public.country_connect_jobs for select to authenticated
  using (app.has_permission(organization_id, 'students.import') or app.has_permission(organization_id, 'settings.manage'));

create or replace function app.country_connect_columns_error(p_columns jsonb, p_direction text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  c jsonb;
  v_headers text[] := '{}';
  v_fields text[] := '{}';
begin
  if jsonb_typeof(p_columns) <> 'array' or jsonb_array_length(p_columns) not between 1 and 40 then
    return 'De 1 à 40 colonnes.';
  end if;
  for c in select * from jsonb_array_elements(p_columns) loop
    if char_length(btrim(coalesce(c ->> 'header', ''))) not between 1 and 80 then
      return 'Chaque colonne doit avoir un en-tête (80 caractères au plus).';
    end if;
    if not (c ->> 'field' = any (app.country_connect_fields())) then
      return 'Champ inconnu : ' || coalesce(c ->> 'field', '(vide)') || '.';
    end if;
    if upper(btrim(c ->> 'header')) = any (v_headers) then
      return 'En-tête en double : ' || (c ->> 'header') || '.';
    end if;
    v_headers := v_headers || upper(btrim(c ->> 'header'));
    v_fields := v_fields || (c ->> 'field');
  end loop;
  if p_direction = 'import' and not ('national_id' = any (v_fields)) then
    return 'Un import doit contenir la colonne de l''identifiant national.';
  end if;
  if p_direction = 'import' and not ('matricule' = any (v_fields) or ('last_name' = any (v_fields) and 'first_name' = any (v_fields) and 'birth_date' = any (v_fields))) then
    return 'Un import doit permettre de retrouver l''élève : matricule NéoScol, ou nom + prénom + date de naissance.';
  end if;
  return null;
end;
$$;

create or replace function public.save_country_connect_mapping(
  p_org uuid, p_country text, p_id uuid, p_name text, p_direction text, p_columns jsonb,
  p_delimiter text default ';', p_date_format text default 'dd/MM/yyyy', p_active boolean default true, p_description text default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_error text := app.country_connect_columns_error(p_columns, p_direction);
  v_existing public.country_connect_mappings;
  v_id uuid;
begin
  if (p_org is null and not app.is_platform_admin()) or (p_org is not null and not app.has_permission(p_org, 'settings.manage')) then
    raise exception 'Permission refusée : correspondances Country Connect.' using errcode = 'insufficient_privilege';
  end if;
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;
  if p_id is not null then
    select * into v_existing from public.country_connect_mappings where id = p_id;
    if v_existing.id is null or v_existing.organization_id is distinct from p_org then
      raise exception 'Correspondance introuvable.' using errcode = 'no_data_found';
    end if;
    update public.country_connect_mappings
       set name = btrim(p_name), direction = p_direction, columns = p_columns, delimiter = p_delimiter, date_format = p_date_format,
           is_active = p_active, description = nullif(btrim(coalesce(p_description, '')), ''), updated_at = now()
     where id = p_id returning id into v_id;
  else
    insert into public.country_connect_mappings (organization_id, country_code, name, direction, columns, delimiter, date_format, is_active, description)
    values (p_org, case when p_org is null then upper(p_country) end, btrim(p_name), p_direction, p_columns, p_delimiter, p_date_format, p_active,
            nullif(btrim(coalesce(p_description, '')), ''))
    returning id into v_id;
  end if;
  perform app.audit(p_org, 'country_connect.mapping_saved', 'country_connect_mappings', v_id,
    'Correspondance « ' || btrim(p_name) || ' » (' || p_direction || ') enregistrée',
    jsonb_build_object('before', to_jsonb(v_existing) - 'created_by', 'columns', p_columns), 'success');
  return v_id;
end;
$$;

-- Correspondance utilisable par un établissement : la sienne ou celle de son pays.
create or replace function app.usable_mapping(p_org uuid, p_mapping uuid)
returns public.country_connect_mappings
language sql
stable
security definer
set search_path = ''
as $$
  select m.* from public.country_connect_mappings m
  join public.organizations o on o.id = p_org
  where m.id = p_mapping and m.is_active and (m.organization_id = p_org or m.country_code = o.country);
$$;

-- -----------------------------------------------------------------------------
-- Export : lignes des élèves (champs autorisés), journalisé
-- -----------------------------------------------------------------------------
create or replace function public.country_connect_export(p_org uuid, p_mapping uuid)
returns table (row_data jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_map public.country_connect_mappings;
  v_count integer;
begin
  -- Export complet de l'effectif : réservé aux droits d'échange (pas à la simple lecture d'un enseignant).
  if not (app.has_permission(p_org, 'students.import') or app.has_permission(p_org, 'settings.manage')) then
    raise exception 'Permission refusée : export des élèves.' using errcode = 'insufficient_privilege';
  end if;
  v_map := app.usable_mapping(p_org, p_mapping);
  if v_map.id is null or v_map.direction <> 'export' then
    raise exception 'Correspondance d''export introuvable.' using errcode = 'no_data_found';
  end if;
  return query
  select jsonb_build_object(
    'matricule', s.matricule, 'national_id', s.national_id, 'last_name', s.last_name, 'first_name', s.first_name,
    'other_names', s.other_names, 'sex', s.sex, 'birth_date', s.birth_date, 'birth_place', s.birth_place,
    'nationality', s.nationality, 'phone', s.phone, 'email', s.email, 'status', s.status,
    'class_name', (select c.name from public.enrollments e join public.classes c on c.id = e.class_id
                     join public.academic_years y on y.id = c.academic_year_id and y.is_current
                    where e.student_id = s.id and e.status = 'validated' limit 1),
    'academic_year', (select y.name from public.academic_years y where y.organization_id = p_org and y.is_current limit 1))
  from public.students s
  where s.organization_id = p_org and s.archived_at is null and s.status = 'active'
  order by s.last_name, s.first_name;
  get diagnostics v_count = row_count;
  insert into public.country_connect_jobs (organization_id, mapping_id, mapping_name, direction, status, total_rows, ok_rows)
  values (p_org, v_map.id, v_map.name, 'export', 'exported', v_count, v_count);
  perform app.audit(p_org, 'country_connect.export', 'country_connect_mappings', v_map.id,
    'Export « ' || v_map.name || ' » : ' || v_count || ' élève(s)', '{}'::jsonb, 'success');
end;
$$;

-- -----------------------------------------------------------------------------
-- Import : vérification (p_apply = false) puis application
-- p_rows : [{"line": 2, "matricule": …, "national_id": …, "last_name": …, …}]
-- -----------------------------------------------------------------------------
create or replace function public.country_connect_import(p_org uuid, p_mapping uuid, p_rows jsonb, p_apply boolean, p_file_name text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_map public.country_connect_mappings;
  r jsonb;
  v_student public.students;
  v_nid text;
  v_pattern text;
  v_label text;
  v_report jsonb := '[]'::jsonb;
  v_status text;
  v_message text;
  v_ok integer := 0;
  v_err integer := 0;
  v_updated integer := 0;
  v_seen text[] := '{}';
  v_birth date;
  v_job uuid;
begin
  if not (app.has_permission(p_org, 'students.import') or app.has_permission(p_org, 'students.update')) then
    raise exception 'Permission refusée : import Country Connect.' using errcode = 'insufficient_privilege';
  end if;
  v_map := app.usable_mapping(p_org, p_mapping);
  if v_map.id is null or v_map.direction <> 'import' then
    raise exception 'Correspondance d''import introuvable.' using errcode = 'no_data_found';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10000 then
    raise exception 'Fichier invalide (10 000 lignes au plus).' using errcode = 'check_violation';
  end if;
  select c.settings ->> 'national_id_pattern', coalesce(nullif(c.settings ->> 'national_id_label', ''), 'Identifiant national')
    into v_pattern, v_label
    from public.organizations o join public.countries c on c.code = o.country where o.id = p_org;

  for r in select * from jsonb_array_elements(p_rows) loop
    v_student := null;
    v_status := 'ok';
    v_message := null;
    v_nid := nullif(upper(regexp_replace(btrim(coalesce(r ->> 'national_id', '')), '\s+', '', 'g')), '');
    -- Élève : par matricule NéoScol, sinon nom + prénom + date de naissance (dans CET établissement uniquement).
    if coalesce(r ->> 'matricule', '') <> '' then
      select * into v_student from public.students where organization_id = p_org and upper(matricule) = upper(btrim(r ->> 'matricule'));
    elsif coalesce(r ->> 'last_name', '') <> '' and coalesce(r ->> 'birth_date', '') <> '' then
      begin
        v_birth := case when r ->> 'birth_date' ~ '^\d{4}-\d{2}-\d{2}$' then (r ->> 'birth_date')::date
                        when v_map.date_format = 'MM/dd/yyyy' then to_date(r ->> 'birth_date', 'MM/DD/YYYY')
                        else to_date(r ->> 'birth_date', 'DD/MM/YYYY') end;
      exception when others then
        v_birth := null;
      end;
      select * into v_student from public.students
       where organization_id = p_org and birth_date = v_birth
         and app.search_normalize(last_name) = app.search_normalize(r ->> 'last_name')
         and app.search_normalize(first_name) = app.search_normalize(coalesce(r ->> 'first_name', ''))
       limit 1;
    end if;

    if v_student.id is null then
      v_status := 'error'; v_message := 'Élève introuvable dans l''établissement.';
    elsif v_nid is null then
      v_status := 'error'; v_message := v_label || ' manquant.';
    elsif coalesce(v_pattern, '') <> '' and v_nid !~ v_pattern then
      v_status := 'error'; v_message := v_label || ' « ' || v_nid || ' » : format non conforme.';
    elsif v_nid = any (v_seen) then
      v_status := 'error'; v_message := v_label || ' en double dans le fichier.';
    elsif exists (select 1 from public.students where organization_id = p_org and national_id = v_nid and id <> v_student.id) then
      v_status := 'error'; v_message := v_label || ' déjà attribué à un autre élève.';
    elsif v_student.national_id is not null and v_student.national_id <> v_nid then
      v_status := 'error'; v_message := 'L''élève a déjà un autre ' || lower(v_label) || ' (' || v_student.national_id || ') : corrigez manuellement si nécessaire.';
    elsif v_student.national_id = v_nid then
      v_status := 'unchanged'; v_message := 'Déjà à jour.';
    elsif coalesce(r ->> 'last_name', '') <> '' and app.search_normalize(r ->> 'last_name') <> app.search_normalize(v_student.last_name) then
      v_status := 'warning'; v_message := 'Nom différent dans le fichier (« ' || (r ->> 'last_name') || ' ») : identité NéoScol conservée.';
    end if;
    if v_nid is not null then
      v_seen := v_seen || v_nid;
    end if;
    if v_status = 'error' then
      v_err := v_err + 1;
    else
      v_ok := v_ok + 1;
      if p_apply and v_status in ('ok', 'warning') then
        update public.students set national_id = v_nid where id = v_student.id;
        v_updated := v_updated + 1;
      end if;
    end if;
    if jsonb_array_length(v_report) < 500 then
      v_report := v_report || jsonb_build_object('line', r -> 'line', 'status', v_status, 'message', v_message,
        'student', case when v_student.id is not null then v_student.last_name || ' ' || v_student.first_name || ' (' || v_student.matricule || ')' end,
        'national_id', v_nid);
    end if;
  end loop;

  insert into public.country_connect_jobs (organization_id, mapping_id, mapping_name, direction, file_name, status, total_rows, ok_rows, error_rows, updated_rows, report)
  values (p_org, v_map.id, v_map.name, 'import', left(p_file_name, 200), case when p_apply then 'applied' else 'checked' end,
          jsonb_array_length(p_rows), v_ok, v_err, v_updated, v_report)
  returning id into v_job;
  perform app.audit(p_org, case when p_apply then 'country_connect.import_applied' else 'country_connect.import_checked' end,
    'country_connect_jobs', v_job,
    'Country Connect « ' || v_map.name || ' » : ' || v_ok || ' ligne(s) valide(s), ' || v_err || ' erreur(s)' ||
      case when p_apply then ', ' || v_updated || ' identifiant(s) enregistré(s)' else ' (vérification)' end,
    jsonb_build_object('file', p_file_name), 'success');
  return jsonb_build_object('job_id', v_job, 'total', jsonb_array_length(p_rows), 'ok', v_ok, 'errors', v_err, 'updated', v_updated,
                            'applied', p_apply, 'report', v_report);
end;
$$;

-- Couverture de l'identifiant national (tableau de bord Country Connect).
create or replace function public.country_connect_overview(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.has_permission(p_org, 'students.read') then (
    select jsonb_build_object(
      'country', c.code, 'country_name', c.name,
      'label', coalesce(nullif(c.settings ->> 'national_id_label', ''), 'Identifiant national'),
      'pattern', c.settings ->> 'national_id_pattern',
      'students', (select count(*) from public.students s where s.organization_id = p_org and s.archived_at is null and s.status = 'active'),
      'with_id', (select count(*) from public.students s where s.organization_id = p_org and s.archived_at is null and s.status = 'active' and s.national_id is not null))
    from public.organizations o join public.countries c on c.code = o.country where o.id = p_org) end;
$$;

revoke execute on function public.save_country_connect_mapping(uuid, text, uuid, text, text, jsonb, text, text, boolean, text) from public, anon;
revoke execute on function public.country_connect_export(uuid, uuid) from public, anon;
revoke execute on function public.country_connect_import(uuid, uuid, jsonb, boolean, text) from public, anon;
revoke execute on function public.country_connect_overview(uuid) from public, anon;
grant execute on function public.save_country_connect_mapping(uuid, text, uuid, text, text, jsonb, text, text, boolean, text) to authenticated;
grant execute on function public.country_connect_export(uuid, uuid) to authenticated;
grant execute on function public.country_connect_import(uuid, uuid, jsonb, boolean, text) to authenticated;
grant execute on function public.country_connect_overview(uuid) to authenticated;
revoke execute on function app.usable_mapping(uuid, uuid) from public, anon, authenticated;
