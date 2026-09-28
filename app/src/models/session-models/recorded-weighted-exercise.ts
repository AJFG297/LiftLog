import {
  MovementKey,
  PlannedWarmupSet,
  ProgressionKey,
  RepsTarget,
  Rest,
  WeightedExerciseBlueprint,
  roundWarmupWeight,
  warmupIncrementFor,
} from '@/models/blueprint-models';
import { RecordedExercise } from '@/models/session-models/recorded-exercise';

import {
  PotentialSetJSON,
  RecordedSetJSON,
  RecordedWeightedExerciseJSON,
  fromOffsetDateTimeJSON,
  toOffsetDateTimeJSON,
} from '@/models/storage/versions/latest';
import { Weight, WeightUnit } from '@/models/weight';
import { isRpe, Rpe } from '@/models/session-models/rpe';
import { setKindCounts, SetKind, SetKindRule, SetList } from '@/models/session-models/set-kind';
import { IndexOutOfBoundsError } from '@/utils/index-out-of-bounds';
import { Duration, OffsetDateTime } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { match } from 'ts-pattern';

export type WeightAppliesTo = 'thisSet' | 'uncompletedSets' | 'allSets';

export type { SetKind, SetList, WorkingListKind } from '@/models/session-models/set-kind';

/** A slot's place in the exercise: its list, and its index within that list. */
export interface SetPosition {
  list: SetList;
  index: number;
}

/** A logged slot and where it sits. */
export type LoggedSlot = SetPosition & { slot: PotentialSet };

export class RecordedWeightedExercise {
  readonly type = 'RecordedWeightedExercise';

  /**
   * One slot per planned warm-up, done before the working sets. Rebuilt from the plan at session
   * start rather than carried over (see {@link withWarmupsFromPlan}), and never given an RPE. Every
   * slot here is a warm-up whatever it was built as.
   */
  readonly warmupSets: PotentialSet[];

  constructor(
    readonly blueprint: WeightedExerciseBlueprint,
    /**
     * The working list: every set but the warm-ups. What a set counts towards is its kind's, so
     * aggregates read {@link setsCountingTowards} rather than this list.
     */
    readonly potentialSets: PotentialSet[],
    readonly notes: string | undefined,
    warmupSets: PotentialSet[] = [],
  ) {
    this.warmupSets = warmupSets.every((s) => s.kind === 'warmup')
      ? warmupSets
      : warmupSets.map((s) => s.with({ kind: 'warmup' }));
  }

  static fromJSON(json: RecordedWeightedExerciseJSON): RecordedWeightedExercise {
    return new RecordedWeightedExercise(
      WeightedExerciseBlueprint.fromJSON(json.blueprint),
      json.potentialSets.map((x) => PotentialSet.fromJSON(x)),
      json.notes,
      json.warmupSets.map((x) => PotentialSet.fromJSON(x)),
    );
  }

  /** See {@link MovementKey}. */
  movementKey(): MovementKey {
    return this.blueprint.movementKey();
  }

  /** See {@link ProgressionKey}. */
  progressionKey(): ProgressionKey {
    return this.blueprint.progressionKey();
  }

  /** The performance's own target wins; the blueprint only seeds it when the exercise is created. */
  repsTargetForSet(index: number): RepsTarget {
    return this.potentialSets[index]?.target ?? this.blueprint.repsTargetForSet(index);
  }

  static empty(b: WeightedExerciseBlueprint, unit: WeightUnit): RecordedWeightedExercise {
    return new RecordedWeightedExercise(
      b,
      b.plannedSets.map((s) => PotentialSet.of({ weight: new Weight(0, unit), target: s.reps, kind: s.kind })),
      undefined,
    ).withWarmupsFromPlan(unit);
  }

  /**
   * The warm-up slots rebuilt from the blueprint's plan, against the working sets as they stand -
   * so call it after progression has moved them. Nothing is carried from an earlier session.
   *
   * `fallbackUnit` is the unit used when no working set has one (a fresh exercise at a `nil` weight).
   */
  withWarmupsFromPlan(fallbackUnit: WeightUnit): RecordedWeightedExercise {
    return this.with({
      warmupSets: this.blueprint.warmupSets.map((warmup) => this.warmupSlotFor(warmup, fallbackUnit)),
    });
  }

