import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { getAppUrl } from "@/lib/app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifySettlementSession } from "@/lib/settlement-notifications";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to send a reminder.", 401);

  const { data: reminderId, error: claimError } = await supabase.rpc("claim_settlement_reminder", {
    p_session_id: sessionId,
  });
  if (claimError) {
    const message = claimError.message.toLowerCase();
    if (message.includes("already sent") || message.includes("last hour")) {
      return apiError("REMINDER_RATE_LIMITED", "A reminder was already sent for this payment within the last hour.", 429);
    }
    if (message.includes("only a creditor")) return apiError("FORBIDDEN", claimError.message, 403);
    if (message.includes("not found")) return apiError("VALIDATION_FAILED", claimError.message, 404);
    return apiError("VALIDATION_FAILED", claimError.message, 400);
  }

  try {
    const appUrl = getAppUrl(request.url);
    const notification = await notifySettlementSession({
      sessionId,
      sentBy: user.id,
      appUrl,
      kind: "reminder",
      reminderId: String(reminderId),
    });
    return NextResponse.json({ sent: true, ...notification });
  } catch (error) {
    return apiError("VALIDATION_FAILED", error instanceof Error ? error.message : "The reminder could not be delivered.", 502);
  }
}
