import type { ExerciseEditScope } from '@/components/presentation/workout-editor/exercise-edit-copy';
import { withRoutineSetReps, withWarmupLoad } from '@/components/presentation/workout-editor/routine-sets';
import type { TranslateFn } from '@/i18n/translate-fn';
import {
  nextWarmupSet,
  PlannedWarmupSet,
  Resistance,
  roundWarmupWeight,
  warmupLoadTypesFor,
  WarmupLoadType,
  WeightedExerciseBlueprint,
  withWarmupLoadType,
} from '@/models/blueprint-models';
import { LoadUnit, Weight } from '@/models/weight';
import type { TranslationKey } from '@tolgee/react';
import BigNumber from 'bignumber.js';

export type WarmupPresetId = 'standard' | 'quick' | 'heavy';

/** A preset step: the empty bar, or a share of the working weight. */
type PresetStep = { bar: true; reps: number } | { percent: number; reps: number };

/**
 * The ramps the warm-up sheet offers in one tap. Kept few on purpose: one for most days, a short one
 * when time is tight, and a longer climb before a heavy top set.
 */
export const WARMUP_PRESETS = [
  {
    id: 'standard',
    label: 'exercise_editor.warmups.preset.standard.label',
    steps: [
      { bar: true, reps: 10 },
      { percent: 50, reps: 8 },
      { percent: 75, reps: 5 },
    ],
  },
  {
    id: 'quick',
    label: 'exercise_editor.warmups.preset.quick.label',
    steps: [
      { percent: 50, reps: 8 },
      { percent: 75, reps: 3 },
    ],
  },
  {
    id: 'heavy',
    label: 'exercise_editor.warmups.preset.heavy.label',
    steps: [
      { bar: true, reps: 10 },
      { percent: 40, reps: 8 },
      { percent: 60, reps: 5 },
      { percent: 80, reps: 3 },
      { percent: 90, reps: 1 },
    ],
  },
] as const satisfies readonly { id: WarmupPresetId; label: TranslationKey; steps: readonly PresetStep[] }[];

/**
 * The preset as planned warm-ups for an exercise with `resistance`. The bar and the percentages only mean
 * something for added weight, so a bodyweight or unloaded exercise gets the same ramp as reps alone.
 */
export function warmupPresetSets(id: WarmupPresetId, resistance: Resistance, bar: Weight): PlannedWarmupSet[] {
  const preset = WARMUP_PRESETS.find((p) => p.id === id)!;
  const loaded = resistance === 'external';
  return preset.steps.map((step: PresetStep) => ({
    load: !loaded
      ? undefined
      : 'bar' in step
        ? { type: 'absolute', weight: bar }
        : { type: 'percent', percent: step.percent },
    reps: step.reps,
  }));
}

export function withWarmupPreset(
  exercise: WeightedExerciseBlueprint,
  id: WarmupPresetId,
  bar: Weight,
): WeightedExerciseBlueprint {
  return exercise.with({ warmupSets: warmupPresetSets(id, exercise.resistance, bar) });
}

/** "+ Add warm-up": the next step of the same light ramp the routine editor adds. */
export function withWarmupAdded(exercise: WeightedExerciseBlueprint): WeightedExerciseBlueprint {
  return exercise.with({
    warmupSets: [...exercise.warmupSets, nextWarmupSet(exercise.resistance, exercise.warmupSets)],
  });
}

export function withWarmupRemoved(exercise: WeightedExerciseBlueprint, index: number): WeightedExerciseBlueprint {
  return exercise.with({ warmupSets: exercise.warmupSets.filter((_, i) => i !== index) });
}

export function withWarmupRepsAt(
  exercise: WeightedExerciseBlueprint,
  index: number,
  reps: number,
): WeightedExerciseBlueprint {
  return withRoutineSetReps(exercise, { list: 'warmup', index }, { min: reps, max: reps });
}

/**
 * The number typed into a warm-up's load: a whole percentage up to 100, or a fixed weight in the warm-up's
 * own unit (`unit` when it has none yet). Zero weight is no added weight.
 */
export function withWarmupLoadValue(
  exercise: WeightedExerciseBlueprint,
  index: number,
  value: BigNumber,
  unit: LoadUnit,
): WeightedExerciseBlueprint {
  const load = exercise.warmupSets[index]?.load;
  if (load?.type === 'percent') {
    const percent = Math.min(Math.max(value.integerValue(BigNumber.ROUND_HALF_UP).toNumber(), 0), 100);
    return withWarmupLoad(exercise, index, { type: 'percent', percent });
  }
  const weightUnit = load?.type === 'absolute' && load.weight.unit !== 'nil' ? load.weight.unit : unit;
  return withWarmupLoad(
    exercise,
    index,
    value.isGreaterThan(0) ? { type: 'absolute', weight: new Weight(value, weightUnit) } : undefined,
  );
}

export function withWarmupLoadTypeAt(
  exercise: WeightedExerciseBlueprint,
  index: number,
  type: WarmupLoadType,
): WeightedExerciseBlueprint {
  const warmup = exercise.warmupSets[index];
  if (!warmup || !warmupLoadTypesFor(exercise.resistance).includes(type)) {
    return exercise;
  }
  return exercise.with({ warmupSets: exercise.warmupSets.with(index, withWarmupLoadType(warmup, type)) });
}

/**
 * What a percentage warm-up works out to on `working`, rounded to `step` (plate maths comes later).
 * Undefined for a fixed weight, or when there is no working weight yet to take a share of.
 */
export function resolvedWarmupWeight(
  warmup: PlannedWarmupSet,
  working: Weight | undefined,
  step: BigNumber,
): Weight | undefined {
  if (warmup.load?.type !== 'percent' || !working || !working.value.isGreaterThan(0)) {
    return undefined;
  }
  return roundWarmupWeight(working.multipliedBy(new BigNumber(warmup.load.percent).dividedBy(100)), step);
}

/** The heaviest of today's working sets, which a percentage warm-up is a share of. Undefined before any is set. */
export function workingWeightOf(sets: readonly { weight: Weight }[]): Weight | undefined {
  const heaviest = sets.reduce<Weight | undefined>(
    (max, set) => (!max || set.weight.isGreaterThan(max) ? set.weight : max),
    undefined,
  );
  return heaviest && heaviest.value.isGreaterThan(0) ? heaviest : undefined;
}

export function isEmptyBar(warmup: PlannedWarmupSet, bar: Weight): boolean {
  return warmup.load?.type === 'absolute' && warmup.load.weight.equals(bar);
}

/** The warm-up sheet's last line: where its changes land, by the editor's scope rule. */
export function warmupsScopeNote(t: TranslateFn, scope: ExerciseEditScope): string {
  switch (scope.kind) {
    case 'workout':
      return scope.routineName
        ? t('exercise_editor.warmups.scope.workout.body', { routine: scope.routineName })
        : t('exercise_editor.warmups.scope.workout_no_routine.body');
    case 'pastWorkout':
      return t('exercise_editor.warmups.scope.past_workout.body');
    case 'routine':
      return t('exercise_editor.warmups.scope.routine.body', { routine: routineName(t, scope.routineName) });
    case 'routineDraft':
      return t('exercise_editor.warmups.scope.routine_draft.body', { routine: routineName(t, scope.routineName) });
  }
}

function routineName(t: TranslateFn, name: string): string {
  return name.trim() || t('exercise_editor.scope.unnamed_routine.label');
}
