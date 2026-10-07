import { describe, expect, it } from 'vitest';
import { UseTranslateResult } from '@tolgee/react';
import { Duration } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import en from '@/i18n/en.json';
import {
  CardioExerciseBlueprint,
  CardioExerciseSetBlueprint,
  CardioTarget,
  Rest,
} from '@/models/blueprint-models';
import {
  alsoLogOf,
  CardioPadAction,
  CardioPadField,
  cardioPadReducer,
  CardioPadState,
  cardioRestOf,
  cardioRoundsModeOf,
  cardioTargetsSummaryOf,
  withAddedRound,
  withAlsoLog,
  withCardioGoal,
  withCardioRest,
  withCardioRoundsMode,
  withoutRound,
} from '@/components/presentation/workout-editor/cardio-targets';

const t = ((key: string, params?: Record<string, string | number>) =>
  (en as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name]),
  )) as UseTranslateResult['t'];

const min = (minutes: number): CardioTarget => ({ type: 'time', value: Duration.ofMinutes(minutes) });
const km = (value: number): CardioTarget => ({ type: 'distance', value: { unit: 'kilometre', value: BigNumber(value) } });

function cardio(targets: CardioTarget[], rest?: Rest): CardioExerciseBlueprint {
  return new CardioExerciseBlueprint(
    'Treadmill Run',
    targets.map(
      (target) => new CardioExerciseSetBlueprint(target, false, false, false, true, false, false, rest),
    ),
    '',
    '',
  );
}

const steady = cardio([min(30)]);
const intervals = cardio([min(5), min(1), min(5), min(1), min(5)]);

/** Each round's target, as "30 min" or "5 km". */
const rounds = (exercise: CardioExerciseBlueprint) =>
  exercise.sets.map((s) =>
    s.target.type === 'time'
      ? `${s.target.value.toMinutes()} min`
      : `${s.target.value.value.toString()} ${s.target.value.unit === 'kilometre' ? 'km' : s.target.value.unit}`,
  );

function run(exercise: CardioExerciseBlueprint, ...actions: CardioPadAction[]): CardioPadState {
  return actions.reduce(cardioPadReducer, { exercise, pad: undefined });
}

const digits = (typed: string): CardioPadAction[] =>
  typed.split('').map((d) => (d === '.' ? { type: 'decimal' } : { type: 'digit', digit: Number(d) }) as CardioPadAction);

const open = (field: CardioPadField, distanceUnit: 'kilometre' | 'mile' = 'kilometre') =>
  ({ type: 'open', field, distanceUnit }) as const;

describe('cardioRoundsModeOf', () => {
  it('reads one target for every round as the same each round', () => {
    expect(cardioRoundsModeOf(cardio([min(5), min(5), min(5)]))).toBe('same');
    expect(cardioRoundsModeOf(intervals)).toBe('each');
  });
});

describe('Same each round', () => {
  it('types the rounds, then the goal, and writes the goal to every round', () => {
    const state = run(steady, open({ kind: 'rounds' }), ...digits('3'), { type: 'next' }, ...digits('20'));
    expect(rounds(state.exercise)).toEqual(['20 min', '20 min', '20 min']);
    expect(state.pad?.field).toEqual({ kind: 'goal' });
    expect(run(state.exercise, open({ kind: 'goal' }), { type: 'next' }).pad).toBeUndefined();
  });

  it('keeps at least one round and at least a minute', () => {
    const state = run(cardio([min(5), min(5)]), open({ kind: 'rounds' }), ...digits('0'), { type: 'next' }, ...digits('0'));
    expect(rounds(state.exercise)).toEqual(['1 min']);
  });

  it('turns intervals into one target for every round, from the first', () => {
    expect(rounds(withCardioRoundsMode(intervals, 'same'))).toEqual(['5 min', '5 min', '5 min', '5 min', '5 min']);
    expect(withCardioRoundsMode(intervals, 'each')).toBe(intervals);
  });
});

describe('Different each round', () => {
  it('edits one round at a time, with Next stepping to the next round and closing after the last', () => {
    const state = run(
      intervals,
      open({ kind: 'round', index: 3 }),
      ...digits('2'),
      { type: 'next' },
      ...digits('8'),
    );
    expect(rounds(state.exercise)).toEqual(['5 min', '1 min', '5 min', '2 min', '8 min']);
    expect(cardioPadReducer(state, { type: 'next' }).pad).toBeUndefined();
  });

  it('adds a round as a copy of the last, and removes any round but the only one', () => {
    expect(rounds(withAddedRound(cardio([min(5), min(1)])))).toEqual(['5 min', '1 min', '1 min']);
    expect(rounds(withoutRound(intervals, 1))).toEqual(['5 min', '5 min', '1 min', '5 min']);
    expect(withoutRound(steady, 0)).toBe(steady);
  });
});

