/**
 * Errors that cross package boundaries. Thrown by Store implementations, caught
 * by core (to mark actions STALE) and by api (to map to 409).
 */

export const StoreFailureReason = {
  /** The ABSENT or VERSION condition on an op didn't hold. */
  CONDITION_FAILED: "CONDITION_FAILED",
  /** Attempted overwrite of an APPROVED bill. No code path may do this. */
  IMMUTABLE_RECORD: "IMMUTABLE_RECORD",
  /** More ops than STORE_MAX_OPS_PER_COMMIT. */
  TOO_MANY_OPS: "TOO_MANY_OPS",
} as const;
export type StoreFailureReason = (typeof StoreFailureReason)[keyof typeof StoreFailureReason];

export class StoreCommitError extends Error {
  constructor(
    readonly reason: StoreFailureReason,
    /** Index into the ops array of the first op that failed, or null for whole-commit failures. */
    readonly opIndex: number | null,
    message: string,
  ) {
    super(message);
    this.name = "StoreCommitError";
  }
}
