import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { formatCurrency } from "@/lib/format-currency";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveUserLabel } from "@/lib/user-label";

export const dynamic = "force-dynamic";

type Expense = { id: string; payer_id: string; total_amount_paise: number; description: string; participants: string[]; created_at: string };
type Session = { id: string; debtor_id: string; total_amount_paise: number; status: string; created_at: string; paid_at: string | null };
type Payout = { id: string; settlement_session_id: string; creditor_id: string; amount_paise: number; status: string; failure_reason: string | null };

export default async function OutingReportPage({ params }: { params: Promise<{ groupId: string; subgroupId: string }> }) {
  const { groupId, subgroupId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/groups/${groupId}/outings/${subgroupId}/report`);

  const admin = createSupabaseAdminClient() as any;
  const [{ data: group }, { data: subgroup }, { data: membership }, { data: expensesData }, { data: sessionsData }] = await Promise.all([
    admin.from("friend_groups").select("id, name").eq("id", groupId).maybeSingle(),
    admin.from("outing_subgroups").select("id, friend_group_id, name, currency, status").eq("id", subgroupId).eq("friend_group_id", groupId).maybeSingle(),
    admin.from("subgroup_members").select("user_id").eq("subgroup_id", subgroupId).eq("user_id", user.id).maybeSingle(),
    admin.from("expenses").select("id, payer_id, total_amount_paise, description, participants, created_at").eq("subgroup_id", subgroupId).is("voided_at", null).order("created_at", { ascending: true }),
    admin.from("settlement_sessions").select("id, debtor_id, total_amount_paise, status, created_at, paid_at").eq("subgroup_id", subgroupId).order("created_at", { ascending: true }),
  ]);
  if (!group || !subgroup) notFound();
  if (!membership) redirect(`/groups/${groupId}/outings/${subgroupId}`);

  const sessions = (sessionsData ?? []) as Session[];
  const expenses = (expensesData ?? []) as Expense[];
  const sessionIds = sessions.map((session) => session.id);
  const { data: payoutsData } = sessionIds.length
    ? await admin.from("settlement_payouts").select("id, settlement_session_id, creditor_id, amount_paise, status, failure_reason").in("settlement_session_id", sessionIds).order("created_at", { ascending: true })
    : { data: [] as Payout[] };
  const payouts = (payoutsData ?? []) as Payout[];
  const userIds = new Set<string>();
  for (const expense of expenses) userIds.add(expense.payer_id);
  for (const session of sessions) userIds.add(session.debtor_id);
  for (const payout of payouts) userIds.add(payout.creditor_id);
  const labels = new Map(await Promise.all([...userIds].map(async (id) => [id, await resolveUserLabel(id)] as const)));
  const payoutsBySession = new Map<string, Payout[]>();
  for (const payout of payouts) payoutsBySession.set(payout.settlement_session_id, [...(payoutsBySession.get(payout.settlement_session_id) ?? []), payout]);

  return (
    <AppShell>
      <Link href={`/groups/${groupId}/outings/${subgroupId}`} className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to outing
      </Link>
      <section className="mt-8 border-l-2 border-[color:var(--accent)] py-3 pl-5 sm:pl-7">
        <p className="eyebrow">Expense report</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl tracking-[-0.06em]">{subgroup.name}</h1>
        <p className="mt-3 text-sm text-[color:var(--muted)]">{group.name} · {subgroup.status}</p>
      </section>

      <section className="mt-10 border-y border-[color:var(--line)] py-7 sm:py-9">
        <div className="flex items-center gap-2"><FileText className="size-5 text-[color:var(--accent)]" aria-hidden="true" /><p className="eyebrow">Logged expenses</p></div>
        {expenses.length ? (
          <ul className="mt-5 border-t border-[color:var(--line)]">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--line)] py-4 text-sm last:border-b-0">
                <div><p className="font-semibold text-[color:var(--foreground)]">{expense.description}</p><p className="mt-1 text-[color:var(--muted)]">Paid by {labels.get(expense.payer_id) ?? "Group member"} · {expense.participants.length} participants</p></div>
                <span className="font-semibold">{formatCurrency(expense.total_amount_paise, subgroup.currency)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-5 text-sm text-[color:var(--muted)]">No expenses were confirmed.</p>}
      </section>

      <section className="mt-8 border-y border-[color:var(--line)] py-7 sm:py-9">
        <p className="eyebrow">Settlement outcomes</p>
        {sessions.length ? (
          <ul className="mt-5 border-t border-[color:var(--line)]">
            {sessions.map((session) => (
              <li key={session.id} className="border-b border-[color:var(--line)] py-5 last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="font-semibold">{labels.get(session.debtor_id) ?? "Group member"}</span><span className="font-semibold">{formatCurrency(session.total_amount_paise, subgroup.currency)} · {session.status}</span></div>
                <ul className="mt-3 space-y-2 pl-4 text-sm text-[color:var(--muted)]">
                  {(payoutsBySession.get(session.id) ?? []).map((payout) => <li key={payout.id} className="flex flex-wrap justify-between gap-3"><span>To {labels.get(payout.creditor_id) ?? "Group member"}</span><span>{formatCurrency(payout.amount_paise, subgroup.currency)} · {payout.status}{payout.failure_reason ? ` · ${payout.failure_reason}` : ""}</span></li>)}
                </ul>
              </li>
            ))}
          </ul>
        ) : <p className="mt-5 text-sm text-[color:var(--muted)]">No settlement requests were prepared.</p>}
      </section>
    </AppShell>
  );
}