describe('the cardio number pad', () => {
  it('replaces the value on the first key press and nudges minutes by one', () => {
    const typed = run(steady, open({ kind: 'goal' }), ...digits('45'));
    expect(typed.pad?.text).toBe('45');
    const nudged = run(steady, open({ kind: 'goal' }), { type: 'step', by: 1 }, { type: 'step', by: 1 });
    expect(rounds(nudged.exercise)).toEqual(['32 min']);
  });

  it('types a decimal distance: "0" "." "8" is 0.8 km', () => {
    const state = run(cardio([km(5)]), open({ kind: 'goal' }), ...digits('0.8'));
    expect(state.pad?.text).toBe('0.8');
    expect(rounds(state.exercise)).toEqual(['0.8 km']);
  });

  it('starts a distance with the decimal point as "0." and takes only one point and two decimals', () => {
    const state = run(cardio([km(5)]), open({ kind: 'goal' }), { type: 'decimal' }, ...digits('255'), { type: 'decimal' });
    expect(state.pad?.text).toBe('0.25');
  });

  it('nudges a distance by half a unit, never below 0.1', () => {
    const up = run(cardio([km(5)]), open({ kind: 'goal' }), { type: 'step', by: 1 });
    expect(up.pad?.text).toBe('5.5');
    const down = run(cardio([km(0.4)]), open({ kind: 'goal' }), { type: 'step', by: -1 });
    expect(rounds(down.exercise)).toEqual(['0.1 km']);
  });

  it('shows and writes miles for imperial users', () => {
    const opened = run(cardio([km(5)]), open({ kind: 'goal' }, 'mile'));
    expect(opened.pad?.text).toBe('3.11');
    const typed = cardioPadReducer(opened, { type: 'chip', text: '3.1' });
    expect(typed.exercise.sets[0]!.target).toMatchObject({ type: 'distance', value: { unit: 'mile' } });
    expect(rounds(typed.exercise)).toEqual(['3.1 mile']);
  });

  it('leaves an untouched round as it was', () => {
    const odd = cardio([{ type: 'time', value: Duration.ofSeconds(90) }]);
    expect(run(odd, open({ kind: 'goal' }), { type: 'next' }).exercise).toBe(odd);
  });
});

describe('withCardioGoal', () => {
  it('moves every round to the goal and always tracks it', () => {
    const run5k = withCardioGoal(steady, 'distance', 'kilometre');
    expect(rounds(run5k)).toEqual(['5 km']);
    expect(run5k.sets.every((s) => s.trackDistance)).toBe(true);
    expect(rounds(withCardioGoal(cardio([km(1), km(1)]), 'time', 'kilometre'))).toEqual(['5 min', '5 min']);
    expect(withCardioGoal(steady, 'time', 'kilometre')).toBe(steady);
  });
});

describe('Also log', () => {
  it('applies to every round, and the goal is always logged', () => {
    const logged = withAlsoLog(intervals, 'steps', true);
    expect(logged.sets.every((s) => s.trackSteps)).toBe(true);
    expect(alsoLogOf(logged).steps).toEqual({ on: true, locked: false });
    expect(alsoLogOf(logged).incline).toEqual({ on: true, locked: false });
    expect(alsoLogOf(logged).time).toEqual({ on: true, locked: true });
    expect(withAlsoLog(intervals, 'time', false)).toBe(intervals);
    expect(alsoLogOf(withAlsoLog(logged, 'incline', false)).incline.on).toBe(false);
  });
});

describe('rest between rounds', () => {
  it('is the rounds\' rest, set on every round, and none at 0:00', () => {
    expect(cardioRestOf(intervals)).toBeUndefined();
    const rested = withCardioRest(intervals, Duration.ofSeconds(90));
    expect(rested.sets.every((s) => s.restBetweenSets?.rest.seconds() === 90)).toBe(true);
    expect(cardioRestOf(rested)?.seconds()).toBe(90);
    expect(withCardioRest(rested, Duration.ZERO).sets.every((s) => s.restBetweenSets === undefined)).toBe(true);
  });
});

describe('cardioTargetsSummaryOf', () => {
  it('reads "30 min", "3 × 5.0 km" or the rounds one by one', () => {
    expect(cardioTargetsSummaryOf(t, steady, 'same', 'kilometre')).toBe('30 min');
    expect(cardioTargetsSummaryOf(t, cardio([km(5), km(5), km(5)]), 'same', 'kilometre')).toBe('3 × 5.0 km');
    expect(cardioTargetsSummaryOf(t, intervals, 'each', 'kilometre')).toBe('5 · 1 · 5 · 1 · 5 min');
    expect(cardioTargetsSummaryOf(t, cardio([{ type: 'time', value: Duration.ofSeconds(90) }]), 'same', 'mile')).toBe(
      '1:30 min',
    );
  });
});
