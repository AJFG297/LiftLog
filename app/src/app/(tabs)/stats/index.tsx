import { SegmentedControl, SegmentedOption } from '@/components/presentation/foundation/segmented-control';
import { BodySection } from '@/components/presentation/stats/progress/body-section';
import { ProgressEmpty } from '@/components/presentation/stats/progress/progress-empty';
import { ProgressHeader } from '@/components/presentation/stats/progress/progress-header';
import { ProgressTabBar } from '@/components/presentation/stats/progress/progress-tab-bar';
import { StrengthSection } from '@/components/presentation/stats/progress/strength-section';
import { TrainingSection } from '@/components/presentation/stats/progress/training-section';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useGoToRoutines } from '@/hooks/useGoToRoutines';
import { usePreferredWeightSuffix, usePreferredWeightUnit } from '@/hooks/usePreferredWeightUnit';
import { useProgressHistory } from '@/hooks/useProgressHistory';
import { useToday } from '@/hooks/useToday';
import { ExerciseId } from '@/models/blueprint-models';
import { useAppSelector } from '@/store';
import { setProgressTab } from '@/store/settings';
import { bodyView } from '@/store/stats/progress-body';
import { mostTrainedLifts, recentRecords } from '@/store/stats/progress-strength';
import {
  DEFAULT_PROGRESS_RANGE,
  hasBodyweight,
  PROGRESS_RANGES,
  progressPeriod,
  progressRange,
  ProgressRangeId,
  ProgressTab,
  progressTabs,
  shownTab,
} from '@/store/stats/progress-tab';
import { buildWeeklyTable, MuscleKey, trainingView } from '@/store/stats/progress-training';
import { exerciseMetaLabel } from '@/utils/exercise-meta';
import { TranslationKey, useTranslate } from '@tolgee/react';
import { Stack, useRouter } from 'expo-router';
import { useOpenExerciseStats } from '@/hooks/useOpenExerciseStats';
import { useState } from 'react';
import { View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDispatch } from 'react-redux';

type TranslateFn = ReturnType<typeof useTranslate>['t'];

/** One switch option per range, as a tuple as long as the ranges': the switch takes two to four. */
type OptionPer<Ranges extends readonly unknown[]> = { [K in keyof Ranges]: SegmentedOption<ProgressRangeId> };
type RangeOptions = OptionPer<typeof PROGRESS_RANGES>;

/** Each range's label on the switch, and the words Body's change reads "over". */
const RANGE_LABELS: Record<ProgressRangeId, { option: TranslationKey; over: TranslationKey }> = {
  '4w': { option: 'progress.tab.range.four_weeks.label', over: 'progress.tab.body.over.four_weeks.label' },
  '12w': { option: 'progress.tab.range.twelve_weeks.label', over: 'progress.tab.body.over.twelve_weeks.label' },
  '1y': { option: 'progress.tab.range.one_year.label', over: 'progress.tab.body.over.one_year.label' },
};

/**
 * The Progress tab: Strength, Training and Body over one range. It loads the history once and every
 * number comes from the pure view models in `store/stats/progress-*.ts`.
 */
