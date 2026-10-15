/**
 * Tool failures and their mapping onto the ToolResult error vocabulary
 * (domain ToolErrorCode). Core's errors are domain preconditions only stored
 * state can answer; each maps to the code that tells the model what to do next.
 *
 * Call sites: the tool registry (wrapping every handler), tool handlers
 * (throwing ToolFailure for agent-boundary checks).
 */
import { CoreError, CoreErrorCode } from "@helper-assistant/core";
import { ToolErrorCode } from "@helper-assistant/domain";
import type { CoreErrorCode as CoreErrorCodeT } from "@helper-assistant/core";
import type { ToolErrorCode as ToolErrorCodeT } from "@helper-assistant/domain";

/** A failure decided at the agent's tool boundary (not by core). */
export class ToolFailure extends Error {
  constructor(
    readonly code: ToolErrorCodeT,
    message: string,
  ) {
    super(message);
    this.name = "ToolFailure";
  }
}

/**
 * CONFLICT means something moved underneath (two tabs); the model should re-read
 * and say so, which is a NOT_ALLOWED-style "not now". SESSION_BUSY can't arise
 * from a tool, so it is INTERNAL if it ever does.
 */
export const TOOL_ERROR_BY_CORE_ERROR: Record<CoreErrorCodeT, ToolErrorCodeT> = {
  [CoreErrorCode.NOT_FOUND]: ToolErrorCode.NOT_FOUND,
  [CoreErrorCode.NOT_ALLOWED]: ToolErrorCode.NOT_ALLOWED,
  [CoreErrorCode.CONFLICT]: ToolErrorCode.NOT_ALLOWED,
  [CoreErrorCode.SESSION_BUSY]: ToolErrorCode.INTERNAL,
  [CoreErrorCode.ACTION_NOT_PENDING]: ToolErrorCode.NOT_ALLOWED,
  [CoreErrorCode.BILL_NOT_APPROVABLE]: ToolErrorCode.NOT_ALLOWED,
  [CoreErrorCode.BILL_NOT_PAYABLE]: ToolErrorCode.NOT_ALLOWED,
  [CoreErrorCode.PERIOD_ALREADY_APPROVED]: ToolErrorCode.PERIOD_ALREADY_APPROVED,
};

export function toToolError(error: unknown): { code: ToolErrorCodeT; message: string } {
  if (error instanceof ToolFailure) return { code: error.code, message: error.message };
  if (error instanceof CoreError) return { code: TOOL_ERROR_BY_CORE_ERROR[error.code], message: error.message };
  return { code: ToolErrorCode.INTERNAL, message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}` };
}

export const notFound = (what: string, id: string | number) => new ToolFailure(ToolErrorCode.NOT_FOUND, `${what} ${id} not found`);
