-- =============================================================================
-- NéoScol — 0200 Multi-établissements, profils, rôles et permissions
-- =============================================================================

create type public.organization_type as enum (
  'primary_school', 'middle_school', 'high_school', 'school_complex',
  'university', 'institute', 'vocational_center', 'technical_center',
  'private_school', 'school_group'
);
create type public.organization_status as enum ('active', 'suspended', 'archived');
create type public.membership_status as enum ('invited', 'active', 'suspended');

-- -----------------------------------------------------------------------------
-- Établissements (tenants)
-- -----------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.organizations (id) on delete set null,
  name text not null check (length(btrim(name)) between 2 and 200),
  short_name text,
  code text not null unique check (code ~ '^[A-Z0-9]{2,10}$'),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  type public.organization_type not null,
  status public.organization_status not null default 'active',
  email text,
  phone text,
  website text,
  address text,
  city text,
  country text not null default 'CI' check (country ~ '^[A-Z]{2}$'),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  locale text not null default 'fr',
  timezone text not null default 'Africa/Abidjan',
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index organizations_parent_idx on public.organizations (parent_id);

comment on column public.organizations.is_demo is
  'Établissement de démonstration : ses données sont fictives et ne doivent jamais être présentées comme réelles.';

create table public.organization_branding (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  logo_path text,
  stamp_path text,
  signature_path text,
  primary_color text not null default '#1D4ED8' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#0F172A' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  header_text text,
  footer_text text,
  signatory_name text,
  signatory_title text,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Profils (1-1 avec auth.users)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text,
  last_name text,
  email text,
  phone text,
  avatar_path text,
  locale text not null default 'fr',
  is_active boolean not null default true,
  last_organization_id uuid references public.organizations (id) on delete set null,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_phone_idx on public.profiles (phone);

create table public.platform_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Création / synchronisation automatique du profil depuis auth.users
create or replace function app.handle_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, phone, first_name, last_name)
  values (
    new.id,
    new.email,
    new.phone,
    nullif(new.raw_user_meta_data ->> 'first_name', ''),
    nullif(new.raw_user_meta_data ->> 'last_name', '')
  )
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone;
  return new;
end;
$$;

create trigger on_auth_user_changed
  after insert or update of email, phone on auth.users
  for each row execute function app.handle_auth_user();

-- -----------------------------------------------------------------------------
-- Permissions (catalogue global), rôles, adhésions
-- -----------------------------------------------------------------------------
create table public.permissions (
  code text primary key check (code ~ '^[a-z_]+(\.[a-z_]+)+$'),
  module text not null,
  label text not null,
  sort_order integer not null default 0
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  -- NULL = modèle de rôle (copié dans chaque établissement lors du provisionnement)
  organization_id uuid references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z_]{2,40}$'),
  name text not null,
  description text,
  persona text not null default 'staff' check (persona in ('staff', 'teacher', 'parent', 'student')),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, key),
  unique (organization_id, id)
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on update cascade on delete cascade,
  primary key (role_id, permission_code)
);
create index role_permissions_code_idx on public.role_permissions (permission_code);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status public.membership_status not null default 'active',
  invited_by uuid references public.profiles (id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);
create index memberships_user_idx on public.memberships (user_id) where status = 'active';

create table public.membership_roles (
  organization_id uuid not null,
  membership_id uuid not null,
  role_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (membership_id, role_id),
  foreign key (organization_id, membership_id) references public.memberships (organization_id, id) on delete cascade,
  foreign key (organization_id, role_id) references public.roles (organization_id, id) on delete cascade
);
create index membership_roles_role_idx on public.membership_roles (role_id);

-- -----------------------------------------------------------------------------
-- Compteurs atomiques (matricules, reçus, factures, inscriptions, documents)
-- -----------------------------------------------------------------------------
create table public.organization_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  scope text not null,
  period text not null default '',
  last_value bigint not null default 0,
  primary key (organization_id, scope, period)
);

create or replace function app.next_counter(p_org uuid, p_scope text, p_period text default '')
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.organization_counters as c (organization_id, scope, period, last_value)
  values (p_org, p_scope, coalesce(p_period, ''), 1)
  on conflict (organization_id, scope, period)
    do update set last_value = c.last_value + 1
  returning last_value;
$$;

