import { describe, expect, it, vi } from 'vitest';
import { LocalDate } from '@js-joda/core';
import { SessionBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { emptyPotentialSet, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { LiveWorkoutFocus, setLiveWorkoutFocus } from '@/store/app';
import { applyAppEffects } from '@/store/app/effects';
import {
  decodeLiveWorkoutFocus,
  encodeLiveWorkoutFocus,
  LIVE_WORKOUT_FOCUS_KEY,
} from '@/store/app/live-workout-focus-storage';
import { RootState } from '@/store/store';
import { setIsHydrated } from '@/store/stored-sessions';
import { createAddEffectTestBed } from '@/utils/__test__/add-effect-testbed';

// The app effects also copy logs to the clipboard, a native module Node can't load.
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn() }));

function workout(): Session {
  const bp = makeWeightedBlueprint();
  return new Session(
    'w1',
    new SessionBlueprint('Pull', [bp, bp], ''),
    [
      new RecordedWeightedExercise(bp, [emptyPotentialSet()], undefined),
      new RecordedWeightedExercise(bp, [emptyPotentialSet()], undefined),
    ],
    LocalDate.of(2026, 9, 30),
    undefined,
    undefined,
  );
}

describe('live workout focus storage', () => {
  it('reads back what it wrote', () => {
    const raw = encodeLiveWorkoutFocus({ sessionId: 'w1', exerciseIndex: 1 });
    expect(JSON.parse(raw)).toEqual({ version: 1, sessionId: 'w1', exerciseIndex: 1 });
    expect(decodeLiveWorkoutFocus(raw, 'w1')).toEqual({ sessionId: 'w1', exerciseIndex: 1 });
  });

  it("ignores another workout's focus and anything it can't read", () => {
    const raw = encodeLiveWorkoutFocus({ sessionId: 'w1', exerciseIndex: 1 });
    expect(decodeLiveWorkoutFocus(raw, 'w2')).toBeUndefined();
    expect(decodeLiveWorkoutFocus('not json', 'w1')).toBeUndefined();
    expect(decodeLiveWorkoutFocus(JSON.stringify({ version: 2, sessionId: 'w1', exerciseIndex: 1 }), 'w1')).toBe(
      undefined,
    );
    expect(decodeLiveWorkoutFocus(JSON.stringify({ version: 1, sessionId: 'w1', exerciseIndex: -1 }), 'w1')).toBe(
      undefined,
    );
    expect(decodeLiveWorkoutFocus(undefined, 'w1')).toBeUndefined();
  });
});

describe('live workout focus persistence effects', () => {
  function testBed(focus: LiveWorkoutFocus | undefined, stored?: string) {
    const active = workout();
    const keyValueStore = {
      setItem: vi.fn(async () => {}),
      getItem: vi.fn(async () => stored),
    };
    const bed = createAddEffectTestBed({
      initialState: {
        app: { liveWorkoutFocus: focus },
        storedSessions: { isHydrated: true, sessions: { [active.id]: active }, activeSessionId: active.id },
      } as Partial<RootState>,
      services: { keyValueStore },
    });
    applyAppEffects(bed.addEffect);
    return { bed, keyValueStore };
  }

  it('writes the page picked', async () => {
    const { bed, keyValueStore } = testBed(undefined);

    await bed.dispatchHandled(setLiveWorkoutFocus({ sessionId: 'w1', exerciseIndex: 1 }));

    expect(keyValueStore.setItem).toHaveBeenCalledWith(
      LIVE_WORKOUT_FOCUS_KEY,
      '{"version":1,"sessionId":"w1","exerciseIndex":1}',
    );
  });

  it("puts the active workout's page back once workouts are loaded", async () => {
    const { bed } = testBed(undefined, encodeLiveWorkoutFocus({ sessionId: 'w1', exerciseIndex: 1 }));

    await bed.dispatchHandled(setIsHydrated(true));

    const restored = bed.dispatchedActions.find(setLiveWorkoutFocus.match);
    expect(restored?.payload).toEqual({ sessionId: 'w1', exerciseIndex: 1 });
  });

  it("keeps a page already picked, and ignores another workout's", async () => {
    const picked = testBed(
      { sessionId: 'w1', exerciseIndex: 0 },
      encodeLiveWorkoutFocus({ sessionId: 'w1', exerciseIndex: 1 }),
    );
    await picked.bed.dispatchHandled(setIsHydrated(true));
    const other = testBed(undefined, encodeLiveWorkoutFocus({ sessionId: 'old', exerciseIndex: 1 }));
    await other.bed.dispatchHandled(setIsHydrated(true));

    for (const { bed } of [picked, other]) {
      expect(bed.dispatchedActions.some(setLiveWorkoutFocus.match)).toBe(false);
    }
  });
});
