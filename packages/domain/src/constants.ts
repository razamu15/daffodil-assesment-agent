/**
 * Domain tables and constants. Relationships that are naturally tabular are
 * data here, not branching in core or the UI.
 */
import {
  BillFindingKind,
  BillingPeriodState,
  BillVerdict,
  DayOfWeek,
  DocumentKind,
  FindingSeverity,
  LineStatus,
  PendingActionStatus,
} from "./enums";

/**
 * Source precedence when inputs disagree (Doc 3 §3.5). Lower rank = more reliable.
 * Newer beats older within a rank. Bills are claims and never define terms; they are
 * ranked only so every DocumentKind has an entry.
 */
export const SOURCE_PRECEDENCE_RANK: Record<DocumentKind, number> = {
  [DocumentKind.THREAD_SCREENSHOT]: 1,
  [DocumentKind.CHAT_STATEMENT]: 1,
  [DocumentKind.PASTED_THREAD]: 2,
  [DocumentKind.TYPED_NOTES]: 3,
  [DocumentKind.AGREEMENT_PDF]: 2,
  [DocumentKind.BILL_TEXT]: 4,
  [DocumentKind.BILL_SCREENSHOT]: 4,
  [DocumentKind.BILL_PDF]: 4,
};

/** Document kinds that can define agreement terms. */
export const TERM_SOURCE_DOCUMENT_KINDS: readonly DocumentKind[] = [
  DocumentKind.THREAD_SCREENSHOT,
  DocumentKind.CHAT_STATEMENT,
  DocumentKind.PASTED_THREAD,
  DocumentKind.TYPED_NOTES,
  DocumentKind.AGREEMENT_PDF,
];

// ── Verdict derivation (Doc 3 §3.3) ─────────────────────────────────────────

/** Severity each line status contributes. null = contributes nothing. */
export const LINE_STATUS_SEVERITY: Record<LineStatus, FindingSeverity | null> = {
  [LineStatus.MATCHES]: null,
  [LineStatus.DIFFERS]: FindingSeverity.DISCREPANCY,
  [LineStatus.NOT_COVERED]: FindingSeverity.DISCREPANCY,
  [LineStatus.CANNOT_COMPUTE]: FindingSeverity.NEEDS_INFO,
  [LineStatus.UNVERIFIABLE]: FindingSeverity.INFO,
};

export const BILL_FINDING_SEVERITY: Record<BillFindingKind, FindingSeverity> = {
  [BillFindingKind.TOTAL_MISMATCH]: FindingSeverity.DISCREPANCY,
  [BillFindingKind.LINE_OUTSIDE_PERIOD]: FindingSeverity.DISCREPANCY,
  [BillFindingKind.DUPLICATE_LINE]: FindingSeverity.DISCREPANCY,
  [BillFindingKind.NO_AGREEMENT_FOR_SERVICE]: FindingSeverity.DISCREPANCY,
  [BillFindingKind.PERIOD_ALREADY_APPROVED]: FindingSeverity.DISCREPANCY,
  [BillFindingKind.AUTHORIZATION_CLAIM]: FindingSeverity.INFO,
  [BillFindingKind.QUANTITY_UNVERIFIABLE]: FindingSeverity.INFO,
  [BillFindingKind.SCHEDULE_PLAUSIBILITY]: FindingSeverity.INFO,
  [BillFindingKind.OCCURRENCE_COUNT_PLAUSIBILITY]: FindingSeverity.INFO,
};

/** Higher = worse. The verdict comes from the worst severity present. */
export const SEVERITY_RANK: Record<FindingSeverity, number> = {
  [FindingSeverity.INFO]: 1,
  [FindingSeverity.NEEDS_INFO]: 2,
  [FindingSeverity.DISCREPANCY]: 3,
};

/** Worst severity → verdict. A bill with nothing but INFO (or nothing at all) checks out. */
export const VERDICT_BY_WORST_SEVERITY: Record<FindingSeverity | "NONE", BillVerdict> = {
  NONE: BillVerdict.CHECKS_OUT,
  [FindingSeverity.INFO]: BillVerdict.CHECKS_OUT,
  [FindingSeverity.NEEDS_INFO]: BillVerdict.NEEDS_INFO,
  [FindingSeverity.DISCREPANCY]: BillVerdict.DISCREPANCIES,
};

/** Month-status state for a received, checked, unapproved bill. */
export const PERIOD_STATE_BY_VERDICT: Record<BillVerdict, BillingPeriodState> = {
  [BillVerdict.CHECKS_OUT]: BillingPeriodState.CHECKED_OK,
  [BillVerdict.NEEDS_INFO]: BillingPeriodState.CHECKED_NEEDS_INFO,
  [BillVerdict.DISCREPANCIES]: BillingPeriodState.CHECKED_FLAGGED,
};

// ── PendingAction lifecycle (Doc 3 §4.6) ────────────────────────────────────

/** Legal transitions. Every status but PENDING is terminal. */
export const PENDING_ACTION_TRANSITIONS: Record<PendingActionStatus, readonly PendingActionStatus[]> = {
  [PendingActionStatus.PENDING]: [
    PendingActionStatus.CONFIRMED,
    PendingActionStatus.REJECTED,
    PendingActionStatus.WITHDRAWN,
    PendingActionStatus.SUPERSEDED,
    PendingActionStatus.STALE,
    PendingActionStatus.EXPIRED,
  ],
  [PendingActionStatus.CONFIRMED]: [],
  [PendingActionStatus.REJECTED]: [],
  [PendingActionStatus.WITHDRAWN]: [],
  [PendingActionStatus.SUPERSEDED]: [],
  [PendingActionStatus.STALE]: [],
  [PendingActionStatus.EXPIRED]: [],
};

// ── Calendar ────────────────────────────────────────────────────────────────

export const WEEKDAYS: readonly DayOfWeek[] = [DayOfWeek.MON, DayOfWeek.TUE, DayOfWeek.WED, DayOfWeek.THU, DayOfWeek.FRI];

/** Index matches JavaScript's Date#getUTCDay(): 0 = Sunday. */
export const DAY_OF_WEEK_BY_JS_INDEX: readonly DayOfWeek[] = [
  DayOfWeek.SUN,
  DayOfWeek.MON,
  DayOfWeek.TUE,
  DayOfWeek.WED,
  DayOfWeek.THU,
  DayOfWeek.FRI,
  DayOfWeek.SAT,
];

// ── Runtime limits ──────────────────────────────────────────────────────────

export const AUTH_TOKEN_TTL_HOURS = 12;
export const TURN_POLL_INTERVAL_MS = 1000;
/** DynamoDB TransactWriteItems limit; InMemoryStore enforces it too so fakes don't hide it. */
export const STORE_MAX_OPS_PER_COMMIT = 100;
/** The UI resizes images to this longest edge before upload (Doc 2 §3). */
export const UPLOAD_MAX_IMAGE_EDGE_PX = 1500;
/** Lambda's 6 MB payload limit, with headroom for base64 and JSON. */
export const UPLOAD_MAX_BASE64_CHARS = 4_000_000;
/** An uploaded text file or paste. Keeps one document well inside a DynamoDB item (400 KB). */
export const UPLOAD_MAX_TEXT_CHARS = 200_000;
