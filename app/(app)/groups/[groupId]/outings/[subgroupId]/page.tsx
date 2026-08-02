import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, ReceiptText, UsersRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { BalanceSheet } from "@/components/forms/balance-sheet";
import { EndOutingButton } from "@/components/forms/end-outing-button";
import { ExpenseEntryForm } from "@/components/forms/expense-entry-form";
import { SettleAmountsButton } from "@/components/forms/settle-amounts-button";
import { SubgroupJoinForm } from "@/components/forms/subgroup-join-form";
import { ExpenseVoidButton } from "@/components/forms/expense-void-button";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format-currency";
import { summarizePaidSettlementAmounts } from "@/lib/ledger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveUserLabel } from "@/lib/user-label";

export const dynamic = "force-dynamic";

type OutingMembershipRow = {
  subgroup_id: string;
  user_id: string;
  joined_at: string;
};

type BalanceRow = {
  user_id: string;
  net_balance_paise: number;
};

type ExpenseRow = {
  id: string;
  payer_id: string;
  total_amount_paise: number;
  description: string;
  split_type: "equal" | "itemized" | "custom";
  participants: string[];
  source: "text" | "voice" | "receipt";
  created_at: string;
};

type FriendGroupRow = {
  id: string;
  name: string;
};

type OutingSubgroupRow = {
  id: string;
  friend_group_id: string;
  name: string;
  currency: string;
  status: "active" | "ended" | "settled";
  leader_id: string;
  created_at: string;
  last_activity_at: string;
};

type SettlementSessionRow = {
  id: string;
  debtor_id: string;
  total_amount_paise: number;
  status: "pending" | "approved_awaiting_charge" | "charged" | "declined" | "expired";
};

type SettlementPayoutRow = {
  settlement_session_id: string;
  creditor_id: string;
  amount_paise: number;
  status: "pending_payout" | "paid" | "failed";
};

