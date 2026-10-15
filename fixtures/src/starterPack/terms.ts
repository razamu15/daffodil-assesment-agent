/**
 * Expected agreement terms after Jordan confirms the starter pack (Doc 4 §6.2).
 *
 * Theo's "$25 a walk" from the typed notes is intentionally absent: the dated
 * Aug 27 text ($28/$38 from September) outranks undated notes (Doc 3 §3.5). The
 * agent should surface that disagreement to Jordan, not silently store $25.
 */
import { DayOfWeek, MultiplierScope, PricingRuleKind, ScheduleKind } from "@helper-assistant/domain";
import type { AgreementTerm } from "@helper-assistant/domain";
import { docIds, STARTER_PACK_UPLOADED_AT } from "./documents";
import { helperIds } from "./people";

/** Each helper's service keys. Bill lines point at these. */
export const serviceKeys = {
  priyaStandard: "standard",
  priyaDateNight: "date-night",
  lupeRegular: "regular",
  lupeDeep: "deep-clean",
  theoWalk30: "walk-30",
  theoWalk60: "walk-60",
} as const;

export const termIds = {
  priyaStandard: "term-priya-standard",
  priyaDateNight: "term-priya-date-night",
  lupeRegular140: "term-lupe-regular-140",
  lupeRegular150: "term-lupe-regular-150",
  lupeDeep: "term-lupe-deep",
  theoWalk30: "term-theo-walk-30",
  theoWalk60: "term-theo-walk-60",
} as const;

const saved = { createdAt: STARTER_PACK_UPLOADED_AT, supersedesTermId: null, version: 1 } as const;

