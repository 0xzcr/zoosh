import "server-only";

import { createCashfreeTransfer, getCashfreeTransferId, getCashfreeTransferStatus } from "@/lib/cashfree";
import { ProviderRequestError } from "@/lib/provider-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function distributeChargedSettlement(sessionId: string) {
  const admin = createSupabaseAdminClient() as any;
  const { data: session } = await admin
    .from("settlement_sessions")
    .select("id, subgroup_id, status, provider_payment_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status !== "charged") throw new Error("Only charged settlement sessions can be distributed.");
  if (!session.provider_payment_id) throw new Error("A confirmed Cashfree payment id is required before distribution.");

  const { data: payouts } = await admin
    .from("settlement_payouts")
    .select("id, creditor_id, amount_paise, status, cashfree_transfer_id")
    .eq("settlement_session_id", sessionId)
    .eq("status", "pending_payout")
    .order("created_at", { ascending: true });

  const results = [];
  for (const payout of payouts ?? []) {
    if (payout.cashfree_transfer_id) {
      try {
        const transfer = await getCashfreeTransferStatus(payout.cashfree_transfer_id);
        if (transfer.status?.toUpperCase() === "SUCCESS" && transfer.status_code?.toUpperCase() === "COMPLETED") {
          const { error } = await admin.rpc("mark_settlement_payout_paid", {
            p_payout_id: payout.id,
            p_transfer_id: payout.cashfree_transfer_id,
          });
          results.push({ payoutId: payout.id, status: error ? "failed" : "paid", transferId: payout.cashfree_transfer_id });
          continue;
        }
        if (["FAILED", "REJECTED", "REVERSED"].includes(transfer.status?.toUpperCase() ?? "")) {
          await admin.from("settlement_payouts").update({
            cashfree_transfer_id: null,
            payout_started_at: null,
            failure_reason: transfer.status_description ?? `Cashfree reported ${(transfer.status ?? "transfer").toLowerCase()}.`,
            updated_at: new Date().toISOString(),
          }).eq("id", payout.id).eq("status", "pending_payout");
        } else {
          results.push({ payoutId: payout.id, status: transfer.status ?? "processing", transferId: payout.cashfree_transfer_id });
          continue;
        }
      } catch (error) {
        results.push({ payoutId: payout.id, status: "processing", transferId: payout.cashfree_transfer_id, message: error instanceof Error ? error.message : undefined });
        continue;
      }
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

    if (payout.amount_paise < 100) {
      await admin
        .from("settlement_payouts")
        .update({
          payout_started_at: null,
          failure_reason: "Cashfree payouts must be at least INR 1.00.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id)
        .eq("status", "pending_payout");
      results.push({ payoutId: payout.id, status: "blocked" });
      continue;
    }

    const { data: account } = await admin
      .from("user_payout_accounts")
      .select("cashfree_beneficiary_id, onboarding_complete")
      .eq("user_id", payout.creditor_id)
      .maybeSingle();
    if (!account?.cashfree_beneficiary_id || !account.onboarding_complete) {
      await admin
        .from("settlement_payouts")
        .update({
          payout_started_at: null,
          failure_reason: "Creditor has not connected a Cashfree bank or UPI destination.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id)
        .eq("status", "pending_payout");
      results.push({ payoutId: payout.id, status: "blocked" });
      continue;
    }

    try {
      const transferId = getCashfreeTransferId(payout.id);
      let transfer;
      try {
        transfer = await createCashfreeTransfer({
          beneficiaryId: account.cashfree_beneficiary_id,
          amountPaise: payout.amount_paise,
          transferId,
          idempotencyKey: payout.id,
        });
      } catch (error) {
        if (!(error instanceof ProviderRequestError)) throw error;
        try {
          transfer = await getCashfreeTransferStatus(transferId);
        } catch {
          throw error;
        }
      }
      const { error } = await admin
        .from("settlement_payouts")
        .update({
          cashfree_transfer_id: transfer.transfer_id,
          payout_started_at: null,
          updated_at: new Date().toISOString(),
          failure_reason: null,
        })
        .eq("id", payout.id)
        .eq("status", "pending_payout");
      if (error) {
        results.push({ payoutId: payout.id, status: "failed" });
        continue;
      }

      if (transfer.status?.toUpperCase() === "SUCCESS" && transfer.status_code?.toUpperCase() === "COMPLETED") {
        const { error: markPaidError } = await admin.rpc("mark_settlement_payout_paid", {
          p_payout_id: payout.id,
          p_transfer_id: transfer.transfer_id,
        });
        results.push({ payoutId: payout.id, status: markPaidError ? "failed" : "paid", transferId: transfer.transfer_id });
      } else {
        results.push({ payoutId: payout.id, status: transfer.status ?? "processing", transferId: transfer.transfer_id });
      }
    } catch (error) {
      await admin
        .from("settlement_payouts")
        .update({
          payout_started_at: null,
          failure_reason: error instanceof Error ? error.message : "Cashfree transfer failed.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payout.id)
        .eq("status", "pending_payout");
      results.push({ payoutId: payout.id, status: "failed" });
    }
  }

  return results;
}
