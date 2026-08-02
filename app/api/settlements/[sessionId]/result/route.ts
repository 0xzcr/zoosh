import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { extractPravaCredential, getPravaPaymentResult, reportPravaStatus } from "@/lib/prava";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to check this payment.", 401);

  const admin = createSupabaseAdminClient() as any;
  const { data: session } = await admin.from("settlement_sessions").select("id, debtor_id, prava_session_id, status").eq("id", sessionId).maybeSingle();
  if (!session) return apiError("VALIDATION_FAILED", "Settlement session not found.", 404);
  if (session.debtor_id !== user.id) return apiError("FORBIDDEN", "Only the debtor can check this payment.", 403);
  if (!session.prava_session_id) return apiError("VALIDATION_FAILED", "The Prava payment session has not started.", 409);
  if (session.status === "charged") return NextResponse.json({ status: "charged" });

  try {
    const result = await getPravaPaymentResult(session.prava_session_id);
    if (result.status === "failed") {
      const reason = result.transactions?.[0]?.error?.message ?? "Prava declined the payment authorization.";
      await admin.from("settlement_sessions").update({ status: "declined", failure_reason: reason, updated_at: new Date().toISOString() }).eq("id", session.id).in("status", ["pending", "approved_awaiting_charge"]);
      const txnRefId = result.transactions?.[0]?.line_items?.[0]?.txn_ref_id;
      if (txnRefId) {
        try {
          await reportPravaStatus(session.prava_session_id, txnRefId, "DECLINED");
        } catch {
          // The local failure is recorded; the provider report can be retried by the worker.
        }
      }
      return NextResponse.json({ status: "declined", message: reason }, { status: 409 });
    }

    // Prava exposes the one-time checkout credential at awaiting_result. The
    // provider only moves to completed after our payment processor reports the
    // outcome back, so waiting for completed here would deadlock the charge.
    if (result.status !== "awaiting_result") return NextResponse.json({ status: result.status }, { status: 202 });
    if (!extractPravaCredential(result)) {
      return NextResponse.json({ status: result.status }, { status: 202 });
    }

    await admin.from("settlement_sessions").update({ status: "approved_awaiting_charge", failure_reason: null, updated_at: new Date().toISOString() }).eq("id", session.id).in("status", ["pending", "approved_awaiting_charge"]);

    return NextResponse.json({
      status: "authorized",
      message: "Prava approved the payment. Zoosh is now submitting the single charge through Razorpay.",
    }, { status: 202 });
  } catch (error) {
    return apiError("VALIDATION_FAILED", error instanceof Error ? error.message : "The payment result could not be checked.", 503);
  }
}
