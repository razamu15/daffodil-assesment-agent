/**
 * Calendar arithmetic on household-local dates and times. Everything here works on
 * wall-clock strings with no timezone (see domain primitives.ts), so UTC Date
 * maths is only a convenient day counter, never a timezone conversion.
 *
 * Call sites: the checker (line dates, timed pricing, plausibility counts),
 * deriveMonthStatus (periods), the propose pipeline (closing a term the day
 * before its replacement starts, final-settlement periods), api (default month).
 */
import { DAY_OF_WEEK_BY_JS_INDEX } from "@helper-assistant/domain";
import type { DayOfWeek, LocalDate, LocalDateTime, LocalTime, MonthKey } from "@helper-assistant/domain";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MINUTES_PER_DAY = 24 * 60;

const toUtcMs = (date: LocalDate): number => Date.parse(`${date}T00:00:00Z`);
const fromUtcMs = (ms: number): LocalDate => new Date(ms).toISOString().slice(0, 10);

export function dayOfWeek(date: LocalDate): DayOfWeek {
  return DAY_OF_WEEK_BY_JS_INDEX[new Date(toUtcMs(date)).getUTCDay()]!;
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * MS_PER_DAY);
}

/** Every date from start to end, inclusive. */
export function datesBetween(start: LocalDate, end: LocalDate): LocalDate[] {
  const dates: LocalDate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

export function monthOf(date: LocalDate): MonthKey {
  return date.slice(0, 7);
}

export function firstDayOfMonth(month: MonthKey): LocalDate {
  return `${month}-01`;
}

export function lastDayOfMonth(month: MonthKey): LocalDate {
  const [year, monthNumber] = month.split("-").map(Number) as [number, number];
  // Day 0 of the next month is the last day of this one.
  return fromUtcMs(Date.UTC(year, monthNumber, 0));
}

/** The calendar month before the one `date` falls in: "the most recent closed month". */
export function previousMonth(date: LocalDate): MonthKey {
  return monthOf(addDays(firstDayOfMonth(monthOf(date)), -1));
}

/** Inclusive ranges overlap. */
export function rangesOverlap(a: { start: LocalDate; end: LocalDate }, b: { start: LocalDate; end: LocalDate }): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function dateOf(dateTime: LocalDateTime): LocalDate {
  return dateTime.slice(0, 10);
}

export function minutesOfTime(time: LocalTime): number {
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return hours * 60 + minutes;
}

/** Minutes since an arbitrary epoch, so two LocalDateTimes can be subtracted across midnight. */
export function absoluteMinutes(dateTime: LocalDateTime): number {
  return toUtcMs(dateOf(dateTime)) / 60_000 + minutesOfTime(dateTime.slice(11, 16));
}

/** The midnight that starts `date`, on the absoluteMinutes scale. */
export function absoluteMinutesOfDate(date: LocalDate): number {
  return toUtcMs(date) / 60_000;
}

/** Inverse of absoluteMinutes, for the calendar date a minute falls on. */
export function dateOfAbsoluteMinutes(minutes: number): LocalDate {
  return fromUtcMs(Math.floor(minutes / MINUTES_PER_DAY) * MS_PER_DAY);
}
