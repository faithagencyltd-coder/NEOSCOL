-- =============================================================================
-- REBRANDING : NéoScol → NEOSCOOL (textes visibles produits par la base)
--
-- Aucun changement de logique, de tarif, de droit ni de structure :
--   * libellés de référence (permissions, description de formule et de moyen
--     de paiement) ;
--   * messages de 6 fonctions, redéfinies à l'identique hormis le nom affiché.
-- Les identifiants techniques (préfixes des QR « NEOSCOL-BADGE » /
-- « NEOSCOL-DYN », variables, clés) ne changent pas. Les données historiques
-- (documents émis, journaux) ne sont pas modifiées.
-- Retour arrière : réappliquer les définitions des migrations précédentes.
-- =============================================================================

update public.permissions set label = replace(label, 'NéoScol', 'NEOSCOOL') where code in ('billing.read', 'billing.manage') and label like '%NéoScol%';
update public.subscription_plans set description = replace(description, 'NéoScol', 'NEOSCOOL') where description like '%NéoScol%';
update public.payment_providers set description = replace(description, 'NéoScol', 'NEOSCOOL') where description like '%NéoScol%';

comment on column public.students.origin is 'native : créé dans NEOSCOOL ; import : migration d''un fichier ; manual_history : ancien élève saisi manuellement.';
comment on column public.students.legacy_matricule is 'Matricule attribué par l''ancien système de l''établissement (le matricule NEOSCOOL reste permanent).';
comment on table public.subscription_plans is
  'Formules NEOSCOOL. Les prix sont copiés sur les abonnements et les factures : les modifier n''a aucun effet rétroactif.';

