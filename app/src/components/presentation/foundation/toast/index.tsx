import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import {
  hiddenToast,
  toastReducer,
  type Toast,
  type ToastContent,
} from '@/components/presentation/foundation/toast/toast-state';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { createContext, ReactNode, useContext, useEffect, useReducer, useRef } from 'react';
import { AccessibilityInfo, Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

export type { ToastContent } from '@/components/presentation/foundation/toast/toast-state';

const VISIBLE_MS = 5000;
const ENTER_MS = 200;
const EXIT_MS = 150;
/** Can't measure the tab bar from above the navigator, so assume an 80pt bar plus an 8pt gap. */
const TAB_BAR_CLEARANCE = 88;

interface ToastApi {
  /** Shows `content`, replacing any toast already on screen. */
  show: (content: ToastContent) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return api;
}

/**
 * Draws one toast at a time over the app. Mounted once in the root layout. Native sheets and modals are
 * presented above the root view, so a toast shown while one is open appears behind it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, hiddenToast);
  const nextId = useRef(0);
  const api: ToastApi = {
    show: (content) => {
      nextId.current += 1;
      dispatch({ type: 'show', toast: { ...content, id: nextId.current } });
    },
  };

  const shownId = state.phase === 'shown' ? state.toast.id : undefined;
  useEffect(() => {
    if (shownId === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    // Android lengthens this for users who asked for more time to act (e.g. with TalkBack on).
    void AccessibilityInfo.getRecommendedTimeoutMillis(VISIBLE_MS).then((ms) => {
      if (!cancelled) timer = setTimeout(() => dispatch({ type: 'dismiss', id: shownId }), ms);
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [shownId]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {state.phase !== 'hidden' && (
        <ToastView
          key={state.toast.id}
          toast={state.toast}
          leaving={state.phase === 'leaving'}
          onDismiss={() => dispatch({ type: 'dismiss', id: state.toast.id })}
          onExited={() => dispatch({ type: 'exited', id: state.toast.id })}
        />
      )}
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  leaving,
  onDismiss,
  onExited,
}: {
  toast: Toast;
  leaving: boolean;
  onDismiss: () => void;
  onExited: () => void;
}) {
  const { tokens } = useAppTheme();
  const insets = useSafeAreaInsets();
  const presence = useSharedValue(0);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      toast.action ? `${toast.message}. ${toast.action.label}` : toast.message,
    );
  }, [toast]);

  useEffect(() => {
    if (leaving) {
      presence.set(
        withTiming(0, { duration: EXIT_MS }, (finished) => {
          if (finished) scheduleOnRN(onExited);
        }),
      );
    } else {
      presence.set(withTiming(1, { duration: ENTER_MS }));
    }
  }, [leaving, presence, onExited]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: presence.get(),
    transform: [{ translateY: (1 - presence.get()) * spacing[4] }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: spacing.pageHorizontalMargin,
        right: spacing.pageHorizontalMargin,
        bottom: insets.bottom + TAB_BAR_CLEARANCE,
      }}
    >
      <Animated.View
        pointerEvents={leaving ? 'none' : 'auto'}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            minHeight: spacing[12],
            paddingLeft: spacing[4],
            paddingRight: toast.action ? spacing[1] : spacing[4],
            paddingVertical: spacing[1],
            gap: spacing[2],
            borderRadius: 14,
            backgroundColor: tokens.inverse,
          },
          animatedStyle,
        ]}
      >
        <SurfaceText font="text-sm" style={{ flex: 1, color: tokens.inverseInk, paddingVertical: spacing[2] }}>
          {toast.message}
        </SurfaceText>
        {toast.action && (
          <Pressable
            onPress={() => {
              toast.action?.onPress();
              onDismiss();
            }}
            accessibilityRole="button"
            accessibilityLabel={toast.action.label}
            style={({ pressed }) => ({
              minHeight: MIN_TOUCH_TARGET,
              minWidth: MIN_TOUCH_TARGET,
              paddingHorizontal: spacing[3],
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: pressed ? tokens.inverseRaised : 'transparent',
            })}
          >
            <SurfaceText font="text-sm" weight="600" style={{ color: tokens.invAccent }}>
              {toast.action.label}
            </SurfaceText>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}
