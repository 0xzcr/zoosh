import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: Promise<{ subgroupId: string }> }) {
  const { subgroupId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in to view balances.", 401);
  }

  const admin = createSupabaseAdminClient() as any;
  const [{ data: subgroup }, { data: membership }, { data: members }, { data: balances }, { data: expenses }] = await Promise.all([
    admin.from("outing_subgroups").select("id, name, status, currency").eq("id", subgroupId).maybeSingle(),
    admin.from("subgroup_members").select("user_id").eq("subgroup_id", subgroupId).eq("user_id", user.id).maybeSingle(),
    admin.from("subgroup_members").select("user_id, joined_at").eq("subgroup_id", subgroupId),
    admin.from("ledger_balances").select("user_id, net_balance_paise").eq("subgroup_id", subgroupId).order("user_id", { ascending: true }),
    admin
      .from("expenses")
      .select("id, payer_id, total_amount_paise, description, split_type, participants, source, created_at")
      .eq("subgroup_id", subgroupId)
      .is("voided_at", null)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (!subgroup) {
    return apiError("SUBGROUP_NOT_FOUND", "Outing not found.", 404);
  }

  if (!membership) {
    return apiError("FORBIDDEN", "You can only view balances for an outing you belong to.", 403);
  }

  return NextResponse.json({
    subgroup,
    members: members ?? [],
    balances: balances ?? [],
    expenses: expenses ?? [],
  });
}
