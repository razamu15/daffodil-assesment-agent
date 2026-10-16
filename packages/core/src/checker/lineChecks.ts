/**
 * One LineCheck per bill line (Doc 3 §3.1). Two tables drive it:
 *   LINE_CHECKER_BY_KIND     how each LineKind is checked (service, fee, or not priceable)
 *   PRICING_MODE_BY_RULE_KIND which rule kinds price which kind of line, so one engine
 *                            evaluates every term and helpers differ only in data
 *
 * Call site: checkBill.
 */
import { LineKind, LineStatus, PricingRuleKind } from "@helper-assistant/domain";
import type { AgreementTerm, Bill, Cents, LineCheck, LineItem, LocalDate, PricingRule } from "@helper-assistant/domain";
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
      return fromPrice(line, resolution.term, priceServiceLine(line, resolution.term));
  }
}

function priceServiceLine(line: LineItem, term: AgreementTerm): Price {
  const rules = term.pricingRules.filter((r) => PRICING_MODE_BY_RULE_KIND[r.kind] !== PricingMode.FEE);
  const modes = new Set(rules.map((r) => PRICING_MODE_BY_RULE_KIND[r.kind]));
  if (modes.size === 0) return cannotCompute(`The "${term.serviceLabel}" agreement only lists fees, not a price for the service.`);
  if (modes.size > 1) return cannotCompute(`The "${term.serviceLabel}" agreement mixes per-unit and hourly prices.`);
  const [mode] = modes as Set<Exclude<PricingMode, "FEE">>;
  return SERVICE_PRICER_BY_MODE[mode!](line, rules);
}

/**
 * A fee belongs to its own service, or to the service of the line it hangs off
 * (relatedLineId). With neither, every agreement in effect is searched for a fee
 * with the same label: finding none is a fact (NOT_COVERED), not a guess.
 */
function checkFeeLine({ line, bill, terms, linesById }: LineInput): LineResult {
  const related = line.relatedLineId === null ? undefined : linesById.get(line.relatedLineId);
  const serviceKey = line.serviceKey ?? related?.serviceKey ?? null;
  const date = lineDate(line) ?? (related ? lineDate(related) : null);

  let candidates: AgreementTerm[];
  if (serviceKey !== null) {
    const resolution = resolveTerm(serviceKey, date, terms, bill.period);
    if (resolution.kind === TermResolutionKind.AMBIGUOUS) return fromPrice(line, null, cannotCompute(resolution.reason));
    candidates = resolution.kind === TermResolutionKind.FOUND ? [resolution.term] : [];
  } else {
    candidates = terms.filter((t) => inEffectForLine(t, date, bill, terms));
  }

  const label = normalizeFeeLabel(line.label);
  const matches = candidates.flatMap((term) =>
    term.pricingRules
      .filter((r): r is FeeRule => r.kind === PricingRuleKind.FEE && normalizeFeeLabel(r.label) === label)
      .map((rule) => ({ term, rule })),
  );
  if (matches.length === 0) return notCovered(line, `No agreement includes a "${line.label}".`);
  const appliedTerm = matches.every((m) => m.term === matches[0]!.term) ? matches[0]!.term : null;
  return fromPrice(line, appliedTerm, priceFeeLine(line, matches.map((m) => m.rule)));
}

function inEffectForLine(term: AgreementTerm, date: LocalDate | null, bill: Bill, versions: readonly AgreementTerm[]): boolean {
  return date !== null ? isInEffectOn(term, date, versions) : overlapsPeriod(term, bill.period, versions);
}

// ── LineCheck builders ─────────────────────────────────────────────────────

const describeTerm = (term: AgreementTerm): string =>
  `${term.serviceLabel}, ${term.effectiveTo === null ? `from ${term.effectiveFrom}` : `${term.effectiveFrom} to ${term.effectiveTo}`}`;

function fromPrice(line: LineItem, term: AgreementTerm | null, price: Price): LineResult {
  const billed = line.amountBilledCents;
  const appliedTerms = term === null ? [] : [term];
  const termAssumptions = term?.assumptions ?? [];
  if (price.outcome === PriceOutcome.CANNOT_COMPUTE) {
    return {
      appliedTerms,
      check: lineCheck(line, LineStatus.CANNOT_COMPUTE, null, [], appliedTerms, termAssumptions, `Billed ${formatCents(billed)}. Can't compute: ${price.reason}`),
    };
  }
  const matches = price.expectedCents === billed;
  const termText = term === null ? "" : ` (${describeTerm(term)})`;
  const explanation = matches
    ? `Billed ${formatCents(billed)}, as agreed${termText}.`
    : `Billed ${formatCents(billed)}, agreed ${formatCents(price.expectedCents)}${termText}.`;
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
    ),
  };
}

function notCovered(line: LineItem, reason: string): LineResult {
  return {
    appliedTerms: [],
    check: lineCheck(line, LineStatus.NOT_COVERED, null, [], [], [], `Billed ${formatCents(line.amountBilledCents)}. ${reason}`),
  };
}

function unverifiable(line: LineItem, explanation: string): LineResult {
  return { appliedTerms: [], check: lineCheck(line, LineStatus.UNVERIFIABLE, null, [], [], [], explanation) };
}

function lineCheck(
  line: LineItem,
  status: LineStatus,
  expectedCents: Cents | null,
  breakdown: LineCheck["breakdown"],
  appliedTerms: readonly AgreementTerm[],
  assumptions: string[],
  explanation: string,
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
  };
}
