/**
 * Route behaviour outside the commit paths: the validation boundary, reads,
 * direct helper saves, documents and chat. Every 200 is parsed with the route's
 * response schema (harness `call`), so the api can't drift from the contract.
 */
import { describe, expect, it } from "vitest";
import {
  ApiErrorCode,
  BillingPeriodState,
  BillVerdict,
  ChatRole,
  DocumentKind,
  DocumentStorage,
  HelperProfileSchema,
  HelperStatus,
  TurnStatus,
} from "@helper-assistant/domain";
import { billIds, expectedSeptemberMonthStatus, helperIds, starterPackHelpers } from "@helper-assistant/fixtures";
import { testApp } from "./harness";

describe("validation boundary", () => {
  it("rejects bad bodies, bad JSON and bad params with 400 VALIDATION_FAILED", async () => {
    const { request, login, errorCode } = await testApp();
    const token = await login();
    const cases = [
      await request("POST", `/api/bills/${billIds.theo}/approve`, { body: { billVersion: "one", acceptedExceptions: [] }, token }),
      await request("POST", `/api/bills/${billIds.theo}/approve`, { rawBody: "{not json", token }),
      await request("POST", "/api/actions/abc/confirm", { body: { actionVersion: 1, messageBody: null }, token }),
      await request("GET", "/api/month-status?month=2026-9", { token }),
      await request("POST", "/api/messages/m1/handed-off", { body: { extra: true }, token }),
    ];
    for (const response of cases) {
      expect(response.status).toBe(400);
      expect(errorCode(response.json)).toBe(ApiErrorCode.VALIDATION_FAILED);
    }
  });

  it("unknown routes are 404 in the ApiError shape", async () => {
    const { request, login, errorCode } = await testApp();
    const response = await request("DELETE", `/api/bills/${billIds.theo}`, { token: await login() });
    expect([response.status, errorCode(response.json)]).toEqual([404, ApiErrorCode.NOT_FOUND]);
  });
});

describe("reads", () => {
  it("month status defaults to the most recent closed month and matches the answer key", async () => {
    const { call } = await testApp();
    const status = await call("getMonthStatus", "/api/month-status");
    expect(status.month).toBe("2026-09");
    const rows = status.rows.map(({ helperId, state, billId, verdict }) => ({ helperId, state, billId, verdict }));
    expect(rows).toEqual(expect.arrayContaining(expectedSeptemberMonthStatus));
    const october = await call("getMonthStatus", "/api/month-status?month=2026-10");
    expect(october.rows.every((r) => r.state === BillingPeriodState.NOT_RECEIVED)).toBe(true);
  });

  it("a bill comes with the terms behind its check, its source document and payment", async () => {
    const { call, request, login, errorCode } = await testApp();
    const { bill, terms, sourceDocument, payment } = await call("getBill", `/api/bills/${billIds.lupe}`);
    expect(bill.latestCheck!.verdict).toBe(BillVerdict.DISCREPANCIES);
    expect(terms.map((t) => t.serviceKey).sort()).toEqual(["deep-clean", "regular", "regular"]);
    expect(sourceDocument.docId).toBe(bill.sourceDocId);
    expect(payment).toBeNull();
    const missing = await request("GET", "/api/bills/nope", { token: await login() });
    expect([missing.status, errorCode(missing.json)]).toEqual([404, ApiErrorCode.NOT_FOUND]);
  });

  it("lists bills, terms with their documents, helpers and actions", async () => {
    const { call } = await testApp();
    expect((await call("listBills", `/api/bills?month=2026-09&helperId=${helperIds.lupe}`)).bills.map((b) => b.billId)).toEqual([billIds.lupe]);
    const lupe = await call("listTerms", `/api/terms?helperId=${helperIds.lupe}`);
    expect(lupe.terms).toHaveLength(3);
    expect(new Set(lupe.documents.map((d) => d.docId))).toEqual(new Set(lupe.terms.map((t) => t.sourceDocId)));
    expect((await call("listHelpers", "/api/helpers")).helpers).toHaveLength(3);
    expect((await call("listActions", "/api/actions?status=PENDING")).actions).toEqual([]);
  });
});

