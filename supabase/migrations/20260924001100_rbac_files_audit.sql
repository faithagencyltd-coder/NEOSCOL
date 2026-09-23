-- =============================================================================
-- NéoScol — 1100 Permissions complémentaires, rôle « tablette de pointage »,
-- fichiers stockés en base (D-15), audit enrichi (rôle, résultat)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Nouvelles permissions
-- -----------------------------------------------------------------------------
insert into public.permissions (code, module, label, sort_order) values
  ('staff.badges.manage',        'staff',     'Générer, imprimer et désactiver les badges du personnel', 32),
  ('staff.delete',               'staff',     'Supprimer définitivement un membre du personnel', 33),
  ('staff_attendance.scan',      'staff',     'Utiliser la tablette de pointage (scan des badges)', 34),
  ('staff_attendance.read',      'staff',     'Consulter le pointage du personnel', 35),
  ('students.delete',            'students',  'Supprimer définitivement un dossier élève archivé', 43),
  ('portal_access.manage',       'students',  'Gérer les accès aux portails et les restrictions', 50),
  ('documents.dossier',          'documents', 'Générer le dossier complet PDF d''un élève', 104),
  ('finance.expenses.read',      'finance',   'Consulter les dépenses', 95),
  ('finance.expenses.manage',    'finance',   'Enregistrer, modifier et annuler des dépenses', 96),
  ('finance.expenses.delete',    'finance',   'Supprimer définitivement des dépenses', 97);

-- Tablette de pointage : compte dédié, une seule permission.
insert into public.roles (organization_id, key, name, description, persona, is_system) values
  (null, 'kiosk', 'Tablette de pointage', 'Scan des badges du personnel à l''administration', 'staff', true);

-- Modèles ET rôles déjà provisionnés dans les établissements existants.
insert into public.role_permissions (role_id, permission_code)
select r.id, n.permission_code
from (values
  ('org_admin', 'staff.badges.manage'), ('org_admin', 'staff.delete'), ('org_admin', 'staff_attendance.scan'),
  ('org_admin', 'staff_attendance.read'), ('org_admin', 'students.delete'), ('org_admin', 'portal_access.manage'),
  ('org_admin', 'documents.dossier'), ('org_admin', 'finance.expenses.read'), ('org_admin', 'finance.expenses.manage'),
  ('org_admin', 'finance.expenses.delete'),
  ('director', 'staff.badges.manage'), ('director', 'staff_attendance.scan'), ('director', 'staff_attendance.read'),
  ('director', 'portal_access.manage'), ('director', 'documents.dossier'), ('director', 'finance.expenses.read'),
  ('director', 'finance.expenses.manage'),
  ('secretary', 'staff.badges.manage'), ('secretary', 'staff_attendance.scan'), ('secretary', 'staff_attendance.read'),
  ('secretary', 'portal_access.manage'), ('secretary', 'documents.dossier'),
  ('accountant', 'finance.expenses.read'), ('accountant', 'finance.expenses.manage'),
  ('training_manager', 'staff_attendance.read'), ('training_manager', 'documents.dossier'),
  ('kiosk', 'staff_attendance.scan')
) as n(role_key, permission_code)
join public.roles r on r.key = n.role_key
on conflict do nothing;

insert into public.roles (organization_id, key, name, description, persona, is_system)
select o.id, 'kiosk', 'Tablette de pointage', 'Scan des badges du personnel à l''administration', 'staff', true
from public.organizations o
on conflict (organization_id, key) do nothing;
insert into public.role_permissions (role_id, permission_code)
select r.id, 'staff_attendance.scan' from public.roles r where r.key = 'kiosk'
on conflict do nothing;

-- Attribution des rôles portail (parent / élève) par les détenteurs de portal_access.manage.
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

  if app.has_permission(new.organization_id, 'portal_access.manage')
     and exists (select 1 from public.roles r where r.id = new.role_id and r.persona in ('parent', 'student')) then
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

