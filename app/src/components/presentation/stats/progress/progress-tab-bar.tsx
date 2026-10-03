import { haptics } from '@/components/presentation/foundation/haptics';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, View } from 'react-native';

export interface ProgressTabOption<T extends string> {
  value: T;
  label: string;
}

interface ProgressTabBarProps<T extends string> {
  options: readonly ProgressTabOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the tab list for screen readers. */
  accessibilityLabel: string;
}

const UNDERLINE = 3;

/**
 * Text tabs that share the width, the selected one in ink with an accent underline. It runs to the screen's
 * edges, so it undoes the page margin. Screen readers hear a tab list.
 */
export function ProgressTabBar<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: ProgressTabBarProps<T>) {
  const { tokens } = useAppTheme();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={{
        flexDirection: 'row',
        borderBottomWidth: 1,
        borderBottomColor: tokens.line2,
        marginHorizontal: -spacing.pageHorizontalMargin,
        paddingHorizontal: spacing.pageHorizontalMargin,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={`progress-tab-${option.value}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (selected) return;
              haptics.selection();
              onChange(option.value);
            }}
            style={{
              flex: 1,
              minHeight: MIN_TOUCH_TARGET,
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 9,
            }}
          >
            <SurfaceText
              weight={selected ? '700' : '500'}
              numberOfLines={1}
              style={{ fontSize: 15, lineHeight: 20, color: selected ? tokens.ink : tokens.muted }}
            >
              {option.label}
            </SurfaceText>
            <View
              style={{
                alignSelf: 'stretch',
                height: UNDERLINE,
                marginBottom: -1,
                borderTopLeftRadius: 2,
                borderTopRightRadius: 2,
                backgroundColor: selected ? tokens.accent : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
