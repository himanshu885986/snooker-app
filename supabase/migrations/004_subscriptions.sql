-- Subscriptions: a free trial, then monthly payment by UPI straight to the platform owner.
-- Run after 003_games_item_groups.sql: Supabase → SQL Editor → New query → paste → Run.
-- Then make yourself the platform owner (see the end of this file).
--
-- Price: the price per shop (branch) × number of shops × months paid for.
--
-- How access works:
--   access until = latest of (trial end, paid until, provisional until) + grace days
--   After that, every read and action for that business is refused until a payment is approved.
--   Businesses that exist when this runs get a fresh trial from today.

-- ─── Platform (you) ──────────────────────────────────────────────────────────

create table platform_settings (
  id boolean primary key default true check (id),   -- exactly one row
  upi_id text,
  upi_name text,
  price_paise integer not null default 49900 check (price_paise > 0),   -- per shop, per period
  period_days integer not null default 30 check (period_days between 1 and 366),
  trial_days integer not null default 7 check (trial_days between 0 and 90),
  grace_days integer not null default 0 check (grace_days between 0 and 30),
  -- access given while a claimed payment waits for approval
  provisional_days integer not null default 2 check (provisional_days between 0 and 7)
);
insert into platform_settings default values;

create table platform_admins (
  user_id uuid primary key references app_users(id) on delete cascade
);

create function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = current_user_id())
$$;

-- ─── Each business's subscription ───────────────────────────────────────────

alter table organizations
  add column trial_ends_at timestamptz,
  add column paid_until timestamptz,
  add column provisional_until timestamptz;
update organizations
  set trial_ends_at = now() + make_interval(days => (select trial_days from platform_settings));
alter table organizations alter column trial_ends_at set not null;

create function set_trial() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.trial_ends_at := now() + make_interval(days => (select trial_days from platform_settings));
  new.paid_until := null;
  new.provisional_until := null;
  return new;
end $$;
create trigger set_trial before insert on organizations for each row execute function set_trial();

-- Payments shop owners say they made (pending), and what the platform owner decided.
create table subscription_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  amount_paise integer not null check (amount_paise >= 0),
  months integer not null check (months between 1 and 24),
  reference text,                                   -- UPI transaction / UTR number
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  claimed_by uuid default current_user_id(),
  claimed_at timestamptz not null default now(),
  decided_by uuid,
  decided_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  note text
);
create index on subscription_payments (org_id, claimed_at desc);
create unique index one_pending_payment_per_org on subscription_payments (org_id) where status = 'pending';

alter table platform_settings enable row level security;
alter table platform_admins enable row level security;
alter table subscription_payments enable row level security;
revoke all on platform_settings, platform_admins, subscription_payments from anon, authenticated;

create function shop_count(p_org_id uuid) returns integer
language sql stable security definer set search_path = public as $$
  select greatest(1, count(*))::integer from branches where org_id = p_org_id
$$;

