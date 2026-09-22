-- =============================================================================
-- NéoScol — 0600 Documents (modèles, émission, vérification), fichiers,
-- communication (annonces, messagerie) et notifications
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Modèles de documents (Document Studio)
-- -----------------------------------------------------------------------------
create table public.document_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in (
    'school_certificate', 'attestation', 'training_certificate', 'report_card', 'receipt',
    'student_card', 'enrollment_form', 'commitment_form', 'contract', 'convocation',
    'transcript', 'custom')),
  name text not null,
  description text,
  layout jsonb not null default '{}'::jsonb check (jsonb_typeof(layout) = 'object'),
  page_size text not null default 'A4' check (page_size in ('A4', 'A5', 'CR80')),
  orientation text not null default 'portrait' check (orientation in ('portrait', 'landscape')),
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index document_templates_one_default on public.document_templates (organization_id, kind) where is_default;

create table public.issued_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  template_id uuid,
  kind text not null,
  number text not null unique,
  title text not null,
  student_id uuid,
  subject_type text check (subject_type in ('payment', 'report_card', 'enrollment', 'student', 'invoice')),
  subject_id uuid,
  verification_code text not null unique default app.random_code(26),
  holder_display text, -- identité MASQUÉE affichée sur la page publique (ex. « K. YAO »)
  data jsonb not null default '{}'::jsonb,
  status text not null default 'valid' check (status in ('valid', 'revoked')),
  revoked_reason text,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  issued_at timestamptz not null default now(),
  issued_by uuid default auth.uid() references public.profiles (id) on delete set null,
  expires_at timestamptz,
  file_path text,
  content_hash text check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  search_text text generated always as (app.search_normalize(number || ' ' || title)) stored,
  unique (organization_id, id),
  foreign key (organization_id, template_id) references public.document_templates (organization_id, id) on delete set null (template_id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  check (status <> 'revoked' or revoked_reason is not null)
);
create index issued_documents_student_idx on public.issued_documents (student_id);
create index issued_documents_subject_idx on public.issued_documents (subject_type, subject_id);
create index issued_documents_search_idx on public.issued_documents using gin (search_text extensions.gin_trgm_ops);

alter table public.report_cards
  add foreign key (organization_id, issued_document_id) references public.issued_documents (organization_id, id) on delete set null (issued_document_id);

create or replace function app.issued_document_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student record;
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
  if (to_jsonb(new) - array['status', 'revoked_reason', 'revoked_at', 'revoked_by', 'file_path', 'content_hash'])
     is distinct from (to_jsonb(old) - array['status', 'revoked_reason', 'revoked_at', 'revoked_by', 'file_path', 'content_hash']) then
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
create trigger issued_documents_guard
  before insert or update on public.issued_documents
  for each row execute function app.issued_document_guard();

-- Vérification publique (QR Code) : ne renvoie QUE les informations autorisées.
create or replace function public.verify_document(p_code text)
returns table (
  status text,
  kind text,
  title text,
  number text,
  issued_at timestamptz,
  expires_at timestamptz,
  holder text,
  organization_name text,
  organization_city text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_code is null or p_code !~ '^[A-Z2-9]{26}$' then
    return query select 'not_found'::text, null::text, null::text, null::text, null::timestamptz,
                        null::timestamptz, null::text, null::text, null::text;
    return;
  end if;

  return query
    select
      case
        when d.status = 'revoked' then 'revoked'
        when d.expires_at is not null and d.expires_at < now() then 'expired'
        else 'valid'
      end,
      d.kind, d.title, d.number, d.issued_at, d.expires_at, d.holder_display, o.name, o.city
    from public.issued_documents d
    join public.organizations o on o.id = d.organization_id
    where d.verification_code = p_code;

  if not found then
    return query select 'not_found'::text, null::text, null::text, null::text, null::timestamptz,
                        null::timestamptz, null::text, null::text, null::text;
  end if;
end;
$$;
revoke execute on function public.verify_document(text) from public;
grant execute on function public.verify_document(text) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Fichiers (références aux objets Supabase Storage)
-- -----------------------------------------------------------------------------
create table public.file_objects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  bucket text not null check (bucket in ('org-assets', 'student-files', 'generated-documents')),
  path text not null,
  owner_type text not null check (owner_type in ('organization', 'student', 'guardian', 'staff', 'enrollment', 'issued_document', 'attendance_record')),
  owner_id uuid,
  category text,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (bucket, path),
  check (split_part(path, '/', 1) = organization_id::text)
);
create index file_objects_owner_idx on public.file_objects (owner_type, owner_id);

