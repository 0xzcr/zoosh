import { NextResponse } from "next/server";

import { distributeChargedSettlement } from "@/lib/settlement-distribution";
import { reportPravaStatus } from "@/lib/prava";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function isAuthorized(request: Request) {
  const token = process.env.SETTLEMENT_WORKER_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { sessionId } = await params;
  const body = (await request.json().catch(() => null)) as { paymentId?: unknown; transactionRef?: unknown } | null;
  const paymentId = typeof body?.paymentId === "string" ? body.paymentId.trim() : "";
  const transactionRef = typeof body?.transactionRef === "string" ? body.transactionRef.trim() : "";
  if (!paymentId || !transactionRef) return NextResponse.json({ error: "paymentId and transactionRef are required." }, { status: 400 });

  const admin = createSupabaseAdminClient() as any;
  const { data: session } = await admin.from("settlement_sessions").select("id, prava_session_id, status").eq("id", sessionId).maybeSingle();
  if (!session) return NextResponse.json({ error: "Settlement session not found." }, { status: 404 });
  const { error } = await admin.rpc("mark_settlement_session_charged", {
    p_session_id: sessionId,
    p_provider_payment_id: paymentId,
    p_provider_transaction_ref: transactionRef,
  });
  if (error && session.status !== "charged") return NextResponse.json({ error: error.message }, { status: 409 });

  if (session.status !== "charged" && session.prava_session_id) {
    try {
      await reportPravaStatus(session.prava_session_id, transactionRef, "APPROVED");
    } catch {
      // The captured payment remains recorded; the provider status can be retried safely.
    }
  }

  const payouts = await distributeChargedSettlement(sessionId);
  return NextResponse.json({ charged: true, payouts });
}
