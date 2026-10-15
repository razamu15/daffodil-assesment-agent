/**
 * Error → HTTP mapping, as tables. Every error response has the ApiError shape
 * ({ error: { code, message } }) with the status from API_ERROR_HTTP_STATUS.
 *
 * Call sites: routing (validation failures), createApp's onError (CoreError,
 * StoreCommitError, anything else), handlers (ApiFailure for api-only checks).
 */
import { API_ERROR_HTTP_STATUS, ApiErrorCode, StoreCommitError, StoreFailureReason } from "@helper-assistant/domain";
import type { ApiError, ApiErrorCode as ApiErrorCodeT } from "@helper-assistant/domain";
import { CoreError, CoreErrorCode } from "@helper-assistant/core";
import type { CoreErrorCode as CoreErrorCodeT } from "@helper-assistant/core";

/** A failure the api itself detects (bad token, oversize upload, unknown route). */
export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCodeT,
    message: string,
  ) {
    super(message);
    this.name = "ApiFailure";
  }
}

export const CORE_ERROR_API_CODE: Record<CoreErrorCodeT, ApiErrorCodeT> = {
  [CoreErrorCode.NOT_FOUND]: ApiErrorCode.NOT_FOUND,
  [CoreErrorCode.NOT_ALLOWED]: ApiErrorCode.VALIDATION_FAILED,
  [CoreErrorCode.CONFLICT]: ApiErrorCode.CONFLICT,
  [CoreErrorCode.SESSION_BUSY]: ApiErrorCode.SESSION_BUSY,
  [CoreErrorCode.ACTION_NOT_PENDING]: ApiErrorCode.ACTION_NOT_PENDING,
  [CoreErrorCode.BILL_NOT_APPROVABLE]: ApiErrorCode.BILL_NOT_APPROVABLE,
  [CoreErrorCode.BILL_NOT_PAYABLE]: ApiErrorCode.BILL_NOT_PAYABLE,
  // No api route records bills; mapped for completeness.
  [CoreErrorCode.PERIOD_ALREADY_APPROVED]: ApiErrorCode.CONFLICT,
};

/** A failed store condition is a conflict (409). Too many ops is our bug, not the caller's. */
export const STORE_FAILURE_API_CODE: Record<StoreFailureReason, ApiErrorCodeT> = {
  [StoreFailureReason.CONDITION_FAILED]: ApiErrorCode.CONFLICT,
  [StoreFailureReason.IMMUTABLE_RECORD]: ApiErrorCode.CONFLICT,
  [StoreFailureReason.TOO_MANY_OPS]: ApiErrorCode.INTERNAL,
};

export function toApiError(error: unknown): { status: number; body: ApiError } {
  let code: ApiErrorCodeT = ApiErrorCode.INTERNAL;
  let message = "Something went wrong on the server.";
  if (error instanceof ApiFailure) [code, message] = [error.code, error.message];
  else if (error instanceof CoreError) [code, message] = [CORE_ERROR_API_CODE[error.code], error.message];
  else if (error instanceof StoreCommitError) [code, message] = [STORE_FAILURE_API_CODE[error.reason], error.message];
  return { status: API_ERROR_HTTP_STATUS[code], body: { error: { code, message } } };
}
