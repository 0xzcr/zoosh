-- Stage 5 edge hardening: equal-only ledger writes and a server-side review pause.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'expenses_equal_split_only'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
      add constraint expenses_equal_split_only
      check (split_type = 'equal') not valid;
  end if;
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
  if auth.uid() is null or auth.uid() <> p_payer_id then
    raise exception 'The authenticated user must be the payer.';
  end if;

  if p_total_amount_paise is null or p_total_amount_paise <= 0 then
    raise exception 'Expense amount must be positive.';
  end if;

  if nullif(trim(p_description), '') is null then
    raise exception 'Expense description is required.';
  end if;

  if p_split_type <> 'equal' then
    raise exception 'Only equal expense splits are supported.';
  end if;

  if p_source not in ('text', 'voice', 'receipt') then
    raise exception 'Expense source is invalid.';
  end if;

  select status into subgroup_status
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
    select 1 from public.subgroup_members
    where subgroup_id = p_subgroup_id and user_id = p_payer_id
  ) then
    raise exception 'The payer is not a member of this outing.';
  end if;

  select coalesce(array_agg(distinct participant_id order by participant_id), '{}'::uuid[])
  into normalized_participants
  from unnest(coalesce(p_participants, '{}'::uuid[])) as participant_id;

  if exists (
    select 1 from unnest(normalized_participants) as participant_id
    where not exists (
      select 1 from public.subgroup_members
      where subgroup_id = p_subgroup_id and user_id = participant_id
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
    subgroup_id, payer_id, total_amount_paise, description, split_type,
    participants, source, receipt_url
  ) values (
    p_subgroup_id, p_payer_id, p_total_amount_paise, trim(p_description),
    'equal', normalized_participants, p_source, p_receipt_url
  ) returning id into expense_id;

  perform public.recompute_subgroup_ledger(p_subgroup_id);

  update public.outing_subgroups set last_activity_at = now() where id = p_subgroup_id;
  return expense_id;
end;
$$;

create or replace function public.prepare_subgroup_settlement(p_subgroup_id uuid)
returns table(session_id uuid, debtor_id uuid, total_amount_paise bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  subgroup_status text;
  subgroup_leader_id uuid;
  ended_at timestamptz;
  debtor record;
  creditor record;
  session_uuid uuid;
  transfer_amount_paise bigint;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;

  select status, leader_id, last_activity_at
  into subgroup_status, subgroup_leader_id, ended_at
  from public.outing_subgroups where id = p_subgroup_id for update;

  if not found then raise exception 'Outing sub-group not found.'; end if;
  if subgroup_leader_id <> auth.uid() then raise exception 'Only the outing leader can prepare settlement.'; end if;
  if subgroup_status not in ('ended', 'settled') then raise exception 'Outing must be ended before settlement.'; end if;

  if exists (select 1 from public.settlement_sessions where subgroup_id = p_subgroup_id) then
    return query select sessions.id, sessions.debtor_id, sessions.total_amount_paise
    from public.settlement_sessions sessions where sessions.subgroup_id = p_subgroup_id
    order by sessions.created_at, sessions.id;
    return;
  end if;

  if subgroup_status = 'ended' and now() < ended_at + interval '30 seconds' then
    raise exception 'Review the final balances for 30 seconds before preparing settlement.';
  end if;

  create temporary table settlement_debtors (user_id uuid primary key, remaining_paise bigint not null) on commit drop;
  create temporary table settlement_creditors (user_id uuid primary key, remaining_paise bigint not null) on commit drop;

  insert into settlement_debtors
  select user_id, abs(net_balance_paise) from public.ledger_balances
  where subgroup_id = p_subgroup_id and net_balance_paise < 0;
  insert into settlement_creditors
  select user_id, net_balance_paise from public.ledger_balances
  where subgroup_id = p_subgroup_id and net_balance_paise > 0;

  for debtor in select user_id, remaining_paise from settlement_debtors where remaining_paise > 0 order by remaining_paise desc, user_id loop
    insert into public.settlement_sessions (subgroup_id, debtor_id, total_amount_paise)
    values (p_subgroup_id, debtor.user_id, debtor.remaining_paise) returning id into session_uuid;
    for creditor in select user_id, remaining_paise from settlement_creditors where remaining_paise > 0 order by remaining_paise desc, user_id loop
      transfer_amount_paise := least(debtor.remaining_paise, creditor.remaining_paise);
      if transfer_amount_paise > 0 then
        insert into public.settlement_payouts (settlement_session_id, creditor_id, amount_paise)
        values (session_uuid, creditor.user_id, transfer_amount_paise);
        update settlement_creditors set remaining_paise = remaining_paise - transfer_amount_paise where user_id = creditor.user_id;
        debtor.remaining_paise := debtor.remaining_paise - transfer_amount_paise;
      end if;
      exit when debtor.remaining_paise = 0;
    end loop;
  end loop;

  return query select sessions.id, sessions.debtor_id, sessions.total_amount_paise
  from public.settlement_sessions sessions where sessions.subgroup_id = p_subgroup_id
  order by sessions.created_at, sessions.id;
end;
$$;

revoke execute on function public.confirm_subgroup_expense(uuid, uuid, bigint, text, text, uuid[], text, text) from public, anon;
grant execute on function public.confirm_subgroup_expense(uuid, uuid, bigint, text, text, uuid[], text, text) to authenticated, service_role;
revoke execute on function public.prepare_subgroup_settlement(uuid) from public, anon;
grant execute on function public.prepare_subgroup_settlement(uuid) to authenticated, service_role;
