/**
 * Agent tool contracts (Doc 3 §4.3): names, categories, input schemas, and the
 * shared result envelope. Tool descriptions/prompts are owned by packages/agent.
 *
 * Deliberately absent: confirm_action, approve_bill, send_message,
 * edit_approved_bill, delete_anything, run_code. Confirmation exists only behind
 * the UI endpoint. That absence is the safety.
 *
 * Call sites: agent (dispatch + JSON schema for Bedrock), agent tests.
 */
import { z } from "zod";
import {
  BillStatusSchema,
  ExtractionKindSchema,
  MessageReasonSchema,
  PendingActionStatusSchema,
} from "../enums";
import { AcceptedExceptionSchema, BillingPeriodSchema } from "../entities/bill";
import { AgreementChangePayloadSchema } from "../entities/action";
import type { PendingAction } from "../entities/action";
import { HelperProfileSchema } from "../entities/people";
import { ActionRefSchema, CentsSchema, IdSchema, LocalDateSchema, MonthKeySchema } from "../primitives";
import { ExtractedLineItemSchema } from "./extraction";

export const ToolCategory = {
  /** No side effects. */
  READ: "READ",
  /** Writes what a helper claimed (a bill). Never money or terms. */
  RECORD: "RECORD",
  /** Writes a PENDING action. Nothing real changes until Jordan confirms. */
  PROPOSE: "PROPOSE",
  /** The honest exit: store what can't be encoded, or surface a gap. */
  ESCAPE: "ESCAPE",
} as const;
export type ToolCategory = (typeof ToolCategory)[keyof typeof ToolCategory];

export const toolInputSchemas = {
  // READ
  list_helpers: z.object({}),
  list_agreements: z.object({ helperId: IdSchema, asOf: LocalDateSchema.nullable() }),
  list_bills: z.object({
    month: MonthKeySchema.nullable(),
    helperId: IdSchema.nullable(),
    status: BillStatusSchema.nullable(),
  }),
  get_bill: z.object({ billId: IdSchema }),
  check_bill: z.object({ billId: IdSchema }),
  get_month_status: z.object({ month: MonthKeySchema.nullable() }),
  list_pending_actions: z.object({ status: PendingActionStatusSchema.nullable() }),
  extract_from_document: z.object({ docId: IdSchema, extractionKind: ExtractionKindSchema }),

  // RECORD
  record_bill: z.object({
    docId: IdSchema,
    helperId: IdSchema,
    period: BillingPeriodSchema,
    lineItems: z.array(ExtractedLineItemSchema),
    statedTotalCents: CentsSchema.nullable(),
    extractionAssumptions: z.array(z.string()),
    helperRemarks: z.array(z.string()),
  }),

  // PROPOSE
  /** helperId null = create a new helper. */
  propose_helper_profile: z.object({ helperId: IdSchema.nullable(), profile: HelperProfileSchema, sourceDocId: IdSchema.nullable() }),
  /** The helper is identified by change.term.helperId, or by change.termId for END_TERM. */
  propose_agreement_change: z.object({ change: AgreementChangePayloadSchema, sourceDocId: IdSchema.nullable() }),
  propose_bill_approval: z.object({ billId: IdSchema, acceptedExceptions: z.array(AcceptedExceptionSchema) }),
  propose_helper_message: z.object({
    helperId: IdSchema,
    reason: MessageReasonSchema,
    body: z.string().min(1),
    relatedBillId: IdSchema.nullable(),
    relatedPeriod: BillingPeriodSchema.nullable(),
  }),
  propose_engagement_end: z.object({ helperId: IdSchema, endedOn: LocalDateSchema }),
  withdraw_pending_action: z.object({ ref: ActionRefSchema, reason: z.string().min(1) }),

  // ESCAPE
  save_unstructured_note: z.object({ helperId: IdSchema.nullable(), text: z.string().min(1), sourceDocId: IdSchema.nullable() }),
  flag_for_review: z.object({ reason: z.string().min(1), helperId: IdSchema.nullable(), billId: IdSchema.nullable() }),
} as const;

export type ToolName = keyof typeof toolInputSchemas;
export type ToolInput<N extends ToolName> = z.infer<(typeof toolInputSchemas)[N]>;

export const TOOL_CATEGORY: Record<ToolName, ToolCategory> = {
  list_helpers: ToolCategory.READ,
  list_agreements: ToolCategory.READ,
  list_bills: ToolCategory.READ,
  get_bill: ToolCategory.READ,
  check_bill: ToolCategory.READ,
  get_month_status: ToolCategory.READ,
  list_pending_actions: ToolCategory.READ,
  extract_from_document: ToolCategory.READ,
  record_bill: ToolCategory.RECORD,
  propose_helper_profile: ToolCategory.PROPOSE,
  propose_agreement_change: ToolCategory.PROPOSE,
  propose_bill_approval: ToolCategory.PROPOSE,
  propose_helper_message: ToolCategory.PROPOSE,
  propose_engagement_end: ToolCategory.PROPOSE,
  withdraw_pending_action: ToolCategory.PROPOSE,
  save_unstructured_note: ToolCategory.ESCAPE,
  flag_for_review: ToolCategory.ESCAPE,
};

// ── Results ─────────────────────────────────────────────────────────────────

export const ToolErrorCode = {
  /** Input failed schema validation. The model should fix and retry. */
  INVALID_INPUT: "INVALID_INPUT",
  NOT_FOUND: "NOT_FOUND",
  /** e.g. record_bill for a period that's already approved → PERIOD_ALREADY_APPROVED. */
  PERIOD_ALREADY_APPROVED: "PERIOD_ALREADY_APPROVED",
  /** e.g. a service kind not valid for the helper's role. */
  NOT_ALLOWED: "NOT_ALLOWED",
  INTERNAL: "INTERNAL",
} as const;
export type ToolErrorCode = (typeof ToolErrorCode)[keyof typeof ToolErrorCode];

/** Every tool returns this envelope; the loop serializes it as the toolResult. */
export type ToolResult<T> = { ok: true; data: T } | { ok: false; error: { code: ToolErrorCode; message: string } };

export const ProposeOutcome = {
  PROPOSED: "PROPOSED",
  /** Proposed, but other PENDING actions target the same thing. The model must explain and ask; never choose. */
  NEEDS_DECISION: "NEEDS_DECISION",
} as const;
export type ProposeOutcome = (typeof ProposeOutcome)[keyof typeof ProposeOutcome];

export type ProposeResult = {
  outcome: ProposeOutcome;
  action: PendingAction;
  conflicts: PendingAction[];
  /** Things to say on the card, e.g. "Lupe has a key." */
  reminders: string[];
};
