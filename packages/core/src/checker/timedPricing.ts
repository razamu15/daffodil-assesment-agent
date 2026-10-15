/**
 * Prices a line by its start and end times against a term's time-based rules:
 * HOURLY, HOURLY_AFTER, FLAT_BLOCK and DAY_MULTIPLIER, composed as documented in
 * domain entities/agreement.ts.
 *
 * Method: cut the line at every point where the rate could change (each
 * afterTime and the block's untilTime on the service day's clock, and every
 * midnight), price each piece, then merge neighbouring pieces with the same
 * rate into breakdown steps. Times are read on the clock of the day the line
 * started, extended past midnight, so "after 10pm" keeps applying to 12:30am.
 * The calendar day of a piece (for DAY_MULTIPLIER) is its real date.
 *
 * Call site: lineChecks via SERVICE_PRICER_BY_MODE.
 */
import { BillableUnit, MultiplierScope, PricingRuleKind } from "@helper-assistant/domain";
import type { BreakdownStep, DayOfWeek, LineItem, LocalDateTime, PricingRule } from "@helper-assistant/domain";
import {
  absoluteMinutes,
  absoluteMinutesOfDate,
  dateOf,
  dateOfAbsoluteMinutes,
  dayOfWeek,
  MINUTES_PER_DAY,
  minutesOfTime,
} from "../calendar";
import { formatCents } from "../money";
import { cannotCompute, PriceOutcome, roundedCents } from "./price";
import type { Price } from "./price";

type RuleOf<K extends PricingRule["kind"]> = Extract<PricingRule, { kind: K }>;

/** Which hourly rate priced a piece of time. */
const HourlyRateKind = { BASE: "BASE", AFTER: "AFTER" } as const;
type HourlyRateKind = (typeof HourlyRateKind)[keyof typeof HourlyRateKind];

/**
 * Whether a DAY_MULTIPLIER scales a piece priced at this rate. null = the two
 * readings of UNSPECIFIED (base only vs all hourly rates) disagree, so the
 * piece can't be computed.
 */
const MULTIPLIER_SCALES: Record<MultiplierScope, Record<HourlyRateKind, boolean | null>> = {
  [MultiplierScope.BASE_RATE]: { BASE: true, AFTER: false },
  [MultiplierScope.ALL_HOURLY_RATES]: { BASE: true, AFTER: true },
  [MultiplierScope.UNSPECIFIED]: { BASE: true, AFTER: null },
};

/** A stretch of the line's time: covered by the flat block, or priced at an hourly rate. */
const PieceKind = { BLOCK: "BLOCK", HOURLY: "HOURLY" } as const;

type Piece =
  | { kind: typeof PieceKind.BLOCK; minutes: number }
  | { kind: typeof PieceKind.HOURLY; minutes: number; rate: HourlyRateKind; rule: RuleOf<"HOURLY"> | RuleOf<"HOURLY_AFTER">; factor: number; day: DayOfWeek };

const formatHours = (minutes: number): string => `${Number((minutes / 60).toFixed(2))}h`;

const rulesOf = <K extends PricingRule["kind"]>(rules: readonly PricingRule[], kind: K): RuleOf<K>[] =>
  rules.filter((r): r is RuleOf<K> => r.kind === kind);

export function priceTimedLine(line: LineItem, rules: readonly PricingRule[]): Price {
  const hourly = rulesOf(rules, PricingRuleKind.HOURLY);
  const after = rulesOf(rules, PricingRuleKind.HOURLY_AFTER);
  const blocks = rulesOf(rules, PricingRuleKind.FLAT_BLOCK);
  const multipliers = rulesOf(rules, PricingRuleKind.DAY_MULTIPLIER);

  if (hourly.length > 1) return cannotCompute("The agreement lists more than one base hourly rate.");
  if (blocks.length > 1) return cannotCompute("The agreement lists more than one flat block.");
  if (new Set(after.map((a) => a.afterTime)).size !== after.length) return cannotCompute("The agreement lists two rates after the same time.");
  if (new Set(multipliers.map((m) => m.dayOfWeek)).size !== multipliers.length) return cannotCompute("The agreement lists two multipliers for the same day.");

  if (line.startAt === null || line.endAt === null) return priceByStatedHours(line, hourly, rules);
  return priceByTimes(line.startAt, line.endAt, { base: hourly[0] ?? null, after, block: blocks[0] ?? null, multipliers });
}

/** Without times, only a plain hourly rate can be applied, to hours the bill states. */
function priceByStatedHours(line: LineItem, hourly: RuleOf<"HOURLY">[], rules: readonly PricingRule[]): Price {
  const plainHourly = rules.length === 1 && hourly.length === 1;
  if (!plainHourly || line.unit !== BillableUnit.HOUR || line.quantity === null) {
    return cannotCompute("The line has no start and end times, and this agreement's rate depends on them.");
  }
  const rate = hourly[0]!.amountCents;
  const assumptions: string[] = [];
  const amount = roundedCents(line.quantity * rate, "The amount", assumptions);
  return {
    outcome: PriceOutcome.PRICED,
    expectedCents: amount,
    breakdown: [{ description: `${line.quantity}h × ${formatCents(rate)}/hr`, amountCents: amount }],
    assumptions,
  };
}

type TimedRules = {
  base: RuleOf<"HOURLY"> | null;
  after: RuleOf<"HOURLY_AFTER">[];
  block: RuleOf<"FLAT_BLOCK"> | null;
  multipliers: RuleOf<"DAY_MULTIPLIER">[];
};

