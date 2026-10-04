import { Duration, LocalDate } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { match } from 'ts-pattern';
import {
  CardioExerciseBlueprintJSON,
  CardioExerciseSetBlueprintJSON,
  CardioTargetJSON,
  DistanceJSON,
  ExerciseBlueprintJSON,
  ProgramBlueprintJSON,
  ProgressionRuleJSON,
  RestJSON,
  SessionBlueprintJSON,
  PlannedWarmupSetJSON,
  WarmupLoadJSON,
  WeightedExerciseBlueprintJSON,
  fromBigNumberJSON,
  fromDurationJSON,
  fromLocalDateJSON,
  toBigNumberJSON,
  toDurationJSON,
  toLocalDateJSON,
} from '../storage/versions/latest';
import { RecordedWeightedExercise } from '@/models/session-models';
import { setLabels, type SetKind, type WorkingListKind } from '@/models/session-models/set-kind';
import { Weight, WeightUnit } from '@/models/weight';
import { parseRoutineColor, type RoutineColor } from '@/models/routine-color';
import { uuidFromName } from '@/utils/uuid';
import { normalizeExerciseName } from './exercise-name';

export { normalizeExerciseName };

export class ProgramBlueprint {
  constructor(
    readonly name: string,
    readonly sessions: SessionBlueprint[],
    readonly lastEdited: LocalDate,
  ) {}

  static fromJSON(json: ProgramBlueprintJSON): ProgramBlueprint {
    return new ProgramBlueprint(
      json.name,
      json.sessions.map(SessionBlueprint.fromJSON),
      fromLocalDateJSON(json.lastEdited),
    );
  }

  equals(other: ProgramBlueprint | undefined) {
    if (!other) {
      return false;
    }
    if (other === this) {
      return true;
    }

    return (
      this.name === other.name &&
      this.lastEdited.equals(other.lastEdited) &&
      this.sessions.length === other.sessions.length &&
      this.sessions.every((session, index) => session.equals(other.sessions[index]))
    );
  }

  toJSON(): ProgramBlueprintJSON {
    return {
      version: 3,
      name: this.name,
      sessions: this.sessions.map((session) => session.toJSON()),
      lastEdited: toLocalDateJSON(this.lastEdited),
    };
  }

  with(other: Partial<ProgramBlueprint>): ProgramBlueprint {
    return new ProgramBlueprint(
      other.name ?? this.name,
      other.sessions ?? this.sessions,
      other.lastEdited ?? this.lastEdited,
    );
  }

  withName(name: string): ProgramBlueprint {
    return this.with({ name });
  }

  withSessions(sessions: SessionBlueprint[]): ProgramBlueprint {
    return this.with({ sessions });
  }

  withSession(sessionIndex: number, update: (session: SessionBlueprint) => SessionBlueprint): ProgramBlueprint {
    const session = this.sessions[sessionIndex];
    if (!session) {
      return this;
    }
    return this.with({ sessions: this.sessions.with(sessionIndex, update(session)) });
  }

  withAddedSession(session: SessionBlueprint): ProgramBlueprint {
    return this.with({ sessions: [...this.sessions, session] });
  }

  withoutSession(session: SessionBlueprint): ProgramBlueprint {
    return this.with({ sessions: this.sessions.filter((x) => !session.equals(x)) });
  }

  withSessionMovedUp(session: SessionBlueprint): ProgramBlueprint {
    const index = this.sessions.findIndex((x) => session.equals(x));
    return index > 0 ? this.withSessionsSwapped(index - 1, index) : this;
  }

  withSessionMovedDown(session: SessionBlueprint): ProgramBlueprint {
    const index = this.sessions.findIndex((x) => session.equals(x));
    return index >= 0 && index < this.sessions.length - 1 ? this.withSessionsSwapped(index, index + 1) : this;
  }

  private withSessionsSwapped(first: number, second: number): ProgramBlueprint {
    const sessions = [...this.sessions];
    [sessions[first], sessions[second]] = [sessions[second]!, sessions[first]!];
    return this.with({ sessions });
  }
}

export class SessionBlueprint {
  constructor(
    readonly name: string,
    readonly exercises: ExerciseBlueprint[],
    readonly notes: string,
    /** Undefined until someone picks one: the routine then shows the colour for its place (`routineColorOf`). */
    readonly color?: RoutineColor,
  ) {}

  static fromJSON(json: SessionBlueprintJSON): SessionBlueprint {
    return new SessionBlueprint(
      json.name,
      json.exercises.map(fromExerciseBlueprintJSON),
      json.notes,
      parseRoutineColor(json.color),
    );
  }

  equals(other: SessionBlueprint | undefined) {
    if (!other) {
      return false;
    }
    if (other === this) {
      return true;
    }

    return (
      this.name === other.name &&
      this.notes === other.notes &&
      this.color === other.color &&
      this.exercises.length === other.exercises.length &&
      this.exercises.every((exercise, index) => exercise.equals(other.exercises[index]))
    );
  }

  toJSON(): SessionBlueprintJSON {
    return {
      version: 10,
      name: this.name,
      exercises: this.exercises.map((exercise) => exercise.toJSON()),
      notes: this.notes,
      ...(this.color ? { color: this.color } : {}),
    };
  }

  with(other: Partial<SessionBlueprint>): SessionBlueprint {
    return new SessionBlueprint(
      other.name ?? this.name,
      other.exercises ?? this.exercises,
      other.notes ?? this.notes,
      other.color ?? this.color,
    );
  }

  withName(name: string): SessionBlueprint {
    return this.with({ name });
  }

  withNotes(notes: string): SessionBlueprint {
    return this.with({ notes });
  }

  withAddedExercise(exercise: ExerciseBlueprint): SessionBlueprint {
    return this.with({ exercises: [...this.exercises, exercise] });
  }

  withoutExercise(exercise: ExerciseBlueprint): SessionBlueprint {
    return this.with({ exercises: this.exercises.filter((x) => !exercise.equals(x)) });
  }

  withExercise(exerciseIndex: number, exercise: ExerciseBlueprint): SessionBlueprint {
    if (exerciseIndex < 0 || exerciseIndex >= this.exercises.length) {
      return this;
    }
    return this.with({ exercises: this.exercises.with(exerciseIndex, exercise) });
  }

  withExerciseMovedUp(exercise: ExerciseBlueprint): SessionBlueprint {
    const index = this.exercises.findIndex((x) => exercise.equals(x));
    return index > 0 ? this.withExercisesSwapped(index - 1, index) : this;
  }

  withExerciseMovedDown(exercise: ExerciseBlueprint): SessionBlueprint {
    const index = this.exercises.findIndex((x) => exercise.equals(x));
    return index >= 0 && index < this.exercises.length - 1 ? this.withExercisesSwapped(index, index + 1) : this;
  }

  private withExercisesSwapped(first: number, second: number): SessionBlueprint {
    const exercises = [...this.exercises];
    [exercises[first], exercises[second]] = [exercises[second]!, exercises[first]!];
    return this.with({ exercises });
  }
}

