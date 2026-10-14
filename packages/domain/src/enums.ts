/**
 * Every finite domain vocabulary lives here (Doc 3 §2.4). New helper types,
 * service kinds, rule kinds, etc. are added in this one place.
 *
 * Pattern per enum:
 *   FooSchema  – zod schema (validation, JSON schema for tools)
 *   Foo        – named constants (Foo.BAR). Compare against these, never bare strings
 *   type Foo   – the string-literal union
 *
 * "Don't know" is always an explicit member (UNKNOWN / UNSPECIFIED), never null
 * or a plausible default (Doc 3 §2.2 S4).
 */
import { z } from "zod";

// ── People ──────────────────────────────────────────────────────────────────

export const PrincipalRoleSchema = z.enum(["DECISION_MAKER", "PARTNER"]);
export const PrincipalRole = PrincipalRoleSchema.enum;
export type PrincipalRole = z.infer<typeof PrincipalRoleSchema>;

export const BillingCadenceSchema = z.enum(["MONTHLY_IN_ARREARS"]);
export const BillingCadence = BillingCadenceSchema.enum;
export type BillingCadence = z.infer<typeof BillingCadenceSchema>;

/** OTHER exists so an unseen helper type (a tutor) can still be recorded; its services use ServiceKind.OTHER. */
export const HelperRoleSchema = z.enum(["BABYSITTER", "CLEANER", "DOG_WALKER", "OTHER"]);
export const HelperRole = HelperRoleSchema.enum;
export type HelperRole = z.infer<typeof HelperRoleSchema>;

export const HelperStatusSchema = z.enum(["ACTIVE", "ENDED"]);
export const HelperStatus = HelperStatusSchema.enum;
export type HelperStatus = z.infer<typeof HelperStatusSchema>;

export const HouseKeyAccessSchema = z.enum(["HAS_KEY", "NO_KEY", "UNKNOWN"]);
export const HouseKeyAccess = HouseKeyAccessSchema.enum;
export type HouseKeyAccess = z.infer<typeof HouseKeyAccessSchema>;

/** OTHER = a known method we don't model (cash, check); UNKNOWN = not stated. */
export const PaymentMethodSchema = z.enum(["VENMO", "ZELLE", "OTHER", "UNKNOWN"]);
export const PaymentMethod = PaymentMethodSchema.enum;
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const ContactChannelSchema = z.enum(["SMS", "EMAIL", "UNKNOWN"]);
export const ContactChannel = ContactChannelSchema.enum;
export type ContactChannel = z.infer<typeof ContactChannelSchema>;

// ── Agreements ──────────────────────────────────────────────────────────────

export const DayOfWeekSchema = z.enum(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]);
export const DayOfWeek = DayOfWeekSchema.enum;
export type DayOfWeek = z.infer<typeof DayOfWeekSchema>;

/**
 * What was done. Each term prices exactly one service kind for one helper.
 * OTHER is identified together with the term's serviceLabel (see termSlot in targetKeys.ts).
 */
export const ServiceKindSchema = z.enum([
  "BABYSITTING_STANDARD",
  "BABYSITTING_DATE_NIGHT",
  "CLEANING_REGULAR",
  "CLEANING_DEEP",
  "DOG_WALK_30",
  "DOG_WALK_60",
  "OTHER",
]);
export const ServiceKind = ServiceKindSchema.enum;
export type ServiceKind = z.infer<typeof ServiceKindSchema>;

export const BillableUnitSchema = z.enum(["HOUR", "VISIT", "WALK"]);
export const BillableUnit = BillableUnitSchema.enum;
export type BillableUnit = z.infer<typeof BillableUnitSchema>;

export const PricingRuleKindSchema = z.enum([
  "FLAT_PER_UNIT",
  "HOURLY",
  "HOURLY_AFTER",
  "DAY_MULTIPLIER",
  "FLAT_BLOCK",
  "FEE",
]);
export const PricingRuleKind = PricingRuleKindSchema.enum;
export type PricingRuleKind = z.infer<typeof PricingRuleKindSchema>;

/**
 * Which hourly rates a DAY_MULTIPLIER scales. "Sundays are time and a half" doesn't say
 * whether the after-10pm rate is also multiplied, so UNSPECIFIED is a legal, honest value:
 * the checker can still compute hours where the readings agree and returns CANNOT_COMPUTE
 * where they don't.
 */
export const MultiplierScopeSchema = z.enum(["BASE_RATE", "ALL_HOURLY_RATES", "UNSPECIFIED"]);
export const MultiplierScope = MultiplierScopeSchema.enum;
export type MultiplierScope = z.infer<typeof MultiplierScopeSchema>;

