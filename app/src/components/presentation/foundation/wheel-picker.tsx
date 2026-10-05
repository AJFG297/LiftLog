import { haptics } from '@/components/presentation/foundation/haptics';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 3;
/** Rows above and below the selection band. */
const EDGE_ROWS = Math.floor(VISIBLE_ROWS / 2);
const COLUMN_WIDTH = 56;
/** How far past either end the wheel can be pulled before it stops following the finger. */
const OVERSCROLL = ROW_HEIGHT / 2;
/** Seconds of a fling's speed added to where it lets go, to pick the row it coasts to. */
const FLING_PROJECTION = 0.12;
const SETTLE = { duration: 220, easing: Easing.out(Easing.cubic) };

/** Height of the picker: three 44pt rows, the middle one picked. */
export const WHEEL_PICKER_HEIGHT = ROW_HEIGHT * VISIBLE_ROWS;

export interface WheelPickerOption {
  value: number;
  label: string;
}

export interface WheelPickerColumn {
  key: string;
  options: WheelPickerOption[];
  value: number;
  onChange: (value: number) => void;
  /** Shown beside the column, e.g. "min". */
  unit: string;
  /** Names the column for screen readers, e.g. "Minutes". */
  accessibilityLabel: string;
}

interface WheelPickerProps {
  columns: WheelPickerColumn[];
  testID?: string;
}

/**
 * Side-by-side wheels, one per column, each settling on the row in the band across the middle: minutes
 * and seconds of a rest, say. Screen readers hear each column as an adjustable value.
 */
export function WheelPicker({ columns, testID }: WheelPickerProps) {
  const { tokens } = useAppTheme();
  return (
    <View testID={testID} style={{ height: WHEEL_PICKER_HEIGHT, flexDirection: 'row' }}>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          // The picker may run to the sheet's edges; the band keeps the page margin.
          left: spacing.pageHorizontalMargin,
          right: spacing.pageHorizontalMargin,
          top: EDGE_ROWS * ROW_HEIGHT,
          height: ROW_HEIGHT,
          borderRadius: 12,
          // The sheet is `card`, so a `card` band would vanish; `bg` is the step-button fill on it.
          backgroundColor: tokens.bg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: tokens.line,
        }}
      />
      {columns.map((column, i) => (
        <WheelColumn
          key={column.key}
          column={column}
          // Packed towards the middle, so the wheels sit together while each owns its share of the width.
          justify={i === 0 ? 'flex-end' : i === columns.length - 1 ? 'flex-start' : 'center'}
          testID={testID && `${testID}-${column.key}`}
        />
      ))}
    </View>
  );
}

/**
 * A column is a pan gesture over a moving list, not a scroll view. On Android a sheet takes over a scroll
 * view's drag once it reaches its end, and only defers to the first scroll view it finds. The pan claims
 * the touch for the gesture handler root as soon as it moves vertically, which cancels the sheet's drag.
 * It covers the column's whole share of the picker, unit and margins too, so a thumb a little off the
 * numbers still turns the wheel instead of dragging the sheet.
 */
function WheelColumn({
  column,
  justify,
  testID,
}: {
  column: WheelPickerColumn;
  justify: 'flex-start' | 'center' | 'flex-end';
  testID: string | undefined;
}) {
  const { tokens } = useAppTheme();
  const { options, value, onChange, unit } = column;
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  const lastRow = options.length - 1;
  // Pixels the list has moved up: row n sits in the band at n * ROW_HEIGHT.
  const position = useSharedValue(index * ROW_HEIGHT);
  const start = useSharedValue(0);
  const dragging = useSharedValue(false);
  // The row under the band as the wheel moves, ahead of the value, which only changes once it settles.
  const [centred, setCentred] = useState(index);
  const selected = options[index];

  const commit = (row: number) => {
    const option = options[row];
    if (option && option.value !== value) {
      onChange(option.value);
    }
  };

  const onCentred = (row: number) => {
    setCentred(row);
    haptics.selection();
  };

  // Brings the wheel to a value set from outside it: a tapped row, or a screen reader's swipe.
  useEffect(() => {
    if (!dragging.get()) {
      position.set(withTiming(index * ROW_HEIGHT, SETTLE));
    }
  }, [index, position, dragging]);

  useAnimatedReaction(
    () => Math.min(lastRow, Math.max(0, Math.round(position.get() / ROW_HEIGHT))),
    (row, previous) => {
      if (previous !== null && row !== previous) {
        scheduleOnRN(onCentred, row);
      }
    },
  );

  const pan = Gesture.Pan()
    .activeOffsetY([-4, 4])
    .onBegin(() => {
      start.set(position.get());
    })
    .onStart(() => {
      dragging.set(true);
    })
    .onUpdate((event) => {
      const next = start.get() - event.translationY;
      position.set(Math.min(lastRow * ROW_HEIGHT + OVERSCROLL, Math.max(-OVERSCROLL, next)));
    })
    .onEnd((event) => {
      const projected = position.get() - event.velocityY * FLING_PROJECTION;
      const row = Math.min(lastRow, Math.max(0, Math.round(projected / ROW_HEIGHT)));
      position.set(withTiming(row * ROW_HEIGHT, SETTLE));
      scheduleOnRN(commit, row);
    })
    .onFinalize(() => {
      dragging.set(false);
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((event) => {
      const row = centred + Math.round((event.y - EDGE_ROWS * ROW_HEIGHT - ROW_HEIGHT / 2) / ROW_HEIGHT);
      commit(Math.min(lastRow, Math.max(0, row)));
    });

  const listStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -position.get() }] }));

  const step = (by: number) => {
    const option = options[index + by];
    if (option) {
      onChange(option.value);
    }
  };

  return (
    <GestureDetector gesture={Gesture.Exclusive(pan, tap)}>
      <View
        testID={testID}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={column.accessibilityLabel}
        accessibilityValue={{ text: selected ? `${selected.label} ${unit}` : unit }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
        style={{
          flex: 1,
          height: WHEEL_PICKER_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: justify,
          gap: spacing[2],
          paddingHorizontal: spacing[3],
        }}
      >
        <View style={{ width: COLUMN_WIDTH, height: WHEEL_PICKER_HEIGHT, overflow: 'hidden' }}>
          <Animated.View style={[{ paddingTop: EDGE_ROWS * ROW_HEIGHT }, listStyle]}>
            {options.map((option, i) => {
              const distance = Math.abs(i - centred);
              return (
                <View
                  key={option.value}
                  testID={testID && `${testID}-${option.value}`}
                  style={{ height: ROW_HEIGHT, alignItems: 'flex-end', justifyContent: 'center' }}
                >
                  <SurfaceText
                    font="text-2xl"
                    numeric
                    weight={distance === 0 ? '600' : undefined}
                    style={{ color: distance === 0 ? tokens.ink : distance === 1 ? tokens.muted : tokens.faint }}
                  >
                    {option.label}
                  </SurfaceText>
                </View>
              );
            })}
          </Animated.View>
        </View>
        <SurfaceText font="text-base" weight="600" style={{ color: tokens.muted, minWidth: 32 }}>
          {unit}
        </SurfaceText>
      </View>
    </GestureDetector>
  );
}
