import { describe, expect, it, vi } from 'vitest';
import { UseTranslateResult } from '@tolgee/react';
import BigNumber from 'bignumber.js';
import en from '@/i18n/en.json';
import { CardioExerciseBlueprint, ProgressionRule, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { makeWeightedBlueprint } from '@/models/session-models/__test__/helpers';
import { Session } from '@/models/session-models';
import { LocalDate } from '@js-joda/core';
import { rulesForPreset } from '@/components/presentation/workout-editor/routine-progression';
import {
  exerciseEditScopeCopy,
  exerciseMetaOf,
  loadSummaryOf,
  progressionSummaryOf,
  sessionEditScope,
  supersetHintOf,
  trackingTypeOf,
  warmupsSummaryOf,
  withTrackingType,
} from '@/components/presentation/workout-editor/exercise-edit-copy';

vi.mock('expo-localization', () => ({
  getLocales: () => [{ decimalSeparator: '.' }],
}));

/** The English strings with their placeholders filled, the way Tolgee's simple formatter does it. */
const t = ((key: string, params?: Record<string, string | number>) =>
  (en as Record<string, string>)[key]!.replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name]),
  )) as UseTranslateResult['t'];

const bench = makeWeightedBlueprint({ name: 'Bench Press', sets: 3, repsConfig: { type: 'fixed', reps: 12 } });
const formatStep = (step: BigNumber) => `${step.toString()} kg`;

describe('sessionEditScope', () => {
  it('scopes the workout in progress to today, naming its routine', () => {
    const push = Session.freeformSession(LocalDate.of(2026, 10, 7), undefined).withName('Push A');
    expect(sessionEditScope(push, push.id)).toEqual({ kind: 'workout', routineName: 'Push A' });
  });

  it('has no routine for a workout started without one', () => {
    const freeform = Session.freeformSession(LocalDate.of(2026, 10, 7), undefined);
    expect(sessionEditScope(freeform, freeform.id)).toEqual({ kind: 'workout', routineName: undefined });
  });

  it('treats any other workout as a past one', () => {
    const past = Session.freeformSession(LocalDate.of(2026, 10, 1), undefined).withName('Push A');
    expect(sessionEditScope(past, 'another-workout')).toEqual({ kind: 'pastWorkout' });
    expect(sessionEditScope(past, undefined)).toEqual({ kind: 'pastWorkout' });
  });
});

describe('exerciseEditScopeCopy', () => {
  it('says a workout edit is for today and can be kept in its routine', () => {
    expect(exerciseEditScopeCopy(t, { kind: 'workout', routineName: 'Push A' }, 'Bench Press')).toEqual({
      sentence: 'Changes apply to today only. When you finish, you can keep them in Push A.',
      saveLabel: 'Save for today',
    });
  });

  it('drops the routine clause for a workout without a routine', () => {
    expect(exerciseEditScopeCopy(t, { kind: 'workout', routineName: undefined }, 'Bench Press')).toEqual({
      sentence: 'Changes apply to today only.',
      saveLabel: 'Save for today',
    });
  });

  it('names the routine and the exercise for a saved routine', () => {
    expect(exerciseEditScopeCopy(t, { kind: 'routine', routineName: 'Push A' }, 'Bench Press')).toEqual({
      sentence: 'Changes apply to Push A from your next workout. Other routines with Bench Press stay as they are.',
      saveLabel: 'Save to Push A',
    });
  });

  it('says a routine draft changes when the routine is saved, and only closes', () => {
    expect(exerciseEditScopeCopy(t, { kind: 'routineDraft', routineName: 'Push A' }, 'Bench Press')).toEqual({
      sentence: 'Changes go into Push A when you save the routine. Other routines with Bench Press stay as they are.',
      saveLabel: 'Done',
    });
  });

  it('calls a routine not named yet "this routine"', () => {
    expect(exerciseEditScopeCopy(t, { kind: 'routineDraft', routineName: ' ' }, 'Bench Press').sentence).toBe(
      'Changes go into this routine when you save the routine. Other routines with Bench Press stay as they are.',
    );
  });

  it('keeps a past workout edit to that workout', () => {
    expect(exerciseEditScopeCopy(t, { kind: 'pastWorkout' }, 'Bench Press').sentence).toBe(
      'Changes apply to this workout only.',
    );
  });
});

