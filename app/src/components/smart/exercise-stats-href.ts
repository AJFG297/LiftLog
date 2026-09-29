import { ExerciseId } from '@/models/blueprint-models';
import { Href } from 'expo-router';

/** The expanded stats for one weighted exercise, by id so a rename doesn't lose it. */
export function getExerciseStatsHref(exerciseId: ExerciseId): Href {
  return `/stats/expanded-weighted-exercise?exerciseId=${encodeURIComponent(exerciseId)}` as Href;
}
