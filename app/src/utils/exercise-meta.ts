import type { TranslateFn } from '@/i18n/translate-fn';
import type { TranslationKey } from '@tolgee/web';
import type { MuscleGroup } from '@/models/muscle-groups';

export type ExerciseMetaKind = 'muscle' | 'category' | 'equipment' | 'force' | 'level' | 'mechanic';

function toKeySegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Localizes a built-in exercise's fixed-vocabulary metadata (muscles, category, etc.) via Tolgee keys.
 * Values outside the known vocabulary (e.g. a user-typed muscle) fall back to the raw string.
 */
export function translateExerciseMeta(t: TranslateFn, kind: ExerciseMetaKind, value: string): string {
  if (!value) {
    return value;
  }
  const key = `exercise.${kind}.${toKeySegment(value)}` as TranslationKey;
  return t(key, value);
}

/**
 * `translateExerciseMeta`, capitalised for a chip or the start of a line. The picker's equipment chips and its
 * rows' meta both use it, so a chip and the rows it filters read the same word.
 */
export function exerciseMetaLabel(t: TranslateFn, kind: ExerciseMetaKind, value: string): string {
  const text = translateExerciseMeta(t, kind, value);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A muscle chip's label: the picker's and All exercises' chips read alike. */
export function muscleGroupLabel(t: TranslateFn, group: MuscleGroup): string {
  switch (group) {
    case 'chest':
      return t('exercise_picker.muscle.chest');
    case 'back':
      return t('exercise_picker.muscle.back');
    case 'shoulders':
      return t('exercise_picker.muscle.shoulders');
    case 'arms':
      return t('exercise_picker.muscle.arms');
    case 'legs':
      return t('exercise_picker.muscle.legs');
    case 'core':
      return t('exercise_picker.muscle.core');
  }
}
