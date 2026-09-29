-- =============================================================================
-- P7d — CENTRE DE COMMUNICATION (SMS, e-mail, WhatsApp)
--
-- Réutilise l'existant : annonces (in-app), fournisseurs et quotas de la
-- plateforme (P3 : platform_integrations, messaging_quotas, message_deliveries),
-- rappels de factures (send_invoice_reminders) et leur planificateur.
--   * Modèles de messages avec variables ({{eleve_prenom}}, {{solde}}…).
--   * Envois groupés : destinataires calculés EN BASE selon le public
--     (parents de tout l'établissement / de classes / d'élèves en impayé,
--     personnel), figés à la préparation, puis envoyés par lots par le serveur
--     (clé de service), avec quota mensuel et journal par destinataire.
--   * Automatisation : relance des impayés par SMS / e-mail / WhatsApp.
--   * Aucun envoi simulé : sans fournisseur actif, le destinataire est marqué
--     « non configuré ».
-- =============================================================================

insert into public.permissions (code, module, label, sort_order) values
  ('communication.send', 'communication', 'Envoyer des SMS, e-mails et WhatsApp groupés', 112);
insert into public.role_permissions (role_id, permission_code)
select r.id, 'communication.send' from public.roles r where r.key in ('org_admin', 'director')
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Variables disponibles (liste fermée)
-- -----------------------------------------------------------------------------
create or replace function app.communication_variables()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['destinataire', 'eleve_nom', 'eleve_prenom', 'matricule', 'classe', 'etablissement', 'solde', 'devise'];
$$;

create or replace function app.message_template_error(p_channel text, p_subject text, p_body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
begin
  if p_channel not in ('email', 'sms', 'whatsapp') then
    return 'Canal inconnu.';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 3 and (case p_channel when 'sms' then 480 else 4000 end) then
    return case p_channel when 'sms' then 'Message SMS : de 3 à 480 caractères (3 SMS au plus).' else 'Message : de 3 à 4 000 caractères.' end;
  end if;
  if p_channel = 'email' and char_length(btrim(coalesce(p_subject, ''))) not between 3 and 200 then
    return 'Objet de l''e-mail obligatoire (200 caractères au plus).';
  end if;
  for v in select (regexp_matches(coalesce(p_subject, '') || ' ' || p_body, '\{\{\s*([^}]*?)\s*\}\}', 'g'))[1] loop
    if not (v = any (app.communication_variables())) then
      return 'Variable inconnue : {{' || v || '}}.';
    end if;
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Modèles
-- -----------------------------------------------------------------------------
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  subject text check (subject is null or char_length(subject) <= 200),
  body text not null,
  -- WhatsApp : modèle approuvé par Meta (P3) et ordre des variables {{1}}, {{2}}…
  whatsapp_template_id uuid references public.whatsapp_templates (id) on delete set null,
  whatsapp_variables text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  check (app.message_template_error(channel, subject, body) is null)
);
create index message_templates_org on public.message_templates (organization_id, name);

-- -----------------------------------------------------------------------------
-- Envois groupés et destinataires
-- -----------------------------------------------------------------------------
create table public.message_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  template_id uuid references public.message_templates (id) on delete set null,
  name text not null check (char_length(name) between 2 and 160),
  channel text not null check (channel in ('email', 'sms', 'whatsapp')),
  subject text,
  body text not null,
  whatsapp_template_name text,
  whatsapp_language text,
  whatsapp_variables text[] not null default '{}',
  audience jsonb not null,
  source text not null default 'manual' check (source in ('manual', 'automation')),
  status text not null default 'ready' check (status in ('ready', 'sending', 'done', 'cancelled')),
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  skipped integer not null default 0,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index message_campaigns_org on public.message_campaigns (organization_id, created_at desc);

create table public.message_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.message_campaigns (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_type text not null check (recipient_type in ('guardian', 'staff')),
  recipient_id uuid not null,
  student_id uuid references public.students (id) on delete set null,
  display_name text not null,
  contact_masked text,
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed', 'blocked_quota', 'not_configured', 'no_contact')),
  error text check (error is null or char_length(error) <= 500),
  sent_at timestamptz,
  unique (campaign_id, recipient_type, recipient_id, student_id)
);
create index message_campaign_recipients_pending on public.message_campaign_recipients (campaign_id) where status = 'pending';

