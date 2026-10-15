/**
 * Month status: "have the bills come?" (Doc 1 §3, Doc 3 §2.3). Derived on every
 * read from helpers, bills, messages and payments; never stored, so nothing has
 * to keep it fresh.
 *
 * Call sites: api GET /api/month-status (getMonthStatus), the agent's
 * get_month_status tool (getMonthStatus), core tests (deriveMonthStatus).
 */
import { BillingPeriodState, BillPeriodKind, BillStatus, HelperStatus, MessageStatus, PERIOD_STATE_BY_VERDICT } from "@helper-assistant/domain";
import type {
  Bill,
  BillingPeriod,
  Helper,
  Instant,
  LocalDate,
  MonthKey,
  MonthStatus,
  MonthStatusRow,
  OutboundMessage,
  PaymentRecord,
} from "@helper-assistant/domain";
import { firstDayOfMonth, lastDayOfMonth, monthOf, rangesOverlap } from "./calendar";
import type { CoreDeps } from "./deps";
import { billedCentsOf } from "./records/billAmounts";
import { blockingItems } from "./checker/severity";

export type MonthStatusInput = {
  month: MonthKey;
  today: LocalDate;
  helpers: readonly Helper[];
  /** Bills whose period starts in `month` (any status). */
  bills: readonly Bill[];
  messages: readonly OutboundMessage[];
  payments: readonly PaymentRecord[];
};

export function deriveMonthStatus(input: MonthStatusInput): MonthStatus {
  const rows = input.helpers.flatMap((helper) => {
    const period = expectedPeriod(helper, input.month);
    return period === null ? [] : [statusRow(helper, period, input)];
  });
  return { month: input.month, asOf: input.today, rows };
}

/** Loads what deriveMonthStatus needs from the Store, as of the Clock's today. */
export async function getMonthStatus({ store, clock }: Pick<CoreDeps, "store" | "clock">, month: MonthKey): Promise<MonthStatus> {
  const [helpers, bills, messages, payments] = await Promise.all([
    store.listHelpers(),
    store.listBills({ month }),
    store.listMessages(),
    store.listPayments(),
  ]);
  return deriveMonthStatus({ month, today: clock.today(), helpers, bills, messages, payments });
}

/**
 * The period a helper owes a bill for in `month`, or null if they weren't working
 * then. A helper who ended during the month owes a FINAL_SETTLEMENT bill up to
 * their last day. An unknown start date (startedOn null) doesn't exclude anyone.
 */
function expectedPeriod(helper: Helper, month: MonthKey): BillingPeriod | null {
  const start = firstDayOfMonth(month);
  const end = lastDayOfMonth(month);
  if (helper.startedOn !== null && helper.startedOn > end) return null;
  if (helper.status === HelperStatus.ENDED && helper.endedOn !== null) {
    if (helper.endedOn < start) return null;
    if (helper.endedOn < end) return { start, end: helper.endedOn, kind: BillPeriodKind.FINAL_SETTLEMENT };
  }
  return { start, end, kind: BillPeriodKind.CALENDAR_MONTH };
}

function statusRow(helper: Helper, period: BillingPeriod, input: MonthStatusInput): MonthStatusRow {
  const helperBills = input.bills.filter((b) => b.helperId === helper.helperId && monthOf(b.period.start) === input.month);
  const bill =
    helperBills
      .filter((b) => b.status !== BillStatus.SUPERSEDED)
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0] ?? null;
  const payment = bill === null ? null : (input.payments.find((p) => p.billId === bill.billId) ?? null);
  const check = bill?.latestCheck ?? null;
  const blocking = check === null ? null : blockingItems(check);

  return {
    helperId: helper.helperId,
    helperName: helper.name,
    role: helper.role,
    helperStatus: helper.status,
    period,
    state: periodState(bill, payment),
    billId: bill?.billId ?? null,
    billedCents: bill === null ? null : billedCentsOf(bill),
    verdict: check?.verdict ?? null,
    attentionCount: blocking === null ? 0 : blocking.lines.length + blocking.findings.length,
    askedHelperAt: lastHandedOffAt(input.messages, helper, period, new Set(helperBills.map((b) => b.billId))),
    paidOn: payment?.paidOn ?? null,
  };
}

function periodState(bill: Bill | null, payment: PaymentRecord | null): BillingPeriodState {
  if (bill === null) return BillingPeriodState.NOT_RECEIVED;
  if (bill.status === BillStatus.APPROVED) return payment === null ? BillingPeriodState.APPROVED : BillingPeriodState.PAID;
  if (bill.latestCheck === null) return BillingPeriodState.RECEIVED;
  return PERIOD_STATE_BY_VERDICT[bill.latestCheck.verdict];
}

/** Most recent handed-off message about this period: tied to one of its bills, or to an overlapping period. */
function lastHandedOffAt(messages: readonly OutboundMessage[], helper: Helper, period: BillingPeriod, billIds: Set<string>): Instant | null {
  const about = messages.filter(
    (m) =>
      m.helperId === helper.helperId &&
      m.status === MessageStatus.HANDED_OFF &&
      m.handedOffAt !== null &&
      ((m.relatedBillId !== null && billIds.has(m.relatedBillId)) || (m.relatedPeriod !== null && rangesOverlap(m.relatedPeriod, period))),
  );
  return about.map((m) => m.handedOffAt!).sort().at(-1) ?? null;
}
