import { Duration, LocalDate, LocalTime, ZoneOffset } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import {
  CardioExerciseBlueprint,
  CardioExerciseSetBlueprint,
  ProgressionRule,
  Resistance,
  SessionBlueprint,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import {
  PotentialSet,
  RecordedCardioExercise,
  RecordedCardioExerciseSet,
  RecordedSet,
  RecordedWeightedExercise,
  Session,
} from '@/models/session-models';
import { RPE_VALUES } from '@/models/session-models/rpe';
import { Weight } from '@/models/weight';

/**
 * A large, realistic-looking history for benchmarks, deterministic for a given seed. It is shaped like a
 * long-term user rather than random data: a rotation of programs each followed for about three months,
 * several sessions a week, loads that climb with the odd deload, some RPE, some bodyweight, and cardio both
 * as finishers and as sessions of its own. The fast-check generators in models/storage/generators.ts cover
 * the edge cases; this covers the volume.
 */
export function generateSyntheticHistory(options: { count: number; seed?: number; end?: LocalDate }): Session[] {
  const random = mulberry32(options.seed ?? 1);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const end = options.end ?? LocalDate.parse('2026-06-01');

  // Walk forward from a start far enough back to fit `count` sessions at roughly 5.5 a week.
  let date = end.minusDays(Math.ceil((options.count / 5.5) * 7));
  const loads = new Map<string, number>();
  const sessions: Session[] = [];
  let programIndex = 0;
  let workoutIndex = 0;
  let programStart = date;

  while (sessions.length < options.count) {
    if (programStart.plusWeeks(12).isBefore(date)) {
      programIndex = (programIndex + 1) % programs.length;
      programStart = date;
      workoutIndex = 0;
    }
    const program = programs[programIndex]!;
    const standaloneCardio = random() < 0.12;
    const template = standaloneCardio ? cardioOnly : program.workouts[workoutIndex++ % program.workouts.length]!;
    const start = date.atTime(LocalTime.of(6 + Math.floor(random() * 14), Math.floor(random() * 60)));
    let clock = start.atOffset(ZoneOffset.ofHours(pick([10, 11])));

    const recordedExercises = template.exercises.map((exercise) => {
      if (exercise instanceof CardioExerciseBlueprint) {
        const sets = exercise.sets.map((set) => {
          const minutes = 15 + Math.floor(random() * 30);
          clock = clock.plusMinutes(minutes);
          return new RecordedCardioExerciseSet(
            set,
            clock,
            Duration.ofMinutes(minutes),
            { unit: 'kilometre', value: new BigNumber(((minutes / 6) * (0.8 + random() * 0.4)).toFixed(2)) },
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
          );
        });
        return new RecordedCardioExercise(exercise, sets, undefined);
      }

      const key = exercise.name;
      const base = loads.get(key) ?? startingLoads[key] ?? 20;
      // Mostly add a plate, sometimes hold, occasionally deload.
      const roll = random();
      const load = roll < 0.05 ? base * 0.85 : roll < 0.55 ? base + 2.5 : base;
      loads.set(key, Math.min(load, (startingLoads[key] ?? 20) * 3));
      const weight = new Weight(new BigNumber(Math.round(load / 2.5) * 2.5), 'kilograms');
      const logsRpe = random() < 0.3;

      const potentialSets = exercise.plannedSets.map((planned) => {
        clock = clock.plusSeconds(90 + Math.floor(random() * 120));
        // A few unlogged sets, as when a workout is cut short.
        const skipped = random() < 0.03;
        const reps = Math.max(1, planned.reps.max - Math.floor(random() * 3));
        return PotentialSet.of({
          set: skipped ? undefined : RecordedSet.of({ repsCompleted: reps, completionDateTime: clock }),
          weight,
          target: planned.reps,
          rpe: logsRpe && !skipped ? pick(RPE_VALUES) : undefined,
        });
      });
      return new RecordedWeightedExercise(exercise, potentialSets, undefined);
    });

    sessions.push(
      new Session(
        uuidFrom(random),
        template,
        recordedExercises,
        date,
        random() < 0.4 ? new Weight(new BigNumber((78 + random() * 6).toFixed(1)), 'kilograms') : undefined,
        undefined,
      ),
    );

    // Five or six sessions a week, with the occasional two-a-day and the occasional week off.
    const gap = random() < 0.1 ? 0 : random() < 0.02 ? 8 : 1 + Math.floor(random() * 2);
    date = date.plusDays(gap);
  }

  return sessions;
}

function weighted(name: string, sets: number, reps: number, resistance: Resistance = 'external') {
  return WeightedExerciseBlueprint.of({
    name,
    sets,
    repsConfig: { type: 'fixed', reps },
    progression: [ProgressionRule.load(new BigNumber(2.5))],
    resistance,
  });
}

function cardio(name: string, sets = 1) {
  const set = new CardioExerciseSetBlueprint(
    { type: 'time', value: Duration.ofMinutes(20) },
    true,
    true,
    false,
    false,
    false,
    false,
    undefined,
  );
  return new CardioExerciseBlueprint(
    name,
    Array.from({ length: sets }, () => set),
    '',
    '',
  );
}

const workout = (name: string, exercises: (WeightedExerciseBlueprint | CardioExerciseBlueprint)[]) =>
  new SessionBlueprint(name, exercises, '');

const programs = [
  {
    name: 'Push Pull Legs',
    workouts: [
      workout('Push', [
        weighted('Bench Press', 4, 6),
        weighted('Overhead Press', 3, 8),
        weighted('Incline Dumbbell Press', 3, 10),
        weighted('Lateral Raise', 3, 15),
        weighted('Triceps Pushdown', 3, 12),
      ]),
      workout('Pull', [
        weighted('Deadlift', 3, 5),
        weighted('Pull Up', 4, 8, 'bodyweight'),
        weighted('Barbell Row', 3, 8),
        weighted('Face Pull', 3, 15),
        weighted('Biceps Curl', 3, 12),
      ]),
      workout('Legs', [
        weighted('Squat', 4, 6),
        weighted('Romanian Deadlift', 3, 10),
        weighted('Leg Press', 3, 12),
        weighted('Leg Curl', 3, 12),
        weighted('Calf Raise', 4, 15),
        cardio('Treadmill'),
      ]),
    ],
  },
  {
    name: 'Upper Lower',
    workouts: [
      workout('Upper A', [
        weighted('Bench Press', 4, 5),
        weighted('Barbell Row', 4, 6),
        weighted('Overhead Press', 3, 8),
        weighted('Chin Up', 3, 8, 'bodyweight'),
      ]),
      workout('Lower A', [weighted('Squat', 4, 5), weighted('Romanian Deadlift', 3, 8), weighted('Calf Raise', 4, 12)]),
      workout('Upper B', [
        weighted('Incline Dumbbell Press', 4, 8),
        weighted('Lat Pulldown', 4, 10),
        weighted('Lateral Raise', 4, 15),
        weighted('Biceps Curl', 3, 10),
      ]),
      workout('Lower B', [
        weighted('Deadlift', 3, 5),
        weighted('Front Squat', 3, 8),
        weighted('Leg Curl', 3, 12),
        cardio('Rower', 2),
      ]),
    ],
  },
  {
    name: 'Full Body 5x5',
    workouts: [
      workout('Workout A', [weighted('Squat', 5, 5), weighted('Bench Press', 5, 5), weighted('Barbell Row', 5, 5)]),
      workout('Workout B', [weighted('Squat', 5, 5), weighted('Overhead Press', 5, 5), weighted('Deadlift', 1, 5)]),
    ],
  },
  {
    name: 'Hypertrophy Split',
    workouts: [
      workout('Chest & Back', [
        weighted('Incline Dumbbell Press', 4, 10),
        weighted('Cable Fly', 3, 15),
        weighted('Lat Pulldown', 4, 10),
        weighted('Seated Cable Row', 3, 12),
      ]),
      workout('Legs', [
        weighted('Leg Press', 4, 12),
        weighted('Leg Extension', 3, 15),
        weighted('Leg Curl', 3, 15),
        weighted('Calf Raise', 4, 20),
      ]),
      workout('Arms & Shoulders', [
        weighted('Overhead Press', 3, 10),
        weighted('Lateral Raise', 4, 15),
        weighted('Biceps Curl', 4, 12),
        weighted('Triceps Pushdown', 4, 12),
        weighted('Dip', 3, 10, 'bodyweight'),
      ]),
    ],
  },
];

const cardioOnly = workout('Cardio', [cardio('Run'), cardio('Bike')]);

const startingLoads: Record<string, number> = {
  'Bench Press': 60,
  'Overhead Press': 40,
  'Incline Dumbbell Press': 22.5,
  'Lateral Raise': 7.5,
  'Triceps Pushdown': 20,
  Deadlift: 100,
  'Pull Up': 0,
  'Chin Up': 0,
  Dip: 0,
  'Barbell Row': 50,
  'Face Pull': 15,
  'Biceps Curl': 12.5,
  Squat: 80,
  'Front Squat': 60,
  'Romanian Deadlift': 70,
  'Leg Press': 120,
  'Leg Curl': 35,
  'Leg Extension': 40,
  'Calf Raise': 60,
  'Lat Pulldown': 50,
  'Cable Fly': 15,
  'Seated Cable Row': 45,
};

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A v4-shaped uuid from the seeded generator, so ids are stable across runs. */
function uuidFrom(random: () => number): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  const s = hex.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
