import { LocalDate } from '@js-joda/core';
import BigNumber from 'bignumber.js';
import { Weight, WeightUnit } from '@/models/weight';
import type { ProgressHistory } from '@/store/stats/progress-history';

/** How many weigh-ins Body lists. */
export const WEIGH_INS_SHOWN = 5;

/** A bodyweight entered with a workout. */
export interface WeighIn {
  workoutId: string;
  date: LocalDate;
  /** In the user's unit. */
  weight: number;
  /** Against the weigh-in before; undefined for the first one. */
  change: number | undefined;
}

export interface BodyChartPoint {
  date: LocalDate;
  weight: number;
  /** The bodyweight carried in from before the range, drawn at its start. */
  carried: boolean;
}

export interface BodyView {
  current: number;
  lastWeighed: LocalDate;
  /**
   * The latest bodyweight against the one at the range's start: the last weigh-in before it, or else the first
   * in it. Undefined with nothing to compare against.
   */
  change: number | undefined;
  /** Oldest first. Never empty. */
  chart: BodyChartPoint[];
  /** Over the chart's points. */
  lowest: number;
  average: number;
  highest: number;
  /** The latest {@link WEIGH_INS_SHOWN} weigh-ins, latest first, whatever the range. */
  recent: WeighIn[];
}

/**
 * The weigh-ins, oldest first. A new workout starts with the last one's bodyweight, so a workout whose
 * bodyweight is the same as the weigh-in before counts as no new weigh-in.
 */
export function weighInsOf(history: ProgressHistory, unit: WeightUnit): WeighIn[] {
  const weighIns: WeighIn[] = [];
  let last: Weight | undefined;
  for (const workout of history.workouts) {
    const { bodyweight } = workout;
    if (!bodyweight || (last && bodyweight.equals(last, true))) {
      continue;
    }
    const weight = bodyweight.convertTo(unit).value.toNumber();
    const before = weighIns.at(-1);
    weighIns.push({
      workoutId: workout.workoutId,
      date: workout.date,
      weight,
      change: before && bodyweight.convertTo(unit).value.minus(before.weight).toNumber(),
    });
    last = bodyweight;
  }
  return weighIns;
}

/** Body's numbers over the range starting `since`; undefined for someone who has never logged a bodyweight. */
export function bodyView(history: ProgressHistory, since: LocalDate, unit: WeightUnit): BodyView | undefined {
  const weighIns = weighInsOf(history, unit);
  const latest = weighIns.at(-1);
  if (!latest) {
    return undefined;
  }
  const inRange = weighIns.filter((weighIn) => !weighIn.date.isBefore(since));
  const carriedIn = weighIns.filter((weighIn) => weighIn.date.isBefore(since)).at(-1);
  const chart: BodyChartPoint[] = [
    ...(carriedIn ? [{ date: since, weight: carriedIn.weight, carried: true }] : []),
    ...inRange.map((weighIn) => ({ date: weighIn.date, weight: weighIn.weight, carried: false })),
  ];
  const weights = chart.map((point) => point.weight);
  const first = chart[0]!;
  return {
    current: latest.weight,
    lastWeighed: latest.date,
    change: chart.length > 1 || first.carried ? new BigNumber(latest.weight).minus(first.weight).toNumber() : undefined,
    chart,
    lowest: Math.min(...weights),
    average: weights.reduce((sum, weight) => sum + weight, 0) / weights.length,
    highest: Math.max(...weights),
    recent: weighIns.slice(-WEIGH_INS_SHOWN).reverse(),
  };
}
