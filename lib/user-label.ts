import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function resolveUserLabel(userId: string) {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin.auth.admin.getUserById(userId);

    if (!error && data.user?.email) {
      return data.user.email;
    }
  } catch {
    // If the service role is unavailable locally, fall back to a short ID label.
  }

  return `${userId.slice(0, 8)}…`;
}
