export type ExpenseSplit = {
  participantId: string;
  sharePaise: number;
  isPayer: boolean;
};

export type ExpenseInput = {
  payerId: string;
  totalAmountPaise: number;
  participantIds: string[];
};

export type ExpenseRecord = ExpenseInput & {
  description: string;
};

export type BalanceInput = {
  userId: string;
  netBalancePaise: number;
};

export type SettlementLine = {
  creditorId: string;
  amountPaise: number;
};

export function uniqueExpenseParticipantIds(participantIds: string[], payerId: string) {
  const deduped = Array.from(new Set(participantIds.filter(Boolean)));

  if (!deduped.includes(payerId)) {
    deduped.unshift(payerId);
  }

  return Array.from(new Set(deduped));
}

export function calculateEqualExpenseSplit({ payerId, totalAmountPaise, participantIds }: ExpenseInput) {
  const normalizedParticipantIds = uniqueExpenseParticipantIds(participantIds, payerId);
  const participantCount = normalizedParticipantIds.length;
  const baseSharePaise = Math.floor(totalAmountPaise / participantCount);
  const remainderPaise = totalAmountPaise % participantCount;
  const payerSharePaise = baseSharePaise + remainderPaise;

  const participantShares: ExpenseSplit[] = normalizedParticipantIds.map((participantId) => ({
    participantId,
    isPayer: participantId === payerId,
    sharePaise: participantId === payerId ? payerSharePaise : baseSharePaise,
  }));

  return {
    participantIds: normalizedParticipantIds,
    participantCount,
    baseSharePaise,
    remainderPaise,
    payerSharePaise,
    participantShares,
  };
}

export function computeLedgerBalances(memberIds: string[], expenses: ExpenseInput[]) {
  const balances = new Map<string, number>(memberIds.map((memberId) => [memberId, 0]));

  for (const expense of expenses) {
    const split = calculateEqualExpenseSplit(expense);
    const payerBalance = balances.get(expense.payerId) ?? 0;
    balances.set(expense.payerId, payerBalance + split.baseSharePaise * (split.participantCount - 1));

    for (const participantId of split.participantIds) {
      if (participantId === expense.payerId) {
        continue;
      }

      const currentBalance = balances.get(participantId) ?? 0;
      balances.set(participantId, currentBalance - split.baseSharePaise);
    }
  }

  return balances;
}

export function averageExpenseAmount(expenseAmounts: number[]) {
  if (expenseAmounts.length === 0) {
    return null;
  }

  return Math.round(expenseAmounts.reduce((sum, amount) => sum + amount, 0) / expenseAmounts.length);
}

export function computeSettlementBatches(balances: BalanceInput[]) {
  const debtors = balances
    .filter((balance) => balance.netBalancePaise < 0)
    .map((balance) => ({ userId: balance.userId, amountPaise: Math.abs(balance.netBalancePaise) }))
    .sort((left, right) => right.amountPaise - left.amountPaise);
  const creditors = balances
    .filter((balance) => balance.netBalancePaise > 0)
    .map((balance) => ({ userId: balance.userId, amountPaise: balance.netBalancePaise }))
    .sort((left, right) => right.amountPaise - left.amountPaise);
  const batches = new Map<string, SettlementLine[]>();

  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountPaise = Math.min(debtor.amountPaise, creditor.amountPaise);
    const lines = batches.get(debtor.userId) ?? [];
    lines.push({ creditorId: creditor.userId, amountPaise });
    batches.set(debtor.userId, lines);

    debtor.amountPaise -= amountPaise;
    creditor.amountPaise -= amountPaise;
    if (debtor.amountPaise === 0) debtorIndex += 1;
    if (creditor.amountPaise === 0) creditorIndex += 1;
  }

  return batches;
}
