import { describe, expect, it } from 'vitest';
import { continuesProgression, keepsLastWeight, setKindLetter, setLabels } from '@/models/session-models/set-kind';

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

describe('carry-over between sessions', () => {
  it.each([
    ['working', 'working', true, true],
    ['working', 'failure', true, true],
    ['failure', 'working', true, true],
    ['drop', 'drop', false, true],
    ['myo', 'myo', false, true],
    ['working', 'drop', false, false],
    ['drop', 'working', false, false],
    ['drop', 'myo', false, false],
    ['myo', 'failure', false, false],
  ] as const)(
    'a %s set that is now %s continues progression: %s, keeps its weight: %s',
    (last, next, continues, keeps) => {
      expect([continuesProgression(last, next), keepsLastWeight(last, next)]).toEqual([continues, keeps]);
    },
  );
});
