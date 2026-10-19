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
import { ScrollView, View } from 'react-native';
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
  /** Pass to the scroll view's `onContentSizeChange`. */
  onContentSizeChange: (width: number, height: number) => void;
}

/** Wires a scroll view up to a `ReorderableList` inside it: attach `ref` and `onContentSizeChange` to it. */
export function useReorderScroll(): ReorderScroll {
  const ref = useAnimatedRef<ScrollView>();
  const offset = useScrollOffset(ref);
  const contentHeight = useSharedValue(0);
  return {
    ref,
    offset,
    contentHeight,
    onContentSizeChange: (_width, height) => contentHeight.set(height),
  };
}

interface DragState {
  from: SharedValue<number>;
  target: SharedValue<number>;
  dy: SharedValue<number>;
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
  const from = useSharedValue(-1);
  const target = useSharedValue(-1);
  const dy = useSharedValue(0);
  const scrolled = useSharedValue(0);
  const draggedHeight = useSharedValue(0);
  const drag: DragState = { from, target, dy, scrolled, draggedHeight };
  // Copied to the UI thread when a row is picked up, so the frame callback can work out the target.
  const heldHeights = useSharedValue<number[]>([]);
  const fingerY = useSharedValue(0);
  const startOffset = useSharedValue(0);

  // Each frame a row is held, scroll when the finger is near an edge of the scroll view. The scroll view
  // can't be scrolled by hand meanwhile, so the offset is only ever what this sets.
  const autoScroll = useFrameCallback((frame) => {
    if (!scroll || drag.from.get() < 0) {
      return;
    }
    const view = measure(scroll.ref);
    if (view) {
      const speed = autoScrollSpeed(fingerY.get() - view.pageY, view.height);
      const maxOffset = Math.max(0, scroll.contentHeight.get() - view.height);
      const offset = startOffset.get() + drag.scrolled.get();
      const next = Math.min(maxOffset, Math.max(0, offset + (speed * (frame.timeSincePreviousFrame ?? 0)) / 1000));
      if (next !== offset) {
        scrollTo(scroll.ref, 0, next, false);
        drag.scrolled.set(next - startOffset.get());
      }
    }
    drag.target.set(reorderTargetIndex(heldHeights.get(), gap, drag.from.get(), drag.dy.get() + drag.scrolled.get()));
  }, false);

  const begin = (index: number, absoluteY: number) => {
    const measured = orderedHeights();
    heldHeights.set(measured);
    fingerY.set(absoluteY);
    startOffset.set(scroll?.offset.get() ?? 0);
    drag.from.set(index);
    drag.target.set(index);
    drag.dy.set(0);
    drag.scrolled.set(0);
    drag.draggedHeight.set(measured[index] ?? 0);
    autoScroll.setActive(!!scroll);
    onDragChange?.(true);
  };
  const update = (translationY: number, absoluteY: number) => {
    drag.dy.set(translationY);
    fingerY.set(absoluteY);
    if (!scroll) {
      drag.target.set(reorderTargetIndex(orderedHeights(), gap, drag.from.get(), translationY));
    }
  };
  const end = () => {
    autoScroll.setActive(false);
    const movedFrom = drag.from.get();
    const movedTo = drag.target.get();
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
          onBegin={(absoluteY) => begin(index, absoluteY)}
          onUpdate={update}
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
  onBegin: (absoluteY: number) => void;
  onUpdate: (dy: number, absoluteY: number) => void;
  onEnd: () => void;
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

  // Callbacks run on the JS thread: the rows are few, and the maths lives in plain functions.
  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((event) => props.onBegin(event.absoluteY))
    .onUpdate((event) => props.onUpdate(event.translationY, event.absoluteY))
    .onFinalize(props.onEnd);

  const handle = (
    <GestureDetector gesture={pan}>
      <View
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
      </View>
    </GestureDetector>
  );

  return (
    <Animated.View style={style} onLayout={(event) => props.onLayoutHeight(event.nativeEvent.layout.height)}>
      {props.item.render(handle)}
    </Animated.View>
  );
}
