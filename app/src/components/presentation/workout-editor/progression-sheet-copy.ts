import {
  ladderCeilingFor,
  presetLoadStep,
  type ProgressionPreset,
  progressionChoiceOf,
  sharedWorkingTopReps,
} from '@/components/presentation/workout-editor/routine-progression';
import type { TranslateFn } from '@/i18n/translate-fn';
import {
  formatPlannedSets,
  ProgressionRule,
  RepsTarget,
  uniformWorkingTarget,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { setKindHas } from '@/models/session-models/set-kind';
import BigNumber from 'bignumber.js';

/** "8–12" or "8", with the en dash the sheet's copy uses for a range. */
export function repsTargetText(target: RepsTarget): string {
  return target.min === target.max ? `${target.max}` : `${target.min}–${target.max}`;
}

/** The plan in the sheet's subtitle: "3 × 8–12", or each set's reps when they differ ("12, 10, 8"). */
export function plannedTargetsOf(exercise: WeightedExerciseBlueprint): string {
  const uniform = uniformWorkingTarget(exercise.plannedSets);
  return uniform
    ? `${exercise.plannedSets.length} × ${repsTargetText(uniform)}`
    : formatPlannedSets(exercise.plannedSets).replace(/(\d)-(\d)/g, '$1–$2');
}

/** The working sets' shared target, or undefined when each set has its own. */
function sharedWorkingTarget(exercise: WeightedExerciseBlueprint): RepsTarget | undefined {
  const working = exercise.plannedSets.filter((set) => setKindHas(set.kind, 'countsTowardsProgression'));
  const [first] = working;
  return first && working.every((set) => set.reps.min === first.reps.min && set.reps.max === first.reps.max)
    ? first.reps
    : undefined;
}

/**
 * What a choice on the progression sheet does, with the exercise's numbers: the step it adds, the reps it
 * waits for, and for Reps then weight where the reps stop and what they drop back to. Read for every card,
 * picked or not, so the numbers are the ones picking it would use.
 */
export function progressionOptionBody(
  t: TranslateFn,
  preset: ProgressionPreset,
  exercise: WeightedExerciseBlueprint,
  fallbackStep: BigNumber,
  formatStep: (step: BigNumber) => string,
): string {
  const step = formatStep(presetLoadStep(exercise, fallbackStep));
  switch (preset) {
    case 'off':
      return t('progression_sheet.off.body');
    case 'weight': {
      const reps = sharedWorkingTopReps(exercise);
      return reps === undefined
        ? t('progression_sheet.weight.per_set_body', { step })
        : t('progression_sheet.weight.body', { step, reps });
    }
    case 'double': {
      const to = ladderCeilingFor(exercise).toNumber();
      const from = sharedWorkingTarget(exercise);
      return from === undefined
        ? t('progression_sheet.double.per_set_body', { to, step })
        : t('progression_sheet.double.body', { to, step, from: repsTargetText(from) });
    }
  }
}

/** The Rules row's line: how many, and that a preset stops being one once they are edited. */
export function rulesSummaryOf(t: TranslateFn, rules: readonly ProgressionRule[]): string {
  if (rules.length === 0) {
    return t('progression_sheet.rules.none.label');
  }
  const count = t(rules.length === 1 ? 'progression_sheet.rules.count_one.label' : 'progression_sheet.rules.count_many.label', {
    count: rules.length,
  });
  return progressionChoiceOf(rules) === 'custom' ? count : t('progression_sheet.rules.preset.label', { count });
}

/** The line under the preview: what a session has to do for the next row to happen. */
export function previewNoteOf(t: TranslateFn, exercise: WeightedExerciseBlueprint): string {
  switch (progressionChoiceOf(exercise.progression)) {
    case 'weight': {
      const reps = sharedWorkingTopReps(exercise);
      return reps === undefined
        ? t('progression_sheet.preview.weight.per_set_note')
        : t('progression_sheet.preview.weight.note', { reps });
    }
    case 'double': {
      const target = sharedWorkingTarget(exercise);
      return target && target.min !== target.max
        ? t('progression_sheet.preview.double.range_note')
        : t('progression_sheet.preview.double.note');
    }
    case 'custom':
      return t('progression_sheet.preview.custom.note');
    case 'off':
      return '';
  }
}
