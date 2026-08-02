import { NextResponse } from "next/server";
import crypto from "node:crypto";

import { verifyRazorpayWebhook } from "@/lib/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature") ?? "";
  if (!verifyRazorpayWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: {
    event?: string;
    payload?: { transfer?: { entity?: { id?: string; status?: string } } };
  };
  try {
    event = JSON.parse(rawBody) as typeof event;
  } catch {
    return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 });
  }
  const eventId = request.headers.get("x-razorpay-event-id") ?? `${event.event ?? "unknown"}:${event.payload?.transfer?.entity?.id ?? crypto.randomUUID()}`;
  const admin = createSupabaseAdminClient() as any;
  const { error: eventError } = await admin.from("settlement_webhook_events").insert({ provider: "razorpay", event_id: eventId });
  if (eventError?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (eventError) return NextResponse.json({ error: "Webhook could not be recorded." }, { status: 500 });

  const transfer = event.payload?.transfer?.entity;
  if (event.event === "transfer.processed" && transfer?.id) {
    const { data: payout } = await admin.from("settlement_payouts").select("id").eq("razorpay_transfer_id", transfer.id).maybeSingle();
    if (payout) {
      await admin.rpc("mark_settlement_payout_paid", { p_payout_id: payout.id, p_transfer_id: transfer.id });
    }
  }

  return NextResponse.json({ received: true });
}
