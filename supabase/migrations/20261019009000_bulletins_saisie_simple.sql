-- =============================================================================
-- NeoScool — Saisie simple des notes : INT 1, INT 2… / DEV 1, DEV 2…
--
--   • L'école choisit le nombre d'interrogations et de devoirs par trimestre et
--     par semestre (toutes classes, toutes matières) : config.slots, par défaut
--     3 interrogations et 2 devoirs ; pas de colonne COMPO (les compositions
--     comptent comme des devoirs).
--   • L'enseignant choisit une case (INT 1, DEV 2…) et saisit les notes :
--     public.open_grade_slot() retrouve ou crée l'évaluation de cette case
--     (une seule par matière, période et case — index unique).
--   • Le bulletin affiche toujours ces colonnes, dans cet ordre, même vides.
--   • Calculs inchangés : MOYEN INTERRO, Moy. = (MOYEN INTERRO + DEV…) ÷ (1 + n),
--     points, moyenne générale, récapitulatif et décision annuels.
-- =============================================================================

alter table public.assessments
  add column slot smallint check (slot is null or slot between 1 and 20);
comment on column public.assessments.slot is 'Case du bulletin choisie par l''enseignant (INT 1 → 1, DEV 2 → 2), avec column_key.';
create unique index assessments_slot_unique on public.assessments (class_subject_id, academic_period_id, column_key, slot)
  where slot is not null;

-- Groupes de la saisie simple : interrogations (moyenne) puis devoirs (chaque note).
create or replace function app.simple_report_card_groups()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '[
    {"key": "interro", "label": "INTERRO", "kinds": ["test", "oral"], "mode": "average", "weight": 1, "use_coefficients": false},
    {"key": "devoir", "label": "DEVOIR", "kinds": ["homework", "practical", "project", "exam", "other"], "mode": "each", "weight": 1, "use_coefficients": false}
  ]'::jsonb;
$$;

create or replace function app.default_report_card_slots()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select '{"trimester": {"interro": 3, "devoir": 2}, "semester": {"interro": 3, "devoir": 2}}'::jsonb;
$$;

-- Validation du nombre de cases (côté base, en plus du formulaire).
create or replace function app.report_card_settings_slots_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_sys text;
  v_key text;
  v_val text;
begin
  if not (new.config ? 'slots') then
    return new;
  end if;
  if jsonb_typeof(new.config -> 'slots') <> 'object' then
    raise exception 'Nombre d''interrogations et de devoirs invalide.' using errcode = 'check_violation';
  end if;
  foreach v_sys in array array['trimester', 'semester'] loop
    if jsonb_typeof(new.config -> 'slots' -> v_sys) <> 'object' then
      raise exception 'Nombre d''interrogations et de devoirs manquant (%).', v_sys using errcode = 'check_violation';
    end if;
    foreach v_key in array array['interro', 'devoir'] loop
      v_val := new.config -> 'slots' -> v_sys ->> v_key;
      if v_val is null or v_val !~ '^[0-9]{1,2}$'
         or v_val::integer > 10 or (v_key = 'interro' and v_val::integer < 1) then
        raise exception 'Interrogations : 1 à 10 ; devoirs : 0 à 10.' using errcode = 'check_violation';
      end if;
    end loop;
  end loop;
  return new;
end;
$$;
create trigger report_card_settings_slots_guard
  before insert or update on public.report_card_settings
  for each row execute function app.report_card_settings_slots_guard();