-- -----------------------------------------------------------------------------
-- Annonces
-- audience : { "personas": ["staff","teacher","parent","student"], "class_ids": [] }
-- -----------------------------------------------------------------------------
create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 200),
  body text not null,
  audience jsonb not null default '{"personas": ["staff", "teacher", "parent", "student"], "class_ids": []}'::jsonb,
  is_pinned boolean not null default false,
  published_at timestamptz,
  expires_at timestamptz,
  author_id uuid default auth.uid() references public.profiles (id) on delete set null,
  author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index announcements_org_published_idx on public.announcements (organization_id, published_at desc);

create or replace function app.can_see_announcement(p_org uuid, p_audience jsonb)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1 from jsonb_array_elements_text(coalesce(p_audience -> 'personas', '[]'::jsonb)) persona
      where persona = any (app.my_personas(p_org))
    )
    and (
      jsonb_array_length(coalesce(p_audience -> 'class_ids', '[]'::jsonb)) = 0
      or exists (
        select 1 from jsonb_array_elements_text(p_audience -> 'class_ids') cid
        where cid::uuid = any (app.my_taught_class_ids() || app.my_portal_class_ids())
      )
    );
$$;

-- -----------------------------------------------------------------------------
-- Messagerie
-- -----------------------------------------------------------------------------
create table public.message_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  subject text not null check (length(btrim(subject)) between 1 and 200),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.thread_participants (
  organization_id uuid not null,
  thread_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (thread_id, user_id),
  foreign key (organization_id, thread_id) references public.message_threads (organization_id, id) on delete cascade
);
create index thread_participants_user_idx on public.thread_participants (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  thread_id uuid not null,
  sender_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, thread_id) references public.message_threads (organization_id, id) on delete cascade
);
create index messages_thread_idx on public.messages (thread_id, created_at);

create or replace function app.my_thread_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(tp.thread_id), '{}')
  from public.thread_participants tp
  where tp.user_id = auth.uid()
    and tp.organization_id = any (app.member_org_ids());
$$;

create or replace function app.message_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.message_threads set last_message_at = new.created_at where id = new.thread_id;
  update public.thread_participants set last_read_at = new.created_at
   where thread_id = new.thread_id and user_id = new.sender_id;
  return new;
end;
$$;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function app.message_after_insert();

-- -----------------------------------------------------------------------------
-- Notifications (in-app) + boîte d'envoi multicanal
-- -----------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  link text check (link is null or link ~ '^/'),
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  notification_type text not null,
  channels text[] not null default '{in_app}'
    check (channels <@ array['in_app', 'email', 'sms', 'whatsapp', 'push']),
  primary key (user_id, organization_id, notification_type)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'whatsapp', 'push')),
  destination text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0,
  last_error text,
  provider_reference text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notification_deliveries_pending_idx on public.notification_deliveries (created_at) where status = 'pending';

