const timeOptions: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

/**
 * A clock-time range that says the shared AM or PM once, "6:04 – 6:53 PM", in the locale's own format.
 * Hermes has no `formatRange`, so without it the range is put together from the parts of each end.
 */
export function formatTimeRange(start: Date, end: Date, locale: string | undefined): string {
  const format = new Intl.DateTimeFormat(locale, timeOptions);
  if (typeof format.formatRange === 'function') {
    return format.formatRange(start, end);
  }
  return timeRangeFromParts(format, start, end);
}

/** The fallback for {@link formatTimeRange}: the start without its day period when the end has the same one. */
export function timeRangeFromParts(format: Intl.DateTimeFormat, start: Date, end: Date): string {
  const endText = format.format(end);
  if (typeof format.formatToParts !== 'function') {
    return `${format.format(start)} – ${endText}`;
  }
  const startParts = format.formatToParts(start);
  const period = startParts.findIndex((part) => part.type === 'dayPeriod');
  const endPeriod = format.formatToParts(end).find((part) => part.type === 'dayPeriod');
  if (period === -1 || startParts[period]!.value !== endPeriod?.value) {
    return `${format.format(start)} – ${endText}`;
  }
  // The space that joined the day period to the time goes with it, on whichever side the locale puts it.
  const joiner = period === startParts.length - 1 ? period - 1 : period + 1;
  const startText = startParts
    .filter((part, index) => index !== period && !(index === joiner && part.type === 'literal'))
    .map((part) => part.value)
    .join('');
  return `${startText} – ${endText}`;
}
