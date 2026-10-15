/**
 * The Store conformance suite (Doc 4 §6.1): the contract in domain ports/store.ts,
 * as tests any Store implementation must pass.
 *
 * Call sites: inMemoryStore.test.ts (here); DynamoStore's test at gate I2 runs the
 * same function against a real or local table.
 *
 * `makeStore` must return a fresh, empty store scoped to one household.
 */
import { describe, expect, it } from "vitest";
import {
  ActionBasisKind,
  BillStatus,
  ContactChannel,
  DeliveryMode,
  MessageReason,
  MessageStatus,
  NoteKind,
  NoteStatus,
  PaymentMethod,
  PendingActionStatus,
  PendingActionType,
  STORE_MAX_OPS_PER_COMMIT,
  StoreCommitError,
  StoredEntity,
  StoreFailureReason,
  TurnStatus,
  WriteConditionKind,
} from "@helper-assistant/domain";
import type {
  Bill,
  HelperNote,
  OutboundMessage,
  PaymentRecord,
  PendingAction,
  Session,
  Store,
  StoreRecord,
  Turn,
  WriteOp,
} from "@helper-assistant/domain";
import {
  billIds,
  helperIds,
  starterPackBills,
  starterPackDocuments,
  starterPackHelpers,
  starterPackHousehold,
  starterPackTerms,
} from "@helper-assistant/fixtures";

const AT = "2026-10-14T16:00:00.000Z";
const at = (minute: number) => `2026-10-14T16:${String(minute).padStart(2, "0")}:00.000Z`;

const create = (record: StoreRecord): WriteOp => ({ record, condition: { kind: WriteConditionKind.ABSENT } });
const updateFrom = (expected: number, record: StoreRecord): WriteOp => ({ record, condition: { kind: WriteConditionKind.VERSION, expected } });

const action = (ref: number, targetKey: string, status: PendingActionStatus = PendingActionStatus.PENDING): PendingAction => ({
  ref,
  type: PendingActionType.HELPER_MESSAGE,
  targetKey,
  basedOn: { kind: ActionBasisKind.NONE },
  status,
  supersededByRef: null,
  summary: `action ${ref}`,
  assumptions: [],
  createdAt: AT,
  resolvedAt: null,
  resolvedBy: null,
  resolutionNote: null,
  sourceSessionId: null,
  sourceTurnId: null,
  sourceDocId: null,
  payload: { helperId: helperIds.lupe, reason: MessageReason.OTHER, body: "hi", relatedBillId: null, relatedPeriod: null, channelHint: ContactChannel.SMS },
  version: 1,
});

const message = (messageId: string, helperId: string, minute: number): OutboundMessage => ({
  messageId,
  helperId,
  reason: MessageReason.OTHER,
  relatedBillId: null,
  relatedPeriod: null,
  body: "hi",
  deliveryMode: DeliveryMode.MANUAL_HANDOFF,
  status: MessageStatus.READY,
  channelHint: ContactChannel.SMS,
  createdByActionRef: 1,
  createdAt: at(minute),
  handedOffAt: null,
  version: 1,
});

const note = (noteId: string, helperId: string | null, minute: number): HelperNote => ({
  noteId,
  noteKind: NoteKind.REVIEW_FLAG,
  helperId,
  billId: null,
  text: "check this",
  sourceDocId: null,
  status: NoteStatus.OPEN,
  createdAt: at(minute),
  version: 1,
});

const session = (sessionId: string, minute: number): Session => ({
  sessionId,
  title: sessionId,
  createdAt: AT,
  lastActiveAt: at(minute),
  activeTurnId: null,
  version: 1,
});

const turn = (turnId: string, sessionId: string, minute: number): Turn => ({
  turnId,
  sessionId,
  status: TurnStatus.QUEUED,
  input: { text: "hi", attachmentDocIds: [] },
  replyText: null,
  proposedActionRefs: [],
  toolCalls: [],
  modelCalls: [],
  error: null,
  createdAt: at(minute),
  startedAt: null,
  finishedAt: null,
  version: 1,
});

const payment = (billId: string, helperId: string, paidOn: string): PaymentRecord => ({
  paymentId: `payment-${billId}`,
  billId,
  helperId,
  amountCents: 100,
  paidOn,
  method: PaymentMethod.VENMO,
  note: null,
  recordedAt: AT,
  version: 1,
});

const approved = (bill: Bill): Bill => ({ ...bill, status: BillStatus.APPROVED, version: bill.version + 1 });

async function expectCommitError(promise: Promise<unknown>, reason: StoreFailureReason, opIndex: number | null): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(StoreCommitError);
  expect(error).toMatchObject({ reason, opIndex });
}

