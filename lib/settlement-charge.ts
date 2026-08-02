import "server-only";

import {
  captureRazorpayPayment,
  createRazorpayOrder,
  createRazorpayServerCardPayment,
  getRazorpayPayment,
  type RazorpayBrowserDetails,
} from "@/lib/razorpay";
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
  payouts?: Array<{ payoutId: string; status: string; transferId?: string }>;
};

function getAppUrl(requestUrl?: string) {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (requestUrl) return new URL(requestUrl).origin;
  throw new Error("APP_URL is required for Razorpay payment callbacks.");
}

function getRequestIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp;
  if (!ip) throw new Error("The payment request did not include the payer IP address.");
  return ip;
}

function getCardholderName(user: { user_metadata?: Record<string, unknown> | null; email?: string | null }) {
  const metadata = user.user_metadata ?? {};
  const name = [metadata.full_name, metadata.name]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0);
  return (name ?? user.email?.split("@")[0] ?? "Zoosh member").trim().slice(0, 100);
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
  if (result.status !== "awaiting_result") {
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
    contact: contact.phone_e164,
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
      // The local decline is authoritative; a later reconciliation can retry Prava reporting.
    }
  }
}

async function finalizeCapturedPayment(input: {
  admin: any;
  session: ChargeSession;
  paymentId: string;
  orderId: string;
}) : Promise<SettlementChargeResult> {
  const payment = await getRazorpayPayment(input.paymentId);
  if (payment.order_id && payment.order_id !== input.orderId) {
    throw new Error("Razorpay returned a payment for a different order.");
  }

  let paymentStatus = payment.status;
  if (paymentStatus === "failed") {
    const reason = payment.error_description ?? payment.error_code ?? "Razorpay declined the payment.";
    await markDeclined(input.admin, input.session, reason);
    return { status: "declined", paymentId: input.paymentId };
  }

  if (paymentStatus === "authorized") {
    const captured = await captureRazorpayPayment({
      paymentId: input.paymentId,
      amountPaise: input.session.total_amount_paise,
    });
    paymentStatus = captured.status;
  }

  if (paymentStatus !== "captured") {
    return { status: "processing", paymentId: input.paymentId };
  }

  const transactionRef = await getPravaTransactionRef(input.session);
  const { error } = await input.admin.rpc("mark_settlement_session_charged", {
    p_session_id: input.session.id,
    p_provider_payment_id: input.paymentId,
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
  return { status: "charged", paymentId: input.paymentId, payouts };
}

export async function initiateSettlementCharge(input: {
  sessionId: string;
  user: { id: string; user_metadata?: Record<string, unknown> | null; email?: string | null };
  browser: RazorpayBrowserDetails;
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
    return { status: "processing", paymentId: session?.provider_payment_id ?? undefined };
  }

  try {
    if (session.provider_payment_id) {
      if (!session.provider_order_id) throw new Error("The existing Razorpay payment is missing its order reference.");
      return finalizeCapturedPayment({
        admin,
        session,
        paymentId: session.provider_payment_id,
        orderId: session.provider_order_id,
      });
    }

    const [credential, payer] = await Promise.all([getPravaCredential(session), getPayer(admin, session)]);
    const ip = getRequestIp(input.request);
    let orderId = session.provider_order_id;
    if (!orderId) {
      const order = await createRazorpayOrder({
        amountPaise: session.total_amount_paise,
        receipt: session.id,
        notes: { zoosh_settlement_id: session.id },
      });
      orderId = order.id;
      const { data: orderUpdate, error } = await admin.from("settlement_sessions").update({ provider_order_id: orderId, updated_at: new Date().toISOString() }).eq("id", session.id).eq("status", "approved_awaiting_charge").select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!orderUpdate) throw new Error("The settlement changed before the Razorpay order could be saved.");
    }

    const payment = await createRazorpayServerCardPayment({
      amountPaise: session.total_amount_paise,
      orderId,
      email: payer.email,
      contact: payer.contact,
      cardholderName: payer.name,
      credential,
      browser: input.browser,
      ip,
      callbackUrl: `${getAppUrl(input.request.url)}/api/webhooks/razorpay/s2s/${session.id}`,
      referrer: input.browser.referrer || getAppUrl(input.request.url),
    });
    const paymentId = payment.razorpay_payment_id;
    if (!paymentId) throw new Error("Razorpay did not return a payment id.");
    const { data: paymentUpdate, error: paymentUpdateError } = await admin.from("settlement_sessions").update({ provider_payment_id: paymentId, updated_at: new Date().toISOString() }).eq("id", session.id).eq("status", "approved_awaiting_charge").select("id").maybeSingle();
    if (paymentUpdateError) throw new Error(paymentUpdateError.message);
    if (!paymentUpdate) throw new Error("The settlement changed before the Razorpay payment could be saved.");

    const action = payment.next?.find((candidate) => (candidate.action === "redirect" || candidate.action === "otp_generate") && typeof candidate.url === "string" && /^https?:\/\//.test(candidate.url));
    if (action?.url) return { status: "requires_action", paymentId, actionUrl: action.url };

    session = { ...session, provider_order_id: orderId, provider_payment_id: paymentId };
    return finalizeCapturedPayment({ admin, session, paymentId, orderId });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Razorpay could not start the payment.";
    await admin.rpc("release_settlement_charge", { p_session_id: session.id, p_failure_reason: reason });
    throw error;
  }
}

export async function handleRazorpayS2SCallback(input: {
  sessionId: string;
  paymentId: string;
  orderId: string;
}) {
  const admin = createSupabaseAdminClient() as any;
  const session = await getSession(admin, input.sessionId);
  if (!session) throw new Error("Settlement session not found.");
  if (!session.provider_order_id || session.provider_order_id !== input.orderId) throw new Error("Razorpay order does not match the settlement.");
  if (session.status === "charged") return { status: "charged" as const, paymentId: input.paymentId };
  return finalizeCapturedPayment({ admin, session, paymentId: input.paymentId, orderId: input.orderId });
}

export async function markRazorpayCallbackVerified(sessionId: string) {
  const admin = createSupabaseAdminClient() as any;
  await admin.from("settlement_sessions").update({ provider_callback_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sessionId);
}
