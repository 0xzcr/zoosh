import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ subgroupId: string; expenseId: string }> }) {
  const { subgroupId, expenseId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in to void an expense.", 401);
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", "A reason is required to void an expense.", 400);
  }

  const { error } = await supabase.rpc("void_subgroup_expense", {
    p_subgroup_id: subgroupId,
    p_expense_id: expenseId,
    p_reason: parsed.data.reason,
  });

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("outing sub-group not found")) {
      return apiError("SUBGROUP_NOT_FOUND", error.message, 404);
    }

    if (message.includes("expense not found")) {
      return apiError("VALIDATION_FAILED", error.message, 404);
    }

    if (message.includes("not payer")) {
      return apiError("EXPENSE_NOT_PAYER", error.message, 403);
    }

    return apiError(
      message.includes("not active") || message.includes("already voided") ? "EXPENSE_LOCKED" : "VALIDATION_FAILED",
      error.message,
      message.includes("not active") || message.includes("already voided") ? 409 : 400,
    );
  }

  return NextResponse.json({ voided: true, expense_id: expenseId });
}
