"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, ShieldCheck } from "lucide-react";

type SettlementChargeProps = {
  sessionId: string;
};

function browserDetails() {
  return {
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
}

export function SettlementCharge({ sessionId }: SettlementChargeProps) {
  const [message, setMessage] = useState("Finishing the secure payment...");
  const [actionUrl, setActionUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/settlements/${sessionId}/charge`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ browser: browserDetails() }),
    }).then(async (response) => {
      const payload = (await response.json().catch(() => null)) as { status?: string; actionUrl?: string; error?: { message?: string } } | null;
      if (cancelled) return;
      if (!response.ok && response.status !== 202) {
        setMessage(payload?.error?.message ?? "The final payment could not be started.");
      } else if (payload?.status === "requires_action" && payload.actionUrl) {
        setActionUrl(payload.actionUrl);
        setMessage("Razorpay needs one final bank verification before the payment can finish.");
      } else if (payload?.status === "charged") {
        setMessage("Payment confirmed. Zoosh is distributing the amount to the group.");
      } else if (payload?.status === "declined") {
        setMessage("Razorpay declined the payment.");
      } else {
        setMessage("Payment is being confirmed by Razorpay.");
      }
    }).catch(() => {
      if (!cancelled) setMessage("The final payment could not be started. You can refresh and try again.");
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div className="mt-6 flex items-start gap-3 text-sm font-semibold text-[color:var(--accent-light)]">
      {actionUrl ? <ShieldCheck className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> : <LoaderCircle className="mt-0.5 size-5 shrink-0 animate-spin" aria-hidden="true" />}
      <div>
        <p>{message}</p>
        {actionUrl ? <a href={actionUrl} className="mt-2 inline-block underline underline-offset-4">Continue bank verification</a> : null}
      </div>
    </div>
  );
}
