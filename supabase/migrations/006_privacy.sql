-- Privacy and data rights (DPDP Act): erase a customer, delete a business or an account,
-- export data, logins that expire, and automatic clean-up of old personal data.
-- Run after 005: Supabase → SQL Editor → New query → paste → Run.

-- ─── Logins expire after 30 days without use ─────────────────────────────────

alter table sessions add column last_seen_at timestamptz not null default now();

-- Any write to a session row (login, or the app checking in) counts as activity.
create function touch_session() returns trigger
language plpgsql as $$
begin
  new.last_seen_at := now();
  return new;
end $$;
create trigger touch before insert or update on sessions for each row execute function touch_session();

create or replace function current_user_id() returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from sessions where auth_uid = auth.uid() and last_seen_at > now() - interval '30 days'
$$;

-- whoami now also records that this device is still in use.
create or replace function whoami() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := current_user_id();
begin
  if v_user is null then return null; end if;
  update sessions set last_seen_at = now() where auth_uid = auth.uid();
  return (
    select jsonb_build_object(
      'id', u.id, 'name', u.name, 'phone', u.phone,
      'is_platform_admin', exists (select 1 from platform_admins pa where pa.user_id = u.id),
      'memberships', coalesce((
        select jsonb_agg(jsonb_build_object('org_id', o.id, 'org_name', o.name, 'role', m.role, 'active', org_active(o.id)) order by o.name)
        from memberships m join organizations o on o.id = m.org_id
        where m.user_id = u.id), '[]'::jsonb))
    from app_users u where u.id = v_user);
end $$;

-- "Log out all devices" (e.g. a phone was lost).
create function logout_everywhere() returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := current_user_id();
begin
  if v_user is null then raise exception 'Please log in again'; end if;
  delete from sessions where user_id = v_user;
end $$;

create function check_my_pin(p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare u app_users;
begin
  select * into u from app_users where id = current_user_id();
  if u.id is null then raise exception 'Please log in again'; end if;
  if crypt(coalesce(p_pin, ''), u.pin_hash) <> u.pin_hash then raise exception 'PIN is wrong'; end if;
  return u.id;
end $$;

-- ─── Erasing a customer's personal data ──────────────────────────────────────

alter table customers alter column phone drop not null;
alter table customers add column erased_at timestamptz;

-- Removes name and mobile number from the customer and all their bills. Amounts stay (anonymised),
-- so the shop's accounts still add up. Not allowed while they still owe or are owed money.
create function erase_customer(p_org_id uuid, p_phone text) returns text
language plpgsql security definer set search_path = public as $$
declare c customers; v_balance integer;
begin
  perform require_role(p_org_id, array['admin']);
  select * into c from customers where org_id = p_org_id and phone = normalize_phone(p_phone) for update;
  if c.id is null then raise exception 'No customer with that mobile number'; end if;
  v_balance := khata_balance(c.id);
  if v_balance <> 0 then
    raise exception 'They have ₹% on khata. Settle it first, then erase.', trim(to_char(abs(v_balance) / 100.0, 'FM999999990.00'));
  end if;
  update visits set player_name = 'Deleted customer', phone = null where customer_id = c.id;
  update khata_entries set note = null where customer_id = c.id;
  update customers set name = 'Deleted customer', phone = null, erased_at = now() where id = c.id;
  return c.name;
end $$;

-- ─── Deleting a whole business, or your own account ──────────────────────────

-- Everything of the business goes: shops, tables, bills, khata, staff access. Needs the owner's PIN.
create function delete_business(p_org_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform check_my_pin(p_pin);
  if org_member_role(p_org_id) is distinct from 'admin' then raise exception 'Only the admin can do this'; end if;
  delete from organizations where id = p_org_id;
end $$;

create function delete_my_account(p_pin text) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := check_my_pin(p_pin);
begin
  if exists (select 1 from memberships where user_id = v_user and role = 'admin') then
    raise exception 'You own a business. Delete the business first (Settings → Privacy & data), so it isn’t left without an owner.';
  end if;
  delete from app_users where id = v_user;
end $$;

-- ─── Exports ─────────────────────────────────────────────────────────────────

-- Everything stored about the business, for the owner (works even if the subscription has ended).
create function export_business(p_org_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if org_member_role(p_org_id) is distinct from 'admin' then raise exception 'Only the admin can do this'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'business', (select to_jsonb(o) from organizations o where id = p_org_id),
    'staff', (select coalesce(jsonb_agg(jsonb_build_object('name', u.name, 'phone', u.phone, 'role', m.role, 'added_at', m.created_at)), '[]')
              from memberships m join app_users u on u.id = m.user_id where m.org_id = p_org_id),
    'shops', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from branches x where org_id = p_org_id),
    'tables', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from tables x where org_id = p_org_id),
    'products', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from products x where org_id = p_org_id),
    'bills', (select coalesce(jsonb_agg(to_jsonb(x) order by x.opened_at), '[]') from visits x where org_id = p_org_id),
    'bill_lines', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from charges x where org_id = p_org_id),
    'payments', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from payments x where org_id = p_org_id),
    'frames', (select coalesce(jsonb_agg(to_jsonb(x) order by x.started_at), '[]') from frames x where org_id = p_org_id),
    'frame_players', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from frame_players x where org_id = p_org_id),
    'frame_pauses', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from frame_pauses x where org_id = p_org_id),
    'time_changes', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from frame_time_edits x where org_id = p_org_id),
    'customers', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from customers x where org_id = p_org_id),
    'khata', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from khata_entries x where org_id = p_org_id),
    'subscription_payments', (select coalesce(jsonb_agg(to_jsonb(x) order by x.claimed_at), '[]') from subscription_payments x where org_id = p_org_id)
  );
