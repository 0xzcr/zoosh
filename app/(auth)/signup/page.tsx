import Link from "next/link";
import { redirect } from "next/navigation";
import { UserPlus, ShieldCheck } from "lucide-react";

import { GoogleSignIn } from "@/components/forms/google-sign-in";
import { TopNav } from "@/components/top-nav";
import { DEFAULT_AUTH_REDIRECT } from "@/constants/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const safeNext = next && next.startsWith("/") ? next : "/groups";

  if (user) {
    redirect(safeNext);
  }

  const redirectTo =
    next && next.startsWith("/")
      ? `/auth/callback?next=${encodeURIComponent(next)}`
      : DEFAULT_AUTH_REDIRECT;

  return (
    <main className="auth-page min-h-screen p-5">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
        <TopNav />
        <section className="flex flex-1 items-center justify-center">
          <section className="section-frame auth-card w-full p-7 sm:p-9">
            <Link href="/" className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.06em] text-[color:var(--foreground)]">
              zoosh<span className="text-[color:var(--accent)]">.</span>
            </Link>
            <p className="eyebrow mt-12">Get started</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-none tracking-[-0.06em]">
              Set up your account.
            </h1>
            <p className="mt-5 leading-7 text-[color:var(--muted)]">
              Use the same secure sign-in flow to create your Zoosh account and come back to your invite after auth completes.
            </p>
            <div className="mt-8">
              <GoogleSignIn redirectTo={redirectTo} />
            </div>
            <div className="mt-6 flex items-start gap-2 rounded-2xl bg-[color:var(--accent-soft)] px-4 py-3 text-sm leading-6 text-[color:var(--foreground)]">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[color:var(--accent-deep)]" aria-hidden="true" />
              <span>
                Zoosh only uses your existing auth session here. Card setup and payment approval stay out of sign-up.
              </span>
            </div>
            <p className="mt-6 text-sm leading-6 text-[color:var(--muted)]">
              Already have an account?{" "}
              <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="inline-flex items-center gap-1 font-semibold text-[color:var(--foreground)] underline underline-offset-4">
                <UserPlus className="size-4" aria-hidden="true" />
                Sign in instead
              </Link>
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