-- Une case doit exister dans les réglages de l'école pour la période.
create or replace function app.assessment_slot_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
begin
  if new.slot is null then
    return new;
  end if;
  if coalesce(new.column_key, '') not in ('interro', 'devoir') then
    raise exception 'Case inconnue : choisissez une interrogation (INT) ou un devoir (DEV).' using errcode = 'check_violation';
  end if;
  select nullif(rcs.config #>> array['slots', app.year_period_system(p.academic_year_id), new.column_key], '')::integer
    into v_max
    from public.academic_periods p
    left join public.report_card_settings rcs on rcs.organization_id = new.organization_id
   where p.id = new.academic_period_id;
  if v_max is null or new.slot > v_max then
    raise exception 'Cette case n''existe pas : l''école a prévu % % pour cette période.',
      coalesce(v_max, 0), case new.column_key when 'interro' then 'interrogation(s)' else 'devoir(s)' end
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger assessments_slot_guard
  before insert or update of slot, column_key, academic_period_id on public.assessments
  for each row execute function app.assessment_slot_guard();

-- L'enseignant choisit INT 1, INT 2, DEV 1… : évaluation retrouvée ou créée
-- (droits de l'utilisateur appliqués par la RLS : fonction « invoker »).
create or replace function public.open_grade_slot(p_class_subject_id uuid, p_period_id uuid, p_group text, p_slot integer)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_org uuid;
  v_period public.academic_periods;
begin
  if p_group not in ('interro', 'devoir') or p_slot is null or p_slot < 1 then
    raise exception 'Case inconnue.' using errcode = 'check_violation';
  end if;
  select id into v_id from public.assessments
   where class_subject_id = p_class_subject_id and academic_period_id = p_period_id
     and column_key = p_group and slot = p_slot;
  if v_id is not null then
    return v_id;
  end if;
  select organization_id into v_org from public.class_subjects where id = p_class_subject_id;
  select * into v_period from public.academic_periods where id = p_period_id and organization_id = v_org;
  if v_org is null or v_period.id is null then
    raise exception 'Matière ou période introuvable.' using errcode = 'no_data_found';
  end if;
  insert into public.assessments (organization_id, class_subject_id, academic_period_id, title, kind,
                                  assessed_on, coefficient, max_score, column_key, slot)
  values (v_org, p_class_subject_id, p_period_id,
          case p_group when 'interro' then 'INT ' else 'DEV ' end || p_slot,
          case p_group when 'interro' then 'test' else 'homework' end,
          least(greatest(current_date, v_period.starts_on), v_period.ends_on),
          1, 20, p_group, p_slot)
  on conflict (class_subject_id, academic_period_id, column_key, slot) where slot is not null do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.assessments
     where class_subject_id = p_class_subject_id and academic_period_id = p_period_id
       and column_key = p_group and slot = p_slot;
  end if;
  return v_id;
end;
$$;
revoke execute on function public.open_grade_slot(uuid, uuid, text, integer) from public, anon;
grant execute on function public.open_grade_slot(uuid, uuid, text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Moteur unique du bulletin : colonnes fixes choisies par l'école, notes rangées
-- dans la case choisie par l'enseignant.
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
    select a.id, a.class_subject_id, a.kind, a.title, a.assessed_on, a.coefficient, a.max_score, a.column_key, a.created_at, a.slot,
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
  -- Évaluations sans case (saisies avant la saisie simple) : rang chronologique
  -- parmi elles, placées ensuite dans les cases restées libres (jamais deux
  -- notes dans la même colonne).
  assess_ord as (
    select ac.*,
           case when ac.slot is null then
             row_number() over (partition by ac.class_subject_id, ac.grp_key, (ac.slot is null) order by ac.assessed_on, ac.created_at, ac.id)
           end as free_rank
    from assess_col ac
  ),
  free_slots as (
    select k.class_subject_id, k.grp_key, n.slot,
           row_number() over (partition by k.class_subject_id, k.grp_key order by n.slot) as free_rank
    from (select distinct class_subject_id, grp_key from assess_col where grp_key is not null) k
    cross join generate_series(1, 60) n(slot)
    where not exists (
      select 1 from assess_col t
      where t.class_subject_id = k.class_subject_id and t.grp_key = k.grp_key and t.slot = n.slot)
  ),
  assess_grp as (
    select ao.*,
           -- Case choisie par l'enseignant (INT 2, DEV 1…), sinon première case libre.
           coalesce(ao.slot::integer,
             (select fs.slot from free_slots fs
               where fs.class_subject_id = ao.class_subject_id and fs.grp_key = ao.grp_key and fs.free_rank = ao.free_rank),
             ao.free_rank::integer) as grp_rank
    from assess_ord ao
  ),
  -- Nombre de colonnes par groupe : celui choisi par l'école pour la période
  -- (ex. 3 INT et 2 DEV par trimestre), jamais moins que les notes déjà saisies.
  grp_count as (
    select g.key as grp_key,
           greatest(coalesce(case when yi.is_school then nullif(cfg.c #>> array['slots', yi.system, g.key], '')::integer end, 0),
                    coalesce(x.n, 0))::integer as n
    from grps g
    cross join cfg
    cross join yearinfo yi
    left join (select ag.grp_key, max(ag.grp_rank) as n from assess_grp ag where ag.grp_key is not null group by ag.grp_key) x
      on x.grp_key = g.key
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

-- Nouvel établissement scolaire : saisie simple (3 INT, 2 DEV) dès la création.
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
      || case when app.org_component(new.type) = 'school'
              then jsonb_build_object('calculation', 'groups', 'round_subject_first', true,
                                      'groups', app.simple_report_card_groups(), 'slots', app.default_report_card_slots())
              else '{}'::jsonb end
  )
  on conflict do nothing;
  return new;
end;
$$;

-- Établissements scolaires existants : saisie simple (3 INT, 2 DEV, sans COMPO).
-- Les autres réglages (titre, mentions, signatures, couleurs…) sont conservés.
update public.report_card_settings rcs
   set config = rcs.config
                || jsonb_build_object('calculation', 'groups', 'round_subject_first', true,
                                      'groups', app.simple_report_card_groups(), 'slots', app.default_report_card_slots())
  from public.organizations o
 where o.id = rcs.organization_id
   and app.org_component(o.type) = 'school'
   and not (rcs.config ? 'slots');

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
