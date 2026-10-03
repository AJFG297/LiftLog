import type { TranslateFn } from '@/i18n/translate-fn';
import FullHeightScrollView from '@/components/layout/full-height-scroll-view';
import { SegmentedControl } from '@/components/presentation/foundation/segmented-control';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { amountText } from '@/components/presentation/stats/amount-format';
import { ListCard, ListEmptyState, ListPageTitle } from '@/components/presentation/stats/list-parts';
import { RecordRow } from '@/components/presentation/stats/record-row';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { FormatDate, useFormatDate } from '@/hooks/useFormatDate';
import { usePreferredWeightUnit } from '@/hooks/usePreferredWeightUnit';
import { useProgressHistory } from '@/hooks/useProgressHistory';
import { shortFormatWeightUnit, Weight } from '@/models/weight';
import { RecordFilter, RecordListRow, recordsListOf } from '@/store/stats/records-list';
import { LocalDate, YearMonth } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { Stack } from 'expo-router';
import { useOpenExerciseStats } from '@/hooks/useOpenExerciseStats';
import { useState } from 'react';
import { View } from 'react-native';

export default function RecordsScreen() {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const formatDate = useFormatDate();
  const openExerciseStats = useOpenExerciseStats();
  const unit = usePreferredWeightUnit();
  const history = useProgressHistory();
  const [filter, setFilter] = useState<RecordFilter>('all');

  const list = history && recordsListOf(history, LocalDate.now(), filter, unit);
  const monthText = (month: YearMonth, showYear: boolean) =>
    formatDate(month.atDay(1), showYear ? { month: 'long', year: 'numeric' } : { month: 'long' });

  return (
    <>
      {/* The page draws its own large title, so the header shows none; `title` still names it in the back menu. */}
      <Stack.Screen options={{ title: t('progress.records.title'), headerTitle: '' }} />
      <FullHeightScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.pageHorizontalMargin,
          paddingTop: spacing[1],
          paddingBottom: spacing[10],
          gap: 18,
        }}
      >
        <ListPageTitle
          title={t('progress.records.title')}
          subtitle={
            list?.since &&
            (list.count === 1
              ? t('progress.records.count.one', { month: monthText(list.since, list.sinceShowsYear) })
              : t('progress.records.count.other', {
                  count: list.count.toString(),
                  month: monthText(list.since, list.sinceShowsYear),
                }))
          }
        />
        {history && history.records.length > 0 ? (
          <SegmentedControl
            testID="records-filter"
            accessibilityLabel={t('progress.records.filter.label')}
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: t('progress.records.filter.all') },
              { value: 'heaviestWeight', label: t('progress.records.filter.heaviest') },
              { value: 'estimatedOneRepMax', label: t('progress.records.filter.one_rep_max') },
            ]}
          />
        ) : null}
        {list && list.months.length === 0 ? <RecordsEmptyState t={t} filter={filter} /> : null}
        {list?.months.map(({ month, showYear, rows }) => (
          <View key={month.toString()} style={{ gap: 10 }}>
            <SurfaceText
              accessibilityRole="header"
              weight="600"
              style={{
                paddingHorizontal: spacing[1],
                fontSize: 13,
                lineHeight: 18,
                letterSpacing: 0.78,
                textTransform: 'uppercase',
                color: tokens.muted,
              }}
            >
              {monthText(month, showYear)}
            </SurfaceText>
            <ListCard>
              {rows.map((row, index) => {
                const { exerciseId } = row;
                return (
                  <RecordRow
                    key={row.key}
                    row={row}
                    index={index}
                    weekday={formatDate(row.date, { weekday: 'short' })}
                    kindLabel={kindLabel(t, row)}
                    shows="record"
                    detail={wasText(t, row)}
                    accessibilityLabel={spokenRecord(t, formatDate, row)}
                    onPress={exerciseId ? () => openExerciseStats(exerciseId) : undefined}
                  />
                );
              })}
            </ListCard>
          </View>
        ))}
      </FullHeightScrollView>
    </>
  );
}

function RecordsEmptyState({ t, filter }: { t: TranslateFn; filter: RecordFilter }) {
  switch (filter) {
    case 'all':
      return <ListEmptyState title={t('progress.records.empty.title')} body={t('progress.records.empty.body')} />;
    case 'heaviestWeight':
      return (
        <ListEmptyState
          title={t('progress.records.empty_heaviest.title')}
          body={t('progress.records.empty_filter.body')}
        />
      );
    case 'estimatedOneRepMax':
      return (
        <ListEmptyState
          title={t('progress.records.empty_one_rep_max.title')}
          body={t('progress.records.empty_filter.body')}
        />
      );
  }
}

function kindLabel(t: TranslateFn, row: RecordListRow): string {
  return row.kind === 'heaviestWeight'
    ? t('progress.records.kind.heaviest.label')
    : t('progress.records.kind.one_rep_max.label');
}

function weightText(weight: Weight): string {
  return `${amountText(weight.value)} ${shortFormatWeightUnit(weight.unit)}`;
}

function wasText(t: TranslateFn, row: RecordListRow): string {
  const was = t('progress.was.label', { value: weightText(row.previous) });
  return row.kind === 'estimatedOneRepMax'
    ? `${weightText(row.estimatedFrom.weight)} × ${row.estimatedFrom.reps} · ${was}`
    : was;
}

function spokenRecord(t: TranslateFn, formatDate: FormatDate, row: RecordListRow): string {
  const value =
    row.kind === 'heaviestWeight'
      ? `${weightText(row.value)} × ${row.reps}`
      : `${weightText(row.value)}, ${weightText(row.estimatedFrom.weight)} × ${row.estimatedFrom.reps}`;
  return t('progress.records.row.spoken.label', {
    exercise: row.exerciseName,
    kind: kindLabel(t, row),
    value,
    previous: weightText(row.previous),
    gain: weightText(row.gain),
    date: formatDate(row.date, { weekday: 'long', month: 'long', day: 'numeric' }),
  });
}
