-- =============================================================================
-- NéoScol — 0400 Pédagogie : évaluations, notes, bulletins, présences, emploi du temps
-- =============================================================================

create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');

-- -----------------------------------------------------------------------------
-- Évaluations et notes
-- -----------------------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  class_subject_id uuid not null,
  class_id uuid not null,   -- dérivé de class_subject_id (trigger)
  subject_id uuid not null, -- dérivé de class_subject_id (trigger)
  academic_period_id uuid not null,
  title text not null check (length(btrim(title)) between 1 and 120),
  kind text not null default 'test'
    check (kind in ('test', 'exam', 'homework', 'oral', 'practical', 'project', 'other')),
  assessed_on date not null default current_date,
  coefficient numeric(5, 2) not null default 1 check (coefficient > 0),
  max_score numeric(6, 2) not null default 20 check (max_score > 0),
  description text,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, class_subject_id) references public.class_subjects (organization_id, id) on delete restrict,
  foreign key (organization_id, academic_period_id) references public.academic_periods (organization_id, id) on delete restrict
);
create index assessments_class_subject_idx on public.assessments (class_subject_id, academic_period_id);
create index assessments_class_idx on public.assessments (class_id, academic_period_id);

create or replace function app.assessment_derive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cs record;
  v_period record;
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
create trigger assessments_derive
  before insert or update on public.assessments
  for each row execute function app.assessment_derive();

create table public.grades (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  assessment_id uuid not null,
  student_id uuid not null,
  score numeric(6, 2) check (score is null or score >= 0),
  is_absent boolean not null default false,
  is_exempt boolean not null default false,
  comment text,
  graded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, student_id),
  foreign key (organization_id, assessment_id) references public.assessments (organization_id, id) on delete cascade,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  check (not (score is not null and (is_absent or is_exempt)))
);
create index grades_student_idx on public.grades (student_id);

create or replace function app.grade_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assessment record;
begin
  select a.max_score, a.class_id, p.is_locked
    into v_assessment
  from public.assessments a
  join public.academic_periods p on p.id = a.academic_period_id
  where a.id = coalesce(new.assessment_id, old.assessment_id);

  if v_assessment.is_locked then
    raise exception 'Cette période est verrouillée : les notes ne peuvent plus être modifiées.' using errcode = 'check_violation';
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
create trigger grades_guard
  before insert or update or delete on public.grades
  for each row execute function app.grade_guard();

-- -----------------------------------------------------------------------------
-- Bulletins
-- -----------------------------------------------------------------------------
create table public.report_cards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  student_id uuid not null,
  class_id uuid not null,
  academic_period_id uuid not null,
  average numeric(6, 2),
  rank integer check (rank is null or rank > 0),
  class_size integer,
  appreciation text,
  head_teacher_comment text,
  decision text,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  issued_document_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, class_id, academic_period_id),
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete restrict,
  foreign key (organization_id, academic_period_id) references public.academic_periods (organization_id, id) on delete restrict
);

create or replace function app.report_card_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    if auth.uid() is not null and not app.has_permission(new.organization_id, 'report_cards.publish') then
      raise exception 'La publication des bulletins nécessite la permission report_cards.publish.' using errcode = 'insufficient_privilege';
    end if;
    new.published_at := now();
    new.published_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger report_cards_guard
  before insert or update on public.report_cards
  for each row execute function app.report_card_guard();

-- -----------------------------------------------------------------------------
-- Présences
-- -----------------------------------------------------------------------------
create table public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  class_id uuid not null,
  class_subject_id uuid,
  session_date date not null default current_date,
  starts_at time not null,
  ends_at time not null,
  taken_by uuid default auth.uid() references public.profiles (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (class_id, session_date, starts_at),
  unique (organization_id, id),
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete restrict,
  foreign key (organization_id, class_subject_id) references public.class_subjects (organization_id, id) on delete set null (class_subject_id)
);
create index attendance_sessions_date_idx on public.attendance_sessions (organization_id, session_date);

create table public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  session_id uuid not null,
  student_id uuid not null,
  status public.attendance_status not null default 'present',
  minutes_late integer check (minutes_late is null or minutes_late >= 0),
  is_justified boolean not null default false,
  justification text,
  justified_by uuid references public.profiles (id) on delete set null,
  justified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, student_id),
  foreign key (organization_id, session_id) references public.attendance_sessions (organization_id, id) on delete cascade,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict
);
create index attendance_records_student_idx on public.attendance_records (student_id, status);

create or replace function app.attendance_justify_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.is_justified)
     or (tg_op = 'UPDATE' and (new.is_justified is distinct from old.is_justified
                               or new.justification is distinct from old.justification)) then
    if auth.uid() is not null
       and not app.has_permission(new.organization_id, 'attendance.justify')
       and not app.has_permission(new.organization_id, 'attendance.manage') then
      raise exception 'La justification des absences nécessite la permission attendance.justify.' using errcode = 'insufficient_privilege';
    end if;
    new.justified_by := case when new.is_justified then auth.uid() end;
    new.justified_at := case when new.is_justified then now() end;
  end if;
  return new;
end;
$$;
create trigger attendance_records_justify_guard
  before insert or update on public.attendance_records
  for each row execute function app.attendance_justify_guard();

