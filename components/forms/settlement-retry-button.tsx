"use client";

import { useState } from "react";
import { LoaderCircle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SettlementRetryButton({ sessionId }: { sessionId: string }) {
  const [isPending, setIsPending] = useState(false);

  async function retry() {
    setIsPending(true);
    const response = await fetch(`/api/settlements/${sessionId}/prava-session?restart=1`, { method: "POST" });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      window.alert(payload?.error?.message ?? "A fresh payment approval could not be started.");
      setIsPending(false);
      return;
    }
    window.location.reload();
  }

  return (
    <Button type="button" variant="secondary" onClick={retry} disabled={isPending}>
      {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="size-4" aria-hidden="true" />}
      Try payment again
    </Button>
  );
}
