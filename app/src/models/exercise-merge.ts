import { ExerciseId, normalizeExerciseName, stubExerciseId } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import type { BuiltInExerciseNames } from '@/models/exercise-resolver';
import { legacyNormalizeExerciseName, legacyStubExerciseId } from '@/models/legacy-exercise-name';

/** How much an exercise has been used: the workouts that log it, and when the first of them was. */
export interface ExerciseUsage {
  workouts: number;
  firstReferenceTimeMs: number;
}

export type MergeSurvivorKind = 'builtin' | 'user' | 'stub';

/**
 * One exercise that several of the user's exercises become, or one stub moving to the id its name now
 * derives. Every reference to `mergedIds` is repointed to `survivor.id`, then their descriptors are deleted.
 */
export interface ExerciseMerge {
  normalizedName: string;
  survivor: { id: ExerciseId; kind: MergeSurvivorKind };
  /** Never includes `survivor.id`. */
  mergedIds: ExerciseId[];
  /** What to store at `survivor.id`, or undefined to leave it as it is (a built-in nothing was added to). */
  survivorDescriptor: ExerciseDescriptor | undefined;
}

export interface ExerciseMergeInput {
  /** The exercise table: user exercises, stubs, and copy-on-write edits of built-ins (keyed by the built-in's id). */
  savedExercises: Record<ExerciseId, ExerciseDescriptor>;
  builtInNames: BuiltInExerciseNames;
  /** The catalog's own descriptors, for a built-in the user never edited. */
  builtInExercises: Record<ExerciseId, ExerciseDescriptor>;
  /** Built-ins the user deleted. Merging into one would hide the exercises merged. */
  hiddenBuiltInIds: readonly ExerciseId[];
  /** Per exercise id; an id no workout logs is missing. */
  usage: Record<ExerciseId, ExerciseUsage>;
}

interface Member {
  id: ExerciseId;
  descriptor: ExerciseDescriptor;
  kind: 'user' | 'stub';
  usage: ExerciseUsage | undefined;
}

/**
 * The merges that make the user's exercises one per normalised name (see `normalizeExerciseName`), and
 * put every stub at the id its name derives. A pure plan: applying it and planning again gives nothing.
 *
 * The user's exercises and stubs are grouped by normalised name. The survivor of a group is:
 *   1. the built-in with that name, as the resolver would link it, unless the user deleted it or every
 *      member already matched it under the old fold (an exercise the user made beside it on purpose);
 *   2. otherwise the user exercise logged in the most workouts, then the one first logged earliest (moving
 *      workouts to it only makes it more so, so a re-run after a crash picks it again);
 *   3. otherwise the stub, at the id its name now derives: the one already there, else the one logged most.
 * It keeps its own fields and fills empty equipment, muscles and instructions from the others.
 *
 * A stub alone in its group still moves when its stored id came from the old fold, so a blueprint that
 * derives its id at runtime (a friend's feed item, a placeholder) keeps finding it.
 */
