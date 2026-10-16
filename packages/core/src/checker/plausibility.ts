/**
 * Services-rendered plausibility (Product §6, option B): billed dates and counts
 * compared with the usual schedule on the agreement. Every finding here is INFO:
 * it never changes the supported amount and never blocks "checks out". There is
 * no holiday calendar, so a weekday holiday still counts as a scheduled day.
 *
 * Call site: checkBill (via billFindings).
 */
import { BillFindingKind, LineKind, PricingRuleKind, ScheduleKind, WEEKDAYS } from "@helper-assistant/domain";
import type {
  AgreementTerm,
  BillableUnit,
  BillFinding,
  BillingPeriod,
  DayOfWeek,
  LineItem,
  ServiceKey,
  ServiceSchedule,
} from "@helper-assistant/domain";
import { datesBetween, dayOfWeek } from "../calendar";
import { isInEffectOn, lineDate, overlapsPeriod, resolveTerm, TermResolutionKind } from "./terms";

/** The days a schedule says the service usually happens. null = no fixed days (AD_HOC) or not known (UNSPECIFIED). */
const USUAL_DAYS_BY_SCHEDULE: Record<ScheduleKind, (schedule: ServiceSchedule) => readonly DayOfWeek[] | null> = {
  [ScheduleKind.WEEKLY_ON]: (s) => (s.kind === ScheduleKind.WEEKLY_ON ? s.days : null),
  [ScheduleKind.WEEKDAYS]: () => WEEKDAYS,
  [ScheduleKind.AD_HOC]: () => null,
  [ScheduleKind.UNSPECIFIED]: () => null,
};

const usualDays = (term: AgreementTerm): readonly DayOfWeek[] | null => USUAL_DAYS_BY_SCHEDULE[term.schedule.kind](term.schedule);

const serviceLines = (lines: readonly LineItem[]) => lines.filter((l) => l.lineKind === LineKind.SERVICE);

export function plausibilityFindings(lines: readonly LineItem[], terms: readonly AgreementTerm[], period: BillingPeriod): BillFinding[] {
  return [...quantityUnverifiable(lines), ...scheduleFindings(lines, terms, period), ...occurrenceCountFindings(lines, terms, period)];
}

/** Undated service lines are counts we can't tie to days ("18 walks"). */
function quantityUnverifiable(lines: readonly LineItem[]): BillFinding[] {
  const undated = serviceLines(lines).filter((l) => lineDate(l) === null);
  if (undated.length === 0) return [];
  return [
    {
      kind: BillFindingKind.QUANTITY_UNVERIFIABLE,
      lineIds: undated.map((l) => l.lineId),
      message: "Some lines give only a count, with no dates. The rate and arithmetic can be checked; whether each one happened can't.",
    },
  ];
}

/** Dated lines on days outside the usual schedule of the term in effect that day. */
function scheduleFindings(lines: readonly LineItem[], terms: readonly AgreementTerm[], period: BillingPeriod): BillFinding[] {
  const offDays = new Map<ServiceKey, { lineIds: string[]; usual: readonly DayOfWeek[] }>();
  for (const line of serviceLines(lines)) {
    const date = lineDate(line);
    if (line.serviceKey === null || date === null) continue;
    const resolution = resolveTerm(line.serviceKey, date, terms, period);
    if (resolution.kind !== TermResolutionKind.FOUND) continue;
    const usual = usualDays(resolution.term);
    if (usual === null || usual.includes(dayOfWeek(date))) continue;
    const entry = offDays.get(line.serviceKey) ?? { lineIds: [], usual };
    entry.lineIds.push(line.lineId);
    offDays.set(line.serviceKey, entry);
  }
  return [...offDays].map(([serviceKey, { lineIds, usual }]) => ({
    kind: BillFindingKind.SCHEDULE_PLAUSIBILITY,
    serviceKey,
    lineIds,
    usualDays: [...usual],
    message: `${lineIds.length} "${serviceKey}" line(s) fall on days outside the usual schedule (${usual.join(", ")}).`,
  }));
}

