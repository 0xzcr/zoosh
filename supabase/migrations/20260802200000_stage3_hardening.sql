-- Stage 3 hardening: keep expense writes behind authenticated, append-only RPCs.

create or replace function public.confirm_subgroup_expense(
  p_subgroup_id uuid,
  p_payer_id uuid,
  p_total_amount_paise bigint,
  p_description text,
  p_split_type text,
  p_participants uuid[],
  p_source text,
  p_receipt_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  subgroup_status text;
  normalized_participants uuid[];
  expense_id uuid;
begin
  if auth.uid() is null or auth.uid() <> p_payer_id then
    raise exception 'The authenticated user must be the payer.';
  end if;

  if p_total_amount_paise is null or p_total_amount_paise <= 0 then
    raise exception 'Expense amount must be positive.';
  end if;

  if nullif(trim(p_description), '') is null then
    raise exception 'Expense description is required.';
  end if;

  if p_split_type not in ('equal', 'itemized', 'custom') then
    raise exception 'Expense split type is invalid.';
  end if;

  if p_source not in ('text', 'voice', 'receipt') then
    raise exception 'Expense source is invalid.';
  end if;

  select status
  into subgroup_status
  from public.outing_subgroups
  where id = p_subgroup_id
  for update;

  if not found then
    raise exception 'Outing sub-group not found.';
  end if;

  if subgroup_status <> 'active' then
    raise exception 'Outing sub-group is not active.';
  end if;

  if not exists (
    select 1
    from public.subgroup_members
    where subgroup_id = p_subgroup_id
      and user_id = p_payer_id
  ) then
    raise exception 'The payer is not a member of this outing.';
  end if;

  select coalesce(array_agg(distinct participant_id order by participant_id), '{}'::uuid[])
  into normalized_participants
  from unnest(coalesce(p_participants, '{}'::uuid[])) as participant_id;

  if exists (
    select 1
    from unnest(normalized_participants) as participant_id
    where not exists (
      select 1
      from public.subgroup_members
      where subgroup_id = p_subgroup_id
        and user_id = participant_id
    )
  ) then
    raise exception 'Every participant must already belong to the outing.';
  end if;

  if not (p_payer_id = any(normalized_participants)) then
    normalized_participants := array_prepend(p_payer_id, normalized_participants);
    select coalesce(array_agg(distinct participant_id order by participant_id), '{}'::uuid[])
    into normalized_participants
    from unnest(normalized_participants) as participant_id;
  end if;

  if cardinality(normalized_participants) = 0 then
    raise exception 'At least one participant is required.';
  end if;

  insert into public.expenses (
    subgroup_id,
    payer_id,
    total_amount_paise,
    description,
    split_type,
    participants,
    source,
    receipt_url
  )
  values (
    p_subgroup_id,
    p_payer_id,
    p_total_amount_paise,
    trim(p_description),
    p_split_type,
    normalized_participants,
    p_source,
    p_receipt_url
  )
  returning id into expense_id;

  perform public.recompute_subgroup_ledger(p_subgroup_id);

  update public.outing_subgroups
  set last_activity_at = now()
  where id = p_subgroup_id;

  return expense_id;
end;
$$;

create or replace function public.void_subgroup_expense(
  p_subgroup_id uuid,
  p_expense_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  subgroup_status text;
  expense_payer_id uuid;
  existing_voided_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  select status
  into subgroup_status
  from public.outing_subgroups
  where id = p_subgroup_id
  for update;

  if not found then
    raise exception 'Outing sub-group not found.';
  end if;

  if subgroup_status <> 'active' then
    raise exception 'Outing sub-group is not active.';
  end if;

  select payer_id, voided_at
  into expense_payer_id, existing_voided_at
  from public.expenses
  where id = p_expense_id
    and subgroup_id = p_subgroup_id
  for update;

  if not found then
    raise exception 'Expense not found.';
  end if;

  if expense_payer_id <> auth.uid() then
    raise exception 'The authenticated user is not the expense payer.';
  end if;

  if existing_voided_at is not null then
    raise exception 'Expense is already voided.';
  end if;

  update public.expenses
  set voided_at = now(),
      voided_reason = nullif(trim(p_reason), '')
  where id = p_expense_id;

  perform public.recompute_subgroup_ledger(p_subgroup_id);

  update public.outing_subgroups
  set last_activity_at = now()
  where id = p_subgroup_id;
end;
$$;

revoke all on table public.friend_group_members from anon, authenticated;
grant select on table public.friend_group_members to authenticated;

revoke all on table public.expenses from anon, authenticated;
grant select on table public.expenses to authenticated;

revoke all on table public.ledger_balances from anon, authenticated;
grant select on table public.ledger_balances to authenticated;

revoke execute on function public.recompute_subgroup_ledger(uuid) from public, anon, authenticated;
grant execute on function public.recompute_subgroup_ledger(uuid) to service_role;

revoke execute on function public.confirm_subgroup_expense(uuid, uuid, bigint, text, text, uuid[], text, text) from public, anon;
grant execute on function public.confirm_subgroup_expense(uuid, uuid, bigint, text, text, uuid[], text, text) to authenticated, service_role;

revoke execute on function public.void_subgroup_expense(uuid, uuid, text) from public, anon;
grant execute on function public.void_subgroup_expense(uuid, uuid, text) to authenticated, service_role;

drop policy if exists "join a group" on public.friend_group_members;
