import { NextResponse } from "next/server";

import { getPayoutIdFromCashfreeTransferId, verifyCashfreeWebhook } from "@/lib/cashfree";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type CashfreePayoutWebhook = {
  type?: string;
  event_time?: unknown;
  data?: {
    transfer_id?: unknown;
    cf_transfer_id?: unknown;
    status?: unknown;
    status_code?: unknown;
    status_description?: unknown;
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
    if (!verifyCashfreeWebhook({ kind: "payout", rawBody, signature, timestamp })) {
      return NextResponse.json({ error: "Invalid Cashfree webhook signature." }, { status: 401 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Cashfree webhook is not configured." }, { status: 503 });
  }

  let event: CashfreePayoutWebhook;
  try {
    event = JSON.parse(rawBody) as CashfreePayoutWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
  }
  const transferId = readString(event.data?.transfer_id);
  const type = readString(event.type);
  const status = readString(event.data?.status).toUpperCase();
  const statusCode = readString(event.data?.status_code).toUpperCase();
  if (!transferId || !type) return NextResponse.json({ error: "Cashfree webhook is missing transfer identifiers." }, { status: 400 });

  const admin = createSupabaseAdminClient() as any;
  const payoutId = getPayoutIdFromCashfreeTransferId(transferId);
  const { data: payout } = await admin
    .from("settlement_payouts")
    .select("id")
    .or(`cashfree_transfer_id.eq.${transferId},id.eq.${payoutId ?? "00000000-0000-0000-0000-000000000000"}`)
    .maybeSingle();
  if (!payout) return NextResponse.json({ received: true, retryable: true }, { status: 202 });

  if (["TRANSFER_ACKNOWLEDGED", "TRANSFER_SUCCESS"].includes(type) && status === "SUCCESS" && statusCode === "COMPLETED") {
    const { error: markPaidError } = await admin.rpc("mark_settlement_payout_paid", { p_payout_id: payout.id, p_transfer_id: transferId });
    if (markPaidError) return NextResponse.json({ error: "Payout acknowledgement could not be saved." }, { status: 503 });
  }

  if (["TRANSFER_FAILED", "TRANSFER_REJECTED"].includes(type)) {
    await admin.from("settlement_payouts").update({
      status: "pending_payout",
      cashfree_transfer_id: null,
      payout_started_at: null,
      failure_reason: readString(event.data?.status_description) || `Cashfree reported ${type.toLowerCase()}.`,
      updated_at: new Date().toISOString(),
    }).eq("id", payout.id).eq("status", "pending_payout");
  }

  if (type === "TRANSFER_REVERSED") {
    await admin.from("settlement_payouts").update({
      status: "pending_payout",
      cashfree_transfer_id: null,
      payout_started_at: null,
      paid_at: null,
      failure_reason: readString(event.data?.status_description) || "Cashfree reversed this payout. It can be retried after the destination is checked.",
      updated_at: new Date().toISOString(),
    }).eq("id", payout.id).in("status", ["pending_payout", "paid"]);
  }

  const eventId = request.headers.get("x-idempotency-key") ?? `${type}:${transferId}:${statusCode}:${readString(event.data?.cf_transfer_id)}:${readString(event.event_time)}`;
  const { error: eventError } = await admin.from("settlement_webhook_events").insert({ provider: "cashfree_payout", event_id: eventId });
  if (eventError?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (eventError) return NextResponse.json({ error: "Webhook could not be recorded." }, { status: 500 });

  return NextResponse.json({ received: true });
}
