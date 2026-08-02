"use client";

import { useTransition } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type SettleAmountsButtonProps = {
  subgroupId: string;
};

export function SettleAmountsButton({ subgroupId }: SettleAmountsButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleSettle() {
    if (!window.confirm("Prepare the reviewed amounts for settlement?")) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/subgroups/${subgroupId}/settle`, {
        method: "POST",
        headers: { "content-type": "application/json" },
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        window.alert(data?.error?.message ?? "The settlement amounts could not be prepared.");
        return;
      }

      window.location.reload();
    });
  }

  return (
    <Button type="button" onClick={handleSettle} disabled={isPending}>
      {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
      Settle amounts
    </Button>
  );
}
