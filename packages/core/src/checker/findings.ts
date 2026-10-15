/**
 * Bill-level findings (Doc 3 §3.2): everything that isn't "is this line's amount
 * what was agreed". Severity per kind is BILL_FINDING_SEVERITY in domain.
 *
 * Call site: checkBill.
 */
import { BillFindingKind, LineKind } from "@helper-assistant/domain";
import type { AgreementTerm, Bill, BillFinding, Cents, Id, LineItem, ServiceKey } from "@helper-assistant/domain";
import { formatCents } from "../money";
import { plausibilityFindings } from "./plausibility";
import { lineDate } from "./terms";

export function billFindings(
  bill: Bill,
  sumOfLinesCents: Cents,
  terms: readonly AgreementTerm[],
  approvedOverlappingBillId: Id | null,
): BillFinding[] {
  return [
    ...totalMismatch(bill, sumOfLinesCents),
    ...linesOutsidePeriod(bill),
    ...duplicateLines(bill.lineItems),
    ...servicesWithoutAgreement(bill.lineItems, terms),
    ...periodAlreadyApproved(approvedOverlappingBillId),
    ...authorizationClaims(bill.lineItems),
    ...plausibilityFindings(bill.lineItems, terms, bill.period),
  ];
}

function totalMismatch(bill: Bill, sumOfLinesCents: Cents): BillFinding[] {
  if (bill.statedTotalCents === null || bill.statedTotalCents === sumOfLinesCents) return [];
  return [
    {
      kind: BillFindingKind.TOTAL_MISMATCH,
      statedTotalCents: bill.statedTotalCents,
      sumOfLinesCents,
      message: `The bill says the total is ${formatCents(bill.statedTotalCents)}, but its lines add up to ${formatCents(sumOfLinesCents)}.`,
    },
  ];
}

function linesOutsidePeriod(bill: Bill): BillFinding[] {
  const outside = bill.lineItems.filter((l) => {
    const date = lineDate(l);
    return date !== null && (date < bill.period.start || date > bill.period.end);
  });
  if (outside.length === 0) return [];
  return [
    {
      kind: BillFindingKind.LINE_OUTSIDE_PERIOD,
      lineIds: outside.map((l) => l.lineId),
      message: `${outside.length} line(s) are dated outside the billing period (${bill.period.start} to ${bill.period.end}).`,
    },
  ];
}

/** Same service, same day, same times. Undated lines can't be duplicates of anything we can see. */
function duplicateLines(lines: readonly LineItem[]): BillFinding[] {
  const byIdentity = new Map<string, LineItem[]>();
  for (const line of lines) {
    const date = lineDate(line);
    if (line.lineKind !== LineKind.SERVICE || line.serviceKey === null || date === null) continue;
    const identity = JSON.stringify([line.serviceKey, date, line.startAt, line.endAt]);
    byIdentity.set(identity, [...(byIdentity.get(identity) ?? []), line]);
  }
  return [...byIdentity.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      kind: BillFindingKind.DUPLICATE_LINE,
      lineIds: group.map((l) => l.lineId),
      message: `${group.length} lines bill "${group[0]!.label}" for the same service on ${lineDate(group[0]!)}${group[0]!.startAt ? " at the same times" : ""}.`,
    }));
}

/** Service lines whose serviceKey has no term at all for this helper. */
function servicesWithoutAgreement(lines: readonly LineItem[], terms: readonly AgreementTerm[]): BillFinding[] {
  const knownKeys = new Set(terms.map((t) => t.serviceKey));
  const missing = new Map<ServiceKey, LineItem[]>();
  for (const line of lines) {
    if (line.lineKind !== LineKind.SERVICE || line.serviceKey === null || knownKeys.has(line.serviceKey)) continue;
    missing.set(line.serviceKey, [...(missing.get(line.serviceKey) ?? []), line]);
  }
  return [...missing].map(([serviceKey, group]) => ({
    kind: BillFindingKind.NO_AGREEMENT_FOR_SERVICE,
    serviceKey,
    serviceLabel: group[0]!.label,
    lineIds: group.map((l) => l.lineId),
    message: `There is no agreement for "${group[0]!.label}" (${serviceKey}).`,
  }));
}

function periodAlreadyApproved(approvedBillId: Id | null): BillFinding[] {
  if (approvedBillId === null) return [];
  return [
    {
      kind: BillFindingKind.PERIOD_ALREADY_APPROVED,
      approvedBillId,
      message: "Another bill from this helper covering this period was already approved.",
    },
  ];
}

function authorizationClaims(lines: readonly LineItem[]): BillFinding[] {
  return lines.flatMap((line) =>
    line.authorizationClaim === null
      ? []
      : [
          {
            kind: BillFindingKind.AUTHORIZATION_CLAIM,
            lineId: line.lineId,
            claimedApprover: line.authorizationClaim.claimedApprover,
            claimText: line.authorizationClaim.text,
            message: `The helper says ${line.authorizationClaim.claimedApprover} OK'd "${line.label}". That's a claim, not an agreement.`,
          },
        ],
  );
}