  /**
   * A fresh slot for one planned warm-up: a percentage of the heaviest working set, or an absolute
   * weight converted into the session's unit, either way rounded to the exercise's increment.
   */
  warmupSlotFor(warmup: PlannedWarmupSet, fallbackUnit: WeightUnit): PotentialSet {
    const heaviest = this.heaviestWorkingWeight;
    const unit = heaviest && heaviest.unit !== 'nil' ? heaviest.unit : fallbackUnit;
    const target = { min: warmup.reps, max: warmup.reps };
    const load = this.tracksResistance ? warmup.load : undefined;
    if (!load) {
      return PotentialSet.of({ weight: new Weight(0, unit), target, kind: 'warmup' });
    }
    const raw =
      load.type === 'percent'
        ? (heaviest ?? new Weight(0, unit)).convertTo(unit).multipliedBy(new BigNumber(load.percent).dividedBy(100))
        : load.weight.convertTo(unit);
    return PotentialSet.of({
      weight: roundWarmupWeight(raw, warmupIncrementFor(this.blueprint, unit)),
      target,
      kind: 'warmup',
    });
  }

  private get heaviestWorkingWeight(): Weight | undefined {
    return this.potentialSets.reduce<Weight | undefined>(
      (max, set) => (!max || set.weight.isGreaterThan(max) ? set.weight : max),
      undefined,
    );
  }

  /** The slot at `position`, or undefined when there is none there. */
  slotAt(position: SetPosition): PotentialSet | undefined {
    return this.listFor(position.list)[position.index];
  }

  private listFor(list: SetList): PotentialSet[] {
    return list === 'warmup' ? this.warmupSets : this.potentialSets;
  }

  /**
   * The earlier performance this one is compared against: the most recent of `candidates` (newest
   * first) with the same progression key, so a changed set scheme never borrows mismatched numbers.
   */
  previousPerformanceIn(candidates: readonly RecordedWeightedExercise[]): RecordedWeightedExercise | undefined {
    const key = this.progressionKey();
    return candidates.find((x) => x.progressionKey() === key);
  }

  /** The plan's percentage for the warm-up at `index`, when it is a share of the working weight. */
  warmupPercentAt(index: number): number | undefined {
    const load = this.blueprint.warmupSets[index]?.load;
    return load?.type === 'percent' ? load.percent : undefined;
  }

  getSet(index: number): PotentialSet {
    const set = this.potentialSets[index];
    if (!set) {
      throw new IndexOutOfBoundsError(index, this.potentialSets);
    }
    return set;
  }

  equals(other: RecordedExercise | undefined) {
    if (!other) {
      return false;
    }
    if (other === this) {
      return true;
    }
    if (other.type !== this.type) {
      return false;
    }

    return (
      this.blueprint.equals(other.blueprint) &&
      this.notes === other.notes &&
      this.potentialSets.length === other.potentialSets.length &&
      this.potentialSets.every((set, index) => {
        const otherSet = other.potentialSets[index];
        return set.equals(otherSet);
      }) &&
      this.warmupSets.length === other.warmupSets.length &&
      this.warmupSets.every((set, index) => set.equals(other.warmupSets[index]))
    );
  }

  with(other: Partial<RecordedWeightedExercise>) {
    return new RecordedWeightedExercise(
      'blueprint' in other ? (other.blueprint ?? this.blueprint) : this.blueprint,
      'potentialSets' in other ? (other.potentialSets ?? this.potentialSets) : this.potentialSets,
      'notes' in other ? other.notes : this.notes,
      'warmupSets' in other ? (other.warmupSets ?? this.warmupSets) : this.warmupSets,
    );
  }

  withNothingCompleted(): RecordedWeightedExercise {
    return this.with({
      notes: undefined,
      potentialSets: this.potentialSets.map((ps) => ps.with({ set: undefined, rpe: undefined })),
      warmupSets: this.warmupSets.map((ps) => ps.with({ set: undefined, rpe: undefined })),
    });
  }

  /** Picking an RPE never logs the set: it can be chosen first and the set tapped afterwards. */
  withRpe(setIndex: number, rpe: Rpe | undefined): RecordedWeightedExercise {
    return this.withSet(setIndex, (s) => s.with({ rpe }));
  }

