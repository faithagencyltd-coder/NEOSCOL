-- =============================================================================
-- CARTES ÉLÈVE / APPRENANT / ÉTUDIANT (3D, PDF, image) — design par établissement
--   * student_badges.valid_until : date de validité imprimée sur la carte
--     (vide = fin de l'année en cours). Seul champ modifiable d'une carte émise,
--     avec le statut et les compteurs d'impression (le reste est figé).
--   * Numéro des NOUVELLES cartes selon le module de l'établissement :
--     ELV (scolaire), APP (formation), ETU (université). Les cartes déjà émises
--     gardent leur numéro ; le jeton QR (NEOSCOL-BADGE:…) ne change pas de format.
--   * organizations.settings.card_design : modèle et textes de la carte, écrits
--     uniquement par save_card_design (settings.manage), validés en base, audités.
-- =============================================================================

alter table public.student_badges add column if not exists valid_until date;
comment on column public.student_badges.valid_until is 'Date de validité imprimée sur la carte ; vide = fin de l''année en cours.';

create or replace function app.student_badge_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student public.students;
  v_type text;
  v_prefix text;
  v_free constant text[] := array['status', 'revoked_at', 'revoked_by', 'revoked_reason', 'printed_count', 'last_printed_at', 'valid_until'];
begin
  if tg_op = 'INSERT' then
    select * into v_student from public.students where id = new.student_id;
    if v_student.status <> 'active' or v_student.archived_at is not null then
      raise exception 'Impossible de générer une carte : le titulaire n''est pas actif.' using errcode = 'check_violation';
    end if;
    select type::text into v_type from public.organizations where id = new.organization_id;
    v_prefix := case
      when v_type in ('university', 'institute') then 'ETU'
      when v_type in ('vocational_center', 'technical_center') then 'APP'
      else 'ELV'
    end;
    new.number := app.generate_number(new.organization_id, 'student_badge', v_prefix || '-{CODE}-{YY}-{SEQ:5}');
    loop
      new.token := app.random_code(32);
      exit when not exists (select 1 from public.staff_badges where token = new.token)
            and not exists (select 1 from public.student_badges where token = new.token);
    end loop;
    new.status := 'active';
    new.issued_at := now();
    new.issued_by := coalesce(auth.uid(), new.issued_by);
    new.printed_count := 0;
    new.revoked_at := null;
    new.revoked_by := null;
    new.revoked_reason := null;
    if new.valid_until is not null and new.valid_until < current_date then
      raise exception 'La date de validité ne peut pas être passée.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  if old.status = 'revoked' then
    raise exception 'Un badge désactivé ne peut plus être modifié ni réactivé ; générez-en un nouveau.' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - v_free) is distinct from (to_jsonb(old) - v_free) then
    raise exception 'Un badge émis ne peut pas être modifié ; remplacez-le.' using errcode = 'check_violation';
  end if;
  if new.valid_until is distinct from old.valid_until and new.valid_until is not null and new.valid_until < (old.issued_at at time zone 'UTC')::date then
    raise exception 'La date de validité ne peut pas précéder la date d''émission de la carte.' using errcode = 'check_violation';
  end if;
  if new.status = 'revoked' then
    if coalesce(btrim(new.revoked_reason), '') = '' then
      raise exception 'Le motif de désactivation est obligatoire.' using errcode = 'check_violation';
    end if;
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  end if;
  return new;
end;
$$;

-- Design des cartes : liste fermée de modèles, couleurs hexadécimales, textes bornés.
create or replace function public.save_card_design(p_organization_id uuid, p_design jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_before jsonb;
  v_clean jsonb := '{}'::jsonb;
  v_key text;
  v_value jsonb;
  v_text text;
  v_limits constant jsonb := '{"slogan":120,"address":160,"phone":40,"email":120,"website":120,"administration":120,"notice":240,"lost_text":160}';
begin
  if auth.uid() is null or not app.has_permission(p_organization_id, 'settings.manage') then
    raise exception 'Droit « Paramètres » requis.' using errcode = 'insufficient_privilege';
  end if;
  if p_design is null or jsonb_typeof(p_design) <> 'object' then
    raise exception 'Design invalide.' using errcode = 'check_violation';
  end if;
  for v_key, v_value in select key, value from jsonb_each(p_design) loop
    if v_key = 'template' then
      if v_value #>> '{}' not in ('prestige', 'ocean', 'emeraude', 'bordeaux', 'graphite') then
        raise exception 'Modèle de carte inconnu.' using errcode = 'check_violation';
      end if;
      v_clean := v_clean || jsonb_build_object('template', v_value #>> '{}');
    elsif v_key in ('primary', 'accent') then
      v_text := nullif(btrim(coalesce(v_value #>> '{}', '')), '');
      if v_text is not null then
        if v_text !~ '^#[0-9A-Fa-f]{6}$' then
          raise exception 'Couleur invalide : %', v_text using errcode = 'check_violation';
        end if;
        v_clean := v_clean || jsonb_build_object(v_key, lower(v_text));
      end if;
    elsif v_key in ('show_photo', 'show_barcode', 'show_validity', 'show_enrolled_on') then
      if jsonb_typeof(v_value) <> 'boolean' then
        raise exception 'Option invalide : %', v_key using errcode = 'check_violation';
      end if;
      v_clean := v_clean || jsonb_build_object(v_key, v_value);
    elsif v_limits ? v_key then
      v_text := nullif(btrim(coalesce(v_value #>> '{}', '')), '');
      if v_text is not null then
        if char_length(v_text) > (v_limits ->> v_key)::integer then
          raise exception 'Texte trop long : % (% caractères maximum).', v_key, v_limits ->> v_key using errcode = 'check_violation';
        end if;
        v_clean := v_clean || jsonb_build_object(v_key, v_text);
      end if;
    else
      raise exception 'Champ inconnu : %', v_key using errcode = 'check_violation';
    end if;
  end loop;

  select settings -> 'card_design' into v_before from public.organizations where id = p_organization_id for update;
  update public.organizations
     set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{card_design}', v_clean, true)
   where id = p_organization_id;
  perform app.audit(p_organization_id, 'settings.card_design', 'organizations', p_organization_id,
                    'Design des cartes modifié', jsonb_build_object('before', v_before, 'after', v_clean));
  return v_clean;
end;
$$;
revoke execute on function public.save_card_design(uuid, jsonb) from public, anon;
grant execute on function public.save_card_design(uuid, jsonb) to authenticated;
