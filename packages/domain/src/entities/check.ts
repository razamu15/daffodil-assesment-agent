/**
 * BillCheck: the deterministic checker's output (Doc 3 §3). Produced only by
 * core's checkBill; stored on the bill as latestCheck and frozen into an Approval.
 *
 * Line status answers "is the billed amount what the agreement says, for the
 * stated times and quantities?". Bill findings answer everything else (totals,
 * duplicates, plausibility). Severity per status/finding kind is a table in
 * constants.ts, and the verdict is the worst severity present.
 */
import { z } from "zod";
import { BillFindingKind, BillVerdictSchema, DayOfWeekSchema, LineCauseKind, LineStatusSchema, RateVersionRelationSchema } from "../enums";
import { CentsSchema, IdSchema, InstantSchema, LocalDateSchema, ServiceKeySchema, VersionSchema } from "../primitives";
import { TermVersionRefSchema } from "./agreement";

/** One step of "why this number": e.g. { "0.5h × $28/hr after 11pm", 1400 }. */
export const BreakdownStepSchema = z.object({
  description: z.string(),
  amountCents: CentsSchema,
});
export type BreakdownStep = z.infer<typeof BreakdownStepSchema>;

export const LineCauseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(LineCauseKind.RATE_FROM_OTHER_PERIOD),
    /** The version whose price equals the billed amount. */
    termId: IdSchema,
    relation: RateVersionRelationSchema,
    effectiveFrom: LocalDateSchema,
    effectiveTo: LocalDateSchema.nullable(),
  }),
]);
export type LineCause = z.infer<typeof LineCauseSchema>;

export const LineCheckSchema = z.object({
  lineId: IdSchema,
  status: LineStatusSchema,
  billedCents: CentsSchema,
  /** null when nothing could be computed (NOT_COVERED, CANNOT_COMPUTE, UNVERIFIABLE). */
  expectedCents: CentsSchema.nullable(),
  /** billed − expected. null when expectedCents is null. */
  deltaCents: CentsSchema.nullable(),
  breakdown: z.array(BreakdownStepSchema),
  appliedTermIds: z.array(IdSchema),
  assumptions: z.array(z.string()),
  /** Plain words: "Billed $150, agreed $140 until Sep 15." */
  explanation: z.string(),
  /** For a DIFFERS line, what most likely happened, when the checker can tell. null otherwise. */
  likelyCause: LineCauseSchema.nullable(),
});
export type LineCheck = z.infer<typeof LineCheckSchema>;

const findingBase = { message: z.string() };

export const BillFindingSchema = z.discriminatedUnion("kind", [
  z.object({
    ...findingBase,
    kind: z.literal(BillFindingKind.TOTAL_MISMATCH),
    statedTotalCents: CentsSchema,
    sumOfLinesCents: CentsSchema,
  }),
  z.object({ ...findingBase, kind: z.literal(BillFindingKind.LINE_OUTSIDE_PERIOD), lineIds: z.array(IdSchema).min(1) }),
  z.object({ ...findingBase, kind: z.literal(BillFindingKind.DUPLICATE_LINE), lineIds: z.array(IdSchema).min(2) }),
  z.object({
    ...findingBase,
    kind: z.literal(BillFindingKind.NO_AGREEMENT_FOR_SERVICE),
    serviceKey: ServiceKeySchema.nullable(),
    serviceLabel: z.string(),
    lineIds: z.array(IdSchema).min(1),
  }),
  z.object({ ...findingBase, kind: z.literal(BillFindingKind.PERIOD_ALREADY_APPROVED), approvedBillId: IdSchema }),
  z.object({
    ...findingBase,
    kind: z.literal(BillFindingKind.AUTHORIZATION_CLAIM),
    lineId: IdSchema,
    claimedApprover: z.string(),
    claimText: z.string(),
  }),
  z.object({ ...findingBase, kind: z.literal(BillFindingKind.QUANTITY_UNVERIFIABLE), lineIds: z.array(IdSchema).min(1) }),
  z.object({
    ...findingBase,
    kind: z.literal(BillFindingKind.SCHEDULE_PLAUSIBILITY),
    serviceKey: ServiceKeySchema,
    /** Lines dated on days outside the usual schedule. */
    lineIds: z.array(IdSchema).min(1),
    usualDays: z.array(DayOfWeekSchema),
  }),
  z.object({
    ...findingBase,
    kind: z.literal(BillFindingKind.OCCURRENCE_COUNT_PLAUSIBILITY),
    serviceKeys: z.array(ServiceKeySchema).min(1),
    billedCount: z.number().int().nonnegative(),
    /** Occurrences the usual schedule implies for the period (e.g. weekdays in the month). */
    scheduledCount: z.number().int().nonnegative(),
  }),
]);
export type BillFinding = z.infer<typeof BillFindingSchema>;

export const BillCheckSchema = z.object({
  billId: IdSchema,
  /** The bill version this check was computed for. */
  billVersion: VersionSchema,
  checkedAt: InstantSchema,
  verdict: BillVerdictSchema,
  lineChecks: z.array(LineCheckSchema),
  findings: z.array(BillFindingSchema),
  /** What the helper wrote. Stored, never trusted. */
  statedTotalCents: CentsSchema.nullable(),
  sumOfLinesCents: CentsSchema,
  /**
   * What the agreements support: sum of expectedCents, with NOT_COVERED lines counted as 0.
   * null if any line is CANNOT_COMPUTE or UNVERIFIABLE (we won't guess a total).
   */
  agreedTotalCents: CentsSchema.nullable(),
  termVersions: z.array(TermVersionRefSchema),
});
export type BillCheck = z.infer<typeof BillCheckSchema>;
