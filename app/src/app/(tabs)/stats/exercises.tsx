import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { amountText, signedText } from '@/components/presentation/stats/amount-format';
import { ExerciseRow } from '@/components/presentation/stats/exercise-row';
import { ListCard, ListEmptyState, ListPageTitle } from '@/components/presentation/stats/list-parts';
import { type ChipOption, ChipRow } from '@/components/presentation/foundation/chip-row';
import { SearchField } from '@/components/presentation/foundation/search-field';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import { usePreferredWeightUnit } from '@/hooks/usePreferredWeightUnit';
import { useProgressHistory } from '@/hooks/useProgressHistory';
import { useScroll } from '@/hooks/useScrollListener';
import { LastDoneLabel } from '@/models/home/up-next';
import { MuscleGroup } from '@/models/muscle-groups';
import { shortFormatWeightUnit } from '@/models/weight';
import { useAppSelector } from '@/store';
import { AxisAmount, ExerciseListRow, exercisesListOf, TREND_WEEKS } from '@/store/stats/exercises-list';
import { muscleGroupLabel } from '@/utils/exercise-meta';
import { selectExercises } from '@/store/stored-sessions';
import { LocalDate } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { Stack } from 'expo-router';
import { useOpenExerciseStats } from '@/hooks/useOpenExerciseStats';
import { useState } from 'react';
import { View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

type TranslateFn = ReturnType<typeof useTranslate>['t'];
type FormatDate = ReturnType<typeof useFormatDate>;

export default function ExercisesScreen() {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const { handleScroll } = useScroll();
  const formatDate = useFormatDate();
  const openExerciseStats = useOpenExerciseStats();
  const unit = usePreferredWeightUnit();
  const catalog = useAppSelector(selectExercises);
  const history = useProgressHistory();
  const [query, setQuery] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | undefined>(undefined);

  const today = LocalDate.now();
  const list = history && exercisesListOf(history, catalog, today, { query, muscle }, unit);
  const muscleOptions: ChipOption<MuscleGroup | undefined>[] = [
    { value: undefined, label: t('exercise_picker.muscle.all') },
    ...(list?.muscles ?? []).map((group) => ({ value: group, label: muscleGroupLabel(t, group) })),
  ];

  return (
    <SafeAreaView
      edges={{ left: 'additive', right: 'additive', top: 'off', bottom: 'off' }}
      style={{ flex: 1, backgroundColor: tokens.bg }}
    >
      {/* The page draws its own large title, so the header shows none; `title` still names it in the back menu. */}
      <Stack.Screen options={{ title: t('progress.exercises.title'), headerTitle: '' }} />
      <ScrollView
        onScroll={handleScroll}
        // A row tapped while typing opens at once, rather than the first tap only closing the keyboard.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingTop: spacing[1],
          paddingBottom: spacing[10],
          gap: spacing[4],
        }}
      >
        <ListPageTitle title={t('progress.exercises.title')} />
        <SearchField
          testID="exercises-search"
          value={query}
          onChange={setQuery}
          placeholder={t('progress.exercises.search.placeholder')}
          accessibilityLabel={t('progress.exercises.search.label')}
          clearLabel={t('progress.exercises.search.clear.button')}
        />
        {/* Chips carry a 4pt touch inset, which would otherwise widen the gaps around the row. */}
        <View style={{ marginVertical: -spacing[1] }}>
          <ChipRow
            testID="exercises-muscle"
            accessibilityLabel={t('exercise_picker.muscle.label')}
            options={muscleOptions}
            selected={muscle}
            onSelect={setMuscle}
          />
        </View>
        {list && list.rows.length > 0 ? (
          <>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: spacing[2],
                paddingHorizontal: spacing[1],
              }}
            >
              <SurfaceText style={{ flexShrink: 1, fontSize: 13, lineHeight: 18, color: tokens.muted }}>
                {list.rows.length === 1
                  ? t('progress.exercises.count.one')
                  : t('progress.exercises.count.other', { count: list.rows.length.toString() })}
              </SurfaceText>
              <SurfaceText style={{ flexShrink: 1, fontSize: 13, lineHeight: 18, color: tokens.muted }}>
                {t('progress.exercises.change_heading.label', { weeks: TREND_WEEKS })}
              </SurfaceText>
            </View>
            <ListCard>
              {list.rows.map((row, index) => (
                <ExerciseRow
                  key={row.key}
                  index={index}
                  name={row.name}
                  meta={`${lastDoneText(t, formatDate, row.lastDone, today)} · ${sessionsText(t, row.sessions)}`}
                  trend={row.trend}
                  tone={row.tone}
                  value={row.current && { amount: amountOf(row.current), unit: unitOf(t, row.current) }}
                  change={changeText(t, row)}
                  accessibilityLabel={spokenExercise(t, formatDate, row, today)}
                  onPress={() => openExerciseStats(row.exerciseId)}
                />
              ))}
            </ListCard>
          </>
        ) : null}
        {list && list.rows.length === 0 ? (
          <ListEmptyState
            title={
              query.trim()
                ? t('progress.exercises.empty_search.title', { query: query.trim() })
                : muscle
                  ? t('progress.exercises.empty_muscle.title', { muscle: muscleGroupLabel(t, muscle) })
                  : t('progress.exercises.empty_history.title')
            }
            body={t('progress.exercises.empty.body')}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function lastDoneText(t: TranslateFn, formatDate: FormatDate, label: LastDoneLabel, today: LocalDate): string {
  switch (label.kind) {
    case 'today':
      return t('progress.exercises.last_done_today.label');
    case 'yesterday':
      return t('progress.exercises.last_done_yesterday.label');
    case 'weekday':
      return formatDate(label.date, { weekday: 'short' });
    case 'date':
      return formatDate(
        label.date,
        label.date.year() === today.year()
          ? { month: 'short', day: 'numeric' }
          : { month: 'short', day: 'numeric', year: 'numeric' },
      );
  }
}

function sessionsText(t: TranslateFn, sessions: number): string {
  return sessions === 1
    ? t('progress.exercises.sessions.one')
    : t('progress.exercises.sessions.other', { count: sessions.toString() });
}

function amountOf(amount: AxisAmount): string {
  return amountText(amount.axis === 'reps' ? amount.value : amount.value.value);
}

function unitOf(t: TranslateFn, amount: AxisAmount): string {
  return amount.axis === 'reps' ? t('progress.reps_unit.label') : shortFormatWeightUnit(amount.value.unit);
}

/** "+8.5", "−0.5" with a true minus sign, "same", or a dash with nothing to compare. */
function changeText(t: TranslateFn, row: ExerciseListRow): string {
  if (!row.change) {
    return '–';
  }
  return (
    signedText(row.change.axis === 'reps' ? row.change.value : row.change.value.value).text ?? t('progress.same.label')
  );
}

function spokenExercise(t: TranslateFn, formatDate: FormatDate, row: ExerciseListRow, today: LocalDate): string {
  const value = row.current
    ? row.current.axis === 'reps'
      ? t('progress.exercises.best_reps_spoken.label', { count: amountOf(row.current) })
      : t('progress.exercises.one_rep_max_spoken.label', {
          value: `${amountOf(row.current)} ${unitOf(t, row.current)}`,
        })
    : undefined;
  const amount = row.change && `${changeText(t, row).replace(/^[+−]/, '')} ${unitOf(t, row.change)}`;
  const change =
    row.tone === 'gain'
      ? t('progress.exercises.change_up_spoken.label', { amount, weeks: TREND_WEEKS })
      : row.tone === 'fall'
        ? t('progress.exercises.change_down_spoken.label', { amount, weeks: TREND_WEEKS })
        : row.tone === 'none'
          ? t('progress.exercises.change_same_spoken.label', { weeks: TREND_WEEKS })
          : t('progress.exercises.change_none_spoken.label', { weeks: TREND_WEEKS });
  return t('progress.exercises.row.spoken.label', {
    name: row.name,
    last: lastDoneText(t, formatDate, row.lastDone, today),
    sessions: sessionsText(t, row.sessions),
    details: [value, change].filter(Boolean).join(', '),
  });
}
