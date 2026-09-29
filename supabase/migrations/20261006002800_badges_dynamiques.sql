-- =============================================================================
-- P5 — « MON BADGE » : badge numérique avec QR code tournant
--
-- Le téléphone de l'enseignant (ou de l'apprenant / étudiant) affiche un QR
-- code qui change toutes les 30 secondes :
--   NEOSCOL-DYN:<S|E>:<badge>:<fenêtre>:<signature>
-- La signature (HMAC-SHA256) est calculée en base avec le jeton secret du
-- badge, qui n'est JAMAIS envoyé au téléphone. À la tablette de pointage :
--   * signature vérifiée, fenêtre de ±1 min, badge actif ;
--   * usage unique : une capture d'écran réutilisée est refusée ;
--   * puis le pointage existant s'applique à l'identique (aucune règle modifiée).
-- Le badge imprimé (QR fixe) reste valable.
-- =============================================================================

create table public.badge_dynamic_uses (
  badge_id uuid not null,
  time_window bigint not null,
  used_at timestamptz not null default now(),
  primary key (badge_id, time_window)
);
alter table public.badge_dynamic_uses enable row level security;
revoke all on public.badge_dynamic_uses from anon, authenticated;

create or replace function app.badge_signature(p_token text, p_kind text, p_badge uuid, p_window bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(encode(extensions.hmac(p_kind || ':' || p_badge::text || ':' || p_window::text, p_token, 'sha256'), 'hex'), 20);
$$;
revoke execute on function app.badge_signature(text, text, uuid, bigint) from public, anon, authenticated;

create or replace function app.badge_window()
returns bigint
language sql
stable
set search_path = ''
as $$
  select floor(extract(epoch from now()) / 30)::bigint;
$$;

-- Mon badge (utilisateur connecté, établissement actif) : identité + QR du moment.
create or replace function public.my_badge(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_window bigint := app.badge_window();
  v_org public.organizations;
  v_color text;
  v_staff record;
  v_student record;
begin
  if auth.uid() is null or not (p_org = any (app.member_org_ids())) or not app.mfa_satisfied() then
    return null;
  end if;
  select * into v_org from public.organizations where id = p_org;
  select primary_color into v_color from public.organization_branding where organization_id = p_org;
  select b.id, b.number, b.token, b.issued_at, s.first_name, s.last_name, s.job_title, s.employee_number, s.photo_path as photo_file_id, s.is_teacher
    into v_staff
    from public.staff_badges b join public.staff_members s on s.id = b.staff_id
   where s.user_id = auth.uid() and b.organization_id = p_org and b.status = 'active'
     and s.status = 'active' and s.archived_at is null
   limit 1;
  if v_staff.id is not null then
    return jsonb_build_object(
      'kind', 'staff', 'role', case when v_staff.is_teacher then 'ENSEIGNANT' else 'PERSONNEL' end,
      'number', v_staff.number, 'first_name', v_staff.first_name, 'last_name', v_staff.last_name,
      'subtitle', v_staff.job_title, 'identifier', v_staff.employee_number, 'photo_file_id', v_staff.photo_file_id,
      'issued_at', v_staff.issued_at,
      'organization', jsonb_build_object('name', v_org.name, 'code', v_org.code, 'color', v_color, 'is_demo', v_org.is_demo),
      'code', 'NEOSCOL-DYN:S:' || v_staff.id || ':' || v_window || ':' || app.badge_signature(v_staff.token, 'S', v_staff.id, v_window),
      'expires_at', to_timestamp((v_window + 1) * 30));
  end if;
  select b.id, b.number, b.token, b.issued_at, st.first_name, st.last_name, st.matricule, st.photo_path as photo_file_id
    into v_student
    from public.student_badges b join public.students st on st.id = b.student_id
   where st.user_id = auth.uid() and b.organization_id = p_org and b.status = 'active'
   limit 1;
  if v_student.id is not null then
    return jsonb_build_object(
      'kind', 'student', 'role', case when app.org_component(v_org.type) = 'university' then 'ÉTUDIANT' else 'APPRENANT' end,
      'number', v_student.number, 'first_name', v_student.first_name, 'last_name', v_student.last_name,
      'subtitle', null, 'identifier', v_student.matricule, 'photo_file_id', v_student.photo_file_id,
      'issued_at', v_student.issued_at,
      'organization', jsonb_build_object('name', v_org.name, 'code', v_org.code, 'color', v_color, 'is_demo', v_org.is_demo),
      'code', 'NEOSCOL-DYN:E:' || v_student.id || ':' || v_window || ':' || app.badge_signature(v_student.token, 'E', v_student.id, v_window),
      'expires_at', to_timestamp((v_window + 1) * 30));
  end if;
  return null;
end;
$$;
revoke execute on function public.my_badge(uuid) from public, anon;
grant execute on function public.my_badge(uuid) to authenticated;

-- Code lu par la tablette → code fixe du badge, ou 'EXPIRED' / 'REPLAY' / 'INVALID'.
create or replace function app.resolve_badge_code(p_code text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  m text[];
  v_badge uuid;
  v_window bigint;
  v_token text;
  v_now bigint := app.badge_window();
begin
  m := regexp_match(btrim(coalesce(p_code, '')), '^NEOSCOL-DYN:([SE]):([0-9a-f-]{36}):([0-9]{1,12}):([0-9a-f]{20})$');
  if m is null then
    return p_code; -- badge imprimé (code fixe) : inchangé
  end if;
  v_badge := m[2]::uuid;
  v_window := m[3]::bigint;
  if m[1] = 'S' then
    select token into v_token from public.staff_badges where id = v_badge and status = 'active';
  else
    select token into v_token from public.student_badges where id = v_badge and status = 'active';
  end if;
  if v_token is null or app.badge_signature(v_token, m[1], v_badge, v_window) <> m[4] then
    return 'INVALID';
  end if;
  if v_window < v_now - 2 or v_window > v_now + 1 then
    return 'EXPIRED';
  end if;
  insert into public.badge_dynamic_uses (badge_id, time_window) values (v_badge, v_window) on conflict do nothing;
  if not found then
    return 'REPLAY';
  end if;
  delete from public.badge_dynamic_uses where used_at < now() - interval '1 day';
  return 'NEOSCOL-BADGE:' || v_token;
end;
$$;
revoke execute on function app.resolve_badge_code(text) from public, anon, authenticated;

create or replace function app.dynamic_badge_rejection(p_status text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'result', 'rejected',
    'reason', case p_status when 'EXPIRED' then 'expired_code' when 'REPLAY' then 'replayed_code' else 'invalid_code' end,
    'message', case p_status
      when 'EXPIRED' then 'QR code expiré : affichez à nouveau « Mon badge » (le code change toutes les 30 secondes).'
      when 'REPLAY' then 'Ce QR code a déjà été utilisé : attendez le code suivant sur « Mon badge ».'
      else 'Badge non reconnu.' end);
$$;

-- Les fonctions de scan existantes deviennent le « cœur » ; les points d'entrée
-- publics résolvent d'abord le QR tournant. Aucune règle de pointage ne change.
alter function public.scan_staff_badge(uuid, text, text) rename to scan_staff_badge_core;
alter function public.scan_badge(uuid, text, text, uuid) rename to scan_badge_core;
revoke execute on function public.scan_staff_badge_core(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.scan_badge_core(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.scan_staff_badge(p_organization_id uuid, p_code text, p_device text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if auth.uid() is null or not app.has_permission(p_organization_id, 'staff_attendance.scan') then
    raise exception 'Cette tablette n''est pas autorisée à pointer pour cet établissement.' using errcode = 'insufficient_privilege';
  end if;
  v_code := app.resolve_badge_code(p_code);
  if v_code in ('EXPIRED', 'REPLAY', 'INVALID') then
    return app.dynamic_badge_rejection(v_code);
  end if;
  return public.scan_staff_badge_core(p_organization_id, v_code, p_device);
end;
$$;

create or replace function public.scan_badge(p_organization_id uuid, p_code text, p_device text default null, p_room_id uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if auth.uid() is null or not app.has_permission(p_organization_id, 'staff_attendance.scan') then
    raise exception 'Cette tablette n''est pas autorisée à pointer pour cet établissement.' using errcode = 'insufficient_privilege';
  end if;
  v_code := app.resolve_badge_code(p_code);
  if v_code in ('EXPIRED', 'REPLAY', 'INVALID') then
    return app.dynamic_badge_rejection(v_code);
  end if;
  return public.scan_badge_core(p_organization_id, v_code, p_device, p_room_id);
end;
$$;

revoke execute on function public.scan_staff_badge(uuid, text, text) from public, anon;
revoke execute on function public.scan_badge(uuid, text, text, uuid) from public, anon;
grant execute on function public.scan_staff_badge(uuid, text, text) to authenticated;
grant execute on function public.scan_badge(uuid, text, text, uuid) to authenticated;
