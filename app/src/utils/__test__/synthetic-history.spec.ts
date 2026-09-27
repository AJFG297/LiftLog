import { LocalDate } from '@js-joda/core';
import { describe, expect, it } from 'vitest';
import { generateSyntheticHistory } from '@/utils/__test__/synthetic-history';

describe('generateSyntheticHistory', () => {
  const end = LocalDate.parse('2026-06-01');
  const sessions = generateSyntheticHistory({ count: 5000, end });

  it('generates exactly the requested count', () => {
    expect(sessions).toHaveLength(5000);
  });

  it('ends the history on the end date', () => {
    const latest = sessions.reduce(
      (max, session) => (session.date.isAfter(max) ? session.date : max),
      sessions[0]!.date,
    );
    expect(latest.equals(end)).toBe(true);
  });

  it('generates no sessions after the end date', () => {
    expect(sessions.filter((session) => session.date.isAfter(end))).toHaveLength(0);
  });
});
