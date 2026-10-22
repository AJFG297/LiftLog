import { haptics } from '@/components/presentation/foundation/haptics';
import { MsIconSrc } from '@/components/presentation/foundation/ms-icon-source';
import { ProgressBar } from '@/components/presentation/foundation/progress-bar';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { autoScrollSpeed, reorderShiftFor, reorderTargetIndex } from './reorder-target';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useTranslate } from '@tolgee/react';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, View, type ScrollView as NativeScrollView } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  measure,
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useFrameCallback,
  useScrollOffset,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const TILE_WIDTH = 118;
const TILE_MIN_HEIGHT = 78;
const ADD_TILE_WIDTH = 56;
const GAP = spacing[2];
const SIDE = spacing.pageHorizontalMargin;

export interface ExerciseStripTile {
  key: string;
  label: string;
  name: string;
  done: number;
  total: number;
  isCurrent: boolean;
  isComplete: boolean;
  isSuperset: boolean;
  onPress: () => void;
}

export interface ExerciseStripGroup {
  key: string;
  tiles: ExerciseStripTile[];
}
interface ExerciseStripProps {
  groups: ExerciseStripGroup[];
  onAddExercise: () => void;
  onReorderStart: () => void;
  onMove: (from: number, to: number) => void;
}

interface WebScrollNode {
  addEventListener(
    type: 'touchmove',
    listener: (event: { preventDefault(): void }) => void,
    options: { passive: false },
  ): void;
  removeEventListener(type: 'touchmove', listener: (event: { preventDefault(): void }) => void): void;
}

type StripDrag =
  | { kind: 'idle' }
  | {
      kind: 'held';
      from: number;
      target: number;
      dx: number;
      fingerStart: number;
      startOffset: number;
      scrolled: number;
      widths: number[];
    };

