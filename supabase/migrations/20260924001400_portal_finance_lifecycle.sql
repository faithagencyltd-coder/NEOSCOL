-- =============================================================================
-- NéoScol — 1400 Portails (restrictions en cas d'impayé, comptes), finance
-- (dépenses, factures émises, rappels), cycle de vie des élèves, documents
--
-- Règles impératives :
--  · les présences, absences, retards et informations d'impayé ne sont JAMAIS
--    restreints ;
--  · une restriction ne supprime aucune donnée ni aucun compte ;
--  · le calcul est fait à la volée depuis factures/échéances/paiements : un
--    paiement enregistré lève la restriction immédiatement.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Impayés et restrictions
-- -----------------------------------------------------------------------------
-- Montant exigible non réglé à une date donnée (échéances échues − paiements).
create or replace function app.student_overdue_amount(p_student uuid, p_cutoff date, p_exclude_payment uuid default null)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  with inv as (
    select i.id, i.total, i.due_on,
           coalesce((select sum(p.amount) from public.payments p
                     where p.invoice_id = i.id and p.status = 'completed'
                       and p.id is distinct from p_exclude_payment), 0) as paid,
           exists (select 1 from public.installments ins where ins.invoice_id = i.id) as has_plan
    from public.invoices i
    where i.student_id = p_student and i.status = 'issued'
  )
  select coalesce(sum(greatest(
           case when inv.has_plan
                then coalesce((select sum(ins.amount) from public.installments ins
                               where ins.invoice_id = inv.id and ins.due_on < p_cutoff), 0)
                when inv.due_on is not null and inv.due_on < p_cutoff then inv.total
                else 0 end - inv.paid, 0)), 0)
  from inv;
$$;

create table public.portal_access_overrides (
  student_id uuid primary key,
  organization_id uuid not null,
  mode text not null check (mode in ('unrestricted', 'restricted')),
  reason text not null check (length(btrim(reason)) between 3 and 500),
  expires_on date,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade
);

-- Élève restreint (toutes fonctionnalités confondues) ?
create or replace function app.student_portal_restricted(p_student uuid, p_exclude_payment uuid default null)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_cfg jsonb;
  v_today date;
  v_override public.portal_access_overrides;
begin
  select organization_id into v_org from public.students where id = p_student;
  if v_org is null then
    return false;
  end if;
  v_today := app.org_local_now(v_org)::date;
  select * into v_override from public.portal_access_overrides
   where student_id = p_student and (expires_on is null or expires_on >= v_today);
  if v_override.student_id is not null then
    return v_override.mode = 'restricted';
  end if;
  select settings -> 'portal_restrictions' into v_cfg from public.organizations where id = v_org;
  if not coalesce((v_cfg ->> 'enabled')::boolean, false) then
    return false;
  end if;
  return app.student_overdue_amount(p_student, v_today - coalesce((v_cfg ->> 'grace_days')::integer, 0), p_exclude_payment)
         > coalesce((v_cfg ->> 'min_overdue_amount')::numeric, 0);
end;
$$;

-- Fonctionnalité restreinte pour cet élève ? Les présences ne le sont jamais.
create or replace function app.portal_restricted(p_student uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_feature not in ('grades', 'report_cards', 'documents', 'timetable') then false
    else coalesce((
      select coalesce((o.settings #>> array['portal_restrictions', 'features', p_feature])::boolean, false)
      from public.students s join public.organizations o on o.id = s.organization_id
      where s.id = p_student
    ), false) and app.student_portal_restricted(p_student)
  end;
$$;

create or replace function app.my_portal_class_ids_for(p_feature text)
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
    and e.student_id = any (app.my_portal_student_ids())
    and not app.portal_restricted(e.student_id, p_feature);
$$;

-- État du portail d'un élève (pour l'affichage ; les données restent protégées par la RLS).
create or replace function public.portal_status(p_student_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_today date;
  v_cfg jsonb;
  v_restricted boolean;
  v_override public.portal_access_overrides;
begin
  select organization_id into v_org from public.students where id = p_student_id;
  if v_org is null or not (
    p_student_id = any (app.my_portal_student_ids())
    or app.has_permission(v_org, 'finance.read')
    or app.has_permission(v_org, 'students.read')
  ) then
    raise exception 'Accès non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  v_today := app.org_local_now(v_org)::date;
  select settings -> 'portal_restrictions' into v_cfg from public.organizations where id = v_org;
  v_restricted := app.student_portal_restricted(p_student_id);
  select * into v_override from public.portal_access_overrides
   where student_id = p_student_id and (expires_on is null or expires_on >= v_today);
  return jsonb_build_object(
    'restricted', v_restricted,
    'features', jsonb_build_object(
      'grades', app.portal_restricted(p_student_id, 'grades'),
      'report_cards', app.portal_restricted(p_student_id, 'report_cards'),
      'documents', app.portal_restricted(p_student_id, 'documents'),
      'timetable', app.portal_restricted(p_student_id, 'timetable'),
      'attendance', false
    ),
    'overdue_amount', app.student_overdue_amount(p_student_id, v_today),
    'balance', coalesce((select sum(b.balance) from public.invoice_balances b
                         where b.student_id = p_student_id and b.status = 'issued'), 0),
    'next_due_on', (select min(b.next_due_on) from public.invoice_balances b
                    where b.student_id = p_student_id and b.status = 'issued' and b.balance > 0),
    'override', case when v_override.student_id is not null
                     then jsonb_build_object('mode', v_override.mode, 'reason', v_override.reason, 'expires_on', v_override.expires_on) end,
    'rules_enabled', coalesce((v_cfg ->> 'enabled')::boolean, false)
  );
end;
$$;
revoke execute on function public.portal_status(uuid) from public, anon;
grant execute on function public.portal_status(uuid) to authenticated;

-- RLS : branches « portail » soumises aux restrictions (jamais les présences).
drop policy grades_select on public.grades;
create policy grades_select on public.grades for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('grades.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or assessment_id in (
      select a.id from public.assessments a
      where a.class_id = any ((select app.my_taught_class_ids())::uuid[])
    )
    or (
      student_id = any ((select app.my_portal_student_ids())::uuid[])
      and assessment_id in (select a.id from public.assessments a where a.is_published)
      and not app.portal_restricted(student_id, 'grades')
    )
  );

drop policy assessments_select on public.assessments;
create policy assessments_select on public.assessments for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('grades.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or class_id = any ((select app.my_taught_class_ids())::uuid[])
    or (is_published and class_id = any ((select app.my_portal_class_ids_for('grades'))::uuid[]))
  );

drop policy report_cards_select on public.report_cards;
create policy report_cards_select on public.report_cards for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('report_cards.manage'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('grades.read'))::uuid[])
    or class_id = any ((select app.my_taught_class_ids())::uuid[])
    or (status = 'published' and student_id = any ((select app.my_portal_student_ids())::uuid[])
        and not app.portal_restricted(student_id, 'report_cards'))
  );

drop policy issued_documents_select on public.issued_documents;
create policy issued_documents_select on public.issued_documents for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('documents.read'))::uuid[])
    or (status = 'valid' and student_id = any ((select app.my_portal_student_ids())::uuid[])
        and not app.portal_restricted(student_id, 'documents'))
  );

