"use client";

import { useEffect, useState, useTransition } from "react";
import { CheckCircle2, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

type SettleAmountsButtonProps = {
  subgroupId: string;
};

export function SettleAmountsButton({ subgroupId }: SettleAmountsButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [reviewReady, setReviewReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReviewReady(true), 30_000);
    return () => window.clearTimeout(timer);
  }, []);

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
    <Button type="button" onClick={handleSettle} disabled={isPending || !reviewReady}>
      {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
      {reviewReady ? "Settle amounts" : "Review amounts for 30 seconds"}
    </Button>
  );
}