export type ExerciseBlueprint = WeightedExerciseBlueprint | CardioExerciseBlueprint;

function fromExerciseBlueprintJSON(json: ExerciseBlueprintJSON): ExerciseBlueprint {
  return match(json)
    .with({ type: 'CardioExerciseBlueprint' }, CardioExerciseBlueprint.fromJSON)
    .with({ type: 'WeightedExerciseBlueprint' }, WeightedExerciseBlueprint.fromJSON)
    .exhaustive();
}

export const DistanceUnits = ['metre', 'yard', 'mile', 'kilometre'] as const;
export type DistanceUnit = (typeof DistanceUnits)[number];

export type TimeCardioTarget = {
  type: 'time';
  value: Duration;
};

export type DistanceCardioTarget = {
  type: 'distance';
  value: Distance;
};

export type Distance = {
  value: BigNumber;
  unit: DistanceUnit;
};

export type CardioTarget = TimeCardioTarget | DistanceCardioTarget;

export function matchCardioTarget<T>(
  value: CardioTarget,
  matcher: {
    [k in CardioTarget['type']]: (val: Extract<CardioTarget, { type: k }>) => T;
  },
) {
  return match(value).with({ type: 'time' }, matcher.time).with({ type: 'distance' }, matcher.distance).exhaustive();
}

export class CardioExerciseSetBlueprint {
  constructor(
    readonly target: CardioTarget,
    readonly trackDuration: boolean,
    readonly trackDistance: boolean,
    readonly trackResistance: boolean,
    readonly trackIncline: boolean,
    readonly trackWeight: boolean,
    readonly trackSteps: boolean,
    /** Undefined when the set has no rest. Steady-state cardio does not need one; intervals do. */
    readonly restBetweenSets: Rest | undefined,
  ) {}
  static empty() {
    return new CardioExerciseSetBlueprint(
      {
        type: 'time',
        value: Duration.ofMinutes(30),
      },
      false,
      true,
      false,
      false,
      false,
      false,
      undefined,
    );
  }

  static fromJSON(json: CardioExerciseSetBlueprintJSON): CardioExerciseSetBlueprint {
    return new CardioExerciseSetBlueprint(
      fromCardioTargetJSON(json.target),
      json.trackDuration,
      json.trackDistance,
      json.trackResistance,
      json.trackIncline,
      json.trackWeight,
      json.trackSteps,
      json.restBetweenSets ? Rest.fromJSON(json.restBetweenSets) : undefined,
    );
  }

  toJSON(): CardioExerciseSetBlueprintJSON {
    return {
      target: toCardioTargetJSON(this.target),
      trackDistance: this.trackDistance,
      trackDuration: this.trackDuration,
      trackIncline: this.trackIncline,
      trackResistance: this.trackResistance,
      trackWeight: this.trackWeight,
      trackSteps: this.trackSteps,
      restBetweenSets: this.restBetweenSets ? Rest.toJSON(this.restBetweenSets) : undefined,
    };
  }

  equals(other: CardioExerciseSetBlueprint | undefined): boolean {
    if (!other) {
      return false;
    }
    return (
      this.trackDistance === other.trackDistance &&
      this.trackDuration === other.trackDuration &&
      this.trackIncline === other.trackIncline &&
      this.trackResistance === other.trackResistance &&
      this.trackWeight === other.trackWeight &&
      this.trackSteps === other.trackSteps &&
      restEquals(this.restBetweenSets, other.restBetweenSets) &&
      cardioTargetEquals(this.target, other.target)
    );
  }

  with(other: Partial<CardioExerciseSetBlueprint>): CardioExerciseSetBlueprint {
    return new CardioExerciseSetBlueprint(
      other.target ?? this.target,
      other.trackDuration ?? this.trackDuration,
      other.trackDistance ?? this.trackDistance,
      other.trackResistance ?? this.trackResistance,
      other.trackIncline ?? this.trackIncline,
      other.trackWeight ?? this.trackWeight,
      other.trackSteps ?? this.trackSteps,
      'restBetweenSets' in other ? other.restBetweenSets : this.restBetweenSets,
    );
  }
}

export class CardioExerciseBlueprint {
  readonly type = 'CardioExerciseBlueprint';
  constructor(
    readonly name: string,
    readonly sets: CardioExerciseSetBlueprint[],
    readonly notes: string,
    readonly link: string,
    /** See {@link exerciseId}. Undefined until the blueprint is linked to an exercise. */
    private readonly linkedExerciseId?: string,
  ) {
    if (!sets.length) {
      throw new Error('Must have at least one set in cardio exercise');
    }
  }

  static empty() {
    return new CardioExerciseBlueprint('', [CardioExerciseSetBlueprint.empty()], '', '');
  }

  static fromJSON(json: CardioExerciseBlueprintJSON): CardioExerciseBlueprint {
    return new CardioExerciseBlueprint(
      json.name,
      json.sets.map((x) => CardioExerciseSetBlueprint.fromJSON(x)),
      json.notes,
      json.link,
      json.exerciseId,
    );
  }

  /** See {@link ExerciseId}. */
  get exerciseId(): string {
    return this.linkedExerciseId ?? stubExerciseId(this.name);
  }

  /** False while the id is still derived from the name. See {@link ExerciseId}. */
  get isLinked(): boolean {
    return this.linkedExerciseId !== undefined;
  }

  /** See {@link MovementKey}. */
  movementKey(): MovementKey {
    return movementKeyFor(this.exerciseId, this.type);
  }

  /** See {@link ProgressionKey}. Distance and time work are separate lineages. */
  progressionKey(): ProgressionKey {
    return `${this.exerciseId}_${this.type}_${this.sets[0]?.target.type ?? 'distance'}` as ProgressionKey;
  }

  equals(other: ExerciseBlueprint | undefined) {
    if (!other) {
      return false;
    }
    if (other === this) {
      return true;
    }
    if ('type' in other && other.type !== this.type) {
      return false;
    }
    return (
      this.name === other.name &&
      this.exerciseId === other.exerciseId &&
      this.sets.length === other.sets.length &&
      this.sets.every((set, index) => set.equals(other.sets[index])) &&
      this.notes === other.notes &&
      this.link === other.link
    );
  }

  toJSON(): CardioExerciseBlueprintJSON {
    return {
      type: 'CardioExerciseBlueprint',
      name: this.name,
      exerciseId: this.exerciseId,
      sets: this.sets.map((x) => x.toJSON()),
      notes: this.notes,
      link: this.link,
    };
  }

  with(other: Partial<CardioExerciseBlueprint>): CardioExerciseBlueprint {
    return new CardioExerciseBlueprint(
      other.name ?? this.name,
      other.sets ?? this.sets,
      other.notes ?? this.notes,
      other.link ?? this.link,
      other.exerciseId ?? this.linkedExerciseId,
    );
  }
}

