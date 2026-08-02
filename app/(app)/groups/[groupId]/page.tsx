import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, UsersRound } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { EmptyState } from "@/components/common/empty-state";
import { InviteCreateForm } from "@/components/forms/invite-create-form";
import { SubgroupCreateForm } from "@/components/forms/subgroup-create-form";
import { SubgroupJoinForm } from "@/components/forms/subgroup-join-form";
import { Button } from "@/components/ui/button";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveUserLabel } from "@/lib/user-label";

export const dynamic = "force-dynamic";

type FriendGroupRow = {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
};

type FriendGroupMemberRow = {
  user_id: string;
  joined_at: string;
};

type OutingSubgroupRow = {
  id: string;
  name: string;
  status: "active" | "ended" | "settled";
  leader_id: string;
  created_at: string;
  last_activity_at: string;
};

type OutingMemberRow = {
  subgroup_id: string;
  user_id: string;
  joined_at: string;
};

export default async function GroupDetailPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  if (!groupId) notFound();

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/groups/${groupId}`);
  }

  const admin = createSupabaseAdminClient() as any;
  const { data: membership } = await admin
    .from("friend_group_members")
    .select("friend_group_id")
    .eq("friend_group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    redirect("/groups");
  }

  const [{ data: groupData }, { data: membersData }, { data: outingsData }] = await Promise.all([
    admin.from("friend_groups").select("id, name, created_at, created_by").eq("id", groupId).maybeSingle(),
    admin.from("friend_group_members").select("user_id, joined_at").eq("friend_group_id", groupId).order("joined_at", { ascending: true }),
    admin
      .from("outing_subgroups")
      .select("id, name, status, leader_id, created_at, last_activity_at")
      .eq("friend_group_id", groupId)
      .order("created_at", { ascending: false }),
  ]);

  const group = groupData as FriendGroupRow | null;
  if (!group) {
    notFound();
  }

  const members = (membersData ?? []) as FriendGroupMemberRow[];
  const memberLabels = await Promise.all(
    members.map(async (member) => ({
      ...member,
      label: await resolveUserLabel(member.user_id),
    })),
  );
  const memberLabelById = new Map(memberLabels.map((member) => [member.user_id, member.label] as const));

  const outings = (outingsData ?? []) as OutingSubgroupRow[];
  const outingIds = outings.map((outing) => outing.id);
  const { data: outingMembersData } = outingIds.length
    ? await admin
        .from("subgroup_members")
        .select("subgroup_id, user_id, joined_at")
        .in("subgroup_id", outingIds)
        .order("joined_at", { ascending: true })
    : { data: [] as OutingMemberRow[] };
  const outingMembers = (outingMembersData ?? []) as OutingMemberRow[];

  const outingSummaries = outings.map((outing) => {
    const subgroupMembers = outingMembers.filter((member) => member.subgroup_id === outing.id);
    const currentUserMember = subgroupMembers.some((member) => member.user_id === user.id);
    const createdOn = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(outing.created_at));

    return {
      ...outing,
      memberCount: subgroupMembers.length,
      members: subgroupMembers,
      currentUserMember,
      createdOn,
      leaderLabel: memberLabelById.get(outing.leader_id) ?? "Group leader",
    };
  });

  return (
    <AppShell>
      <Link href="/groups" className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
        <ArrowLeft className="size-4" aria-hidden="true" />
        All groups
      </Link>

      <section className="mt-8 border-l-2 border-[color:var(--accent)] py-3 pl-5 sm:pl-7">
        <div>
          <p className="eyebrow">Friends group</p>
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl tracking-[-0.06em]">{group.name}</h1>
        </div>
      </section>

      <div className="mt-8 grid items-start gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <SubgroupCreateForm groupId={group.id} />
        <InviteCreateForm groupId={group.id} />
      </div>

      <section className="-mx-5 mt-8 border-y border-[color:var(--line)] bg-[color:var(--surface-strong)] px-5 py-7 sm:-mx-8 sm:px-8 sm:py-9">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Outings</p>
            <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">Your outings</h2>
          </div>
          <p className="text-sm leading-6 text-[color:var(--muted)]">
            {outingSummaries.length} {outingSummaries.length === 1 ? "outing" : "outings"} in this Friends Group.
          </p>
        </div>

        {outingSummaries.length > 0 ? (
          <div className="mt-6 border-t border-[color:var(--line)]">
            {outingSummaries.map((outing) => (
              <article key={outing.id} className="border-b border-[color:var(--line)] py-6 last:border-b-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow">Outing {outing.status === "active" ? "active" : outing.status}</p>
                    <h3 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">{outing.name}</h3>
                    <p className="mt-2 text-xs font-medium text-[color:var(--muted)]">
                      {outing.leader_id === user.id ? "You are the leader" : `Leader: ${outing.leaderLabel}`}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 text-sm leading-6 text-[color:var(--muted)] sm:grid-cols-2">
                  <p>Members: <span className="font-semibold text-[color:var(--foreground)]">{outing.memberCount}</span></p>
                  <p>Currency: <span className="font-semibold text-[color:var(--foreground)]">INR</span></p>
                  <p className="sm:col-span-2">Created on - <span className="font-semibold text-[color:var(--foreground)]">{outing.createdOn}</span></p>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  {outing.currentUserMember ? (
                    <Link
                      href={`/groups/${group.id}/outings/${outing.id}`}
                      className="deco-link-button deco-link-button-primary"
                    >
                      Open outing
                    </Link>
                  ) : (
                    <SubgroupJoinForm groupId={group.id} subgroupId={outing.id} />
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            eyebrow="No outings yet"
            title="Create the first outing for this group."
            description="A Friends Group is the lasting container. Each outing keeps its own members, balances, and settlement path separate."
          />
        )}
      </section>

      <div className="mt-8">
        <section className="section-frame rounded-[1.75rem] p-6 sm:p-7">
          <div className="flex items-center gap-2">
            <UsersRound className="size-5 text-[color:var(--accent)]" aria-hidden="true" />
            <p className="eyebrow">People in this group</p>
          </div>
          <ul className="mt-5 space-y-3">
            {memberLabels.map((member) => (
              <li key={member.user_id} className="rounded-2xl bg-[color:var(--surface-strong)] px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-[color:var(--foreground)]">{member.label}</span>
                  <span className="text-[color:var(--muted)]">Joined</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="mt-8">
        <EmptyState
          eyebrow="Ledger next"
          title="Open an outing to start logging expenses."
          description="Each outing keeps its own balances and recent activity, so the group page stays focused on the planning layer."
        />
      </div>
    </AppShell>
  );
}
