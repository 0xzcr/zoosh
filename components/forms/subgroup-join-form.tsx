"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, LoaderCircle, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

type SubgroupJoinFormProps = {
  groupId: string;
  subgroupId: string;
  alreadyJoined?: boolean;
};

export function SubgroupJoinForm({ groupId, subgroupId, alreadyJoined = false }: SubgroupJoinFormProps) {
  const router = useRouter();
  const [joined, setJoined] = useState(alreadyJoined);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(() => {
      void (async () => {
        const response = await fetch(`/api/subgroups/${subgroupId}/join`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            typeof payload === "object" && payload && "error" in payload
              ? (payload as { error?: { message?: string } }).error?.message
              : null;
          setError(message ?? "Could not join this outing.");
          return;
        }

        setJoined(true);
        router.refresh();
        router.push(`/groups/${groupId}/outings/${subgroupId}`);
      })();
    });
  }

  if (joined) {
    return (
      <Button type="button" variant="secondary" disabled>
        <Check className="size-4" aria-hidden="true" />
        Already joined
      </Button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-4 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-4">
      {error ? (
        <p className="mt-3 text-sm text-[color:var(--accent)]" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="mt-4 w-full sm:w-auto" disabled={isPending}>
        {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <UserPlus className="size-4" aria-hidden="true" />}
        Join outing
      </Button>
    </form>
  );
}
