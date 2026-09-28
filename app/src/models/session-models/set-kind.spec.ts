import { describe, expect, it } from 'vitest';
import { setKindLetter, setLabels } from '@/models/session-models/set-kind';

describe('setKindLetter', () => {
  it('letters every kind but a working set', () => {
    expect((['warmup', 'drop', 'myo', 'failure'] as const).map(setKindLetter)).toEqual(['W', 'D', 'M', 'F']);
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