/** Which number a rule moves. */
export type ProgressionAxis = 'reps' | 'load';

export type IncreaseStrategy = 'first' | 'middle' | 'last' | 'all';

/**
 * Which sets a rule moves. `lowestSets` ranks by the rule's own axis, so a reps rule picks the sets
 * with the smallest target rather than the smallest weight.
 */
export type SetScope = { type: 'allSets' } | { type: 'lowestSets'; pick: IncreaseStrategy };

/**
 * What has to happen for a rule to fire. The only value stored, and what it asks for depends on the
 * rule's axis (see {@link ProgressionRule.isEarnedBy}): a weight rule waits for the best set to meet its
 * target, a reps rule for every set. Kept as one value so plans and backups stay readable by older builds.
 */
export type SuccessRule = 'allSetsMetTarget';

export interface ProgressionRuleInit {
  axis?: ProgressionAxis;
  step?: BigNumber;
  scope?: SetScope;
  ceiling?: BigNumber | undefined;
  onCeiling?: 'reset' | undefined;
  trigger?: SuccessRule;
}

/**
 * One step of automatic progression. An exercise carries an ordered list of these, and
 * {@link applyProgression} gives the move to the first rule that can still make one.
 *
 * `step` and `ceiling` are in the axis's own unit - whole reps, or plate increments in whatever unit
 * the lifter works in - and deliberately not a {@link Weight}. 2.5 in a kilogram gym and 5 in a pound
 * gym are the same step rather than conversions of one another, and a blueprint has no unit to be
 * expressed in: the unit is chosen per weight and carried forward through the lineage.
 */
export class ProgressionRule {
  readonly type = 'ProgressionRule';
  constructor(
    readonly axis: ProgressionAxis,
    readonly step: BigNumber,
    readonly scope: SetScope = { type: 'allSets' },
    readonly ceiling?: BigNumber,
    readonly onCeiling?: 'reset',
    readonly trigger: SuccessRule = 'allSetsMetTarget',
  ) {}

  static of(init: ProgressionRuleInit & { axis: ProgressionAxis; step: BigNumber }): ProgressionRule {
    return new ProgressionRule(init.axis, init.step, init.scope, init.ceiling, init.onCeiling, init.trigger);
  }

  /** The rule almost every plan wants: put more on the bar once the best set hit its target. */
  static load(step: BigNumber, scope: SetScope = { type: 'allSets' }): ProgressionRule {
    return new ProgressionRule('load', step, scope);
  }

  static fromJSON(json: ProgressionRuleJSON): ProgressionRule {
    return new ProgressionRule(
      json.axis,
      fromBigNumberJSON(json.step),
      json.scope.type === 'allSets' ? { type: 'allSets' } : { type: 'lowestSets', pick: json.scope.pick },
      json.ceiling === undefined ? undefined : fromBigNumberJSON(json.ceiling),
      json.onCeiling,
      json.trigger,
    );
  }

  toJSON(): ProgressionRuleJSON {
    return {
      axis: this.axis,
      step: toBigNumberJSON(this.step),
      scope: this.scope.type === 'allSets' ? { type: 'allSets' } : { type: 'lowestSets', pick: this.scope.pick },
      ...(this.ceiling === undefined ? {} : { ceiling: toBigNumberJSON(this.ceiling) }),
      ...(this.onCeiling === undefined ? {} : { onCeiling: this.onCeiling }),
      trigger: this.trigger,
    };
  }

  with(other: ProgressionRuleInit): ProgressionRule {
    return new ProgressionRule(
      other.axis ?? this.axis,
      other.step ?? this.step,
      other.scope ?? this.scope,
      'ceiling' in other ? other.ceiling : this.ceiling,
      'onCeiling' in other ? other.onCeiling : this.onCeiling,
      other.trigger ?? this.trigger,
    );
  }

  equals(other: ProgressionRule | undefined): boolean {
    if (!other) {
      return false;
    }
    if (other === this) {
      return true;
    }
    return (
      this.axis === other.axis &&
      this.step.isEqualTo(other.step) &&
      setScopeEquals(this.scope, other.scope) &&
      (this.ceiling?.isEqualTo(other.ceiling ?? NaN) ?? other.ceiling === undefined) &&
      this.onCeiling === other.onCeiling &&
      this.trigger === other.trigger
    );
  }

  /**
   * Whether `performance` earned this rule's move. Adding weight goes from the best set alone, so a
   * heavy top set counts whatever the other sets did. Adding reps needs every set there, because the
   * reps climb on every set together.
   */
  isEarnedBy(performance: RecordedWeightedExercise): boolean {
    return this.axis === 'load' ? performance.bestSetMetTarget : performance.isSuccessForProgressiveOverload;
  }

  /**
   * The exercise with this rule's move made, or `undefined` when the rule has nothing left to move. Only the
   * slots that continue `carriedFrom`, the session the exercise's numbers came from, can move.
   */
  applyTo(
    exercise: RecordedWeightedExercise,
    carriedFrom: RecordedWeightedExercise,
  ): RecordedWeightedExercise | undefined {
    // A load rule kept from before the load was turned off would climb a weight nothing displays.
    if (this.axis === 'load' && !exercise.tracksResistance) {
      return undefined;
    }
    const indices = this.indicesToMove(exercise, carriedFrom);
    if (!indices.length) {
      return undefined;
    }
    return this.axis === 'load' ? this.moveLoad(exercise, indices) : this.moveReps(exercise, indices);
  }

  /** Undoes this rule's climb, putting the axis back to what the plan asks for. */
  resetOn(exercise: RecordedWeightedExercise): RecordedWeightedExercise {
    // Only reps have a planned value to return to; the plan never prescribes a load.
    if (this.axis !== 'reps') {
      return exercise;
    }
    return exercise.potentialSets.reduce(
      (ex, _, index) => ex.withSet(index, (s) => s.with({ target: exercise.blueprint.repsTargetForSet(index) })),
      exercise,
    );
  }

  private moveLoad(exercise: RecordedWeightedExercise, indices: number[]): RecordedWeightedExercise {
    return indices.reduce(
      (ex, index) => ex.withSet(index, (s) => s.with({ weight: s.weight.plus(this.step) })),
      exercise,
    );
  }

  /**
   * The band climbs as a whole, stopping when its top reaches the ceiling. Both ends move by the same
   * amount even on the last rung, so a range keeps its width rather than closing up against the cap.
   */
  private moveReps(exercise: RecordedWeightedExercise, indices: number[]): RecordedWeightedExercise | undefined {
    const moved = indices.flatMap((index) => {
      const { min, max } = exercise.repsTargetForSet(index);
      const step = this.stepUpTo(max);
      return step === 0 ? [] : [{ index, target: { min: min + step, max: max + step } }];
    });
    if (!moved.length) {
      return undefined;
    }
    return moved.reduce((ex, { index, target }) => ex.withSet(index, (s) => s.with({ target })), exercise);
  }

