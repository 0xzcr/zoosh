"use client";

import { useState, useTransition } from "react";
import { ClipboardCopy, LoaderCircle, Link2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type InviteCreateFormProps = {
  groupId: string;
};

export function InviteCreateForm({ groupId }: InviteCreateFormProps) {
  const [invitePath, setInvitePath] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleCreateInvite() {
    setError(null);
    startTransition(() => {
      void (async () => {
        const response = await fetch(`/api/groups/${groupId}/invite`, {
          method: "POST",
        });

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message = typeof payload === "object" && payload && "error" in payload
            ? (payload as { error?: { message?: string } }).error?.message
            : null;
          setError(message ?? "Could not create an invite right now.");
          return;
        }

        const nextPath = typeof payload === "object" && payload && "invitePath" in payload
          ? (payload as { invitePath?: string }).invitePath
          : null;
        const nextCode = typeof payload === "object" && payload && "invite" in payload
          ? (payload as { invite?: { code?: string } }).invite?.code
          : null;
        setInvitePath(nextPath ?? null);
        setInviteCode(nextCode ?? null);
      })();
    });
  }

  async function copyInvite() {
    if (!invitePath) return;
    await navigator.clipboard.writeText(new URL(invitePath, window.location.origin).toString());
  }

  return (
    <section className="section-frame rounded-[1.5rem] p-4 sm:p-5">
      <p className="eyebrow">Invite link</p>
      <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl tracking-[-0.04em]">Invite your friends to your group.</h2>
      <p className="mt-2 text-sm leading-5 text-[color:var(--muted)]">Share this link with friends so they can join this group.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" onClick={handleCreateInvite} disabled={isPending}>
          {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Link2 className="size-4" aria-hidden="true" />}
          {invitePath ? "Refresh link" : "Create invite"}
        </Button>
        <Button type="button" variant="secondary" onClick={copyInvite} disabled={!invitePath}>
          <ClipboardCopy className="size-4" aria-hidden="true" />
          Copy link
        </Button>
      </div>
      {inviteCode ? (
        <div className="mt-3 rounded-2xl bg-[color:var(--surface-strong)] px-3 py-2 text-xs text-[color:var(--foreground)]">
          <span className="block text-[color:var(--muted)]">Invite code</span>
          <span className="mt-1 block break-all font-semibold tracking-[0.12em]">{inviteCode}</span>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-[color:var(--accent)]" role="alert">{error}</p> : null}
    </section>
  );
}
