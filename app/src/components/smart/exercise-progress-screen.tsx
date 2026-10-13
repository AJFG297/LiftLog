import type { TranslateFn } from '@/i18n/translate-fn';
import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { SegmentedControl, segmentedOptions } from '@/components/presentation/foundation/segmented-control';
import { targetLabel, targetReasonText } from '@/components/presentation/live-workout/target-text';
import { amountText, signedText, weightText } from '@/components/presentation/stats/amount-format';
import { ExerciseChart } from '@/components/presentation/stats/exercise/exercise-chart';
import {
  ExerciseChange,
  ExerciseChartCard,
  ExerciseHero,
} from '@/components/presentation/stats/exercise/exercise-chart-card';
import { ExerciseHeader } from '@/components/presentation/stats/exercise/exercise-header';
import {
  NextTimeCard,
  RecentSessionsCard,
  RecordTimeline,
  RecordTimelineRow,
  RepBestsCard,
} from '@/components/presentation/stats/exercise/exercise-sections';
import { SetLabels, SetSpans, setText } from '@/components/presentation/stats/exercise/set-text';
import { ListCard, ListEmptyLine, ListEmptyState } from '@/components/presentation/stats/list-parts';
import { recordKindLabel } from '@/components/presentation/stats/record-text';
import { ProgressSection } from '@/components/presentation/stats/progress/progress-section';
import { numberStyle, spacing } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import { usePreferredWeightSuffix, usePreferredWeightUnit } from '@/hooks/usePreferredWeightUnit';
import { useProgressHistory } from '@/hooks/useProgressHistory';
import { useToday } from '@/hooks/useToday';
import { ExerciseId, movementKeyFor } from '@/models/blueprint-models';
import { ExerciseDescriptor } from '@/models/exercise-models';
import { nextTimeOf } from '@/models/session-models/next-exercise';
import { shortFormatWeightUnit } from '@/models/weight';
import { useAppSelector, useAppSelectorWithArg } from '@/store';
import { selectActiveProgram } from '@/store/program';
import { setPinnedLifts } from '@/store/settings';
import { togglePinned } from '@/store/settings/pinned-lifts';
import {
  defaultRangeOf,
  EXERCISE_RANGES,
  exerciseChartOf,
  ExerciseMeasure,
  ExerciseRange,
  exerciseRecordsOf,
  ExerciseSession,
  hasRecordDots,
  measuresOf,
  rangeStart,
  recentSessionsOf,
  repBestsOf,
  RowValueKind,
} from '@/store/stats/exercise-progress';
import { axisOf, ExerciseHistory, ProgressHistory } from '@/store/stats/progress-history';
import { RecordListRow } from '@/store/stats/records-list';
import { selectExerciseById, selectLatestExercises } from '@/store/stored-sessions';
import { exerciseMetaLabel } from '@/utils/exercise-meta';
import { LocalDate } from '@js-joda/core';
import { TranslationKey, useTranslate } from '@tolgee/react';
import { Stack, useRouter } from 'expo-router';
import { ReactNode, useState } from 'react';
import { Text } from 'react-native';
import { useDispatch } from 'react-redux';

/** How many muscles the line over the name lists before the equipment. */
const MUSCLES_SHOWN = 3;

const MEASURE_LABELS: Record<ExerciseMeasure, { option: TranslationKey; hero: TranslationKey }> = {
  oneRepMax: {
    option: 'progress.exercise.measure.one_rep_max.label',
    hero: 'progress.exercise.hero.one_rep_max.label',
  },
  heaviest: { option: 'progress.exercise.measure.heaviest.label', hero: 'progress.exercise.hero.heaviest.label' },
  volume: { option: 'progress.exercise.measure.volume.label', hero: 'progress.exercise.hero.volume.label' },
  mostReps: { option: 'progress.exercise.measure.most_reps.label', hero: 'progress.exercise.hero.most_reps.label' },
  totalReps: { option: 'progress.exercise.measure.total_reps.label', hero: 'progress.exercise.hero.total_reps.label' },
};

const ROW_VALUE_LABELS: Record<RowValueKind, TranslationKey> = {
  oneRepMax: 'progress.exercise.recent.value.one_rep_max.label',
  heaviest: 'progress.exercise.recent.value.heaviest.label',
  mostReps: 'progress.exercise.recent.value.most_reps.label',
};

