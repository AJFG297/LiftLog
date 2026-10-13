import { describe, expect, it } from 'vitest';
import { Duration } from '@js-joda/core';
import fc from 'fast-check';
import { applySessionBlueprintDiff, diffSessionBlueprints } from '@/models/blueprint-diff';
import {
  CardioExerciseBlueprint,
  ExerciseBlueprint,
  nextWarmupSet,
  PlannedSet,
  Rest,
  SessionBlueprint,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { EmptySession } from '@/models/session-models';
import {
  makeCardioBlueprint,
  makeCardioSetBlueprint,
  makeWeightedBlueprint,
} from '@/models/session-models/__test__/helpers';
import { routineChanges, routineUpdateDiff } from '@/models/routine-update';

const bench = makeWeightedBlueprint({ name: 'Bench Press', sets: 3, repsConfig: { type: 'fixed', reps: 5 } });
const press = makeWeightedBlueprint({ name: 'Overhead Press', sets: 3, repsConfig: { type: 'fixed', reps: 8 } });
const fly = makeWeightedBlueprint({ name: 'Cable Fly', sets: 3, repsConfig: { type: 'fixed', reps: 12 } });
const raise = makeWeightedBlueprint({ name: 'Lateral Raise', sets: 3, repsConfig: { type: 'fixed', reps: 12 } });
// What the live workout's Swap leaves behind: the same slot and settings under another exercise's name.
const incline = bench.with({ name: 'Incline Dumbbell Press' });
const curl = makeWeightedBlueprint({ name: 'Curl', sets: 3, repsConfig: { type: 'fixed', reps: 12 } });
const deadlift = makeWeightedBlueprint({ name: 'Deadlift', sets: 5, repsConfig: { type: 'fixed', reps: 5 } });

const routine = (...exercises: ExerciseBlueprint[]) => new SessionBlueprint('Push', exercises, '');

const planned = (reps: number, kind: PlannedSet['kind'] = 'working'): PlannedSet => ({
  reps: { min: reps, max: reps },
  kind,
});

/** Applies the rows of `kinds` and returns the routine that results. */
function keep(original: SessionBlueprint, today: SessionBlueprint, kinds: string[]) {
  const diff = diffSessionBlueprints(original, today);
  const ids = routineChanges(diff)
    .filter((row) => kinds.includes(row.kind))
    .map((row) => row.id);
  return applySessionBlueprintDiff(original, routineUpdateDiff(diff, new Set(ids)));
}

/** Applies every row and returns the routine that results. */
function keepAll(original: SessionBlueprint, today: SessionBlueprint) {
  const diff = diffSessionBlueprints(original, today);
  const ids = routineChanges(diff).map((row) => row.id);
  return applySessionBlueprintDiff(original, routineUpdateDiff(diff, new Set(ids)));
}

/** The exercise with its rep targets erased: the sheet keeps the routine's targets by design. */
function withoutRepTargets(exercise: ExerciseBlueprint): ExerciseBlueprint {
  return exercise instanceof WeightedExerciseBlueprint
    ? exercise.with({ plannedSets: exercise.plannedSets.map((set) => ({ ...set, reps: { min: 1, max: 1 } })) })
    : exercise;
}

const weighted = (name: string, sets: number, reps: number, rest: Rest = Rest.medium) =>
  makeWeightedBlueprint({ name, sets, repsConfig: { type: 'fixed', reps }, restBetweenSets: rest });
const cardio = (name: string, sets = 1) =>
  new CardioExerciseBlueprint(
    name,
    Array.from({ length: sets }, () => makeCardioSetBlueprint()),
    '',
    '',
  );

describe('routineChanges', () => {
  it('lists nothing when only rep targets moved', () => {
    const today = routine(bench.with({ plannedSets: [planned(6), planned(6), planned(6)] }), press);

    expect(routineChanges(diffSessionBlueprints(routine(bench, press), today))).toEqual([]);
  });

  it('lists an added exercise with its set count and the exercise before it', () => {
    const rows = routineChanges(diffSessionBlueprints(routine(bench, fly), routine(bench, fly, raise)));

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'added', exerciseName: 'Lateral Raise', sets: 3, after: 'Cable Fly' }),
    ]);
  });

  it('lists a removed exercise', () => {
    const rows = routineChanges(diffSessionBlueprints(routine(bench, fly), routine(bench)));

    expect(rows).toEqual([expect.objectContaining({ kind: 'removed', exerciseName: 'Cable Fly' })]);
  });

  it('lists an exercise swapped in its slot as one row', () => {
    const rows = routineChanges(diffSessionBlueprints(routine(bench, press, fly), routine(incline, press, fly)));

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'swapped', from: 'Bench Press', to: 'Incline Dumbbell Press' }),
    ]);
  });

  it('pairs only one of two exercises removed from the slot a new one took', () => {
    const rows = routineChanges(
      diffSessionBlueprints(routine(bench, curl, fly, press), routine(bench, deadlift, press)),
    );

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'swapped', from: 'Curl', to: 'Deadlift' }),
      expect.objectContaining({ kind: 'removed', exerciseName: 'Cable Fly' }),
    ]);
  });

  it('does not pair a cardio exercise with a weighted one', () => {
    const run = makeCardioBlueprint();
    const rows = routineChanges(
      diffSessionBlueprints(
        new SessionBlueprint('Push', [bench, press], ''),
        new SessionBlueprint('Push', [run, press], ''),
      ),
    );

    expect(rows.map((row) => row.kind)).toEqual(['added', 'removed']);
  });

  it('keeps a removal and an addition elsewhere as two rows', () => {
    const rows = routineChanges(diffSessionBlueprints(routine(bench, press, fly), routine(bench, fly, raise)));

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'added', exerciseName: 'Lateral Raise' }),
      expect.objectContaining({ kind: 'removed', exerciseName: 'Overhead Press' }),
    ]);
  });

  it('does not call an exercise added at the top a reorder', () => {
    const rows = routineChanges(diffSessionBlueprints(routine(bench, press), routine(raise, bench, press)));

    expect(rows.map((row) => row.kind)).toEqual(['added']);
  });

  it('lists a swap of two exercises as one order row', () => {
    const rows = routineChanges(diffSessionBlueprints(routine(bench, press, fly), routine(press, bench, fly)));

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'order', order: ['Overhead Press', 'Bench Press', 'Cable Fly'] }),
    ]);
  });

  it('splits a set count change from a set type change on the same exercise', () => {
    const today = routine(press.with({ plannedSets: [planned(8), planned(8), planned(8, 'drop'), planned(8)] }));

    const rows = routineChanges(diffSessionBlueprints(routine(press), today));

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'setCount', exerciseName: 'Overhead Press', from: 3, to: 4 }),
      expect.objectContaining({ kind: 'setTypes', from: ['1', '2', '3'], to: ['1', '2', 'D'] }),
    ]);
  });

  it('lists a change in the number of warm-ups but not in their loads', () => {
    const warm = bench.with({ warmupSets: [nextWarmupSet('external', [])] });
    const heavierWarmup = bench.with({ warmupSets: [{ load: { type: 'percent', percent: 60 }, reps: 5 }] });

    expect(routineChanges(diffSessionBlueprints(routine(bench), routine(warm)))).toEqual([
      expect.objectContaining({ kind: 'warmups', exerciseName: 'Bench Press', from: 0, to: 1 }),
    ]);
    expect(routineChanges(diffSessionBlueprints(routine(warm), routine(heavierWarmup)))).toEqual([]);
  });

  it('lists rest with the shown rest time and a superset with its partner', () => {
    const today = routine(
      bench.with({ restBetweenSets: { ...Rest.medium, rest: Duration.ofMinutes(2) }, supersetWithNext: true }),
      fly,
    );

    const rows = routineChanges(diffSessionBlueprints(routine(bench, fly), today));

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'rest', from: Rest.medium.rest, to: Duration.ofMinutes(2) }),
      expect.objectContaining({ kind: 'superset', exerciseName: 'Bench Press', grouped: true, with: 'Cable Fly' }),
    ]);
  });

  it('does not ask about the name of a workout saved as a new routine', () => {
    const rows = routineChanges(diffSessionBlueprints(EmptySession.blueprint, routine(bench)));

    expect(rows.map((row) => row.kind)).toEqual(['added']);
  });
});

