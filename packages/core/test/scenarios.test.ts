/**
 * Doc 4 §6.4 scenario rows that are pure core (no model): corrected bills,
 * approval, engagement end, conflicting proposals, and STALE on confirm.
 */
import { describe, expect, it } from "vitest";
import {
  ActionResolver,
  AgreementChangeKind,
  BillableUnit,
  BillFindingKind,
  BillingPeriodState,
  BillPeriodKind,
  BillStatus,
  BillVerdict,
  DayOfWeek,
  ExceptionTarget,
  HelperStatus,
  LineKind,
  LineStatus,
  PendingActionStatus,
  PricingRuleKind,
  ProposeOutcome,
  ScheduleKind,
} from "@helper-assistant/domain";
import type { ToolInput } from "@helper-assistant/domain";
import { billIds, docIds, helperIds, priyaLineIds, SEPTEMBER_2026, serviceKeys, termIds } from "@helper-assistant/fixtures";
import {
  approveBill,
  confirmAction,
  CoreErrorCode,
  getMonthStatus,
  proposeAgreementChange,
  proposeBillApproval,
  proposeEngagementEnd,
  recordBill,
} from "../src/index";
import { starterPackDeps, testSource } from "./harness";

const visit = (date: string, serviceKey: string, cents: number): ToolInput<"record_bill">["lineItems"][number] => ({
  lineKind: LineKind.SERVICE,
  serviceKey,
  label: date,
  serviceDate: date,
  startAt: null,
  endAt: null,
  quantity: 1,
  unit: BillableUnit.VISIT,
  unitPriceBilledCents: null,
  amountBilledCents: cents,
  authorizationClaim: null,
  sourceQuote: `${date} – ${cents / 100}`,
  relatedLineIndex: null,
});

const correctedLupeBill: ToolInput<"record_bill"> = {
  docId: docIds.lupeBill,
  helperId: helperIds.lupe,
  period: SEPTEMBER_2026,
  lineItems: [
    visit("2026-09-01", serviceKeys.lupeRegular, 14000),
    visit("2026-09-08", serviceKeys.lupeRegular, 14000),
    visit("2026-09-15", serviceKeys.lupeRegular, 15000),
    visit("2026-09-22", serviceKeys.lupeDeep, 22000),
    visit("2026-09-29", serviceKeys.lupeRegular, 15000),
  ],
  statedTotalCents: 80000,
  extractionAssumptions: [],
  helperRemarks: [],
};

const lupeRateChange = (cents: number) => ({
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
      sourceQuote: `regular visit will be $${cents / 100}`,
      assumptions: [],
    },
  },
  sourceDocId: null,
});

