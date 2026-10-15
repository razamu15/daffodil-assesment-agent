/**
 * Which term prices a line: the one for the line's serviceKey in effect on the
 * line's date (Doc 3 S1, versioned rows). Resolution is explicit about *why*
 * nothing was found, because "no agreement for this service at all", "not in
 * effect that day" and "can't tell which version" lead to different statuses.
 *
 * Call sites: lineChecks (pricing), plausibility (schedules in effect).
 */
import type { AgreementTerm, BillingPeriod, LineItem, LocalDate, ServiceKey } from "@helper-assistant/domain";
import { dateOf } from "../calendar";

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

export function isInEffectOn(term: AgreementTerm, date: LocalDate): boolean {
  return term.effectiveFrom <= date && (term.effectiveTo === null || date <= term.effectiveTo);
}

function coversWholePeriod(term: AgreementTerm, period: BillingPeriod): boolean {
  return term.effectiveFrom <= period.start && (term.effectiveTo === null || period.end <= term.effectiveTo);
}

function overlapsPeriod(term: AgreementTerm, period: BillingPeriod): boolean {
  return term.effectiveFrom <= period.end && (term.effectiveTo === null || period.start <= term.effectiveTo);
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
    const inEffect = forService.filter((t) => isInEffectOn(t, date));
    if (inEffect.length === 1) return { kind: TermResolutionKind.FOUND, term: inEffect[0]! };
    if (inEffect.length === 0) return { kind: TermResolutionKind.NOT_IN_EFFECT, reason: `No agreement for this service was in effect on ${date}.` };
    return { kind: TermResolutionKind.AMBIGUOUS, reason: `${inEffect.length} versions of this service's terms overlap on ${date}.` };
  }

  const overlapping = forService.filter((t) => overlapsPeriod(t, period));
  if (overlapping.length === 0) {
    return { kind: TermResolutionKind.NOT_IN_EFFECT, reason: `No agreement for this service was in effect from ${period.start} to ${period.end}.` };
  }
  if (overlapping.length === 1 && coversWholePeriod(overlapping[0]!, period)) {
    return { kind: TermResolutionKind.FOUND, term: overlapping[0]! };
  }
  return {
    kind: TermResolutionKind.AMBIGUOUS,
    reason: "The line has no date, and the agreed rate for this service changes during the billing period.",
  };
}
