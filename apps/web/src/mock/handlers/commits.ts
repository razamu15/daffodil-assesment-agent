/**
 * The commit paths: confirm / reject a card, the Approve button, Mark as paid,
 * "I sent it". Error codes mirror the real API (core CoreError → ApiErrorCode).
 */
import { unacceptedBlockingItems } from "@helper-assistant/core";
import { ActionResolver, ApiErrorCode, BillStatus, MessageStatus, PendingActionStatus, PendingActionType } from "@helper-assistant/domain";
import type { PendingAction } from "@helper-assistant/domain";
import { addApprovalAction, NO_SOURCE, resolved } from "../actionFactory";
import { confirmInWorld } from "../apply";
import { MockApiError } from "../errors";
import type { MockWorld } from "../world";
import type { Handlers } from "./types";

type CommitRoutes = "confirmAction" | "rejectAction" | "approveBill" | "recordPayment" | "markMessageHandedOff";

function pendingAt(world: MockWorld, ref: number, actionVersion: number): PendingAction {
  const action = world.action(ref);
  if (action.status !== PendingActionStatus.PENDING) throw new MockApiError(ApiErrorCode.ACTION_NOT_PENDING, `Card #${ref} is already ${action.status.toLowerCase()}.`);
  if (action.version !== actionVersion) throw new MockApiError(ApiErrorCode.CONFLICT, `Card #${ref} changed since you looked at it. Reload it.`);
  return action;
}

export const commitHandlers: Pick<Handlers, CommitRoutes> = {
  confirmAction: (world, { params, body }) => {
    const action = pendingAt(world, params.ref, body.actionVersion);
    if (body.messageBody !== null && action.type !== PendingActionType.HELPER_MESSAGE) {
      throw new MockApiError(ApiErrorCode.VALIDATION_FAILED, `An edited message only applies to a message card; #${action.ref} is ${action.type}.`);
    }
    return { action: confirmInWorld(world, action, body.messageBody) };
  },

  rejectAction: (world, { params, body }) => {
    const action = pendingAt(world, params.ref, body.actionVersion);
    const rejected = resolved(world, action, PendingActionStatus.REJECTED, ActionResolver.USER_UI, null);
    world.replace(world.actions, (a) => a.ref === action.ref, rejected);
    return { action: rejected };
  },

  /** The Approve button: propose BILL_APPROVAL and confirm it in one request, through the same gate. */
  approveBill: (world, { params, body }) => {
    const bill = world.bill(params.id);
    if (bill.status !== BillStatus.RECEIVED || bill.latestCheck === null) {
      throw new MockApiError(ApiErrorCode.BILL_NOT_APPROVABLE, `This bill is ${bill.status.toLowerCase()} and can't be approved.`);
    }
    if (bill.version !== body.billVersion) throw new MockApiError(ApiErrorCode.CONFLICT, "This bill changed since you opened it. Reload it.");
    const open = unacceptedBlockingItems(bill.latestCheck, body.acceptedExceptions);
    if (open.length > 0) throw new MockApiError(ApiErrorCode.VALIDATION_FAILED, `Every flagged item needs a reason before approving. Missing: ${open.join(", ")}.`);

    const proposed = addApprovalAction(world, bill, world.helper(bill.helperId), body.acceptedExceptions, { ...NO_SOURCE, docId: bill.sourceDocId });
    const action = confirmInWorld(world, proposed, null);
    return { bill: world.bill(bill.billId), action };
  },

  recordPayment: (world, { params, body }) => {
    const bill = world.bill(params.id);
    if (bill.status !== BillStatus.APPROVED || bill.approval === null) {
      throw new MockApiError(ApiErrorCode.BILL_NOT_PAYABLE, "Only an approved bill can be marked paid.");
    }
    if (world.payments.some((p) => p.billId === bill.billId)) throw new MockApiError(ApiErrorCode.BILL_NOT_PAYABLE, "This bill is already marked paid.");
    const payment = {
      paymentId: `payment-${bill.billId}`,
      billId: bill.billId,
      helperId: bill.helperId,
      amountCents: bill.approval.amountApprovedCents,
      paidOn: body.paidOn,
      method: body.method,
      note: body.note,
      recordedAt: world.now(),
      version: 1,
    };
    world.payments.push(payment);
    return { payment };
  },

  markMessageHandedOff: (world, { params }) => {
    const message = world.messages.find((m) => m.messageId === params.id);
    if (message === undefined) throw new MockApiError(ApiErrorCode.NOT_FOUND, `Message ${params.id} not found.`);
    if (message.status === MessageStatus.HANDED_OFF) return { message };
    if (message.status !== MessageStatus.READY) throw new MockApiError(ApiErrorCode.CONFLICT, `This message is ${message.status.toLowerCase()} and can't be marked sent.`);
    const handedOff = { ...message, status: MessageStatus.HANDED_OFF, handedOffAt: world.now(), version: message.version + 1 };
    world.replace(world.messages, (m) => m.messageId === message.messageId, handedOff);
    return { message: handedOff };
  },
};
