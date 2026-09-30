import { Card } from '@/components/presentation/foundation/card';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import type { HexColor } from '@/utils/color';
import { View } from 'react-native';

/** Day numbers sit on routine colours, which are all dark enough for white (see `ROUTINE_COLORS`). */
const ON_ROUTINE_COLOR = '#FFFFFF';
const DAY_CIRCLE = 38;
const GRID_CELL_HEIGHT = 34;

export interface RangeStat {
  label: string;
  value: string;
  /** A unit after the value, in the muted colour: " t". */
  unit?: string;
}

/** One day of the strip or the calendar. */
export interface RangeDay {
  key: string;
  dayOfMonth: number;
  /** The routine colour of the day's latest workout; none on a day without one. */
  color: HexColor | undefined;
  isToday: boolean;
  /** "Tuesday 8 April, Push". */
  accessibilityLabel: string;
}

export type RangeView =
  | { kind: 'week'; weekdays: string[]; days: RangeDay[] }
  | {
      kind: 'month';
      /** The weekday of each column, which follows the days rather than the week start. */
      weekdays: string[];
      /** Blanks first, so the last cell is today. */
      cells: (RangeDay | undefined)[];
      legend: { name: string; color: HexColor }[];
    };

interface HistoryRangeCardProps {
  stats: [RangeStat, RangeStat, RangeStat];
  view: RangeView;
}

/** Workouts, volume and time for the range, over a week strip (7 days) or a calendar (30 days). */
export function HistoryRangeCard({ stats, view }: HistoryRangeCardProps) {
  const { tokens } = useAppTheme();
  return (
    <Card testID="history-range-card" style={{ padding: spacing[4] + 2, gap: spacing[4] + 2 }}>
      <View style={{ flexDirection: 'row', gap: spacing[2] }}>
        {stats.map((stat) => (
          <View key={stat.label} style={{ flex: 1, gap: spacing[0.5] }} accessible>
            <SurfaceText font="text-xs" weight="500" style={{ color: tokens.muted }}>
              {stat.label}
            </SurfaceText>
            <SurfaceText
              font="text-2xl"
              numeric
              weight="600"
              numberOfLines={1}
              style={{ color: tokens.ink, letterSpacing: -0.5 }}
            >
              {stat.value}
              {stat.unit ? (
                <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
                  {stat.unit}
                </SurfaceText>
              ) : null}
            </SurfaceText>
          </View>
        ))}
      </View>
      {view.kind === 'week' ? <WeekStrip weekdays={view.weekdays} days={view.days} /> : <MonthGrid {...view} />}
    </Card>
  );
}

function WeekStrip({ weekdays, days }: { weekdays: string[]; days: RangeDay[] }) {
  const { tokens } = useAppTheme();
  return (
    <View testID="history-week-strip" style={{ flexDirection: 'row', gap: 6 }}>
      {days.map((day, index) => (
        <View
          key={day.key}
          style={{ flex: 1, alignItems: 'center', gap: 6 }}
          accessible
          accessibilityLabel={day.accessibilityLabel}
        >
          <SurfaceText font="text-xs" weight="500" style={{ color: tokens.muted }}>
            {weekdays[index]}
          </SurfaceText>
          <View
            style={{
              width: DAY_CIRCLE,
              height: DAY_CIRCLE,
              borderRadius: DAY_CIRCLE / 2,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: day.color ?? tokens.card,
              ...dayBorder(day, tokens.accentInk, day.color ? undefined : tokens.line),
            }}
          >
            <SurfaceText
              font="text-sm"
              numeric
              weight="600"
              style={{ color: day.color ? ON_ROUTINE_COLOR : tokens.muted }}
            >
              {day.dayOfMonth}
            </SurfaceText>
          </View>
        </View>
      ))}
    </View>
  );
}

function MonthGrid({
  weekdays,
  cells,
  legend,
}: {
  weekdays: string[];
  cells: (RangeDay | undefined)[];
  legend: { name: string; color: HexColor }[];
}) {
  const { tokens } = useAppTheme();
  const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, week) => cells.slice(week * 7, week * 7 + 7));
  return (
    <View testID="history-month-grid" style={{ gap: spacing[2] }}>
      <View
        style={{ flexDirection: 'row', gap: 6 }}
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {weekdays.map((weekday, index) => (
          <SurfaceText
            key={index}
            font="text-xs"
            weight="600"
            style={{ flex: 1, textAlign: 'center', color: tokens.muted }}
          >
            {weekday}
          </SurfaceText>
        ))}
      </View>
      <View style={{ gap: 6 }}>
        {weeks.map((week, weekIndex) => (
          <View key={weekIndex} style={{ flexDirection: 'row', gap: 6 }}>
            {week.map((cell, index) =>
              cell ? (
                <View
                  key={cell.key}
                  accessible
                  accessibilityLabel={cell.accessibilityLabel}
                  style={{
                    flex: 1,
                    height: GRID_CELL_HEIGHT,
                    borderRadius: 9,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: cell.color ?? tokens.bg,
                    ...dayBorder(cell, tokens.accentInk, undefined),
                  }}
                >
                  <SurfaceText
                    font="text-xs"
                    numeric
                    weight="500"
                    style={{ color: cell.color ? ON_ROUTINE_COLOR : tokens.muted }}
                  >
                    {cell.dayOfMonth}
                  </SurfaceText>
                </View>
              ) : (
                <View key={`blank-${index}`} style={{ flex: 1, height: GRID_CELL_HEIGHT }} />
              ),
            )}
          </View>
        ))}
      </View>
      {legend.length ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            columnGap: spacing[3] + 2,
            rowGap: spacing[1],
            paddingTop: spacing[1],
          }}
        >
          {legend.map((item) => (
            <View key={item.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: item.color }} />
              <SurfaceText font="text-xs" style={{ color: tokens.muted }}>
                {item.name}
              </SurfaceText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Today is ringed with a dashed accent line; other empty days get the plain hairline when they have one. */
function dayBorder(day: RangeDay, todayColor: string, emptyColor: string | undefined) {
  if (day.isToday) {
    return { borderWidth: 2, borderStyle: 'dashed' as const, borderColor: todayColor };
  }
  return emptyColor ? { borderWidth: 1, borderColor: emptyColor } : {};
}
