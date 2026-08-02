import "server-only";

import crypto from "node:crypto";

import { ProviderConfigurationError, ProviderRequestError } from "@/lib/provider-errors";

type LinqMessageResponse = {
  chat?: { id?: string };
  message?: { id?: string; delivery_status?: string };
};

function getLinqConfig() {
  const apiKey = process.env.LINQ_API_KEY;
  const from = process.env.LINQ_FROM_NUMBER;
  if (!apiKey || !from) {
    throw new ProviderConfigurationError("linq", "LINQ_API_KEY and LINQ_FROM_NUMBER are not configured.");
  }
  return { apiKey, from, baseUrl: (process.env.LINQ_API_BASE_URL ?? "https://api.linqapp.com/api/partner/v3").replace(/\/$/, "") };
}

async function linqRequest<T>(path: string, body: unknown) {
  const { apiKey, baseUrl } = getLinqConfig();
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
  if (!response.ok) {
    throw new ProviderRequestError("linq", response.status, payload?.message ?? payload?.error ?? "Linq request failed.");
  }
  return payload as T;
}

export async function sendLinqSettlementNotification(input: {
  phoneE164: string;
  amountLabel: string;
  breakdown: string;
  paymentUrl: string;
  settlementId: string;
  notificationId: string;
}) {
  const { from } = getLinqConfig();
  // Linq replies never approve a payment; only the Prava passkey flow can do that.
  const idempotencyKey = `zoosh-settlement-${input.settlementId}-${input.notificationId}`;
  const first = await linqRequest<LinqMessageResponse>("/chats", {
    from,
    to: [input.phoneE164],
    message: {
      idempotency_key: `${idempotencyKey}-intro`,
      parts: [{ type: "text", value: `Zoosh settlement: you have ${input.amountLabel} to pay for your outing. ${input.breakdown ? `This covers ${input.breakdown}.` : ""}` }],
    },
  });

  const chatId = first.chat?.id;
  if (!chatId) {
    throw new ProviderRequestError("linq", 502, "Linq did not return a chat id.");
  }

  const followUp = await linqRequest<LinqMessageResponse>(`/chats/${encodeURIComponent(chatId)}/messages`, {
    message: {
      idempotency_key: `${idempotencyKey}-link`,
      parts: [{ type: "text", value: `Review and approve the payment: ${input.paymentUrl}` }],
    },
  });

  return {
    chatId,
    messageId: followUp.message?.id ?? first.message?.id ?? null,
  };
}

export function verifyLinqWebhook(input: { rawBody: string; eventId: string; timestamp: string; signature: string }) {
  const secret = process.env.LINQ_WEBHOOK_SECRET;
  if (!secret || !input.eventId || !input.timestamp || !input.signature) return false;
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > 300) return false;

  const expected = crypto.createHmac("sha256", secret).update(`${input.eventId}.${input.timestamp}.${input.rawBody}`).digest("base64");
  const signatures = input.signature.split(" ").map((value) => value.replace(/^v1,/, ""));
  return signatures.some((candidate) => {
    const expectedBuffer = Buffer.from(expected, "utf8");
    const candidateBuffer = Buffer.from(candidate, "utf8");
    return expectedBuffer.length === candidateBuffer.length && crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
  });
}
