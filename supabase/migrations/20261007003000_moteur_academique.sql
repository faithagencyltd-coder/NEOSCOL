-- =============================================================================
-- P7b — MOTEUR ACADÉMIQUE MULTI-PAYS
--
-- Règles de calcul versionnées :
--   modèle plateforme → modèle PAYS → règles de l'ÉTABLISSEMENT (brouillon →
--   publication ; republier une ancienne version = retour arrière, audité).
-- Formules sûres : seuls nombres, variables T1…T8 (moyennes de périodes),
--   + - * / ( ) et min, max, round, abs — validées et évaluées EN BASE.
-- Résultats annuels : moyenne annuelle, mention, décision (proposée, ou
--   décision du conseil avec motif) ; une fois validés, figés avec les règles
--   exactes utilisées (version + copie) : toujours reproductibles.
-- Simulateur : effet d'un brouillon sur une classe réelle, sans rien enregistrer.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Formules sûres
-- -----------------------------------------------------------------------------
create or replace function app.eval_formula(p_formula text, p_vars jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m text[];
  v_out text := '';
  v_id text;
  v_result numeric;
begin
  if p_formula is null or char_length(p_formula) > 300 or p_formula !~ '^[0-9A-Za-z_+*/(). ,-]+$' or p_formula ~ '--|/\*|\*/' then
    raise exception 'Formule non autorisée.' using errcode = 'check_violation';
  end if;
  for m in select regexp_matches(p_formula, '([A-Za-z_][A-Za-z0-9_]*)|([^A-Za-z_]+)', 'g') loop
    if m[1] is null then
      v_out := v_out || m[2];
      continue;
    end if;
    v_id := upper(m[1]);
    v_out := v_out || case
      when v_id = 'MIN' then 'least'
      when v_id = 'MAX' then 'greatest'
      when v_id = 'ROUND' then 'round'
      when v_id = 'ABS' then 'abs'
      when p_vars ? v_id then coalesce(quote_literal((p_vars ->> v_id)::numeric) || '::numeric', 'null::numeric')
      else null end;
    if v_out is null then
      raise exception 'Élément inconnu dans la formule : %', m[1] using errcode = 'check_violation';
    end if;
  end loop;
  begin
    execute 'select (' || v_out || ')::numeric' into v_result;
  exception when division_by_zero then
    return null;
  end;
  return v_result;
end;
$$;
revoke execute on function app.eval_formula(text, jsonb) from public, anon, authenticated;

create or replace function app.period_vars(p_values numeric[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg('T' || i, p_values[i]), '{}'::jsonb) || (
    select coalesce(jsonb_object_agg('T' || j, null), '{}'::jsonb) from generate_series(coalesce(cardinality(p_values), 0) + 1, 8) j)
  from generate_series(1, coalesce(cardinality(p_values), 0)) i;
$$;

create or replace function app.formula_error(p_formula text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id text;
  v_depth int := 0;
  c text;
begin
  if p_formula is null or btrim(p_formula) = '' then return 'Formule vide.'; end if;
  if char_length(p_formula) > 300 then return 'Formule trop longue (300 caractères au plus).'; end if;
  if p_formula !~ '^[0-9A-Za-z_+*/(). ,-]+$' or p_formula ~ '--|/\*|\*/' then
    return 'Caractère non autorisé : nombres, T1 à T8, + - * / ( ) et min, max, round, abs uniquement.';
  end if;
  for v_id in select (regexp_matches(p_formula, '[A-Za-z_][A-Za-z0-9_]*', 'g'))[1] loop
    if not (upper(v_id) ~ '^T[1-8]$' or lower(v_id) in ('min', 'max', 'round', 'abs')) then
      return 'Élément inconnu : ' || v_id || ' (variables permises : T1 à T8).';
    end if;
  end loop;
  for i in 1 .. char_length(p_formula) loop
    c := substr(p_formula, i, 1);
    if c = '(' then v_depth := v_depth + 1; elsif c = ')' then v_depth := v_depth - 1; end if;
    if v_depth < 0 then return 'Parenthèses mal placées.'; end if;
  end loop;
  if v_depth <> 0 then return 'Parenthèses mal placées.'; end if;
  begin
    perform app.eval_formula(p_formula, app.period_vars(array[10, 12, 14, 16, 11, 13, 15, 9]::numeric[]));
  exception when others then
    return 'Formule invalide : vérifiez la syntaxe (ex. (T1 + T2 + 2*T3) / 4).';
  end;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Règles : structure, validation, application
-- -----------------------------------------------------------------------------
create or replace function app.default_academic_rules()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "grading_scale": 20,
    "pass_mark": 10,
    "annual": {"mode": "weights", "weights": [1, 1, 1]},
    "missing_period": "reweight",
    "round": 2,
    "mentions": [
      {"min": 16, "label": "Très bien"}, {"min": 14, "label": "Bien"}, {"min": 12, "label": "Assez bien"},
      {"min": 10, "label": "Passable"}, {"min": 0, "label": "Insuffisant"}
    ],
    "decisions": [
      {"min": 10, "code": "promoted", "label": "Admis(e) en classe supérieure"},
      {"min": 8.5, "code": "repeat", "label": "Autorisé(e) à redoubler"},
      {"min": 0, "code": "excluded", "label": "Exclu(e) pour insuffisance de résultats"}
    ]
  }'::jsonb;
$$;

create or replace function app.academic_rules_error(p_rules jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_scale numeric;
  v_mode text;
  d jsonb;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then return 'Règles invalides.'; end if;
  v_scale := coalesce((p_rules ->> 'grading_scale')::numeric, 20);
  if v_scale < 5 or v_scale > 100 then return 'Barème : entre 5 et 100.'; end if;
  if coalesce((p_rules ->> 'pass_mark')::numeric, 10) not between 0 and v_scale then return 'Moyenne de passage hors du barème.'; end if;
  if coalesce(p_rules ->> 'missing_period', 'reweight') not in ('reweight', 'incomplete') then return 'Règle des périodes manquantes inconnue.'; end if;
  if coalesce((p_rules ->> 'round')::int, 2) not between 0 and 3 then return 'Arrondi : 0 à 3 décimales.'; end if;
  v_mode := coalesce(p_rules #>> '{annual,mode}', 'weights');
  if v_mode = 'weights' then
    if jsonb_typeof(p_rules #> '{annual,weights}') <> 'array' or jsonb_array_length(p_rules #> '{annual,weights}') not between 1 and 8 then
      return 'Pondérations : 1 à 8 périodes.';
    end if;
    if exists (select 1 from jsonb_array_elements_text(p_rules #> '{annual,weights}') w where w !~ '^[0-9]+(\.[0-9]+)?$')
       or (select sum(w::numeric) from jsonb_array_elements_text(p_rules #> '{annual,weights}') w) <= 0 then
      return 'Pondérations : nombres positifs, au moins une non nulle.';
    end if;
  elsif v_mode = 'formula' then
    return app.formula_error(p_rules #>> '{annual,formula}');
  else
    return 'Mode de calcul annuel inconnu.';
  end if;
  if jsonb_typeof(p_rules -> 'decisions') <> 'array' or jsonb_array_length(p_rules -> 'decisions') not between 1 and 10 then
    return 'Décisions : 1 à 10 seuils.';
  end if;
  for d in select * from jsonb_array_elements(p_rules -> 'decisions') loop
    if coalesce(d ->> 'code', '') !~ '^[a-z_]{2,30}$' or char_length(coalesce(d ->> 'label', '')) not between 1 and 120
       or coalesce(d ->> 'min', '') !~ '^[0-9]+(\.[0-9]+)?$' then
      return 'Chaque décision : seuil, code (minuscules) et libellé.';
    end if;
  end loop;
  if p_rules ? 'mentions' and (jsonb_typeof(p_rules -> 'mentions') <> 'array' or jsonb_array_length(p_rules -> 'mentions') > 10) then
    return 'Mentions : 10 au plus.';
  end if;
  return null;
end;
$$;

-- Applique des règles à des moyennes de périodes (dans l'ordre T1, T2, …).
create or replace function app.apply_academic_rules(p_rules jsonb, p_periods numeric[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_avg numeric;
  v_complete boolean := not exists (select 1 from unnest(p_periods) v where v is null) and cardinality(p_periods) > 0;
  v_round int := coalesce((p_rules ->> 'round')::int, 2);
  v_weights numeric[];
  v_decision jsonb;
begin
  if coalesce(p_rules #>> '{annual,mode}', 'weights') = 'formula' then
    v_avg := app.eval_formula(p_rules #>> '{annual,formula}', app.period_vars(p_periods));
  else
    select array_agg(w::numeric order by o) into v_weights
      from jsonb_array_elements_text(p_rules #> '{annual,weights}') with ordinality x(w, o);
    select sum(p_periods[i] * coalesce(v_weights[i], 1)) / nullif(sum(coalesce(v_weights[i], 1)), 0) into v_avg
      from generate_series(1, coalesce(cardinality(p_periods), 0)) i
     where p_periods[i] is not null;
  end if;
  if not v_complete and coalesce(p_rules ->> 'missing_period', 'reweight') = 'incomplete' then
    v_avg := null;
  end if;
  v_avg := round(v_avg, v_round);
  select d into v_decision from jsonb_array_elements(p_rules -> 'decisions') d
   where v_avg is not null and v_avg >= (d ->> 'min')::numeric
   order by (d ->> 'min')::numeric desc limit 1;
  return jsonb_build_object(
    'average', v_avg,
    'complete', v_complete,
    'passed', v_avg is not null and v_avg >= coalesce((p_rules ->> 'pass_mark')::numeric, 10),
    'mention', app.rule_label(p_rules -> 'mentions', v_avg),
    'decision_code', v_decision ->> 'code',
    'decision_label', v_decision ->> 'label');
end;
$$;

-- -----------------------------------------------------------------------------
-- Jeux de règles versionnés
-- -----------------------------------------------------------------------------
create table public.academic_rule_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  country_code text references public.countries (code),
  education_type text not null default 'school' check (education_type in ('school', 'training', 'university')),
  name text not null check (char_length(name) between 2 and 120),
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  rules jsonb not null,
  based_on_id uuid references public.academic_rule_sets (id) on delete set null,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  check (organization_id is null or country_code is null)
);
-- Versions numérotées par portée ; une seule version publiée par portée.
create unique index academic_rule_sets_version on public.academic_rule_sets
  (coalesce(organization_id::text, 'country:' || coalesce(country_code, '*')), education_type, version);
create unique index academic_rule_sets_published on public.academic_rule_sets
  (coalesce(organization_id::text, 'country:' || coalesce(country_code, '*')), education_type) where status = 'published';

-- Une version publiée ou archivée ne change plus (seul son statut évolue).
create or replace function app.academic_rule_set_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Une version publiée est conservée : elle ne peut pas être supprimée.' using errcode = 'check_violation';
    end if;
    return old;
  end if;
  if old.status <> 'draft' and (new.rules is distinct from old.rules or new.version <> old.version or new.name <> old.name) then
    raise exception 'Une version publiée ne peut plus être modifiée : créez une nouvelle version.' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger academic_rule_sets_guard before update or delete on public.academic_rule_sets
  for each row execute function app.academic_rule_set_guard();

alter table public.academic_rule_sets enable row level security;
revoke all on public.academic_rule_sets from anon, authenticated;
grant select on public.academic_rule_sets to authenticated;
create policy academic_rule_sets_read on public.academic_rule_sets for select to authenticated
  using (organization_id is null or organization_id = any (app.member_org_ids()) or app.is_platform_admin());

-- Droit d'écrire une portée : établissement (academic.manage) ou modèle (Super Admin).
create or replace function app.can_manage_rule_scope(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_org is null then app.is_platform_admin() else app.has_permission(p_org, 'academic.manage') end;
$$;

create or replace function public.save_academic_rule_draft(
  p_org uuid, p_country text, p_education_type text, p_name text, p_rules jsonb, p_notes text default null, p_based_on uuid default null)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_error text := app.academic_rules_error(p_rules);
  v_version int;
  v_id uuid;
  v_scope text := coalesce(p_org::text, 'country:' || coalesce(upper(p_country), '*'));
begin
  if not app.can_manage_rule_scope(p_org) then
    raise exception 'Permission refusée : gestion des règles académiques.' using errcode = 'insufficient_privilege';
  end if;
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;
  if p_org is not null and p_country is not null then
    raise exception 'Une règle concerne un établissement OU un pays.' using errcode = 'check_violation';
  end if;
  select coalesce(max(version), 0) + 1 into v_version from public.academic_rule_sets
   where coalesce(organization_id::text, 'country:' || coalesce(country_code, '*')) = v_scope and education_type = p_education_type;
  insert into public.academic_rule_sets (organization_id, country_code, education_type, name, version, rules, notes, based_on_id)
  values (p_org, upper(nullif(p_country, '')), p_education_type, btrim(p_name), v_version, p_rules, nullif(btrim(coalesce(p_notes, '')), ''), p_based_on)
  returning id into v_id;
  perform app.audit(p_org, 'academic.rules_draft', 'academic_rule_sets', v_id,
    'Règles académiques « ' || btrim(p_name) || ' » : brouillon v' || v_version, jsonb_build_object('scope', v_scope, 'version', v_version), 'success');
  return v_id;
end;
$$;

-- Publication (ou republication d'une ancienne version = retour arrière).
create or replace function public.publish_academic_rule_set(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_set public.academic_rule_sets;
  v_previous public.academic_rule_sets;
begin
  select * into v_set from public.academic_rule_sets where id = p_id for update;
  if v_set.id is null or not app.can_manage_rule_scope(v_set.organization_id) then
    raise exception 'Permission refusée : gestion des règles académiques.' using errcode = 'insufficient_privilege';
  end if;
  if v_set.status = 'published' then
    return;
  end if;
  if app.academic_rules_error(v_set.rules) is not null then
    raise exception '%', app.academic_rules_error(v_set.rules) using errcode = 'check_violation';
  end if;
  select * into v_previous from public.academic_rule_sets
   where coalesce(organization_id::text, 'country:' || coalesce(country_code, '*')) = coalesce(v_set.organization_id::text, 'country:' || coalesce(v_set.country_code, '*'))
     and education_type = v_set.education_type and status = 'published' for update;
  update public.academic_rule_sets set status = 'archived' where id = v_previous.id;
  update public.academic_rule_sets set status = 'published', published_by = auth.uid(), published_at = now() where id = p_id;
  perform app.audit(v_set.organization_id, case when v_set.status = 'archived' then 'academic.rules_rollback' else 'academic.rules_published' end,
    'academic_rule_sets', p_id,
    case when v_set.status = 'archived' then 'Retour à la version ' else 'Publication de la version ' end || v_set.version || ' des règles « ' || v_set.name || ' »',
    jsonb_build_object('version', v_set.version, 'previous_version', v_previous.version, 'before', v_previous.rules, 'after', v_set.rules), 'success');
end;
$$;

create or replace function public.delete_academic_rule_draft(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_set public.academic_rule_sets;
begin
  select * into v_set from public.academic_rule_sets where id = p_id;
  if v_set.id is null or not app.can_manage_rule_scope(v_set.organization_id) then
    raise exception 'Permission refusée : gestion des règles académiques.' using errcode = 'insufficient_privilege';
  end if;
  delete from public.academic_rule_sets where id = p_id and status = 'draft';
end;
$$;

-- Règles en vigueur : établissement → pays de l'établissement → plateforme → défaut.
create or replace function app.effective_academic_rules(p_org uuid, p_type text)
returns table (rule_set_id uuid, version integer, rules jsonb, source text)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select r.id, r.version, r.rules, 'organization'::text from public.academic_rule_sets r
     where r.organization_id = p_org and r.education_type = p_type and r.status = 'published'
    union all
    select r.id, r.version, r.rules, 'country' from public.academic_rule_sets r
      join public.organizations o on o.id = p_org
     where r.organization_id is null and r.country_code = o.country and r.education_type = p_type and r.status = 'published'
    union all
    select r.id, r.version, r.rules, 'platform' from public.academic_rule_sets r
     where r.organization_id is null and r.country_code is null and r.education_type = p_type and r.status = 'published'
    union all
    select null::uuid, 0, app.default_academic_rules(), 'default'
  ) x(rule_set_id, version, rules, source)
  order by case source when 'organization' then 1 when 'country' then 2 when 'platform' then 3 else 4 end
  limit 1;
$$;

create or replace function public.effective_academic_rules(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_org = any (app.member_org_ids()) or app.is_platform_admin() then
    (select jsonb_build_object('rule_set_id', e.rule_set_id, 'version', e.version, 'rules', e.rules, 'source', e.source)
       from app.effective_academic_rules(p_org, 'school') e) end;
$$;

-- Un établissement adopte le modèle de son pays (copie en brouillon).
create or replace function public.adopt_academic_template(p_org uuid, p_template uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_t public.academic_rule_sets;
begin
  select * into v_t from public.academic_rule_sets where id = p_template and organization_id is null and status = 'published';
  if v_t.id is null then
    raise exception 'Modèle introuvable.' using errcode = 'no_data_found';
  end if;
  return public.save_academic_rule_draft(p_org, null, v_t.education_type, v_t.name, v_t.rules, 'Copie du modèle v' || v_t.version, v_t.id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Résultats annuels (reproductibles)
-- -----------------------------------------------------------------------------
create table public.annual_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  rule_set_id uuid references public.academic_rule_sets (id) on delete restrict,
  rule_version integer not null default 0,
  rules_snapshot jsonb not null,
  inputs jsonb not null,
  average numeric(6, 2),
  rank integer,
  mention text,
  proposed_code text,
  proposed_label text,
  decision_code text,
  decision_label text,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 500),
  status text not null default 'draft' check (status in ('draft', 'validated')),
  computed_at timestamptz not null default now(),
  validated_by uuid references auth.users (id) on delete set null,
  validated_at timestamptz,
  unique (student_id, class_id)
);
create index annual_results_class on public.annual_results (class_id);

create or replace function app.annual_result_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and old.status = 'validated' then
    raise exception 'Un résultat validé est conservé.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.status = 'validated' then
    raise exception 'Résultat validé : figé (règles version %).', old.rule_version using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger annual_results_guard before update or delete on public.annual_results
  for each row execute function app.annual_result_guard();

alter table public.annual_results enable row level security;
revoke all on public.annual_results from anon, authenticated;
grant select on public.annual_results to authenticated;
create policy annual_results_read on public.annual_results for select to authenticated
  using (app.has_permission(organization_id, 'grades.read') or app.has_permission(organization_id, 'report_cards.manage'));

-- Moyennes de périodes d'une classe (bulletins calculés), dans l'ordre de l'année.
create or replace function app.class_period_averages(p_class_id uuid)
returns table (student_id uuid, averages numeric[], inputs jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with c as (select id, academic_year_id from public.classes where id = p_class_id),
  periods as (
    select p.id, p.name, row_number() over (order by p.sequence, p.starts_on) as n
    from public.academic_periods p join c on c.academic_year_id = p.academic_year_id
  ),
  pupils as (select e.student_id from public.enrollments e where e.class_id = p_class_id and e.status = 'validated')
  select pu.student_id,
         array_agg(rc.average order by pe.n),
         jsonb_agg(jsonb_build_object('period_id', pe.id, 'period', pe.name, 'variable', 'T' || pe.n, 'average', rc.average) order by pe.n)
  from pupils pu cross join periods pe
  left join public.report_cards rc on rc.student_id = pu.student_id and rc.class_id = p_class_id and rc.academic_period_id = pe.id
  group by pu.student_id;
$$;

create or replace function public.compute_annual_results(p_class_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_rules record;
  v_count integer;
begin
  select * into v_class from public.classes where id = p_class_id;
  if v_class.id is null then
    raise exception 'Classe introuvable.' using errcode = 'no_data_found';
  end if;
  if not (app.has_permission(v_class.organization_id, 'report_cards.manage') or app.has_permission(v_class.organization_id, 'grades.manage')) then
    raise exception 'Permission refusée : calcul des résultats annuels.' using errcode = 'insufficient_privilege';
  end if;
  select * into v_rules from app.effective_academic_rules(v_class.organization_id, 'school');
  with calc as (
    select a.student_id, a.inputs, app.apply_academic_rules(v_rules.rules, a.averages) as r
    from app.class_period_averages(p_class_id) a
  ),
  ranked as (
    select c.*, (c.r ->> 'average')::numeric as avg,
           (case when c.r ->> 'average' is not null then rank() over (order by (c.r ->> 'average')::numeric desc nulls last) end)::int as rk
    from calc c
  ),
  up as (
    insert into public.annual_results (organization_id, student_id, class_id, academic_year_id, rule_set_id, rule_version, rules_snapshot, inputs,
                                       average, rank, mention, proposed_code, proposed_label, decision_code, decision_label, computed_at)
    select v_class.organization_id, r.student_id, p_class_id, v_class.academic_year_id, v_rules.rule_set_id, v_rules.version, v_rules.rules, r.inputs,
           r.avg, r.rk, r.r ->> 'mention', r.r ->> 'decision_code', r.r ->> 'decision_label', r.r ->> 'decision_code', r.r ->> 'decision_label', now()
    from ranked r
    on conflict (student_id, class_id) do update set
      rule_set_id = excluded.rule_set_id, rule_version = excluded.rule_version, rules_snapshot = excluded.rules_snapshot, inputs = excluded.inputs,
      average = excluded.average, rank = excluded.rank, mention = excluded.mention,
      proposed_code = excluded.proposed_code, proposed_label = excluded.proposed_label,
      -- Décision du conseil conservée si elle a été saisie (motif présent).
      decision_code = case when public.annual_results.decision_reason is null then excluded.decision_code else public.annual_results.decision_code end,
      decision_label = case when public.annual_results.decision_reason is null then excluded.decision_label else public.annual_results.decision_label end,
      computed_at = now()
    where public.annual_results.status = 'draft'
    returning 1
  )
  select count(*) into v_count from up;
  perform app.audit(v_class.organization_id, 'academic.annual_computed', 'classes', p_class_id,
    'Résultats annuels calculés (' || v_count || ') — règles ' || v_rules.source || ' v' || v_rules.version, '{}'::jsonb, 'success');
  return v_count;
end;
$$;

-- Décision du conseil de classe (différente de la proposition : motif obligatoire).
create or replace function public.set_annual_decision(p_result uuid, p_code text, p_reason text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_r public.annual_results;
  v_label text;
begin
  select * into v_r from public.annual_results where id = p_result;
  if v_r.id is null or not app.has_permission(v_r.organization_id, 'report_cards.manage') then
    raise exception 'Permission refusée : décisions de fin d''année.' using errcode = 'insufficient_privilege';
  end if;
  select d ->> 'label' into v_label from jsonb_array_elements(v_r.rules_snapshot -> 'decisions') d where d ->> 'code' = p_code;
  if v_label is null then
    raise exception 'Décision inconnue pour ces règles.' using errcode = 'check_violation';
  end if;
  if p_code is distinct from v_r.proposed_code and char_length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Motif obligatoire quand la décision diffère de la proposition.' using errcode = 'check_violation';
  end if;
  update public.annual_results
     set decision_code = p_code, decision_label = v_label,
         decision_reason = case when p_code = v_r.proposed_code then null else btrim(p_reason) end
   where id = p_result;
  perform app.audit(v_r.organization_id, 'academic.annual_decision', 'annual_results', p_result,
    'Décision de fin d''année : ' || v_label, jsonb_build_object('proposed', v_r.proposed_code, 'decision', p_code, 'reason', p_reason), 'success');
end;
$$;

create or replace function public.validate_annual_results(p_class_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_count integer;
begin
  select organization_id into v_org from public.classes where id = p_class_id;
  if v_org is null or not app.has_permission(v_org, 'report_cards.publish') then
    raise exception 'Permission refusée : validation des résultats.' using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from public.annual_results where class_id = p_class_id and status = 'draft' and average is null) then
    raise exception 'Des résultats sont incomplets (périodes sans bulletin) : complétez avant de valider.' using errcode = 'check_violation';
  end if;
  update public.annual_results set status = 'validated', validated_by = auth.uid(), validated_at = now()
   where class_id = p_class_id and status = 'draft';
  get diagnostics v_count = row_count;
  perform app.audit(v_org, 'academic.annual_validated', 'classes', p_class_id, v_count || ' résultat(s) annuel(s) validé(s)', '{}'::jsonb, 'success');
  return v_count;
end;
$$;

-- Simulateur : effet de règles (brouillon) sur une classe réelle, sans rien enregistrer.
create or replace function public.simulate_academic_rules(p_class_id uuid, p_rules jsonb)
returns table (student_id uuid, student_name text, inputs jsonb, current_result jsonb, simulated_result jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_current jsonb;
  v_error text := app.academic_rules_error(p_rules);
begin
  select * into v_class from public.classes where id = p_class_id;
  if v_class.id is null or not (app.has_permission(v_class.organization_id, 'grades.read') or app.has_permission(v_class.organization_id, 'report_cards.manage')) then
    raise exception 'Permission refusée : simulation.' using errcode = 'insufficient_privilege';
  end if;
  if v_error is not null then
    raise exception '%', v_error using errcode = 'check_violation';
  end if;
  select e.rules into v_current from app.effective_academic_rules(v_class.organization_id, 'school') e;
  return query
  select a.student_id, s.last_name || ' ' || s.first_name, a.inputs,
         app.apply_academic_rules(v_current, a.averages), app.apply_academic_rules(p_rules, a.averages)
  from app.class_period_averages(p_class_id) a join public.students s on s.id = a.student_id
  order by s.last_name, s.first_name;
end;
$$;

-- Essai d'une formule sur des valeurs saisies (éditeur).
create or replace function public.try_academic_rules(p_rules jsonb, p_values numeric[])
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_error text := app.academic_rules_error(p_rules);
begin
  if auth.uid() is null then
    raise exception 'Session expirée.' using errcode = 'insufficient_privilege';
  end if;
  if v_error is not null then
    return jsonb_build_object('error', v_error);
  end if;
  if cardinality(p_values) > 8 then
    return jsonb_build_object('error', '8 périodes au plus.');
  end if;
  return app.apply_academic_rules(p_rules, p_values);
end;
$$;

revoke execute on function public.save_academic_rule_draft(uuid, text, text, text, jsonb, text, uuid) from public, anon;
revoke execute on function public.publish_academic_rule_set(uuid) from public, anon;
revoke execute on function public.delete_academic_rule_draft(uuid) from public, anon;
revoke execute on function public.effective_academic_rules(uuid) from public, anon;
revoke execute on function public.adopt_academic_template(uuid, uuid) from public, anon;
revoke execute on function public.compute_annual_results(uuid) from public, anon;
revoke execute on function public.set_annual_decision(uuid, text, text) from public, anon;
revoke execute on function public.validate_annual_results(uuid) from public, anon;
revoke execute on function public.simulate_academic_rules(uuid, jsonb) from public, anon;
revoke execute on function public.try_academic_rules(jsonb, numeric[]) from public, anon;
grant execute on function public.save_academic_rule_draft(uuid, text, text, text, jsonb, text, uuid) to authenticated;
grant execute on function public.publish_academic_rule_set(uuid) to authenticated;
grant execute on function public.delete_academic_rule_draft(uuid) to authenticated;
grant execute on function public.effective_academic_rules(uuid) to authenticated;
grant execute on function public.adopt_academic_template(uuid, uuid) to authenticated;
grant execute on function public.compute_annual_results(uuid) to authenticated;
grant execute on function public.set_annual_decision(uuid, text, text) to authenticated;
grant execute on function public.validate_annual_results(uuid) to authenticated;
grant execute on function public.simulate_academic_rules(uuid, jsonb) to authenticated;
grant execute on function public.try_academic_rules(jsonb, numeric[]) to authenticated;
revoke execute on function app.formula_error(text) from public, anon;
revoke execute on function app.apply_academic_rules(jsonb, numeric[]) from public, anon;
revoke execute on function app.academic_rules_error(jsonb) from public, anon;
