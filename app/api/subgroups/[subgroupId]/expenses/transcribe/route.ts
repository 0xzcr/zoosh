import { NextResponse } from "next/server";

import { apiError } from "@/lib/api-errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
  "video/mp4",
]);
const ALLOWED_EXTENSIONS = new Set([".m4a", ".mp3", ".mp4", ".mpeg", ".mpga", ".ogg", ".wav", ".webm"]);

type TranscriptionSegment = {
  avg_logprob?: unknown;
  no_speech_prob?: unknown;
};

type TranscriptionPayload = {
  text?: unknown;
  segments?: unknown;
};

function isSupportedAudio(file: File) {
  if (ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) return true;
  const name = file.name.toLowerCase();
  return [...ALLOWED_EXTENSIONS].some((extension) => name.endsWith(extension));
}

function hasLowConfidence(payload: TranscriptionPayload, transcript: string) {
  if (!transcript.trim()) return true;

  const segments = Array.isArray(payload.segments)
    ? payload.segments.filter((segment): segment is TranscriptionSegment => Boolean(segment && typeof segment === "object"))
    : [];
  if (segments.length === 0) return false;

  const logProbabilities = segments
    .map((segment) => typeof segment.avg_logprob === "number" ? segment.avg_logprob : null)
    .filter((value): value is number => value !== null);
  const noSpeechProbabilities = segments
    .map((segment) => typeof segment.no_speech_prob === "number" ? segment.no_speech_prob : null)
    .filter((value): value is number => value !== null);

  const averageLogProbability = logProbabilities.length > 0
    ? logProbabilities.reduce((sum, value) => sum + value, 0) / logProbabilities.length
    : 0;
  const highestNoSpeechProbability = noSpeechProbabilities.length > 0
    ? Math.max(...noSpeechProbabilities)
    : 0;

  return averageLogProbability < -1.2 || highestNoSpeechProbability > 0.6;
}

export async function POST(request: Request, { params }: { params: Promise<{ subgroupId: string }> }) {
  const { subgroupId } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("UNAUTHORIZED", "Sign in to record an expense.", 401);

  const [{ data: subgroup }, { data: membership }] = await Promise.all([
    supabase.from("outing_subgroups").select("id, status").eq("id", subgroupId).maybeSingle(),
    supabase.from("subgroup_members").select("user_id").eq("subgroup_id", subgroupId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!subgroup) return apiError("SUBGROUP_NOT_FOUND", "Outing not found.", 404);
  if (subgroup.status !== "active") return apiError("SUBGROUP_NOT_ACTIVE", "This outing is no longer active.", 409);
  if (!membership) return apiError("FORBIDDEN", "You can only record expenses in an outing you belong to.", 403);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return apiError("VALIDATION_FAILED", "Record an audio message before sending it.", 400);
  if (file.size === 0) return apiError("VALIDATION_FAILED", "The audio recording was empty.", 400);
  if (file.size > MAX_AUDIO_BYTES) return apiError("VALIDATION_FAILED", "Keep voice expenses under one minute and 8 MB.", 413);
  if (!isSupportedAudio(file)) return apiError("VALIDATION_FAILED", "Use a supported audio recording format.", 415);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return apiError("PROVIDER_NOT_CONFIGURED", "Voice transcription is not configured yet.", 503);

  const transcriptionForm = new FormData();
  transcriptionForm.append("file", file, file.name || "zoosh-expense.webm");
  transcriptionForm.append("model", process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "whisper-1");
  transcriptionForm.append("response_format", "verbose_json");
  transcriptionForm.append("temperature", "0");
  transcriptionForm.append("prompt", "Zoosh group expense vocabulary: rupees, paise, dinner, lunch, outing, group members.");

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: transcriptionForm,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json().catch(() => null) as TranscriptionPayload & {
      error?: { message?: string };
    } | null;
    if (!response.ok) {
      return apiError("TRANSCRIPTION_FAILED", payload?.error?.message ?? "The voice recording could not be transcribed.", 502);
    }

    const transcript = typeof payload?.text === "string" ? payload.text.trim() : "";
    if (!transcript) return apiError("TRANSCRIPTION_EMPTY", "We could not hear a clear expense. Try recording it again.", 422);
    if (transcript.length > 1000) return apiError("TRANSCRIPTION_TOO_LONG", "Keep the expense to one short sentence, then try again.", 422);

    return NextResponse.json({
      transcript,
      low_confidence: hasLowConfidence(payload ?? {}, transcript),
    });
  } catch (error) {
    return apiError("TRANSCRIPTION_FAILED", error instanceof Error ? error.message : "The voice recording could not be transcribed.", 502);
  }
}
