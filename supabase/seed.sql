-- =============================================================================
-- NéoScol — DONNÉES DE DÉMONSTRATION
--
-- ⚠ Toutes les données ci-dessous sont FICTIVES. Les établissements créés sont
-- marqués organizations.is_demo = true et l'interface affiche un bandeau
-- « Démonstration ». Ne jamais exécuter ce fichier sur une base de production.
--
-- Mot de passe de tous les comptes de démonstration : NeoScol-Demo-2026!
-- =============================================================================

-- Comptes de démonstration --------------------------------------------------------
create or replace function pg_temp.demo_user(p_id uuid, p_email text, p_first text, p_last text, p_phone text default null)
returns uuid
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new,
    email_change, created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt('NeoScol-Demo-2026!', extensions.gen_salt('bf')), now(), p_phone,
    case when p_phone is not null then now() end,
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('first_name', p_first, 'last_name', p_last),
    '', '', '', '', now(), now()
  );
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
          'email', now(), now(), now());
  update public.profiles set first_name = p_first, last_name = p_last where id = p_id;
  return p_id;
end;
$$;

create or replace function pg_temp.grant_role(p_org uuid, p_user uuid, p_role text)
returns void
language plpgsql
as $$
declare
  v_membership uuid;
begin
  insert into public.memberships (organization_id, user_id, status, joined_at)
  values (p_org, p_user, 'active', now())
  on conflict (organization_id, user_id) do update set status = 'active'
  returning id into v_membership;
  insert into public.membership_roles (organization_id, membership_id, role_id)
  select p_org, v_membership, r.id from public.roles r where r.organization_id = p_org and r.key = p_role;
end;
$$;

select pg_temp.demo_user('00000000-0000-4000-a000-000000000001', 'superadmin@demo.neoscol.app', 'Super', 'Administrateur');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000002', 'admin@demo.neoscol.app', 'Awa', 'KONÉ');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000003', 'direction@demo.neoscol.app', 'Jean-Marc', 'KOUASSI');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000004', 'secretariat@demo.neoscol.app', 'Mariam', 'TRAORÉ');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000005', 'comptable@demo.neoscol.app', 'Serge', 'YAO');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000006', 'enseignant@demo.neoscol.app', 'Ibrahim', 'OUATTARA');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000007', 'enseignante@demo.neoscol.app', 'Esther', 'N''GUESSAN');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000008', 'parent@demo.neoscol.app', 'Adjoua', 'BAMBA', '+2250700000001');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000009', 'eleve@demo.neoscol.app', 'Kofi', 'BAMBA');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000010', 'formation@demo.neoscol.app', 'Moussa', 'DIALLO');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000011', 'pointage@demo.neoscol.app', 'Tablette', 'ACCUEIL');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-a000-000000000001');

-- Établissements (le provisionnement crée rôles, formulaires et modèles) -------------
insert into public.organizations (id, name, short_name, code, slug, type, email, phone, address, city, is_demo)
values
  ('10000000-0000-4000-a000-000000000001', 'Groupe Scolaire Démo NéoScol', 'GS Démo', 'DEMO', 'demo',
   'school_complex', 'contact@demo.neoscol.app', '+225 27 00 00 00 00', 'Boulevard de la Démonstration', 'Abidjan', true),
  ('10000000-0000-4000-a000-000000000002', 'Institut Démo de Formation Professionnelle', 'IDFP Démo', 'DEMOF', 'demo-formation',
   'vocational_center', 'contact@formation.demo.neoscol.app', '+225 27 00 00 00 01', 'Rue des Métiers', 'Bouaké', true);

update public.organization_branding
   set signatory_name = 'Jean-Marc KOUASSI', signatory_title = 'Directeur des études',
       header_text = 'Établissement de démonstration — données fictives',
       footer_text = 'NéoScol · Plus qu''un logiciel, une vision pour l''éducation.'
 where organization_id = '10000000-0000-4000-a000-000000000001';

