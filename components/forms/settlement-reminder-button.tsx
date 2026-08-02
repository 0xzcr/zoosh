"use client";

import { useState } from "react";
import { BellRing, LoaderCircle } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SettlementReminderButton({ sessionId }: { sessionId: string }) {
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sendReminder() {
    setIsSending(true);
    setMessage(null);
    const response = await fetch(`/api/settlements/${sessionId}/remind`, { method: "POST" });
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    setIsSending(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "Could not send the reminder.");
      return;
    }
    setMessage("Reminder sent by Linq and email.");
  }

  return (
    <div className="mt-5 space-y-2">
      <Button type="button" variant="secondary" onClick={sendReminder} disabled={isSending}>
        {isSending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <BellRing className="size-4" aria-hidden="true" />}
        Remind payer
      </Button>
      {message ? <p className="text-sm text-[color:var(--muted)]" role="status">{message}</p> : null}
    </div>
  );
}