create table public.communication_automations (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('invoice_overdue')),
  template_id uuid references public.message_templates (id) on delete set null,
  enabled boolean not null default false,
  interval_days integer not null default 7 check (interval_days between 1 and 60),
  last_run_at timestamptz,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, kind)
);

alter table public.message_templates enable row level security;
alter table public.message_campaigns enable row level security;
alter table public.message_campaign_recipients enable row level security;
alter table public.communication_automations enable row level security;
revoke all on public.message_templates, public.message_campaigns, public.message_campaign_recipients, public.communication_automations from anon, authenticated;
grant select on public.message_templates, public.message_campaigns, public.message_campaign_recipients, public.communication_automations to authenticated;
grant select, update on public.message_campaigns, public.message_campaign_recipients to service_role;
grant select on public.message_templates, public.communication_automations to service_role;
create policy message_templates_read on public.message_templates for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('communication.send'))::uuid[]));
create policy message_campaigns_read on public.message_campaigns for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('communication.send'))::uuid[]));
create policy message_campaign_recipients_read on public.message_campaign_recipients for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('communication.send'))::uuid[]));
create policy communication_automations_read on public.communication_automations for select to authenticated
  using (organization_id = any ((select app.permitted_org_ids('communication.send'))::uuid[]));

-- Modèles WhatsApp approuvés (P3) : lisibles par les établissements s'ils sont actifs (aucun secret).
create policy whatsapp_templates_read_enabled on public.whatsapp_templates for select to authenticated using (enabled);

