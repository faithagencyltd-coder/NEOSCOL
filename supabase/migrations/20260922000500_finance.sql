-- =============================================================================
-- NéoScol — 0500 Finance : frais, tarifs, factures, échéanciers, paiements, reliquats
-- Reliquat = montant total − montant payé (calculé en base, jamais côté client).
-- =============================================================================

create type public.invoice_status as enum ('draft', 'issued', 'cancelled');
create type public.payment_method as enum ('cash', 'mobile_money', 'bank_transfer', 'card', 'cheque', 'other');
create type public.payment_status as enum ('completed', 'cancelled');

create table public.fee_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  code text not null check (code ~ '^[A-Za-z0-9_-]{1,20}$'),
  category text not null default 'tuition'
    check (category in ('registration', 'tuition', 'training', 'exam', 'uniform', 'transport', 'canteen', 'supplies', 'other')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id)
);

-- Tarifs par année et par cible (niveau, filière ou classe)
-- installment_plan : [{ "label": "1re tranche", "due_on": "2026-10-05", "percent": 40 }, ...]
create table public.fee_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  academic_year_id uuid not null,
  fee_type_id uuid not null,
  level_id uuid,
  program_id uuid,
  class_id uuid,
  amount numeric(14, 2) not null check (amount >= 0),
  is_mandatory boolean not null default true,
  installment_plan jsonb not null default '[]'::jsonb check (jsonb_typeof(installment_plan) = 'array'),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete cascade,
  foreign key (organization_id, fee_type_id) references public.fee_types (organization_id, id) on delete restrict,
  foreign key (organization_id, level_id) references public.levels (organization_id, id) on delete cascade,
  foreign key (organization_id, program_id) references public.programs (organization_id, id) on delete cascade,
  foreign key (organization_id, class_id) references public.classes (organization_id, id) on delete cascade
);
create index fee_rates_year_idx on public.fee_rates (academic_year_id);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  number text not null unique,
  student_id uuid not null,
  enrollment_id uuid,
  academic_year_id uuid,
  issued_on date not null default current_date,
  due_on date,
  status public.invoice_status not null default 'draft',
  currency text not null default 'XOF',
  subtotal numeric(14, 2) not null default 0,
  discount_total numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0 check (total >= 0),
  notes text,
  cancelled_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  search_text text generated always as (app.search_normalize(number)) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  unique (organization_id, id),
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  foreign key (organization_id, enrollment_id) references public.enrollments (organization_id, id) on delete set null (enrollment_id),
  foreign key (organization_id, academic_year_id) references public.academic_years (organization_id, id) on delete restrict,
  check (status <> 'cancelled' or cancelled_reason is not null)
);
create index invoices_student_idx on public.invoices (student_id);
create index invoices_org_status_idx on public.invoices (organization_id, status);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  fee_type_id uuid,
  description text not null,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_amount numeric(14, 2) not null check (unit_amount >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  discount_reason text,
  amount numeric(14, 2) generated always as (round(quantity * unit_amount - discount_amount, 2)) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (quantity * unit_amount - discount_amount >= 0),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade,
  foreign key (organization_id, fee_type_id) references public.fee_types (organization_id, id) on delete restrict
);
create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

create table public.installments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  invoice_id uuid not null,
  label text not null,
  due_on date not null,
  amount numeric(14, 2) not null check (amount > 0),
  sequence smallint not null default 1,
  created_at timestamptz not null default now(),
  unique (invoice_id, sequence),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete cascade
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  number text not null unique,
  invoice_id uuid not null,
  student_id uuid not null, -- dérivé de la facture
  amount numeric(14, 2) not null check (amount > 0),
  method public.payment_method not null,
  reference text,
  payer_name text,
  paid_at timestamptz not null default now(),
  received_by uuid default auth.uid() references public.profiles (id) on delete set null,
  received_by_name text,
  balance_after numeric(14, 2), -- reliquat après ce paiement (instantané pour le reçu)
  status public.payment_status not null default 'completed',
  notes text,
  cancelled_reason text,
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  search_text text generated always as (app.search_normalize(number || ' ' || coalesce(reference, '') || ' ' || coalesce(payer_name, ''))) stored,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, invoice_id) references public.invoices (organization_id, id) on delete restrict,
  foreign key (organization_id, student_id) references public.students (organization_id, id) on delete restrict,
  check (status <> 'cancelled' or cancelled_reason is not null)
);
create index payments_invoice_idx on public.payments (invoice_id) where status = 'completed';
create index payments_org_paid_at_idx on public.payments (organization_id, paid_at desc);
create index payments_student_idx on public.payments (student_id);

-- -----------------------------------------------------------------------------
-- Calculs et invariants
-- -----------------------------------------------------------------------------
create or replace function app.invoice_paid_amount(p_invoice uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(amount), 0) from public.payments where invoice_id = p_invoice and status = 'completed';
$$;

