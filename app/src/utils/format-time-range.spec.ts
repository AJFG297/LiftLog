import { describe, expect, it } from 'vitest';
import { formatTimeRange, timeRangeFromParts } from '@/utils/format-time-range';

const evening = new Date(2026, 8, 23, 18, 4);
const later = new Date(2026, 8, 23, 18, 53);
const nextMorning = new Date(2026, 8, 24, 0, 30);
const format = (locale: string) => new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' });
const spaces = (text: string) => text.replace(/[   ]/g, ' ');

describe('formatTimeRange', () => {
  it('says a shared day period once', () => {
    expect(spaces(formatTimeRange(evening, later, 'en-US'))).toBe('6:04 – 6:53 PM');
  });
});

describe('timeRangeFromParts', () => {
  it('says a shared day period once, as formatRange does', () => {
    expect(spaces(timeRangeFromParts(format('en-US'), evening, later))).toBe('6:04 – 6:53 PM');
  });

  it('keeps both day periods when they differ', () => {
    expect(spaces(timeRangeFromParts(format('en-US'), evening, nextMorning))).toBe('6:04 PM – 12:30 AM');
  });

  it('drops a day period the locale puts before the time', () => {
    expect(timeRangeFromParts(format('ko-KR'), evening, later)).toBe(`6:04 – ${format('ko-KR').format(later)}`);
  });

  it('leaves a 24-hour time alone', () => {
    expect(timeRangeFromParts(format('de-DE'), evening, later)).toBe('18:04 – 18:53');
  });
});
