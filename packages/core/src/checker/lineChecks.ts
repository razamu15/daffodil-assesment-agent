/**
 * One LineCheck per bill line (Doc 3 §3.1). Two tables drive it:
 *   LINE_CHECKER_BY_KIND     how each LineKind is checked (service, fee, or not priceable)
 *   PRICING_MODE_BY_RULE_KIND which rule kinds price which kind of line, so one engine
 *                            evaluates every term and helpers differ only in data
 *
 * Call site: checkBill.
 */
import { LineCauseKind, LineKind, LineStatus, PricingRuleKind, RateVersionRelation } from "@helper-assistant/domain";
import type {
  AgreementTerm,
  Bill,
  Cents,
  LineCause,
  LineCheck,
  LineItem,
  LocalDate,
  PricingRule,
  RateVersionRelation as RateVersionRelationT,
} from "@helper-assistant/domain";
import { formatDay } from "../calendar";
import { formatCents } from "../money";
import { cannotCompute, PriceOutcome } from "./price";
import type { Price } from "./price";
import { isInEffectOn, lineDate, overlapsPeriod, resolveTerm, TermResolutionKind } from "./terms";
import { priceTimedLine } from "./timedPricing";
import { normalizeFeeLabel, priceFeeLine, priceUnitLine } from "./unitPricing";
import type { FeeRule } from "./unitPricing";

export const PricingMode = {
  /** amount × quantity (FLAT_PER_UNIT). */
  PER_UNIT: "PER_UNIT",
  /** priced from start/end times (HOURLY, HOURLY_AFTER, FLAT_BLOCK, DAY_MULTIPLIER). */
  TIMED: "TIMED",
  /** prices FEE lines, not the service itself. */
  FEE: "FEE",
} as const;
export type PricingMode = (typeof PricingMode)[keyof typeof PricingMode];

export const PRICING_MODE_BY_RULE_KIND: Record<PricingRuleKind, PricingMode> = {
  [PricingRuleKind.FLAT_PER_UNIT]: PricingMode.PER_UNIT,
  [PricingRuleKind.HOURLY]: PricingMode.TIMED,
  [PricingRuleKind.HOURLY_AFTER]: PricingMode.TIMED,
  [PricingRuleKind.DAY_MULTIPLIER]: PricingMode.TIMED,
  [PricingRuleKind.FLAT_BLOCK]: PricingMode.TIMED,
  [PricingRuleKind.FEE]: PricingMode.FEE,
};

const SERVICE_PRICER_BY_MODE: Record<Exclude<PricingMode, "FEE">, (line: LineItem, rules: readonly PricingRule[]) => Price> = {
  [PricingMode.PER_UNIT]: priceUnitLine,
  [PricingMode.TIMED]: priceTimedLine,
};

/** A line's check plus the term rows behind it (for BillCheck.termVersions). */
export type LineResult = { check: LineCheck; appliedTerms: AgreementTerm[] };

type LineInput = { line: LineItem; bill: Bill; terms: readonly AgreementTerm[]; linesById: ReadonlyMap<string, LineItem> };

const LINE_CHECKER_BY_KIND: Record<LineKind, (input: LineInput) => LineResult> = {
  [LineKind.SERVICE]: checkServiceLine,
  [LineKind.FEE]: checkFeeLine,
  [LineKind.REIMBURSEMENT]: ({ line }) =>
    unverifiable(line, `Billed ${formatCents(line.amountBilledCents)} as a reimbursement. No agreement prices reimbursements, so this can't be checked.`),
  [LineKind.ADJUSTMENT]: ({ line }) =>
    unverifiable(line, `Billed ${formatCents(line.amountBilledCents)} as an adjustment. No agreement prices adjustments, so this can't be checked.`),
};

export function checkLine(input: LineInput): LineResult {
  return LINE_CHECKER_BY_KIND[input.line.lineKind](input);
}

