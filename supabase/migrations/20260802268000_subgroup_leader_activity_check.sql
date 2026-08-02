create or replace function public.is_subgroup_leader_inactive(p_subgroup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.outing_subgroups
    where id = p_subgroup_id
      and last_activity_at <= now() - interval '30 days'
  );
$$;

revoke execute on function public.is_subgroup_leader_inactive(uuid) from public, anon, authenticated;
grant execute on function public.is_subgroup_leader_inactive(uuid) to service_role;

notify pgrst, 'reload schema';
