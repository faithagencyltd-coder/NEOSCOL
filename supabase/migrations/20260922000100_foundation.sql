-- =============================================================================
-- NéoScol — 0100 Fondations
-- Extensions, schéma privé `app` (fonctions de sécurité et utilitaires),
-- fonctions génériques (horodatage, normalisation pour la recherche, codes).
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists btree_gist with schema extensions;

-- Le schéma `app` n'est PAS exposé par l'API (PostgREST n'expose que `public`).
-- Il contient les fonctions utilisées par les politiques RLS et les triggers.
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated, anon, service_role;

alter default privileges in schema app revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- Horodatage automatique de updated_at
-- -----------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Normalisation de texte pour la recherche (minuscules, sans accents).
-- IMMUTABLE pour pouvoir être utilisée dans des colonnes générées et des index.
-- -----------------------------------------------------------------------------
create or replace function app.unaccent(p_value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_value);
$$;

create or replace function app.search_normalize(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(app.unaccent(coalesce(p_value, '')));
$$;

-- -----------------------------------------------------------------------------
-- Code aléatoire non ambigu (sans 0/O, 1/I) : 26 caractères ≈ 130 bits.
-- Utilisé pour les codes de vérification des documents.
-- -----------------------------------------------------------------------------
create or replace function app.random_code(p_length integer default 26)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 symboles
  bytes bytea := extensions.gen_random_bytes(p_length);
  result text := '';
  i integer;
begin
  for i in 0 .. p_length - 1 loop
    -- 256 est divisible par 32 : pas de biais.
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

grant execute on function app.touch_updated_at() to authenticated, service_role;
grant execute on function app.unaccent(text) to authenticated, anon, service_role;
grant execute on function app.search_normalize(text) to authenticated, anon, service_role;
grant execute on function app.random_code(integer) to authenticated, service_role;
