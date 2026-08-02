"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Mic, Send } from "lucide-react";

import { ExpenseConfirmationCard, type ExpenseDraft, type ExpenseDuplicateWarning, type ExpenseMemberOption } from "@/components/forms/expense-confirmation-card";
import { Button } from "@/components/ui/button";

type ExpenseEntryFormProps = {
  subgroupId: string;
  subgroupName: string;
  currency: string;
  members: ExpenseMemberOption[];
};

type ParseResponse =
  | {
      clarification_needed: string;
    }
  | {
      draft: ExpenseDraft;
      duplicate_warning?: ExpenseDuplicateWarning | null;
      average_expense_amount_paise?: number | null;
      requires_extra_confirmation?: boolean;
    };

export function ExpenseEntryForm({ subgroupId, subgroupName, currency, members }: ExpenseEntryFormProps) {
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<ExpenseDuplicateWarning | null>(null);
  const [averageExpenseAmountPaise, setAverageExpenseAmountPaise] = useState<number | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, startParsing] = useTransition();

  function clearDraft() {
    setDraft(null);
    setDuplicateWarning(null);
    setAverageExpenseAmountPaise(null);
    setClarification(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedInput = input.trim();
    setError(null);
    setStatusMessage(null);

    if (!trimmedInput) {
      setError("Describe the expense so everyone can review it.");
      return;
    }

    startParsing(() => {
      void (async () => {
        const response = await fetch(`/api/subgroups/${subgroupId}/expenses/parse`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ input: trimmedInput }),
        });

        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = typeof payload === "object" && payload && "error" in payload
            ? (payload as { error?: { message?: string } }).error?.message
            : null;
          setError(message ?? "Could not prepare that expense right now.");
          return;
        }

        const parsed = payload as ParseResponse;
        if ("clarification_needed" in parsed) {
          clearDraft();
          setClarification(parsed.clarification_needed);
          return;
        }

        setClarification(null);
        setDraft(parsed.draft);
        setDuplicateWarning(parsed.duplicate_warning ?? null);
        setAverageExpenseAmountPaise(parsed.average_expense_amount_paise ?? null);
      })();
    });
  }

  return (
    <section className="section-frame rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">New expense</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">Put it in words.</h2>
        </div>
        <Mic className="mt-1 size-5 text-[color:var(--accent)]" aria-hidden="true" />
      </div>

      <form onSubmit={handleSubmit} className="mt-5">
        <label className="block" htmlFor={`expense-input-${subgroupId}`}>
          <span className="sr-only">Expense description</span>
          <textarea
            id={`expense-input-${subgroupId}`}
            rows={4}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              clearDraft();
              setStatusMessage(null);
            }}
            className="w-full resize-none rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] px-4 py-3 leading-6 outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
            placeholder={`Describe what was paid in ${subgroupName}.`}
          />
        </label>

        {clarification ? (
          <p className="mt-3 rounded-2xl bg-[color:var(--paper)] px-4 py-3 text-sm leading-6 text-[color:var(--muted)]" role="status">
            {clarification}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-[color:var(--accent)]" role="alert">
            {error}
          </p>
        ) : null}

        {statusMessage ? (
          <p className="mt-3 text-sm text-[color:var(--accent-deep)]" role="status">
            {statusMessage}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="submit" disabled={isParsing}>
            {isParsing ? <Send className="size-4 animate-pulse" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {isParsing ? "Preparing review" : "Review expense"}
          </Button>
          <Button variant="secondary" type="button" aria-label="Start push-to-talk expense entry" disabled>
            <Mic className="size-4" aria-hidden="true" />
            Push to talk
          </Button>
        </div>
      </form>

      {draft ? (
        <div className="mt-5">
          <ExpenseConfirmationCard
            key={`${draft.total_amount_paise}:${draft.description}:${draft.participant_ids.join(",")}`}
            subgroupId={subgroupId}
            currency={currency}
            members={members}
            draft={draft}
            duplicateWarning={duplicateWarning}
            averageExpenseAmountPaise={averageExpenseAmountPaise}
            onConfirmed={() => {
              clearDraft();
              setInput("");
              setStatusMessage("Expense confirmed and balances updated.");
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
