"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";

export function NotificationContactForm({ initialPhone }: { initialPhone: string | null }) {
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [savedPhone, setSavedPhone] = useState(initialPhone ?? "");
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
    if (response.ok) {
      setSavedPhone(phone);
      setMessage("Phone number saved.");
    } else {
      setMessage(payload?.error?.message ?? "Could not save phone number.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
      <label className="block text-sm font-semibold" htmlFor="phone-e164">Your phone number</label>
      <input id="phone-e164" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+919876543210" inputMode="tel" className="w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--paper)] px-4 py-3 text-[color:var(--foreground)]" />
      <p className="text-sm leading-6 text-[color:var(--muted)]">Use international format. No verification is required. Linq will use this number for settlement notifications, with email as a fallback.</p>
      {savedPhone ? <p className="text-sm font-semibold text-[color:var(--accent-light)]">Saved number: {savedPhone}</p> : null}
      <Button type="submit" disabled={isSaving}>
        {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
        {savedPhone ? "Update phone number" : "Save phone number"}
      </Button>
      {message ? <p className="text-sm text-[color:var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}
