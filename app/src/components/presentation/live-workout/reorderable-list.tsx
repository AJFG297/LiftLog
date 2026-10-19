import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { MIN_TOUCH_TARGET } from '@/components/presentation/foundation/touch-target';
import {
  autoScrollSpeed,
  reorderShiftFor,
  reorderTargetIndex,
} from '@/components/presentation/live-workout/reorder-target';
import { useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { ReactNode, useRef } from 'react';
import { ScrollView, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  AnimatedRef,
  measure,
  scrollTo,
  SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ReorderableItem {
  key: string;
  /** Read out on the drag handle: "Reorder Bench Press". */
  handleLabel: string;
  /** Draws the item, placing `handle` where the user grabs it. */
  render: (handle: ReactNode) => ReactNode;
}

interface ReorderableListProps {
  items: ReorderableItem[];
  gap: number;
  onMove: (from: number, to: number) => void;
  /** Lets the parent stop its scroll view while a row is held. */
  onDragChange?: (dragging: boolean) => void;
  /** The scroll view the list sits in, from `useReorderScroll`, scrolled when a row is held near its edge. */
  scroll?: ReorderScroll;
}

export interface ReorderScroll {
  ref: AnimatedRef<ScrollView>;
  offset: SharedValue<number>;
  contentHeight: SharedValue<number>;
  /** The lowest point on screen the user can see, in `measure`'s space: a sheet's scroll view can run past it. */
  visibleBottom: number;
  /** Pass to the scroll view's `onContentSizeChange`. */
  onContentSizeChange: (width: number, height: number) => void;
}

/** Wires a scroll view up to a `ReorderableList` inside it: attach `ref` and `onContentSizeChange` to it. */
export function useReorderScroll(): ReorderScroll {
  const ref = useAnimatedRef<ScrollView>();
  const offset = useScrollOffset(ref);
  const contentHeight = useSharedValue(0);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return {
    ref,
    offset,
    contentHeight,
    visibleBottom: window.height - insets.bottom,
    onContentSizeChange: (_width, height) => contentHeight.set(height),
  };
}

interface DragState {
  active: SharedValue<boolean>;
  from: SharedValue<number>;
  target: SharedValue<number>;
  dy: SharedValue<number>;
  /** Where the finger went down, in the same space as `measure`'s `pageY`. */
  fingerStart: SharedValue<number>;
  /** How far the scroll view has scrolled under the held row since it was picked up. */
  scrolled: SharedValue<number>;
  draggedHeight: SharedValue<number>;
}

/**
 * A list whose rows are dragged by a handle. Screen readers get Move up and Move down actions on the
 * handle instead, since a drag can't be done with them.
 */
export function ReorderableList({ items, gap, onMove, onDragChange, scroll }: ReorderableListProps) {
  const heights = useRef(new Map<string, number>());
  const orderedHeights = () => items.map((item) => heights.current.get(item.key) ?? 0);
  const active = useSharedValue(false);
  const from = useSharedValue(-1);
  const target = useSharedValue(-1);
  const dy = useSharedValue(0);
  const fingerStart = useSharedValue(0);
  const scrolled = useSharedValue(0);
  const draggedHeight = useSharedValue(0);
  const drag: DragState = { active, from, target, dy, fingerStart, scrolled, draggedHeight };
  // Copied to the UI thread when a row is picked up, so the frame callback can work out the target.
  const heldHeights = useSharedValue<number[]>([]);
  const startOffset = useSharedValue(0);
  const scrollRef = scroll?.ref;
  const contentHeight = scroll?.contentHeight;
  const visibleBottom = scroll?.visibleBottom ?? Number.POSITIVE_INFINITY;
  const heldTarget = () => {
    'worklet';
    return reorderTargetIndex(heldHeights.get(), gap, drag.from.get(), drag.dy.get() + drag.scrolled.get());
  };

  // Each frame a row is held: scroll when the finger is near an edge of the scroll view, then work out where
  // the row would land. The scroll view can't be scrolled by hand meanwhile, so its offset is only ever what
  // this sets.
  const frameCallback = useFrameCallback((frame) => {
    if (!drag.active.get() || drag.from.get() < 0) {
      return;
    }
    const view = scrollRef && contentHeight ? measure(scrollRef) : null;
    if (scrollRef && contentHeight && view) {
      // At a sheet's lower detent the scroll view runs off the bottom of the screen, so the bottom band sits
      // above the screen's edge instead of the scroll view's.
      const visibleHeight = Math.min(view.height, visibleBottom - view.pageY);
      const speed = autoScrollSpeed(drag.fingerStart.get() + drag.dy.get() - view.pageY, visibleHeight);
      const maxOffset = Math.max(0, contentHeight.get() - view.height);
      const offset = startOffset.get() + drag.scrolled.get();
      const next = Math.min(maxOffset, Math.max(0, offset + (speed * (frame.timeSincePreviousFrame ?? 0)) / 1000));
      if (next !== offset) {
        scrollTo(scrollRef, 0, next, false);
        drag.scrolled.set(next - startOffset.get());
      }
    }
    drag.target.set(heldTarget());
  }, false);

  // The row has already put the finger's start and `dy` on the UI thread.
  const begin = (index: number) => {
    const measured = orderedHeights();
    heldHeights.set(measured);
    startOffset.set(scroll?.offset.get() ?? 0);
    drag.from.set(index);
    drag.target.set(index);
    drag.draggedHeight.set(measured[index] ?? 0);
    frameCallback.setActive(true);
    onDragChange?.(true);
  };
  const end = (distance: number) => {
    frameCallback.setActive(false);
    const movedFrom = drag.from.get();
    // Not the last frame's target: the finger may have moved since.
    const movedTo = movedFrom >= 0 ? reorderTargetIndex(heldHeights.get(), gap, movedFrom, distance) : -1;
    onDragChange?.(false);
    if (movedFrom >= 0 && movedTo >= 0 && movedTo !== movedFrom) {
      onMove(movedFrom, movedTo);
    }
    drag.dy.set(0);
    drag.scrolled.set(0);
    drag.from.set(-1);
    drag.target.set(-1);
  };

  return (
    <View style={{ gap }}>
      {items.map((item, index) => (
        <ReorderableRow
          key={item.key}
          index={index}
          count={items.length}
          gap={gap}
          drag={drag}
          onLayoutHeight={(height) => {
            heights.current.set(item.key, height);
          }}
          onBegin={() => begin(index)}
          onEnd={end}
          onMove={onMove}
          item={item}
        />
      ))}
    </View>
  );
}

function ReorderableRow(props: {
  item: ReorderableItem;
  index: number;
  count: number;
  gap: number;
  drag: DragState;
  onLayoutHeight: (height: number) => void;
  onBegin: () => void;
  onEnd: (distance: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const { index, gap, drag } = props;

  const style = useAnimatedStyle(() => {
    const held = drag.from.get() === index;
    const shift = reorderShiftFor(index, drag.from.get(), drag.target.get(), drag.draggedHeight.get(), gap);
    return {
      zIndex: held ? 1 : 0,
      opacity: held ? 0.92 : 1,
      // Snapping, not easing, once the drag ends: the rows are already drawn where the new order puts them.
      transform: [
        // The scrolled distance is added so the held row stays under the finger as the list moves beneath it.
        {
          translateY: held
            ? drag.dy.get() + drag.scrolled.get()
            : drag.from.get() < 0
              ? 0
              : withTiming(shift, { duration: 150 }),
        },
      ],
    };
  });

  const handleRef = useAnimatedRef<View>();
  const { onBegin, onEnd } = props;
  // On the UI thread, so the finger's start can be measured in the same space as the scroll view.
  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((event) => {
      const handleBox = measure(handleRef);
      drag.fingerStart.set(handleBox ? handleBox.pageY + event.y : event.absoluteY);
      drag.dy.set(0);
      drag.scrolled.set(0);
      drag.active.set(true);
      scheduleOnRN(onBegin);
    })
    .onUpdate((event) => {
      drag.dy.set(event.translationY);
    })
    .onFinalize(() => {
      drag.active.set(false);
      // Freeze the drop before RN handles it, while keeping the row held until its new order is applied.
      scheduleOnRN(onEnd, drag.dy.get() + drag.scrolled.get());
    });

  const handle = (
    <GestureDetector gesture={pan}>
      <Animated.View
        ref={handleRef}
        accessible
        accessibilityLabel={props.item.handleLabel}
        accessibilityActions={[
          ...(index > 0 ? [{ name: 'moveUp', label: t('live_workout.reorder.move_up.button') }] : []),
          ...(index < props.count - 1 ? [{ name: 'moveDown', label: t('live_workout.reorder.move_down.button') }] : []),
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'moveUp') {
            props.onMove(index, index - 1);
          } else if (event.nativeEvent.actionName === 'moveDown') {
            props.onMove(index, index + 1);
          }
        }}
        style={{ width: MIN_TOUCH_TARGET, minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' }}
      >
        <MsIconSrc name="dragIndicator" size={20} color={tokens.faint} />
      </Animated.View>
    </GestureDetector>
  );

  return (
    <Animated.View style={style} onLayout={(event) => props.onLayoutHeight(event.nativeEvent.layout.height)}>
      {props.item.render(handle)}
    </Animated.View>
  );
}
