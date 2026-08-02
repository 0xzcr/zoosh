import { NextResponse } from "next/server";

import { extractPravaCredential, getPravaPaymentResult } from "@/lib/prava";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function isAuthorized(request: Request) {
  const token = process.env.SETTLEMENT_WORKER_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  if (!isAuthorized(request)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { sessionId } = await params;
  const admin = createSupabaseAdminClient() as any;
  const { data: session } = await admin.from("settlement_sessions").select("id, prava_session_id, status").eq("id", sessionId).maybeSingle();
  if (!session?.prava_session_id) return NextResponse.json({ error: "Prava session not found." }, { status: 404 });
  if (session.status !== "approved_awaiting_charge") return NextResponse.json({ error: "Settlement is not ready for charging." }, { status: 409 });

  const result = await getPravaPaymentResult(session.prava_session_id);
  if (result.status !== "awaiting_result") return NextResponse.json({ status: result.status }, { status: 202 });
  const credential = extractPravaCredential(result);
  if (!credential) return NextResponse.json({ error: "Prava did not return a usable transaction credential." }, { status: 502 });

  return NextResponse.json(credential);
}
