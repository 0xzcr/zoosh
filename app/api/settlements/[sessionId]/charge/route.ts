import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import type { CashfreeBrowserDetails } from "@/lib/cashfree";
import { initiateSettlementCharge } from "@/lib/settlement-charge";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseBrowserDetails(value: unknown): CashfreeBrowserDetails | null {
  if (!value || typeof value !== "object") return null;
  const browser = value as Record<string, unknown>;
  const booleanValue = (candidate: unknown) => typeof candidate === "boolean" ? candidate : null;
  const numberValue = (candidate: unknown, min: number, max: number) => {
    if (typeof candidate !== "number" || !Number.isInteger(candidate) || candidate < min || candidate > max) return null;
    return candidate;
  };
  const stringValue = (candidate: unknown, max: number) => typeof candidate === "string" && candidate.trim().length > 0 ? candidate.trim().slice(0, max) : null;

  const javaEnabled = booleanValue(browser.javaEnabled);
  const javascriptEnabled = booleanValue(browser.javascriptEnabled);
  const timezoneOffset = numberValue(browser.timezoneOffset, -840, 840);
  const colorDepth = numberValue(browser.colorDepth, 1, 64);
  const screenWidth = numberValue(browser.screenWidth, 1, 10000);
  const screenHeight = numberValue(browser.screenHeight, 1, 10000);
  const language = stringValue(browser.language, 8);
  const userAgent = stringValue(browser.userAgent, 512);
  const referrer = typeof browser.referrer === "string" ? browser.referrer.trim().slice(0, 2048) : undefined;

  if (javaEnabled === null || javascriptEnabled === null || timezoneOffset === null || colorDepth === null || screenWidth === null || screenHeight === null || !language || !userAgent) return null;
  return { javaEnabled, javascriptEnabled, timezoneOffset, colorDepth, screenWidth, screenHeight, language, userAgent, referrer };
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to complete this payment.", 401);

  const body = (await request.json().catch(() => null)) as { browser?: unknown } | null;
  const browser = parseBrowserDetails(body?.browser);
  if (!browser) return apiError("VALIDATION_FAILED", "Browser payment details are required.", 400);

  try {
    const result = await initiateSettlementCharge({
      sessionId,
      user: { id: user.id, email: user.email, user_metadata: user.user_metadata },
      browser,
      request,
    });
    return NextResponse.json(result, { status: result.status === "charged" || result.status === "declined" ? 200 : 202 });
  } catch (error) {
    return apiError("VALIDATION_FAILED", error instanceof Error ? error.message : "The payment could not be started.", 409);
  }
}
