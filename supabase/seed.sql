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
    extensions.crypt('NeoScol-Demo-2026!', extensions.gen_salt('bf')), now(), ltrim(p_phone, '+'), -- GoTrue stocke le téléphone sans « + »
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
select pg_temp.demo_user('00000000-0000-4000-a000-000000000012', 'universite@demo.neoscol.app', 'Clarisse', 'ADOU');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000013', 'formateur@demo.neoscol.app', 'Koffi', 'AKA');
select pg_temp.demo_user('00000000-0000-4000-a000-000000000014', 'pointage.formation@demo.neoscol.app', 'Tablette', 'ATELIERS');

insert into public.platform_admins (user_id) values ('00000000-0000-4000-a000-000000000001');

-- Établissements (le provisionnement crée rôles, formulaires et modèles) -------------
insert into public.organizations (id, name, short_name, code, slug, type, email, phone, address, city, is_demo)
values
  ('10000000-0000-4000-a000-000000000001', 'Groupe Scolaire Démo NéoScol', 'GS Démo', 'DEMO', 'demo',
   'school_complex', 'contact@demo.neoscol.app', '+225 27 00 00 00 00', 'Boulevard de la Démonstration', 'Abidjan', true),
  ('10000000-0000-4000-a000-000000000002', 'Institut Démo de Formation Professionnelle', 'IDFP Démo', 'DEMOF', 'demo-formation',
   'vocational_center', 'contact@formation.demo.neoscol.app', '+225 27 00 00 00 01', 'Rue des Métiers', 'Bouaké', true),
  ('10000000-0000-4000-a000-000000000003', 'Université Démo NéoScol', 'UDN', 'DEMOU', 'demo-universite',
   'university', 'scolarite@universite.demo.neoscol.app', '+225 27 00 00 00 02', 'Campus de la Démonstration', 'Yamoussoukro', true);

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
select pg_temp.grant_role('10000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000012', 'org_admin');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000013', 'teacher');
select pg_temp.grant_role('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000014', 'kiosk');

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

-- Enrichissement de la démonstration ------------------------------------------------
-- Équipe pédagogique complète, emplois du temps des 4 classes (sans conflit),
-- 3 semaines d'appels validés, évaluations (interrogations, devoir, composition)
-- et notes, pointages du personnel, dépenses, notifications du personnel.
-- Les séances de mathématiques et de français de la 6e A restent celles
-- ci-dessus (utilisées par les tests du calcul des bulletins).
do $$
declare
  v_org constant uuid := '10000000-0000-4000-a000-000000000001';
  v_year uuid;
  v_t1 uuid;
  v_classes uuid[];
  v_rooms uuid[] := '{}';
  v_room uuid;
  v_staff uuid;
  v_cs record;
  v_slot record;
  v_session uuid;
  v_assessment uuid;
  v_day date;
  v_days date[] := '{}';
  v_block integer;
  v_c integer;
  v_pos integer;
  v_code text;
  v_arrival timestamptz;
  i integer;
  -- Semaine type : 14 créneaux de 2 h ; chaque classe décale la séquence de 3 créneaux,
  -- ce qui garantit l'absence de conflit pour les enseignants partagés.
  v_sequence text[] := array['MATH','FR','ANG','SVT','MATH','HG','FR','PC','MATH','ANG','FR','EPS'];
  v_block_day integer[] := array[1,1,1,2,2,2,3,3,4,4,4,5,5,5];
  v_block_start time[] := array['08:00','10:15','15:00','08:00','10:15','15:00','08:00','10:15','08:00','10:15','15:00','08:00','10:15','15:00']::time[];
  v_assess_titles text[] := array['Interrogation n°1', 'Devoir de maison', 'Interrogation n°2', 'Composition du 1er trimestre'];
  v_assess_kinds text[] := array['test', 'homework', 'test', 'exam'];
  v_assess_cols text[] := array['interro1', 'devoir', 'interro2', 'examen'];
  v_assess_coefs numeric[] := array[1, 1, 1, 2];
