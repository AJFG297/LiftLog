import {
  ExerciseBlueprint,
  ExerciseId,
  normalizeExerciseName,
  ProgramBlueprint,
  SessionBlueprint,
  stubExerciseId,
} from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { RecordedExercise, RecordedWeightedExercise, Session } from '@/models/session-models';

/** Every name a built-in goes by, keyed by its id: the English name, then each locale's. */
export type BuiltInExerciseNames = Record<ExerciseId, readonly string[]>;

export interface ExerciseResolverInit {
  /** User exercises and copy-on-write overrides of built-ins, keyed by id. */
  savedExercises: Record<ExerciseId, ExerciseDescriptor>;
  builtInNames: BuiltInExerciseNames;
  /** Linked ids in an own-device backup remain valid even if their descriptors were deleted. */
  preserveLinkedIds?: boolean;
  /** Told about a name more than one exercise answers to, and which one won. Dev logging only. */
  onAmbiguous?: (name: string, candidates: ExerciseId[], chosen: ExerciseId) => void;
}

/** Two levels of match inside a tier: the same name ignoring case, then the same normalised name. */
interface NameIndex {
  exact: Map<string, ExerciseId[]>;
  normalized: Map<string, ExerciseId[]>;
}

/**
 * Turns exercise names into exercise ids, so that anything arriving by name - a plan file, the AI
 * planner, a CSV, a friend's share, a workout stored before ids - lands on the exercise the user
 * already has instead of starting a new history. See `ExerciseId` in `blueprint-models`.
 *
 * A name resolves, in order, to:
 *   1. one of the user's own exercises with that name
 *   2. a built-in, by its English name, any locale's name, or the name the user gave it by editing it
 *   3. a new stub exercise, with the id {@link stubExerciseId} gives the name
 *
 * Within each tier the same name ignoring case beats the same normalised name, so `Dips` finds `Dips`
 * before `Dip`. Stubs are kept in {@link stubs} for the caller to save, and count as user exercises for
 * every name resolved after them, so one batch never makes the same exercise twice.
 *
 * Kind isn't part of resolving: a weighted and a cardio exercise of the same name share an id and are
 * kept apart by their keys, which carry the kind (see `MovementKey`).
 */
export class ExerciseResolver {
  /** New exercises this resolver made up, keyed by id, for the caller to save. */
  readonly stubs: Record<ExerciseId, ExerciseDescriptor> = {};

  private readonly known: Set<ExerciseId>;
  private readonly user: NameIndex = emptyIndex();
  private readonly builtIn: NameIndex = emptyIndex();
  private readonly resolved = new Map<string, ExerciseId>();
  private readonly onAmbiguous: ExerciseResolverInit['onAmbiguous'];
  private readonly preserveLinkedIds: boolean;

  constructor({ savedExercises, builtInNames, preserveLinkedIds = false, onAmbiguous }: ExerciseResolverInit) {
    this.onAmbiguous = onAmbiguous;
    this.preserveLinkedIds = preserveLinkedIds;
    this.known = new Set([...Object.keys(builtInNames), ...Object.keys(savedExercises)]);
    for (const [id, names] of Object.entries(builtInNames)) {
      names.forEach((name) => addToIndex(this.builtIn, name, id));
    }
    for (const [id, descriptor] of Object.entries(savedExercises)) {
      // An edited built-in is still the built-in: its new name is one more name the built-in goes by.
      addToIndex(id in builtInNames ? this.builtIn : this.user, descriptor.name, id);
    }
  }

  /** The id for an exercise called `name`, making a stub when nothing has that name. */
  resolve(name: string): ExerciseId {
    const key = name.trim().toLowerCase();
    const cached = this.resolved.get(key);
    if (cached) {
      return cached;
    }
    const id = this.match(name) ?? this.stub(name);
    this.resolved.set(key, id);
    return id;
  }

  /**
   * The blueprint pointing at a local exercise. One already linked to an exercise this device knows
   * keeps its id; anything else - never linked, or carrying an id from someone else's device - is
   * resolved by its name. Own-device backups also keep linked ids whose descriptors were deleted.
   */
  link<T extends ExerciseBlueprint>(blueprint: T): T {
    if (blueprint.isLinked && (this.preserveLinkedIds || this.known.has(blueprint.exerciseId))) {
      return blueprint;
    }
    return blueprint.with({ exerciseId: this.resolve(blueprint.name) }) as T;
  }

