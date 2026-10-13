-- =============================================================================
-- NeoScool — Bulletins : décision de fin d'année et récapitulatif annuel.
--
-- Correction du moteur existant (app.report_card_rows), sans nouveau système :
--   • T1, T2 (ou S1) : aucune décision annuelle sur le bulletin de période ;
--   • dernière période de l'année (T3 ou S2) : récapitulatif annuel en bas du
--     bulletin — moyenne de chaque période, moyenne annuelle selon les Règles
--     académiques de l'établissement, décision (celle du conseil si elle a été
--     saisie dans « Résultats annuels », sinon celle des règles) ;
--   • moyenne annuelle par défaut : trimestres (T1 + T2 + T3) ÷ 3, semestres
--     (S1 + S2 × 2) ÷ 3 — réglables par établissement (Règles académiques) ;
--   • option « arrondir la moyenne de chaque matière avant points et moyenne
--     générale » (15,67 × 4 = 62,68), activée pour les nouvelles configurations ;
--   • une moyenne de T1/T2 modifiée → récapitulatif du dernier bulletin
--     (brouillon) recalculé ;
--   • colonnes du bulletin (structure conservée) : INT 1 … INT N, MOYEN INTERRO,
--     DEV 1 … DEV N (nombre dynamique), puis Moy., Coef., Points, Moy. cl.,
--     Min / Max, Enseignant, Appréciation. MOYEN INTERRO affichée = valeur
--     utilisée dans Moy. ;
--   • tous les établissements du module scolaire passent à ce calcul (anciens
--     réglages conservés en base, bulletins publiés inchangés).
-- =============================================================================

