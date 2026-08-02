import "server-only";

import crypto from "node:crypto";

import { ProviderConfigurationError, ProviderRequestError } from "@/lib/provider-errors";

type CashfreeEnvironment = "sandbox" | "production";

export type CashfreeBrowserDetails = {
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

export type CashfreeCardCredential = {
  token: string;
  dynamicCvv: string;
  expiryMonth: string;
  expiryYear: string;
  cryptogram?: string | null;
  tokenType?: string | null;
  tokenReferenceId?: string | null;
};

type CashfreePayment = {
  cf_payment_id?: string | number;
  order_id?: string;
  payment_status?: string;
  payment_amount?: number;
  payment_message?: string | null;
  payment_time?: string | null;
};

type CashfreeOrder = {
  order_id: string;
  payment_session_id: string;
  order_status?: string;
};

type CashfreeOrderPayResponse = {
  cf_payment_id?: string | number;
  payment_amount?: number;
  payment_method?: string;
  action?: string;
  data?: {
    url?: string;
    payload?: Record<string, string> | null;
    content_type?: string | null;
    method?: string | null;
  };
};

export type CashfreeTransfer = {
  transfer_id: string;
  cf_transfer_id?: string;
  status?: string;
  status_code?: string;
  status_description?: string;
};

function getEnvironment(): CashfreeEnvironment {
  const value = (process.env.CASHFREE_ENV ?? process.env.CASHFREE_MODE ?? "sandbox").trim().toLowerCase();
  if (value === "production" || value === "live") return "production";
  if (value === "sandbox" || value === "test") return "sandbox";
  throw new ProviderConfigurationError("cashfree", "CASHFREE_ENV must be sandbox or production.");
}

function getProviderCredentials(kind: "pg" | "payout") {
  const prefix = kind === "pg" ? "CASHFREE_PG" : "CASHFREE_PAYOUT";
  const clientId = (process.env[`${prefix}_CLIENT_ID`] ?? process.env.CASHFREE_CLIENT_ID)?.trim();
  const clientSecret = (process.env[`${prefix}_CLIENT_SECRET`] ?? process.env.CASHFREE_CLIENT_SECRET)?.trim();
  if (!clientId || !clientSecret) {
    throw new ProviderConfigurationError(
      "cashfree",
      `${prefix}_CLIENT_ID and ${prefix}_CLIENT_SECRET are required.`,
    );
  }
  return { clientId, clientSecret };
}

function getBaseUrl(kind: "pg" | "payout") {
  const environment = getEnvironment();
  const host = environment === "production" ? "https://api.cashfree.com" : "https://sandbox.cashfree.com";
  return `${host}/${kind}`;
}

function getApiVersion(kind: "pg" | "payout") {
  const configured = kind === "pg" ? process.env.CASHFREE_PG_API_VERSION : process.env.CASHFREE_PAYOUT_API_VERSION;
  return configured?.trim() || (kind === "pg" ? "2026-01-01" : "2024-01-01");
}

function majorAmount(amountPaise: number) {
  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new ProviderConfigurationError("cashfree", "Settlement amounts must be positive integer paise.");
  }
  return Number((amountPaise / 100).toFixed(2));
}

function requestId() {
  return crypto.randomUUID();
}