-- Appelant : membre autorisé, ou serveur (clé de service, planificateur).
create or replace function app.require_communication_send(p_org uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null and coalesce(nullif(auth.role(), ''), 'service_role') = 'service_role' then
    return;
  end if;
  if not app.has_permission(p_org, 'communication.send') then
    raise exception 'Permission refusée : envois groupés.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

create or replace function public.save_message_template(
  p_org uuid, p_id uuid, p_name text, p_channel text, p_subject text, p_body text,
  p_whatsapp_template uuid default null, p_whatsapp_variables text[] default '{}', p_active boolean default true)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_error text := app.message_template_error(p_channel, p_subject, p_body);
  v_id uuid;
  v_wa public.whatsapp_templates;
  v text;
begin
  perform app.require_communication_send(p_org);
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 2 and 120 then
    raise exception 'Nom du modèle : de 2 à 120 caractères.' using errcode = 'check_violation';
  end if;
  if p_channel = 'whatsapp' then
    select * into v_wa from public.whatsapp_templates where id = p_whatsapp_template and enabled;
    if v_wa.id is null then
      raise exception 'WhatsApp : choisissez un modèle approuvé par Meta (déclaré par NéoScol).' using errcode = 'check_violation';
    end if;
    if coalesce(array_length(p_whatsapp_variables, 1), 0) <> v_wa.variables_count then
      raise exception 'Le modèle WhatsApp « % » attend % variable(s).', v_wa.name, v_wa.variables_count using errcode = 'check_violation';
    end if;
    foreach v in array p_whatsapp_variables loop
      if not (v = any (app.communication_variables())) then
        raise exception 'Variable inconnue : %.', v using errcode = 'check_violation';
      end if;
    end loop;
  end if;
  if p_id is not null then
    update public.message_templates
       set name = btrim(p_name), channel = p_channel, subject = nullif(btrim(coalesce(p_subject, '')), ''), body = btrim(p_body),
           whatsapp_template_id = case when p_channel = 'whatsapp' then p_whatsapp_template end,
           whatsapp_variables = case when p_channel = 'whatsapp' then p_whatsapp_variables else '{}' end,
           is_active = p_active, updated_at = now()
     where id = p_id and organization_id = p_org returning id into v_id;
    if v_id is null then
      raise exception 'Modèle introuvable.' using errcode = 'no_data_found';
    end if;
  else
    insert into public.message_templates (organization_id, name, channel, subject, body, whatsapp_template_id, whatsapp_variables, is_active)
    values (p_org, btrim(p_name), p_channel, nullif(btrim(coalesce(p_subject, '')), ''), btrim(p_body),
            case when p_channel = 'whatsapp' then p_whatsapp_template end,
            case when p_channel = 'whatsapp' then p_whatsapp_variables else '{}' end, p_active)
    returning id into v_id;
  end if;
  perform app.audit(p_org, 'communication.template_saved', 'message_templates', v_id,
    'Modèle de message « ' || btrim(p_name) || ' » (' || p_channel || ') enregistré', '{}'::jsonb, 'success');
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Public : parents (tous / classes / impayés) ou personnel. Contacts lus en
-- base, jamais fournis par le navigateur.
-- -----------------------------------------------------------------------------
create or replace function app.communication_audience(p_org uuid, p_audience jsonb, p_channel text)
returns table (recipient_type text, recipient_id uuid, student_id uuid, display_name text, contact text, variables jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with org as (select o.name, o.currency from public.organizations o where o.id = p_org),
  target as (select coalesce(p_audience ->> 'kind', 'guardians') as kind,
                    coalesce(array(select jsonb_array_elements_text(coalesce(p_audience -> 'class_ids', '[]'::jsonb)))::uuid[], '{}') as class_ids),
  pupils as (
    select s.id, s.last_name, s.first_name, s.matricule,
           (select c.name from public.enrollments e join public.classes c on c.id = e.class_id
              join public.academic_years y on y.id = c.academic_year_id and y.is_current
             where e.student_id = s.id and e.status = 'validated' limit 1) as class_name,
           (select c.id from public.enrollments e join public.classes c on c.id = e.class_id
              join public.academic_years y on y.id = c.academic_year_id and y.is_current
             where e.student_id = s.id and e.status = 'validated' limit 1) as class_id,
           (select coalesce(sum(b.balance), 0) from public.student_balances b where b.student_id = s.id and b.organization_id = p_org) as balance,
           (select coalesce(bool_or(b.has_overdue), false) from public.student_balances b where b.student_id = s.id and b.organization_id = p_org) as overdue
    from public.students s
    where s.organization_id = p_org and s.status = 'active' and s.archived_at is null
  ),
  chosen as (
    select p.* from pupils p, target t
    where t.kind in ('guardians', 'classes', 'unpaid')
      and (t.kind <> 'classes' or p.class_id = any (t.class_ids))
      and (t.kind <> 'unpaid' or p.overdue)
  )
  -- Parents : le responsable principal / financier de chaque élève (un message par élève).
  select 'guardian'::text, g.id, p.id, g.last_name || ' ' || g.first_name,
         case p_channel when 'email' then nullif(btrim(g.email), '') else nullif(btrim(g.phone), '') end,
         jsonb_build_object('destinataire', g.first_name || ' ' || g.last_name, 'eleve_nom', p.last_name, 'eleve_prenom', p.first_name,
                            'matricule', p.matricule, 'classe', coalesce(p.class_name, ''), 'etablissement', (select name from org),
                            'solde', replace(to_char(p.balance, 'FM999G999G999G990'), ',', ' '), 'devise', (select currency from org))
  from chosen p
  join lateral (
    select g.* from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
    where sg.student_id = p.id and sg.organization_id = p_org
    order by (select kind from target) = 'unpaid' and sg.is_financial_responsible desc, sg.is_primary desc, sg.created_at
    limit 1
  ) g on true
  union all
  select 'staff'::text, m.id, null::uuid, m.last_name || ' ' || m.first_name,
         case p_channel when 'email' then nullif(btrim(m.email), '') else nullif(btrim(m.phone), '') end,
         jsonb_build_object('destinataire', m.first_name || ' ' || m.last_name, 'etablissement', (select name from org))
  from public.staff_members m, target t
  where t.kind = 'staff' and m.organization_id = p_org and m.archived_at is null and m.status = 'active';
$$;

create or replace function app.mask_contact(p_contact text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_contact is null then null
              when position('@' in p_contact) > 0 then left(p_contact, 2) || '•••@' || split_part(p_contact, '@', 2)
              else left(p_contact, 4) || repeat('•', greatest(char_length(p_contact) - 6, 0)) || right(p_contact, 2) end;
$$;

create or replace function app.audience_error(p_audience jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_audience) <> 'object' or coalesce(p_audience ->> 'kind', '') not in ('guardians', 'classes', 'unpaid', 'staff') then 'Public inconnu.'
    when p_audience ->> 'kind' = 'classes' and jsonb_array_length(coalesce(p_audience -> 'class_ids', '[]'::jsonb)) = 0 then 'Choisissez au moins une classe.'
  end;
$$;

-- Aperçu : nombre de destinataires, joignables, premiers exemples (aucune écriture).
create or replace function public.preview_message_audience(p_org uuid, p_audience jsonb, p_channel text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_error text := app.audience_error(p_audience);
begin
  perform app.require_communication_send(p_org);
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;
  return (
    select jsonb_build_object(
      'total', count(*),
      'reachable', count(*) filter (where a.contact is not null),
      'sample', coalesce((select jsonb_agg(x) from (
          select b.display_name as name, app.mask_contact(b.contact) as contact, b.variables
          from app.communication_audience(p_org, p_audience, p_channel) b where b.contact is not null limit 3) x), '[]'::jsonb))
    from app.communication_audience(p_org, p_audience, p_channel) a);
end;
$$;

-- Préparation : destinataires figés (contact masqué) ; l'envoi se fait ensuite par lots.
create or replace function public.create_message_campaign(p_org uuid, p_template uuid, p_name text, p_audience jsonb, p_source text default 'manual')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tpl public.message_templates;
  v_wa public.whatsapp_templates;
  v_error text := app.audience_error(p_audience);
  v_id uuid;
  v_total integer;
  v_skipped integer;
begin
  perform app.require_communication_send(p_org);
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;
  select * into v_tpl from public.message_templates where id = p_template and organization_id = p_org and is_active;
  if v_tpl.id is null then
    raise exception 'Modèle de message introuvable ou inactif.' using errcode = 'no_data_found';
  end if;
  if v_tpl.channel = 'whatsapp' then
    select * into v_wa from public.whatsapp_templates where id = v_tpl.whatsapp_template_id and enabled;
    if v_wa.id is null then
      raise exception 'Le modèle WhatsApp associé n''est plus disponible.' using errcode = 'check_violation';
    end if;
  end if;
  insert into public.message_campaigns (organization_id, template_id, name, channel, subject, body, whatsapp_template_name, whatsapp_language,
                                        whatsapp_variables, audience, source, created_by)
  values (p_org, v_tpl.id, coalesce(nullif(btrim(p_name), ''), v_tpl.name), v_tpl.channel, v_tpl.subject, v_tpl.body, v_wa.name, v_wa.language,
          v_tpl.whatsapp_variables, p_audience, p_source, auth.uid())
  returning id into v_id;
  insert into public.message_campaign_recipients (campaign_id, organization_id, recipient_type, recipient_id, student_id, display_name, contact_masked, variables, status)
  select v_id, p_org, a.recipient_type, a.recipient_id, a.student_id, a.display_name, app.mask_contact(a.contact), a.variables,
         case when a.contact is null then 'no_contact' else 'pending' end
  from app.communication_audience(p_org, p_audience, v_tpl.channel) a
  on conflict do nothing;
  select count(*), count(*) filter (where status = 'no_contact') into v_total, v_skipped from public.message_campaign_recipients where campaign_id = v_id;
  if v_total = 0 then
    raise exception 'Aucun destinataire pour ce public.' using errcode = 'no_data_found';
  end if;
  update public.message_campaigns set total = v_total, skipped = v_skipped,
         status = case when v_total = v_skipped then 'done' else 'ready' end,
         finished_at = case when v_total = v_skipped then now() end
   where id = v_id;
  perform app.audit(p_org, 'communication.campaign_created', 'message_campaigns', v_id,
    'Envoi « ' || coalesce(nullif(btrim(p_name), ''), v_tpl.name) || ' » (' || v_tpl.channel || ') préparé : ' || v_total || ' destinataire(s)',
    jsonb_build_object('audience', p_audience, 'source', p_source), 'success');
  return v_id;
end;
$$;

-- Lot à envoyer (serveur uniquement) : contact en clair relu en base au moment de l'envoi.
create or replace function public.message_campaign_batch(p_campaign uuid, p_limit integer default 50)
returns table (recipient_id uuid, contact text, variables jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.message_campaigns;
begin
  select * into v_c from public.message_campaigns where id = p_campaign;
  if v_c.id is null or v_c.status not in ('ready', 'sending') then
    return;
  end if;
  update public.message_campaigns set status = 'sending' where id = p_campaign and status = 'ready';
  return query
  select r.id,
         case r.recipient_type
           when 'guardian' then (select case v_c.channel when 'email' then nullif(btrim(g.email), '') else nullif(btrim(g.phone), '') end
                                   from public.guardians g where g.id = r.recipient_id and g.organization_id = v_c.organization_id)
           else (select case v_c.channel when 'email' then nullif(btrim(m.email), '') else nullif(btrim(m.phone), '') end
                   from public.staff_members m where m.id = r.recipient_id and m.organization_id = v_c.organization_id) end,
         r.variables
  from public.message_campaign_recipients r
  where r.campaign_id = p_campaign and r.status = 'pending'
  order by r.display_name
  limit least(greatest(p_limit, 1), 200);
end;
$$;

-- Résultats d'un lot (serveur uniquement) : [{id, status, error}]
create or replace function public.message_campaign_record(p_campaign uuid, p_results jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.message_campaigns;
  v_pending integer;
begin
  select * into v_c from public.message_campaigns where id = p_campaign for update;
  if v_c.id is null then
    raise exception 'Envoi introuvable.' using errcode = 'no_data_found';
  end if;
  update public.message_campaign_recipients r
     set status = x.status, error = left(x.error, 500), sent_at = case when x.status = 'sent' then now() end
    from jsonb_to_recordset(p_results) as x(id uuid, status text, error text)
   where r.id = x.id and r.campaign_id = p_campaign and r.status = 'pending'
     and x.status in ('sent', 'failed', 'blocked_quota', 'not_configured', 'no_contact');
  select count(*) filter (where status = 'pending') into v_pending from public.message_campaign_recipients where campaign_id = p_campaign;
  update public.message_campaigns c
     set sent = s.sent, failed = s.failed, skipped = s.skipped,
         status = case when v_pending = 0 then 'done' else 'sending' end,
         finished_at = case when v_pending = 0 then now() end
    from (select count(*) filter (where status = 'sent') as sent,
                 count(*) filter (where status in ('failed', 'blocked_quota', 'not_configured')) as failed,
                 count(*) filter (where status = 'no_contact') as skipped
            from public.message_campaign_recipients where campaign_id = p_campaign) s
   where c.id = p_campaign;
  if v_pending = 0 then
    perform app.audit(v_c.organization_id, 'communication.campaign_sent', 'message_campaigns', p_campaign,
      'Envoi « ' || v_c.name || ' » terminé', (select jsonb_build_object('sent', sent, 'failed', failed, 'skipped', skipped)
                                               from public.message_campaigns where id = p_campaign), 'success');
  end if;
  return jsonb_build_object('pending', v_pending);
end;
$$;

-- Annulation des destinataires restants (données conservées).
create or replace function public.cancel_message_campaign(p_campaign uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_c public.message_campaigns;
begin
  select * into v_c from public.message_campaigns where id = p_campaign;
  if v_c.id is null then
    raise exception 'Envoi introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.require_communication_send(v_c.organization_id);
  if v_c.status not in ('ready', 'sending') then
    raise exception 'Cet envoi est déjà terminé.' using errcode = 'check_violation';
  end if;
  update public.message_campaigns set status = 'cancelled', finished_at = now() where id = p_campaign;
  perform app.audit(v_c.organization_id, 'communication.campaign_cancelled', 'message_campaigns', p_campaign,
    'Envoi « ' || v_c.name || ' » annulé (destinataires restants non contactés)', '{}'::jsonb, 'success');
end;
$$;

-- Automatisation des relances d'impayés.
create or replace function public.save_communication_automation(p_org uuid, p_kind text, p_template uuid, p_enabled boolean, p_interval integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_communication_send(p_org);
  if p_enabled and not exists (select 1 from public.message_templates where id = p_template and organization_id = p_org and is_active) then
    raise exception 'Choisissez un modèle de message actif.' using errcode = 'check_violation';
  end if;
  insert into public.communication_automations (organization_id, kind, template_id, enabled, interval_days, updated_by)
  values (p_org, p_kind, p_template, p_enabled, p_interval, auth.uid())
  on conflict (organization_id, kind) do update
    set template_id = excluded.template_id, enabled = excluded.enabled, interval_days = excluded.interval_days,
        updated_by = excluded.updated_by, updated_at = now();
  perform app.audit(p_org, 'communication.automation_saved', 'communication_automations', null,
    'Relance automatique des impayés ' || case when p_enabled then 'activée (tous les ' || p_interval || ' jours)' else 'désactivée' end,
    jsonb_build_object('template_id', p_template), 'success');
end;
$$;

-- Automatisations dues (serveur) : marquées comme exécutées pour éviter les doublons.
create or replace function public.due_communication_automations()
returns table (organization_id uuid, kind text, template_id uuid)
language sql
volatile
security definer
set search_path = ''
as $$
  update public.communication_automations a set last_run_at = now()
   where a.enabled and a.template_id is not null
     and (a.last_run_at is null or a.last_run_at < now() - make_interval(days => a.interval_days) + interval '1 hour')
     and exists (select 1 from public.organizations o where o.id = a.organization_id and o.status = 'active')
  returning a.organization_id, a.kind, a.template_id;
$$;

-- Canaux disponibles et consommation du mois pour l'établissement.
create or replace function public.communication_channels(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform app.require_communication_send(p_org);
  return jsonb_build_object(
    'email', jsonb_build_object('enabled', exists (select 1 from public.platform_integrations where provider = 'brevo_email' and enabled)) || public.messaging_quota_state(p_org, 'email'),
    'sms', jsonb_build_object('enabled', exists (select 1 from public.platform_integrations where provider in ('brevo_sms', 'twilio_sms') and enabled)) || public.messaging_quota_state(p_org, 'sms'),
    'whatsapp', jsonb_build_object('enabled', exists (select 1 from public.platform_integrations where provider = 'whatsapp_meta' and enabled)) || public.messaging_quota_state(p_org, 'whatsapp'));
end;
$$;

revoke execute on function public.save_message_template(uuid, uuid, text, text, text, text, uuid, text[], boolean) from public, anon;
revoke execute on function public.preview_message_audience(uuid, jsonb, text) from public, anon;
revoke execute on function public.create_message_campaign(uuid, uuid, text, jsonb, text) from public, anon;
revoke execute on function public.cancel_message_campaign(uuid) from public, anon;
revoke execute on function public.save_communication_automation(uuid, text, uuid, boolean, integer) from public, anon;
revoke execute on function public.communication_channels(uuid) from public, anon;
revoke execute on function public.message_campaign_batch(uuid, integer) from public, anon, authenticated;
revoke execute on function public.message_campaign_record(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.due_communication_automations() from public, anon, authenticated;
revoke execute on function app.communication_audience(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.save_message_template(uuid, uuid, text, text, text, text, uuid, text[], boolean) to authenticated;
grant execute on function public.preview_message_audience(uuid, jsonb, text) to authenticated;
grant execute on function public.create_message_campaign(uuid, uuid, text, jsonb, text) to authenticated, service_role;
grant execute on function public.cancel_message_campaign(uuid) to authenticated;
grant execute on function public.save_communication_automation(uuid, text, uuid, boolean, integer) to authenticated;
grant execute on function public.communication_channels(uuid) to authenticated;
grant execute on function public.message_campaign_batch(uuid, integer) to service_role;
grant execute on function public.message_campaign_record(uuid, jsonb) to service_role;
grant execute on function public.due_communication_automations() to service_role;
