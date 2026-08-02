import "server-only";

import crypto from "node:crypto";

import { ProviderConfigurationError, ProviderRequestError } from "@/lib/provider-errors";

type RazorpayTransfer = {
  id: string;
  status?: string;
};

export type RazorpayPayment = {
  id: string;
  order_id?: string | null;
  status?: "created" | "authorized" | "captured" | "refunded" | "failed" | string;
  error_code?: string | null;
  error_description?: string | null;
};

export type RazorpayPaymentAction = {
  action?: string;
  url?: string;
};

export type RazorpayServerPaymentResponse = {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  next?: RazorpayPaymentAction[];
};

export type RazorpayBrowserDetails = {
  javaEnabled: boolean;
  javascriptEnabled: boolean;
  timezoneOffset: number;
  colorDepth: number;
  screenWidth: number;
  screenHeight: number;
  language: string;
  userAgent: string;
  referrer?: string;
};

function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new ProviderConfigurationError("razorpay", "RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are not configured.");
  }
  return { keyId, keySecret };
}

async function razorpayRequest<T>(path: string, init: RequestInit = {}) {
  const { keyId, keySecret } = getRazorpayConfig();
  const response = await fetch(`https://api.razorpay.com${path}`, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as (T & { error?: { description?: string } }) | null;
  if (!response.ok) {
    throw new ProviderRequestError("razorpay", response.status, body?.error?.description ?? "Razorpay request failed.");
  }
  return body as T;
}

export async function createRazorpayOrder(input: {
  amountPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}) {
  return razorpayRequest<{ id: string; status?: string }>("/v1/orders", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      receipt: input.receipt.slice(0, 40),
      partial_payment: false,
      notes: input.notes,
    }),
  });
}

export async function createRazorpayServerCardPayment(input: {
  amountPaise: number;
  orderId: string;
  email: string;
  contact: string;
  cardholderName: string;
  credential: {
    token: string;
    dynamicCvv: string;
    expiryMonth: string;
    expiryYear: string;
  };
  browser: RazorpayBrowserDetails;
  ip: string;
  callbackUrl: string;
  referrer: string;
}) {
  return razorpayRequest<RazorpayServerPaymentResponse>("/v1/payments/create/json", {
    method: "POST",
    body: JSON.stringify({
      amount: input.amountPaise,
      currency: "INR",
      contact: input.contact,
      email: input.email,
      order_id: input.orderId,
      method: "card",
      card: {
        number: input.credential.token.replace(/\s+/g, ""),
        name: input.cardholderName,
        expiry_month: input.credential.expiryMonth,
        expiry_year: input.credential.expiryYear.slice(-2),
        cvv: input.credential.dynamicCvv,
      },
      authentication: {
        authentication_channel: "browser",
      },
      browser: {
        java_enabled: input.browser.javaEnabled,
        javascript_enabled: input.browser.javascriptEnabled,
        timezone_offset: input.browser.timezoneOffset,
        color_depth: input.browser.colorDepth,
        screen_width: input.browser.screenWidth,
        screen_height: input.browser.screenHeight,
        language: input.browser.language,
      },
      ip: input.ip,
      user_agent: input.browser.userAgent,
      referrer: input.referrer,
      callback_url: input.callbackUrl,
    }),
  });
}

export async function getRazorpayPayment(paymentId: string) {
  return razorpayRequest<RazorpayPayment>(`/v1/payments/${encodeURIComponent(paymentId)}`);
}

export async function captureRazorpayPayment(input: { paymentId: string; amountPaise: number }) {
  return razorpayRequest<RazorpayPayment>(`/v1/payments/${encodeURIComponent(input.paymentId)}/capture`, {
    method: "POST",
    body: JSON.stringify({ amount: input.amountPaise, currency: "INR" }),
  });
}

export async function createRazorpayTransfer(input: {
  accountId: string;
  amountPaise: number;
  referenceId: string;
  notes?: Record<string, string>;
}) {
  return razorpayRequest<RazorpayTransfer>("/v1/transfers", {
    method: "POST",
    headers: {
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
}

export async function createRazorpayPaymentTransfer(input: {
  paymentId: string;
  accountId: string;
  amountPaise: number;
  referenceId: string;
}) {
  const body = await razorpayRequest<{ items?: RazorpayTransfer[] }>(`/v1/payments/${encodeURIComponent(input.paymentId)}/transfers`, {
    method: "POST",
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

export function verifyRazorpayPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const { keySecret } = getRazorpayConfig();
  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(signature, "utf8");
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}