describe("corrected bills", () => {
  it("a corrected Lupe bill ($800) supersedes the old one and checks out", async () => {
    const deps = await starterPackDeps();
    const pendingApproval = await proposeBillApproval(
      deps,
      {
        billId: billIds.lupe,
        acceptedExceptions: ["lupe-l1", "lupe-l2"].map((lineId) => ({ target: ExceptionTarget.LINE, lineId, reason: "test" })),
      },
      testSource,
    );

    const { bill, check, supersededBillId } = await recordBill(deps, correctedLupeBill);
    expect(supersededBillId).toBe(billIds.lupe);
    expect(bill).toMatchObject({ status: BillStatus.RECEIVED, supersedesBillId: billIds.lupe, latestCheck: check });
    expect(check.verdict).toBe(BillVerdict.CHECKS_OUT);

    const old = (await deps.store.getBill(billIds.lupe))!;
    expect(old).toMatchObject({ status: BillStatus.SUPERSEDED, supersededByBillId: bill.billId, version: 2 });
    expect((await deps.store.getAction(pendingApproval.action.ref))!.status).toBe(PendingActionStatus.SUPERSEDED);

    const lupeRow = (await getMonthStatus(deps, "2026-09")).rows.find((r) => r.helperId === helperIds.lupe)!;
    expect(lupeRow).toMatchObject({ billId: bill.billId, state: BillingPeriodState.CHECKED_OK, billedCents: 80000 });
  });

  it("a corrected bill for an approved period is refused (PERIOD_ALREADY_APPROVED), not saved", async () => {
    const deps = await starterPackDeps();
    await approveBill(deps, { billId: billIds.theo, billVersion: 1, acceptedExceptions: [] });
    const before = await deps.store.listBills();
    const theoBill = (await deps.store.getBill(billIds.theo))!;
    const rebill: ToolInput<"record_bill"> = {
      docId: docIds.theoBill,
      helperId: helperIds.theo,
      period: SEPTEMBER_2026,
      lineItems: theoBill.lineItems.map(({ lineId: _id, relatedLineId: _rel, ...line }) => ({ ...line, relatedLineIndex: null })),
      statedTotalCents: 58000,
      extractionAssumptions: [],
      helperRemarks: [],
    };
    await expect(recordBill(deps, rebill)).rejects.toMatchObject({ code: CoreErrorCode.PERIOD_ALREADY_APPROVED, relatedId: billIds.theo });
    expect(await deps.store.listBills()).toEqual(before);
  });

  it("links a fee to the line it hangs off, by index", async () => {
    const deps = await starterPackDeps({ withBills: false });
    const priyaFeeOnly: ToolInput<"record_bill"> = {
      ...correctedLupeBill,
      docId: docIds.priyaBill,
      helperId: helperIds.priya,
      lineItems: [
        { ...visit("2026-09-20", serviceKeys.priyaStandard, 13200), unit: BillableUnit.HOUR, quantity: 4, startAt: "2026-09-20T10:00", endAt: "2026-09-20T14:00" },
        { ...visit("2026-09-20", "x", 4000), lineKind: LineKind.FEE, serviceKey: null, label: "last minute fee", quantity: null, unit: null, relatedLineIndex: 0 },
      ],
      statedTotalCents: 17200,
    };
    const { bill, check } = await recordBill(deps, priyaFeeOnly);
    expect(bill.lineItems[1]!.relatedLineId).toBe(bill.lineItems[0]!.lineId);
    expect(check.lineChecks.map((l) => l.status)).toEqual([LineStatus.MATCHES, LineStatus.NOT_COVERED]);
    await expect(recordBill(deps, { ...priyaFeeOnly, lineItems: [{ ...priyaFeeOnly.lineItems[1]!, relatedLineIndex: 0 }] })).rejects.toMatchObject({
      code: CoreErrorCode.NOT_ALLOWED,
    });
  });
});

describe("approval", () => {
  it("approving Theo twice: the second is refused (BILL_NOT_APPROVABLE)", async () => {
    const deps = await starterPackDeps();
    const first = await approveBill(deps, { billId: billIds.theo, billVersion: 1, acceptedExceptions: [] });
    expect(first.action.status).toBe(PendingActionStatus.CONFIRMED);
    expect(first.bill).toMatchObject({ status: BillStatus.APPROVED, version: 2 });
    expect(first.bill.approval).toMatchObject({ amountApprovedCents: 58000, billedCents: 58000, viaActionRef: first.action.ref });
    await expect(approveBill(deps, { billId: billIds.theo, billVersion: 1, acceptedExceptions: [] })).rejects.toMatchObject({
      code: CoreErrorCode.BILL_NOT_APPROVABLE,
    });
  });

  it("two chat proposals to approve the same bill: the second confirm is STALE", async () => {
    const deps = await starterPackDeps();
    const a = await proposeBillApproval(deps, { billId: billIds.theo, acceptedExceptions: [] }, testSource);
    const b = await proposeBillApproval(deps, { billId: billIds.theo, acceptedExceptions: [] }, testSource);
    expect(b.outcome).toBe(ProposeOutcome.NEEDS_DECISION);
    expect(b.conflicts.map((c) => c.ref)).toEqual([a.action.ref]);
    expect((await confirmAction(deps, { ref: a.action.ref, actionVersion: 1, messageBody: null })).status).toBe(PendingActionStatus.CONFIRMED);
    const second = await confirmAction(deps, { ref: b.action.ref, actionVersion: 1, messageBody: null });
    expect(second).toMatchObject({ status: PendingActionStatus.STALE, resolvedBy: ActionResolver.SYSTEM });
    expect(second.resolutionNote).toMatch(/changed/);
  });

  it("a flagged bill needs every flag accepted, with a reason, before it can be proposed", async () => {
    const deps = await starterPackDeps();
    await expect(proposeBillApproval(deps, { billId: billIds.priya, acceptedExceptions: [] }, testSource)).rejects.toMatchObject({
      code: CoreErrorCode.NOT_ALLOWED,
    });
    const accepted = [
      { target: ExceptionTarget.LINE, lineId: priyaLineIds.fee, reason: "Talked to Priya; Sam did OK the same-day fee." },
      { target: ExceptionTarget.FINDING, findingKind: BillFindingKind.TOTAL_MISMATCH, reason: "Priya mis-added the total." },
    ];
    const { bill } = await approveBill(deps, { billId: billIds.priya, billVersion: 1, acceptedExceptions: accepted });
    // The stated $626 is never trusted: approval is the sum of the lines.
    expect(bill.approval).toMatchObject({ acceptedExceptions: accepted, amountApprovedCents: 59600, billedCents: 62600 });
  });

  it("a term change after the proposal makes the approval STALE", async () => {
    const deps = await starterPackDeps();
    const accepted = ["lupe-l1", "lupe-l2"].map((lineId) => ({ target: ExceptionTarget.LINE, lineId, reason: "fine" }));
    const approval = await proposeBillApproval(deps, { billId: billIds.lupe, acceptedExceptions: accepted }, testSource);
    // Ending the deep-clean term on Sep 21 re-checks Lupe's open bill (its version moves).
    const change = await proposeAgreementChange(
      deps,
      {
        change: { change: AgreementChangeKind.END_TERM, termId: termIds.lupeDeep, effectiveTo: "2026-09-21" },
        sourceDocId: null,
      },
      testSource,
    );
    await confirmAction(deps, { ref: change.action.ref, actionVersion: 1, messageBody: null });
    const lupeBill = (await deps.store.getBill(billIds.lupe))!;
    expect(lupeBill.version).toBe(2);
    expect(lupeBill.latestCheck!.lineChecks[3]!.status).toBe(LineStatus.NOT_COVERED);
    const result = await confirmAction(deps, { ref: approval.action.ref, actionVersion: 1, messageBody: null });
    expect(result.status).toBe(PendingActionStatus.STALE);
    expect((await deps.store.getBill(billIds.lupe))!.status).toBe(BillStatus.RECEIVED);
  });
});

