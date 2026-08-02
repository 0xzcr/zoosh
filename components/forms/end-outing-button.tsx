"use client";

import { useTransition } from "react";
import { LoaderCircle, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";

type EndOutingButtonProps = {
  subgroupId: string;
};

export function EndOutingButton({ subgroupId }: EndOutingButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleEnd() {
    if (!window.confirm("End this outing and open the final balances review?")) {
      return;
    }

    startTransition(async () => {
      const response = await fetch(`/api/subgroups/${subgroupId}/end`, { method: "POST" });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        window.alert(data?.error?.message ?? "This outing could not be ended.");
        return;
      }

      window.location.reload();
    });
  }

  return (
    <Button type="button" variant="secondary" onClick={handleEnd} disabled={isPending}>
      {isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <LockKeyhole className="size-4" aria-hidden="true" />}
      End outing
    </Button>
  );
}