  /**
   * How far reps may actually climb from `from`: the whole step, or whatever the ceiling leaves.
   *
   * Whole reps only - a target is an integer on the wire, and half a repetition is not a thing to ask
   * anyone for. A rule with nowhere left to go returns zero, which is what hands the move on to the
   * next rule in the list.
   */
  private stepUpTo(from: number): number {
    const step = Math.floor(this.step.toNumber());
    const reachable =
      this.ceiling === undefined ? from + step : Math.min(from + step, Math.floor(this.ceiling.toNumber()));
    return Math.max(reachable - from, 0);
  }

  /**
   * Only the sets that continue the progression move: a drop set is neither checked nor climbed. A slot that
   * started over is out before the ranking, or at no weight it would always be the lowest.
   */
  private indicesToMove(exercise: RecordedWeightedExercise, carriedFrom: RecordedWeightedExercise): number[] {
    const eligible = exercise.workingIndicesContinuing(carriedFrom);
    if (this.scope.type === 'allSets') {
      return eligible;
    }
    // Ranked by the rule's own axis: a reps rule that sorted by load would pick a set at random.
    const matching =
      this.axis === 'load'
        ? lowestByWeight(exercise, eligible)
        : lowestByNumber(eligible, (i) => exercise.repsTargetForSet(i).max);
    return pickFrom(matching, this.scope.pick, exercise.potentialSets.length);
  }
}

function lowestByWeight(exercise: RecordedWeightedExercise, eligible: number[]): number[] {
  const sets = exercise.potentialSets;
  const lowest = eligible.map((index) => sets[index]!).sort((a, b) => (a.weight.isGreaterThan(b.weight) ? 1 : -1))[0];
  if (!lowest) {
    return [];
  }
  return eligible.filter((index) => sets[index]!.weight.equals(lowest.weight));
}

function lowestByNumber(eligible: number[], valueAt: (index: number) => number): number[] {
  const values = eligible.map(valueAt);
  const lowest = Math.min(...values);
  return eligible.filter((_, position) => values[position] === lowest);
}

/** `middle` measures from the centre of *all* sets, not the centre of the matching ones. */
function pickFrom(matching: number[], pick: IncreaseStrategy, setCount: number): number[] {
  if (!matching.length) {
    return [];
  }
  return match(pick)
    .returnType<number[]>()
    .with('all', () => matching)
    .with('first', () => matching.slice(0, 1))
    .with('last', () => matching.slice(-1))
    .with('middle', () => {
      const centre = (setCount - 1) / 2;
      // A tie keeps the earlier candidate.
      return [
        matching.reduce((closest, index) => (Math.abs(index - centre) < Math.abs(closest - centre) ? index : closest)),
      ];
    })
    .exhaustive();
}

function setScopeEquals(a: SetScope, b: SetScope): boolean {
  return a.type === 'allSets' ? b.type === 'allSets' : b.type === 'lowestSets' && a.pick === b.pick;
}

export function progressionEquals(a: ProgressionRule[], b: ProgressionRule[]): boolean {
  return a.length === b.length && a.every((rule, index) => rule.equals(b[index]));
}

/**
 * Ordered: the first rule that can still move is the one that moves. Every rule ahead of it has run
 * out of room, so any of those asking to `reset` gets put back to the plan on the way past - that
 * handoff is what makes double progression a ladder rather than a one-way climb.
 *
 * `carriedFrom` is the session the exercise was carried from. Leave it out when the exercise continues
 * itself, as the editor's example does.
 */
export function applyProgression(
  progression: ProgressionRule[],
  exercise: RecordedWeightedExercise,
  carriedFrom: RecordedWeightedExercise = exercise,
): RecordedWeightedExercise {
  return progressWhere(progression, exercise, carriedFrom, () => true);
}

/**
 * {@link applyProgression} after a real session: the rule that would move only does if `carriedFrom`
 * earned it (see {@link ProgressionRule.isEarnedBy}). When it did not, nothing moves - the rules behind it
 * never get a turn, so a rep ladder that is still climbing is never skipped for the weight rule after it.
 */
export function applyEarnedProgression(
  progression: ProgressionRule[],
  exercise: RecordedWeightedExercise,
  carriedFrom: RecordedWeightedExercise,
): RecordedWeightedExercise {
  return progressWhere(progression, exercise, carriedFrom, (rule) => rule.isEarnedBy(carriedFrom));
}

function progressWhere(
  progression: ProgressionRule[],
  exercise: RecordedWeightedExercise,
  carriedFrom: RecordedWeightedExercise,
  earned: (rule: ProgressionRule) => boolean,
): RecordedWeightedExercise {
  for (const [index, rule] of progression.entries()) {
    const moved = rule.applyTo(exercise, carriedFrom);
    if (moved) {
      if (!earned(rule)) {
        return exercise;
      }
      return progression
        .slice(0, index)
        .filter((exhausted) => exhausted.onCeiling === 'reset')
        .reduce((ex, exhausted) => exhausted.resetOn(ex), moved);
    }
  }
  return exercise;
}

/**
 * Whether a rule can always find room to move, and so never hands over to the one behind it. Only a
 * ceiling bounds a rule, and a ceiling counts reps, which leaves a load rule terminal by construction.
 * A load rule on an exercise carrying no load is the opposite: it never moves at all, so it does hand
 * over.
 */
function isTerminal(rule: ProgressionRule, tracksResistance: boolean): boolean {
  return rule.axis === 'load' ? tracksResistance : rule.ceiling === undefined;
}

/**
 * The index from which the rules can never run, or `undefined` while every rule is reachable. Nothing
 * behind a terminal rule is ever consulted, so a chain authored that way silently does less than it
 * reads as doing.
 */
export function unreachableFrom(progression: ProgressionRule[], tracksResistance: boolean): number | undefined {
  const blocker = progression.findIndex((rule) => isTerminal(rule, tracksResistance));
  return blocker >= 0 && blocker < progression.length - 1 ? blocker + 1 : undefined;
}

/** How far a reps rule climbs before handing over, when nobody has said otherwise. */
const LADDER_SPAN = 4;

/** The rung a reps rule should stop at, given where the plan starts it. */
export function defaultCeilingFor(exercise: WeightedExerciseBlueprint): BigNumber {
  const start = exercise.plannedSets.reduce((highest, set) => Math.max(highest, set.reps.max), 0);
  return new BigNumber(start + LADDER_SPAN);
}

/**
 * The chain after adding a rule, arranged so the new rule can actually run.
 *
 * A load rule is terminal, so a new rule goes in front of it rather than behind it. A reps rule with
 * nothing to hand over at gets a ceiling on the way, since the only reason to put a rule behind one is
 * to have it take over. Both land on the same shape: reps climb a few rungs, the bar goes up, the reps
 * start again.
 */
