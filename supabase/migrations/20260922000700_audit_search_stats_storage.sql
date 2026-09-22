-- =============================================================================
-- NéoScol — 0700 Audit inaltérable, recherche globale, statistiques,
-- stockage, provisionnement d'établissement, durcissement des privilèges
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Journal d'audit
-- -----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid,
  actor_id uuid,
  actor_email text,
  action text not null,
  entity_type text,
  entity_id uuid,
  summary text,
  changes jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

create or replace function app.audit_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Le journal d''audit est inaltérable.' using errcode = 'insufficient_privilege';
end;
$$;
create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function app.audit_immutable();
create trigger audit_logs_no_truncate
  before truncate on public.audit_logs
  for each statement execute function app.audit_immutable();

-- Trigger générique : enregistre les différences colonne par colonne.
-- TG_ARGV[0] = 'redact' masque les valeurs (données médicales).
create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_redact boolean := tg_nargs > 0 and tg_argv[0] = 'redact';
  v_ignored constant text[] := array['updated_at', 'search_text', 'created_at'];
begin
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any (v_ignored)) and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changes := v_changes || jsonb_build_object(
          v_key,
          case when v_redact then '"[masqué]"'::jsonb
               else jsonb_build_array(v_old -> v_key, v_new -> v_key) end
        );
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  elsif v_redact then
    v_changes := null;
  else
    v_changes := v_row - v_ignored;
  end if;

  insert into public.audit_logs (organization_id, actor_id, actor_email, action, entity_type, entity_id, changes, metadata)
  values (
    coalesce((v_row ->> 'organization_id')::uuid, case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid end),
    auth.uid(),
    auth.jwt() ->> 'email',
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid
         when v_row ? 'student_id' then (v_row ->> 'student_id')::uuid
         when v_row ? 'membership_id' then (v_row ->> 'membership_id')::uuid
         when v_row ? 'role_id' then (v_row ->> 'role_id')::uuid
         else null end,
    v_changes,
    jsonb_build_object('source', 'trigger')
  );
  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations', 'organization_branding', 'memberships', 'membership_roles', 'roles', 'role_permissions',
    'staff_members', 'academic_years', 'academic_periods', 'classes', 'class_subjects',
    'students', 'guardians', 'student_guardians', 'conduct_records', 'form_definitions', 'enrollments',
    'assessments', 'grades', 'report_cards', 'attendance_records',
    'fee_types', 'fee_rates', 'invoices', 'invoice_lines', 'installments', 'payments',
    'document_templates', 'issued_documents', 'announcements']
  loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s
                    for each row execute function app.audit_row()', t);
  end loop;
end;
$$;
create trigger student_medical_records_audit after insert or update or delete on public.student_medical_records
  for each row execute function app.audit_row('redact');

-- Événements applicatifs (connexion, génération de document, export…)
create or replace function public.log_event(
  p_action text,
  p_organization_id uuid default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_summary text default null,
  p_metadata jsonb default '{}'::jsonb
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
  if p_action !~ '^(auth|document|export|settings|assistant|report)\.[a-z_.]+$' then
    raise exception 'Action d''audit non autorisée : %', p_action using errcode = 'check_violation';
  end if;
  if p_organization_id is not null and not app.is_member(p_organization_id) then
    raise exception 'Établissement non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.audit_logs (organization_id, actor_id, actor_email, action, entity_type, entity_id, summary, metadata)
  values (p_organization_id, auth.uid(), auth.jwt() ->> 'email', p_action, p_entity_type, p_entity_id,
          left(p_summary, 500), coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object('source', 'app'));
end;
$$;
revoke execute on function public.log_event(text, uuid, text, uuid, text, jsonb) from public, anon;
grant execute on function public.log_event(text, uuid, text, uuid, text, jsonb) to authenticated;

alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('audit.read'))::uuid[])
    or (organization_id is null and (select app.is_platform_admin()))
  );
revoke insert, update, delete, truncate on public.audit_logs from authenticated, anon;
revoke update, delete, truncate on public.audit_logs from service_role;

