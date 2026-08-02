-- Keep invite secrets behind the server routes and protect outing state changes.

revoke all on table public.invites from anon, authenticated;
grant all on table public.invites to service_role;

revoke update, delete on table public.outing_subgroups from anon, authenticated;

notify pgrst, 'reload schema';
