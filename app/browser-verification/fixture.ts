import { LocalDate } from '@js-joda/core';

import { SessionBlueprint, WeightedExerciseBlueprint } from '@/models/blueprint-models';
import { RecordedWeightedExercise, Session } from '@/models/session-models';

export function createFixture(): Session {
  const bench = WeightedExerciseBlueprint.of({
    name: 'Barbell Bench Press',
    exerciseId: 'Barbell Bench Press',
    sets: 2,
    repsConfig: { type: 'fixed', reps: 5 },
  });
  const blueprint = new SessionBlueprint('Browser verification', [bench], '');

  return new Session(
    'browser-workout',
    blueprint,
    [RecordedWeightedExercise.empty(bench, 'kilograms')],
    LocalDate.of(2026, 10, 6),
    undefined,
    undefined,
  );
}

export function createReorderFixture(): Session {
  const names = [
    'Barbell Bench Press',
    'Back Squat',
    'Bent Over Row',
    'Overhead Press',
    'Lat Pulldown',
    'Lateral Raise',
    'Biceps Curl',
    'Triceps Extension',
    'Calf Raise',
    'Plank',
  ];
  const exercises = names.map((name, index) =>
    WeightedExerciseBlueprint.of({
      name,
      exerciseId: name,
      sets: 2,
      repsConfig: { type: 'fixed', reps: 5 },
      supersetWithNext: index === 5,
    }),
  );
  return new Session(
    'browser-workout',
    new SessionBlueprint('Browser verification', exercises, ''),
    exercises.map((exercise) => RecordedWeightedExercise.empty(exercise, 'kilograms')),
    LocalDate.of(2026, 10, 6),
    undefined,
    undefined,
  );
}