select pg_temp.grant_role('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000002', 'org_admin');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000003', 'director');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000004', 'secretary');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000005', 'accountant');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000006', 'teacher');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000007', 'teacher');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000008', 'parent');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000009', 'student');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000010', 'org_admin');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000011', 'kiosk');

-- Données scolaires de l'établissement DEMO -------------------------------------------
do $$
declare
  v_org constant uuid := '10000000-0000-4000-a000-000000000001';
  v_year uuid;
  v_t1 uuid;
  v_levels uuid[] := '{}';
  v_level uuid;
  v_classes uuid[] := '{}';
  v_class uuid;
  v_teacher_math uuid;
  v_teacher_fr uuid;
  v_staff uuid[] := '{}';
  v_subject uuid;
  v_room uuid;
  v_student uuid;
  v_guardian uuid;
  v_enrollment uuid;
  v_invoice uuid;
  v_fee_reg uuid;
  v_fee_tuition uuid;
  v_session uuid;
  v_assessment uuid;
  v_cs uuid;
  v_first_names text[] := array['Aya','Awa','Mariam','Fatou','Adjoua','Aminata','Kofi','Koffi','Ibrahim','Moussa',
                                'Serge','Grâce','Esther','Emmanuel','Yannick','Christelle','Salif','Rokia','Didier','Nadia',
                                'Ange','Prisca','Hamed','Inès'];
  v_last_names text[] := array['KOUASSI','YAO','KONÉ','TRAORÉ','DIALLO','OUATTARA','BAMBA','N''GUESSAN','KOUADIO','TOURÉ',
                               'COULIBALY','DIABATÉ','SANOGO','ASSI','KOFFI','GBAGBO','AKA','DOSSO'];
  i integer;
  v_class_index integer;
  v_sex text;
  v_amount numeric;
  v_subject_codes text[] := array['MATH','FR','ANG','SVT','HG','PC','EPS'];
  v_subject_names text[] := array['Mathématiques','Français','Anglais','Sciences de la vie et de la Terre','Histoire-Géographie','Physique-Chimie','Éducation physique et sportive'];
  v_subject_coefs numeric[] := array[4, 4, 2, 2, 2, 2, 1];
  v_subjects uuid[] := '{}';
