import {
  progressionChoiceOf,
  sharedWorkingTopReps,
  ladderCeilingFor,
} from '@/components/presentation/workout-editor/routine-progression';
import type { TranslateFn } from '@/i18n/translate-fn';
import {
  CardioExerciseBlueprint,
  ExerciseBlueprint,
  formatPlannedWarmupSets,
  PlannedWarmupSet,
  Resistance,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { ExerciseDescriptor, musclesOf } from '@/models/exercise-models';
import { Session } from '@/models/session-models';
import { exerciseMetaLabel, translateExerciseMeta } from '@/utils/exercise-meta';
import type { TranslationKey } from '@tolgee/react';
import BigNumber from 'bignumber.js';

/**
 * Where an edit lands, which the editor states up front and on its save button, since the same screen
 * changes today's workout in one place and a routine in another.
 *
 * - `workout`: the workout in progress, today only. `routineName` is the routine it was started from, where
 *   the finish screen offers to keep the change; undefined for a workout started without one.
 * - `pastWorkout`: a finished workout opened from history.
 * - `routine`: a saved routine, changed as soon as it is edited.
 * - `routineDraft`: a routine open in the routine editor, whose own Save and Cancel decide.
 */
export type ExerciseEditScope =
  | { kind: 'workout'; routineName: string | undefined }
  | { kind: 'pastWorkout' }
  | { kind: 'routine'; routineName: string }
  | { kind: 'routineDraft'; routineName: string };

/** The workout in progress changes today only; any other workout is a past one being corrected. */
export function sessionEditScope(session: Session, activeSessionId: string | undefined): ExerciseEditScope {
  if (session.id !== activeSessionId) {
    return { kind: 'pastWorkout' };
  }
  return { kind: 'workout', routineName: session.isFreeform ? undefined : session.blueprint.name };
}

export interface ExerciseEditScopeCopy {
  /** The one line at the top of the editor. */
  sentence: string;
  /** The save button, which names the scope too. */
  saveLabel: string;
}

export function exerciseEditScopeCopy(
  t: TranslateFn,
  scope: ExerciseEditScope,
  exerciseName: string,
): ExerciseEditScopeCopy {
  switch (scope.kind) {
    case 'workout':
      return {
        sentence: scope.routineName
          ? t('exercise_editor.scope.workout.body', { routine: scope.routineName })
          : t('exercise_editor.scope.workout_no_routine.body'),
        saveLabel: t('exercise_editor.save.today.button'),
      };
    case 'pastWorkout':
      return {
        sentence: t('exercise_editor.scope.past_workout.body'),
        saveLabel: t('exercise_editor.save.workout.button'),
      };
    case 'routine': {
      const routine = routineNameOf(t, scope.routineName);
      return {
        sentence: t('exercise_editor.scope.routine.body', { routine, exercise: exerciseName }),
        saveLabel: t('exercise_editor.save.routine.button', { routine }),
      };
    }
    case 'routineDraft':
      // Nothing is saved from here: the routine editor's Save does that, so the button only closes.
      return {
        sentence: t('exercise_editor.scope.routine_draft.body', {
          routine: routineNameOf(t, scope.routineName),
          exercise: exerciseName,
        }),
        saveLabel: t('exercise_editor.save.done.button'),
      };
  }
}

/** A routine not named yet is still being created in the routine editor. */
function routineNameOf(t: TranslateFn, name: string): string {
  return name.trim() || t('exercise_editor.scope.unnamed_routine.label');
}

export type TrackingType = 'weighted' | 'cardio';

export function trackingTypeOf(exercise: ExerciseBlueprint): TrackingType {
  return exercise instanceof WeightedExerciseBlueprint ? 'weighted' : 'cardio';
}

/**
 * The exercise tracked the other way, starting from that type's defaults. Only what both types share (the
 * exercise itself, notes and link) carries over.
 */
export function withTrackingType(exercise: ExerciseBlueprint, type: TrackingType): ExerciseBlueprint {
  if (trackingTypeOf(exercise) === type) {
    return exercise;
  }
  const shared = {
    name: exercise.name,
    exerciseId: exercise.isLinked ? exercise.exerciseId : undefined,
    notes: exercise.notes,
    link: exercise.link,
  };
  return type === 'weighted'
    ? WeightedExerciseBlueprint.empty().with(shared)
    : CardioExerciseBlueprint.empty().with(shared);
}

/** "Barbell · Chest, triceps, shoulders", or undefined for an exercise the catalog says nothing about. */
export function exerciseMetaOf(t: TranslateFn, descriptor: ExerciseDescriptor | undefined): string | undefined {
  if (!descriptor) {
    return undefined;
  }
  const muscles = musclesOf(descriptor)
    .map((muscle) => translateExerciseMeta(t, 'muscle', muscle))
    .join(', ');
  const parts = [
    descriptor.equipment ? exerciseMetaLabel(t, 'equipment', descriptor.equipment) : undefined,
    muscles ? muscles.charAt(0).toUpperCase() + muscles.slice(1) : undefined,
  ].filter((part) => !!part);
  return parts.length ? parts.join(' · ') : undefined;
}

/**
 * The three loads an exercise can have, each with what picking it changes, since "load" names the field
 * without saying what it does to the set counter or the stats built off it. `summary` is the Load row's
 * one line.
 */
export const LOAD_OPTIONS = [
  {
    value: 'external',
    label: 'exercise.resistance.external.label',
    body: 'exercise.resistance.external.body',
    summary: 'exercise_editor.load.external.summary',
  },
  {
    value: 'bodyweight',
    label: 'exercise.resistance.bodyweight.label',
    body: 'exercise.resistance.bodyweight.body',
    summary: 'exercise_editor.load.bodyweight.summary',
  },
  {
    value: 'none',
    label: 'exercise.resistance.none.label',
    body: 'exercise.resistance.none.body',
    summary: 'exercise_editor.load.none.summary',
  },
] as const satisfies { value: Resistance; label: TranslationKey; body: TranslationKey; summary: TranslationKey }[];

export function loadSummaryOf(t: TranslateFn, resistance: Resistance): string {
  return t(LOAD_OPTIONS.find((option) => option.value === resistance)!.summary);
}

/** The Warm-ups row's line: "2 sets · 50% × 8, 75% × 5", or that there are none. */
export function warmupsSummaryOf(t: TranslateFn, warmups: PlannedWarmupSet[]): string {
  if (!warmups.length) {
    return t('exercise_editor.warmups.none.label');
  }
  const count = t(
    warmups.length === 1 ? 'exercise_editor.warmups.count_one.label' : 'exercise_editor.warmups.count_many.label',
    { count: warmups.length },
  );
  return `${count} · ${formatPlannedWarmupSets(warmups, (percent) => `${percent}%`)}`;
}

/**
 * The Progression row's line: the choice and what it does with this exercise's numbers, such as
 * "Add weight · +2.5 kg when every set hits 12".
 */
export function progressionSummaryOf(
  t: TranslateFn,
  exercise: WeightedExerciseBlueprint,
  formatStep: (step: BigNumber) => string,
): string {
  const choice = progressionChoiceOf(exercise.progression);
  const step = () => formatStep(exercise.progression.find((rule) => rule.axis === 'load')!.step);
  const reps = sharedWorkingTopReps(exercise);
  switch (choice) {
    case 'off':
      return t('routine_editor.progression.off.label');
    case 'custom':
      return t('routine_editor.progression.custom.label');
    case 'weight':
      return reps === undefined
        ? t('exercise_editor.progression.weight.per_set_summary', { step: step() })
        : t('exercise_editor.progression.weight.summary', { step: step(), reps });
    case 'double':
      return t('exercise_editor.progression.double.summary', {
        to: ladderCeilingFor(exercise).toNumber(),
        step: step(),
      });
  }
}

/**
 * The Superset row's line, naming the exercise it pairs with. `nextName` is undefined for the last
 * exercise, which has nothing to pair with.
 */
export function supersetHintOf(t: TranslateFn, nextName: string | undefined, on: boolean): string {
  if (nextName === undefined) {
    return t('exercise_editor.superset.last.label');
  }
  return on
    ? t('exercise_editor.superset.on.label', { name: nextName })
    : t('exercise_editor.superset.off.label', { name: nextName });
}