drop policy timetable_select on public.timetable_slots;
create policy timetable_select on public.timetable_slots for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('timetable.read'))::uuid[])
    or class_id = any ((select app.my_taught_class_ids())::uuid[])
    or teacher_id = any ((select app.my_staff_ids())::uuid[])
    or class_id = any ((select app.my_portal_class_ids_for('timetable'))::uuid[])
  );

alter table public.portal_access_overrides enable row level security;
create policy portal_overrides_select on public.portal_access_overrides for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('portal_access.manage'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
  );
create policy portal_overrides_write on public.portal_access_overrides for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('portal_access.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('portal_access.manage'))::uuid[]));

-- -----------------------------------------------------------------------------
-- Comptes portail : rattachement d'un compte (créé côté serveur) à un parent ou
-- un élève, suspension / réactivation. Contrôle : portal_access.manage.
-- -----------------------------------------------------------------------------
create or replace function public.grant_portal_access(p_kind text, p_record_id uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_membership uuid;
  v_role uuid;
  v_existing uuid;
begin
  if p_kind = 'guardian' then
    select organization_id, user_id into v_org, v_existing from public.guardians where id = p_record_id;
  elsif p_kind = 'student' then
    select organization_id, user_id into v_org, v_existing from public.students where id = p_record_id;
  else
    raise exception 'Type de compte inconnu.' using errcode = 'check_violation';
  end if;
  if v_org is null or not app.has_permission(v_org, 'portal_access.manage') then
    raise exception 'La gestion des accès portail nécessite la permission portal_access.manage.' using errcode = 'insufficient_privilege';
  end if;
  if v_existing is not null and v_existing <> p_user_id then
    raise exception 'Un compte est déjà rattaché à ce dossier.' using errcode = 'unique_violation';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Compte introuvable.' using errcode = 'no_data_found';
  end if;
  if p_kind = 'guardian' then
    if exists (select 1 from public.guardians where organization_id = v_org and user_id = p_user_id and id <> p_record_id) then
      raise exception 'Ce compte est déjà rattaché à un autre parent.' using errcode = 'unique_violation';
    end if;
    update public.guardians set user_id = p_user_id where id = p_record_id;
  else
    if exists (select 1 from public.students where user_id = p_user_id and id <> p_record_id) then
      raise exception 'Ce compte est déjà rattaché à un autre élève.' using errcode = 'unique_violation';
    end if;
    update public.students set user_id = p_user_id where id = p_record_id;
  end if;

  insert into public.memberships (organization_id, user_id, status, joined_at, invited_by)
  values (v_org, p_user_id, 'active', now(), auth.uid())
  on conflict (organization_id, user_id) do update set status = 'active'
  returning id into v_membership;
  select id into v_role from public.roles
   where organization_id = v_org and key = case when p_kind = 'guardian' then 'parent' else 'student' end;
  insert into public.membership_roles (organization_id, membership_id, role_id)
  values (v_org, v_membership, v_role)
  on conflict do nothing;
  perform app.audit(v_org, 'portal.access_granted', case when p_kind = 'guardian' then 'guardians' else 'students' end,
                    p_record_id, 'Accès portail activé');
end;
$$;
revoke execute on function public.grant_portal_access(text, uuid, uuid) from public, anon;
grant execute on function public.grant_portal_access(text, uuid, uuid) to authenticated;

create or replace function public.set_portal_account_status(p_kind text, p_record_id uuid, p_active boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_user uuid;
begin
  if p_kind = 'guardian' then
    select organization_id, user_id into v_org, v_user from public.guardians where id = p_record_id;
  elsif p_kind = 'student' then
    select organization_id, user_id into v_org, v_user from public.students where id = p_record_id;
  end if;
  if v_org is null or not app.has_permission(v_org, 'portal_access.manage') then
    raise exception 'La gestion des accès portail nécessite la permission portal_access.manage.' using errcode = 'insufficient_privilege';
  end if;
  if v_user is null then
    raise exception 'Aucun compte portail n''est rattaché à ce dossier.' using errcode = 'no_data_found';
  end if;
  update public.memberships set status = case when p_active then 'active' else 'suspended' end::public.membership_status
   where organization_id = v_org and user_id = v_user;
  perform app.audit(v_org, case when p_active then 'portal.account_reactivated' else 'portal.account_suspended' end,
                    case when p_kind = 'guardian' then 'guardians' else 'students' end, p_record_id,
                    case when p_active then 'Compte portail réactivé' else 'Compte portail suspendu' end);
end;
$$;
revoke execute on function public.set_portal_account_status(text, uuid, boolean) from public, anon;
grant execute on function public.set_portal_account_status(text, uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Finance : notification de facture émise, rappels d'échéance et d'impayé,
-- accès rétabli après paiement.
-- -----------------------------------------------------------------------------
create table public.invoice_reminders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  student_id uuid not null,
  kind text not null check (kind in ('issued', 'upcoming', 'overdue', 'manual')),
  due_on date,
  amount_due numeric(14, 2) not null default 0,
  balance numeric(14, 2) not null default 0,
  recipients integer not null default 0,
  sent_at timestamptz not null default now(),
  sent_by uuid default auth.uid() references public.profiles (id) on delete set null,
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete cascade
);
create index invoice_reminders_invoice_idx on public.invoice_reminders (invoice_id, kind, sent_at desc);
create index invoice_reminders_org_idx on public.invoice_reminders (organization_id, sent_at desc);

alter table public.invoice_reminders enable row level security;
create policy invoice_reminders_select on public.invoice_reminders for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
  );

create or replace function app.format_amount(p_amount numeric, p_currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(coalesce(p_amount, 0), 'FM999G999G999G990'), ',', ' ') || ' '
         || case p_currency when 'XOF' then 'FCFA' when 'XAF' then 'FCFA' else coalesce(p_currency, '') end;
$$;

-- Envoie un rappel pour une facture (famille : parents avec accès portail + élève).
create or replace function app.send_invoice_notice(p_invoice uuid, p_kind text)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_b record;
  v_user uuid;
  v_count integer := 0;
  v_overdue numeric;
  v_title text;
  v_body text;
  v_today date;
begin
  select b.*, s.first_name, s.last_name into v_b
  from public.invoice_balances b join public.students s on s.id = b.student_id
  where b.invoice_id = p_invoice;
  if v_b.invoice_id is null or v_b.status <> 'issued' then
    return 0;
  end if;
  v_today := app.org_local_now(v_b.organization_id)::date;
  v_overdue := app.student_overdue_amount(v_b.student_id, v_today);
  v_title := case p_kind
    when 'issued' then 'Nouvelle facture ' || v_b.number
    when 'upcoming' then 'Rappel : échéance du ' || to_char(v_b.next_due_on, 'DD/MM/YYYY')
    when 'overdue' then 'Impayé : ' || app.format_amount(v_overdue, v_b.currency) || ' en retard'
    else 'Rappel de paiement — facture ' || v_b.number
  end;
  v_body := v_b.first_name || ' ' || v_b.last_name || ' — facture ' || v_b.number
    || ' : total ' || app.format_amount(v_b.total, v_b.currency)
    || ', payé ' || app.format_amount(v_b.paid, v_b.currency)
    || ', reste dû ' || app.format_amount(v_b.balance, v_b.currency) || '.'
    || case when v_b.next_due_on is not null then ' Prochaine échéance : ' || to_char(v_b.next_due_on, 'DD/MM/YYYY') || '.' else '' end
    || case when app.student_portal_restricted(v_b.student_id)
            then ' Certaines fonctionnalités du portail sont restreintes jusqu''à régularisation ; les présences restent consultables.'
            else '' end;
  for v_user in select * from app.family_user_ids(v_b.student_id) loop
    perform app.notify(v_b.organization_id, v_user, 'invoice.' || p_kind, v_title, v_body, '/portail/finances',
                       jsonb_build_object('invoice_id', p_invoice, 'student_id', v_b.student_id));
    v_count := v_count + 1;
  end loop;
  insert into public.invoice_reminders (organization_id, invoice_id, student_id, kind, due_on, amount_due, balance, recipients)
  values (v_b.organization_id, p_invoice, v_b.student_id, p_kind, v_b.next_due_on,
          case when p_kind = 'overdue' then v_overdue else v_b.balance end, v_b.balance, v_count);
  return v_count;
end;
$$;

create or replace function app.notify_invoice_issued()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'issued' and (tg_op = 'INSERT' or old.status <> 'issued') then
    perform app.send_invoice_notice(new.id, 'issued');
  end if;
  return new;
end;
$$;
create trigger invoices_notify_issued after insert or update of status on public.invoices
  for each row execute function app.notify_invoice_issued();

-- Rappels automatiques (tâche planifiée ou bouton « Envoyer les rappels »).
create or replace function public.send_invoice_reminders(p_organization_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb;
  v_today date;
  v_before integer;
  v_interval integer;
  v_b record;
  v_upcoming integer := 0;
  v_overdue integer := 0;
begin
  if auth.uid() is not null and not app.has_permission(p_organization_id, 'finance.invoices.manage') then
    raise exception 'L''envoi des rappels nécessite la permission finance.invoices.manage.' using errcode = 'insufficient_privilege';
  end if;
  select settings -> 'reminders' into v_cfg from public.organizations where id = p_organization_id;
  v_today := app.org_local_now(p_organization_id)::date;
  v_before := coalesce((v_cfg ->> 'days_before_due')::integer, 3);
  v_interval := greatest(coalesce((v_cfg ->> 'overdue_interval_days')::integer, 7), 1);

  for v_b in
    select b.invoice_id, b.student_id, b.next_due_on, b.is_overdue
    from public.invoice_balances b
    where b.organization_id = p_organization_id and b.status = 'issued' and b.balance > 0
  loop
    if v_b.is_overdue then
      if not exists (select 1 from public.invoice_reminders r
                     where r.invoice_id = v_b.invoice_id and r.kind = 'overdue'
                       and r.sent_at > now() - make_interval(days => v_interval)) then
        perform app.send_invoice_notice(v_b.invoice_id, 'overdue');
        v_overdue := v_overdue + 1;
      end if;
    elsif v_b.next_due_on between v_today and v_today + v_before then
      if not exists (select 1 from public.invoice_reminders r
                     where r.invoice_id = v_b.invoice_id and r.kind = 'upcoming' and r.due_on = v_b.next_due_on) then
        perform app.send_invoice_notice(v_b.invoice_id, 'upcoming');
        v_upcoming := v_upcoming + 1;
      end if;
    end if;
  end loop;
  perform app.audit(p_organization_id, 'finance.reminders_sent', 'invoice_reminders', null,
                    v_upcoming || ' rappel(s) d''échéance, ' || v_overdue || ' rappel(s) d''impayé',
                    jsonb_build_object('upcoming', v_upcoming, 'overdue', v_overdue));
  return jsonb_build_object('upcoming', v_upcoming, 'overdue', v_overdue);
end;
$$;
revoke execute on function public.send_invoice_reminders(uuid) from public, anon;
grant execute on function public.send_invoice_reminders(uuid) to authenticated, service_role;

create or replace function public.send_invoice_reminder(p_invoice_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_count integer;
begin
  select organization_id into v_org from public.invoices where id = p_invoice_id;
  if v_org is null or not app.has_permission(v_org, 'finance.invoices.manage') then
    raise exception 'L''envoi des rappels nécessite la permission finance.invoices.manage.' using errcode = 'insufficient_privilege';
  end if;
  v_count := app.send_invoice_notice(p_invoice_id, 'manual');
  perform app.audit(v_org, 'finance.reminder_sent', 'invoices', p_invoice_id, 'Rappel manuel envoyé à ' || v_count || ' destinataire(s)');
  return v_count;
end;
$$;
revoke execute on function public.send_invoice_reminder(uuid) from public, anon;
grant execute on function public.send_invoice_reminder(uuid) to authenticated;

-- Paiement : reçu + « accès rétabli » si ce paiement lève la restriction.
create or replace function app.notify_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_currency text;
  v_restored boolean;
begin
  select currency into v_currency from public.organizations where id = new.organization_id;
  v_restored := app.student_portal_restricted(new.student_id, new.id) and not app.student_portal_restricted(new.student_id);
  for v_user in select * from app.family_user_ids(new.student_id) loop
    perform app.notify(new.organization_id, v_user, 'payment.received',
      'Paiement enregistré',
      'Reçu ' || new.number || ' — ' || app.format_amount(new.amount, v_currency) || '. Reste dû : '
        || app.format_amount(coalesce(new.balance_after, 0), v_currency) || '.',
      '/portail/finances', jsonb_build_object('payment_id', new.id, 'student_id', new.student_id));
    if v_restored then
      perform app.notify(new.organization_id, v_user, 'portal.restored',
        'Accès au portail rétabli',
        'Merci pour votre paiement : toutes les fonctionnalités autorisées sont de nouveau disponibles.',
        '/portail', jsonb_build_object('student_id', new.student_id));
    end if;
  end loop;
  if v_restored then
    perform app.audit(new.organization_id, 'portal.restored', 'students', new.student_id,
                      'Restriction levée par le paiement ' || new.number, jsonb_build_object('payment_id', new.id));
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Dépenses
-- -----------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  number text not null unique,
  category_id uuid not null,
  label text not null check (length(btrim(label)) between 2 and 200),
  amount numeric(14, 2) not null check (amount > 0),
  spent_on date not null default current_date,
  supplier text,
  payment_method public.payment_method not null default 'cash',
  reference text,
  comment text,
  receipt_file_id uuid,
  status text not null default 'recorded' check (status in ('recorded', 'cancelled')),
  cancelled_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles (id) on delete set null,
  search_text text generated always as (
    app.search_normalize(number || ' ' || label || ' ' || coalesce(supplier, '') || ' ' || coalesce(reference, ''))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, category_id) references public.expense_categories (organization_id, id) on delete restrict,
  foreign key (organization_id, receipt_file_id) references public.file_objects (organization_id, id) on delete set null (receipt_file_id),
  check (status <> 'cancelled' or cancelled_reason is not null)
);
create index expenses_org_date_idx on public.expenses (organization_id, spent_on desc);
create index expenses_search_idx on public.expenses using gin (search_text extensions.gin_trgm_ops);

create or replace function app.expense_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.number := app.generate_number(new.organization_id, 'expense', 'DEP-{CODE}-{YY}-{SEQ:5}');
    new.status := 'recorded';
    return new;
  end if;
  if new.number is distinct from old.number or new.organization_id is distinct from old.organization_id then
    raise exception 'Le numéro d''une dépense ne peut pas être modifié.' using errcode = 'check_violation';
  end if;
  if old.status = 'cancelled' and (to_jsonb(new) - array['archived_at', 'archived_by', 'updated_at'])
                                   is distinct from (to_jsonb(old) - array['archived_at', 'archived_by', 'updated_at']) then
    raise exception 'Une dépense annulée ne peut plus être modifiée.' using errcode = 'check_violation';
  end if;
  if new.status = 'cancelled' and old.status = 'recorded' then
    if coalesce(btrim(new.cancelled_reason), '') = '' then
      raise exception 'Le motif d''annulation est obligatoire.' using errcode = 'check_violation';
    end if;
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  end if;
  if new.archived_at is distinct from old.archived_at then
    new.archived_by := case when new.archived_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;
create trigger expenses_guard before insert or update on public.expenses
  for each row execute function app.expense_guard();

-- Justificatif rattaché uniquement à la dépense de son établissement.
create or replace function app.expense_link_receipt()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.receipt_file_id is not null and (tg_op = 'INSERT' or new.receipt_file_id is distinct from old.receipt_file_id) then
    if not exists (select 1 from public.file_objects f where f.id = new.receipt_file_id and f.owner_type = 'expense') then
      raise exception 'Justificatif invalide.' using errcode = 'check_violation';
    end if;
    update public.file_objects set owner_id = new.id where id = new.receipt_file_id and owner_id is null;
  end if;
  return new;
end;
$$;
create trigger expenses_link_receipt after insert or update of receipt_file_id on public.expenses
  for each row execute function app.expense_link_receipt();

alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
create policy expense_categories_select on public.expense_categories for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('finance.expenses.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('finance.expenses.manage'))::uuid[])
  );
create policy expense_categories_write on public.expense_categories for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.expenses.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('finance.expenses.manage'))::uuid[]));
create policy expenses_select on public.expenses for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('finance.expenses.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('finance.expenses.manage'))::uuid[])
  );
