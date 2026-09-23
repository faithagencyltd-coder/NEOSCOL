-- =============================================================================
-- NéoScol — 1600 Audit de conformité (corrections)
--
-- 1. Un élève ARCHIVÉ n'est plus accessible par les portails (le sien et celui
--    de ses parents) ; son compte élève est suspendu, puis réactivé à la
--    restauration. L'historique (notes, présences, paiements, documents) est
--    intégralement conservé et reste consultable par l'administration.
-- =============================================================================

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
    join public.students s on s.id = sg.student_id and s.archived_at is null
    , orgs
    where g.user_id = auth.uid() and g.archived_at is null and g.organization_id = any (orgs.ids)
    union
    select s.id
    from public.students s, orgs
    where s.user_id = auth.uid() and s.archived_at is null and s.organization_id = any (orgs.ids)
  ) x;
$$;

create or replace function app.student_portal_account_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and new.archived_at is distinct from old.archived_at then
    update public.memberships
       set status = case when new.archived_at is null then 'active' else 'suspended' end::public.membership_status
     where organization_id = new.organization_id and user_id = new.user_id
       -- Ne réactive pas un compte suspendu volontairement par ailleurs.
       and (new.archived_at is not null or status = 'suspended');
    perform app.audit(new.organization_id,
                      case when new.archived_at is null then 'portal.account_reactivated' else 'portal.account_suspended' end,
                      'students', new.id,
                      case when new.archived_at is null then 'Compte portail élève réactivé (dossier restauré)'
                           else 'Compte portail élève suspendu (dossier archivé)' end);
  end if;
  return new;
end;
$$;
drop trigger if exists students_portal_account_sync on public.students;
create trigger students_portal_account_sync
  after update of archived_at on public.students
  for each row execute function app.student_portal_account_sync();