export function withAddedRule(exercise: WeightedExerciseBlueprint): ProgressionRule[] {
  const progression = exercise.progression;
  const tracksResistance = exercise.resistance !== 'none';
  const ceiling = defaultCeilingFor(exercise);
  const ladderRung = () => ProgressionRule.of({ axis: 'reps', step: new BigNumber(1), ceiling, onCeiling: 'reset' });
  const fresh = () =>
    tracksResistance
      ? ProgressionRule.load(new BigNumber(2.5))
      : ProgressionRule.of({ axis: 'reps', step: new BigNumber(1) });

  const last = progression[progression.length - 1];
  if (!last) {
    return [fresh()];
  }
  // An inert load rule - one on an exercise carrying no load - hands over like anything else.
  if (last.axis === 'load' && tracksResistance) {
    return [...progression.slice(0, -1), ladderRung(), last];
  }
  if (last.axis === 'reps' && last.ceiling === undefined) {
    return [...progression.slice(0, -1), last.with({ ceiling, onCeiling: 'reset' }), fresh()];
  }
  return [...progression, fresh()];
}

/**
 * How much the weight stepper in the set counter moves per tap. Falls back to a pair of the smallest
 * plates, which is what an exercise that progresses on something else still wants offered.
 */
export function weightIncrementFor(progression: ProgressionRule[]): BigNumber {
  const step = progression.find((rule) => rule.axis === 'load')?.step;
  return step && !step.isZero() ? step : new BigNumber(2.5);
}

/** Always a band; `min === max` is a point target. */
export interface RepsTarget {
  min: number;
  max: number;
}

/** What the plan asks for on one set. */
export interface PlannedSet {
  reps: RepsTarget;
  kind: WorkingListKind;
}

/**
 * Where a movement's load comes from: the whole stored weight (`external`), what is added on top of
 * the lifter (`bodyweight`), or nothing at all (`none`).
 */
export const LoadBases = ['none', 'external', 'bodyweight'] as const;
export type Resistance = (typeof LoadBases)[number];

/** How the editor lays rep targets out before projecting them onto a {@link PlannedSet} list. */
export type RepsConfig =
  | { type: 'fixed'; reps: number }
  | { type: 'range'; min: number; max: number }
  | { type: 'perSet'; targets: RepsTarget[] };

export type RepsType = RepsConfig['type'];

export function formatRepsTarget(target: RepsTarget): string {
  return target.min === target.max ? `${target.max}` : `${target.min}-${target.max}`;
}

/** A {@link PlannedSet}, or a session slot's target and kind, which is typed as any {@link SetKind}. */
type KindedTarget = { reps: RepsTarget; kind: SetKind };

/**
 * How a whole list of planned sets reads: `10`, `8-12`, or `12, 10, 8` for a pyramid. A set that is not
 * a working set is spelled out with its letter, `10, 10, D 15`, so a change of kind reads as one. A no-break
 * space holds the letter to its reps when the line wraps.
 */
export function formatPlannedSets(plannedSets: readonly KindedTarget[], separator = ', '): string {
  const uniform = uniformWorkingTarget(plannedSets);
  if (uniform) {
    return formatRepsTarget(uniform);
  }
  const labels = setLabels(plannedSets.map((s) => s.kind));
  return plannedSets
    .map((s, index) =>
      s.kind === 'working' ? formatRepsTarget(s.reps) : `${labels[index]}\u00A0${formatRepsTarget(s.reps)}`,
    )
    .join(separator);
}

/** The target every set shares, or undefined when they differ. */
export function uniformTarget(plannedSets: readonly Pick<PlannedSet, 'reps'>[]): RepsTarget | undefined {
  const first = plannedSets[0]?.reps;
  if (!first) {
    return undefined;
  }
  return plannedSets.every((s) => s.reps.min === first.min && s.reps.max === first.max) ? first : undefined;
}

/** The target every set shares when they are all working sets, so the list reads as one target. */
export function uniformWorkingTarget(plannedSets: readonly KindedTarget[]): RepsTarget | undefined {
  return plannedSets.every((s) => s.kind === 'working') ? uniformTarget(plannedSets) : undefined;
}

export function repsTargetsEqual(a: RepsTarget, b: RepsTarget): boolean {
  return a.min === b.min && a.max === b.max;
}

export function plannedSetsEqual(a: PlannedSet[], b: PlannedSet[]): boolean {
  return a.length === b.length && a.every((s, i) => repsTargetsEqual(s.reps, b[i]!.reps) && s.kind === b[i]!.kind);
}

/**
 * How a warm-up's load is planned: a share of the session's heaviest working set (`percent` is out of
 * 100), or a fixed weight such as an empty bar. The fixed weight carries its own unit, unlike a
 * progression step, because it is a real load rather than a plate increment.
 */
export type WarmupLoad = { type: 'percent'; percent: number } | { type: 'absolute'; weight: Weight };

export type WarmupLoadType = WarmupLoad['type'];

/**
 * What the plan asks for on one warm-up set. Warm-ups never count toward anything - progression,
 * records, stats - which is why they sit in their own list rather than among the planned sets.
 */
export interface PlannedWarmupSet {
  /** Undefined for reps only: always on an exercise with no resistance, or no added weight otherwise. */
  load: WarmupLoad | undefined;
  reps: number;
}

/**
 * The load types a warm-up may take on each resistance: a percentage of added weight on a bodyweight
 * movement would be a percentage of the wrong thing, and an exercise with no resistance has no load.
 */
export function warmupLoadTypesFor(resistance: Resistance): readonly WarmupLoadType[] {
  return match(resistance)
    .returnType<readonly WarmupLoadType[]>()
    .with('external', () => ['percent', 'absolute'])
    .with('bodyweight', () => ['absolute'])
    .with('none', () => [])
    .exhaustive();
}

/** The warm-up as the resistance allows it, dropping a load it cannot take. */
function warmupSetFor(resistance: Resistance, warmup: PlannedWarmupSet): PlannedWarmupSet {
  if (!warmup.load || warmupLoadTypesFor(resistance).includes(warmup.load.type)) {
    return warmup;
  }
  return { load: undefined, reps: warmup.reps };
}

/**
 * What "Add warm-up" offers next: a light ramp of 50% × 5 and then 70% × 3 where a percentage is
 * allowed, otherwise the same reps with no added weight.
 */
export function nextWarmupSet(resistance: Resistance, existing: PlannedWarmupSet[]): PlannedWarmupSet {
  const first = existing.length === 0;
  const reps = first ? 5 : 3;
  const allowed = warmupLoadTypesFor(resistance);
  if (allowed.includes('percent')) {
    return { load: { type: 'percent', percent: first ? 50 : 70 }, reps };
  }
  return { load: undefined, reps };
}

/**
 * The warm-up with its load planned as `type` instead, keeping its reps. A percentage starts at 50%. A
 * fixed weight starts empty: nothing in the plan says what a sensible one is, so it is entered next.
 */