export function runStoreConformance(label: string, makeStore: () => Store | Promise<Store>): void {
  describe(`Store conformance: ${label}`, () => {
    describe("reads and writes every entity", () => {
      it("round-trips each record type through its typed read", async () => {
        const store = await makeStore();
        const bill = starterPackBills[0]!;
        await store.commit([
          create({ entity: StoredEntity.HOUSEHOLD, value: starterPackHousehold }),
          create({ entity: StoredEntity.HELPER, value: starterPackHelpers[0]! }),
          create({ entity: StoredEntity.TERM, value: starterPackTerms[0]! }),
          create({ entity: StoredEntity.BILL, value: bill }),
          create({ entity: StoredEntity.ACTION, value: action(1, "MSG#a") }),
          create({ entity: StoredEntity.MESSAGE, value: message("m1", helperIds.lupe, 1) }),
          create({ entity: StoredEntity.NOTE, value: note("n1", helperIds.lupe, 1) }),
          create({ entity: StoredEntity.DOCUMENT, value: starterPackDocuments[0]! }),
          create({ entity: StoredEntity.SESSION, value: session("s1", 1) }),
          create({ entity: StoredEntity.TURN, value: turn("t1", "s1", 1) }),
          create({ entity: StoredEntity.PAYMENT, value: payment(bill.billId, bill.helperId, "2026-10-15") }),
        ]);
        expect(await store.getHousehold()).toEqual(starterPackHousehold);
        expect(await store.getHelper(starterPackHelpers[0]!.helperId)).toEqual(starterPackHelpers[0]);
        expect(await store.getTerm(starterPackTerms[0]!.termId)).toEqual(starterPackTerms[0]);
        expect(await store.getBill(bill.billId)).toEqual(bill);
        expect(await store.getAction(1)).toEqual(action(1, "MSG#a"));
        expect(await store.getMessage("m1")).toEqual(message("m1", helperIds.lupe, 1));
        expect(await store.listNotes()).toEqual([note("n1", helperIds.lupe, 1)]);
        expect(await store.getDocument(starterPackDocuments[0]!.docId)).toEqual(starterPackDocuments[0]);
        expect(await store.getSession("s1")).toEqual(session("s1", 1));
        expect(await store.getTurn("t1")).toEqual(turn("t1", "s1", 1));
        expect(await store.listPayments()).toEqual([payment(bill.billId, bill.helperId, "2026-10-15")]);
      });

      it("returns null for missing records and empty lists for an empty store", async () => {
        const store = await makeStore();
        expect(await store.getHousehold()).toBeNull();
        expect(await store.getHelper("nope")).toBeNull();
        expect(await store.getBill("nope")).toBeNull();
        expect(await store.getAction(1)).toBeNull();
        expect(await store.listHelpers()).toEqual([]);
        expect(await store.listBills()).toEqual([]);
        expect(await store.listActions()).toEqual([]);
      });

      it("hands out copies: mutating what was written or read never changes what is stored", async () => {
        const store = await makeStore();
        const helper = structuredClone(starterPackHelpers[0]!);
        await store.commit([create({ entity: StoredEntity.HELPER, value: helper })]);
        helper.name = "changed after write";
        const read = (await store.getHelper(helper.helperId))!;
        read.name = "changed after read";
        expect((await store.getHelper(helper.helperId))!.name).toBe(starterPackHelpers[0]!.name);
      });
    });

    describe("write conditions", () => {
      it("ABSENT refuses an existing record", async () => {
        const store = await makeStore();
        await store.commit([create({ entity: StoredEntity.HELPER, value: starterPackHelpers[0]! })]);
        await expectCommitError(store.commit([create({ entity: StoredEntity.HELPER, value: starterPackHelpers[0]! })]), StoreFailureReason.CONDITION_FAILED, 0);
      });

      it("VERSION writes only over the expected version, and never creates", async () => {
        const store = await makeStore();
        const priya = starterPackHelpers[0]!;
        await expectCommitError(store.commit([updateFrom(1, { entity: StoredEntity.HELPER, value: { ...priya, version: 2 } })]), StoreFailureReason.CONDITION_FAILED, 0);
        await store.commit([create({ entity: StoredEntity.HELPER, value: priya })]);
        await store.commit([updateFrom(1, { entity: StoredEntity.HELPER, value: { ...priya, notes: "v2", version: 2 } })]);
        await expectCommitError(store.commit([updateFrom(1, { entity: StoredEntity.HELPER, value: { ...priya, notes: "lost", version: 2 } })]), StoreFailureReason.CONDITION_FAILED, 0);
        expect(await store.getHelper(priya.helperId)).toMatchObject({ notes: "v2", version: 2 });
      });

      it("documents are create-only", async () => {
        const store = await makeStore();
        const doc = starterPackDocuments[0]!;
        await store.commit([create({ entity: StoredEntity.DOCUMENT, value: doc })]);
        await expectCommitError(store.commit([updateFrom(1, { entity: StoredEntity.DOCUMENT, value: doc })]), StoreFailureReason.CONDITION_FAILED, 0);
      });

      it("is atomic: one failed op applies none, and reports which op failed", async () => {
        const store = await makeStore();
        const [priya, lupe, theo] = starterPackHelpers;
        await store.commit([create({ entity: StoredEntity.HELPER, value: priya! })]);
        await expectCommitError(
          store.commit([
            create({ entity: StoredEntity.HELPER, value: lupe! }),
            create({ entity: StoredEntity.HELPER, value: theo! }),
            updateFrom(5, { entity: StoredEntity.HELPER, value: { ...priya!, version: 6 } }),
          ]),
          StoreFailureReason.CONDITION_FAILED,
          2,
        );
        expect(await store.listHelpers()).toEqual([priya]);
      });
    });

    describe("approved bills are immutable (IMMUTABLE_RECORD)", () => {
      it("allows the one write that flips RECEIVED → APPROVED", async () => {
        const store = await makeStore();
        const bill = starterPackBills[2]!;
        await store.commit([create({ entity: StoredEntity.BILL, value: bill })]);
        await store.commit([updateFrom(1, { entity: StoredEntity.BILL, value: approved(bill) })]);
        expect((await store.getBill(bill.billId))!.status).toBe(BillStatus.APPROVED);
      });

      it("refuses any later write, whatever the condition, and applies nothing else in the commit", async () => {
        const store = await makeStore();
        const bill = approved(starterPackBills[2]!);
        await store.commit([create({ entity: StoredEntity.BILL, value: bill })]);
        const edit = { ...bill, statedTotalCents: 1, version: bill.version + 1 };
        await expectCommitError(store.commit([updateFrom(bill.version, { entity: StoredEntity.BILL, value: edit })]), StoreFailureReason.IMMUTABLE_RECORD, 0);
        await expectCommitError(store.commit([create({ entity: StoredEntity.BILL, value: edit })]), StoreFailureReason.IMMUTABLE_RECORD, 0);
        await expectCommitError(
          store.commit([
            create({ entity: StoredEntity.HELPER, value: starterPackHelpers[2]! }),
            updateFrom(bill.version, { entity: StoredEntity.BILL, value: { ...edit, status: BillStatus.SUPERSEDED } }),
          ]),
          StoreFailureReason.IMMUTABLE_RECORD,
          1,
        );
        expect(await store.getBill(bill.billId)).toEqual(bill);
        expect(await store.getHelper(starterPackHelpers[2]!.helperId)).toBeNull();
      });
    });

    describe(`op limit (${STORE_MAX_OPS_PER_COMMIT} per commit, TOO_MANY_OPS)`, () => {
      const notes = (n: number) => Array.from({ length: n }, (_, i) => create({ entity: StoredEntity.NOTE, value: note(`n${i}`, null, 0) }));

      it("accepts exactly the limit", async () => {
        const store = await makeStore();
        await store.commit(notes(STORE_MAX_OPS_PER_COMMIT));
        expect(await store.listNotes()).toHaveLength(STORE_MAX_OPS_PER_COMMIT);
      });

      it("refuses one more, applying nothing", async () => {
        const store = await makeStore();
        await expectCommitError(store.commit(notes(STORE_MAX_OPS_PER_COMMIT + 1)), StoreFailureReason.TOO_MANY_OPS, null);
        expect(await store.listNotes()).toEqual([]);
      });
    });

    describe("action ref counter", () => {
      it("increases and never reuses a value, even under concurrent calls", async () => {
        const store = await makeStore();
        const first = await store.nextActionRef();
        const concurrent = await Promise.all(Array.from({ length: 20 }, () => store.nextActionRef()));
        const all = [first, ...concurrent];
        expect(new Set(all).size).toBe(all.length);
        expect(Math.min(...concurrent)).toBeGreaterThan(first);
        expect(await store.nextActionRef()).toBeGreaterThan(Math.max(...all));
      });
    });

    describe("queries: filters and order", () => {
      it("listBills filters by helper, month (of period.start) and status; orders by period.start then receivedAt", async () => {
        const store = await makeStore();
        const [priya, lupe] = starterPackBills;
        const augustLupe: Bill = { ...lupe!, billId: "lupe-aug", period: { ...lupe!.period, start: "2026-08-01", end: "2026-08-31" } };
        const laterPriya: Bill = { ...priya!, billId: "priya-sep-2", receivedAt: at(30) };
        await store.commit([laterPriya, priya!, approved(lupe!), augustLupe].map((value) => create({ entity: StoredEntity.BILL, value })));

        expect((await store.listBills()).map((b) => b.billId)).toEqual(["lupe-aug", billIds.priya, billIds.lupe, "priya-sep-2"]);
        expect((await store.listBills({ month: "2026-09" })).map((b) => b.billId)).toEqual([billIds.priya, billIds.lupe, "priya-sep-2"]);
        expect((await store.listBills({ helperId: helperIds.lupe })).map((b) => b.billId)).toEqual(["lupe-aug", billIds.lupe]);
        expect((await store.listBills({ status: BillStatus.APPROVED })).map((b) => b.billId)).toEqual([billIds.lupe]);
        expect(await store.listBills({ month: "2026-09", helperId: helperIds.lupe, status: BillStatus.RECEIVED })).toEqual([]);
      });

      it("listTerms filters by helper and orders by effectiveFrom", async () => {
        const store = await makeStore();
        await store.commit([...starterPackTerms].reverse().map((value) => create({ entity: StoredEntity.TERM, value })));
        const lupeTerms = await store.listTerms({ helperId: helperIds.lupe });
        expect(lupeTerms.map((t) => t.effectiveFrom)).toEqual([...lupeTerms.map((t) => t.effectiveFrom)].sort());
        expect(lupeTerms.every((t) => t.helperId === helperIds.lupe)).toBe(true);
        expect(await store.listTerms()).toHaveLength(starterPackTerms.length);
      });

      it("listActions filters by status and targetKey; orders by ref", async () => {
        const store = await makeStore();
        await store.commit([action(3, "A"), action(1, "A"), action(2, "B", PendingActionStatus.CONFIRMED)].map((value) => create({ entity: StoredEntity.ACTION, value })));
        expect((await store.listActions()).map((a) => a.ref)).toEqual([1, 2, 3]);
        expect((await store.listActions({ status: PendingActionStatus.PENDING })).map((a) => a.ref)).toEqual([1, 3]);
        expect((await store.listActions({ targetKey: "B" })).map((a) => a.ref)).toEqual([2]);
        expect(await store.listActions({ status: PendingActionStatus.PENDING, targetKey: "B" })).toEqual([]);
      });

      it("listPayments filters by helper and bill; orders by paidOn", async () => {
        const store = await makeStore();
        const payments = [payment("b2", helperIds.lupe, "2026-10-20"), payment("b1", helperIds.priya, "2026-10-02"), payment("b3", helperIds.lupe, "2026-10-05")];
        await store.commit(payments.map((value) => create({ entity: StoredEntity.PAYMENT, value })));
        expect((await store.listPayments()).map((p) => p.billId)).toEqual(["b1", "b3", "b2"]);
        expect((await store.listPayments({ helperId: helperIds.lupe })).map((p) => p.billId)).toEqual(["b3", "b2"]);
        expect((await store.listPayments({ billId: "b2" })).map((p) => p.billId)).toEqual(["b2"]);
      });

      it("sessions: most recently active first; turns: a session's, oldest first", async () => {
        const store = await makeStore();
        await store.commit([
          create({ entity: StoredEntity.SESSION, value: session("old", 1) }),
          create({ entity: StoredEntity.SESSION, value: session("new", 9) }),
          create({ entity: StoredEntity.TURN, value: turn("t2", "new", 5) }),
          create({ entity: StoredEntity.TURN, value: turn("t1", "new", 2) }),
          create({ entity: StoredEntity.TURN, value: turn("tx", "old", 3) }),
        ]);
        expect((await store.listSessions()).map((s) => s.sessionId)).toEqual(["new", "old"]);
        expect((await store.listTurns("new")).map((t) => t.turnId)).toEqual(["t1", "t2"]);
      });

      it("helpers, messages and notes filter by helper", async () => {
        const store = await makeStore();
        await store.commit([
          ...starterPackHelpers.map((value) => create({ entity: StoredEntity.HELPER, value })),
          create({ entity: StoredEntity.MESSAGE, value: message("m2", helperIds.lupe, 2) }),
          create({ entity: StoredEntity.MESSAGE, value: message("m1", helperIds.priya, 1) }),
          create({ entity: StoredEntity.NOTE, value: note("n1", helperIds.lupe, 1) }),
          create({ entity: StoredEntity.NOTE, value: note("n2", null, 2) }),
        ]);
        expect(await store.listHelpers()).toHaveLength(starterPackHelpers.length);
        expect((await store.listMessages()).map((m) => m.messageId)).toEqual(["m1", "m2"]);
        expect((await store.listMessages({ helperId: helperIds.lupe })).map((m) => m.messageId)).toEqual(["m2"]);
        expect((await store.listNotes({ helperId: helperIds.lupe })).map((n) => n.noteId)).toEqual(["n1"]);
      });
    });
  });
}
