-- Stage 5.2: lock an active outing and return its non-zero final balances.

create or replace function public.end_subgroup(p_subgroup_id uuid)
returns table(user_id uuid, net_balance_paise bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  subgroup_status text;
  subgroup_leader_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select status, leader_id
  into subgroup_status, subgroup_leader_id
  from public.outing_subgroups
  where id = p_subgroup_id
  for update;

  if not found then
    raise exception 'Outing sub-group not found.';
  end if;

  if subgroup_leader_id <> auth.uid() then
    raise exception 'Only the outing leader can end this outing.';
  end if;

  if subgroup_status <> 'active' then
    raise exception 'Outing sub-group is already ended.';
  end if;

  update public.outing_subgroups
  set status = 'ended',
      last_activity_at = now()
  where id = p_subgroup_id;

  return query
  select balances.user_id, balances.net_balance_paise
  from public.ledger_balances as balances
  where balances.subgroup_id = p_subgroup_id
    and balances.net_balance_paise <> 0
  order by balances.user_id;
end;
$$;

revoke execute on function public.end_subgroup(uuid) from public, anon;
grant execute on function public.end_subgroup(uuid) to authenticated, service_role;
