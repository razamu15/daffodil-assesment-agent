/**
 * The commit paths: the approve gate, STALE as a normal 200, and the fact that no
 * route can change a bill once it's approved.
 */
import { describe, expect, it } from "vitest";
import {
  ActionResolver,
  AgreementChangeKind,
  ApiErrorCode,
  apiRoutes,
  BillableUnit,
  BillingPeriodState,
  BillStatus,
  DayOfWeek,
  MessageReason,
  MessageStatus,
  PaymentMethod,
  PendingActionStatus,
  PendingActionType,
  PricingRuleKind,
  ScheduleKind,
  StoreCommitError,
  StoredEntity,
  StoreFailureReason,
  WriteConditionKind,
} from "@helper-assistant/domain";
import { billIds, docIds, helperIds, serviceKeys, termIds } from "@helper-assistant/fixtures";
import { proposeAgreementChange, proposeBillApproval, proposeHelperMessage } from "@helper-assistant/core";
import { STORE_FAILURE_API_CODE } from "../src/index";
import { testApp } from "./harness";

const source = { sessionId: null, turnId: null, docId: null };

const lupeRate = (cents: number) => ({
  change: {
    change: AgreementChangeKind.REPLACE_TERM,
    supersedesTermId: termIds.lupeRegular150,
    term: {
      helperId: helperIds.lupe,
      serviceKey: serviceKeys.lupeRegular,
      serviceLabel: "Regular cleaning",
      pricingRules: [{ kind: PricingRuleKind.FLAT_PER_UNIT, unit: BillableUnit.VISIT, amountCents: cents }],
      schedule: { kind: ScheduleKind.WEEKLY_ON, days: [DayOfWeek.TUE] },
      effectiveFrom: "2026-11-01",
      effectiveTo: null,
      sourceDocId: docIds.lupeRateChange,
      sourceQuote: "new rate",
      assumptions: [],
    },
  },
  sourceDocId: null,
});

describe("approve gate", () => {
  it("approves a bill that checks out, through a CONFIRMED BILL_APPROVAL action", async () => {
    const { call, deps } = await testApp();
    const { bill, action } = await call("approveBill", `/api/bills/${billIds.theo}/approve`, { billVersion: 1, acceptedExceptions: [] });
    expect(action).toMatchObject({ type: PendingActionType.BILL_APPROVAL, status: PendingActionStatus.CONFIRMED, resolvedBy: ActionResolver.USER_UI });
    expect(bill).toMatchObject({ status: BillStatus.APPROVED, approval: { viaActionRef: action.ref, amountApprovedCents: 58000 } });
    expect(deps.turnRunner.started).toEqual([]);
  });

  it("approving twice: the second is refused (409 BILL_NOT_APPROVABLE)", async () => {
    const { call, request, login, errorCode } = await testApp();
    await call("approveBill", `/api/bills/${billIds.theo}/approve`, { billVersion: 1, acceptedExceptions: [] });
    const again = await request("POST", `/api/bills/${billIds.theo}/approve`, { body: { billVersion: 1, acceptedExceptions: [] }, token: await login() });
    expect(again.status).toBe(409);
    expect(errorCode(again.json)).toBe(ApiErrorCode.BILL_NOT_APPROVABLE);
  });

  it("a flagged bill isn't approved without its flags accepted (400); a stale billVersion is 409", async () => {
    const { request, login, errorCode } = await testApp();
    const token = await login();
    const flagged = await request("POST", `/api/bills/${billIds.priya}/approve`, { body: { billVersion: 1, acceptedExceptions: [] }, token });
    expect(flagged.status).toBe(400);
    expect(errorCode(flagged.json)).toBe(ApiErrorCode.VALIDATION_FAILED);
    const stale = await request("POST", `/api/bills/${billIds.theo}/approve`, { body: { billVersion: 9, acceptedExceptions: [] }, token });
    expect(errorCode(stale.json)).toBe(ApiErrorCode.CONFLICT);
  });
});

describe("an approved bill can't be edited by any route", () => {
  it("the route table has no bill-editing route at all", () => {
    const billWrites = Object.values(apiRoutes).filter((r) => r.method !== "GET" && r.path.startsWith("/api/bills"));
    expect(billWrites.map((r) => r.path).sort()).toEqual(["/api/bills/:id/approve", "/api/bills/:id/payment"]);
  });

  it("every write path that touches it leaves the approved bill byte-identical", async () => {
    const { call, request, login, store, core } = await testApp();
    const pendingFromChat = await proposeBillApproval(core, { billId: billIds.theo, acceptedExceptions: [] }, source);
    await call("approveBill", `/api/bills/${billIds.theo}/approve`, { billVersion: 1, acceptedExceptions: [] });
    const sealed = await store.getBill(billIds.theo);
    const token = await login();

    expect((await request("POST", `/api/bills/${billIds.theo}/approve`, { body: { billVersion: 2, acceptedExceptions: [] }, token })).status).toBe(409);
    const confirmOld = await call("confirmAction", `/api/actions/${pendingFromChat.action.ref}/confirm`, { actionVersion: 1, messageBody: null });
    expect(confirmOld.action.status).toBe(PendingActionStatus.STALE);
    // A term change that would re-check open bills skips approved ones.
    const change = await proposeAgreementChange(
      core,
      { change: { change: AgreementChangeKind.END_TERM, termId: termIds.theoWalk60, effectiveTo: "2026-09-15" }, sourceDocId: null },
      source,
    );
    await call("confirmAction", `/api/actions/${change.action.ref}/confirm`, { actionVersion: 1, messageBody: null });
    await call("recordPayment", `/api/bills/${billIds.theo}/payment`, { paidOn: "2026-10-15", method: PaymentMethod.VENMO, note: null });

    expect(await store.getBill(billIds.theo)).toEqual(sealed);
    // And underneath every route, the store itself refuses; the api maps that to 409.
    await expect(store.commit([{ record: { entity: StoredEntity.BILL, value: { ...sealed!, version: 3 } }, condition: { kind: WriteConditionKind.VERSION, expected: 2 } }])).rejects.toBeInstanceOf(
      StoreCommitError,
    );
    expect(STORE_FAILURE_API_CODE[StoreFailureReason.IMMUTABLE_RECORD]).toBe(ApiErrorCode.CONFLICT);
  });
});

