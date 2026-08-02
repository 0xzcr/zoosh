import Link from "next/link";
import { CircleHelp, LayoutGrid } from "lucide-react";

import { GoogleSignIn } from "@/components/forms/google-sign-in";
import { UserMenu } from "@/components/nav/user-menu";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function resolveDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
  identities?: Array<{
    identity_data?: Record<string, unknown> | null;
    provider?: string;
  }>;
  app_metadata?: Record<string, unknown> | null;
}) {
  const metadata = user.user_metadata ?? {};
  const identityData = user.identities?.[0]?.identity_data ?? {};
  const googleIdentity = user.identities?.find((identity) => identity.provider === "google")?.identity_data ?? {};
  const appMetadata = user.app_metadata ?? {};
  const fullName =
    readString(metadata.full_name) ||
    readString(metadata.name) ||
    readString(metadata.user_name) ||
    readString(metadata.full_name) ||
    (typeof user.email === "string" ? user.email.split("@")[0] : "User");

  const email = typeof user.email === "string" ? user.email : "user@example.com";
  const avatarUrl =
    readString(metadata.avatarUrl) ||
    readString(metadata.avatar_url) ||
    readString(metadata.picture) ||
    readString(metadata.photoURL) ||
    readString(metadata.image) ||
    readString(identityData.avatar_url) ||
    readString(identityData.picture) ||
    readString(identityData.photoURL) ||
    readString(identityData.image) ||
    readString(googleIdentity.avatar_url) ||
    readString(googleIdentity.picture) ||
    readString(appMetadata.avatar_url) ||
    null;

  return { fullName, email, avatarUrl };
}

export async function TopNav() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthenticated = Boolean(user);
  const profile = user ? resolveDisplayName(user) : null;

  return (
    <header className="site-header sticky top-0 z-30 border-b border-[color:var(--line)] bg-[color:var(--background)]/90 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-6xl items-center justify-between px-5 sm:px-8">
        <Link href="/" className="brand-mark font-[family-name:var(--font-display)] text-2xl tracking-[-0.05em] text-[color:var(--foreground)]">zoosh<span className="text-[color:var(--accent)]">.</span></Link>
        <nav aria-label="Primary navigation" className="site-nav flex items-center gap-1 text-sm font-medium text-[color:var(--muted)]">
          <Link href="/groups" aria-label="Groups" className="site-nav-link rounded-full px-3 py-2 transition hover:bg-[color:var(--surface)] hover:text-[color:var(--accent-light)]"><LayoutGrid className="size-4 sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">Groups</span></Link>
          <Link href="/instructions" aria-label="How it works" className="site-nav-link rounded-full px-3 py-2 transition hover:bg-[color:var(--surface)] hover:text-[color:var(--accent-light)]"><CircleHelp className="size-4 sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">How it works</span></Link>
        </nav>
        <div className="ml-3 flex items-center gap-2">
          {isAuthenticated && profile ? (
            <UserMenu fullName={profile.fullName} email={profile.email} avatarUrl={profile.avatarUrl} />
          ) : (
            <GoogleSignIn redirectTo="/auth/callback?next=/groups" className="min-h-10 px-4 text-sm" fullWidth={false} />
          )}
        </div>
      </div>
    </header>
  );
}
