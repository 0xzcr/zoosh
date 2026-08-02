import crypto from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Sign in to create a group." } }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: "Group name is required." } }, { status: 400 });
  }

  const admin = createSupabaseAdminClient() as any;
  const groupId = crypto.randomUUID();
  const { error: groupError } = await admin.from("friend_groups").insert({
    id: groupId,
    name: parsed.data.name,
    created_by: user.id,
  });

  if (groupError) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: groupError.message } }, { status: 400 });
  }

  const { error: membershipError } = await admin.from("friend_group_members").insert({
    friend_group_id: groupId,
    user_id: user.id,
  });

  if (membershipError) {
    return NextResponse.json({ error: { code: "VALIDATION_FAILED", message: membershipError.message } }, { status: 400 });
  }

  return NextResponse.json({ group: { id: groupId, name: parsed.data.name, created_by: user.id } }, { status: 201 });
}
