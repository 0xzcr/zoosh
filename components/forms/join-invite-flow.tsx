"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, LoaderCircle, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

type JoinInviteFlowProps = {
  code: string;
};

type JoinResponse = {
  joined?: boolean;
  alreadyJoined?: boolean;
  invite?: {
    code: string;
    friend_group_id: string;
  };
};

export function JoinInviteFlow({ code }: JoinInviteFlowProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "joining" | "joined" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (status !== "idle") return;

    startTransition(() => {
      void (async () => {
        setStatus("joining");
        const response = await fetch(`/api/join/${code}`, { method: "POST" });
        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const errorMessage = typeof payload === "object" && payload && "error" in payload
            ? (payload as { error?: { message?: string } }).error?.message
            : null;
          setStatus("error");
          setMessage(errorMessage ?? "We could not join this invite.");
          return;
        }

        const data = payload as JoinResponse;
        setGroupId(data.invite?.friend_group_id ?? null);
        setMessage(data.alreadyJoined ? "You were already in this group." : "You joined the group.");
        setStatus("joined");
        router.refresh();
      })();
    });
  }, [code, router, status]);

  return (
    <section className="section-frame rounded-[1.75rem] p-6 sm:p-8">
      <p className="eyebrow">Join invite</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl tracking-[-0.05em]">Welcome in.</h1>
      <p className="mt-3 leading-7 text-[color:var(--muted)]">Zoosh will add you to the Friends Group first, then you can open its outings.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="button" onClick={() => router.push("/groups")} variant="secondary">
          <UserPlus className="size-4" aria-hidden="true" />
          View groups
        </Button>
        {groupId ? (
          <Button type="button" onClick={() => router.push(`/groups/${groupId}`)}>
            <CheckCircle2 className="size-4" aria-hidden="true" />
            Open group
          </Button>
        ) : null}
      </div>
      <p className="mt-4 flex items-center gap-2 text-sm text-[color:var(--muted)]">
        {status === "joining" || isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {message ?? "Joining your invite..."}
      </p>
    </section>
  );
}
