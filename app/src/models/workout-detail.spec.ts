import { describe, expect, it } from 'vitest';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { PotentialSet, RecordedSet, RecordedWeightedExercise, Session } from '@/models/session-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
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
const fly = makeWeightedBlueprint({ name: 'Cable Fly', exerciseId: 'cable-fly', sets: 1 });

function slot(weight: number, reps: number | undefined, kind: PotentialSet['kind'] = 'working') {
  return PotentialSet.of({
    weight: kg(weight),
    kind,
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

const today = workout('today', 23, [
  exercise(bench, [slot(90, 5), slot(90, 5), slot(70, 8, 'drop')], [slot(60, 8, 'warmup')]),
  exercise(press, [slot(50, 8), slot(50, 7)]),
]).withAddedExercise(fly, false);

function describeRows(rows: DetailSetRow[] | undefined) {
  return rows?.map((row) => ({
    label: row.label.kind === 'working' ? String(row.label.number) : row.label.kind,
    weight: row.weight.value.toNumber(),
    reps: row.reps,
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
        sets: x.type === 'WeightedExerciseBlueprint' ? x.plannedSets.map((s) => `${s.kind} ${s.reps.min}`) : [],
      })),
    ).toEqual([
      { name: 'Bench Press', exerciseId: 'bench-press', sets: ['working 5', 'working 5', 'working 5'] },
      { name: 'Overhead Press', exerciseId: 'overhead-press', sets: ['working 8', 'working 8'] },
      { name: 'Cable Fly', exerciseId: 'cable-fly', sets: ['working 10'] },
    ]);
  });

  it('is the same structure a routine update would save', () => {
    expect(routineFromSession(today, 'Push').equals(today.blueprint)).toBe(true);
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
  it('lists logged sets with labels, e1RM and the set that set each record', () => {
    const rows = sessionSetRows(today, sessionRecords(today, [lastWeek]));

    expect(rows.map(describeRows)).toEqual([
      [
        { label: 'warmup', weight: 60, reps: 8, oneRepMax: undefined, pr: false },
        // Heavier than last week's 80: a heaviest-weight record, tagged on the first set to reach it.
        { label: '1', weight: 90, reps: 5, oneRepMax: 105, pr: true },
        { label: '2', weight: 90, reps: 5, oneRepMax: 105, pr: false },
        { label: 'drop', weight: 70, reps: 8, oneRepMax: undefined, pr: false },
      ],
      [
        // Same weight, more reps: an estimated one-rep max record.
        { label: '1', weight: 50, reps: 8, oneRepMax: 63.33, pr: true },
        { label: '2', weight: 50, reps: 7, oneRepMax: 61.67, pr: false },
      ],
      [],
    ]);
  });

  it('tags nothing when there is no earlier workout to beat', () => {
    const rows = sessionSetRows(lastWeek, sessionRecords(lastWeek, []));

    expect(rows.flatMap((x) => x ?? []).filter((row) => row.pr)).toEqual([]);
  });
});
