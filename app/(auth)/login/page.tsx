import Link from "next/link";
import { redirect } from "next/navigation";
import { LockKeyhole } from "lucide-react";

import { GoogleSignIn } from "@/components/forms/google-sign-in";
import { TopNav } from "@/components/top-nav";
import { DEFAULT_AUTH_REDIRECT, safeAuthRedirect } from "@/constants/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const safeNext = safeAuthRedirect(next);

  if (user) {
    redirect(safeNext);
  }

  const redirectTo = next ? `/auth/callback?next=${encodeURIComponent(safeNext)}` : DEFAULT_AUTH_REDIRECT;

  return (
    <main className="auth-page min-h-screen p-5">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col">
        <TopNav />
        <section className="flex flex-1 items-center justify-center">
          <section className="section-frame auth-card w-full p-7 sm:p-9">
            <Link href="/" className="font-[family-name:var(--font-display)] text-3xl tracking-[-0.06em] text-[color:var(--foreground)]">
              zoosh<span className="text-[color:var(--accent)]">.</span>
            </Link>
            <p className="eyebrow mt-12">Welcome back</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-none tracking-[-0.06em]">
              Your groups are waiting.
            </h1>
            <p className="mt-5 leading-7 text-[color:var(--muted)]">Sign in once and your session remains secure on this device.</p>
            <div className="mt-8">
              <GoogleSignIn redirectTo={redirectTo} />
            </div>
            <p className="mt-6 text-sm leading-6 text-[color:var(--muted)]">
              New here?{" "}
              <Link href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"} className="font-semibold text-[color:var(--foreground)] underline underline-offset-4">
                Create your account
              </Link>
            </p>
            <p className="mt-7 flex gap-2 text-sm leading-6 text-[color:var(--muted)]">
              <LockKeyhole className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Zoosh only requests payment approval when you choose to settle.
            </p>
          </section>
        </section>
      </div>
    </main>
  );
}