/**
 * Billed occurrences vs what the usual schedule implies for the period.
 *
 * Per-unit services in the same unit are counted together: a deep clean in place
 * of a regular visit, or a long walk in place of a short one, still fills the
 * usual slot. The finding lists every serviceKey it counted, so that grouping is
 * visible. A time-priced scheduled service counts its distinct billed dates.
 * Any count we can't know (a line with no quantity, an undated timed line) means
 * no finding rather than a guessed count.
 */
function occurrenceCountFindings(lines: readonly LineItem[], terms: readonly AgreementTerm[], period: BillingPeriod): BillFinding[] {
  const dates = datesBetween(period.start, period.end);
  const keys = [...new Set(terms.map((t) => t.serviceKey))];
  const scheduledCount = new Map<ServiceKey, number>();
  for (const key of keys) {
    const count = dates.filter((date) => {
      const term = terms.find((t) => t.serviceKey === key && isInEffectOn(t, date, terms));
      return term !== undefined && (usualDays(term)?.includes(dayOfWeek(date)) ?? false);
    }).length;
    if (count > 0) scheduledCount.set(key, count);
  }

  // One group per per-unit unit (all services priced in it), or one per time-priced scheduled service.
  const groups = new Map<BillableUnit | ServiceKey, OccurrenceGroup>();
  for (const key of scheduledCount.keys()) {
    const unit = perUnitOf(key, terms, period);
    if (unit === null) groups.set(key, { serviceKeys: [key], counting: OccurrenceCounting.DISTINCT_DATES });
    else groups.set(unit, { serviceKeys: keys.filter((k) => perUnitOf(k, terms, period) === unit), counting: OccurrenceCounting.QUANTITY });
  }

  const findings: BillFinding[] = [];
  for (const { serviceKeys, counting } of groups.values()) {
    const groupLines = serviceLines(lines).filter((l) => l.serviceKey !== null && serviceKeys.includes(l.serviceKey));
    const billedCount = BILLED_COUNT_BY_COUNTING[counting](groupLines);
    const expected = serviceKeys.reduce((total, k) => total + (scheduledCount.get(k) ?? 0), 0);
    if (billedCount === null || billedCount === expected) continue;
    findings.push({
      kind: BillFindingKind.OCCURRENCE_COUNT_PLAUSIBILITY,
      serviceKeys,
      billedCount,
      scheduledCount: expected,
      message: `Billed ${billedCount}; the usual schedule implies ${expected} in this period (no holiday calendar). Which ones happened can't be verified.`,
    });
  }
  return findings;
}

/** How billed occurrences are counted for a group of services. */
const OccurrenceCounting = { QUANTITY: "QUANTITY", DISTINCT_DATES: "DISTINCT_DATES" } as const;
type OccurrenceCounting = (typeof OccurrenceCounting)[keyof typeof OccurrenceCounting];
type OccurrenceGroup = { serviceKeys: ServiceKey[]; counting: OccurrenceCounting };

const BILLED_COUNT_BY_COUNTING: Record<OccurrenceCounting, (lines: readonly LineItem[]) => number | null> = {
  [OccurrenceCounting.QUANTITY]: (lines) => sumQuantities(lines),
  [OccurrenceCounting.DISTINCT_DATES]: (lines) => countDistinctDates(lines),
};

/** The unit a service is priced per in this period, or null if it isn't per-unit (or the versions disagree). */
function perUnitOf(key: ServiceKey, terms: readonly AgreementTerm[], period: BillingPeriod): BillableUnit | null {
  const units = new Set(
    terms
      .filter((t) => t.serviceKey === key && overlapsPeriod(t, period, terms))
      .flatMap((t) => t.pricingRules.flatMap((r) => (r.kind === PricingRuleKind.FLAT_PER_UNIT ? [r.unit] : []))),
  );
  return units.size === 1 ? [...units][0]! : null;
}

function sumQuantities(lines: readonly LineItem[]): number | null {
  if (lines.some((l) => l.quantity === null)) return null;
  return lines.reduce((total, l) => total + l.quantity!, 0);
}

function countDistinctDates(lines: readonly LineItem[]): number | null {
  const dates = lines.map(lineDate);
  if (dates.some((d) => d === null)) return null;
  return new Set(dates).size;
}
