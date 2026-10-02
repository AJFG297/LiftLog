import { Card } from '@/components/presentation/foundation/card';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import type { ChangeTone } from '@/components/presentation/stats/progress/progress-format';
import { ReactNode } from 'react';
import { Pressable, StyleProp, View, ViewStyle } from 'react-native';

interface ProgressSectionProps {
  title: string;
  /** A line under the title. */
  subtitle?: string;
  /** A link at the end of the title row ("See all"). */
  action?: { label: string; onPress: () => void; testID?: string };
  children: ReactNode;
}

/** A titled block on the Progress tab: the heading, an optional link and line under it, then its card. */
export function ProgressSection({ title, subtitle, action, children }: ProgressSectionProps) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[2] + 2 }}>
      <View style={{ paddingHorizontal: spacing[1], gap: spacing[0.5] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: action ? MIN_TOUCH_TARGET : undefined,
          }}
        >
          <SurfaceText
            font="text-lg"
            weight="700"
            accessibilityRole="header"
            style={{ color: tokens.ink, letterSpacing: -0.18, flexShrink: 1 }}
          >
            {title}
          </SurfaceText>
          {action ? (
            <Pressable
              testID={action.testID}
              onPress={action.onPress}
              accessibilityRole="link"
              style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingLeft: spacing[3] }}
            >
              <SurfaceText font="text-sm" weight="600" style={{ color: tokens.accentInk }}>
                {action.label}
              </SurfaceText>
            </Pressable>
          ) : null}
        </View>
        {subtitle ? (
          <SurfaceText style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>{subtitle}</SurfaceText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/** The card the rows of a section sit in: no padding of its own, so each row is full width. */
export function ProgressListCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Card style={[{ padding: 0, overflow: 'hidden' }, style]}>{children}</Card>;
}

/** The hairline between rows: none above the first. */
export function useRowDivider() {
  const { tokens } = useAppTheme();
  return (index: number): ViewStyle => (index ? { borderTopWidth: 1, borderTopColor: tokens.line } : {});
}

/** A gain in `positive`, a fall in `warmInk` (doing less isn't an error), no change in `muted`. */
export function useToneColor() {
  const { tokens } = useAppTheme();
  return (tone: ChangeTone) => (tone === 'gain' ? tokens.positive : tone === 'fall' ? tokens.warmInk : tokens.muted);
}

/**
 * A short muted line for a section with nothing to show in the range. It pads itself unless the card it is
 * in already does (`inset={false}`).
 */
export function ProgressEmptyLine({ text, inset = true }: { text: string; inset?: boolean }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText font="text-sm" style={{ color: tokens.muted, padding: inset ? spacing[4] : 0 }}>
      {text}
    </SurfaceText>
  );
}
