/**
 * The checker against the starter-pack answer key (Doc 4 §6.2). The key is the
 * oracle: if this fails, the checker is wrong (or the key is, and that's reported,
 * never patched here).
 */
import { describe, expect, it } from "vitest";
import { BILL_FINDING_SEVERITY, BillFindingKind, FindingSeverity } from "@helper-assistant/domain";
import type { BillCheck } from "@helper-assistant/domain";
import {
  expectedBillChecks,
  expectedTheoOccurrenceCount,
  starterPackBills,
  starterPackTerms,
  STARTER_PACK_TODAY,
} from "@helper-assistant/fixtures";
import { checkBill } from "../src/index";

const checkStarterBill = (billId: string): BillCheck => {
  const bill = starterPackBills.find((b) => b.billId === billId)!;
  const terms = starterPackTerms.filter((t) => t.helperId === bill.helperId);
  return checkBill({ bill, terms, approvedOverlappingBillId: null, checkedAt: `${STARTER_PACK_TODAY}T12:00:00.000Z` });
};

describe("checkBill on the starter pack", () => {
  for (const expected of expectedBillChecks) {
    describe(expected.billId, () => {
      const check = checkStarterBill(expected.billId);

      it("has the expected verdict and totals", () => {
        expect(check.verdict).toBe(expected.verdict);
        expect(check.statedTotalCents).toBe(expected.statedTotalCents);
        expect(check.sumOfLinesCents).toBe(expected.sumOfLinesCents);
        expect(check.agreedTotalCents).toBe(expected.agreedTotalCents);
      });

      it("has the expected line statuses and amounts", () => {
        expect(check.lineChecks.map((l) => ({ lineId: l.lineId, status: l.status, expectedCents: l.expectedCents }))).toEqual(expected.lines);
      });

      it("has exactly the expected blocking findings, and the required INFO ones", () => {
        const blocking = check.findings.filter((f) => BILL_FINDING_SEVERITY[f.kind] !== FindingSeverity.INFO).map((f) => f.kind);
        expect(blocking.sort()).toEqual([...expected.blockingFindingKinds].sort());
        const info = check.findings.map((f) => f.kind);
        for (const kind of expected.requiredInfoFindingKinds) expect(info).toContain(kind);
      });

      it("explains every line and pins the term versions it used", () => {
        for (const line of check.lineChecks) expect(line.explanation).not.toBe("");
        const applied = new Set(check.lineChecks.flatMap((l) => l.appliedTermIds));
        expect(new Set(check.termVersions.map((t) => t.termId))).toEqual(applied);
      });
    });
  }

  it("counts Theo's walks against 22 weekdays (no holiday calendar)", () => {
    const check = checkStarterBill(expectedBillChecks[2]!.billId);
    const count = check.findings.find((f) => f.kind === BillFindingKind.OCCURRENCE_COUNT_PLAUSIBILITY);
    expect(count).toMatchObject(expectedTheoOccurrenceCount);
  });

  it("shows the worked example's arithmetic for Priya 9/4 (Doc 3 §3.4)", () => {
    const sep4 = checkStarterBill(expectedBillChecks[0]!.billId).lineChecks[0]!;
    expect(sep4.breakdown).toEqual([
      { description: "Flat $100 until 23:00", amountCents: 10000 },
      { description: "0.5h × $28/hr after 23:00", amountCents: 1400 },
    ]);
  });
});