begin
  insert into public.academic_years (organization_id, name, starts_on, ends_on, is_current, status)
  values (v_org, '2026-2027', date '2026-09-07', date '2027-07-02', true, 'active') returning id into v_year;

  insert into public.academic_periods (organization_id, academic_year_id, name, type, sequence, starts_on, ends_on) values
    (v_org, v_year, '1er trimestre', 'trimester', 1, date '2026-09-07', date '2026-12-18') returning id into v_t1;
  insert into public.academic_periods (organization_id, academic_year_id, name, type, sequence, starts_on, ends_on) values
    (v_org, v_year, '2e trimestre', 'trimester', 2, date '2027-01-04', date '2027-03-26'),
    (v_org, v_year, '3e trimestre', 'trimester', 3, date '2027-04-06', date '2027-07-02');

  for i in 1..4 loop
    insert into public.levels (organization_id, name, short_name, cycle, sequence)
    values (v_org, (array['Sixième','Cinquième','Quatrième','Troisième'])[i], (array['6e','5e','4e','3e'])[i], 'Collège', i)
    returning id into v_level;
    v_levels := v_levels || v_level;
  end loop;

  insert into public.rooms (organization_id, name, building, capacity) values (v_org, 'Salle 101', 'Bâtiment A', 45) returning id into v_room;
  insert into public.rooms (organization_id, name, building, capacity) values (v_org, 'Salle 102', 'Bâtiment A', 45), (v_org, 'Laboratoire', 'Bâtiment B', 30);

  insert into public.staff_members (organization_id, user_id, employee_number, first_name, last_name, sex, email, phone, job_title, is_teacher, hired_on)
  values (v_org, '00000000-0000-4000-a000-000000000006', 'EMP-DEMO-0001', 'Ibrahim', 'OUATTARA', 'M', 'enseignant@demo.neoscol.app', '+2250700000010', 'Professeur de mathématiques', true, date '2019-09-01')
  returning id into v_teacher_math;
  insert into public.staff_members (organization_id, user_id, employee_number, first_name, last_name, sex, email, phone, job_title, is_teacher, hired_on)
  values (v_org, '00000000-0000-4000-a000-000000000007', 'EMP-DEMO-0002', 'Esther', 'N''GUESSAN', 'F', 'enseignante@demo.neoscol.app', '+2250700000011', 'Professeure de français', true, date '2021-09-01')
  returning id into v_teacher_fr;
  insert into public.staff_members (organization_id, user_id, employee_number, first_name, last_name, sex, email, job_title, is_teacher)
  values
    (v_org, '00000000-0000-4000-a000-000000000003', 'EMP-DEMO-0003', 'Jean-Marc', 'KOUASSI', 'M', 'direction@demo.neoscol.app', 'Directeur des études', false),
    (v_org, '00000000-0000-4000-a000-000000000004', 'EMP-DEMO-0004', 'Mariam', 'TRAORÉ', 'F', 'secretariat@demo.neoscol.app', 'Secrétaire', false),
    (v_org, '00000000-0000-4000-a000-000000000005', 'EMP-DEMO-0005', 'Serge', 'YAO', 'M', 'comptable@demo.neoscol.app', 'Comptable', false);

  for i in 1..array_length(v_subject_codes, 1) loop
    insert into public.subjects (organization_id, name, code) values (v_org, v_subject_names[i], v_subject_codes[i])
    returning id into v_subject;
    v_subjects := v_subjects || v_subject;
  end loop;

  -- Classes : 6e A, 6e B, 5e A, 3e A
  for i in 1..4 loop
    insert into public.classes (organization_id, academic_year_id, level_id, name, code, capacity, room_id, head_teacher_id)
    values (v_org, v_year,
            v_levels[(array[1, 1, 2, 4])[i]],
            (array['6e A', '6e B', '5e A', '3e A'])[i],
            (array['6A', '6B', '5A', '3A'])[i],
            45,
            case when i = 1 then v_room end,
            case when i = 1 then v_teacher_math when i = 3 then v_teacher_fr end)
    returning id into v_class;
    v_classes := v_classes || v_class;
    for v_class_index in 1..array_length(v_subjects, 1) loop
      insert into public.class_subjects (organization_id, class_id, subject_id, teacher_id, coefficient, weekly_hours)
      values (v_org, v_class, v_subjects[v_class_index],
              case
                when v_subject_codes[v_class_index] = 'MATH' and i in (1, 2) then v_teacher_math
                when v_subject_codes[v_class_index] = 'FR' and i in (1, 3) then v_teacher_fr
              end,
              v_subject_coefs[v_class_index], v_subject_coefs[v_class_index] + 1);
    end loop;
  end loop;

  -- Emploi du temps (6e A)
  insert into public.timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, room_id, weekday, starts_at, ends_at)
  select v_org, v_year, v_classes[1], cs.id, cs.teacher_id, v_room, x.weekday, x.starts_at, x.ends_at
  from (values
    ('MATH', 1, time '08:00', time '10:00'), ('FR', 1, time '10:15', time '12:15'),
    ('ANG', 2, time '08:00', time '10:00'), ('MATH', 3, time '08:00', time '10:00'),
    ('SVT', 3, time '10:15', time '12:15'), ('FR', 4, time '08:00', time '10:00'),
    ('HG', 5, time '08:00', time '10:00'), ('EPS', 5, time '15:00', time '17:00')
  ) as x(code, weekday, starts_at, ends_at)
  join public.subjects s on s.organization_id = v_org and s.code = x.code
  join public.class_subjects cs on cs.class_id = v_classes[1] and cs.subject_id = s.id;

  -- Frais
  insert into public.fee_types (organization_id, name, code, category) values (v_org, 'Frais d''inscription', 'INSC', 'registration') returning id into v_fee_reg;
  insert into public.fee_types (organization_id, name, code, category) values (v_org, 'Frais de scolarité', 'SCOL', 'tuition') returning id into v_fee_tuition;
  insert into public.fee_types (organization_id, name, code, category) values (v_org, 'Cantine', 'CANT', 'canteen');
  insert into public.fee_rates (organization_id, academic_year_id, fee_type_id, amount, installment_plan) values
    (v_org, v_year, v_fee_reg, 25000, '[]'),
    (v_org, v_year, v_fee_tuition, 180000,
     '[{"label":"1re tranche","due_on":"2026-10-05","percent":40},{"label":"2e tranche","due_on":"2027-01-11","percent":30},{"label":"3e tranche","due_on":"2027-04-12","percent":30}]');

  -- Élèves, parents, inscriptions, factures, paiements
  for i in 1..24 loop
    v_class_index := ((i - 1) % 4) + 1;
    v_sex := case when i % 2 = 0 then 'F' else 'M' end;

    if i = 1 then
      -- Élève disposant d'un compte (portail élève) — enfant du parent de démonstration
      insert into public.students (organization_id, user_id, first_name, last_name, sex, birth_date, birth_place, nationality, city, status)
      values (v_org, '00000000-0000-4000-a000-000000000009', 'Kofi', 'BAMBA', 'M', date '2014-03-12', 'Abidjan', 'Ivoirienne', 'Abidjan', 'active')
      returning id into v_student;
    elsif i = 3 then
      insert into public.students (organization_id, first_name, last_name, sex, birth_date, birth_place, nationality, city, status)
      values (v_org, 'Aya', 'BAMBA', 'F', date '2013-06-02', 'Abidjan', 'Ivoirienne', 'Abidjan', 'active')
      returning id into v_student;
    else
      insert into public.students (organization_id, first_name, last_name, sex, birth_date, birth_place, nationality, city, status)
      values (v_org,
              v_first_names[((i * 7) % array_length(v_first_names, 1)) + 1],
              v_last_names[((i * 5) % array_length(v_last_names, 1)) + 1],
              v_sex, date '2012-01-01' + (i * 37), 'Abidjan', 'Ivoirienne', 'Abidjan', 'active')
      returning id into v_student;
    end if;

    if i in (1, 3) then
      select id into v_guardian from public.guardians where organization_id = v_org and user_id = '00000000-0000-4000-a000-000000000008';
      if v_guardian is null then
        insert into public.guardians (organization_id, user_id, first_name, last_name, sex, phone, email, profession, city)
        values (v_org, '00000000-0000-4000-a000-000000000008', 'Adjoua', 'BAMBA', 'F', '+2250700000001', 'parent@demo.neoscol.app', 'Commerçante', 'Abidjan')
        returning id into v_guardian;
      end if;
    else
      insert into public.guardians (organization_id, first_name, last_name, sex, phone, city)
      select v_org, v_first_names[((i * 3) % array_length(v_first_names, 1)) + 1], s.last_name, 'M',
             '+22507' || lpad((10000000 + i)::text, 8, '0'), 'Abidjan'
      from public.students s where s.id = v_student
      returning id into v_guardian;
    end if;
    insert into public.student_guardians (organization_id, student_id, guardian_id, relationship, is_primary, is_financial_responsible)
    values (v_org, v_student, v_guardian, case when i in (1, 3) then 'mother' else 'father' end, true, true);

    insert into public.enrollments (organization_id, student_id, academic_year_id, class_id, level_id, type, status)
    select v_org, v_student, v_year, v_classes[v_class_index], c.level_id,
           case when i % 3 = 0 then 'reenrollment' else 'new' end::public.enrollment_type,
           'validated'
    from public.classes c where c.id = v_classes[v_class_index]
    returning id into v_enrollment;

    insert into public.invoices (organization_id, student_id, enrollment_id, academic_year_id, issued_on, due_on, status)
    values (v_org, v_student, v_enrollment, v_year, date '2026-09-01', date '2027-04-12', 'draft')
    returning id into v_invoice;
    insert into public.invoice_lines (organization_id, invoice_id, fee_type_id, description, unit_amount, discount_amount, discount_reason, sort_order) values
      (v_org, v_invoice, v_fee_reg, 'Frais d''inscription 2026-2027', 25000, 0, null, 1),
      (v_org, v_invoice, v_fee_tuition, 'Frais de scolarité 2026-2027', 180000,
       case when i = 3 then 18000 else 0 end, case when i = 3 then 'Remise fratrie (10 %)' end, 2);
    insert into public.installments (organization_id, invoice_id, label, due_on, amount, sequence) values
      (v_org, v_invoice, 'Inscription + 1re tranche', date '2026-09-15', case when i = 3 then 89800 else 97000 end, 1),
      (v_org, v_invoice, '2e tranche', date '2027-01-11', case when i = 3 then 48600 else 54000 end, 2),
      (v_org, v_invoice, '3e tranche', date '2027-04-12', case when i = 3 then 48600 else 54000 end, 3);
    update public.invoices set status = 'issued' where id = v_invoice;

    -- Paiements variés : soldé, partiel, rien
    v_amount := case when i % 4 = 0 then 205000 when i % 4 = 1 then 97000 when i % 4 = 2 then 50000 else 0 end;
    if i = 3 then v_amount := 89800; end if;
    if i = 1 then v_amount := 0; end if; -- Kofi : 1re tranche impayée (démonstration des restrictions)
    if v_amount > 0 then
      insert into public.payments (organization_id, invoice_id, amount, method, reference, payer_name, paid_at)
      values (v_org, v_invoice, v_amount,
              (array['cash', 'mobile_money', 'bank_transfer'])[(i % 3) + 1]::public.payment_method,
              case when i % 3 = 1 then 'MM-' || lpad(i::text, 8, '0') end,
              'Parent de l''élève', timestamptz '2026-09-10 09:00+00' + (i || ' days')::interval);
    end if;
  end loop;

  -- Une inscription en attente (réinscription à valider) et un prospect
  insert into public.students (organization_id, first_name, last_name, sex, birth_date, city, status)
  values (v_org, 'Prisca', 'ASSI', 'F', date '2013-11-20', 'Abidjan', 'prospect') returning id into v_student;
  insert into public.enrollments (organization_id, student_id, academic_year_id, class_id, level_id, type, status, form_data)
  select v_org, v_student, v_year, v_classes[2], c.level_id, 'new', 'pending', '{"previous_school":"EPP Démo","canteen":true}'
  from public.classes c where c.id = v_classes[2];

  -- Évaluations et notes (6e A, mathématiques et français, 1er trimestre)
  for v_cs in select cs.id from public.class_subjects cs
              join public.subjects s on s.id = cs.subject_id
              where cs.class_id = v_classes[1] and s.code in ('MATH', 'FR')
  loop
    for i in 1..2 loop
      insert into public.assessments (organization_id, class_subject_id, academic_period_id, title, kind, assessed_on, coefficient, is_published)
      values (v_org, v_cs, v_t1, (array['Devoir surveillé n°1', 'Interrogation écrite'])[i],
              (array['test', 'homework'])[i], date '2026-10-01' + (i * 14), (array[2, 1])[i], true)
      returning id into v_assessment;
      insert into public.grades (organization_id, assessment_id, student_id, score)
      select v_org, v_assessment, e.student_id,
             least(20, round((8 + ((abs(hashtext(e.student_id::text || v_assessment::text)) % 120) / 10.0))::numeric, 2))
      from public.enrollments e where e.class_id = v_classes[1] and e.status = 'validated';
    end loop;
  end loop;

  -- Présences (6e A, deux séances)
  for i in 1..2 loop
    insert into public.attendance_sessions (organization_id, class_id, session_date, starts_at, ends_at, status)
    values (v_org, v_classes[1], current_date - i, time '08:00', time '10:00', 'validated')
    returning id into v_session;
    insert into public.attendance_records (organization_id, session_id, student_id, status, minutes_late)
    select v_org, v_session, e.student_id,
           case when row_number() over (order by e.student_id) = 2 then 'absent'
                when row_number() over (order by e.student_id) = 4 then 'late'
                else 'present' end::public.attendance_status,
           case when row_number() over (order by e.student_id) = 4 then 15 end
    from public.enrollments e where e.class_id = v_classes[1] and e.status = 'validated';
  end loop;

  -- Badges du personnel (QR) et dépenses
  insert into public.staff_badges (organization_id, staff_id)
  select v_org, id from public.staff_members where organization_id = v_org;

  insert into public.expenses (organization_id, category_id, label, amount, spent_on, supplier, payment_method, reference)
  select v_org, c.id, x.label, x.amount, x.spent_on, x.supplier, x.method::public.payment_method, x.reference
  from (values
    ('Fournitures et matériel', 'Craies, marqueurs et registres', 85000, date '2026-09-08', 'Librairie de la Démo', 'cash', null),
    ('Électricité et eau', 'Facture d''électricité — août', 142500, date '2026-09-12', 'Compagnie d''électricité', 'bank_transfer', 'VIR-2026-0912'),
    ('Maintenance et réparations', 'Réparation des climatiseurs (salle 101)', 60000, date '2026-09-18', 'Froid Services', 'mobile_money', 'MM-44120087')
  ) as x(category, label, amount, spent_on, supplier, method, reference)
  join public.expense_categories c on c.organization_id = v_org and c.name = x.category;

  insert into public.announcements (organization_id, title, body, is_pinned, published_at, author_name)
  values (v_org, 'Bienvenue sur NéoScol (démonstration)',
          'Cet établissement est un environnement de démonstration : toutes les données sont fictives.',
          true, now(), 'Direction');
  insert into public.announcements (organization_id, title, body, audience, published_at, author_name)
  values (v_org, 'Réunion parents-professeurs', 'La réunion du 1er trimestre aura lieu le samedi 12 décembre à 9 h.',
          '{"personas":["parent","teacher"],"class_ids":[]}', now(), 'Direction');
