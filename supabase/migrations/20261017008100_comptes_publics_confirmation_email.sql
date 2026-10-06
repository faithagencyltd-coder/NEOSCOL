-- =============================================================================
-- Comptes particuliers (NeoScool Opportunities) : confirmation de l'adresse e-mail.
--  • Un compte créé quand la plateforme exige la vérification (et que l'envoi
--    d'e-mails est configuré) reste « en attente » jusqu'au clic sur le lien
--    (jeton haché, usage unique, 48 h).
--  • En attente : impossible de répondre à une annonce ou d'en publier une
--    (contrôlé en base par des déclencheurs). Consulter reste possible.
--  • Comptes existants : considérés comme confirmés (aucun changement pour eux).
-- =============================================================================

alter table public.public_accounts
  add column email_verification text not null default 'verified' check (email_verification in ('pending', 'verified')),
  add column email_verified_at timestamptz;

create table public.public_account_email_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.public_account_email_tokens enable row level security;
revoke all on public.public_account_email_tokens from anon, authenticated;
grant select, insert, update on public.public_account_email_tokens to service_role;

-- Lien reçu par e-mail (appelé par le serveur avec la clé de service).
create or replace function public.verify_public_account_email(p_token_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token public.public_account_email_tokens;
begin
  select * into v_token from public.public_account_email_tokens where token_hash = p_token_hash for update;
  if v_token.id is null or v_token.used_at is not null or v_token.expires_at < now() then
    return jsonb_build_object('ok', false);
  end if;
  update public.public_account_email_tokens set used_at = now() where id = v_token.id;
  update public.public_accounts set email_verification = 'verified', email_verified_at = now() where user_id = v_token.user_id;
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, summary, metadata)
  values (v_token.user_id, 'auth.public_email_verified', 'public_accounts', v_token.user_id, 'Adresse e-mail confirmée (compte particulier)', jsonb_build_object('source', 'app'));
  return jsonb_build_object('ok', true);
end;
$$;
revoke execute on function public.verify_public_account_email(text) from public, anon, authenticated;
grant execute on function public.verify_public_account_email(text) to service_role;

-- Compte particulier dont l'adresse n'est pas encore confirmée.
create or replace function app.public_account_pending(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.public_accounts where user_id = p_user and email_verification = 'pending');
$$;

create or replace function app.require_confirmed_email_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if app.public_account_pending(new.applicant_id) then
    raise exception 'Confirmez d''abord votre adresse e-mail (lien envoyé à l''inscription).' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger opportunity_applications_confirmed_email
  before insert on public.opportunity_applications
  for each row execute function app.require_confirmed_email_application();

create or replace function app.require_confirmed_email_opportunity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.organization_id is null and new.status in ('pending', 'published') and app.public_account_pending(new.author_id) then
    raise exception 'Confirmez d''abord votre adresse e-mail (lien envoyé à l''inscription).' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
create trigger opportunities_confirmed_email
  before insert or update of status on public.opportunities
  for each row execute function app.require_confirmed_email_opportunity();

-- Espace personnel : état de confirmation de l'adresse.
create or replace function public.my_public_account_email_state()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select email_verification from public.public_accounts where user_id = auth.uid();
$$;
revoke execute on function public.my_public_account_email_state() from public, anon;
grant execute on function public.my_public_account_email_state() to authenticated;
