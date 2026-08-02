import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError } from "@/lib/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  friend_group_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in to create an outing.", 401);
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);

  if (!parsed.success) {
    return apiError("VALIDATION_FAILED", "Name, currency, and group are required.", 400);
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: membership, error: membershipError } = await admin
    .from("friend_group_members")
    .select("friend_group_id")
    .eq("friend_group_id", parsed.data.friend_group_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return apiError("FORBIDDEN", membershipError.message, 403);
  }

  if (!membership) {
    return apiError("FORBIDDEN", "You can only create an outing inside a group you belong to.", 403);
  }

  const { data: subgroup, error } = await admin
    .from("outing_subgroups")
    .insert({
      friend_group_id: parsed.data.friend_group_id,
      name: parsed.data.name,
      currency: parsed.data.currency,
      leader_id: user.id,
    })
    .select("id, friend_group_id, name, currency, status, leader_id, created_at, last_activity_at")
    .single();

  if (error || !subgroup) {
    return apiError("VALIDATION_FAILED", error?.message ?? "Could not create that outing.", 400);
  }

  const { error: memberError } = await admin.from("subgroup_members").insert({
    subgroup_id: subgroup.id,
    user_id: user.id,
  });

  if (memberError) {
    return apiError("VALIDATION_FAILED", memberError.message, 400);
  }

  return NextResponse.json({ subgroup }, { status: 201 });
}
