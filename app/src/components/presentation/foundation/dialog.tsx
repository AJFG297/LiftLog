import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

interface DialogProps {
  visible: boolean;
  onDismiss?: () => void;
  /** False keeps it open on a tap outside or back, for a choice that must be made. */
  dismissable?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * A centred card over a scrim, for a short task that needs a few fields or a choice: a weight, a note, the RPE.
 * Drawn from the theme tokens. It renders in its own native window, so it shows over sheets and the tab bar.
 */
function DialogRoot({ visible, onDismiss, dismissable = true, children, style, testID }: DialogProps) {
  const { tokens } = useAppTheme();
  const dismiss = () => {
    if (dismissable) {
      onDismiss?.();
    }
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={dismiss}
    >
      {/* An Android modal is its own native root, outside the app's gesture root, so the gesture-handler
          buttons inside it need one of their own. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'center', padding: spacing[6] }}
        >
          <Pressable
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}
            onPress={dismiss}
            accessibilityRole="button"
            accessible={dismissable}
            importantForAccessibility={dismissable ? 'auto' : 'no-hide-descendants'}
          />
          <View
            testID={testID}
            accessibilityViewIsModal
            style={[
              {
                alignSelf: 'center',
                width: '100%',
                maxWidth: 560,
                maxHeight: '90%',
                backgroundColor: tokens.card,
                borderRadius: 24,
                borderWidth: 1,
                borderColor: tokens.line,
                paddingVertical: spacing[6],
              },
              style,
            ]}
          >
            {children}
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

function DialogTitle({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingHorizontal: spacing[6], marginBottom: spacing[4] }, style]}>
      <SurfaceText font="text-xl" weight="600" accessibilityRole="header">
        {children}
      </SurfaceText>
    </View>
  );
}

function DialogContent({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: spacing[6], paddingBottom: spacing[4] }, style]}>{children}</View>;
}

/** Wraps a scroll view that runs edge to edge between the title and the actions. */
function DialogScrollArea({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { tokens } = useAppTheme();
  return (
    <View
      style={[
        {
          flexShrink: 1,
          borderTopWidth: 1,
          borderBottomWidth: 1,
          borderColor: tokens.line,
          paddingHorizontal: spacing[6],
          marginBottom: spacing[4],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

function DialogActions({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: spacing[1],
          paddingHorizontal: spacing[3],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export const Dialog = Object.assign(DialogRoot, {
  Title: DialogTitle,
  Content: DialogContent,
  ScrollArea: DialogScrollArea,
  Actions: DialogActions,
});
