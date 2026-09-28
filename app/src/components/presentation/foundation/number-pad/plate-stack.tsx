import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import BigNumber from 'bignumber.js';
import { View } from 'react-native';

const SHORTEST_PLATE = 10;
const TALLEST_PLATE = 32;
// Enough for any real load with sensible plates; past it the drawing would push the text off the row.
const MAX_DRAWN_PLATES = 8;

export function PlateStack(props: { perSide: readonly BigNumber[]; heaviest: BigNumber }) {
  const { tokens } = useAppTheme();
  const heightOf = (plate: BigNumber) =>
    SHORTEST_PLATE + (TALLEST_PLATE - SHORTEST_PLATE) * plate.dividedBy(props.heaviest).toNumber();
  const drawn = props.perSide.slice(0, MAX_DRAWN_PLATES);
  const hidden = props.perSide.length - drawn.length;
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ flexDirection: 'row', alignItems: 'center', minHeight: TALLEST_PLATE, gap: spacing[0.5] }}
    >
      <View style={{ width: spacing[3], height: 6, borderRadius: 1, backgroundColor: tokens.line3 }} />
      {drawn.map((plate, index) => (
        <View
          key={index}
          style={{ width: spacing[2], height: heightOf(plate), borderRadius: 2, backgroundColor: tokens.accent }}
        />
      ))}
      {hidden > 0 ? (
        <SurfaceText numeric font="text-xs" style={{ color: tokens.muted, marginHorizontal: spacing[0.5] }}>
          {`+${hidden}`}
        </SurfaceText>
      ) : undefined}
      <View style={{ width: spacing[4], height: 6, borderRadius: 1, backgroundColor: tokens.line3 }} />
    </View>
  );
}