describe("agreement changes", () => {
  it("two tabs propose different Lupe rates: the second confirm is STALE", async () => {
    const deps = await starterPackDeps();
    const first = await proposeAgreementChange(deps, lupeRateChange(15500), testSource);
    const second = await proposeAgreementChange(deps, lupeRateChange(16000), testSource);
    expect(first.outcome).toBe(ProposeOutcome.PROPOSED);
    expect(second).toMatchObject({ outcome: ProposeOutcome.NEEDS_DECISION, conflicts: [first.action] });
    expect(first.action.summary).toBe("Lupe: Regular cleaning $150/visit → $155/visit from 2026-11-01");

    expect((await confirmAction(deps, { ref: first.action.ref, actionVersion: 1, messageBody: null })).status).toBe(PendingActionStatus.CONFIRMED);
    const regular = (await deps.store.listTerms({ helperId: helperIds.lupe })).filter((t) => t.serviceKey === serviceKeys.lupeRegular);
    expect(regular.map((t) => [t.termId, t.effectiveFrom, t.effectiveTo, t.version])).toEqual([
      [termIds.lupeRegular140, "2026-01-14", "2026-09-14", 2],
      [termIds.lupeRegular150, "2026-09-15", "2026-10-31", 2],
      [expect.any(String), "2026-11-01", null, 1],
    ]);
    expect(regular[2]).toMatchObject({ supersedesTermId: termIds.lupeRegular150, createdByActionRef: first.action.ref });

    const stale = await confirmAction(deps, { ref: second.action.ref, actionVersion: 1, messageBody: null });
    expect(stale.status).toBe(PendingActionStatus.STALE);
    expect(await deps.store.listTerms({ helperId: helperIds.lupe })).toHaveLength(4);
  });

  it("refuses an ADD_TERM over an occupied slot and a REPLACE of a closed version", async () => {
    const deps = await starterPackDeps();
    const add = { ...lupeRateChange(15500), change: { change: AgreementChangeKind.ADD_TERM, term: lupeRateChange(15500).change.term } };
    await expect(proposeAgreementChange(deps, add, testSource)).rejects.toMatchObject({ code: CoreErrorCode.NOT_ALLOWED });
    const replaceOld = { ...lupeRateChange(15500), change: { ...lupeRateChange(15500).change, supersedesTermId: termIds.lupeRegular140 } };
    await expect(proposeAgreementChange(deps, replaceOld, testSource)).rejects.toMatchObject({ code: CoreErrorCode.NOT_ALLOWED });
  });
});