export default async function OutingPage({ params }: { params: Promise<{ groupId: string; subgroupId: string }> }) {
  const { groupId, subgroupId } = await params;
  if (!groupId || !subgroupId) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/groups/${groupId}/outings/${subgroupId}`);
  }

  const admin = createSupabaseAdminClient() as any;
  const [{ data: groupData }, { data: subgroupData }, { data: membershipsData }, { data: balanceData }, { data: expensesData }, { data: settlementData }, { data: leaderInactiveData }] = await Promise.all([
    admin.from("friend_groups").select("id, name").eq("id", groupId).maybeSingle(),
    admin
      .from("outing_subgroups")
      .select("id, friend_group_id, name, currency, status, leader_id, created_at, last_activity_at")
      .eq("id", subgroupId)
      .eq("friend_group_id", groupId)
      .maybeSingle(),
    admin.from("subgroup_members").select("subgroup_id, user_id, joined_at").eq("subgroup_id", subgroupId),
    admin.from("ledger_balances").select("user_id, net_balance_paise").eq("subgroup_id", subgroupId),
    admin
      .from("expenses")
      .select("id, payer_id, total_amount_paise, description, split_type, participants, source, created_at")
      .eq("subgroup_id", subgroupId)
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
    admin
      .from("settlement_sessions")
      .select("id, debtor_id, total_amount_paise, status")
      .eq("subgroup_id", subgroupId)
      .order("created_at", { ascending: true }),
    admin.rpc("is_subgroup_leader_inactive", { p_subgroup_id: subgroupId }),
  ]);

  const settlementIds = ((settlementData ?? []) as Array<{ id: string }>).map((session) => session.id);
  const { data: payoutData } = settlementIds.length
    ? await admin
        .from("settlement_payouts")
        .select("settlement_session_id, creditor_id, amount_paise, status")
        .in("settlement_session_id", settlementIds)
    : { data: [] as SettlementPayoutRow[] };

  const group = groupData as FriendGroupRow | null;
  const subgroup = subgroupData as OutingSubgroupRow | null;
  const memberships = (membershipsData ?? []) as OutingMembershipRow[];
  const balanceRows = (balanceData ?? []) as BalanceRow[];
  const expenses = (expensesData ?? []) as ExpenseRow[];
  const settlementSessions = (settlementData ?? []) as SettlementSessionRow[];
  const settlementPayouts = (payoutData ?? []) as SettlementPayoutRow[];
  const { paidDebtorAmounts, paidCreditorAmounts } = summarizePaidSettlementAmounts({
    sessions: settlementSessions.map((session) => ({ id: session.id, debtorId: session.debtor_id })),
    payouts: settlementPayouts.map((payout) => ({
      settlementSessionId: payout.settlement_session_id,
      creditorId: payout.creditor_id,
      amountPaise: payout.amount_paise,
      status: payout.status,
    })),
  });

  if (!group || !subgroup) {
    notFound();
  }

  const currentUserMember = memberships.some((membership) => membership.user_id === user.id);
  const leaderInactive = leaderInactiveData === true;
  const memberLabels = await Promise.all(
    memberships.map(async (membership) => ({
      ...membership,
      label: await resolveUserLabel(membership.user_id),
    })),
  );

  const memberLabelById = new Map(memberLabels.map((member) => [member.user_id, member.label] as const));
  const expenseSummaries = await Promise.all(
    expenses.map(async (expense) => ({
      ...expense,
      payerLabel: memberLabelById.get(expense.payer_id) ?? (await resolveUserLabel(expense.payer_id)),
    })),
  );
  const settlementSummaries = await Promise.all(
    settlementSessions.map(async (session) => ({
      ...session,
      debtorLabel: memberLabelById.get(session.debtor_id) ?? (await resolveUserLabel(session.debtor_id)),
    })),
  );

  return (
    <AppShell>
      <Link href={`/groups/${groupId}`} className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to group
      </Link>

      <section className="mt-8 grid gap-6 lg:grid-cols-[1.08fr_.92fr]">
        <div className="section-frame rounded-[1.75rem] p-6 sm:p-8">
          <p className="eyebrow">{subgroup.status === "active" ? "Active outing" : "Final balance review"}</p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl tracking-[-0.06em]">{subgroup.name}</h1>
          <p className="mt-2 text-sm text-[color:var(--muted)]">
            {subgroup.leader_id === user.id ? "You are the outing leader." : `${await resolveUserLabel(subgroup.leader_id)} is the outing leader.`}
          </p>

          <div className="mt-6 flex flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--surface-strong)] px-4 py-2 font-medium text-[color:var(--foreground)]">
              <CalendarDays className="size-4 text-[color:var(--accent)]" aria-hidden="true" />
              Outing details
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--surface-strong)] px-4 py-2 font-medium text-[color:var(--foreground)]">
              Currency {subgroup.currency}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[color:var(--surface-strong)] px-4 py-2 font-medium text-[color:var(--foreground)]">
              Status {subgroup.status}
            </span>
          </div>

          {!currentUserMember ? (
            <div className="mt-6 max-w-xl">
              <p className="text-sm leading-6 text-[color:var(--muted)]">Join this outing from the group you already belong to.</p>
              <SubgroupJoinForm groupId={groupId} subgroupId={subgroup.id} />
            </div>
          ) : subgroup.status !== "active" ? (
            <p className="mt-6 max-w-xl text-sm leading-6 text-[color:var(--muted)]">
              This outing is ended. Review the final balances below before the settlement step.
            </p>
          ) : (
            <div className="mt-6 space-y-5">
              <div>
                <Button disabled>
                  <UsersRound className="size-4" aria-hidden="true" />
                  You are in this outing
                </Button>
              </div>
              <ExpenseEntryForm subgroupId={subgroup.id} subgroupName={subgroup.name} currency={subgroup.currency} members={memberLabels} />
            </div>
          )}

          {subgroup.status === "active" && (subgroup.leader_id === user.id || (leaderInactive && currentUserMember)) ? (
            <div className="mt-6 border-t border-[color:var(--line)] pt-5">
              <p className="mb-3 text-sm leading-6 text-[color:var(--muted)]">Ending locks the ledger and opens the final balance review.{subgroup.leader_id !== user.id ? " The leader has been inactive for 30 days, so members can close this outing." : ""}</p>
              <EndOutingButton subgroupId={subgroup.id} />
            </div>
          ) : null}

          {subgroup.status !== "active" ? (
            <section className="mt-6 border-t border-[color:var(--line)] pt-5">
              <p className="eyebrow">Settlement</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">Settle the final amounts</h2>
              <Link href={`/groups/${groupId}/outings/${subgroup.id}/report`} className="mt-3 inline-flex text-sm font-semibold text-[color:var(--accent-light)] underline underline-offset-4">View expense report</Link>
              {settlementSummaries.length === 0 ? (
                <div className="mt-4 space-y-4">
                  <p className="text-sm leading-6 text-[color:var(--muted)]">The final balances are ready. The outing creator can prepare one settlement request per debtor.</p>
                  {subgroup.leader_id === user.id ? <SettleAmountsButton subgroupId={subgroup.id} /> : <p className="text-sm font-medium text-[color:var(--muted)]">Waiting for the outing creator to prepare settlement.</p>}
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <p className="text-sm leading-6 text-[color:var(--muted)]">Settlement amounts are prepared for review.</p>
                  {settlementSummaries.map((session) => (
                    <div key={session.id} className="flex items-center justify-between gap-4 border-b border-[color:var(--line)] py-3 text-sm last:border-b-0">
                      {session.debtor_id === user.id ? <Link href={`/settlements/${session.id}`} className="font-medium text-[color:var(--accent-light)] underline underline-offset-4">{session.debtorLabel} · review payment</Link> : settlementPayouts.some((payout) => payout.settlement_session_id === session.id && payout.creditor_id === user.id) ? <Link href={`/settlements/${session.id}`} className="font-medium text-[color:var(--accent-light)] underline underline-offset-4">{session.debtorLabel} · view request</Link> : <span className="font-medium text-[color:var(--foreground)]">{session.debtorLabel}</span>}
                      <span className="text-[color:var(--muted)]">{formatCurrency(session.total_amount_paise, subgroup.currency)} · {session.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <BalanceSheet
            members={memberLabels}
            balances={balanceRows}
            currency={subgroup.currency}
            hideZeroBalances={subgroup.status !== "active"}
            paidDebtorAmounts={[...paidDebtorAmounts].map(([user_id, net_balance_paise]) => ({ user_id, net_balance_paise }))}
            paidCreditorAmounts={[...paidCreditorAmounts].map(([user_id, net_balance_paise]) => ({ user_id, net_balance_paise }))}
          />

          <section className="border-y border-[color:var(--line)] py-6 sm:py-8">
            <div className="flex items-center gap-2">
              <ReceiptText className="size-5 text-[color:var(--accent)]" aria-hidden="true" />
              <p className="eyebrow">Expense log</p>
            </div>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <p className="text-sm text-[color:var(--muted)]">{expenses.length} {expenses.length === 1 ? "entry" : "entries"}</p>
            </div>
            {expenseSummaries.length > 0 ? (
              <ul className="mt-5 border-t border-[color:var(--line)]">
                {expenseSummaries.map((expense) => (
                  <li key={expense.id} className="border-b border-[color:var(--line)] py-4 text-sm last:border-b-0">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="font-medium text-[color:var(--foreground)]">{expense.description}</span>
                        {subgroup.status === "active" && expense.payer_id === user.id ? (
                          <ExpenseVoidButton subgroupId={subgroup.id} expenseId={expense.id} />
                        ) : null}
                      </div>
                      <span className="text-[color:var(--muted)]">{formatCurrency(expense.total_amount_paise, subgroup.currency)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[color:var(--muted)]">
                      <span>{expense.payerLabel}</span>
                      <span aria-hidden="true">•</span>
                      <span>{expense.split_type}</span>
                      <span aria-hidden="true">•</span>
                      <span>{expense.participants.length} participants</span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-5 border-t border-[color:var(--line)] pt-5 text-sm leading-6 text-[color:var(--muted)]">
                No expenses logged yet.
              </p>
            )}
          </section>
        </div>
      </section>
    </AppShell>
  );
}
