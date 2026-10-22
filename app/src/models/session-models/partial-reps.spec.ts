import { describe, expect, it, vi } from 'vitest';
import BigNumber from 'bignumber.js';
import { OffsetDateTime } from '@js-joda/core';
import { makeSession, makeWeightedBlueprint } from './__test__/helpers';
import { PotentialSet, RecordedWeightedExercise } from './recorded-weighted-exercise';
import { formatCompletedReps } from './partial-reps';
import {
  SetEntryState,
  withTypedValue,
  withSetToggled,
  withAddedSet,
  withSetKind,
  withSetRemoved,
  withSetRestored,
} from './set-entry';
import { Weight } from '../weight';
import { fromWorkoutRows, toWorkoutRows } from '@/services/workout-rows';
import { sessionSetRows } from '@/models/workout-detail';
import { formatExerciseSummary } from '@/components/presentation/summary/format-exercise-summary';
import { exportToCsv, exportToJson } from '@/store/settings/export-plaintext-effects';
import { SharedSession } from '@/models/feed-models';

vi.mock('expo-localization', () => ({ getLocales: () => [{ decimalSeparator: '.' }] }));

const first = { list: 'working', index: 0 } as const;
const now = OffsetDateTime.parse('2026-10-22T10:00:00Z');
function fixture(): SetEntryState {
  const blueprint = makeWeightedBlueprint({
    plannedSets: [
      { kind: 'working', reps: { min: 5, max: 5 } },
      { kind: 'working', reps: { min: 5, max: 5 } },
    ],
  });
  return {
    exercise: new RecordedWeightedExercise(
      blueprint,
      [0, 1].map(() => PotentialSet.of({ weight: new Weight(100, 'kilograms'), target: { min: 5, max: 5 } })),
      undefined,
    ),
    drafts: {},
  };
}
const type = (s: SetEntryState, field: 'reps' | 'partialReps', n: number) =>
  withTypedValue(s, first, field, new BigNumber(n), 'kilograms');

describe('partial rep logging', () => {
  it('keeps partials separate through log, full-rep edits, undo and relog', () => {
    let state = type(type(fixture(), 'reps', 3), 'partialReps', 2);
    expect(state.exercise.potentialSets[0]!.set).toBeUndefined();
    expect(state.exercise.potentialSets[0]!.loggedPartialReps).toBeUndefined();
    state = withSetToggled(state, first, now);
    state = type(state, 'reps', 4);
    expect(state.exercise.potentialSets[0]!.set?.repsCompleted).toBe(4);
    expect(state.exercise.potentialSets[0]!.loggedPartialReps).toBe(2);
    const otherLogged = withSetToggled(state, { list: 'working', index: 1 }, now);
    expect(otherLogged.exercise.isSuccessForProgressiveOverload).toBe(false);
    state = withSetToggled(state, first, now);
    expect(state.exercise.potentialSets[0]!.partialReps).toBe(2);
    state = withSetToggled(state, first, now);
    expect(state.exercise.potentialSets[0]!.set?.repsCompleted).toBe(4);
    expect(state.exercise.potentialSets[0]!.loggedPartialReps).toBe(2);
  });

  it('supports partial-only sets and clearing their count', () => {
    let state = withSetToggled(type(type(fixture(), 'reps', 0), 'partialReps', 3), first, now);
    expect(
      formatCompletedReps(
        state.exercise.potentialSets[0]!.set!.repsCompleted,
        state.exercise.potentialSets[0]!.loggedPartialReps,
      ),
    ).toBe('0+3P');
    state = type(state, 'partialReps', 0);
    expect(state.exercise.potentialSets[0]!.partialReps).toBeUndefined();
  });

  it('exports partials in a separate CSV column and omits unlogged metadata from JSON', async () => {
    let state = withSetToggled(type(type(fixture(), 'reps', 0), 'partialReps', 3), first, now);
    state = withTypedValue(state, { list: 'working', index: 1 }, 'partialReps', new BigNumber(7), 'kilograms');
    const session = makeSession([state.exercise.blueprint]).withExercise(0, state.exercise);
    async function* batch() {
      yield [session];
    }
    const csv = new TextDecoder().decode(await exportToCsv(batch()));
    const [header, row] = csv.split('\r\n').map((line) => line.split(','));
    expect(header!.at(-1)).toBe('PartialReps');
    expect(row![header!.indexOf('Reps')]).toBe('0');
    expect(row!.at(-1)).toBe('3');
    const json = new TextDecoder().decode(await exportToJson(batch()));
    expect(json).toContain('"partialReps":3');
    expect(json).not.toContain('"partialReps":7');
    const shared = new SharedSession(session).toJSON();
    const sharedExercise = shared.session.recordedExercises[0];
    expect(sharedExercise?.type).toBe('RecordedWeightedExercise');
    if (sharedExercise?.type === 'RecordedWeightedExercise') {
      expect(sharedExercise.potentialSets.map((s) => s.partialReps)).toEqual([3, undefined]);
    }
  });

  it('moves partials with set kinds, deletes and restores them, but never adds or carries them', () => {
    const state = type(fixture(), 'partialReps', 2);
    const added = withAddedSet(state, 'kilograms');
    expect(added.exercise.potentialSets.at(-1)!.partialReps).toBeUndefined();
    expect(
      state.exercise.potentialSets[0]!.carriedInto('working', {
        planTarget: { min: 5, max: 5 },
        repsAreProgressed: false,
        fallbackUnit: 'kilograms',
      }).partialReps,
    ).toBeUndefined();
    const warmup = withSetKind(state, first, 'warmup');
    expect(warmup.exercise.warmupSets[0]!.partialReps).toBe(2);
    const removed = withSetRemoved(state, first);
    const restored = withSetRestored(removed.state, removed.removed!);
    expect(restored.exercise.potentialSets[0]!.partialReps).toBe(2);
  });

  it('round-trips logged and unlogged partials and displays only logged performance', () => {
    let state = withSetToggled(type(type(fixture(), 'reps', 3), 'partialReps', 2), first, now);
    state = withTypedValue(state, { list: 'working', index: 1 }, 'partialReps', new BigNumber(7), 'kilograms');
    const session = makeSession([state.exercise.blueprint]).withExercise(0, state.exercise);
    const rows = toWorkoutRows(session);
    expect(rows.weightedSets.map((s) => s.partialReps)).toEqual([2, 7]);
    expect(fromWorkoutRows(rows).toJSON()).toEqual(session.toJSON());
    expect(sessionSetRows(session, [])[0]![0]).toMatchObject({ reps: 3, partialReps: 2 });
    expect(
      formatExerciseSummary(state.exercise, { isFilled: true, showWeight: true, bodyweightLabel: 'BW' }),
    ).toContain('3+2P');
    const cleaned = state.exercise.withoutUnloggedSetMetadata();
    expect(cleaned.potentialSets.map((s) => s.partialReps)).toEqual([2, undefined]);
  });
});
