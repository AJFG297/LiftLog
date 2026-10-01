import { DiffChange, ExerciseModification, SessionBlueprintDiff } from '@/models/blueprint-diff';
import { PlannedSet, PlannedWarmupSet, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { setLabels } from '@/models/session-models/set-kind';
import { Duration } from '@js-joda/core';

/**
 * One row of the "Update your routine?" sheet: a structural change made during a workout that the user
 * can keep for next time. Weight and rep targets never get a row, because progression moves those.
 */
export type RoutineChange =
  | { id: string; kind: 'added'; exerciseName: string; sets: number; after: string | undefined }
  | { id: string; kind: 'removed'; exerciseName: string }
  | { id: string; kind: 'swapped'; from: string; to: string }
  | { id: string; kind: 'order'; order: string[] }
  | { id: string; kind: 'setCount'; exerciseName: string; from: number; to: number }
  | { id: string; kind: 'setTypes'; exerciseName: string; from: string[]; to: string[] }
  | { id: string; kind: 'warmups'; exerciseName: string; from: number; to: number }
  | { id: string; kind: 'rest'; exerciseName: string; from: Duration; to: Duration }
  | { id: string; kind: 'superset'; exerciseName: string; grouped: boolean; with: string | undefined }
  | { id: string; kind: 'other'; change: DiffChange };

export type RoutineChangeKind = RoutineChange['kind'];

const ORDER_ID = 'order';
const countId = (changeId: string) => `${changeId}:count`;
const kindsId = (changeId: string) => `${changeId}:kinds`;
const swapId = (removed: RemovedChange) => `${removed.id}:swap`;

type AddedChange = SessionBlueprintDiff['addedExercises'][number];
type RemovedChange = SessionBlueprintDiff['removedExercises'][number];
interface SwapPair {
  removed: RemovedChange;
  added: AddedChange;
}

/** The rows the sheet lists for `diff`, in the order the diff found them. */
export function routineChanges(diff: SessionBlueprintDiff): RoutineChange[] {
  const rows: RoutineChange[] = [];
  const { newSession } = diff;

  // A renamed session never matches its routine, so a name change only comes with a new routine, and
  // that routine takes the workout's name without asking.
  for (const change of diff.sessionChanges) {
    if (change.kind !== 'sessionName') {
      rows.push({ id: change.id, kind: 'other', change });
    }
  }
  const pairs = swapPairs(diff);
  const paired = new Set<DiffChange>(pairs.flatMap((pair) => [pair.removed, pair.added]));
  for (const { removed, added } of pairs) {
    rows.push({ id: swapId(removed), kind: 'swapped', from: removed.exercise.name, to: added.exercise.name });
  }
  for (const change of diff.addedExercises) {
    if (paired.has(change)) {
      continue;
    }
    const exercise = change.exercise;
    rows.push({
      id: change.id,
      kind: 'added',
      exerciseName: exercise.name,
      sets: exercise instanceof WeightedExerciseBlueprint ? exercise.plannedSets.length : exercise.sets.length,
      after: newSession.exercises[change.newIndex - 1]?.name,
    });
  }
  for (const change of diff.removedExercises) {
    if (paired.has(change)) {
      continue;
    }
    rows.push({ id: change.id, kind: 'removed', exerciseName: change.exercise.name });
  }
  if (isRealReorder(diff)) {
    rows.push({ id: ORDER_ID, kind: 'order', order: newSession.exercises.map((x) => x.name) });
  }

  for (const modification of diff.modifiedExercises) {
    for (const change of modification.changes) {
      switch (change.kind) {
        case 'exercisePlannedSets': {
          const { oldValue, newValue } = change;
          if (oldValue.length !== newValue.length) {
            rows.push({
              id: countId(change.id),
              kind: 'setCount',
              exerciseName: change.exerciseName,
              from: oldValue.length,
              to: newValue.length,
            });
          }
          if (kindsDiffer(oldValue, newValue)) {
            const shared = Math.min(oldValue.length, newValue.length);
            rows.push({
              id: kindsId(change.id),
              kind: 'setTypes',
              exerciseName: change.exerciseName,
              from: setLabels(oldValue.slice(0, shared).map((s) => s.kind)),
              to: setLabels(newValue.slice(0, shared).map((s) => s.kind)),
            });
          }
          break;
        }
        case 'exerciseWarmupSets':
          if (change.oldValue.length !== change.newValue.length) {
            rows.push({
              id: change.id,
              kind: 'warmups',
              exerciseName: change.exerciseName,
              from: change.oldValue.length,
              to: change.newValue.length,
            });
          }
          break;
        case 'exerciseRest':
          rows.push({
            id: change.id,
            kind: 'rest',
            exerciseName: change.exerciseName,
            from: change.oldValue.minRest,
            to: change.newValue.minRest,
          });
          break;
        case 'exerciseSuperset':
          rows.push({
            id: change.id,
            kind: 'superset',
            exerciseName: change.exerciseName,
            grouped: change.newValue,
            with: newSession.exercises[change.exerciseIndex + 1]?.name,
          });
          break;
        default:
          rows.push({ id: change.id, kind: 'other', change });
      }
    }
  }

  return rows;
}

/**
 * The diff to apply when the rows in `selected` are kept. A kept set count or set type change applies
 * only that part of the planned sets: the sets the routine already had keep their rep targets, and a set
 * added today comes in with today's target.
 */
export function routineUpdateDiff(diff: SessionBlueprintDiff, selected: ReadonlySet<string>): SessionBlueprintDiff {
  const keepOrder = selected.has(ORDER_ID) && isRealReorder(diff);

  const sessionChanges = diff.sessionChanges.filter((c) => c.kind === 'sessionName' || selected.has(c.id));
  const keptSwaps = swapPairs(diff).filter((pair) => selected.has(swapId(pair.removed)));
  const addedExercises = diff.addedExercises.filter(
    (c) => selected.has(c.id) || keptSwaps.some((pair) => pair.added === c),
  );
  const removedExercises = diff.removedExercises.filter(
    (c) => selected.has(c.id) || keptSwaps.some((pair) => pair.removed === c),
  );
  const reorderedExercises = keepOrder ? diff.reorderedExercises : [];
  const modifiedExercises = diff.modifiedExercises
    .map((modification) => ({
      ...modification,
      changes: modification.changes.flatMap((change): ExerciseModification['changes'] => {
        switch (change.kind) {
          case 'exercisePlannedSets': {
            const plannedSets = keptPlannedSets(
              change.oldValue,
              change.newValue,
              selected.has(countId(change.id)),
              selected.has(kindsId(change.id)),
            );
            return plannedSets ? [{ ...change, newValue: plannedSets }] : [];
          }
          case 'exerciseWarmupSets': {
            if (!selected.has(change.id)) {
              return [];
            }
            return [{ ...change, newValue: resized(change.oldValue, change.newValue) }];
          }
          default:
            return selected.has(change.id) ? [change] : [];
        }
      }),
    }))
    .filter((modification) => modification.changes.length > 0);

  const allChanges: DiffChange[] = [
    ...sessionChanges,
    ...addedExercises,
    ...removedExercises,
    ...reorderedExercises,
    ...modifiedExercises.flatMap((m) => m.changes),
  ];

  return {
    hasChanges: allChanges.length > 0,
    sessionChanges,
    addedExercises,
    removedExercises,
    reorderedExercises,
    modifiedExercises,
    allChanges,
    originalSession: diff.originalSession,
    newSession: diff.newSession,
  };
}

/**
 * An exercise swapped during a workout shows up as a removal plus an addition. They are paired when they
 * sit in the same gap between the exercises both sessions share and are the same kind, so the swap is one
 * row: keeping only half of it would leave the routine with both exercises or neither. A kept swap brings
 * in today's exercise whole, as a kept addition does.
 */
function swapPairs(diff: SessionBlueprintDiff): SwapPair[] {
  const removedAt = diff.removedExercises.map((c) => c.oldIndex);
  const addedAt = diff.addedExercises.map((c) => c.newIndex);
  // The number of shared exercises above an index: the index less the unshared ones above it.
  const gap = (index: number, unshared: number[]) => index - unshared.filter((i) => i < index).length;
  const pairs: SwapPair[] = [];
  for (const removed of diff.removedExercises) {
    const added = diff.addedExercises.find(
      (candidate) =>
        !pairs.some((pair) => pair.added === candidate) &&
        gap(candidate.newIndex, addedAt) === gap(removed.oldIndex, removedAt) &&
        candidate.exercise instanceof WeightedExerciseBlueprint ===
          removed.exercise instanceof WeightedExerciseBlueprint,
    );
    if (added) {
      pairs.push({ removed, added });
    }
  }
  return pairs;
}

function keptPlannedSets(
  oldValue: PlannedSet[],
  newValue: PlannedSet[],
  keepCount: boolean,
  keepKinds: boolean,
): PlannedSet[] | undefined {
  const count = keepCount ? newValue.length : oldValue.length;
  const kept = Array.from({ length: count }, (_, index): PlannedSet => {
    const old = oldValue[index];
    if (!old) {
      return newValue[index]!;
    }
    const today = newValue[index];
    return { reps: old.reps, kind: keepKinds && today ? today.kind : old.kind };
  });
  const unchanged = kept.length === oldValue.length && kept.every((s, i) => s.kind === oldValue[i]!.kind);
  return unchanged ? undefined : kept;
}

/** `oldValue` at the length of `newValue`, taking the warm-ups added today from `newValue`. */
function resized(oldValue: PlannedWarmupSet[], newValue: PlannedWarmupSet[]): PlannedWarmupSet[] {
  return newValue.map((today, index) => oldValue[index] ?? today);
}

function kindsDiffer(a: PlannedSet[], b: PlannedSet[]): boolean {
  const shared = Math.min(a.length, b.length);
  return a.slice(0, shared).some((s, i) => s.kind !== b[i]!.kind);
}

/**
 * The diff calls an exercise reordered whenever its index moves, which an exercise added or removed
 * above it also causes. Only a change in the order of the exercises both sessions share is a reorder:
 * taken in the routine's order, their positions in the workout must climb.
 */
function isRealReorder(diff: SessionBlueprintDiff): boolean {
  const removed = new Set(diff.removedExercises.map((c) => c.oldIndex));
  const movedTo = new Map(diff.reorderedExercises.map((c) => [c.oldIndex, c.newIndex]));
  const positions = diff.originalSession.exercises.flatMap((_, index) =>
    removed.has(index) ? [] : [movedTo.get(index) ?? index],
  );
  return positions.some((position, i) => i > 0 && position < positions[i - 1]!);
}
