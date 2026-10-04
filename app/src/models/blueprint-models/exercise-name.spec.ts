import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeExerciseName } from '@/models/blueprint-models';
import { loadBuiltInExerciseNames } from '@/services/exercise-catalog';

describe('normalizeExerciseName', () => {
  it.each([
    ['Lunge', 'lunge'],
    ['Lunges', 'lunge'],
    ['Bench Press', 'bench press'],
    ['Bench Presses', 'bench press'],
    ['Curl', 'curl'],
    ['Curls', 'curl'],
    ['Squat', 'squat'],
    ['Squats', 'squat'],
    ['Cable Fly', 'cable fly'],
    ['Cable Flye', 'cable fly'],
    ['Cable Flyes', 'cable fly'],
    ['Cable Flies', 'cable fly'],
    ['Cable Flys', 'cable fly'],
    ['Dumbbell Fly', 'dumbbell fly'],
    ['Dumbbell Flies', 'dumbbell fly'],
    ['Crunch', 'crunch'],
    ['Crunches', 'crunch'],
    ['Dip', 'dip'],
    ['Dips', 'dip'],
    ['Glute Bridge', 'glute bridge'],
    ['Glute Bridges', 'glute bridge'],
    ['Press', 'press'],
    ['Presses', 'press'],
    ['Abs', 'abs'],
    ['Ab', 'ab'],
    ['Hip Thrust Series', 'hip thrust series'],
    ['Lateral Raise', 'lateral raise'],
    ['Lateral Raises', 'lateral raise'],
    ['Push-Ups', 'push-up'],
    ['Shrugs', 'shrug'],
    ['Plate Squeezes', 'plate squeeze'],
    ['Biceps Curl', 'biceps curl'],
    ['Reverse Flyes With External Rotation', 'reverse fly with external rotation'],
    ['  Bench   Press  ', 'bench press'],
    ['', ''],
    ['   ', ''],
  ])('%j normalizes to %j', (name, key) => {
    expect(normalizeExerciseName(name)).toBe(key);
  });

  // Names that don't end in s; those take "es", below.
  const liftNames = [
    'Lunge',
    'Walking Lunge',
    'Curl',
    'Hammer Curl',
    'Squat',
    'Front Squat',
    'Cable Fly',
    'Cable Flye',
    'Dumbbell Fly',
    'Crunch',
    'Cable Crunch',
    'Dip',
    'Glute Bridge',
    'Deadlift',
    'Romanian Deadlift',
    'Lateral Raise',
    'Calf Raise',
    'Pull-Up',
    'Chin Up',
    'Push Up',
    'Barbell Row',
    'Shrug',
    'Face Pull',
    'Hip Thrust',
    'Leg Extension',
    'Kettlebell Swing',
    'Skull Crusher',
    'Plate Squeeze',
    'Good Morning',
    'Box Jump',
  ];

  it('gives a name and its plural the same key', () => {
    fc.assert(
      fc.property(fc.constantFrom(...liftNames), (name) => {
        expect(normalizeExerciseName(name + 's')).toBe(normalizeExerciseName(name));
      }),
    );
  });

  it('gives a name and its "es" plural the same key', () => {
    for (const name of ['Bench Press', 'Crunch', 'Leg Press', 'Overhead Press', 'Cable Crunch']) {
      expect(normalizeExerciseName(name + 'es')).toBe(normalizeExerciseName(name));
    }
  });

  it('never gives two built-ins the same key', async () => {
    const ids = Object.keys(await loadBuiltInExerciseNames());
    const byKey = new Map<string, string[]>();
    for (const id of ids) {
      const key = normalizeExerciseName(id);
      byKey.set(key, [...(byKey.get(key) ?? []), id]);
    }
    expect([...byKey.values()].filter((group) => group.length > 1)).toEqual([]);
  });
});
