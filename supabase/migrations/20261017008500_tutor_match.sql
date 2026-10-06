-- =============================================================================
-- NEOSCOOL Tutor Match : service facultatif de mise en relation entre familles
-- et tuteurs / répétiteurs.
--
-- Principes :
--  • fermé par défaut : nouveau module public « tutor_match » du Contrôle des
--    modules (ouverture globale, par pays, par type ou par établissement, période
--    pilote) ; chaque établissement peut le désactiver pour ses familles ;
--  • comptes existants réutilisés (un tuteur = un profil, une famille = un profil) ;
--  • AUCUNE donnée scolaire transmise au tuteur : une demande ne contient que ce
--    que le parent écrit lui-même ; jamais de lien vers la fiche de l'élève ;
--  • coordonnées jamais publiques : échangées seulement après acceptation
--    (tuteur → parent) et confirmation (parent → tuteur) ;
--  • qualifications « déclarées » tant que la plateforme ne les a pas vérifiées ;
--  • suggestions de soutien : règle explicable et réglable (moyenne d'une matière
--    sous un seuil sur plusieurs bulletins publiés consécutifs), désactivée par
--    défaut, facultative, le parent peut la refuser ;
--  • signalement (content_reports), blocage par le parent, journal.
-- =============================================================================

-- Nouveau module public, fermé tant qu'aucune règle ne l'ouvre (Contrôle des modules).
create or replace function app.public_module_keys()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['discover', 'promotion', 'media_kit', 'leads', 'opportunities', 'external_ads', 'tutor_match'];
$$;

create table public.tutor_settings (
  id smallint primary key default 1 check (id = 1),
  independent_tutors boolean not null default true,
  school_teachers boolean not null default true,
  require_verification boolean not null default true,
  forbid_own_school boolean not null default true,
  suggestions_enabled boolean not null default false,
  suggestion_threshold numeric(5, 2) not null default 10 check (suggestion_threshold > 0 and suggestion_threshold <= 100),
  suggestion_periods integer not null default 2 check (suggestion_periods between 1 and 6),
  suggestion_cooldown_days integer not null default 90 check (suggestion_cooldown_days between 7 and 365),
  max_open_requests integer not null default 10 check (max_open_requests between 1 and 100),
  terms text check (terms is null or char_length(terms) <= 6000),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);
insert into public.tutor_settings (id) values (1);

create table public.tutor_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'suspended', 'rejected', 'hidden')),
  kind text not null check (kind in ('independent', 'school_teacher')),
  headline text not null check (char_length(btrim(headline)) between 5 and 120),
  bio text check (bio is null or char_length(bio) <= 2000),
  subjects text[] not null check (cardinality(subjects) between 1 and 12),
  levels text[] not null check (cardinality(levels) between 1 and 12),
  country text not null references public.countries (code),
  city text not null check (char_length(btrim(city)) between 2 and 80),
  zones text[] not null default '{}' check (cardinality(zones) <= 12),
  modes text[] not null check (cardinality(modes) >= 1 and modes <@ array['home', 'online', 'center']),
  languages text[] not null default array['fr'] check (cardinality(languages) between 1 and 8),
  rate_amount integer check (rate_amount is null or rate_amount between 0 and 10000000),
  rate_unit text not null default 'hour' check (rate_unit in ('hour', 'session', 'month')),
  currency text not null default 'XOF' check (currency ~ '^[A-Z]{3}$'),
  availability text check (availability is null or char_length(availability) <= 300),
  experience_years integer check (experience_years is null or experience_years between 0 and 60),
  qualifications text check (qualifications is null or char_length(qualifications) <= 1000),
  references_text text check (references_text is null or char_length(references_text) <= 500),
  verification text not null default 'unverified' check (verification in ('unverified', 'requested', 'verified', 'rejected')),
  verification_note text check (verification_note is null or char_length(verification_note) <= 500),
  verified_at timestamptz,
  verified_by uuid references public.profiles (id) on delete set null,
  review_note text check (review_note is null or char_length(review_note) <= 500),
  terms_accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tutor_profiles_search_idx on public.tutor_profiles (country, status);

create table public.tutor_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles (id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles (user_id) on delete cascade,
  child_label text check (child_label is null or char_length(child_label) <= 60),
  level text not null check (char_length(btrim(level)) between 1 and 80),
  subject text not null check (char_length(btrim(subject)) between 1 and 80),
  mode text not null check (mode in ('home', 'online', 'center')),
  preferred_schedule text check (preferred_schedule is null or char_length(preferred_schedule) <= 300),
  message text not null check (char_length(btrim(message)) between 10 and 2000),
  status text not null default 'sent' check (status in ('sent', 'accepted', 'declined', 'proposed', 'confirmed', 'cancelled', 'closed')),
  proposed_schedule text check (proposed_schedule is null or char_length(proposed_schedule) <= 300),
  tutor_note text check (tutor_note is null or char_length(tutor_note) <= 1000),
  closed_reason text check (closed_reason is null or char_length(closed_reason) <= 300),
  source text not null default 'search' check (source in ('search', 'suggestion')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id <> tutor_id)
);
create index tutor_requests_parent_idx on public.tutor_requests (parent_id, created_at desc);
create index tutor_requests_tutor_idx on public.tutor_requests (tutor_id, created_at desc);

