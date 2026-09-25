-- Snooker Counter — database schema for Supabase (Postgres).
-- Run this first on a fresh project (Supabase → SQL Editor → New query → paste → Run),
-- then each later file in supabase/migrations in number order.
-- Money is stored in integer paise (₹1 = 100 paise).
-- Billing rules must match src/lib/billing.ts. Role rules must match src/lib/permissions.ts.
--
-- Multi-business (SaaS): every row carries org_id (the business it belongs to), and
-- people only see rows of businesses they are a member of.
--
-- Login: each device gets an anonymous Supabase session (free, no SMS). Logging in
-- with mobile + PIN links that session to a person (table `sessions`).

create extension if not exists pgcrypto;  -- on Supabase this lands in the "extensions" schema

-- ─── People, businesses, roles ───────────────────────────────────────────────

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  created_at timestamptz not null default now()
);

create table app_users (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ '^[6-9][0-9]{9}$'),
  name text not null check (length(trim(name)) > 0),
  pin_hash text not null,
  failed_pin_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now()
);

create table memberships (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references app_users(id) on delete cascade,
  role text not null check (role in ('admin', 'maintainer', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create unique index one_admin_per_org on memberships (org_id) where role = 'admin';
create index on memberships (user_id);

-- Which person is logged in on which device (auth_uid = the device's Supabase session).
create table sessions (
  auth_uid uuid primary key,
  user_id uuid not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index on sessions (user_id);

-- The person logged in on this device, or null.
create function current_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from sessions where auth_uid = auth.uid()
$$;

-- The current person's role in a business, or null if they are not a member.
create function org_role(p_org_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from memberships where org_id = p_org_id and user_id = current_user_id()
$$;

create function require_role(p_org_id uuid, p_roles text[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare v_role text := org_role(p_org_id);
begin
  if current_user_id() is null then raise exception 'Please log in again'; end if;
  if v_role is null or not (v_role = any(p_roles)) then
    if p_roles = array['admin'] then raise exception 'Only the admin can do this'; end if;
    raise exception 'Your role (%) cannot make changes', coalesce(v_role, 'none');
  end if;
end $$;

-- ─── Shop data ───────────────────────────────────────────────────────────────

create table branches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  upi_id text,
  upi_name text,
  created_at timestamptz not null default now()
);

create table tables (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null references branches(id),
  name text not null,
  rate_paise_per_min integer not null check (rate_paise_per_min > 0),
  sort integer not null default 0,
  active boolean not null default true
);

create table products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null references branches(id),
  name text not null,
  price_paise integer not null check (price_paise >= 0),
  image text,                                   -- picture id (src/lib/foodImages.ts); null = suggest from name
  active boolean not null default true
);

-- One player's bill for the day.
create table visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null references branches(id),
  player_name text not null check (length(trim(player_name)) > 0),
  phone text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_by uuid default current_user_id()
);

create table frames (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  branch_id uuid not null references branches(id),
  table_id uuid not null references tables(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  rate_paise_per_min integer not null,          -- rate snapshot when the frame started
  status text not null default 'running' check (status in ('running', 'paused', 'ended', 'cancelled')),
  losing_side text check (losing_side in ('A', 'B')),
  billable_seconds integer,
  amount_paise integer,
  time_adjusted boolean not null default false,
  started_by uuid default current_user_id(),
  ended_by uuid
);
create unique index one_live_frame_per_table on frames (table_id) where status in ('running', 'paused');

create table frame_players (
  org_id uuid not null references organizations(id) on delete cascade,
  frame_id uuid not null references frames(id),
  visit_id uuid not null references visits(id),
  side text not null check (side in ('A', 'B')),
  primary key (frame_id, visit_id)
);

create table frame_pauses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  frame_id uuid not null references frames(id),
  paused_at timestamptz not null default now(),
  resumed_at timestamptz,
  paused_by uuid default current_user_id()
);

-- Audit trail of admin time changes.
create table frame_time_edits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  frame_id uuid not null references frames(id),
  old_started_at timestamptz not null,
  new_started_at timestamptz not null,
  edited_by uuid default current_user_id(),
  edited_at timestamptz not null default now()
);

-- One line on a player's bill: a lost frame share or a shop item.
create table charges (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  visit_id uuid not null references visits(id),
  source text not null check (source in ('frame', 'item')),
  frame_id uuid references frames(id),
  product_id uuid references products(id),
  description text not null,
  quantity integer not null default 1 check (quantity > 0),
  amount_paise integer not null check (amount_paise >= 0),
  created_at timestamptz not null default now(),
  created_by uuid default current_user_id()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  visit_id uuid not null references visits(id),
  amount_paise integer not null check (amount_paise > 0),
  mode text not null check (mode in ('cash', 'upi')),
  created_at timestamptz not null default now(),
  created_by uuid default current_user_id()
);

create index on branches (org_id);
create index on visits (branch_id, status);
create index on frames (branch_id, status);
create index on frame_players (visit_id);
create index on frame_pauses (frame_id);
create index on charges (visit_id);
create index on payments (visit_id);

-- Rows added directly by the app take their business from their shop, so a
-- client can't file a row under another business.
create function set_org_from_branch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.org_id := (select org_id from branches where id = new.branch_id);
  return new;
end $$;
create trigger set_org before insert or update of branch_id on tables   for each row execute function set_org_from_branch();
create trigger set_org before insert or update of branch_id on products for each row execute function set_org_from_branch();
create trigger set_org before insert on visits for each row execute function set_org_from_branch();

-- ─── Security ────────────────────────────────────────────────────────────────

-- People, memberships and sessions are only reachable through the functions below.
alter table app_users enable row level security;
alter table memberships enable row level security;
alter table sessions enable row level security;
revoke all on app_users, memberships, sessions from anon, authenticated;

alter table organizations enable row level security;
create policy member_read on organizations for select to authenticated using (org_role(id) is not null);

do $$
declare t text;
begin
  foreach t in array array['branches','tables','products','visits','frames','frame_players','frame_pauses','frame_time_edits','charges','payments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy member_read on %I for select to authenticated using (org_role(org_id) is not null)', t);
  end loop;
end $$;

-- Settings: admin only.
create policy admin_insert on branches for insert to authenticated with check (org_role(org_id) = 'admin');
create policy admin_update on branches for update to authenticated using (org_role(org_id) = 'admin') with check (org_role(org_id) = 'admin');
create policy admin_insert on tables   for insert to authenticated with check (org_role(org_id) = 'admin');
create policy admin_update on tables   for update to authenticated using (org_role(org_id) = 'admin') with check (org_role(org_id) = 'admin');
create policy admin_insert on products for insert to authenticated with check (org_role(org_id) = 'admin');
create policy admin_update on products for update to authenticated using (org_role(org_id) = 'admin') with check (org_role(org_id) = 'admin');
-- New players: admin or maintainer.
create policy staff_insert on visits for insert to authenticated
  with check (org_role(org_id) in ('admin', 'maintainer') and status = 'open');
-- Everything touching money or time goes through the functions below.

-- ─── Login ───────────────────────────────────────────────────────────────────

create function normalize_phone(p text) returns text
language sql immutable as $$
  select case
    when length(d) = 12 and d like '91%' then substr(d, 3)
    when length(d) = 11 and d like '0%' then substr(d, 2)
    else d end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) x
$$;

create function check_new_pin(p_pin text) returns void
language plpgsql immutable as $$
begin
  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then raise exception 'PIN must be 4 to 6 digits'; end if;
end $$;

create function check_phone(p_phone text) returns text
language plpgsql immutable as $$
declare v text := normalize_phone(p_phone);
begin
  if v !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number'; end if;
  return v;
end $$;

-- Who is logged in on this device, and their businesses. Null if nobody.
create function whoami() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', u.id, 'name', u.name, 'phone', u.phone,
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object('org_id', o.id, 'org_name', o.name, 'role', m.role) order by o.name)
      from memberships m join organizations o on o.id = m.org_id
      where m.user_id = u.id), '[]'::jsonb))
  from app_users u where u.id = current_user_id()
