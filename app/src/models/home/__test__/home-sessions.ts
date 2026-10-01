import { SessionBlueprint } from '@/models/blueprint-models';
import { RemoteData } from '@/models/remote';
import { Session } from '@/models/session-models';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import { RootState } from '@/store/store';
import { DayOfWeek, LocalDate, LocalTime, ZoneOffset } from '@js-joda/core';

let nextId = 0;

/**
 * A finished workout of one exercise: `sets` sets of 10 reps at `kg`, the first logged at `at` and the
 * last `minutes` later. Leave `logged` false for a workout that was opened and never started.
 */
export function workout(
  name: string,
  date: LocalDate,
  { kg = 100, sets = 3, minutes = 40, at = LocalTime.of(18, 0), logged = true, exercise = 'Squat' } = {},
): Session {
  const blueprint = makeWeightedBlueprint({ name: exercise, sets });
  const start = date.atTime(at).atOffset(ZoneOffset.UTC);
  const recorded = makeRecordedExercise(
    blueprint,
    Array.from({ length: sets }, () => (logged ? 10 : undefined)),
    new Weight(kg, 'kilograms'),
    (index) => start.plusSeconds(sets > 1 ? Math.round((minutes * 60 * index) / (sets - 1)) : 0),
  );
  nextId += 1;
  return new Session(
    `workout-${nextId}`,
    new SessionBlueprint(name, [blueprint], ''),
    [recorded],
    date,
    undefined,
    undefined,
  );
}

/** Just enough state for the activity selectors: these sessions, no feed. */
export function stateWith(sessions: Session[], firstDayOfWeek = DayOfWeek.MONDAY): RootState {
  return {
    feed: { feed: [], followedUsers: {}, identity: RemoteData.notAsked() },
    storedSessions: {
      sessions: Object.fromEntries(sessions.map((session) => [session.id, session])),
      activeSessionId: undefined,
    },
    settings: { firstDayOfWeek },
  } as unknown as RootState;
}