  /** An RPE only means something alongside reps, so a finished exercise drops it from unlogged sets. */
  withoutUnloggedRpe(): RecordedWeightedExercise {
    if (!this.potentialSets.some((s) => !s.set && s.rpe !== undefined)) {
      return this;
    }
    return this.withAllSets((s) => (s.set ? s : s.with({ rpe: undefined })));
  }

  withCycledRepCount(setIndex: number, time: OffsetDateTime): RecordedWeightedExercise {
    return this.withSet(setIndex, (s) => s.with({ set: cycledSet(s.set, this.repsTargetForSet(setIndex).max, time) }));
  }

  /** The tap on a warm-up: the same cycle as a working set, from its own target down to cleared. */
  withCycledWarmupRepCount(warmupIndex: number, time: OffsetDateTime): RecordedWeightedExercise {
    return this.withSlot({ list: 'warmup', index: warmupIndex }, (s) =>
      s.with({ set: cycledSet(s.set, s.target.max, time) }),
    );
  }

  /** Exact reps for a warm-up, or `undefined` to clear it. */
  withWarmupRepCount(warmupIndex: number, reps: number | undefined, time: OffsetDateTime): RecordedWeightedExercise {
    return this.withSlot({ list: 'warmup', index: warmupIndex }, (s) =>
      s.with({ set: reps === undefined ? undefined : new RecordedSet(reps, time) }),
    );
  }

  /**
   * A warm-up's weight for this session only. The plan is left alone, so the edit never reaches the
   * save-to-plan prompt, and the next session rebuilds the warm-up from the plan.
   */
  withWarmupWeight(warmupIndex: number, weight: Weight): RecordedWeightedExercise {
    return this.withSlot({ list: 'warmup', index: warmupIndex }, (s) => s.with({ weight }));
  }

  withAllWarmupSets(reducer: (s: PotentialSet) => PotentialSet): RecordedWeightedExercise {
    return this.with({ warmupSets: this.warmupSets.map(reducer) });
  }

  withRepCount(setIndex: number, reps: number | undefined, time: OffsetDateTime): RecordedWeightedExercise {
    return this.withSet(setIndex, (s) =>
      s.with({
        set: reps === undefined ? undefined : new RecordedSet(reps, time),
      }),
    );
  }

  withSet(setIndex: number, reducer: (s: PotentialSet) => PotentialSet) {
    return this.withSlot({ list: 'working', index: setIndex }, reducer);
  }

  private withSlot({ list, index }: SetPosition, reducer: (s: PotentialSet) => PotentialSet): RecordedWeightedExercise {
    const slots = this.listFor(list);
    const existingSet = slots[index];
    if (!existingSet) {
      throw new IndexOutOfBoundsError(index, slots);
    }
    const updated = slots.with(index, reducer(existingSet));
    return this.with(list === 'warmup' ? { warmupSets: updated } : { potentialSets: updated });
  }

  withAllSets(reducer: (s: PotentialSet) => PotentialSet) {
    return this.with({
      potentialSets: this.potentialSets.map(reducer),
    });
  }

  withWeight(setIndex: number, weight: Weight, applyTo: WeightAppliesTo) {
    return match(applyTo)
      .with('thisSet', () => this.withSet(setIndex, (s) => s.with({ weight })))
      .with('uncompletedSets', () => this.withAllSets((s) => s.with({ weight: s.set ? s.weight : weight })))
      .with('allSets', () => this.withAllSets((s) => s.with({ weight })))
      .exhaustive()
      .withPercentWarmupsFollowing(this, weight.unit);
  }

  /**
   * Unlogged percentage warm-ups follow the working weight as it changes during the workout - on an
   * exercise's first session it starts at zero, so they would otherwise stay at zero. A warm-up whose
   * weight no longer matches what the plan made of `before` was given one of its own, and keeps it.
   */
  private withPercentWarmupsFollowing(before: RecordedWeightedExercise, fallbackUnit: WeightUnit) {
    return this.with({
      warmupSets: this.warmupSets.map((slot, index) => {
        const planned = this.blueprint.warmupSets[index];
        if (slot.set || planned?.load?.type !== 'percent') {
          return slot;
        }
        if (!slot.weight.equals(before.warmupSlotFor(planned, fallbackUnit).weight)) {
          return slot;
        }
        return slot.with({ weight: this.warmupSlotFor(planned, fallbackUnit).weight });
      }),
    });
  }