create table public.tutor_request_messages (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tutor_requests (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index tutor_request_messages_idx on public.tutor_request_messages (request_id, created_at);

create table public.tutor_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tutor_requests (id) on delete cascade,
  starts_at timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 480),
  mode text not null check (mode in ('home', 'online', 'center')),
  note text check (note is null or char_length(note) <= 300),
  status text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index tutor_sessions_request_idx on public.tutor_sessions (request_id, starts_at);

create table public.tutor_blocks (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  tutor_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, tutor_id)
);

create table public.tutor_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  child_first_name text,
  subject text not null,
  rule jsonb not null default '{}'::jsonb,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);
create index tutor_suggestions_user_idx on public.tutor_suggestions (user_id, created_at desc);
create index tutor_suggestions_dedupe_idx on public.tutor_suggestions (student_id, subject, created_at desc);

create table public.tutor_suggestion_optouts (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Signalement d'un tuteur : réutilise les signalements de l'écosystème.
alter table public.content_reports drop constraint content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check check (target_type in ('profile', 'campaign', 'opportunity', 'tutor'));

-- -----------------------------------------------------------------------------
-- Droits : chacun voit ses propres données ; la plateforme voit tout (modération).
-- Toutes les écritures passent par les fonctions ci-dessous.
-- -----------------------------------------------------------------------------
alter table public.tutor_settings enable row level security;
alter table public.tutor_profiles enable row level security;
alter table public.tutor_requests enable row level security;
alter table public.tutor_request_messages enable row level security;
alter table public.tutor_sessions enable row level security;
alter table public.tutor_blocks enable row level security;
alter table public.tutor_suggestions enable row level security;
alter table public.tutor_suggestion_optouts enable row level security;

create policy tutor_settings_select on public.tutor_settings for select to anon, authenticated using (true);
create policy tutor_profiles_select on public.tutor_profiles for select to authenticated using (user_id = auth.uid() or app.is_platform_admin());
create policy tutor_requests_select on public.tutor_requests for select to authenticated
  using (parent_id = auth.uid() or tutor_id = auth.uid() or app.is_platform_admin());
create policy tutor_request_messages_select on public.tutor_request_messages for select to authenticated
  using (exists (select 1 from public.tutor_requests r where r.id = request_id and (r.parent_id = auth.uid() or r.tutor_id = auth.uid())));
create policy tutor_sessions_select on public.tutor_sessions for select to authenticated
  using (exists (select 1 from public.tutor_requests r where r.id = request_id and (r.parent_id = auth.uid() or r.tutor_id = auth.uid() or app.is_platform_admin())));
create policy tutor_blocks_select on public.tutor_blocks for select to authenticated using (parent_id = auth.uid());
create policy tutor_suggestions_select on public.tutor_suggestions for select to authenticated using (user_id = auth.uid());
create policy tutor_suggestion_optouts_select on public.tutor_suggestion_optouts for select to authenticated using (user_id = auth.uid());

grant select on public.tutor_settings to anon, authenticated;
grant select on public.tutor_profiles, public.tutor_requests, public.tutor_request_messages, public.tutor_sessions,
  public.tutor_blocks, public.tutor_suggestions, public.tutor_suggestion_optouts to authenticated;
revoke insert, update, delete on public.tutor_settings, public.tutor_profiles, public.tutor_requests, public.tutor_request_messages,
  public.tutor_sessions, public.tutor_blocks, public.tutor_suggestions, public.tutor_suggestion_optouts from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Aides
-- -----------------------------------------------------------------------------
create or replace function app.tutor_open_in_country(p_country text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.module_enabled_in_country('tutor_match', p_country);
$$;

-- Nom affiché à l'autre partie : prénom + initiale du nom (jamais l'adresse ni le téléphone).
create or replace function app.tutor_display_name(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(coalesce(p.first_name, '') || ' ' || coalesce(left(p.last_name, 1) || '.', '')), ''), 'Utilisateur')
    from public.profiles p where p.id = p_user;
$$;

-- Le compte enseigne-t-il dans un établissement ? (rôle enseignant actif)
create or replace function app.tutor_is_school_teacher(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_members s where s.user_id = p_user and s.status = 'active');
$$;