-- Génère un numéro à partir d'un motif : {CODE} {YYYY} {YY} {SEQ:n}
-- Le compteur est réinitialisé chaque année si le motif contient l'année.
create or replace function app.generate_number(p_org uuid, p_scope text, p_default_pattern text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org public.organizations;
  v_pattern text;
  v_year text;
  v_period text := '';
  v_seq bigint;
  v_width integer;
  v_result text;
begin
  select * into v_org from public.organizations where id = p_org;
  if not found then
    raise exception 'Établissement introuvable' using errcode = 'foreign_key_violation';
  end if;

  v_pattern := coalesce(nullif(v_org.settings #>> array['numbering', p_scope], ''), p_default_pattern);
  -- Unicité plateforme : le code établissement doit figurer dans le numéro.
  if position('{CODE}' in v_pattern) = 0 then
    v_pattern := '{CODE}-' || v_pattern;
  end if;
  if v_pattern !~ '\{SEQ(:[1-9])?\}' then
    v_pattern := v_pattern || '-{SEQ:5}';
  end if;

  v_year := to_char(now() at time zone v_org.timezone, 'YYYY');
  if v_pattern ~ '\{YY(YY)?\}' then
    v_period := v_year;
  end if;

  v_seq := app.next_counter(p_org, p_scope, v_period);
  v_width := coalesce(substring(v_pattern from '\{SEQ:([1-9])\}')::integer, 1);

  v_result := replace(v_pattern, '{CODE}', v_org.code);
  v_result := replace(v_result, '{YYYY}', v_year);
  v_result := replace(v_result, '{YY}', right(v_year, 2));
  v_result := regexp_replace(v_result, '\{SEQ(:[1-9])?\}', lpad(v_seq::text, greatest(v_width, length(v_seq::text)), '0'));
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Fonctions de sécurité utilisées par la RLS.
-- Elles renvoient des TABLEAUX pour être évaluées une seule fois par requête :
--   organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[])
-- -----------------------------------------------------------------------------
create or replace function app.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.platform_admins pa
    join public.profiles p on p.id = pa.user_id and p.is_active
    where pa.user_id = auth.uid()
  );
$$;

create or replace function app.member_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.organization_id), '{}')
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.is_active
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  where m.user_id = auth.uid()
    and m.status = 'active';
$$;

create or replace function app.permitted_org_ids(p_permission text)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct m.organization_id), '{}')
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.is_active
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and rp.permission_code = p_permission;
$$;

create or replace function app.has_permission(p_org uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_org = any (app.permitted_org_ids(p_permission));
$$;

create or replace function app.is_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_org = any (app.member_org_ids());
$$;

-- Permissions de l'utilisateur courant dans un établissement (exposée pour l'UI).
create or replace function public.my_permissions(p_org uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct rp.permission_code order by rp.permission_code), '{}')
  from public.memberships m
  join public.profiles p on p.id = m.user_id and p.is_active
  join public.organizations o on o.id = m.organization_id and o.status = 'active'
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  where m.user_id = auth.uid()
    and m.organization_id = p_org
    and m.status = 'active';
$$;

-- Personas (staff / teacher / parent / student) de l'utilisateur courant.
create or replace function app.my_personas(p_org uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r.persona), '{}')
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id
  where m.user_id = auth.uid()
    and m.organization_id = p_org
    and m.status = 'active';
$$;

-- Empêche l'escalade de privilèges : on ne peut attribuer un rôle que si l'on
-- possède soi-même toutes ses permissions (sauf détenteur de roles.manage).
create or replace function app.check_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_user uuid;
begin
  if auth.uid() is null then
    return new; -- contexte système (service role, seed, migrations)
  end if;

  select user_id into v_member_user from public.memberships where id = new.membership_id;
  if v_member_user = auth.uid() then
    raise exception 'Vous ne pouvez pas modifier vos propres rôles.' using errcode = 'insufficient_privilege';
  end if;

  if app.has_permission(new.organization_id, 'roles.manage') then
    return new;
  end if;

  if exists (
    select 1 from public.role_permissions rp
    where rp.role_id = new.role_id
      and not app.has_permission(new.organization_id, rp.permission_code)
  ) then
    raise exception 'Ce rôle accorde des permissions que vous ne possédez pas.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger membership_roles_check
  before insert or update on public.membership_roles
  for each row execute function app.check_role_assignment();

