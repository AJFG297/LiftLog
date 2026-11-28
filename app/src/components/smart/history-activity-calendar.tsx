import { ActivityCalendar } from '@/components/presentation/calendar/activity-calendar';
import { ActivityLegend } from '@/components/presentation/calendar/activity-legend';
import { Card } from '@/components/presentation/foundation/card';
import IconButton from '@/components/presentation/foundation/icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { rounding, spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useFormatDate } from '@/hooks/useFormatDate';
import { useToday } from '@/hooks/useToday';
import { useAppSelector, useAppSelectorWithArg } from '@/store';
import { ActivityCell, OwnActivity, selectActivityMonth, selectFollowsOtherUsers } from '@/store/activity';
import { LocalDate, Year, YearMonth } from '@js-joda/core';
import { useTranslate } from '@tolgee/react';
import { useCallback, useMemo } from 'react';
import { I18nManager, View } from 'react-native';

interface HistoryActivityCalendarProps {
  /** From `useOwnActivity` on the screen, shared with its streak card. */
  own: OwnActivity;
  currentYearMonth: YearMonth;
  selectedDate: LocalDate | undefined;
  onMonthChange: (yearMonth: YearMonth) => void;
  onDateSelect: (date: LocalDate | undefined) => void;
}

export function HistoryActivityCalendar({
  own,
  currentYearMonth,
  selectedDate,
  onMonthChange,
  onDateSelect,
}: HistoryActivityCalendarProps) {
  const { t } = useTranslate();
  const { tokens } = useAppTheme();
  const formatDate = useFormatDate();
  const today = useToday();
  const firstDayOfWeek = useAppSelector((x) => x.settings.firstDayOfWeek);
  const followsOthers = useAppSelector(selectFollowsOtherUsers);

  const params = useMemo(() => ({ own, yearMonth: currentYearMonth, today }), [own, currentYearMonth, today]);
  const { rows, crossesFeedHorizon } = useAppSelectorWithArg(selectActivityMonth, params);

  const firstOfMonth = currentYearMonth.atDay(1);
  const isCurrentMonth = currentYearMonth.equals(YearMonth.now());

  // Stable, so the memoized day cells survive a re-render of the screen around them.
  const handleCellPress = useCallback(
    (cell: ActivityCell) => {
      // Selecting a day filters the list below. Tapping the selected day again clears the filter.
      onDateSelect(selectedDate?.isEqual(cell.date) ? undefined : cell.date);
    },
    [onDateSelect, selectedDate],
  );

  const header = (
    <View style={{ flexDirection: I18nManager.isRTL ? 'row-reverse' : 'row', alignItems: 'center' }}>
      <View style={{ flex: 1 }}>
        <IconButton
          testID="calendar-nav-previous-month"
          icon="chevronLeft"
          accessibilityLabel={t('generic.previous.button')}
          onPress={() => onMonthChange(currentYearMonth.minusMonths(1))}
        />
      </View>
      <View style={{ flex: 5, justifyContent: 'center', alignItems: 'center' }}>
        <SurfaceText testID="calendar-month" font="text-base" weight="600">
          {formatDate(firstOfMonth, {
            month: 'long',
            year: currentYearMonth.year() === Year.now().value() ? undefined : 'numeric',
          })}
        </SurfaceText>
      </View>
      <View style={{ flex: 1 }}>
        <IconButton
          testID="calendar-nav-next-month"
          icon="chevronRight"
          accessibilityLabel={t('generic.next.button')}
          onPress={() => onMonthChange(currentYearMonth.plusMonths(1))}
          disabled={isCurrentMonth}
        />
      </View>
    </View>
  );

  const footer = (
    <>
      <ActivityLegend showFriends={followsOthers} />

      {crossesFeedHorizon && (
        <View
          style={{
            flexDirection: 'row',
            gap: spacing[2],
            marginTop: spacing[3],
            padding: spacing[3],
            borderRadius: rounding.roundedRectangleRadius,
            backgroundColor: tokens.wash,
          }}
        >
          <View style={{ width: 3, borderRadius: 2, backgroundColor: tokens.accent }} />
          <SurfaceText font="text-xs" style={{ flex: 1, color: tokens.muted }}>
            {t('history.calendar.feed_horizon.message')}
          </SurfaceText>
        </View>
      )}
    </>
  );

  return (
    <Card>
      <ActivityCalendar
        density="month"
        rows={rows}
        firstDayOfWeek={firstDayOfWeek}
        selectedDate={selectedDate}
        header={header}
        footer={footer}
        onCellPress={handleCellPress}
      />
    </Card>
  );
}
