/**
 * runTurn: one agent run for a QUEUED Turn (Doc 3 §4.1, Doc 2 §3 "Chat turn").
 *
 *   1. Mark the turn RUNNING.
 *   2. Load chat history and long-term hints from memory.
 *   3. Run the model ⇄ tools loop until the model answers in text.
 *   4. Write this turn's user and assistant messages to memory.
 *   5. Save the Turn trace and release the session lock, in one commit.
 *
 * Any failure after step 1 ends the turn FAILED with its error and whatever
 * trace was gathered; the lock is released either way. The api took the lock
 * and created the turn (core startTurn) before dispatching it here.
 *
 * Call sites: LocalTurnRunner, the CLI and scenario runner, agent tests; later
 * the Agent Lambda handler (I3).
 */
import { ChatRole, StoredEntity, TurnStatus, WriteConditionKind } from "@helper-assistant/domain";
import type { AttachmentRef, ChatMessage, Id, Turn, WriteOp } from "@helper-assistant/domain";
import type { AgentDeps } from "../deps";
import { systemPrompt } from "../prompt/systemPrompt";
import { HINTS_TOP_K, HISTORY_MAX_MESSAGES } from "../settings";
import { emptyTrace } from "../tools/context";
import type { ToolContext, TurnTrace } from "../tools/context";
import { runConverseLoop } from "./converseLoop";
import { toModelMessages, userMessageText } from "./history";

export async function runTurn({ turnId, sessionId }: { turnId: Id; sessionId: Id }, deps: AgentDeps): Promise<Turn> {
  const { store, clock } = deps;
  const queued = await store.getTurn(turnId);
  if (queued === null || queued.sessionId !== sessionId) throw new Error(`Turn ${turnId} not found in session ${sessionId}`);
  if (queued.status !== TurnStatus.QUEUED) throw new Error(`Turn ${turnId} is ${queued.status}; only a QUEUED turn can run`);

  const running: Turn = { ...queued, status: TurnStatus.RUNNING, startedAt: clock.now(), version: queued.version + 1 };
  await store.commit([turnWrite(running)]);

  const trace = emptyTrace();
  let replyText: string | null = null;
  let error: string | null = null;
  let userText: string | null = null;
  try {
    const attachments = await attachmentsOf(deps, running);
    userText = userMessageText(running.input.text, attachments);
    const statement = running.input.text.trim() === "" ? null : { docId: deps.newId(), text: running.input.text };
    const [history, hints] = await Promise.all([
      deps.memory.listChatMessages(sessionId, { maxMessages: HISTORY_MAX_MESSAGES }),
      statement === null ? Promise.resolve([]) : deps.memory.retrieveHints(statement.text, { topK: HINTS_TOP_K }),
    ]);
    const userMessage: ChatMessage = { role: ChatRole.USER, text: userText, at: running.createdAt };
    const ctx: ToolContext = { deps, sessionId, turnId, statement, trace };
    const system = systemPrompt({ today: clock.today(), statementDocId: statement?.docId ?? null, attachments }, hints);

    replyText = await runConverseLoop(ctx, system, toModelMessages([...history, userMessage]));
    await deps.memory.appendChatMessages(sessionId, [userMessage, { role: ChatRole.ASSISTANT, text: replyText, at: clock.now() }]);
  } catch (failure) {
    error = messageOf(failure);
    if (replyText === null && userText !== null) error = await keepUserMessage(deps, sessionId, { role: ChatRole.USER, text: userText, at: running.createdAt }, error);
  }
  return finish(deps, running, { replyText, error, trace });
}

/** Attachments by id, kind and file name. A missing document is a broken turn input, so it fails the turn. */
async function attachmentsOf({ store }: AgentDeps, turn: Turn): Promise<AttachmentRef[]> {
  return Promise.all(
    turn.input.attachmentDocIds.map(async (docId) => {
      const document = await store.getDocument(docId);
      if (document === null) throw new Error(`Attached document ${docId} not found`);
      return { docId, kind: document.kind, fileName: document.fileName };
    }),
  );
}

/** A failed turn still leaves Jordan's message in the chat. If even that fails, both errors are reported. */
async function keepUserMessage(deps: AgentDeps, sessionId: Id, message: ChatMessage, error: string): Promise<string> {
  try {
    await deps.memory.appendChatMessages(sessionId, [message]);
    return error;
  } catch (memoryFailure) {
    return `${error} (and the message couldn't be saved to chat history: ${messageOf(memoryFailure)})`;
  }
}

async function finish(deps: AgentDeps, running: Turn, outcome: { replyText: string | null; error: string | null; trace: TurnTrace }): Promise<Turn> {
  const finished: Turn = {
    ...running,
    status: outcome.error === null ? TurnStatus.COMPLETED : TurnStatus.FAILED,
    replyText: outcome.replyText,
    error: outcome.error,
    toolCalls: outcome.trace.toolCalls,
    modelCalls: outcome.trace.modelCalls,
    proposedActionRefs: outcome.trace.proposedActionRefs,
    finishedAt: deps.clock.now(),
    version: running.version + 1,
  };
  const ops: WriteOp[] = [turnWrite(finished)];
  const session = await deps.store.getSession(running.sessionId);
  if (session !== null && session.activeTurnId === running.turnId) {
    ops.push({
      record: { entity: StoredEntity.SESSION, value: { ...session, activeTurnId: null, version: session.version + 1 } },
      condition: { kind: WriteConditionKind.VERSION, expected: session.version },
    });
  }
  await deps.store.commit(ops);
  return finished;
}

const turnWrite = (turn: Turn): WriteOp => ({
  record: { entity: StoredEntity.TURN, value: turn },
  condition: { kind: WriteConditionKind.VERSION, expected: turn.version - 1 },
});

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
