/**
 * Money display for explanations, summaries and breakdown steps. Amounts are
 * integer cents everywhere; this is the only place they become "$1,234.50".
 *
 * Call sites: checker explanations and breakdowns, proposal summaries.
 */
import type { Cents } from "@helper-assistant/domain";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** $150 for whole dollars, $14.50 otherwise. */
export function formatCents(cents: Cents): string {
  const formatted = dollars.format(cents / 100);
  return cents % 100 === 0 ? formatted.replace(/\.00$/, "") : formatted;
}

/** Sum of integer cents. */
export const sumCents = (amounts: readonly Cents[]): Cents => amounts.reduce((total, amount) => total + amount, 0);
