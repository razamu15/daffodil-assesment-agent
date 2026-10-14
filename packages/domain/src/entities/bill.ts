/**
 * Bill, LineItem, Approval (Doc 3 §2.3).
 *
 * A bill records what the helper *claimed*. It never defines terms. LineItems are
 * embedded (they don't exist outside a bill). The Approval is sealed inside the
 * bill: one conditional write flips RECEIVED → APPROVED and writes it, and after
 * that no code path edits the bill (the Store refuses it too).
 */
import { z } from "zod";
import {
  ActionResolverSchema,
  BillableUnitSchema,
  BillFindingKindSchema,
  BillPeriodKindSchema,
  BillStatusSchema,
  ExceptionTarget,
  LineKindSchema,
  ServiceKindSchema,
} from "../enums";
import {
  ActionRefSchema,
  CentsSchema,
  IdSchema,
  InstantSchema,
  LocalDateSchema,
  LocalDateTimeSchema,
  NonNegativeCentsSchema,
  VersionSchema,
} from "../primitives";
import { TermVersionRefSchema } from "./agreement";
import { BillCheckSchema } from "./check";

/** "Sam said that was fine": a claim by the helper about a third party. Never an agreement on its own. */
export const AuthorizationClaimSchema = z.object({
  /** Name as the helper wrote it. */
  claimedApprover: z.string().min(1),
  /** Matched household principal, or null if we can't tell who. */
  claimedApproverPersonId: IdSchema.nullable(),
  text: z.string().min(1),
});
export type AuthorizationClaim = z.infer<typeof AuthorizationClaimSchema>;

/** A line as extracted, before the system assigns it an id. */
export const LineItemDraftSchema = z.object({
  lineKind: LineKindSchema,
  /** null = extraction couldn't tell which service. Never guessed; the line becomes CANNOT_COMPUTE. */
  serviceKind: ServiceKindSchema.nullable(),
  /** The helper's own wording for the line ("date night", "last minute fee"). */
  label: z.string(),
  /** Day of service when known. Set even when startAt is set. */
  serviceDate: LocalDateSchema.nullable(),
  /** Full local datetimes so "7pm–12am" crossing midnight is explicit. */
  startAt: LocalDateTimeSchema.nullable(),
  endAt: LocalDateTimeSchema.nullable(),
  quantity: z.number().positive().nullable(),
  unit: BillableUnitSchema.nullable(),
  /** Per-unit price the helper stated ("18 x $28"), if any. */
  unitPriceBilledCents: NonNegativeCentsSchema.nullable(),
  amountBilledCents: CentsSchema,
  authorizationClaim: AuthorizationClaimSchema.nullable(),
  sourceQuote: z.string(),
});
export type LineItemDraft = z.infer<typeof LineItemDraftSchema>;

export const LineItemSchema = LineItemDraftSchema.extend({
  lineId: IdSchema,
  /** A fee or reimbursement attached to a service line ("+ last minute fee" under Sun 9/20). */
  relatedLineId: IdSchema.nullable(),
});
export type LineItem = z.infer<typeof LineItemSchema>;

/** A date range with a kind: a "2026-09" string can't express "Oct 1 to 14" for a final settlement. */
export const BillingPeriodSchema = z.object({
  start: LocalDateSchema,
  /** Inclusive. */
  end: LocalDateSchema,
  kind: BillPeriodKindSchema,
});
export type BillingPeriod = z.infer<typeof BillingPeriodSchema>;

/** What record_bill saves: the helper's claim, as extracted. */
export const BillContentSchema = z.object({
  helperId: IdSchema,
  period: BillingPeriodSchema,
  lineItems: z.array(LineItemSchema),
  /** What the helper wrote as the total. null if the bill states none. Compared with the sum of lines, never trusted. */
  statedTotalCents: CentsSchema.nullable(),
  sourceDocId: IdSchema,
  extractionAssumptions: z.array(z.string()),
  /** Non-line text worth keeping ("No walk on Labor Day (9/7)", "Venmo is great"). */
  helperRemarks: z.array(z.string()),
});
export type BillContent = z.infer<typeof BillContentSchema>;

export const AcceptedExceptionSchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal(ExceptionTarget.LINE), lineId: IdSchema, reason: z.string().min(1) }),
  z.object({ target: z.literal(ExceptionTarget.FINDING), findingKind: BillFindingKindSchema, reason: z.string().min(1) }),
]);
export type AcceptedException = z.infer<typeof AcceptedExceptionSchema>;

/** Frozen copy of what Jordan saw and approved (Doc 3 S6). Later term changes never rewrite it. */
export const ApprovalSchema = z.object({
  approvedAt: InstantSchema,
  approvedBy: ActionResolverSchema,
  viaActionRef: ActionRefSchema,
  billedCents: CentsSchema,
  amountApprovedCents: NonNegativeCentsSchema,
  acceptedExceptions: z.array(AcceptedExceptionSchema),
  checkSnapshot: BillCheckSchema,
  termVersions: z.array(TermVersionRefSchema),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const BillSchema = BillContentSchema.extend({
  billId: IdSchema,
  status: BillStatusSchema,
  /** The earlier unapproved bill for the same helper and period that this one replaced. */
  supersedesBillId: IdSchema.nullable(),
  supersededByBillId: IdSchema.nullable(),
  receivedAt: InstantSchema,
  latestCheck: BillCheckSchema.nullable(),
  /** Present iff status is APPROVED. */
  approval: ApprovalSchema.nullable(),
  version: VersionSchema,
});
export type Bill = z.infer<typeof BillSchema>;
