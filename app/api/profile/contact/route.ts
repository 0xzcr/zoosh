import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function PUT(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to update your contact details.", 401);

  const body = (await request.json().catch(() => null)) as { phoneE164?: unknown } | null;
  const phoneE164 = typeof body?.phoneE164 === "string" ? body.phoneE164.trim() : "";
  if (phoneE164 && !/^\+[1-9][0-9]{7,14}$/.test(phoneE164)) {
    return apiError("VALIDATION_FAILED", "Use a valid phone number in E.164 format, for example +919876543210.", 400);
  }

  const { error } = await supabase.from("notification_contacts").upsert({ user_id: user.id, phone_e164: phoneE164 || null, updated_at: new Date().toISOString() });
  if (error) return apiError("VALIDATION_FAILED", error.message, 400);
  return NextResponse.json({ saved: true, phoneE164: phoneE164 || null });
}
