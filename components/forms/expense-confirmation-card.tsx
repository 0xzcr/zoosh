"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, LoaderCircle, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { calculateEqualExpenseSplit } from "@/lib/ledger";
import { formatCurrency } from "@/lib/format-currency";

export type ExpenseMemberOption = {
  user_id: string;
  label: string;
};

export type ExpenseDraft = {
  payer_id: string;
  total_amount_paise: number;
  description: string;
  split_type: "equal" | "itemized" | "custom";
  participant_ids: string[];
};

export type ExpenseDuplicateWarning = {
  description: string;
  payer_label: string;
  logged_at: string;
  relative_time: string;
};

type ExpenseConfirmationCardProps = {
  subgroupId: string;
  currency: string;
  members: ExpenseMemberOption[];
  draft: ExpenseDraft;
  duplicateWarning?: ExpenseDuplicateWarning | null;
  averageExpenseAmountPaise?: number | null;
  onConfirmed: () => void;
};

export function ExpenseConfirmationCard({
  subgroupId,
  currency,
  members,
  draft,
  duplicateWarning = null,
  averageExpenseAmountPaise = null,
  onConfirmed,
}: ExpenseConfirmationCardProps) {
  const router = useRouter();
  const [totalAmountPaise, setTotalAmountPaise] = useState(String(draft.total_amount_paise));
  const [description, setDescription] = useState(draft.description);
  const [splitType, setSplitType] = useState(draft.split_type);
  const [participantIds, setParticipantIds] = useState<string[]>(draft.participant_ids.length > 0 ? draft.participant_ids : members.map((member) => member.user_id));
  const [acknowledgedLargeAmount, setAcknowledgedLargeAmount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const memberLabelById = useMemo(() => {
    return new Map(members.map((member) => [member.user_id, member.label] as const));
  }, [members]);

  const normalizedParticipantIds = useMemo(() => {
    const selected = participantIds.filter(Boolean);
    if (!selected.includes(draft.payer_id)) {
      selected.unshift(draft.payer_id);
    }
    return Array.from(new Set(selected));
  }, [draft.payer_id, participantIds]);

  const parsedAmount = Number.parseInt(totalAmountPaise, 10);
  const requiresExtraConfirmation = Boolean(averageExpenseAmountPaise && parsedAmount >= averageExpenseAmountPaise * 5);
  const splitPreview = Number.isInteger(parsedAmount) && parsedAmount > 0
    ? calculateEqualExpenseSplit({
      payerId: draft.payer_id,
      totalAmountPaise: parsedAmount,
      participantIds: normalizedParticipantIds,
    })
    : null;

  function toggleParticipant(userId: string) {
    if (userId === draft.payer_id) {
      return;
    }

    setParticipantIds((current) => (
      current.includes(userId)
        ? current.filter((participantId) => participantId !== userId)
        : [...current, userId]
    ));
  }

  function handleConfirm() {
    setError(null);

    if (!Number.isInteger(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a positive amount in paise before confirming.");
      return;
    }

    if (!description.trim()) {
      setError("Add a short description before confirming.");
      return;
    }

    if (requiresExtraConfirmation && !acknowledgedLargeAmount) {
      setError("Please confirm the unusually large amount before continuing.");
      return;
    }

    startTransition(() => {
      void (async () => {
        const response = await fetch(`/api/subgroups/${subgroupId}/expenses/confirm`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            payer_id: draft.payer_id,
            total_amount_paise: parsedAmount,
            description: description.trim(),
            split_type: splitType,
            participant_ids: normalizedParticipantIds,
            source: "text",
            large_expense_acknowledged: acknowledgedLargeAmount,
          }),
        });

        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof payload === "object" && payload && "error" in payload
            ? (payload as { error?: { message?: string } }).error?.message
            : null;
          setError(message ?? "Could not confirm that expense.");
          return;
        }

        onConfirmed();
        router.refresh();
      })();
    });
  }

  return (
    <section className="section-frame rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Review expense</p>
          <h3 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">Confirm the split before it reaches the ledger.</h3>
        </div>
        <Sparkles className="mt-1 size-5 text-[color:var(--accent)]" aria-hidden="true" />
      </div>

      {duplicateWarning ? (
        <div className="mt-5 rounded-2xl border border-[color:var(--accent-soft)] bg-[color:var(--paper)] px-4 py-3 text-sm leading-6 text-[color:var(--ink-soft)]">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <p>
              Similar to <span className="font-semibold">&quot;{duplicateWarning.description}&quot;</span> logged {duplicateWarning.relative_time} ago by {duplicateWarning.payer_label} - is this different?
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block" htmlFor={`expense-amount-${subgroupId}`}>
          <span className="text-sm font-semibold text-[color:var(--foreground)]">Amount in paise</span>
          <input
            id={`expense-amount-${subgroupId}`}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            value={totalAmountPaise}
            onChange={(event) => setTotalAmountPaise(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
          />
          <span className="mt-2 block text-sm leading-6 text-[color:var(--muted)]">
            {currency} uses integer paise, so ₹1,200 becomes <span className="font-semibold text-[color:var(--foreground)]">120000</span>.
          </span>
        </label>

        <label className="block" htmlFor={`expense-description-${subgroupId}`}>
          <span className="text-sm font-semibold text-[color:var(--foreground)]">Description</span>
          <input
            id={`expense-description-${subgroupId}`}
            type="text"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
          />
        </label>
      </div>

      <label className="mt-4 block" htmlFor={`expense-split-${subgroupId}`}>
        <span className="text-sm font-semibold text-[color:var(--foreground)]">Split type</span>
        <select
          id={`expense-split-${subgroupId}`}
          value={splitType}
          onChange={(event) => setSplitType(event.target.value as ExpenseDraft["split_type"])}
          className="mt-2 w-full rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
        >
          <option value="equal">Equal</option>
          <option value="itemized">Itemized</option>
          <option value="custom">Custom</option>
        </select>
      </label>

      <fieldset className="mt-5 rounded-3xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-4">
        <legend className="px-2 text-sm font-semibold text-[color:var(--foreground)]">Participants</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {members.map((member) => {
            const checked = normalizedParticipantIds.includes(member.user_id);
            const isPayer = member.user_id === draft.payer_id;

            return (
              <label
                key={member.user_id}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
                  checked ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]" : "border-[color:var(--line)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={isPayer}
                  onChange={() => toggleParticipant(member.user_id)}
                  className="mt-1 size-4 rounded border-[color:var(--line)] text-[color:var(--accent)]"
                />
                <span className="flex-1">
                  <span className="block font-semibold text-[color:var(--foreground)]">
                    {member.label}
                    {isPayer ? " (you)" : ""}
                  </span>
                  <span className="block text-[color:var(--muted)]">
                    {isPayer ? "Always included in the split." : checked ? "Included in this split." : "Not included."}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <section className="mt-5 rounded-3xl bg-[color:var(--paper)] p-4">
        <p className="eyebrow">Split preview</p>
        {splitPreview ? (
          <>
            <ul className="mt-3 space-y-2">
              {splitPreview.participantShares.map((share) => (
                <li key={share.participantId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-[color:var(--foreground)]">
                    {memberLabelById.get(share.participantId) ?? share.participantId}
                    {share.isPayer ? " (you)" : ""}
                  </span>
                  <span className="text-[color:var(--muted)]">{formatCurrency(share.sharePaise, currency)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
              {splitPreview.remainderPaise > 0
                ? `Rounding keeps ${formatCurrency(splitPreview.remainderPaise, currency)} with you.`
                : "The split divides evenly across the selected participants."}
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">Enter a positive amount to preview the split.</p>
        )}
      </section>

      {requiresExtraConfirmation ? (
        <label className="mt-5 flex items-start gap-3 rounded-2xl border border-[color:var(--accent-soft)] bg-[color:var(--paper)] px-4 py-3 text-sm leading-6 text-[color:var(--ink-soft)]">
          <input
            type="checkbox"
            checked={acknowledgedLargeAmount}
            onChange={(event) => setAcknowledgedLargeAmount(event.target.checked)}
            className="mt-1 size-4 rounded border-[color:var(--accent-soft)] text-[color:var(--accent)]"
          />
          <span>
            This amount is much larger than the outing&apos;s usual spend, and I want to review it carefully before confirming.
          </span>
        </label>
      ) : null}

      {error ? (
        <p className="mt-4 text-sm text-[color:var(--accent)]" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <Button type="button" onClick={handleConfirm} disabled={isPending}>
          {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
          Confirm expense
        </Button>
      </div>
    </section>
  );
}
