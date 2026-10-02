import { Card } from '@/components/presentation/foundation/card';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import type { ChangeTone } from '@/store/stats/progress-amounts';
import { ReactNode } from 'react';
import { StyleProp, ViewStyle } from 'react-native';

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
