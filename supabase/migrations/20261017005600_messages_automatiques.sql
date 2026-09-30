-- =============================================================================
-- Super Admin : messages automatiques modifiables (abonnement NeoScool).
-- Chaque message envoyé automatiquement aux responsables d'un établissement
-- (rappels d'essai, renouvellement, impayés, paiement…) peut recevoir un titre
-- et un texte personnalisés, avec des variables ({etablissement}, {formule},
-- {date_fin}…), ou être désactivé. Sans personnalisation, le texte d'origine
-- est conservé à l'identique. La logique d'abonnement (dates, statuts, accès)
-- n'est pas modifiée. Aucune donnée n'est supprimée.
-- =============================================================================

create table public.platform_message_templates (
  code text primary key check (code ~ '^[a-z][a-z_]{2,40}$'),
  label text not null,
  description text not null,
  sort_order integer not null default 0,
  variables text[] not null default '{}',
  default_title text not null,
  default_body text not null,
  title text check (title is null or char_length(btrim(title)) between 3 and 150),
  body text check (body is null or char_length(btrim(body)) between 3 and 1000),
  enabled boolean not null default true,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  check ((title is null) = (body is null))
);
alter table public.platform_message_templates enable row level security;
create policy platform_message_templates_admin_read on public.platform_message_templates for select to authenticated using (app.is_platform_admin());
revoke all on public.platform_message_templates from anon, authenticated;
grant select on public.platform_message_templates to authenticated;

insert into public.platform_message_templates (code, sort_order, label, description, variables, default_title, default_body) values
  ('trial_reminder', 10, 'Rappel de fin d''essai', 'Envoyé 7, 3 et 1 jour(s) avant la fin de l''essai gratuit.',
   '{etablissement,formule,jours,date_fin}',
   'Essai gratuit : plus que {jours} jour(s)',
   'Votre essai gratuit se termine le {date_fin}. Choisissez votre formule pour continuer sans interruption.'),
  ('trial_last_day', 20, 'Dernier jour d''essai', 'Envoyé le jour où l''essai gratuit se termine.',
   '{etablissement,formule,date_fin}',
   'Votre essai gratuit se termine aujourd''hui',
   'Souscrivez dès maintenant pour conserver l''accès complet. Vos données sont conservées.'),
  ('trial_ended', 30, 'Essai terminé sans paiement', 'Envoyé quand l''essai est terminé et qu''aucun paiement n''a été reçu.',
   '{etablissement,formule,date_fin,date_restriction}',
   'Essai gratuit terminé',
   'Réglez votre abonnement pour éviter toute restriction. Vos données sont conservées.'),
  ('renewal_notice', 40, 'Renouvellement à venir', 'Envoyé quelques jours avant l''échéance d''un abonnement actif (facture de renouvellement créée).',
   '{etablissement,formule,date_fin,montant,facture}',
   'Renouvellement de votre abonnement',
   'Votre abonnement {formule} arrive à échéance le {date_fin}. La facture de renouvellement est disponible dans « Mon abonnement ».'),
  ('past_due', 50, 'Échéance dépassée', 'Envoyé quand un abonnement payé n''a pas été renouvelé à l''échéance.',
   '{etablissement,formule,date_fin,date_restriction}',
   'Abonnement à renouveler',
   'Réglez votre abonnement pour éviter toute restriction. Vos données sont conservées.'),
  ('grace_period', 60, 'Délai de grâce', 'Envoyé au début du délai de grâce, avant le passage en lecture seule.',
   '{etablissement,formule,date_fin,date_restriction}',
   'Délai de grâce en cours',
   'Sans paiement, l''établissement passera en lecture seule le {date_restriction}.'),
  ('restricted', 70, 'Passage en lecture seule', 'Envoyé quand l''établissement passe en lecture seule faute de paiement.',
   '{etablissement,formule,date_fin,date_expiration}',
   'Accès restreint : lecture seule',
   'L''établissement est en lecture seule jusqu''au paiement. Aucune donnée n''est supprimée ; tout est rétabli dès le paiement confirmé.'),
  ('expired', 80, 'Abonnement expiré', 'Envoyé quand l''abonnement expire.',
   '{etablissement,formule,date_fin}',
   'Abonnement expiré',
   'L''abonnement a expiré. Les données restent conservées et consultables ; un paiement réactive immédiatement l''accès complet.'),
  ('cancelled', 90, 'Fin après annulation', 'Envoyé quand un abonnement annulé arrive à son terme.',
   '{etablissement,formule,date_fin}',
   'Abonnement terminé',
   'Votre abonnement a pris fin comme demandé. Vos données sont conservées, en lecture seule. Souscrivez à tout moment pour réactiver.'),
  ('invoice_created', 100, 'Facture créée', 'Envoyé quand une facture est créée au moment du paiement.',
   '{etablissement,formule,montant,facture}',
   'Facture {facture} créée',
   'Montant : {montant} — {formule}.'),
  ('payment_confirmed', 110, 'Paiement confirmé', 'Envoyé dès qu''un paiement est confirmé.',
   '{etablissement,formule,montant,facture,date_fin}',
   'Paiement confirmé',
   'Paiement de {montant} reçu. Abonnement actif jusqu''au {date_fin}.'),
  ('reactivated', 120, 'Abonnement réactivé', 'Envoyé quand un paiement réactive un abonnement en retard, restreint ou expiré.',
   '{etablissement,formule,date_fin}',
   'Abonnement réactivé',
   'Toutes les fonctionnalités de votre formule sont de nouveau disponibles.'),
  ('payment_failed', 130, 'Paiement échoué', 'Envoyé quand un paiement en ligne n''aboutit pas.',
   '{etablissement,formule,montant}',
   'Paiement échoué',
   'Le paiement n''a pas abouti. Vous pouvez réessayer depuis « Mon abonnement ».');

-- Message concerné par une notification d'abonnement (clé ou titre d'origine).
create or replace function app.billing_template_code(p_key text, p_title text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_key like 'trial:0:%' then 'trial_last_day'
    when p_key like 'trial:%' then 'trial_reminder'
    when p_key like 'renewal:%' then 'renewal_notice'
    when p_key like 'cancelled:%' then 'cancelled'
    when p_key like 'status:PAST_DUE:%' then case when p_title = 'Essai gratuit terminé' then 'trial_ended' else 'past_due' end
    when p_key like 'status:GRACE_PERIOD:%' then 'grace_period'
    when p_key like 'status:RESTRICTED:%' then 'restricted'
    when p_key like 'status:EXPIRED:%' then 'expired'
    when p_key is null and p_title = 'Paiement confirmé' then 'payment_confirmed'
    when p_key is null and p_title = 'Abonnement réactivé' then 'reactivated'
    when p_key is null and p_title = 'Paiement échoué' then 'payment_failed'
    when p_key is null and p_title like 'Facture % créée' then 'invoice_created'
    else null end;
$$;
revoke all on function app.billing_template_code(text, text) from public, anon, authenticated;

-- Remplace {variable} par sa valeur ; les variables inconnues restent telles quelles.
create or replace function app.render_template(p_text text, p_vars jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_key text;
  v_value text;
  v_out text := p_text;
begin
  for v_key, v_value in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v_out := replace(v_out, '{' || v_key || '}', coalesce(v_value, ''));
  end loop;
  return v_out;
end;
$$;
revoke all on function app.render_template(text, jsonb) from public, anon, authenticated;

create or replace function app.format_amount(p_amount integer, p_currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(p_amount, 'FM999G999G999G990'), ',', ' ') || ' ' || case p_currency when 'XOF' then 'F CFA' when 'XAF' then 'F CFA' else p_currency end;
$$;
revoke all on function app.format_amount(integer, text) from public, anon, authenticated;

-- Valeurs des variables pour un établissement et son abonnement.
create or replace function app.billing_template_vars(p_org uuid, p_sub uuid, p_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
  v_end timestamptz;
  v_cfg public.platform_billing_settings;
  v_inv public.subscription_invoices;
begin
  select * into v_sub from public.subscriptions where id = p_sub;
  select * into v_cfg from public.platform_billing_settings where id = 1;
  select * into v_inv from public.subscription_invoices where organization_id = p_org order by created_at desc limit 1;
  if v_sub.id is not null then
    v_end := app.subscription_end_at(v_sub);
  end if;
  return jsonb_build_object(
    'etablissement', (select name from public.organizations where id = p_org),
    'formule', coalesce((select name from public.subscription_plans where id = v_sub.plan_id), v_inv.plan_name, ''),
    'jours', case when p_key like 'trial:%' then split_part(p_key, ':', 2) else '' end,
    'date_fin', coalesce(to_char(v_end at time zone 'UTC', 'DD/MM/YYYY'), ''),
    'date_restriction', coalesce(to_char((v_end + make_interval(days => v_cfg.restrict_after_days)) at time zone 'UTC', 'DD/MM/YYYY'), ''),
    'date_expiration', coalesce(to_char((v_end + make_interval(days => v_cfg.expire_after_days)) at time zone 'UTC', 'DD/MM/YYYY'), ''),
    'montant', case when v_inv.id is null then '' else app.format_amount(v_inv.amount, v_inv.currency) end,
    'facture', coalesce(v_inv.invoice_number, ''));
end;
$$;
revoke all on function app.billing_template_vars(uuid, uuid, text) from public, anon, authenticated;

-- Notification d'abonnement : même comportement qu'avant (dédoublonnage par
-- clé, destinataires billing.read), avec le texte personnalisé s'il existe.
create or replace function app.billing_notify(p_org uuid, p_sub uuid, p_key text, p_title text, p_body text, p_link text default '/abonnement')
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tpl public.platform_message_templates;
  v_title text := p_title;
  v_body text := p_body;
  v_vars jsonb;
begin
  if p_key is not null and exists (
    select 1 from public.subscription_events e
    where e.organization_id = p_org and e.event_type = 'notification_sent' and e.metadata ->> 'key' = p_key
  ) then
    return false;
  end if;
  select * into v_tpl from public.platform_message_templates where code = app.billing_template_code(p_key, p_title);
  if v_tpl.code is not null and not v_tpl.enabled then
    return false;
  end if;
  if v_tpl.code is not null and v_tpl.title is not null then
    v_vars := app.billing_template_vars(p_org, p_sub, p_key);
    v_title := left(app.render_template(v_tpl.title, v_vars), 200);
    v_body := left(app.render_template(v_tpl.body, v_vars), 2000);
  end if;
  insert into public.notifications (organization_id, user_id, type, title, body, link, data)
  select distinct p_org, m.user_id, 'billing', v_title, v_body, p_link, jsonb_build_object('key', p_key, 'template', v_tpl.code)
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id and rp.permission_code = 'billing.read'
  where m.organization_id = p_org and m.status = 'active';
  perform app.billing_event(p_org, p_sub, 'notification_sent', jsonb_build_object('key', p_key, 'title', v_title, 'template', v_tpl.code));
  return true;
end;
$$;

-- Personnalisation d'un message (null/null = retour au texte d'origine).
create or replace function public.platform_save_message_template(p_code text, p_title text, p_body text, p_enabled boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform app.require_platform_admin();
  update public.platform_message_templates
     set title = nullif(btrim(p_title), ''), body = nullif(btrim(p_body), ''), enabled = coalesce(p_enabled, true),
         updated_by = auth.uid(), updated_at = now()
   where code = p_code;
  if not found then
    raise exception 'Message introuvable.' using errcode = 'no_data_found';
  end if;
  perform app.audit(null, 'platform.message_template_saved', 'platform_message_templates', null,
    'Message automatique « ' || p_code || ' » ' || case when nullif(btrim(p_title), '') is null then 'remis au texte d''origine' else 'personnalisé' end
      || case when coalesce(p_enabled, true) then '' else ' (désactivé)' end,
    jsonb_build_object('code', p_code, 'enabled', coalesce(p_enabled, true)));
end;
$$;
revoke all on function public.platform_save_message_template(text, text, text, boolean) from public, anon;
grant execute on function public.platform_save_message_template(text, text, text, boolean) to authenticated;
