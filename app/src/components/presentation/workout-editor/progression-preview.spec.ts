import { describe, expect, it } from 'vitest';
import BigNumber from 'bignumber.js';
import { formatRepsTarget, ProgressionRule, RepsConfig, uniformTarget } from '@/models/blueprint-models';
import { progressionPreview, type PreviewRow } from '@/components/presentation/workout-editor/progression-preview';
import { rulesForPreset, withLadderCeiling } from '@/components/presentation/workout-editor/routine-progression';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';

const step = new BigNumber(2.5);

const benchWith = (repsConfig: RepsConfig, progression: ProgressionRule[] = []) =>
  makeWeightedBlueprint({ name: 'Bench Press', sets: 3, repsConfig, progression });

const withPreset = (repsConfig: RepsConfig, preset: 'weight' | 'double' | 'off') => {
  const plain = benchWith(repsConfig);
  return plain.with({ progression: rulesForPreset(preset, plain, step) });
};

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
    expect(progressionPreview(withPreset({ type: 'range', min: 8, max: 12 }, 'off'), new BigNumber(100))).toEqual([]);
  });

  it('adds the step every session for Add weight', () => {
    expect(read(progressionPreview(withPreset({ type: 'range', min: 8, max: 12 }, 'weight'), new BigNumber(100)))).toEqual(
      ['0: 100 × 8-12', '1: 102.5 × 8-12 (+2.5 kg)', '2: 105 × 8-12 (+2.5 kg)', '3: 107.5 × 8-12 (+2.5 kg)'],
    );
  });

  it('climbs a range as a block to the limit, then adds weight and starts over, for Reps then weight', () => {
    const exercise = withLadderCeiling(withPreset({ type: 'range', min: 8, max: 12 }, 'double'), new BigNumber(16));
    expect(read(progressionPreview(exercise, new BigNumber(100)))).toEqual([
      '0: 100 × 8-12',
      '1: 100 × 9-13 (+1 reps)',
      '…',
      '4: 100 × 12-16 (+4 reps)',
      '5: 102.5 × 8-12 (+2.5 kg)',
    ]);
  });

  it('shows every rung when the ladder is short', () => {
    const exercise = withLadderCeiling(withPreset({ type: 'fixed', reps: 8 }, 'double'), new BigNumber(10));
    expect(read(progressionPreview(exercise, new BigNumber(60)))).toEqual([
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
    const rows = progressionPreview(custom, new BigNumber(100));
    expect(rows).toHaveLength(4);
    // Only the lowest set moves each time, so the heaviest set climbs once the others have caught up.
    expect(rows.map((row) => (row.kind === 'session' ? row.weight.toNumber() : undefined))).toEqual([
      100, 105, 105, 105,
    ]);
  });

  it('starts from nothing when there is no weight to start from', () => {
    const rows = progressionPreview(withPreset({ type: 'fixed', reps: 5 }, 'weight'), undefined);
    expect(rows.map((row) => (row.kind === 'session' ? row.weight.toNumber() : undefined))).toEqual([0, 2.5, 5, 7.5]);
  });
});
