import { LocalDate } from '@js-joda/core';
import { ExerciseId } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { weekStart } from '@/store/activity/week-start';
import type { ProgressHistory } from '@/store/stats/progress-history';
import type { ProgressPeriod } from '@/store/stats/progress-tab';

/**
 * A muscle as sets per muscle groups it: the catalog's back muscles are one Back, and every other muscle is
 * itself (lower case, as the catalog spells it).
 */
export type MuscleKey = string;

const MUSCLE_KEY_OF: Record<string, MuscleKey> = {
  lats: 'back',
  'middle back': 'back',
  'lower back': 'back',
  traps: 'back',
};

/** Weeks of at least this many workouts make up the longest run. */
export const RUN_WORKOUTS = 3;

function muscleKeyOf(muscle: string): MuscleKey | undefined {
  const name = muscle.trim().toLowerCase();
  return name ? (MUSCLE_KEY_OF[name] ?? name) : undefined;
}

/**
 * What one working set of an exercise counts for each muscle: 1 for a muscle it mainly works, ½ for one it
 * only helps. A muscle that is both, through grouping, counts in full. A custom exercise's muscles are all
 * primary, and one with none (or an exercise no longer in the list) counts for nothing.
 */
export function muscleSharesOf(exercise: ExerciseDescriptor | undefined): Map<MuscleKey, number> {
  const shares = new Map<MuscleKey, number>();
  for (const muscle of exercise?.secondaryMuscles ?? []) {
    const key = muscleKeyOf(muscle);
    if (key) {
      shares.set(key, 0.5);
    }
  }
  for (const muscle of exercise?.primaryMuscles ?? []) {
    const key = muscleKeyOf(muscle);
    if (key) {
      shares.set(key, 1);
    }
  }
  return shares;
}

/** One calendar week's training. */
export interface WeekTotals {
  /** The week's first day. */
  start: LocalDate;
  /** Started workouts. */
  workouts: number;
  /** Working sets of weighted exercises (every kind but warm-ups). */
  sets: number;
  /** Working sets per muscle, a set counting half for a muscle its exercise only helps. */
  muscleSets: ReadonlyMap<MuscleKey, number>;
}

/**
 * The weeks Training reads, built once. Every number on the tab comes from here, so the bars, the averages,
 * the run and sets per muscle always agree.
 */
export interface WeeklyTable {
  /** The complete weeks before the range, as many as it has: what a change is measured against. */
  previous: readonly WeekTotals[];
  /** The range's complete weeks, oldest first. */
  complete: readonly WeekTotals[];
  /** This week so far. */
  thisWeek: WeekTotals;
  /** The week the history starts in. Weeks before it aren't averaged, as nobody was training yet. */
  firstWeek: LocalDate | undefined;
}

interface MutableWeek {
  start: LocalDate;
  workouts: number;
  sets: number;
  muscleSets: Map<MuscleKey, number>;
}

export function buildWeeklyTable(
  history: ProgressHistory,
  exercises: Readonly<Record<ExerciseId, ExerciseDescriptor | undefined>>,
  period: ProgressPeriod,
): WeeklyTable {
  const firstDayOfWeek = period.thisWeek.dayOfWeek();
  const weeks: MutableWeek[] = [];
  const byStart = new Map<string, MutableWeek>();
  const { completeWeeks } = period;
  for (let ago = completeWeeks * 2; ago >= 0; ago--) {
    const start = period.thisWeek.minusWeeks(ago);
    const week = { start, workouts: 0, sets: 0, muscleSets: new Map<MuscleKey, number>() };
    weeks.push(week);
    byStart.set(start.toString(), week);
  }
  const weekOf = (date: LocalDate) => byStart.get(weekStart(date, firstDayOfWeek).toString());

  for (const workout of history.workouts) {
    const week = weekOf(workout.date);
    if (week) {
      week.workouts++;
    }
  }
  for (const exercise of history.exercises.values()) {
    const shares = muscleSharesOf(exercises[exercise.blueprint.exerciseId]);
    for (const point of exercise.points) {
      const week = weekOf(point.date);
      if (!week) {
        continue;
      }
      week.sets += point.workingSets;
      for (const [muscle, share] of shares) {
        week.muscleSets.set(muscle, (week.muscleSets.get(muscle) ?? 0) + point.workingSets * share);
      }
    }
  }

  return {
    previous: weeks.slice(0, completeWeeks),
    complete: weeks.slice(completeWeeks, completeWeeks * 2),
    thisWeek: weeks[completeWeeks * 2]!,
    firstWeek: history.firstDate && weekStart(history.firstDate, firstDayOfWeek),
  };
}

