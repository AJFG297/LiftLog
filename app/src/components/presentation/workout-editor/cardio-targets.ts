import { clamp } from '@/utils/clamp';
import type { TranslateFn } from '@/i18n/translate-fn';
import {
  CardioExerciseBlueprint,
  CardioExerciseSetBlueprint,
  CardioTarget,
  cardioTargetEquals,
} from '@/models/blueprint-models';
import { formatTimeSpan } from '@/utils/format-time-span';
import { distanceIn, getShortUnit } from '@/utils/unit';
import { Duration } from '@js-joda/core';
import BigNumber from 'bignumber.js';

/** What every round aims for. All rounds share one, even though the model allows mixing. */
export type CardioGoal = CardioTarget['type'];

/** One target written to every round, or a list of rounds each with its own. */
export type CardioRoundsMode = 'same' | 'each';

/** The unit distances are shown and typed in: the user's, kilometres or miles. */
export type CardioDistanceUnit = 'kilometre' | 'mile';

export type AlsoLogField = 'time' | 'distance' | 'resistance' | 'incline' | 'weight' | 'steps';

export const ALSO_LOG_FIELDS: readonly AlsoLogField[] = [
  'time',
  'distance',
  'resistance',
  'incline',
  'weight',
  'steps',
];

const TRACK_FLAG = {
  time: 'trackDuration',
  distance: 'trackDistance',
  resistance: 'trackResistance',
  incline: 'trackIncline',
  weight: 'trackWeight',
  steps: 'trackSteps',
} as const satisfies Record<AlsoLogField, keyof CardioExerciseSetBlueprint>;

export const MINUTE_CHIPS = [1, 2, 5, 10, 20, 30, 45, 60] as const;
export const DISTANCE_CHIPS: Record<CardioDistanceUnit, readonly string[]> = {
  kilometre: ['0.4', '1.0', '3.0', '5.0', '10.0', '21.1'],
  mile: ['0.25', '0.5', '1.0', '3.1', '6.2', '13.1'],
};

const MAX_ROUNDS = 20;
const MAX_MINUTES = 600;
const MAX_DISTANCE = 500;
const MIN_DISTANCE = 0.1;
const DISTANCE_STEP = 0.5;

export function cardioGoalOf(exercise: CardioExerciseBlueprint): CardioGoal {
  return exercise.sets[0]!.target.type;
}

export function cardioRoundsModeOf(exercise: CardioExerciseBlueprint): CardioRoundsMode {
  const first = exercise.sets[0]!.target;
  return exercise.sets.every((s) => cardioTargetEquals(s.target, first)) ? 'same' : 'each';
}

/** Same each round gives every round the first round's target; Different each round changes nothing. */
export function withCardioRoundsMode(exercise: CardioExerciseBlueprint, mode: CardioRoundsMode) {
  if (mode === 'each' || cardioRoundsModeOf(exercise) === 'same') {
    return exercise;
  }
  const target = exercise.sets[0]!.target;
  return exercise.with({ sets: exercise.sets.map((s) => s.with({ target })) });
}

/**
 * Every round moved to `goal`, which is then always logged. A round already aiming for it keeps its target;
 * the others start from a typical one: a 30 min or 5 km session, or 5 min or 1 km intervals.
 */
export function withCardioGoal(
  exercise: CardioExerciseBlueprint,
  goal: CardioGoal,
  distanceUnit: CardioDistanceUnit,
): CardioExerciseBlueprint {
  if (exercise.sets.every((s) => s.target.type === goal)) {
    return exercise;
  }
  const single = exercise.sets.length === 1;
  const fresh: CardioTarget =
    goal === 'time'
      ? { type: 'time', value: Duration.ofMinutes(single ? 30 : 5) }
      : {
          type: 'distance',
          value: { unit: distanceUnit, value: BigNumber(single ? (distanceUnit === 'mile' ? 3 : 5) : 1) },
        };
  return exercise.with({
    sets: exercise.sets.map((s) =>
      s.with({ target: s.target.type === goal ? s.target : fresh, [TRACK_FLAG[goal]]: true }),
    ),
  });
}

/** One more round, a copy of the last. */
export function withAddedRound(exercise: CardioExerciseBlueprint): CardioExerciseBlueprint {
  return exercise.with({ sets: [...exercise.sets, exercise.sets[exercise.sets.length - 1]!] });
}

/** The exercise without the round at `index`. The last round stays: an exercise has at least one. */
export function withoutRound(exercise: CardioExerciseBlueprint, index: number): CardioExerciseBlueprint {
  if (exercise.sets.length <= 1) {
    return exercise;
  }
  return exercise.with({ sets: exercise.sets.filter((_, i) => i !== index) });
}

function withRoundCount(exercise: CardioExerciseBlueprint, count: number): CardioExerciseBlueprint {
  const last = exercise.sets[exercise.sets.length - 1]!;
  return exercise.with({
    sets: Array.from({ length: count }, (_, i) => exercise.sets[i] ?? last),
  });
}

