-- =============================================================================
-- Module 4 : statistiques consolidées du groupe (tous ses espaces : école,
-- formation, université). Réservé à la direction de l'établissement principal
-- (settings.manage ou reports.read sur le groupe). Chiffres agrégés uniquement,
-- aucune donnée nominative.
-- =============================================================================

create or replace function public.group_consolidated_stats(p_group uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (app.has_permission(p_group, 'settings.manage') or app.has_permission(p_group, 'reports.read')) then
    raise exception 'Réservé à la direction de l''établissement principal.' using errcode = 'insufficient_privilege';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'organization_id', o.id, 'name', o.name, 'type', o.type, 'status', o.status,
      'students', (select count(*) from public.students s where s.organization_id = o.id and s.status = 'active' and s.archived_at is null),
      'staff', (select count(*) from public.staff_members st where st.organization_id = o.id and st.status = 'active' and st.archived_at is null),
      'teachers', (select count(*) from public.staff_members st where st.organization_id = o.id and st.status = 'active' and st.archived_at is null and st.is_teacher),
      'classes', (select count(*) from public.classes c join public.academic_years y on y.id = c.academic_year_id and y.is_current
                   where c.organization_id = o.id and c.archived_at is null),
      'invoiced', (select coalesce(sum(b.total), 0) from public.invoice_balances b where b.organization_id = o.id and b.status <> 'cancelled' and b.status <> 'draft'),
      'paid', (select coalesce(sum(b.paid), 0) from public.invoice_balances b where b.organization_id = o.id and b.status <> 'cancelled' and b.status <> 'draft'),
      'balance', (select coalesce(sum(b.balance), 0) from public.invoice_balances b where b.organization_id = o.id and b.status <> 'cancelled' and b.status <> 'draft'),
      'overdue', (select coalesce(sum(b.balance), 0) from public.invoice_balances b where b.organization_id = o.id and b.is_overdue and b.status <> 'cancelled')
    ) order by o.name)
    from public.organizations o
    where o.parent_id = p_group or o.id = p_group
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.group_consolidated_stats(uuid) from public, anon;
grant execute on function public.group_consolidated_stats(uuid) to authenticated;
