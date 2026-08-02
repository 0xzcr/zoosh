-- Stage 5.3 foundation: create idempotent settlement sessions from final balances.

create or replace function public.prepare_subgroup_settlement(p_subgroup_id uuid)
returns table(session_id uuid, debtor_id uuid, total_amount_paise bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  subgroup_status text;
  subgroup_leader_id uuid;
  debtor record;
  creditor record;
  session_uuid uuid;
  transfer_amount_paise bigint;
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
    raise exception 'Only the outing leader can prepare settlement.';
  end if;

  if subgroup_status not in ('ended', 'settled') then
    raise exception 'Outing must be ended before settlement.';
  end if;

  if exists (select 1 from public.settlement_sessions where subgroup_id = p_subgroup_id) then
    return query
    select sessions.id, sessions.debtor_id, sessions.total_amount_paise
    from public.settlement_sessions as sessions
    where sessions.subgroup_id = p_subgroup_id
    order by sessions.created_at, sessions.id;
    return;
  end if;

  create temporary table settlement_debtors (
    user_id uuid primary key,
    remaining_paise bigint not null
  ) on commit drop;

  create temporary table settlement_creditors (
    user_id uuid primary key,
    remaining_paise bigint not null
  ) on commit drop;

  insert into settlement_debtors (user_id, remaining_paise)
  select user_id, abs(net_balance_paise)
  from public.ledger_balances
  where subgroup_id = p_subgroup_id
    and net_balance_paise < 0;

  insert into settlement_creditors (user_id, remaining_paise)
  select user_id, net_balance_paise
  from public.ledger_balances
  where subgroup_id = p_subgroup_id
    and net_balance_paise > 0;

  for debtor in
    select user_id, remaining_paise
    from settlement_debtors
    where remaining_paise > 0
    order by remaining_paise desc, user_id
  loop
    insert into public.settlement_sessions (subgroup_id, debtor_id, total_amount_paise)
    values (p_subgroup_id, debtor.user_id, debtor.remaining_paise)
    returning id into session_uuid;

    for creditor in
      select user_id, remaining_paise
      from settlement_creditors
      where remaining_paise > 0
      order by remaining_paise desc, user_id
    loop
      transfer_amount_paise := least(debtor.remaining_paise, creditor.remaining_paise);

      if transfer_amount_paise > 0 then
        insert into public.settlement_payouts (settlement_session_id, creditor_id, amount_paise)
        values (session_uuid, creditor.user_id, transfer_amount_paise);

        update settlement_creditors
        set remaining_paise = remaining_paise - transfer_amount_paise
        where user_id = creditor.user_id;

        debtor.remaining_paise := debtor.remaining_paise - transfer_amount_paise;
      end if;

      exit when debtor.remaining_paise = 0;
    end loop;
  end loop;

  return query
  select sessions.id, sessions.debtor_id, sessions.total_amount_paise
  from public.settlement_sessions as sessions
  where sessions.subgroup_id = p_subgroup_id
  order by sessions.created_at, sessions.id;
end;
$$;

revoke execute on function public.prepare_subgroup_settlement(uuid) from public, anon;
grant execute on function public.prepare_subgroup_settlement(uuid) to authenticated, service_role;
