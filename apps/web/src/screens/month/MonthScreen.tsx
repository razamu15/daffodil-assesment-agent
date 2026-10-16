/**
 * Month & bills (home): "have the bills come?" One row per helper for the
 * period, with its derived state, the first reason it was flagged, and the next
 * step; then every bill for the month (MonthBills). Beside it: small charts and
 * the assistant, so Jordan can drop things in without leaving the month.
 * Starts empty with "Add what you have" guidance and the assistant (Product §7).
 */
import { useState } from "react";
import { BillPeriodKind, BillStatus } from "@helper-assistant/domain";
import type { Bill, Helper, Id, MonthKey, MonthStatus, MonthStatusRow, PaymentRecord } from "@helper-assistant/domain";
import { asClientError, useApiQuery, useApp } from "../../app/AppContext";
import { startChat } from "../../app/chatActions";
import { hrefFor, navigate, routes } from "../../app/routes";
import { addMonths, monthOf } from "../../lib/months";
import { groupedReasons, itemsNeedingDecision } from "../../ui/checkItems";
import { ErrorNote, Loaded, Pill } from "../../ui/common";
import { formatCents, formatDate, formatInstant, formatLongDate, formatMonth, formatPeriod, plural } from "../../ui/format";
import { ApproveDialog } from "../bill/ApproveDialog";
import { CHAT_INTRO, Conversation } from "../chat/Conversation";
import { MonthBills } from "./MonthBills";
import { MonthCharts } from "./MonthCharts";
import { MONTH_ROW_ACTION_LABEL, MonthRowAction, PERIOD_STATE_VIEW } from "./monthRowView";

/** Every bill (all months: the trend chart needs them) and payments. */
type MonthData = { status: MonthStatus; allBills: Bill[]; payments: PaymentRecord[]; helpers: Helper[] };

/**
 * The chat in the side panel. Kept outside the component so it survives moving
 * between months (each move remounts the screen). Starts as a new chat.
 */
let panelSessionId: Id | null = null;

export function MonthScreen({ month }: { month: MonthKey | null }) {
  const query = useApiQuery(async (api): Promise<MonthData> => {
    const [status, { bills, payments }, { helpers }] = await Promise.all([
      api.call("getMonthStatus", { query: month === null ? {} : { month } }),
      api.call("listBills"),
      api.call("listHelpers"),
    ]);
    return { status, allBills: bills, payments, helpers };
  }, [month]);
  return (
    <section className="screen month-screen">
      <Loaded query={query}>
        {(data) => (
          <div className="month-layout">
            <div className="month-main">{data.helpers.length === 0 ? <FirstRun /> : <MonthView {...data} />}</div>
            <aside className="month-side">
              {data.helpers.length > 0 && <MonthCharts month={data.status.month} rows={data.status.rows} bills={data.allBills} helpers={data.helpers} />}
              <AssistantPanel />
            </aside>
          </div>
        )}
      </Loaded>
    </section>
  );
}

function FirstRun() {
  return (
    <div className="first-run">
      <h1>Add what you have</h1>
      <p>
        Paste notes, drop screenshots of texts with your helpers, their bills, or a whole folder into the assistant. It reads them, shows you what it understood,
        and saves nothing until you confirm.
      </p>
    </div>
  );
}

function AssistantPanel() {
  const [sessionId, setSessionId] = useState<Id | null>(panelSessionId);
  const start = (id: Id | null) => {
    panelSessionId = id;
    setSessionId(id);
  };
  return (
    <section className="assistant-panel">
      <header className="assistant-panel-head">
        <h2>Assistant</h2>
        {sessionId !== null && (
          <>
            <a href={hrefFor(routes.chat(sessionId))} className="small">
              Open full chat
            </a>
            <button type="button" className="link-button small" onClick={() => start(null)}>
              New chat
            </button>
          </>
        )}
      </header>
      <Conversation sessionId={sessionId} draft={null} intro={CHAT_INTRO} onSessionStarted={start} />
    </section>
  );
}

