/**
 * Checker edge cases beyond the answer key: each one is a place where a guess
 * would be easy and wrong.
 */
import { describe, expect, it } from "vitest";
import {
  BillFindingKind,
  BillVerdict,
  DayOfWeek,
  LineCauseKind,
  LineKind,
  LineStatus,
  MultiplierScope,
  PricingRuleKind,
  RateVersionRelation,
} from "@helper-assistant/domain";
import type { AgreementTerm, Bill, LineItem, PricingRule } from "@helper-assistant/domain";
import { starterPackBills, starterPackTerms, termIds } from "@helper-assistant/fixtures";
import { checkBill } from "../src/index";

const priyaBill = starterPackBills[0]!;
const lupeBill = starterPackBills[1]!;
const priyaTerms = starterPackTerms.filter((t) => t.helperId === priyaBill.helperId);
const lupeTerms = starterPackTerms.filter((t) => t.helperId === lupeBill.helperId);
const standard = priyaTerms.find((t) => t.termId === termIds.priyaStandard)!;

const line = (overrides: Partial<LineItem>): LineItem => ({ ...priyaBill.lineItems[1]!, lineId: "x1", ...overrides });
const billWith = (base: Bill, lineItems: LineItem[], statedTotalCents: number | null = null): Bill => ({ ...base, lineItems, statedTotalCents });
const check = (bill: Bill, terms: readonly AgreementTerm[]) => checkBill({ bill, terms, approvedOverlappingBillId: null, checkedAt: "2026-10-14T12:00:00.000Z" });
const withRules = (term: AgreementTerm, pricingRules: PricingRule[]): AgreementTerm => ({ ...term, pricingRules });

describe("timed pricing", () => {
  it("keeps the after-10pm rate past midnight", () => {
    const late = line({ serviceDate: "2026-09-12", startAt: "2026-09-12T21:00", endAt: "2026-09-13T01:00", amountBilledCents: 2200 + 3 * 2800 });
    const [result] = check(billWith(priyaBill, [late]), priyaTerms).lineChecks;
    expect(result).toMatchObject({ status: LineStatus.MATCHES, expectedCents: 10600 });
  });

  it("applies a Sunday multiplier only to hours that fall on Sunday", () => {
    // Sat 9pm → Sun 1am: Sat 21–22 base, Sat 22–24 late, Sun 0–1 late (BASE_RATE scope: late rate not multiplied).
    const overnight = line({ serviceDate: "2026-09-19", startAt: "2026-09-19T21:00", endAt: "2026-09-20T01:00", amountBilledCents: 0 });
    const [result] = check(billWith(priyaBill, [overnight]), priyaTerms).lineChecks;
    expect(result!.expectedCents).toBe(2200 + 2 * 2800 + 2800);
  });

  it("returns CANNOT_COMPUTE where the readings of an UNSPECIFIED multiplier disagree, and computes where they agree", () => {
    const unspecified = withRules(standard, [
      { kind: PricingRuleKind.HOURLY, amountCents: 2200 },
      { kind: PricingRuleKind.HOURLY_AFTER, afterTime: "22:00", amountCents: 2800 },
      { kind: PricingRuleKind.DAY_MULTIPLIER, dayOfWeek: DayOfWeek.SUN, multiplier: 1.5, appliesTo: MultiplierScope.UNSPECIFIED },
    ]);
    const sundayDay = line({ serviceDate: "2026-09-20", startAt: "2026-09-20T10:00", endAt: "2026-09-20T14:00", amountBilledCents: 13200 });
    const sundayLate = line({ lineId: "x2", serviceDate: "2026-09-20", startAt: "2026-09-20T21:00", endAt: "2026-09-20T23:00", amountBilledCents: 1 });
    const result = check(billWith(priyaBill, [sundayDay, sundayLate]), [unspecified]);
    expect(result.lineChecks.map((l) => l.status)).toEqual([LineStatus.MATCHES, LineStatus.CANNOT_COMPUTE]);
    expect(result.verdict).toBe(BillVerdict.NEEDS_INFO);
    expect(result.agreedTotalCents).toBeNull();
  });

  it("can't price time past a flat block without a rate after it", () => {
    const dateNight = priyaTerms.find((t) => t.termId === termIds.priyaDateNight)!;
    const blockOnly = withRules(dateNight, [{ kind: PricingRuleKind.FLAT_BLOCK, amountCents: 10000, untilTime: "23:00" }]);
    const [result] = check(billWith(priyaBill, [priyaBill.lineItems[0]!]), [blockOnly]).lineChecks;
    expect(result!.status).toBe(LineStatus.CANNOT_COMPUTE);
    expect(result!.explanation).toMatch(/23:00/);
  });

  it("can't price an hourly line with no times", () => {
    const untimed = line({ startAt: null, endAt: null });
    expect(check(billWith(priyaBill, [untimed]), priyaTerms).lineChecks[0]!.status).toBe(LineStatus.CANNOT_COMPUTE);
  });
});