/** A weekly average and how far it moved against the period before, of the same length. */
export interface WeeklyAverage {
  /** Undefined with no complete week of history in the range. */
  average: number | undefined;
  /** This period's average less the previous one's; undefined when either has no weeks to average. */
  change: number | undefined;
}

export interface WeekBar {
  start: LocalDate;
  workouts: number;
  isThisWeek: boolean;
}

export interface MuscleSets {
  muscle: MuscleKey;
  /** Working sets a week, on average over the range's complete weeks. */
  setsPerWeek: number;
}

export interface TrainingView {
  workoutsPerWeek: WeeklyAverage;
  setsPerWeek: WeeklyAverage;
  /** The range's complete weeks, then this week, oldest first. */
  bars: WeekBar[];
  /** The most weeks in a row with at least {@link RUN_WORKOUTS} workouts, this week counting once it gets there. */
  longestRun: number;
  /** Muscles with any sets, most sets first. */
  muscles: MuscleSets[];
}

export function trainingView(table: WeeklyTable): TrainingView {
  const current = coveredWeeks(table.complete, table.firstWeek);
  const previous = coveredWeeks(table.previous, table.firstWeek);
  const weekly = (pick: (week: WeekTotals) => number): WeeklyAverage => {
    const average = averageOf(current, pick);
    const before = averageOf(previous, pick);
    return { average, change: average !== undefined && before !== undefined ? average - before : undefined };
  };

  const counted = table.thisWeek.workouts >= RUN_WORKOUTS ? [...table.complete, table.thisWeek] : table.complete;
  let run = 0;
  let longestRun = 0;
  for (const week of counted) {
    run = week.workouts >= RUN_WORKOUTS ? run + 1 : 0;
    longestRun = Math.max(longestRun, run);
  }

  const muscleTotals = new Map<MuscleKey, number>();
  for (const week of current) {
    for (const [muscle, sets] of week.muscleSets) {
      muscleTotals.set(muscle, (muscleTotals.get(muscle) ?? 0) + sets);
    }
  }
  const muscles = [...muscleTotals]
    .map(([muscle, sets]) => ({ muscle, setsPerWeek: sets / current.length }))
    // Shown to the nearest half, so anything under a quarter would read "0".
    .filter(({ setsPerWeek }) => setsPerWeek >= 0.25)
    .sort((a, b) => b.setsPerWeek - a.setsPerWeek || a.muscle.localeCompare(b.muscle));

  return {
    workoutsPerWeek: weekly((week) => week.workouts),
    setsPerWeek: weekly((week) => week.sets),
    bars: [...table.complete, table.thisWeek].map((week) => ({
      start: week.start,
      workouts: week.workouts,
      isThisWeek: week === table.thisWeek,
    })),
    longestRun,
    muscles,
  };
}

function coveredWeeks(weeks: readonly WeekTotals[], firstWeek: LocalDate | undefined): WeekTotals[] {
  return firstWeek ? weeks.filter((week) => !week.start.isBefore(firstWeek)) : [];
}

function averageOf(weeks: readonly WeekTotals[], pick: (week: WeekTotals) => number): number | undefined {
  return weeks.length ? weeks.reduce((sum, week) => sum + pick(week), 0) / weeks.length : undefined;
}