describe('withTrackingType', () => {
  it('keeps the exercise, notes and link when switching to Time & distance and back', () => {
    const noted = bench.with({ notes: 'Pause', link: 'https://example.com' });

    const cardio = withTrackingType(noted, 'cardio');
    expect(cardio).toBeInstanceOf(CardioExerciseBlueprint);
    expect(trackingTypeOf(cardio)).toBe('cardio');
    expect([cardio.name, cardio.exerciseId, cardio.notes, cardio.link]).toEqual([
      noted.name,
      noted.exerciseId,
      'Pause',
      'https://example.com',
    ]);

    const weighted = withTrackingType(cardio, 'weighted');
    expect(weighted).toBeInstanceOf(WeightedExerciseBlueprint);
    expect(weighted.exerciseId).toBe(noted.exerciseId);
  });

  it('leaves the exercise alone when the type does not change', () => {
    expect(withTrackingType(bench, 'weighted')).toBe(bench);
  });
});

describe('exerciseMetaOf', () => {
  it('lists the equipment then the muscles', () => {
    const meta = exerciseMetaOf(t, {
      name: 'Bench Press',
      force: null,
      level: 'beginner',
      mechanic: null,
      equipment: 'barbell',
      primaryMuscles: ['chest'],
      secondaryMuscles: ['triceps', 'shoulders'],
      instructions: '',
      category: 'strength',
    });
    expect(meta).toMatch(/^Barbell · Chest, triceps, shoulders$/i);
  });

  it('says nothing for an exercise missing from the catalog', () => {
    expect(exerciseMetaOf(t, undefined)).toBeUndefined();
  });
});

describe('row summaries', () => {
  it('summarises the load choice', () => {
    expect(loadSummaryOf(t, 'external')).toBe('Weight you add · counts toward volume');
    expect(loadSummaryOf(t, 'none')).toBe('Reps only · no weight logged');
  });

  it('counts and lists the warm-ups', () => {
    expect(warmupsSummaryOf(t, [])).toBe('None');
    expect(
      warmupsSummaryOf(t, [
        { reps: 8, load: { type: 'percent', percent: 50 } },
        { reps: 5, load: { type: 'percent', percent: 75 } },
      ]),
    ).toBe('2 sets · 50% × 8, 75% × 5');
    expect(warmupsSummaryOf(t, [{ reps: 10, load: undefined }])).toBe('1 set · 10');
  });

  it('explains the progression with the exercise’s numbers', () => {
    const step = new BigNumber(2.5);
    const withPreset = (preset: 'weight' | 'double' | 'off') =>
      bench.with({ progression: rulesForPreset(preset, bench, step) });

    expect(progressionSummaryOf(t, withPreset('weight'), formatStep)).toBe(
      'Add weight · +2.5 kg once your best set hits 12',
    );
    expect(progressionSummaryOf(t, withPreset('double'), formatStep)).toMatch(
      /^Reps, then weight · up to \d+ reps, then \+2\.5 kg$/,
    );
    expect(progressionSummaryOf(t, withPreset('off'), formatStep)).toBe('Off');
    expect(
      progressionSummaryOf(
        t,
        bench.with({ progression: [ProgressionRule.load(step).with({ ceiling: new BigNumber(100) })] }),
        formatStep,
      ),
    ).toBe('Custom');
  });

  it('names the exercise a superset pairs with', () => {
    expect(supersetHintOf(t, 'Incline Dumbbell Fly', false)).toBe('Next: Incline Dumbbell Fly');
    expect(supersetHintOf(t, 'Incline Dumbbell Fly', true)).toBe('Paired with Incline Dumbbell Fly');
    expect(supersetHintOf(t, undefined, false)).toBe('No exercise comes after this one');
  });
});
