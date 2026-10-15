/**
 * The mock API honours the contract: for every scenario, every route in
 * apiRoutes answers, and the typed client (which parses each response with the
 * route's response schema) accepts it. Plus the scenario facts the UI relies on.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiErrorCode,
  BillingPeriodState,
  BillPeriodKind,
  BillStatus,
  BillVerdict,
  ContactChannel,
  DocumentKind,
  DocumentStorage,
  HelperStatus,
  HouseKeyAccess,
  MessageStatus,
  PaymentMethod,
  PendingActionStatus,
  PendingActionType,
  TurnStatus,
} from "@helper-assistant/domain";
import type { ApiRouteName } from "@helper-assistant/domain";
import { billIds, expectedBillChecks, expectedSeptemberMonthStatus, helperIds } from "@helper-assistant/fixtures";
import { ApiClient, ApiClientError } from "../src/api/client";
import { createMockApi } from "../src/mock";
import { ScenarioId } from "../src/mock/scenarios";

async function loggedIn(scenario: ScenarioId): Promise<ApiClient> {
  const client = new ApiClient(createMockApi(scenario, 0).transport);
  await client.login("anything");
  return client;
}

const MISSING = "missing-id";

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(ApiClientError);
  expect((error as ApiClientError).code).toBe(code);
}

/** One call per route. Where the scenario has nothing to act on, the route must answer NOT_FOUND (a contract-shaped error). */
const CALL_EVERY_ROUTE: Record<ApiRouteName, (c: ApiClient) => Promise<unknown>> = {
  login: (c) => c.call("login", { body: { password: "anything" } }),
  health: (c) => c.call("health"),
  chat: (c) => c.call("chat", { body: { sessionId: null, text: "Draft a reminder for Marco", attachmentDocIds: [] } }),
  getTurn: async (c) => {
    const { turnId } = await c.call("chat", { body: { sessionId: null, text: "hello", attachmentDocIds: [] } });
    return c.call("getTurn", { params: { id: turnId } });
  },
  listSessions: (c) => c.call("listSessions"),
  getSessionMessages: async (c) => {
    const { sessionId } = await c.call("chat", { body: { sessionId: null, text: "hello", attachmentDocIds: [] } });
    return c.call("getSessionMessages", { params: { id: sessionId } });
  },
  uploadDocument: (c) =>
    c.call("uploadDocument", { body: { storage: DocumentStorage.INLINE_TEXT, kind: DocumentKind.TYPED_NOTES, text: "Notes", messageDate: null, sessionId: null } }),
  getDocument: async (c) => {
    const { document } = await c.call("uploadDocument", {
      body: { storage: DocumentStorage.BLOB, kind: DocumentKind.BILL_SCREENSHOT, mediaType: "image/png", base64: "aGVsbG8=", messageDate: null, sessionId: null },
    });
    return c.call("getDocument", { params: { id: document.docId } });
  },
  listHelpers: (c) => c.call("listHelpers"),
  createHelper: (c) => c.call("createHelper", { body: { profile: newProfile } }),
  updateHelper: async (c) => {
    const { helper } = await c.call("createHelper", { body: { profile: newProfile } });
    return c.call("updateHelper", { params: { id: helper.helperId }, body: { helperVersion: helper.version, profile: { ...newProfile, notes: "edited" } } });
  },
  listTerms: (c) => c.call("listTerms", { query: {} }),
  listBills: (c) => c.call("listBills", { query: { month: "2026-09" } }),
  getBill: async (c) => {
    const { bills } = await c.call("listBills");
    return bills[0] ? c.call("getBill", { params: { id: bills[0].billId } }) : expectCode(c.call("getBill", { params: { id: MISSING } }), ApiErrorCode.NOT_FOUND);
  },
  getMonthStatus: (c) => c.call("getMonthStatus"),
  listActions: (c) => c.call("listActions", { query: { status: PendingActionStatus.PENDING } }),
  listMessages: (c) => c.call("listMessages"),
  confirmAction: async (c) => {
    const { actions } = await c.call("listActions", { query: { status: PendingActionStatus.PENDING } });
    const action = actions[0];
    return action ? c.call("confirmAction", { params: { ref: action.ref }, body: { actionVersion: action.version, messageBody: null } }) : expectCode(c.call("confirmAction", { params: { ref: 999 }, body: { actionVersion: 1, messageBody: null } }), ApiErrorCode.NOT_FOUND);
  },
  rejectAction: async (c) => {
    const { actions } = await c.call("listActions", { query: { status: PendingActionStatus.PENDING } });
    const action = actions.at(-1);
    return action ? c.call("rejectAction", { params: { ref: action.ref }, body: { actionVersion: action.version } }) : expectCode(c.call("rejectAction", { params: { ref: 999 }, body: { actionVersion: 1 } }), ApiErrorCode.NOT_FOUND);
  },
  approveBill: async (c) => {
    const { bills } = await c.call("listBills", { query: { status: BillStatus.RECEIVED } });
    const clean = bills.find((b) => b.latestCheck?.verdict === BillVerdict.CHECKS_OUT);
    return clean ? c.call("approveBill", { params: { id: clean.billId }, body: { billVersion: clean.version, acceptedExceptions: [] } }) : expectCode(c.call("approveBill", { params: { id: MISSING }, body: { billVersion: 1, acceptedExceptions: [] } }), ApiErrorCode.NOT_FOUND);
  },
  recordPayment: async (c) => {
    const { bills, payments } = await c.call("listBills", { query: { status: BillStatus.APPROVED } });
    const unpaid = bills.find((b) => !payments.some((p) => p.billId === b.billId));
    const body = { paidOn: "2026-10-14", method: PaymentMethod.VENMO, note: null };
    return unpaid ? c.call("recordPayment", { params: { id: unpaid.billId }, body }) : expectCode(c.call("recordPayment", { params: { id: MISSING }, body }), ApiErrorCode.NOT_FOUND);
  },
  markMessageHandedOff: async (c) => {
    const { messages } = await c.call("listMessages");
    const ready = messages.find((m) => m.status === MessageStatus.READY);
    return ready ? c.call("markMessageHandedOff", { params: { id: ready.messageId } }) : expectCode(c.call("markMessageHandedOff", { params: { id: MISSING } }), ApiErrorCode.NOT_FOUND);
  },
};

