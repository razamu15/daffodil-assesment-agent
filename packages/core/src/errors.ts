/**
 * CoreError: a domain precondition that failed inside core (the thing isn't
 * there, or isn't in a state that allows this). Input *shape* is validated
 * before core is called (api routes, agent tool schemas); these are the facts
 * only core can see, because they need stored state.
 *
 * Callers map the code to their own vocabulary: api via CORE_ERROR_API_CODE
 * (packages/api), agent tools to ToolErrorCode (packages/agent).
 */
import type { Id } from "@helper-assistant/domain";

export const CoreErrorCode = {
  NOT_FOUND: "NOT_FOUND",
  /** The request is well-formed but the domain doesn't allow it (e.g. approving a flagged bill without accepting its flags). */
  NOT_ALLOWED: "NOT_ALLOWED",
  /** A version the caller saw is no longer current, or a concurrent write won. */
  CONFLICT: "CONFLICT",
  SESSION_BUSY: "SESSION_BUSY",
  ACTION_NOT_PENDING: "ACTION_NOT_PENDING",
  BILL_NOT_APPROVABLE: "BILL_NOT_APPROVABLE",
  BILL_NOT_PAYABLE: "BILL_NOT_PAYABLE",
  /** record_bill for a helper and period whose bill is already approved. Nothing is saved. */
  PERIOD_ALREADY_APPROVED: "PERIOD_ALREADY_APPROVED",
} as const;
export type CoreErrorCode = (typeof CoreErrorCode)[keyof typeof CoreErrorCode];

export class CoreError extends Error {
  constructor(
    readonly code: CoreErrorCode,
    message: string,
    /** For PERIOD_ALREADY_APPROVED: the approved bill. null otherwise. */
    readonly relatedId: Id | null = null,
  ) {
    super(message);
    this.name = "CoreError";
  }
}

export const notFound = (what: string, id: Id | number): CoreError => new CoreError(CoreErrorCode.NOT_FOUND, `${what} ${id} not found`);
