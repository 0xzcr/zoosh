-- Prevent concurrent callback/retry workers from creating duplicate payment transfers.

alter table public.settlement_payouts
  add column if not exists payout_started_at timestamptz;

create index if not exists settlement_payouts_claim_idx
  on public.settlement_payouts (payout_started_at)
  where status = 'pending_payout';

create or replace function public.claim_settlement_payout(p_payout_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  update public.settlement_payouts
  set payout_started_at = now(),
      attempts = attempts + 1,
      updated_at = now()
  where id = p_payout_id
    and status = 'pending_payout'
    and razorpay_transfer_id is null
    and (
      payout_started_at is null
      or payout_started_at < now() - interval '10 minutes'
    )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.mark_settlement_payout_paid(
  p_payout_id uuid,
  p_transfer_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  session_uuid uuid;
  subgroup_uuid uuid;
begin
  update public.settlement_payouts
  set status = 'paid',
      razorpay_transfer_id = p_transfer_id,
      payout_started_at = null,
      paid_at = coalesce(paid_at, now()),
      updated_at = now(),
      failure_reason = null
  where id = p_payout_id
    and status = 'pending_payout';

  if found then
    select settlement_session_id into session_uuid
    from public.settlement_payouts
    where id = p_payout_id;

    select subgroup_id into subgroup_uuid
    from public.settlement_sessions
    where id = session_uuid;

    if not exists (
      select 1
      from public.settlement_payouts
      where settlement_session_id in (
        select id from public.settlement_sessions where subgroup_id = subgroup_uuid
      )
      and status <> 'paid'
    ) and not exists (
      select 1
      from public.settlement_sessions
      where subgroup_id = subgroup_uuid
        and status <> 'charged'
    ) then
      update public.outing_subgroups
      set status = 'settled', last_activity_at = now()
      where id = subgroup_uuid
        and status = 'ended';
    end if;
  end if;

  return found;
end;
$$;

revoke execute on function public.claim_settlement_payout(uuid) from public, anon, authenticated;
grant execute on function public.claim_settlement_payout(uuid) to service_role;

notify pgrst, 'reload schema';