-- -----------------------------------------------------------------------------
-- Tuteur : fiche, demande de vérification, réponses
-- -----------------------------------------------------------------------------
create or replace function public.tutor_save_profile(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.tutor_settings;
  v_teacher boolean := app.tutor_is_school_teacher(auth.uid());
  v_existing public.tutor_profiles;
  v_country text := upper(coalesce(p ->> 'country', ''));
  v_subjects text[];
  v_levels text[];
  v_zones text[];
  v_modes text[];
  v_languages text[];
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour proposer vos services.' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.tutor_settings where id = 1;
  if not app.tutor_open_in_country(v_country) then
    raise exception 'NEOSCOOL Tutor Match n''est pas ouvert dans ce pays.' using errcode = 'check_violation';
  end if;
  if v_teacher and not s.school_teachers then
    raise exception 'Les enseignants d''établissement ne peuvent pas encore proposer de cours particuliers.' using errcode = 'check_violation';
  end if;
  if not v_teacher and not s.independent_tutors then
    raise exception 'Les tuteurs indépendants ne sont pas encore acceptés.' using errcode = 'check_violation';
  end if;
  if not coalesce((p ->> 'accept_terms')::boolean, false) then
    raise exception 'Acceptez les règles du service.' using errcode = 'check_violation';
  end if;
  select coalesce(array_agg(left(btrim(x), 60)), '{}') into v_subjects from jsonb_array_elements_text(coalesce(p -> 'subjects', '[]')) x where btrim(x) <> '';
  select coalesce(array_agg(left(btrim(x), 60)), '{}') into v_levels from jsonb_array_elements_text(coalesce(p -> 'levels', '[]')) x where btrim(x) <> '';
  select coalesce(array_agg(left(btrim(x), 60)), '{}') into v_zones from jsonb_array_elements_text(coalesce(p -> 'zones', '[]')) x where btrim(x) <> '';
  select coalesce(array_agg(x), '{}') into v_modes from jsonb_array_elements_text(coalesce(p -> 'modes', '[]')) x where x in ('home', 'online', 'center');
  select coalesce(array_agg(left(lower(btrim(x)), 20)), '{}') into v_languages from jsonb_array_elements_text(coalesce(p -> 'languages', '["fr"]')) x where btrim(x) <> '';
  select * into v_existing from public.tutor_profiles where user_id = auth.uid();
  if found and v_existing.status in ('suspended', 'rejected') then
    raise exception 'Votre fiche a été suspendue ou refusée par l''équipe NeoScool.' using errcode = 'insufficient_privilege';
  end if;
  insert into public.tutor_profiles as t (user_id, status, kind, headline, bio, subjects, levels, country, city, zones, modes, languages,
                                          rate_amount, rate_unit, currency, availability, experience_years, qualifications, references_text)
  values (auth.uid(), 'pending', case when v_teacher then 'school_teacher' else 'independent' end, btrim(p ->> 'headline'), nullif(btrim(p ->> 'bio'), ''),
          v_subjects, v_levels, v_country, btrim(p ->> 'city'), v_zones, v_modes, case when cardinality(v_languages) = 0 then array['fr'] else v_languages end,
          (nullif(p ->> 'rate_amount', ''))::integer, coalesce(nullif(p ->> 'rate_unit', ''), 'hour'),
          coalesce((select default_currency from public.countries where code = v_country), 'XOF'),
          nullif(btrim(p ->> 'availability'), ''), (nullif(p ->> 'experience_years', ''))::integer,
          nullif(btrim(p ->> 'qualifications'), ''), nullif(btrim(p ->> 'references'), ''))
  on conflict (user_id) do update set
    kind = excluded.kind, headline = excluded.headline, bio = excluded.bio, subjects = excluded.subjects, levels = excluded.levels,
    country = excluded.country, city = excluded.city, zones = excluded.zones, modes = excluded.modes, languages = excluded.languages,
    rate_amount = excluded.rate_amount, rate_unit = excluded.rate_unit, currency = excluded.currency, availability = excluded.availability,
    experience_years = excluded.experience_years, references_text = excluded.references_text,
    -- Qualifications modifiées après vérification : redeviennent « déclarées ».
    verification = case when t.qualifications is distinct from excluded.qualifications and t.verification = 'verified' then 'unverified' else t.verification end,
    qualifications = excluded.qualifications,
    status = case when t.status = 'hidden' then 'hidden' else t.status end,
    updated_at = now();
  perform app.audit(null, 'tutor.profile_saved', 'tutor_profiles', auth.uid(), 'Fiche tuteur enregistrée', jsonb_build_object('country', v_country));
end;
$$;

create or replace function public.tutor_set_visibility(p_visible boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.tutor_profiles
     set status = case when p_visible then 'approved' else 'hidden' end, updated_at = now()
   where user_id = auth.uid() and status in ('approved', 'hidden');
  if not found then
    raise exception 'Fiche non approuvée.' using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.tutor_request_verification(p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.tutor_profiles
     set verification = 'requested', verification_note = left(nullif(btrim(p_note), ''), 500), updated_at = now()
   where user_id = auth.uid() and verification in ('unverified', 'rejected');
  if not found then
    raise exception 'Vérification déjà demandée ou obtenue.' using errcode = 'check_violation';
  end if;
  perform app.audit(null, 'tutor.verification_requested', 'tutor_profiles', auth.uid(), 'Vérification du profil demandée', '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- Recherche (familles) : tuteurs approuvés (et vérifiés si exigé), sans coordonnées.
-- -----------------------------------------------------------------------------
create or replace function public.tutor_search(p_country text, p_subject text default null, p_level text default null, p_city text default null,
                                               p_mode text default null, p_language text default null, p_max_rate integer default null)
returns table (
  user_id uuid, name text, kind text, headline text, bio text, subjects text[], levels text[], city text, zones text[], modes text[],
  languages text[], rate_amount integer, rate_unit text, currency text, availability text, experience_years integer,
  qualifications text, verification text, verified_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.tutor_settings;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour rechercher un tuteur.' using errcode = 'insufficient_privilege';
  end if;
  if not app.tutor_open_in_country(upper(coalesce(p_country, ''))) then
    return;
  end if;
  select * into s from public.tutor_settings where id = 1;
  return query
    select t.user_id, app.tutor_display_name(t.user_id), t.kind, t.headline, t.bio, t.subjects, t.levels, t.city, t.zones, t.modes,
           t.languages, t.rate_amount, t.rate_unit, t.currency, t.availability, t.experience_years, t.qualifications, t.verification, t.verified_at
      from public.tutor_profiles t
     where t.country = upper(p_country) and t.status = 'approved' and t.user_id <> auth.uid()
       and (not s.require_verification or t.verification = 'verified')
       and (s.independent_tutors or t.kind <> 'independent')
       and (s.school_teachers or t.kind <> 'school_teacher')
       and not exists (select 1 from public.tutor_blocks b where b.parent_id = auth.uid() and b.tutor_id = t.user_id)
       and (coalesce(btrim(p_subject), '') = '' or exists (select 1 from unnest(t.subjects) x where app.search_normalize(x) like '%' || app.search_normalize(p_subject) || '%'))
       and (coalesce(btrim(p_level), '') = '' or exists (select 1 from unnest(t.levels) x where app.search_normalize(x) like '%' || app.search_normalize(p_level) || '%'))
       and (coalesce(btrim(p_city), '') = '' or app.search_normalize(t.city) like '%' || app.search_normalize(p_city) || '%'
            or exists (select 1 from unnest(t.zones) x where app.search_normalize(x) like '%' || app.search_normalize(p_city) || '%'))
       and (coalesce(p_mode, '') = '' or p_mode = any (t.modes))
       and (coalesce(p_language, '') = '' or lower(p_language) = any (t.languages))
       and (p_max_rate is null or t.rate_amount is null or t.rate_amount <= p_max_rate)
     order by (t.verification = 'verified') desc, t.updated_at desc
     limit 60;
end;
$$;

-- -----------------------------------------------------------------------------
-- Demandes, réponses, messages, séances
-- -----------------------------------------------------------------------------
create or replace function public.tutor_request_create(p_tutor uuid, p_child_label text, p_level text, p_subject text, p_mode text,
                                                       p_schedule text, p_message text, p_source text default 'search')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.tutor_settings;
  t public.tutor_profiles;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Connectez-vous pour contacter un tuteur.' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.tutor_settings where id = 1;
  select * into t from public.tutor_profiles where user_id = p_tutor;
  if not found or t.status <> 'approved' or (s.require_verification and t.verification <> 'verified') or not app.tutor_open_in_country(t.country) then
    raise exception 'Ce tuteur n''est pas disponible.' using errcode = 'check_violation';
  end if;
  if p_tutor = auth.uid() then
    raise exception 'Vous ne pouvez pas vous contacter vous-même.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.tutor_blocks where parent_id = auth.uid() and tutor_id = p_tutor) then
    raise exception 'Vous avez bloqué ce tuteur.' using errcode = 'check_violation';
  end if;
  if not (p_mode = any (t.modes)) then
    raise exception 'Ce tuteur ne propose pas ce mode de cours.' using errcode = 'check_violation';
  end if;
  -- Un enseignant ne propose pas de cours payants aux familles de son propre établissement.
  if s.forbid_own_school and exists (
    select 1 from public.staff_members sm
      join public.guardians g on g.organization_id = sm.organization_id and g.user_id = auth.uid() and g.archived_at is null
     where sm.user_id = p_tutor and sm.status = 'active'
  ) then
    raise exception 'Ce tuteur enseigne dans l''établissement de votre enfant : choisissez un autre tuteur.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.tutor_requests where parent_id = auth.uid() and status in ('sent', 'accepted', 'proposed', 'confirmed')) >= s.max_open_requests then
    raise exception 'Trop de demandes en cours : clôturez-en avant d''en envoyer d''autres.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.tutor_requests where parent_id = auth.uid() and tutor_id = p_tutor and status in ('sent', 'accepted', 'proposed', 'confirmed')) then
    raise exception 'Une demande est déjà en cours avec ce tuteur.' using errcode = 'unique_violation';
  end if;
  insert into public.tutor_requests (parent_id, tutor_id, child_label, level, subject, mode, preferred_schedule, message, source)
  values (auth.uid(), p_tutor, nullif(left(btrim(p_child_label), 60), ''), btrim(p_level), btrim(p_subject), p_mode,
          nullif(btrim(p_schedule), ''), btrim(p_message), case when p_source = 'suggestion' then 'suggestion' else 'search' end)
  returning id into v_id;
  perform app.audit(null, 'tutor.request', 'tutor_requests', v_id, 'Demande de cours envoyée à un tuteur', jsonb_build_object('subject', p_subject));
  return v_id;
end;
$$;

create or replace function public.tutor_request_respond(p_id uuid, p_action text, p_note text, p_schedule text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.tutor_requests;
begin
  select * into r from public.tutor_requests where id = p_id and tutor_id = auth.uid() for update;
  if not found then raise exception 'Demande introuvable.' using errcode = 'no_data_found'; end if;
  if r.status not in ('sent', 'proposed', 'accepted') then
    raise exception 'Cette demande n''attend plus de réponse.' using errcode = 'check_violation';
  end if;
  if p_action = 'propose' and coalesce(btrim(p_schedule), '') = '' then
    raise exception 'Indiquez la disponibilité proposée.' using errcode = 'check_violation';
  end if;
  update public.tutor_requests
     set status = case p_action when 'accept' then 'accepted' when 'decline' then 'declined' when 'propose' then 'proposed' end,
         tutor_note = coalesce(nullif(left(btrim(p_note), 1000), ''), tutor_note),
         proposed_schedule = case when p_action = 'propose' then left(btrim(p_schedule), 300) else proposed_schedule end,
         updated_at = now()
   where id = p_id;
  if p_action not in ('accept', 'decline', 'propose') then raise exception 'Action inconnue.' using errcode = 'check_violation'; end if;
  perform app.audit(null, 'tutor.request_' || p_action, 'tutor_requests', p_id, 'Réponse du tuteur : ' || p_action, '{}'::jsonb);
end;
$$;

create or replace function public.tutor_request_parent_action(p_id uuid, p_action text, p_reason text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.tutor_requests;
begin
  select * into r from public.tutor_requests where id = p_id and parent_id = auth.uid() for update;
  if not found then raise exception 'Demande introuvable.' using errcode = 'no_data_found'; end if;
  if p_action = 'confirm' and r.status not in ('accepted', 'proposed') then
    raise exception 'Le tuteur doit d''abord accepter ou proposer une disponibilité.' using errcode = 'check_violation';
  end if;
  if p_action in ('cancel', 'close') and r.status in ('cancelled', 'closed', 'declined') then
    raise exception 'Demande déjà terminée.' using errcode = 'check_violation';
  end if;
  update public.tutor_requests
     set status = case p_action when 'confirm' then 'confirmed' when 'cancel' then 'cancelled' when 'close' then 'closed' end,
         closed_reason = case when p_action in ('cancel', 'close') then nullif(left(btrim(p_reason), 300), '') else closed_reason end,
         updated_at = now()
   where id = p_id;
  if p_action not in ('confirm', 'cancel', 'close') then raise exception 'Action inconnue.' using errcode = 'check_violation'; end if;
  perform app.audit(null, 'tutor.request_' || p_action, 'tutor_requests', p_id, 'Action de la famille : ' || p_action, '{}'::jsonb);
end;
$$;

create or replace function public.tutor_request_message(p_id uuid, p_body text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.tutor_requests;
begin
  select * into r from public.tutor_requests where id = p_id and (parent_id = auth.uid() or tutor_id = auth.uid());
  if not found then raise exception 'Demande introuvable.' using errcode = 'no_data_found'; end if;
  if r.status in ('declined', 'cancelled', 'closed') then
    raise exception 'Cette demande est terminée.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.tutor_blocks where parent_id = r.parent_id and tutor_id = r.tutor_id) then
    raise exception 'Échanges bloqués.' using errcode = 'check_violation';
  end if;
  if coalesce(char_length(btrim(p_body)), 0) = 0 then
    raise exception 'Message vide.' using errcode = 'check_violation';
  end if;
  insert into public.tutor_request_messages (request_id, author_id, body) values (p_id, auth.uid(), left(btrim(p_body), 2000));
  update public.tutor_requests set updated_at = now() where id = p_id;
end;
$$;

create or replace function public.tutor_session_save(p_request uuid, p_session uuid, p_starts_at timestamptz, p_duration integer, p_mode text, p_note text, p_status text default 'planned')
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.tutor_requests;
  v_id uuid;
begin
  select * into r from public.tutor_requests where id = p_request and (parent_id = auth.uid() or tutor_id = auth.uid());
  if not found then raise exception 'Demande introuvable.' using errcode = 'no_data_found'; end if;
  if r.status <> 'confirmed' then
    raise exception 'Les séances s''organisent une fois les modalités confirmées par la famille.' using errcode = 'check_violation';
  end if;
  if p_session is null then
    insert into public.tutor_sessions (request_id, starts_at, duration_minutes, mode, note, created_by)
    values (p_request, p_starts_at, coalesce(p_duration, 60), p_mode, nullif(left(btrim(p_note), 300), ''), auth.uid())
    returning id into v_id;
  else
    update public.tutor_sessions
       set status = coalesce(nullif(p_status, ''), status), note = coalesce(nullif(left(btrim(p_note), 300), ''), note)
     where id = p_session and request_id = p_request
     returning id into v_id;
    if v_id is null then raise exception 'Séance introuvable.' using errcode = 'no_data_found'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.tutor_block(p_tutor uuid, p_blocked boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Connectez-vous.' using errcode = 'insufficient_privilege'; end if;
  if p_blocked then
    insert into public.tutor_blocks (parent_id, tutor_id) values (auth.uid(), p_tutor) on conflict do nothing;
    update public.tutor_requests set status = 'cancelled', closed_reason = 'Tuteur bloqué par la famille', updated_at = now()
     where parent_id = auth.uid() and tutor_id = p_tutor and status in ('sent', 'accepted', 'proposed', 'confirmed');
    perform app.audit(null, 'tutor.block', 'tutor_profiles', p_tutor, 'Tuteur bloqué par une famille', '{}'::jsonb);
  else
    delete from public.tutor_blocks where parent_id = auth.uid() and tutor_id = p_tutor;
  end if;
end;
$$;

-- Espace Tutor Match de l'utilisateur : en tant que famille et en tant que tuteur.
-- Coordonnées : celles du tuteur après acceptation, celles de la famille après confirmation.
create or replace function public.my_tutor_space()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then return null; end if;
  return jsonb_build_object(
    'profile', (select to_jsonb(t) from public.tutor_profiles t where t.user_id = v_me),
    'as_parent', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'tutor_id', r.tutor_id, 'tutor', app.tutor_display_name(r.tutor_id), 'status', r.status, 'subject', r.subject, 'level', r.level,
        'mode', r.mode, 'child_label', r.child_label, 'message', r.message, 'preferred_schedule', r.preferred_schedule,
        'proposed_schedule', r.proposed_schedule, 'tutor_note', r.tutor_note, 'created_at', r.created_at,
        'contact', case when r.status in ('accepted', 'proposed', 'confirmed') then (select jsonb_build_object('email', p.email, 'phone', p.phone) from public.profiles p where p.id = r.tutor_id) end,
        'messages', coalesce((select jsonb_agg(jsonb_build_object('mine', m.author_id = v_me, 'body', m.body, 'at', m.created_at) order by m.created_at) from public.tutor_request_messages m where m.request_id = r.id), '[]'::jsonb),
        'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'starts_at', x.starts_at, 'duration', x.duration_minutes, 'mode', x.mode, 'note', x.note, 'status', x.status) order by x.starts_at) from public.tutor_sessions x where x.request_id = r.id), '[]'::jsonb))
        order by r.updated_at desc)
      from public.tutor_requests r where r.parent_id = v_me), '[]'::jsonb),
    'as_tutor', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'parent', app.tutor_display_name(r.parent_id), 'status', r.status, 'subject', r.subject, 'level', r.level,
        'mode', r.mode, 'child_label', r.child_label, 'message', r.message, 'preferred_schedule', r.preferred_schedule,
        'proposed_schedule', r.proposed_schedule, 'tutor_note', r.tutor_note, 'created_at', r.created_at,
        'contact', case when r.status = 'confirmed' then (select jsonb_build_object('email', p.email, 'phone', p.phone) from public.profiles p where p.id = r.parent_id) end,
        'messages', coalesce((select jsonb_agg(jsonb_build_object('mine', m.author_id = v_me, 'body', m.body, 'at', m.created_at) order by m.created_at) from public.tutor_request_messages m where m.request_id = r.id), '[]'::jsonb),
        'sessions', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'starts_at', x.starts_at, 'duration', x.duration_minutes, 'mode', x.mode, 'note', x.note, 'status', x.status) order by x.starts_at) from public.tutor_sessions x where x.request_id = r.id), '[]'::jsonb))
        order by r.updated_at desc)
      from public.tutor_requests r where r.tutor_id = v_me), '[]'::jsonb),
    'blocked', coalesce((select jsonb_agg(jsonb_build_object('tutor_id', b.tutor_id, 'name', app.tutor_display_name(b.tutor_id))) from public.tutor_blocks b where b.parent_id = v_me), '[]'::jsonb),
    'suggestions', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'child', g.child_first_name, 'subject', g.subject, 'created_at', g.created_at) order by g.created_at desc)
      from public.tutor_suggestions g where g.user_id = v_me and g.dismissed_at is null and g.created_at > now() - interval '120 days'), '[]'::jsonb),
    'opted_out', exists (select 1 from public.tutor_suggestion_optouts where user_id = v_me)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Suggestions de soutien (règle explicable, désactivée par défaut)
