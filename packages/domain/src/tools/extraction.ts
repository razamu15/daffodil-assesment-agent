/**
 * Output schemas for the quarantined extraction call (Doc 3 §4.4). The model is
 * forced to answer through one of these (schema tool + toolChoice). Validated
 * once, at that boundary; downstream code trusts the result.
 *
 * Extraction names helpers by name (it has no ids). The agent maps names to
 * helperIds and turns the result into propose_* / record_bill calls.
 *
 * Missing stays missing: every field the source doesn't state is null, and
 * every inference is written into an `assumptions` list.
 */
import { z } from "zod";
import { HelperRoleSchema, HouseKeyAccessSchema, ServiceKindSchema } from "../enums";
import { PricingRuleSchema, ServiceScheduleSchema } from "../entities/agreement";
import { LineItemDraftSchema } from "../entities/bill";
import { ContactInfoSchema, PaymentInfoSchema } from "../entities/people";
import { CentsSchema, LocalDateSchema } from "../primitives";

export const ExtractedHelperSchema = z.object({
  name: z.string().min(1),
  /** null when the source doesn't say what they do. */
  role: HelperRoleSchema.nullable(),
  houseKeyAccess: HouseKeyAccessSchema,
  payment: PaymentInfoSchema,
  contact: ContactInfoSchema,
  notes: z.string(),
});
export type ExtractedHelper = z.infer<typeof ExtractedHelperSchema>;

export const ExtractedTermSchema = z.object({
  helperName: z.string().min(1),
  serviceKind: ServiceKindSchema.nullable(),
  serviceLabel: z.string().min(1),
  pricingRules: z.array(PricingRuleSchema).min(1),
  schedule: ServiceScheduleSchema,
  /** null if the source gives no start and none can be inferred from the message date. */
  effectiveFrom: LocalDateSchema.nullable(),
  effectiveTo: LocalDateSchema.nullable(),
  sourceQuote: z.string().min(1),
  assumptions: z.array(z.string()),
});
export type ExtractedTerm = z.infer<typeof ExtractedTermSchema>;

/** Something agreed that no PricingRule kind can express. Becomes a HelperNote, never a forced rule. */
export const UnencodedTermSchema = z.object({
  helperName: z.string().nullable(),
  text: z.string().min(1),
  sourceQuote: z.string().min(1),
});

export const AgreementExtractionSchema = z.object({
  /** When the message/thread was written, if the source shows it. */
  documentDate: LocalDateSchema.nullable(),
  assumptions: z.array(z.string()),
  helpers: z.array(ExtractedHelperSchema),
  terms: z.array(ExtractedTermSchema),
  unencoded: z.array(UnencodedTermSchema),
});
export type AgreementExtraction = z.infer<typeof AgreementExtractionSchema>;

/** A bill line as extracted. relatedLineIndex points at another line in the same list (a fee under a visit). */
export const ExtractedLineItemSchema = LineItemDraftSchema.extend({
  relatedLineIndex: z.number().int().nonnegative().nullable(),
});
export type ExtractedLineItem = z.infer<typeof ExtractedLineItemSchema>;

export const BillExtractionSchema = z.object({
  helperName: z.string().min(1),
  documentDate: LocalDateSchema.nullable(),
  /** The period the bill covers, if stated or inferable ("September" in a bill dated Oct 1). */
  periodStart: LocalDateSchema.nullable(),
  periodEnd: LocalDateSchema.nullable(),
  lineItems: z.array(ExtractedLineItemSchema),
  statedTotalCents: CentsSchema.nullable(),
  helperRemarks: z.array(z.string()),
  assumptions: z.array(z.string()),
});
export type BillExtraction = z.infer<typeof BillExtractionSchema>;
