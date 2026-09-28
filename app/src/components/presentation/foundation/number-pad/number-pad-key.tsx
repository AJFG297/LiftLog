import { rounding, useAppTheme } from '@/hooks/useAppTheme';
import { MsIcon } from 'material-symbols-react-native';
import { ComponentProps, ReactNode } from 'react';
import { Pressable, View } from 'react-native';

const KEY_MIN_HEIGHT = 52;

export function NumberPadKey(props: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  testID?: string;
  children: ReactNode;
}) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      onPress={props.onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: KEY_MIN_HEIGHT,
        borderRadius: rounding.roundedRectangleRadius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: props.primary ? tokens.accent : tokens.keypadKey,
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

export function NumberPadKeyIcon(props: { icon: ComponentProps<typeof MsIcon>['icon']; color: string }) {
  return (
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <MsIcon icon={props.icon} size={24} color={props.color} />
    </View>
  );
}