export function ExerciseStrip({ groups, onAddExercise, onReorderStart, onMove }: ExerciseStripProps) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const scrollRef = useAnimatedRef<NativeScrollView>();
  const scrollGesture = Gesture.Native().disallowInterruption(true);
  const offset = useScrollOffset(scrollRef);
  const contentWidth = useSharedValue(0);
  const drag = useSharedValue<StripDrag>({ kind: 'idle' });
  const [heldKey, setHeldKey] = useState<string | undefined>();
  const [viewWidth, setViewWidth] = useState(0);
  const tiles = groups.flatMap((group) => group.tiles);
  const currentIndex = tiles.findIndex((tile) => tile.isCurrent);
  const currentKey = tiles[currentIndex]?.key;
  const previousCentre = useRef({ currentKey, viewWidth: 0 });
  const skipCentre = useRef(false);
  const capturedOrder = useRef<string[]>([]);
  const latestGroups = useRef(groups);
  useEffect(() => {
    latestGroups.current = groups;
  }, [groups]);

  useEffect(() => {
    const previous = previousCentre.current;
    previousCentre.current = { currentKey, viewWidth };
    if (heldKey || currentIndex < 0 || !viewWidth) return;
    if (skipCentre.current) {
      skipCentre.current = false;
      return;
    }
    if (previous.currentKey === currentKey && previous.viewWidth === viewWidth) return;
    const width = SIDE * 2 + tiles.length * (TILE_WIDTH + GAP) + ADD_TILE_WIDTH;
    const centred = SIDE + currentIndex * (TILE_WIDTH + GAP) + TILE_WIDTH / 2 - viewWidth / 2;
    scrollRef.current?.scrollTo({ x: Math.max(0, Math.min(centred, width - viewWidth)), animated: true });
  }, [currentKey, currentIndex, viewWidth, tiles.length, heldKey, scrollRef]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node = scrollRef.current?.getScrollableNode() as WebScrollNode | undefined;
    const keepHeldGesture = (event: { preventDefault(): void }) => {
      if (drag.get().kind === 'held') event.preventDefault();
    };
    // Browsers otherwise cancel the held pointer as soon as horizontal panning starts.
    node?.addEventListener('touchmove', keepHeldGesture, { passive: false });
    return () => node?.removeEventListener('touchmove', keepHeldGesture);
  }, [drag, scrollRef]);

  useFrameCallback((frame) => {
    const held = drag.get();
    if (held.kind !== 'held') return;
    const view = measure(scrollRef);
    let scrolled = held.scrolled;
    if (view) {
      const speed = autoScrollSpeed(held.fingerStart + held.dx - view.pageX, view.width);
      const current = held.startOffset + held.scrolled;
      const next = Math.min(
        Math.max(0, contentWidth.get() - view.width),
        Math.max(0, current + (speed * (frame.timeSincePreviousFrame ?? 0)) / 1000),
      );
      if (next !== current) {
        scrollTo(scrollRef, next, 0, false);
        scrolled = next - held.startOffset;
      }
    }
    drag.set({ ...held, scrolled, target: reorderTargetIndex(held.widths, GAP, held.from, held.dx + scrolled) });
  });

  const begin = (key: string) => {
    capturedOrder.current = groups.map((group) => group.key);
    setHeldKey(key);
    onReorderStart();
    haptics.selection();
  };
  const end = (from: number, to: number, success: boolean) => {
    const unchanged =
      capturedOrder.current.length === latestGroups.current.length &&
      capturedOrder.current.every((key, index) => key === latestGroups.current[index]?.key);
    skipCentre.current = true;
    if (success && unchanged && from !== to) onMove(from, to);
    setHeldKey(undefined);
  };
  const moveAccessible = (from: number, to: number) => {
    onReorderStart();
    onMove(from, to);
  };
  const widths = groups.map((group) => group.tiles.length * TILE_WIDTH + (group.tiles.length - 1) * GAP);

  return (
    <GestureDetector gesture={scrollGesture} touchAction="pan-x">
      <Animated.ScrollView
        testID="exercise-strip"
        ref={scrollRef}
        horizontal
        scrollEnabled={!heldKey}
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => setViewWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => contentWidth.set(width)}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: GAP, paddingHorizontal: SIDE, paddingVertical: spacing[2] }}
      >
        {groups.map((group, index) => (
          <DraggableGroup
            key={group.key}
            group={group}
            index={index}
            count={groups.length}
            drag={drag}
            widths={widths}
            scrollGesture={scrollGesture}
            offset={offset}
            onBegin={begin}
            onEnd={end}
            onMove={(to) => moveAccessible(index, to)}
          />
        ))}
        <Pressable
          testID="strip-add-exercise"
          onPress={onAddExercise}
          accessibilityRole="button"
          accessibilityLabel={t('exercise.add.title')}
          style={({ pressed }) => ({
            width: ADD_TILE_WIDTH,
            minHeight: TILE_MIN_HEIGHT,
            borderRadius: 14,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: tokens.line3,
            backgroundColor: pressed ? tokens.track : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <MsIconSrc name="add" size={20} color={tokens.muted} />
        </Pressable>
      </Animated.ScrollView>
    </GestureDetector>
  );
}

function DraggableGroup({
  group,
  index,
  count,
  drag,
  widths,
  scrollGesture,
  offset,
  onBegin,
  onEnd,
  onMove,
}: {
  group: ExerciseStripGroup;
  index: number;
  count: number;
  drag: SharedValue<StripDrag>;
  widths: number[];
  scrollGesture: ReturnType<typeof Gesture.Native>;
  offset: SharedValue<number>;
  onBegin: (key: string) => void;
  onEnd: (from: number, to: number, success: boolean) => void;
  onMove: (to: number) => void;
}) {
  const { tokens } = useAppTheme();
  const consumed = useRef(false);
  const markConsumed = () => {
    consumed.current = true;
    onBegin(group.key);
  };
  const pan = Gesture.Pan()
    .activateAfterLongPress(350)
    .maxPointers(1)
    .blocksExternalGesture(scrollGesture)
    .onStart((event) => {
      drag.set({
        kind: 'held',
        from: index,
        target: index,
        dx: 0,
        fingerStart: event.absoluteX,
        startOffset: offset.get(),
        scrolled: 0,
        widths,
      });
      scheduleOnRN(markConsumed);
    })
    .onUpdate((event) => {
      const held = drag.get();
      if (held.kind === 'held') drag.set({ ...held, dx: event.translationX });
    })
    .onFinalize((event, success) => {
      const held = drag.get();
      if (held.kind !== 'held' || held.from !== index) return;
      const target = reorderTargetIndex(held.widths, GAP, held.from, event.translationX + held.scrolled);
      drag.set({ kind: 'idle' });
      scheduleOnRN(onEnd, held.from, target, success);
    });
  const style = useAnimatedStyle(() => {
    const held = drag.get();
    const isHeld = held.kind === 'held' && held.from === index;
    const shift =
      held.kind === 'held' ? reorderShiftFor(index, held.from, held.target, held.widths[held.from]!, GAP) : 0;
    return {
      zIndex: isHeld ? 1 : 0,
      opacity: isHeld ? 0.96 : 1,
      outlineColor: isHeld ? tokens.accentLine : 'transparent',
      transform: [
        {
          translateX: isHeld
            ? held.dx + held.scrolled
            : held.kind === 'idle'
              ? 0
              : withTiming(shift, { duration: 140 }),
        },
        { translateY: isHeld ? -2 : 0 },
        { scale: isHeld ? 1.025 : 1 },
      ],
    };
  });
  return (
    <GestureDetector gesture={pan} touchAction="pan-x">
      <Animated.View
        testID={`strip-group-${index}`}
        style={[{ flexDirection: 'row', gap: GAP, borderRadius: 14, outlineWidth: 2, outlineOffset: 2 }, style]}
      >
        {group.tiles.map((tile) => (
          <StripTile
            key={tile.key}
            tile={tile}
            testID={`exercise-tile-${tile.label}`}
            onPressIn={() => {
              consumed.current = false;
            }}
            onPress={() => {
              if (!consumed.current) tile.onPress();
            }}
            onMove={onMove}
            index={index}
            count={count}
          />
        ))}
      </Animated.View>
    </GestureDetector>
  );
}

function StripTile({
  tile,
  testID,
  onPressIn,
  onPress,
  onMove,
  index,
  count,
}: {
  tile: ExerciseStripTile;
  testID: string;
  onPressIn: () => void;
  onPress: () => void;
  onMove: (to: number) => void;
  index: number;
  count: number;
}) {
  const { tokens } = useAppTheme();
  const { t } = useTranslate();
  const current = tile.isCurrent;
  const sub = current ? tokens.inverseMuted : tile.isSuperset ? tokens.accentInk : tokens.muted;
  return (
    <Pressable
      testID={testID}
      onPressIn={onPressIn}
      onPress={onPress}
      accessibilityHint={t('live_workout.reorder.hint')}
      accessibilityActions={[
        ...(index > 0 ? [{ name: 'moveLeft', label: t('live_workout.reorder.move_left.button') }] : []),
        ...(index < count - 1 ? [{ name: 'moveRight', label: t('live_workout.reorder.move_right.button') }] : []),
      ]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'moveLeft') onMove(index - 1);
        else if (event.nativeEvent.actionName === 'moveRight') onMove(index + 1);
      }}
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      accessibilityLabel={t('live_workout.tile.label', { name: tile.name, done: tile.done, total: tile.total })}
      style={({ pressed }) => ({
        width: TILE_WIDTH,
        minHeight: TILE_MIN_HEIGHT,
        borderRadius: 14,
        padding: spacing[2],
        justifyContent: 'space-between',
        gap: spacing[1],
        backgroundColor: current ? tokens.inverse : pressed ? tokens.track : tokens.card,
        borderWidth: current ? 0 : 1,
        borderColor: tile.isComplete ? tokens.accentLine : tokens.line,
      })}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <SurfaceText font="text-xs" weight="700" style={{ color: sub }}>
          {tile.label}
        </SurfaceText>
        <SurfaceText font="text-xs" numeric weight="500" style={{ color: sub }}>
          {`${tile.done}/${tile.total}`}
        </SurfaceText>
      </View>
      <SurfaceText
        font="text-sm"
        weight="600"
        numberOfLines={2}
        style={{ color: current ? tokens.inverseInk : tokens.ink }}
      >
        {tile.name}
      </SurfaceText>
      <ProgressBar
        progress={tile.total ? tile.done / tile.total : 0}
        accessibilityLabel={tile.name}
        tone={current ? 'inverse' : 'default'}
      />
    </Pressable>
  );
}