end;
$$;

-- Données minimales de l'établissement DEMOF (formation professionnelle) -----------
do $$
declare
  v_org constant uuid := '10000000-0000-4000-a000-000000000002';
  v_year uuid;
  v_program uuid;
  v_class uuid;
  v_student uuid;
begin
  insert into public.academic_years (organization_id, name, starts_on, ends_on, is_current, status)
  values (v_org, '2026-2027', date '2026-09-01', date '2027-08-31', true, 'active') returning id into v_year;
  insert into public.programs (organization_id, name, code, kind, duration_hours)
  values (v_org, 'Électricité du bâtiment', 'ELEC', 'training', 480) returning id into v_program;
  insert into public.classes (organization_id, academic_year_id, program_id, kind, name, starts_on, ends_on)
  values (v_org, v_year, v_program, 'training_session', 'ELEC — Session octobre 2026', date '2026-10-05', date '2027-03-26')
  returning id into v_class;
  insert into public.students (organization_id, first_name, last_name, sex, birth_date, city, status)
  values (v_org, 'Hamed', 'SANOGO', 'M', date '2002-02-14', 'Bouaké', 'active') returning id into v_student;
  insert into public.enrollments (organization_id, student_id, academic_year_id, class_id, program_id, type, status)
  values (v_org, v_student, v_year, v_class, v_program, 'new', 'validated');
end;
$$;

-- Restrictions du portail en cas d'impayé activées pour la démonstration, une fois
-- l'historique des paiements chargé
-- (notes, bulletins et documents ; les présences restent toujours visibles).
update public.organizations
   set settings = jsonb_set(settings, '{portal_restrictions,enabled}', 'true')
 where id = '10000000-0000-4000-a000-000000000001';
