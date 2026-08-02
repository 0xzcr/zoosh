import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Phone, UserPlus, UserRound, UsersRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { GroupCreateForm } from "@/components/forms/group-create-form";
import { NotificationContactForm } from "@/components/forms/notification-contact-form";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type FriendGroupMembershipRow = {
  friend_group_id: string;
  joined_at: string;
};

type FriendGroupRow = {
  id: string;
  name: string;
  created_at: string;
};

export default async function GroupsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/groups");
  }

  const admin = createSupabaseAdminClient() as any;
  const [{ data: membershipsData }, { data: contactData }] = await Promise.all([
    admin
      .from("friend_group_members")
      .select("friend_group_id, joined_at")
      .eq("user_id", user.id)
      .order("joined_at", { ascending: false }),
    supabase.from("notification_contacts").select("phone_e164").eq("user_id", user.id).maybeSingle(),
  ]);

  const memberships = (membershipsData ?? []) as FriendGroupMembershipRow[];
  const groupIds = memberships.map((membership) => membership.friend_group_id);
  const { data: groupsData } = groupIds.length
    ? await admin
        .from("friend_groups")
        .select("id, name, created_at")
        .in("id", groupIds)
        .order("created_at", { ascending: false })
    : { data: [] as FriendGroupRow[] };
  const groups = (groupsData ?? []) as FriendGroupRow[];
  const { data: groupMembersData } = groupIds.length
    ? await admin.from("friend_group_members").select("friend_group_id").in("friend_group_id", groupIds)
    : { data: [] as { friend_group_id: string }[] };
  const memberCounts = new Map<string, number>();
  for (const member of (groupMembersData ?? []) as { friend_group_id: string }[]) {
    memberCounts.set(member.friend_group_id, (memberCounts.get(member.friend_group_id) ?? 0) + 1);
  }
  const profileName =
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    user.email?.split("@")[0] ||
    "there";
  const firstName = profileName.split(/\s+/)[0];

  return (
    <AppShell>
      <section className="grid gap-8 lg:grid-cols-[1.25fr_.75fr]">
        <div className="relative flex min-h-[14rem] items-center overflow-hidden">
          <div className="border-l-2 border-[color:var(--accent)] pl-5 sm:pl-7">
            <p className="eyebrow flex items-center gap-2">
              <UserRound className="size-4" aria-hidden="true" />
              Welcome back, {firstName}
            </p>
            <h1 className="mt-4 max-w-3xl font-[family-name:var(--font-display)] text-5xl leading-[.95] tracking-[-0.05em] text-[color:var(--foreground)] sm:text-6xl lg:text-7xl">
              Your groups
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-[color:var(--muted)]">
              The people, plans, and shared moments you keep close.
            </p>
          </div>
        </div>
        <aside className="section-frame rounded-[1.75rem] p-6">
          <p className="eyebrow flex items-center gap-2">
            <UserPlus className="size-4 text-[color:var(--accent)]" aria-hidden="true" />
            Joining a group?
          </p>
          <p className="mt-3 font-[family-name:var(--font-display)] text-4xl leading-[.92] tracking-[-0.05em] sm:text-5xl">
            join your friends!
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/join"
              className="deco-link-button"
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Join with invite
            </Link>
          </div>
        </aside>
      </section>

      <div className="mt-8">
        <GroupCreateForm />
      </div>

      <section className="mt-8 section-frame rounded-[1.75rem] p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <Phone className="mt-1 size-5 text-[color:var(--accent)]" aria-hidden="true" />
          <div>
            <p className="eyebrow">Linq notifications</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">Keep your payment requests close.</h2>
            <p className="mt-3 max-w-2xl leading-7 text-[color:var(--muted)]">Add a phone number so Zoosh can send your settlement request through Linq. No verification is needed, and you can update it anytime.</p>
          </div>
        </div>
        <div className="mt-5 max-w-xl">
          <NotificationContactForm initialPhone={contactData?.phone_e164 ?? null} />
        </div>
      </section>

      <div className="mt-10">
        {groups.length > 0 ? (
          <section className="-mx-5 border-y border-[color:var(--line)] bg-[color:var(--surface-strong)] px-5 py-7 sm:-mx-8 sm:px-8 sm:py-9">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-start gap-3">
                <UsersRound className="mt-1 size-6 text-[color:var(--accent)]" aria-hidden="true" />
                <div>
                  <p className="eyebrow !text-base">Your Groups</p>
                </div>
              </div>
              <p className="text-sm leading-6 text-[color:var(--muted)]">
                {groups.length} {groups.length === 1 ? "group" : "groups"}
              </p>
            </div>

            <div className="mt-6 border-t border-[color:var(--line)]">
              {groups.map((group, index) => (
                <Link
                  key={group.id}
                  href={`/groups/${group.id}`}
                  className="group relative isolate flex flex-col gap-4 overflow-hidden border-b border-[color:var(--line)] py-6 transition hover:text-[color:var(--accent-deep)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <span
                    className="pointer-events-none absolute inset-x-8 inset-y-2 -z-10 rounded-full bg-[color:var(--accent-soft)] opacity-60 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
                    aria-hidden="true"
                  />
                  <div className="relative min-w-0">
                    <p className="eyebrow">Group {String(index + 1).padStart(2, "0")}</p>
                    <h3 className="mt-2 truncate font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">{group.name}</h3>
                    <p className="mt-2 text-base leading-7 text-[color:var(--muted)]">
                      {memberCounts.get(group.id) ?? 0} {memberCounts.get(group.id) === 1 ? "person" : "people"} {"/"} Created on {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(group.created_at))}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold sm:shrink-0">
                    Open group
                    <ArrowUpRight className="size-5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <EmptyState
            eyebrow="No groups yet"
            title="Your first group starts with the people, not the math."
            description="Create a group to invite friends, set up an outing, and keep shared spending from following you into the next plan."
            action={
              <Link href="/profile" className="inline-flex items-center gap-2 text-sm font-semibold underline underline-offset-4">
                Edit your profile
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            }
          />
        )}
      </div>
    </AppShell>
  );
}
