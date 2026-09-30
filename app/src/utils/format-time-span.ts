import { Duration } from '@js-joda/core';

export const formatTimeSpan = (duration: Duration): string => {
  const totalSeconds = duration.seconds();
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

/** Whole seconds left, rounded up, so a countdown reads 0:01 until it is over and 2:00 as it starts. */
export const formatCountdown = (remaining: Duration): string =>
  formatTimeSpan(Duration.ofSeconds(Math.ceil(remaining.toMillis() / 1000)));
