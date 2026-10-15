/**
 * checkBill: the deterministic checker (Doc 3 §3). Pure: same inputs, same check.
 *
 * Call sites: recordBill (every bill is checked before it's saved), the
 * BILL_APPROVAL propose and confirm paths (snapshot, then re-run to detect
 * STALE), AGREEMENT_CHANGE apply (re-checks the helper's open bills), the
 * agent's check_bill tool (via checkStoredBill), core tests against the answer key.
 */
import { LineStatus } from "@helper-assistant/domain";
import type { AgreementTerm, Bill, BillCheck, Id, Instant, TermVersionRef } from "@helper-assistant/domain";
import { sumCents } from "../money";
import { billFindings } from "./findings";
import { checkLine } from "./lineChecks";
import { verdictOf } from "./severity";

export type CheckBillInput = {
  bill: Bill;
  /** Every version of the bill's helper's terms. The checker picks the one in effect per line. */
  terms: readonly AgreementTerm[];
  /** An APPROVED bill from the same helper whose period overlaps this one, or null. */
  approvedOverlappingBillId: Id | null;
  checkedAt: Instant;
};

/** Line statuses that leave the agreed total unknown: we won't guess a total. */
const STATUSES_WITHOUT_AGREED_TOTAL: readonly LineStatus[] = [LineStatus.CANNOT_COMPUTE, LineStatus.UNVERIFIABLE];

export function checkBill({ bill, terms, approvedOverlappingBillId, checkedAt }: CheckBillInput): BillCheck {
  const linesById = new Map(bill.lineItems.map((l) => [l.lineId, l]));
  const results = bill.lineItems.map((line) => checkLine({ line, bill, terms, linesById }));
  const lineChecks = results.map((r) => r.check);

  const sumOfLinesCents = sumCents(bill.lineItems.map((l) => l.amountBilledCents));
  const findings = billFindings(bill, sumOfLinesCents, terms, approvedOverlappingBillId);
  const agreedTotalCents = lineChecks.some((l) => STATUSES_WITHOUT_AGREED_TOTAL.includes(l.status))
    ? null
    : sumCents(lineChecks.map((l) => l.expectedCents ?? 0));

  const termVersions = new Map<Id, TermVersionRef>();
  for (const term of results.flatMap((r) => r.appliedTerms)) termVersions.set(term.termId, { termId: term.termId, version: term.version });

  return {
    billId: bill.billId,
    billVersion: bill.version,
    checkedAt,
    verdict: verdictOf(lineChecks, findings),
    lineChecks,
    findings,
    statedTotalCents: bill.statedTotalCents,
    sumOfLinesCents,
    agreedTotalCents,
    termVersions: [...termVersions.values()],
  };
}

/**
 * Two checks say the same thing if everything but checkedAt (and the bill version
 * it was computed for) matches. Key order is ignored, so a check that went
 * through a store or JSON round trip still compares equal.
 *
 * Call sites: BILL_APPROVAL confirm (snapshot vs re-run → STALE), AGREEMENT_CHANGE
 * apply (only rewrite a bill's latestCheck when its content changed).
 */
export function sameCheckContent(a: BillCheck, b: BillCheck): boolean {
  const content = ({ checkedAt: _checkedAt, billVersion: _billVersion, ...rest }: BillCheck) => rest;
  return canonicalJson(content(a)) === canonicalJson(content(b));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) =>
    v !== null && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => x.localeCompare(y)))
      : v,
  );
}