/** AD_HOC = "no fixed schedule" (a fact). UNSPECIFIED = "we don't know". */
export const ScheduleKindSchema = z.enum(["WEEKLY_ON", "WEEKDAYS", "AD_HOC", "UNSPECIFIED"]);
export const ScheduleKind = ScheduleKindSchema.enum;
export type ScheduleKind = z.infer<typeof ScheduleKindSchema>;

export const AgreementChangeKindSchema = z.enum(["ADD_TERM", "REPLACE_TERM", "END_TERM"]);
export const AgreementChangeKind = AgreementChangeKindSchema.enum;
export type AgreementChangeKind = z.infer<typeof AgreementChangeKindSchema>;

// ── Documents ───────────────────────────────────────────────────────────────

/** CHAT_STATEMENT = something Jordan typed in chat ("Lupe goes to $150 on the 15th"), saved as a source. */
export const DocumentKindSchema = z.enum([
  "TYPED_NOTES",
  "THREAD_SCREENSHOT",
  "PASTED_THREAD",
  "CHAT_STATEMENT",
  "BILL_TEXT",
  "BILL_SCREENSHOT",
]);
export const DocumentKind = DocumentKindSchema.enum;
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

export const DocumentStorageSchema = z.enum(["INLINE_TEXT", "BLOB"]);
export const DocumentStorage = DocumentStorageSchema.enum;
export type DocumentStorage = z.infer<typeof DocumentStorageSchema>;

export const ImageMediaTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]);
export type ImageMediaType = z.infer<typeof ImageMediaTypeSchema>;

/** What the quarantined extraction call is asked to read a document as. */
export const ExtractionKindSchema = z.enum(["AGREEMENT", "BILL"]);
export const ExtractionKind = ExtractionKindSchema.enum;
export type ExtractionKind = z.infer<typeof ExtractionKindSchema>;

// ── Bills and checks ────────────────────────────────────────────────────────

export const BillStatusSchema = z.enum(["RECEIVED", "SUPERSEDED", "APPROVED"]);
export const BillStatus = BillStatusSchema.enum;
export type BillStatus = z.infer<typeof BillStatusSchema>;

export const BillPeriodKindSchema = z.enum(["CALENDAR_MONTH", "CUSTOM_RANGE", "FINAL_SETTLEMENT"]);
export const BillPeriodKind = BillPeriodKindSchema.enum;
export type BillPeriodKind = z.infer<typeof BillPeriodKindSchema>;

/** REIMBURSEMENT = money the helper spent for the household (pizza, cab). Not priced by any term. */
export const LineKindSchema = z.enum(["SERVICE", "FEE", "REIMBURSEMENT", "ADJUSTMENT"]);
export const LineKind = LineKindSchema.enum;
export type LineKind = z.infer<typeof LineKindSchema>;

export const LineStatusSchema = z.enum(["MATCHES", "DIFFERS", "NOT_COVERED", "CANNOT_COMPUTE", "UNVERIFIABLE"]);
export const LineStatus = LineStatusSchema.enum;
export type LineStatus = z.infer<typeof LineStatusSchema>;

export const FindingSeveritySchema = z.enum(["DISCREPANCY", "NEEDS_INFO", "INFO"]);
export const FindingSeverity = FindingSeveritySchema.enum;
export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;

export const BillFindingKindSchema = z.enum([
  "TOTAL_MISMATCH",
  "LINE_OUTSIDE_PERIOD",
  "DUPLICATE_LINE",
  "NO_AGREEMENT_FOR_SERVICE",
  "PERIOD_ALREADY_APPROVED",
  "AUTHORIZATION_CLAIM",
  "QUANTITY_UNVERIFIABLE",
  "SCHEDULE_PLAUSIBILITY",
  "OCCURRENCE_COUNT_PLAUSIBILITY",
]);
export const BillFindingKind = BillFindingKindSchema.enum;
export type BillFindingKind = z.infer<typeof BillFindingKindSchema>;

export const BillVerdictSchema = z.enum(["CHECKS_OUT", "DISCREPANCIES", "NEEDS_INFO"]);
export const BillVerdict = BillVerdictSchema.enum;
export type BillVerdict = z.infer<typeof BillVerdictSchema>;

/** Derived per helper × period (never stored). See MonthStatus. */
export const BillingPeriodStateSchema = z.enum([
  "NOT_RECEIVED",
  "RECEIVED",
  "CHECKED_OK",
  "CHECKED_NEEDS_INFO",
  "CHECKED_FLAGGED",
  "APPROVED",
]);
export const BillingPeriodState = BillingPeriodStateSchema.enum;
export type BillingPeriodState = z.infer<typeof BillingPeriodStateSchema>;

