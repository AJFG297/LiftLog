import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { ExerciseRow } from '@/components/presentation/stats/lists/exercise-row';
import { ListCard, ListEmptyState, ListPageTitle } from '@/components/presentation/stats/lists/list-page-parts';
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
import { AxisAmount, ExerciseRow as ExerciseRowModel, exercisesListOf } from '@/store/stats/exercises-list';
import { selectExercises } from '@/store/stored-sessions';
import { localeFormatBigNumber } from '@/utils/locale-bignumber';
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
    { value: undefined, label: t('progress.exercises.muscle.all') },
    ...(list?.muscles ?? []).map((group) => ({ value: group, label: muscleLabel(t, group) })),
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
            accessibilityLabel={t('progress.exercises.muscle.label')}
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
                {t('progress.exercises.change_heading.label')}
              </SurfaceText>
            </View>
            <ListCard>
              {list.rows.map((row, index) => (
                <ExerciseRow
                  key={row.key}
                  first={index === 0}
                  name={row.name}
                  meta={`${lastDoneText(t, formatDate, row.lastDone, today)} · ${sessionsText(t, row.sessions)}`}
                  trend={row.trend}
                  direction={row.direction}
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
                  ? t('progress.exercises.empty_muscle.title', { muscle: muscleLabel(t, muscle) })
                  : t('progress.exercises.empty_history.title')
            }
            body={t('progress.exercises.empty.body')}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function muscleLabel(t: TranslateFn, group: MuscleGroup): string {
  switch (group) {
    case 'chest':
      return t('progress.exercises.muscle.chest');
    case 'back':
      return t('progress.exercises.muscle.back');
    case 'legs':
      return t('progress.exercises.muscle.legs');
    case 'shoulders':
      return t('progress.exercises.muscle.shoulders');
    case 'arms':
      return t('progress.exercises.muscle.arms');
    case 'core':
      return t('progress.exercises.muscle.core');
  }
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
  return amount.axis === 'reps' ? amount.value.toString() : localeFormatBigNumber(amount.value.value);
}

function unitOf(t: TranslateFn, amount: AxisAmount): string {
  return amount.axis === 'reps' ? t('progress.exercises.reps_unit.label') : shortFormatWeightUnit(amount.value.unit);
}

/** "+8.5", "−0.5" with a true minus sign, "same", or a dash with nothing to compare. */
function changeText(t: TranslateFn, row: ExerciseRowModel): string {
  if (!row.change || !row.direction) {
    return '–';
  }
  if (row.direction === 'same') {
    return t('progress.exercises.change_same.label');
  }
  const magnitude =
    row.change.axis === 'reps'
      ? Math.abs(row.change.value).toString()
      : localeFormatBigNumber(row.change.value.value.abs());
  return `${row.direction === 'up' ? '+' : '−'}${magnitude}`;
}

function spokenExercise(t: TranslateFn, formatDate: FormatDate, row: ExerciseRowModel, today: LocalDate): string {
  const value = row.current
    ? row.current.axis === 'reps'
      ? t('progress.exercises.best_reps_spoken.label', { count: amountOf(row.current) })
      : t('progress.exercises.one_rep_max_spoken.label', {
          value: `${amountOf(row.current)} ${unitOf(t, row.current)}`,
        })
    : undefined;
  const amount = row.change && `${changeText(t, row).replace(/^[+−]/, '')} ${unitOf(t, row.change)}`;
  const change =
    row.direction === 'up'
      ? t('progress.exercises.change_up_spoken.label', { amount })
      : row.direction === 'down'
        ? t('progress.exercises.change_down_spoken.label', { amount })
        : row.direction === 'same'
          ? t('progress.exercises.change_same_spoken.label')
          : t('progress.exercises.change_none_spoken.label');
  return t('progress.exercises.row.spoken.label', {
    name: row.name,
    last: lastDoneText(t, formatDate, row.lastDone, today),
    sessions: sessionsText(t, row.sessions),
    details: [value, change].filter(Boolean).join(', '),
  });
}