describe("an earlier rate (ADD_EARLIER_TERM)", () => {
  const earlierPriyaRate = (currentTermId: string, effectiveTo: string | null) => ({
    change: {
      change: AgreementChangeKind.ADD_EARLIER_TERM,
      currentTermId,
      term: {
        helperId: helperIds.priya,
        serviceKey: serviceKeys.priyaStandard,
        serviceLabel: "Babysitting",
        pricingRules: [{ kind: PricingRuleKind.HOURLY, amountCents: 2000 }],
        schedule: { kind: ScheduleKind.AD_HOC },
        effectiveFrom: "2026-01-01",
        effectiveTo,
        sourceDocId: docIds.householdNotes,
        sourceQuote: "Priya was $20/hr until June",
        assumptions: [],
      },
    },
    sourceDocId: null,
  });

  it("adds the earlier rate and moves the current rate's start to the day after it ends", async () => {
    const deps = await starterPackDeps();
    const proposal = await proposeAgreementChange(deps, earlierPriyaRate(termIds.priyaStandard, "2026-05-31"), testSource);
    expect(proposal.action.summary).toContain("$20/hr until 2026-05-31");
    expect((await confirmAction(deps, { ref: proposal.action.ref, actionVersion: 1, messageBody: null })).status).toBe(PendingActionStatus.CONFIRMED);

    const standard = (await deps.store.listTerms({ helperId: helperIds.priya })).filter((t) => t.serviceKey === serviceKeys.priyaStandard);
    expect(standard.map((t) => [t.effectiveFrom, t.effectiveTo, t.version])).toEqual(
      expect.arrayContaining([
        ["2026-01-01", "2026-05-31", 1],
        ["2026-06-01", null, 2],
      ]),
    );
  });

  it("refuses an earlier rate with no end, or one placed before a version that isn't the earliest", async () => {
    const deps = await starterPackDeps();
    await expect(proposeAgreementChange(deps, earlierPriyaRate(termIds.priyaStandard, null), testSource)).rejects.toMatchObject({ code: CoreErrorCode.NOT_ALLOWED });
    const lupe = earlierPriyaRate(termIds.lupeRegular150, "2026-01-01");
    const notEarliest = { ...lupe, change: { ...lupe.change, term: { ...lupe.change.term, helperId: helperIds.lupe, serviceKey: serviceKeys.lupeRegular } } };
    await expect(proposeAgreementChange(deps, notEarliest, testSource)).rejects.toMatchObject({ code: CoreErrorCode.NOT_ALLOWED });
  });
});

describe("engagement end", () => {
  it("ending Lupe on Oct 14 reminds about the key and expects a final bill for Oct 1–14", async () => {
    const deps = await starterPackDeps();
    const proposal = await proposeEngagementEnd(deps, { helperId: helperIds.lupe, endedOn: "2026-10-14" }, testSource);
    expect(proposal.reminders).toEqual(["Lupe has a key to the house."]);
    expect(proposal.action.payload).toMatchObject({ finalPeriod: { start: "2026-10-01", end: "2026-10-14", kind: BillPeriodKind.FINAL_SETTLEMENT } });

    await confirmAction(deps, { ref: proposal.action.ref, actionVersion: 1, messageBody: null });
    expect(await deps.store.getHelper(helperIds.lupe)).toMatchObject({ status: HelperStatus.ENDED, endedOn: "2026-10-14", version: 2 });
    const october = await getMonthStatus(deps, "2026-10");
    expect(october.rows.find((r) => r.helperId === helperIds.lupe)).toMatchObject({
      helperStatus: HelperStatus.ENDED,
      period: { start: "2026-10-01", end: "2026-10-14", kind: BillPeriodKind.FINAL_SETTLEMENT },
      state: BillingPeriodState.NOT_RECEIVED,
    });
    await expect(proposeEngagementEnd(deps, { helperId: helperIds.lupe, endedOn: "2026-10-20" }, testSource)).rejects.toMatchObject({
      code: CoreErrorCode.NOT_ALLOWED,
    });
  });
});
