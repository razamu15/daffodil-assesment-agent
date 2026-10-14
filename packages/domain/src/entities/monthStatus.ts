/**
 * MonthStatus: the derived "have the bills come?" view (Doc 3 §2.3, Doc 1 §3).
 * Computed by core's deriveMonthStatus from helpers + bills + messages + policy
 * on every read. Never stored, so no scheduler is needed to keep it fresh.
 */
import { z } from "zod";
import { BillingPeriodStateSchema, BillVerdictSchema, HelperRoleSchema, HelperStatusSchema } from "../enums";
import { CentsSchema, IdSchema, InstantSchema, LocalDateSchema, MonthKeySchema } from "../primitives";
import { BillingPeriodSchema } from "./bill";

export const MonthStatusRowSchema = z.object({
  helperId: IdSchema,
  helperName: z.string(),
  role: HelperRoleSchema,
  helperStatus: HelperStatusSchema,
  /** The period expected from this helper: the calendar month, or a FINAL_SETTLEMENT range if they ended in it. */
  period: BillingPeriodSchema,
  state: BillingPeriodStateSchema,
  /** The current (non-superseded) bill for the period, if any. */
  billId: IdSchema.nullable(),
  billedCents: CentsSchema.nullable(),
  verdict: BillVerdictSchema.nullable(),
  /** Count of DISCREPANCY + NEEDS_INFO items in the latest check, for "⚠ 2 things to look at". */
  attentionCount: z.number().int().nonnegative(),
  /** Most recent message about this period that Jordan handed off ("asked helper on …"). */
  askedHelperAt: InstantSchema.nullable(),
});
export type MonthStatusRow = z.infer<typeof MonthStatusRowSchema>;

export const MonthStatusSchema = z.object({
  month: MonthKeySchema,
  asOf: LocalDateSchema,
  rows: z.array(MonthStatusRowSchema),
});
export type MonthStatus = z.infer<typeof MonthStatusSchema>;
