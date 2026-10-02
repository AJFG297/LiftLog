import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate, ZoneOffset } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { movementKeyFor, SessionBlueprint, stubExerciseId } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { Weight } from '@/models/weight';
import { filledPotentialSet, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { useProgressHistory } from '@/hooks/useProgressHistory';

const { services } = vi.hoisted(() => ({ services: { workoutRepository: undefined as unknown } }));
vi.mock('expo-router', () => ({ useIsFocused: () => true }));
vi.mock('@/components/smart/services-provider', () => ({ useServices: () => services }));

const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
const bench = makeWeightedBlueprint({ name: 'Bench' });
const benchKey = movementKeyFor(stubExerciseId('Bench'), 'WeightedExerciseBlueprint');

/** A bench workout on `date`, its one set logged that morning. */
function workout(id: string, date: LocalDate, weightKg: number): Session {
  const time = date.atTime(10, 0).atOffset(ZoneOffset.UTC);
  const exercise = new RecordedWeightedExercise(
    bench,
    [filledPotentialSet(5, time, new Weight(weightKg, 'kilograms'))],
    undefined,
  );
  return new Session(id, new SessionBlueprint('Push', [], ''), [exercise], date, undefined, undefined);
}

describe('useProgressHistory', () => {
  let repository: WorkoutRepository;

  beforeEach(async () => {
    const db = drizzle(await openDatabaseAsync(':memory:'));
    await new DatabaseMigrationService(db, logger as never, { importOldData: async () => {} }).migrate();
    repository = new WorkoutRepository(db);
    services.workoutRepository = repository;
  });

  it('is undefined while loading, then empty with no workouts', async () => {
    const { result } = renderHook(() => useProgressHistory());
    expect(result.current).toBeUndefined();

    await waitFor(() =>
      expect(result.current).toEqual({ exercises: new Map(), records: [], workouts: [], firstDate: undefined }),
    );
  });

  it('walks every finished workout in the order they happened, whatever order they were written in', async () => {
    await repository.putMany([
      workout('b', LocalDate.of(2026, 3, 8), 105),
      workout('a', LocalDate.of(2026, 3, 1), 100),
      workout('c', LocalDate.of(2026, 3, 15), 110),
    ]);

    const { result } = renderHook(() => useProgressHistory());

    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current?.firstDate).toEqual(LocalDate.of(2026, 3, 1));
    expect(result.current?.exercises.get(benchKey)?.points.map((x) => x.workoutId)).toEqual(['a', 'b', 'c']);
    expect(result.current?.workouts.map((x) => x.workoutId)).toEqual(['a', 'b', 'c']);
    expect(result.current?.records.map((x) => [x.workoutId, x.record.kind])).toEqual([
      ['b', 'heaviestWeight'],
      ['c', 'heaviestWeight'],
    ]);
  });

  it('picks up a workout written while it is on screen', async () => {
    await repository.put(workout('a', LocalDate.of(2026, 3, 1), 100));
    const { result } = renderHook(() => useProgressHistory());
    await waitFor(() => expect(result.current?.exercises.get(benchKey)?.points).toHaveLength(1));

    await act(() => repository.put(workout('b', LocalDate.of(2026, 3, 8), 105)));

    await waitFor(() => expect(result.current?.records).toHaveLength(1));
  });
});