begin
  perform set_config('app.skip_audit', 'on', true);
  select id into v_year from public.academic_years where organization_id = v_org and is_current;
  select id into v_t1 from public.academic_periods where academic_year_id = v_year and sequence = 1;
  select array_agg(id order by name) into v_classes from public.classes where organization_id = v_org; -- 3e A, 5e A, 6e A, 6e B
  v_classes := array[v_classes[3], v_classes[4], v_classes[2], v_classes[1]];                         -- 6e A, 6e B, 5e A, 3e A

  -- Salles : une par classe
  insert into public.rooms (organization_id, name, building, capacity)
  values (v_org, 'Salle 103', 'Bâtiment A', 45), (v_org, 'Salle 104', 'Bâtiment C', 40);
  select array_agg(id order by name) into v_rooms from public.rooms where organization_id = v_org and name like 'Salle 10%';
  for i in 1..4 loop
    update public.classes set room_id = v_rooms[i] where id = v_classes[i];
  end loop;

  -- Équipe pédagogique et administrative
  insert into public.staff_members (organization_id, first_name, last_name, sex, email, phone, job_title, is_teacher, hired_on)
  values
    (v_org, 'Salif', 'COULIBALY', 'M', 'salif.coulibaly@demo.neoscol.app', '+2250700000012', 'Professeur de mathématiques', true, date '2018-09-01'),
    (v_org, 'Grâce', 'KOUADIO', 'F', 'grace.kouadio@demo.neoscol.app', '+2250700000013', 'Professeure de français', true, date '2020-09-01'),
    (v_org, 'Nadia', 'TOURÉ', 'F', 'nadia.toure@demo.neoscol.app', '+2250700000014', 'Professeure d''anglais', true, date '2017-09-01'),
    (v_org, 'Paul', 'AKA', 'M', 'paul.aka@demo.neoscol.app', '+2250700000015', 'Professeur de SVT', true, date '2016-09-01'),
    (v_org, 'Rokia', 'SANOGO', 'F', 'rokia.sanogo@demo.neoscol.app', '+2250700000016', 'Professeure d''histoire-géographie', true, date '2022-09-01'),
    (v_org, 'Didier', 'KOFFI', 'M', 'didier.koffi@demo.neoscol.app', '+2250700000017', 'Professeur de physique-chimie', true, date '2015-09-01'),
    (v_org, 'Hamed', 'DOSSO', 'M', 'hamed.dosso@demo.neoscol.app', '+2250700000018', 'Professeur d''EPS', true, date '2021-09-01'),
    (v_org, 'Christelle', 'ASSI', 'F', 'christelle.assi@demo.neoscol.app', '+2250700000019', 'Surveillante générale', false, date '2019-09-01'),
    (v_org, 'Emmanuel', 'DIABATÉ', 'M', 'emmanuel.diabate@demo.neoscol.app', '+2250700000020', 'Bibliothécaire', false, date '2023-01-09');
  insert into public.staff_badges (organization_id, staff_id)
  select v_org, st.id from public.staff_members st
  where st.organization_id = v_org and not exists (select 1 from public.staff_badges b where b.staff_id = st.id and b.status = 'active');

  -- Affectations (les mathématiques et le français de la 6e A / 6e B / 5e A restent inchangés)
  update public.class_subjects cs set teacher_id = st.id
    from public.subjects sub, public.staff_members st
   where cs.subject_id = sub.id and cs.teacher_id is null and st.organization_id = v_org
     and st.last_name = case sub.code
       when 'MATH' then 'COULIBALY' when 'FR' then 'KOUADIO' when 'ANG' then 'TOURÉ' when 'SVT' then 'AKA'
       when 'HG' then 'SANOGO' when 'PC' then 'KOFFI' when 'EPS' then 'DOSSO' end
     and cs.class_id = any (v_classes);
  update public.classes set head_teacher_id = (select id from public.staff_members where last_name = 'TOURÉ' and organization_id = v_org) where id = v_classes[2];
  update public.classes set head_teacher_id = (select id from public.staff_members where last_name = 'KOFFI' and organization_id = v_org) where id = v_classes[4];

  -- Emplois du temps : semaine type complète pour les 4 classes
  delete from public.timetable_slots where organization_id = v_org;
  for v_c in 1..4 loop
    for v_block in 1..14 loop
      v_pos := ((v_block - 1 + 3 * (v_c - 1)) % 14) + 1;
      continue when v_pos > array_length(v_sequence, 1);
      v_code := v_sequence[v_pos];
      insert into public.timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, room_id, weekday, starts_at, ends_at)
      select v_org, v_year, v_classes[v_c], cs.id, cs.teacher_id,
             case when v_code = 'EPS' then null else v_rooms[v_c] end,
             v_block_day[v_block], v_block_start[v_block], v_block_start[v_block] + interval '2 hours'
      from public.class_subjects cs join public.subjects sub on sub.id = cs.subject_id
      where cs.class_id = v_classes[v_c] and sub.code = v_code;
    end loop;
  end loop;

  -- Jours de classe des 3 dernières semaines (depuis la rentrée)
  select array_agg(d::date order by d) into v_days
  from generate_series(greatest(date '2026-09-08', current_date - 21), current_date - 1, interval '1 day') d
  where extract(isodow from d) between 1 and 5;
  v_days := coalesce(v_days, '{}');

  -- Appels validés (sauf les 2 séances historiques de la 6e A)
  foreach v_day in array v_days loop
    for v_slot in
      select ts.* from public.timetable_slots ts
      join public.class_subjects cs on cs.id = ts.class_subject_id
      join public.subjects sub on sub.id = cs.subject_id
      where ts.organization_id = v_org and ts.weekday = extract(isodow from v_day)
        and not (ts.class_id = v_classes[1] and sub.code in ('MATH', 'FR'))
        and not exists (select 1 from public.attendance_sessions x
                        where x.class_id = ts.class_id and x.session_date = v_day and x.starts_at = ts.starts_at)
    loop
      insert into public.attendance_sessions (organization_id, class_id, class_subject_id, timetable_slot_id, session_date, starts_at, ends_at, taken_by, status, validated_at)
      values (v_org, v_slot.class_id, v_slot.class_subject_id, v_slot.id, v_day, v_slot.starts_at, v_slot.ends_at,
              (select user_id from public.staff_members where id = v_slot.teacher_id), 'validated', v_day + v_slot.starts_at + interval '20 minutes')
      returning id into v_session;
      insert into public.attendance_records (organization_id, session_id, student_id, status, minutes_late, arrived_at, comment)
      select v_org, v_session, e.student_id, x.status::public.attendance_status,
             case when x.status = 'late' then 5 + x.h % 20 end,
             case when x.status = 'late' then v_slot.starts_at + ((5 + x.h % 20) || ' minutes')::interval end,
             case when x.status = 'late' and x.h % 3 = 0 then 'Transport en retard' end
      from public.enrollments e
      cross join lateral (select abs(hashtext(e.student_id::text || v_session::text)) % 100 as h) hh
      cross join lateral (select hh.h, case when hh.h < 5 then 'absent' when hh.h < 10 then 'late' else 'present' end as status) x
      where e.class_id = v_slot.class_id and e.status = 'validated';
    end loop;
  end loop;

  -- Absences justifiées par l'administration (une sur trois)
  update public.attendance_records r set status = 'excused', is_justified = true, justification = 'Certificat médical', justified_at = now()
   where r.organization_id = v_org and r.status = 'absent' and abs(hashtext(r.id::text)) % 3 = 0;

  -- Justificatifs déposés par les familles, à examiner
  insert into public.absence_justifications (organization_id, student_id, starts_on, ends_on, reason, status, submitted_via)
  select distinct on (r.student_id) v_org, r.student_id, s.session_date, s.session_date,
         'Rendez-vous médical (certificat à déposer)', 'pending', 'portal'
  from public.attendance_records r join public.attendance_sessions s on s.id = r.session_id
  where r.organization_id = v_org and r.status = 'absent'
  order by r.student_id, s.session_date desc
  limit 3;

  -- Évaluations du 1er trimestre : interrogations, devoir, composition, pour chaque matière
  for v_cs in
    select cs.id, cs.class_id, sub.code, array_position(v_classes, cs.class_id) as c
    from public.class_subjects cs join public.subjects sub on sub.id = cs.subject_id
    where cs.organization_id = v_org and cs.class_id = any (v_classes)
      and not (cs.class_id = v_classes[1] and sub.code in ('MATH', 'FR'))
  loop
    for i in 1..4 loop
      insert into public.assessments (organization_id, class_subject_id, academic_period_id, title, kind, column_key,
                                      assessed_on, coefficient, max_score, is_published)
      values (v_org, v_cs.id, v_t1, v_assess_titles[i], v_assess_kinds[i], v_assess_cols[i],
              greatest(date '2026-09-10', current_date - (4 - i) * 4 - 1), v_assess_coefs[i], 20,
              -- La composition de la 3e A n'est pas encore publiée (démonstration de la publication)
              not (i = 4 and v_cs.c = 4))
      returning id into v_assessment;
      insert into public.grades (organization_id, assessment_id, student_id, score, is_absent)
      select v_org, v_assessment, e.student_id,
             case when abs(hashtext(e.student_id::text || v_assessment::text)) % 50 = 0 then null
                  else least(20, greatest(2, round((6 + abs(hashtext(e.student_id::text)) % 9
                        + (abs(hashtext(e.student_id::text || v_assessment::text)) % 70) / 10.0)::numeric * 2) / 2)) end,
             abs(hashtext(e.student_id::text || v_assessment::text)) % 50 = 0
      from public.enrollments e where e.class_id = v_cs.class_id and e.status = 'validated';
      update public.assessments set grades_status = 'validated', grades_validated_at = now()
       where id = v_assessment and i < 4;
    end loop;
  end loop;

  -- Pointage du personnel (enseignants et surveillance) sur la même période
  foreach v_day in array v_days loop
    for v_staff in select id from public.staff_members where organization_id = v_org and (is_teacher or job_title = 'Surveillante générale') loop
      i := abs(hashtext(v_staff::text || v_day::text)) % 40;
      continue when i = 0; -- absence ponctuelle
      v_arrival := (v_day + time '07:35' + (i || ' minutes')::interval) at time zone 'Africa/Abidjan';
      insert into public.staff_attendance (organization_id, staff_id, work_date, arrived_at, departed_at, expected_start, minutes_late)
      values (v_org, v_staff, v_day, v_arrival, v_arrival + interval '9 hours', time '08:00', greatest(0, i - 30));
      insert into public.badge_scans (organization_id, staff_id, badge_id, scanned_at, result, kind, reason, message, device)
      select v_org, v_staff, b.id, v_arrival, 'accepted', 'arrival', 'ok',
             case when i > 30 then 'Arrivée enregistrée — retard de ' || (i - 30) || ' min' else 'Arrivée enregistrée' end, 'Tablette accueil'
      from public.staff_badges b where b.staff_id = v_staff and b.status = 'active';
    end loop;
  end loop;

  -- Dépenses des derniers mois
  insert into public.expenses (organization_id, category_id, label, amount, spent_on, supplier, payment_method, reference, comment)
  select v_org, c.id, x.label, x.amount, x.spent_on, x.supplier, x.method::public.payment_method, x.reference, x.comment
  from (values
    ('Salaires et honoraires', 'Vacations — préparation de la rentrée', 350000, date '2026-08-28', 'Enseignants vacataires', 'bank_transfer', 'VIR-2026-0828', 'Journées pédagogiques'),
    ('Fournitures et matériel', 'Manuels scolaires (dotation bibliothèque)', 275000, date '2026-08-20', 'Librairie de France Démo', 'bank_transfer', 'VIR-2026-0820', null),
    ('Transport', 'Carburant du car scolaire — septembre', 95000, date '2026-09-05', 'Station Démo', 'cash', null, null),
    ('Communication', 'Forfait internet — septembre', 45000, date '2026-09-02', 'Opérateur Démo', 'mobile_money', 'MM-55012011', null),
    ('Maintenance et réparations', 'Peinture des salles 103 et 104', 180000, date '2026-08-12', 'Bâtiment Services', 'cash', null, 'Avant la rentrée'),
    ('Électricité et eau', 'Facture d''eau — août', 38500, date '2026-09-15', 'Société des eaux', 'bank_transfer', 'VIR-2026-0915', null),
    ('Autres dépenses', 'Cérémonie de rentrée', 65000, date '2026-09-07', 'Traiteur Démo', 'cash', null, null),
    ('Fournitures et matériel', 'Ramettes de papier et toner', 52000, date '2026-09-19', 'Bureau Plus Démo', 'mobile_money', 'MM-55012987', null)
  ) as x(category, label, amount, spent_on, supplier, method, reference, comment)
  join public.expense_categories c on c.organization_id = v_org and c.name = x.category;

  -- Notifications du personnel (centre de notifications)
  perform app.notify(v_org, '00000000-0000-4000-a000-000000000005', 'payment.recorded', 'Nouveau paiement enregistré',
                     '50 000 FCFA reçus par Mobile Money.', '/finances?onglet=paiements');
  perform app.notify(v_org, '00000000-0000-4000-a000-000000000002', 'payment.recorded', 'Nouveau paiement enregistré',
                     '97 000 FCFA reçus (1re tranche).', '/finances?onglet=paiements');
  perform app.notify(v_org, '00000000-0000-4000-a000-000000000002', 'justification.submitted', 'Justificatif reçu',
                     '3 justificatifs d''absence sont à examiner.', '/presences?onglet=justificatifs');
  perform app.notify(v_org, '00000000-0000-4000-a000-000000000004', 'justification.submitted', 'Justificatif reçu',
                     '3 justificatifs d''absence sont à examiner.', '/presences?onglet=justificatifs');
  perform app.notify(v_org, '00000000-0000-4000-a000-000000000002', 'invoice.overdue', 'Paiements en retard',
                     'Plusieurs familles ont une échéance dépassée : envoyez les rappels.', '/finances?onglet=rappels');
  perform app.notify(v_org, '00000000-0000-4000-a000-000000000003', 'grades.validated', 'Notes validées',
                     'Les interrogations du 1er trimestre sont validées dans toutes les classes.', '/notes');
  perform app.notify(v_org, '00000000-0000-4000-a000-000000000006', 'lesson.unlocked', 'Cours déverrouillé',
                     'Votre badge a été scanné : l''appel de 6e A est disponible.', '/mes-cours');
  perform app.notify(v_org, '00000000-0000-4000-a000-000000000007', 'report_card.available', 'Bulletins en préparation',
                     'Consultez l''aperçu des bulletins de vos classes.', '/bulletins/apercu');
