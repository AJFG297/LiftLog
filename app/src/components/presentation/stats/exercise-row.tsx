import { PressableSurface } from '@/components/presentation/foundation/pressable-surface';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { AmountText } from '@/components/presentation/stats/amount-text';
import { useRowDivider, useToneColor } from '@/components/presentation/stats/list-parts';
import { Sparkline } from '@/components/presentation/stats/sparkline';
import { useAppTheme } from '@/hooks/useAppTheme';
import type { ChangeTone } from '@/store/stats/progress-amounts';
import { View } from 'react-native';

interface ExerciseRowProps {
  name: string;
  /** "Mon · 38 sessions". */
  meta: string;
  trend: readonly number[];
  /** Which way the change went; undefined with nothing to compare. */
  tone: ChangeTone | undefined;
  /** The current value's number ("104.5") and unit ("kg", "reps"), or undefined with none. */
  value: { amount: string; unit: string } | undefined;
  /** "+8.5" or "−0.5" (set in Geist Mono), "same", or "–" when there is nothing to compare. */
  change: string;
  accessibilityLabel: string;
  index: number;
  onPress: () => void;
}

/**
 * An exercise on All exercises: its name, when it was last done, a 12-week trend, its current value and the
 * change. Strength's lift rows show the same things at the board's larger size, with a chevron.
 */
export function ExerciseRow(props: ExerciseRowProps) {
  const { tokens } = useAppTheme();
  const divider = useRowDivider();
  const toneColor = useToneColor();
  const lineColor = props.tone === 'fall' ? tokens.warmInk : props.tone === 'gain' ? tokens.accentInk : tokens.faint;
  const moved = props.tone === 'gain' || props.tone === 'fall';
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
        ...divider(props.index),
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
        <AmountText
          amount={props.value?.amount ?? '–'}
          unit={props.value?.unit}
          style={{ fontSize: 16, lineHeight: 22, fontWeight: '600', color: tokens.ink }}
          unitStyle={{ fontSize: 11, fontWeight: '500', color: tokens.muted }}
        />
        <SurfaceText
          numeric={moved}
          weight="600"
          style={{ fontSize: 12, lineHeight: 16, color: props.tone ? toneColor(props.tone) : tokens.muted }}
        >
          {props.change}
        </SurfaceText>
      </View>
    </PressableSurface>
  );
}