  toJSON(): RecordedWeightedExerciseJSON {
    return {
      type: 'RecordedWeightedExercise',
      blueprint: this.blueprint.toJSON(),
      potentialSets: this.potentialSets.map((x) => x.toJSON()),
      warmupSets: this.warmupSets.map((x) => x.toJSON()),
      notes: this.notes,
    };
  }

  /** False for a movement that tracks no load, so nothing sums a volume or computes a 1RM for it. */
  get tracksResistance(): boolean {
    return this.blueprint.resistance !== 'none';
  }

  /**
   * The load actually moved for a set: the stored weight for a plain exercise, or the
   * bodyweight plus the stored (added/assisted) weight for a bodyweight exercise. When the
   * session bodyweight is unknown the bodyweight contribution is treated as zero.
   */
  effectiveWeight(set: PotentialSet, bodyweight: Weight | undefined): Weight {
    if (!this.tracksResistance) {
      return Weight.NIL;
    }
    return this.blueprint.resistance === 'bodyweight' ? (bodyweight ?? Weight.NIL).plus(set.weight) : set.weight;
  }

  get maxWeight(): Weight {
    return this.heaviestWorkingWeight ?? new Weight(0, 'kilograms');
  }

  maxWeightWith(bodyweight: Weight | undefined): Weight {
    return (
      this.potentialSets.reduce(
        (max, set) => {
          const weight = this.effectiveWeight(set, bodyweight);
          return !max || weight.isGreaterThan(max) ? weight : max;
        },
        undefined as Weight | undefined,
      ) ?? new Weight(0, 'kilograms')
    );
  }

  get totalWeightLifted(): Weight {
    return this.totalWeightLiftedWith(undefined);
  }

  totalWeightLiftedWith(bodyweight: Weight | undefined): Weight {
    return this.setsCountingTowards('countsTowardsVolume').reduce(
      (accum, set) => accum.plus(this.effectiveWeight(set, bodyweight).multipliedBy(set.set?.repsCompleted ?? 0)),
      Weight.NIL,
    );
  }

  /**
   * Started once a working set is logged. A warm-up alone doesn't count, so everything that measures
   * the lift - stats, records, history, the performance the next session carries on from - gets that
   * for free. Timing asks {@link hasLoggedAnySet} instead.
   */
  get isStarted() {
    return this.potentialSets.some((x) => x.set !== undefined);
  }

  /** Whether any set is logged, a warm-up included: the workout is under way, and rest is owed. */
  get hasLoggedAnySet(): boolean {
    return this.isStarted || this.warmupSets.some((x) => x.set !== undefined);
  }

  get hasLoggedRpe(): boolean {
    return this.potentialSets.some((x) => x.loggedRpe !== undefined);
  }

  /** The most recently logged slot across warm-ups and working sets. */
  get lastLoggedSlot(): LoggedSlot | undefined {
    return this.loggedSlotWhere(isAfter);
  }

  /** The logged slot, across both lists, that beats every other by `beats`. A warm-up wins a tie. */
  private loggedSlotWhere(beats: (a: PotentialSet, b: PotentialSet) => boolean): LoggedSlot | undefined {
    const warmupIndex = loggedIndexWhere(this.warmupSets, beats);
    const workingIndex = loggedIndexWhere(this.potentialSets, beats);
    const warmup = this.warmupSets[warmupIndex];
    const working = this.potentialSets[workingIndex];
    if (working && (!warmup || beats(working, warmup))) {
      return { list: 'working', index: workingIndex, slot: working };
    }
    return warmup && { list: 'warmup', index: warmupIndex, slot: warmup };
  }

  /**
   * Whether the latest logged set fell short of its target, which earns the longer failure rest. A
   * warm-up never does: short warm-ups are not failures.
   */
  get lastSetMissedTarget(): boolean {
    const last = this.lastLoggedSlot;
    return last?.list === 'working' && last.slot.set!.repsCompleted < this.repsTargetForSet(last.index).min;
  }

  /**
   * The rest window owed after the latest logged set. A warm-up only earns the minimum rest - its
   * maximum is pulled down to match - and never the failure rest, however short it fell.
   */
  get restAfterLastSet(): Rest {
    const rest = this.blueprint.restBetweenSets;
    return this.lastLoggedSlot?.list === 'warmup' ? { ...rest, maxRest: rest.minRest } : rest;
  }

