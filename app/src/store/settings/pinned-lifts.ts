import type { ExerciseId } from '@/models/blueprint-models';

/** The `pinnedLifts` preference with `id` pinned at the end, or unpinned when it already was. */
export function togglePinned(pinned: readonly ExerciseId[], id: ExerciseId): ExerciseId[] {
  return pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id];
}
