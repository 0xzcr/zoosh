create or replace function public.recompute_subgroup_ledger(p_subgroup_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expense_record record;
  participant_count integer;
  base_share_paise bigint;
begin
  perform 1
  from public.outing_subgroups
  where id = p_subgroup_id
  for update;

  if not found then
    raise exception 'Outing sub-group not found.';
  end if;

  delete from public.ledger_balances
  where subgroup_id = p_subgroup_id;

  insert into public.ledger_balances (subgroup_id, user_id, net_balance_paise)
  select p_subgroup_id, subgroup_members.user_id, 0
  from public.subgroup_members
  where subgroup_members.subgroup_id = p_subgroup_id;

  for expense_record in
    select payer_id, total_amount_paise, participants
    from public.expenses
    where subgroup_id = p_subgroup_id
      and voided_at is null
  loop
    participant_count := cardinality(expense_record.participants);

    if participant_count is null or participant_count = 0 then
      continue;
    end if;

    base_share_paise := expense_record.total_amount_paise / participant_count;

    update public.ledger_balances
    set net_balance_paise = net_balance_paise + (base_share_paise * (participant_count - 1))
    where subgroup_id = p_subgroup_id
      and user_id = expense_record.payer_id;

    update public.ledger_balances
    set net_balance_paise = net_balance_paise - base_share_paise
    where subgroup_id = p_subgroup_id
      and user_id = any(expense_record.participants)
      and user_id <> expense_record.payer_id;
  end loop;
end;
$$;

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
    p_description,
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
