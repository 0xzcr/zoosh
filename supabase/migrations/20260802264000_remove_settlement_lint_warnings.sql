-- Remove shadowed loop declarations from the final settlement matcher.

create or replace function public.prepare_subgroup_settlement(p_subgroup_id uuid)
returns table(session_id uuid, debtor_id uuid, total_amount_paise bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  subgroup_status text;
  subgroup_leader_id uuid;
  debtor_ids uuid[];
  debtor_remaining bigint[];
  creditor_ids uuid[];
  creditor_remaining bigint[];
  session_uuid uuid;
  transfer_amount_paise bigint;
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;

  select status, leader_id into subgroup_status, subgroup_leader_id
  from public.outing_subgroups where id = p_subgroup_id for update;
  if not found then raise exception 'Outing sub-group not found.'; end if;
  if subgroup_leader_id <> auth.uid() then raise exception 'Only the outing leader can prepare settlement.'; end if;
  if subgroup_status not in ('ended', 'settled') then raise exception 'Outing must be ended before settlement.'; end if;

  if exists (select 1 from public.settlement_sessions where subgroup_id = p_subgroup_id) then
    return query
    select sessions.id, sessions.debtor_id, sessions.total_amount_paise
    from public.settlement_sessions sessions
    where sessions.subgroup_id = p_subgroup_id
    order by sessions.created_at, sessions.id;
    return;
  end if;

  select
    coalesce(array_agg(balances.user_id order by abs(balances.net_balance_paise) desc, balances.user_id) filter (where balances.net_balance_paise < 0), '{}'::uuid[]),
    coalesce(array_agg(abs(balances.net_balance_paise) order by abs(balances.net_balance_paise) desc, balances.user_id) filter (where balances.net_balance_paise < 0), '{}'::bigint[]),
    coalesce(array_agg(balances.user_id order by balances.net_balance_paise desc, balances.user_id) filter (where balances.net_balance_paise > 0), '{}'::uuid[]),
    coalesce(array_agg(balances.net_balance_paise order by balances.net_balance_paise desc, balances.user_id) filter (where balances.net_balance_paise > 0), '{}'::bigint[])
  into debtor_ids, debtor_remaining, creditor_ids, creditor_remaining
  from public.ledger_balances balances
  where balances.subgroup_id = p_subgroup_id;

  for debtor_index in 1..coalesce(array_length(debtor_ids, 1), 0) loop
    insert into public.settlement_sessions (subgroup_id, debtor_id, total_amount_paise)
    values (p_subgroup_id, debtor_ids[debtor_index], debtor_remaining[debtor_index]) returning id into session_uuid;
    for creditor_index in 1..coalesce(array_length(creditor_ids, 1), 0) loop
      if creditor_remaining[creditor_index] > 0 and debtor_remaining[debtor_index] > 0 then
        transfer_amount_paise := least(debtor_remaining[debtor_index], creditor_remaining[creditor_index]);
        insert into public.settlement_payouts (settlement_session_id, creditor_id, amount_paise)
        values (session_uuid, creditor_ids[creditor_index], transfer_amount_paise);
        debtor_remaining[debtor_index] := debtor_remaining[debtor_index] - transfer_amount_paise;
        creditor_remaining[creditor_index] := creditor_remaining[creditor_index] - transfer_amount_paise;
      end if;
      exit when debtor_remaining[debtor_index] = 0;
    end loop;
  end loop;

  return query
  select sessions.id, sessions.debtor_id, sessions.total_amount_paise
  from public.settlement_sessions sessions where sessions.subgroup_id = p_subgroup_id
  order by sessions.created_at, sessions.id;
end;
$$;

revoke execute on function public.prepare_subgroup_settlement(uuid) from public, anon;
grant execute on function public.prepare_subgroup_settlement(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
