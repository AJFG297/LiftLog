import {
  ExerciseGroup,
  isGroupComplete,
  nextExerciseInGroup,
  upNextGroupIndexOf,
} from '@/models/session-models/exercise-groups';
import { RecordedCardioExercise } from '@/models/session-models/recorded-cardio-exercise';
import type { RecordedExercise } from '@/models/session-models/recorded-exercise';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import type { Session } from '@/models/session-models/session';
import { LetteredSetKind, setLabels } from '@/models/session-models/set-kind';

/** The set a rest leads to: a working set by its number, anything else by its kind. */
export type NextSetLabel = { kind: 'working'; number: number } | { kind: LetteredSetKind };

/** What the rest is for, as the pill ("Go · Set 3") and the sheet ("Up next: Bench Press, set 3") say it. */
export type RestUpNext =
  | { kind: 'set'; exerciseName: string; set: NextSetLabel }
  /** The page on screen is done: the rest leads to the next page, as the Up next bar does. */
  | { kind: 'page'; exerciseNames: string[] }
  | { kind: 'finish' };

export function restUpNextOf(
  session: Session,
  groups: readonly ExerciseGroup[],
  focusedGroupIndex: number | undefined,
): RestUpNext {
  const focused = focusedGroupIndex === undefined ? undefined : groups[focusedGroupIndex];
  if (!focused || focusedGroupIndex === undefined) {
    return { kind: 'finish' };
  }
  if (!isGroupComplete(session, focused)) {
    const index = nextExerciseInGroup(session, focused);
    const exercise = index === undefined ? undefined : session.recordedExercises[index];
    const set = exercise && nextSetLabelOf(exercise);
    if (exercise && set) {
      return { kind: 'set', exerciseName: exercise.blueprint.name, set };
    }
  }
  const upNext = upNextGroupIndexOf(session, groups, focusedGroupIndex);
  return upNext === undefined
    ? { kind: 'finish' }
    : {
        kind: 'page',
        exerciseNames: groups[upNext]!.indices.map((index) => session.recordedExercises[index]!.blueprint.name),
      };
}

export function nextSetLabelOf(exercise: RecordedExercise): NextSetLabel | undefined {
  if (exercise instanceof RecordedCardioExercise) {
    const index = exercise.currentSetIndex;
    return index < 0 ? undefined : { kind: 'working', number: index + 1 };
  }
  if (!(exercise instanceof RecordedWeightedExercise)) {
    return undefined;
  }
  const current = exercise.currentSet;
  if (!current) {
    return undefined;
  }
  if (current.list === 'warmup') {
    return { kind: 'warmup' };
  }
  const kind = exercise.potentialSets[current.index]?.kind ?? 'working';
  if (kind !== 'working') {
    return { kind };
  }
  const label = setLabels(exercise.potentialSets.map((slot) => slot.kind))[current.index];
  return { kind: 'working', number: Number(label) };
}
