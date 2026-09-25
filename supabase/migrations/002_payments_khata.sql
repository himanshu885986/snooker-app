-- Part-payments, payment history and khata (customer credit).
-- Run after 001_initial.sql: Supabase → SQL Editor → New query → paste → Run.
-- Safe to run on a database that already has shops and bills in it.
--
-- A bill's due = its charges − payments − amount moved to khata (voided rows ignored).
-- A customer's khata balance = khata charges − khata payments (voided rows ignored).

-- ─── Customers (regulars, identified by mobile number within a business) ─────

create table customers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text not null check (phone ~ '^[6-9][0-9]{9}$'),
  created_at timestamptz not null default now(),
  unique (org_id, phone)
);

alter table visits add column customer_id uuid references customers(id);
create index on visits (customer_id);
create index on visits (branch_id, closed_at);

-- A payment recorded by mistake is voided, not deleted, so there is a record of it.
alter table payments
  add column voided_at timestamptz,
  add column voided_by uuid;

-- The khata ledger: 'charge' = money owed (a bill left unpaid, or an old balance),
-- 'payment' = money received against it.
create table khata_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  customer_id uuid not null references customers(id) on delete cascade,
  branch_id uuid references branches(id),       -- shop where it happened
  kind text not null check (kind in ('charge', 'payment')),
  amount_paise integer not null check (amount_paise > 0),
  mode text check (mode in ('cash', 'upi')),    -- how a payment was made
  visit_id uuid references visits(id),          -- the bill a charge came from
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default current_user_id(),
  voided_at timestamptz,
  voided_by uuid,
  check ((kind = 'payment') = (mode is not null))
);
create index on khata_entries (customer_id);
create index on khata_entries (visit_id);
create index on khata_entries (org_id, created_at);

-- Balances, computed with the caller's own read access (so only the admin sees them).
create view customer_balances with (security_invoker = true) as
  select c.id, c.org_id, c.name, c.phone, c.created_at,
    coalesce(sum(case when e.kind = 'charge' then e.amount_paise else -e.amount_paise end)
      filter (where e.voided_at is null), 0)::integer as balance_paise,
    max(e.created_at) filter (where e.voided_at is null) as last_activity_at
  from customers c
  left join khata_entries e on e.customer_id = c.id
  group by c.id;

-- ─── Security ────────────────────────────────────────────────────────────────

alter table customers enable row level security;
create policy member_read on customers for select to authenticated using (org_role(org_id) is not null);
alter table khata_entries enable row level security;
create policy admin_read on khata_entries for select to authenticated using (org_role(org_id) = 'admin');

-- ─── Link players who give a mobile number to a customer record ──────────────

