import "server-only";

import { ProviderConfigurationError, ProviderRequestError } from "@/lib/provider-errors";

export async function sendSettlementEmail(input: { to: string; amountLabel: string; breakdown: string; paymentUrl: string; outingName: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) {
    throw new ProviderConfigurationError("email", "RESEND_API_KEY and RESEND_FROM_EMAIL are not configured.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: `Zoosh settlement for ${input.outingName}`,
      text: `You have ${input.amountLabel} to pay for ${input.outingName}. ${input.breakdown ? `This covers ${input.breakdown}. ` : ""}Review and approve it here: ${input.paymentUrl}`,
    }),
  });
  const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!response.ok) {
    throw new ProviderRequestError("email", response.status, body?.message ?? "Email delivery failed.");
  }
  return { id: body?.id ?? null };
}
