import { NextResponse } from "next/server";

import { verifyLinqWebhook } from "@/lib/linq";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const eventId = request.headers.get("webhook-id") ?? "";
  const timestamp = request.headers.get("webhook-timestamp") ?? "";
  const signature = request.headers.get("webhook-signature") ?? "";

  if (!verifyLinqWebhook({ rawBody, eventId, timestamp, signature })) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient() as any;
  const { error } = await admin.from("settlement_webhook_events").insert({ provider: "linq", event_id: eventId });
  if (error?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (error) return NextResponse.json({ error: "Webhook could not be recorded." }, { status: 500 });

  return NextResponse.json({ received: true });
}
