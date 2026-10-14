/**
 * Scalar value types shared by every entity.
 *
 * Dates and times are household-local strings with no timezone: a bill line
 * "7pm–12am" is stored as two LocalDateTimes, so crossing midnight is explicit
 * data rather than a hidden "+1 day" rule. Only system timestamps (createdAt,
 * approvedAt, …) are absolute Instants.
 *
 * Money is integer cents everywhere, including model-facing tool schemas, so
 * there is exactly one representation and no float arithmetic in the checker.
 */
import { z } from "zod";

export const IdSchema = z.string().min(1);
export type Id = z.infer<typeof IdSchema>;

/** Calendar date in the household's local time, e.g. "2026-09-15". */
export const LocalDateSchema = z.iso.date().describe("Local calendar date, YYYY-MM-DD");
export type LocalDate = z.infer<typeof LocalDateSchema>;

/** Wall-clock time in 24h form, e.g. "23:00". */
export const LocalTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm (24h)")
  .describe("Local wall-clock time, HH:mm 24h");
export type LocalTime = z.infer<typeof LocalTimeSchema>;

/** Household-local date and time with no zone, e.g. "2026-09-12T19:00". */
export const LocalDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/, "Expected YYYY-MM-DDTHH:mm")
  .describe("Local date and time, YYYY-MM-DDTHH:mm, no timezone");
export type LocalDateTime = z.infer<typeof LocalDateTimeSchema>;

/** Absolute system timestamp (ISO 8601, UTC). */
export const InstantSchema = z.iso.datetime();
export type Instant = z.infer<typeof InstantSchema>;

/** A calendar month, e.g. "2026-09". Used to address billing periods in queries. */
export const MonthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");
export type MonthKey = z.infer<typeof MonthKeySchema>;

/** Signed integer cents. Negative only for ADJUSTMENT lines (credits). */
export const CentsSchema = z.number().int().describe("Money in integer cents, e.g. $150.00 → 15000");
export type Cents = z.infer<typeof CentsSchema>;

export const NonNegativeCentsSchema = CentsSchema.nonnegative();

/** Short integer reference for a PendingAction (#7). Easier for the model to copy than a UUID. */
export const ActionRefSchema = z.number().int().positive();
export type ActionRef = z.infer<typeof ActionRefSchema>;

/** Optimistic-concurrency version. Starts at 1 on create; every write bumps it by one. */
export const VersionSchema = z.number().int().positive();
