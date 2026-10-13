import { clamp } from '@/utils/clamp';
import { RepsTarget, RepsType, uniformTarget, WeightedExerciseBlueprint } from '@/models/blueprint-models';

/** How the Targets card lays the working sets out: one rep count, a range, or reps set by set. */
export type TargetsMode = RepsType;

/** What the number pad is editing on the Targets card. */
export type TargetsField =
  | { kind: 'sets' }
  | { kind: 'reps' }
  | { kind: 'bottom' }
  | { kind: 'top' }
  | { kind: 'set'; index: number };

export interface TargetsPad {
  field: TargetsField;
  /** The layout the pad was opened in, which decides where Next goes from Sets. */
  mode: TargetsMode;
  /** What the pad shows: what was typed, which can be out of bounds (0) until the field is left. */
  value: number;
  /** True until the first key press, which replaces the value rather than adding to it. */
  fresh: boolean;
  /**
   * The exercise as it was when the field opened. Each key press applies the field's value to it, so a value
   * passing through on the way to another (the 1 of 12 sets) never loses anything, and clamping is the same
   * as clamping when the field is left.
   */
  opened: WeightedExerciseBlueprint;
}

export interface TargetsPadState {
  exercise: WeightedExerciseBlueprint;
  pad: TargetsPad | undefined;
}

export type TargetsPadAction =
  | { type: 'open'; field: TargetsField; mode: TargetsMode }
  | { type: 'digit'; digit: number }
  | { type: 'backspace' }
  | { type: 'step'; by: 1 | -1 }
  /** The "–" key: from the bottom of a range to its top. */
  | { type: 'dash' }
  /** A common value: one rep count, or both ends of a range. */
  | { type: 'chip'; reps: RepsTarget }
  /** Tapping an end of the range in the pad's display. */
  | { type: 'pick'; field: TargetsField }
  | { type: 'next' }
  | { type: 'close' };

const MAX_SETS = 20;
const MAX_REPS = 99;

export const FIXED_REPS_CHIPS = [5, 6, 8, 10, 12, 15] as const;
export const RANGE_REPS_CHIPS: readonly RepsTarget[] = [
  { min: 5, max: 8 },
  { min: 6, max: 10 },
  { min: 8, max: 12 },
  { min: 10, max: 15 },
  { min: 12, max: 20 },
];

/**
 * The layout the stored targets most likely came from. Only the targets persist, so a uniform list cannot
 * say whether it was authored as fixed or as a range.
 */
export function targetsModeOf(exercise: WeightedExerciseBlueprint): TargetsMode {
  const uniform = uniformTarget(exercise.plannedSets);
  if (!uniform) {
    return 'perSet';
  }
  return uniform.min === uniform.max ? 'fixed' : 'range';
}

/** The exercise relaid in `mode`, seeded from its first set and keeping the set count. */
export function withTargetsMode(exercise: WeightedExerciseBlueprint, mode: TargetsMode): WeightedExerciseBlueprint {
  const target = exercise.repsTargetForSet(0);
  return exercise.with({
    repsConfig:
      mode === 'perSet'
        ? { type: 'perSet', targets: exercise.plannedSets.map(() => ({ min: target.max, max: target.max })) }
        : mode === 'range'
          ? { type: 'range', min: target.min, max: target.max }
          : { type: 'fixed', reps: target.min },
  });
}

/** The line next to the Targets heading: "3 × 8–12", or "10 · 8 · 6" set by set. */
export function targetsSummaryOf(exercise: WeightedExerciseBlueprint, mode: TargetsMode): string {
  if (mode === 'perSet') {
    return exercise.plannedSets.map((s) => s.reps.max).join(' · ');
  }
  return `${exercise.plannedSets.length} × ${repsTextOf(exercise.repsTargetForSet(0), mode)}`;
}

/** The Reps tile's value: "10", or "8–12" in a range. */
export function repsTextOf(target: RepsTarget, mode: TargetsMode): string {
  return mode === 'range' ? `${target.min}–${target.max}` : `${target.max}`;
}

/** One more set, a copy of the last. */
export function withAddedSet(exercise: WeightedExerciseBlueprint): WeightedExerciseBlueprint {
  return exercise.withSets(exercise.plannedSets.length + 1);
}

/** The exercise without the set at `index`. The last set stays: an exercise has at least one. */
export function withoutSet(exercise: WeightedExerciseBlueprint, index: number): WeightedExerciseBlueprint {
  if (exercise.plannedSets.length <= 1) {
    return exercise;
  }
  return exercise.with({ plannedSets: exercise.plannedSets.filter((_, i) => i !== index) });
}

