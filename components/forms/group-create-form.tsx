"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function GroupCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Give the group a name first.");
      return;
    }

    startTransition(() => {
      void (async () => {
        const response = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: trimmedName }),
        });

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message = typeof payload === "object" && payload && "error" in payload
            ? (payload as { error?: { message?: string } }).error?.message
            : null;
          setError(message ?? "Could not create that group.");
          return;
        }

        const groupId = typeof payload === "object" && payload && "group" in payload
          ? (payload as { group?: { id?: string } }).group?.id
          : null;

        setName("");
        router.refresh();

        if (groupId) {
          router.push(`/groups/${groupId}`);
        }
      })();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="section-frame rounded-[1.75rem] p-5 sm:p-6">
      <p className="eyebrow">New group</p>
      <label className="mt-4 block" htmlFor="group-name">
        <span className="sr-only">Group name</span>
        <input
          id="group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Friends trip, office lunch, Goa plan..."
          className="w-full rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
        />
      </label>
      {error ? <p className="mt-2 text-sm text-[color:var(--accent)]" role="alert">{error}</p> : null}
      <Button type="submit" className="mt-4" disabled={isPending}>
        {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        Create group
      </Button>
    </form>
  );
}