export function withWarmupLoadType(warmup: PlannedWarmupSet, type: WarmupLoadType): PlannedWarmupSet {
  if (warmup.load?.type === type || (type === 'absolute' && !warmup.load)) {
    return warmup;
  }
  return {
    load: type === 'percent' ? { type: 'percent', percent: 50 } : undefined,
    reps: warmup.reps,
  };
}

function warmupLoadsEqual(a: WarmupLoad | undefined, b: WarmupLoad | undefined): boolean {
  if (!a || !b) {
    return a === b;
  }
  if (a.type === 'percent') {
    return b.type === 'percent' && a.percent === b.percent;
  }
  return b.type === 'absolute' && a.weight.equals(b.weight);
}

export function plannedWarmupSetEqual(a: PlannedWarmupSet, b: PlannedWarmupSet): boolean {
  return a.reps === b.reps && warmupLoadsEqual(a.load, b.load);
}

export function plannedWarmupSetsEqual(a: PlannedWarmupSet[], b: PlannedWarmupSet[]): boolean {
  return a.length === b.length && a.every((w, i) => plannedWarmupSetEqual(w, b[i]!));
}

/**
 * `50% × 5`, `20kg × 5`, or just `5` for reps only. `formatPercent` renders a percentage load, so the
 * caller can use the same translated label the workout tile does.
 */
export function formatPlannedWarmupSet(warmup: PlannedWarmupSet, formatPercent: (percent: number) => string): string {
  if (!warmup.load) {
    return `${warmup.reps}`;
  }
  const load =
    warmup.load.type === 'percent' ? formatPercent(warmup.load.percent) : warmup.load.weight.shortLocaleFormat();
  return `${load} × ${warmup.reps}`;
}

export function formatPlannedWarmupSets(
  warmups: PlannedWarmupSet[],
  formatPercent: (percent: number) => string,
): string {
  return warmups.map((warmup) => formatPlannedWarmupSet(warmup, formatPercent)).join(', ');
}

/**
 * The step a warm-up's weight is rounded to in `unit`: the exercise's load step, or a pair of the
 * smallest plates in that unit when it has none.
 */
export function warmupIncrementFor(exercise: WeightedExerciseBlueprint, unit: WeightUnit): BigNumber {
  const step = exercise.progression.find((rule) => rule.axis === 'load')?.step;
  if (step && step.isGreaterThan(0)) {
    return step;
  }
  return new BigNumber(unit === 'pounds' ? 5 : 2.5);
}

/** `weight` at the nearest multiple of `increment`, and never below zero. */
export function roundWarmupWeight(weight: Weight, increment: BigNumber): Weight {
  const rounded = increment.isGreaterThan(0)
    ? weight.value.dividedBy(increment).integerValue(BigNumber.ROUND_HALF_UP).multipliedBy(increment)
    : weight.value;
  return new Weight(BigNumber.max(rounded, 0), weight.unit);
}

function warmupLoadFromJSON(json: WarmupLoadJSON | undefined): WarmupLoad | undefined {
  if (!json) {
    return undefined;
  }
  return json.type === 'percent'
    ? { type: 'percent', percent: json.percent }
    : { type: 'absolute', weight: Weight.fromJSON(json.weight) };
}

function warmupLoadToJSON(load: WarmupLoad): WarmupLoadJSON {
  return load.type === 'percent'
    ? { type: 'percent', percent: load.percent }
    : { type: 'absolute', weight: load.weight.toJSON() };
}

function plannedWarmupSetFromJSON(json: PlannedWarmupSetJSON): PlannedWarmupSet {
  return { load: warmupLoadFromJSON(json.load), reps: json.reps };
}

function plannedWarmupSetToJSON(warmup: PlannedWarmupSet): PlannedWarmupSetJSON {
  return { ...(warmup.load ? { load: warmupLoadToJSON(warmup.load) } : {}), reps: warmup.reps };
}

/**
 * Every field of a weighted blueprint, each optional and each named. See
 * {@link WeightedExerciseBlueprint.of}.
 */
export interface WeightedExerciseBlueprintInit {
  name?: string;
  /** See {@link ExerciseId}. Left out, the blueprint is unlinked and its id follows its name. */
  exerciseId?: string;
  plannedSets?: PlannedSet[];
  progression?: ProgressionRule[];
  restBetweenSets?: Rest;
  supersetWithNext?: boolean;
  notes?: string;
  link?: string;
  resistance?: Resistance;
  warmupSets?: PlannedWarmupSet[];
  /** Authoring shorthand for `plannedSets`, projected through {@link plannedSetsOf}. */
  sets?: number;
  repsConfig?: RepsConfig;
}

export class WeightedExerciseBlueprint {
  readonly type = 'WeightedExerciseBlueprint';

  /**
   * Planned warm-ups, in the order they are done. Always fits {@link resistance}: a load the
   * resistance cannot take is dropped on the way in (see {@link warmupLoadTypesFor}).
   */
  readonly warmupSets: PlannedWarmupSet[];

  constructor(
    readonly name: string,
    readonly plannedSets: PlannedSet[],
    readonly progression: ProgressionRule[],
    readonly restBetweenSets: Rest,
    readonly supersetWithNext: boolean,
    readonly notes: string,
    readonly link: string,
    readonly resistance: Resistance = 'external',
    warmupSets: PlannedWarmupSet[] = [],
    /** See {@link exerciseId}. Undefined until the blueprint is linked to an exercise. */
    private readonly linkedExerciseId?: string,
  ) {
    this.warmupSets = warmupSets.map((w) => warmupSetFor(resistance, w));
  }

  /** Build a blueprint from named fields; preferred over the constructor's positional arguments. */
  static of(init: WeightedExerciseBlueprintInit = {}): WeightedExerciseBlueprint {
    return new WeightedExerciseBlueprint(
      init.name ?? '',
      init.plannedSets ?? plannedSetsOf(init.sets ?? 3, init.repsConfig ?? { type: 'fixed', reps: 10 }),
      init.progression ?? [],
      init.restBetweenSets ?? Rest.medium,
      init.supersetWithNext ?? false,
      init.notes ?? '',
      init.link ?? '',
      init.resistance ?? 'external',
      init.warmupSets ?? [],
      init.exerciseId,
    );
  }

  static empty() {
    return WeightedExerciseBlueprint.of();
  }

  static fromJSON(json: WeightedExerciseBlueprintJSON): WeightedExerciseBlueprint {
    return new WeightedExerciseBlueprint(
      json.name,
      json.plannedSets.map((s) => ({ reps: { min: s.reps.min, max: s.reps.max }, kind: s.kind })),
      json.progression.map(ProgressionRule.fromJSON),
      Rest.fromJSON(json.restBetweenSets),
      json.supersetWithNext,
      json.notes,
      json.link,
      json.resistance,
      json.warmupSets.map(plannedWarmupSetFromJSON),
      json.exerciseId,
    );
  }

  /** See {@link ExerciseId}. */
  get exerciseId(): string {
    return this.linkedExerciseId ?? stubExerciseId(this.name);
  }

