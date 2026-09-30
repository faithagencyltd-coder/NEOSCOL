-- =============================================================================
-- Notifications push (Web Push, norme VAPID) : chaque utilisateur active les
-- notifications sur ses appareils ; ses notifications in-app lui arrivent
-- alors aussi en push. Clés VAPID réglées par le Super Admin (intégration
-- « web_push », clé privée chiffrée côté serveur). Envoi réel par le serveur
-- (route planifiée), jamais simulé. Aucune donnée n'est supprimée.
-- =============================================================================

alter table public.platform_integrations drop constraint platform_integrations_provider_check;
alter table public.platform_integrations add constraint platform_integrations_provider_check
  check (provider in ('brevo_email', 'brevo_sms', 'twilio_sms', 'whatsapp_meta', 'turnstile', 'anthropic', 'web_push'));
insert into public.platform_integrations (provider) values ('web_push') on conflict do nothing;

-- Appareils abonnés (un point de terminaison par navigateur / téléphone).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
  auth text not null check (auth ~ '^[A-Za-z0-9_-]{16,40}$'),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz,
  failure_count integer not null default 0
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_own_read on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy push_subscriptions_own_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Réservation d'un envoi par le serveur (évite qu'un envoi parte deux fois).
alter table public.notification_deliveries add column claimed_at timestamptz;

-- Clé publique VAPID (nécessaire au navigateur pour s'abonner) : seulement si
-- l'intégration est active et configurée.
create or replace function public.push_public_key()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select config ->> 'public_key' from public.platform_integrations
   where provider = 'web_push' and enabled and secret_ciphertext is not null;
$$;
revoke all on function public.push_public_key() from public, anon;
grant execute on function public.push_public_key() to authenticated;

create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connexion requise.' using errcode = 'insufficient_privilege';
  end if;
  if public.push_public_key() is null then
    raise exception 'Les notifications push ne sont pas activées sur la plateforme.' using errcode = 'feature_not_supported';
  end if;
  -- Un appareil appartient au dernier compte qui s'y est abonné (appareil partagé).
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, failure_count = 0
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.register_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text) to authenticated;

-- Toute notification d'un utilisateur ayant au moins un appareil abonné part
-- aussi en push (en plus des canaux choisis dans ses préférences).
create or replace function app.queue_push_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    insert into public.notification_deliveries (organization_id, notification_id, channel, status)
    values (new.organization_id, new.id, 'push', 'pending');
  end if;
  return new;
end;
$$;
create trigger notifications_queue_push after insert on public.notifications
  for each row execute function app.queue_push_delivery();

-- Un seul envoi push par notification (préférence + appareil abonné).
create or replace function app.dedupe_push_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.channel = 'push' and exists (
    select 1 from public.notification_deliveries where notification_id = new.notification_id and channel = 'push'
  ) then
    return null;
  end if;
  return new;
end;
$$;
create trigger notification_deliveries_dedupe_push before insert on public.notification_deliveries
  for each row execute function app.dedupe_push_delivery();

-- Réservation d'un lot d'envois push (serveur uniquement). Au plus 3 tentatives,
-- envois de moins de 24 h ; au-delà, ils sont marqués « skipped ».
create or replace function public.claim_push_deliveries(p_limit integer default 50)
returns table (delivery_id uuid, user_id uuid, title text, body text, link text, organization_name text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_deliveries d
     set status = 'skipped', last_error = 'Expiré sans envoi'
   where d.channel = 'push' and d.status = 'pending' and (d.created_at < now() - interval '24 hours' or d.attempts >= 3);

  return query
  with picked as (
    select d.id from public.notification_deliveries d
     where d.channel = 'push' and d.status = 'pending'
       and (d.claimed_at is null or d.claimed_at < now() - interval '5 minutes')
     order by d.created_at
     limit least(greatest(coalesce(p_limit, 50), 1), 500)
     for update skip locked
  ), claimed as (
    update public.notification_deliveries d
       set claimed_at = now(), attempts = d.attempts + 1
      from picked where d.id = picked.id
    returning d.id, d.notification_id, d.organization_id
  )
  select c.id, n.user_id, n.title, n.body, n.link, o.name
    from claimed c
    join public.notifications n on n.id = c.notification_id
    join public.organizations o on o.id = c.organization_id;
end;
$$;
revoke all on function public.claim_push_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_push_deliveries(integer) to service_role;
revoke all on function app.queue_push_delivery() from public, anon, authenticated;
revoke all on function app.dedupe_push_delivery() from public, anon, authenticated;
