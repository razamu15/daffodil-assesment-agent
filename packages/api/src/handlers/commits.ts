/**
 * The commit paths. Confirm is THE commit: it goes to core's confirmAction and
 * nothing on this path calls a model. A STALE outcome is a 200 with
 * action.status = STALE, not an error. There is deliberately no route that edits
 * a bill: approval goes through the same PendingAction gate as chat, and the
 * Store refuses any write to an approved bill.
 *
 * Call site: createApp.
 */
import {
  approveBill,
  confirmAction,
  markMessageHandedOff,
  recordPayment,
  rejectAction,
} from "@helper-assistant/core";
import type { AppDeps } from "../deps";
import type { RouteHandlers } from "../routing";

export function commitHandlers(deps: AppDeps) {
  return {
    confirmAction: async ({ params, body }) => ({
      action: await confirmAction(deps, { ref: params.ref, actionVersion: body.actionVersion, messageBody: body.messageBody }),
    }),

    rejectAction: async ({ params, body }) => ({ action: await rejectAction(deps, { ref: params.ref, actionVersion: body.actionVersion }) }),

    /** The Approve button: propose BILL_APPROVAL + confirm, in one request, through the same gate. */
    approveBill: async ({ params, body }) =>
      approveBill(deps, { billId: params.id, billVersion: body.billVersion, acceptedExceptions: body.acceptedExceptions }),

    recordPayment: async ({ params, body }) => ({ payment: await recordPayment(deps, params.id, body) }),

    markMessageHandedOff: async ({ params }) => ({ message: await markMessageHandedOff(deps, params.id) }),
  } satisfies Partial<RouteHandlers>;
}
