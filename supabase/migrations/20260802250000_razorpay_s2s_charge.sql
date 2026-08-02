-- Razorpay S2S charge state and a short-lived claim to prevent duplicate charges.

alter table public.settlement_sessions
  add column if not exists provider_order_id text,
  add column if not exists charge_started_at timestamptz,
  add column if not exists charge_attempts integer not null default 0,
  add column if not exists provider_callback_verified_at timestamptz;

create index if not exists settlement_sessions_charge_claim_idx
  on public.settlement_sessions (charge_started_at)
  where status = 'approved_awaiting_charge';

create or replace function public.claim_settlement_charge(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  update public.settlement_sessions
  set charge_started_at = now(),
      charge_attempts = charge_attempts + 1,
      failure_reason = null,
      updated_at = now()
  where id = p_session_id
    and status = 'approved_awaiting_charge'
    and (
      charge_started_at is null
      or charge_started_at < now() - interval '10 minutes'
    )
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.release_settlement_charge(
  p_session_id uuid,
  p_failure_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.settlement_sessions
  set charge_started_at = null,
      failure_reason = nullif(trim(p_failure_reason), ''),
      updated_at = now()
  where id = p_session_id
    and status = 'approved_awaiting_charge';
end;
$$;

create or replace function public.mark_settlement_session_charged(
  p_session_id uuid,
  p_provider_payment_id text,
  p_provider_transaction_ref text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.settlement_sessions
  set status = 'charged',
      provider_payment_id = p_provider_payment_id,
      provider_transaction_ref = p_provider_transaction_ref,
      charge_started_at = null,
      paid_at = coalesce(paid_at, now()),
      updated_at = now(),
      failure_reason = null
  where id = p_session_id
    and status = 'approved_awaiting_charge';

  if not found then
    raise exception 'Settlement session is not chargeable or does not exist.';
  end if;
end;
$$;

create or replace function public.mark_settlement_session_declined(
  p_session_id uuid,
  p_failure_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.settlement_sessions
  set status = 'declined',
      charge_started_at = null,
      failure_reason = nullif(trim(p_failure_reason), ''),
      updated_at = now()
  where id = p_session_id
    and status in ('pending', 'approved_awaiting_charge');
end;
$$;

revoke execute on function public.claim_settlement_charge(uuid) from public, anon, authenticated;
revoke execute on function public.release_settlement_charge(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_settlement_charge(uuid) to service_role;
grant execute on function public.release_settlement_charge(uuid, text) to service_role;

notify pgrst, 'reload schema';