-- -----------------------------------------------------------------------------
-- Catalogue des permissions
-- -----------------------------------------------------------------------------
insert into public.permissions (code, module, label, sort_order) values
  ('settings.manage',            'settings',      'Gérer les paramètres de l''établissement', 10),
  ('users.read',                 'settings',      'Consulter les utilisateurs', 11),
  ('users.manage',               'settings',      'Gérer les utilisateurs et leurs rôles', 12),
  ('roles.manage',               'settings',      'Gérer les rôles et permissions', 13),
  ('audit.read',                 'settings',      'Consulter le journal d''audit', 14),
  ('academic.read',              'academic',      'Consulter la structure académique', 20),
  ('academic.manage',            'academic',      'Gérer années, périodes, niveaux, filières, matières et classes', 21),
  ('staff.read',                 'staff',         'Consulter le personnel', 30),
  ('staff.manage',               'staff',         'Gérer le personnel', 31),
  ('students.read',              'students',      'Consulter les élèves', 40),
  ('students.create',            'students',      'Créer des élèves', 41),
  ('students.update',            'students',      'Modifier les élèves', 42),
  ('students.archive',           'students',      'Archiver les élèves', 43),
  ('students.medical.read',      'students',      'Consulter les informations médicales', 44),
  ('students.medical.manage',    'students',      'Gérer les informations médicales', 45),
  ('guardians.read',             'students',      'Consulter les parents et tuteurs', 46),
  ('guardians.manage',           'students',      'Gérer les parents et tuteurs', 47),
  ('conduct.read',               'students',      'Consulter sanctions et récompenses', 48),
  ('conduct.manage',             'students',      'Gérer sanctions et récompenses', 49),
  ('enrollments.read',           'enrollments',   'Consulter les inscriptions', 50),
  ('enrollments.manage',         'enrollments',   'Créer et modifier les inscriptions', 51),
  ('enrollments.validate',       'enrollments',   'Valider ou rejeter les inscriptions', 52),
  ('forms.manage',               'enrollments',   'Personnaliser les formulaires', 53),
  ('grades.read',                'pedagogy',      'Consulter toutes les notes', 60),
  ('grades.enter',               'pedagogy',      'Saisir les notes de ses classes', 61),
  ('grades.manage',              'pedagogy',      'Gérer toutes les notes', 62),
  ('periods.lock',               'pedagogy',      'Verrouiller les périodes de notes', 63),
  ('report_cards.manage',        'pedagogy',      'Préparer les bulletins', 64),
  ('report_cards.publish',       'pedagogy',      'Publier les bulletins', 65),
  ('attendance.read',            'pedagogy',      'Consulter toutes les présences', 70),
  ('attendance.take',            'pedagogy',      'Faire l''appel dans ses classes', 71),
  ('attendance.manage',          'pedagogy',      'Gérer toutes les présences', 72),
  ('attendance.justify',         'pedagogy',      'Justifier les absences', 73),
  ('timetable.read',             'pedagogy',      'Consulter les emplois du temps', 80),
  ('timetable.manage',           'pedagogy',      'Gérer les emplois du temps', 81),
  ('finance.read',               'finance',       'Consulter les finances', 90),
  ('finance.fees.manage',        'finance',       'Gérer les frais et tarifs', 91),
  ('finance.invoices.manage',    'finance',       'Gérer les factures et échéanciers', 92),
  ('finance.payments.create',    'finance',       'Enregistrer des paiements', 93),
  ('finance.payments.cancel',    'finance',       'Annuler des paiements', 94),
  ('documents.read',             'documents',     'Consulter les documents émis', 100),
  ('documents.generate',         'documents',     'Générer des documents', 101),
  ('documents.revoke',           'documents',     'Révoquer des documents', 102),
  ('documents.templates.manage', 'documents',     'Personnaliser les modèles de documents', 103),
  ('communication.announce',     'communication', 'Publier des annonces', 110),
  ('communication.message',      'communication', 'Envoyer des messages', 111),
  ('reports.read',               'reports',       'Consulter les rapports', 120),
  ('reports.finance',            'reports',       'Consulter les rapports financiers', 121),
  ('reports.export',             'reports',       'Exporter les rapports', 122),
  ('portal.parent',              'portals',       'Accéder au portail parent', 130),
  ('portal.student',             'portals',       'Accéder au portail élève', 131),
  ('assistant.use',              'assistant',     'Utiliser l''assistant intelligent', 140);

