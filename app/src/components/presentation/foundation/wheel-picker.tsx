import { haptics } from '@/components/presentation/foundation/haptics';
import { SurfaceText } from '@/components/presentation/foundation/surface-text';
import { spacing, useAppTheme } from '@/hooks/useAppTheme';
import { useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

const ROW_HEIGHT = 44;
const VISIBLE_ROWS = 3;
/** Rows above and below the selection band. */
const EDGE_ROWS = Math.floor(VISIBLE_ROWS / 2);
const COLUMN_WIDTH = 56;

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
 * Side-by-side scrolling wheels, one per column, each settling on the row in the band across the middle:
 * minutes and seconds of a rest, say. Screen readers hear each column as an adjustable value.
 */
export function WheelPicker({ columns, testID }: WheelPickerProps) {
  const { tokens } = useAppTheme();
  return (
    <View
      testID={testID}
      style={{ height: WHEEL_PICKER_HEIGHT, flexDirection: 'row', justifyContent: 'center', gap: spacing[6] }}
    >
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: EDGE_ROWS * ROW_HEIGHT,
          height: ROW_HEIGHT,
          borderRadius: 12,
          // The sheet is `card`, so a `card` band would vanish; `bg` is the step-button fill on it.
          backgroundColor: tokens.bg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: tokens.line,
        }}
      />
      {columns.map((column) => (
        <WheelColumn key={column.key} column={column} testID={testID && `${testID}-${column.key}`} />
      ))}
    </View>
  );
}

function WheelColumn({ column, testID }: { column: WheelPickerColumn; testID: string | undefined }) {
  const { tokens } = useAppTheme();
  const { options, value, onChange, unit } = column;
  const scrollRef = useRef<ScrollView>(null);
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  // The row under the band as the wheel moves, ahead of the value, which only changes once it settles.
  const [centred, setCentred] = useState(index);
  const selected = options[index];

  const rowAt = (offsetY: number) => Math.min(options.length - 1, Math.max(0, Math.round(offsetY / ROW_HEIGHT)));

  // Brings the wheel to a value set from outside it: a tapped row, or a screen reader's swipe.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: index * ROW_HEIGHT, animated: true });
  }, [index]);

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const row = rowAt(event.nativeEvent.contentOffset.y);
    if (row !== centred) {
      setCentred(row);
      haptics.selection();
    }
  };

  const commit = (offsetY: number) => {
    const option = options[rowAt(offsetY)];
    if (option && option.value !== value) {
      onChange(option.value);
    }
  };

  const step = (by: number) => {
    const option = options[index + by];
    if (option) {
      onChange(option.value);
    }
  };

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={column.accessibilityLabel}
      accessibilityValue={{ text: selected ? `${selected.label} ${unit}` : unit }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => step(event.nativeEvent.actionName === 'increment' ? 1 : -1)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[2] }}
    >
      <ScrollView
        ref={scrollRef}
        style={{ width: COLUMN_WIDTH, height: WHEEL_PICKER_HEIGHT }}
        contentContainerStyle={{ paddingVertical: EDGE_ROWS * ROW_HEIGHT }}
        // The initial offset, before the first layout; onLayout repeats it where that is ignored.
        contentOffset={{ x: 0, y: index * ROW_HEIGHT }}
        onLayout={() => scrollRef.current?.scrollTo({ y: index * ROW_HEIGHT, animated: false })}
        snapToInterval={ROW_HEIGHT}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        // Inside an Android sheet, lets the wheel scroll instead of dragging the sheet.
        nestedScrollEnabled
        scrollEventThrottle={16}
        onScroll={onScroll}
        onMomentumScrollEnd={(event) => commit(event.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(event) => {
          // A drag released on a row has no momentum to settle, so no momentum end follows it.
          const y = event.nativeEvent.contentOffset.y;
          if (Math.abs(y - rowAt(y) * ROW_HEIGHT) < 1) {
            commit(y);
          }
        }}
      >
        {options.map((option, i) => {
          const distance = Math.abs(i - centred);
          return (
            <Pressable
              key={option.value}
              testID={testID && `${testID}-${option.value}`}
              onPress={() => option.value !== value && onChange(option.value)}
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
            </Pressable>
          );
        })}
      </ScrollView>
      <SurfaceText font="text-base" weight="600" style={{ color: tokens.muted, minWidth: 32 }}>
        {unit}
      </SurfaceText>
    </View>
  );
}
