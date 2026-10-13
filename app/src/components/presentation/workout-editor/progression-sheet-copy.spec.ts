import { describe, expect, it, vi } from 'vitest';
import { UseTranslateResult } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import en from '@/i18n/en.json';
import { ProgressionRule, RepsConfig } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import {
  rulesForPreset,
  withLadderCeiling,
  withProgressionStep,
} from '@/components/presentation/workout-editor/routine-progression';
import {
  plannedTargetsOf,
  previewNoteOf,
  progressionOptionBody,
  rulesSummaryOf,
} from '@/components/presentation/workout-editor/progression-sheet-copy';

vi.mock('expo-localization', () => ({
  getLocales: () => [{ decimalSeparator: '.' }],
}));

/** The English strings with their placeholders filled, the way Tolgee's simple formatter does it. */
const t = ((key: string, params?: Record<string, string | number>) =>
  (en as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name]),
  )) as UseTranslateResult['t'];

const formatStep = (step: BigNumber) => `${step.toString()} kg`;
const step = new BigNumber(2.5);
const bench = (repsConfig: RepsConfig = { type: 'range', min: 8, max: 12 }) =>
  makeWeightedBlueprint({ name: 'Bench Press', sets: 3, repsConfig, progression: [] });
const withPreset = (preset: 'weight' | 'double' | 'off') =>
  bench().with({ progression: rulesForPreset(preset, bench(), step) });

describe('progressionOptionBody', () => {
  it('explains each choice with the exercise’s own numbers', () => {
    const exercise = withLadderCeiling(withPreset('double'), new BigNumber(16));
    expect(progressionOptionBody(t, 'weight', exercise, step, formatStep)).toBe(
      'Add 2.5 kg once your best set hits 12. Miss it and you repeat the weight.',
    );
    expect(progressionOptionBody(t, 'double', exercise, step, formatStep)).toBe(
      'Add a rep once every set hits its target, up to 16. Then add 2.5 kg and drop back to 8–12.',
    );
    expect(progressionOptionBody(t, 'off', exercise, step, formatStep)).toBe(
      'Keep the same numbers until you change them.',
    );
  });

  it('follows the step and limit chips', () => {
    const stepped = withProgressionStep(withPreset('double'), new BigNumber(5));
    expect(progressionOptionBody(t, 'weight', stepped, step, formatStep)).toBe(
      'Add 5 kg once your best set hits 12. Miss it and you repeat the weight.',
    );
    expect(progressionOptionBody(t, 'double', withLadderCeiling(stepped, new BigNumber(20)), step, formatStep)).toBe(
      'Add a rep once every set hits its target, up to 20. Then add 5 kg and drop back to 8–12.',
    );
  });

  it('speaks of each set’s own target when the sets differ', () => {
    const pyramid = makeWeightedBlueprint({
      name: 'Bench Press',
      plannedSets: [
        { reps: { min: 12, max: 12 }, kind: 'working' },
        { reps: { min: 8, max: 8 }, kind: 'working' },
      ],
      progression: [],
    });
    expect(progressionOptionBody(t, 'weight', pyramid, step, formatStep)).toBe(
      'Add 2.5 kg once your best set hits its target. Miss it and you repeat the weight.',
    );
    expect(progressionOptionBody(t, 'double', pyramid, step, formatStep)).toBe(
      'Add a rep once every set hits its target, up to 16. Then add 2.5 kg and drop back to each set’s own target.',
    );
  });
});

describe('rulesSummaryOf', () => {
  it('counts the rules and warns that editing them makes the choice Custom', () => {
    expect(rulesSummaryOf(t, [])).toBe('No rules');
    expect(rulesSummaryOf(t, rulesForPreset('weight', bench(), step))).toBe('1 rule · editing them makes this Custom');
    expect(rulesSummaryOf(t, rulesForPreset('double', bench(), step))).toBe('2 rules · editing them makes this Custom');
  });

  it('only counts rules that are already custom', () => {
    expect(rulesSummaryOf(t, [ProgressionRule.load(step, { type: 'lowestSets', pick: 'all' })])).toBe('1 rule');
  });
});

describe('previewNoteOf', () => {
  it('says what it takes for each choice to move', () => {
    expect(previewNoteOf(t, withPreset('weight'))).toBe(
      'Hitting 12 on your best set moves the weight up. Anything less repeats it.',
    );
    expect(previewNoteOf(t, withPreset('double'))).toBe(
      'Every set has to hit its target for the reps to climb. The range moves as a block.',
    );
  });
});

describe('plannedTargetsOf', () => {
  it('reads the plan as the sheet’s subtitle does', () => {
    expect(plannedTargetsOf(bench())).toBe('3 × 8–12');
    expect(plannedTargetsOf(bench({ type: 'fixed', reps: 5 }))).toBe('3 × 5');
  });
});
