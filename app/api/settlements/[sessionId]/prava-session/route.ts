import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { createPravaSettlementSession, getPravaClientConfig } from "@/lib/prava";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const requestUrl = new URL(request.url);
  const restart = requestUrl.searchParams.get("restart") === "1";
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to approve this settlement.", 401);

  const admin = createSupabaseAdminClient() as any;
  const [{ data: session }, { data: contact }] = await Promise.all([
    admin.from("settlement_sessions").select("id, debtor_id, subgroup_id, total_amount_paise, status, prava_session_id, prava_session_token, prava_iframe_url, prava_expires_at").eq("id", sessionId).maybeSingle(),
    admin.from("notification_contacts").select("phone_e164").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!session) return apiError("VALIDATION_FAILED", "Settlement session not found.", 404);
  if (session.debtor_id !== user.id) return apiError("FORBIDDEN", "Only the debtor can approve this payment.", 403);
  if (session.status === "charged") return apiError("VALIDATION_FAILED", "This settlement has already been paid.", 409);
  if (session.status === "declined" || session.status === "expired") return apiError("VALIDATION_FAILED", "This settlement session is no longer active.", 409);

  if (restart && session.status !== "pending") {
    return apiError("VALIDATION_FAILED", "This payment session cannot be restarted in its current state.", 409);
  }

  if (restart && session.prava_session_id) {
    const { error } = await admin.from("settlement_sessions").update({
      prava_session_id: null,
      prava_session_token: null,
      prava_iframe_url: null,
      prava_expires_at: null,
      payment_started_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", session.id).eq("status", "pending");
    if (error) return apiError("VALIDATION_FAILED", error.message, 409);
  }

  const now = Date.now();
  const expiresAt = session.prava_expires_at ? Date.parse(session.prava_expires_at) : 0;
  if (!restart && session.prava_session_id && session.prava_session_token && session.prava_iframe_url && expiresAt > now) {
    return NextResponse.json({
      sessionId: session.prava_session_id,
      sessionToken: session.prava_session_token,
      iframeUrl: session.prava_iframe_url,
      expiresAt: session.prava_expires_at,
      ...getPravaClientConfig(),
    });
  }

  const { data: subgroup } = await admin.from("outing_subgroups").select("id, name, currency").eq("id", session.subgroup_id).maybeSingle();
  if (!user.email || !subgroup) return apiError("VALIDATION_FAILED", "Your account needs an email before payment can start.", 400);

  try {
    const configuredAppUrl = process.env.APP_URL?.trim();
    const appUrl = configuredAppUrl && !configuredAppUrl.includes("your-vercel-domain.example")
      ? configuredAppUrl.replace(/\/$/, "")
      : requestUrl.origin;
    const pravaSession = await createPravaSettlementSession({
      userId: user.id,
      email: user.email,
      phone: contact?.phone_e164,
      amountPaise: session.total_amount_paise,
      subgroupId: subgroup.id,
      subgroupName: subgroup.name,
      callbackUrl: appUrl.startsWith("https://") ? `${appUrl}/settlements/${session.id}` : undefined,
    });

    await admin.from("settlement_sessions").update({
      prava_session_id: pravaSession.session_id,
      prava_session_token: pravaSession.session_token,
      prava_iframe_url: pravaSession.iframe_url,
      prava_expires_at: pravaSession.expires_at ?? null,
      payment_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", session.id).eq("debtor_id", user.id);

    return NextResponse.json({
      sessionId: pravaSession.session_id,
      sessionToken: pravaSession.session_token,
      iframeUrl: pravaSession.iframe_url,
      expiresAt: pravaSession.expires_at ?? null,
      ...getPravaClientConfig(),
    });
  } catch (error) {
    return apiError("VALIDATION_FAILED", error instanceof Error ? error.message : "The payment session could not be created.", 503);
  }
}
