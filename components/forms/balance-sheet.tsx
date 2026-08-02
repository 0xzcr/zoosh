import { Coins } from "lucide-react";

import { formatCurrency } from "@/lib/format-currency";

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
};

export function BalanceSheet({ members, balances, currency }: BalanceSheetProps) {
  const balanceByUserId = new Map(balances.map((balance) => [balance.user_id, balance.net_balance_paise] as const));

  return (
    <section className="section-frame rounded-[1.75rem] p-6 sm:p-8">
      <div className="flex items-center gap-2">
        <Coins className="size-5 text-[color:var(--accent)]" aria-hidden="true" />
        <p className="eyebrow">Balances</p>
      </div>
      <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">
        {members.length} {members.length === 1 ? "person" : "people"} in this outing
      </h2>
      <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
        Balances reflect confirmed expenses and remain unchanged until a real settlement is completed.
      </p>
      <ul className="mt-5 space-y-3">
        {members.map((member) => {
          const balance = balanceByUserId.get(member.user_id) ?? 0;
          const isPositive = balance > 0;
          const isNegative = balance < 0;

          return (
            <li key={member.user_id} className="rounded-2xl bg-[color:var(--surface-strong)] px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-medium text-[color:var(--foreground)]">{member.label}</span>
                <span className={`font-semibold ${isPositive ? "text-[color:var(--accent-deep)]" : isNegative ? "text-[color:var(--accent)]" : "text-[color:var(--muted)]"}`}>
                  {isPositive ? `Is owed ${formatCurrency(balance, currency)}` : isNegative ? `Owes ${formatCurrency(Math.abs(balance), currency)}` : "Settled for now"}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-[color:var(--muted)]">
                <span>Currency {currency}</span>
                <span>{balance === 0 ? "Balanced" : "Awaiting settlement"}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
