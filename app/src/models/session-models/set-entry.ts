import { PlannedSet, PlannedWarmupSet } from '@/models/blueprint-models';
import {
  PotentialSet,
  RecordedWeightedExercise,
  SetPosition,
} from '@/models/session-models/recorded-weighted-exercise';
import { Rpe } from '@/models/session-models/rpe';
import { SetKind, WorkingListKind, setLabels } from '@/models/session-models/set-kind';
import { LoadUnit, Weight } from '@/models/weight';
import { OffsetDateTime } from '@js-joda/core';
import BigNumber from 'bignumber.js';

/**
 * What the lifter typed into a set that the session itself doesn't hold. A typed weight goes straight
 * onto the slot, so only the fact that it was typed is kept here; typed reps wait here until the set is
 * logged, and stay afterwards so undoing the set gives them back.
 */
export interface SetDraft {
  reps?: number;
  weightTyped?: boolean;
}

/** One exercise's drafts, keyed by {@link setDraftKey}. */
export type SetDrafts = Readonly<Record<string, SetDraft>>;

export function setDraftKey(position: SetPosition): string {
  return `${position.list}:${position.index}`;
}

/** An exercise together with what was typed into it: everything the set table reads and writes. */
export interface SetEntryState {
  exercise: RecordedWeightedExercise;
  drafts: SetDrafts;
}

export type SetField = 'weight' | 'reps';

/** A field as the set table shows it. `entered` is the lifter's own value (typed or logged), not today's target. */
export interface SetFieldValue<T> {
  value: T;
  entered: boolean;
}

export interface SetRow {
  position: SetPosition;
  slot: PotentialSet;
  /** Its number among the working sets, or the letter of its kind. */
  label: string;
  weight: SetFieldValue<Weight>;
  /** What logging the set records: what was typed, or else the top of its target. */
  reps: SetFieldValue<number>;
  logged: boolean;
}

/** Every set of the exercise in the order it is done: warm-ups, then the working list. */
export function setRowsOf(state: SetEntryState): SetRow[] {
  const { exercise } = state;
  const positions: SetPosition[] = [
    ...exercise.warmupSets.map((_, index) => ({ list: 'warmup' as const, index })),
    ...exercise.potentialSets.map((_, index) => ({ list: 'working' as const, index })),
  ];
  const labels = setLabels(positions.map((position) => exercise.slotAt(position)!.kind));
  return positions.map((position, row) => rowFor(state, position, exercise.slotAt(position)!, labels[row]!));
}

export function setRowAt(state: SetEntryState, position: SetPosition): SetRow | undefined {
  return setRowsOf(state).find((row) => samePosition(row.position, position));
}

function rowFor(state: SetEntryState, position: SetPosition, slot: PotentialSet, label: string): SetRow {
  const draft = state.drafts[setDraftKey(position)];
  const logged = !!slot.set;
  return {
    position,
    slot,
    label,
    weight: { value: slot.weight, entered: logged || !!draft?.weightTyped },
    reps: slot.set
      ? { value: slot.set.repsCompleted, entered: true }
      : draft?.reps !== undefined
        ? { value: draft.reps, entered: true }
        : { value: slot.target.max, entered: false },
    logged,
  };
}

/**
 * The exercise with `value` typed into one field. A weight goes onto the slot, and later unlogged sets of
 * the same kind that were on the same weight (and weren't typed themselves) follow it, as they would a
 * change of plan. Reps typed into a logged set change what was logged; into an unlogged one, they wait
 * in the draft. `fallbackUnit` is the unit for a slot that has none yet.
 */
export function withTypedValue(
  state: SetEntryState,
  position: SetPosition,
  field: SetField,
  value: BigNumber,
  fallbackUnit: LoadUnit,
): SetEntryState {
  const slot = state.exercise.slotAt(position);
  if (!slot) {
    return state;
  }
  if (field === 'reps') {
    const reps = value.integerValue(BigNumber.ROUND_DOWN).toNumber();
    const exercise = slot.set ? withReps(state.exercise, position, reps, slot.set.completionDateTime) : state.exercise;
    return { exercise, drafts: withDraft(state.drafts, position, { reps }) };
  }
  const weight = new Weight(value, slot.weight.unit === 'nil' ? fallbackUnit : slot.weight.unit);
  return {
    exercise: withWeightAt(state, position, slot, weight),
    drafts: withDraft(state.drafts, position, { weightTyped: true }),
  };
}

function withWeightAt(
  state: SetEntryState,
  position: SetPosition,
  slot: PotentialSet,
  weight: Weight,
): RecordedWeightedExercise {
  const { exercise } = state;
  if (position.list === 'warmup') {
    return exercise.withWarmupWeight(position.index, weight);
  }
  const followers = slot.set
    ? []
    : exercise.potentialSets.flatMap((other, index) =>
        index > position.index &&
        !other.set &&
        other.kind === slot.kind &&
        other.weight.equals(slot.weight) &&
        !state.drafts[setDraftKey({ list: 'working', index })]?.weightTyped
          ? [index]
          : [],
      );
  // One set at a time, so percentage warm-ups keep following the working weight as it moves.
  return [position.index, ...followers].reduce((ex, index) => ex.withWeight(index, weight, 'thisSet'), exercise);
}