end;
$$;

-- Restrictions du portail en cas d'impayé activées pour la démonstration, une fois
-- l'historique des paiements chargé
-- (notes, bulletins et documents ; les présences restent toujours visibles).
update public.organizations
   set settings = jsonb_set(settings, '{portal_restrictions,enabled}', 'true')
 where id = '10000000-0000-4000-a000-000000000001';

-- Université de démonstration (LMD) : semestres, unités d'enseignement avec crédits
-- ECTS, une promotion de Licence 1, notes et relevés du semestre 1 publiés.
do $$
declare
  v_org constant uuid := '10000000-0000-4000-a000-000000000003';
  v_admin constant uuid := '00000000-0000-4000-a000-000000000012';
  v_year uuid;
  v_s1 uuid;
  v_level uuid;
  v_program uuid;
  v_class uuid;
  v_teachers uuid[] := '{}';
  v_staff uuid;
  v_subject uuid;
  v_cs uuid;
  v_student uuid;
  v_assessment uuid;
  i integer;
  k integer;
  v_ue_names text[] := array['Algorithmique et programmation', 'Mathématiques discrètes', 'Architecture des ordinateurs',
                             'Programmation web', 'Anglais scientifique', 'Méthodologie du travail universitaire'];
  v_ue_codes text[] := array['INF101', 'MAT101', 'INF102', 'INF103', 'LAN101', 'MET101'];
  v_ue_credits numeric[] := array[6, 6, 6, 6, 3, 3];
  v_first text[] := array['Kouamé', 'Aïcha', 'Brice', 'Fanta', 'Hervé', 'Josiane', 'Lamine', 'Mireille', 'Olivier', 'Sandrine'];
  v_last text[] := array['KONAN', 'CISSÉ', 'ZADI', 'KEITA', 'GNAHORÉ', 'AMANI', 'FOFANA', 'YAPI', 'TANOH', 'BROU'];