const RANGE_LABELS: Record<ExerciseRange, { chip: TranslationKey; spoken: TranslationKey; since: TranslationKey }> = {
  '3m': {
    chip: 'progress.exercise.range.three_months.label',
    spoken: 'progress.exercise.range.three_months.spoken',
    since: 'progress.exercise.since.three_months.label',
  },
  '6m': {
    chip: 'progress.exercise.range.six_months.label',
    spoken: 'progress.exercise.range.six_months.spoken',
    since: 'progress.exercise.since.six_months.label',
  },
  '1y': {
    chip: 'progress.exercise.range.one_year.label',
    spoken: 'progress.exercise.range.one_year.spoken',
    since: 'progress.exercise.since.one_year.label',
  },
  all: {
    chip: 'progress.exercise.range.all.label',
    spoken: 'progress.exercise.range.all.spoken',
    since: 'progress.exercise.since.all.label',
  },
};

/**
 * One weighted exercise's progress: its chart on a measure and range, what the next workout opens it on, best
 * weight by reps, the last five times and its records. Pin to Progress puts it at the top of Strength. Every
 * number comes from `store/stats/exercise-progress.ts`; this only picks and formats.
 */
export function ExerciseProgressScreen({ exerciseId }: { exerciseId: ExerciseId }) {
  const { t } = useTranslate();
  const dispatch = useDispatch();
  const unit = usePreferredWeightUnit();
  const history = useProgressHistory();
  const descriptor = useAppSelectorWithArg(selectExerciseById, exerciseId);
  const pinnedLifts = useAppSelector((x) => x.settings.pinnedLifts);
  const latestExercises = useAppSelector(selectLatestExercises);
  const program = useAppSelector(selectActiveProgram);
  const upcoming = useAppSelector((x) => x.program.upcomingSessions);

  const key = movementKeyFor(exerciseId, 'WeightedExerciseBlueprint');
  const exercise = history?.exercises.get(key);
  const name = descriptor?.name ?? exercise?.name ?? '';
  const pinned = pinnedLifts.includes(exerciseId);

  // Upcoming sessions are in the order the plan comes up; until they load, the plan's own order stands in.
  const routines = upcoming.isSuccess() ? upcoming.data.map((session) => session.blueprint) : program.sessions;
  const nextTime = nextTimeOf(routines, key, latestExercises, unit);
  const nextTimeTarget = nextTime && targetLabel(t, nextTime.target, nextTime.usesBodyweight);
  const nextTimeLine =
    nextTime &&
    t('progress.exercise.next.line.label', {
      routine: nextTime.routineName,
      reason: targetReasonText(t, nextTime.target.reason, 'short'),
    });
  const nextTimeCard =
    nextTimeTarget && nextTimeLine ? (
      <NextTimeCard
        title={t('progress.exercise.next.title')}
        target={nextTimeTarget}
        line={nextTimeLine}
        spoken={t('progress.exercise.next.spoken', { target: nextTimeTarget, line: nextTimeLine })}
      />
    ) : null;

  return (
    <>
      {/* The page draws its own large title, so the header shows none; `title` still names it in the back menu. */}
      <Stack.Screen options={{ title: name, headerTitle: '' }} />
      <FullHeightScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingTop: spacing[1],
          paddingBottom: spacing[10],
          gap: 18,
        }}
      >
        <ExerciseHeader
          meta={metaLine(t, descriptor)}
          name={name}
          pinned={pinned}
          pinLabel={pinned ? t('progress.exercise.pinned.button') : t('progress.exercise.pin.button')}
          onTogglePin={() => dispatch(setPinnedLifts(togglePinned(pinnedLifts, exerciseId)))}
        />
        {history && exercise ? <ExerciseBody history={history} exercise={exercise} nextTime={nextTimeCard} /> : null}
        {history && !exercise ? (
          <>
            {nextTimeCard}
            <ListEmptyState title={t('progress.exercise.empty.title')} body={t('progress.exercise.empty.body')} />
          </>
        ) : null}
      </FullHeightScrollView>
    </>
  );
}

