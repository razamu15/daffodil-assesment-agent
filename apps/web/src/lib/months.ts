/**
 * Month-key arithmetic on household-local strings (no Date timezones involved).
 *
 * Call sites: the Month screen (prev/next month, the default month), the Bills
 * screen (grouping by month), and the mock API (month-status default, bill filters).
 */
import type { LocalDate, MonthKey } from "@helper-assistant/domain";

export const monthOf = (date: LocalDate): MonthKey => date.slice(0, 7);

export function addMonths(month: MonthKey, delta: number): MonthKey {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (monthNumber - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The most recent month that has ended as of `today`: bills are paid in arrears. */
export const mostRecentClosedMonth = (today: LocalDate): MonthKey => addMonths(monthOf(today), -1);

export const firstDayOf = (month: MonthKey): LocalDate => `${month}-01`;

export function lastDayOf(month: MonthKey): LocalDate {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(days).padStart(2, "0")}`;
}

/** Inclusive date ranges, compared as YYYY-MM-DD strings. */
export const rangesOverlap = (a: { start: LocalDate; end: LocalDate }, b: { start: LocalDate; end: LocalDate }): boolean =>
  a.start <= b.end && b.start <= a.end;
