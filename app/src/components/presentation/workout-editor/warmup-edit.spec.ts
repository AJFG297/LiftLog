import { describe, expect, it, vi } from 'vitest';
import { UseTranslateResult } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import en from '@/i18n/en.json';
import { PlannedWarmupSet } from '@/models/blueprint-models';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import {
  isEmptyBar,
  resolvedWarmupWeight,
  WARMUP_PRESETS,
  warmupPresetSets,
  warmupsScopeNote,
  withWarmupAdded,
  withWarmupLoadTypeAt,
  withWarmupLoadValue,
  withWarmupPreset,
  withWarmupRemoved,
  withWarmupRepsAt,
  workingWeightNote,
  workingWeightOf,
  resolvedWeightNote,
} from '@/components/presentation/workout-editor/warmup-edit';

vi.mock('expo-localization', () => ({ getLocales: () => [{ decimalSeparator: '.' }] }));

const t = ((key: string, params?: Record<string, string | number>) =>
  (en as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name]),
  )) as UseTranslateResult['t'];

const kg = (value: number) => new Weight(value, 'kilograms');
const percent = (value: number, reps: number): PlannedWarmupSet => ({
  load: { type: 'percent', percent: value },
  reps,
});
const absolute = (value: number, reps: number): PlannedWarmupSet => ({
  load: { type: 'absolute', weight: kg(value) },
  reps,
});
const bar = kg(20);

describe('warm-up presets', () => {
  it('offers a few ramps, each starting light and climbing', () => {
    expect(WARMUP_PRESETS.map((preset) => preset.id)).toEqual(['standard', 'quick', 'heavy']);
  });

  it('uses three percentage sets for the standard ramp', () => {
    expect(warmupPresetSets('standard', 'external', bar)).toEqual([percent(40, 8), percent(60, 5), percent(80, 3)]);
  });

  it.each(['kilograms', 'pounds'] as const)('scales the standard ramp with the working weight in %s', (unit) => {
    const blueprint = withWarmupPreset(makeWeightedBlueprint({ sets: 1 }), 'standard', new Weight(20, unit));
    const exercise = makeRecordedExercise(blueprint, [undefined], new Weight(100, unit)).withWarmupsFromPlan(unit);
    expect(exercise.warmupSets.map((set) => [set.weight.value.toNumber(), set.weight.unit, set.target.min])).toEqual([
      [40, unit, 8],
      [60, unit, 5],
      [80, unit, 3],
    ]);
    const heavier = makeRecordedExercise(blueprint, [undefined], new Weight(150, unit)).withWarmupsFromPlan(unit);
    expect(heavier.warmupSets.map((set) => set.weight.value.toNumber())).toEqual([60, 90, 120]);
  });

  it('keeps the quick ramp to two percentage sets', () => {
    expect(warmupPresetSets('quick', 'external', bar)).toEqual([percent(50, 8), percent(75, 3)]);
  });

  it('ramps a heavy day in five steps up to 90%', () => {
    expect(warmupPresetSets('heavy', 'external', bar)).toEqual([
      absolute(20, 10),
      percent(40, 8),
      percent(60, 5),
      percent(80, 3),
      percent(90, 1),
    ]);
  });

  it('uses the bar in the unit asked for', () => {
    expect(warmupPresetSets('heavy', 'external', new Weight(45, 'pounds'))[0]).toEqual({
      load: { type: 'absolute', weight: new Weight(45, 'pounds') },
      reps: 10,
    });
  });

  it.each(['bodyweight', 'none'] as const)('plans the reps only on a %s exercise', (resistance) => {
    expect(warmupPresetSets('quick', resistance, bar)).toEqual([
      { load: undefined, reps: 8 },
      { load: undefined, reps: 3 },
    ]);
  });

  it('replaces whatever warm-ups the exercise had', () => {
    const exercise = makeWeightedBlueprint({ warmupSets: [percent(30, 12)] });
    expect(withWarmupPreset(exercise, 'quick', bar).warmupSets).toEqual([percent(50, 8), percent(75, 3)]);
  });
});