export const ExceptionTargetSchema = z.enum(["LINE", "FINDING"]);
export const ExceptionTarget = ExceptionTargetSchema.enum;
export type ExceptionTarget = z.infer<typeof ExceptionTargetSchema>;

// ── Pending actions (the confirmation gate) ─────────────────────────────────

export const PendingActionTypeSchema = z.enum([
  "HELPER_PROFILE_CHANGE",
  "AGREEMENT_CHANGE",
  "BILL_APPROVAL",
  "HELPER_MESSAGE",
  "HELPER_ENGAGEMENT_END",
]);
export const PendingActionType = PendingActionTypeSchema.enum;
export type PendingActionType = z.infer<typeof PendingActionTypeSchema>;

export const PendingActionStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "REJECTED",
  "WITHDRAWN",
  "SUPERSEDED",
  "STALE",
  "EXPIRED",
]);
export const PendingActionStatus = PendingActionStatusSchema.enum;
export type PendingActionStatus = z.infer<typeof PendingActionStatusSchema>;

/** Who resolved an action. AGENT may only withdraw; only USER_UI confirms. */
export const ActionResolverSchema = z.enum(["USER_UI", "AGENT", "SYSTEM"]);
export const ActionResolver = ActionResolverSchema.enum;
export type ActionResolver = z.infer<typeof ActionResolverSchema>;

/** What a PendingAction was computed against; checked again on confirm to detect STALE. */
export const ActionBasisKindSchema = z.enum(["NEW_ENTITY", "HELPER_VERSION", "BILL_VERSION", "TERM_SLOT", "NONE"]);
export const ActionBasisKind = ActionBasisKindSchema.enum;
export type ActionBasisKind = z.infer<typeof ActionBasisKindSchema>;

export const HelperProfileChangeKindSchema = z.enum(["CREATE", "UPDATE"]);
export const HelperProfileChangeKind = HelperProfileChangeKindSchema.enum;
export type HelperProfileChangeKind = z.infer<typeof HelperProfileChangeKindSchema>;

// ── Messages and notes ──────────────────────────────────────────────────────

export const MessageReasonSchema = z.enum(["DISCREPANCY", "MISSING_BILL", "FINAL_SETTLEMENT", "OTHER"]);
export const MessageReason = MessageReasonSchema.enum;
export type MessageReason = z.infer<typeof MessageReasonSchema>;

/** HANDED_OFF, not SENT: we can't know it was sent. */
export const MessageStatusSchema = z.enum(["DRAFT", "READY", "HANDED_OFF", "DISCARDED"]);
export const MessageStatus = MessageStatusSchema.enum;
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

/** Only MANUAL_HANDOFF today. Real sending later is a new mode, not a rewrite. */
export const DeliveryModeSchema = z.enum(["MANUAL_HANDOFF"]);
export const DeliveryMode = DeliveryModeSchema.enum;
export type DeliveryMode = z.infer<typeof DeliveryModeSchema>;

/** UNENCODED_TERM = a term the rule vocabulary can't express. REVIEW_FLAG = a gap surfaced to Jordan. */
export const NoteKindSchema = z.enum(["UNENCODED_TERM", "REVIEW_FLAG"]);
export const NoteKind = NoteKindSchema.enum;
export type NoteKind = z.infer<typeof NoteKindSchema>;

export const NoteStatusSchema = z.enum(["OPEN", "RESOLVED"]);
export const NoteStatus = NoteStatusSchema.enum;
export type NoteStatus = z.infer<typeof NoteStatusSchema>;

// ── Chat ────────────────────────────────────────────────────────────────────

export const TurnStatusSchema = z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]);
export const TurnStatus = TurnStatusSchema.enum;
export type TurnStatus = z.infer<typeof TurnStatusSchema>;

export const ChatRoleSchema = z.enum(["USER", "ASSISTANT"]);
export const ChatRole = ChatRoleSchema.enum;
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const MemoryStrategySchema = z.enum(["PREFERENCE", "SEMANTIC"]);
export const MemoryStrategy = MemoryStrategySchema.enum;
export type MemoryStrategy = z.infer<typeof MemoryStrategySchema>;

export const ModelCallPurposeSchema = z.enum(["AGENT_LOOP", "EXTRACTION"]);
export const ModelCallPurpose = ModelCallPurposeSchema.enum;
export type ModelCallPurpose = z.infer<typeof ModelCallPurposeSchema>;