describe("coverage", () => {
  it("a line with no serviceKey is CANNOT_COMPUTE, never matched to a guess", () => {
    const [result] = check(billWith(priyaBill, [line({ serviceKey: null })]), priyaTerms).lineChecks;
    expect(result!.status).toBe(LineStatus.CANNOT_COMPUTE);
  });

  it("a serviceKey the helper has no term for is NOT_COVERED, with a NO_AGREEMENT_FOR_SERVICE finding", () => {
    const result = check(billWith(priyaBill, [line({ serviceKey: "tutoring", label: "homework help" })]), priyaTerms);
    expect(result.lineChecks[0]!.status).toBe(LineStatus.NOT_COVERED);
    expect(result.findings).toContainEqual(expect.objectContaining({ kind: BillFindingKind.NO_AGREEMENT_FOR_SERVICE, serviceKey: "tutoring" }));
    expect(result.agreedTotalCents).toBe(0);
  });

  it("a line dated before the earliest version of its term is priced by that version (the first rate is assumed to have always applied)", () => {
    const early = line({ serviceDate: "2026-06-01", startAt: "2026-06-01T15:00", endAt: "2026-06-01T19:00" });
    expect(check(billWith(priyaBill, [early]), priyaTerms).lineChecks[0]).toMatchObject({ status: LineStatus.MATCHES, appliedTermIds: [standard.termId] });
  });

  it("only the earliest version reaches back: a later version still starts on its own date", () => {
    const beforeEverything = { ...lupeBill.lineItems[0]!, serviceDate: "2025-12-02" };
    const [result] = check(billWith(lupeBill, [beforeEverything]), lupeTerms).lineChecks;
    expect(result!.appliedTermIds).toEqual([termIds.lupeRegular140]);
  });

  it("an undated line in a period where the rate changed is CANNOT_COMPUTE", () => {
    const undated = { ...lupeBill.lineItems[0]!, serviceDate: null };
    const [result] = check(billWith(lupeBill, [undated]), lupeTerms).lineChecks;
    expect(result!.status).toBe(LineStatus.CANNOT_COMPUTE);
  });

  it("reimbursements are UNVERIFIABLE (INFO) and leave the agreed total unknown", () => {
    const pizza = line({ lineKind: LineKind.REIMBURSEMENT, serviceKey: null, label: "pizza", amountBilledCents: 1800 });
    const result = check(billWith(priyaBill, [priyaBill.lineItems[1]!, pizza]), priyaTerms);
    expect(result.lineChecks[1]!.status).toBe(LineStatus.UNVERIFIABLE);
    expect(result.verdict).toBe(BillVerdict.CHECKS_OUT);
    expect(result.agreedTotalCents).toBeNull();
  });

  it("an agreed fee with the same label matches", () => {
    const withFee = withRules(standard, [...standard.pricingRules, { kind: PricingRuleKind.FEE, label: "Last minute fee", amountCents: 4000, condition: "same-day booking" }]);
    const result = check(billWith(priyaBill, priyaBill.lineItems.slice(3, 5)), [withFee]);
    expect(result.lineChecks[1]).toMatchObject({ status: LineStatus.MATCHES, expectedCents: 4000, appliedTermIds: [standard.termId] });
    expect(result.lineChecks[1]!.assumptions.join(" ")).toMatch(/same-day booking/);
  });
});