-- Une matière dont la moyenne est sous le seuil sur les N derniers bulletins
-- PUBLIÉS de l'élève → proposition facultative au parent (compte portail),
-- si le module est ouvert pour l'établissement et que le parent ne l'a pas refusée.
-- Seule la matière est indiquée ; aucune note n'est transmise à qui que ce soit.
-- -----------------------------------------------------------------------------
create or replace function public.tutor_generate_suggestions()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.tutor_settings;
  v_count integer := 0;
  rec record;
begin
  if auth.uid() is not null and not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  select * into s from public.tutor_settings where id = 1;
  if not s.suggestions_enabled then return 0; end if;
  for rec in
    with ranked as (
      select rc.student_id, rc.organization_id, rc.data, row_number() over (partition by rc.student_id order by ap.starts_on desc nulls last, rc.published_at desc) as n
        from public.report_cards rc
        join public.academic_periods ap on ap.id = rc.academic_period_id
       where rc.status = 'published'
    ),
    subj as (
      select r.student_id, r.organization_id, coalesce(x ->> 'subject', x ->> 'code') as subject, (x ->> 'average')::numeric as average
        from ranked r, jsonb_array_elements(coalesce(r.data -> 'subjects', '[]'::jsonb)) x
       where r.n <= s.suggestion_periods and (x ->> 'average') ~ '^[0-9]+(\.[0-9]+)?$'
    ),
    weak as (
      select student_id, organization_id, subject
        from subj group by student_id, organization_id, subject
      having count(*) = s.suggestion_periods and bool_and(average < s.suggestion_threshold)
    )
    select w.*, st.first_name, g.user_id
      from weak w
      join public.students st on st.id = w.student_id and st.status = 'active'
      join public.student_guardians sg on sg.student_id = w.student_id and sg.portal_access
      join public.guardians g on g.id = sg.guardian_id and g.user_id is not null and g.archived_at is null
     where app.module_enabled('tutor_match', w.organization_id)
       and not exists (select 1 from public.tutor_suggestion_optouts o where o.user_id = g.user_id)
       and not exists (select 1 from public.tutor_suggestions t where t.student_id = w.student_id and t.subject = w.subject and t.user_id = g.user_id
                                                                  and t.created_at > now() - make_interval(days => s.suggestion_cooldown_days))
  loop
    insert into public.tutor_suggestions (user_id, organization_id, student_id, child_first_name, subject, rule)
    values (rec.user_id, rec.organization_id, rec.student_id, rec.first_name, rec.subject,
            jsonb_build_object('threshold', s.suggestion_threshold, 'periods', s.suggestion_periods));
    insert into public.notifications (organization_id, user_id, type, title, body, link, data)
    values (rec.organization_id, rec.user_id, 'tutor_suggestion', 'Soutien scolaire : une possibilité',
            'Certains résultats de ' || coalesce(rec.first_name, 'votre enfant') || ' indiquent qu''un accompagnement supplémentaire pourrait être utile en '
              || rec.subject || '. Souhaitez-vous découvrir les possibilités de soutien scolaire ? (facultatif)',
            '/espace/tutorat?matiere=' || replace(rec.subject, ' ', '+'), jsonb_build_object('subject', rec.subject));
    v_count := v_count + 1;
  end loop;
  perform app.audit(null, 'platform.tutor_suggestions', 'tutor_suggestions', null, 'Suggestions de soutien générées : ' || v_count, jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

create or replace function public.tutor_suggestion_preference(p_opt_out boolean, p_dismiss uuid default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Connectez-vous.' using errcode = 'insufficient_privilege'; end if;
  if p_dismiss is not null then
    update public.tutor_suggestions set dismissed_at = now() where id = p_dismiss and user_id = auth.uid();
    return;
  end if;
  if p_opt_out then
    insert into public.tutor_suggestion_optouts (user_id) values (auth.uid()) on conflict do nothing;
    update public.tutor_suggestions set dismissed_at = now() where user_id = auth.uid() and dismissed_at is null;
  else
    delete from public.tutor_suggestion_optouts where user_id = auth.uid();
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Console Super Admin
-- -----------------------------------------------------------------------------
create or replace function public.platform_save_tutor_settings(p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  update public.tutor_settings set
    independent_tutors = coalesce((p ->> 'independent_tutors')::boolean, independent_tutors),
    school_teachers = coalesce((p ->> 'school_teachers')::boolean, school_teachers),
    require_verification = coalesce((p ->> 'require_verification')::boolean, require_verification),
    forbid_own_school = coalesce((p ->> 'forbid_own_school')::boolean, forbid_own_school),
    suggestions_enabled = coalesce((p ->> 'suggestions_enabled')::boolean, suggestions_enabled),
    suggestion_threshold = coalesce((p ->> 'suggestion_threshold')::numeric, suggestion_threshold),
    suggestion_periods = coalesce((p ->> 'suggestion_periods')::integer, suggestion_periods),
    suggestion_cooldown_days = coalesce((p ->> 'suggestion_cooldown_days')::integer, suggestion_cooldown_days),
    max_open_requests = coalesce((p ->> 'max_open_requests')::integer, max_open_requests),
    terms = case when p ? 'terms' then nullif(btrim(p ->> 'terms'), '') else terms end,
    updated_at = now(), updated_by = auth.uid()
  where id = 1;
  perform app.audit(null, 'platform.tutor_settings', 'tutor_settings', null, 'Réglages de Tutor Match modifiés', p - 'terms');
end;
$$;

create or replace function public.platform_review_tutor(p_user uuid, p_action text, p_note text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.tutor_profiles;
begin
  if not app.is_platform_admin() then
    raise exception 'Réservé à l''administration de la plateforme.' using errcode = 'insufficient_privilege';
  end if;
  select * into t from public.tutor_profiles where user_id = p_user for update;
  if not found then raise exception 'Fiche introuvable.' using errcode = 'no_data_found'; end if;
  if p_action in ('reject', 'suspend', 'reject_verification') and coalesce(char_length(btrim(p_note)), 0) < 3 then
    raise exception 'Indiquez le motif.' using errcode = 'check_violation';
  end if;
  if p_action = 'verify' and coalesce(char_length(btrim(p_note)), 0) < 3 then
    raise exception 'Précisez ce qui a été vérifié (pièce d''identité, diplôme…).' using errcode = 'check_violation';
  end if;
  case p_action
    when 'approve' then update public.tutor_profiles set status = 'approved', review_note = nullif(btrim(p_note), ''), updated_at = now() where user_id = p_user;
    when 'reject' then update public.tutor_profiles set status = 'rejected', review_note = btrim(p_note), updated_at = now() where user_id = p_user;
    when 'suspend' then
      update public.tutor_profiles set status = 'suspended', review_note = btrim(p_note), updated_at = now() where user_id = p_user;
      update public.tutor_requests set status = 'cancelled', closed_reason = 'Tuteur suspendu par NeoScool', updated_at = now()
       where tutor_id = p_user and status in ('sent', 'accepted', 'proposed');
    when 'verify' then update public.tutor_profiles set verification = 'verified', verification_note = btrim(p_note), verified_at = now(), verified_by = auth.uid(), updated_at = now() where user_id = p_user;
    when 'reject_verification' then update public.tutor_profiles set verification = 'rejected', verification_note = btrim(p_note), verified_at = null, verified_by = null, updated_at = now() where user_id = p_user;
    else raise exception 'Action inconnue.' using errcode = 'check_violation';
  end case;
  perform app.audit(null, 'platform.tutor_review', 'tutor_profiles', p_user, 'Tuteur : ' || p_action, jsonb_build_object('note', p_note));
end;
$$;

create or replace function public.platform_tutor_overview()
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
    'tutors', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.tutor_profiles group by 1) x),
    'verification_requested', (select count(*) from public.tutor_profiles where verification = 'requested'),
    'verified', (select count(*) from public.tutor_profiles where verification = 'verified'),
    'requests', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.tutor_requests group by 1) x),
    'sessions', (select count(*) from public.tutor_sessions where status <> 'cancelled'),
    'suggestions_90d', (select count(*) from public.tutor_suggestions where created_at > now() - interval '90 days'),
    'from_suggestion', (select count(*) from public.tutor_requests where source = 'suggestion'),
    'reports_open', (select count(*) from public.content_reports where target_type = 'tutor' and status = 'open'),
    'blocks', (select count(*) from public.tutor_blocks),
    'subjects', coalesce((select jsonb_agg(x) from (select subject, count(*) n from public.tutor_requests group by 1 order by 2 desc limit 10) x), '[]'::jsonb)
  );