describe('routineUpdateDiff', () => {
  it('swaps in today’s exercise whole, sets included', () => {
    const today = routine(
      incline.with({ plannedSets: [planned(10), planned(10), planned(10), planned(10)] }),
      press,
      fly,
    );

    const kept = keep(routine(bench, press, fly), today, ['swapped']);

    expect(kept.exercises).toEqual(today.exercises);
  });

  it('leaves both exercises out of the change when the swap is not kept', () => {
    expect(keep(routine(bench, press), routine(incline, press), [])).toEqual(routine(bench, press));
  });

  it('gives today’s exercises back when every row is kept', () => {
    const all = [
      'added',
      'removed',
      'swapped',
      'order',
      'setCount',
      'setTypes',
      'warmups',
      'rest',
      'superset',
      'other',
    ];
    const cases = [
      [routine(bench, curl), routine(bench, deadlift)],
      [routine(bench, curl, fly, press), routine(bench, deadlift, press)],
      [
        routine(bench, press),
        routine(incline.with({ plannedSets: [planned(10), planned(10), planned(10), planned(10)] }), press),
      ],
    ];

    for (const [original, today] of cases) {
      expect(keep(original!, today!, all).exercises).toEqual(today!.exercises);
    }
  });

  it('keeps an added set without taking the rep changes made today', () => {
    const today = routine(press.with({ plannedSets: [planned(10), planned(10), planned(10), planned(9)] }));

    const updated = keep(routine(press), today, ['setCount']);

    expect(updated.exercises[0]).toMatchObject({ plannedSets: [planned(8), planned(8), planned(8), planned(9)] });
  });

  it('keeps a changed set type without the added set when only the type is kept', () => {
    const today = routine(press.with({ plannedSets: [planned(8), planned(8), planned(8, 'failure'), planned(8)] }));

    const updated = keep(routine(press), today, ['setTypes']);

    expect(updated.exercises[0]).toMatchObject({ plannedSets: [planned(8), planned(8), planned(8, 'failure')] });
  });

  it('adds an exercise at its place without reordering the rest', () => {
    const updated = keep(routine(bench, press), routine(raise, bench, press), ['added']);

    expect(updated.exercises.map((x) => x.name)).toEqual(['Lateral Raise', 'Bench Press', 'Overhead Press']);
  });

  it('leaves the order alone when the order row is not kept', () => {
    const today = routine(press, bench, fly, raise);

    const updated = keep(routine(bench, press, fly), today, ['added']);

    expect(updated.exercises.map((x) => x.name)).toEqual([
      'Bench Press',
      'Overhead Press',
      'Cable Fly',
      'Lateral Raise',
    ]);
  });

  it('applies the new order when the order row is kept', () => {
    const updated = keep(routine(bench, press, fly), routine(press, bench, fly), ['order']);

    expect(updated.exercises.map((x) => x.name)).toEqual(['Overhead Press', 'Bench Press', 'Cable Fly']);
  });

  it('keeps the warm-ups the routine had and adds today’s extra one', () => {
    const planWarmup = { load: { type: 'percent' as const, percent: 40 }, reps: 5 };
    const today = routine(
      bench.with({
        warmupSets: [
          { load: { type: 'percent', percent: 50 }, reps: 5 },
          { load: { type: 'percent', percent: 70 }, reps: 3 },
        ],
      }),
    );

    const updated = keep(routine(bench.with({ warmupSets: [planWarmup] })), today, ['warmups']);

    expect(updated.exercises[0]).toMatchObject({
      warmupSets: [planWarmup, { load: { type: 'percent', percent: 70 }, reps: 3 }],
    });
  });

  it('changes nothing when no row is kept', () => {
    const original = routine(bench, press);
    const today = routine(press.with({ supersetWithNext: true }), bench, raise);

    expect(keep(original, today, []).equals(original)).toBe(true);
  });
});

