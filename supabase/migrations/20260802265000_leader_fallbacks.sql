-- Keep active outings operable when a leader leaves a group or subgroup.

create or replace function public.promote_active_subgroup_leader_after_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  subgroup_record record;
  replacement_user_id uuid;
begin
  for subgroup_record in
    select id
    from public.outing_subgroups
    where status = 'active'
      and leader_id = old.user_id
      and (
        (tg_table_name = 'friend_group_members' and friend_group_id = old.friend_group_id)
        or (tg_table_name = 'subgroup_members' and id = old.subgroup_id)
      )
  loop
    select members.user_id
    into replacement_user_id
    from public.subgroup_members members
    where members.subgroup_id = subgroup_record.id
      and members.user_id <> old.user_id
    order by members.joined_at, members.user_id
    limit 1;

    if replacement_user_id is not null then
      update public.outing_subgroups
      set leader_id = replacement_user_id,
          last_activity_at = now()
      where id = subgroup_record.id
        and status = 'active'
        and leader_id = old.user_id;
    end if;
  end loop;
  return old;
end;
$$;

drop trigger if exists promote_subgroup_leader_after_group_leave on public.friend_group_members;
create trigger promote_subgroup_leader_after_group_leave
after delete on public.friend_group_members
for each row execute function public.promote_active_subgroup_leader_after_leave();

drop trigger if exists promote_subgroup_leader_after_subgroup_leave on public.subgroup_members;
create trigger promote_subgroup_leader_after_subgroup_leave
after delete on public.subgroup_members
for each row execute function public.promote_active_subgroup_leader_after_leave();

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
      select 1 from public.subgroup_members
      where subgroup_id = p_subgroup_id and user_id = auth.uid()
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
