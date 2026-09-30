-- =============================================================================
-- Portail parent pour l'enseignement supérieur : désactivé par défaut (les
-- étudiants sont souvent majeurs), activable par l'université, qui choisit les
-- informations visibles (résultats, notes, présences, paiements, documents,
-- emploi du temps). Tant qu'il est désactivé, un compte parent d'une université
-- ne voit AUCUNE donnée d'étudiant (contrôle en base, pas seulement à l'écran).
-- Écoles et centres de formation : inchangés. Aucune donnée n'est modifiée.
-- =============================================================================

create or replace function app.default_university_settings()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "establishment_kind": "universite",
    "features": {
      "faculties": true, "departments": true, "groups": false, "semesters": true, "credits": true,
      "ranking": false, "internships": true, "theses": true, "defenses": true, "badges": true,
      "scan": true, "student_portal": true, "teacher_portal": true, "payments": true, "documents": true,
      "parent_portal": false
    },
    "parent_portal_sections": {
      "results": true, "grades": true, "attendance": true, "finances": true, "documents": true, "timetable": true
    },
    "rules": {
      "pass_mark": 10,
      "ue_compensation": true,
      "semester_compensation": true,
      "semester_weighting": "credits",
      "eliminatory_mark": null,
      "absent_as_zero": true,
      "retake_rule": "best",
      "retake_cap": 10,
      "year_pass_ratio": 1,
      "conditional_pass_ratio": 0.75,
      "late_tolerance_minutes": 10,
      "open_before_minutes": 15,
      "entry_without_course": false,
      "ranking_scope": "promotion"
    },
    "teacher_ranks": ["Professeur titulaire", "Maître de conférences", "Maître-assistant", "Assistant", "Chargé de cours", "Vacataire", "Intervenant"],
    "decisions": {
      "validated": "Admis(e)",
      "compensated": "Admis(e) par compensation",
      "retake": "Autorisé(e) au rattrapage",
      "failed": "Ajourné(e)",
      "year_pass": "Admis(e) en année supérieure",
      "year_conditional": "Admis(e) avec dette de crédits",
      "year_repeat": "Redouble"
    }
  }'::jsonb;
$$;

