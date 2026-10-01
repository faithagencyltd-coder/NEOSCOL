-- =============================================================================
-- PAIEMENTS EN LIGNE DES FAMILLES — compléments
--
-- 1. La famille reçoit « Paiement reçu avec succès. » pour un paiement en ligne
--    confirmé (même notification qu'au guichet sinon ; même logique de levée
--    des restrictions du portail). Les notifications de l'application
--    alimentent déjà la file des notifications push.
-- 2. Montants des messages au format de l'application (« 150 000 FCFA »,
--    séparateur de milliers indépendant de la langue du serveur).
-- 3. Agrégateur ajouté par NeoScool (custom_…) utilisé par un établissement :
--    test de connexion réussi obligatoire avant activation (comme « custom »).
-- Aucune donnée existante n'est modifiée.
-- =============================================================================

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
  v_online boolean;
begin
  select currency into v_currency from public.organizations where id = new.organization_id;
  v_restored := app.student_portal_restricted(new.student_id, new.id) and not app.student_portal_restricted(new.student_id);
  v_online := coalesce(new.notes, '') like 'Paiement en ligne NEO-%';
  for v_user in select * from app.family_user_ids(new.student_id) loop
    perform app.notify(new.organization_id, v_user, 'payment.received',
      case when v_online then 'Paiement reçu avec succès.' else 'Paiement enregistré' end,
      'Reçu ' || new.number || ' — ' || app.format_amount(new.amount, v_currency) || '. Reste dû : '
        || app.format_amount(coalesce(new.balance_after, 0), v_currency) || '.',
      '/portail/finances', jsonb_build_object('payment_id', new.id, 'student_id', new.student_id, 'online', v_online));
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

create or replace function public.org_set_payment_provider_state(p_provider uuid, p_active boolean, p_default boolean, p_priority integer)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row public.org_payment_providers;
begin
  select * into v_row from public.org_payment_providers where id = p_provider for update;
  if v_row.id is null or not app.has_permission(v_row.organization_id, 'finance.online.manage') then
    raise exception 'Fournisseur introuvable.' using errcode = 'insufficient_privilege';
  end if;
  if v_row.archived_at is not null and p_active then
    raise exception 'Ce fournisseur est archivé.' using errcode = 'check_violation';
  end if;
  if p_active and v_row.adapter not in ('mock') and v_row.secret_ciphertext is null then
    raise exception 'Renseignez les clés de ce fournisseur avant de l''activer.' using errcode = 'check_violation';
  end if;
  if p_active and (v_row.adapter = 'custom' or v_row.adapter like 'custom\_%') and not coalesce(v_row.last_test_ok, false) then
    raise exception 'Testez d''abord la connexion (fournisseur personnalisé : test réussi obligatoire).' using errcode = 'check_violation';
  end if;
  if p_default and not p_active then
    raise exception 'Seul un fournisseur actif peut être le fournisseur par défaut.' using errcode = 'check_violation';
  end if;
  if p_default then
    update public.org_payment_providers set is_default = false where organization_id = v_row.organization_id and is_default and id <> p_provider;
  end if;
  update public.org_payment_providers
     set is_active = p_active, is_default = p_default, priority = coalesce(p_priority, priority), updated_by = auth.uid(), updated_at = now()
   where id = p_provider;
  perform app.fee_event(v_row.organization_id, null, p_provider, case when p_active then 'provider_enabled' else 'provider_disabled' end,
    v_row.label || case when p_active then ' activé' else ' désactivé' end || case when p_default then ' (par défaut)' else '' end,
    jsonb_build_object('active', p_active, 'default', p_default, 'priority', p_priority));
  perform app.audit(v_row.organization_id, 'finance.online_provider_state', 'org_payment_providers', p_provider,
    'Fournisseur ' || v_row.label || case when p_active then ' activé' else ' désactivé' end, jsonb_build_object('active', p_active, 'default', p_default), 'success');
end;
$$;

create or replace function app.fee_amount_text(p_amount numeric, p_currency text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(to_char(coalesce(p_amount, 0), case when coalesce(p_amount, 0) = trunc(coalesce(p_amount, 0)) then 'FM999G999G999G990' else 'FM999G999G999G990D00' end), ',', ' '), '.', ',')
         || ' ' || case when p_currency in ('XOF', 'XAF') then 'FCFA' else coalesce(p_currency, '') end;
$$;
