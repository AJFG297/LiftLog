import { describe, expect, it } from 'vitest';
import { formatDateForField, parseDateFromField } from './date-field-format';

describe('date field', () => {
  it('round-trips a date through the field text', () => {
    const date = new Date(2026, 10, 5);
    expect(parseDateFromField(formatDateForField(date))?.getTime()).toBe(date.getTime());
  });

  it('rejects text that is not a calendar day', () => {
    expect(parseDateFromField('')).toBeUndefined();
    expect(parseDateFromField('02/30/2026')).toBeUndefined();
    expect(parseDateFromField('13/40/2026')).toBeUndefined();
    expect(parseDateFromField('1/2/26')).toBeUndefined();
  });
});
