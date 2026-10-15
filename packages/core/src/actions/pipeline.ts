/**
 * The shared half of the PendingAction pipeline (Doc 3 §4.6): writing a PENDING
 * row with its conflicts detected, and moving an action to a terminal status
 * through PENDING_ACTION_TRANSITIONS. Type-specific proposal building is in
 * proposals.ts; what "apply" means per type is in apply.ts.
 *
 * Call sites: proposals.ts (proposeAction), resolve.ts (resolvedAction,
 * assertTransition), recordBill (marking approvals of a replaced bill STALE).
 */
import {
  PENDING_ACTION_TRANSITIONS,
  PendingActionStatus,
  ProposeOutcome,
  StoredEntity,
  WriteConditionKind,
} from "@helper-assistant/domain";
import type {
  ActionResolver,
  ActionRef,
  Id,
  Instant,
  PendingAction,
  PendingActionOf,
  PendingActionType,
  ProposeResult,
  WriteOp,
} from "@helper-assistant/domain";
import type { CoreDeps } from "../deps";
import { CoreError, CoreErrorCode } from "../errors";

/** Where a proposal came from, for the audit trail. The UI Approve button has no session or turn. */
export type ActionSource = { sessionId: Id | null; turnId: Id | null; docId: Id | null };

/** What a type-specific proposer decides; the pipeline adds identity, status and audit fields. */
export type ActionDraft = { [T in PendingActionType]: Pick<PendingActionOf<T>, "type" | "payload"> }[PendingActionType] &
  Pick<PendingAction, "targetKey" | "basedOn" | "summary" | "assumptions">;

/**
 * Writes the draft as a PENDING action. Other PENDING actions with the same
 * targetKey are returned as conflicts (NEEDS_DECISION): the model explains them
 * and asks; code never picks one.
 */
export async function proposeAction(
  { store, clock }: Pick<CoreDeps, "store" | "clock">,
  draft: ActionDraft,
  source: ActionSource,
  reminders: string[] = [],
): Promise<ProposeResult> {
  const [ref, conflicts] = await Promise.all([
    store.nextActionRef(),
    store.listActions({ status: PendingActionStatus.PENDING, targetKey: draft.targetKey }),
  ]);
  const action = {
    ...draft,
    ref,
    status: PendingActionStatus.PENDING,
    supersededByRef: null,
    createdAt: clock.now(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    sourceSessionId: source.sessionId,
    sourceTurnId: source.turnId,
    sourceDocId: source.docId,
    version: 1,
  } as PendingAction;
  await store.commit([{ record: { entity: StoredEntity.ACTION, value: action }, condition: { kind: WriteConditionKind.ABSENT } }]);
  return { outcome: conflicts.length === 0 ? ProposeOutcome.PROPOSED : ProposeOutcome.NEEDS_DECISION, action, conflicts, reminders };
}

/** Throws ACTION_NOT_PENDING unless the transition table allows `from → to`. */
export function assertTransition(action: PendingAction, to: PendingActionStatus): void {
  if (!PENDING_ACTION_TRANSITIONS[action.status].includes(to)) {
    throw new CoreError(CoreErrorCode.ACTION_NOT_PENDING, `Action #${action.ref} is ${action.status} and can't become ${to}.`);
  }
}

/** The action moved to a terminal status, with the version bumped for the conditional write. */
export function resolvedAction(
  action: PendingAction,
  change: { status: PendingActionStatus; by: ActionResolver; at: Instant; note: string | null; supersededByRef?: ActionRef },
): PendingAction {
  return {
    ...action,
    status: change.status,
    resolvedAt: change.at,
    resolvedBy: change.by,
    resolutionNote: change.note,
    supersededByRef: change.supersededByRef ?? action.supersededByRef,
    version: action.version + 1,
  };
}

/** The conditional write for an updated action: only if nobody else changed it since it was read. */
export function actionWrite(updated: PendingAction): WriteOp {
  return {
    record: { entity: StoredEntity.ACTION, value: updated },
    condition: { kind: WriteConditionKind.VERSION, expected: updated.version - 1 },
  };
}
