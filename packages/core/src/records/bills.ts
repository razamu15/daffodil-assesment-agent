/**
 * Bill records: recording what a helper claimed (checked before it's saved),
 * the UI Approve button, and Jordan's "Mark as paid".
 *
 * Supersede rule (Doc 3 §4.3, Product P10): a new bill for the same helper and
 * the same period replaces the earlier RECEIVED one, which is kept as SUPERSEDED.
 * If that period's bill is already APPROVED, nothing is saved
 * (PERIOD_ALREADY_APPROVED). A bill that only *overlaps* an approved period is
 * saved, and its check carries the PERIOD_ALREADY_APPROVED finding. Pending
 * approvals of a replaced bill become SUPERSEDED (no supersededByRef: a bill, not
 * an action, replaced them).
 *
 * Call sites: the agent's record_bill tool (recordBill); api POST
 * /api/bills/:id/approve (approveBill) and /payment (recordPayment).
 */
import {
  ActionResolver,
  BillStatus,
  PendingActionStatus,
  PendingActionType,
  StoreCommitError,
  StoredEntity,
  WriteConditionKind,
} from "@helper-assistant/domain";
import type {
  AcceptedException,
  Bill,
  BillCheck,
  Helper,
  Id,
  LineItem,
  PaymentRecord,
  PendingAction,
  RouteBody,
  ToolInput,
  WriteOp,
} from "@helper-assistant/domain";
import { checkStoredBill } from "../checker/checkStoredBill";
import { helperServices } from "../helperServices";
import type { CoreDeps } from "../deps";
import { CoreError, CoreErrorCode, notFound } from "../errors";
import { actionWrite, resolvedAction } from "../actions/pipeline";
import { proposeBillApproval } from "../actions/proposals";
import { confirmAction } from "../actions/resolve";

export type RecordBillResult = {
  bill: Bill;
  check: BillCheck;
  /** The earlier unapproved bill for the same helper and period that this one replaced, if any. */
  supersededBillId: Id | null;
};

/** record_bill: saves a RECEIVED bill with its check already on it. */
/**
 * A line's serviceKey must name one of the helper's services, agreed or proposed
 * and waiting for Jordan (helperServices), or be null: "none of them". An invented
 * key ("after-school" for Priya's hourly babysitting) would make the checker report
 * "no agreement" for work that is agreed, so it is refused with the keys that exist.
 */
async function assertKnownServiceKeys(deps: CoreDeps, helper: Helper, lineItems: ToolInput<"record_bill">["lineItems"]): Promise<void> {
  const known = (await helperServices(deps, helper.helperId)).map((s) => s.serviceKey);
  const unknown = [...new Set(lineItems.flatMap((l) => (l.serviceKey !== null && !known.includes(l.serviceKey) ? [l.serviceKey] : [])))];
  if (unknown.length === 0) return;
  throw new CoreError(
    CoreErrorCode.NOT_ALLOWED,
    `${helper.name} has no service ${unknown.map((k) => `"${k}"`).join(", ")}. Their services are: ${known.length === 0 ? "none yet" : known.map((k) => `"${k}"`).join(", ")}. ` +
      "Use the existing key for a line that is that service (a line described by when or why it happened, like \"after school\" or \"Saturday night\", priced by the hour, is the helper's hourly service). Use null only for work that is none of their services. Nothing was saved.",
  );
}

export async function recordBill(deps: CoreDeps, input: ToolInput<"record_bill">): Promise<RecordBillResult> {
  const { store, clock, newId } = deps;
  const [helper, document, helperBills] = await Promise.all([
    store.getHelper(input.helperId),
    store.getDocument(input.docId),
    store.listBills({ helperId: input.helperId }),
  ]);
  if (helper === null) throw notFound("Helper", input.helperId);
  if (document === null) throw notFound("Document", input.docId);
  await assertKnownServiceKeys(deps, helper, input.lineItems);

  const samePeriod = helperBills.filter((b) => b.period.start === input.period.start && b.period.end === input.period.end);
  const approved = samePeriod.find((b) => b.status === BillStatus.APPROVED);
  if (approved) {
    throw new CoreError(
      CoreErrorCode.PERIOD_ALREADY_APPROVED,
      `${helper.name}'s bill for ${input.period.start} to ${input.period.end} is already approved (${approved.billId}). The new bill was not saved.`,
      approved.billId,
    );
  }
  const replaced = samePeriod.filter((b) => b.status === BillStatus.RECEIVED);

  const billId = newId();
  const lineItems = toLineItems(input.lineItems, newId);
  const unchecked: Bill = {
    billId,
    helperId: input.helperId,
    period: input.period,
    lineItems,
    statedTotalCents: input.statedTotalCents,
    sourceDocId: input.docId,
    extractionAssumptions: input.extractionAssumptions,
    helperRemarks: input.helperRemarks,
    status: BillStatus.RECEIVED,
    supersedesBillId: replaced.at(-1)?.billId ?? null,
    supersededByBillId: null,
    receivedAt: clock.now(),
    latestCheck: null,
    approval: null,
    version: 1,
  };
  const check = await checkStoredBill(deps, unchecked);
  const bill: Bill = { ...unchecked, latestCheck: check };

  const ops: WriteOp[] = [{ record: { entity: StoredEntity.BILL, value: bill }, condition: { kind: WriteConditionKind.ABSENT } }];
  for (const old of replaced) {
    ops.push({
      record: { entity: StoredEntity.BILL, value: { ...old, status: BillStatus.SUPERSEDED, supersededByBillId: billId, version: old.version + 1 } },
      condition: { kind: WriteConditionKind.VERSION, expected: old.version },
    });
    for (const approval of await pendingApprovalsOf(deps, old.billId)) {
      const note = `Bill ${old.billId} was replaced by a corrected bill (${billId}).`;
      ops.push(actionWrite(resolvedAction(approval, { status: PendingActionStatus.SUPERSEDED, by: ActionResolver.SYSTEM, at: clock.now(), note })));
    }
  }
  await commitOrConflict(deps, ops, "The helper's bills changed while recording this one. Try again.");
  return { bill, check, supersededBillId: replaced.at(-1)?.billId ?? null };
}

