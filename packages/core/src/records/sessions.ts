/**
 * Chat sessions and turns. A session runs at most one turn at a time: starting a
 * turn takes the lock (Session.activeTurnId) with a conditional write; the turn
 * runner releases it when the turn finishes (Track B).
 *
 * Call sites: api POST /api/chat (startTurn, then TurnRunner.start; failTurnDispatch
 * if dispatch throws).
 */
import { StoreCommitError, StoredEntity, TurnStatus, WriteConditionKind } from "@helper-assistant/domain";
import type { Id, RouteBody, Session, Turn, WriteOp } from "@helper-assistant/domain";
import type { CoreDeps } from "../deps";
import { CoreError, CoreErrorCode, notFound } from "../errors";

const SESSION_TITLE_MAX_CHARS = 60;
/** Title for a chat whose first message has no text (attachments only). */
const UNTITLED_SESSION = "New chat";

function sessionTitle(text: string): string {
  const oneLine = text.trim().replace(/\s+/g, " ");
  if (oneLine === "") return UNTITLED_SESSION;
  return oneLine.length <= SESSION_TITLE_MAX_CHARS ? oneLine : `${oneLine.slice(0, SESSION_TITLE_MAX_CHARS - 1)}…`;
}

/** Creates the session if needed, takes its lock and writes a QUEUED turn, atomically. */
export async function startTurn(deps: CoreDeps, { sessionId, text, attachmentDocIds }: RouteBody<"chat">): Promise<{ session: Session; turn: Turn }> {
  const { store, clock, newId } = deps;
  for (const docId of attachmentDocIds) {
    if ((await store.getDocument(docId)) === null) throw notFound("Document", docId);
  }
  const now = clock.now();
  const turnId = newId();
  const busy = (id: Id) => new CoreError(CoreErrorCode.SESSION_BUSY, `Session ${id} already has a turn running. Wait for it to finish.`);

  let session: Session;
  let sessionOp: WriteOp;
  if (sessionId === null) {
    session = { sessionId: newId(), title: sessionTitle(text), createdAt: now, lastActiveAt: now, activeTurnId: turnId, version: 1 };
    sessionOp = { record: { entity: StoredEntity.SESSION, value: session }, condition: { kind: WriteConditionKind.ABSENT } };
  } else {
    const current = await store.getSession(sessionId);
    if (current === null) throw notFound("Session", sessionId);
    if (current.activeTurnId !== null) throw busy(sessionId);
    session = { ...current, activeTurnId: turnId, lastActiveAt: now, version: current.version + 1 };
    sessionOp = { record: { entity: StoredEntity.SESSION, value: session }, condition: { kind: WriteConditionKind.VERSION, expected: current.version } };
  }

  const turn: Turn = {
    turnId,
    sessionId: session.sessionId,
    status: TurnStatus.QUEUED,
    input: { text, attachmentDocIds },
    replyText: null,
    proposedActionRefs: [],
    toolCalls: [],
    modelCalls: [],
    error: null,
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    version: 1,
  };
  try {
    await store.commit([sessionOp, { record: { entity: StoredEntity.TURN, value: turn }, condition: { kind: WriteConditionKind.ABSENT } }]);
  } catch (error) {
    if (error instanceof StoreCommitError) throw busy(session.sessionId);
    throw error;
  }
  return { session, turn };
}

/** The runner couldn't be dispatched: mark the turn FAILED and release the session lock. */
export async function failTurnDispatch({ store, clock }: Pick<CoreDeps, "store" | "clock">, turnId: Id, reason: string): Promise<void> {
  const turn = await store.getTurn(turnId);
  if (turn === null) throw notFound("Turn", turnId);
  const session = await store.getSession(turn.sessionId);
  if (session === null) throw notFound("Session", turn.sessionId);
  const now = clock.now();
  const ops: WriteOp[] = [
    {
      record: { entity: StoredEntity.TURN, value: { ...turn, status: TurnStatus.FAILED, error: reason, finishedAt: now, version: turn.version + 1 } },
      condition: { kind: WriteConditionKind.VERSION, expected: turn.version },
    },
  ];
  if (session.activeTurnId === turnId) {
    ops.push({
      record: { entity: StoredEntity.SESSION, value: { ...session, activeTurnId: null, version: session.version + 1 } },
      condition: { kind: WriteConditionKind.VERSION, expected: session.version },
    });
  }
  await store.commit(ops);
}
