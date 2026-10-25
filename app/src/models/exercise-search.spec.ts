import { describe, expect, it } from 'vitest';
import { pickerListOf } from '@/components/presentation/workout-editor/exercise-picker';
import { filterExercises } from '@/components/presentation/workout-editor/filter-exercises';
import { searchEntryOf, searchScores } from '@/models/exercise-search';
import { BuiltInExerciseJSON, ExerciseTranslationMap, resolveCatalog } from '@/services/exercise-catalog';
import base from '../../assets/exercises.json';
import english from '../../assets/exercises/en.json';

// The bundled English catalog, as the app resolves it.
const catalog = resolveCatalog(base.exercises as BuiltInExerciseJSON[], english as ExerciseTranslationMap);

/** The picker's matches for a query, best first. */
function ranked(query: string): string[] {
  return pickerListOf(catalog, [], { query, muscle: undefined, equipment: undefined }).rows.flatMap((row) =>
    row.kind === 'exercise' ? [row.id] : [],
  );
}

function rankOf(query: string, id: string): number {
  expect(catalog[id], id).toBeDefined();
  return ranked(query).indexOf(id) + 1;
}

describe('exercise search on the built-in catalog', () => {
  it.each(['bench press', 'press bench'])('puts a barbell bench press in the top 3 for "%s"', (query) => {
    const top = ranked(query).slice(0, 3);
    expect(top.some((id) => /bench press/i.test(id) && catalog[id]!.equipment === 'barbell')).toBe(true);
  });

  it.each([
    ['pull up', 'Pullups'],
    ['pull-ups', 'Pullups'],
    ['chin up', 'Chin-Up'],
    ['chinup', 'Chin-Up'],
  ])('finds "%s" as %s, first', (query, id) => {
    expect(rankOf(query, id)).toBe(1);
  });

  it.each([
    'Romanian Deadlift',
    'Barbell Bench Press - Medium Grip',
    'EZ-Bar Curl',
    'Standing Military Press',
    'Dumbbell Flyes',
    'Pullups',
    'Chin-Up',
  ])('ranks the exact name "%s" first', (name) => {
    expect(rankOf(name, name)).toBe(1);
    expect(rankOf(name.toLowerCase(), name)).toBe(1);
  });

  it.each([
    ['barbell sq', 'Barbell Squat'],
    ['romanian', 'Romanian Deadlift'],
    ['leg ext', 'Leg Extensions'],
    ['hammer curls', 'Hammer Curls'],
    ['hammer curl', 'Hammer Curls'],
  ])('ranks "%s" as %s first', (query, id) => {
    expect(rankOf(query, id)).toBe(1);
  });

  it('matches across accents, case, punctuation and plurals', () => {
    expect(rankOf('BÁRBELL  squats', 'Barbell Squat')).toBe(1);
    expect(rankOf('dumbbell flies', 'Dumbbell Flyes')).toBe(1);
    expect(rankOf('db bench press', 'Dumbbell Bench Press')).toBe(1);
  });

  it('needs every word to match', () => {
    expect(ranked('barbell squat').every((id) => /barbell|ez/i.test(id) && /squat/i.test(id))).toBe(true);
  });

  it('falls back to a loose letter match when no word matches', () => {
    expect(ranked('brbl sqt')).toContain('Barbell Squat');
  });

  it('finds names with parentheses and dots in Settings > Exercises', () => {
    expect(filterExercises(catalog, 'Shoulder (Military) Press', []).ids[0]).toBe('Machine Shoulder (Military) Press');
    expect(filterExercises(catalog, 'Pushups (Close and', []).ids[0]).toBe('Pushups (Close and Wide Hand Positions)');
  });
});

describe('searchScores', () => {
  const entries = [searchEntryOf('a', 'Bench Press'), searchEntryOf('b', 'Press Bench Machine')];

  it('is empty for a blank query', () => {
    expect(searchScores(entries, '  ').size).toBe(0);
  });

  it('scores words in the query order above the same words out of order', () => {
    const scores = searchScores(entries, 'bench press');
    expect(scores.get('a')!).toBeGreaterThan(scores.get('b')!);
  });
});
