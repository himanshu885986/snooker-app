-- Hourly games (PlayStation, table tennis, …) and item groups (Cigarettes → Gold Flake, Classic, …).
-- Run after 002_payments_khata.sql: Supabase → SQL Editor → New query → paste → Run.
-- Existing tables keep their rate (₹7/min becomes ₹420/hr, shown as ₹7/min) and their billing.
--
-- Billing rules (same as src/lib/billing.ts):
--   minutes played = seconds rounded to the nearest minute
--   minutes billed = that, rounded up to a whole block, and at least the minimum
--   amount         = minutes billed × hourly rate ÷ 60, rounded to the paisa

-- ─── Tables become any kind of station ───────────────────────────────────────

alter table tables
  add column kind text not null default 'snooker'
    check (kind in ('snooker', 'pool', 'playstation', 'tabletennis', 'boardgame', 'foosball', 'other')),
  -- loser = the losing side pays (sides A and B); split = the players who played share it
  add column billing text not null default 'loser' check (billing in ('loser', 'split')),
  add column rate_paise_per_hour integer,
  -- how the rate is shown and typed: per minute or per hour
  add column rate_unit text not null default 'minute' check (rate_unit in ('minute', 'hour')),
  add column block_minutes integer not null default 1 check (block_minutes between 1 and 240),
  add column min_minutes integer not null default 1 check (min_minutes between 1 and 600);
update tables set rate_paise_per_hour = rate_paise_per_min * 60;
alter table tables
  alter column rate_paise_per_hour set not null,
  add constraint tables_rate_positive check (rate_paise_per_hour > 0),
  drop column rate_paise_per_min;

-- Frames keep a copy of the rules they started with, so later changes don't alter them.
alter table frames
  add column rate_paise_per_hour integer,
  add column billing text not null default 'loser' check (billing in ('loser', 'split')),
  add column block_minutes integer not null default 1,
  add column min_minutes integer not null default 1;
update frames set rate_paise_per_hour = rate_paise_per_min * 60;
alter table frames
  alter column rate_paise_per_hour set not null,
  drop column rate_paise_per_min;

-- Players in a split session have no side.
alter table frame_players alter column side drop not null;

-- ─── Item groups ─────────────────────────────────────────────────────────────

alter table products add column group_name text;

-- ─── Billing helpers ─────────────────────────────────────────────────────────

drop function billable_minutes(integer);

create function billed_minutes(p_seconds integer, p_block integer, p_min integer) returns integer
language sql immutable as $$
  select greatest(1, p_min, (ceil(round(p_seconds / 60.0) / p_block) * p_block)::integer)
$$;

create function format_minutes(p_minutes integer) returns text
language sql immutable as $$
  select case
    when p_minutes < 60 then p_minutes || ' min'
    when p_minutes % 60 = 0 then (p_minutes / 60) || ' hr'
    else (p_minutes / 60) || ' hr ' || (p_minutes % 60) || ' min' end
$$;

-- ─── Frames / sessions ───────────────────────────────────────────────────────

