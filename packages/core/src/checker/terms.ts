/**
 * Which term prices a line: the one for the line's serviceKey in effect on the
 * line's date (Doc 3 S1, versioned rows). Resolution is explicit about *why*
 * nothing was found, because "no agreement for this service at all", "not in
 * effect that day" and "can't tell which version" lead to different statuses.
 *
 * The earliest saved version of a service also covers every date before its
 * effectiveFrom: the first rate Jordan records is assumed to have always applied,
 * because its effectiveFrom is usually just the day it was written down. Adding a
 * rate from before it (ADD_EARLIER_TERM) moves that boundary explicitly.
 *
 * Call sites: lineChecks (pricing), plausibility (schedules in effect), the
 * agent's list_agreements (terms in effect on a date).
 */
import type { AgreementTerm, BillingPeriod, LineItem, LocalDate, ServiceKey } from "@helper-assistant/domain";
import { dateOf } from "../calendar";
import { earliestVersion } from "../termVersions";

export const TermResolutionKind = {
  FOUND: "FOUND",
  /** The helper has no term with this serviceKey, ever. → NOT_COVERED + NO_AGREEMENT_FOR_SERVICE. */
  NO_TERM_FOR_SERVICE: "NO_TERM_FOR_SERVICE",
  /** Terms exist for the service but none was in effect then. → NOT_COVERED. */
  NOT_IN_EFFECT: "NOT_IN_EFFECT",
  /** More than one version could apply (overlapping rows, or an undated line in a period with a rate change). → CANNOT_COMPUTE. */
  AMBIGUOUS: "AMBIGUOUS",
} as const;

export type TermResolution =
  | { kind: typeof TermResolutionKind.FOUND; term: AgreementTerm }
  | { kind: typeof TermResolutionKind.NO_TERM_FOR_SERVICE }
  | { kind: typeof TermResolutionKind.NOT_IN_EFFECT; reason: string }
  | { kind: typeof TermResolutionKind.AMBIGUOUS; reason: string };

/** True when `term` starts on or before `date`. The earliest version of its service always does. */
function startsBy(term: AgreementTerm, date: LocalDate, versions: readonly AgreementTerm[]): boolean {
  return term.effectiveFrom <= date || earliestVersion(versions, term.helperId, term.serviceKey)?.termId === term.termId;
}

const endsOnOrAfter = (term: AgreementTerm, date: LocalDate): boolean => term.effectiveTo === null || date <= term.effectiveTo;

/** `versions` are the helper's terms (all versions), so the earliest of the service can be told apart. */
export function isInEffectOn(term: AgreementTerm, date: LocalDate, versions: readonly AgreementTerm[]): boolean {
  return startsBy(term, date, versions) && endsOnOrAfter(term, date);
}

function coversWholePeriod(term: AgreementTerm, period: BillingPeriod, versions: readonly AgreementTerm[]): boolean {
  return startsBy(term, period.start, versions) && endsOnOrAfter(term, period.end);
}

export function overlapsPeriod(term: AgreementTerm, period: BillingPeriod, versions: readonly AgreementTerm[]): boolean {
  return startsBy(term, period.end, versions) && endsOnOrAfter(term, period.start);
}

/** The day a line happened: serviceDate, else the date of startAt, else unknown. */
export function lineDate(line: LineItem): LocalDate | null {
  if (line.serviceDate !== null) return line.serviceDate;
  return line.startAt === null ? null : dateOf(line.startAt);
}

/**
 * `terms` are the bill's helper's terms (all versions). A dated line uses the version
 * in effect that day; an undated line can only be priced when one version covers
 * the whole billing period.
 */
export function resolveTerm(
  serviceKey: ServiceKey,
  date: LocalDate | null,
  terms: readonly AgreementTerm[],
  period: BillingPeriod,
): TermResolution {
  const forService = terms.filter((t) => t.serviceKey === serviceKey);
  if (forService.length === 0) return { kind: TermResolutionKind.NO_TERM_FOR_SERVICE };

  if (date !== null) {
    const inEffect = forService.filter((t) => isInEffectOn(t, date, terms));
    if (inEffect.length === 1) return { kind: TermResolutionKind.FOUND, term: inEffect[0]! };
    if (inEffect.length === 0) return { kind: TermResolutionKind.NOT_IN_EFFECT, reason: `No agreement for this service was in effect on ${date}.` };
    return { kind: TermResolutionKind.AMBIGUOUS, reason: `${inEffect.length} versions of this service's terms overlap on ${date}.` };
  }

  const overlapping = forService.filter((t) => overlapsPeriod(t, period, terms));
  if (overlapping.length === 0) {
    return { kind: TermResolutionKind.NOT_IN_EFFECT, reason: `No agreement for this service was in effect from ${period.start} to ${period.end}.` };
  }
  if (overlapping.length === 1 && coversWholePeriod(overlapping[0]!, period, terms)) {
    return { kind: TermResolutionKind.FOUND, term: overlapping[0]! };
  }
  return {
    kind: TermResolutionKind.AMBIGUOUS,
    reason: "The line has no date, and the agreed rate for this service changes during the billing period.",
  };
}
