-- =============================================================================
-- Super Admin — SA-4 : supervision technique, consommation des ressources,
-- état centralisé des intégrations. Uniquement des mesures réelles prises dans
-- la base ; ce qui ne peut pas être mesuré ici (disponibilité vue de
-- l'extérieur) passe par la sonde publique /api/sante et un service externe.
-- Aucune clé, aucun secret n'est renvoyé.
-- =============================================================================

-- Sonde de disponibilité : répond seulement « la base répond », rien d'autre.
create or replace function public.health_ping()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select now();
$$;
grant execute on function public.health_ping() to anon, authenticated;

create or replace function public.platform_service_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'database', jsonb_build_object(
        'size_bytes', pg_database_size(current_database()),
        'connections', (select count(*) from pg_stat_activity where datname = current_database()),
        'max_connections', current_setting('max_connections')::int,
        'started_at', pg_postmaster_start_time(),
        'version', split_part(version(), ' ', 2)),
    'storage', jsonb_build_object(
        'files', (select count(*) from public.file_objects),
        'bytes', (select coalesce(sum(size_bytes), 0) from public.file_objects),
        'by_bucket', coalesce((select jsonb_agg(x order by x.bytes desc) from (
            select bucket, count(*) as files, coalesce(sum(size_bytes), 0) as bytes from public.file_objects group by bucket) x), '[]'::jsonb),
        'top_organizations', coalesce((select jsonb_agg(x order by x.bytes desc) from (
            select o.name, count(f.id) as files, coalesce(sum(f.size_bytes), 0) as bytes
              from public.file_objects f join public.organizations o on o.id = f.organization_id
             group by o.name order by 3 desc limit 5) x), '[]'::jsonb)),
    'volumes', coalesce((select jsonb_object_agg(c.relname, greatest(c.reltuples, 0)::bigint)
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
         and c.relname in ('students', 'staff_members', 'audit_logs', 'file_objects', 'messages', 'notifications', 'invoices', 'payments', 'grades', 'attendance_records')), '{}'::jsonb),
    'integrations', coalesce((select jsonb_agg(jsonb_build_object('provider', i.provider, 'enabled', i.enabled,
        'last_test_at', i.last_test_at, 'last_test_ok', i.last_test_ok, 'last_test_message', i.last_test_message) order by i.provider)
        from public.platform_integrations i), '[]'::jsonb),
    'gateways', coalesce((select jsonb_agg(jsonb_build_object('provider', g.provider, 'enabled', g.checkout_enabled, 'mode', g.mode,
        'last_test_at', g.last_test_at, 'last_test_ok', g.last_test_ok) order by g.sort_order)
        from public.payment_gateway_settings g), '[]'::jsonb),
    'school_providers', (select jsonb_build_object(
        'active', count(*) filter (where p.is_active),
        'failing', count(*) filter (where p.is_active and p.last_test_ok is false),
        'untested', count(*) filter (where p.is_active and p.last_test_at is null))
      from public.org_payment_providers p where p.archived_at is null),
    'webhooks', jsonb_build_object(
        'subscriptions', (select jsonb_build_object(
            'processed_24h', count(*) filter (where w.processing_status = 'processed' and w.received_at > now() - interval '24 hours'),
            'rejected_24h', count(*) filter (where w.processing_status = 'rejected' and w.received_at > now() - interval '24 hours'),
            'duplicate_24h', count(*) filter (where w.processing_status = 'duplicate' and w.received_at > now() - interval '24 hours'),
            'last_received', max(w.received_at),
            'last_error', (select left(x.error, 200) from public.payment_webhooks x where x.error is not null order by x.received_at desc limit 1))
          from public.payment_webhooks w),
        'families', (select jsonb_build_object(
            'processed_24h', count(*) filter (where w.processing_status = 'processed' and w.received_at > now() - interval '24 hours'),
            'rejected_24h', count(*) filter (where w.processing_status = 'rejected' and w.received_at > now() - interval '24 hours'),
            'duplicate_24h', count(*) filter (where w.processing_status = 'duplicate' and w.received_at > now() - interval '24 hours'),
            'last_received', max(w.received_at),
            'last_error', (select left(x.error, 200) from public.fee_payment_webhooks x where x.error is not null order by x.received_at desc limit 1))
          from public.fee_payment_webhooks w)),
    'deliveries', jsonb_build_object(
        'notifications', coalesce((select jsonb_object_agg(x.status, x.n) from (
            select d.status, count(*) as n from public.notification_deliveries d where d.created_at > now() - interval '24 hours' group by d.status) x), '{}'::jsonb),
        'notifications_last_error', (select left(d.last_error, 200) from public.notification_deliveries d where d.last_error is not null order by d.created_at desc limit 1),
        'messages', coalesce((select jsonb_object_agg(x.status, x.n) from (
            select d.status, count(*) as n from public.message_deliveries d where d.created_at > now() - interval '24 hours' group by d.status) x), '{}'::jsonb),
        'messages_last_error', (select left(d.error, 200) from public.message_deliveries d where d.error is not null order by d.created_at desc limit 1)),
    'sync', (select jsonb_build_object(
        'jobs_7d', count(*),
        'failed_7d', count(*) filter (where j.status in ('failed', 'error')),
        'with_errors_7d', count(*) filter (where j.error_rows > 0))
      from public.country_connect_jobs j where j.created_at > now() - interval '7 days'),
    'errors', jsonb_build_object(
        'failures_24h', (select count(*) from public.audit_logs a where a.result = 'failure' and a.created_at > now() - interval '24 hours'),
        'denied_24h', (select count(*) from public.audit_logs a where a.result = 'denied' and a.created_at > now() - interval '24 hours'),
        'top_7d', coalesce((select jsonb_agg(x order by x.n desc) from (
            select a.action, count(*) as n, max(a.created_at) as last from public.audit_logs a
             where a.result <> 'success' and a.created_at > now() - interval '7 days'
             group by a.action order by 2 desc limit 8) x), '[]'::jsonb)),
    'sms_low_balance', (select count(*) from public.sms_wallets w where w.balance < 10),
    'measured_at', now()
  );
end;
$$;

revoke all on function public.platform_service_health() from public, anon;
grant execute on function public.platform_service_health() to authenticated;
