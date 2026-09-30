import { describe, it, expect } from 'vitest';
import { Duration, OffsetDateTime, ZoneOffset } from '@js-joda/core';
import { RestTimer } from '@/models/session-models/rest-timer';

const start = OffsetDateTime.of(2025, 4, 5, 12, 0, 0, 0, ZoneOffset.UTC);

describe('RestTimer', () => {
  it('counts elapsed time from the start', () => {
    const timer = new RestTimer(start);
    expect(timer.elapsed(start.plusSeconds(30))).toEqual(Duration.ofSeconds(30));
  });

  it('has no length of its own unless one was picked', () => {
    expect(new RestTimer(start).length).toBeUndefined();
    expect(new RestTimer(start, Duration.ofSeconds(90)).length).toEqual(Duration.ofSeconds(90));
  });

  it('compares equal for the same start and length', () => {
    expect(new RestTimer(start).equals(new RestTimer(start))).toBe(true);
    expect(new RestTimer(start, Duration.ofSeconds(60)).equals(new RestTimer(start, Duration.ofSeconds(60)))).toBe(
      true,
    );
    expect(new RestTimer(start, Duration.ofSeconds(60)).equals(new RestTimer(start))).toBe(false);
    expect(new RestTimer(start).equals(new RestTimer(start, Duration.ofSeconds(60)))).toBe(false);
    expect(new RestTimer(start).equals(new RestTimer(start.plusSeconds(1)))).toBe(false);
    expect(new RestTimer(start).equals(undefined)).toBe(false);
  });
});