/** Where Next goes from the pad's field, or undefined when it closes the pad. */
export function nextTargetsField(pad: TargetsPad, exercise: WeightedExerciseBlueprint): TargetsField | undefined {
  const { field } = pad;
  switch (field.kind) {
    case 'sets':
      return pad.mode === 'range' ? { kind: 'bottom' } : pad.mode === 'fixed' ? { kind: 'reps' } : undefined;
    case 'bottom':
      return { kind: 'top' };
    case 'set':
      return field.index + 1 < exercise.plannedSets.length ? { kind: 'set', index: field.index + 1 } : undefined;
    case 'reps':
    case 'top':
      return undefined;
  }
}

export function targetsPadReducer(state: TargetsPadState, action: TargetsPadAction): TargetsPadState {
  const { exercise, pad } = state;
  if (action.type === 'open') {
    return { exercise, pad: openField(exercise, action.field, action.mode) };
  }
  if (!pad) {
    return state;
  }
  const cap = pad.field.kind === 'sets' ? MAX_SETS : MAX_REPS;
  const enter = (value: number, fresh: boolean): TargetsPadState => ({
    // Only the planned sets come from the opened exercise, so anything else edited meanwhile stays.
    exercise: exercise.with({ plannedSets: applyField(pad.opened, pad.field, value).plannedSets }),
    pad: { ...pad, value, fresh },
  });

  switch (action.type) {
    case 'digit': {
      const typed = pad.fresh ? action.digit : pad.value * 10 + action.digit;
      return enter(typed > cap ? action.digit : typed, false);
    }
    case 'backspace':
      return enter(Math.floor(pad.value / 10), false);
    case 'step':
      return enter(clamp(pad.value + action.by, 1, cap), true);
    case 'dash':
      return pad.field.kind === 'bottom' ? { exercise, pad: openField(exercise, { kind: 'top' }, pad.mode) } : state;
    case 'chip': {
      if (pad.field.kind === 'bottom' || pad.field.kind === 'top') {
        const chosen = exercise.with({ repsConfig: { type: 'range', min: action.reps.min, max: action.reps.max } });
        return { exercise: chosen, pad: openField(chosen, { kind: 'top' }, pad.mode) };
      }
      return enter(clamp(action.reps.max, 1, cap), true);
    }
    case 'pick':
      return { exercise, pad: openField(exercise, action.field, pad.mode) };
    case 'next': {
      const next = nextTargetsField(pad, exercise);
      return { exercise, pad: next && openField(exercise, next, pad.mode) };
    }
    case 'close':
      return { exercise, pad: undefined };
  }
}

function openField(exercise: WeightedExerciseBlueprint, field: TargetsField, mode: TargetsMode): TargetsPad {
  const resolved: TargetsField = field.kind === 'reps' && mode === 'range' ? { kind: 'bottom' } : field;
  return { field: resolved, mode, value: valueOf(exercise, resolved), fresh: true, opened: exercise };
}

function valueOf(exercise: WeightedExerciseBlueprint, field: TargetsField): number {
  switch (field.kind) {
    case 'sets':
      return exercise.plannedSets.length;
    case 'bottom':
      return exercise.repsTargetForSet(0).min;
    case 'reps':
    case 'top':
      return exercise.repsTargetForSet(0).max;
    case 'set':
      return exercise.repsTargetForSet(field.index).max;
  }
}

/** `opened` with the field set to `value`, kept in bounds: at least 1, and the top of a range at least its bottom. */
function applyField(opened: WeightedExerciseBlueprint, field: TargetsField, value: number): WeightedExerciseBlueprint {
  const opening = opened.repsTargetForSet(0);
  switch (field.kind) {
    case 'sets':
      return opened.withSets(clamp(value, 1, MAX_SETS));
    case 'reps': {
      const reps = clamp(value, 1, MAX_REPS);
      return opened.with({ repsConfig: { type: 'fixed', reps } });
    }
    case 'bottom': {
      const min = clamp(value, 1, MAX_REPS);
      return opened.with({ repsConfig: { type: 'range', min, max: Math.max(opening.max, min) } });
    }
    case 'top': {
      const max = Math.max(clamp(value, 1, MAX_REPS), opening.min);
      return opened.with({ repsConfig: { type: 'range', min: opening.min, max } });
    }
    case 'set': {
      const reps = clamp(value, 1, MAX_REPS);
      return opened.with({
        repsConfig: {
          type: 'perSet',
          targets: opened.plannedSets.map((s, i) => (i === field.index ? { min: reps, max: reps } : { ...s.reps })),
        },
      });
    }
  }
}
