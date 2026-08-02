"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { LoaderCircle, Mic, MicOff, Send } from "lucide-react";

import { ExpenseConfirmationCard, type ExpenseDraft, type ExpenseDuplicateWarning, type ExpenseMemberOption } from "@/components/forms/expense-confirmation-card";
import { Button } from "@/components/ui/button";

type ExpenseEntryFormProps = {
  subgroupId: string;
  subgroupName: string;
  currency: string;
  members: ExpenseMemberOption[];
};

type ParseResponse =
  | {
      clarification_needed: string;
    }
  | {
      draft: ExpenseDraft;
      duplicate_warning?: ExpenseDuplicateWarning | null;
      average_expense_amount_paise?: number | null;
      requires_extra_confirmation?: boolean;
    };

type VoiceTranscriptionResponse = {
  transcript?: string;
  low_confidence?: boolean;
  error?: { message?: string };
};

export function ExpenseEntryForm({ subgroupId, subgroupName, currency, members }: ExpenseEntryFormProps) {
  const [input, setInput] = useState("");
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<ExpenseDuplicateWarning | null>(null);
  const [averageExpenseAmountPaise, setAverageExpenseAmountPaise] = useState<number | null>(null);
  const [clarification, setClarification] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"text" | "voice">("text");
  const [heardTranscript, setHeardTranscript] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isParsing, startParsing] = useTransition();
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<number | null>(null);
  const unmountedRef = useRef(false);

  function clearDraft() {
    setDraft(null);
    setDuplicateWarning(null);
    setAverageExpenseAmountPaise(null);
    setClarification(null);
  }

  async function parseExpenseText(inputText: string) {
    const response = await fetch(`/api/subgroups/${subgroupId}/expenses/parse`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ input: inputText }),
    });

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = typeof payload === "object" && payload && "error" in payload
        ? (payload as { error?: { message?: string } }).error?.message
        : null;
      throw new Error(message ?? "Could not prepare that expense right now.");
    }

    const parsed = payload as ParseResponse;
    if ("clarification_needed" in parsed) {
      clearDraft();
      setClarification(parsed.clarification_needed);
      setStatusMessage("Add the missing details, then review the expense again.");
      return;
    }

    setClarification(null);
    setDraft(parsed.draft);
    setDuplicateWarning(parsed.duplicate_warning ?? null);
    setAverageExpenseAmountPaise(parsed.average_expense_amount_paise ?? null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedInput = input.trim();
    setError(null);
    setStatusMessage(null);

    if (!trimmedInput) {
      setError("Describe the expense so everyone can review it.");
      return;
    }

    startParsing(() => {
      void parseExpenseText(trimmedInput).catch((parseError: unknown) => {
        setError(parseError instanceof Error ? parseError.message : "Could not prepare that expense right now.");
      });
    });
  }

  function stopRecording() {
    if (recordingTimeoutRef.current !== null) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }

  async function transcribeRecording(blob: Blob) {
    setIsTranscribing(true);
    setError(null);
    setStatusMessage("Transcribing your expense. Nothing is saved until you confirm it.");

    try {
      const formData = new FormData();
      const extension = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
      formData.append("file", blob, `zoosh-expense.${extension}`);
      const response = await fetch(`/api/subgroups/${subgroupId}/expenses/transcribe`, {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => null) as VoiceTranscriptionResponse | null;
      if (!response.ok || !payload?.transcript) {
        throw new Error(payload?.error?.message ?? "We could not hear a clear expense. Try recording it again.");
      }

      const transcript = payload.transcript.trim();
      if (unmountedRef.current) return;
      setInput(transcript);
      setSource("voice");
      setHeardTranscript(transcript);
      clearDraft();

      if (payload.low_confidence) {
        setStatusMessage("The recording may be unclear. Check the transcript, correct it if needed, then review the expense.");
        return;
      }

      setStatusMessage("Heard clearly. Preparing the same expense review used for typed entries...");
      await parseExpenseText(transcript);
    } catch (transcriptionError: unknown) {
      if (!unmountedRef.current) {
        setError(transcriptionError instanceof Error ? transcriptionError.message : "The voice recording could not be transcribed.");
      }
    } finally {
      if (!unmountedRef.current) setIsTranscribing(false);
    }
  }

  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported by this browser. Type the expense instead.");
      return;
    }

    setError(null);
    setStatusMessage("Recording... tap again when you finish the expense.");

    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (unmountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        setError("The recording stopped unexpectedly. Try again or type the expense.");
      };
      recorder.onstop = () => {
        const audio = new Blob(chunksRef.current, { type: recorder.mimeType || mimeType || "audio/webm" });
        stream?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
        setIsRecording(false);
        if (!unmountedRef.current && audio.size > 0) void transcribeRecording(audio);
      };
      recorder.start();
      setIsRecording(true);
      recordingTimeoutRef.current = window.setTimeout(stopRecording, 60_000);
    } catch (recordingError: unknown) {
      stream?.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
      setError(recordingError instanceof Error && recordingError.name === "NotAllowedError"
        ? "Microphone access was blocked. Allow microphone access or type the expense instead."
        : "The microphone could not start. Type the expense instead.");
    }
  }

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (recordingTimeoutRef.current !== null) window.clearTimeout(recordingTimeoutRef.current);
      recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <section className="section-frame rounded-[1.75rem] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">New expense</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl tracking-[-0.04em]">Put it in words.</h2>
        </div>
        <Mic className="mt-1 size-5 text-[color:var(--accent)]" aria-hidden="true" />
      </div>

      <form onSubmit={handleSubmit} className="mt-5">
        <label className="block" htmlFor={`expense-input-${subgroupId}`}>
          <span className="sr-only">Expense description</span>
          <textarea
            id={`expense-input-${subgroupId}`}
            rows={4}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              clearDraft();
              setSource("text");
              setHeardTranscript(null);
              setStatusMessage(null);
            }}
            className="w-full resize-none rounded-2xl border border-[color:var(--line)] bg-[color:var(--surface-strong)] px-4 py-3 leading-6 outline-none transition focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:var(--accent-soft)]"
            placeholder={`Describe what was paid in ${subgroupName}.`}
          />
        </label>

        {clarification ? (
          <p className="mt-3 rounded-2xl bg-[color:var(--paper)] px-4 py-3 text-sm leading-6 text-[color:var(--muted)]" role="status">
            {clarification}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-[color:var(--accent)]" role="alert">
            {error}
          </p>
        ) : null}

        {statusMessage ? (
          <p className="mt-3 text-sm text-[color:var(--accent-deep)]" role="status">
            {statusMessage}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="submit" disabled={isParsing || isTranscribing || isRecording}>
            {isParsing ? <Send className="size-4 animate-pulse" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
            {isParsing ? "Preparing review" : "Review expense"}
          </Button>
          <Button
            variant={isRecording ? "primary" : "secondary"}
            type="button"
            aria-label={isRecording ? "Stop recording and review expense" : "Start voice expense recording"}
            aria-pressed={isRecording}
            disabled={isParsing || isTranscribing}
            onClick={() => void toggleRecording()}
          >
            {isTranscribing ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : isRecording ? <MicOff className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
            {isTranscribing ? "Transcribing" : isRecording ? "Stop & review" : "Record voice"}
          </Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-[color:var(--muted)]">
          {isRecording ? "Tap again when you finish. The recording is sent for transcription only." : "Tap Record voice, say one expense, then tap again. You will always review it before saving."}
        </p>
      </form>

      {draft ? (
        <div className="mt-5">
          <ExpenseConfirmationCard
            key={`${draft.total_amount_paise}:${draft.description}:${draft.participant_ids.join(",")}`}
            subgroupId={subgroupId}
            currency={currency}
            members={members}
            draft={draft}
            duplicateWarning={duplicateWarning}
            averageExpenseAmountPaise={averageExpenseAmountPaise}
            source={source}
            heardTranscript={heardTranscript}
            onConfirmed={() => {
              clearDraft();
              setInput("");
              setSource("text");
              setHeardTranscript(null);
              setStatusMessage("Expense confirmed and balances updated.");
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
