-- Atomic, session-scoped reminder claim. Failed delivery still consumes the
-- one-hour window so repeated provider failures cannot become a spam loop.

create or replace function public.claim_settlement_reminder(p_session_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  reminder_uuid uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.settlement_payouts
    where settlement_session_id = p_session_id
      and creditor_id = auth.uid()
  ) then
    raise exception 'Only a creditor in this settlement can send a reminder.';
  end if;

  perform 1
  from public.settlement_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'Settlement session not found.';
  end if;

  if exists (
    select 1
    from public.reminders
    where settlement_session_id = p_session_id
      and kind = 'reminder'
      and sent_at >= now() - interval '1 hour'
  ) then
    raise exception 'A reminder was already sent for this settlement within the last hour.';
  end if;

  insert into public.reminders (settlement_session_id, sent_by, kind, delivery_status)
  values (p_session_id, auth.uid(), 'reminder', 'pending')
  returning id into reminder_uuid;

  return reminder_uuid;
end;
$$;

revoke execute on function public.claim_settlement_reminder(uuid) from public, anon;
grant execute on function public.claim_settlement_reminder(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