-- -----------------------------------------------------------------------------
-- Paramètres par défaut complétés (les établissements existants sont complétés
-- sans écraser leurs valeurs).
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
    'grading', jsonb_build_object('scale', 20, 'pass_mark', 10, 'decimals', 2, 'lock_after_validation', true),
    'finance', jsonb_build_object('allow_overpayment', false),
    'numbering', jsonb_build_object(
      'student', '{CODE}-{YY}-{SEQ:5}',
      'enrollment', 'INS-{CODE}-{YY}-{SEQ:5}',
      'invoice', 'FAC-{CODE}-{YY}-{SEQ:6}',
      'payment', 'REC-{CODE}-{YY}-{SEQ:6}',
      'document', 'DOC-{CODE}-{YY}-{SEQ:6}',
      'staff', 'EMP-{CODE}-{SEQ:4}',
      'badge', 'BDG-{CODE}-{YY}-{SEQ:5}',
      'expense', 'DEP-{CODE}-{YY}-{SEQ:5}'
    ),
    -- Pointage : fenêtre d'ouverture avant le cours, tolérance de retard,
    -- délai anti double-scan, suivi des départs.
    'staff_attendance', jsonb_build_object(
      'open_before_minutes', 15,
      'late_tolerance_minutes', 5,
      'duplicate_window_seconds', 60,
      'track_departure', true
    ),
    -- Restrictions des portails en cas d'impayé (les présences restent TOUJOURS visibles).
    'portal_restrictions', jsonb_build_object(
      'enabled', false,
      'grace_days', 0,
      'min_overdue_amount', 0,
      'features', jsonb_build_object('grades', true, 'report_cards', true, 'documents', true, 'timetable', false)
    ),
    'reminders', jsonb_build_object('days_before_due', 3, 'overdue_interval_days', 7)
  );
$$;

update public.organizations o
   set settings = (
     select jsonb_object_agg(
              d.key,
              case when jsonb_typeof(d.value) = 'object' and jsonb_typeof(o.settings -> d.key) = 'object'
                   then d.value || (o.settings -> d.key)
                   else coalesce(o.settings -> d.key, d.value) end)
     from jsonb_each(app.default_org_settings()) d
   ) || (o.settings - array(select jsonb_object_keys(app.default_org_settings())));

-- -----------------------------------------------------------------------------
-- Fichiers stockés en base (D-15) : justificatifs, photos, pièces de dépenses.
-- Le contenu (≤ 5 Mo) est protégé par la même RLS que la ligne ; aucune
-- dépendance à un service de stockage externe.
-- -----------------------------------------------------------------------------
alter table public.file_objects drop constraint file_objects_bucket_check;
alter table public.file_objects add constraint file_objects_bucket_check
  check (bucket in ('org-assets', 'student-files', 'generated-documents', 'database'));
alter table public.file_objects drop constraint file_objects_owner_type_check;
alter table public.file_objects add constraint file_objects_owner_type_check
  check (owner_type in ('organization', 'student', 'guardian', 'staff', 'enrollment', 'issued_document',
                        'attendance_record', 'absence_justification', 'expense'));
alter table public.file_objects
  add column content bytea,
  add column sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  add constraint file_objects_database_content check (
    bucket <> 'database' or (content is not null and octet_length(content) = size_bytes and size_bytes <= 5242880)
  ),
  add constraint file_objects_mime_check check (
    mime_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf')
  ),
  add unique (organization_id, id);

create or replace function app.file_object_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.uploaded_by := coalesce(auth.uid(), new.uploaded_by);
    if new.content is not null then
      new.size_bytes := octet_length(new.content);
      new.sha256 := encode(extensions.digest(new.content, 'sha256'), 'hex');
    end if;
    return new;
  end if;
  -- Seul le rattachement (owner_id) d'un fichier non encore rattaché peut évoluer.
  if (to_jsonb(new) - 'owner_id') is distinct from (to_jsonb(old) - 'owner_id')
     or (old.owner_id is not null and new.owner_id is distinct from old.owner_id) then
    raise exception 'Un fichier enregistré ne peut pas être modifié.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger file_objects_guard
  before insert or update on public.file_objects
  for each row execute function app.file_object_guard();

drop policy file_objects_select on public.file_objects;
drop policy file_objects_insert on public.file_objects;

-- Accès en lecture défini par le type de propriétaire ; les politiques des
-- justificatifs et dépenses sont complétées dans les migrations suivantes
-- (fonction app.can_read_file redéfinie).
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
    else false
  end;
$$;