-- -----------------------------------------------------------------------------
-- 2. Console du Super Administrateur NéoScol : établissements de la plateforme,
--    premier administrateur d'un nouvel établissement.
-- -----------------------------------------------------------------------------
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.is_platform_admin();
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.platform_overview()
returns table (
  id uuid, name text, code text, type text, city text, status text, is_demo boolean, created_at timestamptz,
  students bigint, staff bigint, members bigint, admins bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select o.id, o.name, o.code, o.type::text, o.city, o.status::text, o.is_demo, o.created_at,
           (select count(*) from public.students s where s.organization_id = o.id and s.archived_at is null),
           (select count(*) from public.staff_members st where st.organization_id = o.id and st.archived_at is null),
           (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active'),
           (select count(*) from public.memberships m join public.membership_roles mr on mr.membership_id = m.id
              join public.roles r on r.id = mr.role_id and r.key = 'org_admin' where m.organization_id = o.id)
    from public.organizations o
    order by o.created_at desc;
end;
$$;
revoke execute on function public.platform_overview() from public, anon;
grant execute on function public.platform_overview() to authenticated;

-- Rattache un compte (créé côté serveur après contrôle) comme administrateur d'un établissement.
create or replace function public.platform_add_org_admin(p_organization_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_membership uuid;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.memberships (organization_id, user_id, status, joined_at, invited_by)
  values (p_organization_id, p_user_id, 'active', now(), auth.uid())
  on conflict (organization_id, user_id) do update set status = 'active'
  returning id into v_membership;
  insert into public.membership_roles (organization_id, membership_id, role_id)
  select p_organization_id, v_membership, r.id from public.roles r
  where r.organization_id = p_organization_id and r.key = 'org_admin'
  on conflict do nothing;
  perform app.audit(p_organization_id, 'settings.org_admin_created', 'memberships', v_membership,
                    'Administrateur de l''établissement créé par la plateforme');
end;
$$;
revoke execute on function public.platform_add_org_admin(uuid, uuid) from public, anon;
grant execute on function public.platform_add_org_admin(uuid, uuid) to authenticated;

-- Garde des attributions de rôles : la plateforme peut nommer un administrateur.
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

  -- La plateforme (Super administrateur) nomme le premier administrateur d'un établissement.
  if app.is_platform_admin() or app.has_permission(new.organization_id, 'roles.manage') then
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
-- 3. Rapports et statistiques : agrégats par section, contrôlés par
--    reports.read (reports.finance pour les finances). Exports CSV côté serveur.
-- -----------------------------------------------------------------------------
create or replace function public.report_section(p_organization_id uuid, p_section text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_year uuid;
  v_result jsonb;
begin
  if not app.has_permission(p_organization_id, 'reports.read') then
    raise exception 'Les rapports nécessitent la permission reports.read.' using errcode = 'insufficient_privilege';
  end if;
  if p_section = 'finances' and not app.has_permission(p_organization_id, 'reports.finance') then
    raise exception 'Les rapports financiers nécessitent la permission reports.finance.' using errcode = 'insufficient_privilege';
  end if;
  select id into v_year from public.academic_years where organization_id = p_organization_id and is_current;

  if p_section = 'effectifs' then
    select jsonb_build_object(
      'rows', coalesce(jsonb_agg(r order by r->>'niveau', r->>'classe'), '[]'),
      'total', (select count(*) from public.enrollments e where e.organization_id = p_organization_id and e.academic_year_id = v_year and e.status = 'validated'))
    into v_result
    from (
      select jsonb_build_object(
        'classe', c.name, 'niveau', coalesce(l.name, p.name, '—'), 'capacite', c.capacity,
        'effectif', count(e.id), 'filles', count(e.id) filter (where s.sex = 'F'), 'garcons', count(e.id) filter (where s.sex = 'M'),
        'taux_remplissage', case when c.capacity > 0 then round(count(e.id) * 100.0 / c.capacity, 1) end) r
      from public.classes c
      left join public.levels l on l.id = c.level_id
      left join public.programs p on p.id = c.program_id
      left join public.enrollments e on e.class_id = c.id and e.status = 'validated'
      left join public.students s on s.id = e.student_id
      where c.organization_id = p_organization_id and c.academic_year_id = v_year
      group by c.id, c.name, l.name, p.name, c.capacity
    ) x;

  elsif p_section = 'inscriptions' then
    select jsonb_build_object('rows', coalesce(jsonb_agg(r order by r->>'classe'), '[]')) into v_result
    from (
      select jsonb_build_object(
        'classe', coalesce(c.name, '— sans classe —'),
        'nouvelles', count(*) filter (where e.type = 'new' and e.status = 'validated'),
        'reinscriptions', count(*) filter (where e.type = 'reenrollment' and e.status = 'validated'),
        'transferts', count(*) filter (where e.type = 'transfer' and e.status = 'validated'),
        'en_attente', count(*) filter (where e.status = 'pending'),
        'rejetees', count(*) filter (where e.status = 'rejected'),
        'annulees', count(*) filter (where e.status = 'cancelled')) r
      from public.enrollments e left join public.classes c on c.id = e.class_id
      where e.organization_id = p_organization_id and e.academic_year_id = v_year
      group by c.name
    ) x;

  elsif p_section = 'finances' then
    select jsonb_build_object(
      'rows', coalesce((
        select jsonb_agg(r order by r->>'classe') from (
          select jsonb_build_object(
            'classe', coalesce(c.name, '—'), 'factures', count(b.invoice_id),
            'facture', coalesce(sum(b.total), 0), 'encaisse', coalesce(sum(b.paid), 0), 'reste', coalesce(sum(b.balance), 0),
            'en_retard', count(*) filter (where b.is_overdue)) r
          from public.invoice_balances b
          left join public.enrollments e on e.id = (select i.enrollment_id from public.invoices i where i.id = b.invoice_id)
          left join public.classes c on c.id = e.class_id
          where b.organization_id = p_organization_id and b.status = 'issued'
          group by c.name) y), '[]'),
      'par_mois', coalesce((
        select jsonb_agg(jsonb_build_object('mois', m.mois, 'recettes', m.recettes, 'depenses', m.depenses) order by m.mois) from (
          select mois, sum(recettes) recettes, sum(depenses) depenses from (
            select to_char(paid_at, 'YYYY-MM') mois, amount recettes, 0 depenses from public.payments
              where organization_id = p_organization_id and status = 'completed'
            union all
            select to_char(spent_on, 'YYYY-MM'), 0, amount from public.expenses
              where organization_id = p_organization_id and status = 'recorded'
          ) u group by mois) m), '[]'),
      'par_mode', coalesce((
        select jsonb_agg(jsonb_build_object('mode', method, 'montant', total, 'nombre', n)) from (
          select method::text, sum(amount) total, count(*) n from public.payments
          where organization_id = p_organization_id and status = 'completed' group by method) z), '[]'),
      'depenses_par_categorie', coalesce((
        select jsonb_agg(jsonb_build_object('categorie', name, 'montant', total) order by total desc) from (
          select coalesce(ec.name, 'Sans catégorie') name, sum(x.amount) total from public.expenses x
          left join public.expense_categories ec on ec.id = x.category_id
          where x.organization_id = p_organization_id and x.status = 'recorded' group by ec.name) w), '[]'))
    into v_result;

  elsif p_section = 'absences' then
    select jsonb_build_object('rows', coalesce(jsonb_agg(r order by r->>'classe'), '[]')) into v_result
    from (
      select jsonb_build_object(
        'classe', c.name, 'seances', count(distinct s.id), 'enregistrements', count(ar.id),
        'absences', count(ar.id) filter (where ar.status = 'absent'),
        'justifiees', count(ar.id) filter (where ar.status = 'excused' or (ar.status = 'absent' and ar.is_justified)),
        'retards', count(ar.id) filter (where ar.status = 'late'),
        'taux_presence', case when count(ar.id) > 0 then round(count(ar.id) filter (where ar.status in ('present', 'late')) * 100.0 / count(ar.id), 1) end) r
      from public.classes c
      left join public.attendance_sessions s on s.class_id = c.id and s.status = 'validated'
      left join public.attendance_records ar on ar.session_id = s.id
      where c.organization_id = p_organization_id and c.academic_year_id = v_year
      group by c.id, c.name
    ) x;

  elsif p_section = 'resultats' then
    select jsonb_build_object('rows', coalesce(jsonb_agg(r order by r->>'classe', r->>'matiere'), '[]')) into v_result
    from (
      select jsonb_build_object(
        'classe', c.name, 'matiere', sub.name, 'evaluations', count(distinct a.id), 'notes', count(g.id),
        'moyenne', round(avg(g.score / a.max_score * 20), 2),
        'taux_reussite', case when count(g.id) > 0 then round(count(g.id) filter (where g.score / a.max_score * 20 >= 10) * 100.0 / count(g.id), 1) end,
        'min', round(min(g.score / a.max_score * 20), 2), 'max', round(max(g.score / a.max_score * 20), 2)) r
      from public.assessments a
      join public.classes c on c.id = a.class_id and c.academic_year_id = v_year
      join public.subjects sub on sub.id = a.subject_id
      join public.grades g on g.assessment_id = a.id and g.score is not null and not g.is_absent and not g.is_exempt
      where a.organization_id = p_organization_id
      group by c.name, sub.name
    ) x;

  elsif p_section = 'formations' then
    select jsonb_build_object('rows', coalesce(jsonb_agg(r order by r->>'formation'), '[]')) into v_result
    from (
      select jsonb_build_object(
        'formation', p.name, 'code', p.code, 'duree_heures', p.duration_hours,
        'sessions', count(distinct c.id), 'apprenants', count(distinct e.student_id)) r
      from public.programs p
      left join public.classes c on c.program_id = p.id
      left join public.enrollments e on e.class_id = c.id and e.status = 'validated'
      where p.organization_id = p_organization_id
      group by p.id, p.name, p.code, p.duration_hours
    ) x;
  else
    raise exception 'Section de rapport inconnue.' using errcode = 'check_violation';
  end if;
  return v_result;
end;
$$;
revoke execute on function public.report_section(uuid, text) from public, anon;
grant execute on function public.report_section(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 4. Communication : messagerie (contacts autorisés par rôle, création atomique
--    d'une conversation, notifications) et notification des annonces publiées.
--    Direction / secrétariat (guardians.read) : tout l'établissement.
--    Enseignant : le personnel + les familles et élèves de SES classes.
--    Parents et élèves : répondent dans les conversations où ils sont invités.
-- -----------------------------------------------------------------------------
create or replace function public.message_contacts(p_organization_id uuid)
returns table (user_id uuid, name text, kind text, detail text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_all boolean;
begin
  if not app.has_permission(p_organization_id, 'communication.message') then
    raise exception 'La messagerie nécessite la permission communication.message.' using errcode = 'insufficient_privilege';
  end if;
  v_all := app.has_permission(p_organization_id, 'guardians.read');
  return query
  with staff as (
    select distinct m.user_id, 'Personnel'::text as kind, coalesce(st.job_title, '')::text as detail
    from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id and r.persona in ('staff', 'teacher') and r.key <> 'kiosk'
    left join public.staff_members st on st.user_id = m.user_id and st.organization_id = p_organization_id
    where m.organization_id = p_organization_id and m.status = 'active'
  ), families as (
    select g.user_id, 'Parent'::text as kind, 'Parent de ' || string_agg(s.first_name || ' ' || s.last_name, ', ') as detail
    from public.guardians g
    join public.student_guardians sg on sg.guardian_id = g.id and sg.portal_access
    join public.students s on s.id = sg.student_id and s.archived_at is null
    where g.organization_id = p_organization_id and g.user_id is not null and g.archived_at is null
      and (v_all or s.id = any (app.my_taught_student_ids()))
    group by g.user_id
    union all
    select s.user_id, 'Élève', coalesce((select c.name from public.enrollments e join public.classes c on c.id = e.class_id
                                         where e.student_id = s.id and e.status = 'validated' limit 1), '')
    from public.students s
    where s.organization_id = p_organization_id and s.user_id is not null and s.archived_at is null
      and (v_all or s.id = any (app.my_taught_student_ids()))
  ), everyone as (
    select * from staff union all select * from families
  )
  select distinct on (e.user_id) e.user_id, coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), p.email, 'Utilisateur'), e.kind, e.detail
  from everyone e
  join public.profiles p on p.id = e.user_id and p.is_active
  join public.memberships m on m.user_id = e.user_id and m.organization_id = p_organization_id and m.status = 'active'
  where e.user_id <> auth.uid()
  order by e.user_id, e.kind;
end;
$$;
revoke execute on function public.message_contacts(uuid) from public, anon;
grant execute on function public.message_contacts(uuid) to authenticated;

create or replace function public.start_thread(p_organization_id uuid, p_subject text, p_body text, p_recipients uuid[])
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_thread uuid;
  v_allowed uuid[];
begin
  if not app.has_permission(p_organization_id, 'communication.message') then
    raise exception 'La messagerie nécessite la permission communication.message.' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(array_length(p_recipients, 1), 0) = 0 or array_length(p_recipients, 1) > 50 then
    raise exception 'Choisissez entre 1 et 50 destinataires.' using errcode = 'check_violation';
  end if;
  select coalesce(array_agg(c.user_id), '{}') into v_allowed from public.message_contacts(p_organization_id) c;
  if exists (select 1 from unnest(p_recipients) r where not (r = any (v_allowed))) then
    raise exception 'Un destinataire ne fait pas partie de vos contacts autorisés.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.message_threads (organization_id, subject, created_by)
  values (p_organization_id, btrim(p_subject), auth.uid()) returning id into v_thread;
  insert into public.thread_participants (organization_id, thread_id, user_id)
  select p_organization_id, v_thread, u from (select auth.uid() as u union select unnest(p_recipients)) x;
  insert into public.messages (organization_id, thread_id, sender_id, body) values (p_organization_id, v_thread, auth.uid(), btrim(p_body));
  perform app.audit(p_organization_id, 'communication.thread_started', 'message_threads', v_thread,
                    'Conversation « ' || left(btrim(p_subject), 120) || ' » (' || array_length(p_recipients, 1) || ' destinataire(s))');
  return v_thread;
end;
$$;
revoke execute on function public.start_thread(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.start_thread(uuid, text, text, uuid[]) to authenticated;

-- Lien de notification selon le profil du destinataire (portail ou application).
create or replace function app.message_link(p_org uuid, p_user uuid, p_thread uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when exists (
    select 1 from public.memberships m join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id and r.persona in ('staff', 'teacher')
    where m.organization_id = p_org and m.user_id = p_user)
  then '/messages?fil=' || p_thread else '/portail/messages?fil=' || p_thread end;
$$;

create or replace function app.message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
  v_sender text;
  v_user uuid;
begin
  update public.message_threads set last_message_at = new.created_at where id = new.thread_id returning subject into v_subject;
  update public.thread_participants set last_read_at = new.created_at
   where thread_id = new.thread_id and user_id = new.sender_id;
  select coalesce(nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), ''), 'Un utilisateur') into v_sender
  from public.profiles where id = new.sender_id;
  for v_user in select tp.user_id from public.thread_participants tp where tp.thread_id = new.thread_id and tp.user_id <> new.sender_id loop
    perform app.notify(new.organization_id, v_user, 'message.received', 'Nouveau message — ' || left(v_subject, 80),
                       v_sender || ' : ' || left(new.body, 140), app.message_link(new.organization_id, v_user, new.thread_id),
                       jsonb_build_object('thread_id', new.thread_id));
  end loop;
  return new;
end;
$$;

-- Annonce publiée → notification des destinataires (personas + classes ciblées).
create or replace function app.notify_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_personas text[];
  v_classes uuid[];
begin
  if new.published_at is null or new.published_at > now() or (tg_op = 'UPDATE' and old.published_at is not null) then
    return new;
  end if;
  select coalesce(array_agg(x), '{}') into v_personas from jsonb_array_elements_text(coalesce(new.audience -> 'personas', '[]')) x;
  select coalesce(array_agg(x::uuid), '{}') into v_classes from jsonb_array_elements_text(coalesce(new.audience -> 'class_ids', '[]')) x;
  for v_user in
    select distinct m.user_id
    from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.organization_id = new.organization_id and m.status = 'active' and r.persona = any (v_personas)
      and m.user_id is distinct from new.author_id
      and (
        cardinality(v_classes) = 0 or r.persona = 'staff'
        or (r.persona = 'teacher' and exists (
              select 1 from public.class_subjects cs join public.staff_members st on st.id = cs.teacher_id
              where st.user_id = m.user_id and cs.class_id = any (v_classes)))
        or (r.persona in ('parent', 'student') and exists (
              select 1 from public.enrollments e
              where e.class_id = any (v_classes) and e.status = 'validated'
                and m.user_id in (select app.family_user_ids(e.student_id))))
      )
  loop
    perform app.notify(new.organization_id, v_user, 'announcement.published', 'Annonce : ' || left(new.title, 100),
                       left(new.body, 160), case when exists (
                         select 1 from public.memberships m2 join public.membership_roles mr2 on mr2.membership_id = m2.id
                         join public.roles r2 on r2.id = mr2.role_id and r2.persona in ('staff', 'teacher')
                         where m2.organization_id = new.organization_id and m2.user_id = v_user)
                       then '/communication' else '/portail/annonces' end,
                       jsonb_build_object('announcement_id', new.id));
  end loop;
  return new;
end;
$$;
drop trigger if exists announcements_notify on public.announcements;
create trigger announcements_notify
  after insert or update of published_at on public.announcements
  for each row execute function app.notify_announcement();

-- Marquer une conversation comme lue.
create or replace function public.mark_thread_read(p_thread_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.thread_participants set last_read_at = now()
   where thread_id = p_thread_id and user_id = auth.uid();
$$;
revoke execute on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.mark_thread_read(uuid) to authenticated;

-- Conversations de l'utilisateur (noms des participants inclus, uniquement les siennes).
create or replace function public.my_threads(p_organization_id uuid)
returns table (id uuid, subject text, last_message_at timestamptz, participants text, last_message text, unread boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.subject, t.last_message_at,
         (select string_agg(coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Utilisateur'), ', ')
            from public.thread_participants tp2 join public.profiles p on p.id = tp2.user_id
           where tp2.thread_id = t.id and tp2.user_id <> auth.uid()),
         (select left(m.body, 140) from public.messages m where m.thread_id = t.id order by m.created_at desc limit 1),
         coalesce(tp.last_read_at < t.last_message_at, true)
  from public.message_threads t
  join public.thread_participants tp on tp.thread_id = t.id and tp.user_id = auth.uid()
  where t.organization_id = p_organization_id and t.organization_id = any (app.member_org_ids())
  order by t.last_message_at desc
  limit 100;
$$;
revoke execute on function public.my_threads(uuid) from public, anon;
grant execute on function public.my_threads(uuid) to authenticated;

create or replace function public.thread_messages(p_thread_id uuid)
returns table (id uuid, body text, created_at timestamptz, sender text, mine boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (p_thread_id = any (app.my_thread_ids())) then
    raise exception 'Conversation introuvable.' using errcode = 'insufficient_privilege';
  end if;
  return query
    select m.id, m.body, m.created_at,
           coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), ''), 'Utilisateur'),
           m.sender_id = auth.uid()
    from public.messages m left join public.profiles p on p.id = m.sender_id
    where m.thread_id = p_thread_id
    order by m.created_at;
end;
$$;
revoke execute on function public.thread_messages(uuid) from public, anon;
grant execute on function public.thread_messages(uuid) to authenticated;