begin
  perform set_config('app.skip_audit', 'on', true);
  -- Les calculs de relevés s'exécutent au nom de l'administratrice de l'université.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  insert into public.academic_years (organization_id, name, starts_on, ends_on, is_current, status)
  values (v_org, '2026-2027', date '2026-10-05', date '2027-07-16', true, 'active') returning id into v_year;
  insert into public.academic_periods (organization_id, academic_year_id, name, type, sequence, starts_on, ends_on)
  values (v_org, v_year, 'Semestre 1', 'semester', 1, date '2026-10-05', date '2027-02-12') returning id into v_s1;
  insert into public.academic_periods (organization_id, academic_year_id, name, type, sequence, starts_on, ends_on)
  values (v_org, v_year, 'Semestre 2', 'semester', 2, date '2027-02-22', date '2027-07-16');

  insert into public.levels (organization_id, name, short_name, cycle, sequence)
  values (v_org, 'Licence 1', 'L1', 'Licence', 1) returning id into v_level;
  insert into public.levels (organization_id, name, short_name, cycle, sequence)
  values (v_org, 'Licence 2', 'L2', 'Licence', 2), (v_org, 'Licence 3', 'L3', 'Licence', 3), (v_org, 'Master 1', 'M1', 'Master', 4);
  insert into public.programs (organization_id, name, code, kind)
  values (v_org, 'Licence Informatique', 'LINFO', 'degree') returning id into v_program;

  for i in 1..3 loop
    insert into public.staff_members (organization_id, first_name, last_name, sex, email, job_title, is_teacher, hired_on)
    values (v_org, (array['Clément', 'Rachelle', 'Désiré'])[i], (array['KOUAKOU', 'ADJOBI', 'N''DRI'])[i], (array['M', 'F', 'M'])[i],
            (array['c.kouakou', 'r.adjobi', 'd.ndri'])[i] || '@universite.demo.neoscol.app',
            (array['Maître de conférences', 'Professeure titulaire', 'Chargé de cours'])[i], true, date '2018-10-01')
    returning id into v_staff;
    v_teachers := v_teachers || v_staff;
  end loop;

  insert into public.classes (organization_id, academic_year_id, level_id, program_id, name, code, capacity, head_teacher_id)
  values (v_org, v_year, v_level, v_program, 'L1 Informatique', 'L1INF', 60, v_teachers[1]) returning id into v_class;

  for i in 1..array_length(v_ue_codes, 1) loop
    insert into public.subjects (organization_id, name, code, kind, program_id, credits)
    values (v_org, v_ue_names[i], v_ue_codes[i], 'module', v_program, v_ue_credits[i]) returning id into v_subject;
    insert into public.class_subjects (organization_id, class_id, subject_id, teacher_id, coefficient, weekly_hours)
    values (v_org, v_class, v_subject, v_teachers[1 + (i - 1) % 3], v_ue_credits[i], v_ue_credits[i]);
  end loop;

  for i in 1..array_length(v_first, 1) loop
    insert into public.students (organization_id, first_name, last_name, sex, birth_date, city, status)
    values (v_org, v_first[i], v_last[i], case when i % 2 = 0 then 'F' else 'M' end,
            date '2006-01-15' + (i * 47), 'Yamoussoukro', 'active') returning id into v_student;
    insert into public.enrollments (organization_id, student_id, academic_year_id, class_id, level_id, program_id, type, status)
    values (v_org, v_student, v_year, v_class, v_level, v_program, 'new', 'validated');
  end loop;

  -- Semestre 1 : contrôle continu (coef. 1) et examen (coef. 2) par unité d'enseignement
  for v_cs in select id from public.class_subjects where class_id = v_class loop
    for k in 1..2 loop
      insert into public.assessments (organization_id, class_subject_id, academic_period_id, title, kind, column_key,
                                      assessed_on, coefficient, max_score, is_published)
      values (v_org, v_cs, v_s1, (array['Contrôle continu', 'Examen du semestre 1'])[k], (array['test', 'exam'])[k],
              (array['cc', 'examen'])[k], date '2026-12-01' + (k - 1) * 60, k, 20, true)
      returning id into v_assessment;
      insert into public.grades (organization_id, assessment_id, student_id, score)
      select v_org, v_assessment, e.student_id,
             least(19, greatest(4, round((5 + abs(hashtext(e.student_id::text)) % 10
                   + (abs(hashtext(e.student_id::text || v_assessment::text)) % 60) / 10.0)::numeric * 2) / 2))
      from public.enrollments e where e.class_id = v_class and e.status = 'validated';
      update public.assessments set grades_status = 'validated', grades_validated_at = now() where id = v_assessment;
    end loop;
  end loop;

  update public.organization_branding
     set signatory_name = 'Pr. Clarisse ADOU', signatory_title = 'Présidente de l''université',
         header_text = 'Université de démonstration — données fictives', primary_color = '#0E7490', secondary_color = '#172554'
   where organization_id = v_org;
  -- Relevé LMD : contrôle continu et examen ; décisions de jury ; pas de classement.
  update public.report_card_settings
     set config = config
       || jsonb_build_object('title', 'RELEVÉ DE NOTES DU SEMESTRE',
            'columns', '[{"key":"cc","label":"CC","kinds":["test","homework","oral","practical","project"],"weight":1},
                         {"key":"examen","label":"EXAMEN","kinds":["exam","other"],"weight":2}]'::jsonb,
            'decisions', '[{"min":10,"label":"Semestre validé"},{"min":8,"label":"Semestre non validé — compensation possible"},
                           {"min":0,"label":"Ajourné(e)"}]'::jsonb,
            'signatures', '[{"label":"Le responsable de la promotion"},{"label":"La présidente de l''université"}]'::jsonb,
            'show_rank', false)
   where organization_id = v_org;

  perform public.compute_report_cards(v_class, v_s1);
  update public.report_cards set status = 'published', published_at = now()
   where class_id = v_class and academic_period_id = v_s1;

  update public.organizations
     set settings = jsonb_set(jsonb_set(settings, '{grading,credit_threshold}', '10'), '{features,ranking}', 'false')
   where id = v_org;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- MODULE 2 — FORMATION PROFESSIONNELLE : démonstration DEMOF -----------------------