  /** The most recently logged working set; a warm-up done after the working sets never moves it. */
  get lastLoggedWorkingSet(): PotentialSet | undefined {
    return this.potentialSets[loggedIndexWhere(this.potentialSets, isAfter)];
  }

  /** The first unlogged working set, ignoring warm-ups. See {@link currentSet} for the full order. */
  get currentSetIndex() {
    return this.potentialSets.findIndex((x) => !x.set);
  }

  /**
   * The set to do next. Warm-ups come first, but only until the working sets begin: once one is
   * logged, a skipped warm-up is left behind rather than asked for again. Undefined once every
   * working set is logged.
   */
  get currentSet(): SetPosition | undefined {
    const workingStarted = this.potentialSets.some((x) => x.set);
    const warmupIndex = workingStarted ? -1 : this.warmupSets.findIndex((x) => !x.set);
    if (warmupIndex >= 0) {
      return { list: 'warmup', index: warmupIndex };
    }
    const workingIndex = this.currentSetIndex;
    return workingIndex >= 0 ? { list: 'working', index: workingIndex } : undefined;
  }

  /** From the first set to the last, warm-ups included. */
  get duration(): Duration | undefined {
    const { firstActivityTime, lastActivityTime } = this;
    return firstActivityTime && lastActivityTime ? Duration.between(firstActivityTime, lastActivityTime) : undefined;
  }

  /** When the last working set was logged: what orders performances for history and carry-over. */
  get latestTime(): OffsetDateTime | undefined {
    return this.lastLoggedWorkingSet?.set!.completionDateTime;
  }

  /** When the first working set was logged. */
  get earliestTime(): OffsetDateTime | undefined {
    return this.potentialSets[loggedIndexWhere(this.potentialSets, isBefore)]?.set!.completionDateTime;
  }

  /** When the last set was logged, warm-ups included: timing (rest, duration, Health) reads it. */
  get lastActivityTime(): OffsetDateTime | undefined {
    return this.lastLoggedSlot?.slot.set!.completionDateTime;
  }

  /** When the first set was logged, warm-ups included. */
  get firstActivityTime(): OffsetDateTime | undefined {
    return this.loggedSlotWhere(isBefore)?.slot.set!.completionDateTime;
  }

  /** Complete once every working set is logged; a skipped warm-up never holds an exercise open. */
  get isComplete(): boolean {
    return !this.potentialSets.some((x) => x.set === undefined);
  }

  /** The sets, warm-ups included, whose kind counts towards `rule`, in order. */
  setsCountingTowards(rule: SetKindRule): PotentialSet[] {
    return [...this.warmupSets, ...this.potentialSets].filter((set) => setKindCounts(set.kind, rule));
  }

  /** Indexes into the working list of the sets whose kind counts towards `rule`. */
  workingIndicesCountingTowards(rule: SetKindRule): number[] {
    return this.potentialSets.flatMap((set, index) => (setKindCounts(set.kind, rule) ? [index] : []));
  }

  /**
   * A success once every set the progression check reads met the top of its target. A drop or myo set
   * short of its reps never holds the lift back.
   */
  get isSuccessForProgressiveOverload(): boolean {
    return this.workingIndicesCountingTowards('countsTowardsProgression').every((index) => {
      const set = this.potentialSets[index]!.set;
      return set && set.repsCompleted >= this.repsTargetForSet(index).max;
    });
  }
}

/**
 * The index of the logged slot that beats every other logged slot by `beats`, or -1 when none is
 * logged. A plain loop: the time getters run over the whole history on load and for stats.
 */
function loggedIndexWhere(slots: PotentialSet[], beats: (a: PotentialSet, b: PotentialSet) => boolean): number {
  let best = -1;
  for (let index = 0; index < slots.length; index++) {
    if (slots[index]!.set && (best < 0 || beats(slots[index]!, slots[best]!))) {
      best = index;
    }
  }
  return best;
}

function isAfter(a: PotentialSet, b: PotentialSet): boolean {
  return a.set!.completionDateTime.isAfter(b.set!.completionDateTime);
}

function isBefore(a: PotentialSet, b: PotentialSet): boolean {
  return a.set!.completionDateTime.isBefore(b.set!.completionDateTime);
}