  linkSessionBlueprint(session: SessionBlueprint): SessionBlueprint {
    return session.with({ exercises: session.exercises.map((x) => this.link(x)) });
  }

  linkProgram(program: ProgramBlueprint): ProgramBlueprint {
    return program.with({ sessions: program.sessions.map((x) => this.linkSessionBlueprint(x)) });
  }

  linkSession(session: Session): Session {
    return session.with({
      blueprint: this.linkSessionBlueprint(session.blueprint),
      recordedExercises: session.recordedExercises.map((x) => this.linkRecorded(x)),
    });
  }

  private linkRecorded(exercise: RecordedExercise): RecordedExercise {
    return exercise instanceof RecordedWeightedExercise
      ? exercise.with({ blueprint: this.link(exercise.blueprint) })
      : exercise.with({ blueprint: this.link(exercise.blueprint) });
  }

  private match(name: string): ExerciseId | undefined {
    for (const index of [this.user, this.builtIn]) {
      for (const [map, key] of [
        [index.exact, name.trim().toLowerCase()],
        [index.normalized, normalizeExerciseName(name)],
      ] as const) {
        const candidates = map.get(key);
        if (candidates?.length) {
          const chosen = candidates[0]!;
          if (candidates.length > 1) {
            this.onAmbiguous?.(name, candidates, chosen);
          }
          return chosen;
        }
      }
    }
    return undefined;
  }

  private stub(name: string): ExerciseId {
    const id = stubExerciseId(name);
    // A blank name is a placeholder still waiting for its exercise, not one worth listing.
    if (name.trim()) {
      if (!this.known.has(id)) {
        this.stubs[id] = stubDescriptor(name);
      }
      this.known.add(id);
      addToIndex(this.user, name, id);
    }
    return id;
  }
}

/** A new exercise knowing only its name, the same shape the exercise search makes one in. */
export function stubDescriptor(name: string): ExerciseDescriptor {
  return {
    name: name.trim(),
    force: null,
    level: '',
    mechanic: null,
    equipment: null,
    muscles: [],
    instructions: '',
    category: '',
  };
}

/** Reports ambiguous matches in development builds only; release builds resolve silently. */
export function logAmbiguousInDev(logger: { warn: (message: string, options: unknown) => void }) {
  return __DEV__
    ? (name: string, candidates: ExerciseId[], chosen: ExerciseId) =>
        logger.warn(`Exercise name "${name}" matches ${candidates.length} exercises; linked to ${chosen}`, {
          candidates,
        })
    : undefined;
}

function emptyIndex(): NameIndex {
  return { exact: new Map(), normalized: new Map() };
}

function addToIndex(index: NameIndex, name: string, id: ExerciseId) {
  if (!name.trim()) {
    return;
  }
  addUnique(index.exact, name.trim().toLowerCase(), id);
  addUnique(index.normalized, normalizeExerciseName(name), id);
}

function addUnique(map: Map<string, ExerciseId[]>, key: string, id: ExerciseId) {
  const ids = map.get(key);
  if (!ids) {
    map.set(key, [id]);
  } else if (!ids.includes(id)) {
    ids.push(id);
  }
}

/**
 * Stub exercises `blueprints` point at that aren't in the exercise list yet - a placeholder the user
 * logged under, or an exercise from a friend's workout - so they can be listed and renamed like any
 * other. Only ids a name would stub to count: an id the user deleted stays deleted.
 */
export function missingStubs(
  blueprints: readonly ExerciseBlueprint[],
  isKnown: (id: ExerciseId) => boolean,
): Record<ExerciseId, ExerciseDescriptor> {
  const result: Record<ExerciseId, ExerciseDescriptor> = {};
  for (const blueprint of blueprints) {
    const id = blueprint.exerciseId;
    if (blueprint.name.trim() && !isKnown(id) && !result[id] && id === stubExerciseId(blueprint.name)) {
      result[id] = stubDescriptor(blueprint.name);
    }
  }
  return result;
}