export const starterPackTerms: AgreementTerm[] = [
  {
    ...saved,
    termId: termIds.priyaStandard,
    createdByActionRef: 4,
    helperId: helperIds.priya,
    serviceKey: serviceKeys.priyaStandard,
    serviceLabel: "Babysitting",
    pricingRules: [
      { kind: PricingRuleKind.HOURLY, amountCents: 2200 },
      { kind: PricingRuleKind.HOURLY_AFTER, afterTime: "22:00", amountCents: 2800 },
      { kind: PricingRuleKind.DAY_MULTIPLIER, dayOfWeek: DayOfWeek.SUN, multiplier: 1.5, appliesTo: MultiplierScope.BASE_RATE },
    ],
    schedule: { kind: ScheduleKind.AD_HOC },
    effectiveFrom: "2026-06-14",
    effectiveTo: null,
    sourceDocId: docIds.priyaRates,
    sourceQuote: "I usually do $22/hr. After 10pm it's $28/hr, and Sundays are time and a half",
    assumptions: [
      "Year 2026 inferred for 'Sun, Jun 14' (Jun 14 is a Sunday in 2026).",
      "Sunday time and a half assumed to apply to the base $22/hr rate.",
      "Schedule treated as ad hoc: notes say 'usually' Wednesdays plus some weekend nights.",
    ],
  },
  {
    ...saved,
    termId: termIds.priyaDateNight,
    createdByActionRef: 5,
    helperId: helperIds.priya,
    serviceKey: serviceKeys.priyaDateNight,
    serviceLabel: "Date night",
    pricingRules: [
      { kind: PricingRuleKind.FLAT_BLOCK, amountCents: 10000, untilTime: "23:00" },
      { kind: PricingRuleKind.HOURLY_AFTER, afterTime: "23:00", amountCents: 2800 },
    ],
    schedule: { kind: ScheduleKind.AD_HOC },
    effectiveFrom: "2026-06-14",
    effectiveTo: null,
    sourceDocId: docIds.priyaRates,
    sourceQuote: "For date nights I can do a flat $100 until 11! If you're out past 11 it's my late rate after that",
    assumptions: [
      "Year 2026 inferred for 'Sun, Jun 14'.",
      "'My late rate' assumed to be the $28/hr after-10pm rate, the only late rate Priya gave.",
    ],
  },
  {
    ...saved,
    termId: termIds.lupeRegular140,
    createdByActionRef: 6,
    // Closed by the Aug 28 change: version bumped when effectiveTo was set.
    version: 2,
    helperId: helperIds.lupe,
    serviceKey: serviceKeys.lupeRegular,
    serviceLabel: "Regular cleaning",
    pricingRules: [{ kind: PricingRuleKind.FLAT_PER_UNIT, unit: "VISIT", amountCents: 14000 }],
    schedule: { kind: ScheduleKind.WEEKLY_ON, days: [DayOfWeek.TUE] },
    effectiveFrom: "2026-01-14",
    effectiveTo: "2026-09-14",
    sourceDocId: docIds.lupeRates,
    sourceQuote: "For your size house $140 each visit.",
    assumptions: ["Year 2026 inferred for 'Wed, Jan 14' (Jan 14 is a Wednesday in 2026)."],
  },
  {
    ...saved,
    termId: termIds.lupeRegular150,
    createdByActionRef: 8,
    supersedesTermId: termIds.lupeRegular140,
    helperId: helperIds.lupe,
    serviceKey: serviceKeys.lupeRegular,
    serviceLabel: "Regular cleaning",
    pricingRules: [{ kind: PricingRuleKind.FLAT_PER_UNIT, unit: "VISIT", amountCents: 15000 }],
    schedule: { kind: ScheduleKind.WEEKLY_ON, days: [DayOfWeek.TUE] },
    effectiveFrom: "2026-09-15",
    effectiveTo: null,
    sourceDocId: docIds.lupeRateChange,
    sourceQuote: "starting the 15th my regular visit will be $150",
    assumptions: ["'The 15th' in a message dated Fri Aug 28 read as the next 15th: 2026-09-15."],
  },
  {
    ...saved,
    termId: termIds.lupeDeep,
    createdByActionRef: 7,
    helperId: helperIds.lupe,
    serviceKey: serviceKeys.lupeDeep,
    serviceLabel: "Deep clean",
    pricingRules: [{ kind: PricingRuleKind.FLAT_PER_UNIT, unit: "VISIT", amountCents: 22000 }],
    schedule: { kind: ScheduleKind.AD_HOC },
    effectiveFrom: "2026-01-14",
    effectiveTo: null,
    sourceDocId: docIds.lupeRates,
    sourceQuote: "Deep clean (inside oven, fridge, baseboards) is $220",
    assumptions: ["Year 2026 inferred for 'Wed, Jan 14'.", "Unchanged on Aug 28: 'Deep clean stays the same'."],
  },
  {
    ...saved,
    termId: termIds.theoWalk30,
    createdByActionRef: 9,
    helperId: helperIds.theo,
    serviceKey: serviceKeys.theoWalk30,
    serviceLabel: "30-minute walk",
    pricingRules: [{ kind: PricingRuleKind.FLAT_PER_UNIT, unit: "WALK", amountCents: 2800 }],
    schedule: { kind: ScheduleKind.WEEKDAYS },
    effectiveFrom: "2026-09-01",
    effectiveTo: null,
    sourceDocId: docIds.theoRates,
    sourceQuote: "I'm updating my rates for September onward: $28 for a 30-min walk, $38 for an hour.",
    assumptions: [
      "'September onward' read as from 2026-09-01.",
      "Jordan's notes say $25 a walk; the newer, direct Aug 27 text takes precedence.",
    ],
  },
  {
    ...saved,
    termId: termIds.theoWalk60,
    createdByActionRef: 10,
    helperId: helperIds.theo,
    serviceKey: serviceKeys.theoWalk60,
    serviceLabel: "60-minute walk",
    pricingRules: [{ kind: PricingRuleKind.FLAT_PER_UNIT, unit: "WALK", amountCents: 3800 }],
    schedule: { kind: ScheduleKind.AD_HOC },
    effectiveFrom: "2026-09-01",
    effectiveTo: null,
    sourceDocId: docIds.theoRates,
    sourceQuote: "$38 for an hour.",
    assumptions: ["'September onward' read as from 2026-09-01.", "Notes: 'sometimes he does a long one', so ad hoc."],
  },
];
