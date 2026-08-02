import "server-only";

import { formatCurrency } from "@/lib/format-currency";
import { sendSettlementEmail } from "@/lib/email";
import { sendLinqSettlementNotification } from "@/lib/linq";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function notifySettlementSession(input: {
  sessionId: string;
  sentBy: string;
  appUrl: string;
}) {
  const admin = createSupabaseAdminClient() as any;
  const { data: session, error: sessionError } = await admin
    .from("settlement_sessions")
    .select("id, debtor_id, total_amount_paise, subgroup_id")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (sessionError || !session) throw new Error("Settlement session not found.");

  const { data: reminderClaim, error: reminderClaimError } = await admin
    .from("reminders")
    .insert({
      settlement_session_id: input.sessionId,
      sent_by: input.sentBy,
      kind: "initial",
      delivery_status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (reminderClaimError?.code === "23505") {
    return { skipped: true, linqMessageId: null, emailMessageId: null };
  }

  if (reminderClaimError || !reminderClaim) {
    throw new Error("Could not claim the settlement notification.");
  }

  const [{ data: contact }, { data: subgroup }, { data: authUser }] = await Promise.all([
    admin.from("notification_contacts").select("phone_e164").eq("user_id", session.debtor_id).maybeSingle(),
    admin.from("outing_subgroups").select("name, currency").eq("id", session.subgroup_id).maybeSingle(),
    admin.auth.admin.getUserById(session.debtor_id),
  ]);
  const email = authUser?.user?.email;
  if (!email) {
    await admin.from("reminders").update({ delivery_status: "failed" }).eq("id", reminderClaim.id);
    throw new Error("The debtor needs an email address before settlement can be notified.");
  }

  const paymentUrl = `${input.appUrl.replace(/\/$/, "")}/settlements/${session.id}`;
  const amountLabel = formatCurrency(session.total_amount_paise, subgroup?.currency ?? "INR");
  let linqMessageId: string | null = null;
  let emailMessageId: string | null = null;
  let linqSucceeded = false;
  let emailSucceeded = false;

  if (contact?.phone_e164) {
    try {
      const result = await sendLinqSettlementNotification({ phoneE164: contact.phone_e164, amountLabel, paymentUrl, settlementId: session.id });
      linqMessageId = result.messageId;
      linqSucceeded = true;
    } catch {
      linqSucceeded = false;
    }
  }

  try {
    const result = await sendSettlementEmail({ to: email, amountLabel, paymentUrl, outingName: subgroup?.name ?? "your outing" });
    emailMessageId = result.id;
    emailSucceeded = true;
  } catch {
    emailSucceeded = false;
  }

  const deliveryStatus = linqSucceeded && emailSucceeded ? "sent" : linqSucceeded || emailSucceeded ? "partial" : "failed";
  await admin.from("reminders").update({
    linq_message_id: linqMessageId,
    email_message_id: emailMessageId,
    delivery_status: deliveryStatus,
  }).eq("id", reminderClaim.id);

  return { skipped: false, linqMessageId, emailMessageId, deliveryStatus };
}
