-- Use table-specific trigger functions so each OLD record only reads fields
-- that exist on the table which fired the trigger.

create or replace function public.promote_active_subgroup_leader_after_group_leave()
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
      and friend_group_id = old.friend_group_id
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

create or replace function public.promote_active_subgroup_leader_after_subgroup_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  replacement_user_id uuid;
begin
  if exists (
    select 1
    from public.outing_subgroups
    where id = old.subgroup_id
      and status = 'active'
      and leader_id = old.user_id
  ) then
    select members.user_id
    into replacement_user_id
    from public.subgroup_members members
    where members.subgroup_id = old.subgroup_id
      and members.user_id <> old.user_id
    order by members.joined_at, members.user_id
    limit 1;

    if replacement_user_id is not null then
      update public.outing_subgroups
      set leader_id = replacement_user_id,
          last_activity_at = now()
      where id = old.subgroup_id
        and status = 'active'
        and leader_id = old.user_id;
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists promote_subgroup_leader_after_group_leave on public.friend_group_members;
create trigger promote_subgroup_leader_after_group_leave
after delete on public.friend_group_members
for each row execute function public.promote_active_subgroup_leader_after_group_leave();

drop trigger if exists promote_subgroup_leader_after_subgroup_leave on public.subgroup_members;
create trigger promote_subgroup_leader_after_subgroup_leave
after delete on public.subgroup_members
for each row execute function public.promote_active_subgroup_leader_after_subgroup_leave();

drop function if exists public.promote_active_subgroup_leader_after_leave();

notify pgrst, 'reload schema';
