-- Keep rounding remainder in the payer's own share, not in net balance.

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
