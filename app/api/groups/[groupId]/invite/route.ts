import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(_request: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to create an invite." } }, { status: 401 });
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: membership, error: membershipError } = await admin
    .from("friend_group_members")
    .select("friend_group_id")
    .eq("friend_group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: membershipError.message } }, { status: 403 });
  }

  if (!membership) {
    return NextResponse.json({ error: { code: "FORBIDDEN", message: "You can only invite people to groups you belong to." } }, { status: 403 });
  }

  const code = crypto.randomBytes(8).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await admin.from("invites").insert({
    code,
    friend_group_id: groupId,
    expires_at: expiresAt,
  });

  if (error) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: error.message } }, { status: 400 });
  }

  return NextResponse.json({
    invite: { code, friend_group_id: groupId, expires_at: expiresAt },
    invitePath: `/join/${code}`,
  });
}
