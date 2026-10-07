-- =============================================================================
-- FeexPay : agrégateur Mobile Money (Bénin, Côte d'Ivoire, Togo, Sénégal,
-- Burkina Faso, Congo) pour les abonnements des établissements et des
-- enseignants. Réglé dans le Super Admin (clés chiffrées par le serveur).
--
-- FeexPay n'a pas de page de paiement générique : le payeur choisit réseau et
-- numéro sur une page NeoScool, le serveur envoie la demande à FeexPay et
-- enregistre ici la référence FeexPay reçue. Seules ces références (obtenues
-- par le serveur, jamais fournies par le navigateur ni par une notification)
-- sont revérifiées auprès de FeexPay avant toute confirmation.
-- Aucune donnée existante n'est modifiée.
-- =============================================================================

insert into public.payment_providers (code, name, description, supports_refund) values
  ('feexpay', 'FeexPay', 'Mobile Money au Bénin (MTN, Moov, Celtiis), en Côte d''Ivoire, au Togo, au Sénégal, au Burkina Faso et au Congo.', false)
on conflict (code) do nothing;

insert into public.payment_gateway_settings (provider, sort_order, public_label) values
  ('feexpay', 35, 'Mobile Money (FeexPay)')
on conflict (provider) do nothing;

create table public.feexpay_requests (
  id uuid primary key default gen_random_uuid(),
  internal_reference text not null check (internal_reference ~ '^NEO-\d{4}-\d{6,}$'),
  -- Une référence FeexPay ne peut servir qu'à un seul paiement NeoScool.
  feexpay_reference text not null unique check (char_length(feexpay_reference) between 6 and 120),
  network text not null check (char_length(network) <= 30),
  -- 4 derniers chiffres seulement (aucun numéro complet conservé ici).
  phone_last4 text check (phone_last4 is null or phone_last4 ~ '^\d{4}$'),
  mode text not null check (mode in ('test', 'live')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index feexpay_requests_reference on public.feexpay_requests (internal_reference, created_at desc);
comment on table public.feexpay_requests is
  'Demandes de paiement FeexPay envoyées par le serveur (référence NeoScool → référence FeexPay). Accès : serveur uniquement.';

alter table public.feexpay_requests enable row level security;
-- Aucune politique : ni anon ni authenticated n'y accèdent ; seul le serveur (service role).
revoke all on public.feexpay_requests from anon, authenticated;
grant select, insert on public.feexpay_requests to service_role;