-- app.billing_apply_payment(uuid, text, uuid, text)
CREATE OR REPLACE FUNCTION app.billing_apply_payment(p_tx uuid, p_method text, p_recorded_by uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_tx public.payment_transactions;
  v_inv public.subscription_invoices;
  v_sub public.subscriptions;
  v_start timestamptz;
  v_end timestamptz;
  v_prev_status text;
  v_event text;
  v_duplicate boolean := false;
  v_superseded integer;
begin
  select * into v_tx from public.payment_transactions where id = p_tx for update;
  select * into v_inv from public.subscription_invoices where id = v_tx.invoice_id for update;
  select * into v_sub from public.subscriptions where id = v_tx.subscription_id for update;
  v_prev_status := v_sub.status;

  update public.payment_transactions
     set status = 'SUCCESS', paid_at = coalesce(paid_at, now()), payment_method = coalesce(p_method, payment_method),
         confirmed_by = p_recorded_by, failure_reason = null
   where id = v_tx.id;

  -- Facture déjà réglée par une autre transaction : paiement enregistré, période NON prolongée deux fois.
  v_duplicate := v_inv.status = 'PAID';
  insert into public.subscription_payments (organization_id, subscription_id, invoice_id, transaction_id, amount, currency,
                                            provider, mode, method, reference, paid_at, recorded_by, note, duplicate_of_invoice)
  values (v_tx.organization_id, v_tx.subscription_id, v_tx.invoice_id, v_tx.id, v_tx.amount, v_tx.currency,
          v_tx.provider, v_tx.mode, coalesce(p_method, v_tx.payment_method), v_tx.internal_reference, now(), p_recorded_by, p_note, v_duplicate);
  perform app.billing_event(v_tx.organization_id, v_sub.id, 'payment_success',
    jsonb_build_object('transaction_id', v_tx.id, 'reference', v_tx.internal_reference, 'amount', v_tx.amount,
                       'provider', v_tx.provider, 'mode', v_tx.mode, 'duplicate', v_duplicate));
  if v_duplicate then
    perform app.billing_notify(v_tx.organization_id, v_sub.id, 'duplicate:' || v_tx.id, 'Paiement en double détecté',
      'La facture ' || v_inv.invoice_number || ' était déjà réglée. L''administration NEOSCOOL va régulariser ce paiement.');
    return jsonb_build_object('result', 'confirmed', 'duplicate_invoice', true, 'organization_id', v_tx.organization_id);
  end if;

  -- Début de période : fin de l'essai en cours, prolongation d'un abonnement actif identique, sinon maintenant.
  if v_sub.status = 'TRIALING' and v_sub.trial_end > now() then
    v_start := v_sub.trial_end;
  elsif v_sub.status in ('ACTIVE', 'PAST_DUE', 'GRACE_PERIOD') and v_sub.plan_id = v_inv.plan_id
        and v_sub.billing_interval = v_inv.billing_interval and v_sub.current_period_end is not null
        and v_sub.current_period_end > now() - interval '60 days' then
    v_start := v_sub.current_period_end;
  else
    v_start := now();
  end if;
  v_end := app.billing_period_end(v_start, v_inv.billing_interval);

  update public.subscription_invoices
     set status = 'PAID', paid_at = now(), payment_method = coalesce(p_method, v_tx.payment_method),
         payment_transaction_id = v_tx.id, period_start = v_start, period_end = v_end
   where id = v_inv.id;

  update public.subscriptions
     set plan_id = v_inv.plan_id, billing_interval = v_inv.billing_interval,
         monthly_price = v_inv.unit_monthly_price, annual_price = v_inv.unit_annual_price, currency = v_inv.currency,
         status = 'ACTIVE', status_changed_at = case when status <> 'ACTIVE' then now() else status_changed_at end,
         current_period_start = v_start, current_period_end = v_end, next_billing_date = v_end,
         cancel_at_period_end = false, cancelled_at = null, cancellation_reason = null, is_demo = false
   where id = v_sub.id;

  perform app.billing_event(v_tx.organization_id, v_sub.id, 'invoice_paid',
    jsonb_build_object('invoice_id', v_inv.id, 'invoice_number', v_inv.invoice_number, 'period_start', v_start, 'period_end', v_end));
  -- Autres factures en attente devenues sans objet (remplacées par ce paiement).
  with superseded as (
    update public.subscription_invoices set status = 'CANCELLED'
     where organization_id = v_tx.organization_id and status = 'PENDING' and id <> v_inv.id
    returning id, invoice_number
  )
  select count(*) into v_superseded from (
    select app.billing_event(v_tx.organization_id, v_sub.id, 'invoice_cancelled',
             jsonb_build_object('invoice_id', x.id, 'invoice_number', x.invoice_number, 'reason', 'remplacée par ' || v_inv.invoice_number))
    from superseded x
  ) y;
  if v_sub.plan_id <> v_inv.plan_id or v_sub.billing_interval <> v_inv.billing_interval then
    perform app.billing_event(v_tx.organization_id, v_sub.id, 'plan_changed',
      jsonb_build_object('from_plan_id', v_sub.plan_id, 'to_plan', v_inv.plan_code, 'from_interval', v_sub.billing_interval,
                         'to_interval', v_inv.billing_interval, 'proration', false));
  end if;
  v_event := case
    when v_prev_status = 'TRIALING' then 'subscription_activated'
    when v_prev_status = 'ACTIVE' then 'subscription_renewed'
    else 'subscription_reactivated' end;
  perform app.billing_event(v_tx.organization_id, v_sub.id, v_event,
    jsonb_build_object('previous_status', v_prev_status, 'period_end', v_end));
  perform app.billing_notify(v_tx.organization_id, v_sub.id, null, 'Paiement confirmé',
    'Paiement de ' || v_tx.amount || ' ' || v_tx.currency || ' reçu (' || v_tx.internal_reference || '). Abonnement actif jusqu''au '
      || to_char(v_end at time zone 'UTC', 'DD/MM/YYYY') || '.');
  if v_prev_status in ('PAST_DUE', 'GRACE_PERIOD', 'RESTRICTED', 'EXPIRED', 'CANCELLED') then
    perform app.billing_notify(v_tx.organization_id, v_sub.id, null, 'Abonnement réactivé',
      'Toutes les fonctionnalités de votre formule sont de nouveau disponibles.');
  end if;
  return jsonb_build_object('result', 'confirmed', 'organization_id', v_tx.organization_id, 'period_end', v_end, 'event', v_event);
end;
$function$;

-- app.country_connect_columns_error(jsonb, text)
CREATE OR REPLACE FUNCTION app.country_connect_columns_error(p_columns jsonb, p_direction text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
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
    return 'Un import doit permettre de retrouver l''élève : matricule NEOSCOOL, ou nom + prénom + date de naissance.';
  end if;
  return null;
end;
$function$;

-- app.require_platform_admin()
CREATE OR REPLACE FUNCTION app.require_platform_admin()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme NEOSCOOL.' using errcode = 'insufficient_privilege';
  end if;
end;
$function$;

-- public.billing_cancel(uuid, text)
CREATE OR REPLACE FUNCTION public.billing_cancel(p_org uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_sub public.subscriptions;
begin
  if not app.has_permission(p_org, 'billing.manage') then
    raise exception 'Permission requise : billing.manage' using errcode = 'insufficient_privilege';
  end if;
  select * into v_sub from public.subscriptions where organization_id = p_org for update;
  if v_sub.status in ('CANCELLED', 'EXPIRED') or v_sub.cancel_at_period_end then
    raise exception 'Abonnement déjà annulé.' using errcode = 'check_violation';
  end if;
  update public.subscriptions
     set cancel_at_period_end = true, cancelled_at = now(), cancellation_reason = left(nullif(btrim(p_reason), ''), 500)
   where id = v_sub.id;
  perform app.billing_event(p_org, v_sub.id, 'subscription_cancelled',
    jsonb_build_object('reason', left(p_reason, 500), 'access_until', app.subscription_end_at(v_sub), 'at_period_end', true));
  perform app.audit(p_org, 'billing.subscription_cancelled', 'subscriptions', v_sub.id, 'Annulation de l''abonnement NEOSCOOL demandée');
end;
$function$;

-- public.country_connect_import(uuid, uuid, jsonb, boolean, text)
CREATE OR REPLACE FUNCTION public.country_connect_import(p_org uuid, p_mapping uuid, p_rows jsonb, p_apply boolean, p_file_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- Élève : par matricule NEOSCOOL, sinon nom + prénom + date de naissance (dans CET établissement uniquement).
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
      v_status := 'warning'; v_message := 'Nom différent dans le fichier (« ' || (r ->> 'last_name') || ' ») : identité NEOSCOOL conservée.';
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
$function$;

-- public.save_message_template(uuid, uuid, text, text, text, text, uuid, text[], boolean)
CREATE OR REPLACE FUNCTION public.save_message_template(p_org uuid, p_id uuid, p_name text, p_channel text, p_subject text, p_body text, p_whatsapp_template uuid DEFAULT NULL::uuid, p_whatsapp_variables text[] DEFAULT '{}'::text[], p_active boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      raise exception 'WhatsApp : choisissez un modèle approuvé par Meta (déclaré par NEOSCOOL).' using errcode = 'check_violation';
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
$function$;