describe("confirm and reject", () => {
  it("a STALE confirm is a 200 with action.status STALE, not an error", async () => {
    const { call, core } = await testApp();
    const first = await proposeAgreementChange(core, lupeRate(15500), source);
    const second = await proposeAgreementChange(core, lupeRate(16000), source);
    expect((await call("confirmAction", `/api/actions/${first.action.ref}/confirm`, { actionVersion: 1, messageBody: null })).action.status).toBe(
      PendingActionStatus.CONFIRMED,
    );
    const stale = await call("confirmAction", `/api/actions/${second.action.ref}/confirm`, { actionVersion: 1, messageBody: null });
    expect(stale.action).toMatchObject({ status: PendingActionStatus.STALE, resolvedBy: ActionResolver.SYSTEM });
  });

  it("a wrong actionVersion is 409 CONFLICT; a resolved action is 409 ACTION_NOT_PENDING; reject works once", async () => {
    const { call, request, login, core, errorCode } = await testApp();
    const { action } = await proposeBillApproval(core, { billId: billIds.theo, acceptedExceptions: [] }, source);
    const token = await login();
    const wrongVersion = await request("POST", `/api/actions/${action.ref}/confirm`, { body: { actionVersion: 3, messageBody: null }, token });
    expect([wrongVersion.status, errorCode(wrongVersion.json)]).toEqual([409, ApiErrorCode.CONFLICT]);
    expect((await call("rejectAction", `/api/actions/${action.ref}/reject`, { actionVersion: 1 })).action.status).toBe(PendingActionStatus.REJECTED);
    const again = await request("POST", `/api/actions/${action.ref}/confirm`, { body: { actionVersion: 2, messageBody: null }, token });
    expect([again.status, errorCode(again.json)]).toEqual([409, ApiErrorCode.ACTION_NOT_PENDING]);
    const missing = await request("POST", "/api/actions/999/reject", { body: { actionVersion: 1 }, token });
    expect(errorCode(missing.json)).toBe(ApiErrorCode.NOT_FOUND);
  });

  it("a confirmed message uses the edited body and can be marked handed off", async () => {
    const { call, core } = await testApp();
    const { action } = await proposeHelperMessage(
      core,
      { helperId: helperIds.lupe, reason: MessageReason.DISCREPANCY, body: "draft", relatedBillId: billIds.lupe, relatedPeriod: null },
      source,
    );
    await call("confirmAction", `/api/actions/${action.ref}/confirm`, { actionVersion: 1, messageBody: "Hi Lupe, could you send $800?" });
    const [message] = (await call("listMessages", `/api/messages?helperId=${helperIds.lupe}`)).messages;
    expect(message).toMatchObject({ status: MessageStatus.READY, body: "Hi Lupe, could you send $800?" });
    const handedOff = await call("markMessageHandedOff", `/api/messages/${message!.messageId}/handed-off`, {});
    expect(handedOff.message.status).toBe(MessageStatus.HANDED_OFF);
  });
});

describe("mark as paid", () => {
  it("only an approved bill, only once; month status shows PAID", async () => {
    const { call, request, login, errorCode } = await testApp();
    const token = await login();
    const body = { paidOn: "2026-10-15", method: PaymentMethod.VENMO, note: "Venmo ref 1234" };
    const early = await request("POST", `/api/bills/${billIds.theo}/payment`, { body, token });
    expect([early.status, errorCode(early.json)]).toEqual([409, ApiErrorCode.BILL_NOT_PAYABLE]);

    await call("approveBill", `/api/bills/${billIds.theo}/approve`, { billVersion: 1, acceptedExceptions: [] });
    const { payment } = await call("recordPayment", `/api/bills/${billIds.theo}/payment`, body);
    expect(payment).toMatchObject({ billId: billIds.theo, amountCents: 58000, note: "Venmo ref 1234" });
    const twice = await request("POST", `/api/bills/${billIds.theo}/payment`, { body, token });
    expect(errorCode(twice.json)).toBe(ApiErrorCode.BILL_NOT_PAYABLE);

    const status = await call("getMonthStatus", "/api/month-status?month=2026-09");
    expect(status.rows.find((r) => r.helperId === helperIds.theo)).toMatchObject({ state: BillingPeriodState.PAID, paidOn: "2026-10-15" });
    const bills = await call("listBills", "/api/bills?month=2026-09");
    expect(bills.payments).toHaveLength(1);
  });
});
