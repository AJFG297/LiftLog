import { Card } from '@/components/presentation/foundation/card';
import { haptics } from '@/components/presentation/foundation/haptics';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { AmountText } from '@/components/presentation/stats/amount-text';
import { ListEmptyLine, useToneColor } from '@/components/presentation/stats/list-parts';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import type { ChangeTone } from '@/store/stats/progress-amounts';
import { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

const RANGE_CHIP_HEIGHT = 32;

export interface ExerciseHero {
  /** "Estimated one-rep max". */
  label: string;
  /** "104.5". */
  value: string;
  /** "kg" or "reps". */
  unit: string;
  /** "Last time, Oct 1" or "Wed, Sep 23". */
  date: string;
  /** "82.5 kg × 8": the set behind the value, as spans (`SetSpans`). */
  set: ReactNode;
}

export interface ExerciseChange {
  /** "+7.5", or a word ("same") when nothing changed. */
  text: string;
  /** "kg" after an amount; none after a word, which is set in Geist. */
  unit: string | undefined;
  tone: ChangeTone;
  /** "in 3 months", "since Apr 2025". */
  since: string;
}

interface ExerciseChartCardProps<R extends string> {
  /** Undefined while the range holds no workouts. */
  hero: ExerciseHero | undefined;
  change: ExerciseChange | undefined;
  /** The chart itself, or nothing with no workouts in the range. */
  chart: ReactNode;
  /** In place of the chart: nothing in the range. */
  emptyText: string | undefined;
  /** Under the chart: too few workouts for a trend. */
  sparseText: string | undefined;
  ranges: readonly { value: R; label: string; spoken: string }[];
  range: R;
  onRange: (range: R) => void;
  /** The "Record" key for the dots, on a measure that has them. */
  legend: string | undefined;
  /** Est. 1RM's line on how it is estimated. */
  note: string | undefined;
}

/** The exercise page's chart card: the picked workout's value, the change over the range, the chart and the range. */
export function ExerciseChartCard<R extends string>(props: ExerciseChartCardProps<R>) {
  const { tokens } = useAppTheme();
  const toneColor = useToneColor();
  return (
    <Card style={{ gap: spacing[3] }}>
      {props.hero ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexShrink: 1, gap: spacing[0.5] }}>
            <SurfaceText weight="500" style={{ fontSize: 12, lineHeight: 16, color: tokens.muted }}>
              {props.hero.label}
            </SurfaceText>
            <AmountText
              testID="exercise-hero-value"
              amount={props.hero.value}
              unit={props.hero.unit}
              style={{ fontSize: 34, lineHeight: 38, fontWeight: '600', letterSpacing: -0.68, color: tokens.ink }}
              unitStyle={{ fontSize: 15, fontWeight: '500', color: tokens.muted, letterSpacing: 0 }}
            />
            <SurfaceText style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
              {props.hero.date}
              {props.hero.set ? (
                <>
                  {' · '}
                  <Text style={{ color: tokens.ink }}>{props.hero.set}</Text>
                </>
              ) : null}
            </SurfaceText>
          </View>
          {props.change ? (
            <View style={{ flexShrink: 0, alignItems: 'flex-end', gap: spacing[0.5], paddingTop: spacing[0.5] }}>
              {props.change.unit ? (
                <AmountText
                  amount={props.change.text}
                  unit={props.change.unit}
                  style={{ fontSize: 15, lineHeight: 20, fontWeight: '600', color: toneColor(props.change.tone) }}
                />
              ) : (
                <SurfaceText weight="600" style={{ fontSize: 15, lineHeight: 20, color: toneColor(props.change.tone) }}>
                  {props.change.text}
                </SurfaceText>
              )}
              <SurfaceText style={{ fontSize: 12, lineHeight: 16, color: tokens.muted }}>
                {props.change.since}
              </SurfaceText>
            </View>
          ) : null}
        </View>
      ) : null}

      {props.emptyText ? <ListEmptyLine text={props.emptyText} inset={false} /> : props.chart}
      {props.sparseText ? <ListEmptyLine text={props.sparseText} inset={false} /> : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing[2] }}>
        <View style={{ flexDirection: 'row', gap: 6 }} accessibilityRole="radiogroup">
          {props.ranges.map((range) => (
            <RangeChip
              key={range.value}
              label={range.label}
              spoken={range.spoken}
              selected={range.value === props.range}
              onPress={() => props.onRange(range.value)}
              testID={`exercise-range-${range.value}`}
            />
          ))}
        </View>
        {props.legend ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: tokens.accentInk }} />
            <SurfaceText numberOfLines={1} style={{ fontSize: 12, lineHeight: 16, color: tokens.muted }}>
              {props.legend}
            </SurfaceText>
          </View>
        ) : null}
      </View>
      {props.note ? (
        <SurfaceText style={{ fontSize: 12, lineHeight: 17, color: tokens.muted }}>{props.note}</SurfaceText>
      ) : null}
    </Card>
  );
}

/** A range on the chart: ink when on, as the board draws it, rather than the accent chips of a filter. */
function RangeChip(props: { label: string; spoken: string; selected: boolean; onPress: () => void; testID: string }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      onPress={() => {
        if (props.selected) return;
        haptics.selection();
        props.onPress();
      }}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      accessibilityLabel={props.spoken}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <View
          style={{
            minHeight: RANGE_CHIP_HEIGHT,
            minWidth: MIN_TOUCH_TARGET,
            paddingHorizontal: 10,
            borderRadius: RANGE_CHIP_HEIGHT / 2,
            borderWidth: 1,
            alignItems: 'center',
            justifyContent: 'center',
            borderColor: props.selected ? tokens.ink : tokens.line2,
            backgroundColor: props.selected ? tokens.ink : pressed ? tokens.track : undefined,
          }}
        >
          <SurfaceText
            weight="600"
            style={{ fontSize: 13, lineHeight: 18, color: props.selected ? tokens.bg : tokens.muted }}
          >
            {props.label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}
