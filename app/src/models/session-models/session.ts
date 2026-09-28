import {
  CardioExerciseBlueprint,
  ExerciseBlueprint,
  plannedWarmupSetEqual,
  PlannedWarmupSet,
  repsTargetsEqual,
  SessionBlueprint,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { TemporalComparer } from '@/models/comparers';
import { SessionJSON, fromLocalDateJSON, toLocalDateJSON } from '@/models/storage/versions/latest';
import { Weight, WeightUnit } from '@/models/weight';
import { indexed } from '@/utils/enumerable';
import { Duration, LocalDate, OffsetDateTime } from '@js-joda/core';
import { match } from 'ts-pattern';
import Enumerable from 'linq';
import { P } from 'ts-pattern';
import { uuid } from '@/utils/uuid';
import { equal } from '@/models/session-models/helpers';
import { RecordedCardioExercise, RecordedCardioExerciseSet } from '@/models/session-models/recorded-cardio-exercise';
import {
  RecordedExercise,
  createEmptyRecordedExercise,
  fromRecordedExerciseJSON,
} from '@/models/session-models/recorded-exercise';
import { PotentialSet, RecordedWeightedExercise } from '@/models/session-models/recorded-weighted-exercise';
import { RestTimer } from '@/models/session-models/rest-timer';
import { IndexOutOfBoundsError } from '@/utils/index-out-of-bounds';

export class Session {
  constructor(
    readonly id: string,
    readonly blueprint: SessionBlueprint,
    readonly recordedExercises: RecordedExercise[],
    readonly date: LocalDate,
    readonly bodyweight: Weight | undefined,
    readonly restTimer: RestTimer | undefined,
  ) {}
  get duration(): Duration | undefined {
    const { startTime, endTime } = this;
    return startTime && endTime ? Duration.between(startTime, endTime) : undefined;
  }

  /**
   * When the first set of the workout was logged, warm-ups included. Taken across every exercise's
   * earliest set: in a superset, or with a warm-up done early, the exercise that finished first need
   * not hold it.
   */
  get startTime(): OffsetDateTime | undefined {
    return this.recordedExercises.reduce<OffsetDateTime | undefined>((earliest, exercise) => {
      const time = exercise.firstActivityTime;
      return time && (!earliest || time.isBefore(earliest)) ? time : earliest;
    }, undefined);
  }

  /** When the last set of the workout was logged, warm-ups included. */
  get endTime(): OffsetDateTime | undefined {
    return this.lastExercise?.lastActivityTime;
  }

  static fromJSON(json: SessionJSON): Session {
    return new Session(
      json.id,
      SessionBlueprint.fromJSON({
        ...json.blueprint,
        version: 8,
        exercises: json.recordedExercises.map((x) => x.blueprint),
      }),
      json.recordedExercises.map(fromRecordedExerciseJSON),
      fromLocalDateJSON(json.date),
      json.bodyweight ? Weight.fromJSON(json.bodyweight) : undefined,
      undefined,
    );
  }

  static getEmptySession(blueprint: SessionBlueprint, defaultWeightUnit: WeightUnit): Session {
    function getNextExercise(e: ExerciseBlueprint) {
      return match(e)
        .with(P.instanceOf(WeightedExerciseBlueprint), (we) => RecordedWeightedExercise.empty(we, defaultWeightUnit))
        .with(P.instanceOf(CardioExerciseBlueprint), (ce) => RecordedCardioExercise.empty(ce))
        .exhaustive();
    }
    return new Session(
      uuid(),
      blueprint,
      blueprint.exercises.map(getNextExercise),
      LocalDate.now(),
      undefined,
      undefined,
    );
  }

  equals(other: Session | undefined): boolean {
    if (!other) {
      return false;
    }

    return (
      this.id === other.id &&
      this.date.equals(other.date) &&
      equal(this.bodyweight, other.bodyweight) &&
      this.blueprint.equals(other.blueprint) &&
      this.recordedExercises.length === other.recordedExercises.length &&
      this.recordedExercises.every((exercise, index) => exercise.equals(other.recordedExercises[index]))
    );
  }

  with(other: Partial<Session>) {
    return new Session(
      'id' in other ? (other.id ?? this.id) : this.id,
      'blueprint' in other ? (other.blueprint ?? this.blueprint) : this.blueprint,
      'recordedExercises' in other ? (other.recordedExercises ?? this.recordedExercises) : this.recordedExercises,
      'date' in other ? (other.date ?? this.date) : this.date,
      'bodyweight' in other ? other.bodyweight : this.bodyweight,
      'restTimer' in other ? other.restTimer : this.restTimer,
    );
  }

  withEditedExercise(exerciseIndex: number, newBlueprint: ExerciseBlueprint, useImperialUnits: boolean): Session {
    // oxlint-disable-next-line typescript/no-this-alias
    let session: Session = this;
    const existingExercise = session.recordedExercises[exerciseIndex];
    if (!existingExercise) {
      throw new IndexOutOfBoundsError(exerciseIndex, session.recordedExercises);
    }

    session = session.with({
      blueprint: session.blueprint.with({
        exercises: session.blueprint.exercises.with(exerciseIndex, newBlueprint),
      }),
    });
    if (existingExercise.blueprint.type !== newBlueprint.type) {
      session = session.withExercise(
        exerciseIndex,
        createEmptyRecordedExercise(newBlueprint, useImperialUnits ? 'pounds' : 'kilograms'),
      );
    } else {
      const weightedExistingExercise =
        session.recordedExercises[exerciseIndex]!.type === 'RecordedWeightedExercise'
          ? session.recordedExercises[exerciseIndex]
          : undefined;
      if (weightedExistingExercise) {
        session = session.withExercise(
          exerciseIndex,
          weightedExistingExercise.with({
            blueprint: newBlueprint as WeightedExerciseBlueprint,
            // A set you already logged was chasing the target it was chasing, so only unrecorded
            // sets take the edited blueprint's targets and kinds - and only where the edit actually
            // moved them. A carried target can sit above what the plan asks for, and changing the
            // notes is not a request to hand that back.
            potentialSets: (newBlueprint as WeightedExerciseBlueprint).plannedSets.map((planned, index) => {
              const existing = weightedExistingExercise.potentialSets.at(index);
              if (!existing) {
                return PotentialSet.of({
                  weight: weightedExistingExercise.maxWeight,
                  target: planned.reps,
                  kind: planned.kind,
                });
              }
              const targetMoved = !repsTargetsEqual(
                planned.reps,
                weightedExistingExercise.blueprint.repsTargetForSet(index),
              );
              const kindMoved = planned.kind !== weightedExistingExercise.blueprint.plannedSets[index]?.kind;
              if (existing.set || (!targetMoved && !kindMoved)) {
                return existing;
              }
              return existing.with({
                ...(targetMoved ? { target: planned.reps } : {}),
                ...(kindMoved ? { kind: planned.kind } : {}),
              });
            }),
          }),
        );
        session = session.withExercise(
          exerciseIndex,
          withWarmupsForEditedPlan(
            session.recordedExercises[exerciseIndex] as RecordedWeightedExercise,
            weightedExistingExercise.blueprint,
            useImperialUnits ? 'pounds' : 'kilograms',
          ),
        );
      }

      const cardioExistingExercise =
        session.recordedExercises[exerciseIndex]!.type === 'RecordedCardioExercise'
          ? session.recordedExercises[exerciseIndex]
          : undefined;

      if (cardioExistingExercise) {
        session = session.withExercise(
          exerciseIndex,
          cardioExistingExercise.with({
            blueprint: newBlueprint as CardioExerciseBlueprint,
            sets: (newBlueprint as CardioExerciseBlueprint).sets.map((set, i) =>
              RecordedCardioExerciseSet.empty(set).with({
                // Basically allows us to use values from set, even if there are more sets now and it would be undefined
                // oxlint-disable-next-line typescript/no-misused-spread
                ...cardioExistingExercise.sets[i],
                blueprint: set,
              }),
            ),
          }),
        );
      }
    }
    return session;
  }

  withAddedExercise(exercise: ExerciseBlueprint, useImperialUnits: boolean): Session {
    return this.with({
      blueprint: this.blueprint.with({
        exercises: this.blueprint.exercises.concat(exercise),
      }),
      recordedExercises: this.recordedExercises.concat(
        createEmptyRecordedExercise(exercise, useImperialUnits ? 'pounds' : 'kilograms'),
      ),
    });
  }

  withUpdatedDate(date: LocalDate): Session {
    const originalDate = this.date;
    const newDate = date;

    // Gather all unique, non-null completion dates from all sets
    const allCompletionDates = this.recordedExercises
      .flatMap((re) =>
        re.type === 'RecordedWeightedExercise'
          ? [...re.warmupSets, ...re.potentialSets].map((ps) => ps.set?.completionDateTime?.toLocalDate())
          : re.sets.map((s) => s.completionDateTime?.toLocalDate()),
      )
      .filter((d): d is LocalDate => d !== undefined);

    // If all sets have the same completion date, use absolute date
    const useAbsoluteDate =
      allCompletionDates.length > 0 && new Set(allCompletionDates.map((d) => d.toString())).size === 1;

    function getAdjustedDate(setDate: LocalDate): LocalDate {
      if (useAbsoluteDate) {
        return newDate;
      }
      // Maintain relative offset if sets cross midnight
      const dayOffset = setDate.toEpochDay() - originalDate.toEpochDay();
      return newDate.plusDays(dayOffset);
    }

    // Update all sets' completionDateTime
    const newExercises = this.recordedExercises.map((re) => {
      if (re.type === 'RecordedWeightedExercise') {
        const moved = (ps: PotentialSet) => {
          if (ps.set && ps.set.completionDateTime) {
            const setDate = ps.set.completionDateTime.toLocalDate();
            return ps.with({
              set: ps.set.with({
                completionDateTime: ps.set.completionDateTime
                  .toLocalTime()
                  .atDate(getAdjustedDate(setDate))
                  .atOffset(ps.set.completionDateTime.offset()),
              }),
            });
          }
          return ps;
        };
        return re.withAllSets(moved).withAllWarmupSets(moved);
      } else {
        return re.withAllSets((set) => {
          if (set && set.completionDateTime) {
            const setDate = set.completionDateTime.toLocalDate();
            return set.with({
              completionDateTime: set.completionDateTime
                .toLocalTime()
                .atDate(getAdjustedDate(setDate))
                .atOffset(set.completionDateTime.offset()),
            });
          }
          return set;
        });
      }
    });

    return this.with({
      recordedExercises: newExercises,
      date,
    });
  }

  withNothingCompleted(): Session {
    return this.with({
      recordedExercises: this.recordedExercises.map((re) => re.withNothingCompleted()),
    });
  }

  /** See {@link RecordedWeightedExercise.withoutUnloggedRpe}. Returns `this` when there is nothing to drop. */
  withoutUnloggedRpe(): Session {
    const recordedExercises = this.recordedExercises.map((re) =>
      re.type === 'RecordedWeightedExercise' ? re.withoutUnloggedRpe() : re,
    );
    if (recordedExercises.every((re, index) => re === this.recordedExercises[index])) {
      return this;
    }
    return this.with({ recordedExercises });
  }

  // TODO we should update the rest timer time when we call this
  withCycledExerciseReps(exerciseIndex: number, setIndex: number, time: OffsetDateTime): Session {
    const weightedRecorded = this.recordedExercises[exerciseIndex];
    if (!weightedRecorded) {
      throw new IndexOutOfBoundsError(exerciseIndex, this.recordedExercises);
    }
    if (weightedRecorded.type !== 'RecordedWeightedExercise') {
      return this;
    }
    let newDate = this.date;
    if (!this.hasLoggedAnySet) {
      newDate = time.toLocalDate();
    }
    return this.with({
      date: newDate,
      recordedExercises: this.recordedExercises.with(
        exerciseIndex,
        weightedRecorded.withCycledRepCount(setIndex, time),
      ),
    });
  }

  withExercise(exerciseIndex: number, exercise: RecordedExercise): Session {
    return this.with({
      recordedExercises: this.recordedExercises.with(exerciseIndex, exercise),
      blueprint: this.blueprint.with({
        exercises: this.blueprint.exercises.with(exerciseIndex, exercise.blueprint),
      }),
    });
  }

  withRemovedExercise(exerciseIndex: number): Session {
    return this.with({
      recordedExercises: this.recordedExercises.filter((_, index) => index !== exerciseIndex),
      blueprint: this.blueprint.with({
        exercises: this.blueprint.exercises.filter((_, index) => index !== exerciseIndex),
      }),
    });
  }

  toJSON(): SessionJSON {
    return {
      version: 10,
      blueprint: this.blueprint.toJSON(),
      bodyweight: this.bodyweight?.toJSON(),
      date: toLocalDateJSON(this.date),
      id: this.id,
      recordedExercises: this.recordedExercises.map((x) => x.toJSON()),
    };
  }

  static freeformSession(date: LocalDate, bodyweight: Weight | undefined): Session {
    return EmptySession.with({
      id: uuid(),
      date: date,
      bodyweight,
      blueprint: EmptySession.blueprint.with({ name: 'Freeform Workout' }),
    });
  }

  withName(name: string): Session {
    return this.with({ blueprint: this.blueprint.with({ name }) });
  }

  get totalWeightLifted(): Weight {
    return this.recordedExercises.reduce(
      (b, ex) =>
        b.plus(ex instanceof RecordedWeightedExercise ? ex.totalWeightLiftedWith(this.bodyweight) : Weight.NIL),
      Weight.NIL,
    );
  }

  get isComplete() {
    return this.recordedExercises.every((x) => x.isComplete);
  }

  /**
   * Whether anything that counts was logged. A session where only warm-ups got done isn't a training
   * day, so the calendar, its intensity and the streak leave it out.
   */
  get isStarted(): boolean {
    return this.recordedExercises.some((x) => x.isStarted);
  }

  /** Whether any set is logged, a warm-up included: the workout is under way. */
  get hasLoggedAnySet(): boolean {
    return this.recordedExercises.some((x) => x.hasLoggedAnySet);
  }

  get runningCardioSet():
    | { exerciseIndex: number; setIndex: number; exercise: RecordedCardioExercise; set: RecordedCardioExerciseSet }
    | undefined {
    for (const [exerciseIndex, exercise] of this.recordedExercises.entries()) {
      if (!(exercise instanceof RecordedCardioExercise)) {
        continue;
      }
      const setIndex = exercise.sets.findIndex((set) => set.isTimerRunning);
      const set = exercise.sets[setIndex];
      if (set) {
        return { exerciseIndex, setIndex, exercise, set };
      }
    }
    return undefined;
  }

  cardioSetAt(exerciseIndex: number, setIndex: number): RecordedCardioExerciseSet | undefined {
    const exercise = this.recordedExercises[exerciseIndex];
    return exercise instanceof RecordedCardioExercise ? exercise.sets[setIndex] : undefined;
  }

  withCardioSet(
    exerciseIndex: number,
    setIndex: number,
    update: (set: RecordedCardioExerciseSet) => RecordedCardioExerciseSet,
    now: OffsetDateTime,
  ): Session {
    const exercise = this.recordedExercises[exerciseIndex];
    if (!(exercise instanceof RecordedCardioExercise)) {
      return this;
    }
    return this.withExercise(
      exerciseIndex,
      exercise.withSet(setIndex, (set) => update(set).withCompletionTimeIfCompleted(now)),
    );
  }

  /** Only one cardio clock runs at a time, so whatever another set had going is banked first. */
  withCardioTimerStarted(exerciseIndex: number, setIndex: number, now: OffsetDateTime): Session {
    const running = this.runningCardioSet;
    const banked = running
      ? this.withExercise(
          running.exerciseIndex,
          running.exercise.withAllSets((set) =>
            set.isTimerRunning ? set.withTimerStopped(now).withCompletionTimeIfCompleted(now) : set,
          ),
        )
      : this;

    const exercise = banked.recordedExercises[exerciseIndex];
    if (!(exercise instanceof RecordedCardioExercise)) {
      return banked;
    }
    return banked.withExercise(
      exerciseIndex,
      exercise.withSet(setIndex, (set) => set.withTimerStarted(now)),
    );
  }

  get nextExercise(): RecordedExercise | undefined {
    const recordedExercises = this.recordedExercises;
    const cardioExerciseWithRunningTimer = this.runningCardioSet?.exercise;
    if (cardioExerciseWithRunningTimer) {
      return cardioExerciseWithRunningTimer;
    }
    const latestExerciseIndex = Enumerable.from(recordedExercises)
      .select(indexed)
      .where((x) => x.item.hasLoggedAnySet)
      .orderByDescending(({ item }) => item.lastActivityTime, TemporalComparer)
      .select((x) => x.index)
      .firstOrDefault(-1);

    const latestExerciseSupersetsWithNext = match(latestExerciseIndex)
      .with(-1, () => false)
      .with(recordedExercises.length - 1, () => false) // can never superset with next if its the last exercise
      .otherwise(
        (i) =>
          recordedExercises[i] instanceof RecordedWeightedExercise && recordedExercises[i].blueprint.supersetWithNext,
      );

    const latestExerciseSupersetsWithPrevious = match(latestExerciseIndex)
      .with(P.union(-1, 0), () => false)
      .otherwise((i) => {
        const prevIndex = i - 1;
        return (
          recordedExercises[prevIndex] instanceof RecordedWeightedExercise &&
          recordedExercises[prevIndex].blueprint.supersetWithNext
        );
      });

    if (latestExerciseSupersetsWithNext && !recordedExercises[latestExerciseIndex + 1]?.isComplete) {
      return recordedExercises[latestExerciseIndex + 1];
    }

    // loop back to the original exercise in the case of a superset chain
    if (latestExerciseSupersetsWithPrevious) {
      let indexToJumpBackTo = latestExerciseIndex - 1;
      while (
        indexToJumpBackTo >= 0 &&
        recordedExercises[indexToJumpBackTo] instanceof RecordedWeightedExercise &&
        (recordedExercises[indexToJumpBackTo]!.blueprint as WeightedExerciseBlueprint).supersetWithNext
      ) {
        indexToJumpBackTo--;
      }
      // We are now at an exercise which is not supersetting with the next,
      // so jump forward to the next exercise
      indexToJumpBackTo++;
      // Now jump to the first exercise which has remaining sets in the chain
      while (indexToJumpBackTo < recordedExercises.length && recordedExercises[indexToJumpBackTo]!.isComplete) {
        indexToJumpBackTo++;
      }

      if (indexToJumpBackTo < recordedExercises.length) {
        return recordedExercises[indexToJumpBackTo];
      }
    }

    let result: RecordedExercise | undefined = undefined;
    let maxEpochSecond = Number.MIN_VALUE;

    for (const recordedExercise of recordedExercises) {
      if (!recordedExercise.isComplete) {
        const latestTime = recordedExercise.lastActivityTime;
        const epochSecond = latestTime?.toEpochSecond() ?? Number.MIN_VALUE;

        if (epochSecond > maxEpochSecond || !result) {
          maxEpochSecond = epochSecond;
          result = recordedExercise;
        }
      }
    }
    return result;
  }

  get restTimerEndTime(): OffsetDateTime | undefined {
    if (!this.restTimer || this.restTimer.isPaused) {
      return undefined;
    }
    const exercise = this.lastExercise;
    if (this.nextExercise && exercise && exercise.lastActivityTime && exercise instanceof RecordedWeightedExercise) {
      const { minRest, failureRest } = exercise.blueprint.restBetweenSets;
      const rest = exercise.lastSetMissedTarget ? failureRest : minRest;

      if (rest.equals(Duration.ZERO)) {
        return undefined;
      }
      return this.restTimer.startedAt.plus(rest);
    }
  }

  /** The exercise with the latest set, warm-ups included: the one rest and the workout's end follow. */
  get lastExercise(): RecordedExercise | undefined {
    return Enumerable.from(this.recordedExercises)
      .where((x) => x.hasLoggedAnySet)
      .defaultIfEmpty(undefined)
      .maxBy((x) => x.lastActivityTime?.toInstant().toEpochMilli());
  }

  get latestWeightedExercise(): RecordedWeightedExercise | undefined {
    return Enumerable.from(this.recordedExercises)
      .where((x) => x.isStarted)
      .where((x) => x instanceof RecordedWeightedExercise)
      .defaultIfEmpty(undefined)
      .maxBy((x) => x.latestTime?.toInstant().toEpochMilli());
  }

  get isFreeform(): boolean {
    return this.blueprint.name === 'Freeform Workout';
  }
}

/**
 * The warm-up slots after an in-workout edit to the plan. Each new warm-up is lined up with the one
 * it was before the edit (see {@link alignWarmupPlans}), so removing an earlier warm-up doesn't hand
 * its slot to the next one. A warm-up the edit left alone keeps its slot, logged reps and any
 * session-only weight change included; a changed one keeps its slot only if it was already logged;
 * an added one gets a fresh slot from the new plan.
 */
function withWarmupsForEditedPlan(
  exercise: RecordedWeightedExercise,
  blueprintBefore: WeightedExerciseBlueprint,
  fallbackUnit: WeightUnit,
): RecordedWeightedExercise {
  const planned = exercise.blueprint.warmupSets;
  const before = alignWarmupPlans(blueprintBefore.warmupSets, planned);
  return exercise.with({
    warmupSets: planned.map((warmup, index) => {
      const beforeIndex = before[index];
      if (beforeIndex !== undefined) {
        const existing = exercise.warmupSets[beforeIndex];
        const plannedBefore = blueprintBefore.warmupSets[beforeIndex];
        if (existing && (existing.set || (plannedBefore && plannedWarmupSetEqual(warmup, plannedBefore)))) {
          return existing;
        }
      }
      return exercise.warmupSlotFor(warmup, fallbackUnit);
    }),
  });
}

/**
 * For each warm-up in `after`, the index it had in `before`, or undefined for one the edit added. The
 * longest run of warm-ups left unchanged anchors the match; between two anchors, warm-ups pair up in
 * order as edits of each other, and whatever is left over on either side was added or removed.
 */
function alignWarmupPlans(before: PlannedWarmupSet[], after: PlannedWarmupSet[]): (number | undefined)[] {
  // lcs[i][j]: the longest common run of before[i..] and after[j..].
  const lcs = Array.from({ length: before.length + 1 }, () => Array.from({ length: after.length + 1 }, () => 0));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lcs[i]![j] = plannedWarmupSetEqual(before[i]!, after[j]!)
        ? lcs[i + 1]![j + 1]! + 1
        : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const anchors: [number, number][] = [];
  for (let i = 0, j = 0; i < before.length && j < after.length; ) {
    if (plannedWarmupSetEqual(before[i]!, after[j]!)) {
      anchors.push([i++, j++]);
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      i++;
    } else {
      j++;
    }
  }
  anchors.push([before.length, after.length]);

  const result = Array.from<number | undefined>({ length: after.length });
  let i = 0;
  let j = 0;
  for (const [anchorBefore, anchorAfter] of anchors) {
    for (; i < anchorBefore && j < anchorAfter; i++, j++) {
      result[j] = i;
    }
    if (anchorAfter < after.length) {
      result[anchorAfter] = anchorBefore;
    }
    i = anchorBefore + 1;
    j = anchorAfter + 1;
  }
  return result;
}

export const EmptySession: Session = new Session(
  '00000000-0000-0000-0000-000000000000',
  new SessionBlueprint('', [], ''),
  [],
  LocalDate.MIN,
  undefined,
  undefined,
);