const newProfile = {
  name: "Ana",
  role: "tutor",
  houseKeyAccess: HouseKeyAccess.UNKNOWN,
  payment: { method: PaymentMethod.UNKNOWN, handle: null },
  contact: { channel: ContactChannel.UNKNOWN, handle: null },
  startedOn: null,
  notes: "",
};

afterEach(() => vi.restoreAllMocks());

describe.each(Object.values(ScenarioId))("scenario %s", (scenario) => {
  it.each(Object.keys(CALL_EVERY_ROUTE) as ApiRouteName[])("%s answers within the contract", async (route) => {
    const client = await loggedIn(scenario);
    await expect(CALL_EVERY_ROUTE[route](client)).resolves.not.toThrow();
  });

  it("refuses requests without a token", async () => {
    const client = new ApiClient(createMockApi(scenario, 0).transport);
    await expectCode(client.call("listHelpers"), ApiErrorCode.UNAUTHORIZED);
  });
});

describe("scenario facts", () => {
  it("rejects the one wrong password", async () => {
    const client = new ApiClient(createMockApi(ScenarioId.EMPTY, 0).transport);
    await expectCode(client.login("wrong"), ApiErrorCode.UNAUTHORIZED);
    expect(client.isLoggedIn).toBe(false);
  });

  it("empty starts with nothing", async () => {
    const client = await loggedIn(ScenarioId.EMPTY);
    expect((await client.call("listHelpers")).helpers).toEqual([]);
    expect((await client.call("getMonthStatus")).rows).toEqual([]);
  });

  it("checks the starter bills as the answer key says", async () => {
    const client = await loggedIn(ScenarioId.BILL_FLAGGED);
    for (const expected of expectedBillChecks) {
      const check = (await client.call("getBill", { params: { id: expected.billId } })).bill.latestCheck!;
      expect(check.verdict).toBe(expected.verdict);
      expect(check.agreedTotalCents).toBe(expected.agreedTotalCents);
      expect(check.lineChecks.map((l) => [l.lineId, l.status, l.expectedCents])).toEqual(expected.lines.map((l) => [l.lineId, l.status, l.expectedCents]));
    }
  });

  it("month-mixed: two flagged, one clean, one not received", async () => {
    const status = await (await loggedIn(ScenarioId.MONTH_MIXED)).call("getMonthStatus");
    expect(status.month).toBe("2026-09");
    for (const expected of expectedSeptemberMonthStatus) expect(status.rows.find((r) => r.helperId === expected.helperId)?.state).toBe(expected.state);
    expect(status.rows.filter((r) => r.state === BillingPeriodState.NOT_RECEIVED).map((r) => r.helperName)).toEqual(["Marco"]);
  });

  it("pending-conflict: confirming one card makes the other stale", async () => {
    const client = await loggedIn(ScenarioId.PENDING_CONFLICT);
    const { actions } = await client.call("listActions", { query: { status: PendingActionStatus.PENDING } });
    const pair = actions.filter((a) => a.type === PendingActionType.AGREEMENT_CHANGE);
    expect(pair).toHaveLength(2);
    expect(pair[0]!.targetKey).toBe(pair[1]!.targetKey);
    const first = await client.call("confirmAction", { params: { ref: pair[0]!.ref }, body: { actionVersion: pair[0]!.version, messageBody: null } });
    expect(first.action.status).toBe(PendingActionStatus.CONFIRMED);
    const second = await client.call("confirmAction", { params: { ref: pair[1]!.ref }, body: { actionVersion: pair[1]!.version, messageBody: null } });
    expect(second.action.status).toBe(PendingActionStatus.STALE);
    expect(second.action.resolutionNote).not.toBeNull();
  });

  it("approved: Priya approves the sum of lines with reasons; Theo is paid; approving again is refused", async () => {
    const client = await loggedIn(ScenarioId.APPROVED);
    const { bill } = await client.call("getBill", { params: { id: billIds.priya } });
    expect(bill.status).toBe(BillStatus.APPROVED);
    expect(bill.approval!.amountApprovedCents).toBe(59600);
    expect(bill.approval!.billedCents).toBe(62600);
    expect(bill.approval!.acceptedExceptions.every((e) => e.reason.length > 0)).toBe(true);
    const status = await client.call("getMonthStatus");
    expect(status.rows.find((r) => r.helperId === helperIds.theo)?.state).toBe(BillingPeriodState.PAID);
    await expectCode(client.call("approveBill", { params: { id: billIds.priya }, body: { billVersion: bill.version, acceptedExceptions: [] } }), ApiErrorCode.BILL_NOT_APPROVABLE);
  });

  it("helper-ended: confirming the end expects a final bill for Oct 1–14", async () => {
    const client = await loggedIn(ScenarioId.HELPER_ENDED);
    const { actions } = await client.call("listActions", { query: { status: PendingActionStatus.PENDING } });
    const end = actions.find((a) => a.type === PendingActionType.HELPER_ENGAGEMENT_END)!;
    await client.call("confirmAction", { params: { ref: end.ref }, body: { actionVersion: end.version, messageBody: null } });
    const lupe = (await client.call("listHelpers")).helpers.find((h) => h.helperId === helperIds.lupe)!;
    expect(lupe.status).toBe(HelperStatus.ENDED);
    const october = await client.call("getMonthStatus", { query: { month: "2026-10" } });
    const row = october.rows.find((r) => r.helperId === helperIds.lupe)!;
    expect(row.period).toEqual({ start: "2026-10-01", end: "2026-10-14", kind: BillPeriodKind.FINAL_SETTLEMENT });
    expect(row.state).toBe(BillingPeriodState.NOT_RECEIVED);
  });

  it("a chat turn completes with an inline card", async () => {
    const client = await loggedIn(ScenarioId.MONTH_MIXED);
    const { turnId } = await client.call("chat", { body: { sessionId: null, text: "Draft a reminder for Marco", attachmentDocIds: [] } });
    expect((await client.call("getTurn", { params: { id: turnId } })).status).toBe(TurnStatus.RUNNING);
    const later = Date.now() + 10_000;
    vi.spyOn(Date, "now").mockReturnValue(later);
    const turn = await client.call("getTurn", { params: { id: turnId } });
    expect(turn.status).toBe(TurnStatus.COMPLETED);
    expect(turn.proposedActions.map((a) => a.type)).toEqual([PendingActionType.HELPER_MESSAGE]);
  });
});