-- Formations libres (bureautique, couture, électricité), deux sessions EN COURS
-- (dates relatives au jour de l'installation), formateurs avec badges, apprenants
-- inscrits avec échéancier et premiers versements, emploi du temps, badges QR,
-- historique d'entrées / sorties, compétences et un stage. Centre SANS classes
-- (groupes désactivés) : le logiciel fonctionne sans groupes.
do $$
declare
  v_org constant uuid := '10000000-0000-4000-a000-000000000002';
  v_year uuid;
  v_tz text;
  v_elec uuid;
  v_bur uuid;
  v_cout uuid;
  v_s_bur uuid;
  v_s_cout uuid;
  v_room_b2 uuid;
  v_room_at uuid;
  v_room_el uuid;
  v_aka uuid;
  v_traore uuid;
  v_konan uuid;
  v_bamba uuid;
  v_word uuid;
  v_excel uuid;
  v_net uuid;
  v_coupe uuid;
  v_montage uuid;
  v_cs uuid;
  v_learner record;
  v_result jsonb;
  v_i integer := 0;
  v_d date;
  v_c1 uuid;
  v_c2 uuid;
  v_c3 uuid;
  v_enr uuid;
  v_student uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000010","role":"authenticated"}', true);
  select id into v_year from public.academic_years where organization_id = v_org and is_current;
  select timezone into v_tz from public.organizations where id = v_org;
  insert into public.academic_periods (organization_id, academic_year_id, name, type, sequence, starts_on, ends_on) values
    (v_org, v_year, 'Semestre 1', 'semester', 1, date '2026-09-01', date '2027-01-31'),
    (v_org, v_year, 'Semestre 2', 'semester', 2, date '2027-02-01', date '2027-08-31');

  insert into public.rooms (organization_id, name, building, capacity) values (v_org, 'Salle informatique B2', 'Bâtiment B', 16) returning id into v_room_b2;
  insert into public.rooms (organization_id, name, building, capacity) values (v_org, 'Atelier couture', 'Ateliers', 12) returning id into v_room_at;
  insert into public.rooms (organization_id, name, building, capacity) values (v_org, 'Atelier électricité', 'Ateliers', 14) returning id into v_room_el;

  -- Formations (définies librement par le centre)
  select id into v_elec from public.programs where organization_id = v_org and code = 'ELEC';
  update public.programs
     set training_level = 'Niveau 3e (BEPC) ou équivalent', duration_label = '6 mois',
         admission_conditions = 'Avoir 16 ans révolus ; test de positionnement et entretien.',
         certificate_title = 'Certificat de qualification professionnelle — Électricien du bâtiment',
         syllabus = 'Électricité générale ; lecture de schémas ; installations domestiques ; sécurité électrique ; stage en entreprise.',
         tuition_amount = 350000, registration_fee = 25000, default_installments = 3,
         description = 'Former des électriciens capables de réaliser et dépanner des installations domestiques.'
   where id = v_elec;
  insert into public.programs (organization_id, name, code, kind, duration_hours, duration_label, training_level, admission_conditions,
                               certificate_title, syllabus, tuition_amount, registration_fee, default_installments, description)
  values (v_org, 'Informatique bureautique', 'BUREAU', 'training', 120, '3 mois', 'Savoir lire et écrire',
          'Aucun prérequis en informatique.', 'Attestation de formation en bureautique',
          'Traitement de texte (Word) ; tableur (Excel) ; Internet et messagerie professionnelle.',
          150000, 10000, 3, 'Maîtriser les outils bureautiques du quotidien professionnel.')
  returning id into v_bur;
  insert into public.programs (organization_id, name, code, kind, duration_hours, duration_label, training_level, admission_conditions,
                               certificate_title, syllabus, tuition_amount, registration_fee, default_installments, description)
  values (v_org, 'Couture et stylisme', 'COUTURE', 'training', 600, '9 mois', 'Aucun niveau exigé',
          'Entretien de motivation.', 'Certificat de fin de formation — Couture et stylisme',
          'Prise de mesures ; patronage ; coupe ; montage ; finitions ; stage en atelier.',
          300000, 15000, 6, 'Former des couturiers et couturières autonomes.')
  returning id into v_cout;

  insert into public.subjects (organization_id, program_id, name, code, kind) values (v_org, v_bur, 'Traitement de texte', 'WORD', 'module') returning id into v_word;
  insert into public.subjects (organization_id, program_id, name, code, kind) values (v_org, v_bur, 'Tableur', 'EXCEL', 'module') returning id into v_excel;
  insert into public.subjects (organization_id, program_id, name, code, kind) values (v_org, v_bur, 'Internet et messagerie', 'NET', 'module') returning id into v_net;
  insert into public.subjects (organization_id, program_id, name, code, kind) values (v_org, v_cout, 'Coupe et patronage', 'COUPE', 'module') returning id into v_coupe;
  insert into public.subjects (organization_id, program_id, name, code, kind) values (v_org, v_cout, 'Montage et finitions', 'MONTAGE', 'module') returning id into v_montage;

  -- Formateurs (badges QR distincts de ceux des apprenants)
  insert into public.staff_members (organization_id, user_id, first_name, last_name, sex, job_title, is_teacher, phone, email)
  values (v_org, '00000000-0000-4000-a000-000000000013', 'Koffi', 'AKA', 'M', 'Formateur en informatique', true, '+225 07 11 22 33 01', 'formateur@demo.neoscol.app')
  returning id into v_aka;
  insert into public.staff_members (organization_id, first_name, last_name, sex, job_title, is_teacher, phone)
  values (v_org, 'Fanta', 'TRAORÉ', 'F', 'Formatrice en informatique', true, '+225 07 11 22 33 02') returning id into v_traore;
  insert into public.staff_members (organization_id, first_name, last_name, sex, job_title, is_teacher, phone)
  values (v_org, 'Ama', 'KONAN', 'F', 'Formatrice en couture', true, '+225 07 11 22 33 03') returning id into v_konan;
  insert into public.staff_members (organization_id, first_name, last_name, sex, job_title, is_teacher, phone)
  values (v_org, 'Issa', 'BAMBA', 'M', 'Formateur en électricité', true, '+225 07 11 22 33 04') returning id into v_bamba;
  perform public.issue_staff_badge(x, null) from unnest(array[v_aka, v_traore, v_konan, v_bamba]) x;
  update public.classes set head_teacher_id = v_bamba, room_id = v_room_el, capacity = 14,
         tuition_amount = null, syllabus = 'Session de 24 semaines, stage de 4 semaines en entreprise.'
   where organization_id = v_org and program_id = v_elec;

  -- Sessions en cours (dates relatives : la démonstration fonctionne le jour même)
  insert into public.classes (organization_id, academic_year_id, program_id, kind, name, starts_on, ends_on, capacity, room_id, head_teacher_id, syllabus)
  values (v_org, v_year, v_bur, 'training_session', 'Bureautique — Session en cours', current_date - 28, current_date + 120, 16, v_room_b2, v_aka,
          'Trois modules : Word, Excel, Internet. Évaluation pratique en fin de module.')
  returning id into v_s_bur;
  insert into public.classes (organization_id, academic_year_id, program_id, kind, name, starts_on, ends_on, capacity, room_id, head_teacher_id)
  values (v_org, v_year, v_cout, 'training_session', 'Couture — Session en cours', current_date - 21, current_date + 240, 12, v_room_at, v_konan)
  returning id into v_s_cout;

  insert into public.class_subjects (organization_id, class_id, subject_id, teacher_id, weekly_hours) values (v_org, v_s_bur, v_word, v_aka, 12) returning id into v_cs;
  insert into public.timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, room_id, weekday, starts_at, ends_at)
  select v_org, v_year, v_s_bur, v_cs, v_aka, v_room_b2, d, time '08:00', time '10:00' from generate_series(1, 6) d;
  insert into public.class_subjects (organization_id, class_id, subject_id, teacher_id, weekly_hours) values (v_org, v_s_bur, v_excel, v_aka, 12) returning id into v_cs;
  insert into public.timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, room_id, weekday, starts_at, ends_at)
  select v_org, v_year, v_s_bur, v_cs, v_aka, v_room_b2, d, time '10:15', time '12:15' from generate_series(1, 6) d;
  insert into public.class_subjects (organization_id, class_id, subject_id, teacher_id, weekly_hours) values (v_org, v_s_bur, v_net, v_traore, 12) returning id into v_cs;
  insert into public.timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, room_id, weekday, starts_at, ends_at)
  select v_org, v_year, v_s_bur, v_cs, v_traore, v_room_b2, d, time '14:00', time '16:00' from generate_series(1, 6) d;
  insert into public.class_subjects (organization_id, class_id, subject_id, teacher_id, weekly_hours) values (v_org, v_s_cout, v_coupe, v_konan, 20) returning id into v_cs;
  insert into public.timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, room_id, weekday, starts_at, ends_at)
  select v_org, v_year, v_s_cout, v_cs, v_konan, v_room_at, d, time '08:00', time '12:00' from generate_series(1, 5) d;
  insert into public.class_subjects (organization_id, class_id, subject_id, teacher_id, weekly_hours) values (v_org, v_s_cout, v_montage, v_konan, 20) returning id into v_cs;
  insert into public.timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, room_id, weekday, starts_at, ends_at)
  select v_org, v_year, v_s_cout, v_cs, v_konan, v_room_at, d, time '13:00', time '17:00' from generate_series(1, 5) d;

  -- Apprenants : inscription complète (formation → session → tarif → échéancier → versement)
  for v_learner in
    select * from (values
      ('Aminata', 'COULIBALY', 'F', date '2001-04-12', '+225 07 40 00 00 01', 'BAC', 'bur', 'installments', 60000, 'mobile_money', 'Mariam COULIBALY', '+225 07 50 00 00 01'),
      ('Yao', 'KOUAKOU', 'M', date '1999-11-03', '+225 07 40 00 00 02', 'Licence 1', 'bur', 'full', 160000, 'cash', 'Jean KOUAKOU', '+225 07 50 00 00 02'),
      ('Salimata', 'OUÉDRAOGO', 'F', date '2003-06-21', '+225 07 40 00 00 03', 'Niveau 3e', 'bur', 'installments', 30000, 'cash', 'Awa OUÉDRAOGO', '+225 07 50 00 00 03'),
      ('Christian', 'N''DRI', 'M', date '2000-02-09', '+225 07 40 00 00 04', 'BAC', 'bur', 'installments', 0, 'cash', 'Paul N''DRI', '+225 07 50 00 00 04'),
      ('Fatou', 'DIABATÉ', 'F', date '2002-09-30', '+225 07 40 00 00 05', 'Niveau 1re', 'bur', 'full', 80000, 'mobile_money', 'Karim DIABATÉ', '+225 07 50 00 00 05'),
      ('Ismaël', 'TOURÉ', 'M', date '2004-01-17', '+225 07 40 00 00 06', 'BEPC', 'bur', 'installments', 60000, 'cash', 'Aïcha TOURÉ', '+225 07 50 00 00 06'),
      ('Grâce', 'ESSOH', 'F', date '1998-07-08', '+225 07 40 00 00 07', 'Niveau 3e', 'cout', 'installments', 65000, 'cash', 'Marie ESSOH', '+225 07 50 00 00 07'),
      ('Rokia', 'SANGARÉ', 'F', date '2000-12-25', '+225 07 40 00 00 08', 'CM2', 'cout', 'installments', 65000, 'mobile_money', 'Bakary SANGARÉ', '+225 07 50 00 00 08'),
      ('Josiane', 'KOFFI', 'F', date '1997-03-14', '+225 07 40 00 00 09', 'BEPC', 'cout', 'full', 315000, 'bank_transfer', 'Hervé KOFFI', '+225 07 50 00 00 09'),
      ('Brice', 'GNAHORÉ', 'M', date '2001-10-02', '+225 07 40 00 00 10', 'Niveau 4e', 'cout', 'installments', 0, 'cash', 'Odile GNAHORÉ', '+225 07 50 00 00 10')
    ) t(first_name, last_name, sex, birth_date, phone, level, sess, plan, paid, method, contact, contact_phone)
  loop
    v_i := v_i + 1;
    v_result := public.enroll_learner(v_org, jsonb_build_object(
      'student', jsonb_build_object('first_name', v_learner.first_name, 'last_name', v_learner.last_name, 'sex', v_learner.sex,
                                    'birth_date', v_learner.birth_date, 'phone', v_learner.phone, 'city', 'Bouaké',
                                    'education_level', v_learner.level),
      'guardian', jsonb_build_object('first_name', split_part(v_learner.contact, ' ', 1), 'last_name', split_part(v_learner.contact, ' ', 2),
                                     'phone', v_learner.contact_phone, 'relationship', 'other'),
      'session_id', case v_learner.sess when 'bur' then v_s_bur else v_s_cout end,
      'plan', v_learner.plan,
      'first_due_on', current_date - 20,
      'payment', jsonb_build_object('amount', v_learner.paid, 'method', v_learner.method, 'payer_name', v_learner.contact)));
    perform public.issue_student_badge((v_result ->> 'student_id')::uuid, null);
  end loop;
  -- L'apprenant déjà inscrit en électricité (session d'octobre) reçoit aussi son badge.
  perform public.issue_student_badge(s.id, null) from public.students s
   where s.organization_id = v_org and s.last_name = 'SANOGO' and s.status = 'active';

  -- Historique d'entrées / sorties des jours passés (quelques retards et absences)
  for v_learner in
    select e.student_id, e.id as enrollment_id, e.class_id, row_number() over (order by s.last_name) as n
    from public.enrollments e join public.students s on s.id = e.student_id
    where e.class_id in (v_s_bur, v_s_cout) and e.status = 'validated'
  loop
    for v_d in select d::date from generate_series(current_date - 20, current_date - 1, interval '1 day') d loop
      continue when not exists (select 1 from public.timetable_slots ts where ts.class_id = v_learner.class_id and ts.weekday = extract(isodow from v_d));
      continue when (extract(doy from v_d)::integer + v_learner.n) % 9 = 0; -- absent ce jour-là
      insert into public.learner_attendance (organization_id, student_id, enrollment_id, class_id, timetable_slot_id, room_id,
                                             attendance_date, entered_at, exited_at, expected_start, minutes_late)
      select v_org, v_learner.student_id, v_learner.enrollment_id, v_learner.class_id, ts.id, ts.room_id, v_d,
             (v_d + ts.starts_at - interval '6 minutes' + case when (extract(doy from v_d)::integer + v_learner.n) % 5 = 0 then interval '18 minutes' else interval '0' end) at time zone v_tz,
             (v_d + time '12:20') at time zone v_tz,
             ts.starts_at,
             case when (extract(doy from v_d)::integer + v_learner.n) % 5 = 0 then 12 else 0 end
      from public.timetable_slots ts
      where ts.class_id = v_learner.class_id and ts.weekday = extract(isodow from v_d) and ts.starts_at = time '08:00';
      insert into public.learner_attendance (organization_id, student_id, enrollment_id, class_id, timetable_slot_id, room_id,
                                             attendance_date, entered_at, exited_at, expected_start, minutes_late)
      select v_org, v_learner.student_id, v_learner.enrollment_id, v_learner.class_id, ts.id, ts.room_id, v_d,
             (v_d + ts.starts_at - interval '5 minutes') at time zone v_tz, (v_d + ts.ends_at + interval '4 minutes') at time zone v_tz, ts.starts_at, 0
      from public.timetable_slots ts
      where ts.class_id = v_learner.class_id and ts.weekday = extract(isodow from v_d) and ts.starts_at >= time '13:00';
    end loop;
  end loop;

  -- Compétences de la bureautique et premières évaluations
  insert into public.training_competencies (organization_id, program_id, name, sequence) values (v_org, v_bur, 'Saisir et mettre en forme un document professionnel', 1) returning id into v_c1;
  insert into public.training_competencies (organization_id, program_id, name, sequence) values (v_org, v_bur, 'Construire un tableau de calcul avec formules', 2) returning id into v_c2;
  insert into public.training_competencies (organization_id, program_id, name, sequence) values (v_org, v_bur, 'Utiliser une messagerie professionnelle', 3) returning id into v_c3;
  insert into public.training_competencies (organization_id, program_id, name, sequence) values
    (v_org, v_cout, 'Prendre des mesures et tracer un patron', 1),
    (v_org, v_cout, 'Couper et monter un vêtement simple', 2),
    (v_org, v_elec, 'Lire un schéma électrique', 1),
    (v_org, v_elec, 'Réaliser une installation domestique conforme', 2);
  for v_enr in select id from public.enrollments where class_id = v_s_bur and status = 'validated' loop
    insert into public.learner_competencies (organization_id, enrollment_id, student_id, competency_id, level)
    values (v_org, v_enr, (select student_id from public.enrollments where id = v_enr), v_c1, 'acquired'),
           (v_org, v_enr, (select student_id from public.enrollments where id = v_enr), v_c2, 'in_progress');
  end loop;

  -- Un stage en atelier
  select e.student_id, e.id into v_student, v_enr from public.enrollments e join public.students s on s.id = e.student_id
   where e.class_id = v_s_cout and s.last_name = 'KOFFI';
  insert into public.internships (organization_id, student_id, enrollment_id, company_name, company_address, company_phone,
                                  tutor_name, tutor_title, missions, starts_on, ends_on, status)
  values (v_org, v_student, v_enr, 'Atelier Mode Élégance', 'Quartier Commerce, Bouaké', '+225 27 31 00 00 00',
          'Mme Adjoua KOUAMÉ', 'Styliste, gérante', 'Retouches, montage de pagnes, accueil de la clientèle.',
          current_date + 60, current_date + 90, 'planned');

  perform set_config('request.jwt.claims', '', true);
end;
$$;
