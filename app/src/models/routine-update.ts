import { DiffChange, ExerciseModification, SessionBlueprintDiff } from '@/models/blueprint-diff';
import { PlannedSet, PlannedWarmupSet, SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { setLabels } from '@/models/session-models/set-kind';
import { Duration } from '@js-joda/core';

/**
 * One row of the "Update your routine?" sheet: a structural change made during a workout that the user
 * can keep for next time. Weight and rep targets never get a row, because progression moves those.
 */
export type RoutineChange =
  | { id: string; kind: 'added'; exerciseName: string; sets: number; after: string | undefined }
  | { id: string; kind: 'removed'; exerciseName: string }
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
  for (const change of diff.addedExercises) {
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
  const addedExercises = diff.addedExercises.filter((c) => selected.has(c.id));
  const removedExercises = diff.removedExercises.filter((c) => selected.has(c.id));
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
 * above it also causes. Only a change in the order of the exercises both sessions share is a reorder.
 */
function isRealReorder(diff: SessionBlueprintDiff): boolean {
  if (diff.reorderedExercises.length === 0) {
    return false;
  }
  const shared = sharedNames(diff.originalSession, diff.newSession);
  const before = namesIn(diff.originalSession, shared);
  const after = namesIn(diff.newSession, shared);
  return before.some((name, index) => name !== after[index]);
}

/** How many times each name appears in both sessions. */
function sharedNames(a: SessionBlueprint, b: SessionBlueprint): Map<string, number> {
  const counts = (session: SessionBlueprint) => {
    const map = new Map<string, number>();
    for (const exercise of session.exercises) {
      map.set(exercise.name, (map.get(exercise.name) ?? 0) + 1);
    }
    return map;
  };
  const inA = counts(a);
  const inB = counts(b);
  return new Map(Array.from(inA, ([name, count]) => [name, Math.min(count, inB.get(name) ?? 0)]));
}

function namesIn(session: SessionBlueprint, shared: Map<string, number>): string[] {
  const remaining = new Map(shared);
  const names: string[] = [];
  for (const exercise of session.exercises) {
    const left = remaining.get(exercise.name) ?? 0;
    if (left > 0) {
      names.push(exercise.name);
      remaining.set(exercise.name, left - 1);
    }
  }
  return names;
}
