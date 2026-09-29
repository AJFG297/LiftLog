import { describe, expect, it } from 'vitest';
import { Duration } from '@js-joda/core';
import { applySessionBlueprintDiff, diffSessionBlueprints } from '@/models/blueprint-diff';
import { nextWarmupSet, PlannedSet, Rest, SessionBlueprint } from '@/models/blueprint-models';
import { EmptySession } from '@/models/session-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { routineChanges, routineUpdateDiff } from '@/models/routine-update';

const bench = makeWeightedBlueprint({ name: 'Bench Press', sets: 3, repsConfig: { type: 'fixed', reps: 5 } });
const press = makeWeightedBlueprint({ name: 'Overhead Press', sets: 3, repsConfig: { type: 'fixed', reps: 8 } });
const fly = makeWeightedBlueprint({ name: 'Cable Fly', sets: 3, repsConfig: { type: 'fixed', reps: 12 } });
const raise = makeWeightedBlueprint({ name: 'Lateral Raise', sets: 3, repsConfig: { type: 'fixed', reps: 12 } });
// What the live workout's Swap leaves behind: the same slot and settings under another exercise's name.
const incline = bench.with({ name: 'Incline Dumbbell Press' });

const routine = (...exercises: ReturnType<typeof makeWeightedBlueprint>[]) =>
  new SessionBlueprint('Push', exercises, '');

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

  it('lists a set added to a swapped-in exercise as its own row', () => {
    const today = routine(incline.with({ plannedSets: [planned(5), planned(5), planned(5), planned(5)] }), press);

    const rows = routineChanges(diffSessionBlueprints(routine(bench, press), today));

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'swapped', from: 'Bench Press', to: 'Incline Dumbbell Press' }),
      expect.objectContaining({ kind: 'setCount', exerciseName: 'Incline Dumbbell Press', from: 3, to: 4 }),
    ]);
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
      bench.with({ restBetweenSets: { ...Rest.medium, minRest: Duration.ofMinutes(2) }, supersetWithNext: true }),
      fly,
    );

    const rows = routineChanges(diffSessionBlueprints(routine(bench, fly), today));

    expect(rows).toEqual([
      expect.objectContaining({ kind: 'rest', from: Rest.medium.minRest, to: Duration.ofMinutes(2) }),
      expect.objectContaining({ kind: 'superset', exerciseName: 'Bench Press', grouped: true, with: 'Cable Fly' }),
    ]);
  });

  it('does not ask about the name of a workout saved as a new routine', () => {
    const rows = routineChanges(diffSessionBlueprints(EmptySession.blueprint, routine(bench)));

    expect(rows.map((row) => row.kind)).toEqual(['added']);
  });
});

describe('routineUpdateDiff', () => {
  it('swaps the exercise in its slot and keeps the sets it had', () => {
    const kept = keep(routine(bench, press, fly), routine(incline, press, fly), ['swapped']);

    expect(kept.exercises.map((e) => e.name)).toEqual(['Incline Dumbbell Press', 'Overhead Press', 'Cable Fly']);
    expect(kept.exercises[0]).toEqual(incline);
  });

  it('keeps the original exercise, with the set added today, when only the set row is kept', () => {
    const today = routine(incline.with({ plannedSets: [planned(5), planned(5), planned(5), planned(5)] }), press);

    const kept = keep(routine(bench, press), today, ['setCount']);

    expect(kept.exercises.map((e) => e.name)).toEqual(['Bench Press', 'Overhead Press']);
    expect(kept.exercises[0]).toEqual(bench.with({ plannedSets: [planned(5), planned(5), planned(5), planned(5)] }));
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
