import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { distributeChargedSettlement } from "@/lib/settlement-distribution";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to retry payouts.", 401);

  const admin = createSupabaseAdminClient() as any;
  const { data: session } = await admin.from("settlement_sessions").select("id, debtor_id, status").eq("id", sessionId).maybeSingle();
  if (!session) return apiError("VALIDATION_FAILED", "Settlement session not found.", 404);
  if (session.debtor_id !== user.id) return apiError("FORBIDDEN", "Only the debtor can retry this settlement distribution.", 403);
  if (session.status !== "charged") return apiError("VALIDATION_FAILED", "The payment must be confirmed before payouts can be retried.", 409);

  try {
    const payouts = await distributeChargedSettlement(sessionId);
    return NextResponse.json({ payouts });
  } catch (error) {
    return apiError("VALIDATION_FAILED", error instanceof Error ? error.message : "The payouts could not be retried.", 409);
  }
}