/** Each Also log chip: on for every round, and locked on for the goal. */
export function alsoLogOf(exercise: CardioExerciseBlueprint): Record<AlsoLogField, { on: boolean; locked: boolean }> {
  const goal = cardioGoalOf(exercise);
  return Object.fromEntries(
    ALSO_LOG_FIELDS.map((field) => {
      const locked = field === goal;
      return [field, { locked, on: locked || exercise.sets.every((s) => s[TRACK_FLAG[field]]) }];
    }),
  ) as Record<AlsoLogField, { on: boolean; locked: boolean }>;
}

/** `field` logged, or not, on every round. The goal is always logged, so it can't be turned off. */
export function withAlsoLog(exercise: CardioExerciseBlueprint, field: AlsoLogField, on: boolean) {
  if (field === cardioGoalOf(exercise)) {
    return exercise;
  }
  return exercise.with({ sets: exercise.sets.map((s) => s.with({ [TRACK_FLAG[field]]: on })) });
}

/** The rest between rounds: the first round's that has one. Cardio never fails a set, so only the rest counts. */
export function cardioRestOf(exercise: CardioExerciseBlueprint): Duration | undefined {
  return exercise.sets.find((s) => s.restBetweenSets)?.restBetweenSets?.rest;
}

/** Rest between rounds only exists with more than one round: steady cardio isn't cluttered with it. */
export function showsRestBetweenRounds(exercise: CardioExerciseBlueprint, restTimersEnabled: boolean): boolean {
  return restTimersEnabled && exercise.sets.length > 1;
}

/** `rest` after every round; none at 0:00. */
export function withCardioRest(exercise: CardioExerciseBlueprint, rest: Duration): CardioExerciseBlueprint {
  const restBetweenSets = rest.isZero() ? undefined : { rest };
  return exercise.with({ sets: exercise.sets.map((s) => s.with({ restBetweenSets })) });
}

/** A round's target as shown: "30", "1:30" or "5.0", in the user's distance unit. */
export function cardioValueTextOf(target: CardioTarget, distanceUnit: CardioDistanceUnit): string {
  if (target.type === 'time') {
    const seconds = target.value.seconds();
    return seconds % 60 === 0 ? String(seconds / 60) : formatTimeSpan(target.value);
  }
  return distanceText(distanceIn(target.value, distanceUnit));
}

/** "min", "km" or "mi". */
export function cardioUnitOf(t: TranslateFn, goal: CardioGoal, distanceUnit: CardioDistanceUnit): string {
  return goal === 'time' ? t('exercise_editor.cardio.minutes_unit.label') : getShortUnit(distanceUnit);
}

/** The line next to the Targets heading: "30 min", "3 × 5.0 km", or "5 · 1 · 5 · 1 · 5 min" round by round. */
export function cardioTargetsSummaryOf(
  t: TranslateFn,
  exercise: CardioExerciseBlueprint,
  mode: CardioRoundsMode,
  distanceUnit: CardioDistanceUnit,
): string {
  const goal = cardioGoalOf(exercise);
  const unit = cardioUnitOf(t, goal, distanceUnit);
  const value = (target: CardioTarget) => cardioValueTextOf(target, distanceUnit);
  if (mode === 'same') {
    const count = exercise.sets.length;
    return `${count > 1 ? `${count} × ` : ''}${value(exercise.sets[0]!.target)} ${unit}`;
  }
  if (exercise.sets.every((s) => s.target.type === goal)) {
    return `${exercise.sets.map((s) => value(s.target)).join(' · ')} ${unit}`;
  }
  return exercise.sets.map((s) => `${value(s.target)} ${cardioUnitOf(t, s.target.type, distanceUnit)}`).join(' · ');
}

function distanceText(value: BigNumber): string {
  const rounded = value.decimalPlaces(2, BigNumber.ROUND_HALF_UP);
  return rounded.toFixed((rounded.decimalPlaces() ?? 0) <= 1 ? 1 : 2);
}

/** What the number pad is editing on the cardio Targets card. */
export type CardioPadField = { kind: 'rounds' } | { kind: 'goal' } | { kind: 'round'; index: number };

/** What the field holds: a count of rounds, whole minutes, or a distance with a decimal point. */
export type CardioPadMeasure = 'count' | CardioGoal;

export interface CardioPad {
  field: CardioPadField;
  measure: CardioPadMeasure;
  distanceUnit: CardioDistanceUnit;
  /** What the pad shows: what was typed, "0." on the way to "0.8", which is kept in bounds only when stored. */
  text: string;
  /** True until the first key press, which replaces the value rather than adding to it. */
  fresh: boolean;
  /** The exercise when the field opened; each key press applies the field to it, as on the weighted pad. */
  opened: CardioExerciseBlueprint;
}

export interface CardioPadState {
  exercise: CardioExerciseBlueprint;
  pad: CardioPad | undefined;
}

