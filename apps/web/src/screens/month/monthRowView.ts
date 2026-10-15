/**
 * How each derived period state looks on the Month screen, as one table: the
 * status text, its tone, whether it counts toward "Waiting on you", and the
 * row's button. The state itself comes from the API (deriveMonthStatus).
 */
import { BillingPeriodState } from "@helper-assistant/domain";
import type { BillingPeriodState as BillingPeriodStateT, MonthStatusRow } from "@helper-assistant/domain";
import { formatDate, plural } from "../../ui/format";
import { Tone } from "../../ui/labels";

export const MonthRowAction = {
  DRAFT_REMINDER: "DRAFT_REMINDER",
  APPROVE: "APPROVE",
  REVIEW: "REVIEW",
  MARK_PAID: "MARK_PAID",
  VIEW: "VIEW",
} as const;
export type MonthRowAction = (typeof MonthRowAction)[keyof typeof MonthRowAction];

export const MONTH_ROW_ACTION_LABEL: Record<MonthRowAction, string> = {
  [MonthRowAction.DRAFT_REMINDER]: "Draft a reminder",
  [MonthRowAction.APPROVE]: "Approve",
  [MonthRowAction.REVIEW]: "Review",
  [MonthRowAction.MARK_PAID]: "Mark as paid",
  [MonthRowAction.VIEW]: "View",
};

type RowView = {
  status: (row: MonthStatusRow) => string;
  tone: Tone;
  /** Counts toward "Waiting on you: N bills". */
  waitingOnYou: boolean;
  action: MonthRowAction;
};

export const PERIOD_STATE_VIEW: Record<BillingPeriodStateT, RowView> = {
  [BillingPeriodState.NOT_RECEIVED]: { status: () => "Not received yet", tone: Tone.MUTED, waitingOnYou: false, action: MonthRowAction.DRAFT_REMINDER },
  [BillingPeriodState.RECEIVED]: { status: () => "Received, not checked yet", tone: Tone.INFO, waitingOnYou: false, action: MonthRowAction.VIEW },
  [BillingPeriodState.CHECKED_OK]: { status: () => "✓ Checks out", tone: Tone.OK, waitingOnYou: true, action: MonthRowAction.APPROVE },
  [BillingPeriodState.CHECKED_NEEDS_INFO]: {
    status: (r) => `? ${plural(r.attentionCount, "thing")} need${r.attentionCount === 1 ? "s" : ""} your input`,
    tone: Tone.WARN,
    waitingOnYou: true,
    action: MonthRowAction.REVIEW,
  },
  [BillingPeriodState.CHECKED_FLAGGED]: { status: (r) => `⚠ ${plural(r.attentionCount, "thing")} to look at`, tone: Tone.BAD, waitingOnYou: true, action: MonthRowAction.REVIEW },
  [BillingPeriodState.APPROVED]: { status: () => "Approved, not marked paid", tone: Tone.DONE, waitingOnYou: false, action: MonthRowAction.MARK_PAID },
  [BillingPeriodState.PAID]: { status: (r) => `Paid ${r.paidOn === null ? "" : formatDate(r.paidOn)}`, tone: Tone.DONE, waitingOnYou: false, action: MonthRowAction.VIEW },
};
