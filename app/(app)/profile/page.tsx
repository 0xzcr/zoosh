import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { NotificationContactForm } from "@/components/forms/notification-contact-form";
import { BellRing, MessageCircleMore, UserPlus } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/profile");
  const { data: contact } = await supabase.from("notification_contacts").select("phone_e164").eq("user_id", user.id).maybeSingle();

  return (
    <AppShell>
      <section className="grid gap-7 lg:grid-cols-[1.15fr_.85fr]">
        <div>
          <p className="eyebrow">Your profile</p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl leading-[.98] tracking-[-0.05em] sm:text-6xl">
            You, Your people.
          </h1>
        </div>
        <aside className="section-frame rounded-[1.75rem] p-6">
          <p className="eyebrow">Settlement safety</p>
          <p className="mt-3 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">Approval stays with you.</p>
          <p className="mt-3 leading-7 text-[color:var(--muted)]">Your passkey is requested only for the amount you review and choose to settle.</p>
        </aside>
      </section>
      <section className="mt-10 grid gap-5 md:grid-cols-2">
        <EmptyState
          eyebrow="Friends"
          title="Add people you spend time with."
          description="Friends can be invited into any group you create."
          action={
            <Link
              href="/groups"
              className="deco-link-button"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Invite a friend
            </Link>
          }
        />
        <section className="section-frame rounded-[1.75rem] p-6 sm:p-8">
          <MessageCircleMore className="size-5 text-[color:var(--accent)]" aria-hidden="true" />
          <p className="eyebrow mt-5">Push-to-talk agent</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">Speak an expense, then review it.</h2>
          <p className="mt-3 leading-7 text-[color:var(--muted)]">Voice capture is held-to-talk and always sends its transcript through the same confirmation step as typed expenses.</p>
          <Link
            href="/groups"
            className="deco-link-button mt-6"
          >
            <BellRing className="size-4" aria-hidden="true" />
            Manage notifications
          </Link>
        </section>
      </section>
      <section className="mt-5 section-frame max-w-2xl rounded-[1.75rem] p-6 sm:p-8">
        <p className="eyebrow">Settlement notifications</p>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">Choose where payment requests reach you.</h2>
        <NotificationContactForm initialPhone={contact?.phone_e164 ?? null} />
      </section>
    </AppShell>
  );
}
