-- =============================================================================
-- NeoScool — Calcul paramétrable des bulletins (même moteur, nouveau mode).
--
-- Le moteur unique app.report_card_rows est étendu (aucun système parallèle) :
--
--   Mode « groups » (par type d'évaluation) — règle par défaut du module scolaire :
--     • chaque groupe rassemble des évaluations (interrogations, devoirs,
--       compositions…) : groupe choisi à la création de l'évaluation, sinon
--       déduit de son type ; aucun nombre d'évaluations n'est fixé ;
--     • groupe « moyenne » : ses notes donnent UNE valeur (leur moyenne) ;
--     • groupe « chaque note » : chaque note compte pour une valeur ;
--     • moyenne matière = Σ(valeur × poids) ÷ Σ poids des valeurs présentes.
--     Avec Interrogations = moyenne (poids 1) et Devoirs = chaque note (poids 1) :
--       (moy. interros + D1 + … + Dn) ÷ (1 + n).
--     Option par groupe : tenir compte du coefficient de chaque évaluation
--     (moyenne pondérée) ou non (moyenne simple).
--   Modes existants « assessments » et « columns » : inchangés.
--
-- Pour tous les modes : note sur un barème quelconque ramenée sur 20, note vide
-- ou dispensée jamais comptée (≠ zéro), aucune division par zéro, nombre de
-- décimales et règle d'arrondi configurables, détail du calcul conservé dans
-- le bulletin (traçabilité).
--
-- Les établissements existants gardent leur configuration (aucun résultat
-- modifié) ; les nouveaux établissements du module scolaire démarrent en mode
-- « groups ».
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Arrondi configurable
-- -----------------------------------------------------------------------------
create or replace function app.rc_round(p_value numeric, p_decimals integer, p_mode text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null then null
    when coalesce(p_mode, 'half_up') = 'down' then trunc(p_value, greatest(0, least(coalesce(p_decimals, 2), 3)))
    when p_mode = 'up' then
      ceil(p_value * power(10::numeric, greatest(0, least(coalesce(p_decimals, 2), 3))))
        / power(10::numeric, greatest(0, least(coalesce(p_decimals, 2), 3)))
    else round(p_value, greatest(0, least(coalesce(p_decimals, 2), 3)))
  end;
$$;

-- -----------------------------------------------------------------------------
-- Configuration par défaut : groupes + arrondi (champs ajoutés, rien de retiré)
-- -----------------------------------------------------------------------------
create or replace function app.default_report_card_groups()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '[
    {"key": "interro", "label": "INTERRO", "kinds": ["test", "oral"], "mode": "average", "weight": 1, "use_coefficients": false},
    {"key": "devoir", "label": "DEVOIR", "kinds": ["homework", "practical", "project"], "mode": "each", "weight": 1, "use_coefficients": false},
    {"key": "compo", "label": "COMPO", "kinds": ["exam", "other"], "mode": "each", "weight": 1, "use_coefficients": false}
  ]'::jsonb;
$$;

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

-- Nouvel établissement : module scolaire → calcul par type d'évaluation ;
-- formation et université gardent la moyenne pondérée des évaluations.
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
      || case when app.org_component(new.type) = 'school' then '{"calculation": "groups"}'::jsonb else '{}'::jsonb end
  )
  on conflict do nothing;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Validation de la configuration (étendue au mode « groups » et à l'arrondi)
-- -----------------------------------------------------------------------------
create or replace function app.report_card_settings_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := new.config;
  v_col jsonb;
  v_keys text[] := '{}';
  v_kinds text[] := '{}';
  v_kind text;
  v_valid_kinds constant text[] := array['test', 'exam', 'homework', 'oral', 'practical', 'project', 'other'];
begin
  if coalesce(v_cfg ->> 'calculation', 'assessments') not in ('assessments', 'columns', 'groups') then
    raise exception 'Mode de calcul inconnu.' using errcode = 'check_violation';
  end if;
  if jsonb_typeof(coalesce(v_cfg -> 'columns', '[]')) <> 'array' or jsonb_array_length(coalesce(v_cfg -> 'columns', '[]')) > 12 then
    raise exception 'Les colonnes d''évaluation sont invalides (12 au maximum).' using errcode = 'check_violation';
  end if;
  for v_col in select * from jsonb_array_elements(coalesce(v_cfg -> 'columns', '[]')) loop
    if coalesce(v_col ->> 'key', '') !~ '^[a-z0-9_]{1,30}$' or coalesce(btrim(v_col ->> 'label'), '') = '' then
      raise exception 'Chaque colonne doit avoir un identifiant et un libellé.' using errcode = 'check_violation';
    end if;
    if (v_col ->> 'key') = any (v_keys) then
      raise exception 'Colonne en double : %', v_col ->> 'key' using errcode = 'check_violation';
    end if;
    if coalesce(nullif(v_col ->> 'weight', '')::numeric, 1) <= 0 then
      raise exception 'La pondération de la colonne % doit être positive.', v_col ->> 'label' using errcode = 'check_violation';
    end if;
    v_keys := v_keys || (v_col ->> 'key');
  end loop;

  -- Groupes de types d'évaluation (mode « groups »)
  if jsonb_typeof(coalesce(v_cfg -> 'groups', '[]')) <> 'array' or jsonb_array_length(coalesce(v_cfg -> 'groups', '[]')) > 8 then
    raise exception 'Les groupes d''évaluations sont invalides (8 au maximum).' using errcode = 'check_violation';
  end if;
  v_keys := '{}';
  for v_col in select * from jsonb_array_elements(coalesce(v_cfg -> 'groups', '[]')) loop
    if coalesce(v_col ->> 'key', '') !~ '^[a-z0-9_]{1,30}$' or coalesce(btrim(v_col ->> 'label'), '') = '' then
      raise exception 'Chaque groupe doit avoir un identifiant et un libellé.' using errcode = 'check_violation';
    end if;
    if (v_col ->> 'key') = any (v_keys) then
      raise exception 'Groupe en double : %', v_col ->> 'key' using errcode = 'check_violation';
    end if;
    if coalesce(v_col ->> 'mode', 'average') not in ('average', 'each') then
      raise exception 'Mode du groupe % inconnu.', v_col ->> 'label' using errcode = 'check_violation';
    end if;
    if coalesce(nullif(v_col ->> 'weight', '')::numeric, 1) <= 0 or coalesce(nullif(v_col ->> 'weight', '')::numeric, 1) > 100 then
      raise exception 'Le poids du groupe % doit être compris entre 0 (exclu) et 100.', v_col ->> 'label' using errcode = 'check_violation';
    end if;
    if jsonb_typeof(coalesce(v_col -> 'kinds', '[]')) <> 'array' then
      raise exception 'Types d''évaluation invalides pour le groupe %.', v_col ->> 'label' using errcode = 'check_violation';
    end if;
    for v_kind in select jsonb_array_elements_text(coalesce(v_col -> 'kinds', '[]')) loop
      if not (v_kind = any (v_valid_kinds)) then
        raise exception 'Type d''évaluation inconnu : %', v_kind using errcode = 'check_violation';
      end if;
      -- Un type dans un seul groupe : une note n'est jamais comptée deux fois.
      if v_kind = any (v_kinds) then
        raise exception 'Le type d''évaluation « % » est rangé dans deux groupes.', v_kind using errcode = 'check_violation';
      end if;
      v_kinds := v_kinds || v_kind;
    end loop;
    v_keys := v_keys || (v_col ->> 'key');
  end loop;
  if v_cfg ->> 'calculation' = 'groups' and cardinality(v_kinds) = 0 then
    raise exception 'Le calcul par type d''évaluation nécessite au moins un groupe avec un type.' using errcode = 'check_violation';
  end if;

  if coalesce(v_cfg ->> 'decimals', '2') !~ '^[0-3]$' then
    raise exception 'Nombre de décimales invalide (0 à 3).' using errcode = 'check_violation';
  end if;
  if coalesce(v_cfg ->> 'rounding', 'half_up') not in ('half_up', 'down', 'up') then
    raise exception 'Règle d''arrondi inconnue.' using errcode = 'check_violation';
  end if;
  if coalesce(v_cfg ->> 'primary_color', '#000000') !~ '^#[0-9A-Fa-f]{6}$'
     or coalesce(v_cfg ->> 'accent_color', '#000000') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Couleur invalide (format #RRGGBB).' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Moteur unique du bulletin (remplace la version 1300, mêmes sorties + détail).
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
           coalesce(c ->> 'rounding', 'half_up') as rnd
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
           coalesce((x.value ->> 'use_coefficients')::boolean, false) as use_coef
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
    select a.id, a.class_subject_id, a.kind, a.title, a.assessed_on, a.coefficient, a.max_score, a.column_key,
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
  -- Note vide ou dispensée : jamais comptée (≠ zéro). Barème quelconque → sur 20.
  notes as (
    select gr.student_id, a.class_subject_id, a.col_key, a.grp_key, a.id as assessment_id, a.title, a.kind,
           a.assessed_on, gr.score, a.max_score, gr.score / a.max_score * 20 as note20, a.coefficient
    from public.grades gr
    join assess_col a on a.id = gr.assessment_id
    where gr.score is not null and not gr.is_exempt and gr.student_id in (select student_id from pupils)
  ),
  col_avg as (
    select n.student_id, n.class_subject_id, n.col_key, sum(n.note20 * n.coefficient) / sum(n.coefficient) as value
    from notes n where n.col_key is not null
    group by n.student_id, n.class_subject_id, n.col_key
  ),
  -- Mode « groups » : valeurs entrant dans la moyenne de la matière.
  grp_entries as (
    select n.student_id, n.class_subject_id, g.key as grp_key, g.pos,
           case when g.use_coef then sum(n.note20 * n.coefficient) / nullif(sum(n.coefficient), 0) else avg(n.note20) end as value,
           g.weight, count(*)::integer as notes_count, min(n.assessed_on) as d
    from notes n join grps g on g.key = n.grp_key
    where g.mode = 'average'
    group by n.student_id, n.class_subject_id, g.key, g.pos, g.weight, g.use_coef
    union all
    select n.student_id, n.class_subject_id, g.key, g.pos, n.note20,
           g.weight * case when g.use_coef then n.coefficient else 1 end, 1, n.assessed_on
    from notes n join grps g on g.key = n.grp_key
    where g.mode = 'each'
  ),
  grp_display as (
    select n.student_id, n.class_subject_id, n.grp_key, avg(n.note20) as value
    from notes n where n.grp_key is not null
    group by n.student_id, n.class_subject_id, n.grp_key
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
           rank() over (partition by sa.class_subject_id order by sa.average desc) as subject_rank
    from subject_avg sa where sa.average is not null
  ),
  subject_stats as (
    select sr.class_subject_id, avg(sr.average) as class_average, min(sr.average) as min_average, max(sr.average) as max_average
    from subject_ranked sr group by sr.class_subject_id
  ),
  general as (
    select sr.student_id, sum(sr.average * sb.coefficient) / nullif(sum(sb.coefficient), 0) as average,
           sum(sb.coefficient) as coefficient_total, sum(sr.average * sb.coefficient) as points
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
                select jsonb_object_agg(gd.grp_key, app.rc_round(gd.value, cfg.dec, cfg.rnd)) from grp_display gd
                where gd.student_id = p.student_id and gd.class_subject_id = sb.id), '{}'::jsonb)
              else coalesce((
                select jsonb_object_agg(ca.col_key, app.rc_round(ca.value, cfg.dec, cfg.rnd)) from col_avg ca
                where ca.student_id = p.student_id and ca.class_subject_id = sb.id), '{}'::jsonb) end,
             'average', app.rc_round(sr.average, cfg.dec, cfg.rnd),
             'points', app.rc_round(sr.average * sb.coefficient, cfg.dec, cfg.rnd),
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
             then (select coalesce(jsonb_agg(jsonb_build_object('key', g.key, 'label', g.label, 'weight', g.weight, 'mode', g.mode) order by g.pos), '[]'::jsonb) from grps g)
             else (select coalesce(jsonb_agg(jsonb_build_object('key', k.key, 'label', k.label, 'weight', k.weight) order by k.pos), '[]'::jsonb) from cols k) end,
           'calculation', cfg.calc,
           'rules', jsonb_build_object(
             'calculation', cfg.calc, 'decimals', cfg.dec, 'rounding', cfg.rnd,
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
           'proposed_decision', app.rule_label(cfg.c -> 'decisions', r.average),
           'attendance', jsonb_build_object('absences', coalesce(ab.absences, 0), 'justified', coalesce(ab.justified, 0), 'lates', coalesce(ab.lates, 0)),
           'computed_at', now()
         )
  from ranked r
  cross join class_info ci
  cross join cfg
  join details d on d.student_id = r.student_id
  left join absences ab on ab.student_id = r.student_id;
$$;
