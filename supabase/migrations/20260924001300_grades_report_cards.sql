-- =============================================================================
-- NéoScol — 1300 Notes validées/verrouillées, bulletin configurable par
-- établissement (colonnes, pondérations, mentions, décisions, signatures,
-- identité visuelle), ordre des matières, recalcul automatique.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Validation des notes d'une évaluation (brouillon → validée)
-- -----------------------------------------------------------------------------
alter table public.assessments
  add column column_key text check (column_key is null or column_key ~ '^[a-z0-9_]{1,30}$'),
  add column grades_status text not null default 'draft' check (grades_status in ('draft', 'validated')),
  add column grades_validated_at timestamptz,
  add column grades_validated_by uuid references public.profiles (id) on delete set null;

alter table public.class_subjects add column sort_order integer not null default 0;

create or replace function app.grades_locked(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((settings #>> '{grading,lock_after_validation}')::boolean, true)
  from public.organizations where id = p_org;
$$;

create or replace function app.assessment_derive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cs record;
  v_period record;
  v_manage boolean;
begin
  select cs.class_id, cs.subject_id, c.academic_year_id
    into v_cs
  from public.class_subjects cs
  join public.classes c on c.id = cs.class_id
  where cs.id = new.class_subject_id;

  select academic_year_id, is_locked into v_period from public.academic_periods where id = new.academic_period_id;

  if v_period.academic_year_id is distinct from v_cs.academic_year_id then
    raise exception 'La période ne correspond pas à l''année scolaire de la classe.' using errcode = 'check_violation';
  end if;
  if v_period.is_locked then
    raise exception 'Cette période est verrouillée : aucune évaluation ne peut y être ajoutée ou modifiée.' using errcode = 'check_violation';
  end if;

  v_manage := auth.uid() is null or app.has_permission(new.organization_id, 'grades.manage');
  if tg_op = 'INSERT' then
    new.grades_status := 'draft';
    new.grades_validated_at := null;
    new.grades_validated_by := null;
  else
    if old.grades_status = 'validated' and not v_manage and app.grades_locked(new.organization_id) then
      if new.grades_status = 'draft' then
        raise exception 'Seule l''administration peut rouvrir des notes validées.' using errcode = 'insufficient_privilege';
      end if;
      if (new.coefficient, new.max_score, new.academic_period_id, new.class_subject_id, new.column_key, new.kind)
         is distinct from (old.coefficient, old.max_score, old.academic_period_id, old.class_subject_id, old.column_key, old.kind) then
        raise exception 'Les notes de cette évaluation sont validées : barème et coefficient sont verrouillés.' using errcode = 'check_violation';
      end if;
    end if;
    if new.grades_status = 'validated' and old.grades_status = 'draft' then
      new.grades_validated_at := now();
      new.grades_validated_by := auth.uid();
    elsif new.grades_status = 'draft' then
      new.grades_validated_at := null;
      new.grades_validated_by := null;
    end if;
  end if;

  new.class_id := v_cs.class_id;
  new.subject_id := v_cs.subject_id;
  if new.is_published and (tg_op = 'INSERT' or not old.is_published) then
    new.published_at := now();
  elsif not new.is_published then
    new.published_at := null;
  end if;
  return new;
end;
$$;

create or replace function app.grade_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment record;
begin
  select a.max_score, a.class_id, a.organization_id, a.grades_status, p.is_locked
    into v_assessment
  from public.assessments a
  join public.academic_periods p on p.id = a.academic_period_id
  where a.id = coalesce(new.assessment_id, old.assessment_id);

  if v_assessment.is_locked then
    raise exception 'Cette période est verrouillée : les notes ne peuvent plus être modifiées.' using errcode = 'check_violation';
  end if;
  if v_assessment.grades_status = 'validated' and auth.uid() is not null
     and app.grades_locked(v_assessment.organization_id)
     and not app.has_permission(v_assessment.organization_id, 'grades.manage') then
    raise exception 'Les notes de cette évaluation sont validées et verrouillées.' using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.score is not null and new.score > v_assessment.max_score then
    raise exception 'La note (%) dépasse le barème (%).', new.score, v_assessment.max_score using errcode = 'check_violation';
  end if;
  if not exists (
    select 1 from public.enrollments e
    where e.student_id = new.student_id and e.class_id = v_assessment.class_id and e.status = 'validated'
  ) then
    raise exception 'Cet élève n''est pas inscrit dans la classe de l''évaluation.' using errcode = 'check_violation';
  end if;
  new.graded_by := coalesce(auth.uid(), new.graded_by);
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Configuration du bulletin (une par établissement)
-- -----------------------------------------------------------------------------
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
  }'::jsonb;
$$;

create table public.report_card_settings (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  config jsonb not null default app.default_report_card_config() check (jsonb_typeof(config) = 'object'),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null
);

-- Validation de la configuration : colonnes uniques, pondérations positives,
-- mode de calcul connu, couleurs hexadécimales.
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
begin
  if coalesce(v_cfg ->> 'calculation', 'assessments') not in ('assessments', 'columns') then
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
  if coalesce(v_cfg ->> 'primary_color', '#000000') !~ '^#[0-9A-Fa-f]{6}$'
     or coalesce(v_cfg ->> 'accent_color', '#000000') !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Couleur invalide (format #RRGGBB).' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;
create trigger report_card_settings_guard
  before insert or update on public.report_card_settings
  for each row execute function app.report_card_settings_guard();

insert into public.report_card_settings (organization_id) select id from public.organizations on conflict do nothing;

create or replace function app.organization_report_card_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.report_card_settings (organization_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger organizations_report_card_settings
  after insert on public.organizations
  for each row execute function app.organization_report_card_settings();

alter table public.report_card_settings enable row level security;
create policy report_card_settings_select on public.report_card_settings for select to authenticated
  using (organization_id = any ((select app.member_org_ids())::uuid[]));
create policy report_card_settings_write on public.report_card_settings for update to authenticated
  using (organization_id = any ((select app.permitted_org_ids('report_cards.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('report_cards.manage'))::uuid[]));

-- Mention / décision : première règle dont le seuil est atteint.
create or replace function app.rule_label(p_rules jsonb, p_value numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select r.value ->> 'label'
  from jsonb_array_elements(coalesce(p_rules, '[]'::jsonb)) r
  where p_value is not null and p_value >= coalesce(nullif(r.value ->> 'min', '')::numeric, 0)
  order by coalesce(nullif(r.value ->> 'min', '')::numeric, 0) desc
  limit 1;
$$;

-- -----------------------------------------------------------------------------
-- Calcul (sans écriture) des bulletins d'une classe pour une période.
-- Mode « assessments » : moyenne matière = Σ(note/barème×20 × coef éval.) / Σ coef éval.
-- Mode « columns »     : moyenne colonne = même formule dans la colonne ;
--                        moyenne matière = Σ(moyenne colonne × poids) / Σ poids.
-- Moyenne générale = Σ(moyenne matière × coef matière) / Σ coef matière.
-- Colonne d'une évaluation : column_key explicite, sinon n-ième évaluation d'un
-- type → n-ième colonne acceptant ce type (INTERRO 1, INTERRO 2…).
-- SECURITY DEFINER : réservé aux fonctions qui ont contrôlé les droits.
-- -----------------------------------------------------------------------------
create or replace function app.report_card_rows(p_class_id uuid, p_period_id uuid)
returns table (student_id uuid, average numeric, rank integer, class_size integer, data jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select coalesce(rcs.config, app.default_report_card_config()) as c
    from public.classes cl
    left join public.report_card_settings rcs on rcs.organization_id = cl.organization_id
    where cl.id = p_class_id
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
    select a.id, a.class_subject_id, a.kind, a.coefficient, a.max_score, a.column_key,
           row_number() over (partition by a.class_subject_id, a.kind order by a.assessed_on, a.created_at, a.id) as kind_rank
    from public.assessments a
    where a.class_id = p_class_id and a.academic_period_id = p_period_id
  ),
  assess_col as (
    select a.*, coalesce(
      (select k.key from cols k where k.key = a.column_key),
      (select m.key from (
         select k.key, row_number() over (order by k.pos) as rn, count(*) over () as n
         from cols k where k.kinds ? a.kind
       ) m where m.rn = least(a.kind_rank, m.n))
    ) as col_key
    from assess a
  ),
  notes as (
    select gr.student_id, a.class_subject_id, a.col_key, gr.score / a.max_score * 20 as note20, a.coefficient
    from public.grades gr
    join assess_col a on a.id = gr.assessment_id
    where gr.score is not null and gr.student_id in (select student_id from pupils)
  ),
  col_avg as (
    select n.student_id, n.class_subject_id, n.col_key, sum(n.note20 * n.coefficient) / sum(n.coefficient) as value
    from notes n where n.col_key is not null
    group by n.student_id, n.class_subject_id, n.col_key
  ),
  subject_avg as (
    select n.student_id, n.class_subject_id,
           case when (select c ->> 'calculation' from cfg) = 'columns' then (
                  select sum(ca.value * k.weight) / nullif(sum(k.weight), 0)
                  from col_avg ca join cols k on k.key = ca.col_key
                  where ca.student_id = n.student_id and ca.class_subject_id = n.class_subject_id)
                else sum(n.note20 * n.coefficient) / sum(n.coefficient) end as average
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
    select sr.student_id, sum(sr.average * sb.coefficient) / sum(sb.coefficient) as average,
           sum(sb.coefficient) as coefficient_total, sum(sr.average * sb.coefficient) as points
    from subject_ranked sr join subjects sb on sb.id = sr.class_subject_id
    group by sr.student_id
  ),
  ranked as (
    select p.student_id, round(g.average, 2) as average, g.coefficient_total, g.points,
           (case when g.average is not null then rank() over (order by g.average desc nulls last) end)::integer as rank
    from pupils p left join general g on g.student_id = p.student_id
  ),
  class_info as (
    select count(*)::integer as size, round(avg(r.average), 2) as class_average,
           max(r.average) as best, min(r.average) as worst
    from ranked r
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
  details as (
    select p.student_id,
           coalesce(jsonb_agg(jsonb_build_object(
             'class_subject_id', sb.id,
             'subject', sb.subject,
             'code', sb.code,
             'teacher', sb.teacher,
             'coefficient', sb.coefficient,
             'columns', coalesce((
                select jsonb_object_agg(ca.col_key, round(ca.value, 2)) from col_avg ca
                where ca.student_id = p.student_id and ca.class_subject_id = sb.id), '{}'::jsonb),
             'average', round(sr.average, 2),
             'points', round(sr.average * sb.coefficient, 2),
             'rank', sr.subject_rank,
             'class_average', round(ss.class_average, 2),
             'min', round(ss.min_average, 2),
             'max', round(ss.max_average, 2),
             'mention', app.rule_label(cfg.c -> 'mentions', sr.average)
           ) order by sb.sort_order, sb.subject), '[]'::jsonb) as subjects
    from pupils p
    cross join subjects sb
    cross join cfg
    left join subject_ranked sr on sr.student_id = p.student_id and sr.class_subject_id = sb.id
    left join subject_stats ss on ss.class_subject_id = sb.id
    group by p.student_id
  )
  select r.student_id, r.average, r.rank, ci.size,
         jsonb_build_object(
           'subjects', d.subjects,
           'columns', (select coalesce(jsonb_agg(jsonb_build_object('key', k.key, 'label', k.label, 'weight', k.weight) order by k.pos), '[]'::jsonb) from cols k),
           'calculation', coalesce(cfg.c ->> 'calculation', 'assessments'),
           'class_average', ci.class_average,
           'best_average', ci.best,
           'worst_average', ci.worst,
           'coefficient_total', r.coefficient_total,
           'points_total', round(r.points, 2),
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

create or replace function public.compute_report_cards(p_class_id uuid, p_period_id uuid)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_year uuid;
  v_count integer;
begin
  select organization_id, academic_year_id into v_org, v_year from public.classes where id = p_class_id;
  if v_org is null then
    raise exception 'Classe introuvable.' using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from public.academic_periods where id = p_period_id and academic_year_id = v_year) then
    raise exception 'La période ne correspond pas à l''année de la classe.' using errcode = 'check_violation';
  end if;
  if not (app.has_permission(v_org, 'grades.read') or app.has_permission(v_org, 'grades.manage')) then
    raise exception 'Le calcul des bulletins nécessite la lecture de toutes les notes (grades.read).' using errcode = 'insufficient_privilege';
  end if;

  with upserted as (
    insert into public.report_cards (organization_id, student_id, class_id, academic_period_id, average, rank, class_size, data)
    select v_org, r.student_id, p_class_id, p_period_id, r.average, r.rank, r.class_size, r.data
    from app.report_card_rows(p_class_id, p_period_id) r
    on conflict (student_id, class_id, academic_period_id)
      do update set average = excluded.average, rank = excluded.rank,
                    class_size = excluded.class_size, data = excluded.data
      where public.report_cards.status = 'draft'
    returning 1
  )
  select count(*) into v_count from upserted;
  return v_count;
end;
$$;

-- Recalcul automatique des bulletins EN BROUILLON (les bulletins publiés sont figés).
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

create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_redact boolean := tg_nargs > 0 and tg_argv[0] = 'redact';
  v_ignored constant text[] := array['updated_at', 'search_text', 'created_at', 'content'];
begin
  if current_setting('app.skip_audit', true) = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      if not (v_key = any (v_ignored)) and (v_new -> v_key) is distinct from (v_old -> v_key) then
        v_changes := v_changes || jsonb_build_object(
          v_key,
          case when v_redact then '"[masqué]"'::jsonb
               else jsonb_build_array(v_old -> v_key, v_new -> v_key) end
        );
      end if;
    end loop;
    if v_changes = '{}'::jsonb then
      return null;
    end if;
  elsif v_redact then
    v_changes := null;
  else
    v_changes := v_row - v_ignored;
  end if;

  insert into public.audit_logs (organization_id, actor_id, actor_email, action, entity_type, entity_id, changes, metadata)
  values (
    coalesce((v_row ->> 'organization_id')::uuid, case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid end),
    auth.uid(),
    auth.jwt() ->> 'email',
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    case when v_row ? 'id' then (v_row ->> 'id')::uuid
         when v_row ? 'student_id' then (v_row ->> 'student_id')::uuid
         when v_row ? 'membership_id' then (v_row ->> 'membership_id')::uuid
         when v_row ? 'role_id' then (v_row ->> 'role_id')::uuid
         else null end,
    v_changes,
    jsonb_build_object('source', 'trigger')
  );
  return null;
end;
$$;

-- Notes modifiées → bulletins brouillons des classes/périodes concernées.
-- Déclencheurs d'instruction avec tables de transition (une par événement).
create or replace function app.grades_refresh_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_target record;
begin
  for v_target in
    select distinct a.class_id, a.academic_period_id from changed_new x join public.assessments a on a.id = x.assessment_id
  loop
    perform app.refresh_report_cards(v_target.class_id, v_target.academic_period_id);
  end loop;
  return null;
end;
$$;
create or replace function app.grades_refresh_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_target record;
begin
  for v_target in
    select distinct a.class_id, a.academic_period_id from changed_old x join public.assessments a on a.id = x.assessment_id
  loop
    perform app.refresh_report_cards(v_target.class_id, v_target.academic_period_id);
  end loop;
  return null;
end;
$$;
create trigger grades_refresh_after_insert after insert on public.grades
  referencing new table as changed_new for each statement execute function app.grades_refresh_insert();
create trigger grades_refresh_after_update after update on public.grades
  referencing new table as changed_new for each statement execute function app.grades_refresh_insert();
create trigger grades_refresh_after_delete after delete on public.grades
  referencing old table as changed_old for each statement execute function app.grades_refresh_delete();

-- Évaluation modifiée (coefficient, barème, colonne, période) ou supprimée.
create or replace function app.assessment_refresh_report_cards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform app.refresh_report_cards(old.class_id, old.academic_period_id);
  end if;
  if tg_op = 'UPDATE' and (new.class_id, new.academic_period_id) is distinct from (old.class_id, old.academic_period_id) then
    perform app.refresh_report_cards(new.class_id, new.academic_period_id);
  end if;
  return null;
end;
$$;
create trigger assessments_refresh_report_cards
  after update of coefficient, max_score, academic_period_id, column_key, kind, assessed_on or delete on public.assessments
  for each row execute function app.assessment_refresh_report_cards();

-- Coefficient ou ordre d'une matière, enseignant affecté.
create or replace function app.class_subject_refresh_report_cards()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period uuid;
begin
  for v_period in
    select distinct academic_period_id from public.report_cards
    where class_id = coalesce(new.class_id, old.class_id) and status = 'draft'
  loop
    perform app.refresh_report_cards(coalesce(new.class_id, old.class_id), v_period);
  end loop;
  return null;
end;
$$;
create trigger class_subjects_refresh_report_cards
  after insert or update of coefficient, sort_order, teacher_id or delete on public.class_subjects
  for each row execute function app.class_subject_refresh_report_cards();

-- Configuration modifiée → tous les bulletins brouillons de l'établissement.
create or replace function app.report_card_settings_refresh()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target record;
begin
  for v_target in
    select distinct class_id, academic_period_id from public.report_cards
    where organization_id = new.organization_id and status = 'draft'
  loop
    perform app.refresh_report_cards(v_target.class_id, v_target.academic_period_id);
  end loop;
  return null;
end;
$$;
create trigger report_card_settings_refresh
  after update of config on public.report_card_settings
  for each row execute function app.report_card_settings_refresh();

-- Aperçu (lecture seule) : direction, pédagogie, ou enseignant de la classe.
-- Aucun enregistrement, aucun document officiel.
create or replace function public.preview_report_cards(p_class_id uuid, p_period_id uuid)
returns table (student_id uuid, average numeric, rank integer, class_size integer, data jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.classes where id = p_class_id;
  if v_org is null or not (
    app.has_permission(v_org, 'report_cards.manage')
    or app.has_permission(v_org, 'grades.read')
    or p_class_id = any (app.my_taught_class_ids())
  ) then
    raise exception 'Aperçu non autorisé.' using errcode = 'insufficient_privilege';
  end if;
  return query select * from app.report_card_rows(p_class_id, p_period_id);
end;
$$;
revoke execute on function public.preview_report_cards(uuid, uuid) from public, anon;
grant execute on function public.preview_report_cards(uuid, uuid) to authenticated;

create trigger report_card_settings_audit after insert or update or delete on public.report_card_settings
  for each row execute function app.audit_row();

grant execute on function app.grades_locked(uuid), app.rule_label(jsonb, numeric), app.default_report_card_config()
to authenticated, service_role;
