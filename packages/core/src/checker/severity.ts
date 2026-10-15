/**
 * Severity and verdict, straight from the domain tables (Doc 3 §3.3):
 * LINE_STATUS_SEVERITY, BILL_FINDING_SEVERITY, SEVERITY_RANK, VERDICT_BY_WORST_SEVERITY.
 *
 * Call sites: checkBill (verdict), deriveMonthStatus (attention count), the bill
 * approval gate (which items must be accepted as exceptions).
 */
import {
  BILL_FINDING_SEVERITY,
  ExceptionTarget,
  FindingSeverity,
  LINE_STATUS_SEVERITY,
  SEVERITY_RANK,
  VERDICT_BY_WORST_SEVERITY,
} from "@helper-assistant/domain";
import type { AcceptedException, BillCheck, BillFinding, BillVerdict, LineCheck } from "@helper-assistant/domain";

/** Severities that need Jordan's attention before a bill can be approved without exceptions. */
const BLOCKING_SEVERITIES: readonly FindingSeverity[] = [FindingSeverity.DISCREPANCY, FindingSeverity.NEEDS_INFO];

export function verdictOf(lineChecks: readonly LineCheck[], findings: readonly BillFinding[]): BillVerdict {
  const severities = [
    ...lineChecks.flatMap((l) => LINE_STATUS_SEVERITY[l.status] ?? []),
    ...findings.map((f) => BILL_FINDING_SEVERITY[f.kind]),
  ];
  const worst = severities.sort((a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a])[0];
  return VERDICT_BY_WORST_SEVERITY[worst ?? "NONE"];
}

const isBlocking = (severity: FindingSeverity | null): boolean => severity !== null && BLOCKING_SEVERITIES.includes(severity);

/** Lines and findings that are DISCREPANCY or NEEDS_INFO: "⚠ 2 things to look at". */
export function blockingItems(check: BillCheck): { lines: LineCheck[]; findings: BillFinding[] } {
  return {
    lines: check.lineChecks.filter((l) => isBlocking(LINE_STATUS_SEVERITY[l.status])),
    findings: check.findings.filter((f) => isBlocking(BILL_FINDING_SEVERITY[f.kind])),
  };
}

/** Blocking items that no accepted exception covers, in plain words. Empty = approvable as is. */
export function unacceptedBlockingItems(check: BillCheck, accepted: readonly AcceptedException[]): string[] {
  const acceptedLines = new Set(accepted.flatMap((e) => (e.target === ExceptionTarget.LINE ? [e.lineId] : [])));
  const acceptedKinds = new Set(accepted.flatMap((e) => (e.target === ExceptionTarget.FINDING ? [e.findingKind] : [])));
  const { lines, findings } = blockingItems(check);
  return [
    ...lines.filter((l) => !acceptedLines.has(l.lineId)).map((l) => `line ${l.lineId} (${l.status})`),
    ...findings.filter((f) => !acceptedKinds.has(f.kind)).map((f) => `finding ${f.kind}`),
  ];
}
