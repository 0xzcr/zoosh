"use client";

import { useTransition } from "react";
import { LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type ExpenseVoidButtonProps = {
  subgroupId: string;
  expenseId: string;
};

export function ExpenseVoidButton({ subgroupId, expenseId }: ExpenseVoidButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleVoid() {
    const reason = window.prompt("Why are you removing this expense?", "Correction needed");
    if (reason === null) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/subgroups/${subgroupId}/expenses/${expenseId}/void`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        window.alert(data?.error?.message ?? "This expense could not be removed.");
        return;
      }

      window.location.reload();
    });
  }

  return (
    <Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={handleVoid} disabled={isPending}>
      {isPending ? <LoaderCircle className="size-3 animate-spin" aria-hidden="true" /> : null}
      Remove expense
    </Button>
  );
}
