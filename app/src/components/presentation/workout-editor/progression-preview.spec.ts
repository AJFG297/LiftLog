import { describe, expect, it } from 'vitest';
import BigNumber from 'bignumber.js';
import {
  formatRepsTarget,
  ProgressionRule,
  RepsConfig,
  uniformTarget,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { progressionPreview, type PreviewRow } from '@/components/presentation/workout-editor/progression-preview';
import { rulesForPreset, withLadderCeiling } from '@/components/presentation/workout-editor/routine-progression';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { RecordedWeightedExercise } from '@/models/session-models';
import { nextRecordedExercise } from '@/models/session-models/carry-over';
import { Weight } from '@/models/weight';

const step = new BigNumber(2.5);

const benchWith = (repsConfig: RepsConfig, progression: ProgressionRule[] = []) =>
  makeWeightedBlueprint({ name: 'Bench Press', sets: 3, repsConfig, progression });

const withPreset = (repsConfig: RepsConfig, preset: 'weight' | 'double' | 'off') => {
  const plain = benchWith(repsConfig);
  return plain.with({ progression: rulesForPreset(preset, plain, step) });
};

function previewFromWeight(exercise: WeightedExerciseBlueprint, weight: BigNumber | undefined) {
  const start = RecordedWeightedExercise.empty(exercise, 'kilograms').withAllSets((s) =>
    s.with({ weight: new Weight(weight ?? 0, 'kilograms') }),
  );
  return progressionPreview(start, 'kilograms');
}

/** A row as "100 × 8-12 (+2.5 kg)", which is how the sheet reads it. */
function read(rows: PreviewRow[]): string[] {
  return rows.map((row) => {
    if (row.kind === 'gap') {
      return '…';
    }
    const uniform = uniformTarget(row.reps.map((reps) => ({ reps })));
    const reps = (uniform ? [uniform] : row.reps).map(formatRepsTarget).join(', ');
    const change = !row.change
      ? ''
      : row.change.axis === 'load'
        ? ` (+${row.change.amount.toString()} kg)`
        : ` (+${row.change.amount.toString()} reps)`;
    return `${row.after}: ${row.weight.toString()} × ${reps}${change}`;
  });
}

describe('progressionPreview', () => {
  it('is empty when progression is off', () => {
    expect(previewFromWeight(withPreset({ type: 'range', min: 8, max: 12 }, 'off'), new BigNumber(100))).toEqual([]);
  });

  it('adds the step every session for Add weight', () => {
    expect(
      read(previewFromWeight(withPreset({ type: 'range', min: 8, max: 12 }, 'weight'), new BigNumber(100))),
    ).toEqual(['0: 100 × 8-12', '1: 102.5 × 8-12 (+2.5 kg)', '2: 105 × 8-12 (+2.5 kg)', '3: 107.5 × 8-12 (+2.5 kg)']);
  });

  it('climbs a range as a block to the limit, then adds weight and starts over, for Reps then weight', () => {
    const exercise = withLadderCeiling(withPreset({ type: 'range', min: 8, max: 12 }, 'double'), new BigNumber(16));
    expect(read(previewFromWeight(exercise, new BigNumber(100)))).toEqual([
      '0: 100 × 8-12',
      '1: 100 × 9-13 (+1 reps)',
      '…',
      '4: 100 × 12-16 (+4 reps)',
      '5: 102.5 × 8-12 (+2.5 kg)',
    ]);
  });

  it('shows every rung when the ladder is short', () => {
    const exercise = withLadderCeiling(withPreset({ type: 'fixed', reps: 8 }, 'double'), new BigNumber(10));
    expect(read(previewFromWeight(exercise, new BigNumber(60)))).toEqual([
      '0: 60 × 8',
      '1: 60 × 9 (+1 reps)',
      '2: 60 × 10 (+2 reps)',
      '3: 62.5 × 8 (+2.5 kg)',
    ]);
  });

  it('plays custom rules forward the way the engine runs them', () => {
    const custom = benchWith({ type: 'fixed', reps: 5 }, [
      ProgressionRule.load(new BigNumber(5), { type: 'lowestSets', pick: 'first' }),
    ]);
    const rows = previewFromWeight(custom, new BigNumber(100));
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => (row.kind === 'session' ? row.weight.toNumber() : undefined))).toEqual([
      100, 105, 110, 115,
    ]);
  });

  it('starts from nothing when there is no weight to start from', () => {
    const rows = previewFromWeight(withPreset({ type: 'fixed', reps: 5 }, 'weight'), undefined);
    expect(rows.map((row) => (row.kind === 'session' ? row.weight.toNumber() : undefined))).toEqual([0, 2.5, 5, 7.5]);
  });

  it('starts next time on earned weight and keeps future straight sets consistent with workout carry-over', () => {
    const exercise = withPreset({ type: 'fixed', reps: 5 }, 'weight');
    const last = makeRecordedExercise(exercise, [5, 5, 5]);
    const next = nextRecordedExercise(
      exercise,
      exercise.progressionKey(),
      { [exercise.progressionKey()]: last },
      'kilograms',
    );

    expect(next.potentialSets.map((s) => s.weight.value.toNumber())).toEqual([102.5, 102.5, 102.5]);
    expect(read(progressionPreview(next, 'kilograms'))).toEqual([
      '0: 102.5 × 5',
      '1: 105 × 5 (+2.5 kg)',
      '2: 107.5 × 5 (+2.5 kg)',
      '3: 110 × 5 (+2.5 kg)',
    ]);
  });

  it('holds the next weight when the best set missed its target', () => {
    const exercise = withPreset({ type: 'fixed', reps: 5 }, 'weight');
    const last = makeRecordedExercise(exercise, [4, 4, 4]);
    const next = nextRecordedExercise(
      exercise,
      exercise.progressionKey(),
      { [exercise.progressionKey()]: last },
      'kilograms',
    );

    expect(next.potentialSets.map((s) => s.weight.value.toNumber())).toEqual([100, 100, 100]);
    expect(read(progressionPreview(next, 'kilograms'))).toEqual([
      '0: 100 × 5',
      '1: 102.5 × 5 (+2.5 kg)',
      '2: 105 × 5 (+2.5 kg)',
      '3: 107.5 × 5 (+2.5 kg)',
    ]);
  });

  it('keeps carried rep targets before moving to weight and resetting the ladder', () => {
    const exercise = withLadderCeiling(withPreset({ type: 'fixed', reps: 8 }, 'double'), new BigNumber(10));
    const last = makeRecordedExercise(exercise, [9, 9, 9]).withAllSets((s) => s.with({ target: { min: 9, max: 9 } }));
    const next = nextRecordedExercise(
      exercise,
      exercise.progressionKey(),
      { [exercise.progressionKey()]: last },
      'kilograms',
    );

    expect(next.potentialSets.map((s) => s.target.max)).toEqual([10, 10, 10]);
    expect(read(progressionPreview(next, 'kilograms'))).toEqual(['0: 100 × 10', '1: 102.5 × 8 (+2.5 kg)']);
  });

  it('converts earned weight into the preferred unit before simulating later logged sessions', () => {
    const exercise = withPreset({ type: 'fixed', reps: 5 }, 'weight');
    const last = makeRecordedExercise(exercise, [5, 5, 5]);
    const next = nextRecordedExercise(
      exercise,
      exercise.progressionKey(),
      { [exercise.progressionKey()]: last },
      'pounds',
    );
    const rows = progressionPreview(next, 'pounds');

    expect(rows.map((row) => (row.kind === 'session' ? row.weight.toNumber() : undefined))).toEqual([
      225.97355, 228.47355, 230.97355, 233.47355,
    ]);
  });

  it('shows the original target and counts up when the workout has no history', () => {
    const exercise = withPreset({ type: 'fixed', reps: 5 }, 'weight');
    const next = nextRecordedExercise(exercise, exercise.progressionKey(), {}, 'kilograms');

    expect(next.potentialSets.map((s) => s.weight.value.toNumber())).toEqual([0, 0, 0]);
    expect(read(progressionPreview(next, 'kilograms'))).toEqual([
      '0: 0 × 5',
      '1: 2.5 × 5 (+2.5 kg)',
      '2: 5 × 5 (+2.5 kg)',
      '3: 7.5 × 5 (+2.5 kg)',
    ]);
  });

  it('retains the pyramid shape when a rule only moves its lowest set', () => {
    const exercise = benchWith(
      {
        type: 'perSet',
        targets: [
          { min: 12, max: 12 },
          { min: 10, max: 10 },
          { min: 8, max: 8 },
        ],
      },
      [ProgressionRule.load(new BigNumber(5), { type: 'lowestSets', pick: 'first' })],
    );
    const last = makeRecordedExercise(exercise, [12, 10, 8])
      .withSet(0, (s) => s.with({ weight: new Weight(60, 'kilograms') }))
      .withSet(1, (s) => s.with({ weight: new Weight(70, 'kilograms') }))
      .withSet(2, (s) => s.with({ weight: new Weight(80, 'kilograms') }));
    const next = nextRecordedExercise(
      exercise,
      exercise.progressionKey(),
      { [exercise.progressionKey()]: last },
      'kilograms',
    );

    expect(next.potentialSets.map((s) => s.weight.value.toNumber())).toEqual([65, 70, 80]);
    expect(read(progressionPreview(next, 'kilograms'))).toEqual([
      '0: 80 × 12, 10, 8',
      '1: 80 × 12, 10, 8 (+5 kg)',
      '2: 80 × 12, 10, 8 (+5 kg)',
      '3: 80 × 12, 10, 8 (+5 kg)',
    ]);
  });
});
