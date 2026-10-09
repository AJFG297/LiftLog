import { ExerciseId } from '@/models/blueprint-models';
import { Href } from 'expo-router';

/**
 * A weighted exercise's progress page, by id so a rename doesn't lose it. The page is on the root stack, over
 * the tabs, so it opens from any tab and Back returns to wherever it was opened.
 */
export function exerciseProgressHref(exerciseId: ExerciseId): Href {
  return `/exercise-progress?exerciseId=${encodeURIComponent(exerciseId)}` as Href;
}
