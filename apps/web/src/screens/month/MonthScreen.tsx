/**
 * Month (home): "have the bills come?" One row per helper for the period, with
 * its derived state, the first reason it was flagged, and the next step.
 * Starts empty with "Add what you have" guidance (Product §7).
 */
import { useState } from "react";
import { BillPeriodKind, BillStatus } from "@helper-assistant/domain";
import type { Bill, Helper, MonthKey, MonthStatus, MonthStatusRow } from "@helper-assistant/domain";
import { asClientError, useApiQuery, useApp } from "../../app/AppContext";
import { startChat } from "../../app/chatActions";
import { hrefFor, navigate, routes } from "../../app/routes";
import { addMonths, monthOf } from "../../lib/months";
import { groupedReasons, itemsNeedingDecision } from "../../ui/checkItems";
import { ErrorNote, Loaded, Pill } from "../../ui/common";
import { formatCents, formatDate, formatInstant, formatLongDate, formatMonth, formatPeriod, plural } from "../../ui/format";
import { ApproveDialog } from "../bill/ApproveDialog";
import { MONTH_ROW_ACTION_LABEL, MonthRowAction, PERIOD_STATE_VIEW } from "./monthRowView";

type MonthData = { status: MonthStatus; bills: Bill[]; helpers: Helper[] };

export function MonthScreen({ month }: { month: MonthKey | null }) {
  const query = useApiQuery(async (api): Promise<MonthData> => {
    const status = await api.call("getMonthStatus", { query: month === null ? {} : { month } });
    const [{ bills }, { helpers }] = await Promise.all([api.call("listBills", { query: { month: status.month } }), api.call("listHelpers")]);
    return { status, bills, helpers };
  }, [month]);
  return <section className="screen">{<Loaded query={query}>{(data) => (data.helpers.length === 0 ? <FirstRun /> : <MonthView {...data} />)}</Loaded>}</section>;
}

function FirstRun() {
  return (
    <div className="first-run">
      <h1>Add what you have</h1>
      <p>Paste notes, drop screenshots of texts with your helpers, or forward their bills. The assistant reads them, shows you what it understood, and saves nothing until you confirm.</p>
      <a className="button primary" href={hrefFor(routes.chat())}>
        Open the assistant
      </a>
    </div>
  );
}

function MonthView({ status, bills, helpers }: MonthData) {
  const [approving, setApproving] = useState<{ bill: Bill; helper: Helper } | null>(null);
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
            />
          ))}
        </ul>
      )}
      <footer className="month-foot">{waiting === 0 ? "Nothing waiting on you this month." : `Waiting on you: ${plural(waiting, "bill")}`}</footer>
      {approving !== null && <ApproveDialog bill={approving.bill} helper={approving.helper} onClose={() => setApproving(null)} />}
    </>
  );
}

function MonthRow({ row, asOf, bill, onApprove }: { row: MonthStatusRow; asOf: string; bill: Bill | null; onApprove: (bill: Bill) => void }) {
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
    [MonthRowAction.MARK_PAID]: () => navigate(routes.bills()),
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
