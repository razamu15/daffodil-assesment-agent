/**
 * Display formatting: money, household-local dates and times, periods.
 * LocalDates are formatted in UTC so a "2026-09-04" never shifts a day with the
 * viewer's timezone. Instants (system timestamps) use the viewer's local time.
 *
 * Call sites: every screen, and the mock's server-written text (summaries, drafts).
 */
import { BillPeriodKind } from "@helper-assistant/domain";
import type { BillingPeriod, BillPeriodKind as BillPeriodKindT, Cents, Instant, LocalDate, LocalDateTime, LocalTime, MonthKey } from "@helper-assistant/domain";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** $150 for whole dollars, $14.50 otherwise. */
export function formatCents(cents: Cents): string {
  const text = dollars.format(cents / 100);
  return cents % 100 === 0 ? text.replace(/\.00$/, "") : text;
}

const utcDate = (date: LocalDate): Date => new Date(`${date}T00:00:00Z`);
const shortDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekdayDate = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const instantText = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "Sep 4" */
export const formatDate = (date: LocalDate): string => shortDate.format(utcDate(date));
/** "Fri, Sep 4" */
export const formatWeekdayDate = (date: LocalDate): string => weekdayDate.format(utcDate(date));
/** "Sep 4, 2026" */
export const formatLongDate = (date: LocalDate): string => longDate.format(utcDate(date));
/** "September 2026" */
export const formatMonth = (month: MonthKey): string => monthName.format(utcDate(`${month}-01`));
/** "Oct 14, 5:03 PM" */
export const formatInstant = (instant: Instant): string => instantText.format(new Date(instant));

/** "22:00" → "10pm", "23:30" → "11:30pm". */
export function formatTime(time: LocalTime): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${String(m).padStart(2, "0")}${suffix}`;
}

/** "6pm–11:30pm" from two LocalDateTimes. */
export const formatTimeRange = (startAt: LocalDateTime, endAt: LocalDateTime): string => `${formatTime(startAt.slice(11))}–${formatTime(endAt.slice(11))}`;

const range = (p: BillingPeriod): string => `${formatDate(p.start)} – ${formatDate(p.end)}`;

const PERIOD_TEXT: Record<BillPeriodKindT, (p: BillingPeriod) => string> = {
  [BillPeriodKind.CALENDAR_MONTH]: (p) => formatMonth(p.start.slice(0, 7)),
  [BillPeriodKind.CUSTOM_RANGE]: range,
  [BillPeriodKind.FINAL_SETTLEMENT]: (p) => `${range(p)} (final bill)`,
};

/** "September 2026", "Sep 25 – Oct 3", "Oct 1 – Oct 14 (final bill)". */
export const formatPeriod = (period: BillingPeriod): string => PERIOD_TEXT[period.kind](period);

/** "1 thing", "2 things". */
export const plural = (count: number, one: string, many = `${one}s`): string => `${count} ${count === 1 ? one : many}`;