  /** False while the id is still derived from the name. See {@link ExerciseId}. */
  get isLinked(): boolean {
    return this.linkedExerciseId !== undefined;
  }

  /** See {@link weightIncrementFor}. */
  get weightIncrement(): BigNumber {
    return weightIncrementFor(this.progression);
  }

  /** See {@link MovementKey}. */
  movementKey(): MovementKey {
    return movementKeyFor(this.exerciseId, this.type);
  }

  /**
   * Whether reps are something this exercise advances on, rather than a fixed prescription: either it
   * carries no load and so has nothing else to advance on, or a rule moves them outright.
   *
   * The target then carries session to session instead of being re-seeded, because otherwise the next
   * session would undo whatever the rule just did.
   */
  get repsAreProgressed(): boolean {
    return this.resistance === 'none' || this.progression.some((rule) => rule.axis === 'reps');
  }

  /**
   * See {@link ProgressionKey}. The exercise alone: its sets, rep scheme and warm-ups stay out of it, so
   * changing any of them keeps the lineage's carry-over.
   */
  progressionKey(): ProgressionKey {
    return `${this.exerciseId}_${this.type}` as ProgressionKey;
  }

  repsTargetForSet(index: number): RepsTarget {
    const target = this.plannedSets[index]?.reps ?? this.plannedSets.at(-1)?.reps ?? { min: 0, max: 0 };
    return { min: target.min, max: target.max };
  }

  withSets(value: number): WeightedExerciseBlueprint {
    const sets = Math.max(value, 1);
    if (sets <= this.plannedSets.length) {
      return this.with({ plannedSets: this.plannedSets.slice(0, sets) });
    }
    const last = this.plannedSets.at(-1)?.reps ?? { min: 10, max: 10 };
    return this.with({
      plannedSets: [
        ...this.plannedSets,
        ...Array.from({ length: sets - this.plannedSets.length }, () => ({
          reps: { ...last },
          kind: 'working' as const,
        })),
      ],
    });
  }

  equals(other: ExerciseBlueprint | undefined) {
    if (!other) {
      return false;
    }
    if (other === this) {
      return true;
    }
    if ('type' in other && other.type !== this.type) {
      return false;
    }

    return (
      this.name === other.name &&
      this.exerciseId === other.exerciseId &&
      plannedSetsEqual(this.plannedSets, other.plannedSets) &&
      progressionEquals(this.progression, other.progression) &&
      this.restBetweenSets.minRest.equals(other.restBetweenSets.minRest) &&
      this.restBetweenSets.maxRest.equals(other.restBetweenSets.maxRest) &&
      this.restBetweenSets.failureRest.equals(other.restBetweenSets.failureRest) &&
      this.supersetWithNext === other.supersetWithNext &&
      this.notes === other.notes &&
      this.link === other.link &&
      this.resistance === other.resistance &&
      plannedWarmupSetsEqual(this.warmupSets, other.warmupSets)
    );
  }

  toJSON(): WeightedExerciseBlueprintJSON {
    return {
      type: 'WeightedExerciseBlueprint',
      name: this.name,
      exerciseId: this.exerciseId,
      plannedSets: this.plannedSets.map((s) => ({ reps: { min: s.reps.min, max: s.reps.max }, kind: s.kind })),
      progression: this.progression.map((rule) => rule.toJSON()),
      restBetweenSets: Rest.toJSON(this.restBetweenSets),
      supersetWithNext: this.supersetWithNext,
      notes: this.notes,
      link: this.link,
      resistance: this.resistance,
      warmupSets: this.warmupSets.map(plannedWarmupSetToJSON),
    };
  }

  with(other: WeightedExerciseBlueprintInit): WeightedExerciseBlueprint {
    return new WeightedExerciseBlueprint(
      other.name ?? this.name,
      other.plannedSets ??
        (other.sets !== undefined || other.repsConfig !== undefined
          ? withKindsOf(
              this.plannedSets,
              plannedSetsOf(other.sets ?? this.plannedSets.length, other.repsConfig ?? targetsAsRepsConfig(this)),
            )
          : this.plannedSets),
      other.progression ?? this.progression,
      other.restBetweenSets ?? this.restBetweenSets,
      other.supersetWithNext ?? this.supersetWithNext,
      other.notes ?? this.notes,
      other.link ?? this.link,
      other.resistance ?? this.resistance,
      other.warmupSets ?? this.warmupSets,
      other.exerciseId ?? this.linkedExerciseId,
    );
  }
}

/** Project an authoring layout onto the list of sets it describes. */
export function plannedSetsOf(sets: number, repsConfig: RepsConfig): PlannedSet[] {
  const targetAt = match(repsConfig)
    .returnType<(index: number) => RepsTarget>()
    .with({ type: 'fixed' }, (c) => () => ({ min: c.reps, max: c.reps }))
    .with({ type: 'range' }, (c) => () => ({ min: c.min, max: c.max }))
    .with({ type: 'perSet' }, (c) => (index: number) => c.targets[index] ?? c.targets.at(-1) ?? { min: 0, max: 0 })
    .exhaustive();
  return Array.from({ length: Math.max(sets, 0) }, (_, index) => {
    const { min, max } = targetAt(index);
    return { reps: { min, max }, kind: 'working' };
  });
}

/** A rep layout only describes reps, so re-laying the targets keeps each set's kind where it was. */
function withKindsOf(existing: PlannedSet[], relaid: PlannedSet[]): PlannedSet[] {
  return relaid.map((set, index) => ({ ...set, kind: existing[index]?.kind ?? set.kind }));
}

/** Existing targets in the form `with({ sets })` can resize without changing them. */
function targetsAsRepsConfig(blueprint: WeightedExerciseBlueprint): RepsConfig {
  return { type: 'perSet', targets: blueprint.plannedSets.map((s) => ({ ...s.reps })) };
}

/*
 * Two exercises can be "the same" in two different ways, and the answer differs depending on which
 * question is being asked. Both keys are produced by methods on the blueprint (and mirrored on the
 * recorded exercise), so whichever one you have in hand offers both side by side.
 *
 *   movementKey()    - is this the same *movement*, for aggregating history?
 *   progressionKey() - is this the same *progressing lineage*, so last session's numbers load into today's?
 *
 * A weighted exercise gives the same answer to both; a cardio exercise progresses distance and time work
 * apart. They are branded so that a map keyed by one cannot be indexed by the other.
 */

/**
 * Which exercise a blueprint is: an id in the user's exercise list, so renaming the exercise there keeps
 * every workout that did it. A built-in's id is its English catalog name, and a user exercise's is a
 * uuid. Names coming in from outside - a plan file, the AI planner, a CSV, a friend's share - are turned
 * into ids by the `ExerciseResolver` (`models/exercise-resolver.ts`).
 *
 * A blueprint that was never linked - built from a bare name, or stored before ids existed - answers
 * with {@link stubExerciseId} of its name, which is the id the resolver gives a name nothing else claims.
 * So an unlinked blueprint already groups the way it will once linked, unless the name turns out to be
 * a built-in or one of the user's exercises.
 */
