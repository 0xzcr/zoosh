import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { verifyCashfreeWebhook } from "@/lib/cashfree";
import { handleCashfreePaymentWebhook } from "@/lib/settlement-charge";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CashfreePaymentWebhook = {
  type?: string;
  data?: {
    order?: { order_id?: unknown; order_amount?: unknown };
    payment?: { cf_payment_id?: unknown; payment_status?: unknown; payment_amount?: unknown };
  };
};

function readString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-webhook-signature") ?? "";
  const timestamp = request.headers.get("x-webhook-timestamp") ?? "";
  try {
    if (!verifyCashfreeWebhook({ kind: "pg", rawBody, signature, timestamp })) {
      return NextResponse.json({ error: "Invalid Cashfree webhook signature." }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cashfree webhook is not configured." }, { status: 503 });
  }

  let event: CashfreePaymentWebhook;
  try {
    event = JSON.parse(rawBody) as CashfreePaymentWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
  }
  const orderId = readString(event.data?.order?.order_id);
  const paymentId = readString(event.data?.payment?.cf_payment_id);
  const status = readString(event.data?.payment?.payment_status).toUpperCase();
  if (!orderId || !paymentId || !status) return NextResponse.json({ error: "Cashfree webhook is missing payment identifiers." }, { status: 400 });

  const eventId = request.headers.get("x-idempotency-key") ?? `${event.type ?? "payment"}:${orderId}:${paymentId}:${status}`;
  const admin = createSupabaseAdminClient() as any;
  try {
    const result = await handleCashfreePaymentWebhook({ orderId, paymentId, status });
    const { error: eventError } = await admin.from("settlement_webhook_events").insert({ provider: "cashfree_pg", event_id: eventId || crypto.randomUUID() });
    if (eventError?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    if (eventError) return NextResponse.json({ error: "Webhook could not be recorded." }, { status: 500 });
    return NextResponse.json({ received: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cashfree payment webhook processing failed." }, { status: 503 });
  }
}