/**
 * The check on a set row: logs the set with what the row shows, or undoes it. Undoing keeps the reps
 * that were logged whenever they aren't just the target again, so ticking it back logs the same set.
 */
export function withSetToggled(state: SetEntryState, position: SetPosition, time: OffsetDateTime): SetEntryState {
  const slot = state.exercise.slotAt(position);
  if (!slot) {
    return state;
  }
  if (!slot.set) {
    return withSetLogged(state, position, time);
  }
  const loggedReps = slot.set.repsCompleted;
  const typedReps = state.drafts[setDraftKey(position)]?.reps;
  const keepReps = typedReps !== undefined || loggedReps !== slot.target.max;
  return {
    exercise: withReps(state.exercise, position, undefined, time),
    drafts: withDraft(state.drafts, position, { reps: keepReps ? loggedReps : undefined }),
  };
}

/** Logs the set as its row shows it. A set that is already logged is left as it is. */
export function withSetLogged(state: SetEntryState, position: SetPosition, time: OffsetDateTime): SetEntryState {
  const row = setRowAt(state, position);
  if (!row || row.logged) {
    return state;
  }
  return { ...state, exercise: withReps(state.exercise, position, row.reps.value, time) };
}

/** A working set's RPE, logged or not. Warm-ups never take one, so they are left alone. */
export function withSetRpe(state: SetEntryState, position: SetPosition, rpe: Rpe | undefined): SetEntryState {
  if (position.list !== 'working' || !state.exercise.slotAt(position)) {
    return state;
  }
  return { ...state, exercise: state.exercise.withRpe(position.index, rpe) };
}

function withReps(
  exercise: RecordedWeightedExercise,
  position: SetPosition,
  reps: number | undefined,
  time: OffsetDateTime,
): RecordedWeightedExercise {
  return position.list === 'warmup'
    ? exercise.withWarmupRepCount(position.index, reps, time)
    : exercise.withRepCount(position.index, reps, time);
}

/**
 * One more set after the last: the same weight, target and type, except that a warm-up or a set to
 * failure is followed by a plain working set. The session's plan gets the set too, so finishing offers
 * to keep it in the routine.
 */
export function withAddedSet(state: SetEntryState, fallbackUnit: LoadUnit): SetEntryState {
  const { exercise } = state;
  const { blueprint, potentialSets } = exercise;
  const last = potentialSets.at(-1) ?? exercise.warmupSets.at(-1);
  const kind = addedKindAfter(last?.kind);
  const target = last?.target ?? blueprint.repsTargetForSet(0);
  const added = PotentialSet.of({ weight: last?.weight ?? new Weight(0, fallbackUnit), target, kind });
  const plannedSets: PlannedSet[] = [
    ...potentialSets.map((slot, index) => blueprint.plannedSets[index] ?? plannedSetFor(slot, index, exercise)),
    { reps: potentialSets.length ? blueprint.repsTargetForSet(potentialSets.length - 1) : target, kind },
  ];
  const position: SetPosition = { list: 'working', index: potentialSets.length };
  return {
    exercise: exercise.with({ potentialSets: [...potentialSets, added], blueprint: blueprint.with({ plannedSets }) }),
    drafts: withoutDraft(state.drafts, position),
  };
}

function addedKindAfter(kind: SetKind | undefined): WorkingListKind {
  return kind === 'drop' || kind === 'myo' ? kind : 'working';
}

function plannedSetFor(slot: PotentialSet, index: number, exercise: RecordedWeightedExercise): PlannedSet {
  return { reps: exercise.blueprint.repsTargetForSet(index), kind: workingListKindOf(slot.kind) };
}

function workingListKindOf(kind: SetKind): WorkingListKind {
  return kind === 'warmup' ? 'working' : kind;
}

/**
 * Whether the set at `position` may become `kind`. The last set of the working list can't become a
 * warm-up, because an exercise needs at least one set that isn't one.
 */
export function canChangeSetKind(exercise: RecordedWeightedExercise, position: SetPosition, kind: SetKind): boolean {
  return !(kind === 'warmup' && position.list === 'working' && exercise.potentialSets.length <= 1);
}

/**
 * The set at `position` as `kind`, in the session and its plan. Warm-ups have their own list, so a set
 * that becomes one moves to the end of the warm-ups, and a warm-up that stops being one becomes the
 * first set of the working list. Its reps, weight and draft move with it.
 */
