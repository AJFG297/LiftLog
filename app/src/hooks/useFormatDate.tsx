import { LocalDate } from '@js-joda/core';
import { useAppSelector } from '@/store';
import { useCallback } from 'react';

/**
 * `toLocaleString` constructs a whole ICU formatter per call, which is far too expensive to do from a
 * render -- the month grid formats a date for every one of its 42 cells. Formatters are immutable, so one
 * per locale and option set can be reused forever.
 */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(locale: string | undefined, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  const existing = formatters.get(key);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.DateTimeFormat(locale, opts);
  formatters.set(key, formatter);
  return formatter;
}

/** Formats a date in the user's language: `useFormatDate()`'s result, for helpers that take it. */
export type FormatDate = (date: LocalDate, opts: Intl.DateTimeFormatOptions) => string;

export function useFormatDate(): FormatDate {
  const locale = useAppSelector((x) => x.settings.preferredLanguage);
  return useCallback(
    (date, opts) => formatterFor(locale, opts).format(new Date(date.year(), date.month().ordinal(), date.dayOfMonth())),
    [locale],
  );
}