end;
$$;

-- Droits d'exécution
revoke all on function app.tutor_open_in_country(text), app.tutor_display_name(uuid), app.tutor_is_school_teacher(uuid) from public, anon;
revoke all on function public.tutor_save_profile(jsonb), public.tutor_set_visibility(boolean), public.tutor_request_verification(text),
  public.tutor_search(text, text, text, text, text, text, integer),
  public.tutor_request_create(uuid, text, text, text, text, text, text, text), public.tutor_request_respond(uuid, text, text, text),
  public.tutor_request_parent_action(uuid, text, text), public.tutor_request_message(uuid, text),
  public.tutor_session_save(uuid, uuid, timestamptz, integer, text, text, text), public.tutor_block(uuid, boolean),
  public.my_tutor_space(), public.tutor_suggestion_preference(boolean, uuid) from public, anon;
grant execute on function public.tutor_save_profile(jsonb), public.tutor_set_visibility(boolean), public.tutor_request_verification(text),
  public.tutor_search(text, text, text, text, text, text, integer),
  public.tutor_request_create(uuid, text, text, text, text, text, text, text), public.tutor_request_respond(uuid, text, text, text),
  public.tutor_request_parent_action(uuid, text, text), public.tutor_request_message(uuid, text),
  public.tutor_session_save(uuid, uuid, timestamptz, integer, text, text, text), public.tutor_block(uuid, boolean),
  public.my_tutor_space(), public.tutor_suggestion_preference(boolean, uuid) to authenticated;
revoke all on function public.tutor_generate_suggestions() from public, anon;
grant execute on function public.tutor_generate_suggestions() to authenticated, service_role;
revoke all on function public.platform_save_tutor_settings(jsonb), public.platform_review_tutor(uuid, text, text), public.platform_tutor_overview() from public, anon;
grant execute on function public.platform_save_tutor_settings(jsonb), public.platform_review_tutor(uuid, text, text), public.platform_tutor_overview() to authenticated;

-- Service ouvert dans ce pays ? (affichage des pages ; les contrôles restent dans les fonctions ci-dessus)
create or replace function public.tutor_match_open(p_country text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.tutor_open_in_country(upper(coalesce(p_country, '')));
$$;
revoke all on function public.tutor_match_open(text) from public, anon;
grant execute on function public.tutor_match_open(text) to authenticated;
