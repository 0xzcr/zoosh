"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NotificationContactForm({ initialPhone }: { initialPhone: string | null }) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/profile/contact", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phoneE164: phone }),
    });
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    setIsSaving(false);
    setMessage(response.ok ? "Contact details saved." : payload?.error?.message ?? "Could not save contact details.");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
      <label className="block text-sm font-semibold" htmlFor="phone-e164">Phone for settlement notifications</label>
      <input id="phone-e164" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+919876543210" inputMode="tel" className="w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--paper)] px-4 py-3 text-[color:var(--foreground)]" />
      <p className="text-sm leading-6 text-[color:var(--muted)]">Use international format. Email remains the fallback for every settlement request.</p>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
        Save notification number
      </Button>
      {message ? <p className="text-sm text-[color:var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}
