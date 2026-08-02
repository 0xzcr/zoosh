import { Coins } from "lucide-react";

import { formatCurrency } from "@/lib/format-currency";
import { applyPaidSettlementAmounts } from "@/lib/ledger";

type BalanceMember = {
  user_id: string;
  label: string;
};

type BalanceRow = {
  user_id: string;
  net_balance_paise: number;
};

type BalanceSheetProps = {
  members: BalanceMember[];
  balances: BalanceRow[];
  currency: string;
  hideZeroBalances?: boolean;
  paidDebtorAmounts?: BalanceRow[];
  paidCreditorAmounts?: BalanceRow[];
};

export function BalanceSheet({ members, balances, currency, hideZeroBalances = false, paidDebtorAmounts = [], paidCreditorAmounts = [] }: BalanceSheetProps) {
  const balanceByUserId = new Map(balances.map((balance) => [balance.user_id, balance.net_balance_paise] as const));
  const paidDebtorByUserId = new Map(paidDebtorAmounts.map((balance) => [balance.user_id, balance.net_balance_paise] as const));
  const paidCreditorByUserId = new Map(paidCreditorAmounts.map((balance) => [balance.user_id, balance.net_balance_paise] as const));
  const displayBalanceByUserId = applyPaidSettlementAmounts(
    members.map((member) => ({ userId: member.user_id, netBalancePaise: balanceByUserId.get(member.user_id) ?? 0 })),
    paidDebtorByUserId,
    paidCreditorByUserId,
  );
  const visibleMembers = hideZeroBalances
    ? members.filter((member) => (displayBalanceByUserId.get(member.user_id) ?? 0) !== 0)
    : members;

  return (
    <section className="section-frame rounded-[1.75rem] p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Coins className="size-5 text-[color:var(--accent)]" aria-hidden="true" />
        <p className="eyebrow">Balances</p>
      </div>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">
        {visibleMembers.length} {visibleMembers.length === 1 ? "person" : "people"} {hideZeroBalances ? "still to settle" : "in this outing"}
      </h2>
      <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
        The ledger stays historical. Payment status below shows what has already been paid or received.
      </p>
      <ul className="mt-5 space-y-3">
        {visibleMembers.map((member) => {
          const balance = displayBalanceByUserId.get(member.user_id) ?? 0;
          const originalBalance = balanceByUserId.get(member.user_id) ?? 0;
          const paidDebtorAmount = paidDebtorByUserId.get(member.user_id) ?? 0;
          const isPaidDebtor = originalBalance < 0 && paidDebtorAmount >= Math.abs(originalBalance);
          const paidCreditorAmount = paidCreditorByUserId.get(member.user_id) ?? 0;
          const isPaidCreditor = originalBalance > 0 && paidCreditorAmount >= originalBalance;
          const isPositive = balance > 0;
          const isNegative = balance < 0;

          return (
            <li key={member.user_id} className="rounded-2xl bg-[color:var(--surface-strong)] px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium text-[color:var(--foreground)]">{member.label}</span>
                <span className={`font-semibold ${isPositive ? "text-[color:var(--accent-deep)]" : isNegative ? "text-[color:var(--accent)]" : "text-[color:var(--muted)]"}`}>
                  {isPaidDebtor ? "Paid" : isPaidCreditor ? "Received" : isPositive ? `Is owed ${formatCurrency(balance, currency)}` : isNegative ? `Owes ${formatCurrency(Math.abs(balance), currency)}` : "Settled for now"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-[color:var(--muted)]">
                <span>Currency {currency}</span>
                <span>{isPaidDebtor ? "Payment confirmed" : isPaidCreditor ? "Payout confirmed" : balance === 0 ? "Balanced" : paidDebtorAmount > 0 || paidCreditorAmount > 0 ? "Payout partially confirmed" : "Awaiting settlement"}</span>
              </div>
            </li>
          );
        })}
      </ul>
      {hideZeroBalances && visibleMembers.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-[color:var(--surface-strong)] px-4 py-3 text-sm text-[color:var(--muted)]">Everyone is balanced. No payment is needed.</p>
      ) : null}
    </section>
  );
}
