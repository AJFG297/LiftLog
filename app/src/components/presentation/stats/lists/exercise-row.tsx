import { PressableSurface } from '@/components/presentation/foundation/pressable-surface';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { Sparkline } from '@/components/presentation/stats/sparkline';
import { fontFamily, useAppTheme } from '@/hooks/useAppTheme';
import { TrendDirection } from '@/store/stats/exercises-list';
import { Text, View } from 'react-native';

interface ExerciseRowProps {
  name: string;
  /** "Mon · 38 sessions". */
  meta: string;
  trend: readonly number[];
  direction: TrendDirection | undefined;
  /** The current value's number ("104.5") and unit ("kg", "reps"), or undefined with none. */
  value: { amount: string; unit: string } | undefined;
  /** "+8.5" or "−0.5" (set in Geist Mono), "same", or "–" when there is nothing to compare. */
  change: string;
  accessibilityLabel: string;
  first: boolean;
  onPress: () => void;
}

/** An exercise: its name, when it was last done, a 12-week trend, its current value and the change. */
export function ExerciseRow(props: ExerciseRowProps) {
  const { tokens } = useAppTheme();
  const lineColor =
    props.direction === 'down' ? tokens.warmInk : props.direction === 'up' ? tokens.accentInk : tokens.faint;
  const changeColor =
    props.direction === 'up' ? tokens.positive : props.direction === 'down' ? tokens.warmInk : tokens.muted;
  return (
    <PressableSurface
      onPress={props.onPress}
      accessibilityLabel={props.accessibilityLabel}
      surface={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 12,
        paddingLeft: 16,
        paddingRight: 14,
        borderTopWidth: props.first ? 0 : 1,
        borderTopColor: tokens.line,
      }}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <SurfaceText numberOfLines={1} weight="600" style={{ fontSize: 15, lineHeight: 20, color: tokens.ink }}>
          {props.name}
        </SurfaceText>
        <SurfaceText numberOfLines={1} style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
          {props.meta}
        </SurfaceText>
      </View>
      <Sparkline values={props.trend} width={56} height={24} color={lineColor} endDot={false} />
      <View style={{ minWidth: 70, flexShrink: 0, alignItems: 'flex-end', gap: 1 }}>
        <SurfaceText numeric weight="600" style={{ fontSize: 16, lineHeight: 22, color: tokens.ink }}>
          {props.value?.amount ?? '–'}
          {props.value ? (
            <Text
              style={{ fontFamily: fontFamily.text, fontSize: 11, fontWeight: '500', color: tokens.muted }}
            >{` ${props.value.unit}`}</Text>
          ) : null}
        </SurfaceText>
        <SurfaceText
          numeric={props.direction === 'up' || props.direction === 'down'}
          weight="600"
          style={{ fontSize: 12, lineHeight: 16, color: changeColor }}
        >
          {props.change}
        </SurfaceText>
      </View>
    </PressableSurface>
  );
}
