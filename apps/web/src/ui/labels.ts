/**
 * Plain words for every domain code the UI shows (Product §8: "plain words, not
 * codes"), as lookup tables keyed by the domain enums. A new enum member fails
 * typecheck here until it has a label.
 *
 * Call sites: every screen. Tones map to CSS classes (pill-ok, row-bad, …).
 */
import {
  ActionResolver,
  BillFindingKind,
  BillVerdict,
  ContactChannel,
  DocumentKind,
  HelperStatus,
  HouseKeyAccess,
  LineKind,
  LineStatus,
  MessageReason,
  MessageStatus,
  NoteKind,
  PaymentMethod,
  PendingActionStatus,
  PendingActionType,
} from "@helper-assistant/domain";
import type {
  ActionResolver as ActionResolverT,
  BillFindingKind as BillFindingKindT,
  BillVerdict as BillVerdictT,
  ContactChannel as ContactChannelT,
  DocumentKind as DocumentKindT,
  HelperStatus as HelperStatusT,
  HouseKeyAccess as HouseKeyAccessT,
  LineKind as LineKindT,
  LineStatus as LineStatusT,
  MessageReason as MessageReasonT,
  MessageStatus as MessageStatusT,
  NoteKind as NoteKindT,
  PaymentMethod as PaymentMethodT,
  PendingActionStatus as PendingActionStatusT,
  PendingActionType as PendingActionTypeT,
} from "@helper-assistant/domain";

export const Tone = { OK: "ok", WARN: "warn", BAD: "bad", INFO: "info", MUTED: "muted", DONE: "done" } as const;
export type Tone = (typeof Tone)[keyof typeof Tone];

export type LabelAndTone = { label: string; tone: Tone };

export const LINE_STATUS_VIEW: Record<LineStatusT, LabelAndTone> = {
  [LineStatus.MATCHES]: { label: "Matches", tone: Tone.OK },
  [LineStatus.DIFFERS]: { label: "Differs", tone: Tone.BAD },
  [LineStatus.NOT_COVERED]: { label: "Not in any agreement", tone: Tone.BAD },
  [LineStatus.CANNOT_COMPUTE]: { label: "Can't work it out", tone: Tone.WARN },
  [LineStatus.UNVERIFIABLE]: { label: "Can't verify", tone: Tone.INFO },
};

export const VERDICT_VIEW: Record<BillVerdictT, LabelAndTone> = {
  [BillVerdict.CHECKS_OUT]: { label: "Checks out", tone: Tone.OK },
  [BillVerdict.DISCREPANCIES]: { label: "Things to look at", tone: Tone.BAD },
  [BillVerdict.NEEDS_INFO]: { label: "Needs your input", tone: Tone.WARN },
};

/** Short title per bill-level finding; the checker's own message gives the specifics. */
export const FINDING_TITLE: Record<BillFindingKindT, string> = {
  [BillFindingKind.TOTAL_MISMATCH]: "Total doesn't add up",
  [BillFindingKind.LINE_OUTSIDE_PERIOD]: "Date outside the bill's period",
  [BillFindingKind.DUPLICATE_LINE]: "Same visit billed twice",
  [BillFindingKind.NO_AGREEMENT_FOR_SERVICE]: "No agreement for this service",
  [BillFindingKind.PERIOD_ALREADY_APPROVED]: "This period is already approved",
  [BillFindingKind.AUTHORIZATION_CLAIM]: "Says someone OK'd it",
  [BillFindingKind.QUANTITY_UNVERIFIABLE]: "Count can't be verified",
  [BillFindingKind.SCHEDULE_PLAUSIBILITY]: "Unusual day",
  [BillFindingKind.OCCURRENCE_COUNT_PLAUSIBILITY]: "Count differs from the usual schedule",
};