create function find_or_create_customer(p_org_id uuid, p_name text, p_phone text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from customers where org_id = p_org_id and phone = p_phone;
  if v_id is null then
    insert into customers (org_id, name, phone) values (p_org_id, trim(p_name), p_phone)
      on conflict (org_id, phone) do nothing
      returning id into v_id;
    if v_id is null then
      select id into v_id from customers where org_id = p_org_id and phone = p_phone;
    end if;
  end if;
  return v_id;
end $$;

create function set_visit_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_phone text;
begin
  new.org_id := (select org_id from branches where id = new.branch_id);
  v_phone := normalize_phone(new.phone);
  if new.customer_id is null and v_phone ~ '^[6-9][0-9]{9}$' then
    new.customer_id := find_or_create_customer(new.org_id, new.player_name, v_phone);
  end if;
  return new;
end $$;

drop trigger set_org on visits;
create trigger set_defaults before insert on visits for each row execute function set_visit_defaults();

-- ─── Money helpers and actions (admin only) ──────────────────────────────────

create function visit_due(p_visit_id uuid) returns integer
language sql stable as $$
  select (
      coalesce((select sum(amount_paise) from charges where visit_id = p_visit_id), 0)
    - coalesce((select sum(amount_paise) from payments where visit_id = p_visit_id and voided_at is null), 0)
    - coalesce((select sum(amount_paise) from khata_entries
                where visit_id = p_visit_id and kind = 'charge' and voided_at is null), 0)
  )::integer
$$;

create function lock_open_visit(p_visit_id uuid) returns visits
language plpgsql as $$
declare v visits;
begin
  select * into v from visits where id = p_visit_id for update;
  if v.id is null then raise exception 'Player not found'; end if;
  perform require_role(v.org_id, array['admin']);
  if v.status <> 'open' then raise exception 'This bill is already closed'; end if;
  return v;
end $$;

create function assert_not_playing(v visits) returns void
language plpgsql stable as $$
begin
  if exists (select 1 from frame_players fp join frames f on f.id = fp.frame_id
             where fp.visit_id = v.id and f.status in ('running', 'paused')) then
    raise exception '% is still in a running frame. End the frame first.', v.player_name;
  end if;
end $$;

-- Pay everything that is due and close the bill.
create or replace function checkout(p_visit_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v visits; v_due integer;
begin
  v := lock_open_visit(p_visit_id);
  if p_mode not in ('cash', 'upi') then raise exception 'Unknown payment mode'; end if;
  perform assert_not_playing(v);
  v_due := visit_due(p_visit_id);
  if v_due > 0 then
    insert into payments (org_id, visit_id, amount_paise, mode) values (v.org_id, p_visit_id, v_due, p_mode);
  end if;
  update visits set status = 'closed', closed_at = now() where id = p_visit_id;
end $$;

-- Take part of the bill now; the bill stays open.
create function record_payment(p_visit_id uuid, p_amount_paise integer, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v visits; v_due integer;
begin
  v := lock_open_visit(p_visit_id);
  if p_mode not in ('cash', 'upi') then raise exception 'Unknown payment mode'; end if;
  if p_amount_paise is null or p_amount_paise <= 0 then raise exception 'Enter an amount more than ₹0'; end if;
  v_due := visit_due(p_visit_id);
  if p_amount_paise > v_due then
    raise exception 'That is more than the ₹% due', trim(to_char(v_due / 100.0, 'FM999999990.00'));
  end if;
  insert into payments (org_id, visit_id, amount_paise, mode) values (v.org_id, p_visit_id, p_amount_paise, p_mode);
end $$;

-- Put whatever is still due on the customer's khata and close the bill.
create function close_to_khata(p_visit_id uuid, p_name text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v visits;
  v_due integer;
  v_phone text := check_phone(p_phone);
  v_customer uuid;
begin
  v := lock_open_visit(p_visit_id);
  perform assert_not_playing(v);
  v_due := visit_due(p_visit_id);
  if v_due <= 0 then raise exception 'Nothing is due on this bill'; end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Customer name is required'; end if;
  v_customer := find_or_create_customer(v.org_id, p_name, v_phone);
  insert into khata_entries (org_id, customer_id, branch_id, kind, amount_paise, visit_id, note)
    values (v.org_id, v_customer, v.branch_id, 'charge', v_due, p_visit_id, 'Unpaid bill');
  update visits set customer_id = v_customer, phone = v_phone, status = 'closed', closed_at = now()
    where id = p_visit_id;
end $$;

-- Undo a checkout: the bill opens again. Money moved to khata comes back onto the bill;
-- payments stay (remove them one by one if they were a mistake).
create function reopen_visit(p_visit_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v visits;
begin
  select * into v from visits where id = p_visit_id for update;
  if v.id is null then raise exception 'Bill not found'; end if;
  perform require_role(v.org_id, array['admin']);
  if v.status <> 'closed' then raise exception 'This bill is already open'; end if;
  update khata_entries set voided_at = now(), voided_by = current_user_id()
    where visit_id = p_visit_id and voided_at is null;
  update visits set status = 'open', closed_at = null where id = p_visit_id;
end $$;

create function void_payment(p_payment_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p payments; v visits;
begin
  select * into p from payments where id = p_payment_id for update;
  if p.id is null then raise exception 'Payment not found'; end if;
  perform require_role(p.org_id, array['admin']);
  if p.voided_at is not null then raise exception 'This payment was already removed'; end if;
  select * into v from visits where id = p.visit_id;
  if v.status <> 'open' then raise exception 'Reopen the bill first'; end if;
  update payments set voided_at = now(), voided_by = current_user_id() where id = p_payment_id;
end $$;

create function khata_balance(p_customer_id uuid) returns integer
language sql stable as $$
  select coalesce(sum(case when kind = 'charge' then amount_paise else -amount_paise end), 0)::integer
  from khata_entries where customer_id = p_customer_id and voided_at is null
$$;

-- Money received against a customer's khata.
create function receive_khata(p_customer_id uuid, p_branch_id uuid, p_amount_paise integer, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare c customers; v_balance integer;
begin
  select * into c from customers where id = p_customer_id for update;
  if c.id is null then raise exception 'Customer not found'; end if;
  perform require_role(c.org_id, array['admin']);
  if not exists (select 1 from branches where id = p_branch_id and org_id = c.org_id) then
    raise exception 'Shop not found';
  end if;
  if p_mode not in ('cash', 'upi') then raise exception 'Unknown payment mode'; end if;
  if p_amount_paise is null or p_amount_paise <= 0 then raise exception 'Enter an amount more than ₹0'; end if;
  v_balance := khata_balance(p_customer_id);
  if p_amount_paise > v_balance then
    raise exception 'That is more than the ₹% on khata', trim(to_char(v_balance / 100.0, 'FM999999990.00'));
  end if;
  insert into khata_entries (org_id, customer_id, branch_id, kind, amount_paise, mode)
    values (c.org_id, p_customer_id, p_branch_id, 'payment', p_amount_paise, p_mode);
end $$;

-- Add an amount owed that didn't come from a bill here, e.g. from the old paper khata.
create function add_khata(p_org_id uuid, p_branch_id uuid, p_name text, p_phone text, p_amount_paise integer, p_note text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_phone text := check_phone(p_phone); v_customer uuid;
begin
  perform require_role(p_org_id, array['admin']);
  if not exists (select 1 from branches where id = p_branch_id and org_id = p_org_id) then
    raise exception 'Shop not found';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Customer name is required'; end if;
  if p_amount_paise is null or p_amount_paise <= 0 then raise exception 'Enter an amount more than ₹0'; end if;
  v_customer := find_or_create_customer(p_org_id, p_name, v_phone);
  insert into khata_entries (org_id, customer_id, branch_id, kind, amount_paise, note)
    values (p_org_id, v_customer, p_branch_id, 'charge', p_amount_paise, nullif(trim(coalesce(p_note, '')), ''));
  return v_customer;
end $$;

-- Remove a khata entry added by mistake. Unpaid-bill entries are undone by reopening the bill.
create function void_khata_entry(p_entry_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e khata_entries;
begin
  select * into e from khata_entries where id = p_entry_id for update;
  if e.id is null then raise exception 'Entry not found'; end if;
  perform require_role(e.org_id, array['admin']);
  if e.voided_at is not null then raise exception 'This entry was already removed'; end if;
  if e.visit_id is not null then raise exception 'Reopen the bill to undo this'; end if;
  update khata_entries set voided_at = now(), voided_by = current_user_id() where id = p_entry_id;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
-- Internal helper: only the functions above may create customers.
revoke execute on function find_or_create_customer(uuid, text, text) from authenticated;

alter publication supabase_realtime add table customers, khata_entries;
