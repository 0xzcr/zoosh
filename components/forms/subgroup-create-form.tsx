"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

type SubgroupCreateFormProps = {
  groupId: string;
};

export function SubgroupCreateForm({ groupId }: SubgroupCreateFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name the outing first.");
      return;
    }

    startTransition(() => {
      void (async () => {
        const response = await fetch("/api/subgroups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            friend_group_id: groupId,
            name: trimmedName,
            currency: "INR",
          }),
        });

        const payload: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          const message =
            typeof payload === "object" && payload && "error" in payload
              ? (payload as { error?: { message?: string } }).error?.message
              : null;
          setError(message ?? "Could not create that outing.");
          return;
        }

        const subgroupId =
          typeof payload === "object" && payload && "subgroup" in payload
            ? (payload as { subgroup?: { id?: string } }).subgroup?.id
            : null;

        setName("");
        router.refresh();

        if (subgroupId) {
          router.push(`/groups/${groupId}/outings/${subgroupId}`);
        }
      })();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="section-frame rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">New outing</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">Start an outing</h2>
        </div>
        <Sparkles className="mt-1 size-5 text-[color:var(--accent)]" aria-hidden="true" />
      </div>

      <label className="mt-5 block" htmlFor="outing-name">
        <span className="sr-only">Outing name</span>
        <input
          id="outing-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Goa trip, dinner, office lunch..."
          className="w-full rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] px-4 py-3 outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
        />
      </label>

      <p className="mt-4 text-sm leading-6 text-[color:var(--muted)]">
        Currency is fixed to INR for now so the outing stays consistent from creation onward.
      </p>

      {error ? (
        <p className="mt-2 text-sm text-[color:var(--accent)]" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="mt-4" disabled={isPending}>
        {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        Create outing
      </Button>
    </form>
  );
}
