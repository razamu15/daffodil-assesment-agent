/**
 * PendingAction: the single gate for every change Jordan must say yes to
 * (Doc 3 §2.3, §4.6). Propose writes a PENDING row; only the UI confirm endpoint
 * resolves it to CONFIRMED and runs applyAction. Confirm logic, conflicts and
 * audit are written once for all types; `type` selects what "apply" does.
 */
import { z } from "zod";
import {
  ActionBasisKind,
  ActionResolverSchema,
  AgreementChangeKind,
  ContactChannelSchema,
  HouseKeyAccessSchema,
  MessageReasonSchema,
  PendingActionStatusSchema,
  PendingActionType,
} from "../enums";
import {
  ActionRefSchema,
  IdSchema,
  InstantSchema,
  LocalDateSchema,
  NonNegativeCentsSchema,
  ServiceKeySchema,
  VersionSchema,
} from "../primitives";
import { TermContentSchema } from "./agreement";
import { AcceptedExceptionSchema, BillingPeriodSchema } from "./bill";
import { BillCheckSchema } from "./check";

/**
 * What the proposal was computed against. On confirm, core re-reads it; any
 * difference makes the action STALE instead of applying it.
 */
export const ActionBasisSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(ActionBasisKind.HELPER_VERSION), helperId: IdSchema, version: VersionSchema }),
  z.object({ kind: z.literal(ActionBasisKind.BILL_VERSION), billId: IdSchema, version: VersionSchema }),
  /** The term currently occupying the helper's service slot, or none. */
  z.object({
    kind: z.literal(ActionBasisKind.TERM_SLOT),
    helperId: IdSchema,
    serviceKey: ServiceKeySchema,
    currentTermId: IdSchema.nullable(),
    currentTermVersion: VersionSchema.nullable(),
  }),
  /** Nothing can go stale (e.g. a message draft). */
  z.object({ kind: z.literal(ActionBasisKind.NONE) }),
]);
export type ActionBasis = z.infer<typeof ActionBasisSchema>;

// ── Payloads, one per action type ───────────────────────────────────────────

export const AgreementChangePayloadSchema = z.discriminatedUnion("change", [
  z.object({ change: z.literal(AgreementChangeKind.ADD_TERM), term: TermContentSchema }),
  /** Closes supersedesTermId the day before term.effectiveFrom and adds term. */
  z.object({ change: z.literal(AgreementChangeKind.REPLACE_TERM), supersedesTermId: IdSchema, term: TermContentSchema }),
  z.object({ change: z.literal(AgreementChangeKind.END_TERM), termId: IdSchema, effectiveTo: LocalDateSchema }),
  /**
   * A rate that applied *before* the earliest saved version of a service (Jordan
   * learns the history later). Adds `term`, which must end (effectiveTo), and moves
   * currentTermId's start to the day after term.effectiveTo, so the two meet with no
   * gap. currentTermId must be the earliest saved version of that service.
   */
  z.object({ change: z.literal(AgreementChangeKind.ADD_EARLIER_TERM), currentTermId: IdSchema, term: TermContentSchema }),
]);

export const BillApprovalPayloadSchema = z.object({
  billId: IdSchema,
  acceptedExceptions: z.array(AcceptedExceptionSchema),
  amountApprovedCents: NonNegativeCentsSchema,
  /** The check Jordan is looking at. Re-run on confirm; any difference → STALE. */
  checkSnapshot: BillCheckSchema,
});

export const HelperMessagePayloadSchema = z.object({
  helperId: IdSchema,
  reason: MessageReasonSchema,
  body: z.string().min(1),
  relatedBillId: IdSchema.nullable(),
  relatedPeriod: BillingPeriodSchema.nullable(),
  channelHint: ContactChannelSchema,
});

export const HelperEngagementEndPayloadSchema = z.object({
  helperId: IdSchema,
  endedOn: LocalDateSchema,
  /** The partial period a final bill is now expected for. */
  finalPeriod: BillingPeriodSchema,
  /** Snapshot for the "Lupe has a key" reminder shown on the card. */
  houseKeyAccess: HouseKeyAccessSchema,
});

// ── The action ──────────────────────────────────────────────────────────────

const pendingActionBase = z.object({
  ref: ActionRefSchema,
  /** Identity of the thing being changed. Two PENDING actions with the same key conflict. Built by targetKeys.ts. */
  targetKey: z.string().min(1),
  basedOn: ActionBasisSchema,
  status: PendingActionStatusSchema,
  supersededByRef: ActionRefSchema.nullable(),
  /** One line for the card: "Lupe: regular visit $140 → $150 from Sep 15". */
  summary: z.string().min(1),
  assumptions: z.array(z.string()),
  createdAt: InstantSchema,
  resolvedAt: InstantSchema.nullable(),
  resolvedBy: ActionResolverSchema.nullable(),
  /** Why it ended up STALE/WITHDRAWN/etc., in plain words. */
  resolutionNote: z.string().nullable(),
  sourceSessionId: IdSchema.nullable(),
  sourceTurnId: IdSchema.nullable(),
  sourceDocId: IdSchema.nullable(),
  version: VersionSchema,
});

export const PendingActionSchema = z.discriminatedUnion("type", [
  pendingActionBase.extend({ type: z.literal(PendingActionType.AGREEMENT_CHANGE), payload: AgreementChangePayloadSchema }),
  pendingActionBase.extend({ type: z.literal(PendingActionType.BILL_APPROVAL), payload: BillApprovalPayloadSchema }),
  pendingActionBase.extend({ type: z.literal(PendingActionType.HELPER_MESSAGE), payload: HelperMessagePayloadSchema }),
  pendingActionBase.extend({
    type: z.literal(PendingActionType.HELPER_ENGAGEMENT_END),
    payload: HelperEngagementEndPayloadSchema,
  }),
]);
export type PendingAction = z.infer<typeof PendingActionSchema>;
export type PendingActionOf<T extends PendingAction["type"]> = Extract<PendingAction, { type: T }>;