export type ExerciseId = string;

/**
 * The id the resolver gives a name that matches no exercise. It is derived from the normalised name
 * alone, so `Lunges` and `lunge` get the same stub, every device agrees on it, and resolving the same
 * name twice never makes two exercises.
 */
export function stubExerciseId(name: string): ExerciseId {
  return uuidFromName(normalizeExerciseName(name), STUB_EXERCISE_NAMESPACE);
}

export const STUB_EXERCISE_NAMESPACE = '4d6c8a1e-2f3b-5c7d-9e0f-1a2b3c4d5e6f';

/**
 * Identifies a movement across everything the user has ever logged: the exercise and its kind. Blind
 * to how the exercise is programmed, and blind to its name, so stats, personal records and "recently
 * completed" stay one row per exercise across a rename. Fuzzy spelling - `Cable Flye`, `cable flies`
 * and `Cable Flys` - is folded when the names are resolved to one id.
 *
 * Weighted and cardio are separate movements even for the same exercise: a rowing machine and a
 * barbell row share a word and nothing else, and their numbers are not comparable.
 */
export type MovementKey = string & { readonly __brand: 'MovementKey' };

/**
 * Identifies a progressing lineage, so that weights and rep targets carry from session to session. A
 * weighted exercise is one lineage whatever its set count or rep scheme: the next session carries from
 * the latest one, wherever that was planned (see {@link RecordedWeightedExercise.carriedInto}). A cardio
 * exercise splits on distance and time work. Split by type for the same reason as {@link MovementKey}.
 * The same exercise twice in one session is two lineages, told apart by {@link lineageKeys}.
 */
export type ProgressionKey = string & { readonly __brand: 'ProgressionKey' };

/**
 * The lineage of each of `exercises`, a session's or a routine's, in order: its progression key, or for a
 * repeat of that key in the same list, the key with the repeat's number (`<key>#2`). A routine that plans
 * an exercise twice, a heavy single then back-off sets say, has each progress on its own, paired by place.
 */
export function lineageKeys(exercises: readonly { progressionKey(): ProgressionKey }[]): ProgressionKey[] {
  const seen = new Map<ProgressionKey, number>();
  return exercises.map((exercise) => {
    const key = exercise.progressionKey();
    const repeat = (seen.get(key) ?? 0) + 1;
    seen.set(key, repeat);
    return lineageKey(key, repeat);
  });
}

/**
 * The lineage key of the `repeat`-th place of `key` in one list: the key itself for the first, `<key>#n`
 * after. {@link progressionKeyOf} is the inverse. Stored on every exercise row as `workout_exercise.lineage`,
 * which migration 0013 and the rekey data migration build the same way in SQL.
 */
export function lineageKey(key: ProgressionKey, repeat: number): ProgressionKey {
  return repeat === 1 ? key : (`${key}#${repeat}` as ProgressionKey);
}

/** The progression key a lineage key (see {@link lineageKey}) is a place of. */
export function progressionKeyOf(lineage: ProgressionKey): ProgressionKey {
  return lineage.replace(/#\d+$/, '') as ProgressionKey;
}

/**
 * The latest performance of `lineage` in `latest` (keyed by {@link lineageKeys}). A repeat never done as a
 * repeat yet, the first time a routine plans the exercise twice, carries from the exercise's first lineage.
 */
export function latestInLineage<T>(
  latest: Readonly<Record<ProgressionKey, T | undefined>>,
  lineage: ProgressionKey,
): T | undefined {
  return latest[lineage] ?? latest[progressionKeyOf(lineage)];
}

/**
 * For callers holding an exercise id and a type but no blueprint - a route param, say. Prefer
 * `blueprint.movementKey()` wherever a blueprint is available.
 */
export function movementKeyFor(exerciseId: ExerciseId, type: ExerciseBlueprint['type']): MovementKey {
  return `${exerciseId}|${type}` as MovementKey;
}

export interface Rest {
  minRest: Duration;
  maxRest: Duration;
  failureRest: Duration;
}

export const Rest = {
  short: {
    minRest: Duration.ofSeconds(60),
    maxRest: Duration.ofSeconds(90),
    failureRest: Duration.ofSeconds(180),
  },
  medium: {
    minRest: Duration.ofSeconds(90),
    maxRest: Duration.ofSeconds(180),
    failureRest: Duration.ofSeconds(300),
  },
  long: {
    minRest: Duration.ofMinutes(3),
    maxRest: Duration.ofMinutes(5),
    failureRest: Duration.ofMinutes(8),
  },

  fromJSON(json: RestJSON): Rest {
    return {
      minRest: fromDurationJSON(json.minRest),
      maxRest: fromDurationJSON(json.maxRest),
      failureRest: fromDurationJSON(json.failureRest),
    };
  },

  toJSON(value: Rest): RestJSON {
    return {
      minRest: toDurationJSON(value.minRest),
      maxRest: toDurationJSON(value.maxRest),
      failureRest: toDurationJSON(value.failureRest),
    };
  },
} as const;
export const EmptyExerciseBlueprint = WeightedExerciseBlueprint.of();

export function restEquals(a: Rest | undefined, b: Rest | undefined): boolean {
  if (!a || !b) return a === b;
  return a.minRest.equals(b.minRest) && a.maxRest.equals(b.maxRest) && a.failureRest.equals(b.failureRest);
}

export function cardioTargetEquals(a: CardioTarget, b: CardioTarget): boolean {
  if (a.type !== b.type) return false;
  if (a.type === 'time' && b.type === 'time') {
    return a.value.equals(b.value);
  }
  if (a.type === 'distance' && b.type === 'distance') {
    return a.value.value.eq(b.value.value) && a.value.unit === b.value.unit;
  }
  return false;
}

function fromCardioTargetJSON(json: CardioTargetJSON): CardioTarget {
  return match(json)
    .returnType<CardioTarget>()
    .with({ type: 'distance' }, (j) => ({
      type: 'distance',
      value: fromDistanceJSON(j.value),
    }))
    .with({ type: 'time' }, (j) => ({
      type: 'time',
      value: fromDurationJSON(j.value),
    }))
    .exhaustive();
}
function toCardioTargetJSON(value: CardioTarget): CardioTargetJSON {
  return match(value)
    .returnType<CardioTargetJSON>()
    .with({ type: 'distance' }, (j) => ({
      type: 'distance',
      value: toDistanceJSON(j.value),
    }))
    .with({ type: 'time' }, (j) => ({
      type: 'time',
      value: toDurationJSON(j.value),
    }))
    .exhaustive();
}

export function fromDistanceJSON(json: DistanceJSON): Distance {
  return {
    value: fromBigNumberJSON(json.value),
    unit: json.unit,
  };
}

export function toDistanceJSON(value: Distance): DistanceJSON {
  return {
    value: toBigNumberJSON(value.value),
    unit: value.unit,
  };
}
