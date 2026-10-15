/**
 * What every tool handler gets: the injected deps, where the call comes from
 * (for the PendingAction audit trail), and the per-turn state the handlers fill
 * in (proposed refs, extraction model calls) for the Turn trace.
 *
 * Call sites: runTurn builds one per turn; every tool handler reads it.
 */
import type { ActionRef, Id, ModelCallTrace, ToolCallTrace, ToolInput, ToolName } from "@helper-assistant/domain";
import type { AgentDeps } from "../deps";

/**
 * Jordan's message this turn, citable as a CHAT_STATEMENT source ("Lupe goes to
 * $150 on the 15th"). It is saved as a SourceDocument only when a tool first
 * references its docId, so ordinary chat doesn't pile up documents.
 */
export type ChatStatement = { docId: Id; text: string };

/** The Turn trace as it accumulates. Kept even when the turn fails, so a failure is explainable. */
export type TurnTrace = {
  toolCalls: ToolCallTrace[];
  /** Agent-loop calls and the extraction calls made from inside tools, in call order. */
  modelCalls: ModelCallTrace[];
  /** Refs of actions this turn proposed. Filled by the propose_* handlers (withdrawals are not proposals). */
  proposedActionRefs: ActionRef[];
};

export type ToolContext = {
  deps: AgentDeps;
  sessionId: Id;
  turnId: Id;
  /** null when the message had no text (attachments only). */
  statement: ChatStatement | null;
  trace: TurnTrace;
};

export const emptyTrace = (): TurnTrace => ({ toolCalls: [], modelCalls: [], proposedActionRefs: [] });

/** A tool's implementation. Input is already validated; failures throw ToolFailure or CoreError. */
export type ToolHandler<N extends ToolName> = (input: ToolInput<N>, ctx: ToolContext) => Promise<unknown>;

export type ToolHandlers = { [N in ToolName]: ToolHandler<N> };

/** The audit source core's proposers want. */
export const actionSource = (ctx: ToolContext, docId: Id | null) => ({ sessionId: ctx.sessionId, turnId: ctx.turnId, docId });
