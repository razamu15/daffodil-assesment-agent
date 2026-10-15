/**
 * Resolving a PendingAction: confirm (USER_UI only), reject (USER_UI), withdraw
 * (AGENT). Every path goes through PENDING_ACTION_TRANSITIONS and a conditional
 * write on the action's version, so two tabs can't both resolve it.
 *
 * Confirm is THE commit (Doc 3 §4.6): applyAction plans the change, and the
 * action flips to CONFIRMED with the change written in one atomic commit. If the
 * basis moved, the action becomes STALE instead: a normal outcome, not an error.
 * Other PENDING actions on the same target are left alone: they were shown to
 * Jordan as conflicts, and confirming one later finds its basis moved (STALE,
 * Doc 4 §6.4 "two tabs"). No model is called anywhere on this path.
 *
 * Call sites: api POST /api/actions/:ref/confirm and /reject, approveBill (UI
 * Approve button), the agent's withdraw_pending_action tool.
 */
import { ActionResolver, PendingActionStatus, PendingActionType, StoreCommitError } from "@helper-assistant/domain";
import type { ActionRef, PendingAction, ToolInput } from "@helper-assistant/domain";
import type { CoreDeps } from "../deps";
import { CoreError, CoreErrorCode, notFound } from "../errors";
import { applyAction, ApplyOutcome } from "./apply";
import { actionWrite, assertTransition, resolvedAction } from "./pipeline";

/** An optimistic-concurrency version (domain VersionSchema). */
type Version = number;

async function loadForUser({ store }: Pick<CoreDeps, "store">, ref: ActionRef, actionVersion: Version, to: PendingActionStatus): Promise<PendingAction> {
  const action = await store.getAction(ref);
  if (action === null) throw notFound("Action", ref);
  assertTransition(action, to);
  if (action.version !== actionVersion) {
    throw new CoreError(CoreErrorCode.CONFLICT, `Action #${ref} changed (version ${action.version}, you saw ${actionVersion}). Reload it.`);
  }
  return action;
}

export type ConfirmInput = {
  ref: ActionRef;
  /** The version the user was looking at. */
  actionVersion: Version;
  /** HELPER_MESSAGE only: Jordan's edited text. null keeps the drafted body. */
  messageBody: string | null;
};

/** Returns the resolved action: CONFIRMED, or STALE when its basis changed. */
export async function confirmAction(deps: CoreDeps, { ref, actionVersion, messageBody }: ConfirmInput): Promise<PendingAction> {
  const action = await loadForUser(deps, ref, actionVersion, PendingActionStatus.CONFIRMED);
  if (messageBody !== null && action.type !== PendingActionType.HELPER_MESSAGE) {
    throw new CoreError(CoreErrorCode.NOT_ALLOWED, `An edited message body only applies to a HELPER_MESSAGE action; #${ref} is ${action.type}.`);
  }
  const at = deps.clock.now();
  const plan = await applyAction(deps, action, { at, messageBody });
  if (plan.outcome === ApplyOutcome.STALE) return markStale(deps, action, plan.reason);

  const confirmed = resolvedAction(action, { status: PendingActionStatus.CONFIRMED, by: ActionResolver.USER_UI, at, note: null });
  try {
    await deps.store.commit([actionWrite(confirmed), ...plan.ops]);
  } catch (error) {
    if (!(error instanceof StoreCommitError)) throw error;
    if (error.opIndex === 0) throw new CoreError(CoreErrorCode.CONFLICT, `Action #${ref} changed while confirming. Reload it.`);
    // The thing being changed moved between the basis check and the write: that's what STALE means.
    return markStale(deps, action, "It changed while this was being confirmed. Review it again.");
  }
  return confirmed;
}

async function markStale({ store, clock }: Pick<CoreDeps, "store" | "clock">, action: PendingAction, reason: string): Promise<PendingAction> {
  const staleAction = resolvedAction(action, { status: PendingActionStatus.STALE, by: ActionResolver.SYSTEM, at: clock.now(), note: reason });
  await commitResolution(store, staleAction);
  return staleAction;
}

export async function rejectAction(deps: Pick<CoreDeps, "store" | "clock">, { ref, actionVersion }: { ref: ActionRef; actionVersion: Version }): Promise<PendingAction> {
  const action = await loadForUser(deps, ref, actionVersion, PendingActionStatus.REJECTED);
  const rejected = resolvedAction(action, { status: PendingActionStatus.REJECTED, by: ActionResolver.USER_UI, at: deps.clock.now(), note: null });
  await commitResolution(deps.store, rejected);
  return rejected;
}

/** withdraw_pending_action: the agent may only reduce what could happen. */
export async function withdrawAction({ store, clock }: Pick<CoreDeps, "store" | "clock">, { ref, reason }: ToolInput<"withdraw_pending_action">): Promise<PendingAction> {
  const action = await store.getAction(ref);
  if (action === null) throw notFound("Action", ref);
  assertTransition(action, PendingActionStatus.WITHDRAWN);
  const withdrawn = resolvedAction(action, { status: PendingActionStatus.WITHDRAWN, by: ActionResolver.AGENT, at: clock.now(), note: reason });
  await commitResolution(store, withdrawn);
  return withdrawn;
}

/** A lost race on the action row itself means someone else resolved it first. */
async function commitResolution(store: CoreDeps["store"], updated: PendingAction): Promise<void> {
  try {
    await store.commit([actionWrite(updated)]);
  } catch (error) {
    if (error instanceof StoreCommitError) throw new CoreError(CoreErrorCode.CONFLICT, `Action #${updated.ref} changed meanwhile. Reload it.`);
    throw error;
  }
}
