import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ subgroupId: string }> }) {
  const { subgroupId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return apiError("UNAUTHORIZED", "Sign in to join an outing.", 401);
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: subgroup, error: subgroupError } = await admin
    .from("outing_subgroups")
    .select("id, friend_group_id, status")
    .eq("id", subgroupId)
    .maybeSingle();

  if (subgroupError) {
    return apiError("SUBGROUP_NOT_FOUND", subgroupError.message, 404);
  }

  if (!subgroup) {
    return apiError("SUBGROUP_NOT_FOUND", "Outing not found.", 404);
  }

  if (subgroup.status !== "active") {
    return apiError("SUBGROUP_NOT_ACTIVE", "This outing is no longer active.", 409);
  }

  const { data: groupMembership, error: groupMembershipError } = await admin
    .from("friend_group_members")
    .select("friend_group_id")
    .eq("friend_group_id", subgroup.friend_group_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (groupMembershipError) {
    return apiError("FORBIDDEN", groupMembershipError.message, 403);
  }

  if (!groupMembership) {
    return apiError("FORBIDDEN", "You can only join outings inside a group you belong to.", 403);
  }

  const { data: existingMembership } = await admin
    .from("subgroup_members")
    .select("subgroup_id, user_id")
    .eq("subgroup_id", subgroupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    return NextResponse.json(
      {
        joined: true,
        alreadyJoined: true,
        subgroup: {
          id: subgroupId,
          friend_group_id: subgroup.friend_group_id,
        },
      },
      { status: 200 },
    );
  }

  const { error } = await admin.from("subgroup_members").insert({
    subgroup_id: subgroupId,
    user_id: user.id,
  });

  if (error) {
    return apiError("VALIDATION_FAILED", error.message, 400);
  }

  return NextResponse.json(
    {
      joined: true,
      alreadyJoined: false,
      subgroup: {
        id: subgroupId,
        friend_group_id: subgroup.friend_group_id,
      },
    },
    { status: 201 },
  );
}
