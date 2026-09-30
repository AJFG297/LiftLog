import { describe, expect, it } from 'vitest';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Rpe } from '@/models/session-models/rpe';
import { withSetKind } from '@/models/session-models/set-entry';
import { Weight } from '@/models/weight';
import {
  DetailSetRow,
  repeatSession,
  routineFromSession,
  sessionSetRows,
  uniqueRoutineName,
} from '@/models/workout-detail';
import { sessionRecords } from '@/store/stats/personal-records';

const kg = (n: number) => new Weight(n, 'kilograms');
const at = OffsetDateTime.parse('2026-09-23T18:04:00Z');
const bench = makeWeightedBlueprint({
  name: 'Bench Press',
  exerciseId: 'bench-press',
  sets: 3,
  repsConfig: { type: 'fixed', reps: 5 },
});
const press = makeWeightedBlueprint({
  name: 'Overhead Press',
  exerciseId: 'overhead-press',
  sets: 2,
  repsConfig: { type: 'fixed', reps: 8 },
});
// This week's routine warms up before the bench.
const benchWithWarmup = bench.with({ warmupSets: [{ load: undefined, reps: 8 }] });
const fly = makeWeightedBlueprint({ name: 'Cable Fly', exerciseId: 'cable-fly', sets: 1 });

function slot(weight: number, reps: number | undefined, kind: PotentialSet['kind'] = 'working', rpe?: Rpe) {
  return PotentialSet.of({
    weight: kg(weight),
    kind,
    rpe,
    set: reps === undefined ? undefined : RecordedSet.of({ repsCompleted: reps, completionDateTime: at }),
  });
}

function exercise(blueprint: WeightedExerciseBlueprint, sets: PotentialSet[], warmups: PotentialSet[] = []) {
  return new RecordedWeightedExercise(blueprint, sets, undefined).with({ warmupSets: warmups });
}

function workout(id: string, day: number, exercises: RecordedWeightedExercise[]) {
  return new Session(
    id,
    new SessionBlueprint(
      'Push',
      exercises.map((x) => x.blueprint),
      'Chest first',
    ),
    exercises,
    LocalDate.of(2026, 9, day),
    undefined,
    undefined,
    { feel: 'good', note: 'Felt strong' },
  );
}

const lastWeek = workout('last-week', 16, [
  exercise(bench, [slot(80, 5), slot(80, 5), slot(80, 5)]),
  exercise(press, [slot(50, 5), slot(50, 5)]),
]);

// The third bench set was turned into a drop set during the workout, and the fly was added to it, through
// the same edits the workout screen makes, so the session's plan follows its sets.
const benchWithDrop = withSetKind(
  { exercise: exercise(benchWithWarmup, [slot(90, 5), slot(90, 5), slot(70, 8)], [slot(60, 8, 'warmup')]), drafts: {} },
  { list: 'working', index: 2 },
  'drop',
).exercise;
const today = workout('today', 23, [
  benchWithDrop,
  exercise(press, [slot(50, 8, 'working', 8), slot(50, 7, 'working', 9.5)]),
]).withAddedExercise(fly, false);

function describeRows(rows: DetailSetRow[] | undefined) {
  return rows?.map((row) => ({
    label: row.label.kind === 'working' ? String(row.label.number) : row.label.kind,
    weight: row.weight.value.toNumber(),
    reps: row.reps,
    rpe: row.rpe,
    oneRepMax: row.oneRepMax?.value.decimalPlaces(2).toNumber(),
    pr: row.pr,
  }));
}

describe('routineFromSession', () => {
  it("keeps the workout's exercises and sets as they ended up, under the new name", () => {
    const routine = routineFromSession(today, 'Push 2');

    expect(routine.name).toBe('Push 2');
    expect(routine.notes).toBe('Chest first');
    expect(
      routine.exercises.map((x) => ({
        name: x.name,
        exerciseId: x.exerciseId,
        warmups: x.type === 'WeightedExerciseBlueprint' ? x.warmupSets.map((s) => s.reps) : [],
        sets: x.type === 'WeightedExerciseBlueprint' ? x.plannedSets.map((s) => `${s.kind} ${s.reps.min}`) : [],
      })),
    ).toEqual([
      { name: 'Bench Press', exerciseId: 'bench-press', warmups: [8], sets: ['working 5', 'working 5', 'drop 5'] },
      { name: 'Overhead Press', exerciseId: 'overhead-press', warmups: [], sets: ['working 8', 'working 8'] },
      { name: 'Cable Fly', exerciseId: 'cable-fly', warmups: [], sets: ['working 10'] },
    ]);
  });

  it('leaves out an exercise removed during the workout', () => {
    const routine = routineFromSession(today.withRemovedExercise(1), 'Push 2');

    expect(routine.exercises.map((x) => x.name)).toEqual(['Bench Press', 'Cable Fly']);
  });
});

describe('repeatSession', () => {
  it('starts the same structure afresh as a new workout with nothing logged', () => {
    const again = repeatSession(today, LocalDate.of(2026, 9, 30), 'again');

    expect(again.id).toBe('again');
    expect(again.date.toString()).toBe('2026-09-30');
    expect(again.reflection).toBeUndefined();
    expect(again.blueprint.equals(today.blueprint)).toBe(true);
    expect(again.isStarted).toBe(false);
    expect(
      again.recordedExercises.map((x) =>
        x instanceof RecordedWeightedExercise ? x.potentialSets.map((s) => s.weight.value.toNumber()) : [],
      ),
    ).toEqual([[90, 90, 70], [50, 50], [0]]);
  });
});

describe('uniqueRoutineName', () => {
  it('keeps a free name and numbers a taken one from 2', () => {
    expect(uniqueRoutineName('Push', ['Pull', 'Legs'])).toBe('Push');
    expect(uniqueRoutineName('Push', ['Push', 'Push 2'])).toBe('Push 3');
  });
});

describe('sessionSetRows', () => {
  it('lists logged sets with labels, RPE, e1RM and the set that set each record', () => {
    const rows = sessionSetRows(today, sessionRecords(today, [lastWeek]));

    expect(rows.map(describeRows)).toEqual([
      [
        { label: 'warmup', weight: 60, reps: 8, rpe: undefined, oneRepMax: undefined, pr: false },
        // Heavier than last week's 80: a heaviest-weight record, tagged on the first set to reach it.
        { label: '1', weight: 90, reps: 5, rpe: undefined, oneRepMax: 105, pr: true },
        { label: '2', weight: 90, reps: 5, rpe: undefined, oneRepMax: 105, pr: false },
        { label: 'drop', weight: 70, reps: 8, rpe: undefined, oneRepMax: undefined, pr: false },
      ],
      [
        // Same weight, more reps: an estimated one-rep max record.
        { label: '1', weight: 50, reps: 8, rpe: 8, oneRepMax: 63.33, pr: true },
        { label: '2', weight: 50, reps: 7, rpe: 9.5, oneRepMax: 61.67, pr: false },
      ],
      [],
    ]);
  });

  it('tags nothing when there is no earlier workout to beat', () => {
    const rows = sessionSetRows(lastWeek, sessionRecords(lastWeek, []));

    expect(rows.flatMap((x) => x ?? []).filter((row) => row.pr)).toEqual([]);
  });
});
