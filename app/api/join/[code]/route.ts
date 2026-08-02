import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeInviteCode(input: string) {
  let decoded = input;
  try {
    decoded = decodeURIComponent(input);
  } catch {
    // Keep the original value when the route segment is malformed.
  }

  try {
    const url = new URL(decoded);
    const match = url.pathname.match(/\/join\/([^/]+)\/?$/i);
    if (match?.[1]) {
      decoded = match[1];
    }
  } catch {
    // The value is already a code.
  }

  return decoded.trim().replace(/\s+/g, "").toLowerCase();
}

export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = normalizeInviteCode(rawCode);
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to join an invite." } }, { status: 401 });
  }

  if (!code) {
    return NextResponse.json({ error: { code: "INVITE_NOT_FOUND", message: "Enter a valid invite code." } }, { status: 404 });
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: invite, error: inviteError } = await admin
    .from("invites")
    .select("code, friend_group_id, expires_at")
    .eq("code", code)
    .maybeSingle();

  if (inviteError) {
    return NextResponse.json({ error: { code: "INVITE_NOT_FOUND", message: inviteError.message } }, { status: 404 });
  }

  if (!invite) {
    return NextResponse.json({ error: { code: "INVITE_NOT_FOUND", message: "Invite code not found." } }, { status: 404 });
  }

  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: { code: "INVITE_EXPIRED", message: "This invite has expired." } }, { status: 410 });
  }

  const { data: existingMembership } = await admin
    .from("friend_group_members")
    .select("friend_group_id")
    .eq("friend_group_id", invite.friend_group_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await admin
    .from("friend_group_members")
    .upsert(
      {
        friend_group_id: invite.friend_group_id,
        user_id: user.id,
      },
      { onConflict: "friend_group_id,user_id", ignoreDuplicates: true },
    );

  if (error) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: error.message } }, { status: 400 });
  }

  return NextResponse.json({
    joined: true,
    alreadyJoined: Boolean(existingMembership),
    invite,
  });
}