function checkServiceLine({ line, bill, terms }: LineInput): LineResult {
  if (line.serviceKey === null) return fromPrice(line, null, cannotCompute("The bill doesn't say which service this line is for."));
  const resolution = resolveTerm(line.serviceKey, lineDate(line), terms, bill.period);
  switch (resolution.kind) {
    case TermResolutionKind.NO_TERM_FOR_SERVICE:
      return notCovered(line, `There is no agreement for "${line.serviceKey}".`);
    case TermResolutionKind.NOT_IN_EFFECT:
      return notCovered(line, resolution.reason);
    case TermResolutionKind.AMBIGUOUS:
      return fromPrice(line, null, cannotCompute(resolution.reason));
    case TermResolutionKind.FOUND:
      return fromPrice(line, resolution.term, priceServiceLine(line, resolution.term), (expected) => rateFromOtherPeriod(line, resolution.term, terms, expected));
  }
}

/**
 * A differing line priced under the same service's other versions: when one of
 * them charges exactly what was billed, the helper most likely used that rate
 * outside its dates (Lupe's new $150 rate on a visit before it started).
 */
function rateFromOtherPeriod(line: LineItem, applied: AgreementTerm, terms: readonly AgreementTerm[], expectedCents: Cents): LineCause | null {
  if (line.amountBilledCents === expectedCents) return null;
  const other = terms.find((t) => {
    if (t.termId === applied.termId || t.helperId !== applied.helperId || t.serviceKey !== applied.serviceKey) return false;
    const price = priceServiceLine(line, t);
    return price.outcome === PriceOutcome.PRICED && price.expectedCents === line.amountBilledCents;
  });
  if (other === undefined) return null;
  return {
    kind: LineCauseKind.RATE_FROM_OTHER_PERIOD,
    termId: other.termId,
    relation: other.effectiveFrom > applied.effectiveFrom ? RateVersionRelation.LATER : RateVersionRelation.EARLIER,
    effectiveFrom: other.effectiveFrom,
    effectiveTo: other.effectiveTo,
  };
}

/** The plain-words story of a likely cause, for the line's explanation. */
const CAUSE_TEXT: Record<RateVersionRelationT, (cause: LineCause, billed: string) => string> = {
  [RateVersionRelation.LATER]: (cause, billed) => `${billed} is the newer rate, which only starts ${formatDay(cause.effectiveFrom)}. It looks like the new rate was used for work before the change.`,
  [RateVersionRelation.EARLIER]: (cause, billed) =>
    `${billed} is the older rate${cause.effectiveTo === null ? "" : `, which ended ${formatDay(cause.effectiveTo)}`}. It looks like the old rate was used after the change.`,
};

function priceServiceLine(line: LineItem, term: AgreementTerm): Price {
  const rules = term.pricingRules.filter((r) => PRICING_MODE_BY_RULE_KIND[r.kind] !== PricingMode.FEE);
  const modes = new Set(rules.map((r) => PRICING_MODE_BY_RULE_KIND[r.kind]));
  if (modes.size === 0) return cannotCompute(`The "${term.serviceLabel}" agreement only lists fees, not a price for the service.`);
  if (modes.size > 1) return cannotCompute(`The "${term.serviceLabel}" agreement mixes per-unit and hourly prices.`);
  const [mode] = modes as Set<Exclude<PricingMode, "FEE">>;
  return SERVICE_PRICER_BY_MODE[mode!](line, rules);
}

/**
 * A fee is looked up first in its own service, or the service of the line it
 * hangs off (relatedLineId). If that term has no fee with the line's label, or
 * there's no service, every agreement of the helper in effect is searched: a fee
 * agreed on its own (e.g. a fee-only "same-day-fee" term) still covers a fee
 * line tied to a babysitting visit. Finding none is a fact (NOT_COVERED), not a guess.
 */
function checkFeeLine({ line, bill, terms, linesById }: LineInput): LineResult {
  const related = line.relatedLineId === null ? undefined : linesById.get(line.relatedLineId);
  const serviceKey = line.serviceKey ?? related?.serviceKey ?? null;
  const date = lineDate(line) ?? (related ? lineDate(related) : null);

  const label = normalizeFeeLabel(line.label);
  const feesIn = (candidates: readonly AgreementTerm[]) =>
    candidates.flatMap((term) =>
      term.pricingRules
        .filter((r): r is FeeRule => r.kind === PricingRuleKind.FEE && normalizeFeeLabel(r.label) === label)
        .map((rule) => ({ term, rule })),
    );

  let ownService: AgreementTerm[] = [];
  if (serviceKey !== null) {
    const resolution = resolveTerm(serviceKey, date, terms, bill.period);
    if (resolution.kind === TermResolutionKind.AMBIGUOUS) return fromPrice(line, null, cannotCompute(resolution.reason));
    ownService = resolution.kind === TermResolutionKind.FOUND ? [resolution.term] : [];
  }
  const ownMatches = feesIn(ownService);
  const matches = ownMatches.length > 0 ? ownMatches : feesIn(terms.filter((t) => inEffectForLine(t, date, bill, terms)));
  if (matches.length === 0) return notCovered(line, `No agreement includes a "${line.label}".`);
  const appliedTerm = matches.every((m) => m.term === matches[0]!.term) ? matches[0]!.term : null;
  return fromPrice(line, appliedTerm, priceFeeLine(line, matches.map((m) => m.rule)));
}