describe("helper profiles save directly, version-checked", () => {
  it("creates, updates, and refuses an edit made against an old version", async () => {
    const { call, request, login, errorCode } = await testApp();
    // The editable profile part of a helper (zod strips the rest).
    const profile = HelperProfileSchema.parse(starterPackHelpers[0]);
    const { helper: created } = await call("createHelper", "/api/helpers", { profile: { ...profile, name: "Maria", role: "tutor" } });
    expect(created).toMatchObject({ name: "Maria", role: "tutor", status: HelperStatus.ACTIVE, version: 1 });

    const { helper: updated } = await call("updateHelper", `/api/helpers/${created.helperId}`, { helperVersion: 1, profile: { ...profile, name: "Maria", role: "math tutor" } });
    expect(updated).toMatchObject({ role: "math tutor", version: 2 });
    const stale = await request("POST", `/api/helpers/${created.helperId}`, { body: { helperVersion: 1, profile }, token: await login() });
    expect([stale.status, errorCode(stale.json)]).toEqual([409, ApiErrorCode.CONFLICT]);
  });
});

describe("documents", () => {
  it("stores pasted text inline and image bytes in the blob store", async () => {
    const { call, request, login, errorCode } = await testApp();
    const text = await call("uploadDocument", "/api/documents", {
      storage: DocumentStorage.INLINE_TEXT,
      kind: DocumentKind.PASTED_THREAD,
      text: "Lupe: starting the 15th my regular visit will be $150",
      messageDate: "2026-08-28",
      sessionId: null,
    });
    expect(text).toMatchObject({ document: { kind: DocumentKind.PASTED_THREAD, messageDate: "2026-08-28" }, blobBase64: null });

    const base64 = btoa("\x89PNG fake image bytes");
    const image = await call("uploadDocument", "/api/documents", { storage: DocumentStorage.BLOB, kind: DocumentKind.BILL_SCREENSHOT, mediaType: "image/png", base64, messageDate: null, sessionId: null });
    const fetched = await call("getDocument", `/api/documents/${image.document.docId}`);
    expect(fetched.blobBase64).toBe(base64);
    expect(fetched.document.content).toMatchObject({ storage: DocumentStorage.BLOB, mediaType: "image/png" });

    const token = await login();
    const notBase64 = await request("POST", "/api/documents", { body: { storage: DocumentStorage.BLOB, kind: DocumentKind.BILL_SCREENSHOT, mediaType: "image/png", base64: "%%%", messageDate: null, sessionId: null }, token });
    expect(errorCode(notBase64.json)).toBe(ApiErrorCode.VALIDATION_FAILED);
  });
});

describe("chat", () => {
  it("creates a session and a QUEUED turn, dispatches it, and locks the session", async () => {
    const { call, request, login, deps, errorCode } = await testApp();
    const { sessionId, turnId } = await call("chat", "/api/chat", { sessionId: null, text: "Check Priya's September bill", attachmentDocIds: [] });
    expect(deps.turnRunner.started).toEqual([{ turnId, sessionId }]);
    expect(await call("getTurn", `/api/turns/${turnId}`)).toEqual({ turnId, sessionId, status: TurnStatus.QUEUED, replyText: null, proposedActions: [], error: null });
    expect((await call("listSessions", "/api/sessions")).sessions[0]).toMatchObject({ sessionId, title: "Check Priya's September bill", activeTurnId: turnId });

    const busy = await request("POST", "/api/chat", { body: { sessionId, text: "and Lupe's?", attachmentDocIds: [] }, token: await login() });
    expect([busy.status, errorCode(busy.json)]).toEqual([409, ApiErrorCode.SESSION_BUSY]);
    expect(deps.turnRunner.started).toHaveLength(1);
  });

  it("if the runner can't be started, the turn fails and the session is unlocked", async () => {
    const { call, request, login, deps, store } = await testApp();
    deps.turnRunner.failWith = new Error("lambda down");
    const failed = await request("POST", "/api/chat", { body: { sessionId: null, text: "hi", attachmentDocIds: [] }, token: await login() });
    expect(failed.status).toBe(500);
    const [session] = await store.listSessions();
    expect(session!.activeTurnId).toBeNull();
    const [turn] = await store.listTurns(session!.sessionId);
    expect(turn).toMatchObject({ status: TurnStatus.FAILED });

    deps.turnRunner.failWith = null;
    await call("chat", "/api/chat", { sessionId: session!.sessionId, text: "hi again", attachmentDocIds: [] });
  });

  it("serves a session's history from the memory client", async () => {
    const { call, deps } = await testApp();
    const { sessionId } = await call("chat", "/api/chat", { sessionId: null, text: "hello", attachmentDocIds: [] });
    await deps.memory.appendChatMessages(sessionId, [{ role: ChatRole.USER, text: "hello", at: "2026-10-14T12:00:00.000Z" }]);
    expect((await call("getSessionMessages", `/api/sessions/${sessionId}/messages`)).messages).toHaveLength(1);
  });
});
