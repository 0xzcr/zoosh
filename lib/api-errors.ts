import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_FAILED"
  | "INVITE_NOT_FOUND"
  | "INVITE_EXPIRED"
  | "SUBGROUP_NOT_FOUND"
  | "SUBGROUP_NOT_ACTIVE"
  | "SUBGROUP_ALREADY_ENDED"
  | "EXPENSE_INVALID_AMOUNT"
  | "EXPENSE_NOT_PAYER"
  | "EXPENSE_LOCKED"
  | "REMINDER_RATE_LIMITED"
  | "PROVIDER_NOT_CONFIGURED"
  | "TRANSCRIPTION_FAILED"
  | "TRANSCRIPTION_EMPTY"
  | "TRANSCRIPTION_TOO_LONG";

export function apiError(code: ApiErrorCode, message: string, status: number) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        http_status: status,
      },
    },
    { status },
  );
}
