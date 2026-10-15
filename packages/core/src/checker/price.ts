/**
 * The result of pricing one line against one term, before it becomes a LineCheck.
 * Either an expected amount with its "why", or an honest "can't compute" with the
 * reason. There is no third option where a missing input is filled with a guess.
 *
 * Call sites: unitPricing, timedPricing (produce it), lineChecks (consume it).
 */
import type { BreakdownStep, Cents } from "@helper-assistant/domain";

export const PriceOutcome = {
  PRICED: "PRICED",
  CANNOT_COMPUTE: "CANNOT_COMPUTE",
} as const;

export type Price =
  | { outcome: typeof PriceOutcome.PRICED; expectedCents: Cents; breakdown: BreakdownStep[]; assumptions: string[] }
  | { outcome: typeof PriceOutcome.CANNOT_COMPUTE; reason: string };

export const cannotCompute = (reason: string): Price => ({ outcome: PriceOutcome.CANNOT_COMPUTE, reason });

/**
 * Rounds a fractional-cent amount to whole cents, recording the rounding as an
 * assumption so the "why" stays honest. Whole amounts pass through untouched.
 */
export function roundedCents(exact: number, what: string, assumptions: string[]): Cents {
  const cents = Math.round(exact);
  if (Math.abs(exact - cents) > 1e-9) assumptions.push(`${what} rounded to the nearest cent.`);
  return cents;
}
