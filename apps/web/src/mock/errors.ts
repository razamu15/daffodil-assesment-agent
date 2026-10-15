/** A failure the mock reports the way the real API does: { error: { code, message } } with the mapped HTTP status. */
import type { ApiErrorCode } from "@helper-assistant/domain";

export class MockApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "MockApiError";
  }
}
