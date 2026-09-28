-- Fix: saving Price & UPI in the platform dashboard failed with "UPDATE requires a WHERE clause".
-- Supabase blocks UPDATE/DELETE without WHERE for requests from the app, even inside functions.
-- Run after 004_subscriptions.sql. (Already included in 004 for new setups; safe to run anyway.)

create or replace function platform_update_settings(
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
  where id;  -- the single settings row
end $$;

revoke execute on function platform_update_settings(text, text, integer, integer, integer, integer, integer) from public, anon;
grant execute on function platform_update_settings(text, text, integer, integer, integer, integer, integer) to authenticated;
