import { haptics } from '@/components/presentation/foundation/haptics';
import { RoundIconButton } from '@/components/presentation/foundation/round-icon-button';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { View } from 'react-native';

interface ExerciseHeaderProps {
  /** "Chest · Triceps · Barbell"; nothing for an exercise with no muscles or equipment on file. */
  meta: string | undefined;
  name: string;
  pinned: boolean;
  /** "Pin to Progress", and "Pinned to Progress" once pinned. */
  pinLabel: string;
  onTogglePin: () => void;
}

/**
 * The exercise page's top: the Pin to Progress toggle at the end of the row under the native back button,
 * then the muscles and equipment, then the name.
 */
export function ExerciseHeader({ meta, name, pinned, pinLabel, onTogglePin }: ExerciseHeaderProps) {
  const { tokens } = useAppTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <RoundIconButton
          testID="exercise-pin"
          icon={pinned ? 'keepFill' : 'keep'}
          size="compact"
          label={pinLabel}
          accessibilityLabel={pinLabel}
          selected={pinned}
          onPress={() => {
            haptics.selection();
            onTogglePin();
          }}
        />
      </View>
      <View style={{ gap: spacing[1], paddingHorizontal: spacing[1] }}>
        {meta ? (
          <SurfaceText weight="500" style={{ fontSize: 13, lineHeight: 18, color: tokens.muted }}>
            {meta}
          </SurfaceText>
        ) : null}
        <SurfaceText
          accessibilityRole="header"
          weight="700"
          style={{ fontSize: 28, lineHeight: 31, letterSpacing: -0.56, color: tokens.ink }}
        >
          {name}
        </SurfaceText>
      </View>
    </View>
  );
}
