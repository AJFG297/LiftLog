import { describe, expect, it, vi } from 'vitest';
import {
  CardioExerciseBlueprint,
  CardioExerciseSetBlueprint,
  ProgramBlueprint,
  SessionBlueprint,
  stubExerciseId,
  WeightedExerciseBlueprint,
} from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { ExerciseResolver, missingStubs, stubDescriptor } from '@/models/exercise-resolver';
import { LocalDate } from '@js-joda/core';

const descriptor = (name: string): ExerciseDescriptor => stubDescriptor(name);

const builtInNames = {
  'Barbell Squat': ['Barbell Squat', 'Приседания со штангой'],
  Dips: ['Dips'],
  Dip: ['Dip'],
  'Leg Press': ['Leg Press', 'Жим ногами'],
};

function resolver(savedExercises: Record<string, ExerciseDescriptor> = {}, onAmbiguous = vi.fn()) {
  return new ExerciseResolver({ savedExercises, builtInNames, onAmbiguous });
}

describe('ExerciseResolver', () => {
  it('prefers one of the user’s own exercises over a built-in of the same name', () => {
    expect(resolver({ 'user-1': descriptor('Leg Press') }).resolve('leg press')).toBe('user-1');
  });

  it('matches a user exercise by its normalised name', () => {
    expect(resolver({ 'user-1': descriptor('Cable Flys') }).resolve('cable flies')).toBe('user-1');
  });

  it('links a built-in by its English name, whatever the case', () => {
    expect(resolver().resolve('barbell squat')).toBe('Barbell Squat');
  });

  it('links a built-in by any locale’s name, so switching language never splits history', () => {
    expect(resolver().resolve('Жим ногами')).toBe('Leg Press');
    expect(resolver().resolve('Приседания со штангой')).toBe('Barbell Squat');
  });

  it('links a built-in by the name the user gave it by editing it', () => {
    expect(resolver({ 'Leg Press': descriptor('Sled Press') }).resolve('Sled Press')).toBe('Leg Press');
  });

  it('keeps an edited built-in a built-in, below the user’s own exercises', () => {
    const r = resolver({ 'Leg Press': descriptor('Press'), 'user-1': descriptor('Press') });
    expect(r.resolve('Press')).toBe('user-1');
  });

  it('prefers the same name over the same normalised name', () => {
    expect(resolver().resolve('Dips')).toBe('Dips');
    expect(resolver().resolve('Dip')).toBe('Dip');
  });

  it('reports a name more than one exercise answers to, and still picks one', () => {
    const onAmbiguous = vi.fn();
    const r = resolver({ a: descriptor('Row'), b: descriptor('Row') }, onAmbiguous);
    expect(r.resolve('Row')).toBe('a');
    expect(onAmbiguous).toHaveBeenCalledWith('Row', ['a', 'b'], 'a');
  });

  it('makes one stub for a name nothing matches, and reuses it for its other spellings', () => {
    const r = resolver();
    const id = r.resolve('Zercher Lunges');
    expect(id).toBe(stubExerciseId('Zercher Lunges'));
    expect(r.resolve('zercher lunges')).toBe(id);
    expect(r.resolve('Zercher Lunge')).toBe(id);
    expect(r.stubs[id]).toEqual(descriptor('Zercher Lunges'));
  });

  it('reuses a renamed descriptor at its deterministic stub id without replacing it', () => {
    const id = stubExerciseId('Original name');
    const renamed = { ...descriptor('New name'), instructions: 'Existing instructions' };
    const r = resolver({ [id]: renamed });
    expect(r.resolve('Original name')).toBe(id);
    expect(r.stubs).toEqual({});
  });

  it('never lists a blank name as an exercise', () => {
    const r = resolver();
    expect(r.resolve('  ')).toBe(stubExerciseId(''));
    expect(r.stubs).toEqual({});
  });

  describe('link', () => {
    it('keeps a blueprint already linked to an exercise this device knows', () => {
      const linked = WeightedExerciseBlueprint.of({ name: 'Leg Press', exerciseId: 'user-1' });
      expect(resolver({ 'user-1': descriptor('My Press') }).link(linked)).toBe(linked);
    });

    it('resolves an unlinked blueprint by its name', () => {
      const linked = resolver().link(WeightedExerciseBlueprint.of({ name: 'Leg Press' }));
      expect(linked.exerciseId).toBe('Leg Press');
      expect(linked.isLinked).toBe(true);
    });

    it('resolves an id from someone else’s device by name', () => {
      const shared = WeightedExerciseBlueprint.of({ name: 'Barbell Squat', exerciseId: 'a-friends-uuid' });
      expect(resolver().link(shared).exerciseId).toBe('Barbell Squat');
    });

    it('gives a weighted and a cardio exercise of the same name one id and different keys', () => {
      const r = resolver();
      const weighted = r.link(WeightedExerciseBlueprint.of({ name: 'Rowing' }));
      const cardio = r.link(new CardioExerciseBlueprint('Rowing', [CardioExerciseSetBlueprint.empty()], '', ''));
      expect(cardio.exerciseId).toBe(weighted.exerciseId);
      expect(cardio.movementKey()).not.toBe(weighted.movementKey());
      expect(cardio.progressionKey()).not.toBe(weighted.progressionKey());
    });

    it('links every exercise of a program', () => {
      const program = new ProgramBlueprint(
        'Plan',
        [
          new SessionBlueprint(
            'Day',
            [WeightedExerciseBlueprint.of({ name: 'leg press' }), WeightedExerciseBlueprint.of({ name: 'Mystery' })],
            '',
          ),
        ],
        LocalDate.of(2026, 1, 1),
      );
      const ids = resolver()
        .linkProgram(program)
        .sessions[0]!.exercises.map((x) => x.exerciseId);
      expect(ids).toEqual(['Leg Press', stubExerciseId('Mystery')]);
    });
  });
});

describe('missingStubs', () => {
  it('lists the stubs a workout points at that the exercise list lacks', () => {
    const placeholder = WeightedExerciseBlueprint.of({ name: 'New Exercise' });
    expect(missingStubs([placeholder], () => false)).toEqual({ [placeholder.exerciseId]: descriptor('New Exercise') });
    expect(missingStubs([placeholder], () => true)).toEqual({});
  });

  it('never brings back an exercise the user deleted', () => {
    const deleted = WeightedExerciseBlueprint.of({ name: 'Old', exerciseId: 'deleted-uuid' });
    expect(missingStubs([deleted], () => false)).toEqual({});
  });
});
