import { defaultCeilingFor, ProgressionRule, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import BigNumber from 'bignumber.js';

/**
 * The three progressions the routine editor offers by name. Each is a fixed shape of rules for the
 * existing engine (docs/Progression.md), so picking one writes rules and reading rules back finds the
 * name again.
 *
 * - `weight`: one load rule, "Add weight".
 * - `double`: reps climb one at a time to a limit and start over, then the weight goes up, "Reps, then
 *   weight". The fixed-target way of setting up double progression.
 * - `off`: no rules.
 */
export type ProgressionPreset = 'weight' | 'double' | 'off';

/** A preset, or `custom` for any other list of rules, which the Advanced editor owns. */
export type ProgressionChoice = ProgressionPreset | 'custom';

export const PROGRESSION_PRESETS: readonly ProgressionPreset[] = ['weight', 'double', 'off'];

export function progressionChoiceOf(rules: readonly ProgressionRule[]): ProgressionChoice {
  if (rules.length === 0) {
    return 'off';
  }
  const [first, second] = rules;
  if (rules.length === 1 && first && isPlainLoadRule(first)) {
    return 'weight';
  }
  if (rules.length === 2 && first && second && isLadderRung(first) && isPlainLoadRule(second)) {
    return 'double';
  }
  return 'custom';
}

function isPlainLoadRule(rule: ProgressionRule): boolean {
  return (
    rule.axis === 'load' &&
    rule.scope.type === 'allSets' &&
    rule.step.isGreaterThan(0) &&
    rule.ceiling === undefined &&
    rule.onCeiling === undefined &&
    rule.trigger === 'allSetsMetTarget'
  );
}

function isLadderRung(rule: ProgressionRule): boolean {
  return (
    rule.axis === 'reps' &&
    rule.scope.type === 'allSets' &&
    rule.step.isEqualTo(1) &&
    rule.ceiling !== undefined &&
    rule.onCeiling === 'reset' &&
    rule.trigger === 'allSetsMetTarget'
  );
}

/**
 * The rules a preset stands for on this exercise. The weight step is the one the exercise already adds,
 * so switching between presets never changes it; `fallbackStep` is only for an exercise with no load rule
 * yet (usually the equipment's step, see `weightStepFor`). The rep limit is the plan's top reps plus the
 * default ladder span.
 */
export function rulesForPreset(
  preset: ProgressionPreset,
  exercise: WeightedExerciseBlueprint,
  fallbackStep: BigNumber,
): ProgressionRule[] {
  const step = presetLoadStep(exercise, fallbackStep);
  switch (preset) {
    case 'off':
      return [];
    case 'weight':
      return [ProgressionRule.load(step)];
    case 'double':
      return [
        ProgressionRule.of({
          axis: 'reps',
          step: new BigNumber(1),
          ceiling: ladderCeilingFor(exercise),
          onCeiling: 'reset',
        }),
        ProgressionRule.load(step),
      ];
  }
}

/** The load step the presets use: the exercise's own, or `fallbackStep` when it has none. */
export function presetLoadStep(exercise: WeightedExerciseBlueprint, fallbackStep: BigNumber): BigNumber {
  const existing = exercise.progression.find((rule) => rule.axis === 'load' && rule.step.isGreaterThan(0))?.step;
  return existing ?? fallbackStep;
}

/**
 * Where "Reps, then weight" stops climbing: the exercise's own limit while it is still above the plan's
 * reps, otherwise the default span above them.
 */
export function ladderCeilingFor(exercise: WeightedExerciseBlueprint): BigNumber {
  const ceiling = exercise.progression.find((rule) => rule.axis === 'reps' && rule.ceiling !== undefined)?.ceiling;
  return ceiling && ceiling.isGreaterThan(topPlannedReps(exercise)) ? ceiling : defaultCeilingFor(exercise);
}

/**
 * After the plan's reps change: a "Reps, then weight" whose limit the reps have reached could never climb,
 * so it gets a new limit above them. Any other progression is left alone.
 */
export function withLadderKeptClimbable(exercise: WeightedExerciseBlueprint): WeightedExerciseBlueprint {
  if (progressionChoiceOf(exercise.progression) !== 'double') {
    return exercise;
  }
  const rung = exercise.progression[0]!;
  const ceiling = ladderCeilingFor(exercise);
  return rung.ceiling?.isEqualTo(ceiling)
    ? exercise
    : exercise.with({ progression: [rung.with({ ceiling }), ...exercise.progression.slice(1)] });
}

/** The top of the plan's rep targets, which is what a set has to reach to count as a success. */
export function topPlannedReps(exercise: WeightedExerciseBlueprint): number {
  return exercise.plannedSets.reduce((highest, set) => Math.max(highest, set.reps.max), 0);
}

/**
 * Whether the presets make sense for the exercise. With no resistance there is no weight to add, so it
 * only gets the Advanced editor.
 */
export function offersProgressionPresets(exercise: WeightedExerciseBlueprint): boolean {
  return exercise.resistance !== 'none';
}