/** Everything under the header, for an exercise with history. Keeps the measure, range and pick. */
function ExerciseBody({
  history,
  exercise,
  nextTime,
}: {
  history: ProgressHistory;
  exercise: ExerciseHistory;
  nextTime: ReactNode;
}) {
  const { t } = useTranslate();
  const router = useRouter();
  const formatDate = useFormatDate();
  const today = useToday();
  const unit = usePreferredWeightUnit();
  const unitLabel = usePreferredWeightSuffix();
  const [chosenMeasure, setMeasure] = useState<ExerciseMeasure | undefined>(undefined);
  const [chosenRange, setRange] = useState<ExerciseRange | undefined>(undefined);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string | undefined>(undefined);

  const measures = measuresOf(exercise);
  const measure = chosenMeasure && measures.includes(chosenMeasure) ? chosenMeasure : measures[0];
  const range = chosenRange ?? defaultRangeOf(exercise, today);
  const chart = exerciseChartOf(history, exercise, measure, rangeStart(range, today), unit, selectedWorkoutId);
  const selected = chart.selected === undefined ? undefined : chart.sessions[chart.selected];
  const isReps = axisOf(exercise) === 'reps';
  const valueUnit = isReps ? t('progress.reps_unit.label') : unitLabel;
  const setLabels: SetLabels = {
    usesBodyweight: exercise.blueprint.resistance === 'bodyweight',
    bodyweight: t('exercise.short_bodyweight.label'),
    reps: t('progress.reps_unit.label'),
  };
  const shortDate = (date: LocalDate) => formatDate(date, { month: 'short', day: 'numeric' });
  const longDate = (date: LocalDate) => formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' });
  const heroLabel = t(MEASURE_LABELS[measure].hero);
  const valueText = (session: ExerciseSession) => `${amountText(session.value)} ${valueUnit}`;
  const select = (workoutId: string) => setSelectedWorkoutId(workoutId);

  const hero: ExerciseHero | undefined = selected && {
    label: heroLabel,
    value: amountText(selected.value),
    unit: valueUnit,
    date:
      chart.selected === chart.sessions.length - 1
        ? t('progress.exercise.hero.last_time.label', { date: shortDate(selected.date) })
        : longDate(selected.date),
    set: selected.set && <SetSpans set={selected.set} labels={setLabels} />,
  };
  const signed = chart.change === undefined ? undefined : signedText(chart.change);
  const change: ExerciseChange | undefined = signed && {
    text: signed.text ?? t('progress.same.label'),
    unit: signed.text ? valueUnit : undefined,
    tone: signed.tone,
    since:
      range === 'all'
        ? t('progress.exercise.since.all.label', {
            date: formatDate(exercise.points[0]!.date, { month: 'short', year: 'numeric' }),
          })
        : t(RANGE_LABELS[range].since),
  };

  const repBests = repBestsOf(exercise, unit);
  const recent = recentSessionsOf(chart);
  const records = isReps ? undefined : exerciseRecordsOf(history, exercise.key, unit);
  const rowValueLabel = t(ROW_VALUE_LABELS[chart.rowValue]);
  const volumeUnit = isReps ? t('progress.reps_unit.label') : unitLabel;

  return (
    <>
      <SegmentedControl<ExerciseMeasure>
        testID="exercise-measure"
        accessibilityLabel={t('progress.exercise.measure.label')}
        value={measure}
        onChange={setMeasure}
        options={segmentedOptions(measures, (value) => t(MEASURE_LABELS[value].option))}
      />
      <ExerciseChartCard
        hero={hero}
        change={change}
        chart={
          chart.selected === undefined ? null : (
            <ExerciseChart
              values={chart.sessions.map((session) => session.value)}
              dots={chart.sessions.map((session) => session.best)}
              selected={chart.selected}
              onSelect={(index) => select(chart.sessions[index]!.workoutId)}
              gridLabel={(value) => amountText(value)}
              dateLabel={(index) => shortDate(chart.sessions[index]!.date)}
              accessibilityLabel={heroLabel}
              accessibilityValue={selected ? `${longDate(selected.date)}, ${valueText(selected)}` : ''}
            />
          )
        }
        emptyText={chart.sessions.length ? undefined : t('progress.exercise.chart.empty.body')}
        sparseText={exercise.points.length === 1 ? t('progress.exercise.chart.one_session.body') : undefined}
        ranges={EXERCISE_RANGES.map((value) => ({
          value,
          label: t(RANGE_LABELS[value].chip),
          spoken: t(RANGE_LABELS[value].spoken),
        }))}
        range={range}
        onRange={setRange}
        legend={hasRecordDots(exercise, measure) ? t('progress.exercise.legend.record.label') : undefined}
        note={measure === 'oneRepMax' ? t('progress.exercise.one_rep_max.note.body') : undefined}
      />
      {nextTime}
      {repBests ? (
        <ProgressSection title={t('progress.exercise.rep_bests.title')}>
          <RepBestsCard
            cells={repBests.map((best) => {
              const label = t('progress.exercise.rep_bests.reps.label', { reps: best.reps });
              const weight = best.weight && amountText(best.weight.value);
              return {
                label,
                amount: weight ?? '–',
                unit: best.weight && shortFormatWeightUnit(best.weight.unit),
                date: best.date && shortDate(best.date),
                spoken: best.weight
                  ? t('progress.exercise.rep_bests.cell.spoken', {
                      reps: best.reps,
                      weight: weightText(best.weight),
                      date: best.date ? longDate(best.date) : '',
                    })
                  : t('progress.exercise.rep_bests.none.spoken', { reps: best.reps }),
              };
            })}
          />
        </ProgressSection>
      ) : null}
      {recent.length ? (
        <ProgressSection
          title={
            recent.length === 1
              ? t('progress.exercise.recent.title.one')
              : t('progress.exercise.recent.title.other', { count: recent.length })
          }
        >
          <RecentSessionsCard
            prLabel={t('progress.exercise.recent.pr.label')}
            rows={recent.map((session) => {
              const summary =
                session.sets === 1
                  ? t('progress.exercise.recent.summary.one', {
                      volume: `${amountText(session.volume)} ${volumeUnit}`,
                    })
                  : t('progress.exercise.recent.summary.other', {
                      count: session.sets,
                      volume: `${amountText(session.volume)} ${volumeUnit}`,
                    });
              const value = session.rowValue === undefined ? undefined : amountText(session.rowValue);
              return {
                key: session.workoutId,
                month: formatDate(session.date, { month: 'short' }),
                day: session.date.dayOfMonth(),
                set: session.set ? <SetSpans set={session.set} labels={setLabels} /> : '–',
                summary,
                record: session.record,
                value,
                valueLabel: rowValueLabel,
                selected: session.workoutId === selected?.workoutId,
                spoken: [
                  longDate(session.date),
                  session.set ? setText(session.set, setLabels) : undefined,
                  summary,
                  value ? `${rowValueLabel} ${value}` : undefined,
                  session.record ? t('progress.exercise.recent.pr.spoken') : undefined,
                ]
                  .filter(Boolean)
                  .join(', '),
                onPress: () => select(session.workoutId),
              };
            })}
          />
        </ProgressSection>
      ) : null}
      {records ? (
        <ProgressSection
          title={t('progress.exercise.records.title')}
          action={{
            label: t('progress.exercise.records.all.button'),
            onPress: () => router.push('/records'),
            testID: 'exercise-all-records',
          }}
        >
          {records.length ? (
            <RecordTimeline rows={records.map((row) => recordTimelineRow(t, row, setLabels, longDate))} />
          ) : (
            <ListCard>
              <ListEmptyLine text={t('progress.exercise.records.empty.body')} />
            </ListCard>
          )}
        </ProgressSection>
      ) : null}
    </>
  );
}

