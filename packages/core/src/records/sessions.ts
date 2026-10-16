/**
 * Chat sessions and turns. A session runs at most one turn at a time: starting a
 * turn takes the lock (Session.activeTurnId) with a conditional write; the turn
 * runner releases it when the turn finishes (Track B). A lock whose turn never
 * finished (the Agent Lambda timed out or crashed) expires after
 * TURN_LOCK_EXPIRY_MS: the next message marks that turn FAILED and takes over.
 *
 * Call sites: api POST /api/chat (startTurn, then TurnRunner.start; failTurnDispatch
 * if dispatch throws).
 */
import { StoreCommitError, StoredEntity, TURN_LOCK_EXPIRY_MS, TurnStatus, WriteConditionKind } from "@helper-assistant/domain";
import type { AttachmentRef, Id, RouteBody, Session, SourceDocument, Turn, WriteOp } from "@helper-assistant/domain";
import type { CoreDeps } from "../deps";
import { CoreError, CoreErrorCode, notFound } from "../errors";

const SESSION_TITLE_MAX_CHARS = 60;
const EXPIRED_TURN_ERROR = "The assistant stopped before finishing this turn (it timed out or crashed).";
/** Title for a chat whose first message has no text and no named files. */
const UNTITLED_SESSION = "New chat";

/** The first message's text; for files only, what was added ("02-priya-rates.png and 7 more"). */
function sessionTitle(text: string, documents: readonly SourceDocument[]): string {
  const oneLine = text.trim().replace(/\s+/g, " ");
  const named = documents.flatMap((d) => (d.fileName === null ? [] : [d.fileName]));
  const title = oneLine !== "" ? oneLine : named.length === 0 ? UNTITLED_SESSION : `${named[0]}${named.length > 1 ? ` and ${named.length - 1} more` : ""}`;
  return title.length <= SESSION_TITLE_MAX_CHARS ? title : `${title.slice(0, SESSION_TITLE_MAX_CHARS - 1)}…`;
}

/** Creates the session if needed, takes its lock and writes a QUEUED turn, atomically. */
export async function startTurn(deps: CoreDeps, { sessionId, text, attachmentDocIds }: RouteBody<"chat">): Promise<{ session: Session; turn: Turn }> {
  const { store, clock, newId } = deps;
  const documents: SourceDocument[] = [];
  for (const docId of attachmentDocIds) {
    const document = await store.getDocument(docId);
    if (document === null) throw notFound("Document", docId);
    documents.push(document);
  }
  const now = clock.now();
  const turnId = newId();
  const busy = (id: Id) => new CoreError(CoreErrorCode.SESSION_BUSY, `Session ${id} already has a turn running. Wait for it to finish.`);

  let session: Session;
  let sessionOp: WriteOp;
  const expiredTurnOps: WriteOp[] = [];
  if (sessionId === null) {
    session = { sessionId: newId(), title: sessionTitle(text, documents), createdAt: now, lastActiveAt: now, activeTurnId: turnId, version: 1 };
    sessionOp = { record: { entity: StoredEntity.SESSION, value: session }, condition: { kind: WriteConditionKind.ABSENT } };
  } else {
    const current = await store.getSession(sessionId);
    if (current === null) throw notFound("Session", sessionId);
    if (current.activeTurnId !== null) {
      const expired = await expiredLockHolder(deps, current.activeTurnId, now);
      if (expired === null) throw busy(sessionId);
      if (expired.status !== TurnStatus.COMPLETED && expired.status !== TurnStatus.FAILED) {
        const failed: Turn = { ...expired, status: TurnStatus.FAILED, error: EXPIRED_TURN_ERROR, finishedAt: now, version: expired.version + 1 };
        expiredTurnOps.push({ record: { entity: StoredEntity.TURN, value: failed }, condition: { kind: WriteConditionKind.VERSION, expected: expired.version } });
      }
    }
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
    await store.commit([sessionOp, ...expiredTurnOps, { record: { entity: StoredEntity.TURN, value: turn }, condition: { kind: WriteConditionKind.ABSENT } }]);
  } catch (error) {
    if (error instanceof StoreCommitError) throw busy(session.sessionId);
    throw error;
  }
  return { session, turn };
}

/**
 * The turn holding a session's lock, if the lock may be taken over: the turn is
 * missing or finished (the lock should already be free), or it started longer
 * than TURN_LOCK_EXPIRY_MS ago. null = the lock is live.
 */
async function expiredLockHolder({ store }: Pick<CoreDeps, "store">, turnId: Id, now: string): Promise<Turn | null> {
  const holder = await store.getTurn(turnId);
  if (holder === null) throw notFound("Turn", turnId);
  if (holder.status === TurnStatus.COMPLETED || holder.status === TurnStatus.FAILED) return holder;
  const heldSince = Date.parse(holder.startedAt ?? holder.createdAt);
  return Date.parse(now) - heldSince > TURN_LOCK_EXPIRY_MS ? holder : null;
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

/**
 * A turn's attachments by id, kind and file name: what userMessageText names.
 * A missing document is a broken turn input, so it throws.
 *
 * Call sites: agent runTurn (the message it stores), api GET /api/turns/:id (the
 * message shown while the turn runs).
 */
export async function turnAttachments({ store }: Pick<CoreDeps, "store">, turn: Turn): Promise<AttachmentRef[]> {
  return Promise.all(
    turn.input.attachmentDocIds.map(async (docId) => {
      const document = await store.getDocument(docId);
      if (document === null) throw new Error(`Attached document ${docId} not found`);
      return { docId, kind: document.kind, fileName: document.fileName };
    }),
  );
}
