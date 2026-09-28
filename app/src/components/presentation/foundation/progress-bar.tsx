import { useAppTheme } from '@/hooks/useAppTheme';
import { StyleProp, View, ViewStyle } from 'react-native';

interface ProgressBarProps {
  /** From 0 to 1. Values outside are clamped. */
  progress: number;
  /** What is progressing, e.g. "Rest". Read out with the percentage. */
  accessibilityLabel: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** An accent fill on a neutral track: rest remaining, sets done. */
export function ProgressBar({ progress, accessibilityLabel, height = 4, style, testID }: ProgressBarProps) {
  const { tokens } = useAppTheme();
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[{ height, borderRadius: height / 2, backgroundColor: tokens.track, overflow: 'hidden' }, style]}
    >
      <View style={{ width: `${clamped * 100}%`, height: '100%', backgroundColor: tokens.accent }} />
    </View>
  );
}