create or replace function app.org_university(p_org uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when app.is_higher_org_type(o.type) then
    app.default_university_settings()
      || coalesce(o.settings -> 'university', '{}'::jsonb)
      || jsonb_build_object(
           'features', (app.default_university_settings() -> 'features') || coalesce(o.settings #> '{university,features}', '{}'::jsonb),
           'rules', (app.default_university_settings() -> 'rules') || coalesce(o.settings #> '{university,rules}', '{}'::jsonb),
           'decisions', (app.default_university_settings() -> 'decisions') || coalesce(o.settings #> '{university,decisions}', '{}'::jsonb),
           'parent_portal_sections', (app.default_university_settings() -> 'parent_portal_sections') || coalesce(o.settings #> '{university,parent_portal_sections}', '{}'::jsonb))
  end
  from public.organizations o where o.id = p_org;
$$;

create or replace function public.set_university_config(p_org uuid, p_config jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_rules jsonb;
  v_kind text;
  v_key text;
  v_num numeric;
begin
  if not app.has_permission(p_org, 'settings.manage') then
    raise exception 'Permission requise : settings.manage' using errcode = 'insufficient_privilege';
  end if;
  if not app.is_higher_org(p_org) then
    raise exception 'Le module Université ne s''applique pas à ce type d''établissement.' using errcode = 'check_violation';
  end if;
  v_before := app.org_university(p_org);
  v_kind := coalesce(p_config ->> 'establishment_kind', v_before ->> 'establishment_kind');
  if v_kind not in ('universite', 'institut', 'ecole_superieure', 'prive', 'faculte', 'autre') then
    raise exception 'Type d''établissement inconnu.' using errcode = 'check_violation';
  end if;
  -- Fonctionnalités : uniquement des booléens connus.
  for v_key in select jsonb_object_keys(coalesce(p_config -> 'features', '{}'::jsonb)) loop
    if not (app.default_university_settings() -> 'features') ? v_key or jsonb_typeof(p_config #> array['features', v_key]) <> 'boolean' then
      raise exception 'Fonctionnalité inconnue : %', v_key using errcode = 'check_violation';
    end if;
  end loop;
  -- Informations visibles dans le portail parent : uniquement des booléens connus.
  for v_key in select jsonb_object_keys(coalesce(p_config -> 'parent_portal_sections', '{}'::jsonb)) loop
    if not (app.default_university_settings() -> 'parent_portal_sections') ? v_key or jsonb_typeof(p_config #> array['parent_portal_sections', v_key]) <> 'boolean' then
      raise exception 'Information du portail parent inconnue : %', v_key using errcode = 'check_violation';
    end if;
  end loop;
  v_rules := (v_before -> 'rules') || coalesce(p_config -> 'rules', '{}'::jsonb);
  for v_key in select unnest(array['pass_mark', 'retake_cap']) loop
    v_num := (v_rules ->> v_key)::numeric;
    if v_num is null or v_num < 0 or v_num > 20 then
      raise exception 'Règle « % » : valeur entre 0 et 20 attendue.', v_key using errcode = 'check_violation';
    end if;
  end loop;
  if v_rules ->> 'retake_rule' not in ('best', 'replace', 'cap', 'average') then
    raise exception 'Règle de rattrapage inconnue.' using errcode = 'check_violation';
  end if;
  if v_rules ->> 'semester_weighting' not in ('credits', 'coefficient') then
    raise exception 'Pondération des UE inconnue.' using errcode = 'check_violation';
  end if;
  if (v_rules ->> 'late_tolerance_minutes')::integer not between 0 and 120
     or (v_rules ->> 'open_before_minutes')::integer not between 0 and 240 then
    raise exception 'Règles de scan : tolérance 0 à 120 min, ouverture 0 à 240 min.' using errcode = 'check_violation';
  end if;
  if (v_rules ->> 'year_pass_ratio')::numeric not between 0 and 1 or (v_rules ->> 'conditional_pass_ratio')::numeric not between 0 and 1 then
    raise exception 'Seuils de passage : ratio entre 0 et 1.' using errcode = 'check_violation';
  end if;
  v_after := jsonb_build_object(
    'establishment_kind', v_kind,
    'features', (v_before -> 'features') || coalesce(p_config -> 'features', '{}'::jsonb),
    'rules', v_rules,
    'teacher_ranks', coalesce(p_config -> 'teacher_ranks', v_before -> 'teacher_ranks'),
    'decisions', (v_before -> 'decisions') || coalesce(p_config -> 'decisions', '{}'::jsonb),
    'parent_portal_sections', (v_before -> 'parent_portal_sections') || coalesce(p_config -> 'parent_portal_sections', '{}'::jsonb));
  update public.organizations set settings = settings || jsonb_build_object('university', v_after) where id = p_org;
  perform app.audit(p_org, 'settings.university', 'organizations', p_org, 'Paramètres universitaires mis à jour',
                    jsonb_build_object('before', v_before, 'after', v_after));
  return v_after;
end;
$$;

create or replace function app.my_portal_student_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  with orgs as (select app.member_org_ids() as ids)
  select coalesce(array_agg(distinct x.id), '{}')
  from (
    select sg.student_id as id
    from public.guardians g
    join public.student_guardians sg on sg.guardian_id = g.id and sg.portal_access
    join public.students s on s.id = sg.student_id and s.archived_at is null
    , orgs
    where g.user_id = auth.uid() and g.archived_at is null and g.organization_id = any (orgs.ids)
      -- Université : le portail parent n'existe que si l'établissement l'a activé.
      and (not app.is_higher_org(g.organization_id) or app.university_feature(g.organization_id, 'parent_portal'))
    union
    select s.id
    from public.students s, orgs
    where s.user_id = auth.uid() and s.archived_at is null and s.organization_id = any (orgs.ids)
  ) x;
$$;

-- Continuité : une université dont des parents ont déjà un compte relié garde
-- son portail parent actif (aucun accès existant n'est retiré).
update public.organizations o
   set settings = jsonb_set(o.settings, '{university,features,parent_portal}', 'true'::jsonb, true)
 where app.is_higher_org_type(o.type)
   and o.settings ? 'university'
   and exists (select 1 from public.guardians g join public.student_guardians sg on sg.guardian_id = g.id and sg.portal_access
               where g.organization_id = o.id and g.user_id is not null and g.archived_at is null);
