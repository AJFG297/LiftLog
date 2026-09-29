import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { LocalDate, OffsetDateTime } from '@js-joda/core';
import { SessionGenerator } from '@/models/storage/generators';
import { RecordedWeightedExercise, Session } from '@/models/session-models';
import { RestTimer } from '@/models/session-models/rest-timer';
import { Weight } from '@/models/weight';
import {
  emptyPotentialSet,
  filledPotentialSet,
  makeSession,
  makeWeightedBlueprint,
} from '@/models/session-models/__test__/helpers';
import { fromWorkoutRows, samePersistedContent, toWorkoutRows, WorkoutRows } from '@/services/workout-rows';
import { sessionVolume } from '@/store/activity/volume';
import { getSessionReferenceTime } from '@/store/stored-sessions';

vi.stubEnv('TZ', 'UTC');

/** Child rows come back from SQL in no particular order, so the mapper must not rely on it. */
function shuffled(rows: WorkoutRows): WorkoutRows {
  return {
    ...rows,
    exercises: rows.exercises.toReversed(),
    weightedSets: rows.weightedSets.toReversed(),
    warmupSets: rows.warmupSets.toReversed(),
    cardioSets: rows.cardioSets.toReversed(),
  };
}

describe('workout rows', () => {
  it('round-trips any session', () => {
    // SessionGenerator covers weighted and cardio exercises, supersets, RPE, unlogged sets, bodyweight and
    // the blueprint each exercise carries.
    fc.assert(
      fc.property(SessionGenerator, (session) => {
        const restored = fromWorkoutRows(shuffled(toWorkoutRows(session)));

        expect(restored.toJSON()).toEqual(session.toJSON());
        expect(restored.equals(session)).toBe(true);
      }),
    );
  });

  it('keeps the workout id, which health export and CSV import key on', () => {
    fc.assert(
      fc.property(SessionGenerator, (session) => {
        const rows = toWorkoutRows(session);
        expect(rows.workout.id).toBe(session.id);
        expect(fromWorkoutRows(rows).id).toBe(session.id);
      }),
    );
  });

  it('keeps an unlogged set with its weight, target and RPE', () => {
    const blueprint = makeWeightedBlueprint();
    const exercise = new RecordedWeightedExercise(
      blueprint,
      [emptyPotentialSet(new Weight('102.5', 'kilograms')).with({ rpe: 8.5 })],
      'felt heavy',
    );
    const session = makeSession([blueprint]).withExercise(0, exercise);

    const rows = toWorkoutRows(session);
    const restored = fromWorkoutRows(rows).recordedExercises[0] as RecordedWeightedExercise;

    expect(rows.weightedSets[0]).toMatchObject({ reps: null, completedAt: null, weightValue: '102.5', rpe: 8.5 });
    expect(restored.potentialSets[0]!.set).toBeUndefined();
    expect(restored.potentialSets[0]!.rpe).toBe(8.5);
    expect(restored.notes).toBe('felt heavy');
  });

  it('keeps warm-ups in their own rows, out of the working sets and their aggregates', () => {
    const blueprint = makeWeightedBlueprint({ sets: 1 });
    const exercise = new RecordedWeightedExercise(
      blueprint,
      [filledPotentialSet(5, OffsetDateTime.parse('2025-04-05T10:10:00Z'), new Weight(100, 'kilograms'))],
      undefined,
      [
        filledPotentialSet(5, OffsetDateTime.parse('2025-04-05T10:00:00Z'), new Weight(200, 'kilograms')),
        emptyPotentialSet(new Weight('42.5', 'kilograms'), { min: 3, max: 3 }),
      ],
    );
    const session = makeSession([blueprint]).withExercise(0, exercise);

    const rows = toWorkoutRows(session);
    const restored = fromWorkoutRows(shuffled(rows)).recordedExercises[0] as RecordedWeightedExercise;

    expect(rows.weightedSets).toHaveLength(1);
    expect(rows.warmupSets).toMatchObject([
      { position: 0, reps: 5, weightValue: '200' },
      { position: 1, reps: null, completedAt: null, weightValue: '42.5', targetRepsMin: 3 },
    ]);
    // A heavier warm-up still leaves the workout's volume at the working sets' 5 × 100 kg.
    expect(rows.workout.volumeKg).toBe(500);
    expect(restored.equals(exercise)).toBe(true);
  });

  describe('query columns', () => {
    it('come from the domain methods that compute them', () => {
      fc.assert(
        fc.property(SessionGenerator, (session) => {
          const rows = toWorkoutRows(session);

          expect(rows.workout.referenceTimeMs).toBe(getSessionReferenceTime(session).toInstant().toEpochMilli());
          expect(rows.workout.volumeKg).toBe(sessionVolume(session));
          session.recordedExercises.forEach((exercise, index) => {
            expect(rows.exercises[index]).toMatchObject({
              movementKey: exercise.movementKey(),
              progressionKey: exercise.progressionKey(),
              latestTimeMs: exercise.latestTime?.toInstant().toEpochMilli() ?? null,
            });
          });
        }),
      );
    });

    it('fold bodyweight into the effective weight and convert to kilograms', () => {
      const blueprint = makeWeightedBlueprint({ resistance: 'bodyweight' });
      const time = OffsetDateTime.parse('2026-04-10T09:30:00+10:00');
      const session = makeSession([blueprint]).with({ bodyweight: new Weight(80, 'kilograms') });
      const withSet = session.withExercise(
        0,
        new RecordedWeightedExercise(
          blueprint,
          [filledPotentialSet(8, time, new Weight(22.0462, 'pounds'))],
          undefined,
        ),
      );

      const [set] = toWorkoutRows(withSet).weightedSets;

      expect(set!.weightUnit).toBe('pounds');
      expect(set!.weightKg).toBeCloseTo(10);
      expect(set!.effectiveWeightKg).toBeCloseTo(90);
      // The exact time keeps its offset; the epoch column orders it among times written in other zones.
      expect(set!.completedAt).toBe('2026-04-10T09:30:00+10:00');
      expect(set!.completedAtMs).toBe(time.toInstant().toEpochMilli());
    });
  });

  it('migrates an exercise blueprint written at an older version', () => {
    const blueprint = makeWeightedBlueprint({ name: 'Squat' });
    const rows = toWorkoutRows(makeSession([blueprint]));
    const { progression: _, ...current } = rows.exercises[0]!.blueprint as ReturnType<typeof blueprint.toJSON>;
    const old: WorkoutRows = {
      ...rows,
      workout: { ...rows.workout, blueprintVersion: 5 },
      exercises: [
        {
          ...rows.exercises[0]!,
          blueprint: {
            ...current,
            progressiveOverload: { type: 'IncreaseAllEvenlyProgressiveOverload', amount: '5' },
          } as never,
        },
      ],
    };

    const restored = fromWorkoutRows(old).recordedExercises[0] as RecordedWeightedExercise;

    expect(restored.blueprint.name).toBe('Squat');
    expect(restored.blueprint.toJSON().progression).toEqual([
      { axis: 'load', step: '5', scope: { type: 'allSets' }, trigger: 'allSetsMetTarget' },
    ]);
  });

  describe('samePersistedContent', () => {
    it('ignores the rest timer', () => {
      const session = Session.freeformSession(LocalDate.of(2026, 4, 10), undefined);
      const now = OffsetDateTime.parse('2026-04-10T09:30:00Z');
      expect(samePersistedContent(session, session.with({ restTimer: new RestTimer(now) }))).toBe(true);
    });

    it('notices a recorded set', () => {
      const session = makeSession([makeWeightedBlueprint()]);
      const recorded = session.withCycledExerciseReps(0, 0, OffsetDateTime.parse('2026-04-10T09:30:00Z'));
      expect(samePersistedContent(session, recorded)).toBe(false);
    });
    it('notices a feel rating', () => {
      const session = makeSession([makeWeightedBlueprint()]);
      const rated = session.with({ reflection: { feel: 'good', note: '' } });
      expect(samePersistedContent(session, rated)).toBe(false);
    });
  });

  describe('reflection', () => {
    it('round-trips how a workout felt and its note, outside SessionJSON', () => {
      const session = makeSession([makeWeightedBlueprint()]).with({
        reflection: { feel: 'great', note: 'Go up on bench' },
      });

      const rows = toWorkoutRows(session);

      expect(rows.workout).toMatchObject({ feel: 'great', reflectionNote: 'Go up on bench' });
      expect(fromWorkoutRows(rows).reflection).toEqual({ feel: 'great', note: 'Go up on bench' });
      expect(session.toJSON()).not.toHaveProperty('reflection');
    });

    it('stores an empty reflection as none', () => {
      const session = makeSession([makeWeightedBlueprint()]).with({ reflection: { feel: undefined, note: '  ' } });

      expect(toWorkoutRows(session).workout).toMatchObject({ feel: null, reflectionNote: null });
      expect(fromWorkoutRows(toWorkoutRows(session)).reflection).toBeUndefined();
    });

    it('drops a feel it does not know', () => {
      const rows = toWorkoutRows(makeSession([makeWeightedBlueprint()]));

      const restored = fromWorkoutRows({ ...rows, workout: { ...rows.workout, feel: 'meh' as 'good' } });

      expect(restored.reflection).toBeUndefined();
    });
  });
});
