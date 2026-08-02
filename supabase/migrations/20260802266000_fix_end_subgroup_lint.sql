-- Qualify the fallback membership check so it cannot collide with the
-- function's returned user_id column.

create or replace function public.end_subgroup(p_subgroup_id uuid)
returns table(user_id uuid, net_balance_paise bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  subgroup_status text;
  subgroup_leader_id uuid;
  subgroup_last_activity timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;

  select status, leader_id, last_activity_at
  into subgroup_status, subgroup_leader_id, subgroup_last_activity
  from public.outing_subgroups
  where id = p_subgroup_id
  for update;

  if not found then raise exception 'Outing sub-group not found.'; end if;

  if subgroup_leader_id <> auth.uid() then
    if subgroup_last_activity is null or subgroup_last_activity > now() - interval '30 days' then
      raise exception 'Only the outing leader can end this outing.';
    end if;
    if not exists (
      select 1
      from public.subgroup_members members
      where members.subgroup_id = p_subgroup_id
        and members.user_id = auth.uid()
    ) then
      raise exception 'Only an outing member can use the inactive-leader fallback.';
    end if;
  end if;

  if subgroup_status <> 'active' then raise exception 'Outing sub-group is already ended.'; end if;

  update public.outing_subgroups
  set status = 'ended', last_activity_at = now()
  where id = p_subgroup_id;

  return query
  select balances.user_id, balances.net_balance_paise
  from public.ledger_balances balances
  where balances.subgroup_id = p_subgroup_id
    and balances.net_balance_paise <> 0
  order by balances.user_id;
end;
$$;

revoke execute on function public.end_subgroup(uuid) from public, anon;
grant execute on function public.end_subgroup(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