-- Système de l'année : semestres si toutes ses périodes sont des semestres.
create or replace function app.year_period_system(p_year uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when count(*) > 0 and bool_and(type = 'semester') then 'semester' else 'trimester' end
  from public.academic_periods where academic_year_id = p_year;
$$;

-- Règles par défaut : pondération des semestres ajoutée (S1 × 1, S2 × 2).
create or replace function app.default_academic_rules()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "grading_scale": 20,
    "pass_mark": 10,
    "annual": {"mode": "weights", "weights": [1, 1, 1], "semester_weights": [1, 2]},
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

-- Validation : pondération des semestres facultative (1 à 8 nombres positifs).
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
    if p_rules #> '{annual,semester_weights}' is not null then
      if jsonb_typeof(p_rules #> '{annual,semester_weights}') <> 'array'
         or jsonb_array_length(p_rules #> '{annual,semester_weights}') not between 1 and 8
         or exists (select 1 from jsonb_array_elements_text(p_rules #> '{annual,semester_weights}') w where w !~ '^[0-9]+(\.[0-9]+)?$')
         or (select sum(w::numeric) from jsonb_array_elements_text(p_rules #> '{annual,semester_weights}') w) <= 0 then
        return 'Pondération des semestres : nombres positifs, au moins une non nulle.';
      end if;
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

-- Application des règles : système de l'année (trimestres / semestres) et
-- formule lisible du calcul (traçabilité). Remplace la version à 2 arguments ;
-- les appels existants (système non précisé) gardent le même résultat.
drop function if exists app.apply_academic_rules(jsonb, numeric[]);
create or replace function app.apply_academic_rules(p_rules jsonb, p_periods numeric[], p_system text default null)
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
  v_source jsonb;
  v_formula text;
  v_decision jsonb;
  v_fmt constant text := 'FM9990.99';
begin
  if coalesce(p_rules #>> '{annual,mode}', 'weights') = 'formula' then
    v_avg := app.eval_formula(p_rules #>> '{annual,formula}', app.period_vars(p_periods));
    v_formula := p_rules #>> '{annual,formula}';
  else
    -- Semestres : pondération des semestres si elle existe, sinon pondération
    -- explicite à 2 périodes, sinon S1 × 1 et S2 × 2.
    v_source := case
      when p_system = 'semester' and jsonb_typeof(p_rules #> '{annual,semester_weights}') = 'array' then p_rules #> '{annual,semester_weights}'
      when p_system = 'semester' and jsonb_array_length(coalesce(p_rules #> '{annual,weights}', '[]')) = 2 then p_rules #> '{annual,weights}'
      when p_system = 'semester' then '[1, 2]'::jsonb
      else p_rules #> '{annual,weights}' end;
    select array_agg(w::numeric order by o) into v_weights
      from jsonb_array_elements_text(v_source) with ordinality x(w, o);
    select sum(p_periods[i] * coalesce(v_weights[i], 1)) / nullif(sum(coalesce(v_weights[i], 1)), 0),
           '(' || string_agg(
             trim(to_char(p_periods[i], v_fmt), '.') || case when coalesce(v_weights[i], 1) <> 1 then ' × ' || trim(to_char(v_weights[i], v_fmt), '.') else '' end,
             ' + ' order by i) || ') ÷ ' || trim(to_char(sum(coalesce(v_weights[i], 1)), v_fmt), '.')
      into v_avg, v_formula
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
    'decision_label', v_decision ->> 'label',
    'formula', v_formula,
    'system', coalesce(p_system, 'trimester'));
end;
$$;
revoke execute on function app.apply_academic_rules(jsonb, numeric[], text) from public, anon, authenticated;

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
    select a.student_id, a.inputs, app.apply_academic_rules(v_rules.rules, a.averages, app.year_period_system(v_class.academic_year_id)) as r
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
         app.apply_academic_rules(v_current, a.averages, app.year_period_system(v_class.academic_year_id)),
         app.apply_academic_rules(p_rules, a.averages, app.year_period_system(v_class.academic_year_id))
  from app.class_period_averages(p_class_id) a join public.students s on s.id = a.student_id
  order by s.last_name, s.first_name;
end;
$$;

-- -----------------------------------------------------------------------------
-- Moteur unique du bulletin (version 8800 + récapitulatif annuel, arrondi par matière).
-- -----------------------------------------------------------------------------
create or replace function app.report_card_rows(p_class_id uuid, p_period_id uuid)
returns table (student_id uuid, average numeric, rank integer, class_size integer, data jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select c,
           coalesce(c ->> 'calculation', 'assessments') as calc,
           coalesce(nullif(c ->> 'decimals', '')::integer, 2) as dec,
           coalesce(c ->> 'rounding', 'half_up') as rnd,
           -- Moyenne de matière arrondie AVANT points et moyenne générale (calcul refaisable à la main).
           coalesce((c ->> 'round_subject_first')::boolean, false) as rfirst
    from (
      select coalesce(rcs.config, app.default_report_card_config()) as c
      from public.classes cl
      left join public.report_card_settings rcs on rcs.organization_id = cl.organization_id
      where cl.id = p_class_id
    ) x
  ),
  period as (
    select starts_on, ends_on from public.academic_periods where id = p_period_id
  ),
  -- Dernière période de l'année (T3, S2…) : seul bulletin portant le récapitulatif
  -- annuel et la décision de fin d'année (module scolaire uniquement).
  yearinfo as (
    select pr.academic_year_id,
           pr.id = (select p2.id from public.academic_periods p2 where p2.academic_year_id = pr.academic_year_id
                     order by p2.sequence desc, p2.starts_on desc limit 1) as is_final,
           app.year_period_system(pr.academic_year_id) as system,
           cl.organization_id,
           app.org_component(o.type) = 'school' as is_school
    from public.academic_periods pr
    join public.classes cl on cl.id = p_class_id
    join public.organizations o on o.id = cl.organization_id
    where pr.id = p_period_id
  ),
  cols as (
    select x.value ->> 'key' as key, x.value ->> 'label' as label, x.ordinality::integer as pos,
           coalesce(x.value -> 'kinds', '[]'::jsonb) as kinds,
           coalesce(nullif(x.value ->> 'weight', '')::numeric, 1) as weight
    from cfg, jsonb_array_elements(coalesce(cfg.c -> 'columns', '[]'::jsonb)) with ordinality x
  ),
  grps as (
    select x.value ->> 'key' as key, x.value ->> 'label' as label, x.ordinality::integer as pos,
           coalesce(x.value -> 'kinds', '[]'::jsonb) as kinds,
           coalesce(x.value ->> 'mode', 'average') as mode,
           coalesce(nullif(x.value ->> 'weight', '')::numeric, 1) as weight,
           coalesce((x.value ->> 'use_coefficients')::boolean, false) as use_coef,
           -- Libellés des colonnes du bulletin : une colonne par note (INT 1, INT 2… /
           -- DEV 1, DEV 2…) puis, pour un groupe en moyenne, sa moyenne (MOYEN INTERRO).
           left(coalesce(nullif(btrim(x.value ->> 'note_label'), ''),
                case when length(x.value ->> 'label') > 5 then left(x.value ->> 'label', 3) else x.value ->> 'label' end), 20) as note_label,
           left(coalesce(nullif(btrim(x.value ->> 'average_label'), ''), 'MOYEN ' || (x.value ->> 'label')), 30) as avg_label
    from cfg, jsonb_array_elements(coalesce(cfg.c -> 'groups', '[]'::jsonb)) with ordinality x
  ),
  pupils as (
    select e.student_id from public.enrollments e where e.class_id = p_class_id and e.status = 'validated'
  ),
  subjects as (
    select cs.id, cs.coefficient, cs.sort_order, s.name as subject, s.code,
           nullif(btrim(coalesce(t.first_name, '') || ' ' || coalesce(t.last_name, '')), '') as teacher
    from public.class_subjects cs
    join public.subjects s on s.id = cs.subject_id
    left join public.staff_members t on t.id = cs.teacher_id
    where cs.class_id = p_class_id
  ),
  assess as (
    select a.id, a.class_subject_id, a.kind, a.title, a.assessed_on, a.coefficient, a.max_score, a.column_key, a.created_at,
           row_number() over (partition by a.class_subject_id, a.kind order by a.assessed_on, a.created_at, a.id) as kind_rank
    from public.assessments a
    where a.class_id = p_class_id and a.academic_period_id = p_period_id
  ),
  assess_col as (
    select a.*,
      coalesce(
        (select k.key from cols k where k.key = a.column_key),
        (select m.key from (
           select k.key, row_number() over (order by k.pos) as rn, count(*) over () as n
           from cols k where k.kinds ? a.kind
         ) m where m.rn = least(a.kind_rank, m.n))
      ) as col_key,
      -- Groupe choisi à la création de l'évaluation (INTERRO, DEVOIR, COMPO…),
      -- sinon déduit du type d'évaluation.
      coalesce(
        (select g.key from grps g where g.key = a.column_key),
        (select g.key from grps g where g.kinds ? a.kind order by g.pos limit 1)
      ) as grp_key
    from assess a
  ),
  -- Rang de l'évaluation dans son groupe et sa matière (INT 1, INT 2…, DEV 1…).
  assess_grp as (
    select ac.*,
           row_number() over (partition by ac.class_subject_id, ac.grp_key order by ac.assessed_on, ac.created_at, ac.id)::integer as grp_rank
    from assess_col ac
  ),
  -- Nombre de colonnes par groupe : le plus grand nombre d'évaluations du groupe
  -- dans une matière de la classe pour la période (dynamique).
  grp_count as (
    select x.grp_key, max(x.n)::integer as n
    from (select ag.class_subject_id, ag.grp_key, count(*) as n from assess_grp ag where ag.grp_key is not null group by 1, 2) x
    group by x.grp_key
  ),
  -- Note vide ou dispensée : jamais comptée (≠ zéro). Barème quelconque → sur 20.
  notes as (
    select gr.student_id, a.class_subject_id, a.col_key, a.grp_key, a.grp_rank, a.id as assessment_id, a.title, a.kind,
           a.assessed_on, gr.score, a.max_score, gr.score / a.max_score * 20 as note20, a.coefficient
    from public.grades gr
    join assess_grp a on a.id = gr.assessment_id
    where gr.score is not null and not gr.is_exempt and gr.student_id in (select student_id from pupils)
  ),
  col_avg as (
    select n.student_id, n.class_subject_id, n.col_key, sum(n.note20 * n.coefficient) / sum(n.coefficient) as value
    from notes n where n.col_key is not null
    group by n.student_id, n.class_subject_id, n.col_key
  ),
  -- Mode « groups » : valeurs entrant dans la moyenne de la matière.
  grp_entries as (
    -- Moyenne des interrogations = valeur affichée dans « MOYEN INTERRO » (arrondie
    -- quand la moyenne de matière l'est aussi : calcul refaisable à la main).
    select n.student_id, n.class_subject_id, g.key as grp_key, g.pos,
           case when cfg.rfirst then app.rc_round(
             case when g.use_coef then sum(n.note20 * n.coefficient) / nullif(sum(n.coefficient), 0) else avg(n.note20) end, cfg.dec, cfg.rnd)
           else case when g.use_coef then sum(n.note20 * n.coefficient) / nullif(sum(n.coefficient), 0) else avg(n.note20) end end as value,
           g.weight, count(*)::integer as notes_count, min(n.assessed_on) as d
    from notes n join grps g on g.key = n.grp_key cross join cfg
    where g.mode = 'average'
    group by n.student_id, n.class_subject_id, g.key, g.pos, g.weight, g.use_coef, cfg.rfirst, cfg.dec, cfg.rnd
    union all
    select n.student_id, n.class_subject_id, g.key, g.pos, n.note20,
           g.weight * case when g.use_coef then n.coefficient else 1 end, 1, n.assessed_on
    from notes n join grps g on g.key = n.grp_key
    where g.mode = 'each'
  ),
  -- Valeurs affichées : chaque note (clé « groupe#rang ») et la moyenne des groupes
  -- en moyenne (clé « groupe ») — exactement celle qui entre dans « Moy. ».
  grp_display as (
    select n.student_id, n.class_subject_id, n.grp_key || '#' || n.grp_rank as key, n.note20 as value
    from notes n where n.grp_key is not null
    union all
    select ge.student_id, ge.class_subject_id, ge.grp_key, ge.value
    from grp_entries ge join grps g on g.key = ge.grp_key
    where g.mode = 'average'
  ),
  subject_avg as (
    select n.student_id, n.class_subject_id,
           case (select calc from cfg)
             when 'columns' then (
               select sum(ca.value * k.weight) / nullif(sum(k.weight), 0)
               from col_avg ca join cols k on k.key = ca.col_key
               where ca.student_id = n.student_id and ca.class_subject_id = n.class_subject_id)
             when 'groups' then (
               select sum(ge.value * ge.weight) / nullif(sum(ge.weight), 0)
               from grp_entries ge
               where ge.student_id = n.student_id and ge.class_subject_id = n.class_subject_id)
             else sum(n.note20 * n.coefficient) / nullif(sum(n.coefficient), 0) end as average
    from notes n
    group by n.student_id, n.class_subject_id
  ),
  subject_ranked as (
    select sa.student_id, sa.class_subject_id, sa.average,
           case when cfg.rfirst then app.rc_round(sa.average, cfg.dec, cfg.rnd) else sa.average end as used,
           rank() over (partition by sa.class_subject_id order by sa.average desc) as subject_rank
    from subject_avg sa cross join cfg where sa.average is not null
  ),
  subject_stats as (
    select sr.class_subject_id, avg(sr.average) as class_average, min(sr.average) as min_average, max(sr.average) as max_average
    from subject_ranked sr group by sr.class_subject_id
  ),
  general as (
    select sr.student_id, sum(sr.used * sb.coefficient) / nullif(sum(sb.coefficient), 0) as average,
           sum(sb.coefficient) as coefficient_total, sum(sr.used * sb.coefficient) as points
    from subject_ranked sr join subjects sb on sb.id = sr.class_subject_id
    group by sr.student_id
  ),
  ranked as (
    select p.student_id, app.rc_round(g.average, cfg.dec, cfg.rnd) as average, g.coefficient_total, g.points,
           (case when g.average is not null then rank() over (order by g.average desc nulls last) end)::integer as rank
    from pupils p cross join cfg left join general g on g.student_id = p.student_id
  ),
  class_info as (
    select count(*)::integer as size, app.rc_round(avg(r.average), cfg.dec, cfg.rnd) as class_average,
           max(r.average) as best, min(r.average) as worst
    from ranked r cross join cfg
    group by cfg.dec, cfg.rnd
  ),
  -- Récapitulatif annuel : moyenne de chaque période (bulletins de la classe ;
  -- la période courante vient du calcul ci-dessus), règles académiques de
  -- l'établissement, décision du conseil si elle a été saisie.
  annual as (
    select r.student_id,
           ar.res,
           ar.inputs,
           res_council.decision_label as council_decision
    from ranked r
    cross join yearinfo yi
    cross join lateral (
      select app.apply_academic_rules(ru.rules, x.averages, yi.system) as res, x.inputs
      from (
        select array_agg(case when pe.id = p_period_id then r.average else rc.average end order by pe.sequence, pe.starts_on) as averages,
               jsonb_agg(jsonb_build_object('period_id', pe.id, 'name', pe.name,
                 'average', case when pe.id = p_period_id then r.average else rc.average end) order by pe.sequence, pe.starts_on) as inputs
        from public.academic_periods pe
        left join public.report_cards rc on rc.student_id = r.student_id and rc.class_id = p_class_id and rc.academic_period_id = pe.id
        where pe.academic_year_id = yi.academic_year_id
      ) x
      cross join lateral (select e.rules from app.effective_academic_rules(yi.organization_id, 'school') e) ru
    ) ar
    left join lateral (
      select a.decision_label from public.annual_results a
      where a.student_id = r.student_id and a.class_id = p_class_id
        and (a.status = 'validated' or a.decision_reason is not null)
    ) res_council on true
    where yi.is_final and yi.is_school
  ),
  absences as (
    select r.student_id,
           count(*) filter (where r.status in ('absent', 'excused')) as absences,
           count(*) filter (where r.status in ('absent', 'excused') and r.is_justified) as justified,
           count(*) filter (where r.status = 'late') as lates
    from public.attendance_records r
    join public.attendance_sessions s on s.id = r.session_id
    cross join period pr
    where s.class_id = p_class_id and s.status = 'validated' and s.session_date between pr.starts_on and pr.ends_on
    group by r.student_id
  ),
  -- Traçabilité : notes retenues et formule appliquée, par élève et par matière.
  trace as (
    select n.student_id, n.class_subject_id,
           jsonb_agg(jsonb_build_object(
             'title', n.title, 'kind', n.kind, 'date', n.assessed_on, 'score', n.score, 'max', n.max_score,
             'on20', round(n.note20, 2), 'coefficient', n.coefficient,
             'group', n.grp_key, 'column', n.col_key
           ) order by n.assessed_on, n.title) as notes
    from notes n
    group by n.student_id, n.class_subject_id
  ),
  formula as (
    select ge.student_id, ge.class_subject_id,
           '(' || string_agg(
             trim(to_char(round(ge.value, 2), 'FM9990.99'), '.')
               || case when ge.weight <> 1 then ' × ' || trim(to_char(ge.weight, 'FM9990.99'), '.') else '' end,
             ' + ' order by ge.pos, ge.d, ge.value desc) || ') ÷ ' || trim(to_char(sum(ge.weight), 'FM9990.99'), '.') as text
    from grp_entries ge
    group by ge.student_id, ge.class_subject_id
  ),
  details as (
    select p.student_id,
           coalesce(jsonb_agg(jsonb_build_object(
             'class_subject_id', sb.id,
             'subject', sb.subject,
             'code', sb.code,
             'teacher', sb.teacher,
             'coefficient', sb.coefficient,
             'columns', case when cfg.calc = 'groups' then coalesce((
                select jsonb_object_agg(gd.key, app.rc_round(gd.value, cfg.dec, cfg.rnd)) from grp_display gd
                where gd.student_id = p.student_id and gd.class_subject_id = sb.id), '{}'::jsonb)
              else coalesce((
                select jsonb_object_agg(ca.col_key, app.rc_round(ca.value, cfg.dec, cfg.rnd)) from col_avg ca
                where ca.student_id = p.student_id and ca.class_subject_id = sb.id), '{}'::jsonb) end,
             'average', app.rc_round(sr.average, cfg.dec, cfg.rnd),
             'points', app.rc_round(sr.used * sb.coefficient, cfg.dec, cfg.rnd),
             'rank', sr.subject_rank,
             'class_average', app.rc_round(ss.class_average, cfg.dec, cfg.rnd),
             'min', app.rc_round(ss.min_average, cfg.dec, cfg.rnd),
             'max', app.rc_round(ss.max_average, cfg.dec, cfg.rnd),
             'mention', app.rule_label(cfg.c -> 'mentions', sr.average),
             'detail', jsonb_build_object(
               'notes', coalesce(tr.notes, '[]'::jsonb),
               'entries', case when cfg.calc = 'groups' then (
                  select coalesce(jsonb_agg(jsonb_build_object(
                    'group', ge.grp_key, 'value', round(ge.value, 4), 'weight', ge.weight, 'notes', ge.notes_count)
                    order by ge.pos, ge.d, ge.value desc), '[]'::jsonb)
                  from grp_entries ge where ge.student_id = p.student_id and ge.class_subject_id = sb.id) end,
               'formula', case when cfg.calc = 'groups' then fo.text end,
               'unrounded', round(sr.average, 6)
             )
           ) order by sb.sort_order, sb.subject), '[]'::jsonb) as subjects
    from pupils p
    cross join subjects sb
    cross join cfg
    left join subject_ranked sr on sr.student_id = p.student_id and sr.class_subject_id = sb.id
    left join subject_stats ss on ss.class_subject_id = sb.id
    left join trace tr on tr.student_id = p.student_id and tr.class_subject_id = sb.id
    left join formula fo on fo.student_id = p.student_id and fo.class_subject_id = sb.id
    group by p.student_id
  )
  select r.student_id, r.average, r.rank, ci.size,
         jsonb_build_object(
           'subjects', d.subjects,
           'columns', case when cfg.calc = 'groups'
             -- INT 1 … INT N, MOYEN INTERRO, DEV 1 … DEV N (ordre des groupes, nombre dynamique).
             then (select coalesce(jsonb_agg(z.col order by z.pos, z.ord), '[]'::jsonb) from (
                     select g.pos, i as ord,
                            jsonb_build_object('key', g.key || '#' || i, 'label', g.note_label || ' ' || i, 'weight', g.weight,
                                               'mode', g.mode, 'group', g.key, 'type', 'note') as col
                     from grps g join grp_count gc on gc.grp_key = g.key cross join generate_series(1, gc.n) i
                     union all
                     select g.pos, 2147483647,
                            jsonb_build_object('key', g.key, 'label', g.avg_label, 'weight', g.weight,
                                               'mode', g.mode, 'group', g.key, 'type', 'average')
                     from grps g where g.mode = 'average'
                   ) z)
             else (select coalesce(jsonb_agg(jsonb_build_object('key', k.key, 'label', k.label, 'weight', k.weight) order by k.pos), '[]'::jsonb) from cols k) end,
           'calculation', cfg.calc,
           'rules', jsonb_build_object(
             'calculation', cfg.calc, 'decimals', cfg.dec, 'rounding', cfg.rnd, 'round_subject_first', cfg.rfirst,
             'groups', case when cfg.calc = 'groups' then cfg.c -> 'groups' end,
             'columns', case when cfg.calc = 'columns' then cfg.c -> 'columns' end,
             'scale', 20
           ),
           'class_average', ci.class_average,
           'best_average', ci.best,
           'worst_average', ci.worst,
           'coefficient_total', r.coefficient_total,
           'points_total', app.rc_round(r.points, cfg.dec, cfg.rnd),
           'mention', app.rule_label(cfg.c -> 'mentions', r.average),
           -- Décision de fin d'année : uniquement sur le dernier bulletin de l'année.
           'proposed_decision', case when an.student_id is not null then coalesce(an.council_decision, an.res ->> 'decision_label') end,
           'annual', case when an.student_id is not null then jsonb_build_object(
             'system', yi.system,
             'periods', an.inputs,
             'average', (an.res ->> 'average')::numeric,
             'formula', an.res ->> 'formula',
             'complete', (an.res ->> 'complete')::boolean,
             'mention', an.res ->> 'mention',
             'decision', coalesce(an.council_decision, an.res ->> 'decision_label'),
             'decision_source', case when an.council_decision is not null then 'council' else 'rules' end
           ) end,
           'attendance', jsonb_build_object('absences', coalesce(ab.absences, 0), 'justified', coalesce(ab.justified, 0), 'lates', coalesce(ab.lates, 0)),
           'computed_at', now()
         )
  from ranked r
  cross join class_info ci
  cross join cfg
  cross join yearinfo yi
  join details d on d.student_id = r.student_id
  left join annual an on an.student_id = r.student_id
  left join absences ab on ab.student_id = r.student_id;
$$;

-- -----------------------------------------------------------------------------
-- Moyenne d'une période (T1, T2…) modifiée → récapitulatif annuel du dernier
-- bulletin de l'année recalculé (bulletins en brouillon uniquement).
-- -----------------------------------------------------------------------------
create or replace function app.report_cards_refresh_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target record;
begin
  for v_target in
    select distinct x.class_id, f.id as final_period
    from changed_new x
    join changed_old o on o.id = x.id
    join public.academic_periods p on p.id = x.academic_period_id
    cross join lateral (
      select p2.id from public.academic_periods p2 where p2.academic_year_id = p.academic_year_id
      order by p2.sequence desc, p2.starts_on desc limit 1
    ) f
    where f.id <> x.academic_period_id and x.average is distinct from o.average
  loop
    perform app.refresh_report_cards(v_target.class_id, v_target.final_period);
  end loop;
  return null;
end;
$$;
create trigger report_cards_refresh_final_update after update on public.report_cards
  referencing old table as changed_old new table as changed_new for each statement execute function app.report_cards_refresh_final();

-- Résultats annuels (décision du conseil) modifiés → dernier bulletin recalculé.
create or replace function app.annual_results_refresh_final()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target record;
begin
  for v_target in
    select distinct x.class_id,
           (select p2.id from public.academic_periods p2 where p2.academic_year_id = x.academic_year_id
             order by p2.sequence desc, p2.starts_on desc limit 1) as final_period
    from changed_new x
  loop
    perform app.refresh_report_cards(v_target.class_id, v_target.final_period);
  end loop;
  return null;
end;
$$;
create trigger annual_results_refresh_final_insert after insert on public.annual_results
  referencing new table as changed_new for each statement execute function app.annual_results_refresh_final();
create trigger annual_results_refresh_final_update after update on public.annual_results
  referencing new table as changed_new for each statement execute function app.annual_results_refresh_final();

-- Configuration par défaut : option explicite, désactivée ; les nouveaux
-- établissements du module scolaire l'activent (déclencheur ci-dessous).
create or replace function app.default_report_card_config()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{
    "title": "BULLETIN DE NOTES",
    "calculation": "assessments",
    "columns": [
      {"key": "interro1", "label": "INTERRO 1", "kinds": ["test", "oral"], "weight": 1},
      {"key": "interro2", "label": "INTERRO 2", "kinds": ["test", "oral"], "weight": 1},
      {"key": "devoir", "label": "DEVOIR", "kinds": ["homework", "practical", "project"], "weight": 1},
      {"key": "examen", "label": "EXAMEN", "kinds": ["exam", "other"], "weight": 2}
    ],
    "decimals": 2,
    "rounding": "half_up",
    "round_subject_first": false,
    "show_teacher": true,
    "show_rank": true,
    "show_subject_rank": false,
    "show_class_stats": true,
    "show_attendance": true,
    "show_appreciation": true,
    "mentions": [
      {"min": 16, "label": "Très bien"}, {"min": 14, "label": "Bien"}, {"min": 12, "label": "Assez bien"},
      {"min": 10, "label": "Passable"}, {"min": 0, "label": "Insuffisant"}
    ],
    "decisions": [
      {"min": 10, "label": "Admis(e) en classe supérieure"}, {"min": 8.5, "label": "Autorisé(e) à redoubler"},
      {"min": 0, "label": "Exclu(e) pour insuffisance de résultats"}
    ],
    "signatures": [{"label": "Le professeur principal"}, {"label": "Le chef d''établissement"}],
    "show_logo": true,
    "show_stamp": true,
    "show_qr": true,
    "primary_color": "#0B1F3A",
    "accent_color": "#1E6FFF",
    "footer_note": ""
  }'::jsonb || jsonb_build_object('groups', app.default_report_card_groups());
$$;

-- Nouvel établissement scolaire : règle par type d'évaluation et moyenne de
-- matière arrondie avant points et moyenne générale (15,67 × 4 = 62,68).
-- Formation et université : inchangés. Configurations existantes : inchangées.
create or replace function app.organization_report_card_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.report_card_settings (organization_id, config)
  values (
    new.id,
    app.default_report_card_config()
      || case when app.org_component(new.type) = 'school' then '{"calculation": "groups", "round_subject_first": true}'::jsonb else '{}'::jsonb end
  )
  on conflict do nothing;
  return new;
end;
$$;

-- Recalcul des bulletins brouillons : un seul à la fois par classe et période
-- (deux enregistrements de notes simultanés de T1 et T2 recalculent tous deux
-- le récapitulatif du T3 : verrou pour éviter tout interblocage).
create or replace function app.refresh_report_cards(p_class_id uuid, p_period_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_class_id is null or p_period_id is null or not exists (
    select 1 from public.report_cards
    where class_id = p_class_id and academic_period_id = p_period_id and status = 'draft'
  ) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('report_cards:' || p_class_id::text || ':' || p_period_id::text, 0));
  -- Données dérivées : le journal d'audit conserve déjà les notes sources.
  perform set_config('app.skip_audit', 'on', true);
  update public.report_cards rc
     set average = r.average, rank = r.rank, class_size = r.class_size, data = r.data
    from app.report_card_rows(p_class_id, p_period_id) r
   where rc.student_id = r.student_id and rc.class_id = p_class_id
     and rc.academic_period_id = p_period_id and rc.status = 'draft';
  perform set_config('app.skip_audit', 'off', true);
end;
$$;

-- -----------------------------------------------------------------------------
-- Tous les établissements du module scolaire passent au nouveau calcul
-- (INT → MOYEN INTERRO → DEV → Moy. → Points → moyenne générale). Les anciens
-- réglages (colonnes, pondérations…) restent stockés : rien n'est supprimé.
-- Bulletins brouillons recalculés ; bulletins publiés inchangés (documents émis).
-- -----------------------------------------------------------------------------
update public.report_card_settings rcs
   set config = rcs.config
                || jsonb_build_object('calculation', 'groups', 'round_subject_first', true)
                || case when jsonb_typeof(rcs.config -> 'groups') = 'array' and jsonb_array_length(rcs.config -> 'groups') > 0
                        then '{}'::jsonb else jsonb_build_object('groups', app.default_report_card_groups()) end
  from public.organizations o
 where o.id = rcs.organization_id
   and app.org_component(o.type) = 'school'
   and (coalesce(rcs.config ->> 'calculation', 'assessments') <> 'groups'
        or coalesce((rcs.config ->> 'round_subject_first')::boolean, false) is not true);

do $$
declare
  v record;
begin
  for v in
    select distinct rc.class_id, rc.academic_period_id
    from public.report_cards rc
    join public.organizations o on o.id = rc.organization_id
    where rc.status = 'draft' and app.org_component(o.type) = 'school'
  loop
    perform app.refresh_report_cards(v.class_id, v.academic_period_id);
  end loop;
end;
$$;