function recordTimelineRow(
  t: TranslateFn,
  row: RecordListRow,
  setLabels: SetLabels,
  longDate: (date: LocalDate) => string,
): RecordTimelineRow {
  const unit = shortFormatWeightUnit(row.value.unit);
  const kind = recordKindLabel(t, row.kind);
  const set = row.kind === 'heaviestWeight' ? { weight: row.value, reps: row.reps } : undefined;
  const gain = signedText(row.gain.value).text;
  return {
    key: row.key,
    kind,
    value: set ? (
      <SetSpans set={set} labels={setLabels} />
    ) : (
      <>
        <Text style={numberStyle}>{amountText(row.value.value)}</Text>
        {` ${unit}`}
      </>
    ),
    date: longDate(row.date),
    gain: gain && `${gain} ${unit}`,
    spoken: [kind, set ? setText(set, setLabels) : weightText(row.value), longDate(row.date), gain && `${gain} ${unit}`]
      .filter(Boolean)
      .join(', '),
  };
}

function metaLine(t: TranslateFn, descriptor: ExerciseDescriptor | undefined): string | undefined {
  if (!descriptor) {
    return undefined;
  }
  const muscles = [...new Set([...descriptor.primaryMuscles, ...descriptor.secondaryMuscles])].slice(0, MUSCLES_SHOWN);
  const parts = [
    ...muscles.map((muscle) => exerciseMetaLabel(t, 'muscle', muscle)),
    ...(descriptor.equipment ? [exerciseMetaLabel(t, 'equipment', descriptor.equipment)] : []),
  ];
  return parts.length ? parts.join(' · ') : undefined;
}
