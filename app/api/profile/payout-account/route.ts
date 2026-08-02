import { NextResponse } from "next/server";

import { createCashfreeBeneficiary, getCashfreeBeneficiary } from "@/lib/cashfree";
import { apiError } from "@/lib/api-errors";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function readString(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to connect a payout destination.", 401);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const name = readString(body?.name, 100);
  const bankAccount = readString(body?.bankAccount, 25).toUpperCase();
  const ifsc = readString(body?.ifsc, 11).toUpperCase();
  const vpa = readString(body?.vpa, 100);

  if (!/^[A-Za-z ]{2,100}$/.test(name)) {
    return apiError("VALIDATION_FAILED", "Enter the beneficiary name using letters and spaces only.", 400);
  }
  if (!bankAccount && !vpa) {
    return apiError("VALIDATION_FAILED", "Enter a bank account with IFSC or a UPI ID.", 400);
  }
  if (bankAccount && (!/^[A-Z0-9]{4,25}$/.test(bankAccount) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc))) {
    return apiError("VALIDATION_FAILED", "Enter a valid bank account and 11-character IFSC.", 400);
  }
  if (vpa && !/^[A-Za-z0-9._-]{2,100}@[A-Za-z0-9.-]{2,100}$/.test(vpa)) {
    return apiError("VALIDATION_FAILED", "Enter a valid UPI ID.", 400);
  }
  if (!user.email) return apiError("VALIDATION_FAILED", "Your account needs an email before payout setup.", 400);

  const [{ data: existing }, { data: contact }] = await Promise.all([
    supabase.from("user_payout_accounts").select("cashfree_beneficiary_id, onboarding_complete").eq("user_id", user.id).maybeSingle(),
    supabase.from("notification_contacts").select("phone_e164").eq("user_id", user.id).maybeSingle(),
  ]);
  if (existing?.cashfree_beneficiary_id) {
    return NextResponse.json({ connected: true, status: existing.onboarding_complete ? "VERIFIED" : "PENDING" });
  }
  const phoneDigits = contact?.phone_e164?.replace(/\D/g, "") ?? "";
  const phone = phoneDigits.startsWith("91") && phoneDigits.length === 12 ? phoneDigits.slice(2) : phoneDigits;
  if (!/^\d{10}$/.test(phone)) {
    return apiError("VALIDATION_FAILED", "Add an Indian phone number in Profile before connecting payouts.", 400);
  }

  try {
    let beneficiary;
    try {
      beneficiary = await createCashfreeBeneficiary({
        beneficiaryId: `zoosh_${user.id.replace(/-/g, "")}`,
        name,
        email: user.email,
        phone,
        bankAccount: bankAccount || undefined,
        ifsc: bankAccount ? ifsc : undefined,
        vpa: vpa || undefined,
      });
    } catch (error) {
      if (!(error instanceof Error && error.message.toLowerCase().includes("already"))) throw error;
      beneficiary = await getCashfreeBeneficiary(`zoosh_${user.id.replace(/-/g, "")}`);
    }
    const beneficiaryStatus = beneficiary.beneficiary_status ?? beneficiary.status ?? "PENDING";
    const { error } = await supabase.from("user_payout_accounts").upsert({
      user_id: user.id,
      cashfree_beneficiary_id: beneficiary.beneficiary_id,
      onboarding_complete: beneficiaryStatus === "VERIFIED",
      updated_at: new Date().toISOString(),
    });
    if (error) return apiError("VALIDATION_FAILED", error.message, 400);
    return NextResponse.json({ connected: true, status: beneficiaryStatus });
  } catch (error) {
    return apiError("VALIDATION_FAILED", error instanceof Error ? error.message : "Cashfree payout setup failed.", 502);
  }
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to view payout setup.", 401);
  const { data, error } = await supabase.from("user_payout_accounts").select("cashfree_beneficiary_id, onboarding_complete").eq("user_id", user.id).maybeSingle();
  if (error) return apiError("VALIDATION_FAILED", error.message, 400);
  if (data?.cashfree_beneficiary_id) {
    try {
      const beneficiary = await getCashfreeBeneficiary(data.cashfree_beneficiary_id);
      const status = beneficiary.beneficiary_status ?? beneficiary.status ?? (data.onboarding_complete ? "VERIFIED" : "PENDING");
      const verified = status === "VERIFIED";
      if (verified !== Boolean(data.onboarding_complete)) {
        await supabase.from("user_payout_accounts").update({ onboarding_complete: verified, updated_at: new Date().toISOString() }).eq("user_id", user.id);
      }
      return NextResponse.json({ connected: true, status });
    } catch {
      // Keep the last known local state when Cashfree is temporarily unavailable.
    }
  }
  return NextResponse.json({
    connected: Boolean(data?.cashfree_beneficiary_id),
    status: data?.onboarding_complete ? "VERIFIED" : data?.cashfree_beneficiary_id ? "PENDING" : null,
  });
}
