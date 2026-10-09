import { createAction, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Duration, OffsetDateTime } from '@js-joda/core';
import { Weight } from '@/models/weight';
import { RemoteData } from '@/models/remote';
import { ExerciseId, MovementKey } from '@/models/blueprint-models';

/** How many days back from today the overall stats reach. */
export const OVERALL_STATS_DAYS = 90;

interface StatsState {
  isDirty: boolean;
  overallViewSessionName: string | undefined;
  overallView: RemoteData<GranularStatisticView>;
}

export interface TimeTrackedStatistic<T> {
  dateTime: OffsetDateTime;
  value: T;
}

// We use this to ensure that when showing multiple series with disparate data, we can ensure that the x axis points are properly aligned
interface OptionalTimeTrackedStatistic<T> {
  dateTime: OffsetDateTime;
  value: T | undefined;
}

export interface WeightedExerciseStatistics {
  /** The name it was last logged under. */
  exerciseName: string;
  exerciseId: ExerciseId;
  movementKey: MovementKey;
  /** Needs both axes, so an exercise that tracks no load has nothing to offer here. */
  max1RMPerSessionStatistics: WeightedStatisticOverTime;
  totalVolumeStatistics: WeightedStatisticOverTime;
}

export interface StatisticOverTime<T> {
  statistics: TimeTrackedStatistic<T>[];
  currentValue: T;
  totalValue: T;
  maxValue: T;
  minValue: T;
}

export type WeightedStatisticOverTime = StatisticOverTime<Weight>;

export interface OptionalStatisticOverTime<T> {
  title: string;
  statistics: OptionalTimeTrackedStatistic<T>[];
  maxValue: T;
  minValue: T;
}

export interface HeaviestLift {
  exerciseName: string;
  weight: Weight;
}

export interface GranularStatisticView {
  workoutsPerWeek: number;
  setsPerWeek: number;
  maxWeightLiftedInAWorkout: Weight | undefined;
  averageSessionLength: Duration;
  heaviestLift: HeaviestLift | undefined;
  weightedExerciseStats: WeightedExerciseStatistics[];
  sessionStats: OptionalStatisticOverTime<Weight>[];
  bodyweightStats: WeightedStatisticOverTime;
}

const initialState: StatsState = {
  isDirty: true,
  overallViewSessionName: undefined,
  overallView: RemoteData.notAsked(),
};

const statsSlice = createSlice({
  name: 'stats',
  initialState,
  reducers: {
    setOverallStats(state, action: PayloadAction<RemoteData<GranularStatisticView>>) {
      state.overallView = action.payload;
    },
    setStatsIsDirty(state, action: PayloadAction<boolean>) {
      state.isDirty = action.payload;
    },
    setOverallViewSession(state, action: PayloadAction<string | undefined>) {
      state.overallViewSessionName = action.payload;
    },
  },
  selectors: {
    selectOverallView: (state: StatsState) => state.overallView,
  },
});

export const { setOverallStats, setStatsIsDirty } = statsSlice.actions;

export const { selectOverallView } = statsSlice.selectors;
/** Calculates the overall stats over the last {@link OVERALL_STATS_DAYS} days, if they are stale. */
export const fetchOverallStats = createAction('fetchOverallStats');

export const statsReducer = statsSlice.reducer;
