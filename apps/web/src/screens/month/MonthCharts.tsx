/**
 * Two small charts beside the month:
 *  - Billed this month, one bar per helper, with the agreed amount as text beside
 *    it (the checker's number; "can't tell" when the checker couldn't work it out).
 *  - Billed per month for the six months up to this one.
 * One series each, so one hue and no legend; bars are labeled with their value.
 * Hovering a bar shows its value (title), and the numbers are always on screen.
 * Replaced bills don't count: the corrected bill does.
 *
 * Call site: HomeScreen.
 */
import { BillStatus } from "@helper-assistant/domain";
import type { Bill, Helper, MonthKey, MonthStatusRow } from "@helper-assistant/domain";
import { addMonths, monthOf } from "../../lib/months";
import { billedCents } from "../../ui/billAmounts";
import { formatCents, formatMonth, formatShortMonth } from "../../ui/format";

const TREND_MONTHS = 6;

const countable = (bill: Bill): boolean => bill.status !== BillStatus.SUPERSEDED;

/** Share of the largest value, so the longest bar fills the track. */
const share = (cents: number, max: number): string => `${max === 0 ? 0 : (cents / max) * 100}%`;

type Props = { month: MonthKey; rows: MonthStatusRow[]; bills: Bill[]; helpers: Helper[] };

export function MonthCharts({ month, rows, bills, helpers }: Props) {
  const billById = new Map(bills.map((b) => [b.billId, b]));
  const thisMonth = rows.flatMap((row) => {
    if (row.billedCents === null) return [];
    const bill = row.billId === null ? undefined : billById.get(row.billId);
    return [{ name: row.helperName, billed: row.billedCents, agreed: bill?.latestCheck?.agreedTotalCents ?? null }];
  });
  const maxThisMonth = Math.max(0, ...thisMonth.map((r) => r.billed));

  const trend = Array.from({ length: TREND_MONTHS }, (_, i) => addMonths(month, i - (TREND_MONTHS - 1))).map((m) => ({
    month: m,
    billed: bills.filter((b) => countable(b) && monthOf(b.period.start) === m).reduce((sum, b) => sum + billedCents(b), 0),
  }));
  const maxTrend = Math.max(0, ...trend.map((t) => t.billed));
  const helperCount = helpers.length;

  return (
    <div className="month-charts">
      <figure className="panel chart">
        <figcaption className="panel-head">Billed in {formatMonth(month)}</figcaption>
        {thisMonth.length === 0 ? (
          <p className="muted small">No bills yet{helperCount > 0 ? ` from your ${helperCount} helper${helperCount === 1 ? "" : "s"}` : ""}.</p>
        ) : (
          <ul className="hbars">
            {thisMonth.map((r) => (
              <li key={r.name} title={`${r.name}: ${formatCents(r.billed)} billed`}>
                <span className="hbar-label">{r.name}</span>
                <span className="hbar-track">
                  <span className="hbar" style={{ width: share(r.billed, maxThisMonth) }} />
                </span>
                <span className="hbar-value">{formatCents(r.billed)}</span>
                <span className="hbar-note muted small">{r.agreed === null ? "agreed: can't tell" : `agreed ${formatCents(r.agreed)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </figure>
      <figure className="panel chart">
        <figcaption className="panel-head">Billed per month</figcaption>
        <ol className="vbars" aria-label="Total billed in each of the last six months">
          {trend.map((t) => (
            <li key={t.month} title={`${formatMonth(t.month)}: ${formatCents(t.billed)}`} className={t.month === month ? "current" : undefined}>
              <span className="vbar-value small">{t.billed === 0 ? "—" : formatCents(t.billed)}</span>
              <span className="vbar-track">
                <span className="vbar" style={{ height: share(t.billed, maxTrend) }} />
              </span>
              <span className="vbar-label small">{formatShortMonth(t.month)}</span>
            </li>
          ))}
        </ol>
      </figure>
    </div>
  );
}
