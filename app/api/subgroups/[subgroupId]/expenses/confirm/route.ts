import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api-errors";
import { uniqueExpenseParticipantIds } from "@/lib/ledger";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  payer_id: z.string().uuid(),
  total_amount_paise: z.number().int().positive(),
  description: z.string().trim().min(1).max(500),
  split_type: z.enum(["equal", "itemized", "custom"]),
  participant_ids: z.array(z.string().uuid()).min(1),
  source: z.enum(["text", "voice", "receipt"]).default("text"),
  large_expense_acknowledged: z.boolean().default(false),
});

type ExpenseBalanceRow = {
  user_id: string;
  net_balance_paise: number;
};

export async function POST(request: Request, { params }: { params: Promise<{ subgroupId: string }> }) {
  const { subgroupId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in to confirm an expense.", 401);
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", "Expense details are incomplete.", 400);
  }

  if (parsed.data.payer_id !== user.id) {
    return apiError("EXPENSE_NOT_PAYER", "You can only confirm an expense as yourself.", 403);
  }

  const admin = createSupabaseAdminClient() as any;
  const [{ data: subgroup }, { data: membership }, { data: members }, { data: expenseTotals }] = await Promise.all([
    admin.from("outing_subgroups").select("id, name, status").eq("id", subgroupId).maybeSingle(),
    admin.from("subgroup_members").select("user_id").eq("subgroup_id", subgroupId).eq("user_id", user.id).maybeSingle(),
    admin.from("subgroup_members").select("user_id").eq("subgroup_id", subgroupId),
    admin.from("expenses").select("total_amount_paise").eq("subgroup_id", subgroupId).is("voided_at", null),
  ]);

  if (!subgroup) {
    return apiError("SUBGROUP_NOT_FOUND", "Outing not found.", 404);
  }

  if (subgroup.status !== "active") {
    return apiError("SUBGROUP_NOT_ACTIVE", "This outing is no longer active.", 409);
  }

  if (!membership) {
    return apiError("FORBIDDEN", "You can only confirm expenses in an outing you belong to.", 403);
  }

  const memberIds = (Array.isArray(members) ? members : []).map((member: { user_id: string }) => member.user_id);
  const normalizedParticipantIds = uniqueExpenseParticipantIds(parsed.data.participant_ids, user.id);
  const invalidParticipant = normalizedParticipantIds.find((participantId) => !memberIds.includes(participantId));
  if (invalidParticipant) {
    return apiError("VALIDATION_FAILED", "Participants must already belong to this outing.", 400);
  }

  const expenseTotalsArray = Array.isArray(expenseTotals) ? expenseTotals : [];
  const averageAmount = expenseTotalsArray.length > 0
    ? Math.round(expenseTotalsArray.reduce((sum: number, expense: { total_amount_paise: number }) => sum + expense.total_amount_paise, 0) / expenseTotalsArray.length)
    : null;

  if (averageAmount && parsed.data.total_amount_paise >= averageAmount * 5 && !parsed.data.large_expense_acknowledged) {
    return apiError("VALIDATION_FAILED", "This expense needs the extra review step before confirming.", 400);
  }

  const expenseIdResult = await supabase.rpc("confirm_subgroup_expense", {
    p_subgroup_id: subgroupId,
    p_payer_id: user.id,
    p_total_amount_paise: parsed.data.total_amount_paise,
    p_description: parsed.data.description,
    p_split_type: parsed.data.split_type,
    p_participants: normalizedParticipantIds,
    p_source: parsed.data.source,
    p_receipt_url: null,
  });

  if (expenseIdResult.error) {
    return apiError("VALIDATION_FAILED", expenseIdResult.error.message, 400);
  }

  const expenseId = expenseIdResult.data as string | null;
  if (!expenseId) {
    return apiError("VALIDATION_FAILED", "Could not confirm that expense.", 400);
  }

  const [{ data: expense }, { data: balances }] = await Promise.all([
    admin
      .from("expenses")
      .select("id, subgroup_id, payer_id, total_amount_paise, description, split_type, participants, source, created_at")
      .eq("id", expenseId)
      .maybeSingle(),
    admin
      .from("ledger_balances")
      .select("user_id, net_balance_paise")
      .eq("subgroup_id", subgroupId)
      .order("user_id", { ascending: true }),
  ]);

  return NextResponse.json({
    expense,
    balances: (balances ?? []) as ExpenseBalanceRow[],
  });
}