function inEffectForLine(term: AgreementTerm, date: LocalDate | null, bill: Bill, versions: readonly AgreementTerm[]): boolean {
  return date !== null ? isInEffectOn(term, date, versions) : overlapsPeriod(term, bill.period, versions);
}

// ── LineCheck builders ─────────────────────────────────────────────────────

const describeTerm = (term: AgreementTerm): string =>
  `${term.serviceLabel}, ${term.effectiveTo === null ? `from ${formatDay(term.effectiveFrom)}` : `${formatDay(term.effectiveFrom)} to ${formatDay(term.effectiveTo)}`}`;

/** `causeOf` explains a differing amount, when the caller can (service lines). */
function fromPrice(line: LineItem, term: AgreementTerm | null, price: Price, causeOf: (expectedCents: Cents) => LineCause | null = () => null): LineResult {
  const billed = line.amountBilledCents;
  const appliedTerms = term === null ? [] : [term];
  const termAssumptions = term?.assumptions ?? [];
  if (price.outcome === PriceOutcome.CANNOT_COMPUTE) {
    return {
      appliedTerms,
      check: lineCheck(line, LineStatus.CANNOT_COMPUTE, null, [], appliedTerms, termAssumptions, `Billed ${formatCents(billed)}. Can't compute: ${price.reason}`, null),
    };
  }
  const matches = price.expectedCents === billed;
  const cause = matches ? null : causeOf(price.expectedCents);
  const termText = term === null ? "" : ` (${describeTerm(term)})`;
  const date = lineDate(line);
  const explanation = matches
    ? `Billed ${formatCents(billed)}, as agreed${termText}.`
    : cause !== null
      ? `Billed ${formatCents(billed)}, but the agreed price${date === null ? "" : ` on ${formatDay(date)}`} is ${formatCents(price.expectedCents)}${termText}. ${CAUSE_TEXT[cause.relation](cause, formatCents(billed))}`
      : `Billed ${formatCents(billed)}, but the agreed price is ${formatCents(price.expectedCents)}${termText}.`;
  return {
    appliedTerms,
    check: lineCheck(
      line,
      matches ? LineStatus.MATCHES : LineStatus.DIFFERS,
      price.expectedCents,
      price.breakdown,
      appliedTerms,
      [...termAssumptions, ...price.assumptions],
      explanation,
      cause,
    ),
  };
}

function notCovered(line: LineItem, reason: string): LineResult {
  return {
    appliedTerms: [],
    check: lineCheck(line, LineStatus.NOT_COVERED, null, [], [], [], `Billed ${formatCents(line.amountBilledCents)}. ${reason}`, null),
  };
}

function unverifiable(line: LineItem, explanation: string): LineResult {
  return { appliedTerms: [], check: lineCheck(line, LineStatus.UNVERIFIABLE, null, [], [], [], explanation, null) };
}

function lineCheck(
  line: LineItem,
  status: LineStatus,
  expectedCents: Cents | null,
  breakdown: LineCheck["breakdown"],
  appliedTerms: readonly AgreementTerm[],
  assumptions: string[],
  explanation: string,
  likelyCause: LineCause | null,
): LineCheck {
  return {
    lineId: line.lineId,
    status,
    billedCents: line.amountBilledCents,
    expectedCents,
    deltaCents: expectedCents === null ? null : line.amountBilledCents - expectedCents,
    breakdown,
    appliedTermIds: appliedTerms.map((t) => t.termId),
    assumptions,
    explanation,
    likelyCause,
  };
}
