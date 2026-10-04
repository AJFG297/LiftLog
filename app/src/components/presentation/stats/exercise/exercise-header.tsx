import { haptics } from '@/components/presentation/foundation/haptics';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { Pressable, View } from 'react-native';

const PIN_HEIGHT = 36;

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
        <Pressable
          testID="exercise-pin"
          onPress={() => {
            haptics.selection();
            onTogglePin();
          }}
          accessibilityRole="togglebutton"
          accessibilityState={{ checked: pinned }}
          accessibilityLabel={pinLabel}
          style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'center' }}
        >
          {({ pressed }) => (
            <View
              style={{
                minHeight: PIN_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: spacing[3],
                borderRadius: PIN_HEIGHT / 2,
                borderWidth: 1,
                borderColor: pinned ? tokens.accentSoft : tokens.line,
                backgroundColor: pinned ? tokens.accentSoft : pressed ? tokens.track : tokens.card,
              }}
            >
              <MsIconSrc
                name={pinned ? 'keepFill' : 'keep'}
                size={15}
                color={pinned ? tokens.accentSoftInk : tokens.ink}
              />
              <SurfaceText
                weight="600"
                style={{ fontSize: 13, lineHeight: 18, color: pinned ? tokens.accentSoftInk : tokens.ink }}
              >
                {pinLabel}
              </SurfaceText>
            </View>
          )}
        </Pressable>
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
