import { rounding, useAppTheme } from '@/hooks/useAppTheme';
import { type AppIconName, MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

const KEY_MIN_HEIGHT = 52;

export function NumberPadKey(props: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  selected?: boolean;
  testID?: string;
  children: ReactNode;
}) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      aria-selected={props.selected}
      onPress={props.onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: KEY_MIN_HEIGHT,
        borderRadius: rounding.roundedRectangleRadius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: props.primary || props.selected ? tokens.accent : tokens.keypadKey,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {props.children}
    </Pressable>
  );
}

export function NumberPadKeySpacer() {
  return (
    <View style={{ flex: 1, minHeight: KEY_MIN_HEIGHT }} importantForAccessibility="no" accessibilityElementsHidden />
  );
}

export function NumberPadKeyIcon(props: { name: AppIconName; color: string }) {
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <MsIconSrc name={props.name} size={24} color={props.color} />
    </View>
  );
}
