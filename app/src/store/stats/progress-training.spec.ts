import { describe, expect, it } from 'vitest';
import { stubExerciseId } from '@/models/blueprint-models';
import {
  day,
  descriptor,
  exerciseHistory,
  historyOf,
  periodFor,
  point,
  workout,
} from '@/store/stats/__test__/progress-fixtures';
import { buildWeeklyTable, muscleSharesOf, trainingView } from '@/store/stats/progress-training';

// Weeks start on Monday. Over 4 weeks the complete weeks are Aug 31, Sep 7, 14 and 21; this week is Sep 28;
// the period before is Aug 3, 10, 17 and 24.
const workoutsPerWeek: [number, number, number[]][] = [
  [8, 3, [2]],
  [8, 10, [2]],
  [8, 17, [2]],
  [8, 24, [2]],
  [8, 31, [3]],
  [9, 7, [2]],
  [9, 14, [4]],
  [9, 21, [3]],
  [9, 28, [1]],
];

function workoutsFor(counts: [number, number, number[]][]) {
  return counts.flatMap(([month, weekStart, [count]]) =>
    Array.from({ length: count! }, (_, i) => workout(day(month, weekStart).plusDays(i))),
  );
}

const exercises = {
  [stubExerciseId('Bench')]: descriptor('Bench', ['chest'], ['triceps', 'shoulders']),
  [stubExerciseId('Row')]: descriptor('Row', ['lats', 'middle back'], ['biceps']),
  [stubExerciseId('Squat')]: descriptor('Squat', ['quadriceps'], ['glutes']),
  // Custom exercises: one with the muscles the user gave it, one with none.
  [stubExerciseId('Sled Push')]: descriptor('Sled Push', ['quadriceps']),
  [stubExerciseId('Mystery')]: descriptor('Mystery', []),
};

const history = historyOf({
  workouts: workoutsFor(workoutsPerWeek),
  exercises: [
    exerciseHistory('Bench', [
      point(day(8, 4), 2),
      point(day(8, 11), 2),
      point(day(8, 18), 2),
      point(day(8, 25), 2),
      point(day(9, 1), 4),
      point(day(9, 8), 4),
      point(day(9, 15), 4),
      point(day(9, 22), 4),
      point(day(9, 29), 4),
    ]),
    exerciseHistory('Row', [point(day(9, 2), 3), point(day(9, 16), 3)]),
    exerciseHistory('Squat', [point(day(9, 3), 5)]),
    exerciseHistory('Sled Push', [point(day(9, 3), 3)]),
    exerciseHistory('Mystery', [point(day(9, 23), 10)]),
  ],
});

describe('muscleSharesOf', () => {
  it('counts a set in full for primary muscles and as half for secondary ones', () => {
    expect(muscleSharesOf(exercises[stubExerciseId('Bench')])).toEqual(
      new Map([
        ['chest', 1],
        ['triceps', 0.5],
        ['shoulders', 0.5],
      ]),
    );
  });

  it('counts the back muscles once, as Back', () => {
    expect(muscleSharesOf(exercises[stubExerciseId('Row')])).toEqual(
      new Map([
        ['back', 1],
        ['biceps', 0.5],
      ]),
    );
    expect(muscleSharesOf(descriptor('Shrug', ['traps'], ['lower back']))).toEqual(new Map([['back', 1]]));
  });

  it('counts a custom exercise in full for its muscles, and for nothing with none', () => {
    expect(muscleSharesOf(exercises[stubExerciseId('Sled Push')])).toEqual(new Map([['quadriceps', 1]]));
    expect(muscleSharesOf(exercises[stubExerciseId('Mystery')])).toEqual(new Map());
    expect(muscleSharesOf(undefined)).toEqual(new Map());
  });
});

