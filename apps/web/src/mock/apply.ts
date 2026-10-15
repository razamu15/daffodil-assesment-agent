/**
 * The mock's version of confirm → applyAction (Doc 3 §4.6): re-read the basis,
 * go STALE if it moved, otherwise apply the change. Simplified from core's (no
 * conditional writes) but with the same outcomes, so the UI's STALE and conflict
 * states can be exercised.
 *
 * Call sites: handlers/commits.ts (confirm route and the Approve button).
 */
import {
  ActionBasisKind,
  ActionResolver,
  AgreementChangeKind,
  BillStatus,
  DeliveryMode,
  HelperStatus,
  MessageStatus,
  PendingActionStatus,
  PendingActionType,
} from "@helper-assistant/domain";
import type { AgreementTerm, Id, PendingAction, PendingActionOf, PendingActionType as PendingActionTypeT, ServiceKey, TermContent } from "@helper-assistant/domain";
import { resolved, sealApproval } from "./actionFactory";
import { withCheck } from "./checks";
import type { MockWorld } from "./world";

function slotOccupant(world: MockWorld, helperId: Id, serviceKey: ServiceKey): AgreementTerm | null {
  const slot = world.terms
    .filter((t) => t.helperId === helperId && t.serviceKey === serviceKey)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.localeCompare(b.createdAt));
  return slot.at(-1) ?? null;
}

/** Why the action's basis no longer holds, in plain words; null when it still does. */
function staleReason(world: MockWorld, action: PendingAction): string | null {
  const basis = action.basedOn;
  if (basis.kind === ActionBasisKind.TERM_SLOT) {
    const occupant = slotOccupant(world, basis.helperId, basis.serviceKey);
    const moved = (occupant?.termId ?? null) !== basis.currentTermId || (occupant?.version ?? null) !== basis.currentTermVersion;
    return moved ? "This agreement changed after the proposal was made, so it was not applied. Review the current terms and ask again if it's still needed." : null;
  }
  if (basis.kind === ActionBasisKind.BILL_VERSION) {
    const bill = world.bill(basis.billId);
    return bill.version !== basis.version || bill.status !== BillStatus.RECEIVED ? "The bill changed after this was proposed. Look at it again." : null;
  }
  if (basis.kind === ActionBasisKind.HELPER_VERSION) {
    return world.helper(basis.helperId).version !== basis.version ? "The helper's details changed after this was proposed. Look again." : null;
  }
  return null;
}

const dayBefore = (date: string): string => new Date(Date.parse(`${date}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

function addTerm(world: MockWorld, content: TermContent, supersedesTermId: Id | null, ref: number): void {
  world.terms.push({ ...content, termId: world.newId("term"), supersedesTermId, createdByActionRef: ref, createdAt: world.now(), version: 1 });
}

function closeTerm(world: MockWorld, termId: Id, effectiveTo: string): void {
  const term = world.terms.find((t) => t.termId === termId);
  if (term) world.replace(world.terms, (t) => t.termId === termId, { ...term, effectiveTo, version: term.version + 1 });
}

type Applier<T extends PendingActionTypeT> = (world: MockWorld, action: PendingActionOf<T>, messageBody: string | null) => void;

const APPLY_BY_TYPE: { [T in PendingActionTypeT]: Applier<T> } = {
  [PendingActionType.AGREEMENT_CHANGE]: (world, action) => {
    const change = action.payload;
    const helperId = change.change === AgreementChangeKind.END_TERM ? world.terms.find((t) => t.termId === change.termId)?.helperId : change.term.helperId;
    if (change.change === AgreementChangeKind.ADD_TERM) addTerm(world, change.term, null, action.ref);
    if (change.change === AgreementChangeKind.REPLACE_TERM) {
      closeTerm(world, change.supersedesTermId, dayBefore(change.term.effectiveFrom));
      addTerm(world, change.term, change.supersedesTermId, action.ref);
    }
    if (change.change === AgreementChangeKind.END_TERM) closeTerm(world, change.termId, change.effectiveTo);
    // Open bills are re-checked against the new terms, as core does.
    world.bills = world.bills.map((b) => (b.status === BillStatus.RECEIVED && b.helperId === helperId ? withCheck(world, { ...b, version: b.version + 1 }) : b));
  },
  [PendingActionType.BILL_APPROVAL]: (world, action) => {
    sealApproval(world, world.bill(action.payload.billId), action.payload.acceptedExceptions, action.ref);
  },
  [PendingActionType.HELPER_MESSAGE]: (world, action, messageBody) => {
    const p = action.payload;
    world.messages.push({
      messageId: world.newId("message"),
      helperId: p.helperId,
      reason: p.reason,
      relatedBillId: p.relatedBillId,
      relatedPeriod: p.relatedPeriod,
      body: messageBody ?? p.body,
      deliveryMode: DeliveryMode.MANUAL_HANDOFF,
      status: MessageStatus.READY,
      channelHint: p.channelHint,
      createdByActionRef: action.ref,
      createdAt: world.now(),
      handedOffAt: null,
      version: 1,
    });
  },
  [PendingActionType.HELPER_ENGAGEMENT_END]: (world, action) => {
    const helper = world.helper(action.payload.helperId);
    world.replace(world.helpers, (h) => h.helperId === helper.helperId, { ...helper, status: HelperStatus.ENDED, endedOn: action.payload.endedOn, version: helper.version + 1 });
  },
};

/** Returns the resolved action (CONFIRMED or STALE), already written to the world. */
export function confirmInWorld(world: MockWorld, action: PendingAction, messageBody: string | null): PendingAction {
  const reason = staleReason(world, action);
  const next =
    reason === null
      ? resolved(world, action, PendingActionStatus.CONFIRMED, ActionResolver.USER_UI, null)
      : resolved(world, action, PendingActionStatus.STALE, ActionResolver.SYSTEM, reason);
  if (reason === null) (APPLY_BY_TYPE[action.type] as Applier<PendingActionTypeT>)(world, action as never, messageBody);
  world.replace(world.actions, (a) => a.ref === action.ref, next);
  return next;
}
