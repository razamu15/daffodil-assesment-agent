import { describe, expect, it } from "vitest";
import {
  BillingPeriodState,
  BillPeriodKind,
  HelperStatus,
  MessageReason,
  PaymentMethod,
  StoredEntity,
  WriteConditionKind,
} from "@helper-assistant/domain";
import { billIds, expectedSeptemberMonthStatus, helperIds, starterPackHelpers } from "@helper-assistant/fixtures";
import {
  approveBill,
  confirmAction,
  getMonthStatus,
  markMessageHandedOff,
  proposeHelperMessage,
  recordPayment,
} from "../src/index";
import { starterPackDeps, testSource } from "./harness";

describe("month status", () => {
  it("matches the answer key for September on Oct 14", async () => {
    const deps = await starterPackDeps();
    const status = await getMonthStatus(deps, "2026-09");
    expect(status.asOf).toBe("2026-10-14");
    const rows = status.rows.map(({ helperId, state, billId, verdict }) => ({ helperId, state, billId, verdict }));
    expect(rows).toEqual(expect.arrayContaining(expectedSeptemberMonthStatus));
    expect(rows).toHaveLength(expectedSeptemberMonthStatus.length);
  });

  it("counts the things to look at and shows what was billed", async () => {
    const deps = await starterPackDeps();
    const priya = (await getMonthStatus(deps, "2026-09")).rows.find((r) => r.helperId === helperIds.priya)!;
    // The uncovered $40 fee and the stated-total mismatch ("⚠ 2 things to look at").
    expect(priya.attentionCount).toBe(2);
    expect(priya.billedCents).toBe(62600);
  });

  it("October opens with no bills: everyone NOT_RECEIVED", async () => {
    const deps = await starterPackDeps();
    const october = await getMonthStatus(deps, "2026-10");
    expect(october.rows.map((r) => r.state)).toEqual([
      BillingPeriodState.NOT_RECEIVED,
      BillingPeriodState.NOT_RECEIVED,
      BillingPeriodState.NOT_RECEIVED,
    ]);
    expect(october.rows[0]!.period).toEqual({ start: "2026-10-01", end: "2026-10-31", kind: BillPeriodKind.CALENDAR_MONTH });
  });

  it("goes APPROVED, then PAID with the paid date", async () => {
    const deps = await starterPackDeps();
    await approveBill(deps, { billId: billIds.theo, billVersion: 1, acceptedExceptions: [] });
    const theoRow = async () => (await getMonthStatus(deps, "2026-09")).rows.find((r) => r.helperId === helperIds.theo)!;
    expect((await theoRow()).state).toBe(BillingPeriodState.APPROVED);
    await recordPayment(deps, billIds.theo, { paidOn: "2026-10-15", method: PaymentMethod.VENMO, note: null });
    expect(await theoRow()).toMatchObject({ state: BillingPeriodState.PAID, paidOn: "2026-10-15" });
  });

  it("shows when the helper was asked about the period", async () => {
    const deps = await starterPackDeps();
    const proposed = await proposeHelperMessage(
      deps,
      { helperId: helperIds.lupe, reason: MessageReason.DISCREPANCY, body: "Hi Lupe, Sep 1 and 8 show $150...", relatedBillId: billIds.lupe, relatedPeriod: null },
      testSource,
    );
    await confirmAction(deps, { ref: proposed.action.ref, actionVersion: 1, messageBody: null });
    const lupeRow = async () => (await getMonthStatus(deps, "2026-09")).rows.find((r) => r.helperId === helperIds.lupe)!;
    expect((await lupeRow()).askedHelperAt).toBeNull();
    const [message] = await deps.store.listMessages({ helperId: helperIds.lupe });
    await markMessageHandedOff(deps, message!.messageId);
    expect((await lupeRow()).askedHelperAt).toBe(deps.clock.now());
  });

  it("leaves out helpers who ended before the month", async () => {
    const deps = await starterPackDeps();
    const lupe = starterPackHelpers[1]!;
    await deps.store.commit([
      {
        record: { entity: StoredEntity.HELPER, value: { ...lupe, status: HelperStatus.ENDED, endedOn: "2026-08-31", version: 2 } },
        condition: { kind: WriteConditionKind.VERSION, expected: 1 },
      },
    ]);
    const september = await getMonthStatus(deps, "2026-09");
    expect(september.rows.map((r) => r.helperId)).not.toContain(helperIds.lupe);
  });
});
