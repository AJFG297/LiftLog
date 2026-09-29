import { Duration, OffsetDateTime } from '@js-joda/core';

export class RestTimer {
  constructor(
    readonly startedAt: OffsetDateTime,
    /**
     * A length picked in the rest sheet (a preset, or +15 early on). Without one, the timer runs for the rest
     * the latest set earned: see `restWindowOf`.
     */
    readonly length?: Duration,
  ) {}

  elapsed(now: OffsetDateTime): Duration {
    return Duration.between(this.startedAt, now);
  }

  equals(other: RestTimer | undefined): boolean {
    return (
      !!other &&
      this.startedAt.isEqual(other.startedAt) &&
      (this.length === undefined ? other.length === undefined : !!other.length && this.length.equals(other.length))
    );
  }
}