-- Loser-pays tables: p_side_a and p_side_b, 1–2 players each.
-- Split stations: all players in p_side_a (1–8), p_side_b empty.
create or replace function start_frame(p_table_id uuid, p_side_a uuid[], p_side_b uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  t tables;
  v visits;
  v_frame_id uuid;
  v_all uuid[] := coalesce(p_side_a, '{}') || coalesce(p_side_b, '{}');
  v_id uuid;
begin
  select * into t from tables where id = p_table_id for update;
  if t.id is null then raise exception 'Table not found'; end if;
  perform require_role(t.org_id, array['admin', 'maintainer']);
  if exists (select 1 from frames where table_id = p_table_id and status in ('running', 'paused')) then
    raise exception '% is already in use', t.name;
  end if;
  if t.billing = 'loser' then
    if coalesce(array_length(p_side_a, 1), 0) not between 1 and 2
       or coalesce(array_length(p_side_b, 1), 0) not between 1 and 2 then
      raise exception 'Each side needs 1 or 2 players';
    end if;
  elsif coalesce(array_length(v_all, 1), 0) not between 1 and 8 then
    raise exception 'Add 1 to 8 players';
  end if;
  if (select count(distinct x) from unnest(v_all) x) <> array_length(v_all, 1) then
    raise exception 'A player cannot be added twice';
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

  insert into frames (org_id, branch_id, table_id, rate_paise_per_hour, billing, block_minutes, min_minutes)
  values (t.org_id, t.branch_id, t.id, t.rate_paise_per_hour, t.billing, t.block_minutes, t.min_minutes)
  returning id into v_frame_id;
  if t.billing = 'loser' then
    insert into frame_players (org_id, frame_id, visit_id, side)
    select t.org_id, v_frame_id, x, 'A' from unnest(p_side_a) x
    union all
    select t.org_id, v_frame_id, x, 'B' from unnest(p_side_b) x;
  else
    insert into frame_players (org_id, frame_id, visit_id, side)
    select t.org_id, v_frame_id, x, null from unnest(v_all) x;
  end if;
  return v_frame_id;
end $$;

-- Loser-pays: pass the losing side. Split: optionally pass who pays (default: everyone who played).
drop function end_frame(uuid, text);
create function end_frame(p_frame_id uuid, p_losing_side text default null, p_payers uuid[] default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  f frames;
  v_now timestamptz := now();
  v_seconds integer;
  v_minutes integer;
  v_amount integer;
  v_payers uuid[];
  v_count integer;
  v_base integer;
  v_remainder integer;
  v_table_name text;
  v_what text;
  i integer;
begin
  f := lock_live_frame(p_frame_id);
  perform require_role(f.org_id, array['admin', 'maintainer']);

  if f.billing = 'loser' then
    if p_losing_side is null or p_losing_side not in ('A', 'B') then raise exception 'Choose the side that lost'; end if;
    select array_agg(visit_id order by visit_id) into v_payers
      from frame_players where frame_id = p_frame_id and side = p_losing_side;
    v_what := 'lost frame';
  else
    if p_payers is null or array_length(p_payers, 1) is null then
      select array_agg(visit_id order by visit_id) into v_payers from frame_players where frame_id = p_frame_id;
    else
      if (select count(distinct x) from unnest(p_payers) x) <> array_length(p_payers, 1)
         or exists (select 1 from unnest(p_payers) x
                    where not exists (select 1 from frame_players where frame_id = p_frame_id and visit_id = x)) then
        raise exception 'Payers must be players in this session';
      end if;
      select array_agg(x order by x) into v_payers from unnest(p_payers) x;
    end if;
    v_what := 'played';
  end if;

  update frame_pauses set resumed_at = v_now where frame_id = p_frame_id and resumed_at is null;
  select greatest(0, floor(extract(epoch from (v_now - f.started_at))
           - coalesce(sum(extract(epoch from (resumed_at - paused_at))), 0)))::integer
    into v_seconds
    from frame_pauses where frame_id = p_frame_id;
  v_minutes := billed_minutes(v_seconds, f.block_minutes, f.min_minutes);
  v_amount := round(v_minutes * f.rate_paise_per_hour / 60.0)::integer;

  v_count := array_length(v_payers, 1);
  v_base := v_amount / v_count;
  v_remainder := v_amount - v_base * v_count;
  select name into v_table_name from tables where id = f.table_id;

  for i in 1..v_count loop
    insert into charges (org_id, visit_id, source, frame_id, description, amount_paise)
    values (
      f.org_id, v_payers[i], 'frame', p_frame_id,
      v_table_name || ' · ' || v_what || ' · ' || format_minutes(v_minutes)
        || case when v_count > 1 then ' (split ' || v_count || ' ways)' else '' end,
      v_base + case when i <= v_remainder then 1 else 0 end
    );
  end loop;

  update frames set status = 'ended', ended_at = v_now,
    losing_side = case when f.billing = 'loser' then p_losing_side end,
    billable_seconds = v_seconds, amount_paise = v_amount, ended_by = current_user_id()
  where id = p_frame_id;
end $$;

-- Items in a group are billed as "Cigarettes · Gold Flake".
create or replace function add_item(p_visit_id uuid, p_product_id uuid, p_quantity integer) returns void
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
  values (v.org_id, p_visit_id, 'item', p_product_id,
          coalesce(nullif(trim(p.group_name), '') || ' · ', '') || p.name,
          p_quantity, p.price_paise * p_quantity);
end $$;

-- New businesses start with 4 snooker tables and a small menu, including a cigarette group.
create or replace function register_business(p_business_name text, p_owner_name text, p_phone text, p_pin text) returns jsonb
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
  insert into tables (org_id, branch_id, name, rate_paise_per_hour, sort)
    select v_org, v_branch, 'Table ' || n, 42000, n from generate_series(1, 4) n;
  insert into products (org_id, branch_id, group_name, name, price_paise)
    select v_org, v_branch, p.grp, p.name, p.price from (values
      (null, 'Maggi', 4000), (null, 'Tea', 1500), (null, 'Cold drink', 3000), (null, 'Water bottle', 2000),
      ('Cigarettes', 'Gold Flake', 2000), ('Cigarettes', 'Classic', 2200), (null, 'Chips', 2000)) as p(grp, name, price);
  insert into sessions (auth_uid, user_id) values (auth.uid(), v_user)
    on conflict (auth_uid) do update set user_id = excluded.user_id, created_at = now();
  return whoami();
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function find_or_create_customer(uuid, text, text) from authenticated;
