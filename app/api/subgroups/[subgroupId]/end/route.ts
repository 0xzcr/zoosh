import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ subgroupId: string }> }) {
  const { subgroupId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in to end this outing.", 401);
  }

  const { data: balances, error } = await supabase.rpc("end_subgroup", {
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
    if (message.includes("already ended") || message.includes("not active")) {
      return apiError("SUBGROUP_ALREADY_ENDED", error.message, 409);
    }
    return apiError("VALIDATION_FAILED", error.message, 400);
  }

  return NextResponse.json({ ended: true, balances: balances ?? [] });
}