-- -----------------------------------------------------------------------------
-- Modèles de rôles (organization_id NULL)
-- -----------------------------------------------------------------------------
insert into public.roles (organization_id, key, name, description, persona, is_system) values
  (null, 'org_admin',        'Administrateur',         'Accès complet à la gestion de l''établissement', 'staff',   true),
  (null, 'director',         'Direction',              'Supervision administrative et pédagogique',       'staff',   true),
  (null, 'secretary',        'Secrétariat',            'Élèves, parents, inscriptions et documents',      'staff',   true),
  (null, 'accountant',       'Comptabilité',           'Gestion financière',                              'staff',   true),
  (null, 'teacher',          'Enseignant / Formateur', 'Notes et présences de ses classes',               'teacher', true),
  (null, 'training_manager', 'Responsable formation',  'Formations, sessions, modules et certificats',    'staff',   true),
  (null, 'parent',           'Parent / Tuteur',        'Portail parent',                                  'parent',  true),
  (null, 'student',          'Élève / Apprenant',      'Portail élève',                                   'student', true);

insert into public.role_permissions (role_id, permission_code)
select r.id, p.code
from public.roles r
join public.permissions p on (
  case r.key
    when 'org_admin' then p.module <> 'portals'
    when 'director' then p.module <> 'portals'
      and p.code not in ('roles.manage', 'settings.manage', 'users.manage', 'students.medical.manage')
    when 'secretary' then p.code in (
      'academic.read', 'staff.read', 'students.read', 'students.create', 'students.update', 'students.archive',
      'guardians.read', 'guardians.manage', 'conduct.read', 'enrollments.read', 'enrollments.manage',
      'attendance.read', 'attendance.justify', 'timetable.read', 'documents.read', 'documents.generate',
      'communication.message')
    when 'accountant' then p.code in (
      'academic.read', 'students.read', 'guardians.read', 'enrollments.read',
      'finance.read', 'finance.fees.manage', 'finance.invoices.manage', 'finance.payments.create',
      'finance.payments.cancel', 'documents.read', 'documents.generate',
      'reports.read', 'reports.finance', 'reports.export', 'communication.message')
    when 'teacher' then p.code in (
      'academic.read', 'grades.enter', 'attendance.take', 'timetable.read', 'communication.message')
    when 'training_manager' then p.code in (
      'academic.read', 'academic.manage', 'staff.read', 'students.read', 'students.create', 'students.update',
      'guardians.read', 'enrollments.read', 'enrollments.manage', 'enrollments.validate', 'forms.manage',
      'grades.read', 'grades.manage', 'report_cards.manage', 'attendance.read', 'timetable.read',
      'timetable.manage', 'documents.read', 'documents.generate', 'communication.announce',
      'communication.message', 'reports.read')
    when 'parent' then p.code in ('portal.parent')
    when 'student' then p.code in ('portal.student')
    else false
  end
)
where r.organization_id is null;

-- -----------------------------------------------------------------------------
-- Paramètres par défaut d'un établissement
-- -----------------------------------------------------------------------------
create or replace function app.default_org_settings()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'features', jsonb_build_object(
      'medical_records', true,
      'ranking', true,
      'conduct', true,
      'parent_portal', true,
      'student_portal', true,
      'messaging', true
    ),
    'grading', jsonb_build_object('scale', 20, 'pass_mark', 10, 'decimals', 2),
    'finance', jsonb_build_object('allow_overpayment', false),
    'numbering', jsonb_build_object(
      'student', '{CODE}-{YY}-{SEQ:5}',
      'enrollment', 'INS-{CODE}-{YY}-{SEQ:5}',
      'invoice', 'FAC-{CODE}-{YY}-{SEQ:6}',
      'payment', 'REC-{CODE}-{YY}-{SEQ:6}',
      'document', 'DOC-{CODE}-{YY}-{SEQ:6}',
      'staff', 'EMP-{CODE}-{SEQ:4}'
    )
  );
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.organization_branding enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_roles enable row level security;
alter table public.organization_counters enable row level security; -- aucun accès direct

create policy organizations_select on public.organizations for select to authenticated
  using (id = any ((select app.member_org_ids())::uuid[]) or (select app.is_platform_admin()));
create policy organizations_update on public.organizations for update to authenticated
  using (id = any ((select app.permitted_org_ids('settings.manage'))::uuid[]) or (select app.is_platform_admin()))
  with check (id = any ((select app.permitted_org_ids('settings.manage'))::uuid[]) or (select app.is_platform_admin()));

