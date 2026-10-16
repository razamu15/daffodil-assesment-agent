/**
 * Day arithmetic on household-local date strings (YYYY-MM-DD). UTC Date maths
 * is only a day counter here, never a time zone conversion.
 *
 * Call sites: ActionDetails (when a re-dated term starts), mock/apply.ts (closing
 * and re-dating terms like core does).
 */
import type { LocalDate } from "@helper-assistant/domain";

const MS_PER_DAY = 86_400_000;

export const addDays = (date: LocalDate, days: number): LocalDate => new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