-- -----------------------------------------------------------------------------
-- Emploi du temps (conflits empêchés par contraintes d'exclusion)
-- -----------------------------------------------------------------------------
create table public.timetable_slots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  academic_year_id uuid not null,
  class_id uuid not null,
  class_subject_id uuid,
  teacher_id uuid,
  room_id uuid,
  weekday smallint not null check (weekday between 1 and 7), -- 1 = lundi (ISO)
  starts_at time not null,
  ends_at time not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete cascade,
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete cascade,
  foreign key (organization_id, class_subject_id) references public.class_subjects (organization_id, id) on delete cascade,
  foreign key (organization_id, teacher_id) references public.staff_members (organization_id, id) on delete set null (teacher_id),
  foreign key (organization_id, room_id) references public.rooms (organization_id, id) on delete set null (room_id),
  constraint timetable_no_class_overlap exclude using gist (
    class_id with =, weekday with =,
    tsrange(date '2000-01-01' + starts_at, date '2000-01-01' + ends_at) with &&
  ),
  constraint timetable_no_teacher_overlap exclude using gist (
    teacher_id with =, academic_year_id with =, weekday with =,
    tsrange(date '2000-01-01' + starts_at, date '2000-01-01' + ends_at) with &&
  ) where (teacher_id is not null),
  constraint timetable_no_room_overlap exclude using gist (
    room_id with =, academic_year_id with =, weekday with =,
    tsrange(date '2000-01-01' + starts_at, date '2000-01-01' + ends_at) with &&
  ) where (room_id is not null)
);
create index timetable_slots_teacher_idx on public.timetable_slots (teacher_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.assessments enable row level security;
alter table public.grades enable row level security;
alter table public.report_cards enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;
alter table public.timetable_slots enable row level security;

create policy assessments_select on public.assessments for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('grades.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or class_id = any ((select app.my_taught_class_ids())::uuid[])
    or (is_published and class_id = any ((select app.my_portal_class_ids())::uuid[]))
  );
create policy assessments_write on public.assessments for all to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('grades.enter'))::uuid[])
        and class_subject_id = any ((select app.my_taught_class_subject_ids())::uuid[]))
  )
  with check (
    organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('grades.enter'))::uuid[])
        and class_subject_id = any ((select app.my_taught_class_subject_ids())::uuid[]))
  );

create policy grades_select on public.grades for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('grades.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or assessment_id in (
      select a.id from public.assessments a
      where a.class_id = any ((select app.my_taught_class_ids())::uuid[])
    )
    or (
      student_id = any ((select app.my_portal_student_ids())::uuid[])
      and assessment_id in (select a.id from public.assessments a where a.is_published)
    )
  );
create policy grades_write on public.grades for all to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('grades.enter'))::uuid[])
        and assessment_id in (
          select a.id from public.assessments a
          where a.class_subject_id = any ((select app.my_taught_class_subject_ids())::uuid[])
        ))
  )
  with check (
    organization_id = any ((select app.permitted_org_ids('grades.manage'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('grades.enter'))::uuid[])
        and assessment_id in (
          select a.id from public.assessments a
          where a.class_subject_id = any ((select app.my_taught_class_subject_ids())::uuid[])
        ))
  );

create policy report_cards_select on public.report_cards for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('report_cards.manage'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('grades.read'))::uuid[])
    or class_id = any ((select app.my_taught_class_ids())::uuid[])
    or (status = 'published' and student_id = any ((select app.my_portal_student_ids())::uuid[]))
  );
create policy report_cards_write on public.report_cards for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('report_cards.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('report_cards.manage'))::uuid[]));

create policy attendance_sessions_select on public.attendance_sessions for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('attendance.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('attendance.manage'))::uuid[])
    or class_id = any ((select app.my_taught_class_ids())::uuid[])
    or class_id = any ((select app.my_portal_class_ids())::uuid[])
  );
create policy attendance_sessions_write on public.attendance_sessions for all to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('attendance.manage'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('attendance.take'))::uuid[])
        and class_id = any ((select app.my_taught_class_ids())::uuid[]))
  )
  with check (
    organization_id = any ((select app.permitted_org_ids('attendance.manage'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('attendance.take'))::uuid[])
        and class_id = any ((select app.my_taught_class_ids())::uuid[]))
  );

create policy attendance_records_select on public.attendance_records for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('attendance.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('attendance.manage'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
    or session_id in (
      select s.id from public.attendance_sessions s
      where s.class_id = any ((select app.my_taught_class_ids())::uuid[])
    )
  );
create policy attendance_records_write on public.attendance_records for all to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('attendance.manage'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('attendance.justify'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('attendance.take'))::uuid[])
        and session_id in (
          select s.id from public.attendance_sessions s
          where s.class_id = any ((select app.my_taught_class_ids())::uuid[])
        ))
  )
  with check (
    organization_id = any ((select app.permitted_org_ids('attendance.manage'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('attendance.justify'))::uuid[])
    or (organization_id = any ((select app.permitted_org_ids('attendance.take'))::uuid[])
        and session_id in (
          select s.id from public.attendance_sessions s
          where s.class_id = any ((select app.my_taught_class_ids())::uuid[])
        ))
  );

create policy timetable_select on public.timetable_slots for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('timetable.read'))::uuid[])
    or class_id = any ((select app.my_taught_class_ids())::uuid[])
    or teacher_id = any ((select app.my_staff_ids())::uuid[])
    or class_id = any ((select app.my_portal_class_ids())::uuid[])
  );
create policy timetable_write on public.timetable_slots for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('timetable.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('timetable.manage'))::uuid[]));

do $$
declare
  t text;
begin
  foreach t in array array['assessments', 'grades', 'report_cards', 'attendance_sessions', 'attendance_records', 'timetable_slots']
  loop
    execute format('create trigger %1$s_touch before update on public.%1$s for each row execute function app.touch_updated_at()', t);
  end loop;
end;
$$;