create or replace function app.invoice_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.number := app.generate_number(new.organization_id, 'invoice', 'FAC-{CODE}-{YY}-{SEQ:6}');
    select currency into new.currency from public.organizations where id = new.organization_id;
  else
    if new.number is distinct from old.number or new.student_id is distinct from old.student_id then
      raise exception 'Le numéro et l''élève d''une facture ne peuvent pas être modifiés.' using errcode = 'check_violation';
    end if;
    if old.status = 'cancelled' then
      raise exception 'Une facture annulée ne peut plus être modifiée.' using errcode = 'check_violation';
    end if;
    if old.status = 'issued' and new.status = 'draft' then
      raise exception 'Une facture émise ne peut pas repasser en brouillon.' using errcode = 'check_violation';
    end if;
    if new.status = 'cancelled' and old.status <> 'cancelled' then
      if app.invoice_paid_amount(new.id) > 0 then
        raise exception 'Annulez d''abord les paiements de cette facture.' using errcode = 'check_violation';
      end if;
      new.cancelled_at := now();
      new.cancelled_by := auth.uid();
    end if;
  end if;
  return new;
end;
$$;
create trigger invoices_before_write
  before insert or update on public.invoices
  for each row execute function app.invoice_before_write();

-- Recalcule les totaux de la facture à chaque modification de ses lignes.
create or replace function app.invoice_lines_recalculate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice_id uuid := coalesce(new.invoice_id, old.invoice_id);
  v_status public.invoice_status;
  v_total numeric;
begin
  select status into v_status from public.invoices where id = v_invoice_id for update;
  if v_status = 'cancelled' then
    raise exception 'Une facture annulée ne peut plus être modifiée.' using errcode = 'check_violation';
  end if;

  update public.invoices i
     set subtotal = s.subtotal,
         discount_total = s.discount_total,
         total = s.total
    from (
      select coalesce(sum(quantity * unit_amount), 0) as subtotal,
             coalesce(sum(discount_amount), 0) as discount_total,
             coalesce(sum(amount), 0) as total
      from public.invoice_lines where invoice_id = v_invoice_id
    ) s
   where i.id = v_invoice_id
  returning i.total into v_total;

  if v_total < app.invoice_paid_amount(v_invoice_id) then
    raise exception 'Le total de la facture ne peut pas être inférieur au montant déjà payé.' using errcode = 'check_violation';
  end if;
  return null;
end;
$$;
create trigger invoice_lines_recalculate
  after insert or update or delete on public.invoice_lines
  for each row execute function app.invoice_lines_recalculate();

create or replace function app.payment_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invoice public.invoices;
  v_paid numeric;
  v_allow_over boolean;