export const LINE_KIND_LABEL: Record<LineKindT, string> = {
  [LineKind.SERVICE]: "Service",
  [LineKind.FEE]: "Fee",
  [LineKind.REIMBURSEMENT]: "Reimbursement",
  [LineKind.ADJUSTMENT]: "Adjustment",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethodT, string> = {
  [PaymentMethod.VENMO]: "Venmo",
  [PaymentMethod.ZELLE]: "Zelle",
  [PaymentMethod.OTHER]: "Other",
  [PaymentMethod.UNKNOWN]: "Not recorded",
};

export const CONTACT_CHANNEL_LABEL: Record<ContactChannelT, string> = {
  [ContactChannel.SMS]: "Text message",
  [ContactChannel.EMAIL]: "Email",
  [ContactChannel.UNKNOWN]: "Not recorded",
};

export const HOUSE_KEY_LABEL: Record<HouseKeyAccessT, string> = {
  [HouseKeyAccess.HAS_KEY]: "Has a key",
  [HouseKeyAccess.NO_KEY]: "No key",
  [HouseKeyAccess.UNKNOWN]: "Not recorded",
};

/** The reminder shown when an engagement ends. null = nothing to remind. */
export const KEY_REMINDER: Record<HouseKeyAccessT, ((name: string) => string) | null> = {
  [HouseKeyAccess.HAS_KEY]: (name) => `${name} has a key to the house. Remember to get it back.`,
  [HouseKeyAccess.UNKNOWN]: (name) => `It isn't recorded whether ${name} has a key. Worth checking.`,
  [HouseKeyAccess.NO_KEY]: null,
};

export const HELPER_STATUS_VIEW: Record<HelperStatusT, LabelAndTone> = {
  [HelperStatus.ACTIVE]: { label: "Active", tone: Tone.OK },
  [HelperStatus.ENDED]: { label: "Ended", tone: Tone.MUTED },
};

export const DOCUMENT_KIND_LABEL: Record<DocumentKindT, string> = {
  [DocumentKind.TYPED_NOTES]: "Your notes",
  [DocumentKind.THREAD_SCREENSHOT]: "Screenshot of a conversation",
  [DocumentKind.PASTED_THREAD]: "Copied text thread",
  [DocumentKind.CHAT_STATEMENT]: "Something you told the assistant",
  [DocumentKind.BILL_TEXT]: "Bill (text)",
  [DocumentKind.BILL_SCREENSHOT]: "Bill (screenshot)",
  [DocumentKind.TEXT_FILE]: "File (text)",
  [DocumentKind.IMAGE_FILE]: "File (image)",
  [DocumentKind.PDF_FILE]: "File (PDF)",
};

/** What Jordan can say pasted text is. Files aren't picked: they're typed by format (lib/fileIntake.ts). */
export const TEXT_UPLOAD_KINDS: readonly DocumentKindT[] = [DocumentKind.TYPED_NOTES, DocumentKind.PASTED_THREAD, DocumentKind.BILL_TEXT];

export const ACTION_TYPE_LABEL: Record<PendingActionTypeT, string> = {
  [PendingActionType.AGREEMENT_CHANGE]: "Agreement change",
  [PendingActionType.BILL_APPROVAL]: "Approve a bill",
  [PendingActionType.HELPER_MESSAGE]: "Message to send",
  [PendingActionType.HELPER_ENGAGEMENT_END]: "Engagement ends",
};

export const ACTION_STATUS_VIEW: Record<PendingActionStatusT, LabelAndTone> = {
  [PendingActionStatus.PENDING]: { label: "Waiting on you", tone: Tone.WARN },
  [PendingActionStatus.CONFIRMED]: { label: "Confirmed", tone: Tone.DONE },
  [PendingActionStatus.REJECTED]: { label: "Rejected", tone: Tone.MUTED },
  [PendingActionStatus.WITHDRAWN]: { label: "Withdrawn by the assistant", tone: Tone.MUTED },
  [PendingActionStatus.SUPERSEDED]: { label: "Replaced by a newer proposal", tone: Tone.MUTED },
  [PendingActionStatus.STALE]: { label: "Out of date, not applied", tone: Tone.WARN },
  [PendingActionStatus.EXPIRED]: { label: "Expired", tone: Tone.MUTED },
};

export const RESOLVER_LABEL: Record<ActionResolverT, string> = {
  [ActionResolver.USER_UI]: "you",
  [ActionResolver.AGENT]: "the assistant",
  [ActionResolver.SYSTEM]: "the app",
};

export const MESSAGE_REASON_LABEL: Record<MessageReasonT, string> = {
  [MessageReason.DISCREPANCY]: "About a problem on a bill",
  [MessageReason.MISSING_BILL]: "Reminder: bill not received",
  [MessageReason.FINAL_SETTLEMENT]: "Request for a final bill",
  [MessageReason.OTHER]: "Message",
};

export const MESSAGE_STATUS_VIEW: Record<MessageStatusT, LabelAndTone> = {
  [MessageStatus.DRAFT]: { label: "Draft", tone: Tone.MUTED },
  [MessageStatus.READY]: { label: "Ready for you to send", tone: Tone.WARN },
  [MessageStatus.HANDED_OFF]: { label: "You sent it", tone: Tone.DONE },
  [MessageStatus.DISCARDED]: { label: "Discarded", tone: Tone.MUTED },
};

export const NOTE_KIND_LABEL: Record<NoteKindT, string> = {
  [NoteKind.UNENCODED_TERM]: "A term the app can't apply automatically",
  [NoteKind.REVIEW_FLAG]: "Flagged for you",
};
