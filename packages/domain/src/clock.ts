/**
 * Clock implementations. Tiny and used by every package, so they live with the
 * Clock port rather than in any one track's package.
 *
 * Call sites: local-server and Lambda wiring (SystemClock); every test that
 * depends on "today" (FixedClock).
 */
import type { Clock } from "./ports/services";
import type { Instant, LocalDate } from "./primitives";

export class FixedClock implements Clock {
  constructor(private readonly fixed: { now: Instant; today: LocalDate }) {}

  /** Convenience for tests: that date, at noon UTC. */
  static onDate(today: LocalDate): FixedClock {
    return new FixedClock({ now: `${today}T12:00:00.000Z`, today });
  }

  now(): Instant {
    return this.fixed.now;
  }

  today(): LocalDate {
    return this.fixed.today;
  }
}

/** Wall clock. `timeZone` is the household's IANA zone (e.g. "America/Los_Angeles"); no default is assumed. */
export class SystemClock implements Clock {
  private readonly dateFormat: Intl.DateTimeFormat;

  constructor(timeZone: string) {
    // en-CA formats as YYYY-MM-DD.
    this.dateFormat = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  }

  now(): Instant {
    return new Date().toISOString();
  }

  today(): LocalDate {
    return this.dateFormat.format(new Date());
  }
}
