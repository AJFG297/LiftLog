import { describe, expect, it } from 'vitest';
import { Duration, LocalDate } from '@js-joda/core';
import { Rest, SessionBlueprint } from '@/models/blueprint-models';
import {
  canRemoveRoutineSet,
  routineSetIndexOf,
  routineSetRowsOf,
  withRoutineSetAdded,
  withRoutineSetKind,
  withRoutineSetRemoved,
  withRoutineSetReps,
} from '@/components/presentation/workout-editor/routine-sets';
import { daysAgoOf, estimatedMinutesOf, totalSetsOf } from '@/components/presentation/workout-editor/routine-summary';
import { makeCardioBlueprint, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';

const bench = () =>
  makeWeightedBlueprint({
    name: 'Bench',
    sets: 3,
    repsConfig: { type: 'fixed', reps: 5 },
    warmupSets: [{ load: { type: 'percent', percent: 50 }, reps: 8 }],
  });

describe('routine set rows', () => {
  it('lists warm-ups first, then the working list', () => {
    expect(
      routineSetRowsOf(bench()).map((row) => [row.position.list, row.position.index, row.kind, row.reps.max]),
    ).toEqual([
      ['warmup', 0, 'warmup', 8],
      ['working', 0, 'working', 5],
      ['working', 1, 'working', 5],
      ['working', 2, 'working', 5],
    ]);
  });

  it('finds a set among freshly built rows by its position', () => {
    const rows = routineSetRowsOf(bench());
    expect(routineSetIndexOf(rows, { list: 'working', index: 0 })).toBe(1);
    expect(routineSetIndexOf(rows, { list: 'warmup', index: 0 })).toBe(0);
    expect(routineSetIndexOf(rows, { list: 'working', index: 3 })).toBe(-1);
  });

  it('turns a working set into a warm-up at the end of the warm-ups', () => {
    const changed = withRoutineSetKind(bench(), { list: 'working', index: 2 }, 'warmup');
    expect(changed.plannedSets).toHaveLength(2);
    expect(changed.warmupSets).toEqual([
      { load: { type: 'percent', percent: 50 }, reps: 8 },
      { load: { type: 'percent', percent: 70 }, reps: 5 },
    ]);
  });

  it('turns a warm-up into the first working set', () => {
    const changed = withRoutineSetKind(bench(), { list: 'warmup', index: 0 }, 'failure');
    expect(changed.warmupSets).toEqual([]);
    expect(changed.plannedSets[0]).toEqual({ reps: { min: 8, max: 8 }, kind: 'failure' });
    expect(changed.plannedSets).toHaveLength(4);
  });

  it('changes a working-list kind in place', () => {
    expect(withRoutineSetKind(bench(), { list: 'working', index: 1 }, 'drop').plannedSets.map((s) => s.kind)).toEqual([
      'working',
      'drop',
      'working',
    ]);
  });

  it('keeps the last working set', () => {
    const single = makeWeightedBlueprint({ sets: 1 });
    expect(canRemoveRoutineSet(single, { list: 'working', index: 0 })).toBe(false);
    expect(withRoutineSetRemoved(single, { list: 'working', index: 0 }).plannedSets).toHaveLength(1);
    expect(withRoutineSetKind(single, { list: 'working', index: 0 }, 'warmup').plannedSets).toHaveLength(1);
  });

  it('removes a warm-up or a working set', () => {
    expect(withRoutineSetRemoved(bench(), { list: 'warmup', index: 0 }).warmupSets).toEqual([]);
    expect(withRoutineSetRemoved(bench(), { list: 'working', index: 0 }).plannedSets).toHaveLength(2);
  });

  it('adds a working set on the last set’s reps', () => {
    const pyramid = makeWeightedBlueprint({
      sets: 2,
      repsConfig: {
        type: 'perSet',
        targets: [
          { min: 10, max: 10 },
          { min: 8, max: 8 },
        ],
      },
    });
    expect(withRoutineSetAdded(pyramid).plannedSets.map((s) => s.reps)).toEqual([
      { min: 10, max: 10 },
      { min: 8, max: 8 },
      { min: 8, max: 8 },
    ]);
  });

  it('sets one row’s reps, keeping a band in order', () => {
    expect(
      withRoutineSetReps(bench(), { list: 'working', index: 1 }, { min: 12, max: 8 }).plannedSets.map((s) => s.reps),
    ).toEqual([
      { min: 5, max: 5 },
      { min: 8, max: 12 },
      { min: 5, max: 5 },
    ]);
    expect(withRoutineSetReps(bench(), { list: 'warmup', index: 0 }, { min: 6, max: 6 }).warmupSets[0]!.reps).toBe(6);
  });
});

describe('routine summary', () => {
  it('counts sets with warm-ups and estimates the time', () => {
    const routine = new SessionBlueprint(
      'Push',
      [
        bench().with({ restBetweenSets: { ...Rest.medium, minRest: Duration.ofSeconds(150) } }),
        makeWeightedBlueprint({ sets: 3, restBetweenSets: { ...Rest.short, minRest: Duration.ofSeconds(60) } }),
      ],
      '',
    );
    expect(totalSetsOf(routine)).toBe(7);
    // 4 × (45 + 150) + 3 × (45 + 60) = 1095 s, about 18 minutes, so 20.
    expect(estimatedMinutesOf(routine)).toBe(20);
    expect(estimatedMinutesOf(new SessionBlueprint('Empty', [], ''))).toBe(0);
  });

  it('guesses 10 minutes for a distance set', () => {
    expect(estimatedMinutesOf(new SessionBlueprint('Row', [makeCardioBlueprint(1)], ''))).toBe(10);
  });

  it('says how long ago in days, then weeks, then gives up', () => {
    const today = LocalDate.of(2025, 4, 30);
    expect(daysAgoOf(today, today)).toEqual({ unit: 'today' });
    expect(daysAgoOf(LocalDate.of(2025, 4, 29), today)).toEqual({ unit: 'yesterday' });
    expect(daysAgoOf(LocalDate.of(2025, 4, 27), today)).toEqual({ unit: 'days', count: 3 });
    expect(daysAgoOf(LocalDate.of(2025, 4, 16), today)).toEqual({ unit: 'weeks', count: 2 });
    expect(daysAgoOf(LocalDate.of(2025, 1, 1), today)).toEqual({ unit: 'date' });
  });
});