/** Extracted lines get ids; relatedLineIndex (position in the extracted list) becomes relatedLineId. */
function toLineItems(drafts: ToolInput<"record_bill">["lineItems"], newId: () => Id): LineItem[] {
  const ids = drafts.map(() => newId());
  return drafts.map(({ relatedLineIndex, ...draft }, index) => {
    if (relatedLineIndex !== null && (relatedLineIndex >= drafts.length || relatedLineIndex === index)) {
      throw new CoreError(CoreErrorCode.NOT_ALLOWED, `Line ${index} points at line ${relatedLineIndex}, which isn't another line on this bill.`);
    }
    return { ...draft, lineId: ids[index]!, relatedLineId: relatedLineIndex === null ? null : ids[relatedLineIndex]! };
  });
}

async function pendingApprovalsOf({ store }: Pick<CoreDeps, "store">, billId: Id): Promise<PendingAction[]> {
  const pending = await store.listActions({ status: PendingActionStatus.PENDING });
  return pending.filter((a) => a.type === PendingActionType.BILL_APPROVAL && a.payload.billId === billId);
}

async function commitOrConflict({ store }: Pick<CoreDeps, "store">, ops: WriteOp[], message: string): Promise<void> {
  try {
    await store.commit(ops);
  } catch (error) {
    if (error instanceof StoreCommitError) throw new CoreError(CoreErrorCode.CONFLICT, message);
    throw error;
  }
}

export type ApproveBillInput = { billId: Id; billVersion: number; acceptedExceptions: AcceptedException[] };

/**
 * The UI Approve button: propose BILL_APPROVAL and confirm it in one request,
 * through the same gate as the chat path. Returns the bill as it now stands and
 * the resolved action (CONFIRMED, or STALE if something moved in between).
 */
export async function approveBill(deps: CoreDeps, { billId, billVersion, acceptedExceptions }: ApproveBillInput): Promise<{ bill: Bill; action: PendingAction }> {
  const bill = await deps.store.getBill(billId);
  if (bill === null) throw notFound("Bill", billId);
  if (bill.status !== BillStatus.RECEIVED) throw new CoreError(CoreErrorCode.BILL_NOT_APPROVABLE, `Bill ${billId} is ${bill.status} and can't be approved.`);
  if (bill.version !== billVersion) throw new CoreError(CoreErrorCode.CONFLICT, `Bill ${billId} changed (version ${bill.version}, you saw ${billVersion}). Reload it.`);

  const proposal = await proposeBillApproval(deps, { billId, acceptedExceptions }, { sessionId: null, turnId: null, docId: bill.sourceDocId });
  const action = await confirmAction(deps, { ref: proposal.action.ref, actionVersion: proposal.action.version, messageBody: null });
  return { bill: (await deps.store.getBill(billId))!, action };
}

/**
 * "Mark as paid": records Jordan's statement; moves no money. One per bill,
 * enforced by deriving the payment id from the bill id (a second create fails).
 */
export async function recordPayment(deps: CoreDeps, billId: Id, input: RouteBody<"recordPayment">): Promise<PaymentRecord> {
  const bill = await deps.store.getBill(billId);
  if (bill === null) throw notFound("Bill", billId);
  if (bill.status !== BillStatus.APPROVED || bill.approval === null) {
    throw new CoreError(CoreErrorCode.BILL_NOT_PAYABLE, `Bill ${billId} is ${bill.status}; only an approved bill can be marked paid.`);
  }
  const payment: PaymentRecord = {
    paymentId: paymentIdFor(billId),
    billId,
    helperId: bill.helperId,
    amountCents: bill.approval.amountApprovedCents,
    paidOn: input.paidOn,
    method: input.method,
    note: input.note,
    recordedAt: deps.clock.now(),
    version: 1,
  };
  try {
    await deps.store.commit([{ record: { entity: StoredEntity.PAYMENT, value: payment }, condition: { kind: WriteConditionKind.ABSENT } }]);
  } catch (error) {
    if (error instanceof StoreCommitError) throw new CoreError(CoreErrorCode.BILL_NOT_PAYABLE, `Bill ${billId} is already marked paid.`);
    throw error;
  }
  return payment;
}

/** One payment per bill: the id is a function of the bill. */
export const paymentIdFor = (billId: Id): Id => `payment-${billId}`;
