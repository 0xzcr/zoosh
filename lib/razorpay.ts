import "server-only";

import crypto from "node:crypto";

import { ProviderConfigurationError, ProviderRequestError } from "@/lib/provider-errors";

type RazorpayTransfer = {
  id: string;
  status?: string;
};

function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new ProviderConfigurationError("razorpay", "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not configured.");
  }
  return { keyId, keySecret };
}

export async function createRazorpayTransfer(input: {
  accountId: string;
  amountPaise: number;
  referenceId: string;
  notes?: Record<string, string>;
}) {
  const { keyId, keySecret } = getRazorpayConfig();
  const response = await fetch("https://api.razorpay.com/v1/transfers", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      "X-Transfer-Idempotency": input.referenceId,
    },
    body: JSON.stringify({
      account: input.accountId,
      amount: input.amountPaise,
      currency: "INR",
      notes: {
        zoosh_reference_id: input.referenceId,
        ...(input.notes ?? {}),
      },
    }),
  });

  const body = (await response.json().catch(() => null)) as RazorpayTransfer & { error?: { description?: string } };
  if (!response.ok) {
    throw new ProviderRequestError("razorpay", response.status, body?.error?.description ?? "Razorpay transfer failed.");
  }

  return body;
}

export async function createRazorpayPaymentTransfer(input: {
  paymentId: string;
  accountId: string;
  amountPaise: number;
  referenceId: string;
}) {
  const { keyId, keySecret } = getRazorpayConfig();
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(input.paymentId)}/transfers`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transfers: [{
        account: input.accountId,
        amount: input.amountPaise,
        currency: "INR",
        notes: {
          zoosh_reference_id: input.referenceId,
        },
      }],
    }),
  });
  const body = (await response.json().catch(() => null)) as { items?: RazorpayTransfer[]; error?: { description?: string } } | null;
  if (!response.ok) {
    throw new ProviderRequestError("razorpay", response.status, body?.error?.description ?? "Razorpay payment transfer failed.");
  }
  const transfer = body?.items?.[0];
  if (!transfer?.id) throw new ProviderRequestError("razorpay", 502, "Razorpay did not return a transfer id.");
  return transfer;
}

export function verifyRazorpayWebhook(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
