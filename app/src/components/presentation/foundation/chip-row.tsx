import { Chip } from '@/components/presentation/foundation/chip';
import { spacing } from '@/hooks/useAppTheme';
import { ScrollView } from 'react-native';

export interface ChipOption<T> {
  value: T;
  label: string;
}

interface ChipRowProps<T> {
  options: ChipOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
  /** Read out before the row, e.g. "Muscle". */
  accessibilityLabel: string;
  testID?: string;
}

/**
 * One row of filter chips that scrolls sideways past the screen's edge. Exactly one is on; the first option
 * is the "All" that turns the filter off.
 */
export function ChipRow<T extends string | undefined>({
  options,
  selected,
  onSelect,
  accessibilityLabel,
  testID,
}: ChipRowProps<T>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{ marginHorizontal: -spacing.pageHorizontalMargin }}
      // Chips carry a 4pt touch inset of their own, so the row's padding is that much less than the page's.
      contentContainerStyle={{ paddingHorizontal: spacing.pageHorizontalMargin - spacing[1] }}
    >
      {options.map((option) => (
        <Chip
          key={option.value ?? 'all'}
          testID={testID ? `${testID}-${option.value ?? 'all'}` : undefined}
          label={option.label}
          selected={option.value === selected}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </ScrollView>
  );
}
