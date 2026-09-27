import { RootState } from '@/store';
import { convert, OffsetDateTime } from '@js-joda/core';
import { Dispatch } from '@reduxjs/toolkit';
import {
  cancelScheduledNotificationAsync,
  requestPermissionsAsync,
  SchedulableTriggerInputTypes,
  scheduleNotificationAsync,
  setNotificationHandler,
  dismissNotificationAsync,
} from 'expo-notifications';

setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const nextSetNotificationIdentifier = '1000';
export class NotificationService {
  // Each call is several native round trips, and set edits can fire them in quick succession. Unless
  // they run one at a time, one call's cancel can land after another's schedule and drop the rest
  // notification entirely.
  private queue: Promise<void> = Promise.resolve();

  constructor(
    readonly getState: () => RootState,
    readonly dispatch: Dispatch,
  ) {}

  scheduleNextSetNotification(time: OffsetDateTime) {
    return this.enqueue(async () => {
      await this.clear();
      await requestPermissionsAsync();
      await scheduleNotificationAsync({
        content: {
          title: 'Rest Over',
          body: 'Start your next set!',
          sound: true,
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: convert(time.toInstant()).toDate(),
        },
        identifier: nextSetNotificationIdentifier,
      });
    });
  }

  clearSetTimerNotification() {
    return this.enqueue(() => this.clear());
  }

  private async clear() {
    await cancelScheduledNotificationAsync(nextSetNotificationIdentifier);
    await dismissNotificationAsync(nextSetNotificationIdentifier);
  }

  private enqueue(op: () => Promise<void>): Promise<void> {
    const result = this.queue.then(op);
    // A failed call shouldn't wedge every later one.
    this.queue = result.catch(() => {});
    return result;
  }
}
