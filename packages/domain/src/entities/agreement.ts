/**
 * AgreementTerm, PricingRule, ServiceSchedule (Doc 3 §2.3).
 *
 * Versioned rows with effective dates (Doc 3 S1): a rate change closes the old
 * row (effectiveTo) and adds a new one, so Sep 1 is checked against the rate in
 * effect on Sep 1. One term prices one service (serviceKey) for one helper; the term's
 * price is the *composition* of its pricingRules (Priya's standard babysitting
 * is HOURLY + HOURLY_AFTER + DAY_MULTIPLIER). A change to any component is a new
 * version of the whole term.
 *
 * Rule composition, for checker implementers (Track A):
 *   HOURLY          base rate for every hour no other hourly rule claims.
 *   HOURLY_AFTER    hours at/after afterTime (through midnight to the line's end)
 *                   use this rate instead. With several, the latest afterTime wins.
 *   FLAT_BLOCK      one flat amount covers start → untilTime. Time past untilTime is
 *                   priced by a HOURLY_AFTER whose afterTime == untilTime; if none
 *                   exists the overage is CANNOT_COMPUTE.
 *   DAY_MULTIPLIER  scales hours that fall on dayOfWeek, limited by appliesTo.
 *   FLAT_PER_UNIT   amount × line quantity, for VISIT or WALK units.
 *   FEE             covers a FEE line whose label matches.
 * A term that fits none of these is not forced into the nearest rule: it becomes
 * a HelperNote (UNENCODED_TERM) and lines touching it are CANNOT_COMPUTE.
 */
import { z } from "zod";
import {
  BillableUnitSchema,
  DayOfWeekSchema,
  MultiplierScopeSchema,
  PricingRuleKind,
  ScheduleKind,
} from "../enums";
import {
  ActionRefSchema,
  IdSchema,
  InstantSchema,
  LocalDateSchema,
  LocalTimeSchema,
  NonNegativeCentsSchema,
  ServiceKeySchema,
  VersionSchema,
} from "../primitives";

export const PricingRuleSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(PricingRuleKind.FLAT_PER_UNIT),
    unit: BillableUnitSchema.extract(["VISIT", "WALK"]),
    amountCents: NonNegativeCentsSchema,
  }),
  z.object({
    kind: z.literal(PricingRuleKind.HOURLY),
    amountCents: NonNegativeCentsSchema.describe("Rate per hour in cents"),
  }),
  z.object({
    kind: z.literal(PricingRuleKind.HOURLY_AFTER),
    afterTime: LocalTimeSchema,
    amountCents: NonNegativeCentsSchema.describe("Rate per hour in cents for hours at/after afterTime"),
  }),
  z.object({
    kind: z.literal(PricingRuleKind.DAY_MULTIPLIER),
    dayOfWeek: DayOfWeekSchema,
    multiplier: z.number().positive(),
    appliesTo: MultiplierScopeSchema,
  }),
  z.object({
    kind: z.literal(PricingRuleKind.FLAT_BLOCK),
    amountCents: NonNegativeCentsSchema,
    untilTime: LocalTimeSchema,
  }),
  z.object({
    kind: z.literal(PricingRuleKind.FEE),
    label: z.string().min(1),
    amountCents: NonNegativeCentsSchema,
    /** When the fee applies, in the helper's words. null = unconditional. */
    condition: z.string().nullable(),
  }),
]);
export type PricingRule = z.infer<typeof PricingRuleSchema>;

export const ServiceScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(ScheduleKind.WEEKLY_ON), days: z.array(DayOfWeekSchema).min(1) }),
  z.object({ kind: z.literal(ScheduleKind.WEEKDAYS) }),
  z.object({ kind: z.literal(ScheduleKind.AD_HOC) }),
  z.object({ kind: z.literal(ScheduleKind.UNSPECIFIED) }),
]);
export type ServiceSchedule = z.infer<typeof ServiceScheduleSchema>;

/**
 * The agreed content of a term: what a proposal carries and what Jordan confirms.
 * AgreementTerm adds identity and lineage once it's saved.
 */
export const TermContentSchema = z.object({
  helperId: IdSchema,
  /** Which of the helper's services this prices. All versions of a term share it. */
  serviceKey: ServiceKeySchema,
  /** Human name for the service ("Date night", "Tutoring"). Display only. */
  serviceLabel: z.string().min(1),
  pricingRules: z.array(PricingRuleSchema).min(1),
  schedule: ServiceScheduleSchema,
  effectiveFrom: LocalDateSchema,
  /** Inclusive last day. null = open-ended. */
  effectiveTo: LocalDateSchema.nullable(),
  sourceDocId: IdSchema,
  /** The words the term came from, verbatim. */
  sourceQuote: z.string().min(1),
  /** Every inference, in plain words: "effectiveFrom inferred as 2026-09-15 from 'the 15th' in a message dated Aug 28". */
  assumptions: z.array(z.string()),
});
export type TermContent = z.infer<typeof TermContentSchema>;

export const AgreementTermSchema = TermContentSchema.extend({
  termId: IdSchema,
  supersedesTermId: IdSchema.nullable(),
  createdByActionRef: ActionRefSchema,
  createdAt: InstantSchema,
  /**
   * Bumped when the term is closed (effectiveTo set), or when an earlier rate is
   * added before it (ADD_EARLIER_TERM moves effectiveFrom back). Content is otherwise immutable.
   */
  version: VersionSchema,
});
export type AgreementTerm = z.infer<typeof AgreementTermSchema>;

/** Pins the exact term rows a check or approval was computed against. */
export const TermVersionRefSchema = z.object({ termId: IdSchema, version: VersionSchema });
export type TermVersionRef = z.infer<typeof TermVersionRefSchema>;
