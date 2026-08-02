import "server-only";

import {
  createCashfreeOrder,
  createCashfreeTokenPayment,
  getCashfreeOrder,
  getCashfreePayments,
  getCashfreePaymentStatus,
  type CashfreeBrowserDetails,
} from "@/lib/cashfree";
import { ProviderRequestError } from "@/lib/provider-errors";
import { getAppUrl } from "@/lib/app-url";
import {
  extractPravaCredential,
  getPravaPaymentResult,
  reportPravaStatus,
} from "@/lib/prava";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { distributeChargedSettlement } from "@/lib/settlement-distribution";

type ChargeSession = {
  id: string;
  debtor_id: string;
  subgroup_id: string;
  total_amount_paise: number;
  status: string;
  prava_session_id: string | null;
  provider_order_id: string | null;
  provider_payment_id: string | null;
};

export type SettlementChargeResult = {
  status: "processing" | "requires_action" | "charged" | "declined";
  paymentId?: string;
  actionUrl?: string;
  message?: string;
  payouts?: Array<{ payoutId: string; status: string; transferId?: string }>;
};

function getCardholderName(user: { user_metadata?: Record<string, unknown> | null; email?: string | null }) {
  const metadata = user.user_metadata ?? {};
  const name = [metadata.full_name, metadata.name]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return (name ?? user.email?.split("@")[0] ?? "Zoosh member").trim().slice(0, 100);
}

function getIndianPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (!/^\d{10}$/.test(local)) {
    throw new Error("Cashfree requires an Indian 10-digit phone number. Update it in Profile first.");
  }
  return local;
}

