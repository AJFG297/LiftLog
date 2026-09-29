import { describe, expect, it } from 'vitest';
import { Duration } from '@js-joda/core';
import { formatCountdown, formatTimeSpan } from '@/utils/format-time-span';

describe('formatTimeSpan', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(formatTimeSpan(Duration.ofSeconds(150))).toBe('2:30');
    expect(formatTimeSpan(Duration.ofSeconds(5))).toBe('0:05');
  });
});

describe('formatCountdown', () => {
  it('rounds a part second up, so it reads 0:01 until the countdown is over', () => {
    expect(formatCountdown(Duration.ofMillis(119_600))).toBe('2:00');
    expect(formatCountdown(Duration.ofMillis(300))).toBe('0:01');
    expect(formatCountdown(Duration.ofSeconds(71))).toBe('1:11');
    expect(formatCountdown(Duration.ZERO)).toBe('0:00');
  });
});
