import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import BigNumber from 'bignumber.js';
import { View } from 'react-native';

const SHORTEST_PLATE = 10;
const TALLEST_PLATE = 32;

export function PlateStack(props: { perSide: readonly BigNumber[]; heaviest: BigNumber }) {
  const { tokens } = useAppTheme();
  const heightOf = (plate: BigNumber) =>
    SHORTEST_PLATE + (TALLEST_PLATE - SHORTEST_PLATE) * plate.dividedBy(props.heaviest).toNumber();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ flexDirection: 'row', alignItems: 'center', height: TALLEST_PLATE, gap: spacing[0.5] }}
    >
      <View style={{ width: spacing[3], height: 6, borderRadius: 1, backgroundColor: tokens.line3 }} />
      {props.perSide.map((plate, index) => (
        <View
          key={index}
          style={{ width: spacing[2], height: heightOf(plate), borderRadius: 2, backgroundColor: tokens.accent }}
        />
      ))}
      <View style={{ width: spacing[4], height: 6, borderRadius: 1, backgroundColor: tokens.line3 }} />
    </View>
  );
}