describe("bill-level findings", () => {
  it("flags duplicates, lines outside the period and an approved overlapping bill", () => {
    const sep9 = priyaBill.lineItems[1]!;
    const october = line({ lineId: "x3", serviceDate: "2026-10-02", startAt: "2026-10-02T15:00", endAt: "2026-10-02T19:00" });
    const bill = billWith(priyaBill, [sep9, { ...sep9, lineId: "dup" }, october]);
    const result = checkBill({ bill, terms: priyaTerms, approvedOverlappingBillId: "bill-old", checkedAt: "2026-10-14T12:00:00.000Z" });
    const kinds = result.findings.map((f) => f.kind);
    expect(kinds).toEqual(expect.arrayContaining([BillFindingKind.DUPLICATE_LINE, BillFindingKind.LINE_OUTSIDE_PERIOD, BillFindingKind.PERIOD_ALREADY_APPROVED]));
    expect(result.verdict).toBe(BillVerdict.DISCREPANCIES);
  });

  it("notes a visit on a day outside the usual schedule, as INFO only", () => {
    const wednesday = { ...lupeBill.lineItems[2]!, serviceDate: "2026-09-16" };
    const result = check(billWith(lupeBill, [wednesday]), lupeTerms);
    expect(result.findings).toContainEqual(expect.objectContaining({ kind: BillFindingKind.SCHEDULE_PLAUSIBILITY, usualDays: [DayOfWeek.TUE] }));
    expect(result.verdict).toBe(BillVerdict.CHECKS_OUT);
  });

  it("counts a deep clean in place of a regular visit toward the usual schedule", () => {
    const result = check(lupeBill, lupeTerms);
    expect(result.findings.map((f) => f.kind)).not.toContain(BillFindingKind.OCCURRENCE_COUNT_PLAUSIBILITY);
    const fourVisits = check(billWith(lupeBill, lupeBill.lineItems.slice(0, 4)), lupeTerms);
    expect(fourVisits.findings).toContainEqual(expect.objectContaining({ kind: BillFindingKind.OCCURRENCE_COUNT_PLAUSIBILITY, billedCount: 4, scheduledCount: 5 }));
  });
});

describe("likely cause", () => {
  it("Lupe's Sep 1 and Sep 8 visits were billed at the new $150 rate before it started (Sep 15)", () => {
    const result = check(lupeBill, lupeTerms);
    const early = result.lineChecks.filter((l) => l.status === LineStatus.DIFFERS);
    expect(early).toHaveLength(2);
    for (const line of early) {
      expect(line.likelyCause).toEqual({
        kind: LineCauseKind.RATE_FROM_OTHER_PERIOD,
        termId: termIds.lupeRegular150,
        relation: RateVersionRelation.LATER,
        effectiveFrom: "2026-09-15",
        effectiveTo: null,
      });
      expect(line.explanation).toContain("only starts Sep 15");
    }
    expect(result.lineChecks.filter((l) => l.status === LineStatus.MATCHES).every((l) => l.likelyCause === null)).toBe(true);
  });

  it("a difference no other version explains has no cause", () => {
    const odd = { ...lupeBill.lineItems[0]!, amountBilledCents: 14500 };
    expect(check(billWith(lupeBill, [odd]), lupeTerms).lineChecks[0]).toMatchObject({ status: LineStatus.DIFFERS, likelyCause: null });
  });
});