export function withSetKind(state: SetEntryState, position: SetPosition, kind: SetKind): SetEntryState {
  const { exercise } = state;
  const slot = exercise.slotAt(position);
  if (!slot || slot.kind === kind || !canChangeSetKind(exercise, position, kind)) {
    return state;
  }
  const { blueprint } = exercise;
  if (position.list === 'working' && kind !== 'warmup') {
    const plannedSets = blueprint.plannedSets.map((planned, index) =>
      index === position.index ? { ...planned, kind } : planned,
    );
    return {
      ...state,
      exercise: exercise
        .withSet(position.index, (s) => s.with({ kind }))
        .with({ blueprint: blueprint.with({ plannedSets }) }),
    };
  }
  if (position.list === 'working') {
    const moved = exercise.warmupSets.length;
    return {
      exercise: exercise.with({
        potentialSets: exercise.potentialSets.filter((_, index) => index !== position.index),
        warmupSets: [...exercise.warmupSets, slot.with({ kind: 'warmup', rpe: undefined })],
        blueprint: blueprint.with({
          plannedSets: blueprint.plannedSets.filter((_, index) => index !== position.index),
          warmupSets: [...blueprint.warmupSets, plannedWarmupFor(exercise, slot)],
        }),
      }),
      drafts: remapDrafts(state.drafts, (p) => {
        if (p.list === 'warmup') {
          return p;
        }
        if (p.index === position.index) {
          return { list: 'warmup', index: moved };
        }
        return p.index > position.index ? { list: 'working', index: p.index - 1 } : p;
      }),
    };
  }
  const workingKind = workingListKindOf(kind);
  return {
    exercise: exercise.with({
      warmupSets: exercise.warmupSets.filter((_, index) => index !== position.index),
      potentialSets: [slot.with({ kind: workingKind }), ...exercise.potentialSets],
      blueprint: blueprint.with({
        warmupSets: blueprint.warmupSets.filter((_, index) => index !== position.index),
        plannedSets: [{ reps: slot.target, kind: workingKind }, ...blueprint.plannedSets],
      }),
    }),
    drafts: remapDrafts(state.drafts, (p) => {
      if (p.list === 'working') {
        return { list: 'working', index: p.index + 1 };
      }
      if (p.index === position.index) {
        return { list: 'working', index: 0 };
      }
      return p.index > position.index ? { list: 'warmup', index: p.index - 1 } : p;
    }),
  };
}

/** The number the set at `position` would have as a working set, which the set-type sheet shows. */
export function workingNumberFor(state: SetEntryState, position: SetPosition): number {
  const moved: SetPosition = position.list === 'warmup' ? { list: 'working', index: 0 } : position;
  return Number(setRowAt(withSetKind(state, position, 'working'), moved)?.label ?? 1);
}

/** A set turned warm-up, as the plan's warm-up: its reps, and its weight when it has one. */
function plannedWarmupFor(exercise: RecordedWeightedExercise, slot: PotentialSet): PlannedWarmupSet {
  const hasLoad = exercise.tracksResistance && !slot.weight.value.isZero();
  return { reps: slot.target.max, load: hasLoad ? { type: 'absolute', weight: slot.weight } : undefined };
}

/** The unit the exercise is weighed in: its sets' own, or `preferred` while none has one. */
export function weightUnitOf(exercise: RecordedWeightedExercise, preferred: LoadUnit): LoadUnit {
  const unit = [...exercise.potentialSets, ...exercise.warmupSets].find((slot) => slot.weight.unit !== 'nil')?.weight
    .unit;
  return unit === 'kilograms' || unit === 'pounds' ? unit : preferred;
}

function samePosition(a: SetPosition, b: SetPosition): boolean {
  return a.list === b.list && a.index === b.index;
}

function withDraft(drafts: SetDrafts, position: SetPosition, patch: SetDraft): SetDrafts {
  const key = setDraftKey(position);
  const merged: SetDraft = { ...drafts[key], ...patch };
  const draft: SetDraft = {
    ...(merged.reps !== undefined ? { reps: merged.reps } : {}),
    ...(merged.weightTyped ? { weightTyped: true } : {}),
  };
  if (draft.reps === undefined && !draft.weightTyped) {
    return withoutDraft(drafts, position);
  }
  return { ...drafts, [key]: draft };
}

function withoutDraft(drafts: SetDrafts, position: SetPosition): SetDrafts {
  const key = setDraftKey(position);
  if (!(key in drafts)) {
    return drafts;
  }
  const { [key]: _removed, ...rest } = drafts;
  return rest;
}

function remapDrafts(drafts: SetDrafts, move: (position: SetPosition) => SetPosition): SetDrafts {
  return Object.fromEntries(
    Object.entries(drafts).flatMap(([key, draft]) => {
      const position = positionOfKey(key);
      return position ? [[setDraftKey(move(position)), draft]] : [];
    }),
  );
}

function positionOfKey(key: string): SetPosition | undefined {
  const [list, index] = key.split(':');
  const parsed = Number(index);
  return (list === 'warmup' || list === 'working') && Number.isInteger(parsed) ? { list, index: parsed } : undefined;
}
