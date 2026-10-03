import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';
import { LocalDate } from '@js-joda/core';
import { DatabaseMigrationService } from '@/services/database-migration-service';
import { WorkoutRepository } from '@/services/workout-repository';
import { Session } from '@/models/session-models';
import { makeSession, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { useWorkoutQuery } from '@/hooks/useWorkoutQuery';

const { focus, services } = vi.hoisted(() => ({
  focus: { isFocused: true },
  services: { workoutRepository: undefined as unknown },
}));
vi.mock('expo-router', () => ({ useIsFocused: () => focus.isFocused }));
vi.mock('@/components/smart/services-provider', () => ({ useServices: () => services }));

const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };

function workout(name: string, date = LocalDate.of(2026, 4, 10)): Session {
  return makeSession([makeWeightedBlueprint()], date).withName(name);
}

describe('useWorkoutQuery', () => {
  let repository: WorkoutRepository;
  /** The query the hook runs: the names of every finished workout, and how often it was asked. */
  let asked: number;
  const names = async (repo: WorkoutRepository) => {
    asked++;
    return (await repo.finishedBetween(LocalDate.of(2026, 1, 1), LocalDate.of(2026, 12, 31))).map(
      (x) => x.blueprint.name,
    );
  };

  beforeEach(async () => {
    const db = drizzle(await openDatabaseAsync(':memory:'));
    await new DatabaseMigrationService(db, logger as never, { importOldData: async () => {} }).migrate();
    repository = new WorkoutRepository(db);
    services.workoutRepository = repository;
    focus.isFocused = true;
    asked = 0;
    await repository.put(workout('First'));
  });

  it('answers the query, then again after a write lands', async () => {
    const { result } = renderHook(() => useWorkoutQuery(names, []));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toEqual(['First']));

    await act(() => repository.put(workout('Second', LocalDate.of(2026, 4, 11))));

    await waitFor(() => expect(result.current).toEqual(['Second', 'First']));
    expect(asked).toBe(2);
  });

  it('keeps the last answer on screen while the refresh is in flight', async () => {
    // The second run waits for the test to let it through, so the in-flight state can be observed.
    let release = () => {};
    const gated = async (repo: WorkoutRepository) => {
      const run = asked + 1;
      const result = await names(repo);
      if (run === 2) {
        await new Promise<void>((resolve) => (release = resolve));
      }
      return result;
    };
    const { result } = renderHook(() => useWorkoutQuery(gated, []));
    await waitFor(() => expect(result.current).toEqual(['First']));

    await act(() => repository.put(workout('Second', LocalDate.of(2026, 4, 11))));

    expect(asked).toBe(2);
    expect(result.current).toEqual(['First']);
    act(() => release());
    await waitFor(() => expect(result.current).toEqual(['Second', 'First']));
  });

  it('only counts writes while unfocused, and re-queries once on return', async () => {
    const { result, rerender } = renderHook(() => useWorkoutQuery(names, []));
    await waitFor(() => expect(result.current).toEqual(['First']));

    focus.isFocused = false;
    rerender();
    await act(() => repository.put(workout('Second', LocalDate.of(2026, 4, 11))));
    await act(() => repository.put(workout('Third', LocalDate.of(2026, 4, 12))));
    expect(asked).toBe(1);
    expect(result.current).toEqual(['First']);

    focus.isFocused = true;
    rerender();
    await waitFor(() => expect(result.current).toEqual(['Third', 'Second', 'First']));
    expect(asked).toBe(2);
  });

  it('does not re-query on return when nothing was written', async () => {
    const { result, rerender } = renderHook(() => useWorkoutQuery(names, []));
    await waitFor(() => expect(result.current).toEqual(['First']));

    focus.isFocused = false;
    rerender();
    focus.isFocused = true;
    rerender();
    await act(() => Promise.resolve());

    expect(asked).toBe(1);
  });

  it('leaves a write alone when told it cannot change the answer', async () => {
    const ignored = workout('Ignored', LocalDate.of(2026, 4, 11));
    const { result } = renderHook(() =>
      useWorkoutQuery(names, [], { ignoreWrite: (write) => write.workoutIds.every((id) => id === ignored.id) }),
    );
    await waitFor(() => expect(result.current).toEqual(['First']));

    await act(() => repository.put(ignored));
    await act(() => Promise.resolve());
    expect(asked).toBe(1);

    await act(() => repository.put(workout('Counted', LocalDate.of(2026, 4, 12))));
    await waitFor(() => expect(result.current).toEqual(['Counted', 'Ignored', 'First']));
    expect(asked).toBe(2);
  });

  it('starts over when its inputs change, so a stale answer is never shown under new inputs', async () => {
    await repository.put(workout('May', LocalDate.of(2026, 5, 3)));
    const inMonth = async (repo: WorkoutRepository, month: number) => {
      asked++;
      const first = LocalDate.of(2026, month, 1);
      return (await repo.finishedBetween(first, first.plusMonths(1).minusDays(1))).map((x) => x.blueprint.name);
    };
    const { result, rerender } = renderHook(({ month }) => useWorkoutQuery((repo) => inMonth(repo, month), [month]), {
      initialProps: { month: 4 },
    });
    await waitFor(() => expect(result.current).toEqual(['First']));

    rerender({ month: 5 });

    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toEqual(['May']));
    expect(asked).toBe(2);
  });

  it('keeps the last answer under new inputs when asked to, as a list growing a page does', async () => {
    await repository.putMany([2, 3].map((day) => workout(`Day ${day}`, LocalDate.of(2026, 4, day))));
    const firstOf = (repo: WorkoutRepository, limit: number) => names(repo).then((all) => all.slice(0, limit));
    const { result, rerender } = renderHook(
      ({ limit }) => useWorkoutQuery((repo) => firstOf(repo, limit), [limit], { keepPrevious: true }),
      { initialProps: { limit: 1 } },
    );
    await waitFor(() => expect(result.current).toEqual(['First']));

    rerender({ limit: 2 });

    expect(result.current).toEqual(['First']);
    await waitFor(() => expect(result.current).toEqual(['First', 'Day 3']));
  });
});