-- Crée une notification + les envois selon les préférences du destinataire.
create or replace function app.notify(
  p_org uuid, p_user uuid, p_type text, p_title text, p_body text, p_link text, p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_channels text[];
  v_profile public.profiles;
  v_channel text;
begin
  if p_user is null then
    return null;
  end if;
  insert into public.notifications (organization_id, user_id, type, title, body, link, data)
  values (p_org, p_user, p_type, p_title, p_body, p_link, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;

  select channels into v_channels from public.notification_preferences
   where user_id = p_user and organization_id = p_org and notification_type = p_type;
  if v_channels is null then
    return v_id;
  end if;
  select * into v_profile from public.profiles where id = p_user;
  foreach v_channel in array v_channels loop
    if v_channel <> 'in_app' then
      insert into public.notification_deliveries (organization_id, notification_id, channel, destination, status)
      values (
        p_org, v_id, v_channel,
        case when v_channel = 'email' then v_profile.email when v_channel in ('sms', 'whatsapp') then v_profile.phone end,
        case when v_channel = 'push' or (case when v_channel = 'email' then v_profile.email else v_profile.phone end) is not null
             then 'pending' else 'skipped' end
      );
    end if;
  end loop;
  return v_id;
end;
$$;

-- Destinataires « famille » d'un élève : parents avec accès portail + l'élève.
create or replace function app.family_user_ids(p_student uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.user_id
  from public.student_guardians sg
  join public.guardians g on g.id = sg.guardian_id
  where sg.student_id = p_student and sg.portal_access and g.user_id is not null
  union
  select s.user_id from public.students s where s.id = p_student and s.user_id is not null;
$$;

-- Événements métier → notifications
create or replace function app.notify_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  for v_user in select * from app.family_user_ids(new.student_id) loop
    perform app.notify(new.organization_id, v_user, 'payment.received',
      'Paiement enregistré',
      'Reçu ' || new.number || ' — ' || to_char(new.amount, 'FM999G999G999G990') || '. Reliquat : '
        || to_char(coalesce(new.balance_after, 0), 'FM999G999G999G990') || '.',
      '/portail', jsonb_build_object('payment_id', new.id));
  end loop;
  return new;
end;
$$;
create trigger payments_notify after insert on public.payments
  for each row execute function app.notify_payment();

create or replace function app.notify_absence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_date date;
begin
  if new.status not in ('absent', 'late') or (tg_op = 'UPDATE' and old.status = new.status) then
    return new;
  end if;
  select session_date into v_date from public.attendance_sessions where id = new.session_id;
  for v_user in select * from app.family_user_ids(new.student_id) loop
    perform app.notify(new.organization_id, v_user, 'attendance.' || new.status::text,
      case when new.status = 'absent' then 'Absence signalée' else 'Retard signalé' end,
      'Le ' || to_char(v_date, 'DD/MM/YYYY') || '.',
      '/portail', jsonb_build_object('attendance_record_id', new.id));
  end loop;
  return new;
end;
$$;
create trigger attendance_records_notify after insert or update of status on public.attendance_records
  for each row execute function app.notify_absence();

create or replace function app.notify_assessment_published()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    for v_user in
      select distinct f from public.enrollments e, app.family_user_ids(e.student_id) f
      where e.class_id = new.class_id and e.status = 'validated'
    loop
      perform app.notify(new.organization_id, v_user, 'grades.published',
        'Nouvelles notes disponibles', new.title, '/portail', jsonb_build_object('assessment_id', new.id));
    end loop;
  end if;
  return new;
end;
$$;
create trigger assessments_notify after insert or update of is_published on public.assessments
  for each row execute function app.notify_assessment_published();

create or replace function app.notify_report_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    for v_user in select * from app.family_user_ids(new.student_id) loop
      perform app.notify(new.organization_id, v_user, 'report_card.published',
        'Bulletin disponible', null, '/portail', jsonb_build_object('report_card_id', new.id));
    end loop;
  end if;
  return new;
end;
$$;
create trigger report_cards_notify after insert or update of status on public.report_cards
  for each row execute function app.notify_report_card();

create or replace function app.notify_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.status = 'validated' and (tg_op = 'INSERT' or old.status <> 'validated') then
    for v_user in select * from app.family_user_ids(new.student_id) loop
      perform app.notify(new.organization_id, v_user, 'enrollment.validated',
        'Inscription validée', 'Référence ' || new.reference, '/portail', jsonb_build_object('enrollment_id', new.id));
    end loop;
  end if;
  return new;
end;
$$;
create trigger enrollments_notify after insert or update of status on public.enrollments
  for each row execute function app.notify_enrollment();

create or replace function app.notify_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if new.student_id is not null then
    for v_user in select * from app.family_user_ids(new.student_id) loop
      perform app.notify(new.organization_id, v_user, 'document.issued',
        'Nouveau document', new.title, '/portail', jsonb_build_object('document_id', new.id));
    end loop;
  end if;
  return new;
end;
$$;
create trigger issued_documents_notify after insert on public.issued_documents
  for each row execute function app.notify_document();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.document_templates enable row level security;
alter table public.issued_documents enable row level security;
alter table public.file_objects enable row level security;
alter table public.announcements enable row level security;
alter table public.message_threads enable row level security;
alter table public.thread_participants enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security; -- worker (service role) uniquement

create policy document_templates_select on public.document_templates for select to authenticated
  using (organization_id = any ((select app.member_org_ids())::uuid[]));
create policy document_templates_write on public.document_templates for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('documents.templates.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('documents.templates.manage'))::uuid[]));

create policy issued_documents_select on public.issued_documents for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('documents.read'))::uuid[])
    or (status = 'valid' and student_id = any ((select app.my_portal_student_ids())::uuid[]))
  );
create policy issued_documents_insert on public.issued_documents for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('documents.generate'))::uuid[]));
create policy issued_documents_update on public.issued_documents for update to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('documents.generate'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('documents.revoke'))::uuid[])
  )
  with check (
    organization_id = any ((select app.permitted_org_ids('documents.generate'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('documents.revoke'))::uuid[])
  );

create policy file_objects_select on public.file_objects for select to authenticated
  using (
    case owner_type
      when 'organization' then organization_id = any ((select app.member_org_ids())::uuid[])
      when 'student' then organization_id = any ((select app.permitted_org_ids('students.read'))::uuid[])
        or owner_id = any ((select app.my_portal_student_ids())::uuid[])
      when 'guardian' then organization_id = any ((select app.permitted_org_ids('guardians.read'))::uuid[])
      when 'staff' then organization_id = any ((select app.permitted_org_ids('staff.read'))::uuid[])
      when 'enrollment' then organization_id = any ((select app.permitted_org_ids('enrollments.read'))::uuid[])
      when 'issued_document' then organization_id = any ((select app.permitted_org_ids('documents.read'))::uuid[])
        or owner_id in (select d.id from public.issued_documents d)
      when 'attendance_record' then organization_id = any ((select app.permitted_org_ids('attendance.read'))::uuid[])
      else false
    end
  );
create policy file_objects_insert on public.file_objects for insert to authenticated
  with check (
    case owner_type
      when 'organization' then organization_id = any ((select app.permitted_org_ids('settings.manage'))::uuid[])
      when 'student' then organization_id = any ((select app.permitted_org_ids('students.update'))::uuid[])
      when 'guardian' then organization_id = any ((select app.permitted_org_ids('guardians.manage'))::uuid[])
      when 'staff' then organization_id = any ((select app.permitted_org_ids('staff.manage'))::uuid[])
      when 'enrollment' then organization_id = any ((select app.permitted_org_ids('enrollments.manage'))::uuid[])
      when 'issued_document' then organization_id = any ((select app.permitted_org_ids('documents.generate'))::uuid[])
      when 'attendance_record' then organization_id = any ((select app.permitted_org_ids('attendance.justify'))::uuid[])
      else false
    end
  );

create policy announcements_select on public.announcements for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('communication.announce'))::uuid[])
    or (
      organization_id = any ((select app.member_org_ids())::uuid[])
      and published_at is not null and published_at <= now()
      and (expires_at is null or expires_at > now())
      and app.can_see_announcement(organization_id, audience)
    )
  );
