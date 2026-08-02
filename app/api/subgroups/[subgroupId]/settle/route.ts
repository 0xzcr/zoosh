import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { getAppUrl } from "@/lib/app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notifySettlementSession } from "@/lib/settlement-notifications";

export async function POST(request: Request, { params }: { params: Promise<{ subgroupId: string }> }) {
  const { subgroupId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in to prepare this settlement.", 401);
  }

  const { data: sessions, error } = await supabase.rpc("prepare_subgroup_settlement", {
    p_subgroup_id: subgroupId,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("not found")) {
      return apiError("SUBGROUP_NOT_FOUND", error.message, 404);
    }
    if (message.includes("leader")) {
      return apiError("FORBIDDEN", error.message, 403);
    }
    if (message.includes("ended")) {
      return apiError("SUBGROUP_NOT_ACTIVE", error.message, 409);
    }
    return apiError("VALIDATION_FAILED", error.message, 400);
  }

  const appUrl = getAppUrl(request.url);
  const notifications = [];

  for (const session of (sessions ?? []) as Array<{ session_id: string }>) {
    try {
      notifications.push({ sessionId: session.session_id, ...(await notifySettlementSession({ sessionId: session.session_id, sentBy: user.id, appUrl })) });
    } catch (notificationError) {
      notifications.push({
        sessionId: session.session_id,
        skipped: false,
        deliveryStatus: "failed",
        error: notificationError instanceof Error ? notificationError.message : "Notification delivery failed.",
      });
    }
  }

  return NextResponse.json({ prepared: true, sessions: sessions ?? [], notifications });
}
