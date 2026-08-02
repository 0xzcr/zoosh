import { NextResponse } from "next/server";

import { reportPravaStatus } from "@/lib/prava";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function isAuthorized(request: Request) {
  const token = process.env.SETTLEMENT_WORKER_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { sessionId } = await params;
  const body = (await request.json().catch(() => null)) as { transactionRef?: unknown; reason?: unknown } | null;
  const transactionRef = typeof body?.transactionRef === "string" ? body.transactionRef.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "Payment processor declined the charge.";
  const admin = createSupabaseAdminClient() as any;
  const { data: session } = await admin.from("settlement_sessions").select("id, prava_session_id").eq("id", sessionId).maybeSingle();
  if (!session?.prava_session_id || !transactionRef) return NextResponse.json({ error: "Settlement session and transactionRef are required." }, { status: 400 });

  await admin.rpc("mark_settlement_session_declined", { p_session_id: sessionId, p_failure_reason: reason });
  try {
    await reportPravaStatus(session.prava_session_id, transactionRef, "DECLINED");
  } catch {
    // The local decline remains authoritative for retry and reconciliation.
  }
  return NextResponse.json({ declined: true });
}
