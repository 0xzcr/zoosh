"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

function normalizeInviteInput(input: string) {
  const trimmed = input.trim();

  const pathMatch = trimmed.match(/^\/?join\/([^/]+)\/?$/i);
  if (pathMatch?.[1]) {
    try {
      return decodeURIComponent(pathMatch[1]).replace(/\s+/g, "").toLowerCase();
    } catch {
      return pathMatch[1].replace(/\s+/g, "").toLowerCase();
    }
  }

  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/join\/([^/]+)\/?$/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]).replace(/\s+/g, "").toLowerCase();
    }
  } catch {
    // The input is a code rather than a full invite URL.
  }

  return trimmed.replace(/\s+/g, "").toLowerCase();
}

export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedCode = normalizeInviteInput(code);

    if (!trimmedCode) {
      setError("Enter the invite code first.");
      return;
    }

    setError(null);
    router.push(`/join/${encodeURIComponent(trimmedCode)}`);
  }

  return (
    <aside className="section-frame rounded-[1.75rem] p-6 sm:p-7">
      <form onSubmit={handleSubmit}>
        <label className="block" htmlFor="invite-code">
          <span className="eyebrow">Invite code</span>
          <input
            id="invite-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="ABCD1234"
            className="mt-3 w-full rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] px-4 py-3 text-[color:var(--foreground)] outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
          />
        </label>
        {error ? <p className="mt-2 text-sm text-[color:var(--accent)]" role="alert">{error}</p> : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button type="submit">
            <ArrowRight className="size-4" aria-hidden="true" />
            Continue
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.push("/groups")}>
            <UserPlus className="size-4" aria-hidden="true" />
            Back to groups
          </Button>
        </div>
      </form>
    </aside>
  );
}