end $$;

-- What PlayKhata stores about you as a person (not your PIN, which is only kept as a one-way hash).
create function export_my_data() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u app_users;
begin
  select * into u from app_users where id = current_user_id();
  if u.id is null then raise exception 'Please log in again'; end if;
  return jsonb_build_object(
    'exported_at', now(),
    'name', u.name, 'phone', u.phone, 'account_created_at', u.created_at,
    'pin', 'Stored only as a one-way hash; nobody can read it.',
    'businesses', (select coalesce(jsonb_agg(jsonb_build_object('business', o.name, 'role', m.role, 'since', m.created_at)), '[]')
                   from memberships m join organizations o on o.id = m.org_id where m.user_id = u.id),
    'logged_in_devices', (select count(*) from sessions where user_id = u.id and last_seen_at > now() - interval '30 days')
  );
end $$;

-- ─── Automatic clean-up (run nightly by the backup job; see README) ──────────

-- Keeps personal data only as long as it's useful:
--   bills older than 2 years lose the player's name and number (amounts stay),
--   customers with no activity for 2 years and nothing on khata are erased,
--   expired logins are removed.
create function run_retention() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_bills integer; v_customers integer; v_sessions integer;
begin
  update visits set player_name = 'Player', phone = null
    where status = 'closed' and closed_at < now() - interval '2 years'
      and (player_name <> 'Player' or phone is not null);
  get diagnostics v_bills = row_count;

  with idle as (
    select c.id from customers c
    where c.erased_at is null
      and c.created_at < now() - interval '2 years'
      and khata_balance(c.id) = 0
      and not exists (select 1 from visits v where v.customer_id = c.id and v.opened_at > now() - interval '2 years')
      and not exists (select 1 from khata_entries e where e.customer_id = c.id and e.created_at > now() - interval '2 years')
  )
  update customers set name = 'Deleted customer', phone = null, erased_at = now() where id in (select id from idle);
  get diagnostics v_customers = row_count;

  delete from sessions where last_seen_at < now() - interval '30 days';
  get diagnostics v_sessions = row_count;

  return jsonb_build_object('bills_anonymised', v_bills, 'customers_erased', v_customers, 'logins_removed', v_sessions);
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function find_or_create_customer(uuid, text, text) from authenticated;
revoke execute on function extend_paid(uuid, integer) from authenticated;
revoke execute on function check_my_pin(text) from authenticated;
revoke execute on function run_retention() from authenticated;