-- Seuls les administrateurs plateforme modifient statut, code et démo.
create or replace function app.guard_organization_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not app.is_platform_admin()
     and (new.status is distinct from old.status
          or new.code is distinct from old.code
          or new.is_demo is distinct from old.is_demo
          or new.parent_id is distinct from old.parent_id) then
    raise exception 'Modification réservée à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger organizations_guard before update on public.organizations
  for each row execute function app.guard_organization_update();

create policy branding_select on public.organization_branding for select to authenticated
  using (organization_id = any ((select app.member_org_ids())::uuid[]));
create policy branding_write on public.organization_branding for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('settings.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('settings.manage'))::uuid[]));

create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or (select app.is_platform_admin())
    or id in (
      select m.user_id from public.memberships m
      where m.organization_id = any ((select app.permitted_org_ids('users.read'))::uuid[])
    )
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- Colonnes modifiables par l'utilisateur lui-même (is_active reste protégé).
revoke update on public.profiles from authenticated;
grant update (first_name, last_name, avatar_path, locale, last_organization_id, last_seen_at)
  on public.profiles to authenticated;

create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = (select auth.uid()) or (select app.is_platform_admin()));

create policy permissions_select on public.permissions for select to authenticated using (true);

create policy roles_select on public.roles for select to authenticated
  using (organization_id is null or organization_id = any ((select app.member_org_ids())::uuid[]));
create policy roles_insert on public.roles for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('roles.manage'))::uuid[]) and not is_system);
create policy roles_update on public.roles for update to authenticated
  using (organization_id = any ((select app.permitted_org_ids('roles.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('roles.manage'))::uuid[]));
create policy roles_delete on public.roles for delete to authenticated
  using (organization_id = any ((select app.permitted_org_ids('roles.manage'))::uuid[]) and not is_system);

create policy role_permissions_select on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles r where r.id = role_id));
create policy role_permissions_write on public.role_permissions for all to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_id and r.organization_id = any ((select app.permitted_org_ids('roles.manage'))::uuid[])
  ))
  with check (exists (
    select 1 from public.roles r
    where r.id = role_id and r.organization_id = any ((select app.permitted_org_ids('roles.manage'))::uuid[])
  ));

create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or organization_id = any ((select app.permitted_org_ids('users.read'))::uuid[])
  );
create policy memberships_insert on public.memberships for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('users.manage'))::uuid[]) and user_id <> (select auth.uid()));
create policy memberships_update on public.memberships for update to authenticated
  using (organization_id = any ((select app.permitted_org_ids('users.manage'))::uuid[]) and user_id <> (select auth.uid()))
  with check (organization_id = any ((select app.permitted_org_ids('users.manage'))::uuid[]) and user_id <> (select auth.uid()));
create policy memberships_delete on public.memberships for delete to authenticated
  using (organization_id = any ((select app.permitted_org_ids('users.manage'))::uuid[]) and user_id <> (select auth.uid()));

create policy membership_roles_select on public.membership_roles for select to authenticated
  using (
    membership_id in (select m.id from public.memberships m where m.user_id = (select auth.uid()))
    or organization_id = any ((select app.permitted_org_ids('users.read'))::uuid[])
  );
create policy membership_roles_insert on public.membership_roles for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('users.manage'))::uuid[]));
create policy membership_roles_delete on public.membership_roles for delete to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('users.manage'))::uuid[])
    and membership_id not in (select m.id from public.memberships m where m.user_id = (select auth.uid()))
  );

-- -----------------------------------------------------------------------------
-- Horodatage
-- -----------------------------------------------------------------------------
create trigger organizations_touch before update on public.organizations
  for each row execute function app.touch_updated_at();
create trigger organization_branding_touch before update on public.organization_branding
  for each row execute function app.touch_updated_at();
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();
create trigger roles_touch before update on public.roles
  for each row execute function app.touch_updated_at();
create trigger memberships_touch before update on public.memberships
  for each row execute function app.touch_updated_at();

grant execute on function
  app.is_platform_admin(), app.member_org_ids(), app.permitted_org_ids(text),
  app.has_permission(uuid, text), app.is_member(uuid), app.my_personas(uuid),
  app.next_counter(uuid, text, text), app.generate_number(uuid, text, text),
  app.default_org_settings()
to authenticated, service_role;
grant execute on function public.my_permissions(uuid) to authenticated;
revoke execute on function public.my_permissions(uuid) from anon, public;
