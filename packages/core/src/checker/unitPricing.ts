/**
 * Per-unit and fee pricing: FLAT_PER_UNIT (amount × quantity of VISITs or WALKs)
 * and FEE (a fee line whose label matches an agreed fee).
 *
 * Call site: lineChecks.
 */
import type { LineItem, PricingRule } from "@helper-assistant/domain";
import { formatCents } from "../money";
import { cannotCompute, PriceOutcome, roundedCents } from "./price";
import type { Price } from "./price";

type FlatPerUnitRule = Extract<PricingRule, { kind: "FLAT_PER_UNIT" }>;
export type FeeRule = Extract<PricingRule, { kind: "FEE" }>;

/** `rules` are the term's FLAT_PER_UNIT rules (the pricing-mode table guarantees nothing else is mixed in). */
export function priceUnitLine(line: LineItem, rules: readonly PricingRule[]): Price {
  if (rules.length > 1) return cannotCompute("The agreement lists more than one per-unit price for this service.");
  const rule = rules[0] as FlatPerUnitRule;
  if (line.quantity === null) return cannotCompute(`The bill doesn't say how many ${rule.unit.toLowerCase()}s this line is for.`);
  if (line.unit !== rule.unit) {
    return cannotCompute(`The line is billed in ${line.unit === null ? "unstated units" : `${line.unit.toLowerCase()}s`}, but the agreement prices per ${rule.unit.toLowerCase()}.`);
  }
  const assumptions: string[] = [];
  const description = `${line.quantity} ${rule.unit.toLowerCase()}${line.quantity === 1 ? "" : "s"} × ${formatCents(rule.amountCents)}`;
  const amount = roundedCents(line.quantity * rule.amountCents, description, assumptions);
  return { outcome: PriceOutcome.PRICED, expectedCents: amount, breakdown: [{ description, amountCents: amount }], assumptions };
}

/** Labels compare case- and spacing-insensitively: "Last minute fee" matches "last  minute fee". */
export const normalizeFeeLabel = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * `matching` are the agreed FEE rules whose label matches the line (at least one).
 * A fee line is one occurrence of the fee unless it states a quantity.
 */
export function priceFeeLine(line: LineItem, matching: readonly FeeRule[]): Price {
  const amounts = new Set(matching.map((rule) => rule.amountCents));
  if (amounts.size > 1) return cannotCompute(`More than one agreed fee is called "${line.label}", with different amounts.`);
  const rule = matching[0]!;
  const count = line.quantity ?? 1;
  const assumptions = rule.condition === null ? [] : [`The fee applies only "${rule.condition}". Whether that held isn't checked.`];
  const description = `${count === 1 ? "" : `${count} × `}${rule.label} ${formatCents(rule.amountCents)}`;
  const amount = roundedCents(count * rule.amountCents, description, assumptions);
  return { outcome: PriceOutcome.PRICED, expectedCents: amount, breakdown: [{ description, amountCents: amount }], assumptions };
}
