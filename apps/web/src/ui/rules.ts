/**
 * Agreement terms in plain words: "$22 an hour", "$28 an hour after 10pm",
 * "Sundays: time and a half (base rate only)". One description per rule kind,
 * as a table.
 *
 * Call sites: Agreements (term cards), Decisions (agreement-change cards).
 */
import { BillableUnit, DayOfWeek, MultiplierScope, PricingRuleKind, ScheduleKind } from "@helper-assistant/domain";
import type {
  BillableUnit as BillableUnitT,
  DayOfWeek as DayOfWeekT,
  MultiplierScope as MultiplierScopeT,
  PricingRule,
  ServiceSchedule,
} from "@helper-assistant/domain";
import { formatCents, formatTime } from "./format";

export const DAY_NAME: Record<DayOfWeekT, string> = {
  [DayOfWeek.MON]: "Monday",
  [DayOfWeek.TUE]: "Tuesday",
  [DayOfWeek.WED]: "Wednesday",
  [DayOfWeek.THU]: "Thursday",
  [DayOfWeek.FRI]: "Friday",
  [DayOfWeek.SAT]: "Saturday",
  [DayOfWeek.SUN]: "Sunday",
};

const UNIT_TEXT: Record<BillableUnitT, string> = {
  [BillableUnit.HOUR]: "hour",
  [BillableUnit.VISIT]: "visit",
  [BillableUnit.WALK]: "walk",
};

const SCOPE_TEXT: Record<MultiplierScopeT, string> = {
  [MultiplierScope.BASE_RATE]: "base rate only",
  [MultiplierScope.ALL_HOURLY_RATES]: "all hourly rates",
  [MultiplierScope.UNSPECIFIED]: "which rates wasn't said",
};

const multiplierText = (m: number): string => (m === 1.5 ? "time and a half" : m === 2 ? "double time" : `× ${m}`);

type RuleText = { [K in PricingRule["kind"]]: (rule: Extract<PricingRule, { kind: K }>) => string };

const PRICING_RULE_TEXT: RuleText = {
  [PricingRuleKind.FLAT_PER_UNIT]: (r) => `${formatCents(r.amountCents)} per ${UNIT_TEXT[r.unit]}`,
  [PricingRuleKind.HOURLY]: (r) => `${formatCents(r.amountCents)} an hour`,
  [PricingRuleKind.HOURLY_AFTER]: (r) => `${formatCents(r.amountCents)} an hour after ${formatTime(r.afterTime)}`,
  [PricingRuleKind.DAY_MULTIPLIER]: (r) => `${DAY_NAME[r.dayOfWeek]}s: ${multiplierText(r.multiplier)} (${SCOPE_TEXT[r.appliesTo]})`,
  [PricingRuleKind.FLAT_BLOCK]: (r) => `Flat ${formatCents(r.amountCents)} until ${formatTime(r.untilTime)}`,
  [PricingRuleKind.FEE]: (r) => `${r.label}: ${formatCents(r.amountCents)}${r.condition === null ? "" : ` (${r.condition})`}`,
};

export const describeRule = (rule: PricingRule): string => (PRICING_RULE_TEXT[rule.kind] as (r: PricingRule) => string)(rule);

type ScheduleText = { [K in ServiceSchedule["kind"]]: (s: Extract<ServiceSchedule, { kind: K }>) => string };

const SCHEDULE_TEXT: ScheduleText = {
  [ScheduleKind.WEEKLY_ON]: (s) => `Every ${s.days.map((d) => DAY_NAME[d]).join(" and ")}`,
  [ScheduleKind.WEEKDAYS]: () => "Weekdays",
  [ScheduleKind.AD_HOC]: () => "No fixed schedule",
  [ScheduleKind.UNSPECIFIED]: () => "Schedule not known",
};

export const describeSchedule = (schedule: ServiceSchedule): string => (SCHEDULE_TEXT[schedule.kind] as (s: ServiceSchedule) => string)(schedule);