create policy expenses_insert on public.expenses for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('finance.expenses.manage'))::uuid[]));
create policy expenses_update on public.expenses for update to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.expenses.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('finance.expenses.manage'))::uuid[]));
create policy expenses_delete on public.expenses for delete to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.expenses.delete'))::uuid[]));

create or replace function app.provision_expense_categories(p_org uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into public.expense_categories (organization_id, name)
  select p_org, c from unnest(array['Fournitures et matériel', 'Salaires et honoraires', 'Électricité et eau',
                                    'Maintenance et réparations', 'Transport', 'Communication', 'Autres dépenses']) c
  on conflict do nothing;
$$;
select app.provision_expense_categories(id) from public.organizations;

create or replace function app.organization_expense_categories()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.provision_expense_categories(new.id);
  return new;
end;
$$;
create trigger organizations_expense_categories after insert on public.organizations
  for each row execute function app.organization_expense_categories();

-- -----------------------------------------------------------------------------
-- Documents : types de sujets complémentaires (dossier complet, badge…)
-- -----------------------------------------------------------------------------
alter table public.issued_documents drop constraint issued_documents_subject_type_check;
alter table public.issued_documents add constraint issued_documents_subject_type_check
  check (subject_type in ('payment', 'report_card', 'enrollment', 'student', 'invoice', 'staff', 'dossier'));

-- Révocation : la colonne générée search_text n'est pas encore calculée dans
-- NEW au moment du trigger BEFORE ; elle est exclue de la comparaison.
create or replace function app.issued_document_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student record;
  v_frozen constant text[] := array['status', 'revoked_reason', 'revoked_at', 'revoked_by', 'file_path', 'content_hash', 'search_text'];
begin
  if tg_op = 'INSERT' then
    new.number := app.generate_number(new.organization_id, 'document', 'DOC-{CODE}-{YY}-{SEQ:6}');
    new.verification_code := app.random_code(26);
    new.issued_at := now();
    new.issued_by := coalesce(auth.uid(), new.issued_by);
    new.status := 'valid';
    if new.student_id is not null then
      select first_name, last_name into v_student from public.students where id = new.student_id;
      new.holder_display := upper(left(v_student.first_name, 1)) || '. ' || upper(v_student.last_name);
    end if;
    return new;
  end if;

  -- Un document émis est figé : seuls le fichier (une fois) et la révocation évoluent.
  if (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen) then
    raise exception 'Un document émis ne peut pas être modifié.' using errcode = 'check_violation';
  end if;
  if old.file_path is not null and new.file_path is distinct from old.file_path then
    raise exception 'Le fichier d''un document émis ne peut pas être remplacé.' using errcode = 'check_violation';
  end if;
  if old.content_hash is not null and new.content_hash is distinct from old.content_hash then
    raise exception 'L''empreinte d''un document émis ne peut pas être modifiée.' using errcode = 'check_violation';
  end if;
  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'Un document révoqué ne peut pas être rétabli.' using errcode = 'check_violation';
  end if;
  if new.status = 'revoked' and old.status = 'valid' then
    if auth.uid() is not null and not app.has_permission(new.organization_id, 'documents.revoke') then
      raise exception 'La révocation nécessite la permission documents.revoke.' using errcode = 'insufficient_privilege';
    end if;
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cycle de vie des élèves : désactiver, réactiver, retirer, transférer ;
-- suppression définitive contrôlée (archivage préalable, confirmation, aucune
-- pièce financière ou officielle). Tout est audité.
-- -----------------------------------------------------------------------------
alter table public.students
  add column status_reason text,
  add column status_changed_at timestamptz;

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
  if p_status not in ('active', 'inactive', 'withdrawn', 'transferred', 'graduated') then
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
revoke execute on function public.change_student_status(uuid, text, text) from public, anon;
grant execute on function public.change_student_status(uuid, text, text) to authenticated;

create or replace function public.delete_student(p_student_id uuid, p_confirmation text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student public.students;
begin
  select * into v_student from public.students where id = p_student_id for update;
  if v_student.id is null or not app.has_permission(v_student.organization_id, 'students.delete') then
    raise exception 'La suppression définitive nécessite la permission students.delete.' using errcode = 'insufficient_privilege';
  end if;
  if v_student.archived_at is null then
    raise exception 'Archivez d''abord ce dossier : la suppression définitive n''est possible qu''après archivage.' using errcode = 'check_violation';
  end if;
  if upper(btrim(coalesce(p_confirmation, ''))) <> upper(v_student.matricule) then
    raise exception 'Confirmation invalide : saisissez le matricule exact.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.payments where student_id = p_student_id)
     or exists (select 1 from public.invoices where student_id = p_student_id and status = 'issued')
     or exists (select 1 from public.issued_documents where student_id = p_student_id) then
    raise exception 'Ce dossier comporte des pièces financières ou des documents officiels : il doit rester archivé (obligation de conservation).'
      using errcode = 'check_violation';
  end if;

  perform app.audit(v_student.organization_id, 'student.delete', 'students', p_student_id,
                    v_student.first_name || ' ' || v_student.last_name || ' (' || v_student.matricule || ')');
  delete from public.grades where student_id = p_student_id;
  delete from public.attendance_records where student_id = p_student_id;
  delete from public.report_cards where student_id = p_student_id;
  delete from public.invoices where student_id = p_student_id; -- brouillons / annulées uniquement (contrôlé ci-dessus)
  delete from public.enrollments where student_id = p_student_id;
  delete from public.file_objects where owner_type = 'student' and owner_id = p_student_id;
  if v_student.user_id is not null then
    delete from public.memberships where organization_id = v_student.organization_id and user_id = v_student.user_id;
  end if;
  delete from public.students where id = p_student_id;
end;
$$;
revoke execute on function public.delete_student(uuid, text) from public, anon;
grant execute on function public.delete_student(uuid, text) to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['portal_access_overrides', 'expenses', 'expense_categories', 'invoice_reminders']
  loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$s
                    for each row execute function app.audit_row()', t);
  end loop;
end;
$$;
create trigger expenses_touch before update on public.expenses for each row execute function app.touch_updated_at();

grant execute on function
  app.student_overdue_amount(uuid, date, uuid), app.student_portal_restricted(uuid, uuid),
  app.portal_restricted(uuid, text), app.my_portal_class_ids_for(text), app.format_amount(numeric, text)
to authenticated, service_role;
