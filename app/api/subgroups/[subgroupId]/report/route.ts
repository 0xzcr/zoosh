import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ subgroupId: string }> }) {
  const { subgroupId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to view this report.", 401);

  const admin = createSupabaseAdminClient() as any;
  const { data: membership } = await admin.from("subgroup_members").select("user_id").eq("subgroup_id", subgroupId).eq("user_id", user.id).maybeSingle();
  if (!membership) return apiError("FORBIDDEN", "Only outing members can view this report.", 403);

  const [{ data: subgroup, error: subgroupError }, { data: expenses, error: expenseError }, { data: sessions, error: sessionError }] = await Promise.all([
    admin.from("outing_subgroups").select("id, friend_group_id, name, currency, status, leader_id, created_at").eq("id", subgroupId).maybeSingle(),
    admin.from("expenses").select("id, payer_id, total_amount_paise, description, split_type, participants, source, created_at").eq("subgroup_id", subgroupId).is("voided_at", null).order("created_at", { ascending: true }),
    admin.from("settlement_sessions").select("id, debtor_id, total_amount_paise, status, created_at, paid_at").eq("subgroup_id", subgroupId).order("created_at", { ascending: true }),
  ]);
  if (subgroupError || expenseError || sessionError) return apiError("VALIDATION_FAILED", "The report could not be loaded.", 500);
  if (!subgroup) return apiError("SUBGROUP_NOT_FOUND", "Outing not found.", 404);

  const sessionIds = ((sessions ?? []) as Array<{ id: string }>).map((session) => session.id);
  const { data: payouts, error: payoutError } = sessionIds.length
    ? await admin.from("settlement_payouts").select("id, settlement_session_id, creditor_id, amount_paise, status, failure_reason, paid_at").in("settlement_session_id", sessionIds).order("created_at", { ascending: true })
    : { data: [], error: null };
  if (payoutError) return apiError("VALIDATION_FAILED", "The settlement outcomes could not be loaded.", 500);

  return NextResponse.json({ subgroup, expenses: expenses ?? [], settlement_sessions: sessions ?? [], settlement_payouts: payouts ?? [] });
}
