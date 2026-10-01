import { SessionBlueprint } from '@/models/blueprint-models';
import { RemoteData } from '@/models/remote';
import { Session } from '@/models/session-models';
import { makeRecordedExercise, makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Weight } from '@/models/weight';
import { OwnActivity, ownActivityOf as ownActivityFrom, sessionVolume, volumeScaleOf } from '@/store/activity';
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

/** Just enough state for the activity selectors: no feed. Own activity is handed to them, see `ownActivityOf`. */
export function stateWith(firstDayOfWeek = DayOfWeek.MONDAY): RootState {
  return {
    feed: { feed: [], followedUsers: {}, identity: RemoteData.notAsked() },
    settings: { firstDayOfWeek },
  } as unknown as RootState;
}

/** What `WorkoutRepository.dailyActivity` and `volumeScale` would report for these finished workouts. */
export function ownActivityOf(sessions: Session[]): OwnActivity {
  const started = sessions.filter((x) => x.isStarted);
  const byDate = new Map<string, { date: LocalDate; workouts: number; volumeKg: number }>();
  for (const session of started) {
    const key = session.date.toString();
    const day = byDate.get(key) ?? { date: session.date, workouts: 0, volumeKg: 0 };
    byDate.set(key, { ...day, workouts: day.workouts + 1, volumeKg: day.volumeKg + sessionVolume(session) });
  }
  return ownActivityFrom([...byDate.values()], started.length ? volumeScaleOf(started.map(sessionVolume)) : undefined);
}
