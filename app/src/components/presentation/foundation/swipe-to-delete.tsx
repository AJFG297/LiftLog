import { haptics } from '@/components/presentation/foundation/haptics';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { type ReactNode, useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * The row is clipped so it can't slide out over whatever surrounds it. Badges that sit on a row's top edge
 * (a set's "@9") poke out above it, so the clip starts this far higher.
 */
const OVERHANG = 8;
/** How far a short swipe opens the row: the width of the Delete button it shows. */
const ACTION_WIDTH = 88;
/** Past this share of the row's width, letting go deletes instead of leaving the button open. */
const DELETE_AT = 0.55;
/** A fling this fast to the left deletes from wherever it started, once the button is showing. */
const DELETE_VELOCITY = -1400;
const SETTLE = { duration: 180 };

interface SwipeToDeleteProps {
  children: ReactNode;
  /** Undefined turns the swipe off, for a row that can't be deleted. */
  onDelete: (() => void) | undefined;
  /** The button's text, "Delete". */
  label: string;
  /** What a screen reader says for the button, such as "Delete set 2". */
  accessibilityLabel: string;
  /**
   * Rows are often keyed by position, so after a delete the row below takes this one's place. A change here
   * snaps the row shut, so the one that moved up isn't left swiped open.
   */
  resetKey: string | number;
  testID?: string;
}

/**
 * A row that swipes left to delete, as in Mail: a short swipe shows a Delete button, and a long swipe, or a
 * hard fling, deletes on release. The delete fill grows with the swipe and a tap marks the point past
 * which letting go deletes. Screen readers use the row's own delete action instead, so the caller should
 * offer one.
 */
export function SwipeToDelete(props: SwipeToDeleteProps) {
  const { tokens } = useAppTheme();
  const width = useSharedValue(0);
  const offset = useSharedValue(0);
  const start = useSharedValue(0);
  const armed = useSharedValue(false);
  const [open, setOpen] = useState(false);
  const { onDelete } = props;

  // Before paint, so the row that moved up is never drawn swiped away for a frame.
  useLayoutEffect(() => {
    offset.set(0);
    setOpen(false);
  }, [props.resetKey, offset]);

  const remove = () => {
    setOpen(false);
    onDelete?.();
  };
  const close = () => {
    offset.set(withTiming(0, SETTLE));
    setOpen(false);
  };

  const pan = Gesture.Pan()
    .enabled(!!onDelete)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      start.set(offset.get());
    })
    .onUpdate((event) => {
      const next = Math.min(0, Math.max(-width.get(), start.get() + event.translationX));
      offset.set(next);
      const past = -next > width.get() * DELETE_AT;
      if (past !== armed.get()) {
        armed.set(past);
        scheduleOnRN(haptics.selection);
      }
    })
    .onEnd((event) => {
      const dragged = -offset.get();
      armed.set(false);
      if (dragged > width.get() * DELETE_AT || (event.velocityX < DELETE_VELOCITY && dragged > ACTION_WIDTH / 2)) {
        offset.set(
          withTiming(-width.get(), SETTLE, (finished) => {
            if (finished) scheduleOnRN(remove);
          }),
        );
      } else if (dragged > ACTION_WIDTH / 2) {
        offset.set(withTiming(-ACTION_WIDTH, SETTLE));
        scheduleOnRN(setOpen, true);
      } else {
        offset.set(withTiming(0, SETTLE));
        scheduleOnRN(setOpen, false);
      }
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  const fillStyle = useAnimatedStyle(() => ({ width: Math.max(0, -offset.get()) }));

  return (
    <View
      onLayout={(event) => width.set(event.nativeEvent.layout.width)}
      testID={props.testID}
      style={{ overflow: 'hidden', paddingTop: OVERHANG, marginTop: -OVERHANG }}
    >
      {onDelete ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: OVERHANG,
              bottom: 0,
              right: 0,
              borderRadius: 12,
              overflow: 'hidden',
              backgroundColor: tokens.danger,
            },
            fillStyle,
          ]}
        >
          <Pressable
            testID="swipe-delete"
            accessibilityRole="button"
            accessibilityLabel={props.accessibilityLabel}
            onPress={() => offset.set(withTiming(-width.get(), SETTLE, (f) => f && scheduleOnRN(remove)))}
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              right: 0,
              width: ACTION_WIDTH,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing[0.5],
            }}
          >
            <MsIconSrc name="delete" size={20} color={tokens.bg} />
            <SurfaceText font="text-xs" weight="600" numberOfLines={1} style={{ color: tokens.bg }}>
              {props.label}
            </SurfaceText>
          </Pressable>
        </Animated.View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ backgroundColor: tokens.card, borderRadius: 12 }, rowStyle]}>
          {props.children}
          {/* While open, a tap on the row closes it instead of reaching the fields underneath. */}
          {open ? <Pressable accessible={false} onPress={close} style={StyleSheet.absoluteFill} /> : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
