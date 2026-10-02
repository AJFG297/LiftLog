import { LocalDate } from '@js-joda/core';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * A referentially stable `today`. Selectors that grade activity take the date as an argument rather than
 * reading the clock themselves, so calling `LocalDate.now()` inline would hand them a fresh object every
 * render and defeat memoization. Tab screens stay mounted for days, so it moves on when the app comes back
 * to the foreground on a later day, and keeps its identity otherwise.
 */
export function useToday(): LocalDate {
  const [today, setToday] = useState(() => LocalDate.now());
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setToday((current) => {
          const now = LocalDate.now();
          return now.equals(current) ? current : now;
        });
      }
    });
    return () => subscription.remove();
  }, []);
  return today;
}