function MonthView({ status, allBills, payments, helpers }: MonthData) {
  const [approving, setApproving] = useState<{ bill: Bill; helper: Helper } | null>(null);
  const [payingBillId, setPayingBillId] = useState<Id | null>(null);
  const bills = allBills.filter((b) => monthOf(b.period.start) === status.month);
  const waiting = status.rows.filter((r) => PERIOD_STATE_VIEW[r.state].waitingOnYou).length;
  const thisMonth = monthOf(status.asOf);
  const billById = new Map(bills.map((b) => [b.billId, b]));
  const helperById = new Map(helpers.map((h) => [h.helperId, h]));

  return (
    <>
      <header className="month-head">
        <a className="month-step" href={hrefFor(routes.month(addMonths(status.month, -1)))} aria-label="Previous month">
          ‹
        </a>
        <h1>{formatMonth(status.month)}</h1>
        {status.month < thisMonth ? (
          <a className="month-step" href={hrefFor(routes.month(addMonths(status.month, 1)))} aria-label="Next month">
            ›
          </a>
        ) : (
          <span className="month-step disabled">›</span>
        )}
        <span className="today">Today: {formatLongDate(status.asOf)}</span>
      </header>
      {status.month >= thisMonth && <p className="muted">This month isn't over yet. Bills usually come at the start of next month.</p>}

      {status.rows.length === 0 ? (
        <p className="muted">No helpers were working in {formatMonth(status.month)}.</p>
      ) : (
        <ul className="month-rows">
          {status.rows.map((row) => (
            <MonthRow
              key={row.helperId}
              row={row}
              asOf={status.asOf}
              bill={row.billId === null ? null : (billById.get(row.billId) ?? null)}
              onApprove={(bill) => setApproving({ bill, helper: helperById.get(row.helperId)! })}
              onMarkPaid={(billId) => {
                setPayingBillId(billId);
                document.getElementById(`bill-${billId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            />
          ))}
        </ul>
      )}
      <footer className="month-foot">{waiting === 0 ? "Nothing waiting on you this month." : `Waiting on you: ${plural(waiting, "bill")}`}</footer>
      <MonthBills month={status.month} bills={bills} payments={payments} helpers={helpers} payingBillId={payingBillId} onPay={setPayingBillId} />
      {approving !== null && <ApproveDialog bill={approving.bill} helper={approving.helper} onClose={() => setApproving(null)} />}
    </>
  );
}

type MonthRowProps = { row: MonthStatusRow; asOf: string; bill: Bill | null; onApprove: (bill: Bill) => void; onMarkPaid: (billId: Id) => void };

function MonthRow({ row, asOf, bill, onApprove, onMarkPaid }: MonthRowProps) {
  const { api } = useApp();
  const [error, setError] = useState<string | null>(null);
  const view = PERIOD_STATE_VIEW[row.state];
  // Reasons only for a bill still waiting on a decision; an approved bill's exceptions are settled.
  const reasons = bill !== null && bill.status === BillStatus.RECEIVED && bill.latestCheck ? groupedReasons(itemsNeedingDecision(bill.latestCheck, bill.lineItems)) : [];

  // A period that hasn't ended can't be late: no reminder yet.
  const notDueYet = row.billId === null && row.period.end > asOf;

  const openBill = () => row.billId !== null && navigate(routes.bill(row.billId));
  const actions: Record<MonthRowAction, () => unknown> = {
    [MonthRowAction.DRAFT_REMINDER]: () => {
      const about = row.period.kind === BillPeriodKind.FINAL_SETTLEMENT ? "their final bill" : `the ${formatPeriod(row.period)} bill`;
      return startChat(api, `Draft a reminder for ${row.helperName} about ${about}.`);
    },
    [MonthRowAction.APPROVE]: () => bill !== null && onApprove(bill),
    [MonthRowAction.REVIEW]: openBill,
    [MonthRowAction.MARK_PAID]: () => row.billId !== null && onMarkPaid(row.billId),
    [MonthRowAction.VIEW]: openBill,
  };

  const act = async () => {
    setError(null);
    try {
      await actions[view.action]();
    } catch (e) {
      setError(asClientError(e).message);
    }
  };

  return (
    <li className={`month-row tone-${view.tone}`}>
      <div className="month-who">
        <strong>{row.helperName}</strong>
        <span className="muted">{row.role}</span>
      </div>
      <div className="month-what">
        {row.period.kind !== BillPeriodKind.CALENDAR_MONTH && <div className="period-note">{formatPeriod(row.period)}</div>}
        {row.billedCents !== null ? <span className="billed">{formatCents(row.billedCents)} billed</span> : <span className="muted">—</span>}
        {bill?.approval != null && bill.approval.amountApprovedCents !== row.billedCents && (
          <div className="muted small">{formatCents(bill.approval.amountApprovedCents)} approved</div>
        )}
      </div>
      <div className="month-state">
        <Pill tone={view.tone}>{notDueYet ? "Not due yet" : view.status(row)}</Pill>
        {reasons[0] !== undefined && (
          <a className="why-line" href={hrefFor(routes.bill(row.billId!))}>
            {reasons
              .slice(0, 2)
              .map((r) => `${r.titles}: ${r.short}`)
              .join(" · ")}
            {reasons.length > 2 && <span className="muted"> · and {plural(reasons.length - 2, "more")}</span>}
          </a>
        )}
        {row.askedHelperAt !== null && <span className="muted small">You asked {row.helperName} on {formatInstant(row.askedHelperAt)}</span>}
        {notDueYet && <span className="muted small">Period runs to {formatDate(row.period.end)}</span>}
        {row.billId === null && row.period.kind === BillPeriodKind.FINAL_SETTLEMENT && <span className="small">Last day was {formatDate(row.period.end)}. A final bill is expected.</span>}
        {error !== null && <ErrorNote error={error} />}
      </div>
      <div className="month-action">
        {!notDueYet && (
          <button type="button" className={view.waitingOnYou ? "primary" : undefined} onClick={act}>
            {MONTH_ROW_ACTION_LABEL[view.action]}
          </button>
        )}
      </div>
    </li>
  );
}
