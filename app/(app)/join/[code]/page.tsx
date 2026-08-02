import { redirect } from "next/navigation";

import { JoinInviteFlow } from "@/components/forms/join-invite-flow";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/join/${encodeURIComponent(code)}`);
  }

  return <JoinInviteFlow code={code} />;
}