export function planExerciseMerges({
  savedExercises,
  builtInNames,
  builtInExercises,
  hiddenBuiltInIds,
  usage,
}: ExerciseMergeInput): ExerciseMerge[] {
  const hidden = new Set(hiddenBuiltInIds);
  const builtIns = builtInIndex(savedExercises, builtInNames, hidden);

  const groups = new Map<string, Member[]>();
  for (const [id, descriptor] of Object.entries(savedExercises)) {
    const key = normalizeExerciseName(descriptor.name);
    if (id in builtInNames || !key) {
      continue;
    }
    const kind =
      id === legacyStubExerciseId(descriptor.name) || id === stubExerciseId(descriptor.name) ? 'stub' : 'user';
    groups.set(key, [...(groups.get(key) ?? []), { id, descriptor, kind, usage: usage[id] }]);
  }

  const merges: ExerciseMerge[] = [];
  for (const [key, members] of groups) {
    const ordered = [...members].sort(bySurvivorRule);
    const builtIn = builtIns.byKey.get(key);
    if (builtIn && members.some((member) => !builtIns.legacyKeys.get(builtIn)!.has(legacy(member)))) {
      const current = savedExercises[builtIn] ?? builtInExercises[builtIn]!;
      const filled = fill(current, ordered);
      merges.push({
        normalizedName: key,
        survivor: { id: builtIn, kind: 'builtin' },
        mergedIds: members.map((x) => x.id).sort(),
        survivorDescriptor: sameDescriptor(filled, current) ? undefined : filled,
      });
      continue;
    }
    // A stub already at the derived id survives as it is, so a re-run after a crash, which finds the
    // survivor written there and some workouts moved to it, picks the same one.
    const survivor =
      ordered.find((x) => x.kind === 'user') ??
      ordered.find((x) => x.id === stubExerciseId(x.descriptor.name)) ??
      ordered[0]!;
    const survivorId = survivor.kind === 'user' ? survivor.id : stubExerciseId(survivor.descriptor.name);
    const mergedIds = members
      .map((x) => x.id)
      .filter((id) => id !== survivorId)
      .sort();
    if (!mergedIds.length) {
      continue;
    }
    merges.push({
      normalizedName: key,
      survivor: { id: survivorId, kind: survivor.kind },
      mergedIds,
      survivorDescriptor: fill(survivor.descriptor, ordered),
    });
  }
  return merges.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
}

/**
 * Each normalised name's built-in, the first in the resolver's order (catalog names, then names the user
 * gave built-ins by editing them), and every old-fold key a built-in answered to.
 */
function builtInIndex(
  savedExercises: Record<ExerciseId, ExerciseDescriptor>,
  builtInNames: BuiltInExerciseNames,
  hidden: ReadonlySet<ExerciseId>,
) {
  const byKey = new Map<string, ExerciseId>();
  const legacyKeys = new Map<ExerciseId, Set<string>>();
  const add = (id: ExerciseId, name: string) => {
    if (hidden.has(id) || !name.trim()) {
      return;
    }
    const key = normalizeExerciseName(name);
    if (!byKey.has(key)) {
      byKey.set(key, id);
    }
    legacyKeys.set(id, (legacyKeys.get(id) ?? new Set()).add(legacyNormalizeExerciseName(name)));
  };
  for (const [id, names] of Object.entries(builtInNames)) {
    names.forEach((name) => add(id, name));
  }
  for (const [id, descriptor] of Object.entries(savedExercises)) {
    if (id in builtInNames) {
      add(id, descriptor.name);
    }
  }
  return { byKey, legacyKeys };
}

function legacy(member: Member): string {
  return legacyNormalizeExerciseName(member.descriptor.name);
}

/** Most workouts first, then the first logged earliest; never-logged last. Ids break what's left. */
function bySurvivorRule(a: Member, b: Member): number {
  return (
    (b.usage?.workouts ?? 0) - (a.usage?.workouts ?? 0) ||
    (a.usage?.firstReferenceTimeMs ?? Infinity) - (b.usage?.firstReferenceTimeMs ?? Infinity) ||
    a.id.localeCompare(b.id)
  );
}

function fill(survivor: ExerciseDescriptor, others: readonly Member[]): ExerciseDescriptor {
  const donors = others.map((x) => x.descriptor);
  const withMuscles = donors.find((x) => x.primaryMuscles.length || x.secondaryMuscles.length);
  const hasMuscles = survivor.primaryMuscles.length || survivor.secondaryMuscles.length;
  return {
    ...survivor,
    equipment: survivor.equipment ?? donors.find((x) => x.equipment)?.equipment ?? null,
    primaryMuscles: hasMuscles ? survivor.primaryMuscles : (withMuscles?.primaryMuscles ?? []),
    secondaryMuscles: hasMuscles ? survivor.secondaryMuscles : (withMuscles?.secondaryMuscles ?? []),
    instructions: survivor.instructions || (donors.find((x) => x.instructions)?.instructions ?? ''),
  };
}

function sameDescriptor(a: ExerciseDescriptor, b: ExerciseDescriptor): boolean {
  return (
    a.equipment === b.equipment &&
    a.instructions === b.instructions &&
    a.primaryMuscles.join() === b.primaryMuscles.join() &&
    a.secondaryMuscles.join() === b.secondaryMuscles.join()
  );
}
