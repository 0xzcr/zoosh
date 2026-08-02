import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Banknote, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { PravaPayment } from "@/components/forms/prava-payment";
import { SettlementCharge } from "@/components/forms/settlement-charge";
import { formatCurrency } from "@/lib/format-currency";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveUserLabel } from "@/lib/user-label";

export const dynamic = "force-dynamic";

type SettlementSession = {
  id: string;
  debtor_id: string;
  subgroup_id: string;
  total_amount_paise: number;
  status: string;
};

export default async function SettlementPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/settlements/${sessionId}`);

  const admin = createSupabaseAdminClient() as any;
  const [{ data: sessionData }, { data: payoutData }] = await Promise.all([
    admin.from("settlement_sessions").select("id, debtor_id, subgroup_id, total_amount_paise, status").eq("id", sessionId).maybeSingle(),
    admin.from("settlement_payouts").select("id, creditor_id, amount_paise").eq("settlement_session_id", sessionId).order("amount_paise", { ascending: false }),
  ]);
  const session = sessionData as SettlementSession | null;
  if (!session || session.debtor_id !== user.id) notFound();

  const [{ data: subgroupData }, creditorLabels] = await Promise.all([
    admin.from("outing_subgroups").select("id, friend_group_id, name, currency").eq("id", session.subgroup_id).maybeSingle(),
    Promise.all(((payoutData ?? []) as Array<{ creditor_id: string }>).map(async (payout) => [payout.creditor_id, await resolveUserLabel(payout.creditor_id)] as const)),
  ]);
  if (!subgroupData) notFound();
  const labelById = new Map(creditorLabels);

  return (
    <AppShell>
      <Link href={`/groups/${subgroupData.friend_group_id}/outings/${subgroupData.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to outing
      </Link>
      <section className="mx-auto mt-8 max-w-3xl">
        <p className="eyebrow">One Zoosh payment</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl tracking-[-0.06em]">Settle {subgroupData.name}</h1>
        <div className="mt-8 section-frame rounded-[1.75rem] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <p className="eyebrow">You pay once</p>
              <p className="mt-3 font-[family-name:var(--font-display)] text-5xl tracking-[-0.06em]">{formatCurrency(session.total_amount_paise, subgroupData.currency)}</p>
            </div>
            <Banknote className="size-8 text-[color:var(--accent)]" aria-hidden="true" />
          </div>
          <p className="mt-5 leading-7 text-[color:var(--muted)]">Zoosh will split this payment across the people who are owed money. You will never need to pay each person separately.</p>
          <div className="mt-6 border-t border-[color:var(--line)] pt-5">
            <p className="eyebrow">Distribution</p>
            <ul className="mt-3 space-y-2 text-sm">
              {((payoutData ?? []) as Array<{ creditor_id: string; amount_paise: number }>).map((payout) => (
                <li key={payout.creditor_id} className="flex items-center justify-between gap-4 border-b border-[color:var(--line)] py-2 last:border-b-0">
                  <span>{labelById.get(payout.creditor_id) ?? "Group member"}</span>
                  <span className="font-semibold">{formatCurrency(payout.amount_paise, subgroupData.currency)}</span>
                </li>
              ))}
            </ul>
          </div>
          {session.status === "charged" ? (
            <div className="mt-6 flex items-center gap-3 text-sm font-semibold text-[color:var(--accent-light)]"><ShieldCheck className="size-5" aria-hidden="true" />Payment already confirmed.</div>
          ) : session.status === "approved_awaiting_charge" ? (
            <SettlementCharge sessionId={session.id} />
          ) : (
            <PravaPayment sessionId={session.id} />
          )}
        </div>
      </section>
    </AppShell>
  );
}
