/**
 * Reads a BillCheck for display. It never computes a verdict or status (the API
 * returns those); it sorts what the check already says into "needs your
 * decision" and "for your information", using the domain severity tables.
 *
 * Call sites: Bill screen (headline, highlighted rows), ApproveDialog (one
 * reason per item for "Approve anyway…"), Month screen (the one-line "why").
 */
import { BILL_FINDING_SEVERITY, BillFindingKind, ExceptionTarget, FindingSeverity, LINE_STATUS_SEVERITY, LineStatus, RateVersionRelation } from "@helper-assistant/domain";
import type {
  BillCheck,
  BillFindingKind as BillFindingKindT,
  FindingSeverity as FindingSeverityT,
  LineCause,
  LineCheck,
  LineItem,
  LineStatus as LineStatusT,
  RateVersionRelation as RateVersionRelationT,
} from "@helper-assistant/domain";
import { formatCents, formatDate } from "./format";
import { FINDING_TITLE } from "./labels";

/** Severities Jordan must decide on before a plain approval (the rest are notes). */
const DECISION_SEVERITIES: readonly FindingSeverityT[] = [FindingSeverity.DISCREPANCY, FindingSeverity.NEEDS_INFO];

const needsDecision = (severity: FindingSeverityT | null): boolean => severity !== null && DECISION_SEVERITIES.includes(severity);

/** Which AcceptedException would cover the item. */
export type ExceptionTargetRef =
  | { target: typeof ExceptionTarget.LINE; lineId: string }
  | { target: typeof ExceptionTarget.FINDING; findingKind: BillFindingKindT };

export type CheckItem = {
  key: string;
  title: string;
  /** The checker's plain-words explanation. */
  explanation: string;
  /** A short form for lists: "billed $150, agreed $140". Falls back to the explanation. */
  short: string;
  severity: FindingSeverityT;
  covers: ExceptionTargetRef;
};

/** "Sep 20 · last minute fee", or just the label for undated lines. */
export function lineTitle(line: LineItem): string {
  if (line.serviceDate === null) return line.label;
  const date = formatDate(line.serviceDate);
  // Lupe's lines are labelled with their date ("Sep 1"); don't say it twice.
  return line.label.trim().toLowerCase() === date.toLowerCase() ? date : `${date} · ${line.label}`;
}

/** Short reason per line status, from the check's own numbers. */
/** A differing line whose likely cause the checker found, said in a few words. */
const SHORT_CAUSE: Record<RateVersionRelationT, (lc: LineCheck, cause: LineCause) => string> = {
  [RateVersionRelation.LATER]: (lc, cause) =>
    `billed at the new ${formatCents(lc.billedCents)} rate before it started ${formatDate(cause.effectiveFrom)} (agreed ${formatCents(lc.expectedCents!)})`,
  [RateVersionRelation.EARLIER]: (lc, cause) =>
    `billed at the old ${formatCents(lc.billedCents)} rate${cause.effectiveTo === null ? "" : ` after it ended ${formatDate(cause.effectiveTo)}`} (agreed ${formatCents(lc.expectedCents!)})`,
};

const SHORT_LINE_REASON: Record<LineStatusT, (lc: LineCheck) => string> = {
  [LineStatus.MATCHES]: (lc) => `billed ${formatCents(lc.billedCents)}, as agreed`,
  [LineStatus.DIFFERS]: (lc) =>
    lc.likelyCause !== null ? SHORT_CAUSE[lc.likelyCause.relation](lc, lc.likelyCause) : `billed ${formatCents(lc.billedCents)}, agreed ${formatCents(lc.expectedCents!)}`,
  [LineStatus.NOT_COVERED]: (lc) => `${formatCents(lc.billedCents)}, not in any agreement`,
  [LineStatus.CANNOT_COMPUTE]: (lc) => lc.explanation,
  [LineStatus.UNVERIFIABLE]: (lc) => lc.explanation,
};

function allItems(check: BillCheck, lineItems: readonly LineItem[]): CheckItem[] {
  const lines = new Map(lineItems.map((l) => [l.lineId, l]));
  const lineItemsOut = check.lineChecks.flatMap((lc): CheckItem[] => {
    const severity = LINE_STATUS_SEVERITY[lc.status];
    const line = lines.get(lc.lineId);
    if (severity === null || line === undefined) return [];
    return [{ key: `line:${lc.lineId}`, title: lineTitle(line), explanation: lc.explanation, short: SHORT_LINE_REASON[lc.status](lc), severity, covers: { target: ExceptionTarget.LINE, lineId: lc.lineId } }];
  });
  // One exception covers every finding of a kind, so the items are per kind.
  const kinds = [...new Set(check.findings.map((f) => f.kind))];
  const findingItems = kinds.map((kind): CheckItem => {
    const findings = check.findings.filter((f) => f.kind === kind);
    const explanation = findings.map((f) => f.message).join(" ");
    const short = findings.map((f) => (f.kind === BillFindingKind.TOTAL_MISMATCH ? `says ${formatCents(f.statedTotalCents)}, lines add up to ${formatCents(f.sumOfLinesCents)}` : f.message)).join(" ");
    return { key: `finding:${kind}`, title: FINDING_TITLE[kind], explanation, short, severity: BILL_FINDING_SEVERITY[kind], covers: { target: ExceptionTarget.FINDING, findingKind: kind } };
  });
  return [...lineItemsOut, ...findingItems];
}

/** Lines and findings that need Jordan's decision (DISCREPANCY or NEEDS_INFO). */
export const itemsNeedingDecision = (check: BillCheck, lineItems: readonly LineItem[]): CheckItem[] =>
  allItems(check, lineItems).filter((i) => needsDecision(i.severity));

/** What the assistant can't know or wants Jordan to notice, without blocking approval. */
export const informationalItems = (check: BillCheck, lineItems: readonly LineItem[]): CheckItem[] =>
  allItems(check, lineItems).filter((i) => !needsDecision(i.severity));

/**
 * Items with the same short reason merged: "Sep 1, Sep 8: billed $150, agreed $140".
 * Call sites: Month screen why-line, Bill screen headline.
 */
export function groupedReasons(items: readonly CheckItem[]): { titles: string; short: string }[] {
  const groups = new Map<string, string[]>();
  for (const item of items) groups.set(item.short, [...(groups.get(item.short) ?? []), item.title]);
  return [...groups.entries()].map(([short, titles]) => ({ titles: titles.join(", "), short }));
}

export const lineNeedsDecision = (status: keyof typeof LINE_STATUS_SEVERITY): boolean => needsDecision(LINE_STATUS_SEVERITY[status]);
