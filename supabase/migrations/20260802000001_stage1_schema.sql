create extension if not exists pgcrypto;

-- Core groups and membership
create table friend_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table friend_group_members (
  friend_group_id uuid not null references friend_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  joined_at timestamptz not null default now(),
  primary key (friend_group_id, user_id)
);

-- Outings and invite codes used by the Stage 1/2 flows
create table user_payout_accounts (
  user_id uuid primary key references auth.users(id),
  razorpay_account_id text,
  onboarding_complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table outing_subgroups (
  id uuid primary key default gen_random_uuid(),
  friend_group_id uuid not null references friend_groups(id) on delete cascade,
  name text not null,
  currency text not null default 'INR',
  status text not null check (status in ('active', 'ended', 'settled')) default 'active',
  leader_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create table subgroup_members (
  subgroup_id uuid not null references outing_subgroups(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  joined_at timestamptz not null default now(),
  primary key (subgroup_id, user_id)
);

create table invites (
  code text primary key,
  friend_group_id uuid not null references friend_groups(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Expense, ledger, settlement, and reminder tables required by later stages
create table expenses (
  id uuid primary key default gen_random_uuid(),
  subgroup_id uuid not null references outing_subgroups(id) on delete cascade,
  payer_id uuid not null references auth.users(id),
  total_amount_paise bigint not null check (total_amount_paise > 0),
  description text not null,
  split_type text not null check (split_type in ('equal', 'itemized', 'custom')),
  participants uuid[] not null,
  source text not null check (source in ('text', 'voice', 'receipt')),
  receipt_url text,
  voided_at timestamptz,
  voided_reason text,
  created_at timestamptz not null default now()
);

create table ledger_balances (
  subgroup_id uuid not null references outing_subgroups(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  net_balance_paise bigint not null default 0,
  primary key (subgroup_id, user_id)
);

create table settlement_sessions (
  id uuid primary key default gen_random_uuid(),
  subgroup_id uuid not null references outing_subgroups(id) on delete cascade,
  debtor_id uuid not null references auth.users(id),
  total_amount_paise bigint not null,
  prava_session_id text,
  status text not null check (status in ('pending', 'approved_awaiting_charge', 'charged', 'declined', 'expired')) default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table settlement_payouts (
  id uuid primary key default gen_random_uuid(),
  settlement_session_id uuid not null references settlement_sessions(id) on delete cascade,
  creditor_id uuid not null references auth.users(id),
  amount_paise bigint not null,
  status text not null check (status in ('pending_payout', 'paid', 'failed')) default 'pending_payout',
  razorpay_transfer_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table reminders (
  id uuid primary key default gen_random_uuid(),
  settlement_session_id uuid not null references settlement_sessions(id) on delete cascade,
  sent_by uuid not null references auth.users(id),
  sent_at timestamptz not null default now()
);

create index on expenses (subgroup_id, created_at desc) where voided_at is null;
create index on settlement_sessions (subgroup_id, status);
create index on settlement_payouts (settlement_session_id, status);
create index on reminders (settlement_session_id, sent_at desc);

-- Helper functions to avoid recursive RLS evaluation
create function is_friend_group_member(check_group_id uuid) returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.friend_group_members
    where friend_group_id = check_group_id
      and user_id = auth.uid()
  );
$$;

create function is_subgroup_member(check_subgroup_id uuid) returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.subgroup_members
    where subgroup_id = check_subgroup_id
      and user_id = auth.uid()
  );
$$;

create function can_join_subgroup(check_subgroup_id uuid) returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.outing_subgroups
    where id = check_subgroup_id
      and friend_group_id in (
        select friend_group_id
        from public.friend_group_members
        where user_id = auth.uid()
      )
  );
$$;

create function is_settlement_session_debtor(check_session_id uuid) returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.settlement_sessions
    where id = check_session_id
      and debtor_id = auth.uid()
  );
$$;

create function is_settlement_session_creditor(check_session_id uuid) returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from public.settlement_payouts
    where settlement_session_id = check_session_id
      and creditor_id = auth.uid()
  );
$$;

create function is_settlement_session_participant(check_session_id uuid) returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select is_settlement_session_debtor(check_session_id)
    or is_settlement_session_creditor(check_session_id);
$$;

alter table friend_groups enable row level security;
alter table friend_group_members enable row level security;
alter table user_payout_accounts enable row level security;
alter table outing_subgroups enable row level security;
alter table subgroup_members enable row level security;
alter table invites enable row level security;
alter table expenses enable row level security;
alter table ledger_balances enable row level security;
alter table settlement_sessions enable row level security;
alter table settlement_payouts enable row level security;
alter table reminders enable row level security;

create policy "read own friend groups" on friend_groups for select
  using (is_friend_group_member(id));

create policy "create friend groups" on friend_groups for insert
  with check (created_by = auth.uid());

create policy "read group membership" on friend_group_members for select
  using (is_friend_group_member(friend_group_id));

create policy "join a group" on friend_group_members for insert
  with check (user_id = auth.uid());

create policy "read subgroups in my groups" on outing_subgroups for select
  using (is_friend_group_member(friend_group_id));

create policy "create subgroup in my group" on outing_subgroups for insert
  with check (
    leader_id = auth.uid()
    and is_friend_group_member(friend_group_id)
  );

create policy "leader updates subgroup" on outing_subgroups for update
  using (leader_id = auth.uid());

create policy "read subgroup membership" on subgroup_members for select
  using (is_subgroup_member(subgroup_id));

create policy "join a subgroup" on subgroup_members for insert
  with check (
    user_id = auth.uid()
    and can_join_subgroup(subgroup_id)
  );

create policy "read invite by code" on invites for select
  using (true);

create policy "create invite for my group" on invites for insert
  with check (is_friend_group_member(friend_group_id));

create policy "read own payout account" on user_payout_accounts for select
  using (user_id = auth.uid());

create policy "manage own payout account" on user_payout_accounts for insert
  with check (user_id = auth.uid());

create policy "update own payout account" on user_payout_accounts for update
  using (user_id = auth.uid());

create policy "read expenses in my subgroups" on expenses for select
  using (is_subgroup_member(subgroup_id));

create policy "log an expense" on expenses for insert
  with check (
    payer_id = auth.uid()
    and is_subgroup_member(subgroup_id)
  );

create policy "payer voids own expense" on expenses for update
  using (payer_id = auth.uid());

create policy "read balances in my subgroups" on ledger_balances for select
  using (is_subgroup_member(subgroup_id));

create policy "read own settlement sessions" on settlement_sessions for select
  using (is_settlement_session_participant(id));

create policy "read own payouts" on settlement_payouts for select
  using (is_settlement_session_participant(settlement_session_id));

create policy "read reminders on my settlements" on reminders for select
  using (is_settlement_session_participant(settlement_session_id));

create policy "send a reminder" on reminders for insert
  with check (
    sent_by = auth.uid()
    and is_settlement_session_creditor(settlement_session_id)
  );
