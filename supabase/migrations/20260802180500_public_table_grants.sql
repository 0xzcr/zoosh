-- Ensure Supabase Data API can see and query the Stage 1 tables.
-- Newer Supabase projects may not auto-expose public tables, so we grant
-- the roles used by the app explicitly and then ask PostgREST to refresh.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.friend_groups,
  public.friend_group_members,
  public.user_payout_accounts,
  public.outing_subgroups,
  public.subgroup_members,
  public.invites,
  public.expenses,
  public.ledger_balances,
  public.settlement_sessions,
  public.settlement_payouts,
  public.reminders
to anon, authenticated, service_role;

notify pgrst, 'reload schema';
