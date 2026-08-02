import "server-only";

import { ProviderConfigurationError, ProviderRequestError } from "@/lib/provider-errors";

type PravaSession = {
  session_id: string;
  session_token: string;
  iframe_url: string;
  expires_at?: string;
};

type PravaPaymentResult = {
  session_id: string;
  status: "pending" | "awaiting_result" | "completed" | "failed" | string;
  order_id?: string | null;
  transactions?: Array<{
    txn_id?: string;
    status?: string;
    error?: { code?: string; message?: string };
    line_items?: Array<{
      txn_ref_id?: string;
      status?: string;
      token?: string | null;
      dynamic_cvv?: string | null;
      expiry_month?: string | null;
      expiry_year?: string | null;
    }>;
  }>;
};

export type PravaCredential = {
  txnRefId: string;
  token: string;
  dynamicCvv: string;
  expiryMonth: string;
  expiryYear: string;
};

function getPravaConfig() {
  const secretKey = process.env.PRAVA_SECRET_KEY ?? process.env.MERCHANT_SECRET_KEY;
  const backendUrl = process.env.PRAVA_BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? process.env.BACKEND_URL ?? (secretKey?.startsWith("sk_live_") ? "https://api.prava.space" : "https://sandbox.api.prava.space");

  if (!secretKey) {
    throw new ProviderConfigurationError("prava", "PRAVA_SECRET_KEY is not configured.");
  }

  return { secretKey, backendUrl: backendUrl.replace(/\/$/, "") };
}

function getPravaPublishableKey() {
  const publishableKey = process.env.NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new ProviderConfigurationError("prava", "NEXT_PUBLIC_PRAVA_PUBLISHABLE_KEY is not configured.");
  }
  return publishableKey;
}

async function pravaRequest<T>(path: string, init: RequestInit = {}) {
  const { secretKey, backendUrl } = getPravaConfig();
  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const body = (await response.json().catch(() => null)) as { error?: { message?: string }; message?: string } | null;
  if (!response.ok) {
    throw new ProviderRequestError("prava", response.status, body?.error?.message ?? body?.message ?? "Prava request failed.");
  }

  return body as T;
}

function amountInMajorUnits(amountPaise: number) {
  return (amountPaise / 100).toFixed(2);
}

export function getPravaClientConfig() {
  return { publishableKey: getPravaPublishableKey() };
}

export async function createPravaSettlementSession(input: {
  userId: string;
  email: string;
  phone?: string | null;
  amountPaise: number;
  subgroupId: string;
  subgroupName: string;
  callbackUrl: string;
}) {
  const response = await pravaRequest<PravaSession>("/v1/sessions", {
    method: "POST",
    body: JSON.stringify({
      user_id: input.userId,
      user_email: input.email,
      ...(input.phone ? { user_phone: input.phone } : {}),
      total_amount: amountInMajorUnits(input.amountPaise),
      currency: "INR",
      external_order_ref: `zoosh-settlement-${input.subgroupId}-${input.userId}`,
      callback_url: input.callbackUrl,
      description: `Zoosh settlement for ${input.subgroupName}`,
      purchase_context: [
        {
          merchant_details: {
            name: "Zoosh settlement",
            url: new URL(input.callbackUrl).origin,
            country_code_iso2: "IN",
            category: "Group expense settlement",
          },
          product_details: [
            {
              description: `Settlement for ${input.subgroupName}`,
              unit_price: amountInMajorUnits(input.amountPaise),
              quantity: 1,
            },
          ],
          effective_until_minutes: 15,
        },
      ],
    }),
  });

  return response;
}

export async function getPravaPaymentResult(sessionId: string) {
  return pravaRequest<PravaPaymentResult>(`/v1/sessions/${encodeURIComponent(sessionId)}/payment-result?_t=${Date.now()}`);
}

export async function reportPravaStatus(sessionId: string, txnRefId: string, status: "APPROVED" | "DECLINED") {
  return reportPravaStatusWithAuthorization(sessionId, txnRefId, status);
}

export async function reportPravaStatusWithAuthorization(sessionId: string, txnRefId: string, status: "APPROVED" | "DECLINED", authorizationCode?: string) {
  return pravaRequest(`/v1/sessions/${encodeURIComponent(sessionId)}/report-status`, {
    method: "POST",
    body: JSON.stringify({ txn_ref_id: txnRefId, txn_status: status, ...(authorizationCode ? { authorization_code: authorizationCode } : {}) }),
  });
}

export function extractPravaCredential(result: PravaPaymentResult): PravaCredential | null {
  const lineItem = result.transactions?.[0]?.line_items?.[0];
  if (!lineItem?.txn_ref_id || !lineItem.token || !lineItem.dynamic_cvv || !lineItem.expiry_month || !lineItem.expiry_year) return null;
  return {
    txnRefId: lineItem.txn_ref_id,
    token: lineItem.token,
    dynamicCvv: lineItem.dynamic_cvv,
    expiryMonth: lineItem.expiry_month,
    expiryYear: lineItem.expiry_year,
  };
}
