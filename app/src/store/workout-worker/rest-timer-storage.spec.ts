import { describe, expect, it, vi } from 'vitest';
import { Duration, LocalDate, OffsetDateTime } from '@js-joda/core';
import { SessionBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, RestTimer, Session } from '@/models/session-models';
import { emptyPotentialSet, filledPotentialSet, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { RootState } from '@/store/store';
import { setIsHydrated, updateStoredSession } from '@/store/stored-sessions';
import { activeSessionUpdated } from '@/store/workout-worker';
import { applyWorkoutWorkerEffects } from '@/store/workout-worker/effects';
import { ACTIVE_REST_TIMER_KEY, decodeRestTimer, encodeRestTimer } from '@/store/workout-worker/rest-timer-storage';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';

const startedAt = OffsetDateTime.parse('2026-09-29T10:00:00Z');

function workout(timer: RestTimer | undefined): Session {
  const bp = makeWeightedBlueprint();
  const exercise = new RecordedWeightedExercise(
    bp,
    [filledPotentialSet(10, startedAt), emptyPotentialSet()],
    undefined,
  );
  return new Session(
    'w1',
    new SessionBlueprint('Push', [bp], ''),
    [exercise],
    LocalDate.of(2026, 9, 29),
    undefined,
    timer,
  );
}

describe('rest timer storage', () => {
  it('reads back what it wrote, picked length included', () => {
    const raw = encodeRestTimer('w1', new RestTimer(startedAt, Duration.ofSeconds(90)));
    expect(JSON.parse(raw)).toEqual({ version: 1, sessionId: 'w1', startedAt: '2026-09-29T10:00Z', lengthMs: 90000 });
    const timer = decodeRestTimer(raw, 'w1')!;
    expect(timer.startedAt.toString()).toBe('2026-09-29T10:00Z');
    expect(timer.length!.toMillis()).toBe(90000);
  });

  it("ignores another workout's timer and anything it can't read", () => {
    const raw = encodeRestTimer('w1', new RestTimer(startedAt));
    expect(decodeRestTimer(raw, 'w2')).toBeUndefined();
    expect(decodeRestTimer('not json', 'w1')).toBeUndefined();
    expect(decodeRestTimer(JSON.stringify({ version: 2, sessionId: 'w1', startedAt: 'x' }), 'w1')).toBeUndefined();
    expect(decodeRestTimer(undefined, 'w1')).toBeUndefined();
  });
});

describe('rest timer persistence effects', () => {
  function testBed(isHydrated: boolean, active?: Session, stored?: string) {
    const keyValueStore = {
      setItem: vi.fn(async () => {}),
      removeItem: vi.fn(async () => {}),
      getItem: vi.fn(async () => stored),
    };
    const bed = createAddEffectTestBed({
      initialState: {
        settings: { restNotifications: false, restTimersEnabled: true },
        storedSessions: {
          isHydrated,
          sessions: active ? { [active.id]: active } : {},
          activeSessionId: active?.id,
        },
      } as Partial<RootState>,
      services: { keyValueStore, workoutWorkerService: { broadcast: vi.fn() } },
    });
    applyWorkoutWorkerEffects(bed.addEffect);
    return { bed, keyValueStore };
  }

  it('writes the timer when it starts or changes', async () => {
    const { bed, keyValueStore } = testBed(true);
    const before = workout(undefined);
    const after = workout(new RestTimer(startedAt, Duration.ofSeconds(60)));

    await bed.dispatchHandled(activeSessionUpdated({ before, after }));

    expect(keyValueStore.setItem).toHaveBeenCalledWith(
      ACTIVE_REST_TIMER_KEY,
      '{"version":1,"sessionId":"w1","startedAt":"2026-09-29T10:00Z","lengthMs":60000}',
    );
  });

  it('removes it when the rest is skipped or the workout ends', async () => {
    const { bed, keyValueStore } = testBed(true);
    const running = workout(new RestTimer(startedAt));

    await bed.dispatchHandled(activeSessionUpdated({ before: running, after: workout(undefined) }));
    await bed.dispatchHandled(activeSessionUpdated({ before: running, after: undefined }));

    expect(keyValueStore.removeItem).toHaveBeenCalledTimes(2);
    expect(keyValueStore.setItem).not.toHaveBeenCalled();
  });

  it('writes nothing for an update that leaves the timer alone, or before hydration', async () => {
    const running = workout(new RestTimer(startedAt));
    const hydrated = testBed(true);
    await hydrated.bed.dispatchHandled(
      activeSessionUpdated({ before: running, after: workout(new RestTimer(startedAt)) }),
    );
    const hydrating = testBed(false);
    await hydrating.bed.dispatchHandled(activeSessionUpdated({ before: undefined, after: workout(undefined) }));

    for (const { keyValueStore } of [hydrated, hydrating]) {
      expect(keyValueStore.setItem).not.toHaveBeenCalled();
      expect(keyValueStore.removeItem).not.toHaveBeenCalled();
    }
  });

  it("puts the active workout's timer back once workouts are loaded", async () => {
    const stored = encodeRestTimer('w1', new RestTimer(startedAt, Duration.ofSeconds(90)));
    const { bed } = testBed(true, workout(undefined), stored);

    await bed.dispatchHandled(setIsHydrated(true));

    const update = bed.dispatchedActions.find(updateStoredSession.match)!;
    expect(update.payload.sessionId).toBe('w1');
    const restored = update.payload.update(workout(undefined)).restTimer!;
    expect(restored.startedAt.toString()).toBe('2026-09-29T10:00Z');
    expect(restored.length!.toMillis()).toBe(90000);
  });

  it('restores nothing without a stored timer for the active workout', async () => {
    const { bed } = testBed(true, workout(undefined), encodeRestTimer('other', new RestTimer(startedAt)));

    await bed.dispatchHandled(setIsHydrated(true));

    expect(bed.dispatchedActions.some(updateStoredSession.match)).toBe(false);
  });
});