create function access_until(p_org_id uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select greatest(o.trial_ends_at, o.paid_until, o.provisional_until) + make_interval(days => s.grace_days)
  from organizations o, platform_settings s where o.id = p_org_id
$$;

create function org_active(p_org_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(now() < access_until(p_org_id), false)
$$;

-- ─── Blocking: roles only count while the business has access ────────────────

-- The person's role whether or not the business has access (for the payment screen).
create function org_member_role(p_org_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from memberships where org_id = p_org_id and user_id = current_user_id()
$$;

-- Every security rule and action uses org_role, so an expired business can read and change nothing.
create or replace function org_role(p_org_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when org_active(p_org_id) then org_member_role(p_org_id) end
$$;

create or replace function require_role(p_org_id uuid, p_roles text[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_role text := org_member_role(p_org_id);
begin
  if current_user_id() is null then raise exception 'Please log in again'; end if;
  if v_role is null or not (v_role = any(p_roles)) then
    if p_roles = array['admin'] then raise exception 'Only the admin can do this'; end if;
    raise exception 'Your role (%) cannot make changes', coalesce(v_role, 'none');
  end if;
  if not org_active(p_org_id) then
    raise exception 'The subscription for this business has ended. The owner can renew it in the app.';
  end if;
end $$;

-- ─── For shop owners and staff ───────────────────────────────────────────────

create function subscription_status(p_org_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  o organizations;
  s platform_settings;
  v_until timestamptz;
  v_state text;
  v_pending subscription_payments;
begin
  if org_member_role(p_org_id) is null then raise exception 'Business not found'; end if;
  select * into o from organizations where id = p_org_id;
  select * into s from platform_settings;
  v_until := access_until(p_org_id);
  select * into v_pending from subscription_payments where org_id = p_org_id and status = 'pending';
  v_state := case
    when o.paid_until > now() then 'active'
    when o.trial_ends_at > now() then 'trial'
    when o.provisional_until > now() then 'pending'
    when v_until > now() then 'grace'
    else 'expired' end;
  return jsonb_build_object(
    'state', v_state,
    'access_until', v_until,
    'trial_ends_at', o.trial_ends_at,
    'paid_until', o.paid_until,
    'price_paise', s.price_paise,
    'shops', shop_count(p_org_id),
    'period_days', s.period_days,
    'upi_id', s.upi_id,
    'upi_name', s.upi_name,
    'provisional_days', s.provisional_days,
    'role', org_member_role(p_org_id),
    'pending', case when v_pending.id is null then null else jsonb_build_object(
      'id', v_pending.id, 'amount_paise', v_pending.amount_paise, 'months', v_pending.months,
      'reference', v_pending.reference, 'claimed_at', v_pending.claimed_at) end
  );
end $$;

-- The owner says they paid by UPI. Works even when access has ended.
create function claim_subscription_payment(p_org_id uuid, p_months integer, p_reference text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s platform_settings;
begin
  if org_member_role(p_org_id) is distinct from 'admin' then raise exception 'Only the admin can do this'; end if;
  if p_months is null or p_months not in (1, 3, 6, 12) then raise exception 'Choose 1, 3, 6 or 12 months'; end if;
  if exists (select 1 from subscription_payments where org_id = p_org_id and status = 'pending') then
    raise exception 'A payment is already waiting for approval';
  end if;
  select * into s from platform_settings;
  if s.upi_id is null then raise exception 'Payments are not set up yet. Please contact support.'; end if;
  insert into subscription_payments (org_id, amount_paise, months, reference)
    values (p_org_id, s.price_paise * shop_count(p_org_id) * p_months, p_months, nullif(trim(coalesce(p_reference, '')), ''));
  -- Keep the shop running while the payment is checked, unless a claim was rejected recently.
  if not org_active(p_org_id) and not exists (
    select 1 from subscription_payments
    where org_id = p_org_id and status = 'rejected' and decided_at > now() - interval '30 days'
  ) then
    update organizations set provisional_until = now() + make_interval(days => s.provisional_days) where id = p_org_id;
  end if;
  return subscription_status(p_org_id);
end $$;

-- ─── For the platform owner ──────────────────────────────────────────────────

create function require_platform_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'Only the platform owner can do this'; end if;
end $$;

create function extend_paid(p_org_id uuid, p_days integer) returns table (period_start timestamptz, period_end timestamptz)
language plpgsql security definer set search_path = public as $$
declare o organizations; v_start timestamptz;
begin
  select * into o from organizations where id = p_org_id for update;
  -- Paying early never loses days: the new period starts when the current one ends.
  v_start := greatest(now(), o.paid_until, o.trial_ends_at);
  update organizations set paid_until = v_start + make_interval(days => p_days), provisional_until = null where id = p_org_id;
  return query select v_start, v_start + make_interval(days => p_days);
end $$;

create function platform_decide_payment(p_payment_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare p subscription_payments; v_period record;
begin
  perform require_platform_admin();
  select * into p from subscription_payments where id = p_payment_id for update;
  if p.id is null then raise exception 'Payment not found'; end if;
  if p.status <> 'pending' then raise exception 'This payment was already decided'; end if;
  if p_approve then
    select * into v_period from extend_paid(p.org_id, p.months * (select period_days from platform_settings));
    update subscription_payments set status = 'approved', decided_by = current_user_id(), decided_at = now(),
      period_start = v_period.period_start, period_end = v_period.period_end, note = nullif(trim(coalesce(p_note, '')), '')
      where id = p_payment_id;
  else
    update subscription_payments set status = 'rejected', decided_by = current_user_id(), decided_at = now(),
      note = nullif(trim(coalesce(p_note, '')), '') where id = p_payment_id;
    update organizations set provisional_until = null where id = p.org_id;
  end if;
end $$;

-- Record money received some other way (cash, a UPI payment they didn't report), or give free time.
create function platform_record_payment(p_org_id uuid, p_amount_paise integer, p_days integer, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare v_period record;
begin
  perform require_platform_admin();
  if not exists (select 1 from organizations where id = p_org_id) then raise exception 'Business not found'; end if;
  if p_days is null or p_days not between 1 and 731 then raise exception 'Days must be between 1 and 731'; end if;
  if p_amount_paise is null or p_amount_paise < 0 then raise exception 'Amount cannot be negative'; end if;
  select * into v_period from extend_paid(p_org_id, p_days);
  insert into subscription_payments (org_id, amount_paise, months, status, claimed_by, decided_by, decided_at, period_start, period_end, note)
    values (p_org_id, p_amount_paise, greatest(1, round(p_days / 30.0)::integer), 'approved', current_user_id(), current_user_id(), now(),
            v_period.period_start, v_period.period_end, nullif(trim(coalesce(p_note, '')), ''));
end $$;

create function platform_businesses() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', o.id, 'name', o.name, 'created_at', o.created_at,
      'trial_ends_at', o.trial_ends_at, 'paid_until', o.paid_until, 'access_until', access_until(o.id),
      'active', org_active(o.id),
      'owner_name', u.name, 'owner_phone', u.phone,
      'shops', shop_count(o.id),
      'tables', (select count(*) from tables t where t.org_id = o.id and t.active),
      'last_played_at', (select max(f.started_at) from frames f where f.org_id = o.id),
      'pending', exists (select 1 from subscription_payments p where p.org_id = o.id and p.status = 'pending')
    ) order by access_until(o.id))
    from organizations o
    left join memberships m on m.org_id = o.id and m.role = 'admin'
    left join app_users u on u.id = m.user_id), '[]'::jsonb);
end $$;

create function platform_payments() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_platform_admin();
  return coalesce((
    select jsonb_agg(x order by (x->>'status') = 'pending' desc, (x->>'claimed_at') desc)
    from (
      select jsonb_build_object(
        'id', p.id, 'org_id', p.org_id, 'org_name', o.name, 'owner_phone', u.phone,
        'amount_paise', p.amount_paise, 'months', p.months, 'reference', p.reference,
        'status', p.status, 'claimed_at', p.claimed_at, 'decided_at', p.decided_at,
        'period_end', p.period_end, 'note', p.note) as x
      from subscription_payments p
      join organizations o on o.id = p.org_id
      left join memberships m on m.org_id = o.id and m.role = 'admin'
      left join app_users u on u.id = m.user_id
      order by p.claimed_at desc
      limit 300
    ) rows), '[]'::jsonb);
end $$;

create function platform_get_settings() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_platform_admin();
  return (select to_jsonb(s) - 'id' from platform_settings s);
end $$;

create function platform_update_settings(
  p_upi_id text, p_upi_name text, p_price_paise integer, p_period_days integer,
  p_trial_days integer, p_grace_days integer, p_provisional_days integer
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_platform_admin();
  update platform_settings set
    upi_id = nullif(trim(coalesce(p_upi_id, '')), ''),
    upi_name = nullif(trim(coalesce(p_upi_name, '')), ''),
    price_paise = p_price_paise, period_days = p_period_days, trial_days = p_trial_days,
    grace_days = p_grace_days, provisional_days = p_provisional_days
  where id;  -- the single settings row (Supabase refuses UPDATE without WHERE from the app)
end $$;

-- whoami also says whether this person is the platform owner, and which businesses have access.
create or replace function whoami() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', u.id, 'name', u.name, 'phone', u.phone,
    'is_platform_admin', exists (select 1 from platform_admins pa where pa.user_id = u.id),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object('org_id', o.id, 'org_name', o.name, 'role', m.role, 'active', org_active(o.id)) order by o.name)
      from memberships m join organizations o on o.id = m.org_id
      where m.user_id = u.id), '[]'::jsonb))
  from app_users u where u.id = current_user_id()
$$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function find_or_create_customer(uuid, text, text) from authenticated;
revoke execute on function extend_paid(uuid, integer) from authenticated;

-- ─── Make yourself the platform owner ────────────────────────────────────────
-- 1. Register in the app with your own mobile number (as a business, or use one you already have).
-- 2. Run this with your number:
--      insert into platform_admins (user_id) select id from app_users where phone = '9XXXXXXXXX';
-- 3. Open the app → Settings → Platform, and set your UPI ID and price.