export default function ProgressScreen() {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const openExerciseStats = useOpenExerciseStats();
  const dispatch = useDispatch();
  const goToRoutines = useGoToRoutines();
  const formatDate = useFormatDate();
  const unit = usePreferredWeightUnit();
  const unitLabel = usePreferredWeightSuffix();
  const today = useToday();
  const firstDayOfWeek = useAppSelector((x) => x.settings.firstDayOfWeek);
  const showBodyweight = useAppSelector((x) => x.settings.showBodyweight);
  const lastTab = useAppSelector((x) => x.settings.progressTab);
  const builtInExercises = useAppSelector((x) => x.storedSessions.builtInExercises);
  const savedExercises = useAppSelector((x) => x.storedSessions.savedExercises);
  const [rangeId, setRangeId] = useState<ProgressRangeId>(DEFAULT_PROGRESS_RANGE);
  const history = useProgressHistory();

  const period = progressPeriod(today, progressRange(rangeId), firstDayOfWeek);
  const hasHistory = !!history?.firstDate;
  const tabs = progressTabs(showBodyweight && !!history && hasBodyweight(history));
  const tab = shownTab(lastTab, tabs);
  const shortDate = (date: Parameters<typeof formatDate>[0]) => formatDate(date, { month: 'short', day: 'numeric' });
  const openExercise = (exerciseId: ExerciseId | undefined) => {
    if (exerciseId) {
      openExerciseStats(exerciseId);
    }
  };

  const content = () => {
    if (!history) {
      return null;
    }
    switch (tab) {
      case 'strength':
        return (
          <StrengthSection
            lifts={mostTrainedLifts(history, period.start, unit)}
            records={recentRecords(history, unit)}
            unit={unitLabel}
            onOpenLift={(lift) => openExercise(lift.exerciseId)}
            onOpenRecord={(record) => openExercise(record.exerciseId)}
            onAllExercises={() => router.push('/stats/exercises')}
            onAllRecords={() => router.push('/stats/records')}
          />
        );
      case 'training': {
        // Saved exercises override the built-in ones, hidden or not: a hidden exercise was still trained.
        const exercises = { ...builtInExercises, ...savedExercises };
        return (
          <TrainingSection
            view={trainingView(buildWeeklyTable(history, exercises, period))}
            muscleLabel={(muscle) => muscleLabelOf(t, muscle)}
          />
        );
      }
      case 'body': {
        const body = bodyView(history, period.start, unit);
        return body ? (
          <BodySection
            view={body}
            from={period.start}
            to={today}
            unit={unitLabel}
            overRange={t(RANGE_LABELS[rangeId].over)}
          />
        ) : null;
      }
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <Stack.Screen options={{ headerShown: false, title: t('progress.tab.title') }} />
      <ScrollView
        testID="progress-screen"
        contentContainerStyle={{
          paddingTop: insets.top + spacing[4],
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingBottom: spacing[8],
          gap: spacing[4],
        }}
      >
        <ProgressHeader
          since={hasHistory ? t('progress.tab.since.label', { date: shortDate(period.start) }) : undefined}
          title={t('progress.tab.title')}
        />
        {history && !hasHistory ? (
          <ProgressEmpty
            title={t('progress.tab.empty.title')}
            body={t('progress.tab.empty.body')}
            action={{ label: t('progress.tab.empty.button'), onPress: () => goToRoutines() }}
          />
        ) : null}
        {hasHistory ? (
          <>
            <ProgressTabBar<ProgressTab>
              options={tabs.map((value) => ({ value, label: tabLabel(t, value) }))}
              value={tab}
              onChange={(next) => dispatch(setProgressTab(next))}
              accessibilityLabel={t('progress.tab.sections.label')}
            />
            <SegmentedControl<ProgressRangeId>
              testID="progress-range"
              options={
                // `map` widens the ranges' tuple to an array.
                PROGRESS_RANGES.map((range) => ({
                  value: range.id,
                  label: t(RANGE_LABELS[range.id].option),
                })) as unknown as RangeOptions
              }
              value={rangeId}
              onChange={setRangeId}
              accessibilityLabel={t('progress.tab.range.label')}
            />
            {content()}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function tabLabel(t: TranslateFn, tab: ProgressTab): string {
  switch (tab) {
    case 'strength':
      return t('progress.tab.strength.tab.label');
    case 'training':
      return t('progress.tab.training.tab.label');
    case 'body':
      return t('progress.tab.body.tab.label');
  }
}

function muscleLabelOf(t: TranslateFn, muscle: MuscleKey): string {
  return muscle === 'back' ? t('progress.tab.muscles.back.label') : exerciseMetaLabel(t, 'muscle', muscle);
}