function cycledSet(set: RecordedSet | undefined, targetMax: number, time: OffsetDateTime): RecordedSet | undefined {
  return match(set)
    .returnType<RecordedSet | undefined>()
    .with(undefined, () => new RecordedSet(targetMax, time))
    .with({ repsCompleted: 0 }, () => undefined)
    .otherwise((x) => x.with({ repsCompleted: x.repsCompleted - 1 }));
}

export class RecordedSet {
  constructor(
    readonly repsCompleted: number,
    readonly completionDateTime: OffsetDateTime,
  ) {}

  /** Build a recorded set from named fields. See {@link PotentialSet.of}. */
  static of(init: { repsCompleted: number; completionDateTime: OffsetDateTime }): RecordedSet {
    return new RecordedSet(init.repsCompleted, init.completionDateTime);
  }

  static fromJSON(json: RecordedSetJSON): RecordedSet {
    return new RecordedSet(json.repsCompleted, fromOffsetDateTimeJSON(json.completionDateTime));
  }

  equals(other: RecordedSet | undefined): boolean {
    if (!other) {
      return false;
    }
    if (other === this) {
      return true;
    }
    return this.repsCompleted === other.repsCompleted && this.completionDateTime.equals(other.completionDateTime);
  }

  with(other: Partial<RecordedSet>): RecordedSet {
    return new RecordedSet(
      'repsCompleted' in other ? other.repsCompleted! : this.repsCompleted,
      'completionDateTime' in other ? other.completionDateTime! : this.completionDateTime,
    );
  }

  toJSON(): RecordedSetJSON {
    return {
      repsCompleted: this.repsCompleted,
      completionDateTime: toOffsetDateTimeJSON(this.completionDateTime),
    };
  }
}

export class PotentialSet {
  readonly type = 'PotentialSet';
  constructor(
    readonly set: RecordedSet | undefined,
    readonly weight: Weight,
    /** The target this set is chasing, carried on the performance rather than re-read from the plan. */
    readonly target: RepsTarget = { min: 0, max: 0 },
    /**
     * How hard the set felt. On the slot rather than the {@link RecordedSet} so it can be picked before
     * the set is logged, and so changing the reps (which rebuilds the recorded set) keeps it.
     */
    readonly rpe?: Rpe,
    /** Always `warmup` for a slot in `warmupSets`: the exercise makes it so. */
    readonly kind: SetKind = 'working',
  ) {}

  /** Build a set from named fields; preferred over the constructor, which leads with the absent one. */
  static of(init: {
    set?: RecordedSet | undefined;
    weight: Weight;
    target?: RepsTarget;
    rpe?: Rpe | undefined;
    kind?: SetKind;
  }): PotentialSet {
    return new PotentialSet(init.set, init.weight, init.target, init.rpe, init.kind);
  }

  static fromJSON(json: PotentialSetJSON): PotentialSet {
    return new PotentialSet(
      json.set ? RecordedSet.fromJSON(json.set) : undefined,
      Weight.fromJSON(json.weight),
      {
        min: json.target.reps.min,
        max: json.target.reps.max,
      },
      isRpe(json.rpe) ? json.rpe : undefined,
      json.kind,
    );
  }

  /** The RPE to show anywhere but the live workout: one left on a set that was never logged means nothing. */
  get loggedRpe(): Rpe | undefined {
    return this.set ? this.rpe : undefined;
  }

  equals(other: PotentialSet | undefined): boolean {
    if (!other) {
      return false;
    }
    if (other === this) {
      return true;
    }
    return (
      (this.set?.equals(other.set) ?? other.set === undefined) &&
      this.weight.equals(other.weight) &&
      this.target.min === other.target.min &&
      this.target.max === other.target.max &&
      this.rpe === other.rpe &&
      this.kind === other.kind
    );
  }

  with(other: Partial<PotentialSet>): PotentialSet {
    return new PotentialSet(
      'set' in other ? other.set : this.set,
      'weight' in other ? other.weight! : this.weight,
      other.target ?? this.target,
      'rpe' in other ? other.rpe : this.rpe,
      other.kind ?? this.kind,
    );
  }

  toJSON(): PotentialSetJSON {
    return {
      target: { reps: { min: this.target.min, max: this.target.max } },
      kind: this.kind,
      set: this.set?.toJSON(),
      weight: this.weight.toJSON(),
      rpe: this.rpe,
    };
  }
}