describe('editing the planned warm-ups', () => {
  const ramp = makeWeightedBlueprint({ warmupSets: [absolute(20, 10), percent(50, 8), percent(75, 5)] });

  it('adds the next warm-up the way the routine editor does', () => {
    expect(withWarmupAdded(makeWeightedBlueprint()).warmupSets).toEqual([percent(50, 5)]);
    expect(withWarmupAdded(makeWeightedBlueprint({ warmupSets: [percent(50, 5)] })).warmupSets).toEqual([
      percent(50, 5),
      percent(70, 3),
    ]);
  });

  it('adds a reps-only warm-up to a bodyweight exercise', () => {
    expect(withWarmupAdded(makeWeightedBlueprint({ resistance: 'bodyweight' })).warmupSets).toEqual([
      { load: undefined, reps: 5 },
    ]);
  });

  it('removes one warm-up and keeps the rest in order', () => {
    expect(withWarmupRemoved(ramp, 1).warmupSets).toEqual([absolute(20, 10), percent(75, 5)]);
  });

  it('changes a warm-up reps, never below one', () => {
    expect(withWarmupRepsAt(ramp, 2, 3).warmupSets[2]).toEqual(percent(75, 3));
    expect(withWarmupRepsAt(ramp, 2, 0).warmupSets[2]).toEqual(percent(75, 1));
  });

  it('types a percentage as a whole number up to 100', () => {
    expect(withWarmupLoadValue(ramp, 1, new BigNumber(62.4), 'kilograms').warmupSets[1]).toEqual(percent(62, 8));
    expect(withWarmupLoadValue(ramp, 1, new BigNumber(150), 'kilograms').warmupSets[1]).toEqual(percent(100, 8));
  });

  it('types a fixed weight in its own unit, and zero as no weight', () => {
    expect(withWarmupLoadValue(ramp, 0, new BigNumber(25), 'pounds').warmupSets[0]).toEqual(absolute(25, 10));
    expect(withWarmupLoadValue(ramp, 0, new BigNumber(0), 'kilograms').warmupSets[0]).toEqual({
      load: undefined,
      reps: 10,
    });
  });

  it('types a weight in the preferred unit on a warm-up with none yet', () => {
    const bodyweight = makeWeightedBlueprint({ resistance: 'bodyweight', warmupSets: [{ load: undefined, reps: 5 }] });
    expect(withWarmupLoadValue(bodyweight, 0, new BigNumber(10), 'pounds').warmupSets[0]).toEqual({
      load: { type: 'absolute', weight: new Weight(10, 'pounds') },
      reps: 5,
    });
  });

  it('switches a warm-up between a percentage and a fixed weight, keeping its reps', () => {
    expect(withWarmupLoadTypeAt(ramp, 0, 'percent').warmupSets[0]).toEqual(percent(50, 10));
    expect(withWarmupLoadTypeAt(ramp, 1, 'absolute').warmupSets[1]).toEqual({ load: undefined, reps: 8 });
  });
});

describe('resolvedWarmupWeight', () => {
  it('works a percentage out from the working weight', () => {
    expect(resolvedWarmupWeight(percent(50, 8), kg(100), new BigNumber(2.5))).toEqual(kg(50));
  });

  it('rounds to the equipment step', () => {
    expect(resolvedWarmupWeight(percent(75, 5), kg(105), new BigNumber(2.5))).toEqual(kg(80));
    expect(resolvedWarmupWeight(percent(40, 5), kg(105), new BigNumber(2))).toEqual(kg(42));
  });

  it('says nothing without a working weight to work from', () => {
    expect(resolvedWarmupWeight(percent(50, 8), undefined, new BigNumber(2.5))).toBeUndefined();
    expect(resolvedWarmupWeight(percent(50, 8), kg(0), new BigNumber(2.5))).toBeUndefined();
  });

  it('says nothing for a fixed weight, which needs no working out', () => {
    expect(resolvedWarmupWeight(absolute(20, 10), kg(100), new BigNumber(2.5))).toBeUndefined();
  });
});

describe('workingWeightOf', () => {
  it('is the heaviest working set, which percentages are a share of', () => {
    expect(workingWeightOf([{ weight: kg(90) }, { weight: kg(100) }, { weight: kg(95) }])).toEqual(kg(100));
  });

  it('is unknown before any weight is set', () => {
    expect(workingWeightOf([{ weight: kg(0) }])).toBeUndefined();
    expect(workingWeightOf([])).toBeUndefined();
  });
});

describe('isEmptyBar', () => {
  it('recognises a fixed weight equal to the bar', () => {
    expect(isEmptyBar(absolute(20, 10), bar)).toBe(true);
    expect(isEmptyBar(absolute(25, 10), bar)).toBe(false);
    expect(isEmptyBar(percent(20, 10), bar)).toBe(false);
  });
});

describe('warmupsScopeNote', () => {
  it('says a workout change is for today and can be kept at finish', () => {
    expect(warmupsScopeNote(t, { kind: 'workout', routineName: 'Push A' })).toBe(
      'Applies to today. When you finish, you can keep it in Push A.',
    );
  });

  it('says today only for a workout without a routine', () => {
    expect(warmupsScopeNote(t, { kind: 'workout', routineName: undefined })).toBe('Applies to today only.');
  });

  it('says a past workout change stays in that workout', () => {
    expect(warmupsScopeNote(t, { kind: 'pastWorkout' })).toBe('Applies to this workout only.');
  });

  it('names the routine and when the change takes effect', () => {
    expect(warmupsScopeNote(t, { kind: 'routine', routineName: 'Push A' })).toBe(
      'Applies to Push A from your next workout.',
    );
    expect(warmupsScopeNote(t, { kind: 'routineDraft', routineName: 'Push A' })).toBe(
      'Goes into Push A when you save the routine.',
    );
  });
});

describe('the warm-up sheet weights', () => {
  it('spaces the working weight from its unit, like the rest of the app', () => {
    expect(workingWeightNote(t, kg(65))).toBe('Working weight 65 kg · % is of that');
  });

  it('says what a percentage works out to with a space before the unit', () => {
    expect(resolvedWeightNote(t, kg(32.5))).toBe('= 32.5 kg');
    expect(resolvedWeightNote(t, new Weight(95, 'pounds'))).toBe('= 95 lbs');
  });
});
