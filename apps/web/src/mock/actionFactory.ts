/**
 * Builders for the records the real core would write: PendingActions, their
 * resolution, the sealed Approval, a confirmed message.
 *
 * Call sites: scenario data (explicit seeded records), the chat script (proposed
 * cards), apply.ts and the commit handlers.
 */
import { ActionBasisKind, ActionResolver, ApiErrorCode, BillStatus, PendingActionStatus, PendingActionType, targetKeys } from "@helper-assistant/domain";
import type {
  AcceptedException,
  ActionResolver as ActionResolverT,
  Bill,
  BillingPeriod,
  Helper,
  Id,
  MessageReason,
  PendingAction,
  PendingActionOf,
  PendingActionStatus as PendingActionStatusT,
  PendingActionType as PendingActionTypeT,
} from "@helper-assistant/domain";
import { formatCents, formatPeriod } from "../ui/format";
import { MockApiError } from "./errors";
import type { MockWorld } from "./world";

export type ActionSource = { sessionId: Id | null; turnId: Id | null; docId: Id | null };
export const NO_SOURCE: ActionSource = { sessionId: null, turnId: null, docId: null };

type ActionFields = Pick<PendingAction, "targetKey" | "basedOn" | "summary" | "assumptions">;

/** A new PENDING action with the next ref, added to the world. */
export function addAction<T extends PendingActionTypeT>(
  world: MockWorld,
  type: T,
  payload: PendingActionOf<T>["payload"],
  fields: ActionFields,
  source: ActionSource,
): PendingActionOf<T> {
  const action = {
    ...fields,
    ref: world.nextActionRef(),
    type,
    payload,
    status: PendingActionStatus.PENDING,
    supersededByRef: null,
    createdAt: world.now(),
    resolvedAt: null,
    resolvedBy: null,
    resolutionNote: null,
    sourceSessionId: source.sessionId,
    sourceTurnId: source.turnId,
    sourceDocId: source.docId,
    version: 1,
  } as PendingActionOf<T>;
  world.actions.push(action);
  return action;
}

export function resolved<A extends PendingAction>(world: MockWorld, action: A, status: PendingActionStatusT, by: ActionResolverT, note: string | null): A {
  return { ...action, status, resolvedAt: world.now(), resolvedBy: by, resolutionNote: note, version: action.version + 1 };
}

/** A HELPER_MESSAGE draft card ("ask the helper"). Nothing can go stale on a draft. */
export function addMessageAction(
  world: MockWorld,
  helper: Helper,
  reason: MessageReason,
  body: string,
  subject: { bill: Bill | null; period: BillingPeriod | null },
  source: ActionSource,
): PendingActionOf<typeof PendingActionType.HELPER_MESSAGE> {
  const subjectKey = subject.bill?.billId ?? subject.period?.start ?? "NONE";
  const about = subject.period === null ? "" : ` about ${formatPeriod(subject.period)}`;
  return addAction(
    world,
    PendingActionType.HELPER_MESSAGE,
    { helperId: helper.helperId, reason, body, relatedBillId: subject.bill?.billId ?? null, relatedPeriod: subject.period, channelHint: helper.contact.channel },
    { targetKey: targetKeys.message(helper.helperId, reason, subjectKey), basedOn: { kind: ActionBasisKind.NONE }, summary: `Message to ${helper.name}${about}`, assumptions: [] },
    source,
  );
}

/**
 * Seal a bill: RECEIVED → APPROVED with the Approval written in the same step.
 * Approves the sum of the lines, never the stated total (Product P15).
 */
export function sealApproval(world: MockWorld, bill: Bill, acceptedExceptions: AcceptedException[], viaActionRef: number): Bill {
  const check = bill.latestCheck;
  if (bill.status !== BillStatus.RECEIVED || check === null) {
    throw new MockApiError(ApiErrorCode.BILL_NOT_APPROVABLE, `Bill ${bill.billId} is ${bill.status} and can't be approved.`);
  }
  const approvedBill: Bill = {
    ...bill,
    status: BillStatus.APPROVED,
    approval: {
      approvedAt: world.now(),
      approvedBy: ActionResolver.USER_UI,
      viaActionRef,
      billedCents: check.statedTotalCents ?? check.sumOfLinesCents,
      amountApprovedCents: check.sumOfLinesCents,
      acceptedExceptions,
      checkSnapshot: check,
      termVersions: check.termVersions,
    },
    version: bill.version + 1,
  };
  world.replace(world.bills, (b) => b.billId === bill.billId, approvedBill);
  return approvedBill;
}

/** A BILL_APPROVAL action for a bill, as the Approve button proposes it. */
export function addApprovalAction(world: MockWorld, bill: Bill, helper: Helper, acceptedExceptions: AcceptedException[], source: ActionSource) {
  const check = bill.latestCheck;
  if (check === null) throw new MockApiError(ApiErrorCode.BILL_NOT_APPROVABLE, `Bill ${bill.billId} hasn't been checked.`);
  return addAction(
    world,
    PendingActionType.BILL_APPROVAL,
    { billId: bill.billId, acceptedExceptions, amountApprovedCents: check.sumOfLinesCents, checkSnapshot: check },
    {
      targetKey: targetKeys.bill(bill.billId),
      basedOn: { kind: ActionBasisKind.BILL_VERSION, billId: bill.billId, version: bill.version },
      summary: `Approve ${helper.name}'s ${formatPeriod(bill.period)} bill: ${formatCents(check.sumOfLinesCents)}`,
      assumptions: [],
    },
    source,
  );
}