async function cashfreeRequest<T>(kind: "pg" | "payout", path: string, init: RequestInit = {}, options?: { idempotencyKey?: string }) {
  const { clientId, clientSecret } = getProviderCredentials(kind);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("x-api-version", getApiVersion(kind));
  headers.set("x-client-id", clientId);
  headers.set("x-client-secret", clientSecret);
  headers.set("x-request-id", requestId());
  if (options?.idempotencyKey) headers.set("x-idempotency-key", options.idempotencyKey);
  if (kind === "payout") {
    const publicKey = process.env.CASHFREE_PAYOUT_PUBLIC_KEY?.trim();
    if (publicKey) {
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = crypto.publicEncrypt(
        {
          key: publicKey.replace(/\\n/g, "\n"),
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        },
        Buffer.from(`${clientId}.${timestamp}`),
      ).toString("base64");
      headers.set("x-cf-signature", signature);
    }
  }

  const response = await fetch(`${getBaseUrl(kind)}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => null)) as (T & {
    message?: string;
    error?: { message?: string; type?: string };
    errors?: Array<{ message?: string }>;
  }) | null;
  if (!response.ok) {
    const message = body?.error?.message ?? body?.message ?? body?.errors?.[0]?.message ?? `Cashfree ${kind} request failed.`;
    throw new ProviderRequestError("cashfree", response.status, message);
  }
  return body as T;
}

function getCashfreeWebhookSecret(kind: "pg" | "payout") {
  const explicit = kind === "pg" ? process.env.CASHFREE_PG_WEBHOOK_SECRET : process.env.CASHFREE_PAYOUT_WEBHOOK_SECRET;
  const fallback = kind === "pg" ? process.env.CASHFREE_PG_CLIENT_SECRET : process.env.CASHFREE_PAYOUT_CLIENT_SECRET;
  const secret = (explicit ?? fallback)?.trim();
  if (!secret) throw new ProviderConfigurationError("cashfree", `CASHFREE_${kind.toUpperCase()}_WEBHOOK_SECRET is required.`);
  return secret;
}

export function verifyCashfreeWebhook(input: {
  kind: "pg" | "payout";
  rawBody: string;
  signature: string;
  timestamp: string;
}) {
  if (!input.signature || !input.timestamp) return false;
  const expected = crypto
    .createHmac("sha256", getCashfreeWebhookSecret(input.kind))
    .update(`${input.timestamp}${input.rawBody}`)
    .digest("base64");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const signatureBuffer = Buffer.from(input.signature, "utf8");
  return expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
}

export function getCashfreeClientEnvironment(browser: CashfreeBrowserDetails) {
  const userAgent = browser.userAgent.toLowerCase();
  const device = /ipad|tablet|playbook|silk/.test(userAgent)
    ? "tablet"
    : /mobile|iphone|android/.test(userAgent)
      ? "mobile"
      : "desktop";
  const operatingSystem = /android/.test(userAgent)
    ? "android"
    : /iphone|ipad|ipod/.test(userAgent)
      ? "ios"
      : /windows/.test(userAgent)
        ? "windows"
        : /mac os/.test(userAgent)
          ? "macos"
          : /linux/.test(userAgent)
            ? "linux"
            : "others";
  const browserName = /edg\//.test(userAgent)
    ? "edge"
    : /firefox\//.test(userAgent)
      ? "firefox"
      : /chrome\//.test(userAgent)
        ? "chrome"
        : /safari\//.test(userAgent)
          ? "safari"
          : "others";

  return {
    device,
    operatingSystem,
    browser: browserName,
    ...(device === "mobile" ? { renderingType: "mweb" } : {}),
  } as const;
}

export async function createCashfreeOrder(input: {
  orderId: string;
  amountPaise: number;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
  notifyUrl: string;
  settlementId: string;
}) {
  return cashfreeRequest<CashfreeOrder>("pg", "/orders", {
    method: "POST",
    body: JSON.stringify({
      order_id: input.orderId,
      order_amount: majorAmount(input.amountPaise),
      order_currency: "INR",
      customer_details: {
        customer_id: input.customerId,
        customer_name: input.customerName,
        customer_email: input.customerEmail,
        customer_phone: input.customerPhone,
      },
      order_meta: {
        return_url: input.returnUrl,
        notify_url: input.notifyUrl,
      },
      order_note: `Zoosh settlement ${input.settlementId}`,
      order_tags: { zoosh_settlement_id: input.settlementId },
    }),
  }, { idempotencyKey: input.settlementId });
}

export async function getCashfreeOrder(orderId: string) {
  return cashfreeRequest<CashfreeOrder>("pg", `/orders/${encodeURIComponent(orderId)}`);
}

export async function createCashfreeTokenPayment(input: {
  paymentSessionId: string;
  credential: CashfreeCardCredential;
  cardholderName: string;
  browser: CashfreeBrowserDetails;
  orderId: string;
  idempotencyKey: string;
}) {
  if (!input.credential.cryptogram) {
    throw new ProviderConfigurationError(
      "cashfree",
      "Prava did not return the card-network cryptogram required for Cashfree token payments.",
    );
  }
  const environment = getCashfreeClientEnvironment(input.browser);
  return cashfreeRequest<CashfreeOrderPayResponse>("pg", "/orders/sessions", {
    method: "POST",
    headers: {
      "x-client-device": environment.device,
      "x-client-os": environment.operatingSystem,
      "x-client-browser": environment.browser,
      ...(environment.renderingType ? { "x-client-rendering-type": environment.renderingType } : {}),
    },
    body: JSON.stringify({
      payment_session_id: input.paymentSessionId,
      payment_method: {
        card: {
          channel: "link",
          card_number: input.credential.token.replace(/\s+/g, ""),
          card_expiry_mm: input.credential.expiryMonth.padStart(2, "0"),
          card_expiry_yy: input.credential.expiryYear.slice(-2),
          cryptogram: input.credential.cryptogram,
          card_cvv: input.credential.dynamicCvv,
          token_type: input.credential.tokenType ?? "NETWORK_GC_TOKEN",
          ...(input.credential.tokenReferenceId ? { token_requestor_id: input.credential.tokenReferenceId } : {}),
          card_holder_name: input.cardholderName,
          card_display: input.credential.token.slice(-4),
        },
      },
      save_instrument: false,
      transaction_expiry_time: new Date(Date.now() + 15 * 60_000).toISOString(),
    }),
  }, { idempotencyKey: input.idempotencyKey });
}

export async function getCashfreePayments(orderId: string) {
  return cashfreeRequest<CashfreePayment[]>("pg", `/orders/${encodeURIComponent(orderId)}/payments`);
}

export function getCashfreePaymentStatus(payment: CashfreePayment | undefined) {
  return {
    paymentId: payment?.cf_payment_id == null ? undefined : String(payment.cf_payment_id),
    status: payment?.payment_status ?? "NOT_ATTEMPTED",
    amount: payment?.payment_amount,
    message: payment?.payment_message ?? undefined,
  };
}

export async function createCashfreeBeneficiary(input: {
  beneficiaryId: string;
  name: string;
  email: string;
  phone: string;
  bankAccount?: string;
  ifsc?: string;
  vpa?: string;
}) {
  return cashfreeRequest<{ beneficiary_id: string; beneficiary_status?: string; status?: string }>("payout", "/beneficiary", {
    method: "POST",
    body: JSON.stringify({
      beneficiary_id: input.beneficiaryId,
      beneficiary_name: input.name,
      beneficiary_instrument_details: {
        ...(input.bankAccount ? { bank_account_number: input.bankAccount, bank_ifsc: input.ifsc } : {}),
        ...(input.vpa ? { vpa: input.vpa } : {}),
      },
      beneficiary_contact_details: {
        beneficiary_email: input.email,
        beneficiary_phone: input.phone,
        beneficiary_country_code: "+91",
      },
    }),
  });
}

export async function getCashfreeBeneficiary(beneficiaryId: string) {
  return cashfreeRequest<{ beneficiary_id: string; beneficiary_status?: string; status?: string }>(
    "payout",
    `/beneficiary?beneficiary_id=${encodeURIComponent(beneficiaryId)}`,
  );
}

export async function createCashfreeTransfer(input: {
  beneficiaryId: string;
  amountPaise: number;
  transferId: string;
  idempotencyKey: string;
}) {
  return cashfreeRequest<CashfreeTransfer>("payout", "/transfers", {
    method: "POST",
    body: JSON.stringify({
      transfer_id: input.transferId,
      transfer_amount: majorAmount(input.amountPaise),
      beneficiary_details: { beneficiary_id: input.beneficiaryId },
    }),
  }, { idempotencyKey: input.idempotencyKey });
}

export function getCashfreeTransferId(payoutId: string) {
  return `zoosh_${payoutId.replace(/-/g, "")}`;
}

export function getPayoutIdFromCashfreeTransferId(transferId: string) {
  const compactId = transferId.match(/^zoosh_([0-9a-f]{32})$/i)?.[1];
  if (!compactId) return null;
  return `${compactId.slice(0, 8)}-${compactId.slice(8, 12)}-${compactId.slice(12, 16)}-${compactId.slice(16, 20)}-${compactId.slice(20)}`.toLowerCase();
}

export async function getCashfreeTransferStatus(transferId: string) {
  return cashfreeRequest<CashfreeTransfer>("payout", `/transfers?transfer_id=${encodeURIComponent(transferId)}`);
}
