import { RecordedExercise } from '@/models/session-models/recorded-exercise';
import { RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { Session } from '@/models/session-models/session';

/**
 * One page of the live workout: a lone exercise, or a superset chain whose members are done in
 * alternating rounds.
 */
export interface ExerciseGroup {
  /** Indexes into the session's exercises, in workout order. Never empty. */
  indices: number[];
  /** A, B, C… in workout order for a superset; undefined for a lone exercise. */
  supersetLetter: string | undefined;
}

export type ExerciseStatus = 'done' | 'inProgress' | 'notStarted';

/**
 * The same chain rule as {@link Session.nextExercise}: a weighted exercise with `supersetWithNext`
 * joins the one after it, and the flag on the last exercise of the workout joins nothing.
 */
function joinsNext(exercises: readonly RecordedExercise[], index: number): boolean {
  const exercise = exercises[index];
  return (
    index < exercises.length - 1 && exercise instanceof RecordedWeightedExercise && exercise.blueprint.supersetWithNext
  );
}

export function exerciseGroupsOf(exercises: readonly RecordedExercise[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  let supersets = 0;
  let current: number[] = [];
  for (let index = 0; index < exercises.length; index++) {
    current.push(index);
    if (!joinsNext(exercises, index)) {
      groups.push({
        indices: current,
        supersetLetter: current.length > 1 ? supersetLetter(supersets++) : undefined,
      });
      current = [];
    }
  }
  return groups;
}

function supersetLetter(ordinal: number): string {
  return String.fromCharCode(65 + (ordinal % 26)).repeat(Math.floor(ordinal / 26) + 1);
}

export function groupIndexOf(groups: readonly ExerciseGroup[], exerciseIndex: number): number {
  return groups.findIndex((group) => group.indices.includes(exerciseIndex));
}

/** "3" for the third exercise of the workout, or "A2" for the second member of superset A. */
export function exerciseLabelOf(groups: readonly ExerciseGroup[], exerciseIndex: number): string {
  const group = groups[groupIndexOf(groups, exerciseIndex)];
  if (!group?.supersetLetter) {
    return String(exerciseIndex + 1);
  }
  return `${group.supersetLetter}${group.indices.indexOf(exerciseIndex) + 1}`;
}

/**
 * Sets logged out of sets planned. Only a weighted exercise's working list counts, as it does for
 * {@link RecordedWeightedExercise.isComplete}, so a skipped warm-up never leaves a tile short of full.
 */
export function setProgressOf(exercise: RecordedExercise): { done: number; total: number } {
  if (exercise instanceof RecordedWeightedExercise) {
    return {
      done: exercise.potentialSets.filter((slot) => slot.set).length,
      total: exercise.potentialSets.length,
    };
  }
  return { done: exercise.sets.filter((set) => set.isCompletelyFilled).length, total: exercise.sets.length };
}

export function exerciseStatusOf(exercise: RecordedExercise): ExerciseStatus {
  if (exercise.isComplete) {
    return 'done';
  }
  return exercise.hasLoggedAnySet ? 'inProgress' : 'notStarted';
}

export function isGroupComplete(session: Session, group: ExerciseGroup): boolean {
  return group.indices.every((index) => session.recordedExercises[index]?.isComplete);
}

/**
 * The member whose set comes next. {@link Session.nextExercise} already alternates a superset's rounds,
 * and it is what the notification shows, so it wins whenever it points into this group. Otherwise (the
 * user jumped here) the member that is furthest behind goes next, the earlier one on a tie.
 */
export function nextExerciseInGroup(session: Session, group: ExerciseGroup): number | undefined {
  const next = session.nextExercise;
  const nextIndex = next ? session.recordedExercises.indexOf(next) : -1;
  if (group.indices.includes(nextIndex)) {
    return nextIndex;
  }
  let behind: number | undefined;
  for (const index of group.indices) {
    const exercise = session.recordedExercises[index]!;
    if (exercise.isComplete) {
      continue;
    }
    if (behind === undefined || setProgressOf(exercise).done < setProgressOf(session.recordedExercises[behind]!).done) {
      behind = index;
    }
  }
  return behind;
}

/**
 * The page to show: the exercise the user last focused, if it still exists, otherwise the one whose set
 * comes next, otherwise the first. Undefined only for a workout with no exercises.
 */
export function focusedGroupIndexOf(
  session: Session,
  groups: readonly ExerciseGroup[],
  focusedExerciseIndex: number | undefined,
): number | undefined {
  if (!groups.length) {
    return undefined;
  }
  if (focusedExerciseIndex !== undefined) {
    const focused = groupIndexOf(groups, focusedExerciseIndex);
    if (focused >= 0) {
      return focused;
    }
  }
  const next = session.nextExercise;
  const fromNext = next ? groupIndexOf(groups, session.recordedExercises.indexOf(next)) : -1;
  return fromNext >= 0 ? fromNext : 0;
}

/**
 * The page the "Up next" bar leads to: the first unfinished one after `current`. Undefined when nothing
 * after it is left, which turns the bar into Finish.
 */
export function upNextGroupIndexOf(
  session: Session,
  groups: readonly ExerciseGroup[],
  current: number,
): number | undefined {
  for (let index = current + 1; index < groups.length; index++) {
    if (!isGroupComplete(session, groups[index]!)) {
      return index;
    }
  }
  return undefined;
}

/**
 * The session's exercise indexes in their order after moving group `from` to position `to`: entry `i`
 * is the old index of the exercise that ends up at `i`.
 */
export function groupMoveOrder(groups: readonly ExerciseGroup[], from: number, to: number): number[] {
  const reordered = [...groups];
  const [moved] = reordered.splice(from, 1);
  if (moved) {
    reordered.splice(Math.max(0, Math.min(to, reordered.length)), 0, moved);
  }
  return reordered.flatMap((group) => group.indices);
}

/**
 * Moves a whole group, so a superset travels as one unit and its chain stays intact. The one flag that
 * could change meaning is a `supersetWithNext` left on the workout's last exercise, which joins nothing
 * there: once something follows it, it would, so it is cleared.
 */
export function withGroupMoved(session: Session, from: number, to: number): Session {
  const exercises = session.recordedExercises;
  const order = groupMoveOrder(exerciseGroupsOf(exercises), from, to);
  const lastIndex = exercises.length - 1;
  const recordedExercises = order.map((oldIndex, newIndex) => {
    const exercise = exercises[oldIndex]!;
    const strandedFlag =
      oldIndex === lastIndex &&
      newIndex !== lastIndex &&
      exercise instanceof RecordedWeightedExercise &&
      exercise.blueprint.supersetWithNext;
    return strandedFlag ? exercise.with({ blueprint: exercise.blueprint.with({ supersetWithNext: false }) }) : exercise;
  });
  return session.with({
    recordedExercises,
    blueprint: session.blueprint.with({ exercises: recordedExercises.map((exercise) => exercise.blueprint) }),
  });
}
