-- =============================================================================
-- MODULE 3 — UNIVERSITÉ : documents (relevé LMD, procès-verbal, diplôme).
-- Révoquer un diplôme révoque aussi ses documents émis : la vérification en
-- ligne (/verifier) indique immédiatement « révoqué », quel que soit le rôle de
-- la personne qui révoque (diplomas.manage suffit).
-- =============================================================================

-- Garde des documents émis (reprise à l'identique + exception de la révocation en cascade).
create or replace function app.issued_document_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student record;
  v_frozen constant text[] := array['status', 'revoked_reason', 'revoked_at', 'revoked_by', 'file_path', 'content_hash', 'search_text'];
begin
  if tg_op = 'INSERT' then
    new.number := app.generate_number(new.organization_id, 'document', 'DOC-{CODE}-{YY}-{SEQ:6}');
    new.verification_code := app.random_code(26);
    new.issued_at := now();
    new.issued_by := coalesce(auth.uid(), new.issued_by);
    new.status := 'valid';
    if new.student_id is not null then
      select first_name, last_name into v_student from public.students where id = new.student_id;
      new.holder_display := upper(left(v_student.first_name, 1)) || '. ' || upper(v_student.last_name);
    end if;
    return new;
  end if;

  -- Un document émis est figé : seuls le fichier (une fois) et la révocation évoluent.
  if (to_jsonb(new) - v_frozen) is distinct from (to_jsonb(old) - v_frozen) then
    raise exception 'Un document émis ne peut pas être modifié.' using errcode = 'check_violation';
  end if;
  if old.file_path is not null and new.file_path is distinct from old.file_path then
    raise exception 'Le fichier d''un document émis ne peut pas être remplacé.' using errcode = 'check_violation';
  end if;
  if old.content_hash is not null and new.content_hash is distinct from old.content_hash then
    raise exception 'L''empreinte d''un document émis ne peut pas être modifiée.' using errcode = 'check_violation';
  end if;
  if old.status = 'revoked' and new.status <> 'revoked' then
    raise exception 'Un document révoqué ne peut pas être rétabli.' using errcode = 'check_violation';
  end if;
  if new.status = 'revoked' and old.status = 'valid' then
    -- Exception : les documents d'un diplôme révoqué (révocation en cascade, diplomas.manage).
    if auth.uid() is not null and not app.has_permission(new.organization_id, 'documents.revoke')
       and not (new.subject_type = 'diploma'
                and exists (select 1 from public.student_diplomas d
                            where d.id = new.subject_id and d.organization_id = new.organization_id and d.status = 'revoked')) then
      raise exception 'La révocation nécessite la permission documents.revoke.' using errcode = 'insufficient_privilege';
    end if;
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function app.diploma_revoke_documents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'revoked' and old.status is distinct from 'revoked' then
    update public.issued_documents
       set status = 'revoked',
           revoked_reason = left(coalesce(nullif(btrim(new.revoked_reason), ''), 'Diplôme révoqué'), 500)
     where organization_id = new.organization_id
       and subject_type = 'diploma'
       and subject_id = new.id
       and status = 'valid';
  end if;
  return new;
end;
$$;
revoke execute on function app.diploma_revoke_documents() from public, anon;

create trigger student_diplomas_revoke_documents
  after update of status on public.student_diplomas
  for each row execute function app.diploma_revoke_documents();
