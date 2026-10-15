/**
 * Plain-words text for proposal cards ("Lupe: Regular cleaning $140/visit →
 * $150/visit from 2026-09-15"). One description per rule kind, as a table.
 *
 * Call sites: proposals.ts (summaries), anything that shows a term in one line.
 */
import { BillableUnit, MultiplierScope, PricingRuleKind } from "@helper-assistant/domain";
import type { BillableUnit as BillableUnitT, MultiplierScope as MultiplierScopeT, PricingRule, TermContent } from "@helper-assistant/domain";
import { formatCents } from "../money";

const UNIT_TEXT: Record<BillableUnitT, string> = {
  [BillableUnit.HOUR]: "hr",
  [BillableUnit.VISIT]: "visit",
  [BillableUnit.WALK]: "walk",
};

const SCOPE_TEXT: Record<MultiplierScopeT, string> = {
  [MultiplierScope.BASE_RATE]: "base rate",
  [MultiplierScope.ALL_HOURLY_RATES]: "all hourly rates",
  [MultiplierScope.UNSPECIFIED]: "which rates not stated",
};

type RuleText = { [K in PricingRule["kind"]]: (rule: Extract<PricingRule, { kind: K }>) => string };

const PRICING_RULE_TEXT: RuleText = {
  [PricingRuleKind.FLAT_PER_UNIT]: (r) => `${formatCents(r.amountCents)}/${UNIT_TEXT[r.unit]}`,
  [PricingRuleKind.HOURLY]: (r) => `${formatCents(r.amountCents)}/hr`,
  [PricingRuleKind.HOURLY_AFTER]: (r) => `${formatCents(r.amountCents)}/hr after ${r.afterTime}`,
  [PricingRuleKind.DAY_MULTIPLIER]: (r) => `${r.dayOfWeek} ×${r.multiplier} (${SCOPE_TEXT[r.appliesTo]})`,
  [PricingRuleKind.FLAT_BLOCK]: (r) => `flat ${formatCents(r.amountCents)} until ${r.untilTime}`,
  [PricingRuleKind.FEE]: (r) => `${r.label} ${formatCents(r.amountCents)}${r.condition === null ? "" : ` (${r.condition})`}`,
};

export function describeRule(rule: PricingRule): string {
  return (PRICING_RULE_TEXT[rule.kind] as (r: PricingRule) => string)(rule);
}

export function describeRules(term: Pick<TermContent, "pricingRules">): string {
  return term.pricingRules.map(describeRule).join(", ");
}
