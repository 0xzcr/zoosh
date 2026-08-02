-- Compatibility shim for databases that still have the old Stripe column names.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_payout_accounts'
      and column_name = 'stripe_connect_account_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_payout_accounts'
      and column_name = 'razorpay_account_id'
  ) then
    alter table public.user_payout_accounts
      rename column stripe_connect_account_id to razorpay_account_id;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'settlement_payouts'
      and column_name = 'stripe_transfer_id'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'settlement_payouts'
      and column_name = 'razorpay_transfer_id'
  ) then
    alter table public.settlement_payouts
      rename column stripe_transfer_id to razorpay_transfer_id;
  end if;
end
$$;
