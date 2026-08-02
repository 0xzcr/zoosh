"use client";

import { useState } from "react";
import { LoaderCircle, Send } from "lucide-react";

import { Button } from "@/components/ui/button";

export function PayoutRetryButton({ sessionId }: { sessionId: string }) {
  const [isPending, setIsPending] = useState(false);

  async function retry() {
    setIsPending(true);
    const response = await fetch(`/api/settlements/${sessionId}/payouts/retry`, { method: "POST" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      window.alert(payload?.error?.message ?? "The payouts could not be retried.");
      setIsPending(false);
      return;
    }
    window.location.reload();
  }

  return (
    <Button type="button" variant="secondary" onClick={retry} disabled={isPending}>
      {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
      Retry pending payouts
    </Button>
  );
}