describe('trainingView', () => {
  const view = trainingView(buildWeeklyTable(history, exercises, periodFor('4w')));

  it('averages workouts over complete weeks only, leaving out this week so far', () => {
    // (3 + 2 + 4 + 3) / 4; with this week's one it would be 2.6.
    expect(view.workoutsPerWeek.average).toBe(3);
  });

  it('compares each average with the period before, of the same length', () => {
    expect(view.workoutsPerWeek.change).toBe(1);
    // (15 + 4 + 7 + 14) / 4 against (2 + 2 + 2 + 2) / 4. The custom exercise with no muscles still counts here.
    expect(view.setsPerWeek).toEqual({ average: 10, change: 8 });
  });

  it('averages working sets per muscle, a secondary muscle counting half', () => {
    expect(view.muscles).toEqual([
      { muscle: 'chest', setsPerWeek: 4 },
      // Squat's 5 and the custom Sled Push's 3, over 4 weeks.
      { muscle: 'quadriceps', setsPerWeek: 2 },
      { muscle: 'shoulders', setsPerWeek: 2 },
      { muscle: 'triceps', setsPerWeek: 2 },
      { muscle: 'back', setsPerWeek: 1.5 },
      { muscle: 'biceps', setsPerWeek: 0.75 },
      { muscle: 'glutes', setsPerWeek: 0.625 },
    ]);
  });

  it('draws a bar per complete week and one for this week', () => {
    expect(view.bars.map((bar) => [bar.start.toString(), bar.workouts, bar.isThisWeek])).toEqual([
      ['2026-08-31', 3, false],
      ['2026-09-07', 2, false],
      ['2026-09-14', 4, false],
      ['2026-09-21', 3, false],
      ['2026-09-28', 1, true],
    ]);
  });

  it('finds the longest run of weeks with 3 or more workouts', () => {
    expect(view.longestRun).toBe(2);
  });

  it('counts this week in the run once it has 3 workouts', () => {
    const busyWeek = historyOf({
      workouts: workoutsFor([...workoutsPerWeek.slice(0, -1), [9, 28, [3]]]),
    });

    expect(trainingView(buildWeeklyTable(busyWeek, exercises, periodFor('4w'))).longestRun).toBe(3);
  });

  it('averages only the weeks since the history began', () => {
    const recent = historyOf({
      workouts: workoutsFor(workoutsPerWeek.slice(5)),
      exercises: [exerciseHistory('Bench', [point(day(9, 8), 4), point(day(9, 15), 4), point(day(9, 22), 4)])],
      firstDate: day(9, 9),
    });

    const recentView = trainingView(buildWeeklyTable(recent, exercises, periodFor('4w')));

    // Sep 7, 14 and 21: (2 + 4 + 3) / 3, with nothing before to compare against.
    expect(recentView.workoutsPerWeek).toEqual({ average: 3, change: undefined });
    expect(recentView.muscles[0]).toEqual({ muscle: 'chest', setsPerWeek: 4 });
  });

  it('leaves out a muscle worked too little to show as half a set a week', () => {
    const yearOfBench = historyOf({
      workouts: [workout(day(9, 1))],
      exercises: [exerciseHistory('Bench', [point(day(9, 1), 13)])],
      firstDate: day(9, 1).minusYears(2),
    });

    const yearView = trainingView(buildWeeklyTable(yearOfBench, exercises, periodFor('1y')));

    // 13 sets over 52 weeks is a quarter of a set for chest; triceps and shoulders get half that.
    expect(yearView.muscles).toEqual([{ muscle: 'chest', setsPerWeek: 0.25 }]);
  });

  it('has no averages and no muscles before a complete week has passed', () => {
    const fresh = historyOf({
      workouts: [workout(day(9, 29))],
      exercises: [exerciseHistory('Bench', [point(day(9, 29), 3)])],
    });

    const freshView = trainingView(buildWeeklyTable(fresh, exercises, periodFor('4w')));

    expect(freshView.workoutsPerWeek).toEqual({ average: undefined, change: undefined });
    expect(freshView.setsPerWeek).toEqual({ average: undefined, change: undefined });
    expect(freshView.muscles).toEqual([]);
    expect(freshView.bars.at(-1)).toMatchObject({ workouts: 1, isThisWeek: true });
  });

  it('is empty with no history at all', () => {
    const emptyView = trainingView(buildWeeklyTable(historyOf({}), exercises, periodFor('12w')));

    expect(emptyView.bars).toHaveLength(13);
    expect(emptyView.workoutsPerWeek.average).toBeUndefined();
    expect(emptyView.longestRun).toBe(0);
  });
});
