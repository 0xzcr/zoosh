import "server-only";

import { createRazorpayPaymentTransfer } from "@/lib/razorpay";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function distributeChargedSettlement(sessionId: string) {
  const admin = createSupabaseAdminClient() as any;
  const { data: session } = await admin
    .from("settlement_sessions")
    .select("id, subgroup_id, status, provider_payment_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status !== "charged") throw new Error("Only charged settlement sessions can be distributed.");
  if (!session.provider_payment_id) throw new Error("A captured Razorpay payment id is required before distribution.");

  const { data: payouts } = await admin
    .from("settlement_payouts")
    .select("id, creditor_id, amount_paise, status, razorpay_transfer_id")
    .eq("settlement_session_id", sessionId)
    .eq("status", "pending_payout")
    .order("created_at", { ascending: true });

  const results = [];
  for (const payout of payouts ?? []) {
    if (payout.razorpay_transfer_id) {
      results.push({ payoutId: payout.id, status: "processing", transferId: payout.razorpay_transfer_id });
      continue;
    }

    const { data: claimed, error: claimError } = await admin.rpc("claim_settlement_payout", { p_payout_id: payout.id });
    if (claimError) {
      results.push({ payoutId: payout.id, status: "failed" });
      continue;
    }
    if (claimed !== true) {
      results.push({ payoutId: payout.id, status: "processing" });
      continue;
    }

    const { data: account } = await admin.from("user_payout_accounts").select("razorpay_account_id, onboarding_complete").eq("user_id", payout.creditor_id).maybeSingle();
    if (!account?.razorpay_account_id || !account.onboarding_complete) {
      await admin.from("settlement_payouts").update({ payout_started_at: null, failure_reason: "Creditor has not completed Razorpay onboarding.", updated_at: new Date().toISOString() }).eq("id", payout.id).eq("status", "pending_payout");
      results.push({ payoutId: payout.id, status: "blocked" });
      continue;
    }

    try {
      const transfer = await createRazorpayPaymentTransfer({
        paymentId: session.provider_payment_id,
        accountId: account.razorpay_account_id,
        amountPaise: payout.amount_paise,
        referenceId: payout.id,
      });
      const { error } = await admin.from("settlement_payouts").update({ razorpay_transfer_id: transfer.id, payout_started_at: null, updated_at: new Date().toISOString(), failure_reason: null }).eq("id", payout.id).eq("status", "pending_payout");
      results.push({ payoutId: payout.id, status: error ? "failed" : transfer.status ?? "created", transferId: transfer.id });
    } catch (error) {
      await admin.from("settlement_payouts").update({ payout_started_at: null, failure_reason: error instanceof Error ? error.message : "Razorpay transfer failed.", updated_at: new Date().toISOString() }).eq("id", payout.id).eq("status", "pending_payout");
      results.push({ payoutId: payout.id, status: "failed" });
    }
  }

  return results;
}