create policy announcements_write on public.announcements for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('communication.announce'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('communication.announce'))::uuid[]));

create policy threads_select on public.message_threads for select to authenticated
  using (id = any ((select app.my_thread_ids())::uuid[]) or created_by = (select auth.uid()));
create policy threads_insert on public.message_threads for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and organization_id = any ((select app.permitted_org_ids('communication.message'))::uuid[])
  );

create policy participants_select on public.thread_participants for select to authenticated
  using (thread_id = any ((select app.my_thread_ids())::uuid[]));
create policy participants_insert on public.thread_participants for insert to authenticated
  with check (
    thread_id in (select t.id from public.message_threads t where t.created_by = (select auth.uid()))
    and user_id in (select m.user_id from public.memberships m where m.organization_id = thread_participants.organization_id and m.status = 'active')
  );
create policy participants_update_self on public.thread_participants for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy messages_select on public.messages for select to authenticated
  using (thread_id = any ((select app.my_thread_ids())::uuid[]));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and thread_id = any ((select app.my_thread_ids())::uuid[]));

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy notification_preferences_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and organization_id = any ((select app.member_org_ids())::uuid[]));

create trigger document_templates_touch before update on public.document_templates for each row execute function app.touch_updated_at();
create trigger announcements_touch before update on public.announcements for each row execute function app.touch_updated_at();

grant execute on function
  app.can_see_announcement(uuid, jsonb), app.my_thread_ids(),
  app.notify(uuid, uuid, text, text, text, text, jsonb), app.family_user_ids(uuid)
to authenticated, service_role;

-- Realtime : diffusion des notifications (la RLS filtre par destinataire).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
