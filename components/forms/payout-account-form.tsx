"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Building2, CheckCircle2, LoaderCircle, Save } from "lucide-react";

import { Button } from "@/components/ui/button";

type PayoutAccountFormProps = {
  connected: boolean;
  verified: boolean;
};

export function PayoutAccountForm({ connected, verified }: PayoutAccountFormProps) {
  const [isConnected, setIsConnected] = useState(connected);
  const [isVerified, setIsVerified] = useState(verified);
  const [name, setName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [vpa, setVpa] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/profile/payout-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, bankAccount, ifsc, vpa }),
    });
    const payload = (await response.json().catch(() => null)) as { connected?: boolean; status?: string; error?: { message?: string } } | null;
    setIsSaving(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "Could not connect the payout destination.");
      return;
    }
    setIsConnected(Boolean(payload?.connected));
    setIsVerified(payload?.status === "VERIFIED");
    setMessage(payload?.status === "VERIFIED" ? "Payout destination connected." : "Payout destination submitted for Cashfree verification.");
  }

  async function refreshStatus() {
    setIsSaving(true);
    setMessage(null);
    const response = await fetch("/api/profile/payout-account");
    const payload = (await response.json().catch(() => null)) as { connected?: boolean; status?: string; error?: { message?: string } } | null;
    setIsSaving(false);
    if (!response.ok) {
      setMessage(payload?.error?.message ?? "Could not refresh the payout status.");
      return;
    }
    setIsConnected(Boolean(payload?.connected));
    setIsVerified(payload?.status === "VERIFIED");
    setMessage(payload?.status === "VERIFIED" ? "Payout destination is verified." : "Cashfree is still verifying this destination.");
  }

  if (isConnected) {
    return (
      <div className="mt-5 flex flex-wrap items-start gap-3 rounded-2xl bg-[color:var(--surface-strong)] p-4 text-sm">
        {isVerified ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-[color:var(--accent)]" aria-hidden="true" /> : <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin text-[color:var(--accent)]" aria-hidden="true" />}
        <div>
          <p className="font-semibold text-[color:var(--foreground)]">{isVerified ? "Payouts are ready" : "Payout destination is being verified"}</p>
          <p className="mt-1 leading-6 text-[color:var(--muted)]">Zoosh never stores your bank account or UPI details. Cashfree holds the payout destination securely.</p>
          <Button type="button" variant="quiet" className="mt-3 px-0" onClick={refreshStatus} disabled={isSaving}>
            {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Refresh verification
          </Button>
          {message ? <p className="mt-1 text-sm text-[color:var(--muted)]" role="status">{message}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><Building2 className="size-4 text-[color:var(--accent)]" aria-hidden="true" /> Cashfree payout destination</div>
      <p className="text-sm leading-6 text-[color:var(--muted)]">Connect a bank account or UPI ID once so your share can be sent automatically when an outing is settled.</p>
      <label className="block text-sm font-semibold" htmlFor="payout-name">Account holder name</label>
      <input id="payout-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Asha Sharma" required className="w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--paper)] px-4 py-3 text-[color:var(--foreground)]" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-semibold" htmlFor="payout-account">Bank account, optional</label>
          <input id="payout-account" value={bankAccount} onChange={(event) => setBankAccount(event.target.value)} inputMode="numeric" placeholder="Account number" className="mt-2 w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--paper)] px-4 py-3 text-[color:var(--foreground)]" />
        </div>
        <div>
          <label className="block text-sm font-semibold" htmlFor="payout-ifsc">IFSC, with bank account</label>
          <input id="payout-ifsc" value={ifsc} onChange={(event) => setIfsc(event.target.value.toUpperCase())} placeholder="HDFC0000001" className="mt-2 w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--paper)] px-4 py-3 uppercase text-[color:var(--foreground)]" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-semibold" htmlFor="payout-vpa">Or UPI ID</label>
        <input id="payout-vpa" value={vpa} onChange={(event) => setVpa(event.target.value)} placeholder="name@upi" className="mt-2 w-full rounded-xl border border-[color:var(--line)] bg-[color:var(--paper)] px-4 py-3 text-[color:var(--foreground)]" />
      </div>
      <Button type="submit" disabled={isSaving}>
        {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" aria-hidden="true" />}
        Connect payout destination
      </Button>
      {message ? <p className="text-sm text-[color:var(--muted)]" role="status">{message}</p> : null}
    </form>
  );
}