create or replace function app.can_write_file(p_org uuid, p_owner_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_owner_type
    when 'organization' then app.has_permission(p_org, 'settings.manage')
    when 'student' then app.has_permission(p_org, 'students.update')
    when 'guardian' then app.has_permission(p_org, 'guardians.manage')
    when 'staff' then app.has_permission(p_org, 'staff.manage')
    when 'enrollment' then app.has_permission(p_org, 'enrollments.manage')
    when 'issued_document' then app.has_permission(p_org, 'documents.generate')
    when 'attendance_record' then app.has_permission(p_org, 'attendance.justify')
    -- Justificatif d'absence : administration OU famille (rattachement contrôlé par RPC).
    when 'absence_justification' then app.has_permission(p_org, 'attendance.justify')
      or ('parent' = any (app.my_personas(p_org))) or ('student' = any (app.my_personas(p_org)))
    when 'expense' then app.has_permission(p_org, 'finance.expenses.manage')
    else false
  end;
$$;

create policy file_objects_select on public.file_objects for select to authenticated
  using (app.can_read_file(organization_id, owner_type, owner_id, uploaded_by));
create policy file_objects_insert on public.file_objects for insert to authenticated
  with check (app.can_write_file(organization_id, owner_type) and bucket = 'database');
create policy file_objects_update on public.file_objects for update to authenticated
  using (uploaded_by = (select auth.uid()) or app.can_write_file(organization_id, owner_type))
  with check (uploaded_by = (select auth.uid()) or app.can_write_file(organization_id, owner_type));
create policy file_objects_delete on public.file_objects for delete to authenticated
  using (app.can_write_file(organization_id, owner_type));

-- -----------------------------------------------------------------------------
-- Audit enrichi : rôle de l'acteur et résultat de l'action
-- -----------------------------------------------------------------------------
alter table public.audit_logs
  add column result text not null default 'success' check (result in ('success', 'failure', 'denied')),
  add column actor_role text;
create index audit_logs_org_action_idx on public.audit_logs (organization_id, action, created_at desc);

create or replace function app.actor_role_names(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'système'
    else coalesce(
      (select string_agg(distinct r.name, ', ' order by r.name)
       from public.memberships m
       join public.membership_roles mr on mr.membership_id = m.id
       join public.roles r on r.id = mr.role_id
       where m.user_id = auth.uid() and m.organization_id = p_org),
      case when app.is_platform_admin() then 'Super administrateur' end)
  end;
$$;

create or replace function app.audit_fill_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.actor_role is null then
    new.actor_role := app.actor_role_names(new.organization_id);
  end if;
  if new.actor_email is null and new.actor_id is not null then
    select email into new.actor_email from public.profiles where id = new.actor_id;
  end if;
  return new;
end;
$$;
create trigger audit_logs_fill_actor
  before insert on public.audit_logs
  for each row execute function app.audit_fill_actor();

-- Événement métier écrit par les fonctions SECURITY DEFINER.
create or replace function app.audit(
  p_org uuid, p_action text, p_entity_type text, p_entity_id uuid, p_summary text,
  p_metadata jsonb default '{}'::jsonb, p_result text default 'success'
)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.audit_logs (organization_id, actor_id, actor_email, action, entity_type, entity_id, summary, metadata, result)
  values (p_org, auth.uid(), auth.jwt() ->> 'email', p_action, p_entity_type, p_entity_id, left(p_summary, 500),
          coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'rpc'), p_result);
$$;

drop function public.log_event(text, uuid, text, uuid, text, jsonb);
create or replace function public.log_event(
  p_action text,
  p_organization_id uuid default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_result text default 'success'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise.' using errcode = 'insufficient_privilege';
  end if;
  if p_action !~ '^(auth|document|export|settings|assistant|report|portal|staff|student|finance|attendance|grades)\.[a-z_.]+$' then
    raise exception 'Action d''audit non autorisée : %', p_action using errcode = 'check_violation';
  end if;
  if p_result not in ('success', 'failure', 'denied') then
    raise exception 'Résultat d''audit invalide.' using errcode = 'check_violation';
  end if;
  if p_organization_id is not null and not app.is_member(p_organization_id) then
    raise exception 'Établissement non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.audit_logs (organization_id, actor_id, actor_email, action, entity_type, entity_id, summary, metadata, result)
  values (p_organization_id, auth.uid(), auth.jwt() ->> 'email', p_action, p_entity_type, p_entity_id,
          left(p_summary, 500), coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'app'), p_result);
end;
$$;
revoke execute on function public.log_event(text, uuid, text, uuid, text, jsonb, text) from public, anon;
grant execute on function public.log_event(text, uuid, text, uuid, text, jsonb, text) to authenticated;

grant execute on function
  app.can_read_file(uuid, text, uuid, uuid), app.can_write_file(uuid, text), app.actor_role_names(uuid)
to authenticated, service_role;
