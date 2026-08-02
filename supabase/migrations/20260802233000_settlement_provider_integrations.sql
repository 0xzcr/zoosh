-- Provider state for one-payment-per-debtor settlement flows.

alter table public.settlement_sessions
  add column if not exists prava_session_token text,
  add column if not exists prava_iframe_url text,
  add column if not exists prava_expires_at timestamptz,
  add column if not exists provider_payment_id text,
  add column if not exists provider_transaction_ref text,
  add column if not exists payment_started_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists failure_reason text;

alter table public.settlement_payouts
  add column if not exists paid_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists attempts integer not null default 0;

alter table public.reminders
  add column if not exists kind text not null default 'reminder',
  add column if not exists linq_message_id text,
  add column if not exists email_message_id text,
  add column if not exists delivery_status text not null default 'pending';

alter table public.reminders
  drop constraint if exists reminders_kind_check;

alter table public.reminders
  add constraint reminders_kind_check check (kind in ('initial', 'reminder'));

alter table public.reminders
  drop constraint if exists reminders_delivery_status_check;

alter table public.reminders
  add constraint reminders_delivery_status_check check (delivery_status in ('pending', 'sent', 'partial', 'failed'));

create unique index if not exists settlement_sessions_subgroup_debtor_key
  on public.settlement_sessions (subgroup_id, debtor_id);

create unique index if not exists settlement_payouts_session_creditor_key
  on public.settlement_payouts (settlement_session_id, creditor_id);

create unique index if not exists reminders_initial_session_key
  on public.reminders (settlement_session_id)
  where kind = 'initial';

create table if not exists public.notification_contacts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text,
  updated_at timestamptz not null default now(),
  constraint notification_contacts_phone_check check (
    phone_e164 is null or phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'
  )
);

create table if not exists public.settlement_webhook_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

alter table public.notification_contacts enable row level security;
alter table public.settlement_webhook_events enable row level security;

drop policy if exists "update own payout account" on public.user_payout_accounts;
create policy "update own payout account" on public.user_payout_accounts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "leader updates subgroup" on public.outing_subgroups;
create policy "leader updates subgroup" on public.outing_subgroups for update
  to authenticated
  using (leader_id = auth.uid())
  with check (leader_id = auth.uid());

create policy "read own notification contact" on public.notification_contacts for select
  to authenticated
  using (user_id = auth.uid());

create policy "manage own notification contact" on public.notification_contacts for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "update own notification contact" on public.notification_contacts for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on table public.settlement_webhook_events from anon, authenticated;
grant select, insert, update on table public.notification_contacts to authenticated;
grant all on table public.notification_contacts, public.settlement_webhook_events to service_role;

revoke all on table public.settlement_sessions, public.settlement_payouts, public.reminders from anon;
grant select on table public.settlement_sessions, public.settlement_payouts, public.reminders to authenticated;

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
      failure_reason = nullif(trim(p_failure_reason), ''),
      updated_at = now()
  where id = p_session_id
    and status in ('pending', 'approved_awaiting_charge');
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
      paid_at = coalesce(paid_at, now()),
      updated_at = now(),
      failure_reason = null
  where id = p_payout_id
    and status = 'pending_payout'
  returning settlement_session_id into session_uuid;

  if found then
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

revoke execute on function public.mark_settlement_session_charged(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.mark_settlement_session_declined(uuid, text) from public, anon, authenticated;
revoke execute on function public.mark_settlement_payout_paid(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_settlement_session_charged(uuid, text, text) to service_role;
grant execute on function public.mark_settlement_session_declined(uuid, text) to service_role;
grant execute on function public.mark_settlement_payout_paid(uuid, text) to service_role;

notify pgrst, 'reload schema';
