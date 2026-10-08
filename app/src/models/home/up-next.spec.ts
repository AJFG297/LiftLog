import { describe, expect, it } from 'vitest';
import { Duration, LocalDate } from '@js-joda/core';
import { Rest, SessionBlueprint } from '@/models/blueprint-models';
import { makeCardioBlueprint, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { workout } from '@/models/home/__test__/home-sessions';
import { estimatedMinutesOf, lastDoneLabelOf, lastDoneOf, namePreviewOf } from '@/models/home/up-next';

const today = LocalDate.of(2025, 4, 10);
const pushPlan = new SessionBlueprint(
  'Push',
  [
    makeWeightedBlueprint({
      name: 'Bench Press',
      sets: 3,
      restBetweenSets: { ...Rest.medium, rest: Duration.ofSeconds(120) },
    }),
  ],
  '',
);

describe('estimatedMinutesOf', () => {
  it('is the median of the last five times the workout was done, to the nearest 5 minutes', () => {
    const sessions = [
      workout('Push', today.minusDays(1), { minutes: 52 }),
      workout('Push', today.minusDays(3), { minutes: 47 }),
      workout('Push', today.minusDays(5), { minutes: 61 }),
      workout('Push', today.minusDays(7), { minutes: 44 }),
      workout('Push', today.minusDays(9), { minutes: 49 }),
      // Older than the last five, so it doesn't count.
      workout('Push', today.minusDays(40), { minutes: 120 }),
      workout('Pull', today.minusDays(2), { minutes: 90 }),
    ];

    // 44, 47, 49, 52, 61: the median is 49.
    expect(estimatedMinutesOf(pushPlan, sessions)).toBe(50);
  });

  it('averages the middle two of an even number', () => {
    const sessions = [
      workout('Push', today.minusDays(1), { minutes: 30 }),
      workout('Push', today.minusDays(3), { minutes: 40 }),
    ];

    expect(estimatedMinutesOf(pushPlan, sessions)).toBe(35);
  });

  it('works a new workout out from its plan: each set and its rest', () => {
    // 3 × (40 s + 120 s) is 8 minutes, which rounds to 10.
    expect(estimatedMinutesOf(pushPlan, [])).toBe(10);
  });

  it('gives a cardio set without a time target ten minutes', () => {
    // Each set has a distance target, which counts as ten minutes.
    const plan = new SessionBlueprint('Row', [makeCardioBlueprint(2)], '');

    expect(estimatedMinutesOf(plan, [])).toBe(20);
  });

  it('has nothing to say about an empty workout', () => {
    expect(estimatedMinutesOf(new SessionBlueprint('Empty', [], ''), [])).toBeUndefined();
  });
});

describe('lastDoneOf', () => {
  it('is the latest day a workout of that name was started', () => {
    const sessions = [
      workout('Push', today.minusDays(9)),
      workout('Push', today.minusDays(2)),
      workout('Push', today.minusDays(1), { logged: false }),
      workout('Pull', today),
    ];

    expect(lastDoneOf('Push', sessions)?.toString()).toBe('2025-04-08');
    expect(lastDoneOf('Legs', sessions)).toBeUndefined();
  });
});

describe('lastDoneLabelOf', () => {
  it('says today, yesterday, a weekday inside the week, and a date after that', () => {
    expect(lastDoneLabelOf(today, today)).toEqual({ kind: 'today' });
    expect(lastDoneLabelOf(today.minusDays(1), today)).toEqual({ kind: 'yesterday' });
    expect(lastDoneLabelOf(today.minusDays(6), today)).toEqual({ kind: 'weekday', date: today.minusDays(6) });
    expect(lastDoneLabelOf(today.minusDays(7), today)).toEqual({ kind: 'date', date: today.minusDays(7) });
  });
});

describe('namePreviewOf', () => {
  it('shows the first few names and counts the rest', () => {
    expect(namePreviewOf(['Bench Press', 'Overhead Press', 'Dips', 'Flyes'], 2)).toEqual({
      names: ['Bench Press', 'Overhead Press'],
      more: 2,
    });
    expect(namePreviewOf(['Squat'], 3)).toEqual({ names: ['Squat'], more: 0 });
  });
});