begin
  if tg_op = 'INSERT' then
    select * into v_invoice from public.invoices where id = new.invoice_id for update;
    if v_invoice.status <> 'issued' then
      raise exception 'Les paiements ne sont possibles que sur une facture émise.' using errcode = 'check_violation';
    end if;
    select coalesce((settings #>> '{finance,allow_overpayment}')::boolean, false)
      into v_allow_over from public.organizations where id = new.organization_id;
    v_paid := app.invoice_paid_amount(new.invoice_id);
    if not v_allow_over and new.amount > v_invoice.total - v_paid then
      raise exception 'Le montant (%) dépasse le reliquat (%).', new.amount, v_invoice.total - v_paid using errcode = 'check_violation';
    end if;
    new.number := app.generate_number(new.organization_id, 'payment', 'REC-{CODE}-{YY}-{SEQ:6}');
    new.student_id := v_invoice.student_id;
    new.status := 'completed';
    new.balance_after := v_invoice.total - v_paid - new.amount;
    new.received_by := coalesce(auth.uid(), new.received_by);
    select nullif(btrim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
      into new.received_by_name from public.profiles where id = new.received_by;
    return new;
  end if;

  -- Mise à jour : seule l'annulation (avec motif) est autorisée.
  if old.status = 'cancelled' then
    raise exception 'Un paiement annulé ne peut plus être modifié.' using errcode = 'check_violation';
  end if;
  if (to_jsonb(new) - array['status', 'cancelled_reason', 'cancelled_at', 'cancelled_by', 'notes'])
     is distinct from (to_jsonb(old) - array['status', 'cancelled_reason', 'cancelled_at', 'cancelled_by', 'notes']) then
    raise exception 'Un paiement enregistré ne peut pas être modifié ; annulez-le puis ressaisissez-le.' using errcode = 'check_violation';
  end if;
  if new.status = 'cancelled' then
    if auth.uid() is not null and not app.has_permission(new.organization_id, 'finance.payments.cancel') then
      raise exception 'L''annulation nécessite la permission finance.payments.cancel.' using errcode = 'insufficient_privilege';
    end if;
    if coalesce(btrim(new.cancelled_reason), '') = '' then
      raise exception 'Le motif d''annulation est obligatoire.' using errcode = 'check_violation';
    end if;
    new.cancelled_at := now();
    new.cancelled_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger payments_before_write
  before insert or update on public.payments
  for each row execute function app.payment_before_write();

-- -----------------------------------------------------------------------------
-- Vues de soldes (security_invoker : la RLS des tables sous-jacentes s'applique)
-- -----------------------------------------------------------------------------
create view public.invoice_balances with (security_invoker = true) as
select
  i.id as invoice_id,
  i.organization_id,
  i.student_id,
  i.academic_year_id,
  i.number,
  i.status,
  i.issued_on,
  i.due_on,
  i.currency,
  i.total,
  coalesce(p.paid, 0)::numeric(14, 2) as paid,
  (i.total - coalesce(p.paid, 0))::numeric(14, 2) as balance,
  case
    when i.status = 'cancelled' then 'cancelled'
    when i.total - coalesce(p.paid, 0) <= 0 then 'paid'
    when coalesce(p.paid, 0) > 0 then 'partial'
    else 'unpaid'
  end as payment_status,
  -- Prochaine échéance non couverte par les paiements cumulés
  (
    select min(x.due_on) from (
      select ins.due_on, sum(ins.amount) over (order by ins.sequence) as cumulative
      from public.installments ins where ins.invoice_id = i.id
    ) x where x.cumulative > coalesce(p.paid, 0)
  ) as next_due_on,
  (
    i.status = 'issued' and i.total - coalesce(p.paid, 0) > 0 and (
      coalesce((
        select min(x.due_on) from (
          select ins.due_on, sum(ins.amount) over (order by ins.sequence) as cumulative
          from public.installments ins where ins.invoice_id = i.id
        ) x where x.cumulative > coalesce(p.paid, 0)
      ), i.due_on) < current_date
    )
  ) as is_overdue
from public.invoices i
left join lateral (
  select sum(pay.amount) as paid from public.payments pay
  where pay.invoice_id = i.id and pay.status = 'completed'
) p on true;

create view public.student_balances with (security_invoker = true) as
select
  b.organization_id,
  b.student_id,
  b.academic_year_id,
  sum(b.total)::numeric(14, 2) as total_invoiced,
  sum(b.paid)::numeric(14, 2) as total_paid,
  sum(b.balance)::numeric(14, 2) as balance,
  bool_or(b.is_overdue) as has_overdue
from public.invoice_balances b
where b.status = 'issued'
group by b.organization_id, b.student_id, b.academic_year_id;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.fee_types enable row level security;
alter table public.fee_rates enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;

create policy fee_types_select on public.fee_types for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('enrollments.manage'))::uuid[])
  );
create policy fee_types_write on public.fee_types for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.fees.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('finance.fees.manage'))::uuid[]));

create policy fee_rates_select on public.fee_rates for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[])
    or organization_id = any ((select app.permitted_org_ids('enrollments.manage'))::uuid[])
  );
create policy fee_rates_write on public.fee_rates for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.fees.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('finance.fees.manage'))::uuid[]));

create policy invoices_select on public.invoices for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[])
    or (status <> 'draft' and student_id = any ((select app.my_portal_student_ids())::uuid[]))
  );
create policy invoices_write on public.invoices for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.invoices.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('finance.invoices.manage'))::uuid[]));

create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using (invoice_id in (select i.id from public.invoices i));
create policy invoice_lines_write on public.invoice_lines for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.invoices.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('finance.invoices.manage'))::uuid[]));

create policy installments_select on public.installments for select to authenticated
  using (invoice_id in (select i.id from public.invoices i));
create policy installments_write on public.installments for all to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.invoices.manage'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('finance.invoices.manage'))::uuid[]));

create policy payments_select on public.payments for select to authenticated
  using (
    organization_id = any ((select app.permitted_org_ids('finance.read'))::uuid[])
    or student_id = any ((select app.my_portal_student_ids())::uuid[])
  );
create policy payments_insert on public.payments for insert to authenticated
  with check (organization_id = any ((select app.permitted_org_ids('finance.payments.create'))::uuid[]));
create policy payments_update on public.payments for update to authenticated
  using (organization_id = any ((select app.permitted_org_ids('finance.payments.cancel'))::uuid[]))
  with check (organization_id = any ((select app.permitted_org_ids('finance.payments.cancel'))::uuid[]));
-- Aucune politique DELETE : un paiement ne se supprime jamais, il s'annule.

create trigger fee_types_touch before update on public.fee_types for each row execute function app.touch_updated_at();
create trigger fee_rates_touch before update on public.fee_rates for each row execute function app.touch_updated_at();
create trigger invoices_touch before update on public.invoices for each row execute function app.touch_updated_at();

create index invoices_search_idx on public.invoices using gin (search_text extensions.gin_trgm_ops);
create index payments_search_idx on public.payments using gin (search_text extensions.gin_trgm_ops);

grant execute on function app.invoice_paid_amount(uuid) to authenticated, service_role;
