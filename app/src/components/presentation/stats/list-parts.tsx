import { Card } from '@/components/presentation/foundation/card';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import type { ChangeTone } from '@/store/stats/progress-amounts';
import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

/** The card a list's rows sit in: no padding of its own, so each row is full width. */
export function ListCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Card style={[{ padding: 0, overflow: 'hidden' }, style]}>{children}</Card>;
}

/** The hairline between a list's rows: none above the first. */
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
 * A short muted line for a list or card with nothing to show. It pads itself unless the card it is in already
 * does (`inset={false}`).
 */
export function ListEmptyLine({ text, inset = true }: { text: string; inset?: boolean }) {
  const { tokens } = useAppTheme();
  return (
    <SurfaceText font="text-sm" style={{ color: tokens.muted, padding: inset ? spacing[4] : 0 }}>
      {text}
    </SurfaceText>
  );
}

/** A list page's own title, under the native header's back button, with an optional line below it. */
export function ListPageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: spacing[1], paddingHorizontal: spacing[1] }}>
      <SurfaceText
        accessibilityRole="header"
        weight="700"
        style={{ fontSize: 28, lineHeight: 31, letterSpacing: -0.56, color: tokens.ink }}
      >
        {title}
      </SurfaceText>
      {subtitle ? (
        <SurfaceText font="text-sm" style={{ color: tokens.muted }}>
          {subtitle}
        </SurfaceText>
      ) : null}
    </View>
  );
}

/**
 * What a list page shows instead of rows: what's missing, and why. A card with nothing to show in it uses
 * {@link ListEmptyLine} instead.
 */
export function ListEmptyState({ title, body }: { title: string; body: string }) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ paddingVertical: spacing[8], paddingHorizontal: spacing[4], gap: 6 }}>
      <SurfaceText font="text-base" weight="600" style={{ color: tokens.ink, textAlign: 'center' }}>
        {title}
      </SurfaceText>
      <SurfaceText font="text-sm" style={{ color: tokens.muted, textAlign: 'center' }}>
        {body}
      </SurfaceText>
    </View>
  );
}