describe('routines with two exercises of the same name', () => {
  const r180 = { ...Rest.medium, rest: Duration.ofSeconds(180) };
  const r90 = { ...Rest.medium, rest: Duration.ofSeconds(90) };

  it.each<[string, SessionBlueprint, SessionBlueprint]>([
    [
      'a duplicate removed while its twins move',
      routine(weighted('E', 3, 10), cardio('C'), weighted('A', 3, 10), cardio('E'), weighted('E', 5, 10)),
      routine(cardio('C'), weighted('A', 3, 10), cardio('E'), weighted('E', 3, 10)),
    ],
    [
      'two duplicates moved to different slots around a swap',
      routine(
        weighted('D', 3, 10),
        weighted('A', 1, 12, r180),
        weighted('C', 3, 10),
        weighted('B', 3, 10),
        weighted('A', 2, 10, r90),
        weighted('E', 3, 10),
      ),
      routine(
        weighted('G', 3, 10),
        weighted('C', 3, 10),
        weighted('B', 3, 10),
        weighted('A', 2, 10, r90),
        weighted('E', 3, 10),
        weighted('A', 1, 12, r180),
      ),
    ],
    [
      'an exercise moved above two duplicates',
      routine(weighted('Bench', 5, 5), weighted('Row', 3, 10), weighted('Bench', 3, 12)),
      routine(weighted('Row', 3, 10), weighted('Bench', 5, 5), weighted('Bench', 3, 12)),
    ],
  ])('rebuilds today’s workout when every row is kept: %s', (_, original, today) => {
    expect(keepAll(original, today).exercises).toEqual(today.exercises);
  });

  it('lists a removed duplicate and the new order, not a change of type', () => {
    const original = routine(
      weighted('E', 3, 10),
      cardio('C'),
      weighted('A', 3, 10),
      cardio('E'),
      weighted('E', 5, 10),
    );
    const today = routine(cardio('C'), weighted('A', 3, 10), cardio('E'), weighted('E', 3, 10));

    const rows = routineChanges(diffSessionBlueprints(original, today));

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'removed', exerciseName: 'E' }),
      expect.objectContaining({ kind: 'order', order: ['C', 'A', 'E', 'E'] }),
    ]);
  });

  it('calls two same-named exercises done in the other order a reorder', () => {
    const original = routine(weighted('E', 3, 10), cardio('E'));
    const today = routine(cardio('E'), weighted('E', 3, 10));

    const rows = routineChanges(diffSessionBlueprints(original, today));

    expect(rows).toEqual([expect.objectContaining({ kind: 'order', order: ['E', 'E'] })]);
    expect(keepAll(original, today).exercises).toEqual(today.exercises);
  });

  const name = fc.constantFrom('A', 'B', 'C', 'D');
  const weightedArb = fc
    .record({
      name,
      sets: fc.integer({ min: 1, max: 4 }),
      reps: fc.constantFrom(5, 8, 12),
      rest: fc.constantFrom(Rest.short, Rest.medium, Rest.long),
      superset: fc.boolean(),
      lastSetKind: fc.constantFrom<PlannedSet['kind']>('working', 'drop'),
    })
    .map(({ name, sets, reps, rest, superset, lastSetKind }) =>
      weighted(name, sets, reps, rest).with({
        supersetWithNext: superset,
        plannedSets: Array.from({ length: sets }, (_, i) => planned(reps, i === sets - 1 ? lastSetKind : 'working')),
      }),
    );
  const cardioArb = fc.record({ name, sets: fc.integer({ min: 1, max: 3 }), distance: fc.boolean() }).map(
    ({ name, sets, distance }) =>
      new CardioExerciseBlueprint(
        name,
        Array.from({ length: sets }, () => makeCardioSetBlueprint({ trackDistance: distance })),
        '',
        '',
      ),
  );
  const session = fc
    .array(fc.oneof(weightedArb, cardioArb), { minLength: 0, maxLength: 6 })
    .map((exercises) => routine(...exercises));

  it('rebuilds today’s workout, rep targets aside, when every row is kept', () => {
    fc.assert(
      fc.property(session, session, (original, today) => {
        expect(keepAll(original, today).exercises.map(withoutRepTargets)).toEqual(
          today.exercises.map(withoutRepTargets),
        );
      }),
      { numRuns: 500 },
    );
  });

  it('leaves the routine as it was when no row is kept', () => {
    fc.assert(
      fc.property(session, session, (original, today) => {
        expect(keep(original, today, []).equals(original)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});
