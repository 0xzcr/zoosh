"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { PravaSDK } from "@prava-sdk/core";

type PravaPaymentProps = {
  sessionId: string;
  returnPath: string;
};

type SessionPayload = {
  publishableKey: string;
  sessionId: string;
  sessionToken: string;
  iframeUrl: string;
};

function formatPravaError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "The secure payment form reported an error.";
  }

  const candidate = error as { code?: unknown; message?: unknown };
  const message = typeof candidate.message === "string" && candidate.message.trim()
    ? candidate.message.trim()
    : "The secure payment form reported an error.";
  const code = typeof candidate.code === "string" && candidate.code.trim() ? candidate.code.trim() : null;

  return code ? `${message} (${code})` : message;
}

export function PravaPayment({ sessionId, returnPath }: PravaPaymentProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const sdkRef = useRef<PravaSDK | null>(null);
  const finalizationStartedRef = useRef(false);
  const [status, setStatus] = useState<"loading" | "ready" | "checking" | "authorized" | "requires_action" | "declined" | "error">("loading");
  const [message, setMessage] = useState("Preparing your secure approval form...");
  const [actionUrl, setActionUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pollTimer: number | undefined;
    let pollInFlight = false;
    let transientErrors = 0;

    function stopPolling() {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      pollTimer = undefined;
    }

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
        onReady: () => {
          const iframe = containerRef.current?.querySelector<HTMLIFrameElement>('iframe[title="Secure Card Entry"]');
          iframe?.setAttribute("scrolling", "no");
          setMessage("The secure approval form is ready.");
        },
        onSuccess: () => {
          if (cancelled) return;
          setStatus("checking");
          setMessage("Approval received. Confirming the payment result...");
          void checkResultOnce();
        },
        onError: (error) => {
          if (!cancelled) {
            setStatus("error");
            setMessage(formatPravaError(error));
            void fetch(`/api/settlements/${sessionId}/prava-session?restart=1`, { method: "POST" }).catch(() => {
              // The visible provider error remains the useful feedback if a retry reset fails.
            });
            stopPolling();
          }
        },
      });
      void checkResultOnce();
    }

    async function startCashfreeCharge(attempt = 0): Promise<void> {
      const browser = {
        javaEnabled: typeof navigator.javaEnabled === "function" ? navigator.javaEnabled() : false,
        javascriptEnabled: true,
        timezoneOffset: new Date().getTimezoneOffset(),
        colorDepth: window.screen.colorDepth,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        language: navigator.language.slice(0, 8),
        userAgent: navigator.userAgent,
        referrer: document.referrer,
      };
      const response = await fetch(`/api/settlements/${sessionId}/charge`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ browser }),
      });
      const payload = (await response.json().catch(() => null)) as { status?: string; paymentId?: string; actionUrl?: string; message?: string; error?: { message?: string } } | null;
      if (!response.ok && response.status !== 202) {
        throw new Error(payload?.error?.message ?? "The final payment could not be started.");
      }
      if (payload?.status === "requires_action" && payload.actionUrl) {
        setStatus("requires_action");
        setActionUrl(payload.actionUrl);
        setMessage(payload.message ?? "Cashfree needs one final bank verification before the payment can finish.");
        return;
      }
      if (payload?.status === "charged") {
        setStatus("authorized");
        setMessage("Payment confirmed. Zoosh is distributing the amount to the group.");
        window.setTimeout(() => router.replace(returnPath), 700);
        return;
      }
      if (payload?.status === "declined") {
        setStatus("declined");
        setMessage(payload.message ?? "Cashfree declined the payment.");
        return;
      }
      setStatus("authorized");
      setMessage(payload?.message ?? "Payment is being confirmed by Cashfree.");
      if (attempt < 20 && !cancelled) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000));
        return startCashfreeCharge(attempt + 1);
      }
      if (!cancelled) setMessage("Cashfree is still confirming this payment. Return to the outing and refresh shortly.");
    }

    async function checkResultOnce() {
      if (cancelled || pollInFlight || finalizationStartedRef.current) return;
      pollInFlight = true;
      try {
        const response = await fetch(`/api/settlements/${sessionId}/result`, { method: "POST", cache: "no-store" });
        const payload = (await response.json().catch(() => null)) as { status?: string; message?: string; error?: { message?: string } } | null;
        if (payload?.status === "authorized") {
          finalizationStartedRef.current = true;
          stopPolling();
          await startCashfreeCharge();
          return;
        }
        if (payload?.status === "charged") {
          finalizationStartedRef.current = true;
          stopPolling();
          setStatus("authorized");
          setMessage("Payment confirmed. Zoosh is distributing the amount to the group.");
          window.setTimeout(() => router.replace(returnPath), 700);
          return;
        }
        if (payload?.status === "declined") {
          finalizationStartedRef.current = true;
          stopPolling();
          setStatus("declined");
          setMessage(payload.message ?? "The payment was declined.");
          return;
        }
        if (!response.ok && response.status !== 202) {
          transientErrors += 1;
          if (transientErrors >= 3) throw new Error(payload?.error?.message ?? "The payment result could not be confirmed.");
          return;
        }
        transientErrors = 0;
      } catch (error) {
        stopPolling();
        if (!cancelled) {
          setStatus("error");
          setMessage(formatPravaError(error));
        }
      } finally {
        pollInFlight = false;
      }
    }

    pollTimer = window.setInterval(() => void checkResultOnce(), 3000);

    void start().catch((error: unknown) => {
      if (!cancelled) {
        setStatus("error");
        setMessage(formatPravaError(error));
      }
    });

    return () => {
      cancelled = true;
      stopPolling();
      sdkRef.current?.destroy();
      sdkRef.current = null;
    };
  }, [returnPath, router, sessionId]);

  return (
    <section className="prava-payment-box mt-6 overflow-hidden rounded-[1.25rem] border border-[color:var(--line)] bg-[color:var(--surface-strong)]">
      <div className="flex items-start gap-3 p-4 text-sm text-[color:var(--muted)]">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[color:var(--accent)]" aria-hidden="true" />
        <p>{message}</p>
      </div>
      {status === "loading" || status === "checking" ? (
        <div className="flex items-center gap-2 border-t border-[color:var(--line)] px-4 py-3 text-sm text-[color:var(--muted)]">
          <LoaderCircle className="size-4 animate-spin text-[color:var(--accent)]" aria-hidden="true" />
          Loading secure payment form
        </div>
      ) : null}
      {status === "requires_action" && actionUrl ? (
        <div className="border-t border-[color:var(--line)] px-4 py-4 text-sm text-[color:var(--muted)]">
          <a href={actionUrl} className="font-semibold text-[color:var(--accent-light)] underline underline-offset-4">Continue bank verification</a>
        </div>
      ) : null}
      <div ref={containerRef} className="prava-embed-box h-[min(44rem,calc(100svh-13rem))] min-h-[34rem] overflow-hidden border-t border-[color:var(--line)] bg-[color:var(--paper)]" />
    </section>
  );
}
