import { describe, expect, it } from 'vitest';
import { Instant, LocalDate } from '@js-joda/core';
import { NO_OWN_ACTIVITY, ownActivityOf, OwnActivity, selectFollowingActivity } from '@/store/activity';
import { FollowedFeedUser, SessionUserEvent } from '@/models/feed-models';
import { RemoteData } from '@/models/remote';
import { AesKey, RsaPublicKey } from '@/models/encryption-models';
import { RootState } from '@/store/store';
import { Session } from '@/models/session-models';
import {
  createExerciseBlueprint,
  createSession,
  createSessionBlueprint,
} from '@/models/session-models/__test__/helpers';

const today = LocalDate.of(2025, 4, 10);

const publicKey: RsaPublicKey = { spkiPublicKeyBytes: new Uint8Array([1]) };
const aesKey: AesKey = { value: new Uint8Array([2]) };

function followedUser(id: string) {
  return new FollowedFeedUser(id, publicKey, 'Friend', undefined, aesKey, 'secret');
}

function startedSessionOn(date: LocalDate): Session {
  return createSession(createSessionBlueprint([createExerciseBlueprint(0, false)]), [0]).with({ date });
}

function event(userId: string, date: LocalDate): SessionUserEvent {
  return new SessionUserEvent(
    userId,
    `${userId}-${date.toString()}`,
    Instant.EPOCH,
    Instant.EPOCH,
    startedSessionOn(date),
  );
}

function stateWith(events: SessionUserEvent[], userIds: string[], ownUserId?: string): RootState {
  return {
    feed: {
      feed: events,
      followedUsers: Object.fromEntries(userIds.map((id) => [id, followedUser(id)])),
      identity: ownUserId ? RemoteData.success({ id: ownUserId }) : RemoteData.notAsked(),
    },
  } as unknown as RootState;
}

/** Own activity as the workout tables report it: one workout of 1000 kg on each date. */
function trainedOn(dates: LocalDate[]): OwnActivity {
  return ownActivityOf(
    dates.map((date) => ({ date, workouts: 1, volumeKg: 1000 })),
    { lo: 500, hi: 1500 },
  );
}

const following = (state: RootState, own: OwnActivity = NO_OWN_ACTIVITY) =>
  selectFollowingActivity(state, { own, today });

describe('selectFollowingActivity', () => {
  it('gives a followed user with no events a full week of empty cells', () => {
    const activity = following(stateWith([], ['quiet'])).get('quiet');

    expect(activity?.cells).toHaveLength(7);
    expect(activity?.cells.every((cell) => cell.level === 0)).toBe(true);
    expect(activity?.workoutsThisWeek).toBe(0);
    expect(activity?.lastWorkoutDate).toBeUndefined();
  });

  it('counts only the days inside the trailing week, but remembers the last workout beyond it', () => {
    const state = stateWith([event('friend', today.minusDays(2)), event('friend', today.minusDays(30))], ['friend']);

    const activity = following(state).get('friend');

    expect(activity?.workoutsThisWeek).toBe(1);
    expect(activity?.lastWorkoutDate?.toString()).toBe(today.minusDays(2).toString());
  });

  it('reports a workout older than the week without counting it', () => {
    const state = stateWith([event('friend', today.minusDays(20))], ['friend']);

    const activity = following(state).get('friend');

    expect(activity?.workoutsThisWeek).toBe(0);
    expect(activity?.lastWorkoutDate?.toString()).toBe(today.minusDays(20).toString());
  });

  it('reads a self-follow from own activity, which the feed filters out to avoid double-counting', () => {
    const state = stateWith([], ['me'], 'me');

    const activity = following(state, trainedOn([today.minusDays(1), today.minusDays(20)])).get('me');

    expect(activity?.workoutsThisWeek).toBe(1);
    expect(activity?.cells.at(-2)?.level).toBe(3);
    expect(activity?.lastWorkoutDate?.toString()).toBe(today.minusDays(1).toString());
  });

  it('marks today so the strip can ring the current day', () => {
    const activity = following(stateWith([], ['friend'])).get('friend');

    expect(activity?.cells.filter((cell) => cell.isToday)).toHaveLength(1);
    expect(activity?.cells.at(-1)?.isToday).toBe(true);
  });
});