-- -----------------------------------------------------------------------------
-- Recherche globale (SECURITY INVOKER : la RLS s'applique)
-- -----------------------------------------------------------------------------
create or replace function public.global_search(p_organization_id uuid, p_query text, p_limit integer default 20)
returns table (entity_type text, entity_id uuid, title text, subtitle text, score real)
language sql
stable
security invoker
set search_path = ''
as $$
  with q as (
    select app.search_normalize(btrim(p_query)) as term,
           '%' || replace(replace(replace(app.search_normalize(btrim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
  ),
  results as (
    select 'student'::text, s.id, s.last_name || ' ' || s.first_name, s.matricule,
           extensions.similarity(s.search_text, q.term)
    from public.students s, q
    where s.organization_id = p_organization_id and s.search_text like q.pattern
    union all
    select 'guardian', g.id, g.last_name || ' ' || g.first_name, coalesce(g.phone, g.email),
           extensions.similarity(g.search_text, q.term)
    from public.guardians g, q
    where g.organization_id = p_organization_id and g.search_text like q.pattern
    union all
    select 'staff', st.id, st.last_name || ' ' || st.first_name, coalesce(st.job_title, ''),
           extensions.similarity(st.search_text, q.term)
    from public.staff_members st, q
    where st.organization_id = p_organization_id and st.search_text like q.pattern
    union all
    select 'class', c.id, c.name, coalesce(c.code, ''), extensions.similarity(c.search_text, q.term)
    from public.classes c, q
    where c.organization_id = p_organization_id and c.search_text like q.pattern and c.archived_at is null
    union all
    select 'program', p.id, p.name, p.code, extensions.similarity(p.search_text, q.term)
    from public.programs p, q
    where p.organization_id = p_organization_id and p.search_text like q.pattern
    union all
    select 'enrollment', e.id, e.reference, e.status::text, extensions.similarity(e.search_text, q.term)
    from public.enrollments e, q
    where e.organization_id = p_organization_id and e.search_text like q.pattern
    union all
    select 'invoice', i.id, i.number, to_char(i.total, 'FM999G999G999G990'), extensions.similarity(i.search_text, q.term)
    from public.invoices i, q
    where i.organization_id = p_organization_id and i.search_text like q.pattern
    union all
    select 'payment', pa.id, pa.number, to_char(pa.amount, 'FM999G999G999G990'), extensions.similarity(pa.search_text, q.term)
    from public.payments pa, q
    where pa.organization_id = p_organization_id and pa.search_text like q.pattern
    union all
    select 'document', d.id, d.number, d.title, extensions.similarity(d.search_text, q.term)
    from public.issued_documents d, q
    where d.organization_id = p_organization_id and d.search_text like q.pattern
  )
  select * from results
  where length((select term from q)) >= 2
  order by 5 desc, 3
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function public.global_search(uuid, text, integer) from public, anon;
grant execute on function public.global_search(uuid, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Tableau de bord (SECURITY INVOKER : chiffres limités à ce que l'utilisateur voit ;
-- un indicateur n'est renvoyé que si l'utilisateur possède la permission associée)
-- -----------------------------------------------------------------------------
create or replace function public.dashboard_overview(p_organization_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_year uuid;
  v_tz text;
  v_today date;
  v_month_start date;
  v_result jsonb := '{}'::jsonb;
begin
  if not app.is_member(p_organization_id) then
    raise exception 'Établissement non autorisé.' using errcode = 'insufficient_privilege';
  end if;

  select timezone into v_tz from public.organizations where id = p_organization_id;
  v_today := (now() at time zone coalesce(v_tz, 'UTC'))::date;
  v_month_start := date_trunc('month', v_today)::date;
  select id into v_year from public.academic_years where organization_id = p_organization_id and is_current;
  v_result := v_result || jsonb_build_object('academic_year_id', v_year, 'today', v_today);

  if app.has_permission(p_organization_id, 'students.read') then
    v_result := v_result || jsonb_build_object(
      'students_active', (select count(*) from public.students
                          where organization_id = p_organization_id and status = 'active' and archived_at is null),
      'students_by_sex', (select coalesce(jsonb_object_agg(coalesce(sex, '?'), n), '{}') from (
                            select sex, count(*) n from public.students
                            where organization_id = p_organization_id and status = 'active' and archived_at is null
                            group by sex) x)
    );
  end if;

  if app.has_permission(p_organization_id, 'enrollments.read') then
    v_result := v_result || jsonb_build_object(
      'enrollments_pending', (select count(*) from public.enrollments
                              where organization_id = p_organization_id and status = 'pending'),
      'enrollments_validated', (select count(*) from public.enrollments
                                where organization_id = p_organization_id and academic_year_id = v_year
                                  and status = 'validated' and type = 'new'),
      'reenrollments_validated', (select count(*) from public.enrollments
                                  where organization_id = p_organization_id and academic_year_id = v_year
                                    and status = 'validated' and type = 'reenrollment'),
      'enrollments_by_class', (select coalesce(jsonb_agg(jsonb_build_object('class', c.name, 'count', x.n) order by c.name), '[]') from (
                                 select class_id, count(*) n from public.enrollments
                                 where organization_id = p_organization_id and academic_year_id = v_year and status = 'validated'
                                 group by class_id) x
                               join public.classes c on c.id = x.class_id)
    );
  end if;

  if app.has_permission(p_organization_id, 'academic.read') then
    v_result := v_result || jsonb_build_object(
      'classes', (select count(*) from public.classes
                  where organization_id = p_organization_id and academic_year_id = v_year and archived_at is null)
    );
  end if;

  if app.has_permission(p_organization_id, 'staff.read') then
    v_result := v_result || jsonb_build_object(
      'teachers', (select count(*) from public.staff_members
                   where organization_id = p_organization_id and is_teacher and status = 'active' and archived_at is null)
    );
  end if;

  if app.has_permission(p_organization_id, 'finance.read') then
    v_result := v_result || jsonb_build_object(
      'currency', (select currency from public.organizations where id = p_organization_id),
      'payments_month', (select coalesce(sum(amount), 0) from public.payments
                         where organization_id = p_organization_id and status = 'completed'
                           and (paid_at at time zone coalesce(v_tz, 'UTC'))::date >= v_month_start),
      'outstanding_total', (select coalesce(sum(balance), 0) from public.invoice_balances
                            where organization_id = p_organization_id and status = 'issued' and balance > 0),
      'overdue_invoices', (select count(*) from public.invoice_balances
                           where organization_id = p_organization_id and is_overdue),
      'payments_by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'amount', coalesce(s.total, 0)) order by m), '[]')
                            from generate_series(v_month_start - interval '5 months', v_month_start, interval '1 month') m
                            left join (
                              select date_trunc('month', paid_at at time zone coalesce(v_tz, 'UTC')) as month, sum(amount) as total
                              from public.payments
                              where organization_id = p_organization_id and status = 'completed'
                                and paid_at >= (v_month_start - interval '5 months')
                              group by 1
                            ) s on s.month = m)
    );
  end if;

  if app.has_permission(p_organization_id, 'attendance.read') or app.has_permission(p_organization_id, 'attendance.manage') then
    v_result := v_result || jsonb_build_object(
      'absences_today', (select count(*) from public.attendance_records r
                         join public.attendance_sessions s on s.id = r.session_id
                         where r.organization_id = p_organization_id and s.session_date = v_today and r.status = 'absent'),
      'absences_week', (select count(*) from public.attendance_records r
                        join public.attendance_sessions s on s.id = r.session_id
                        where r.organization_id = p_organization_id and s.session_date > v_today - 7 and r.status = 'absent'),
      'lates_week', (select count(*) from public.attendance_records r
                     join public.attendance_sessions s on s.id = r.session_id
                     where r.organization_id = p_organization_id and s.session_date > v_today - 7 and r.status = 'late')
    );
  end if;

  if app.has_permission(p_organization_id, 'grades.read') or app.has_permission(p_organization_id, 'grades.manage') then
    v_result := v_result || jsonb_build_object(
      'average_by_class', (select coalesce(jsonb_agg(jsonb_build_object('class', x.name, 'average', x.avg) order by x.name), '[]') from (
                             select c.name, round(avg(g.score / a.max_score * 20), 2) as avg
                             from public.grades g
                             join public.assessments a on a.id = g.assessment_id
                             join public.classes c on c.id = a.class_id
                             where g.organization_id = p_organization_id and c.academic_year_id = v_year and g.score is not null
                             group by c.name) x)
    );
  end if;

  if app.has_permission(p_organization_id, 'audit.read') then
    v_result := v_result || jsonb_build_object(
      'recent_activity', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]') from (
                            select id, action, entity_type, actor_email, summary, created_at
                            from public.audit_logs where organization_id = p_organization_id
                            order by created_at desc limit 8) x)
    );
  end if;

  return v_result;
end;
$$;
revoke execute on function public.dashboard_overview(uuid) from public, anon;
grant execute on function public.dashboard_overview(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Provisionnement d'un établissement (rôles, paramètres, formulaire, modèles)
-- -----------------------------------------------------------------------------
create or replace function app.provision_organization(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.organizations
     set settings = app.default_org_settings() || settings
   where id = p_org;

  insert into public.organization_branding (organization_id) values (p_org)
  on conflict (organization_id) do nothing;

  insert into public.roles (organization_id, key, name, description, persona, is_system)
  select p_org, r.key, r.name, r.description, r.persona, true
  from public.roles r where r.organization_id is null
  on conflict (organization_id, key) do nothing;

  insert into public.role_permissions (role_id, permission_code)
  select org_role.id, rp.permission_code
  from public.roles tpl
  join public.role_permissions rp on rp.role_id = tpl.id
  join public.roles org_role on org_role.organization_id = p_org and org_role.key = tpl.key
  where tpl.organization_id is null
  on conflict do nothing;

  insert into public.form_definitions (organization_id, kind, name, fields)
  select p_org, k.kind, k.name, k.fields
  from (values
    ('enrollment', 'Formulaire d''inscription', '[
      {"key":"previous_school","label":"Établissement précédent","type":"text","required":false,"section":"Scolarité"},
      {"key":"previous_level","label":"Dernière classe suivie","type":"text","required":false,"section":"Scolarité"},
      {"key":"transport","label":"Utilise le transport scolaire","type":"checkbox","required":false,"section":"Services"},
      {"key":"canteen","label":"Inscrit à la cantine","type":"checkbox","required":false,"section":"Services"},
      {"key":"birth_certificate","label":"Extrait d''acte de naissance","type":"file","required":true,"section":"Pièces"},
      {"key":"id_photo","label":"Photo d''identité","type":"file","required":false,"section":"Pièces"}
    ]'::jsonb),
    ('reenrollment', 'Formulaire de réinscription', '[
      {"key":"transport","label":"Utilise le transport scolaire","type":"checkbox","required":false,"section":"Services"},
      {"key":"canteen","label":"Inscrit à la cantine","type":"checkbox","required":false,"section":"Services"}
    ]'::jsonb)
  ) as k(kind, name, fields)
  where not exists (
    select 1 from public.form_definitions f where f.organization_id = p_org and f.kind = k.kind and f.is_active
  );

  insert into public.document_templates (organization_id, kind, name, layout, page_size, is_default)
  select p_org, t.kind, t.name, t.layout, t.page_size, true
  from (values
    ('school_certificate', 'Certificat de scolarité', 'A4',
     '{"title":"CERTIFICAT DE SCOLARITÉ","body":"Je soussigné(e), {{signataire.nom}}, {{signataire.fonction}} de {{etablissement.nom}}, certifie que l''élève {{eleve.prenom}} {{eleve.nom}}, matricule {{eleve.matricule}}, né(e) le {{eleve.date_naissance}} à {{eleve.lieu_naissance}}, est régulièrement inscrit(e) en classe de {{classe.nom}} pour l''année scolaire {{annee.nom}}.","closing":"En foi de quoi, le présent certificat lui est délivré pour servir et valoir ce que de droit.","show_qr":true,"show_stamp":true}'::jsonb),
    ('attestation', 'Attestation', 'A4',
     '{"title":"ATTESTATION","body":"{{contenu}}","show_qr":true,"show_stamp":true}'::jsonb),
    ('training_certificate', 'Certificat de formation', 'A4',
     '{"title":"CERTIFICAT DE FORMATION","body":"Décerné à {{eleve.prenom}} {{eleve.nom}} pour avoir suivi avec succès la formation {{formation.nom}} ({{formation.duree}} heures).","show_qr":true,"show_stamp":true,"orientation":"landscape"}'::jsonb),
    ('receipt', 'Reçu de paiement', 'A5',
     '{"title":"REÇU DE PAIEMENT","show_qr":true,"show_stamp":false}'::jsonb),
    ('report_card', 'Bulletin de notes', 'A4',
     '{"title":"BULLETIN DE NOTES","show_qr":true,"show_stamp":true,"show_rank":true}'::jsonb),
    ('student_card', 'Carte scolaire', 'CR80',
     '{"title":"CARTE SCOLAIRE","show_qr":true,"show_photo":true}'::jsonb)
  ) as t(kind, name, page_size, layout)
  on conflict do nothing;
end;
$$;

create or replace function app.organization_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.provision_organization(new.id);
  return new;
end;
$$;
create trigger organizations_provision
  after insert on public.organizations
  for each row execute function app.organization_after_insert();

-- Création d'un établissement par l'administration de la plateforme.
create or replace function public.create_organization(
  p_name text, p_code text, p_slug text, p_type public.organization_type,
  p_city text default null, p_country text default 'CI', p_currency text default 'XOF',
  p_timezone text default 'Africa/Abidjan'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.organizations (name, code, slug, type, city, country, currency, timezone)
  values (p_name, upper(p_code), lower(p_slug), p_type, p_city, p_country, p_currency, p_timezone)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_organization(text, text, text, public.organization_type, text, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, public.organization_type, text, text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Stockage : buckets privés, chemins préfixés par l'établissement
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('org-assets', 'org-assets', false, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']),
  ('student-files', 'student-files', false, 10485760, array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']),
  ('generated-documents', 'generated-documents', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy "neoscol org-assets read" on storage.objects for select to authenticated
  using (bucket_id = 'org-assets' and (storage.foldername(name))[1] = any ((select app.member_org_ids())::text[]));
create policy "neoscol org-assets write" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-assets' and (storage.foldername(name))[1] = any ((select app.permitted_org_ids('settings.manage'))::text[]));
create policy "neoscol org-assets update" on storage.objects for update to authenticated
  using (bucket_id = 'org-assets' and (storage.foldername(name))[1] = any ((select app.permitted_org_ids('settings.manage'))::text[]));
create policy "neoscol org-assets delete" on storage.objects for delete to authenticated
  using (bucket_id = 'org-assets' and (storage.foldername(name))[1] = any ((select app.permitted_org_ids('settings.manage'))::text[]));

create policy "neoscol student-files read" on storage.objects for select to authenticated
  using (bucket_id = 'student-files' and (storage.foldername(name))[1] = any ((select app.permitted_org_ids('students.read'))::text[]));
create policy "neoscol student-files write" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-files' and (
    (storage.foldername(name))[1] = any ((select app.permitted_org_ids('students.update'))::text[])
    or (storage.foldername(name))[1] = any ((select app.permitted_org_ids('enrollments.manage'))::text[])));

create policy "neoscol generated-documents read" on storage.objects for select to authenticated
  using (bucket_id = 'generated-documents' and (storage.foldername(name))[1] = any ((select app.permitted_org_ids('documents.read'))::text[]));
create policy "neoscol generated-documents write" on storage.objects for insert to authenticated
  with check (bucket_id = 'generated-documents' and (storage.foldername(name))[1] = any ((select app.permitted_org_ids('documents.generate'))::text[]));

-- -----------------------------------------------------------------------------
-- Durcissement : le rôle anonyme n'a accès à AUCUNE table ; seules les
-- fonctions explicitement autorisées (verify_document) lui sont ouvertes.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

grant execute on function app.audit_row(), app.provision_organization(uuid) to service_role;
