import { describe, expect, it } from 'vitest';
import { setLabel, setLabels } from '@/models/session-models/set-kind';

describe('setLabel', () => {
  it('numbers a working set and letters every other kind', () => {
    expect(setLabel('working', 3)).toBe('3');
    expect(setLabel('warmup', 3)).toBe('W');
    expect(setLabel('drop', 3)).toBe('D');
    expect(setLabel('myo', 3)).toBe('M');
    expect(setLabel('failure', 3)).toBe('F');
  });
});

describe('setLabels', () => {
  it('counts only working sets, so a lettered set does not use up a number', () => {
    expect(setLabels(['warmup', 'warmup', 'working', 'failure', 'working', 'drop', 'myo', 'working'])).toEqual([
      'W',
      'W',
      '1',
      'F',
      '2',
      'D',
      'M',
      '3',
    ]);
  });

  it('numbers a plain list 1 to n', () => {
    expect(setLabels(['working', 'working', 'working'])).toEqual(['1', '2', '3']);
  });
});
