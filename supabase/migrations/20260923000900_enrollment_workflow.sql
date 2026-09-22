-- =============================================================================
-- NéoScol — 0900 Parcours d'inscription
-- Fonctions SECURITY INVOKER : chaque insertion reste soumise à la RLS de
-- l'utilisateur ; l'ensemble s'exécute dans UNE transaction (tout ou rien).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Rattache un parent/tuteur à un élève : parent existant (id), sinon parent
-- retrouvé par son téléphone dans l'établissement, sinon nouveau parent.
-- p_guardian : {id?, first_name, last_name, relationship, phone, email, profession,
--               is_primary?, is_financial_responsible?, portal_access?}
-- -----------------------------------------------------------------------------
create or replace function public.add_student_guardian(p_student_id uuid, p_guardian jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_guardian uuid := nullif(p_guardian ->> 'id', '')::uuid;
  v_has_links boolean;
begin
  select organization_id into v_org from public.students where id = p_student_id;
  if v_org is null then
    raise exception 'Élève introuvable.' using errcode = 'no_data_found';
  end if;

  if v_guardian is null and nullif(btrim(p_guardian ->> 'phone'), '') is not null then
    select id into v_guardian
    from public.guardians
    where organization_id = v_org and phone = btrim(p_guardian ->> 'phone') and archived_at is null
    order by created_at
    limit 1;
  end if;

  if v_guardian is null then
    if coalesce(btrim(p_guardian ->> 'first_name'), '') = '' or coalesce(btrim(p_guardian ->> 'last_name'), '') = '' then
      raise exception 'Le nom et le prénom du parent sont obligatoires.' using errcode = 'check_violation';
    end if;
    insert into public.guardians (organization_id, first_name, last_name, sex, phone, email, profession)
    values (
      v_org,
      btrim(p_guardian ->> 'first_name'),
      upper(btrim(p_guardian ->> 'last_name')),
      case p_guardian ->> 'relationship' when 'father' then 'M' when 'mother' then 'F' end,
      nullif(btrim(p_guardian ->> 'phone'), ''),
      nullif(lower(btrim(p_guardian ->> 'email')), ''),
      nullif(btrim(p_guardian ->> 'profession'), '')
    )
    returning id into v_guardian;
  elsif not exists (select 1 from public.guardians where id = v_guardian and organization_id = v_org) then
    raise exception 'Parent introuvable.' using errcode = 'no_data_found';
  end if;

  select exists (select 1 from public.student_guardians where student_id = p_student_id) into v_has_links;

  insert into public.student_guardians (
    organization_id, student_id, guardian_id, relationship, is_primary, is_financial_responsible, portal_access
  ) values (
    v_org, p_student_id, v_guardian,
    coalesce(nullif(p_guardian ->> 'relationship', ''), 'tutor'),
    coalesce((p_guardian ->> 'is_primary')::boolean, not v_has_links),
    coalesce((p_guardian ->> 'is_financial_responsible')::boolean, not v_has_links),
    coalesce((p_guardian ->> 'portal_access')::boolean, true)
  )
  on conflict (student_id, guardian_id) do nothing;

  return v_guardian;
end;
$$;
revoke execute on function public.add_student_guardian(uuid, jsonb) from public, anon;
grant execute on function public.add_student_guardian(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Dossier élève (+ parent optionnel) en une transaction.
-- p_payload : {student: {...identité...}, guardian?: {...}, status?: 'prospect'|'active', custom_fields?: {}}
-- -----------------------------------------------------------------------------
create or replace function public.create_student_record(p_organization_id uuid, p_payload jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_s jsonb := p_payload -> 'student';
  v_g jsonb := p_payload -> 'guardian';
  v_student uuid;
begin
  if v_s is null or coalesce(btrim(v_s ->> 'first_name'), '') = '' or coalesce(btrim(v_s ->> 'last_name'), '') = '' then
    raise exception 'Le nom et le prénom de l''élève sont obligatoires.' using errcode = 'check_violation';
  end if;
  insert into public.students (
    organization_id, first_name, last_name, other_names, sex, birth_date, birth_place,
    nationality, national_id, address, city, phone, email, notes, custom_fields, status
  ) values (
    p_organization_id,
    btrim(v_s ->> 'first_name'),
    upper(btrim(v_s ->> 'last_name')),
    nullif(btrim(v_s ->> 'other_names'), ''),
    nullif(v_s ->> 'sex', ''),
    nullif(v_s ->> 'birth_date', '')::date,
    nullif(btrim(v_s ->> 'birth_place'), ''),
    nullif(btrim(v_s ->> 'nationality'), ''),
    nullif(btrim(v_s ->> 'national_id'), ''),
    nullif(btrim(v_s ->> 'address'), ''),
    nullif(btrim(v_s ->> 'city'), ''),
    nullif(btrim(v_s ->> 'phone'), ''),
    nullif(lower(btrim(v_s ->> 'email')), ''),
    nullif(btrim(v_s ->> 'notes'), ''),
    coalesce(p_payload -> 'custom_fields', '{}'::jsonb),
    coalesce(nullif(p_payload ->> 'status', ''), 'prospect')
  )
  returning id into v_student;

  if v_g is not null and (nullif(v_g ->> 'id', '') is not null or coalesce(btrim(v_g ->> 'last_name'), '') <> '') then
    perform public.add_student_guardian(v_student, v_g);
  end if;
  return v_student;
end;
$$;
revoke execute on function public.create_student_record(uuid, jsonb) from public, anon;
grant execute on function public.create_student_record(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Dossier d'inscription complet : élève (nouveau ou existant), parent/tuteur, inscription.
-- p_payload : {
--   type: new|reenrollment|transfer, submit: bool, student_id?: uuid,
--   student?: {...}, guardian?: {...},
--   academic_year_id, class_id, form_definition_id?, form_data: {}, notes?
-- }
-- -----------------------------------------------------------------------------
create or replace function public.create_enrollment_application(p_organization_id uuid, p_payload jsonb)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_student uuid := nullif(p_payload ->> 'student_id', '')::uuid;
  v_class record;
  v_enrollment uuid;
begin
  if v_student is null then
    v_student := public.create_student_record(
      p_organization_id,
      jsonb_build_object('student', p_payload -> 'student', 'guardian', p_payload -> 'guardian', 'status', 'prospect')
    );
  else
    if not exists (select 1 from public.students where id = v_student and organization_id = p_organization_id) then
      raise exception 'Élève introuvable.' using errcode = 'no_data_found';
    end if;
    if nullif(p_payload #>> '{guardian,id}', '') is not null or coalesce(btrim(p_payload #>> '{guardian,last_name}'), '') <> '' then
      perform public.add_student_guardian(v_student, p_payload -> 'guardian');
    end if;
  end if;

  select level_id, program_id into v_class
  from public.classes
  where id = nullif(p_payload ->> 'class_id', '')::uuid and organization_id = p_organization_id;

  insert into public.enrollments (
    organization_id, student_id, academic_year_id, class_id, level_id, program_id,
    type, status, form_definition_id, form_data, notes
  ) values (
    p_organization_id,
    v_student,
    (p_payload ->> 'academic_year_id')::uuid,
    nullif(p_payload ->> 'class_id', '')::uuid,
    v_class.level_id,
    v_class.program_id,
    coalesce(nullif(p_payload ->> 'type', ''), 'new')::public.enrollment_type,
    case when coalesce((p_payload ->> 'submit')::boolean, false) then 'pending' else 'draft' end::public.enrollment_status,
    nullif(p_payload ->> 'form_definition_id', '')::uuid,
    coalesce(p_payload -> 'form_data', '{}'::jsonb),
    nullif(btrim(p_payload ->> 'notes'), '')
  )
  returning id into v_enrollment;

  return v_enrollment;
end;
$$;
revoke execute on function public.create_enrollment_application(uuid, jsonb) from public, anon;
grant execute on function public.create_enrollment_application(uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Tarifs applicables à une inscription : pour chaque type de frais obligatoire,
-- le tarif le plus spécifique (classe > niveau > filière > général).
-- Les frais d'inscription (catégorie registration) ne s'appliquent pas aux réinscriptions.
-- -----------------------------------------------------------------------------
create or replace function public.enrollment_fee_preview(p_enrollment_id uuid)
returns table (
  fee_rate_id uuid,
  fee_type_id uuid,
  fee_type_name text,
  category text,
  amount numeric,
  installment_plan jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  with e as (
    select en.*, c.level_id as c_level, c.program_id as c_program
    from public.enrollments en
    left join public.classes c on c.id = en.class_id
    where en.id = p_enrollment_id
  ),
  ranked as (
    select r.id, r.fee_type_id, ft.name, ft.category, r.amount, r.installment_plan,
           row_number() over (
             partition by r.fee_type_id
             order by case
               when r.class_id is not null then 1
               when r.level_id is not null then 2
               when r.program_id is not null then 3
               else 4 end
           ) as rk
    from public.fee_rates r
    join public.fee_types ft on ft.id = r.fee_type_id and ft.is_active
    join e on e.academic_year_id = r.academic_year_id and e.organization_id = r.organization_id
    where r.is_mandatory
      and (r.class_id is null or r.class_id = e.class_id)
      and (r.level_id is null or r.level_id = coalesce(e.level_id, e.c_level))
      and (r.program_id is null or r.program_id = coalesce(e.program_id, e.c_program))
      and not (ft.category = 'registration' and e.type = 'reenrollment')
  )
  select id, fee_type_id, name, category, amount, installment_plan
  from ranked where rk = 1
  order by case category when 'registration' then 0 else 1 end, name;
$$;
revoke execute on function public.enrollment_fee_preview(uuid) from public, anon;
grant execute on function public.enrollment_fee_preview(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Validation d'une inscription (+ facture des frais, optionnelle).
-- Échéancier : le plan du premier tarif qui en a un ; les autres frais
-- s'ajoutent à la première échéance ; la dernière absorbe les arrondis.
-- -----------------------------------------------------------------------------
create or replace function public.validate_enrollment(p_enrollment_id uuid, p_generate_invoice boolean default true)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_e public.enrollments;
  v_invoice uuid;
  v_total numeric := 0;
  v_plan jsonb := '[]'::jsonb;
  v_plan_amount numeric := 0;
  v_other numeric := 0;
  v_step jsonb;
  v_seq integer := 0;
  v_count integer;
  v_allocated numeric := 0;
  v_amount numeric;
  v_fee record;
  v_last_due date;
begin
  update public.enrollments
     set status = 'validated'
   where id = p_enrollment_id and status = 'pending'
  returning * into v_e;
  if not found then
    raise exception 'Inscription introuvable ou déjà traitée.' using errcode = 'no_data_found';
  end if;

  if not p_generate_invoice then
    return jsonb_build_object('enrollment_id', v_e.id, 'invoice_id', null);
  end if;

  if exists (select 1 from public.invoices where enrollment_id = v_e.id and status <> 'cancelled') then
    return jsonb_build_object('enrollment_id', v_e.id, 'invoice_id', null);
  end if;

  insert into public.invoices (organization_id, student_id, enrollment_id, academic_year_id, status)
  values (v_e.organization_id, v_e.student_id, v_e.id, v_e.academic_year_id, 'draft')
  returning id into v_invoice;

  for v_fee in select * from public.enrollment_fee_preview(v_e.id) loop
    v_seq := v_seq + 1;
    insert into public.invoice_lines (organization_id, invoice_id, fee_type_id, description, unit_amount, sort_order)
    values (v_e.organization_id, v_invoice, v_fee.fee_type_id,
            v_fee.fee_type_name || ' ' || (select name from public.academic_years where id = v_e.academic_year_id),
            v_fee.amount, v_seq);
    v_total := v_total + v_fee.amount;
    if jsonb_array_length(v_plan) = 0 and jsonb_array_length(coalesce(v_fee.installment_plan, '[]'::jsonb)) > 0 then
      v_plan := v_fee.installment_plan;
      v_plan_amount := v_fee.amount;
    else
      v_other := v_other + v_fee.amount;
    end if;
  end loop;

  if v_seq = 0 then
    -- Aucun tarif applicable : pas de facture vide.
    delete from public.invoices where id = v_invoice;
    return jsonb_build_object('enrollment_id', v_e.id, 'invoice_id', null, 'reason', 'no_fee_rate');
  end if;

  v_count := jsonb_array_length(v_plan);
  v_seq := 0;
  for v_step in select * from jsonb_array_elements(v_plan) loop
    v_seq := v_seq + 1;
    if v_seq = v_count then
      v_amount := v_total - v_allocated;
    else
      v_amount := round(v_plan_amount * (v_step ->> 'percent')::numeric / 100, 0)
                  + case when v_seq = 1 then v_other else 0 end;
    end if;
    v_allocated := v_allocated + v_amount;
    v_last_due := (v_step ->> 'due_on')::date;
    insert into public.installments (organization_id, invoice_id, label, due_on, amount, sequence)
    values (v_e.organization_id, v_invoice, coalesce(v_step ->> 'label', 'Échéance ' || v_seq), v_last_due, v_amount, v_seq);
  end loop;

  update public.invoices
     set status = 'issued',
         due_on = coalesce(v_last_due, current_date + 30)
   where id = v_invoice;

  return jsonb_build_object('enrollment_id', v_e.id, 'invoice_id', v_invoice);
end;
$$;
revoke execute on function public.validate_enrollment(uuid, boolean) from public, anon;
grant execute on function public.validate_enrollment(uuid, boolean) to authenticated;
