"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { PravaSDK } from "@prava-sdk/core";

type PravaPaymentProps = {
  sessionId: string;
};

type SessionPayload = {
  publishableKey: string;
  sessionId: string;
  sessionToken: string;
  iframeUrl: string;
};

export function PravaPayment({ sessionId }: PravaPaymentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<PravaSDK | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "checking" | "authorized" | "declined" | "error">("loading");
  const [message, setMessage] = useState("Preparing your secure approval form...");

  useEffect(() => {
    let cancelled = false;

    async function start() {
      const response = await fetch(`/api/settlements/${sessionId}/prava-session`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as (SessionPayload & { error?: { message?: string } }) | null;
      if (!response.ok || !payload?.sessionToken || !payload.iframeUrl || !payload.publishableKey) {
        throw new Error(payload?.error?.message ?? "The secure payment form could not be started.");
      }
      if (cancelled || !containerRef.current) return;

      const prava = new PravaSDK({ publishableKey: payload.publishableKey });
      sdkRef.current = prava;
      setStatus("ready");
      setMessage("Review the exact amount, then approve it with your passkey.");
      await prava.collectPAN({
        sessionToken: payload.sessionToken,
        iframeUrl: payload.iframeUrl,
        container: containerRef.current,
        onReady: () => setMessage("The secure approval form is ready."),
        onSuccess: () => {
          if (cancelled) return;
          setStatus("checking");
          setMessage("Approval received. Confirming the payment result...");
          void checkResult();
        },
        onError: (error) => {
          if (!cancelled) {
            setStatus("error");
            setMessage(error.message || "The secure approval form reported an error.");
          }
        },
      });
    }

    async function checkResult() {
      for (let attempt = 0; attempt < 30; attempt += 1) {
        const response = await fetch(`/api/settlements/${sessionId}/result`, { method: "POST" });
        const payload = (await response.json().catch(() => null)) as { status?: string; message?: string; error?: { message?: string } } | null;
        if (payload?.status === "authorized") {
          setStatus("authorized");
          setMessage(payload.message ?? "Payment authorization received.");
          return;
        }
        if (payload?.status === "declined") {
          setStatus("declined");
          setMessage(payload.message ?? "The payment was declined.");
          return;
        }
        if (!response.ok && response.status !== 202) {
          throw new Error(payload?.error?.message ?? "The payment result could not be confirmed.");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
      }
      throw new Error("Payment confirmation timed out. You can safely return to the outing and try again later.");
    }

    void start().catch((error: unknown) => {
      if (!cancelled) {
        setStatus("error");
        setMessage(error instanceof Error ? error.message : "The payment form could not be started.");
      }
    });

    return () => {
      cancelled = true;
      sdkRef.current?.destroy();
      sdkRef.current = null;
    };
  }, [sessionId]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] p-4 text-sm text-[color:var(--muted)]">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[color:var(--accent)]" aria-hidden="true" />
        <p>{message}</p>
      </div>
      {status === "loading" || status === "checking" ? <LoaderCircle className="size-5 animate-spin text-[color:var(--accent)]" aria-label="Loading payment form" /> : null}
      <div ref={containerRef} className="min-h-48 overflow-hidden rounded-2xl border border-[color:var(--line)] bg-[color:var(--paper)]" />
    </div>
  );
}
