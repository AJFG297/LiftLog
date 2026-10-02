import { describe, expect, it } from 'vitest';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import { customExerciseOf } from '@/components/presentation/workout-editor/exercise-picker';
import { SessionBlueprint, stubExerciseId, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import { buildProgressHistory } from '@/store/stats/progress-history';
import { AxisAmount, ExerciseFilters, exercisesListOf } from '@/store/stats/exercises-list';

const kg = (n: number) => new Weight(n, 'kilograms');
const day = (month: number, n: number) => LocalDate.of(2026, month, n);
// Twelve weeks back is July 10.
const today = day(10, 2);
const time = OffsetDateTime.parse('2026-07-01T10:00:00Z');

const bench = makeWeightedBlueprint({ name: 'Bench Press' });
const squat = makeWeightedBlueprint({ name: 'Squat' });
const press = makeWeightedBlueprint({ name: 'Overhead Press' });
const raise = makeWeightedBlueprint({ name: 'Lateral Raise' });
const crunch = makeWeightedBlueprint({ name: 'Crunch', resistance: 'none' });
// Not in the catalog: it files under no muscle.
const mystery = makeWeightedBlueprint({ name: 'Mystery Lift' });

const catalog: Record<string, ExerciseDescriptor> = {
  [stubExerciseId('Bench Press')]: descriptor('Bench Press', 'chest', 'triceps'),
  [stubExerciseId('Squat')]: descriptor('Squat', 'quadriceps'),
  [stubExerciseId('Overhead Press')]: descriptor('Overhead Press', 'shoulders'),
  [stubExerciseId('Lateral Raise')]: descriptor('Lateral Raise', 'shoulders'),
  [stubExerciseId('Crunch')]: descriptor('Crunch', 'abdominals'),
};

function descriptor(name: string, ...muscles: string[]) {
  return customExerciseOf({ name, muscles, equipment: undefined });
}

function lift(blueprint: WeightedExerciseBlueprint, weight: number, reps: number) {
  const set = PotentialSet.of({
    set: RecordedSet.of({ repsCompleted: reps, completionDateTime: time }),
    weight: kg(weight),
    target: { min: reps, max: reps },
    kind: 'working',
  });
  return new RecordedWeightedExercise(blueprint, [set], undefined);
}

let ids = 0;
function session(date: LocalDate, ...exercises: RecordedWeightedExercise[]) {
  return new Session(`s${ids++}`, new SessionBlueprint('Day', [], ''), exercises, date, undefined, undefined);
}

const history = buildProgressHistory([
  // Before the window: counts as a session but not towards the change.
  session(day(6, 1), lift(bench, 80, 8)),
  session(day(7, 15), lift(bench, 80, 10)),
  session(day(7, 20), lift(press, 60, 5), lift(raise, 10, 10)),
  session(day(8, 1), lift(crunch, 0, 20)),
  session(day(8, 15), lift(raise, 10, 10)),
  session(day(8, 20), lift(mystery, 50, 5)),
  session(day(9, 1), lift(squat, 100, 5)),
  session(day(9, 29), lift(press, 55, 5)),
  session(day(9, 30), lift(bench, 85, 10)),
  session(day(10, 1), lift(crunch, 0, 25)),
]);

const all: ExerciseFilters = { query: '', muscle: undefined };
const names = (filters: ExerciseFilters) =>
  exercisesListOf(history, catalog, today, filters, 'kilograms').rows.map((row) => row.name);
const amount = (value: AxisAmount | undefined) =>
  value && (value.axis === 'reps' ? `${value.value} reps` : `${value.value.value.toString()} ${value.value.unit}`);

describe('exercisesListOf', () => {
  it('lists the logged exercises, most recently done first', () => {
    expect(names(all)).toEqual(['Crunch', 'Bench Press', 'Overhead Press', 'Squat', 'Mystery Lift', 'Lateral Raise']);
  });

  it('keeps exercises last done on the same day in the order they were first done', () => {
    const sameDay = buildProgressHistory([session(day(9, 1), lift(squat, 100, 5), lift(bench, 80, 8))]);

    expect(exercisesListOf(sameDay, catalog, today, all, 'kilograms').rows.map((row) => row.name)).toEqual([
      'Squat',
      'Bench Press',
    ]);
  });

  it('gives each its last time, sessions, current value and change over 12 weeks', () => {
    const rows = exercisesListOf(history, catalog, today, all, 'kilograms').rows;

    expect(
      rows.map((row) => [row.name, row.lastDone, row.sessions, amount(row.current), amount(row.change), row.direction]),
    ).toEqual([
      ['Crunch', { kind: 'yesterday' }, 2, '25 reps', '5 reps', 'up'],
      // 85 × 10 ≈ 113.3 against 80 × 10 ≈ 106.7 on July 15; June is before the window.
      ['Bench Press', { kind: 'weekday', date: day(9, 30) }, 3, '113.3 kilograms', '6.6 kilograms', 'up'],
      ['Overhead Press', { kind: 'weekday', date: day(9, 29) }, 2, '64.2 kilograms', '-5.8 kilograms', 'down'],
      // One session in the window: nothing to compare.
      ['Squat', { kind: 'date', date: day(9, 1) }, 1, '116.7 kilograms', undefined, undefined],
      ['Mystery Lift', { kind: 'date', date: day(8, 20) }, 1, '58.3 kilograms', undefined, undefined],
      ['Lateral Raise', { kind: 'date', date: day(8, 15) }, 2, '13.3 kilograms', '0 kilograms', 'same'],
    ]);
  });

  it("draws the trend over the window only, in the user's unit", () => {
    const rows = exercisesListOf(history, catalog, today, all, 'pounds').rows;
    const benchRow = rows.find((row) => row.name === 'Bench Press');

    expect(benchRow?.trend).toEqual([expect.closeTo(235.16, 2), expect.closeTo(249.86, 2)]);
    expect(amount(benchRow?.current)).toBe('249.9 pounds');
    expect(rows.find((row) => row.name === 'Crunch')?.trend).toEqual([20, 25]);
  });

  it('searches by name', () => {
    expect(names({ query: '  sqat ', muscle: undefined })).toEqual(['Squat']);
    expect(names({ query: 'deadlift', muscle: undefined })).toEqual([]);
  });

  it('ranks a search by how well the name matches, then by the most recently done', () => {
    const dips = makeWeightedBlueprint({ name: 'Dips' });
    const inclinePress = makeWeightedBlueprint({ name: 'Dumbbell Incline Press' });
    const backSquat = makeWeightedBlueprint({ name: 'Back Squat' });
    const hackSquat = makeWeightedBlueprint({ name: 'Hack Squat' });
    const searched = buildProgressHistory([
      session(day(9, 1), lift(dips, 0, 10)),
      session(day(9, 10), lift(hackSquat, 100, 8)),
      session(day(9, 20), lift(inclinePress, 30, 10), lift(backSquat, 120, 5)),
    ]);
    const search = (query: string) =>
      exercisesListOf(searched, catalog, today, { query, muscle: undefined }, 'kilograms').rows.map((row) => row.name);

    // Dumbbell Incline Press was done more recently, but Dips is the closer match.
    expect(search('dip')).toEqual(['Dips', 'Dumbbell Incline Press']);
    // Both names match "squat" equally well, so the one done last comes first.
    expect(search('squat')).toEqual(['Back Squat', 'Hack Squat']);
  });

  it('filters by the muscle chip, from the exercise catalog', () => {
    expect(names({ query: '', muscle: 'shoulders' })).toEqual(['Overhead Press', 'Lateral Raise']);
    // Bench's secondary muscle is the triceps, but it files under its first.
    expect(names({ query: '', muscle: 'arms' })).toEqual([]);
    expect(names({ query: 'press', muscle: 'chest' })).toEqual(['Bench Press']);
  });

  it('offers the core chip only when something logged files under it', () => {
    const withCrunch = exercisesListOf(history, catalog, today, all, 'kilograms');
    const withoutCrunch = exercisesListOf(
      history,
      { ...catalog, [stubExerciseId('Crunch')]: descriptor('Crunch') },
      today,
      all,
      'kilograms',
    );

    expect(withCrunch.muscles).toEqual(['chest', 'back', 'legs', 'shoulders', 'arms', 'core']);
    expect(withoutCrunch.muscles).toEqual(['chest', 'back', 'legs', 'shoulders', 'arms']);
  });

  it('is empty with no history', () => {
    expect(exercisesListOf(buildProgressHistory([]), catalog, today, all, 'kilograms').rows).toEqual([]);
  });
});