function priceByTimes(startAt: LocalDateTime, endAt: LocalDateTime, rules: TimedRules): Price {
  const start = absoluteMinutes(startAt);
  const end = absoluteMinutes(endAt);
  if (end <= start) return cannotCompute(`The line ends (${endAt}) before it starts (${startAt}).`);

  const serviceDayStart = absoluteMinutesOfDate(dateOf(startAt));
  const blockUntil = rules.block === null ? null : serviceDayStart + minutesOfTime(rules.block.untilTime);
  if (rules.block !== null && start >= blockUntil!) {
    return cannotCompute(`The line starts after the flat block ends (${rules.block.untilTime}), so the agreement doesn't say how to price it.`);
  }
  if (rules.block !== null && end > blockUntil! && !rules.after.some((a) => a.afterTime === rules.block!.untilTime)) {
    return cannotCompute(`Time past ${rules.block.untilTime} isn't covered by the flat block and no rate after ${rules.block.untilTime} was agreed.`);
  }

  const cuts = new Set<number>([start, end]);
  for (const a of rules.after) cuts.add(serviceDayStart + minutesOfTime(a.afterTime));
  if (blockUntil !== null) cuts.add(blockUntil);
  for (let midnight = serviceDayStart + MINUTES_PER_DAY; midnight < end; midnight += MINUTES_PER_DAY) cuts.add(midnight);
  const points = [...cuts].filter((p) => p >= start && p <= end).sort((a, b) => a - b);

  const pieces: Piece[] = [];
  const assumptions: string[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const from = points[i]!;
    const minutes = points[i + 1]! - from;
    if (blockUntil !== null && from < blockUntil) {
      pieces.push({ kind: PieceKind.BLOCK, minutes });
      continue;
    }
    const piece = hourlyPiece(from, minutes, from - serviceDayStart, rules, assumptions);
    if (typeof piece === "string") return cannotCompute(piece);
    pieces.push(piece);
  }
  return toPrice(mergePieces(pieces), rules, assumptions);
}

/** A piece of time priced by an hourly rate, or the reason it can't be. */
function hourlyPiece(from: number, minutes: number, clock: number, rules: TimedRules, assumptions: string[]): Piece | string {
  const afterRule = rules.after
    .filter((a) => minutesOfTime(a.afterTime) <= clock)
    .sort((a, b) => minutesOfTime(b.afterTime) - minutesOfTime(a.afterTime))[0];
  const rate = afterRule ? HourlyRateKind.AFTER : HourlyRateKind.BASE;
  const rule = afterRule ?? rules.base;
  if (rule === null) return "No hourly rate was agreed for part of this time.";

  const day = dayOfWeek(dateOfAbsoluteMinutes(from));
  const multiplier = rules.multipliers.find((m) => m.dayOfWeek === day);
  if (multiplier === undefined) return { kind: PieceKind.HOURLY, minutes, rate, rule, factor: 1, day };

  const scales = MULTIPLIER_SCALES[multiplier.appliesTo][rate];
  if (scales === null) {
    return `It isn't agreed whether the ${day} ×${multiplier.multiplier} also applies to the rate after ${(rule as RuleOf<"HOURLY_AFTER">).afterTime}.`;
  }
  if (scales && multiplier.appliesTo === MultiplierScope.UNSPECIFIED) {
    assumptions.push(`${day} ×${multiplier.multiplier} applied to the base rate; that reading isn't in doubt for these hours.`);
  }
  return { kind: PieceKind.HOURLY, minutes, rate, rule, factor: scales ? multiplier.multiplier : 1, day };
}

/** Neighbouring pieces at the same rate and factor become one breakdown step. */
function mergePieces(pieces: Piece[]): Piece[] {
  const merged: Piece[] = [];
  for (const piece of pieces) {
    const last = merged[merged.length - 1];
    const same =
      last !== undefined &&
      last.kind === piece.kind &&
      (piece.kind === PieceKind.BLOCK || (last.kind === PieceKind.HOURLY && last.rule === piece.rule && last.factor === piece.factor));
    if (same) last.minutes += piece.minutes;
    else merged.push({ ...piece });
  }
  return merged;
}

function toPrice(pieces: Piece[], rules: TimedRules, assumptions: string[]): Price {
  const breakdown: BreakdownStep[] = pieces.map((piece) => {
    if (piece.kind === PieceKind.BLOCK) {
      const block = rules.block!;
      return { description: `Flat ${formatCents(block.amountCents)} until ${block.untilTime}`, amountCents: block.amountCents };
    }
    const rateText = `${formatCents(piece.rule.amountCents)}/hr${piece.rate === HourlyRateKind.AFTER ? ` after ${(piece.rule as RuleOf<"HOURLY_AFTER">).afterTime}` : ""}`;
    const factorText = piece.factor === 1 ? "" : ` × ${piece.factor} (${piece.day})`;
    const description = `${formatHours(piece.minutes)} × ${rateText}${factorText}`;
    const amount = roundedCents((piece.minutes * piece.rule.amountCents * piece.factor) / 60, description, assumptions);
    return { description, amountCents: amount };
  });
  return {
    outcome: PriceOutcome.PRICED,
    expectedCents: breakdown.reduce((total, step) => total + step.amountCents, 0),
    breakdown,
    assumptions,
  };
}