async function getSession(admin: any, sessionId: string) {
  const { data, error } = await admin
    .from("settlement_sessions")
    .select("id, debtor_id, subgroup_id, total_amount_paise, status, prava_session_id, provider_order_id, provider_payment_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ChargeSession | null;
}

async function getPravaCredential(session: ChargeSession) {
  if (!session.prava_session_id) throw new Error("The Prava payment session has not started.");
  const result = await getPravaPaymentResult(session.prava_session_id);
  if (result.status === "failed") {
    throw new Error(result.transactions?.[0]?.error?.message ?? "Prava declined the payment authorization.");
  }
  if (result.status !== "awaiting_result" && result.status !== "completed") {
    throw new Error("The Prava payment credential is not ready yet.");
  }
  const credential = extractPravaCredential(result);
  if (!credential) throw new Error("Prava did not return a usable payment credential.");
  return credential;
}

async function getPayer(admin: any, session: ChargeSession) {
  const [{ data: authUser, error: authError }, { data: contact }] = await Promise.all([
    admin.auth.admin.getUserById(session.debtor_id),
    admin.from("notification_contacts").select("phone_e164").eq("user_id", session.debtor_id).maybeSingle(),
  ]);
  if (authError || !authUser?.user?.email) throw new Error("The payer account needs an email before payment can start.");
  if (!contact?.phone_e164) throw new Error("Add your phone number in Profile before completing this payment.");
  return {
    email: authUser.user.email,
    contact: getIndianPhone(contact.phone_e164),
    name: getCardholderName(authUser.user),
  };
}

async function getPravaTransactionRef(session: ChargeSession) {
  if (!session.prava_session_id) throw new Error("The Prava payment session has not started.");
  const result = await getPravaPaymentResult(session.prava_session_id);
  const credential = extractPravaCredential(result);
  if (!credential) throw new Error("The Prava transaction reference is not available yet.");
  return credential.txnRefId;
}

async function markDeclined(admin: any, session: ChargeSession, reason: string) {
  await admin.rpc("mark_settlement_session_declined", {
    p_session_id: session.id,
    p_failure_reason: reason,
  });

  if (session.prava_session_id) {
    try {
      const transactionRef = await getPravaTransactionRef(session);
      await reportPravaStatus(session.prava_session_id, transactionRef, "DECLINED");
    } catch {
      // The local decline remains authoritative; a later reconciliation can retry Prava reporting.
    }
  }
}

async function getCashfreePaymentForOrder(orderId: string, paymentId?: string | null) {
  const payments = await getCashfreePayments(orderId);
  const matching = paymentId ? payments.find((payment) => String(payment.cf_payment_id) === paymentId) : undefined;
  return matching ?? [...payments].sort((left, right) => {
    const rightTime = right.payment_time ? Date.parse(right.payment_time) : 0;
    const leftTime = left.payment_time ? Date.parse(left.payment_time) : 0;
    return rightTime - leftTime || String(right.cf_payment_id ?? "").localeCompare(String(left.cf_payment_id ?? ""));
  })[0];
}

async function finalizeCashfreePayment(input: {
  admin: any;
  session: ChargeSession;
  paymentId?: string | null;
  orderId: string;
}) : Promise<SettlementChargeResult> {
  const payment = await getCashfreePaymentForOrder(input.orderId, input.paymentId);
  const paymentStatus = getCashfreePaymentStatus(payment);
  if (!paymentStatus.paymentId) return { status: "processing" };
  if (payment?.order_id && payment.order_id !== input.orderId) {
    throw new Error("Cashfree returned a payment for a different order.");
  }

  const normalizedStatus = paymentStatus.status.toUpperCase();
  if (["FAILED", "CANCELLED", "VOID", "USER_DROPPED"].includes(normalizedStatus)) {
    const reason = paymentStatus.message ?? "Cashfree declined the payment.";
    await markDeclined(input.admin, input.session, reason);
    return { status: "declined", paymentId: paymentStatus.paymentId, message: reason };
  }

  if (normalizedStatus !== "SUCCESS") {
    return {
      status: "processing",
      paymentId: paymentStatus.paymentId,
      message: "Cashfree is still confirming the payment.",
    };
  }

  if (typeof paymentStatus.amount === "number" && Math.round(paymentStatus.amount * 100) !== input.session.total_amount_paise) {
    throw new Error("Cashfree returned a payment amount that does not match the settlement.");
  }

  const transactionRef = await getPravaTransactionRef(input.session);
  const { error } = await input.admin.rpc("mark_settlement_session_charged", {
    p_session_id: input.session.id,
    p_provider_payment_id: paymentStatus.paymentId,
    p_provider_transaction_ref: transactionRef,
  });
  if (error) {
    const current = await getSession(input.admin, input.session.id);
    if (current?.status !== "charged") throw new Error(error.message);
  }

  if (input.session.prava_session_id) {
    try {
      await reportPravaStatus(input.session.prava_session_id, transactionRef, "APPROVED");
    } catch {
      // The captured payment remains recorded and can be reconciled safely.
    }
  }

  const payouts = await distributeChargedSettlement(input.session.id);
  return { status: "charged", paymentId: paymentStatus.paymentId, payouts };
}

async function ensureCashfreeOrder(input: {
  admin: any;
  session: ChargeSession;
  payer: { email: string; contact: string; name: string };
  requestUrl: string;
}) {
  const orderId = input.session.provider_order_id ?? `zoosh_${input.session.id.replace(/-/g, "")}`;
  let order;
  try {
    order = await createCashfreeOrder({
      orderId,
      amountPaise: input.session.total_amount_paise,
      customerId: input.session.debtor_id,
      customerName: input.payer.name,
      customerEmail: input.payer.email,
      customerPhone: input.payer.contact,
      returnUrl: `${getAppUrl(input.requestUrl)}/settlements/${input.session.id}?cashfree=return`,
      notifyUrl: `${getAppUrl(input.requestUrl)}/api/webhooks/cashfree/payment`,
      settlementId: input.session.id,
    });
  } catch (error) {
    if (!(error instanceof ProviderRequestError && error.status === 409) && !(error instanceof Error && error.message.toLowerCase().includes("already"))) throw error;
    order = await getCashfreeOrder(orderId);
  }

  const { data, error } = await input.admin
    .from("settlement_sessions")
    .update({ provider_order_id: orderId, updated_at: new Date().toISOString() })
    .eq("id", input.session.id)
    .eq("status", "approved_awaiting_charge")
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("The settlement changed before the Cashfree order could be saved.");
  return { orderId, paymentSessionId: order.payment_session_id };
}

export async function initiateSettlementCharge(input: {
  sessionId: string;
  user: { id: string; user_metadata?: Record<string, unknown> | null; email?: string | null };
  browser: CashfreeBrowserDetails;
  request: Request;
}) : Promise<SettlementChargeResult> {
  const admin = createSupabaseAdminClient() as any;
  let session = await getSession(admin, input.sessionId);
  if (!session) throw new Error("Settlement session not found.");
  if (session.debtor_id !== input.user.id) throw new Error("Only the debtor can complete this payment.");
  if (session.status === "charged") return { status: "charged", paymentId: session.provider_payment_id ?? undefined };
  if (session.status !== "approved_awaiting_charge") throw new Error("The settlement is not ready for payment.");

  const { data: claim, error: claimError } = await admin.rpc("claim_settlement_charge", { p_session_id: session.id });
  if (claimError) throw new Error(claimError.message);
  if (claim !== true) {
    session = await getSession(admin, session.id);
    if (session?.status === "charged") return { status: "charged", paymentId: session.provider_payment_id ?? undefined };
    if (session?.provider_order_id && session.provider_payment_id) {
      return finalizeCashfreePayment({
        admin,
        session,
        paymentId: session.provider_payment_id,
        orderId: session.provider_order_id,
      });
    }
    return { status: "processing", paymentId: session?.provider_payment_id ?? undefined };
  }

  try {
    const order = session.provider_order_id
      ? { orderId: session.provider_order_id, paymentSessionId: (await getCashfreeOrder(session.provider_order_id)).payment_session_id }
      : await ensureCashfreeOrder({ admin, session, payer: await getPayer(admin, session), requestUrl: input.request.url });

    if (session.provider_payment_id) {
      return finalizeCashfreePayment({
        admin,
        session,
        paymentId: session.provider_payment_id,
        orderId: order.orderId,
      });
    }

    const existingPayment = await getCashfreePaymentForOrder(order.orderId);
    if (existingPayment?.cf_payment_id != null) {
      const existingPaymentId = String(existingPayment.cf_payment_id);
      const { data: paymentUpdate, error: paymentUpdateError } = await admin
        .from("settlement_sessions")
        .update({ provider_payment_id: existingPaymentId, updated_at: new Date().toISOString() })
        .eq("id", session.id)
        .eq("status", "approved_awaiting_charge")
        .select("id")
        .maybeSingle();
      if (paymentUpdateError) throw new Error(paymentUpdateError.message);
      if (!paymentUpdate) throw new Error("The settlement changed before the existing Cashfree payment could be saved.");
      session = { ...session, provider_order_id: order.orderId, provider_payment_id: existingPaymentId };
      return finalizeCashfreePayment({ admin, session, paymentId: existingPaymentId, orderId: order.orderId });
    }

    const credential = await getPravaCredential(session);
    const payment = await createCashfreeTokenPayment({
      paymentSessionId: order.paymentSessionId,
      credential,
      cardholderName: getCardholderName(input.user),
      browser: input.browser,
      orderId: order.orderId,
      idempotencyKey: session.id,
    });
    const paymentId = payment.cf_payment_id == null ? undefined : String(payment.cf_payment_id);
    if (!paymentId) throw new Error("Cashfree did not return a payment id.");
    const { data: paymentUpdate, error: paymentUpdateError } = await admin
      .from("settlement_sessions")
      .update({ provider_payment_id: paymentId, updated_at: new Date().toISOString() })
      .eq("id", session.id)
      .eq("status", "approved_awaiting_charge")
      .select("id")
      .maybeSingle();
    if (paymentUpdateError) throw new Error(paymentUpdateError.message);
    if (!paymentUpdate) throw new Error("The settlement changed before the Cashfree payment could be saved.");

    const actionUrl = payment.data?.url;
    if (actionUrl && /^https?:\/\//.test(actionUrl)) {
      return { status: "requires_action", paymentId, actionUrl, message: "Continue in Cashfree to complete bank verification." };
    }

    session = { ...session, provider_order_id: order.orderId, provider_payment_id: paymentId };
    return finalizeCashfreePayment({ admin, session, paymentId, orderId: order.orderId });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Cashfree could not start the payment.";
    await admin.rpc("release_settlement_charge", { p_session_id: session.id, p_failure_reason: reason });
    throw error;
  }
}

export async function handleCashfreePaymentWebhook(input: {
  orderId: string;
  paymentId: string;
  status: string;
}) {
  const admin = createSupabaseAdminClient() as any;
  const session = await getSessionByOrderId(admin, input.orderId);
  if (!session) throw new Error("Settlement session not found for Cashfree order.");
  if (session.status === "charged") return { status: "charged" as const, paymentId: session.provider_payment_id ?? input.paymentId };
  if (["FAILED", "CANCELLED", "VOID", "USER_DROPPED"].includes(input.status.toUpperCase())) {
    await markDeclined(admin, session, `Cashfree reported ${input.status.toLowerCase()} for the payment.`);
    return { status: "declined" as const, paymentId: input.paymentId };
  }
  if (input.status !== "SUCCESS") return { status: "processing" as const, paymentId: input.paymentId };
  return finalizeCashfreePayment({ admin, session, paymentId: input.paymentId, orderId: input.orderId });
}

async function getSessionByOrderId(admin: any, orderId: string) {
  const { data, error } = await admin
    .from("settlement_sessions")
    .select("id, debtor_id, subgroup_id, total_amount_paise, status, prava_session_id, provider_order_id, provider_payment_id")
    .eq("provider_order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as ChargeSession | null;
}

export async function markCashfreeCallbackVerified(sessionId: string) {
  const admin = createSupabaseAdminClient() as any;
  await admin
    .from("settlement_sessions")
    .update({ provider_callback_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", sessionId);
}
