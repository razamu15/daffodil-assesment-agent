/**
 * The PendingAction lifecycle: PENDING_ACTION_TRANSITIONS is enforced on every
 * resolution path, with a version check for the user paths.
 */
import { describe, expect, it } from "vitest";
import {
  ActionResolver,
  MessageReason,
  MessageStatus,
  PENDING_ACTION_TRANSITIONS,
  PendingActionStatus,
  PendingActionStatusSchema,
} from "@helper-assistant/domain";
import { billIds, helperIds } from "@helper-assistant/fixtures";
import {
  confirmAction,
  CoreErrorCode,
  proposeBillApproval,
  proposeHelperMessage,
  rejectAction,
  withdrawAction,
} from "../src/index";
import { starterPackDeps, testSource } from "./harness";

const proposeTheoApproval = async () => {
  const deps = await starterPackDeps();
  const { action } = await proposeBillApproval(deps, { billId: billIds.theo, acceptedExceptions: [] }, testSource);
  return { deps, action };
};

describe("transition table", () => {
  it("lets only PENDING move, to every other status", () => {
    for (const status of PendingActionStatusSchema.options) {
      const allowed = PENDING_ACTION_TRANSITIONS[status];
      if (status === PendingActionStatus.PENDING) expect([...allowed].sort()).toEqual(PendingActionStatusSchema.options.filter((s) => s !== status).sort());
      else expect(allowed).toEqual([]);
    }
  });
});

describe("resolving actions", () => {
  it("reject: USER_UI, version-checked, terminal", async () => {
    const { deps, action } = await proposeTheoApproval();
    await expect(rejectAction(deps, { ref: action.ref, actionVersion: 7 })).rejects.toMatchObject({ code: CoreErrorCode.CONFLICT });
    const rejected = await rejectAction(deps, { ref: action.ref, actionVersion: 1 });
    expect(rejected).toMatchObject({ status: PendingActionStatus.REJECTED, resolvedBy: ActionResolver.USER_UI, version: 2 });
    await expect(confirmAction(deps, { ref: action.ref, actionVersion: 2, messageBody: null })).rejects.toMatchObject({
      code: CoreErrorCode.ACTION_NOT_PENDING,
    });
  });

  it("withdraw: the agent's only resolution, recorded with its reason", async () => {
    const { deps, action } = await proposeTheoApproval();
    const withdrawn = await withdrawAction(deps, { ref: action.ref, reason: "Jordan wants to wait." });
    expect(withdrawn).toMatchObject({ status: PendingActionStatus.WITHDRAWN, resolvedBy: ActionResolver.AGENT, resolutionNote: "Jordan wants to wait." });
    await expect(withdrawAction(deps, { ref: action.ref, reason: "again" })).rejects.toMatchObject({ code: CoreErrorCode.ACTION_NOT_PENDING });
  });

  it("confirm: unknown ref is NOT_FOUND; a stale version is CONFLICT and changes nothing", async () => {
    const { deps, action } = await proposeTheoApproval();
    await expect(confirmAction(deps, { ref: 999, actionVersion: 1, messageBody: null })).rejects.toMatchObject({ code: CoreErrorCode.NOT_FOUND });
    await expect(confirmAction(deps, { ref: action.ref, actionVersion: 2, messageBody: null })).rejects.toMatchObject({ code: CoreErrorCode.CONFLICT });
    expect((await deps.store.getAction(action.ref))!.status).toBe(PendingActionStatus.PENDING);
  });

  it("confirm of a message uses Jordan's edited text; an edited body on any other type is refused", async () => {
    const { deps, action } = await proposeTheoApproval();
    await expect(confirmAction(deps, { ref: action.ref, actionVersion: 1, messageBody: "hi" })).rejects.toMatchObject({ code: CoreErrorCode.NOT_ALLOWED });

    const draft = await proposeHelperMessage(
      deps,
      { helperId: helperIds.priya, reason: MessageReason.DISCREPANCY, body: "Hi Priya, about the $40 fee...", relatedBillId: billIds.priya, relatedPeriod: null },
      testSource,
    );
    expect(draft.action.targetKey).toBe(`MSG#${helperIds.priya}#DISCREPANCY#${billIds.priya}`);
    await confirmAction(deps, { ref: draft.action.ref, actionVersion: 1, messageBody: "Hi Priya! Quick question about the $40 fee." });
    const [message] = await deps.store.listMessages({ helperId: helperIds.priya });
    expect(message).toMatchObject({ status: MessageStatus.READY, body: "Hi Priya! Quick question about the $40 fee.", createdByActionRef: draft.action.ref });
  });
});
