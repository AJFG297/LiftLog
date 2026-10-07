import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, View } from 'react-native';

/** One choice in a row of mutually exclusive pills, like the Targets card's Fixed, Range and Per set. */
export function ModePill(props: { label: string; selected: boolean; onPress: () => void; testID: string }) {
  const { tokens } = useAppTheme();
  return (
    <Pressable
      testID={props.testID}
      onPress={props.onPress}
      accessibilityRole="radio"
      accessibilityLabel={props.label}
      accessibilityState={{ checked: props.selected }}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
    >
      {({ pressed }) => (
        <View
          style={{
            height: 34,
            paddingHorizontal: 14,
            borderRadius: 17,
            borderWidth: 1,
            justifyContent: 'center',
            borderColor: props.selected ? tokens.ink : tokens.line,
            backgroundColor: props.selected ? tokens.ink : pressed ? tokens.track : 'transparent',
          }}
        >
          <SurfaceText font="text-sm" weight="500" style={{ color: props.selected ? tokens.bg : tokens.ink }}>
            {props.label}
          </SurfaceText>
        </View>
      )}
    </Pressable>
  );
}
