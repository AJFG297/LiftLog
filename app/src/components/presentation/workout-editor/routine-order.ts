import { ExerciseBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';

/**
 * One unit of a routine's order: a lone exercise, or a whole superset. Moves in the routine editor go a
 * block at a time, so a superset travels as one piece and a lone exercise hops over a superset whole.
 */
export interface RoutineBlock {
  /** Indexes into the routine's exercises, in order. Never empty. */
  indices: number[];
  /** A, B, C… in routine order for a superset; undefined for a lone exercise. */
  supersetLetter: string | undefined;
}

export type MoveDirection = 'up' | 'down';

/**
 * The same chain rule the live workout groups by: a weighted exercise with `supersetWithNext` joins the
 * one after it, and the flag on the routine's last exercise joins nothing.
 */
function joinsNext(exercises: readonly ExerciseBlueprint[], index: number): boolean {
  const exercise = exercises[index];
  return index < exercises.length - 1 && exercise instanceof WeightedExerciseBlueprint && exercise.supersetWithNext;
}

export function routineBlocksOf(exercises: readonly ExerciseBlueprint[]): RoutineBlock[] {
  const blocks: RoutineBlock[] = [];
  let supersets = 0;
  let current: number[] = [];
  for (let index = 0; index < exercises.length; index++) {
    current.push(index);
    if (!joinsNext(exercises, index)) {
      blocks.push({ indices: current, supersetLetter: current.length > 1 ? supersetLetter(supersets++) : undefined });
      current = [];
    }
  }
  return blocks;
}

function supersetLetter(ordinal: number): string {
  return String.fromCharCode(65 + (ordinal % 26)).repeat(Math.floor(ordinal / 26) + 1);
}

function blockIndexOf(blocks: readonly RoutineBlock[], exerciseIndex: number): number {
  return blocks.findIndex((block) => block.indices.includes(exerciseIndex));
}

/** "3" for the routine's third exercise, or "A2" for the second exercise of superset A. */
export function routineExerciseLabel(exercises: readonly ExerciseBlueprint[], exerciseIndex: number): string {
  const blocks = routineBlocksOf(exercises);
  const block = blocks[blockIndexOf(blocks, exerciseIndex)];
  if (!block?.supersetLetter) {
    return String(exerciseIndex + 1);
  }
  return `${block.supersetLetter}${block.indices.indexOf(exerciseIndex) + 1}`;
}

/** The superset letter of the exercise's group, or undefined when it stands alone. */
export function supersetLetterOf(exercises: readonly ExerciseBlueprint[], exerciseIndex: number): string | undefined {
  const blocks = routineBlocksOf(exercises);
  return blocks[blockIndexOf(blocks, exerciseIndex)]?.supersetLetter;
}

export function canMoveExercise(
  exercises: readonly ExerciseBlueprint[],
  exerciseIndex: number,
  direction: MoveDirection,
): boolean {
  const blocks = routineBlocksOf(exercises);
  const from = blockIndexOf(blocks, exerciseIndex);
  if (from < 0) {
    return false;
  }
  return direction === 'up' ? from > 0 : from < blocks.length - 1;
}

/**
 * The routine with the block holding `exerciseIndex` swapped with its neighbour. Every chain stays as it
 * was: the one flag that could change meaning is a `supersetWithNext` on the routine's last exercise, which
 * joins nothing there but would join whatever came to follow it, so it is cleared.
 */
export function withExerciseMoved(
  exercises: readonly ExerciseBlueprint[],
  exerciseIndex: number,
  direction: MoveDirection,
): ExerciseBlueprint[] {
  if (!canMoveExercise(exercises, exerciseIndex, direction)) {
    return [...exercises];
  }
  const blocks = routineBlocksOf(exercises);
  const endsBlock = new Set(blocks.map((block) => block.indices.at(-1)!));
  return orderAfterMove(exercises, exerciseIndex, direction).map((oldIndex) => {
    const exercise = exercises[oldIndex]!;
    return endsBlock.has(oldIndex) ? withoutSupersetFlag(exercise) : exercise;
  });
}

/**
 * The routine's exercise indexes after {@link withExerciseMoved}: entry `i` is the old index of the exercise
 * that ends up at `i`, so anything kept alongside the exercises can follow them.
 */
export function orderAfterMove(
  exercises: readonly ExerciseBlueprint[],
  exerciseIndex: number,
  direction: MoveDirection,
): number[] {
  const blocks = routineBlocksOf(exercises);
  if (!canMoveExercise(exercises, exerciseIndex, direction)) {
    return blocks.flatMap((block) => block.indices);
  }
  const from = blockIndexOf(blocks, exerciseIndex);
  const to = direction === 'up' ? from - 1 : from + 1;
  const reordered = [...blocks];
  [reordered[from], reordered[to]] = [reordered[to]!, reordered[from]!];
  return reordered.flatMap((block) => block.indices);
}

/** Whether Superset/Unlink does anything: unlinking a superset, or linking a weighted exercise to the next. */
export function canToggleSuperset(exercises: readonly ExerciseBlueprint[], exerciseIndex: number): boolean {
  if (supersetLetterOf(exercises, exerciseIndex)) {
    return true;
  }
  return exercises[exerciseIndex] instanceof WeightedExerciseBlueprint && exerciseIndex < exercises.length - 1;
}

/**
 * Unlinks the whole superset the exercise is in, or links a lone exercise to the one after it. Linking to
 * an exercise that is already in a superset makes this one part of that superset.
 */
export function withSupersetToggled(
  exercises: readonly ExerciseBlueprint[],
  exerciseIndex: number,
): ExerciseBlueprint[] {
  const blocks = routineBlocksOf(exercises);
  const block = blocks[blockIndexOf(blocks, exerciseIndex)];
  if (!block) {
    return [...exercises];
  }
  if (block.supersetLetter) {
    return exercises.map((exercise, index) =>
      block.indices.includes(index) ? withoutSupersetFlag(exercise) : exercise,
    );
  }
  const exercise = exercises[exerciseIndex];
  if (!(exercise instanceof WeightedExerciseBlueprint) || exerciseIndex >= exercises.length - 1) {
    return [...exercises];
  }
  return exercises.with(exerciseIndex, exercise.with({ supersetWithNext: true }));
}

/**
 * The routine without the exercise at `exerciseIndex`, by position so a routine with the same exercise
 * twice loses the right one. Removing the last exercise of a superset clears the flag on the one before
 * it, which would otherwise join the superset to whatever follows.
 */
export function withExerciseRemoved(
  exercises: readonly ExerciseBlueprint[],
  exerciseIndex: number,
): ExerciseBlueprint[] {
  if (exerciseIndex < 0 || exerciseIndex >= exercises.length) {
    return [...exercises];
  }
  const endsChain = !joinsNext(exercises, exerciseIndex);
  return exercises.flatMap((exercise, index) => {
    if (index === exerciseIndex) {
      return [];
    }
    return index === exerciseIndex - 1 && endsChain ? [withoutSupersetFlag(exercise)] : [exercise];
  });
}

function withoutSupersetFlag(exercise: ExerciseBlueprint): ExerciseBlueprint {
  return exercise instanceof WeightedExerciseBlueprint && exercise.supersetWithNext
    ? exercise.with({ supersetWithNext: false })
    : exercise;
}