$$;

-- Returns {"error": "..."} instead of raising, so failed attempts are saved.
create function pin_login(p_phone text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare u app_users;
begin
  if auth.uid() is null then return jsonb_build_object('error', 'Device session missing. Reload the page.'); end if;
  select * into u from app_users where phone = normalize_phone(p_phone) for update;
  if u.id is null then return jsonb_build_object('error', 'Wrong mobile number or PIN'); end if;
  if u.locked_until > now() then
    return jsonb_build_object('error', format('Too many wrong PINs. Try again in %s min.',
      ceil(extract(epoch from (u.locked_until - now())) / 60)));
  end if;
  if crypt(coalesce(p_pin, ''), u.pin_hash) <> u.pin_hash then
    update app_users set
      failed_pin_attempts = case when failed_pin_attempts + 1 >= 5 then 0 else failed_pin_attempts + 1 end,
      locked_until = case when failed_pin_attempts + 1 >= 5 then now() + interval '15 minutes' end
    where id = u.id;
    return jsonb_build_object('error', 'Wrong mobile number or PIN');
  end if;
  update app_users set failed_pin_attempts = 0, locked_until = null where id = u.id;
  insert into sessions (auth_uid, user_id) values (auth.uid(), u.id)
    on conflict (auth_uid) do update set user_id = excluded.user_id, created_at = now();
  return whoami();
end $$;

create function pin_logout() returns void
language sql security definer set search_path = public as $$
  delete from sessions where auth_uid = auth.uid()
$$;

-- Sign-up for a new business: creates the owner (admin), the business and a first shop.
create function register_business(p_business_name text, p_owner_name text, p_phone text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_phone text := check_phone(p_phone);
  v_user uuid;
  v_org uuid;
  v_branch uuid;
begin
  if auth.uid() is null then raise exception 'Device session missing. Reload the page.'; end if;
  perform check_new_pin(p_pin);
  if length(trim(coalesce(p_business_name, ''))) = 0 then raise exception 'Business name is required'; end if;
  if length(trim(coalesce(p_owner_name, ''))) = 0 then raise exception 'Your name is required'; end if;
  if exists (select 1 from app_users where phone = v_phone) then
    raise exception 'This mobile number is already registered. Log in with your PIN instead.';
  end if;

  insert into app_users (phone, name, pin_hash) values (v_phone, trim(p_owner_name), crypt(p_pin, gen_salt('bf')))
    returning id into v_user;
  insert into organizations (name) values (trim(p_business_name)) returning id into v_org;
  insert into memberships (org_id, user_id, role) values (v_org, v_user, 'admin');
  insert into branches (org_id, name) values (v_org, 'Main shop') returning id into v_branch;
  insert into tables (org_id, branch_id, name, rate_paise_per_min, sort)
    select v_org, v_branch, 'Table ' || n, 700, n from generate_series(1, 4) n;
  insert into products (org_id, branch_id, name, price_paise)
    select v_org, v_branch, p.name, p.price from (values
      ('Maggi', 4000), ('Tea', 1500), ('Cold drink', 3000),
      ('Water bottle', 2000), ('Cigarette', 2000), ('Chips', 2000)) as p(name, price);
  insert into sessions (auth_uid, user_id) values (auth.uid(), v_user)
    on conflict (auth_uid) do update set user_id = excluded.user_id, created_at = now();
  return whoami();
end $$;

create function change_my_pin(p_old_pin text, p_new_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare u app_users;
begin
  select * into u from app_users where id = current_user_id() for update;
  if u.id is null then raise exception 'Please log in again'; end if;
  if crypt(coalesce(p_old_pin, ''), u.pin_hash) <> u.pin_hash then raise exception 'Current PIN is wrong'; end if;
  perform check_new_pin(p_new_pin);
  update app_users set pin_hash = crypt(p_new_pin, gen_salt('bf')) where id = u.id;
end $$;

-- ─── Staff management (admin) ────────────────────────────────────────────────

create function list_members(p_org_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_role(p_org_id, array['admin']);
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', u.id, 'name', u.name, 'phone', u.phone, 'role', m.role)
                     order by (m.role = 'admin') desc, u.name)
    from memberships m join app_users u on u.id = m.user_id
    where m.org_id = p_org_id), '[]'::jsonb);
end $$;

-- Returns {"existing": true} when the number already had an account (their own PIN stays).
create function add_member(p_org_id uuid, p_name text, p_phone text, p_role text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_phone text := check_phone(p_phone);
  v_user uuid;
  v_existing boolean;
begin
  perform require_role(p_org_id, array['admin']);
  if p_role not in ('maintainer', 'viewer') then raise exception 'Staff role must be maintainer or viewer'; end if;
  select id into v_user from app_users where phone = v_phone;
  v_existing := v_user is not null;
  if not v_existing then
    if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Name is required'; end if;
    perform check_new_pin(p_pin);
    insert into app_users (phone, name, pin_hash) values (v_phone, trim(p_name), crypt(p_pin, gen_salt('bf')))
      returning id into v_user;
  elsif exists (select 1 from memberships where org_id = p_org_id and user_id = v_user) then
    raise exception 'This number is already on your staff';
  end if;
  insert into memberships (org_id, user_id, role) values (p_org_id, v_user, p_role);
  return jsonb_build_object('existing', v_existing);
end $$;

create function update_member_role(p_org_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(p_org_id, array['admin']);
  if p_role not in ('maintainer', 'viewer') then raise exception 'Staff role must be maintainer or viewer'; end if;
  update memberships set role = p_role where org_id = p_org_id and user_id = p_user_id and role <> 'admin';
  if not found then raise exception 'Staff member not found'; end if;
end $$;

create function remove_member(p_org_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role(p_org_id, array['admin']);
  delete from memberships where org_id = p_org_id and user_id = p_user_id and role <> 'admin';
  if not found then raise exception 'Staff member not found (the admin cannot be removed)'; end if;
end $$;

create function reset_member_pin(p_org_id uuid, p_user_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform require_role(p_org_id, array['admin']);
  perform check_new_pin(p_pin);
  if not exists (select 1 from memberships where org_id = p_org_id and user_id = p_user_id and role <> 'admin') then
    raise exception 'Staff member not found';
  end if;
  -- Don't let one business take over an account that another business also uses.
  if exists (select 1 from memberships m where m.user_id = p_user_id and org_role(m.org_id) is distinct from 'admin') then
    raise exception 'This person also works at another business, so only they can change their PIN.';
  end if;
  update app_users set pin_hash = crypt(p_pin, gen_salt('bf')), failed_pin_attempts = 0, locked_until = null
    where id = p_user_id;
  delete from sessions where user_id = p_user_id;  -- log them out everywhere
end $$;

-- ─── Billing helpers ─────────────────────────────────────────────────────────

create function billable_minutes(seconds integer) returns integer
language sql immutable as $$
  select greatest(1, round(seconds / 60.0)::integer)
$$;

create function lock_live_frame(p_frame_id uuid) returns frames
language plpgsql as $$
declare f frames;
begin
  select * into f from frames where id = p_frame_id for update;
  if f.id is null or f.status not in ('running', 'paused') then
    raise exception 'This frame has already finished';
  end if;
  return f;
end $$;

-- ─── Table & bill actions ────────────────────────────────────────────────────
-- security definer: they write tables staff can't write directly, after checking
-- the caller's role in the row's business.

create function start_frame(p_table_id uuid, p_side_a uuid[], p_side_b uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t tables;
  v visits;
  v_frame_id uuid;
  v_all uuid[] := p_side_a || p_side_b;
  v_id uuid;
begin
  select * into t from tables where id = p_table_id for update;
  if t.id is null then raise exception 'Table not found'; end if;
  perform require_role(t.org_id, array['admin', 'maintainer']);
  if exists (select 1 from frames where table_id = p_table_id and status in ('running', 'paused')) then
    raise exception '% already has a frame running', t.name;
  end if;
  if coalesce(array_length(p_side_a, 1), 0) not between 1 and 2
     or coalesce(array_length(p_side_b, 1), 0) not between 1 and 2 then
    raise exception 'Each side needs 1 or 2 players';
  end if;
  if (select count(distinct x) from unnest(v_all) x) <> array_length(v_all, 1) then
    raise exception 'A player cannot be on both sides';
  end if;
  foreach v_id in array v_all loop
    select * into v from visits where id = v_id for update;
    if v.id is null or v.status <> 'open' or v.branch_id <> t.branch_id then
      raise exception 'Player has already checked out';
    end if;
    if exists (select 1 from frame_players fp join frames f on f.id = fp.frame_id
               where fp.visit_id = v_id and f.status in ('running', 'paused')) then
      raise exception '% is already playing on another table', v.player_name;
    end if;
  end loop;

  insert into frames (org_id, branch_id, table_id, rate_paise_per_min)
  values (t.org_id, t.branch_id, t.id, t.rate_paise_per_min)
  returning id into v_frame_id;
  insert into frame_players (org_id, frame_id, visit_id, side)
  select t.org_id, v_frame_id, x, 'A' from unnest(p_side_a) x
  union all
  select t.org_id, v_frame_id, x, 'B' from unnest(p_side_b) x;
  return v_frame_id;
end $$;

create function pause_frame(p_frame_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f frames;
begin
  f := lock_live_frame(p_frame_id);
  perform require_role(f.org_id, array['admin', 'maintainer']);
  if f.status = 'paused' then return; end if;
  update frames set status = 'paused' where id = p_frame_id;
  insert into frame_pauses (org_id, frame_id) values (f.org_id, p_frame_id);
end $$;

create function resume_frame(p_frame_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f frames;
begin
  f := lock_live_frame(p_frame_id);
  perform require_role(f.org_id, array['admin', 'maintainer']);
  if f.status = 'running' then return; end if;
  update frames set status = 'running' where id = p_frame_id;
  update frame_pauses set resumed_at = now() where frame_id = p_frame_id and resumed_at is null;
end $$;

-- Admin: set how long a live frame has been played (e.g. the timer was started late).
create function adjust_frame_time(p_frame_id uuid, p_played_seconds integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  f frames;
  v_paused numeric;
  v_new timestamptz;
begin
  f := lock_live_frame(p_frame_id);
  perform require_role(f.org_id, array['admin']);
  if p_played_seconds is null or p_played_seconds < 0 or p_played_seconds > 24 * 3600 then
    raise exception 'Played time must be between 0 and 24 hours';
  end if;
  select coalesce(sum(extract(epoch from (coalesce(resumed_at, now()) - paused_at))), 0) into v_paused
    from frame_pauses where frame_id = p_frame_id;
  v_new := now() - make_interval(secs => p_played_seconds + v_paused);
  insert into frame_time_edits (org_id, frame_id, old_started_at, new_started_at)
    values (f.org_id, p_frame_id, f.started_at, v_new);
  update frames set started_at = v_new, time_adjusted = true where id = p_frame_id;
end $$;

create function end_frame(p_frame_id uuid, p_losing_side text) returns void
language plpgsql security definer set search_path = public as $$
declare
  f frames;
  v_now timestamptz := now();
  v_seconds integer;
  v_amount integer;
  v_losers uuid[];
  v_count integer;
  v_base integer;
  v_remainder integer;
  v_minutes integer;
  v_table_name text;
  i integer;
begin
  if p_losing_side not in ('A', 'B') then raise exception 'Losing side must be A or B'; end if;
  f := lock_live_frame(p_frame_id);
  perform require_role(f.org_id, array['admin', 'maintainer']);

  update frame_pauses set resumed_at = v_now where frame_id = p_frame_id and resumed_at is null;
  select greatest(0, floor(extract(epoch from (v_now - f.started_at))
           - coalesce(sum(extract(epoch from (resumed_at - paused_at))), 0)))::integer
    into v_seconds
    from frame_pauses where frame_id = p_frame_id;
  v_minutes := billable_minutes(v_seconds);
  v_amount := v_minutes * f.rate_paise_per_min;

  select array_agg(visit_id order by visit_id) into v_losers
    from frame_players where frame_id = p_frame_id and side = p_losing_side;
  v_count := array_length(v_losers, 1);
  v_base := v_amount / v_count;
  v_remainder := v_amount - v_base * v_count;
  select name into v_table_name from tables where id = f.table_id;

  for i in 1..v_count loop
    insert into charges (org_id, visit_id, source, frame_id, description, amount_paise)
    values (
      f.org_id, v_losers[i], 'frame', p_frame_id,
      v_table_name || ' · lost frame · ' || v_minutes || ' min'
        || case when v_count > 1 then ' (split ' || v_count || ' ways)' else '' end,
      v_base + case when i <= v_remainder then 1 else 0 end
    );
  end loop;

  update frames set status = 'ended', ended_at = v_now, losing_side = p_losing_side,
    billable_seconds = v_seconds, amount_paise = v_amount, ended_by = current_user_id()
  where id = p_frame_id;
end $$;

create function cancel_frame(p_frame_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare f frames;
begin
  f := lock_live_frame(p_frame_id);
  perform require_role(f.org_id, array['admin']);
  update frame_pauses set resumed_at = now() where frame_id = p_frame_id and resumed_at is null;
  update frames set status = 'cancelled', ended_at = now(), ended_by = current_user_id() where id = p_frame_id;
end $$;

create function add_item(p_visit_id uuid, p_product_id uuid, p_quantity integer) returns void
language plpgsql security definer set search_path = public as $$
declare v visits; p products;
begin
  select * into v from visits where id = p_visit_id for update;
  if v.id is null then raise exception 'Player not found'; end if;
  perform require_role(v.org_id, array['admin', 'maintainer']);
  if v.status <> 'open' then raise exception 'Player has already checked out'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'Quantity must be at least 1'; end if;
  select * into p from products where id = p_product_id and branch_id = v.branch_id;
  if p.id is null then raise exception 'Product not found'; end if;
  insert into charges (org_id, visit_id, source, product_id, description, quantity, amount_paise)
  values (v.org_id, p_visit_id, 'item', p_product_id, p.name, p_quantity, p.price_paise * p_quantity);
end $$;

create function remove_item(p_charge_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c charges; v visits;
begin
  select * into c from charges where id = p_charge_id;
  if c.id is null then raise exception 'Item not found'; end if;
  perform require_role(c.org_id, array['admin']);
  if c.source <> 'item' then raise exception 'Only shop items can be removed'; end if;
  select * into v from visits where id = c.visit_id for update;
  if v.status <> 'open' then raise exception 'Player has already checked out'; end if;
  delete from charges where id = p_charge_id;
end $$;

create function checkout(p_visit_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = public as $$
declare v visits; v_due integer;
begin
  select * into v from visits where id = p_visit_id for update;
  if v.id is null then raise exception 'Player not found'; end if;
  perform require_role(v.org_id, array['admin']);
  if v.status <> 'open' then raise exception 'Player has already checked out'; end if;
  if p_mode not in ('cash', 'upi') then raise exception 'Unknown payment mode'; end if;
  if exists (select 1 from frame_players fp join frames f on f.id = fp.frame_id
             where fp.visit_id = p_visit_id and f.status in ('running', 'paused')) then
    raise exception '% is still in a running frame. End the frame first.', v.player_name;
  end if;
  select coalesce((select sum(amount_paise) from charges where visit_id = p_visit_id), 0)
       - coalesce((select sum(amount_paise) from payments where visit_id = p_visit_id), 0)
    into v_due;
  if v_due > 0 then
    insert into payments (org_id, visit_id, amount_paise, mode) values (v.org_id, p_visit_id, v_due, p_mode);
  end if;
  update visits set status = 'closed', closed_at = now() where id = p_visit_id;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- ─── Live updates between devices ────────────────────────────────────────────

alter publication supabase_realtime add table
  branches, tables, products, visits, frames, frame_players, frame_pauses, charges, payments;
