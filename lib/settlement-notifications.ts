import "server-only";

import { formatCurrency } from "@/lib/format-currency";
import { sendSettlementEmail } from "@/lib/email";
import { sendLinqSettlementNotification } from "@/lib/linq";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveUserLabel } from "@/lib/user-label";

export async function notifySettlementSession(input: {
  sessionId: string;
  sentBy: string;
  appUrl: string;
  kind?: "initial" | "reminder";
  reminderId?: string;
}) {
  const admin = createSupabaseAdminClient() as any;
  const { data: session, error: sessionError } = await admin
    .from("settlement_sessions")
    .select("id, debtor_id, total_amount_paise, subgroup_id")
    .eq("id", input.sessionId)
    .maybeSingle();
  if (sessionError || !session) throw new Error("Settlement session not found.");

  const kind = input.kind ?? "initial";
  let reminderClaim: { id: string } | null = input.reminderId ? { id: input.reminderId } : null;
  if (!reminderClaim) {
    const { data: insertedReminder, error: reminderClaimError } = await admin
      .from("reminders")
      .insert({
        settlement_session_id: input.sessionId,
        sent_by: input.sentBy,
        kind,
        delivery_status: "pending",
      })
      .select("id")
      .maybeSingle();

    if (reminderClaimError?.code === "23505" && kind === "initial") {
      const { data: existingReminder } = await admin
        .from("reminders")
        .select("id, delivery_status")
        .eq("settlement_session_id", input.sessionId)
        .eq("kind", "initial")
        .maybeSingle();
      if (existingReminder?.delivery_status === "sent") return { skipped: true, linqMessageId: null, emailMessageId: null };
      if (existingReminder) {
        const { error: resetError } = await admin.from("reminders").update({
          sent_by: input.sentBy,
          sent_at: new Date().toISOString(),
          delivery_status: "pending",
          linq_message_id: null,
          email_message_id: null,
        }).eq("id", existingReminder.id);
        if (resetError) throw new Error("Could not retry the settlement notification.");
        reminderClaim = { id: existingReminder.id };
      }
    } else if (reminderClaimError || !insertedReminder) {
      throw new Error("Could not claim the settlement notification.");
    } else {
      reminderClaim = insertedReminder;
    }
  }

  const notificationId = reminderClaim?.id;
  if (!notificationId) throw new Error("Could not claim the settlement notification.");

  const [{ data: contact }, { data: subgroup }, { data: authUser }, { data: payouts }] = await Promise.all([
    admin.from("notification_contacts").select("phone_e164").eq("user_id", session.debtor_id).maybeSingle(),
    admin.from("outing_subgroups").select("name, currency").eq("id", session.subgroup_id).maybeSingle(),
    admin.auth.admin.getUserById(session.debtor_id),
    admin.from("settlement_payouts").select("creditor_id, amount_paise").eq("settlement_session_id", input.sessionId).order("amount_paise", { ascending: false }),
  ]);
  const email = authUser?.user?.email;
  if (!email) {
    await admin.from("reminders").update({ delivery_status: "failed" }).eq("id", notificationId);
    throw new Error("The debtor needs an email address before settlement can be notified.");
  }

  const paymentUrl = `${input.appUrl.replace(/\/$/, "")}/settlements/${session.id}`;
  const amountLabel = formatCurrency(session.total_amount_paise, subgroup?.currency ?? "INR");
  const breakdown = (await Promise.all(((payouts ?? []) as Array<{ creditor_id: string; amount_paise: number }>).map(async (payout) => `${formatCurrency(payout.amount_paise, subgroup?.currency ?? "INR")} to ${await resolveUserLabel(payout.creditor_id)}`))).join(", ");
  let linqMessageId: string | null = null;
  let emailMessageId: string | null = null;
  let linqSucceeded = false;
  let emailSucceeded = false;

  if (contact?.phone_e164) {
    try {
      const result = await sendLinqSettlementNotification({ phoneE164: contact.phone_e164, amountLabel, breakdown, paymentUrl, settlementId: session.id, notificationId });
      linqMessageId = result.messageId;
      linqSucceeded = true;
    } catch {
      linqSucceeded = false;
    }
  }

  try {
    const result = await sendSettlementEmail({ to: email, amountLabel, breakdown, paymentUrl, outingName: subgroup?.name ?? "your outing" });
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
  }).eq("id", notificationId);

  return { skipped: false, linqMessageId, emailMessageId, deliveryStatus };
}
