import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';

interface RoutineUpdatedBannerProps {
  message: string;
  undoLabel: string;
  /** Omitted when there is nothing to go back to. */
  onUndo: (() => void) | undefined;
}

/**
 * "Push routine updated with 2 changes", with Undo, at the top of the workout summary. Drawn in the page
 * rather than as a toast so it never covers the Done button, and it stays until the lifter leaves.
 */
export function RoutineUpdatedBanner({ message, undoLabel, onUndo }: RoutineUpdatedBannerProps) {
  const { tokens } = useAppTheme();
  const canUndo = !!onUndo;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(canUndo ? `${message}. ${undoLabel}` : message);
  }, [message, undoLabel, canUndo]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: spacing[3],
        paddingLeft: 14,
        paddingRight: onUndo ? spacing[2] : 14,
        borderRadius: 14,
        backgroundColor: tokens.inverse,
      }}
    >
      <MsIconSrc name="check" size={18} color={tokens.invAccent} />
      <SurfaceText font="text-sm" style={{ flex: 1, color: tokens.inverseInk }}>
        {message}
      </SurfaceText>
      {onUndo ? (
        <Pressable
          onPress={onUndo}
          accessibilityRole="button"
          accessibilityLabel={undoLabel}
          // A 44pt target around the 32pt button, reaching into the banner's padding.
          style={{
            minHeight: MIN_TOUCH_TARGET,
            minWidth: MIN_TOUCH_TARGET,
            marginVertical: -6,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {({ pressed }) => (
            <View
              style={{
                height: 32,
                paddingHorizontal: 10,
                borderRadius: 10,
                justifyContent: 'center',
                backgroundColor: pressed ? tokens.inverseTrack : tokens.inverseRaised2,
              }}
            >
              <SurfaceText font="text-sm" weight="600" style={{ color: tokens.inverseInk }}>
                {undoLabel}
              </SurfaceText>
            </View>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
