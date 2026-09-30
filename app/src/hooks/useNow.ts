import { OffsetDateTime } from '@js-joda/core';
import { useEffect, useState } from 'react';

/** The current time, refreshed every `intervalMs`. Keep it in a small component, since each tick re-renders it. */
export function useNow(intervalMs: number): OffsetDateTime {
  const [now, setNow] = useState(() => OffsetDateTime.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(OffsetDateTime.now()), intervalMs);
    return () => clearInterval(interval);
  }, [intervalMs]);
  return now;
}