export type CardioPadAction =
  | { type: 'open'; field: CardioPadField; distanceUnit: CardioDistanceUnit }
  | { type: 'digit'; digit: number }
  /** The decimal point, in place of the range's "–" on a distance. */
  | { type: 'decimal' }
  | { type: 'backspace' }
  | { type: 'step'; by: 1 | -1 }
  | { type: 'chip'; text: string }
  | { type: 'next' }
  | { type: 'close' };

/** Where Next goes from the pad's field, or undefined when it closes the pad. */
export function nextCardioField(pad: CardioPad, exercise: CardioExerciseBlueprint): CardioPadField | undefined {
  const { field } = pad;
  switch (field.kind) {
    case 'rounds':
      return { kind: 'goal' };
    case 'goal':
      return undefined;
    case 'round':
      return field.index + 1 < exercise.sets.length ? { kind: 'round', index: field.index + 1 } : undefined;
  }
}

export function cardioPadReducer(state: CardioPadState, action: CardioPadAction): CardioPadState {
  const { exercise, pad } = state;
  if (action.type === 'open') {
    return { exercise, pad: openField(exercise, action.field, action.distanceUnit) };
  }
  if (!pad) {
    return state;
  }
  const distance = pad.measure === 'distance';
  const enter = (text: string, fresh: boolean): CardioPadState => ({
    exercise: exercise.with({ sets: applyField(pad, text).sets }),
    pad: { ...pad, text, fresh },
  });

  switch (action.type) {
    case 'digit': {
      const typed = pad.fresh ? String(action.digit) : pad.text + action.digit;
      if (distance) {
        const point = typed.indexOf('.');
        if (point >= 0 && typed.length - point > 3) {
          return state;
        }
        const text = point >= 0 ? typed : String(Number(typed));
        return enter(Number(text) > MAX_DISTANCE ? String(action.digit) : text, false);
      }
      const value = Number(typed);
      return enter(value > capOf(pad.measure) ? String(action.digit) : String(value), false);
    }
    case 'decimal':
      if (!distance || (!pad.fresh && pad.text.includes('.'))) {
        return state;
      }
      return enter(`${pad.fresh || pad.text === '' ? '0' : pad.text}.`, false);
    case 'backspace':
      return enter(pad.fresh ? '' : pad.text.slice(0, -1), false);
    case 'step': {
      if (distance) {
        const value = Math.max(MIN_DISTANCE, numberOf(pad.text) + action.by * DISTANCE_STEP);
        return enter(distanceText(BigNumber(value)), true);
      }
      return enter(String(clamp(Math.round(numberOf(pad.text)) + action.by, 1, capOf(pad.measure))), true);
    }
    case 'chip':
      return enter(action.text, true);
    case 'next': {
      const next = nextCardioField(pad, exercise);
      return { exercise, pad: next && openField(exercise, next, pad.distanceUnit) };
    }
    case 'close':
      return { exercise, pad: undefined };
  }
}

function openField(
  exercise: CardioExerciseBlueprint,
  field: CardioPadField,
  distanceUnit: CardioDistanceUnit,
): CardioPad {
  const target = exercise.sets[field.kind === 'round' ? field.index : 0]!.target;
  const measure: CardioPadMeasure = field.kind === 'rounds' ? 'count' : target.type;
  const text = field.kind === 'rounds' ? String(exercise.sets.length) : cardioValueTextOf(target, distanceUnit);
  return { field, measure, distanceUnit, text, fresh: true, opened: exercise };
}

/** `pad.opened` with the field set to `text`, kept in bounds: at least one round, a minute, or 0.1. */
function applyField(pad: CardioPad, text: string): CardioExerciseBlueprint {
  const { opened, field } = pad;
  if (field.kind === 'rounds') {
    return withRoundCount(opened, clamp(Math.round(numberOf(text)), 1, MAX_ROUNDS));
  }
  const target: CardioTarget =
    pad.measure === 'distance'
      ? {
          type: 'distance',
          value: {
            unit: pad.distanceUnit,
            value: BigNumber(clamp(numberOf(text), MIN_DISTANCE, MAX_DISTANCE)).decimalPlaces(2),
          },
        }
      : { type: 'time', value: Duration.ofMinutes(clamp(Math.round(numberOf(text)), 1, MAX_MINUTES)) };
  return opened.with({
    sets: opened.sets.map((s, i) => (field.kind === 'goal' || i === field.index ? s.with({ target }) : s)),
  });
}

/** The number in the pad's text; "1:30", shown for an untouched round, counts as its minutes. */
function numberOf(text: string): number {
  const [minutes, seconds] = text.split(':');
  const value = Number(minutes) + (seconds === undefined ? 0 : Number(seconds) / 60);
  return Number.isFinite(value) ? value : 0;
}

function capOf(measure: CardioPadMeasure): number {
  return measure === 'count' ? MAX_ROUNDS : MAX_MINUTES;
}
