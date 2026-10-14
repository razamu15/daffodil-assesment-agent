/**
 * The answer key (Doc 4 §6.2): expected checkBill results for the starter pack,
 * and the expected month status on Oct 14. If the app disagrees, the app is
 * wrong, or this key is (verify it).
 *
 * Call sites: core's checker tests (Track A), agent scenario assertions
 * (Track B), the web mock's scenario data (Track C).
 *
 * Partial by design: asserts verdicts, line statuses, amounts and finding kinds,
 * not explanation wording.
 */
import { BillFindingKind, BillingPeriodState, BillVerdict, LineStatus } from "@helper-assistant/domain";
import type { BillFindingKind as BillFindingKindT, BillingPeriodState as StateT, BillVerdict as VerdictT, LineStatus as LineStatusT } from "@helper-assistant/domain";
import { billIds, lupeLineIds, priyaLineIds, theoLineIds } from "./bills";
import { helperIds } from "./people";

export type ExpectedLineCheck = { lineId: string; status: LineStatusT; expectedCents: number | null };

export type ExpectedBillCheck = {
  billId: string;
  /** "Today" the check runs as of. */
  asOf: string;
  verdict: VerdictT;
  statedTotalCents: number | null;
  sumOfLinesCents: number;
  agreedTotalCents: number | null;
  lines: ExpectedLineCheck[];
  /** Exact set of DISCREPANCY / NEEDS_INFO finding kinds. */
  blockingFindingKinds: BillFindingKindT[];
  /** INFO finding kinds that must be present (others are allowed). */
  requiredInfoFindingKinds: BillFindingKindT[];
};

export const STARTER_PACK_TODAY = "2026-10-14";

export const expectedBillChecks: ExpectedBillCheck[] = [
  {
    billId: billIds.priya,
    asOf: STARTER_PACK_TODAY,
    verdict: BillVerdict.DISCREPANCIES,
    statedTotalCents: 62600,
    sumOfLinesCents: 59600,
    // The $40 fee isn't covered by any agreement, so it supports $0.
    agreedTotalCents: 55600,
    lines: [
      // $100 flat until 11pm + 0.5h × $28 late rate.
      { lineId: priyaLineIds.sep4, status: LineStatus.MATCHES, expectedCents: 11400 },
      // 4h × $22.
      { lineId: priyaLineIds.sep9, status: LineStatus.MATCHES, expectedCents: 8800 },
      // 3h × $22 (7–10pm) + 2h × $28 (10pm–12am). Crosses midnight.
      { lineId: priyaLineIds.sep12, status: LineStatus.MATCHES, expectedCents: 12200 },
      // 4h × $22 × 1.5 (Sunday).
      { lineId: priyaLineIds.sep20, status: LineStatus.MATCHES, expectedCents: 13200 },
      // A claim ("Sam said it's fine"), not an agreement.
      { lineId: priyaLineIds.fee, status: LineStatus.NOT_COVERED, expectedCents: null },
      { lineId: priyaLineIds.sep25, status: LineStatus.MATCHES, expectedCents: 10000 },
    ],
    // Stated $626 ≠ sum of lines $596.
    blockingFindingKinds: [BillFindingKind.TOTAL_MISMATCH],
    requiredInfoFindingKinds: [BillFindingKind.AUTHORIZATION_CLAIM],
  },
  {
    billId: billIds.lupe,
    asOf: STARTER_PACK_TODAY,
    verdict: BillVerdict.DISCREPANCIES,
    statedTotalCents: 82000,
    sumOfLinesCents: 82000,
    agreedTotalCents: 80000,
    lines: [
      // $150 billed; $140 was in effect until Sep 14.
      { lineId: lupeLineIds.sep1, status: LineStatus.DIFFERS, expectedCents: 14000 },
      { lineId: lupeLineIds.sep8, status: LineStatus.DIFFERS, expectedCents: 14000 },
      { lineId: lupeLineIds.sep15, status: LineStatus.MATCHES, expectedCents: 15000 },
      // Deep clean on the 22nd instead of regular: agreed Aug 28.
      { lineId: lupeLineIds.sep22, status: LineStatus.MATCHES, expectedCents: 22000 },
      { lineId: lupeLineIds.sep29, status: LineStatus.MATCHES, expectedCents: 15000 },
    ],
    blockingFindingKinds: [],
    requiredInfoFindingKinds: [],
  },
  {
    billId: billIds.theo,
    asOf: STARTER_PACK_TODAY,
    verdict: BillVerdict.CHECKS_OUT,
    statedTotalCents: 58000,
    sumOfLinesCents: 58000,
    agreedTotalCents: 58000,
    lines: [
      // Rates and arithmetic match. Whether 18 walks happened is a separate, INFO-level finding.
      { lineId: theoLineIds.walk30, status: LineStatus.MATCHES, expectedCents: 50400 },
      { lineId: theoLineIds.walk60, status: LineStatus.MATCHES, expectedCents: 7600 },
    ],
    blockingFindingKinds: [],
    // 20 walks billed vs 22 weekdays in September 2026. The checker has no holiday
    // calendar; the bill's own remark explains Labor Day.
    requiredInfoFindingKinds: [BillFindingKind.QUANTITY_UNVERIFIABLE, BillFindingKind.OCCURRENCE_COUNT_PLAUSIBILITY],
  },
];

/** Expected detail for Theo's OCCURRENCE_COUNT_PLAUSIBILITY finding. */
export const expectedTheoOccurrenceCount = { billedCount: 20, scheduledCount: 22 } as const;

export type ExpectedMonthStatusRow = { helperId: string; state: StateT; billId: string | null; verdict: VerdictT | null };

/** GET /api/month-status?month=2026-09 on Oct 14, with all three bills recorded and checked. */
export const expectedSeptemberMonthStatus: ExpectedMonthStatusRow[] = [
  { helperId: helperIds.priya, state: BillingPeriodState.CHECKED_FLAGGED, billId: billIds.priya, verdict: BillVerdict.DISCREPANCIES },
  { helperId: helperIds.lupe, state: BillingPeriodState.CHECKED_FLAGGED, billId: billIds.lupe, verdict: BillVerdict.DISCREPANCIES },
  { helperId: helperIds.theo, state: BillingPeriodState.CHECKED_OK, billId: billIds.theo, verdict: BillVerdict.CHECKS_OUT },
];
