import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api-errors";
import { averageExpenseAmount, calculateEqualExpenseSplit, uniqueExpenseParticipantIds } from "@/lib/ledger";
import { parseExpenseText } from "@/lib/parser";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveUserLabel } from "@/lib/user-label";

const bodySchema = z.object({
  input: z.string().trim().min(1).max(1000),
});

type MemberRow = {
  user_id: string;
  joined_at: string;
};

type ExpenseRow = {
  payer_id: string;
  total_amount_paise: number;
  description: string;
  created_at: string;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function descriptionsLookSimilar(left: string, right: string) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  if (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)) {
    return true;
  }

  const leftTokens = new Set(normalizedLeft.split(" ").filter(Boolean));
  const rightTokens = new Set(normalizedRight.split(" ").filter(Boolean));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const score = overlap / Math.max(leftTokens.size, rightTokens.size);

  return score >= 0.5;
}

function formatRelativeTime(target: string) {
  const deltaMs = Date.now() - new Date(target).getTime();
  const deltaMinutes = Math.max(1, Math.round(deltaMs / 60000));

  if (deltaMinutes < 60) {
    return `${deltaMinutes}m`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) {
    return `${deltaHours}h`;
  }

  return `${Math.round(deltaHours / 24)}d`;
}

export async function POST(request: Request, { params }: { params: Promise<{ subgroupId: string }> }) {
  const { subgroupId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in to log an expense.", 401);
  }

  const body: unknown = await request.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return apiError("VALIDATION_FAILED", "Describe the expense before parsing it.", 400);
  }

  const admin = createSupabaseAdminClient() as any;
  const [{ data: subgroup }, { data: membership }, { data: memberRows }] = await Promise.all([
    admin.from("outing_subgroups").select("id, name, currency, status").eq("id", subgroupId).maybeSingle(),
    admin.from("subgroup_members").select("user_id").eq("subgroup_id", subgroupId).eq("user_id", user.id).maybeSingle(),
    admin.from("subgroup_members").select("user_id, joined_at").eq("subgroup_id", subgroupId).order("joined_at", { ascending: true }),
  ]);

  if (!subgroup) {
    return apiError("SUBGROUP_NOT_FOUND", "Outing not found.", 404);
  }

  if (subgroup.status !== "active") {
    return apiError("SUBGROUP_NOT_ACTIVE", "This outing is no longer active.", 409);
  }

  if (!membership) {
    return apiError("FORBIDDEN", "You can only log expenses in an outing you belong to.", 403);
  }

  const members = (memberRows ?? []) as MemberRow[];
  const memberOptions = await Promise.all(
    members.map(async (member) => ({
      id: member.user_id,
      label: await resolveUserLabel(member.user_id),
    })),
  );

  const currentUserLabel = memberOptions.find((member) => member.id === user.id)?.label ?? "You";
  let parsedExpense;

  try {
    parsedExpense = await parseExpenseText({
      text: parsedBody.data.input,
      payerId: user.id,
      payerLabel: currentUserLabel,
      subgroupName: subgroup.name,
      members: memberOptions,
    });
  } catch (error) {
    return apiError("VALIDATION_FAILED", error instanceof Error ? error.message : "Could not parse that expense right now.", 502);
  }

  if (parsedExpense.clarification_needed) {
    return NextResponse.json({ clarification_needed: parsedExpense.clarification_needed });
  }

  const totalAmountPaise = parsedExpense.total_amount_paise;
  if (typeof totalAmountPaise !== "number" || !Number.isInteger(totalAmountPaise) || totalAmountPaise <= 0) {
    return apiError("EXPENSE_INVALID_AMOUNT", "Enter a positive amount before continuing.", 400);
  }

  const description = parsedExpense.description?.trim();
  if (!description) {
    return apiError("VALIDATION_FAILED", "Add a description for the expense.", 400);
  }

  const memberIds = memberOptions.map((member) => member.id);
  const normalizedParticipantIds = uniqueExpenseParticipantIds(
    parsedExpense.participant_ids?.length ? parsedExpense.participant_ids : memberIds,
    user.id,
  );

  const invalidParticipant = normalizedParticipantIds.find((participantId) => !memberIds.includes(participantId));
  if (invalidParticipant) {
    return apiError("VALIDATION_FAILED", "Participants must already belong to this outing.", 400);
  }

  const recentSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [{ data: recentExpenses }, { data: expenseTotals }] = await Promise.all([
    admin
      .from("expenses")
      .select("payer_id, total_amount_paise, description, created_at")
      .eq("subgroup_id", subgroupId)
      .is("voided_at", null)
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("expenses")
      .select("total_amount_paise")
      .eq("subgroup_id", subgroupId)
      .is("voided_at", null),
  ]);

  const duplicateExpense = (recentExpenses as ExpenseRow[] | null | undefined)?.find((expense) => {
    const amountDifference = Math.abs(expense.total_amount_paise - totalAmountPaise);
    const amountWithinRange = amountDifference / Math.max(expense.total_amount_paise, totalAmountPaise) <= 0.1;
    return amountWithinRange || descriptionsLookSimilar(expense.description, description);
  });

  const duplicatePayerLabel = duplicateExpense ? await resolveUserLabel(duplicateExpense.payer_id) : null;
  const averageAmount = averageExpenseAmount((Array.isArray(expenseTotals) ? expenseTotals : []).map((expense) => expense.total_amount_paise));
  const requiresExtraConfirmation = averageAmount ? totalAmountPaise >= averageAmount * 5 : false;
  const splitPreview = calculateEqualExpenseSplit({
    payerId: user.id,
    totalAmountPaise,
    participantIds: normalizedParticipantIds,
  });

  return NextResponse.json({
    draft: {
      payer_id: user.id,
      total_amount_paise: totalAmountPaise,
      description,
      split_type: parsedExpense.split_type ?? "equal",
      participant_ids: normalizedParticipantIds,
    },
    split_preview: splitPreview,
    duplicate_warning: duplicateExpense
      ? {
          description: duplicateExpense.description,
          payer_label: duplicatePayerLabel ?? "someone in the outing",
          logged_at: duplicateExpense.created_at,
          relative_time: formatRelativeTime(duplicateExpense.created_at),
        }
      : null,
    average_expense_amount_paise: averageAmount,
    requires_extra_confirmation: requiresExtraConfirmation,
  });
}
